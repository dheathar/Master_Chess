import { getLlmProvider } from "./index";
import { verifyClaims } from "./claimGuard";
import type { ProphylaxisCandidate } from "../pipeline/prophylaxisProbe";

function buildPrompt(candidate: ProphylaxisCandidate): { system: string; prompt: string } {
  const missed = candidate.direction === "against";
  const system =
    "You are a chess coach writing one honest sentence about a single prophylaxis moment. " +
    "A null-move engine probe established that the opponent had a real standing threat before the player's move; " +
    (missed
      ? "the player then let it land."
      : "the player neutralized it and it never landed.") +
    " ONLY reference the moves and numbers given below — never invent a move or figure not stated. " +
    'Write one second-person sentence. Respond with strict JSON of the shape {"rationale": "..."} and nothing else.';

  const swingLine = missed
    ? `The player did not address it and the position then swung against them by about ${candidate.swingAfterCp}cp.`
    : `The player answered it and the position did not swing against them.`;

  const lines = [
    `Move played: ${candidate.sanPlayed} (move ${candidate.moveNumber})`,
    candidate.threatMoveSan
      ? `The opponent's standing threat, given a free move, was ${candidate.threatMoveSan}, worth about ${candidate.threatCp}cp.`
      : `The opponent had a standing threat worth about ${candidate.threatCp}cp.`,
    swingLine,
  ];
  return { system, prompt: lines.join("\n") };
}

/**
 * Produces a claim-guarded, human-readable rationale for one prophylaxis
 * candidate. The candidate's VALIDITY and weight come entirely from the
 * deterministic probe (see prophylaxisProbe/prophylaxisEvidence) — the LLM only
 * supplies prose, and only if it survives the claim guard (no invented move or
 * number). Returns null when the provider is unavailable, the output is
 * malformed, or the guard rejects it; the caller then falls back to a
 * deterministic templated note, so scoring never silently depends on the LLM.
 */
export async function classifyProphylaxis(candidate: ProphylaxisCandidate): Promise<string | null> {
  const provider = getLlmProvider();
  if (!provider) return null;
  if (!(await provider.isAvailable())) return null;

  const { system, prompt } = buildPrompt(candidate);
  try {
    const completion = await provider.complete({ system, prompt, jsonMode: true });
    const parsed = JSON.parse(completion.text) as { rationale?: unknown };
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
    if (!rationale) return null;

    const allowedSan = [candidate.sanPlayed, candidate.threatMoveSan].filter((san): san is string => san !== null);
    const verdict = verifyClaims(rationale, allowedSan, [candidate.threatCp, candidate.swingAfterCp]);
    if (!verdict.verified) return null;

    return rationale;
  } catch {
    return null;
  }
}
