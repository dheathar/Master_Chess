import { Router } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { skillScores, evidence, moves, games, analyses, playerSnapshots } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { SKILLS, PLAYER_LEVEL_DEFINITIONS, PLATEAUS, levelForRating, type SkillId } from "@shared/taxonomy";
import { diagnosePlateau } from "@shared/playerModel";
import { assessmentMethodFor } from "@shared/skillAssessment";
import type { PlayerModelResponse, EvidenceReceipt, PlayerHistoryResponse } from "@shared/api";

export const playerModelRouter = Router();

function averageRating(userId: string): number | null {
  const rows = db.select().from(games).where(eq(games.userId, userId)).all();
  const ratings = rows
    .map((row) => (row.playerColor === "white" ? row.whiteElo : row.playerColor === "black" ? row.blackElo : null))
    .filter((rating): rating is number => rating !== null);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
}

playerModelRouter.get("/", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const rows = db.select().from(skillScores).where(eq(skillScores.userId, userId)).all();
  const byId = new Map(rows.map((row) => [row.skillId, row]));

  const skills = SKILLS.map((definition) => {
    const row = byId.get(definition.id);
    return {
      skillId: definition.id,
      name: definition.name,
      category: definition.category,
      mastery: row?.mastery ?? 0,
      sampleCount: row?.sampleCount ?? 0,
      trend: row?.trend ?? ("flat" as const),
      hasEvidence: (row?.sampleCount ?? 0) > 0,
      description: definition.description,
      whyItMatters: definition.whyItMatters,
      assessmentMethod: assessmentMethodFor(definition.id),
    };
  });

  const rating = averageRating(userId);
  const levelId = rating !== null ? levelForRating(rating) : null;
  const levelDef = levelId ? PLAYER_LEVEL_DEFINITIONS.find((l) => l.id === levelId) : null;

  const plateauDiagnosis = diagnosePlateau(
    rating,
    rows.map((row) => ({ skillId: row.skillId as SkillId, mastery: row.mastery, sampleCount: row.sampleCount })),
  );
  const plateauDef = plateauDiagnosis ? PLATEAUS.find((p) => p.id === plateauDiagnosis.plateauId) : null;

  const gamesAnalyzed = db
    .select()
    .from(analyses)
    .where(eq(analyses.userId, userId))
    .all()
    .filter((row) => row.status === "done").length;

  const totalSamples = rows.reduce((sum, r) => sum + r.sampleCount, 0);
  const confidence = Math.min(95, Math.round(totalSamples * 3));

  const response: PlayerModelResponse = {
    level: levelId,
    levelName: levelDef?.name ?? null,
    rating,
    confidence,
    plateau: plateauDef
      ? {
          id: plateauDef.id,
          name: plateauDef.name,
          whatHappens: plateauDef.whatHappens,
          diagnosisSignal: plateauDef.diagnosisSignal,
          averageMastery: Math.round(plateauDiagnosis!.averageMastery),
        }
      : null,
    skills,
    gamesAnalyzed,
  };

  res.json(response);
});

/** Mastery-over-time history, reading the player_snapshots row written after every analysis. */
playerModelRouter.get("/history", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const rows = db.select().from(playerSnapshots).where(eq(playerSnapshots.userId, userId)).orderBy(asc(playerSnapshots.takenAt)).all();

  const response: PlayerHistoryResponse = {
    snapshots: rows.map((row) => {
      const vector = JSON.parse(row.skillVectorJson) as Array<{ skillId: string; mastery: number; sampleCount: number }>;
      const evidenced = vector.filter((entry) => entry.sampleCount > 0);
      const avgMastery =
        evidenced.length > 0 ? evidenced.reduce((sum, entry) => sum + entry.mastery, 0) / evidenced.length : null;
      return {
        takenAt: row.takenAt,
        level: row.level,
        plateauDiagnosis: row.plateauDiagnosis,
        confidence: row.confidence,
        avgMasteryOfEvidencedSkills: avgMastery === null ? null : Math.round(avgMastery * 10) / 10,
        evidencedSkillCount: evidenced.length,
      };
    }),
  };

  res.json(response);
});

playerModelRouter.get("/evidence/:skillId", requireAuth, (req, res) => {
  const userId = req.user!.id;
  const skillId = req.params.skillId;

  const skillRow = db
    .select()
    .from(skillScores)
    .where(eq(skillScores.userId, userId))
    .all()
    .find((row) => row.skillId === skillId);

  if (!skillRow) {
    res.json({ receipts: [] });
    return;
  }

  const evidenceRows = db
    .select()
    .from(evidence)
    .where(eq(evidence.skillScoreId, skillRow.id))
    .orderBy(desc(evidence.createdAt))
    .limit(20)
    .all();

  const receipts: EvidenceReceipt[] = evidenceRows
    .map((row) => {
      const moveRow = db.select().from(moves).where(eq(moves.id, row.moveId)).get();
      if (!moveRow) return null;
      const gameRow = db.select().from(games).where(eq(games.id, moveRow.gameId)).get();
      if (!gameRow || gameRow.userId !== userId) return null;
      return {
        id: row.id,
        direction: row.direction,
        note: row.note,
        createdAt: row.createdAt,
        move: { san: moveRow.san, ply: moveRow.ply, color: moveRow.color },
        game: { id: gameRow.id, white: gameRow.white, black: gameRow.black },
      };
    })
    .filter((receipt): receipt is EvidenceReceipt => receipt !== null);

  res.json({ receipts });
});
