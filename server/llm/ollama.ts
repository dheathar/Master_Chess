import type { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from "./provider";
import { LlmUnavailableError } from "./provider";

const AVAILABILITY_TIMEOUT_MS = 1500;
const COMPLETION_TIMEOUT_MS = 30_000;

export class OllamaProvider implements LlmProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const body = (await res.json()) as { models?: { name: string }[] };
      return (body.models ?? []).some((m) => m.name === this.model);
    } catch {
      return false;
    }
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          system: request.system,
          prompt: request.prompt,
          stream: false,
          ...(request.jsonMode ? { format: "json" } : {}),
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const body = (await res.json()) as { response: string };
      return { text: body.response, model: this.model };
    } catch (err) {
      throw new LlmUnavailableError(this.name, err);
    }
  }
}
