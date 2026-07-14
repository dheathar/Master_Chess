import crypto from "node:crypto";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { rateLimit } from "../auth/rateLimit";
import { asyncHandler } from "../asyncHandler";
import { db } from "../db/client";
import { coachEvents } from "../db/schema";
import { getLlmProvider } from "../llm";
import { HELP_KNOWLEDGE } from "@shared/helpKnowledge";
import { helpChatRequestSchema, type HelpChatMessage, type HelpChatResponse } from "@shared/api";

export const helpRouter = Router();

// Grounded assistant: modest per-user rate limit to keep LLM cost bounded.
const helpLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 40 });

const SCREEN_LABELS: Record<string, string> = {
  dashboard: "Games (dashboard)",
  upload: "Upload",
  review: "Game Review",
  model: "Player Model",
  prescription: "Training Plan",
  drill: "Drills",
  library: "Library",
  account: "Account & data",
};

const FALLBACK_ANSWER =
  "The help assistant is temporarily unavailable. In the meantime: upload your games on the Upload screen, " +
  "review them move-by-move in Game Review, then see your diagnosis in Player Model and your prescribed " +
  "study in Training Plan. For account or data questions, use the Account & data page.";

/**
 * Pure prompt builder — exported for unit testing. The assistant is fenced to
 * the knowledge base and the safe per-user context; it is instructed never to
 * invent chess facts, features, or numbers (the app's engine-authority rule).
 */
export function buildHelpPrompt(
  messages: HelpChatMessage[],
  screen?: string,
  userContext?: string,
): { system: string; prompt: string } {
  const system =
    "You are the in-app help assistant for Master Chess, an adaptive chess tutor. " +
    "Answer ONLY using the KNOWLEDGE BASE below and the USER CONTEXT. If the answer is not covered there, " +
    "say you are not sure and point the user to the Account & data page or their administrator — do not guess. " +
    "Never invent chess evaluations, moves, features, screens, or numbers. Be concise (2–5 sentences), warm, and " +
    "specific; refer to real screens by their names. If the user seems stuck, suggest the concrete next screen to visit.\n\n" +
    "=== KNOWLEDGE BASE ===\n" +
    HELP_KNOWLEDGE +
    (userContext ? `\n=== USER CONTEXT ===\n${userContext}\n` : "");

  const convo = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const screenLine = screen ? `The user is currently on the "${SCREEN_LABELS[screen] ?? screen}" screen.\n` : "";
  const prompt = `${screenLine}Conversation so far:\n${convo}\n\nWrite the assistant's next reply.`;
  return { system, prompt };
}

helpRouter.post(
  "/chat",
  requireAuth,
  helpLimiter,
  asyncHandler(async (req, res) => {
    const parsed = helpChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }
    // The last message must be the user's question.
    if (parsed.data.messages[parsed.data.messages.length - 1]?.role !== "user") {
      res.status(400).json({ error: "The last message must be from the user." });
      return;
    }

    const user = req.user!;
    const userContext =
      `The user's display name is ${user.displayName}. Their subscription tier is "${user.tier}" ` +
      `(free = 5 analyses/day; pro and academy = unlimited).`;

    const question = parsed.data.messages[parsed.data.messages.length - 1].content;

    let answer = FALLBACK_ANSWER;
    let llmAvailable = false;
    const provider = getLlmProvider();
    if (provider && (await provider.isAvailable())) {
      const { system, prompt } = buildHelpPrompt(parsed.data.messages, parsed.data.screen, userContext);
      try {
        const completion = await provider.complete({ system, prompt });
        const text = completion.text.trim();
        if (text) {
          answer = text;
          llmAvailable = true;
        }
      } catch {
        /* keep the deterministic fallback */
      }
    }

    // Persist the exchange (transparency + so help usage can inform coaching).
    const now = Date.now();
    db.insert(coachEvents)
      .values([
        { id: crypto.randomUUID(), userId: user.id, kind: "chat", drillId: null, screen: parsed.data.screen ?? null, role: "user", content: question, createdAt: now },
        { id: crypto.randomUUID(), userId: user.id, kind: "chat", drillId: null, screen: parsed.data.screen ?? null, role: "assistant", content: answer, createdAt: now + 1 },
      ])
      .run();

    res.json({ answer, llmAvailable } satisfies HelpChatResponse);
  }),
);
