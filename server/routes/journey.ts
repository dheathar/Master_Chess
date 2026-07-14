import { Router } from "express";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { skillScores, games, analyses, reviewQueue, drillAttempts } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../asyncHandler";
import { getLlmProvider } from "../llm";
import { SKILL_BY_ID, PLAYER_LEVEL_DEFINITIONS, PLATEAUS, levelForRating, type SkillId } from "@shared/taxonomy";
import { diagnosePlateau } from "@shared/playerModel";
import type { JourneyNextAction, JourneyResponse } from "@shared/api";

export const journeyRouter = Router();

const MIN_GAMES_FOR_PLAN = 3;

function averageRating(userId: string): number | null {
  const rows = db.select().from(games).where(eq(games.userId, userId)).all();
  const ratings = rows
    .map((r) => (r.playerColor === "white" ? r.whiteElo : r.playerColor === "black" ? r.blackElo : null))
    .filter((r): r is number => r !== null);
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length);
}

export interface JourneyFacts {
  gamesAnalyzed: number;
  evidenced: { skillId: SkillId; name: string; mastery: number; sampleCount: number }[];
  level: string | null;
  levelName: string | null;
  plateauName: string | null;
  dueDrills: number;
  drillsCompleted: number;
  retentionPct: number | null;
}

/** Deterministic "single highest-leverage next step" — the guide-to-success ladder. */
export function decideNextAction(f: JourneyFacts): JourneyNextAction {
  if (f.gamesAnalyzed === 0) {
    return { title: "Upload your first game", detail: "Paste a PGN or drop a file so we can analyse your play and start your model.", screen: "upload" };
  }
  if (f.gamesAnalyzed < MIN_GAMES_FOR_PLAN) {
    const need = MIN_GAMES_FOR_PLAN - f.gamesAnalyzed;
    return { title: `Analyse ${need} more game${need === 1 ? "" : "s"}`, detail: "A few more analysed games unlock your diagnosed plateau and a training plan.", screen: "upload" };
  }
  if (f.dueDrills > 0) {
    return { title: `Clear today's ${f.dueDrills} drill${f.dueDrills === 1 ? "" : "s"}`, detail: "Each drill is a position you actually misplayed. Closing them is the fastest way to stop repeating mistakes.", screen: "drill" };
  }
  const focus = [...f.evidenced].filter((s) => s.sampleCount >= 3).sort((a, b) => a.mastery - b.mastery)[0];
  if (focus) {
    return { title: `Work on ${focus.name.toLowerCase()}`, detail: `It's your lowest-scoring well-evidenced skill (mastery ${focus.mastery}). See your training plan for matched study.`, screen: "prescription" };
  }
  return { title: "Upload a recent game", detail: "Keep your model current by analysing your latest play.", screen: "upload" };
}

function buildAchievements(f: JourneyFacts): string[] {
  const out: string[] = [];
  if (f.gamesAnalyzed > 0) out.push(`Analysed ${f.gamesAnalyzed} game${f.gamesAnalyzed === 1 ? "" : "s"}.`);
  if (f.evidenced.length > 0) out.push(`Built evidence across ${f.evidenced.length} of 27 skills.`);
  if (f.level && f.levelName) out.push(`Current level: ${f.level} — ${f.levelName}.`);
  if (f.plateauName) out.push(`Diagnosed pattern: ${f.plateauName}.`);
  if (f.drillsCompleted > 0) {
    out.push(`Completed ${f.drillsCompleted} drill attempt${f.drillsCompleted === 1 ? "" : "s"}${f.retentionPct !== null ? ` at ${f.retentionPct}% retention` : ""}.`);
  }
  const best = [...f.evidenced].sort((a, b) => b.mastery - a.mastery)[0];
  if (best && best.mastery >= 60) out.push(`Strongest evidenced skill: ${best.name.toLowerCase()} (${best.mastery}).`);
  return out;
}

function deterministicNarrative(f: JourneyFacts, next: JourneyNextAction): string {
  if (f.gamesAnalyzed === 0) {
    return "Welcome! You haven't analysed any games yet. Upload a PGN from Chess.com or Lichess and Master Chess will start diagnosing your play — every finding backed by the exact moves that produced it.";
  }
  const bits = [`You've analysed ${f.gamesAnalyzed} game${f.gamesAnalyzed === 1 ? "" : "s"} and built evidence across ${f.evidenced.length} skills.`];
  if (f.level && f.levelName) bits.push(`You're at ${f.levelName}${f.plateauName ? `, showing the "${f.plateauName}" pattern` : ""}.`);
  bits.push(`Next: ${next.title.toLowerCase()} — ${next.detail}`);
  return bits.join(" ");
}

journeyRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const skillRows = db.select().from(skillScores).where(eq(skillScores.userId, userId)).all();
    const evidenced = skillRows
      .filter((r) => r.sampleCount > 0)
      .map((r) => ({ skillId: r.skillId as SkillId, name: SKILL_BY_ID[r.skillId as SkillId]?.name ?? r.skillId, mastery: r.mastery, sampleCount: r.sampleCount }));

    const gamesAnalyzed = db.select().from(analyses).where(eq(analyses.userId, userId)).all().filter((a) => a.status === "done").length;

    const rating = averageRating(userId);
    const levelId = rating !== null ? levelForRating(rating) : null;
    const levelName = levelId ? PLAYER_LEVEL_DEFINITIONS.find((l) => l.id === levelId)?.name ?? null : null;
    const plateau = diagnosePlateau(rating, skillRows.map((r) => ({ skillId: r.skillId as SkillId, mastery: r.mastery, sampleCount: r.sampleCount })));
    const plateauName = plateau ? PLATEAUS.find((p) => p.id === plateau.plateauId)?.name ?? null : null;

    const now = Date.now();
    const dueDrills = db
      .select({ id: reviewQueue.id })
      .from(reviewQueue)
      .where(and(eq(reviewQueue.userId, userId), eq(reviewQueue.suspended, false), lte(reviewQueue.dueAt, now)))
      .all().length;
    const attempts = db.select().from(drillAttempts).where(eq(drillAttempts.userId, userId)).all();
    const retentionPct = attempts.length > 0 ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 1000) / 10 : null;

    const facts: JourneyFacts = {
      gamesAnalyzed,
      evidenced,
      level: levelId,
      levelName,
      plateauName,
      dueDrills,
      drillsCompleted: attempts.length,
      retentionPct,
    };

    const nextAction = decideNextAction(facts);
    const achievements = buildAchievements(facts);

    // Grounded narration: hand the LLM only the facts; fall back to deterministic prose.
    let narrative = deterministicNarrative(facts, nextAction);
    let llmAvailable = false;
    const provider = getLlmProvider();
    if (provider && (await provider.isAvailable())) {
      const system =
        "You are a chess improvement coach writing a short, encouraging but honest progress note for a student. " +
        "Use ONLY the facts provided — never invent numbers, moves, skills, or claims. 3–5 sentences, second person, " +
        "no filler praise. End by pointing to the single next action given.";
      const prompt =
        `Facts:\n` +
        `- Games analysed: ${facts.gamesAnalyzed}\n` +
        `- Skills with evidence: ${facts.evidenced.length} of 27\n` +
        `- Level: ${facts.levelName ?? "not yet known (games have no rating)"}\n` +
        `- Diagnosed pattern: ${facts.plateauName ?? "none yet"}\n` +
        `- Drills due now: ${facts.dueDrills}; drills completed: ${facts.drillsCompleted}` +
        `${facts.retentionPct !== null ? ` at ${facts.retentionPct}% retention` : ""}\n` +
        `- Lowest well-evidenced skill: ${[...facts.evidenced].filter((s) => s.sampleCount >= 3).sort((a, b) => a.mastery - b.mastery)[0]?.name ?? "n/a"}\n` +
        `- Next action to recommend: ${nextAction.title} — ${nextAction.detail}\n\n` +
        `Write the coaching note now.`;
      try {
        const completion = await provider.complete({ system, prompt });
        const text = completion.text.trim();
        if (text) {
          narrative = text;
          llmAvailable = true;
        }
      } catch {
        /* keep deterministic narrative */
      }
    }

    const response: JourneyResponse = {
      stats: {
        gamesAnalyzed: facts.gamesAnalyzed,
        evidencedSkillCount: facts.evidenced.length,
        level: facts.level,
        levelName: facts.levelName,
        plateauName: facts.plateauName,
        dueDrills: facts.dueDrills,
        drillsCompleted: facts.drillsCompleted,
        retentionPct: facts.retentionPct,
      },
      achievements,
      nextAction,
      narrative,
      llmAvailable,
    };
    res.json(response);
  }),
);
