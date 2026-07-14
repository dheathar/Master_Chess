import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "./ollama";
import { LlmUnavailableError } from "./provider";

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unavailable when the model isn't in the local tag list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "other-model" }] }), { status: 200 })),
    );
    const provider = new OllamaProvider("http://localhost:11434", "gemma4:32k");
    expect(await provider.isAvailable()).toBe(false);
  });

  it("reports available when the model is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "gemma4:32k" }] }), { status: 200 })),
    );
    const provider = new OllamaProvider("http://localhost:11434", "gemma4:32k");
    expect(await provider.isAvailable()).toBe(true);
  });

  it("reports unavailable when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const provider = new OllamaProvider("http://localhost:11434", "gemma4:32k");
    expect(await provider.isAvailable()).toBe(false);
  });

  it("throws LlmUnavailableError (never a raw fetch error) when completion fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const provider = new OllamaProvider("http://localhost:11434", "gemma4:32k");
    await expect(provider.complete({ system: "sys", prompt: "hi" })).rejects.toThrow(LlmUnavailableError);
  });

  it("returns the model's response text on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ response: "hello" }), { status: 200 })),
    );
    const provider = new OllamaProvider("http://localhost:11434", "gemma4:32k");
    const result = await provider.complete({ system: "sys", prompt: "hi" });
    expect(result).toEqual({ text: "hello", model: "gemma4:32k" });
  });
});
