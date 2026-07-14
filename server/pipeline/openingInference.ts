import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "../db/client";
import { games, libraryPositions } from "../db/schema";
import { normalizeFenKey } from "../engine/evalCache";
import type { EvidenceEntry } from "@shared/evidence";
import type { ClassifiedMove } from "./classifier";

/**
 * Opening-taxonomy evidence that needs cross-game or master-library context
 * — kept separate from skillInference.ts (which is single-game-pure) so
 * that module stays trivially fixture-testable. The pure logic here is also
 * exported standalone for the same reason; only the DB-fetching wrapper
 * needs a live database.
 */

const ECO_PREFIX_LEN = 3;
const MIN_GAMES_FOR_REPERTOIRE = 3;
const MAX_OPENING_CPLOSS_FOR_REPERTOIRE_CREDIT = 50;
const NOVELTY_MIN_PLY = 8;
const NOVELTY_MAX_PLY = 20;

export function ecoPrefix(eco: string | null): string | null {
  if (!eco) return null;
  return eco.slice(0, ECO_PREFIX_LEN);
}

export interface GameOpeningRecord {
  eco: string | null;
  openingAvgCpLoss: number | null;
}

/**
 * Pure: does the current game's opening match a recurring line among the
 * player's past games (same color), played competently? Fires "for" only —
 * playing varied openings isn't a flaw, so there is no honest "against"
 * case here.
 */
export function computeRepertoireEvidence(
  currentEco: string | null,
  currentOpeningAvgCpLoss: number | null,
  history: GameOpeningRecord[],
  anchorMoveIndex: number,
): EvidenceEntry[] {
  const prefix = ecoPrefix(currentEco);
  if (!prefix || currentOpeningAvgCpLoss === null) return [];
  if (currentOpeningAvgCpLoss > MAX_OPENING_CPLOSS_FOR_REPERTOIRE_CREDIT) return [];

  const matches = history.filter((record) => ecoPrefix(record.eco) === prefix).length;
  const totalWithCurrent = matches + 1;
  if (totalWithCurrent < MIN_GAMES_FOR_REPERTOIRE) return [];

  return [
    {
      skillId: "opening_repertoire",
      direction: "for",
      weight: 0.4,
      ruleId: "consistent-repertoire",
      note: `Played the ${prefix} line for the ${totalWithCurrent}${totalWithCurrent === 3 ? "rd" : "th"} time across analyzed games with low opening cp-loss — a repeated, well-handled system.`,
      moveIndex: anchorMoveIndex,
    },
  ];
}

const MIN_BOOK_GAMES = 5; // a move must be seen in ≥5 games to count as "known theory"
const MIN_BOOK_POSITIONS = 122; // the opening repertoire must contain ≥this many positions to claim solid "known" status

/**
 * Pure: did the player leave known book with a sound, engine-approved move at
 * a reasonable depth? Only the player's own moves (not opponent moves) count as
 * deviations. A position must be in the book and the book itself must be broad
 * enough (122+ positions) and deep enough (each move in ≥5 games) to claim
 * "known theory" — else early-game variance is over-claimed. Deviating badly is
 * already covered by ordinary opening/tactical rules; this only fires "for" a
 * genuine, sound novelty (best/good by engine).
 */
export function computeNoveltyEvidence(
  moves: ClassifiedMove[],
  bookMoves: Map<string, Array<{ uci: string; freq: number }>>,
  playerColor: "white" | "black",
): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];
  const bookBreadth = bookMoves.size;
  if (bookBreadth < MIN_BOOK_POSITIONS) return []; // book too narrow to claim mastery

  moves.forEach((move, index) => {
    if (move.color !== playerColor) return; // only the player's own moves are deviations
    if (move.ply < NOVELTY_MIN_PLY || move.ply > NOVELTY_MAX_PLY) return;
    if (move.classification !== "best" && move.classification !== "good") return;
    const key = normalizeFenKey(move.fenBefore);
    const bookLine = bookMoves.get(key);
    if (!bookLine || bookLine.length === 0) return; // position isn't in our book — can't judge deviation
    // Only trust moves that appear in ≥MIN_BOOK_GAMES games.
    const maxFreq = Math.max(...bookLine.map((entry) => entry.freq));
    if (maxFreq < MIN_BOOK_GAMES) return; // too rare to claim "known theory"
    if (bookLine.some((entry) => entry.uci === move.uci)) return; // followed a book move — not a novelty
    out.push({
      skillId: "opening_preparation_novelties",
      direction: "for",
      weight: 0.3,
      ruleId: "sound-novelty",
      note: `${move.san} left known theory at move ${Math.ceil(move.ply / 2)} with an engine-approved move — a prepared deviation, not a mistake.`,
      moveIndex: index,
    });
  });
  return out;
}

/** DB-fetching wrapper: gathers cross-game context then delegates to the pure functions above. */
export function inferOpeningEvidence(
  userId: string,
  currentGameId: string,
  moves: ClassifiedMove[],
  context: { playerColor: "white" | "black"; currentEco: string | null },
): EvidenceEntry[] {
  const priorGames = db
    .select({ id: games.id, eco: games.openingEco, playerColor: games.playerColor })
    .from(games)
    .where(and(eq(games.userId, userId), eq(games.playerColor, context.playerColor), ne(games.id, currentGameId), isNotNull(games.openingEco)))
    .orderBy(desc(games.createdAt))
    .limit(30)
    .all();

  // We don't have a stored per-game "opening avg cp-loss" column, so use the
  // current game's own opening cp-loss as the competence gate and treat
  // history purely as an ECO-prefix frequency count.
  const history: GameOpeningRecord[] = priorGames.map((row) => ({ eco: row.eco, openingAvgCpLoss: 0 }));

  const ownOpeningMoves = moves.filter((move) => move.color === context.playerColor && move.phase === "opening" && move.cpLoss !== null);
  const openingAvgCpLoss =
    ownOpeningMoves.length > 0 ? ownOpeningMoves.reduce((sum, move) => sum + move.cpLoss!, 0) / ownOpeningMoves.length : null;

  const repertoireEvidence = computeRepertoireEvidence(context.currentEco, openingAvgCpLoss, history, 0);

  const bookMoves = new Map<string, Array<{ uci: string; freq: number }>>();
  const relevantMoves = moves.filter((move) => move.ply <= NOVELTY_MAX_PLY);
  for (const move of relevantMoves) {
    const key = normalizeFenKey(move.fenBefore);
    if (bookMoves.has(key)) continue;
    const rows = db.select({ uci: libraryPositions.uci, total: libraryPositions.total }).from(libraryPositions).where(eq(libraryPositions.fenKey, key)).all();
    bookMoves.set(
      key,
      rows.map((row) => ({ uci: row.uci, freq: row.total })),
    );
  }
  const noveltyEvidence = computeNoveltyEvidence(moves, bookMoves, context.playerColor);

  return [...repertoireEvidence, ...noveltyEvidence];
}
