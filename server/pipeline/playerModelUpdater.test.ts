import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db/client";
import { analyses, evidence, games, moves, playerSnapshots, skillScores, users } from "../db/schema";
import { updatePlayerModel } from "./playerModelUpdater";
import type { EvidenceEntry } from "@shared/evidence";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  migrate(db, { migrationsFolder: path.join(__dirname, "../db/migrations") });
});

function seedUserGameAndMoves(overrides: {
  whiteElo?: number | null;
} = {}): { userId: string; gameId: string; analysisId: string; moveIds: string[] } {
  const whiteElo = "whiteElo" in overrides ? overrides.whiteElo! : 1500;
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

  const gameId = crypto.randomUUID();
  db.insert(games)
    .values({
      id: gameId,
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

  const moveIds = [0, 1, 2].map((i) => {
    const id = crypto.randomUUID();
    db.insert(moves)
      .values({
        id,
        gameId,
        ply: i + 1,
        san: "e4",
        uci: "e2e4",
        fenBefore: "startpos",
        fenAfter: "startpos",
        color: i % 2 === 0 ? "white" : "black",
      })
      .run();
    return id;
  });

  const analysisId = crypto.randomUUID();
  db.insert(analyses)
    .values({
      id: analysisId,
      gameId,
      userId,
      status: "done",
      progress: 1000,
      engineDepth: 16,
      createdAt: Date.now(),
    })
    .run();

  return { userId, gameId, analysisId, moveIds };
}

describe("updatePlayerModel", () => {
  it("creates a new skill_scores row and moves mastery down on 'against' evidence", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves();
    const entries: EvidenceEntry[] = [
      { skillId: "tactical_consistency", direction: "against", weight: 1, ruleId: "test-rule", note: "test", moveIndex: 0 },
    ];
    updatePlayerModel(userId, analysisId, entries, (i) => moveIds[i]);

    const row = db
      .select()
      .from(skillScores)
      .where(eq(skillScores.userId, userId))
      .all()
      .find((r) => r.skillId === "tactical_consistency");
    expect(row).toBeDefined();
    expect(row!.mastery).toBeLessThan(30); // BKT prior is 30; "against" evidence should lower it
    expect(row!.sampleCount).toBe(1);
    expect(row!.trend).toBe("down");
  });

  it("writes one evidence row per entry, linked to the correct move", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves();
    const entries: EvidenceEntry[] = [
      { skillId: "opening_principles", direction: "for", weight: 0.2, ruleId: "test-rule", note: "note-a", moveIndex: 0 },
      { skillId: "opening_principles", direction: "against", weight: 0.5, ruleId: "test-rule-2", note: "note-b", moveIndex: 1 },
    ];
    updatePlayerModel(userId, analysisId, entries, (i) => moveIds[i]);

    const skillRow = db
      .select()
      .from(skillScores)
      .where(eq(skillScores.userId, userId))
      .all()
      .find((r) => r.skillId === "opening_principles")!;
    const evidenceRows = db.select().from(evidence).where(eq(evidence.skillScoreId, skillRow.id)).all();
    expect(evidenceRows).toHaveLength(2);
    expect(evidenceRows.map((r) => r.moveId).sort()).toEqual([moveIds[0], moveIds[1]].sort());
  });

  it("accumulates sample count and folds multiple evidence entries for the same skill in one call", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves();
    const entries: EvidenceEntry[] = [
      { skillId: "time_management", direction: "against", weight: 0.5, ruleId: "r1", note: "a", moveIndex: 0 },
      { skillId: "time_management", direction: "against", weight: 0.5, ruleId: "r2", note: "b", moveIndex: 1 },
    ];
    updatePlayerModel(userId, analysisId, entries, (i) => moveIds[i]);
    const row = db
      .select()
      .from(skillScores)
      .where(eq(skillScores.userId, userId))
      .all()
      .find((r) => r.skillId === "time_management")!;
    expect(row.sampleCount).toBe(2);
  });

  it("skips an evidence entry whose moveIndex has no resolvable move id", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves();
    const entries: EvidenceEntry[] = [
      { skillId: "calculation_precision", direction: "against", weight: 1, ruleId: "r1", note: "a", moveIndex: 99 },
    ];
    // Should not throw despite the out-of-range index, and should still update the skill score.
    expect(() => updatePlayerModel(userId, analysisId, entries, (i) => moveIds[i])).not.toThrow();
    const skillRow = db
      .select()
      .from(skillScores)
      .where(eq(skillScores.userId, userId))
      .all()
      .find((r) => r.skillId === "calculation_precision")!;
    const evidenceRows = db.select().from(evidence).where(eq(evidence.skillScoreId, skillRow.id)).all();
    expect(evidenceRows).toHaveLength(0);
  });

  it("does nothing for an empty evidence list", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves();
    updatePlayerModel(userId, analysisId, [], (i) => moveIds[i]);
    const rows = db.select().from(skillScores).where(eq(skillScores.userId, userId)).all();
    expect(rows).toHaveLength(0);
    const snapshots = db.select().from(playerSnapshots).where(eq(playerSnapshots.userId, userId)).all();
    expect(snapshots).toHaveLength(0);
  });

  it("writes a player_snapshot with a level derived from the game's real rating header", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves({ whiteElo: 1850 });
    const entries: EvidenceEntry[] = [
      { skillId: "prophylaxis", direction: "for", weight: 0.5, ruleId: "r1", note: "a", moveIndex: 0 },
    ];
    updatePlayerModel(userId, analysisId, entries, (i) => moveIds[i]);
    const snapshot = db
      .select()
      .from(playerSnapshots)
      .where(eq(playerSnapshots.userId, userId))
      .all()
      .at(-1)!;
    expect(snapshot.level).toBe("L5"); // 1800-1999 band per shared/taxonomy.ts
    const vector = JSON.parse(snapshot.skillVectorJson);
    expect(vector.some((s: { skillId: string }) => s.skillId === "prophylaxis")).toBe(true);
  });

  it("leaves level null when the game has no rating header", () => {
    const { userId, analysisId, moveIds } = seedUserGameAndMoves({ whiteElo: null });
    const entries: EvidenceEntry[] = [
      { skillId: "prophylaxis", direction: "for", weight: 0.5, ruleId: "r1", note: "a", moveIndex: 0 },
    ];
    updatePlayerModel(userId, analysisId, entries, (i) => moveIds[i]);
    const snapshot = db
      .select()
      .from(playerSnapshots)
      .where(eq(playerSnapshots.userId, userId))
      .all()
      .at(-1)!;
    expect(snapshot.level).toBeNull();
  });
});
