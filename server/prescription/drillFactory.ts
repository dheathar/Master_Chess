import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { drills, reviewQueue } from "../db/schema";
import { initialReviewState } from "@shared/reviewSchedule";
import { normalizeFenKey } from "../engine/evalCache";
import type { ClassifiedMove } from "../pipeline/classifier";
import type { SkillId } from "@shared/taxonomy";

/** Below this cp-loss a mistake isn't worth turning into a spaced-repetition drill. */
const MIN_CPLOSS_FOR_DRILL = 100;

function primarySkillFor(move: ClassifiedMove): SkillId {
  if (move.phase === "opening") return "opening_principles";
  if (move.phase === "endgame") return "endgame_precision_conversion";
  return move.classification === "blunder" ? "tactical_consistency" : "tactical_pattern_recognition";
}

/**
 * Harvests the player's own mistakes and blunders from one analysis into
 * spaced-repetition drills — "find the move you missed" positions, seeded
 * into the review queue at the SM-2-lite initial state. Every drill traces
 * back to a real move the player actually played (`sourceMoveId`), and the
 * correct answer is the engine's own best move at that position, never a
 * fabricated "lesson".
 */
export function harvestDrillsFromAnalysis(
  userId: string,
  analysisId: string,
  moves: ClassifiedMove[],
  playerColor: "white" | "black",
  moveIdAt: (index: number) => string | undefined,
): number {
  let created = 0;

  moves.forEach((move, index) => {
    if (move.color !== playerColor) return;
    if (move.classification !== "mistake" && move.classification !== "blunder") return;
    if (move.cpLoss === null || move.cpLoss < MIN_CPLOSS_FOR_DRILL) return;
    if (!move.bestMoveUci || move.bestMoveUci === move.uci) return;

    // Never drill the exact same position twice for one user, even across
    // different games (openings repeat). Dedupe by normalized FEN (excluding
    // move counters) so positions with different clocks are still deduped.
    const normalizedKey = normalizeFenKey(move.fenBefore);
    const existingList = db
      .select({ id: drills.id, fen: drills.fen })
      .from(drills)
      .where(eq(drills.userId, userId))
      .all();
    const existing = existingList.find((row) => normalizeFenKey(row.fen) === normalizedKey);
    if (existing) return;

    const drillId = crypto.randomUUID();
    db.insert(drills)
      .values({
        id: drillId,
        userId,
        sourceMoveId: moveIdAt(index) ?? null,
        fen: move.fenBefore,
        correctUci: move.bestMoveUci,
        skillId: primarySkillFor(move),
        kind: "tactic",
        createdFromAnalysisId: analysisId,
        createdAt: Date.now(),
      })
      .run();

    const initial = initialReviewState();
    db.insert(reviewQueue)
      .values({
        id: crypto.randomUUID(),
        userId,
        drillId,
        dueAt: initial.dueAt,
        intervalDays: Math.round(initial.intervalDays * 1000),
        ease: Math.round(initial.ease * 1000),
        streak: initial.streak,
        lapses: initial.lapses,
        suspended: initial.suspended,
      })
      .run();

    created += 1;
  });

  return created;
}
