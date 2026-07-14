import { OllamaProvider } from "./ollama";
import type { LlmProvider } from "./provider";

export { LlmUnavailableError } from "./provider";
export type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "./provider";

let cachedProvider: LlmProvider | null = null;

/**
 * Only Ollama is wired up today (local-first, no API key required — see
 * .env's LLM_PROVIDER). OPENROUTER_API_KEY / ANTHROPIC_API_KEY are reserved
 * for future providers; there is deliberately no fallback chain between them
 * yet, since a silent provider swap would change the assumptions callers can
 * make about latency and cost.
 */
export function getLlmProvider(): LlmProvider | null {
  if (cachedProvider) return cachedProvider;
  const kind = process.env.LLM_PROVIDER ?? "ollama";
  if (kind === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL ?? "gemma4:32k";
    cachedProvider = new OllamaProvider(baseUrl, model);
    return cachedProvider;
  }
  return null;
}

/** Clears the memoized provider so a later call re-reads the environment. Intended for tests. */
export function resetProviderCache(): void {
  cachedProvider = null;
}
