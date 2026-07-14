import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, rawSqlite } from "../db/client";
import { evidence as evidenceTable, games, skillScores, playerSnapshots } from "../db/schema";
import { applySkillEvidence, initialSkillState, type SkillMasteryState } from "@shared/bkt";
import { SKILL_BY_ID, levelForRating, type SkillId } from "@shared/taxonomy";
import { diagnosePlateau, type SkillSnapshotEntry } from "@shared/playerModel";
import type { EvidenceEntry } from "@shared/evidence";

const TREND_THRESHOLD = 2; // mastery-point delta below which we call it "flat"

function loadSkillState(userId: string, skillId: SkillId): { rowId: string | null; state: SkillMasteryState } {
  const row = db
    .select()
    .from(skillScores)
    .where(and(eq(skillScores.userId, userId), eq(skillScores.skillId, skillId)))
    .get();
  if (!row) {
    return { rowId: null, state: initialSkillState(skillId) };
  }
  return { rowId: row.id, state: { pKnow: row.pKnow / 1000, mastery: row.mastery, sampleCount: row.sampleCount } };
}

function saveSkillState(userId: string, skillId: SkillId, rowId: string | null, state: SkillMasteryState, trend: "up" | "down" | "flat"): string {
  const now = Date.now();
  if (rowId) {
    db.update(skillScores)
      .set({ pKnow: Math.round(state.pKnow * 1000), mastery: state.mastery, sampleCount: state.sampleCount, trend, updatedAt: now })
      .where(eq(skillScores.id, rowId))
      .run();
    return rowId;
  }
  const id = crypto.randomUUID();
  db.insert(skillScores)
    .values({
      id,
      userId,
      skillId,
      category: SKILL_BY_ID[skillId].category,
      pKnow: Math.round(state.pKnow * 1000),
      mastery: state.mastery,
      sampleCount: state.sampleCount,
      trend,
      updatedAt: now,
    })
    .run();
  return id;
}

/** Average PGN-header rating for the user's own color across their uploaded games — real data, never estimated. */
function averageRating(userId: string): number | null {
  const rows = db.select().from(games).where(eq(games.userId, userId)).all();
  const ratings = rows
    .map((row) => (row.playerColor === "white" ? row.whiteElo : row.playerColor === "black" ? row.blackElo : null))
    .filter((rating): rating is number => rating !== null);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
}

/**
 * Applies a batch of evidence (from one analysis) to the player's skill
 * model: folds each entry into its skill's BKT state, writes an evidence
 * receipt row per entry, then writes a fresh player_snapshot capturing the
 * full 27-skill vector, level, and plateau diagnosis at this point in time.
 */
export function updatePlayerModel(
  userId: string,
  analysisId: string,
  evidenceEntries: EvidenceEntry[],
  moveIdAt: (moveIndex: number) => string | undefined,
): void {
  if (evidenceEntries.length === 0) return;

  const bySkill = new Map<SkillId, EvidenceEntry[]>();
  for (const entry of evidenceEntries) {
    if (!bySkill.has(entry.skillId)) bySkill.set(entry.skillId, []);
    bySkill.get(entry.skillId)!.push(entry);
  }

  const run = rawSqlite.transaction(() => {
    for (const [skillId, entries] of bySkill) {
      const { rowId, state: initialState } = loadSkillState(userId, skillId);
      let state = initialState;
      const startMastery = state.mastery;

      for (const entry of entries) {
        state = applySkillEvidence(state, entry.direction, entry.weight);
      }

      const trend: "up" | "down" | "flat" =
        state.mastery - startMastery > TREND_THRESHOLD ? "up" : startMastery - state.mastery > TREND_THRESHOLD ? "down" : "flat";
      const skillScoreId = saveSkillState(userId, skillId, rowId, state, trend);

      for (const entry of entries) {
        const moveId = moveIdAt(entry.moveIndex);
        if (!moveId) continue;
        db.insert(evidenceTable)
          .values({
            id: crypto.randomUUID(),
            skillScoreId,
            moveId,
            analysisId,
            direction: entry.direction,
            weight: Math.round(entry.weight * 1000),
            ruleId: entry.ruleId,
            note: entry.note,
            createdAt: Date.now(),
          })
          .run();
      }
    }

    writeSnapshot(userId);
  });

  run();
}

function writeSnapshot(userId: string): void {
  const allSkills = db.select().from(skillScores).where(eq(skillScores.userId, userId)).all();
  const snapshotEntries: SkillSnapshotEntry[] = allSkills.map((row) => ({
    skillId: row.skillId as SkillId,
    mastery: row.mastery,
    sampleCount: row.sampleCount,
  }));

  const rating = averageRating(userId);
  const level = rating !== null ? levelForRating(rating) : null;
  const plateau = diagnosePlateau(rating, snapshotEntries);

  // Confidence grows with total evidence volume, capped — a handful of
  // moves should never claim high confidence.
  const totalSamples = snapshotEntries.reduce((sum, s) => sum + s.sampleCount, 0);
  const confidence = Math.min(95, Math.round(totalSamples * 3));

  db.insert(playerSnapshots)
    .values({
      id: crypto.randomUUID(),
      userId,
      takenAt: Date.now(),
      skillVectorJson: JSON.stringify(snapshotEntries),
      level,
      plateauDiagnosis: plateau?.plateauId ?? null,
      confidence,
    })
    .run();
}
