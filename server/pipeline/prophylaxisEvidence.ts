import { findProphylaxisCandidates, type ProphylaxisCandidate } from "./prophylaxisProbe";
import { classifyProphylaxis } from "../llm/prophylaxisClassifier";
import type { ClassifiedMove } from "./classifier";
import type { EvidenceEntry } from "@shared/evidence";

/**
 * Evidence weight from the *deterministic* probe magnitudes — never the LLM's
 * self-reported confidence. For a missed threat, strength is the smaller of the
 * threat and the swing it caused (both large ⇒ a confident miss). For a defused
 * threat, strength is the size of the threat handled (the swing is small by
 * definition). 150cp → 0, ~600cp → 1.
 */
export function prophylaxisWeight(candidate: ProphylaxisCandidate): number {
  const magnitude =
    candidate.direction === "against" ? Math.min(candidate.threatCp, candidate.swingAfterCp) : candidate.threatCp;
  return Math.max(0, Math.min(1, (magnitude - 150) / 450));
}

function templateNote(candidate: ProphylaxisCandidate): string {
  const threat = candidate.threatMoveSan ? `the standing threat ${candidate.threatMoveSan}` : "a standing threat";
  return candidate.direction === "against"
    ? `${candidate.sanPlayed} ignored ${threat} (${candidate.threatCp}cp), which then landed.`
    : `${candidate.sanPlayed} neutralized ${threat} (${candidate.threatCp}cp) before it could land.`;
}

/**
 * Runs the prophylaxis pipeline for one game and turns probe candidates into
 * bidirectional evidence. The deterministic null-move probe is the source of
 * truth (threat existed? did it land?); the LLM only writes the rationale prose
 * and only if the claim guard accepts it — otherwise a deterministic templated
 * note is used, so prophylaxis scoring never silently depends on the LLM being
 * available. "For" (defused-threat) evidence is only credited in games the
 * player did not lose, to avoid over-crediting isolated defensive moments in a
 * game that went badly overall.
 */
export async function inferProphylaxisEvidence(
  moves: ClassifiedMove[],
  playerColor: "white" | "black",
  result: string | null,
): Promise<EvidenceEntry[]> {
  const candidates = await findProphylaxisCandidates(moves, playerColor);
  const entries: EvidenceEntry[] = [];

  const lostGame =
    (playerColor === "white" && result === "0-1") || (playerColor === "black" && result === "1-0");

  for (const candidate of candidates) {
    if (candidate.direction === "for" && lostGame) continue;

    const moveIndex = moves.findIndex((move) => move.ply === candidate.ply);
    if (moveIndex === -1) continue;

    const rationale = (await classifyProphylaxis(candidate)) ?? templateNote(candidate);

    entries.push({
      skillId: "prophylaxis",
      direction: candidate.direction,
      weight: prophylaxisWeight(candidate),
      ruleId: "prophylaxis_probe_v1",
      note: rationale,
      moveIndex,
    });
  }

  return entries;
}
