import { describe, expect, it } from "vitest";
import { buildDrillHints } from "./drills";

// Starting position: 1.e4 is a quiet (non-capture, non-check) pawn move.
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("buildDrillHints (engine-grounded, graded)", () => {
  it("returns three escalating hints", () => {
    const hints = buildDrillHints(START, "e2e4");
    expect(hints).toHaveLength(3);
    expect(hints[0]).not.toBe(hints[2]);
  });

  it("level 1 never reveals the move; level 3 does", () => {
    const [l1, l2, l3] = buildDrillHints(START, "e2e4");
    // The from/to squares must not leak at level 1.
    expect(l1.toLowerCase()).not.toContain("e2");
    expect(l1.toLowerCase()).not.toContain("e4");
    // Level 3 states the actual move.
    expect(l3).toContain("e2");
    expect(l3).toContain("e4");
    expect(l2.length).toBeGreaterThan(0);
  });

  it("describes a quiet pawn move as quiet (not a capture)", () => {
    const [, l2] = buildDrillHints(START, "e2e4");
    expect(l2.toLowerCase()).toContain("pawn");
    expect(l2.toLowerCase()).toContain("quiet");
  });

  it("describes a capture as winning material", () => {
    // White to move, can play exd5 (a capture).
    const fen = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const [, l2] = buildDrillHints(fen, "e4d5");
    expect(l2.toLowerCase()).toMatch(/win|material|take/);
  });

  it("falls back to a generic nudge on an illegal/garbage move", () => {
    const hints = buildDrillHints(START, "z9z9");
    expect(hints).toHaveLength(3);
    expect(hints[0].length).toBeGreaterThan(0);
  });
});
