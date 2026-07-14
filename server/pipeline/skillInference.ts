import { Chess } from "chess.js";
import { endgameMaterialSignature } from "@shared/fen";
import type { EvidenceEntry } from "@shared/evidence";
import type { SkillId } from "@shared/taxonomy";
import type { ClassifiedMove } from "./classifier";

/**
 * Skill-inference rule engine — the "player-development learning loop" (SRS
 * §3.1). This is deliberately NOT an LLM: it is a fixed set of rules mapping
 * engine-verified move evidence to the 27-skill taxonomy. Every rule cites
 * the exact signal it fires on, so every skill score traces back to real
 * moves (the "evidence receipts" mechanism).
 *
 * Scope discipline: only skills with a genuine, cheaply-computable signal
 * get rules here. Cross-game signals (opening repertoire consistency,
 * book/novelty detection against the master-game library) need DB access
 * and live in ./openingInference.ts instead, which is merged in by the
 * caller (analysisQueue.ts) — this module stays pure and single-game so it
 * stays trivially fixture-testable.
 */

const BLUNDER_TIME_MS = 90_000; // long think before a decisive error suggests a process problem, not a snap error
const SNAP_TIME_MS = 3_000; // very fast move before a decisive error suggests a skipped blunder-check
// The engine encodes forced mate as a ~100 000-magnitude cp value. Any |cpLoss|
// at or above this is a mate-transition (either mover gave up a mate, or walked
// into one), not a real centipawn quantity — used only to keep such outliers
// out of the resilience variance statistics.
const MATE_MAGNITUDE_CP = 30_000;

const ENDGAME_SIGNATURE_SKILL: Record<Exclude<ReturnType<typeof endgameMaterialSignature>, null>, SkillId> = {
  pawn: "pawn_endings",
  rook: "rook_endings",
  knight: "knight_endings",
  bishop_mixed: "bishop_mixed_endings",
};

function pushEvidence(
  out: EvidenceEntry[],
  skillId: SkillId,
  direction: EvidenceEntry["direction"],
  weight: number,
  ruleId: string,
  note: string,
  moveIndex: number,
): void {
  out.push({ skillId, direction, weight: Math.max(0, Math.min(1, weight)), ruleId, note, moveIndex });
}

/**
 * A non-pawn, non-king piece of the mover's own color left on a square the
 * opponent attacks and nobody of the mover's own pieces defends — a direct,
 * board-level "hanging piece" check independent of the engine's cp-loss
 * number, computed straight from FEN via chess.js's attacker map.
 */
function findHangingOwnPiece(fen: string, ownColor: "w" | "b"): { square: string; type: string } | null {
  try {
    const chess = new Chess(fen);
    // `fen` is the position after the player's move, so the opponent is to move.
    // A piece is only truly hanging if the opponent has a *legal* capture of it —
    // this rules out attackers that are pinned, or that can't capture because the
    // side to move must first answer a check, both of which chess.js's
    // pseudo-legal attackers() would wrongly report as threats.
    if (chess.turn() === ownColor) return null;
    const legalCaptureTargets = new Set(
      chess.moves({ verbose: true }).filter((move) => move.captured).map((move) => move.to),
    );
    for (const row of chess.board()) {
      for (const cell of row) {
        if (!cell || cell.color !== ownColor || cell.type === "p" || cell.type === "k") continue;
        if (!legalCaptureTargets.has(cell.square)) continue; // not legally capturable this move
        if (chess.attackers(cell.square, ownColor).length > 0) continue; // defended by own → not hanging
        return { square: cell.square, type: cell.type };
      }
    }
  } catch {
    // malformed FEN — treat as no hanging piece rather than throwing
  }
  return null;
}

const PIECE_NAME: Record<string, string> = { q: "queen", r: "rook", b: "bishop", n: "knight" };

const FINISHED_RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "½-½"]);
/** True only for a completed game — guards result-dependent rules against unfinished ("*") / null results. */
function isFinishedResult(result: string | null): result is string {
  return result !== null && FINISHED_RESULTS.has(result);
}

/**
 * Human-readable loss phrase for an evidence receipt. A mate-magnitude cpLoss
 * is an encoded mate transition, not a real centipawn quantity — surface it as
 * "allowed a forced mate" rather than a nonsense "~100000cp" number.
 */
function lossPhrase(cpLoss: number): string {
  return Math.abs(cpLoss) >= MATE_MAGNITUDE_CP ? "allowed a forced mate" : `lost ${cpLoss}cp`;
}

/** Per-move rules: fire independently for each classified move. */
function inferFromMove(move: ClassifiedMove, index: number): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];
  if (!move.classification || move.cpLoss === null) return out;

  const severity = move.classification === "blunder" ? 1 : move.classification === "mistake" ? 0.6 : 0.3;
  const isError = move.classification === "mistake" || move.classification === "blunder";
  const isGood = move.classification === "best" || move.classification === "good";

  // A missed forced mate is a calculation signal regardless of phase, so it is
  // handled before the phase branches — otherwise an endgame missed mate is
  // mislabeled a positional "endgame error" carrying a nonsense ~100 000cp
  // number in the receipt, and a middlegame one is conflated with a plain
  // blunder-into-mate. This fires only when the mover *had* a mate and gave it
  // up (classifier `missedMate`); walking into the opponent's mate is a normal
  // blunder and still flows through the phase branches below.
  if (move.missedMate) {
    pushEvidence(
      out,
      "calculation_precision",
      "against",
      1,
      "missed-forced-mate",
      `${move.san} let a forced mate slip.`,
      index,
    );
    return out;
  }

  if (move.phase === "opening") {
    if (isError) {
      pushEvidence(
        out,
        "opening_principles",
        "against",
        severity,
        "opening-error",
        `${move.san} ${lossPhrase(move.cpLoss)} in the opening phase.`,
        index,
      );
    } else if (isGood) {
      pushEvidence(out, "opening_principles", "for", 0.15, "opening-sound", `${move.san} kept opening principles intact.`, index);
    }
  }

  if (move.phase === "middlegame") {
    if (move.classification === "blunder") {
      pushEvidence(
        out,
        "tactical_consistency",
        "against",
        severity,
        "middlegame-blunder",
        `${move.san} was a blunder-check failure (${lossPhrase(move.cpLoss)}).`,
        index,
      );
      pushEvidence(
        out,
        "tactical_pattern_recognition",
        "against",
        0.5,
        "middlegame-blunder-pattern",
        `${move.san} missed a tactical pattern the engine saw immediately.`,
        index,
      );
    } else if (move.classification === "mistake") {
      pushEvidence(
        out,
        "tactical_pattern_recognition",
        "against",
        severity,
        "middlegame-mistake",
        `${move.san} missed a tactical resource (${lossPhrase(move.cpLoss)}).`,
        index,
      );
    } else if (isGood) {
      pushEvidence(out, "tactical_consistency", "for", 0.12, "middlegame-sound", `${move.san} held up under a blunder-check.`, index);
    }

    // Board-level hanging-piece check, only when the engine also flagged an
    // error — a piece left "attacked but defended enough" or sacrificed as
    // the engine's own best move must never be flagged.
    if (isError) {
      const hanging = findHangingOwnPiece(move.fenAfter, move.color === "white" ? "w" : "b");
      if (hanging) {
        pushEvidence(
          out,
          "piece_activity_coordination",
          "against",
          0.4,
          "hanging-piece-left",
          `After ${move.san}, the ${PIECE_NAME[hanging.type] ?? hanging.type} on ${hanging.square} is attacked and undefended.`,
          index,
        );
      }
    }
  }

  if (move.phase === "endgame") {
    if (isError) {
      pushEvidence(
        out,
        "endgame_precision_conversion",
        "against",
        severity,
        "endgame-error",
        `${move.san} lost precision in the endgame (${lossPhrase(move.cpLoss)}).`,
        index,
      );
      pushEvidence(out, "endgame_principles", "against", 0.4, "endgame-error-principles", `${move.san} broke a core endgame principle.`, index);
    } else if (isGood) {
      pushEvidence(out, "endgame_principles", "for", 0.15, "endgame-sound", `${move.san} handled the endgame soundly.`, index);
    }

    // Attribute to the specific piece-type endgame skill when the material
    // signature is unambiguous (pure pawn / rook / knight / bishop-minor
    // endings) — mixed material (queens, rook+minor combos) stays generic.
    const signature = endgameMaterialSignature(move.fenBefore);
    if (signature) {
      const skillId = ENDGAME_SIGNATURE_SKILL[signature];
      if (isError) {
        pushEvidence(
          out,
          skillId,
          "against",
          severity * 0.8,
          `endgame-error-${signature}`,
          `${move.san} ${lossPhrase(move.cpLoss)} in a ${signature.replace("_", "-")} ending.`,
          index,
        );
      } else if (isGood) {
        pushEvidence(out, skillId, "for", 0.12, `endgame-sound-${signature}`, `${move.san} was solid technique in a ${signature.replace("_", "-")} ending.`, index);
      }
    }
  }

  if (isError && move.moveTimeMs !== null) {
    if (move.moveTimeMs <= SNAP_TIME_MS) {
      pushEvidence(
        out,
        "time_management",
        "against",
        0.4,
        "snap-blunder",
        `${move.san} was played in ${Math.round(move.moveTimeMs / 1000)}s — too fast for a blunder-check.`,
        index,
      );
    } else if (move.moveTimeMs >= BLUNDER_TIME_MS) {
      pushEvidence(
        out,
        "thought_process_candidate_moves",
        "against",
        0.3,
        "long-think-still-wrong",
        `${move.san} took ${Math.round(move.moveTimeMs / 1000)}s and was still an error — a candidate-move process gap, not a snap decision.`,
        index,
      );
    }
  }

  return out;
}

/**
 * Game-level rule: did the player reach a clearly winning position (from
 * their own perspective) at any point but fail to win the game? This is the
 * single most concretely computable signal for "converting advantages" —
 * derived from the real eval trajectory and the real game result, not a
 * proxy.
 */
function inferConversionFailure(moves: ClassifiedMove[], playerColor: "white" | "black", result: string | null): EvidenceEntry[] {
  if (!isFinishedResult(result)) return []; // an unfinished game was neither converted nor thrown
  const playerWon = (playerColor === "white" && result === "1-0") || (playerColor === "black" && result === "0-1");
  if (playerWon) return [];

  const CLEARLY_WINNING_CP = 400;
  let peakCp = -Infinity;
  let peakIndex = -1;
  moves.forEach((move, index) => {
    if (move.evalCpAfter === null) return;
    // evalCpAfter is White-perspective; flip for a Black player.
    const fromPlayerPerspective = playerColor === "white" ? move.evalCpAfter : -move.evalCpAfter;
    if (fromPlayerPerspective > peakCp) {
      peakCp = fromPlayerPerspective;
      peakIndex = index;
    }
  });

  if (peakIndex === -1 || peakCp < CLEARLY_WINNING_CP) return [];

  const outcome = result === "1/2-1/2" || result === "½-½" ? "drew" : "lost";
  return [
    {
      skillId: "converting_advantages",
      direction: "against",
      weight: 0.8,
      ruleId: "conversion-failure",
      note: `Reached a clearly winning position (peak +${(peakCp / 100).toFixed(1)}) after ${moves[peakIndex].san} but ${outcome} the game.`,
      moveIndex: peakIndex,
    },
  ];
}

function playerPerspectiveCp(move: ClassifiedMove, playerColor: "white" | "black"): number | null {
  if (move.evalCpAfter === null) return null;
  return playerColor === "white" ? move.evalCpAfter : -move.evalCpAfter;
}

/**
 * Game-level: sustained eval growth from near-equal to decisive during the
 * player's own middlegame/endgame moves is the clearest computable signal
 * for building and pressing an attack — and holding a clearly worse
 * position (≤ -300) to a draw or win is the clearest signal for defensive
 * resourcefulness. Both fire "for" only: a lost/losing game on its own
 * doesn't tell us whether defence was actually attempted, so we don't
 * penalize what we can't fairly attribute.
 */
function inferAttackAndDefence(moves: ClassifiedMove[], playerColor: "white" | "black", result: string | null): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];

  let trackingFromIndex: number | null = null;
  let firedThisGame = false;
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    if (move.color !== playerColor || move.phase === "opening") continue;
    const cp = playerPerspectiveCp(move, playerColor);
    if (cp === null) continue;

    if (trackingFromIndex === null) {
      if (Math.abs(cp) < 100) trackingFromIndex = i;
    } else if (cp >= 500 && !firedThisGame) {
      pushEvidence(
        out,
        "attack_initiative",
        "for",
        0.55,
        "sustained-initiative",
        `Built a decisive advantage (+${(cp / 100).toFixed(1)}) by ${move.san} after being roughly equal — sustained initiative.`,
        i,
      );
      firedThisGame = true;
      trackingFromIndex = null;
    } else if (cp <= -300) {
      trackingFromIndex = null; // lost the thread — stop tracking this window
    }
  }

  const playerLost =
    result !== null && ((playerColor === "white" && result === "0-1") || (playerColor === "black" && result === "1-0"));
  // Only credit a hold when the game actually finished as a draw/win — an
  // unfinished ("*") game tells us nothing about whether the position was held.
  if (isFinishedResult(result) && !playerLost) {
    const wasInTrouble = moves.some((move) => {
      if (move.color !== playerColor) return false;
      const cp = playerPerspectiveCp(move, playerColor);
      return cp !== null && cp <= -300;
    });
    if (wasInTrouble) {
      const outcome = result === "1/2-1/2" || result === "½-½" ? "drew" : "won";
      pushEvidence(
        out,
        "defence_counterplay",
        "for",
        0.5,
        "held-worse-position",
        `Was clearly worse (≤ -3.0) at some point but ${outcome} the game — held a difficult position.`,
        moves.findIndex((move) => move.color === playerColor && (playerPerspectiveCp(move, playerColor) ?? 0) <= -300),
      );
    }
  }

  return out;
}

/**
 * Game-level: an own-derived consistency metric (not a platform-standard
 * one — see shared/skillAssessment.ts for the caveat surfaced to users).
 * Standard deviation of the player's own cp-loss is a documented practical
 * proxy for consistency (paired with average cp-loss it correlates with
 * rating in published analysis); we add a simple "did errors cluster right
 * after the first blunder" tilt check on top.
 */
function inferResilience(moves: ClassifiedMove[], playerColor: "white" | "black"): EvidenceEntry[] {
  // Cap each per-move loss so a single large blunder doesn't dominate the
  // variance/means — the psychological metric is about *consistency*, which
  // tactical rules already score separately. (Mate-magnitude encodings are
  // already excluded above.)
  const LOSS_CAP = 300;
  const cappedLoss = (move: ClassifiedMove): number => Math.min(LOSS_CAP, Math.max(0, move.cpLoss ?? 0));

  const ownLosses = moves
    .map((move, index) => ({ move, index }))
    .filter(({ move }) => move.color === playerColor && move.cpLoss !== null && Math.abs(move.cpLoss) < MATE_MAGNITUDE_CP);
  // Require a reasonable sample — STDCPL / tilt statistics over a handful of
  // moves are dominated by noise (a 20-move game gives ~10 own moves).
  if (ownLosses.length < 12) return [];

  const values = ownLosses.map(({ move }) => cappedLoss(move));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdCpl = Math.sqrt(variance);

  const out: EvidenceEntry[] = [];
  const firstBlunderPos = ownLosses.findIndex(({ move }) => move.classification === "blunder");

  // Need at least 5 own moves on each side of the first blunder for a
  // before/after comparison that isn't dominated by one or two samples.
  if (firstBlunderPos >= 5 && ownLosses.length - 1 - firstBlunderPos >= 5) {
    const before = ownLosses.slice(0, firstBlunderPos).map(({ move }) => cappedLoss(move));
    const after = ownLosses.slice(firstBlunderPos + 1).map(({ move }) => cappedLoss(move));
    const avgBefore = before.reduce((s, v) => s + v, 0) / before.length;
    const avgAfter = after.reduce((s, v) => s + v, 0) / after.length;
    const anchorIndex = ownLosses[firstBlunderPos].index;

    if (avgAfter >= Math.max(60, avgBefore * 1.6)) {
      pushEvidence(
        out,
        "psychological_resilience",
        "against",
        0.5,
        "post-blunder-tilt",
        `Average cp-loss jumped from ${Math.round(avgBefore)} to ${Math.round(avgAfter)} after the first blunder — errors clustered afterward.`,
        anchorIndex,
      );
    } else if (avgAfter <= avgBefore * 0.8 && avgAfter < 50) {
      pushEvidence(
        out,
        "psychological_resilience",
        "for",
        0.45,
        "post-blunder-recovery",
        `Cp-loss stayed controlled (avg ${Math.round(avgAfter)}) after an early blunder — recovered rather than tilting.`,
        anchorIndex,
      );
    }
  }

  if (stdCpl >= 150) {
    pushEvidence(
      out,
      "psychological_resilience",
      "against",
      0.25,
      "high-cpl-variance",
      `Move quality was erratic this game (cp-loss std-dev ${Math.round(stdCpl)}) — swung between strong and weak moves.`,
      ownLosses[ownLosses.length - 1].index,
    );
  } else if (stdCpl <= 40) {
    pushEvidence(
      out,
      "psychological_resilience",
      "for",
      0.2,
      "low-cpl-variance",
      `Move quality was even throughout (cp-loss std-dev ${Math.round(stdCpl)}) — no big swings in reliability.`,
      ownLosses[ownLosses.length - 1].index,
    );
  }

  return out;
}

export function inferSkillEvidence(
  moves: ClassifiedMove[],
  context: { playerColor: "white" | "black"; result: string | null },
): EvidenceEntry[] {
  const perMove = moves.flatMap((move, index) => (move.color === context.playerColor ? inferFromMove(move, index) : []));
  const conversion = inferConversionFailure(moves, context.playerColor, context.result);
  const attackDefence = inferAttackAndDefence(moves, context.playerColor, context.result);
  const resilience = inferResilience(moves, context.playerColor);
  return [...perMove, ...conversion, ...attackDefence, ...resilience];
}
