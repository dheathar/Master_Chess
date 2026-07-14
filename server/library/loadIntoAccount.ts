import crypto from "node:crypto";
import { Chess } from "chess.js";
import { rawSqlite } from "../db/client";
import { db } from "../db/client";
import { games, moves } from "../db/schema";
import { createAnalysisRecord, enqueueAnalysis } from "../pipeline/analysisQueue";
import type { libraryGames } from "../db/schema";

const ENGINE_DEPTH = Number(process.env.ENGINE_DEPTH ?? 16);

/**
 * Copies a catalog library game into the requesting user's own games/moves
 * tables and queues it for full Stockfish analysis — the review experience
 * is then byte-for-byte identical to an uploaded game (same route, same UI).
 * `playerColor` is left null: for a historical game we have no honest basis
 * for which side "you" identify with, so it's excluded from skill inference
 * (which requires a known player color) rather than guessed.
 */
export function loadLibraryGameForUser(
  libraryGame: typeof libraryGames.$inferSelect,
  userId: string,
): { gameId: string; analysisId: string } {
  const chess = new Chess();
  const sanList = libraryGame.sanMoves.split(" ").filter(Boolean);

  const moveRows: Array<{
    ply: number;
    san: string;
    uci: string;
    fenBefore: string;
    fenAfter: string;
    color: "white" | "black";
  }> = [];

  sanList.forEach((san, index) => {
    const fenBefore = chess.fen();
    const move = chess.move(san);
    if (!move) {
      throw new Error(`Library game ${libraryGame.id} has an illegal move at ply ${index + 1}: ${san}`);
    }
    moveRows.push({
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fenBefore,
      fenAfter: chess.fen(),
      color: move.color === "w" ? "white" : "black",
    });
  });

  if (moveRows.length === 0) {
    throw new Error(`Library game ${libraryGame.id} has no moves.`);
  }

  const gameId = crypto.randomUUID();
  let analysisId = "";

  const run = rawSqlite.transaction(() => {
    db.insert(games)
      .values({
        id: gameId,
        userId,
        source: "manual",
        pgnRaw: libraryGame.sanMoves,
        white: libraryGame.white,
        black: libraryGame.black,
        whiteElo: libraryGame.whiteElo,
        blackElo: libraryGame.blackElo,
        playerColor: null,
        result: libraryGame.result,
        timeControl: null,
        playedAt: libraryGame.playedAt,
        openingEco: libraryGame.eco,
        openingName: libraryGame.opening,
        plyCount: moveRows.length,
        importBatchId: `library:${libraryGame.id}`,
        createdAt: Date.now(),
      })
      .run();

    for (const move of moveRows) {
      db.insert(moves)
        .values({
          id: crypto.randomUUID(),
          gameId,
          ply: move.ply,
          san: move.san,
          uci: move.uci,
          fenBefore: move.fenBefore,
          fenAfter: move.fenAfter,
          color: move.color,
          clockMs: null,
          moveTimeMs: null,
        })
        .run();
    }

    analysisId = createAnalysisRecord(gameId, userId, ENGINE_DEPTH);
  });
  run();

  enqueueAnalysis(analysisId);
  return { gameId, analysisId };
}
