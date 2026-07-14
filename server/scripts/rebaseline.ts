import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { db, rawSqlite } from "../db/client";
import {
  analyses,
  drillAttempts,
  drills,
  evidence,
  games,
  moves,
  playerSnapshots,
  prescriptions,
  reviewQueue,
  skillScores,
} from "../db/schema";
import { inferSkillEvidence } from "../pipeline/skillInference";
import { inferOpeningEvidence } from "../pipeline/openingInference";
import { inferProphylaxisEvidence } from "../pipeline/prophylaxisEvidence";
import { updatePlayerModel } from "../pipeline/playerModelUpdater";
import { harvestDrillsFromAnalysis } from "../prescription/drillFactory";
import { buildTrainingPlan, persistTrainingPlan } from "../prescription/prescriptionEngine";
import type { ClassifiedMove } from "../pipeline/classifier";
import type { GamePhase, MoveClassification } from "@shared/classification";

/**
 * One-shot re-baseline of all derived player-model data. The BKT/scoring fixes
 * change what mastery means and several evidence rows were mis-attributed or
 * double-folded (mate misattribution, opponent-move novelty credit,
 * crash-resume double counts). Source data (games/analyses/moves) is the
 * ground truth and is never touched — we wipe the derived tables and replay
 * the (now-fixed) inference over every completed analysis in chronological
 * order, exactly as the live pipeline would.
 *
 *   npm run rebaseline                 # skill + opening evidence only (no engine/LLM)
 *   npm run rebaseline -- --with-prophylaxis   # also replay the engine+LLM prophylaxis probe
 */

const withProphylaxis = process.argv.includes("--with-prophylaxis");

type MoveRow = typeof moves.$inferSelect;

/**
 * Best-effort `missedMate` for a move row whose column predates this migration:
 * the stored `multipvJson` holds the before-position lines (mover-relative), so
 * a positive mate there on an error move means the mover had — and gave up — a
 * forced mate. Rows analyzed after the migration carry the exact flag.
 */
function deriveMissedMate(row: MoveRow): boolean {
  if (row.missedMate !== null && row.missedMate !== undefined) return row.missedMate;
  const isError = row.classification === "mistake" || row.classification === "blunder";
  if (!isError || !row.multipvJson) return false;
  try {
    const lines = JSON.parse(row.multipvJson) as Array<{ mate: number | null }>;
    const mate = lines[0]?.mate;
    return typeof mate === "number" && mate > 0;
  } catch {
    return false;
  }
}

function rowToClassified(row: MoveRow): ClassifiedMove {
  return {
    ply: row.ply,
    san: row.san,
    uci: row.uci,
    fenBefore: row.fenBefore,
    fenAfter: row.fenAfter,
    color: row.color,
    clockMs: row.clockMs,
    moveTimeMs: row.moveTimeMs,
    phase: (row.phase ?? "middlegame") as GamePhase,
    evalCpBefore: row.evalCpBefore,
    evalCpAfter: row.evalCpAfter,
    cpLoss: row.cpLoss,
    classification: row.classification as MoveClassification | null,
    bestMoveUci: row.bestMoveUci,
    bestMoveSan: row.bestMoveSan,
    multipvJson: row.multipvJson ?? "[]",
    missedMate: deriveMissedMate(row),
  };
}

function wipeDerivedTables(): void {
  // FK-safe order: children before parents.
  const run = rawSqlite.transaction(() => {
    db.delete(evidence).run();
    db.delete(drillAttempts).run();
    db.delete(reviewQueue).run();
    db.delete(drills).run();
    db.delete(prescriptions).run();
    db.delete(playerSnapshots).run();
    db.delete(skillScores).run();
  });
  run();
}

async function main(): Promise<void> {
  const doneAnalyses = db
    .select()
    .from(analyses)
    .where(eq(analyses.status, "done"))
    .orderBy(asc(analyses.createdAt))
    .all();

  console.log(`[rebaseline] wiping derived tables and replaying ${doneAnalyses.length} completed analyses…`);
  wipeDerivedTables();

  let replayed = 0;
  let skipped = 0;

  for (const analysis of doneAnalyses) {
    const gameRow = db.select().from(games).where(eq(games.id, analysis.gameId)).get();
    if (!gameRow || !gameRow.playerColor) {
      skipped += 1;
      continue;
    }

    const moveRows = db
      .select()
      .from(moves)
      .where(eq(moves.gameId, gameRow.id))
      .all()
      .sort((a, b) => a.ply - b.ply);
    if (moveRows.length === 0) {
      skipped += 1;
      continue;
    }

    const classified = moveRows.map(rowToClassified);
    const moveIdAt = (index: number): string | undefined => moveRows[index]?.id;

    const skillEvidence = inferSkillEvidence(classified, {
      playerColor: gameRow.playerColor,
      result: gameRow.result,
    });
    const openingEvidence = inferOpeningEvidence(analysis.userId, gameRow.id, classified, {
      playerColor: gameRow.playerColor,
      currentEco: gameRow.openingEco,
    });
    updatePlayerModel(analysis.userId, analysis.id, [...skillEvidence, ...openingEvidence], moveIdAt);
    harvestDrillsFromAnalysis(analysis.userId, analysis.id, classified, gameRow.playerColor, moveIdAt);

    if (withProphylaxis) {
      try {
        const prophylaxis = await inferProphylaxisEvidence(classified, gameRow.playerColor, gameRow.result);
        if (prophylaxis.length > 0) {
          updatePlayerModel(analysis.userId, analysis.id, prophylaxis, moveIdAt);
        }
      } catch (error) {
        console.warn(`[rebaseline] prophylaxis probe failed for analysis ${analysis.id}:`, error);
      }
    }

    persistTrainingPlan(analysis.userId, buildTrainingPlan(analysis.userId), null);
    replayed += 1;
  }

  console.log(`[rebaseline] done — replayed ${replayed}, skipped ${skipped} (no player color / no moves).`);
  if (!withProphylaxis) {
    console.log("[rebaseline] note: prophylaxis evidence was NOT replayed (pass --with-prophylaxis to include it).");
  }
  rawSqlite.close();
}

void main();
