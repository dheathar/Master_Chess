import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { analyses, evidence, games, moves } from "../db/schema";
import { evaluatePositions } from "./evaluator";
import { classifyGameMoves, summarizeAccuracy } from "./classifier";
import { inferSkillEvidence } from "./skillInference";
import { inferOpeningEvidence } from "./openingInference";
import { updatePlayerModel } from "./playerModelUpdater";
import { harvestDrillsFromAnalysis } from "../prescription/drillFactory";
import { buildTrainingPlan, persistTrainingPlan } from "../prescription/prescriptionEngine";
import { buildGameFacts } from "../llm/gameFacts";
import { inferProphylaxisEvidence } from "./prophylaxisEvidence";
import { narrateGame } from "../llm/narrator";
import type { IngestedMove } from "./pgnIngest";
import type { AnalysisProgressEvent } from "@shared/api";

type ProgressListener = (event: AnalysisProgressEvent) => void;

const listeners = new Map<string, Set<ProgressListener>>();

export function onAnalysisProgress(analysisId: string, listener: ProgressListener): () => void {
  if (!listeners.has(analysisId)) listeners.set(analysisId, new Set());
  listeners.get(analysisId)!.add(listener);
  return () => {
    const set = listeners.get(analysisId);
    if (!set) return;
    set.delete(listener);
    // Drop empty sets so the map doesn't grow by one entry per analysis ever streamed.
    if (set.size === 0) listeners.delete(analysisId);
  };
}

function emitProgress(event: AnalysisProgressEvent): void {
  for (const listener of listeners.get(event.analysisId) ?? []) {
    listener(event);
  }
}

/** In-process FIFO of analysis jobs; concurrency is bounded inside evaluatePositions by the engine pool size. */
const jobQueue: string[] = [];
let processing = false;

export function enqueueAnalysis(analysisId: string): void {
  jobQueue.push(analysisId);
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (jobQueue.length > 0) {
      const analysisId = jobQueue.shift()!;
      try {
        await runAnalysis(analysisId);
      } catch (error) {
        // A job must never take the queue (or, unhandled, the process) down
        // with it — mark it failed and move on to the next one.
        console.error(`[analysis] job ${analysisId} threw:`, error);
        try {
          failAnalysis(analysisId, error instanceof Error ? error.message : "Analysis failed.");
        } catch {
          // DB unavailable — nothing more we can do for this job.
        }
      }
    }
  } finally {
    processing = false;
  }
}

async function runAnalysis(analysisId: string): Promise<void> {
  const analysisRow = db.select().from(analyses).where(eq(analyses.id, analysisId)).get();
  if (!analysisRow) return;

  const gameRow = db.select().from(games).where(eq(games.id, analysisRow.gameId)).get();
  if (!gameRow) {
    failAnalysis(analysisId, "Game not found.");
    return;
  }

  const gameMoves = db.select().from(moves).where(eq(moves.gameId, gameRow.id)).all();
  const ingestedMoves: IngestedMove[] = gameMoves
    .sort((a, b) => a.ply - b.ply)
    .map((row) => ({
      ply: row.ply,
      san: row.san,
      uci: row.uci,
      fenBefore: row.fenBefore,
      fenAfter: row.fenAfter,
      color: row.color,
      clockMs: row.clockMs,
      moveTimeMs: row.moveTimeMs,
    }));

  if (ingestedMoves.length === 0) {
    failAnalysis(analysisId, "No moves to analyze.");
    return;
  }

  db.update(analyses).set({ status: "running" }).where(eq(analyses.id, analysisId)).run();
  emitProgress({ analysisId, status: "running", progress: 0, movesDone: 0, movesTotal: ingestedMoves.length });

  try {
    const fens = [ingestedMoves[0].fenBefore, ...ingestedMoves.map((move) => move.fenAfter)];
    const positions = await evaluatePositions(fens, {
      depth: analysisRow.engineDepth,
      onProgress: (done, total) => {
        const progress = Math.min(0.99, done / total);
        db.update(analyses)
          .set({ progress: Math.round(progress * 1000) })
          .where(eq(analyses.id, analysisId))
          .run();
        emitProgress({ analysisId, status: "running", progress, movesDone: done, movesTotal: total });
      },
    });

    const classified = classifyGameMoves(ingestedMoves, positions);

    for (const move of classified) {
      const row = gameMoves.find((candidate) => candidate.ply === move.ply);
      if (!row) continue;
      db.update(moves)
        .set({
          phase: move.phase,
          evalCpBefore: move.evalCpBefore,
          evalCpAfter: move.evalCpAfter,
          cpLoss: move.cpLoss,
          classification: move.classification,
          bestMoveUci: move.bestMoveUci,
          bestMoveSan: move.bestMoveSan,
          multipvJson: move.multipvJson,
          missedMate: move.missedMate,
        })
        .where(eq(moves.id, row.id))
        .run();
    }

    const truncated = positions.filter((p) => p.achievedDepth < p.depth).length;
    if (truncated > 0) {
      console.warn(`[analysis] ${analysisId}: ${truncated}/${positions.length} positions hit the time budget below target depth.`);
    }

    const summary = summarizeAccuracy(classified);
    const now = Date.now();
    db.update(analyses)
      .set({
        status: "done",
        progress: 1000,
        summaryJson: JSON.stringify(summary),
        finishedAt: now,
      })
      .where(eq(analyses.id, analysisId))
      .run();

    // The analysis is complete the moment moves + summary are persisted; emit
    // `done` now so clients are never left waiting on the (engine/LLM-backed)
    // enrichment below.
    emitProgress({
      analysisId,
      status: "done",
      progress: 1,
      movesDone: ingestedMoves.length,
      movesTotal: ingestedMoves.length,
    });

    // Post-completion enrichment (skill model, drills, plan, narration) must
    // NEVER flip an already-successful analysis to "failed" — an engine death
    // during the prophylaxis probe or a DB hiccup here is logged and swallowed.
    await enrichAnalysis(analysisId, analysisRow.userId, gameRow, classified, summary, gameMoves);
  } catch (error) {
    failAnalysis(analysisId, error instanceof Error ? error.message : "Analysis failed.");
  }
}

/**
 * Idempotent, failure-isolated enrichment for a completed analysis. Guarded by
 * an evidence-existence check so a resumed/re-run job never folds the same
 * evidence into the cumulative BKT model twice (the crash-resume double-count).
 */
async function enrichAnalysis(
  analysisId: string,
  userId: string,
  gameRow: typeof games.$inferSelect,
  classified: ReturnType<typeof classifyGameMoves>,
  summary: ReturnType<typeof summarizeAccuracy>,
  gameMoves: (typeof moves.$inferSelect)[],
): Promise<void> {
  // Skill inference requires knowing which side the uploader played.
  if (!gameRow.playerColor) return;

  try {
    const alreadyScored =
      db.select({ id: evidence.id }).from(evidence).where(eq(evidence.analysisId, analysisId)).limit(1).all().length > 0;
    if (alreadyScored) return;

    const evidenceEntries = inferSkillEvidence(classified, {
      playerColor: gameRow.playerColor,
      result: gameRow.result,
    });
    const openingEvidence = inferOpeningEvidence(userId, gameRow.id, classified, {
      playerColor: gameRow.playerColor,
      currentEco: gameRow.openingEco,
    });
    updatePlayerModel(userId, analysisId, [...evidenceEntries, ...openingEvidence], (index) => gameMoves[index]?.id);
    harvestDrillsFromAnalysis(userId, analysisId, classified, gameRow.playerColor, (index) => gameMoves[index]?.id);

    const prophylaxisEvidence = await inferProphylaxisEvidence(classified, gameRow.playerColor, gameRow.result);
    if (prophylaxisEvidence.length > 0) {
      updatePlayerModel(userId, analysisId, prophylaxisEvidence, (index) => gameMoves[index]?.id);
    }

    persistTrainingPlan(userId, buildTrainingPlan(userId), null);

    const accuracy = gameRow.playerColor === "white" ? summary.whiteAccuracy : summary.blackAccuracy;
    const facts = buildGameFacts(classified, {
      playerColor: gameRow.playerColor,
      result: gameRow.result,
      openingName: gameRow.openingName,
      accuracy,
    });
    const narration = await narrateGame(facts);
    if (narration) {
      db.update(analyses).set({ llmNarrativeJson: JSON.stringify(narration) }).where(eq(analyses.id, analysisId)).run();
    }
  } catch (error) {
    console.error(`[analysis] enrichment failed for ${analysisId} (analysis remains done):`, error);
  }
}

function failAnalysis(analysisId: string, reason: string): void {
  db.update(analyses)
    .set({ status: "failed", error: reason, progress: 0, finishedAt: Date.now() })
    .where(eq(analyses.id, analysisId))
    .run();
  emitProgress({ analysisId, status: "failed", progress: 0, movesDone: 0, movesTotal: 0 });
}

export function createAnalysisRecord(gameId: string, userId: string, engineDepth: number): string {
  const id = crypto.randomUUID();
  db.insert(analyses)
    .values({
      id,
      gameId,
      userId,
      status: "queued",
      progress: 0,
      engineDepth,
      createdAt: Date.now(),
    })
    .run();
  return id;
}

/** Resumes any analyses left in `queued`/`running` state from a previous process (e.g. after a restart). */
export function resumeInterruptedAnalyses(): void {
  const stuck = db.select().from(analyses).all().filter((row) => row.status === "queued" || row.status === "running");
  for (const row of stuck) {
    db.update(analyses)
      .set({ status: "queued", progress: 0, error: null, summaryJson: null })
      .where(eq(analyses.id, row.id))
      .run();
    enqueueAnalysis(row.id);
  }
}
