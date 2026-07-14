import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db/client";
import { libraryGames, libraryPositions } from "../db/schema";
import { importLibraryPgn } from "./importer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  migrate(db, { migrationsFolder: path.join(__dirname, "../db/migrations") });
});

// Library games are deduped by a content hash (players + date + result +
// movetext), and tests share the real dev database across runs (no
// per-test reset) — so every fixture must carry a unique nonce, or a test
// re-run collides with its own prior run's data.
function uniqueGamePgn(tag: string, white: string, black: string, result: string, moves: string): string {
  const nonce = crypto.randomUUID();
  return `[Event "Test ${tag} ${nonce}"]\n[White "${white} ${nonce}"]\n[Black "${black} ${nonce}"]\n[Date "2020.01.01"]\n[Result "${result}"]\n\n${moves} ${result}`;
}

describe("importLibraryPgn", () => {
  it("imports each distinct game exactly once", () => {
    const gameA = uniqueGamePgn("A", "Alice", "Bob", "1-0", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const gameB = uniqueGamePgn("B", "Carol", "Dave", "0-1", "1. d4 d5 2. c4 c6");
    const result = importLibraryPgn(`${gameA}\n\n${gameB}`, "upload");
    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.rejected).toHaveLength(0);
  });

  it("detects a re-import as a duplicate rather than inserting again", () => {
    const game = uniqueGamePgn("Dup", "Alice", "Bob", "1-0", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const whiteName = game.match(/\[White "([^"]+)"\]/)![1];

    const first = importLibraryPgn(game, "upload");
    const rowCountAfterFirst = db.select().from(libraryGames).where(eq(libraryGames.white, whiteName)).all().length;
    const second = importLibraryPgn(game, "upload");
    const rowCountAfterSecond = db.select().from(libraryGames).where(eq(libraryGames.white, whiteName)).all().length;

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(rowCountAfterSecond).toBe(rowCountAfterFirst);
  });

  it("isolates a malformed game without failing the rest of the batch", () => {
    const good = uniqueGamePgn("Good", "Alice", "Bob", "1-0", "1. e4 e5 2. Nf3 Nc6 3. Bb5");
    const malformed = `[Event "Broken ${crypto.randomUUID()}"]\n[White "X"]\n[Black "Y"]\n\n1. e4 e5 2. NOTAMOVE $$$ *`;
    const result = importLibraryPgn(`${good}\n\n${malformed}`, "upload");
    expect(result.imported).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
  });

  it("aggregates the opening tree so a repeated first move accumulates total and result counts", () => {
    const gameA = uniqueGamePgn("TreeA", "Alice", "Bob", "1-0", "1. e4 e5 2. Nf3");
    const gameB = uniqueGamePgn("TreeB", "Carol", "Dave", "0-1", "1. e4 c5 2. Nf3");

    const before = db
      .select()
      .from(libraryPositions)
      .where(eq(libraryPositions.fenKey, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"))
      .all()
      .find((r) => r.san === "e4");
    const totalBefore = before?.total ?? 0;
    const whiteWinsBefore = before?.whiteWins ?? 0;
    const blackWinsBefore = before?.blackWins ?? 0;

    importLibraryPgn(gameA, "upload"); // 1-0, opens 1.e4
    importLibraryPgn(gameB, "upload"); // 0-1, also opens 1.e4

    const after = db
      .select()
      .from(libraryPositions)
      .where(eq(libraryPositions.fenKey, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"))
      .all()
      .find((r) => r.san === "e4")!;

    expect(after.total).toBe(totalBefore + 2);
    expect(after.whiteWins).toBe(whiteWinsBefore + 1);
    expect(after.blackWins).toBe(blackWinsBefore + 1);
  });

  it("rejects a syntactically valid but move-free game", () => {
    const empty = `[Event "Empty ${crypto.randomUUID()}"]\n[White "X"]\n[Black "Y"]\n\n*`;
    const result = importLibraryPgn(empty, "upload");
    expect(result.imported).toBe(0);
    expect(result.rejected).toHaveLength(1);
  });
});
