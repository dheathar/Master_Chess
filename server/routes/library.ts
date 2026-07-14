import { Router } from "express";
import { and, asc, count, desc, eq, gte, like, lt, or, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { games, libraryGames, libraryPositions, moves } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { loadLibraryGameForUser } from "../library/loadIntoAccount";
import { normalizeFenKey } from "../engine/evalCache";
import { dailyLimitFor, quotaRemaining, tryConsumeQuota } from "../auth/usageQuota";
import { libraryGamesQuerySchema } from "@shared/api";
import type { ExplorerMoveStat, ExplorerResponse, LibraryGameSummary, LibraryGamesQuery, LibraryGamesResponse, LoadLibraryGameResponse } from "@shared/api";

export const libraryRouter = Router();

function toSummary(row: typeof libraryGames.$inferSelect): LibraryGameSummary {
  return {
    id: row.id,
    white: row.white,
    black: row.black,
    whiteElo: row.whiteElo,
    blackElo: row.blackElo,
    result: row.result,
    eco: row.eco,
    opening: row.opening,
    event: row.event,
    playedAt: row.playedAt,
    plyCount: row.plyCount,
    source: row.source,
  };
}

const SORT_COLUMNS = {
  date_desc: desc(libraryGames.playedAt),
  date_asc: asc(libraryGames.playedAt),
  white_asc: asc(libraryGames.white),
  black_asc: asc(libraryGames.black),
  plies_desc: desc(libraryGames.plyCount),
  plies_asc: asc(libraryGames.plyCount),
} as const;

/**
 * Library browser query: search across players/opening/event, filter by ECO
 * prefix, result and source, sort, and paginate. Pure DB logic, exported so it
 * can be unit-tested without an HTTP layer.
 */
export function queryLibraryGames(params: LibraryGamesQuery): LibraryGamesResponse {
  const { search, eco, result, source, sort, page, pageSize } = params;

  const filters: SQL[] = [];
  if (search) {
    const term = `%${search}%`;
    // SQLite LIKE is case-insensitive for ASCII, which suits player/opening text.
    filters.push(
      or(
        like(libraryGames.white, term),
        like(libraryGames.black, term),
        like(libraryGames.opening, term),
        like(libraryGames.event, term),
      )!,
    );
  }
  if (eco) filters.push(like(libraryGames.eco, `${eco.toUpperCase()}%`));
  if (result) filters.push(eq(libraryGames.result, result));
  if (source) filters.push(eq(libraryGames.source, source));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const totalRow = db.select({ value: count() }).from(libraryGames).where(where).get();
  const total = totalRow?.value ?? 0;

  const rows = db
    .select()
    .from(libraryGames)
    .where(where)
    // Secondary sort by id keeps pagination deterministic when the primary key ties.
    .orderBy(SORT_COLUMNS[sort], asc(libraryGames.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return { games: rows.map(toSummary), total, page, pageSize };
}

/**
 * Library browser endpoint. Parameters are optional and validated; unknown
 * values fall back to defaults so a stray query string degrades gracefully.
 */
libraryRouter.get("/games", requireAuth, (req, res) => {
  const parsed = libraryGamesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid library query." });
    return;
  }
  res.json(queryLibraryGames(parsed.data));
});

/**
 * Loads a catalog game into the requesting user's own account for full
 * Stockfish analysis — charges one daily quota analysis.
 */
libraryRouter.post("/games/:id/load", requireAuth, (req, res) => {
  const user = req.user!;
  const limit = dailyLimitFor(user.tier);

  // Check quota before loading (dedupe by importBatchId skips re-analysis of already-loaded games).
  if (!tryConsumeQuota(user.id, limit, 1)) {
    const remaining = quotaRemaining(user.id, user.tier) ?? 0;
    res.status(429).json({
      error: `Daily analysis limit reached (${limit}/day on the ${user.tier} tier). ${remaining} analyses remaining today.`,
    });
    return;
  }

  const row = db.select().from(libraryGames).where(eq(libraryGames.id, req.params.id)).get();
  if (!row) {
    res.status(404).json({ error: "Library game not found." });
    return;
  }
  try {
    const { gameId, analysisId } = loadLibraryGameForUser(row, user.id);
    const response: LoadLibraryGameResponse = { gameId, analysisId };
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load library game." });
  }
});

/**
 * Opening explorer: for a given position, shows what the local master-game
 * library played there ("master") alongside what the requesting user has
 * played there in their own analyzed games ("personal") — the repertoire-
 * leak comparison. Personal moves are matched by an indexed range scan over
 * the normalized FEN prefix (see moves_fen_before_idx) rather than a SQL
 * LIKE, since SQLite's LIKE is ASCII case-insensitive by default and FEN
 * case distinguishes White from Black pieces.
 */
libraryRouter.get("/explorer", requireAuth, (req, res) => {
  const fen = req.query.fen;
  if (typeof fen !== "string" || fen.trim().length === 0) {
    res.status(400).json({ error: "Query parameter 'fen' is required." });
    return;
  }
  const key = normalizeFenKey(fen);

  const masterRows = db.select().from(libraryPositions).where(eq(libraryPositions.fenKey, key)).all();
  const master: ExplorerMoveStat[] = masterRows
    .map((row) => ({
      san: row.san,
      uci: row.uci,
      total: row.total,
      whiteWins: row.whiteWins,
      draws: row.draws,
      blackWins: row.blackWins,
      sampleGameId: row.sampleGameId,
    }))
    .sort((a, b) => b.total - a.total);

  const lowerBound = `${key} `;
  const upperBound = `${key}!`;
  const personalRows = db
    .select({ san: moves.san, uci: moves.uci, result: games.result })
    .from(moves)
    .innerJoin(games, eq(moves.gameId, games.id))
    .where(and(eq(games.userId, req.user!.id), gte(moves.fenBefore, lowerBound), lt(moves.fenBefore, upperBound)))
    .all();

  const personalByMove = new Map<string, ExplorerMoveStat>();
  for (const row of personalRows) {
    const key2 = `${row.san}|${row.uci}`;
    if (!personalByMove.has(key2)) {
      personalByMove.set(key2, { san: row.san, uci: row.uci, total: 0, whiteWins: 0, draws: 0, blackWins: 0, sampleGameId: null });
    }
    const stat = personalByMove.get(key2)!;
    stat.total += 1;
    if (row.result === "1-0") stat.whiteWins += 1;
    else if (row.result === "0-1") stat.blackWins += 1;
    else if (row.result === "1/2-1/2" || row.result === "½-½") stat.draws += 1;
  }
  const personal = [...personalByMove.values()].sort((a, b) => b.total - a.total);

  const response: ExplorerResponse = { fen, master, personal };
  res.json(response);
});
