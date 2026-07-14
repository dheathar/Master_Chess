import { Router } from "express";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../db/client";
import { games, libraryGames, libraryPositions, moves } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { loadLibraryGameForUser } from "../library/loadIntoAccount";
import { normalizeFenKey } from "../engine/evalCache";
import { dailyLimitFor, quotaRemaining, tryConsumeQuota } from "../auth/usageQuota";
import type { ExplorerMoveStat, ExplorerResponse, LibraryGameSummary, LoadLibraryGameResponse } from "@shared/api";

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

libraryRouter.get("/games", requireAuth, (_req, res) => {
  const rows = db.select().from(libraryGames).all();
  res.json({ games: rows.map(toSummary) });
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
