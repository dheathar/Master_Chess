import { OllamaProvider } from "./ollama";
import { OpenAiCompatProvider } from "./openaiCompat";
import type { LlmProvider } from "./provider";

export { LlmUnavailableError } from "./provider";
export type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "./provider";

let cachedProvider: LlmProvider | null = null;

/**
 * Provider selection is driven by LLM_PROVIDER:
 *  - "ollama"  (default, local-first, no key) — OLLAMA_BASE_URL / OLLAMA_MODEL
 *  - "openai"  any OpenAI-compatible chat endpoint (vLLM, Open WebUI, LiteLLM,
 *              OpenRouter, OpenAI) — OPENAI_BASE_URL / OPENAI_API_KEY /
 *              OPENAI_MODEL. OPENAI_BASE_URL is the API root that carries both
 *              `chat/completions` and `models` (e.g. `https://host/api` or
 *              `https://api.openai.com/v1`).
 *
 * There is deliberately no fallback chain between providers: a silent swap
 * would change the latency/cost assumptions callers rely on. An unknown or
 * misconfigured provider returns null, and callers fall back to the
 * deterministic, engine-only summary.
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
  if (kind === "openai") {
    const baseUrl = process.env.OPENAI_BASE_URL;
    const model = process.env.OPENAI_MODEL;
    if (!baseUrl || !model) return null; // misconfigured — fall back to deterministic
    cachedProvider = new OpenAiCompatProvider(baseUrl, model, process.env.OPENAI_API_KEY);
    return cachedProvider;
  }
  return null;
}

/** Clears the memoized provider so a later call re-reads the environment. Intended for tests. */
export function resetProviderCache(): void {
  cachedProvider = null;
}
