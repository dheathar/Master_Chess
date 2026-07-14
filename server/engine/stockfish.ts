/**
 * Stockfish UCI process wrapper.
 * Ported from the sibling agentic-chess app (server/agent/oracle/stockfish.ts).
 * Differences: no curated-substrate fallback (this app has no hand-authored
 * positions to fall back to — an unavailable engine is a hard error the
 * pipeline surfaces rather than silently disguises), and this class wraps a
 * single OS process; server/engine/enginePool.ts pools several of these.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Chess } from "chess.js";

export type EngineLine = {
  rank: number;
  uci: string;
  san: string | null;
  cp: number | null;
  mate: number | null;
  pv: string[];
};

export type EngineEvaluation = {
  fen: string;
  /** Depth requested from the engine. */
  depth: number;
  /** Depth the engine actually reached before returning (≤ depth when the search was stopped by timeout). */
  achievedDepth: number;
  multipv: number;
  bestMove: string | null;
  lines: EngineLine[];
};

const DEFAULT_TIMEOUT_MS = 4000;

type EngineCommand = {
  fen: string;
  depth: number;
  multipv: number;
  timeoutMs: number;
  resolve: (result: Omit<EngineEvaluation, "fen" | "depth" | "multipv">) => void;
  reject: (err: Error) => void;
};

/** Grace period after `stop` is sent before we declare the engine hung and kill it. */
const HARD_KILL_GRACE_MS = 4000;

export class StockfishProcess {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readyPromise: Promise<void>;
  private buffer = "";
  private active: EngineCommand | null = null;
  private queue: EngineCommand[] = [];
  private linesByMultipv = new Map<number, EngineLine>();
  private achievedDepth = 0;
  private timer: NodeJS.Timeout | null = null;
  private hardKillTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(private readonly bin: string) {
    this.proc = spawn(bin, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.proc.stderr.on("data", () => {});
    this.proc.on("error", () => this.dispose());
    this.proc.on("exit", () => this.dispose());

    this.readyPromise = this.handshake();
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.proc.exitCode === null && !this.proc.killed) {
      try {
        this.proc.stdin.end("quit\n");
      } catch {
        // ignore
      }
      this.proc.kill();
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.hardKillTimer) {
      clearTimeout(this.hardKillTimer);
      this.hardKillTimer = null;
    }
    const err = new Error("Stockfish process disposed");
    this.active?.reject(err);
    this.active = null;
    for (const cmd of this.queue) {
      cmd.reject(err);
    }
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length + (this.active ? 1 : 0);
  }

  evaluate(
    fen: string,
    depth: number,
    multipv: number,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<Omit<EngineEvaluation, "fen" | "depth" | "multipv">> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, depth, multipv, timeoutMs, resolve, reject });
      this.drain();
    });
  }

  private send(line: string): void {
    this.proc.stdin.write(`${line}\n`);
  }

  private async handshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        if (chunk.includes("readyok") || chunk.includes("uciok")) {
          this.proc.stdout.off("data", onData);
          resolve();
        }
      };
      this.proc.stdout.on("data", onData);
      this.proc.on("error", (error) => {
        this.dispose();
        reject(error);
      });
      this.send("uci");
      this.send("isready");
      setTimeout(() => {
        this.proc.stdout.off("data", onData);
        // Kill the process on a timed-out handshake — otherwise a slow/broken
        // engine leaks a live OS process on every (retried) init attempt.
        this.dispose();
        reject(new Error("Stockfish handshake timed out"));
      }, 2000).unref();
    });
  }

  private drain(): void {
    if (this.active || this.queue.length === 0) {
      return;
    }
    const cmd = this.queue.shift()!;
    this.active = cmd;
    this.linesByMultipv = new Map();
    this.achievedDepth = 0;
    this.send("ucinewgame");
    this.send(`setoption name MultiPV value ${cmd.multipv}`);
    this.send(`position fen ${cmd.fen}`);
    this.send(`go depth ${cmd.depth}`);
    this.timer = setTimeout(() => {
      try {
        this.send("stop");
      } catch {
        // ignore
      }
    }, cmd.timeoutMs);
    this.timer.unref();
    // If `stop` doesn't produce a bestmove within the grace period the engine
    // is hung: without this, the evaluate promise never settles and the whole
    // analysis queue wedges behind it until a process restart.
    this.hardKillTimer = setTimeout(() => {
      if (this.active === cmd) {
        this.dispose();
      }
    }, cmd.timeoutMs + HARD_KILL_GRACE_MS);
    this.hardKillTimer.unref();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      this.onLine(line);
    }
  }

  private onLine(line: string): void {
    if (!this.active) {
      return;
    }
    if (line.startsWith("info ") && line.includes(" multipv ")) {
      // Fail-high/fail-low partials carry bound markers and can overwrite the
      // exact score for a rank if they arrive last — skip them.
      if (line.includes(" lowerbound") || line.includes(" upperbound")) {
        return;
      }
      const info = parseInfoLine(line, this.active.fen);
      if (info) {
        this.linesByMultipv.set(info.rank, info);
      }
      const depthMatch = line.match(/\bdepth (\d+)/);
      if (depthMatch) {
        this.achievedDepth = Math.max(this.achievedDepth, Number(depthMatch[1]));
      }
      return;
    }
    if (line.startsWith("bestmove")) {
      const bestMove = line.split(/\s+/)[1] ?? null;
      const resultLines = [...this.linesByMultipv.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, value]) => value);
      const cmd = this.active;
      this.active = null;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.hardKillTimer) {
        clearTimeout(this.hardKillTimer);
        this.hardKillTimer = null;
      }
      cmd.resolve({
        bestMove: bestMove === "(none)" ? null : bestMove,
        lines: resultLines,
        achievedDepth: this.achievedDepth,
      });
      this.drain();
    }
  }
}

function parseInfoLine(line: string, fen: string): EngineLine | null {
  const tokens = line.split(/\s+/);
  const idx = (key: string) => {
    const i = tokens.indexOf(key);
    return i >= 0 ? i : -1;
  };
  const multipvIdx = idx("multipv");
  const pvIdx = idx("pv");
  if (multipvIdx === -1 || pvIdx === -1) {
    return null;
  }
  const rank = Number(tokens[multipvIdx + 1]);
  const scoreIdx = idx("score");
  let cp: number | null = null;
  let mate: number | null = null;
  if (scoreIdx >= 0) {
    const kind = tokens[scoreIdx + 1];
    const value = Number(tokens[scoreIdx + 2]);
    if (kind === "cp") {
      cp = value;
    } else if (kind === "mate") {
      mate = value;
    }
  }
  const pv = tokens.slice(pvIdx + 1);
  const uci = pv[0];
  if (!uci) {
    return null;
  }
  let san: string | null = null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    san = move?.san ?? null;
  } catch {
    san = null;
  }
  return { rank, uci, san, cp, mate, pv };
}
