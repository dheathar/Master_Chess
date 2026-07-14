import { evaluateWithCache } from "../engine/evalCache";
import type { EngineEvaluation } from "../engine/stockfish";

/**
 * Evaluates a list of positions with bounded concurrency (matched to the
 * engine pool size). A game's positions are highly cache-friendly in the
 * opening — evaluateWithCache short-circuits repeats across games for free.
 */
export async function evaluatePositions(
  fens: string[],
  options: {
    depth?: number;
    multipv?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<EngineEvaluation[]> {
  const concurrency = Math.max(1, Number(process.env.ENGINE_POOL_SIZE ?? 2));
  const results: EngineEvaluation[] = new Array(fens.length);
  let nextIndex = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= fens.length) return;
      const evaluation = await evaluateWithCache(fens[index], {
        depth: options.depth,
        multipv: options.multipv,
      });
      results[index] = evaluation;
      done += 1;
      options.onProgress?.(done, fens.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, fens.length) || 1 }, () => worker()));
  return results;
}
