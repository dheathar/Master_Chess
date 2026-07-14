export interface LlmCompletionRequest {
  system: string;
  prompt: string;
  /** Hint that the model must return only JSON matching the caller's expected shape. */
  jsonMode?: boolean;
}

export interface LlmCompletionResult {
  text: string;
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  /** Cheap reachability check — used to decide whether to attempt narration/classification at all. */
  isAvailable(): Promise<boolean>;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

export class LlmUnavailableError extends Error {
  constructor(providerName: string, cause?: unknown) {
    super(`LLM provider "${providerName}" is unavailable${cause ? `: ${String(cause)}` : ""}`);
    this.name = "LlmUnavailableError";
  }
}
