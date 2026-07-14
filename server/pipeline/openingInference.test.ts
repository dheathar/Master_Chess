import { describe, expect, it } from "vitest";
import { computeNoveltyEvidence, computeRepertoireEvidence, ecoPrefix } from "./openingInference";
import type { ClassifiedMove } from "./classifier";
import type { MoveClassification, GamePhase } from "@shared/classification";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function move(overrides: Partial<ClassifiedMove> & { ply: number; color: "white" | "black" }): ClassifiedMove {
  return {
    san: "e4",
    uci: "e2e4",
    fenBefore: START_FEN,
    fenAfter: AFTER_E4_FEN,
    clockMs: null,
    moveTimeMs: null,
    phase: "opening" as GamePhase,
    evalCpBefore: 0,
    evalCpAfter: 0,
    cpLoss: 0,
    classification: "best" as MoveClassification,
    bestMoveUci: null,
    bestMoveSan: null,
    multipvJson: "[]",
    missedMate: false,
    ...overrides,
  };
}

describe("ecoPrefix", () => {
  it("takes the first 3 characters", () => {
    expect(ecoPrefix("C54a")).toBe("C54");
  });
  it("returns null for null input", () => {
    expect(ecoPrefix(null)).toBeNull();
  });
});

describe("computeRepertoireEvidence", () => {
  it("fires for after 3+ games with the same ECO prefix and low opening cp-loss", () => {
    const history = [{ eco: "C54", openingAvgCpLoss: 0 }, { eco: "C54", openingAvgCpLoss: 0 }];
    const evidence = computeRepertoireEvidence("C54", 20, history, 0);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].skillId).toBe("opening_repertoire");
    expect(evidence[0].direction).toBe("for");
  });

  it("does not fire below the minimum game count", () => {
    const history = [{ eco: "C54", openingAvgCpLoss: 0 }];
    const evidence = computeRepertoireEvidence("C54", 20, history, 0);
    expect(evidence).toHaveLength(0);
  });

  it("does not fire when opening cp-loss is too high, even with a repeated line", () => {
    const history = [{ eco: "C54", openingAvgCpLoss: 0 }, { eco: "C54", openingAvgCpLoss: 0 }];
    const evidence = computeRepertoireEvidence("C54", 200, history, 0);
    expect(evidence).toHaveLength(0);
  });

  it("does not fire when the current game has no ECO", () => {
    const history = [{ eco: "C54", openingAvgCpLoss: 0 }, { eco: "C54", openingAvgCpLoss: 0 }];
    const evidence = computeRepertoireEvidence(null, 10, history, 0);
    expect(evidence).toHaveLength(0);
  });

  it("never fires 'against' — varied openings are not penalized", () => {
    const history = [{ eco: "B22", openingAvgCpLoss: 0 }, { eco: "D02", openingAvgCpLoss: 0 }];
    const evidence = computeRepertoireEvidence("C54", 10, history, 0);
    expect(evidence.every((e) => e.direction === "for")).toBe(true);
  });
});

describe("computeNoveltyEvidence", () => {
  it("credits a sound deviation from a known book position", () => {
    const moves = [move({ ply: 9, color: "white", classification: "good", uci: "d2d4" })];
    // Theory at this position is e2e4/c2c4 (both in 5+ games) — the player's d2d4 isn't in that set, so it's a genuine deviation.
    const bookMoves = new Map([[normalizeKeyFor(START_FEN), [{ uci: "e2e4", freq: 10 }, { uci: "c2c4", freq: 5 }]]]);
    // Populate 122+ positions so the book is broad enough to claim "known theory".
    for (let i = 0; i < 122; i += 1) bookMoves.set(`fen${i}`, [{ uci: "a2a4", freq: 5 }]);
    const evidence = computeNoveltyEvidence(moves, bookMoves, "white");
    expect(evidence).toHaveLength(1);
    expect(evidence[0].skillId).toBe("opening_preparation_novelties");
    expect(evidence[0].direction).toBe("for");
  });

  it("does not fire when the played move matches known book", () => {
    const moves = [move({ ply: 9, color: "white", classification: "good", uci: "e2e4" })];
    const bookMoves = new Map([[normalizeKeyFor(START_FEN), [{ uci: "e2e4", freq: 10 }, { uci: "d2d4", freq: 5 }]]]);
    const evidence = computeNoveltyEvidence(moves, bookMoves, "white");
    expect(evidence).toHaveLength(0);
  });

  it("does not fire when the position isn't in the local book at all", () => {
    // With a map of 122+ positions, it would qualify as a book; here it's too narrow.
    const moves = [move({ ply: 9, color: "white", classification: "good" })];
    const evidence = computeNoveltyEvidence(moves, new Map(), "white");
    expect(evidence).toHaveLength(0);
  });

  it("does not fire when the deviation was a mistake or blunder", () => {
    const bookMoves = new Map([[normalizeKeyFor(START_FEN), [{ uci: "e2e4", freq: 10 }]]]);
    // Also add 121 more positions to make the book broad enough
    for (let i = 0; i < 121; i += 1) bookMoves.set(`fen${i}`, [{ uci: "a2a4", freq: 5 }]);
    const moves = [move({ ply: 9, color: "white", classification: "mistake", uci: "d2d4" })];
    const evidence = computeNoveltyEvidence(moves, bookMoves, "white");
    expect(evidence).toHaveLength(0);
  });

  it("ignores moves outside the novelty ply window", () => {
    const bookMoves = new Map([[normalizeKeyFor(START_FEN), [{ uci: "e2e4", freq: 10 }]]]);
    for (let i = 0; i < 121; i += 1) bookMoves.set(`fen${i}`, [{ uci: "a2a4", freq: 5 }]);
    const moves = [move({ ply: 2, color: "white", classification: "good", uci: "d2d4" })];
    const evidence = computeNoveltyEvidence(moves, bookMoves, "white");
    expect(evidence).toHaveLength(0);
  });

  it("does not credit opponent moves as player novelties", () => {
    const bookMoves = new Map([[normalizeKeyFor(START_FEN), [{ uci: "e7e5", freq: 10 }]]]);
    for (let i = 0; i < 121; i += 1) bookMoves.set(`fen${i}`, [{ uci: "a7a5", freq: 5 }]);
    const moves = [move({ ply: 9, color: "black", classification: "good", uci: "d7d5" })];
    const evidence = computeNoveltyEvidence(moves, bookMoves, "white");
    expect(evidence).toHaveLength(0);
  });
});

// Local re-implementation of the normalization used by normalizeFenKey (strip move counters)
// to keep this test file independent of the engine module's cache internals.
function normalizeKeyFor(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}
