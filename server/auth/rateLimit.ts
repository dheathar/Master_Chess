import type { NextFunction, Request, Response } from "express";

/**
 * Minimal in-memory fixed-window rate limiter, keyed by client IP.
 * Sufficient for a single-process deployment; swap for a shared store
 * (Redis) if the server is ever scaled horizontally.
 */
export function rateLimit(options: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; windowStart: number }>();

  // Purge stale windows periodically so the map doesn't grow unboundedly.
  const purgeTimer = setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [key, entry] of hits) {
      if (entry.windowStart < cutoff) hits.delete(key);
    }
  }, options.windowMs);
  purgeTimer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= options.windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > options.max) {
      const retryAfterSec = Math.ceil((entry.windowStart + options.windowMs - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: "Too many attempts. Please try again later." });
      return;
    }
    next();
  };
}
