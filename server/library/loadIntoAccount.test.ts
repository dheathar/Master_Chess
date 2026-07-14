import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db/client";
import { games, libraryGames, moves, users } from "../db/schema";
import { loadLibraryGameForUser } from "./loadIntoAccount";

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

function seedLibraryGame(sanMoves: string, result = "1-0"): typeof libraryGames.$inferSelect {
  const id = crypto.randomUUID();
  db.insert(libraryGames)
    .values({
      id,
      white: "Historic White",
      black: "Historic Black",
      whiteElo: null,
      blackElo: null,
      result,
      eco: "C50",
      opening: "Italian Game",
      event: "Test Classic",
      playedAt: "1900.01.01",
      source: "classic",
      sanMoves,
      plyCount: sanMoves.split(" ").length,
      dedupeHash: crypto.randomUUID(),
      createdAt: Date.now(),
    })
    .run();
  return db.select().from(libraryGames).where(eq(libraryGames.id, id)).get()!;
}

describe("loadLibraryGameForUser", () => {
  it("copies the library game into the user's own games and moves tables", () => {
    const userId = seedUser();
    const libraryGame = seedLibraryGame("e4 e5 Nf3 Nc6 Bc4");

    const { gameId, analysisId } = loadLibraryGameForUser(libraryGame, userId);

    const gameRow = db.select().from(games).where(eq(games.id, gameId)).get();
    expect(gameRow).toBeDefined();
    expect(gameRow!.userId).toBe(userId);
    expect(gameRow!.white).toBe("Historic White");
    expect(gameRow!.playerColor).toBeNull(); // honest: we don't know which side "you" are in a historical game
    expect(gameRow!.plyCount).toBe(5);
    expect(analysisId).toBeTruthy();

    const moveRows = db.select().from(moves).where(eq(moves.gameId, gameId)).all().sort((a, b) => a.ply - b.ply);
    expect(moveRows).toHaveLength(5);
    expect(moveRows[0].san).toBe("e4");
    expect(moveRows[0].color).toBe("white");
    expect(moveRows[1].color).toBe("black");
    // Moves must chain: each move's fenBefore is the previous move's fenAfter.
    for (let i = 1; i < moveRows.length; i += 1) {
      expect(moveRows[i].fenBefore).toBe(moveRows[i - 1].fenAfter);
    }
  });

  it("preserves the library game's own metadata (result, ECO, opening) on the copy", () => {
    const userId = seedUser();
    const libraryGame = seedLibraryGame("d4 d5 c4", "1/2-1/2");

    const { gameId } = loadLibraryGameForUser(libraryGame, userId);
    const gameRow = db.select().from(games).where(eq(games.id, gameId)).get()!;

    expect(gameRow.result).toBe("1/2-1/2");
    expect(gameRow.openingEco).toBe("C50");
    expect(gameRow.openingName).toBe("Italian Game");
    expect(gameRow.importBatchId).toBe(`library:${libraryGame.id}`);
  });

  it("throws on a library game with an illegal move rather than silently truncating it", () => {
    const userId = seedUser();
    const libraryGame = seedLibraryGame("e4 e5 Nf3 NOTAMOVE");
    expect(() => loadLibraryGameForUser(libraryGame, userId)).toThrow();
  });

  it("throws on a library game with no moves", () => {
    const userId = seedUser();
    const libraryGame = seedLibraryGame("");
    expect(() => loadLibraryGameForUser(libraryGame, userId)).toThrow();
  });
});
