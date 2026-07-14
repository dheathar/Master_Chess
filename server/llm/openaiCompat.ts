import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "./provider";
import { LlmUnavailableError } from "./provider";

const AVAILABILITY_TIMEOUT_MS = 2500;
const COMPLETION_TIMEOUT_MS = 60_000;

/**
 * OpenAI-compatible chat-completions provider. Works with any endpoint that
 * speaks the OpenAI `chat/completions` shape — vLLM, Open WebUI, LiteLLM,
 * OpenRouter, or the OpenAI API itself.
 *
 * `baseUrl` is the API root that carries both `chat/completions` and `models`
 * as siblings — e.g. `https://api.openai.com/v1`, or (Open WebUI in front of
 * vLLM) `https://host/api`. The optional bearer key is sent only when present,
 * so keyless local endpoints still work.
 */
export class OpenAiCompatProvider implements LlmProvider {
  readonly name = "openai-compatible";
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly model: string;

  constructor(baseUrl: string, model: string, apiKey?: string | null) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.apiKey = apiKey && apiKey.length > 0 ? apiKey : null;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
          stream: false,
          temperature: 0.3,
          // Ask for JSON when the caller needs it; endpoints that don't support
          // response_format ignore it, and the caller re-validates + falls back.
          ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Provider returned ${res.status}`);
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty completion");
      return { text, model: body.model ?? this.model };
    } catch (err) {
      throw new LlmUnavailableError(this.name, err);
    }
  }
}
