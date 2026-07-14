import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { eq } from "drizzle-orm";
import { db, rawSqlite } from "../db/client";
import { libraryGames } from "../db/schema";
import { splitPgnGames } from "../pipeline/pgnIngest";
import { normalizeFenKey } from "../engine/evalCache";

export type LibrarySource = "classic" | "twic" | "lichess" | "upload";

/** Plies of each game indexed into the opening tree (12 full moves). */
const OPENING_TREE_PLIES = 24;

export interface LibraryImportResult {
  imported: number;
  duplicates: number;
  rejected: Array<{ index: number; reason: string }>;
}

interface ParsedLibraryGame {
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: string;
  eco: string | null;
  opening: string | null;
  event: string | null;
  playedAt: string | null;
  sanMoves: string[];
  /** fenBefore + san + uci per ply, for the opening tree. */
  treeRows: Array<{ fenKey: string; san: string; uci: string }>;
}

function parseLibraryGame(pgnText: string): ParsedLibraryGame {
  const chess = new Chess();
  chess.loadPgn(pgnText, { strict: false });
  const headers = chess.getHeaders() as Record<string, string>;
  const history = chess.history({ verbose: true });
  if (history.length === 0) {
    throw new Error("Game contains no legal moves.");
  }

  const treeRows = history.slice(0, OPENING_TREE_PLIES).map((move) => ({
    fenKey: normalizeFenKey(move.before),
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
  }));

  return {
    white: headers.White ?? "Unknown",
    black: headers.Black ?? "Unknown",
    whiteElo: headers.WhiteElo ? Number(headers.WhiteElo) || null : null,
    blackElo: headers.BlackElo ? Number(headers.BlackElo) || null : null,
    result: headers.Result ?? "*",
    eco: headers.ECO ?? null,
    opening: headers.Opening ?? null,
    event: headers.Event ?? null,
    playedAt: headers.UTCDate ?? headers.Date ?? null,
    sanMoves: history.map((move) => move.san),
    treeRows,
  };
}

function dedupeHashFor(game: ParsedLibraryGame): string {
  return crypto
    .createHash("sha256")
    .update(`${game.white}|${game.black}|${game.playedAt}|${game.result}|${game.sanMoves.join(" ")}`)
    .digest("base64url");
}

const upsertPositionStmt = () =>
  rawSqlite.prepare(
    `INSERT INTO library_positions (fen_key, san, uci, white_wins, draws, black_wins, total, sample_game_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(fen_key, san) DO UPDATE SET
       white_wins = white_wins + excluded.white_wins,
       draws = draws + excluded.draws,
       black_wins = black_wins + excluded.black_wins,
       total = total + 1`,
  );

/**
 * Imports a (possibly multi-game) PGN blob into the master-game library.
 * Duplicates (same players/date/movetext) are counted and skipped; malformed
 * games are reported per-game without failing the batch. The opening tree is
 * aggregated in the same transaction.
 */
export function importLibraryPgn(raw: string, source: LibrarySource): LibraryImportResult {
  const chunks = splitPgnGames(raw);
  const result: LibraryImportResult = { imported: 0, duplicates: 0, rejected: [] };
  const upsertPosition = upsertPositionStmt();

  const runBatch = rawSqlite.transaction(() => {
    chunks.forEach((chunk, index) => {
      let parsed: ParsedLibraryGame;
      try {
        parsed = parseLibraryGame(chunk);
      } catch (error) {
        result.rejected.push({ index, reason: error instanceof Error ? error.message : "Parse error." });
        return;
      }

      const hash = dedupeHashFor(parsed);
      const existing = db.select({ id: libraryGames.id }).from(libraryGames).where(eq(libraryGames.dedupeHash, hash)).get();
      if (existing) {
        result.duplicates += 1;
        return;
      }

      const gameId = crypto.randomUUID();
      db.insert(libraryGames)
        .values({
          id: gameId,
          white: parsed.white,
          black: parsed.black,
          whiteElo: parsed.whiteElo,
          blackElo: parsed.blackElo,
          result: parsed.result,
          eco: parsed.eco,
          opening: parsed.opening,
          event: parsed.event,
          playedAt: parsed.playedAt,
          source,
          sanMoves: parsed.sanMoves.join(" "),
          plyCount: parsed.sanMoves.length,
          dedupeHash: hash,
          createdAt: Date.now(),
        })
        .run();

      const whiteWin = parsed.result === "1-0" ? 1 : 0;
      const draw = parsed.result === "1/2-1/2" || parsed.result === "½-½" ? 1 : 0;
      const blackWin = parsed.result === "0-1" ? 1 : 0;
      for (const row of parsed.treeRows) {
        upsertPosition.run(row.fenKey, row.san, row.uci, whiteWin, draw, blackWin, gameId);
      }

      result.imported += 1;
    });
  });

  runBatch();
  return result;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Seeds the library with the 5 validated classic games on first boot. */
export function ensureLibrarySeeded(): void {
  const existing = db.select({ id: libraryGames.id }).from(libraryGames).limit(1).get();
  if (existing) return;
  const seedPath = path.join(__dirname, "seed", "classics.pgn");
  if (!fs.existsSync(seedPath)) return;
  const raw = fs.readFileSync(seedPath, "utf8");
  const result = importLibraryPgn(raw, "classic");
  console.log(`[library] Seeded ${result.imported} classic games (${result.rejected.length} rejected).`);
}
