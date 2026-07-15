import { Chess } from "chess.js";

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/**
 * Builds three graded, Socratic hints for a position, derived ENTIRELY from a
 * given engine move applied to the real board (chess.js) — never from model
 * guesswork, so a hint can't be wrong. Level 1 is a pure nudge with no
 * specifics; level 2 names the piece and the idea (capture / check / castle /
 * quiet); level 3 reveals the move. Shared by Drills and Play vs AI.
 */
export function buildMoveHints(fen: string, uci: string): string[] {
  const generic1 =
    "Before you move, check every forcing option — checks, captures, and threats. " +
    "Which of your pieces can do the most work right now?";
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as "q" | "r" | "b" | "n" | undefined,
    });
    if (!move) return [generic1, generic1, generic1];
    const piece = PIECE_NAMES[move.piece] ?? "piece";
    const isCapture = move.flags.includes("c") || move.flags.includes("e");
    const isCheck = move.san.includes("+") || move.san.includes("#");
    const isCastle = move.flags.includes("k") || move.flags.includes("q");

    let level2: string;
    if (isCastle) {
      level2 = "The key move isn't about a single piece — your king's safety is the priority here. What does castling do for you?";
    } else if (isCheck) {
      level2 = `A ${piece} move here gives check and seizes the initiative. Which forcing line does that open up?`;
    } else if (isCapture) {
      const captured = move.captured ? PIECE_NAMES[move.captured] ?? "a piece" : "material";
      level2 = `Look for a ${piece} move that wins material — there's ${captured === "material" ? "material" : `a ${captured}`} to take. Do you see it?`;
    } else {
      level2 = `The idea is a quiet ${piece} move that improves your position, not a capture. Where does your ${piece} most want to go?`;
    }
    const level3 = `The move is ${move.san} — your ${piece} from ${move.from} to ${move.to}.`;
    return [generic1, level2, level3];
  } catch {
    return [generic1, generic1, generic1];
  }
}

export const MAX_HINT_LEVEL = 3;
