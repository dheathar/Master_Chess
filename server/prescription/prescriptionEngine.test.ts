import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db/client";
import { games, prescriptions, skillScores, users } from "../db/schema";
import { buildTrainingPlan, persistTrainingPlan } from "./prescriptionEngine";
import type { SkillId } from "@shared/taxonomy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  migrate(db, { migrationsFolder: path.join(__dirname, "../db/migrations") });
});

function seedUser(whiteElo: number | null): string {
  const userId = crypto.randomUUID();
  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@test.local`,
      passwordHash: "x",
      passwordSalt: "x",
      passwordIterations: 1,
      displayName: "Test",
      role: "player",
      tier: "free",
      createdAt: Date.now(),
    })
    .run();
  if (whiteElo !== null) {
    db.insert(games)
      .values({
        id: crypto.randomUUID(),
        userId,
        source: "manual",
        pgnRaw: "",
        white: "Test",
        black: "Opponent",
        whiteElo,
        blackElo: null,
        playerColor: "white",
        result: "1-0",
        timeControl: null,
        playedAt: null,
        openingEco: null,
        openingName: null,
        plyCount: 3,
        importBatchId: null,
        createdAt: Date.now(),
      })
      .run();
  }
  return userId;
}

function seedSkill(userId: string, skillId: SkillId, mastery: number, sampleCount: number): void {
  db.insert(skillScores)
    .values({
      id: crypto.randomUUID(),
      userId,
      skillId,
      category: "MIDDLEGAME",
      pKnow: 500,
      mastery,
      sampleCount,
      trend: "flat",
      updatedAt: Date.now(),
    })
    .run();
}

describe("buildTrainingPlan", () => {
  it("returns an empty-focus plan with an honest hypothesis when there is no evidenced skill", () => {
    const userId = seedUser(null);
    const plan = buildTrainingPlan(userId);
    expect(plan.focusBlocks).toHaveLength(0);
    expect(plan.hypothesis).toMatch(/analyse a few of your own games|improvement opportunities/i);
  });

  it("excludes skills below the minimum sample-count threshold", () => {
    const userId = seedUser(null);
    seedSkill(userId, "tactical_consistency", 20, 2); // below threshold of 3
    const plan = buildTrainingPlan(userId);
    expect(plan.focusBlocks).toHaveLength(0);
  });

  it("ranks evidenced skills by lowest mastery first", () => {
    const userId = seedUser(null);
    seedSkill(userId, "tactical_consistency", 70, 5);
    seedSkill(userId, "endgame_principles", 20, 5);
    seedSkill(userId, "opening_principles", 45, 5);

    const plan = buildTrainingPlan(userId);
    expect(plan.focusBlocks.map((b) => b.skillId)).toEqual(["endgame_principles", "opening_principles", "tactical_consistency"]);
  });

  it("caps focus blocks at 3 and attaches matched book picks", () => {
    const userId = seedUser(null);
    const skills: SkillId[] = [
      "tactical_consistency",
      "endgame_principles",
      "opening_principles",
      "pawn_endings",
      "rook_endings",
    ];
    skills.forEach((skillId, i) => seedSkill(userId, skillId, 10 + i * 5, 5));

    const plan = buildTrainingPlan(userId);
    expect(plan.focusBlocks).toHaveLength(3);
    expect(plan.focusBlocks[0].skillId).toBe("tactical_consistency");
    expect(plan.focusBlocks[0].books.length).toBeGreaterThan(0);
    expect(plan.focusBlocks[0].books[0]).toHaveProperty("title");
  });

  it("prioritizes plateau-target skills when a plateau is diagnosable from rating", () => {
    const userId = seedUser(1550); // conversion_ceiling zone: 1500-2000
    seedSkill(userId, "opening_principles", 10, 5); // lower mastery, not a plateau target
    seedSkill(userId, "converting_advantages", 60, 5); // plateau target, higher mastery

    const plan = buildTrainingPlan(userId);
    expect(plan.plateauId).toBe("conversion_ceiling");
    expect(plan.focusBlocks[0].skillId).toBe("converting_advantages");
  });
});

describe("persistTrainingPlan", () => {
  it("archives the previous active plan and inserts a new active one", () => {
    const userId = seedUser(null);
    seedSkill(userId, "tactical_consistency", 30, 5);
    const plan = buildTrainingPlan(userId);

    const firstId = persistTrainingPlan(userId, plan, null);
    const secondId = persistTrainingPlan(userId, plan, null);

    const rows = db.select().from(prescriptions).where(eq(prescriptions.userId, userId)).all();
    const first = rows.find((r) => r.id === firstId);
    const second = rows.find((r) => r.id === secondId);
    expect(first?.status).toBe("archived");
    expect(second?.status).toBe("active");
  });
});
