import { describe, expect, it } from "vitest";
import { buildHelpPrompt } from "./help";
import { HELP_KNOWLEDGE } from "@shared/helpKnowledge";
import type { HelpChatMessage } from "@shared/api";

describe("buildHelpPrompt", () => {
  const msgs: HelpChatMessage[] = [
    { role: "user", content: "How do I get a training plan?" },
  ];

  it("embeds the full knowledge base in the system prompt", () => {
    const { system } = buildHelpPrompt(msgs);
    expect(system).toContain(HELP_KNOWLEDGE.trim().slice(0, 40));
    expect(system).toContain("KNOWLEDGE BASE");
  });

  it("instructs the model to stay grounded and never invent chess facts", () => {
    const { system } = buildHelpPrompt(msgs);
    expect(system.toLowerCase()).toContain("only using the knowledge base");
    expect(system.toLowerCase()).toContain("never invent");
  });

  it("includes the user context block when provided", () => {
    const { system } = buildHelpPrompt(msgs, undefined, "The user's tier is free.");
    expect(system).toContain("USER CONTEXT");
    expect(system).toContain("The user's tier is free.");
  });

  it("names the current screen and renders the conversation in the prompt", () => {
    const convo: HelpChatMessage[] = [
      { role: "user", content: "what is this page?" },
      { role: "assistant", content: "It's the Player Model." },
      { role: "user", content: "how is mastery computed?" },
    ];
    const { prompt } = buildHelpPrompt(convo, "model");
    expect(prompt).toContain("Player Model");
    expect(prompt).toContain("User: what is this page?");
    expect(prompt).toContain("Assistant: It's the Player Model.");
    expect(prompt).toContain("User: how is mastery computed?");
  });

  it("passes an unknown screen key through rather than dropping it", () => {
    const { prompt } = buildHelpPrompt(msgs, "some-future-screen");
    expect(prompt).toContain("some-future-screen");
  });
});
