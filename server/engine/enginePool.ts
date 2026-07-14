import { StockfishProcess, type EngineEvaluation } from "./stockfish";
import { STOCKFISH_BIN, ENGINE_POOL_SIZE as POOL_SIZE, ENGINE_DEPTH, ENGINE_MULTIPV } from "./config";

const REINIT_COOLDOWN_MS = 30_000;

export class EngineUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Stockfish engine is unavailable.");
    this.name = "EngineUnavailableError";
    if (cause) this.cause = cause;
  }
}

class EnginePool {
  private workers: StockfishProcess[] = [];
  private available: boolean | null = null;
  private initPromise: Promise<void> | null = null;
  private lastFailureAt = 0;

  private async ensureInitialized(): Promise<void> {
    if (this.available === true) return;
    // A transient init failure (busy machine, slow disk) must not disable the
    // engine forever — allow a fresh attempt after a cooldown.
    if (this.available === false) {
      if (Date.now() - this.lastFailureAt < REINIT_COOLDOWN_MS) {
        throw new EngineUnavailableError();
      }
      this.available = null;
      this.initPromise = null;
    }
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    // Spawn into a local so a partial-failure can dispose exactly the processes
    // it just created — disposing `this.workers` (the previous, usually empty
    // array) would leak every worker spawned by this attempt.
    const workers = Array.from({ length: POOL_SIZE }, () => new StockfishProcess(STOCKFISH_BIN));
    try {
      await Promise.all(workers.map((worker) => worker.ready()));
      this.workers = workers;
      this.available = true;
    } catch (error) {
      this.available = false;
      this.lastFailureAt = Date.now();
      for (const worker of workers) worker.dispose();
      this.workers = [];
      throw new EngineUnavailableError(error);
    }
  }

  /**
   * Replaces dead workers so the pool heals after individual process deaths.
   * Serialized behind a single in-flight promise: without the guard, two
   * concurrent evaluate() calls each see `length < POOL_SIZE` and each spawn,
   * overshooting the pool with orphaned workers that never get disposed.
   */
  private replenishPromise: Promise<void> | null = null;
  private async replenish(): Promise<void> {
    if (this.replenishPromise) return this.replenishPromise;
    this.replenishPromise = this.doReplenish().finally(() => {
      this.replenishPromise = null;
    });
    return this.replenishPromise;
  }

  private async doReplenish(): Promise<void> {
    this.workers = this.workers.filter((worker) => !worker.isDisposed);
    while (this.workers.length < POOL_SIZE) {
      const worker = new StockfishProcess(STOCKFISH_BIN);
      try {
        await worker.ready();
      } catch (error) {
        worker.dispose();
        throw new EngineUnavailableError(error);
      }
      this.workers.push(worker);
    }
  }

  private pickWorker(): StockfishProcess {
    const alive = this.workers.filter((worker) => !worker.isDisposed);
    if (alive.length === 0) {
      throw new EngineUnavailableError();
    }
    return alive.reduce((least, current) => (current.pending < least.pending ? current : least));
  }

  async evaluate(
    fen: string,
    options: { depth?: number; multipv?: number; timeoutMs?: number } = {},
  ): Promise<EngineEvaluation> {
    await this.ensureInitialized();
    const depth = options.depth ?? ENGINE_DEPTH;
    const multipv = options.multipv ?? ENGINE_MULTIPV;
    const timeoutMs = options.timeoutMs ?? 4000;

    // One retry: a worker dying mid-eval (OOM kill, hung-engine hard kill)
    // rejects the in-flight command; a healthy sibling should absorb the
    // retry instead of failing the entire game analysis.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.replenish();
        const worker = this.pickWorker();
        const result = await worker.evaluate(fen, depth, multipv, timeoutMs);
        return { ...result, fen, depth, multipv };
      } catch (error) {
        if (attempt >= 1) {
          this.available = null;
          this.initPromise = null;
          throw error instanceof EngineUnavailableError ? error : new EngineUnavailableError(error);
        }
      }
    }
  }

  get isAvailable(): boolean | null {
    return this.available;
  }

  dispose(): void {
    for (const worker of this.workers) worker.dispose();
    this.workers = [];
    this.available = null;
    this.initPromise = null;
  }
}

export const enginePool = new EnginePool();
export const ENGINE_VERSION = "stockfish-pool-v1";
