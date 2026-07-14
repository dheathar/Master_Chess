/**
 * Move-quality classification from centipawn loss, phase-scaled.
 * Thresholds tightened in the endgame (where 100cp matters far more than in a
 * complex middlegame) and dampened at extreme evaluations (a drop from +9 to
 * +7 is not a "blunder" even though the raw cp-loss is large).
 */

export type GamePhase = "opening" | "middlegame" | "endgame";

export type MoveClassification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

interface PhaseThresholds {
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

const THRESHOLDS: Record<GamePhase, PhaseThresholds> = {
  opening: { inaccuracy: 60, mistake: 150, blunder: 350 },
  middlegame: { inaccuracy: 50, mistake: 120, blunder: 300 },
  endgame: { inaccuracy: 40, mistake: 90, blunder: 200 },
};

/**
 * Converts a centipawn score to a win probability using the Lichess curve
 * (2/(1+exp(-0.00368208*cp)) - 1, rescaled to 0..1). The accuracy constants
 * below (103.1668 / -0.04354) were fitted against THIS curve, so using a
 * different logistic would systematically skew accuracy scores.
 */
export function winProbability(cp: number): number {
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// How "decided" a win probability is: 0 when wp is in the live band [0.15,0.85],
// ramping smoothly to 1 as wp approaches 0 or 1. Drives continuous dampening.
const DECIDED_RAMP = 0.15;
function extremeness(wp: number): number {
  const edgeDistance = Math.min(wp, 1 - wp);
  if (edgeDistance >= DECIDED_RAMP) return 0;
  return (DECIDED_RAMP - edgeDistance) / DECIDED_RAMP;
}

const VERY_LOW_MATERIAL_CP = 500; // at most a lone minor per side — an endgame even during the opening phase
const ENDGAME_MATERIAL_CP = 1400;

/**
 * Detects a phase from ply count, the stronger side's non-pawn material
 * (centipawns), and whether queens remain. Queens keep a position out of the
 * "endgame" bucket (Q+R vs Q+R is a heavy-piece middlegame, not an endgame),
 * and very low material forces "endgame" even before ply 20 (an early queen
 * trade into a K+P ending should not be scored as opening theory).
 */
export function detectPhase(ply: number, maxSideNonPawnMaterialCp: number, hasQueens: boolean): GamePhase {
  if (maxSideNonPawnMaterialCp <= VERY_LOW_MATERIAL_CP) return "endgame";
  if (ply <= 20) return "opening";
  if (!hasQueens && maxSideNonPawnMaterialCp <= ENDGAME_MATERIAL_CP) return "endgame";
  return "middlegame";
}

/**
 * Classifies a move from the mover's perspective. `cpAfter` and `bestCpAfter`
 * are signed evaluations in centipawns from the mover's point of view after
 * the move was made (cpAfter is the eval of the resulting position, and
 * bestCpAfter is the eval of the engine's best move outcome, both from the
 * mover's perspective). `missedMate` short-circuits: missing a forced mate is
 * always at least a mistake regardless of the raw cp delta.
 */
export function classifyMove(params: {
  cpAfter: number;
  bestCpAfter: number;
  phase: GamePhase;
  missedMate: boolean;
}): MoveClassification {
  const { bestCpAfter, cpAfter, phase, missedMate } = params;
  const thresholds = THRESHOLDS[phase];

  // Win-probability dampening: compare loss in win% rather than raw cp when
  // BOTH sides of the swing sit in the same decided zone. The gates must be
  // tight and symmetric: with loose gates (e.g. wpActual > 0.75), dropping
  // from +20.0 to +2.0 — a genuine thrown win — would be dampened too.
  const wpBest = winProbability(bestCpAfter);
  const wpActual = winProbability(cpAfter);
  const wpLoss = Math.max(0, wpBest - wpActual);

  const rawLoss = Math.max(0, bestCpAfter - cpAfter);
  // Continuous win-probability dampening (replaces a hard wp>0.9 cliff, where a
  // 2cp difference could flip the label three classes). `decidedness` ramps
  // smoothly from 0 (a live position — trust raw cp) to 1 (both endpoints deep
  // in a decided zone — trust the win% swing), so effectiveLoss transitions
  // gradually between the two metrics.
  const decidedness = Math.min(extremeness(wpBest), extremeness(wpActual));
  const dampenedLoss = Math.min(rawLoss, wpLoss * 1000);
  const effectiveLoss = rawLoss - decidedness * (rawLoss - dampenedLoss);

  const base: MoveClassification =
    effectiveLoss >= thresholds.blunder
      ? "blunder"
      : effectiveLoss >= thresholds.mistake
        ? "mistake"
        : effectiveLoss >= thresholds.inaccuracy
          ? "inaccuracy"
          : effectiveLoss > 5
            ? "good"
            : "best";

  if (missedMate) {
    // Missing a forced mate is at least a mistake; it is only a blunder when
    // the resulting position is no longer clearly winning (missing mate-in-12
    // while staying +15 is not the same error as missing mate and reaching
    // an equal position).
    if (wpActual < 0.9 || base === "blunder") return "blunder";
    return "mistake";
  }

  return base;
}

export function cpLossForClassification(cpAfter: number, bestCpAfter: number): number {
  return Math.max(0, bestCpAfter - cpAfter);
}

/**
 * Per-move accuracy from the drop in win probability caused by the move,
 * expressed in win-percentage points (0-100). This is the Lichess formula —
 * its exponential constants are calibrated for win% drops, NOT raw
 * centipawns (feeding raw cp loss in yields ~50% "accuracy" for
 * near-perfect play).
 */
export function moveAccuracyFromWinPctLoss(winPctLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winPctLoss)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/** Win-percentage points (0-100) lost by a move, from the mover's perspective. */
export function winPctLossForMove(cpBeforeMover: number, cpAfterMover: number): number {
  return Math.max(0, 100 * (winProbability(cpBeforeMover) - winProbability(cpAfterMover)));
}

/**
 * Aggregate game accuracy from per-move win%-losses. Blends the arithmetic
 * and harmonic means of per-move accuracies (as Lichess does) so a single
 * game-losing blunder drags the score down more than averaging alone would.
 */
export function accuracyFromWinPctLosses(winPctLosses: number[]): number {
  if (winPctLosses.length === 0) return 100;
  const perMove = winPctLosses.map(moveAccuracyFromWinPctLoss);
  const arithmetic = perMove.reduce((sum, value) => sum + value, 0) / perMove.length;
  const harmonic =
    perMove.length / perMove.reduce((sum, value) => sum + 1 / Math.max(value, 1), 0);
  const blended = (arithmetic + harmonic) / 2;
  return Math.max(0, Math.min(100, Math.round(blended * 10) / 10));
}
