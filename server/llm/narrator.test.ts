import { afterEach, describe, expect, it, vi } from "vitest";
import { narrateGame } from "./narrator";
import { resetProviderCache } from "./index";
import type { GameFacts } from "./gameFacts";

const facts: GameFacts = {
  playerColor: "white",
  result: "1-0",
  outcome: "win",
  openingName: "Italian Game",
  accuracy: 82,
  blunderCount: 1,
  mistakeCount: 2,
  worstMove: { san: "Qxf7", moveNumber: 4, cpLoss: 350, isMateEvent: false },
  allSan: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7"],
  ownSan: ["e4", "Bc4", "Qh5", "Qxf7"],
  opponentSan: ["e5", "Nc6", "Nf6"],
  cpLossValues: [10, 20, 350],
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

describe("narrateGame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.LLM_PROVIDER;
    delete process.env.OLLAMA_MODEL;
    delete process.env.OLLAMA_BASE_URL;
    resetProviderCache();
  });

  it("returns a verified narration when the model stays within the facts", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "gemma4:32k" }] }, { response: JSON.stringify({ narrative: "Qxf7 cost you 350cp — watch that square." }) });
    const result = await narrateGame(facts);
    expect(result?.narrative).toContain("Qxf7");
  });

  it("returns null when the model claims a win on a game the player lost (adversarial outcome)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    const lostFacts: GameFacts = { ...facts, result: "0-1", outcome: "loss" };
    stubOllama(
      { models: [{ name: "gemma4:32k" }] },
      { response: JSON.stringify({ narrative: "Qxf7 was strong and critical to securing the win." }) },
    );
    expect(await narrateGame(lostFacts)).toBeNull();
  });

  it("returns null when the model hallucinates a move that was never played (adversarial)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "gemma4:32k" }] }, { response: JSON.stringify({ narrative: "Your blunder Rxe8 lost the game." }) });
    const result = await narrateGame(facts);
    expect(result).toBeNull();
  });

  it("returns null when the model hallucinates a centipawn figure (adversarial)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "gemma4:32k" }] }, { response: JSON.stringify({ narrative: "That move lost you 5000cp instantly." }) });
    const result = await narrateGame(facts);
    expect(result).toBeNull();
  });

  it("returns null when the model returns malformed JSON (adversarial)", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "gemma4:32k" }] }, { response: "not json at all" });
    const result = await narrateGame(facts);
    expect(result).toBeNull();
  });

  it("returns null when the model is unavailable rather than throwing", async () => {
    process.env.OLLAMA_MODEL = "gemma4:32k";
    stubOllama({ models: [{ name: "some-other-model" }] }, { response: "{}" });
    const result = await narrateGame(facts);
    expect(result).toBeNull();
  });
});
