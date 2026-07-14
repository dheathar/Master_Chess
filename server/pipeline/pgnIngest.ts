import { Chess } from "chess.js";
import type { GameSource, PlayerColor } from "./types";

export interface IngestedMove {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  color: "white" | "black";
  clockMs: number | null;
  /** Time spent thinking on this move, derived from consecutive %clk values + increment. */
  moveTimeMs: number | null;
}

export interface IngestedGame {
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: string | null;
  timeControl: string | null;
  playedAt: string | null;
  openingEco: string | null;
  openingName: string | null;
  playerColor: PlayerColor | null;
  moves: IngestedMove[];
  pgn: string;
  /** Non-fatal notices surfaced to the uploader (e.g. an unmatched player name). */
  warnings: string[];
}

export interface IngestResult {
  games: IngestedGame[];
  rejected: Array<{ index: number; reason: string }>;
}

/**
 * Splits a multi-game PGN export into individual game texts. Chess.com and
 * Lichess exports separate games with a blank line after the movetext; we
 * split on the boundary between a movetext-ending line and the next `[Event`
 * tag, which is robust to blank-line variance inside comments.
 */
export function splitPgnGames(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Brace-depth-aware scan: only start a new game on an `[Event` tag that sits
  // at comment depth 0. A naive split on `\n(?=\[Event )` fractures any game
  // whose `{...}` comment contains a line beginning with "[Event " — losing
  // the real game and emitting a spurious invalid chunk.
  const games: string[] = [];
  let current: string[] = [];
  let depth = 0;
  for (const line of normalized.split("\n")) {
    if (depth === 0 && /^\[Event\s/.test(line.trimStart()) && current.some((l) => l.trim() !== "")) {
      games.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
    for (const ch of line) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }
  if (current.some((l) => l.trim() !== "")) games.push(current.join("\n").trim());
  return games.filter(Boolean);
}

function parseClockToMs(comment: string | undefined): number | null {
  if (!comment) return null;
  const match = comment.match(/\[%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d+)?)\]/);
  if (!match) return null;
  const [, h, m, s] = match;
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000;
}

function detectPlayerColor(headers: Record<string, string>, playerName: string | undefined): PlayerColor | null {
  if (!playerName) return null;
  const needle = playerName.trim().toLowerCase();
  if (headers.White?.trim().toLowerCase() === needle) return "white";
  if (headers.Black?.trim().toLowerCase() === needle) return "black";
  return null;
}

/** Parses the increment (seconds) from a PGN TimeControl header like "600+5"; 0 when absent. */
function incrementMsFromTimeControl(timeControl: string | undefined): number {
  const match = timeControl?.match(/^\d+\+(\d+)/);
  return match ? Number(match[1]) * 1000 : 0;
}

/**
 * Derives per-move think time from consecutive same-color %clk readings:
 * think = previousClock − currentClock + increment. The first move of each
 * color has no prior reading, so it stays null rather than guessing at the
 * base time (pre-move clock ≠ base time on servers with delayed clocks).
 */
function computeMoveTimes(moves: IngestedMove[], timeControl: string | undefined): void {
  const incrementMs = incrementMsFromTimeControl(timeControl);
  const lastClockByColor = new Map<"white" | "black", number>();
  for (const move of moves) {
    const previous = lastClockByColor.get(move.color);
    if (move.clockMs !== null && previous !== undefined) {
      move.moveTimeMs = Math.max(0, previous - move.clockMs + incrementMs);
    }
    if (move.clockMs !== null) {
      lastClockByColor.set(move.color, move.clockMs);
    }
  }
}

export function ingestSingleGame(pgnText: string, source: GameSource, playerName?: string): IngestedGame {
  const chess = new Chess();
  chess.loadPgn(pgnText, { strict: false });

  const headers = chess.getHeaders() as Record<string, string>;
  const comments = chess.getComments();
  const commentByFen = new Map(comments.map((entry) => [entry.fen, entry.comment]));
  const verboseHistory = chess.history({ verbose: true });

  const moves: IngestedMove[] = verboseHistory.map((move, index) => {
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const clockMs = parseClockToMs(commentByFen.get(move.after));
    return {
      ply: index + 1,
      san: move.san,
      uci,
      fenBefore: move.before,
      fenAfter: move.after,
      color: move.color === "w" ? "white" : "black",
      clockMs,
      moveTimeMs: null,
    };
  });

  computeMoveTimes(moves, headers.TimeControl);

  const playerColor = detectPlayerColor(headers, playerName);
  const warnings: string[] = [];
  if (playerName && playerColor === null) {
    // Skill inference is silently skipped for games with no known player color;
    // tell the uploader why rather than leaving them wondering.
    warnings.push(
      `Player name "${playerName}" didn't match White ("${headers.White ?? "?"}") or Black ("${headers.Black ?? "?"}") — this game won't feed your player model.`,
    );
  }

  return {
    white: headers.White ?? "Unknown",
    black: headers.Black ?? "Unknown",
    whiteElo: headers.WhiteElo ? Number(headers.WhiteElo) || null : null,
    blackElo: headers.BlackElo ? Number(headers.BlackElo) || null : null,
    result: headers.Result ?? null,
    timeControl: headers.TimeControl ?? null,
    playedAt: headers.UTCDate ?? headers.Date ?? null,
    openingEco: headers.ECO ?? null,
    openingName: headers.Opening ?? null,
    playerColor,
    moves,
    pgn: pgnText,
    warnings,
  };
}

/**
 * Ingests a possibly-multi-game PGN blob. Each game is parsed in isolation
 * so a single malformed game is reported and skipped rather than failing
 * the whole batch (SRS §2.4: "must validate, report, and partially recover
 * rather than fail silently").
 */
export function ingestPgnBatch(raw: string, source: GameSource, playerName?: string): IngestResult {
  const chunks = splitPgnGames(raw);
  const games: IngestedGame[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  chunks.forEach((chunk, index) => {
    try {
      const game = ingestSingleGame(chunk, source, playerName);
      if (game.moves.length === 0) {
        rejected.push({ index, reason: "Game contains no legal moves." });
        return;
      }
      games.push(game);
    } catch (error) {
      rejected.push({ index, reason: error instanceof Error ? error.message : "Unknown parse error." });
    }
  });

  return { games, rejected };
}
