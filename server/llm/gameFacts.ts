import { levelForRating, PLAYER_LEVEL_DEFINITIONS } from "@shared/taxonomy";
import type { ClassifiedMove } from "../pipeline/classifier";

/** Human level name from a rating (e.g. 1400 → "Casual club player"), or null if unrated. */
function levelNameForRating(rating: number | null): string | null {
  if (rating === null) return null;
  return PLAYER_LEVEL_DEFINITIONS.find((l) => l.id === levelForRating(rating))?.name ?? null;
}

/** A mate transition is encoded as a ~100 000-magnitude cp value, not a real centipawn quantity. */
const MATE_MAGNITUDE_CP = 30_000;

function isMateEvent(move: ClassifiedMove): boolean {
  return move.missedMate || (move.cpLoss !== null && Math.abs(move.cpLoss) >= MATE_MAGNITUDE_CP);
}

/**
 * PGN header values are attacker-controlled and flow into the LLM prompt, so
 * the opening name is whitelist-validated before it can reach the model: a
 * real opening name is short and made of letters/digits/basic punctuation.
 * Anything else (angle brackets, colons, injected directives, over-length
 * text) is dropped entirely rather than sanitized in place.
 */
export function sanitizeOpeningName(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return null;
  if (!/^[A-Za-z0-9 ,.'()\-/]+$/.test(trimmed)) return null;
  return trimmed;
}

export type PlayerOutcome = "win" | "loss" | "draw" | "unknown";

/** The game result from the player's own perspective, for outcome-anchoring the narrative. */
export function playerOutcome(result: string | null, playerColor: "white" | "black"): PlayerOutcome {
  if (result === "1-0") return playerColor === "white" ? "win" : "loss";
  if (result === "0-1") return playerColor === "black" ? "win" : "loss";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

export interface GameFacts {
  playerColor: "white" | "black";
  /** The player's level name (from their PGN rating), for calibrating the coaching voice. Null if unrated. */
  levelName: string | null;
  result: string | null;
  /** The result from the player's perspective — the guard rejects narratives that contradict it. */
  outcome: PlayerOutcome;
  openingName: string | null;
  /** Player's own-color accuracy, if computable. */
  accuracy: number | null;
  blunderCount: number;
  mistakeCount: number;
  /**
   * The player's biggest own-move error. `cpLoss` is null for a mate event
   * (giving up or walking into a forced mate), where the encoded ~100 000cp
   * value is not a real number to quote — `isMateEvent` says so instead.
   */
  worstMove: { san: string; moveNumber: number; cpLoss: number | null; isMateEvent: boolean } | null;
  /** Every SAN actually played in the game — the ground truth the claim guard checks move mentions against. */
  allSan: string[];
  /** The player's own moves (for side-attribution: "your move X" must be one of these). */
  ownSan: string[];
  /** The opponent's moves (a move here but not in ownSan may not be attributed to the player). */
  opponentSan: string[];
  /** Every recorded *real* cp-loss value (mate-magnitude encodings excluded) — the ground truth for the guard's numeric claims. */
  cpLossValues: number[];
}

export function buildGameFacts(
  moves: ClassifiedMove[],
  input: { playerColor: "white" | "black"; result: string | null; openingName: string | null; accuracy: number | null; playerRating?: number | null },
): GameFacts {
  const ownMoves = moves.filter((move) => move.color === input.playerColor);
  const opponentMoves = moves.filter((move) => move.color !== input.playerColor);

  const blunderCount = ownMoves.filter((move) => move.classification === "blunder").length;
  const mistakeCount = ownMoves.filter((move) => move.classification === "mistake").length;

  const worst = ownMoves.reduce<ClassifiedMove | null>((acc, move) => {
    if (move.cpLoss === null) return acc;
    if (!acc || acc.cpLoss === null || move.cpLoss > acc.cpLoss) return move;
    return acc;
  }, null);

  return {
    playerColor: input.playerColor,
    levelName: levelNameForRating(input.playerRating ?? null),
    result: input.result,
    outcome: playerOutcome(input.result, input.playerColor),
    openingName: sanitizeOpeningName(input.openingName),
    accuracy: input.accuracy,
    blunderCount,
    mistakeCount,
    worstMove:
      worst && worst.cpLoss !== null
        ? {
            san: worst.san,
            moveNumber: Math.ceil(worst.ply / 2),
            cpLoss: isMateEvent(worst) ? null : worst.cpLoss,
            isMateEvent: isMateEvent(worst),
          }
        : null,
    allSan: moves.map((move) => move.san),
    ownSan: ownMoves.map((move) => move.san),
    opponentSan: opponentMoves.map((move) => move.san),
    cpLossValues: moves
      .filter((move) => !isMateEvent(move))
      .map((move) => move.cpLoss)
      .filter((value): value is number => value !== null),
  };
}
