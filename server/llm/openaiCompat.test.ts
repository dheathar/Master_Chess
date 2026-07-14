import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatProvider } from "./openaiCompat";
import { LlmUnavailableError } from "./provider";

const BASE = "https://host/api";
const MODEL = "gemma4";

describe("OpenAiCompatProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports available when GET /models is ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    expect(await provider.isAvailable()).toBe(true);
  });

  it("reports unavailable on a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    expect(await provider.isAvailable()).toBe(false);
  });

  it("reports unavailable when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    expect(await provider.isAvailable()).toBe(false);
  });

  it("sends a bearer token when an api key is provided", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }], model: "srv" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-secret");
    await provider.complete({ system: "s", prompt: "p" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-secret");
    expect(url).toBe(`${BASE}/chat/completions`);
  });

  it("omits the Authorization header when no key is set (keyless local endpoints)", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatProvider(BASE, MODEL);
    await provider.complete({ system: "s", prompt: "p" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("extracts choices[0].message.content and the served model name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "the note" } }], model: "served-model" }), { status: 200 })),
    );
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    const result = await provider.complete({ system: "s", prompt: "p" });
    expect(result).toEqual({ text: "the note", model: "served-model" });
  });

  it("throws LlmUnavailableError on an empty completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })),
    );
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    await expect(provider.complete({ system: "s", prompt: "p" })).rejects.toThrow(LlmUnavailableError);
  });

  it("throws LlmUnavailableError (never a raw fetch error) on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    await expect(provider.complete({ system: "s", prompt: "p" })).rejects.toThrow(LlmUnavailableError);
  });

  it("requests JSON object format when jsonMode is set", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatProvider(BASE, MODEL, "sk-test");
    await provider.complete({ system: "s", prompt: "p", jsonMode: true });
    const [, jinit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(jinit.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});
