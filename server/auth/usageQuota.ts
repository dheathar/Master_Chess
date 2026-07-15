import { and, eq } from "drizzle-orm";
import { db, rawSqlite } from "../db/client";
import { usageCounters } from "../db/schema";

/**
 * Daily analysis caps are configurable via env so a deployment can loosen or
 * remove them without a code change. A value of 0 (or negative/empty) means
 * unlimited. Defaults keep the product's original free/anonymous gating.
 */
function limitFromEnv(name: string, fallback: number): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null; // unlimited
  return Math.floor(n);
}

const FREE_DAILY_ANALYSES = limitFromEnv("FREE_DAILY_ANALYSES", 5);
const ANONYMOUS_DAILY_ANALYSES = limitFromEnv("ANONYMOUS_DAILY_ANALYSES", 1);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailyLimitFor(tier: "free" | "pro" | "academy" | "anonymous"): number | null {
  if (tier === "anonymous") return ANONYMOUS_DAILY_ANALYSES;
  if (tier === "free") return FREE_DAILY_ANALYSES;
  return null; // unlimited
}

export function currentUsage(subjectKey: string): number {
  const row = db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.subjectKey, subjectKey), eq(usageCounters.day, todayKey())))
    .get();
  return row?.analysesUsed ?? 0;
}

/**
 * Atomically consumes `count` analyses from the subject's daily quota.
 * Check and increment happen inside one SQLite transaction so concurrent
 * requests cannot both pass a stale limit check (and the code stays safe
 * if an `await` is ever introduced between check and charge).
 *
 * Returns true if the quota was consumed, false if it would be exceeded.
 * A null limit means unlimited: always consumed (still counted, for stats).
 */
export function tryConsumeQuota(subjectKey: string, limit: number | null, count: number): boolean {
  const day = todayKey();
  const attempt = rawSqlite.transaction((): boolean => {
    const used = currentUsage(subjectKey);
    if (limit !== null && used + count > limit) {
      return false;
    }
    rawSqlite
      .prepare(
        `INSERT INTO usage_counters (subject_key, day, analyses_used) VALUES (?, ?, ?)
         ON CONFLICT(subject_key, day) DO UPDATE SET analyses_used = analyses_used + excluded.analyses_used`,
      )
      .run(subjectKey, day, count);
    return true;
  });
  return attempt();
}

export function quotaRemaining(subjectKey: string, tier: "free" | "pro" | "academy" | "anonymous"): number | null {
  const limit = dailyLimitFor(tier);
  if (limit === null) return null;
  return Math.max(0, limit - currentUsage(subjectKey));
}
