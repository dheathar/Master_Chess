import crypto from "node:crypto";
import { Router } from "express";
import { Chess } from "chess.js";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { drills, reviewQueue, drillAttempts, skillScores, moves } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { nextReviewState } from "@shared/reviewSchedule";
import { SKILL_BY_ID, type SkillId } from "@shared/taxonomy";
import { submitDrillAttemptRequestSchema } from "@shared/api";
import type { DueDrill, DrillStats, DrillAttemptResult } from "@shared/api";

export const drillsRouter = Router();

const MAX_DUE_DRILLS = 20;
const DAY_MS = 86_400_000;
const ALTERNATE_TOLERANCE_CP = 25;

/** Reads a client-supplied timezone offset (JS getTimezoneOffset(), minutes) from the query; UTC if absent/invalid. */
function tzOffsetMinutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Local calendar day (per the client's tz offset) for a timestamp — YYYY-MM-DD. */
function dayKey(ms: number, offsetMinutes: number): string {
  return new Date(ms - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * Consecutive calendar days (ending today or yesterday) with at least one drill
 * attempt, computed in the client's local days so a nightly-practice streak
 * isn't split or dropped by the UTC day boundary.
 */
function computeDayStreak(userId: string, offsetMinutes: number): number {
  const rows = db.select({ createdAt: drillAttempts.createdAt }).from(drillAttempts).where(eq(drillAttempts.userId, userId)).all();
  if (rows.length === 0) return 0;
  const days = new Set(rows.map((row) => dayKey(row.createdAt, offsetMinutes)));

  let cursorMs = Date.now();
  // Today not attempted yet doesn't break a streak still in progress.
  if (!days.has(dayKey(cursorMs, offsetMinutes))) cursorMs -= DAY_MS;
  let streak = 0;
  while (days.has(dayKey(cursorMs, offsetMinutes))) {
    streak += 1;
    cursorMs -= DAY_MS;
  }
  return streak;
}

/** Line score (mover perspective), mate-aware, for accepting equally-good alternate answers. */
function lineScore(line: { cp: number | null; mate: number | null }): number {
  if (line.mate !== null && line.mate !== undefined) {
    const magnitude = 100_000 - Math.min(99, Math.abs(line.mate)) * 100;
    return line.mate > 0 ? magnitude : -magnitude;
  }
  return line.cp ?? 0;
}

/**
 * The set of accepted answers for a drill: the engine best plus any multipv
 * alternate within ~25cp of it (an equally-winning move must not be graded
 * wrong just because it isn't the single stored best). Case-normalized.
 */
function acceptedAnswers(drillRow: typeof drills.$inferSelect): Set<string> {
  const accepted = new Set<string>([drillRow.correctUci.toLowerCase()]);
  if (!drillRow.sourceMoveId) return accepted;
  const moveRow = db.select().from(moves).where(eq(moves.id, drillRow.sourceMoveId)).get();
  if (!moveRow?.multipvJson) return accepted;
  try {
    const lines = JSON.parse(moveRow.multipvJson) as Array<{ uci: string; cp: number | null; mate: number | null }>;
    if (lines.length === 0) return accepted;
    const best = lineScore(lines[0]);
    for (const line of lines) {
      if (line.uci && Math.abs(lineScore(line) - best) <= ALTERNATE_TOLERANCE_CP) accepted.add(line.uci.toLowerCase());
    }
  } catch {
    // malformed multipv — fall back to the single stored best move
  }
  return accepted;
}

drillsRouter.get("/due", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const now = Date.now();

  const rows = db
    .select({ queue: reviewQueue, drill: drills })
    .from(reviewQueue)
    .innerJoin(drills, eq(reviewQueue.drillId, drills.id))
    .where(and(eq(reviewQueue.userId, userId), eq(reviewQueue.suspended, false), lte(reviewQueue.dueAt, now)))
    .orderBy(reviewQueue.dueAt)
    .limit(MAX_DUE_DRILLS)
    .all();

  const due: DueDrill[] = rows.map(({ queue, drill }) => ({
    id: drill.id,
    fen: drill.fen,
    correctUci: drill.correctUci,
    skillId: drill.skillId,
    skillName: SKILL_BY_ID[drill.skillId as SkillId]?.name ?? drill.skillId,
    kind: drill.kind,
    dueAt: queue.dueAt,
    streak: queue.streak,
  }));

  res.json({ drills: due });
});

drillsRouter.get("/stats", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const now = Date.now();
  const offset = tzOffsetMinutes(req.query.tzOffset);

  const dueToday = db
    .select({ id: reviewQueue.id })
    .from(reviewQueue)
    .where(and(eq(reviewQueue.userId, userId), eq(reviewQueue.suspended, false), lte(reviewQueue.dueAt, now)))
    .all().length;

  const attempts = db.select().from(drillAttempts).where(eq(drillAttempts.userId, userId)).all();
  const retentionPct =
    attempts.length > 0 ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 1000) / 10 : null;

  const stats: DrillStats = {
    dueToday,
    dayStreak: computeDayStreak(userId, offset),
    retentionPct,
  };
  res.json(stats);
});

drillsRouter.post("/:id/attempt", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const drillId = req.params.id;

  const parsed = submitDrillAttemptRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    return;
  }

  const drillRow = db.select().from(drills).where(and(eq(drills.id, drillId), eq(drills.userId, userId))).get();
  if (!drillRow) {
    res.status(404).json({ error: "Drill not found." });
    return;
  }
  const queueRow = db.select().from(reviewQueue).where(and(eq(reviewQueue.drillId, drillId), eq(reviewQueue.userId, userId))).get();
  if (!queueRow) {
    res.status(404).json({ error: "This drill is not in your review queue." });
    return;
  }

  // Accept any equally-winning move (multipv alternate within ~25cp), not just
  // the single stored best; normalize case so promotion casing can't misgrade.
  const correct = acceptedAnswers(drillRow).has(parsed.data.answeredUci.toLowerCase());

  let correctSan: string | null = null;
  try {
    const chess = new Chess(drillRow.fen);
    const move = chess.move({ from: drillRow.correctUci.slice(0, 2), to: drillRow.correctUci.slice(2, 4), promotion: drillRow.correctUci[4] });
    correctSan = move?.san ?? null;
  } catch {
    correctSan = null;
  }

  const skillScoreRow = db.select().from(skillScores).where(and(eq(skillScores.userId, userId), eq(skillScores.skillId, drillRow.skillId))).get();
  const currentMastery = skillScoreRow?.mastery;

  const currentState = {
    dueAt: queueRow.dueAt,
    intervalDays: queueRow.intervalDays / 1000,
    ease: queueRow.ease / 1000,
    streak: queueRow.streak,
    lapses: queueRow.lapses,
    suspended: queueRow.suspended,
  };
  const next = nextReviewState(currentState, correct ? "correct" : "incorrect", currentMastery);

  // Only a genuinely-due review updates the schedule and counts toward
  // retention/streak — otherwise the same drill could be re-submitted to grind
  // stats or churn its own schedule.
  const wasDue = !queueRow.suspended && queueRow.dueAt <= Date.now();
  if (wasDue) {
    db.update(reviewQueue)
      .set({
        dueAt: next.dueAt,
        intervalDays: Math.round(next.intervalDays * 1000),
        ease: Math.round(next.ease * 1000),
        streak: next.streak,
        lapses: next.lapses,
        suspended: next.suspended,
      })
      .where(eq(reviewQueue.id, queueRow.id))
      .run();

    db.insert(drillAttempts)
      .values({
        id: crypto.randomUUID(),
        drillId,
        userId,
        answeredUci: parsed.data.answeredUci,
        correct,
        msTaken: parsed.data.msTaken,
        evalPredictionCp: null,
        createdAt: Date.now(),
      })
      .run();
  }

  const result: DrillAttemptResult = {
    correct,
    correctUci: drillRow.correctUci,
    correctSan,
    nextDueInDays: Math.round((wasDue ? next.intervalDays : currentState.intervalDays) * 10) / 10,
    streak: wasDue ? next.streak : queueRow.streak,
  };
  res.json(result);
});
