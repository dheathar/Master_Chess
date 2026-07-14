import { getLlmProvider } from "./index";
import { verifyNarrative } from "./claimGuard";
import type { GameFacts } from "./gameFacts";
import type { LlmNarrative } from "@shared/api";

function buildPrompt(facts: GameFacts): { system: string; prompt: string } {
  const system =
    "You are a chess coach writing a short post-game note for a student. " +
    "ONLY reference moves, move numbers, and centipawn/evaluation figures explicitly given to you in the facts below — " +
    "never invent a move, number, or claim not stated there. Keep it to 2-4 sentences, second person, honest and specific, " +
    'no filler praise. Respond with strict JSON of the shape {"narrative": "..."} and nothing else.';

  const lines = [
    facts.result ? `Result: ${facts.result}` : null,
    facts.openingName ? `Opening: ${facts.openingName}` : null,
    facts.accuracy !== null ? `Your accuracy this game: ${facts.accuracy}%` : null,
    `Blunders: ${facts.blunderCount}, mistakes: ${facts.mistakeCount}`,
    facts.worstMove
      ? facts.worstMove.isMateEvent
        ? `Your worst move: ${facts.worstMove.san} at move ${facts.worstMove.moveNumber}, which gave up or allowed a forced mate`
        : `Your worst move: ${facts.worstMove.san} at move ${facts.worstMove.moveNumber}, losing ${facts.worstMove.cpLoss}cp`
      : null,
  ].filter((line): line is string => line !== null);

  return { system, prompt: `Facts:\n${lines.join("\n")}\n\nWrite the note now.` };
}

/**
 * Generates a claim-guarded coaching narrative for one game. Returns null on
 * any failure — provider unavailable, malformed JSON, or a claim-guard
 * rejection — so the caller can fall back to the deterministic summary
 * rather than surface an unverified LLM output.
 */
export async function narrateGame(facts: GameFacts): Promise<LlmNarrative | null> {
  const provider = getLlmProvider();
  if (!provider) return null;
  if (!(await provider.isAvailable())) return null;

  const { system, prompt } = buildPrompt(facts);
  try {
    const completion = await provider.complete({ system, prompt, jsonMode: true });
    const parsed = JSON.parse(completion.text) as { narrative?: unknown };
    const narrative = typeof parsed.narrative === "string" ? parsed.narrative.trim() : "";
    if (!narrative) return null;

    const verdict = verifyNarrative(narrative, facts);
    if (!verdict.verified) return null;

    return { narrative, model: completion.model, generatedAt: Date.now() };
  } catch {
    return null;
  }
}
