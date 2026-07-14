import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyProphylaxis } from "./prophylaxisClassifier";
import { resetProviderCache } from "./index";
import type { ProphylaxisCandidate } from "../pipeline/prophylaxisProbe";

const candidate: ProphylaxisCandidate = {
  ply: 20,
  moveNumber: 10,
  sanPlayed: "Bd3",
  threatMoveSan: "Qxh7",
  threatCp: 420,
  swingAfterCp: 420,
  direction: "against",
};

function stubOllama(tagsBody: unknown, generateBody: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/tags")) return new Response(JSON.stringify(tagsBody), { status: 200 });
      return new Response(JSON.stringify(generateBody), { status: 200 });
    }),
  );
}

describe("classifyProphylaxis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_PROVIDER;
    delete process.env.OLLAMA_MODEL;
    resetProviderCache();
  });

  it("returns a claim-guarded rationale when the model stays within the given facts", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama(
      { models: [{ name: "gemma4:32k" }] },
      { response: JSON.stringify({ rationale: "Qxh7 was already a 420cp threat before you played Bd3." }) },
    );
    expect(await classifyProphylaxis(candidate)).toBe("Qxh7 was already a 420cp threat before you played Bd3.");
  });

  it("rejects a rationale that invents a move not in the candidate's facts (adversarial)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama(
      { models: [{ name: "gemma4:32k" }] },
      { response: JSON.stringify({ rationale: "You should have played Rxh7 to defend." }) },
    );
    expect(await classifyProphylaxis(candidate)).toBeNull();
  });

  it("rejects a rationale that invents a centipawn figure not in the candidate's facts (adversarial)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama(
      { models: [{ name: "gemma4:32k" }] },
      { response: JSON.stringify({ rationale: "That threat was worth a full 900cp." }) },
    );
    expect(await classifyProphylaxis(candidate)).toBeNull();
  });

  it("returns null on malformed JSON (adversarial)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "gemma4:32k" }] }, { response: "definitely not json" });
    expect(await classifyProphylaxis(candidate)).toBeNull();
  });

  it("returns null when the provider is unavailable", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "some-other-model" }] }, { response: "{}" });
    expect(await classifyProphylaxis(candidate)).toBeNull();
  });
});
