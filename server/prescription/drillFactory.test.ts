import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db/client";
import { drills, reviewQueue, users } from "../db/schema";
import { harvestDrillsFromAnalysis } from "./drillFactory";
import type { ClassifiedMove } from "../pipeline/classifier";
import type { MoveClassification, GamePhase } from "@shared/classification";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  migrate(db, { migrationsFolder: path.join(__dirname, "../db/migrations") });
});

function seedUser(): string {
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
  return userId;
}

function move(overrides: Partial<ClassifiedMove> & { fenBefore: string }): ClassifiedMove {
  return {
    ply: 20,
    san: "Qe7",
    uci: "d8e7",
    fenAfter: "irrelevant",
    color: "white",
    clockMs: null,
    moveTimeMs: null,
    phase: "middlegame" as GamePhase,
    evalCpBefore: 0,
    evalCpAfter: -300,
    cpLoss: 300,
    classification: "blunder" as MoveClassification,
    bestMoveUci: "f7f5",
    bestMoveSan: "f5",
    multipvJson: "[]",
    missedMate: false,
    ...overrides,
  };
}

describe("harvestDrillsFromAnalysis", () => {
  it("creates a drill and seeds the review queue for a qualifying blunder", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen })];

    const created = harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    expect(created).toBe(1);

    const drillRow = db.select().from(drills).where(eq(drills.userId, userId)).all().find((r) => r.fen === fen);
    expect(drillRow).toBeDefined();
    expect(drillRow!.correctUci).toBe("f7f5");
    expect(drillRow!.skillId).toBe("tactical_consistency");
    expect(drillRow!.kind).toBe("tactic");

    const queueRow = db.select().from(reviewQueue).where(eq(reviewQueue.userId, userId)).all().find((r) => r.drillId === drillRow!.id);
    expect(queueRow).toBeDefined();
    expect(queueRow!.streak).toBe(0);
    expect(queueRow!.dueAt).toBeLessThanOrEqual(Date.now());
  });

  it("ignores the opponent's mistakes", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen, color: "black" })];
    const created = harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    expect(created).toBe(0);
  });

  it("skips a small cp-loss not worth drilling", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen, classification: "mistake", cpLoss: 40 })];
    const created = harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    expect(created).toBe(0);
  });

  it("skips a move with no engine best-move recorded", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen, bestMoveUci: null })];
    const created = harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    expect(created).toBe(0);
  });

  it("does not create a duplicate drill for a position already drilled", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen })];
    harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    const secondCreated = harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    expect(secondCreated).toBe(0);
  });

  it("assigns opening_principles to an opening-phase error", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen, phase: "opening" as GamePhase })];
    harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    const drillRow = db.select().from(drills).where(eq(drills.userId, userId)).all().find((r) => r.fen === fen);
    expect(drillRow!.skillId).toBe("opening_principles");
  });

  it("assigns endgame_precision_conversion to an endgame-phase error", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen, phase: "endgame" as GamePhase })];
    harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    const drillRow = db.select().from(drills).where(eq(drills.userId, userId)).all().find((r) => r.fen === fen);
    expect(drillRow!.skillId).toBe("endgame_precision_conversion");
  });

  it("assigns tactical_pattern_recognition to a middlegame mistake (not a blunder)", () => {
    const userId = seedUser();
    const fen = `test-fen-${crypto.randomUUID()}`;
    const moves = [move({ fenBefore: fen, classification: "mistake" as MoveClassification, cpLoss: 150 })];
    harvestDrillsFromAnalysis(userId, crypto.randomUUID(), moves, "white", () => undefined);
    const drillRow = db.select().from(drills).where(eq(drills.userId, userId)).all().find((r) => r.fen === fen);
    expect(drillRow!.skillId).toBe("tactical_pattern_recognition");
  });
});
