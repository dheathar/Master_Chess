import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { db, rawSqlite } from "../db/client";
import { libraryGames } from "../db/schema";
import { queryLibraryGames } from "./library";
import { libraryGamesQuerySchema, type LibrarySource } from "@shared/api";

function seed(overrides: Partial<typeof libraryGames.$inferInsert> & { white: string; black: string }) {
  const id = crypto.randomUUID();
  db.insert(libraryGames)
    .values({
      id,
      white: overrides.white,
      black: overrides.black,
      whiteElo: overrides.whiteElo ?? null,
      blackElo: overrides.blackElo ?? null,
      result: overrides.result ?? "1-0",
      eco: overrides.eco ?? null,
      opening: overrides.opening ?? null,
      event: overrides.event ?? null,
      playedAt: overrides.playedAt ?? null,
      source: (overrides.source ?? "classic") as LibrarySource,
      sanMoves: overrides.sanMoves ?? "e4 e5",
      plyCount: overrides.plyCount ?? 2,
      dedupeHash: crypto.randomUUID(),
      createdAt: Date.now(),
    })
    .run();
  return id;
}

const q = (partial: Record<string, unknown>) => queryLibraryGames(libraryGamesQuerySchema.parse(partial));

describe("queryLibraryGames", () => {
  beforeEach(() => {
    rawSqlite.exec("DELETE FROM library_games;");
    seed({ white: "Paul Morphy", black: "Duke Karl", eco: "C41", result: "1-0", opening: "Philidor Defense", event: "Opera", playedAt: "1858.01.01", plyCount: 33 });
    seed({ white: "Garry Kasparov", black: "Veselin Topalov", eco: "B07", result: "1-0", opening: "Pirc Defense", event: "Wijk aan Zee", playedAt: "1999.01.20", plyCount: 87 });
    seed({ white: "Jose Capablanca", black: "Frank Marshall", eco: "C89", result: "1-0", opening: "Ruy Lopez", event: "New York", playedAt: "1918.10.23", plyCount: 71 });
    seed({ white: "Mikhail Tal", black: "Bobby Fischer", eco: "B77", result: "0-1", opening: "Sicilian Dragon", event: "Candidates", playedAt: "1959.09.09", plyCount: 52 });
  });
  afterEach(() => {
    rawSqlite.exec("DELETE FROM library_games;");
  });

  it("returns all games with a total when unfiltered", () => {
    const res = q({});
    expect(res.total).toBe(4);
    expect(res.games).toHaveLength(4);
    expect(res.page).toBe(1);
  });

  it("searches across players, opening, and event (case-insensitive)", () => {
    expect(q({ search: "morphy" }).total).toBe(1);
    expect(q({ search: "fischer" }).total).toBe(1); // matches the black player
    expect(q({ search: "sicilian" }).total).toBe(1); // matches opening
    expect(q({ search: "new york" }).total).toBe(1); // matches event
    expect(q({ search: "nobody" }).total).toBe(0);
  });

  it("filters by ECO prefix, result, and source", () => {
    expect(q({ eco: "C" }).total).toBe(2); // C41 + C89
    expect(q({ eco: "c41" }).total).toBe(1); // case-normalized
    expect(q({ result: "0-1" }).total).toBe(1);
    expect(q({ source: "classic" }).total).toBe(4);
    expect(q({ source: "lichess" }).total).toBe(0);
  });

  it("combines filters with AND", () => {
    expect(q({ search: "kasparov", result: "1-0" }).total).toBe(1);
    expect(q({ search: "kasparov", result: "0-1" }).total).toBe(0);
  });

  it("sorts by the requested key", () => {
    expect(q({ sort: "date_asc" }).games[0].white).toBe("Paul Morphy"); // 1858
    expect(q({ sort: "date_desc" }).games[0].white).toBe("Garry Kasparov"); // 1999
    expect(q({ sort: "plies_desc" }).games[0].plyCount).toBe(87);
    expect(q({ sort: "plies_asc" }).games[0].plyCount).toBe(33);
    expect(q({ sort: "white_asc" }).games[0].white).toBe("Garry Kasparov");
  });

  it("paginates with a stable total", () => {
    const p1 = q({ pageSize: 2, page: 1, sort: "date_asc" });
    const p2 = q({ pageSize: 2, page: 2, sort: "date_asc" });
    expect(p1.total).toBe(4);
    expect(p1.games).toHaveLength(2);
    expect(p2.games).toHaveLength(2);
    // No overlap between pages.
    const ids = new Set([...p1.games, ...p2.games].map((g) => g.id));
    expect(ids.size).toBe(4);
  });
});
