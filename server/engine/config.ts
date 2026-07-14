/**
 * Engine configuration, validated once at module load. Garbage or missing env
 * values fall back to sane defaults and are clamped to safe ranges — an
 * unparseable ENGINE_POOL_SIZE previously became NaN and produced a 0-worker
 * pool, and NaN depth/multipv were sent verbatim into UCI commands and baked
 * into cache keys.
 */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export const STOCKFISH_BIN = process.env.STOCKFISH_BIN ?? "stockfish";
export const ENGINE_POOL_SIZE = intEnv("ENGINE_POOL_SIZE", 2, 1, 8);
export const ENGINE_DEPTH = intEnv("ENGINE_DEPTH", 16, 4, 30);
export const ENGINE_MULTIPV = intEnv("ENGINE_MULTIPV", 4, 1, 10);
