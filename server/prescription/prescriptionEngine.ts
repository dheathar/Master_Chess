import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { skillScores, games, prescriptions } from "../db/schema";
import { SKILL_BY_ID, PLATEAUS, levelForRating, PLAYER_LEVEL_DEFINITIONS, type SkillId } from "@shared/taxonomy";
import { diagnosePlateau } from "@shared/playerModel";
import bookCorpus from "@shared/bookCorpus.json";

const MAX_FOCUS_SKILLS = 3;
const MIN_SAMPLE_COUNT = 3;
const BOOKS_PER_SKILL = 3;

interface BookEntry {
  title: string;
  author: string;
  year: string;
  level: string;
  themes: string;
  skills: string[];
}

const BOOKS = bookCorpus as BookEntry[];

export interface FocusBlock {
  skillId: SkillId;
  skillName: string;
  mastery: number;
  sampleCount: number;
  rationale: string;
  books: { title: string; author: string; level: string; themes: string }[];
}

export interface TrainingPlan {
  generatedAt: number;
  rating: number | null;
  levelId: string | null;
  plateauId: string | null;
  hypothesis: string;
  focusBlocks: FocusBlock[];
}

function averageRating(userId: string): number | null {
  const rows = db.select().from(games).where(eq(games.userId, userId)).all();
  const ratings = rows
    .map((row) => (row.playerColor === "white" ? row.whiteElo : row.playerColor === "black" ? row.blackElo : null))
    .filter((rating): rating is number => rating !== null);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
}

function booksFor(skillId: SkillId): FocusBlock["books"] {
  return BOOKS.filter((book) => book.skills.includes(skillId))
    .slice(0, BOOKS_PER_SKILL)
    .map((book) => ({ title: book.title, author: book.author, level: book.level, themes: book.themes }));
}

function buildHypothesis(plateauId: string | null, focus: FocusBlock[]): string {
  if (plateauId) {
    const plateau = PLATEAUS.find((p) => p.id === plateauId);
    if (plateau) return `${plateau.whatHappens} Right now that shows up most in: ${focus.map((f) => f.skillName.toLowerCase()).join(", ")}.`;
  }
  if (focus.length === 0) {
    return "Not enough analyzed games yet to diagnose a pattern — upload more games to build a training plan.";
  }
  return `Your weakest evidenced skills right now are ${focus.map((f) => f.skillName.toLowerCase()).join(", ")}. No plateau pattern is diagnosable yet (needs a PGN-header rating), but these are the lowest-mastery skills we have real evidence for.`;
}

/**
 * Ranks evidenced skills by (low mastery, weighted toward the player's diagnosed
 * plateau if one exists) and builds a focus-block plan with matched book picks.
 * Skills with fewer than MIN_SAMPLE_COUNT evidence rows are excluded — a plan
 * built on 1-2 data points would be a guess dressed up as a diagnosis.
 */
export function buildTrainingPlan(userId: string): TrainingPlan {
  const rows = db.select().from(skillScores).where(eq(skillScores.userId, userId)).all();
  const rating = averageRating(userId);
  const levelId = rating !== null ? levelForRating(rating) : null;

  const plateauDiagnosis = diagnosePlateau(
    rating,
    rows.map((row) => ({ skillId: row.skillId as SkillId, mastery: row.mastery, sampleCount: row.sampleCount })),
  );
  const plateau = plateauDiagnosis ? PLATEAUS.find((p) => p.id === plateauDiagnosis.plateauId) : null;
  const plateauSkillSet = new Set(plateau?.targetSkills ?? []);

  const evidenced = rows.filter((row) => row.sampleCount >= MIN_SAMPLE_COUNT);

  const ranked = [...evidenced].sort((a, b) => {
    const aInPlateau = plateauSkillSet.has(a.skillId as SkillId) ? 1 : 0;
    const bInPlateau = plateauSkillSet.has(b.skillId as SkillId) ? 1 : 0;
    if (aInPlateau !== bInPlateau) return bInPlateau - aInPlateau;
    return a.mastery - b.mastery;
  });

  const focusBlocks: FocusBlock[] = ranked.slice(0, MAX_FOCUS_SKILLS).map((row) => {
    const skillId = row.skillId as SkillId;
    const def = SKILL_BY_ID[skillId];
    const inPlateau = plateauSkillSet.has(skillId);
    return {
      skillId,
      skillName: def?.name ?? skillId,
      mastery: row.mastery,
      sampleCount: row.sampleCount,
      rationale: inPlateau
        ? `Lowest-mastery skill (${row.mastery}/100 over ${row.sampleCount} evidence points) and a target skill for your diagnosed plateau.`
        : `Lowest-mastery skill with real evidence (${row.mastery}/100 over ${row.sampleCount} evidence points).`,
      books: booksFor(skillId),
    };
  });

  return {
    generatedAt: Date.now(),
    rating,
    levelId,
    plateauId: plateau?.id ?? null,
    hypothesis: buildHypothesis(plateau?.id ?? null, focusBlocks),
    focusBlocks,
  };
}

export function persistTrainingPlan(userId: string, plan: TrainingPlan, sourceSnapshotId: string | null): string {
  db.update(prescriptions)
    .set({ status: "archived" })
    .where(eq(prescriptions.userId, userId))
    .run();

  const id = crypto.randomUUID();
  db.insert(prescriptions)
    .values({
      id,
      userId,
      createdAt: plan.generatedAt,
      planJson: JSON.stringify(plan),
      sourceSnapshotId,
      status: "active",
    })
    .run();
  return id;
}
