import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { evalCache } from "../db/schema";
import { enginePool, ENGINE_VERSION } from "./enginePool";
import { ENGINE_DEPTH, ENGINE_MULTIPV } from "./config";
import type { EngineEvaluation } from "./stockfish";

const LRU_CAPACITY = 2000;
const memoryCache = new Map<string, EngineEvaluation>();

/**
 * Normalizes a FEN to a transposition key: piece placement + side + castling +
 * en passant, dropping the halfmove clock and fullmove number. Used by the
 * opening explorer, where two games reaching the same position must share a key.
 */
export function normalizeFenKey(fen: string): string {
  const parts = fen.split(" ");
  return parts.slice(0, 4).join(" ");
}

/**
 * The halfmove (rule-50) clock changes Stockfish's evaluation as a draw
 * approaches, so it must be part of the *eval* cache key — otherwise the same
 * position at clock 0 and clock 98 share a cached score and a winning/drawn
 * endgame gets poisoned. It's irrelevant far from the rule, so bucket to 0
 * below 60 and keep the exact value at/after it.
 */
function halfmoveBucket(fen: string): string {
  const halfmove = Number(fen.split(" ")[4]);
  if (!Number.isFinite(halfmove) || halfmove < 60) return "0";
  return String(halfmove);
}

/** Eval-cache key: the transposition key plus the rule-50 bucket (distinct from the explorer key). */
function evalFenKey(fen: string): string {
  return `${normalizeFenKey(fen)} h${halfmoveBucket(fen)}`;
}

function cacheKey(fenKey: string, depth: number, multipv: number): string {
  return `${fenKey}|${depth}|${multipv}|${ENGINE_VERSION}`;
}

function rememberInMemory(key: string, evaluation: EngineEvaluation): void {
  if (memoryCache.size >= LRU_CAPACITY) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) memoryCache.delete(oldestKey);
  }
  memoryCache.delete(key);
  memoryCache.set(key, evaluation);
}

export async function evaluateWithCache(
  fen: string,
  options: { depth?: number; multipv?: number; timeoutMs?: number } = {},
): Promise<EngineEvaluation & { cacheHit: boolean }> {
  const depth = options.depth ?? ENGINE_DEPTH;
  const multipv = options.multipv ?? ENGINE_MULTIPV;
  const fenKey = evalFenKey(fen);
  const key = cacheKey(fenKey, depth, multipv);

  const inMemory = memoryCache.get(key);
  if (inMemory) {
    // Refresh recency so the map behaves as an LRU rather than FIFO — hot
    // opening positions must not be evicted in insertion order.
    memoryCache.delete(key);
    memoryCache.set(key, inMemory);
    return { ...inMemory, fen, cacheHit: true };
  }

  const row = db
    .select()
    .from(evalCache)
    .where(
      and(
        eq(evalCache.fenKey, fenKey),
        eq(evalCache.depth, depth),
        eq(evalCache.multipv, multipv),
        eq(evalCache.engineVersion, ENGINE_VERSION),
      ),
    )
    .get();

  if (row) {
    const evaluation: EngineEvaluation = {
      fen,
      depth,
      achievedDepth: depth,
      multipv,
      bestMove: row.bestMove,
      lines: JSON.parse(row.linesJson),
    };
    rememberInMemory(key, evaluation);
    return { ...evaluation, cacheHit: true };
  }

  const evaluation = await enginePool.evaluate(fen, { depth, multipv, timeoutMs: options.timeoutMs });

  // Persist only full-depth results. A search stopped by timeout returns
  // whatever depth it reached; caching that shallow eval under the requested
  // depth key would poison every future game passing through this position.
  if (evaluation.achievedDepth >= depth) {
    db.insert(evalCache)
      .values({
        fenKey,
        depth,
        multipv,
        engineVersion: ENGINE_VERSION,
        bestMove: evaluation.bestMove,
        linesJson: JSON.stringify(evaluation.lines),
        computedAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
    rememberInMemory(key, evaluation);
  }

  return { ...evaluation, cacheHit: false };
}
