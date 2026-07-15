import crypto from "node:crypto";
import { Router } from "express";
import { Chess } from "chess.js";
import { requireAuth } from "../auth/middleware";
import { rateLimit } from "../auth/rateLimit";
import { asyncHandler } from "../asyncHandler";
import { db } from "../db/client";
import { coachEvents } from "../db/schema";
import { enginePool } from "../engine/enginePool";
import { buildMoveHints } from "../pipeline/moveHints";
import type { EngineLine } from "../engine/stockfish";
import { playMoveRequestSchema, playHintRequestSchema, type PlayMoveResponse, type PlayHintResponse } from "@shared/api";

export const playRouter = Router();

// Each move/hint triggers a pooled Stockfish search; cap per-IP so a client
// can't spam the engines and starve the analysis pipeline. Generous enough for
// real play (a fast game is well under this).
playRouter.use(rateLimit({ windowMs: 60_000, max: 80 }));

/**
 * Difficulty is realised WITHOUT any engine-wrapper change: shallower search +
 * sampling a weaker legal move from the ranked multipv list at low levels;
 * always the best move at the top level. Every candidate comes from Stockfish,
 * so the reply is always legal — the LLM is never involved in move choice.
 */
const DIFFICULTY: Record<number, { depth: number; multipv: number; tau: number }> = {
  1: { depth: 3, multipv: 5, tau: 130 }, // beginner: shallow, often picks a weaker move
  2: { depth: 5, multipv: 5, tau: 80 },
  3: { depth: 8, multipv: 4, tau: 45 }, // club
  4: { depth: 12, multipv: 3, tau: 22 },
  5: { depth: 16, multipv: 1, tau: 1 }, // max: always the best move
};

/** Mate-aware score (mover perspective) — higher is better for the side to move. */
function lineScore(line: EngineLine): number {
  if (line.mate !== null) {
    const magnitude = 100_000 - Math.min(99, Math.abs(line.mate)) * 100;
    return line.mate > 0 ? magnitude : -magnitude;
  }
  return line.cp ?? 0;
}

/** Softmax-samples a candidate by strength: temperature `tau` flattens (weak) or sharpens (strong). */
function chooseLine(lines: EngineLine[], tau: number): EngineLine {
  const usable = lines.filter((l) => l.uci);
  if (usable.length === 0) return lines[0];
  if (usable.length === 1 || tau <= 1) return usable[0]; // best move
  const best = Math.max(...usable.map(lineScore));
  const weights = usable.map((l) => Math.exp(-(best - lineScore(l)) / tau));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < usable.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return usable[i];
  }
  return usable[0];
}

playRouter.post(
  "/move",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = playMoveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }

    // Validate the FEN and that a legal move exists (not already game over).
    let chess: Chess;
    try {
      chess = new Chess(parsed.data.fen);
    } catch {
      res.status(400).json({ error: "Illegal position." });
      return;
    }
    if (chess.isGameOver() || chess.moves().length === 0) {
      res.status(422).json({ error: "The game is already over in this position." });
      return;
    }

    const cfg = DIFFICULTY[parsed.data.difficulty] ?? DIFFICULTY[3];
    const evaluation = await enginePool.evaluate(parsed.data.fen, { depth: cfg.depth, multipv: cfg.multipv });
    const line = evaluation.lines.length > 0 ? chooseLine(evaluation.lines, cfg.tau) : null;
    const uci = line?.uci ?? evaluation.bestMove;
    if (!uci) {
      res.status(502).json({ error: "The engine did not return a move." });
      return;
    }

    // Derive SAN from the chosen UCI on the real board (never trust a stale san).
    // chess.js v1 THROWS on an illegal/unparseable move, so guard with try/catch.
    let san: string;
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never }).san;
    } catch {
      res.status(502).json({ error: "The engine returned an unusable move." });
      return;
    }

    res.json({ uci, san } satisfies PlayMoveResponse);
  }),
);

/**
 * In-match Coach: graded, engine-grounded hints for the CURRENT position. Finds
 * the engine's best move (deep, single-PV) and describes it via the shared
 * hint generator — the same "can't hallucinate" coaching as Drills, never LLM
 * move-advice. Returns all three levels; the client reveals them progressively.
 */
playRouter.post(
  "/hint",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = playHintRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }
    let chess: Chess;
    try {
      chess = new Chess(parsed.data.fen);
    } catch {
      res.status(400).json({ error: "Illegal position." });
      return;
    }
    if (chess.isGameOver() || chess.moves().length === 0) {
      res.status(422).json({ error: "No move to hint — the game is over." });
      return;
    }

    const evaluation = await enginePool.evaluate(parsed.data.fen, { depth: 16, multipv: 1 });
    const bestUci = evaluation.lines[0]?.uci ?? evaluation.bestMove;
    if (!bestUci) {
      res.status(502).json({ error: "The engine did not return a move to hint." });
      return;
    }
    const hints = buildMoveHints(parsed.data.fen, bestUci);

    db.insert(coachEvents)
      .values({
        id: crypto.randomUUID(),
        userId: req.user!.id,
        kind: "hint",
        drillId: null,
        screen: "play",
        role: null,
        content: hints[0],
        createdAt: Date.now(),
      })
      .run();

    res.json({ hints } satisfies PlayHintResponse);
  }),
);
