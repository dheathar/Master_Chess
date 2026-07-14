import { Chess } from "chess.js";
import {
  classifyMove,
  cpLossForClassification,
  detectPhase,
  accuracyFromWinPctLosses,
  winPctLossForMove,
} from "@shared/classification";
import { maxSideNonPawnMaterialCp } from "@shared/fen";
import type { GamePhase, MoveClassification } from "@shared/classification";
import type { EngineEvaluation, EngineLine } from "../engine/stockfish";
import type { IngestedMove } from "./pgnIngest";

export interface ClassifiedMove extends IngestedMove {
  phase: GamePhase;
  evalCpBefore: number | null;
  evalCpAfter: number | null;
  cpLoss: number | null;
  classification: MoveClassification | null;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  multipvJson: string;
  /** True when the mover had a forced mate available before this move and gave it up (distinct from blundering *into* the opponent's mate). */
  missedMate: boolean;
}

/** Converts an engine line's score (cp or mate) into a single signed centipawn-equivalent. */
function scoreFromLine(line: EngineLine | undefined): number {
  if (!line) return 0;
  if (line.mate !== null && line.mate !== undefined) {
    const magnitude = 100_000 - Math.min(99, Math.abs(line.mate)) * 100;
    return line.mate > 0 ? magnitude : -magnitude;
  }
  return line.cp ?? 0;
}

/**
 * Converts a centipawn value expressed from a given color's perspective into
 * White's perspective. Stockfish's UCI scores are always relative to the
 * side to move, so classification math works in mover-relative terms — but
 * anything stored for display (eval bars, progress charts) needs one
 * consistent frame across the whole game, or the sign flips every other ply.
 */
function toWhitePerspective(cpFromColorPerspective: number, color: "white" | "black"): number {
  return color === "white" ? cpFromColorPerspective : -cpFromColorPerspective;
}

/**
 * Classifies every move in a game. `positions[i]` must be the evaluation of
 * the position *before* move i+1 is played, so positions.length === moves.length + 1,
 * with positions[moves.length] being the evaluation of the final resulting position.
 */
export function classifyGameMoves(moves: IngestedMove[], positions: EngineEvaluation[]): ClassifiedMove[] {
  if (positions.length !== moves.length + 1) {
    throw new Error(
      `classifyGameMoves: expected ${moves.length + 1} position evaluations, got ${positions.length}`,
    );
  }

  return moves.map((move, index) => {
    const before = positions[index];
    const after = positions[index + 1];

    const material = maxSideNonPawnMaterialCp(move.fenBefore);
    const hasQueens = /q/i.test(move.fenBefore.split(" ")[0] ?? "");
    const phase = detectPhase(move.ply, material, hasQueens);

    const beforeTopLine = before.lines[0];
    const afterTopLine = after.lines[0];

    // A move that delivers checkmate leaves no legal position to evaluate
    // afterward (the engine returns no lines). It is, by definition, the
    // best possible move — classify it directly rather than falling through
    // to "unclassified".
    if (!afterTopLine && isCheckmate(move.fenAfter)) {
      return {
        ...move,
        phase,
        evalCpBefore: beforeTopLine
          ? clampCpForStorage(toWhitePerspective(scoreFromLine(beforeTopLine), move.color))
          : null,
        evalCpAfter: clampCpForStorage(toWhitePerspective(100_000, move.color)),
        cpLoss: 0,
        classification: "best" as MoveClassification,
        bestMoveUci: move.uci,
        bestMoveSan: move.san,
        multipvJson: JSON.stringify(before.lines),
        missedMate: false,
      };
    }

    // A stalemating (or other immediate-draw) move also leaves no lines, but
    // unlike mate it must be judged: forcing a draw from a winning position
    // is one of the worst practical errors in chess. Treat the resulting
    // position as exactly 0 and classify through the normal path.
    let forcedDrawEval: number | null = null;
    if (!afterTopLine && isDrawnTerminal(move.fenAfter)) {
      forcedDrawEval = 0;
    }

    const hasBothEvals = beforeTopLine !== undefined && (afterTopLine !== undefined || forcedDrawEval !== null);

    // `before` is evaluated with the mover to move, so its top line is
    // already signed from the mover's perspective. `after` is evaluated with
    // the opponent to move, so we negate to express it from the mover's view.
    const cpBeforeSigned = beforeTopLine ? scoreFromLine(beforeTopLine) : null;
    const cpAfterSigned =
      forcedDrawEval !== null ? forcedDrawEval : afterTopLine ? -scoreFromLine(afterTopLine) : null;

    const preMateForMover =
      beforeTopLine?.mate !== null && beforeTopLine?.mate !== undefined && beforeTopLine.mate > 0
        ? beforeTopLine.mate
        : null;
    const postMateForMover =
      afterTopLine?.mate !== null && afterTopLine?.mate !== undefined && afterTopLine.mate < 0
        ? -afterTopLine.mate
        : null;
    const missedMate = preMateForMover !== null && postMateForMover === null;

    const classification = !hasBothEvals
      ? null
      : classifyMove({
          cpAfter: cpAfterSigned!,
          bestCpAfter: cpBeforeSigned!,
          phase,
          missedMate,
        });

    const cpLoss = !hasBothEvals ? null : cpLossForClassification(cpAfterSigned!, cpBeforeSigned!);

    // A missing engine line must surface as a null eval, never a fabricated
    // 0 — a fake "equal" reading would poison the eval graph and accuracy.
    return {
      ...move,
      phase,
      evalCpBefore:
        cpBeforeSigned === null ? null : clampCpForStorage(toWhitePerspective(cpBeforeSigned, move.color)),
      evalCpAfter:
        cpAfterSigned === null ? null : clampCpForStorage(toWhitePerspective(cpAfterSigned, move.color)),
      cpLoss,
      classification,
      // Derive both from the same rank-1 line so they always describe one move;
      // `before.bestMove` (the last completed iteration's bestmove) can differ
      // from lines[0] after a `stop`, which produced mismatched uci/san rows.
      bestMoveUci: beforeTopLine?.uci ?? before.bestMove,
      bestMoveSan: beforeTopLine?.san ?? null,
      multipvJson: JSON.stringify(before.lines),
      missedMate,
    };
  });
}

function isCheckmate(fen: string): boolean {
  try {
    return new Chess(fen).isCheckmate();
  } catch {
    return false;
  }
}

/** True for positions that are an immediate draw on the board: stalemate or dead-material. */
function isDrawnTerminal(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.isStalemate() || chess.isInsufficientMaterial();
  } catch {
    return false;
  }
}

function clampCpForStorage(value: number): number {
  return Math.max(-100_000, Math.min(100_000, Math.round(value)));
}

export function summarizeAccuracy(moves: ClassifiedMove[]): {
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  whiteCounts: Record<MoveClassification, number>;
  blackCounts: Record<MoveClassification, number>;
} {
  // Stored evals are White-perspective; win%-loss must be computed from the
  // mover's perspective, so flip the sign for Black's moves.
  const winPctLossFor = (move: ClassifiedMove): number | null => {
    if (move.evalCpBefore === null || move.evalCpAfter === null) return null;
    const sign = move.color === "white" ? 1 : -1;
    return winPctLossForMove(sign * move.evalCpBefore, sign * move.evalCpAfter);
  };

  const whiteLosses = moves
    .filter((move) => move.color === "white")
    .map(winPctLossFor)
    .filter((value): value is number => value !== null);
  const blackLosses = moves
    .filter((move) => move.color === "black")
    .map(winPctLossFor)
    .filter((value): value is number => value !== null);

  const emptyCounts = (): Record<MoveClassification, number> => ({
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  });

  const whiteCounts = emptyCounts();
  const blackCounts = emptyCounts();
  for (const move of moves) {
    if (!move.classification) continue;
    const bucket = move.color === "white" ? whiteCounts : blackCounts;
    bucket[move.classification] += 1;
  }

  return {
    whiteAccuracy: whiteLosses.length > 0 ? accuracyFromWinPctLosses(whiteLosses) : null,
    blackAccuracy: blackLosses.length > 0 ? accuracyFromWinPctLosses(blackLosses) : null,
    whiteCounts,
    blackCounts,
  };
}
