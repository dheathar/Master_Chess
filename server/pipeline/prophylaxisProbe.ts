import { Chess } from "chess.js";
import { flipSideToMove } from "@shared/fen";
import { evaluateWithCache } from "../engine/evalCache";
import type { EngineLine } from "../engine/stockfish";
import type { ClassifiedMove } from "./classifier";

// A "threat" is measured as a *delta*: how much the player's eval would drop if
// the opponent were handed a free move (null-move probe), relative to the
// static position. A full free tempo is worth a couple hundred cp on its own,
// so the bar is set well above that to mean a genuine standing threat.
const THREAT_THRESHOLD_CP = 300;
// How much the position actually swung against the player after their move (and
// the opponent's reply). At/above this the threat "landed" (a miss); below it
// the player held (a defused threat).
const SWING_THRESHOLD_CP = 150;
// Don't probe already-decided positions — there is nothing to prophylax when a
// side is up or down this much.
const DECIDED_CP = 1000;
const PROBE_DEPTH = 12;
const MAX_PROBES_PER_GAME = 6;

export interface ProphylaxisCandidate {
  ply: number;
  moveNumber: number;
  sanPlayed: string;
  threatMoveSan: string | null;
  /** Foreseeable standing-threat magnitude (player perspective): how much a free opponent move would have cost. */
  threatCp: number;
  /** How much the position actually swung against the player afterward (can be ≤0 when the threat was defused). */
  swingAfterCp: number;
  /** "against" = the threat landed (a prophylaxis miss); "for" = a real threat was neutralized. */
  direction: "for" | "against";
}

/** Mate-aware score (side-to-move perspective) for a probe line — matches the classifier's encoding. */
function lineScore(line: EngineLine | undefined): number | null {
  if (!line) return null;
  if (line.mate !== null && line.mate !== undefined) {
    const magnitude = 100_000 - Math.min(99, Math.abs(line.mate)) * 100;
    return line.mate > 0 ? magnitude : -magnitude;
  }
  return line.cp;
}

/**
 * Finds prophylaxis candidates via a null-move probe: for the player's own
 * moves (middlegame/endgame, not in check, not already decided), flip the side
 * to move and see what the opponent could do with a free move. The threat is
 * the resulting *delta* against the player's static eval (so merely being worse
 * is not mistaken for a new threat, and a real threat in a winning position is
 * not missed). A threat that then landed is an "against" candidate (a miss);
 * one the player neutralized is a "for" candidate. Engine cost is bounded by
 * MAX_PROBES_PER_GAME — swung-badly positions (likely misses) are probed first,
 * then any remaining budget goes to held positions (defused threats).
 *
 * The in-check guard is essential: flipping the side to move while the player
 * is in check produces an illegal, king-capturable position that Stockfish
 * would score as undefined garbage.
 */
export async function findProphylaxisCandidates(
  moves: ClassifiedMove[],
  playerColor: "white" | "black",
): Promise<ProphylaxisCandidate[]> {
  const sign = playerColor === "white" ? 1 : -1;
  const candidates: ProphylaxisCandidate[] = [];
  let probesUsed = 0;

  interface Eligible {
    index: number;
    move: ClassifiedMove;
    staticPlayerCp: number;
    swingAfterCp: number;
  }

  function eligibleAt(index: number): Eligible | null {
    const move = moves[index];
    if (move.color !== playerColor) return null;
    if (move.phase === "opening") return null;
    if (move.evalCpBefore === null) return null;
    const next = moves[index + 1];
    if (!next || next.evalCpAfter === null) return null;
    let inCheck: boolean;
    try {
      inCheck = new Chess(move.fenBefore).isCheck();
    } catch {
      return null;
    }
    if (inCheck) return null;
    const staticPlayerCp = sign * move.evalCpBefore;
    if (Math.abs(staticPlayerCp) > DECIDED_CP) return null;
    const swingAfterCp = staticPlayerCp - sign * next.evalCpAfter;
    return { index, move, staticPlayerCp, swingAfterCp };
  }

  async function probe(e: Eligible): Promise<void> {
    probesUsed += 1;
    let probeCp: number | null;
    let threatMoveSan: string | null;
    try {
      const result = await evaluateWithCache(flipSideToMove(e.move.fenBefore), { depth: PROBE_DEPTH, multipv: 1 });
      const bestLine = result.lines[0];
      probeCp = lineScore(bestLine);
      threatMoveSan = bestLine?.san ?? null;
    } catch {
      return; // probe unavailable — skip this candidate rather than fail the analysis
    }
    if (probeCp === null) return;
    // Player-perspective cost of handing the opponent a free move.
    const threatCp = e.staticPlayerCp + probeCp;
    if (threatCp < THREAT_THRESHOLD_CP) return;
    candidates.push({
      ply: e.move.ply,
      moveNumber: Math.ceil(e.move.ply / 2),
      sanPlayed: e.move.san,
      threatMoveSan,
      threatCp,
      swingAfterCp: e.swingAfterCp,
      direction: e.swingAfterCp >= SWING_THRESHOLD_CP ? "against" : "for",
    });
  }

  // Tier 1: positions that swung badly (most likely genuine misses).
  for (let i = 0; i < moves.length && probesUsed < MAX_PROBES_PER_GAME; i++) {
    const e = eligibleAt(i);
    if (!e || e.swingAfterCp < SWING_THRESHOLD_CP) continue;
    await probe(e);
  }
  // Tier 2: remaining budget probes held positions for defused threats.
  for (let i = 0; i < moves.length && probesUsed < MAX_PROBES_PER_GAME; i++) {
    const e = eligibleAt(i);
    if (!e || e.swingAfterCp >= SWING_THRESHOLD_CP) continue;
    await probe(e);
  }

  return candidates;
}
