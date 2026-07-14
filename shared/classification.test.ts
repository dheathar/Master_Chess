import { describe, expect, it } from "vitest";
import {
  accuracyFromWinPctLosses,
  classifyMove,
  cpLossForClassification,
  detectPhase,
  moveAccuracyFromWinPctLoss,
  winPctLossForMove,
  winProbability,
} from "./classification";

describe("detectPhase", () => {
  it("treats the first 20 plies as the opening regardless of material", () => {
    expect(detectPhase(5, 6300, true)).toBe("opening");
    expect(detectPhase(20, 6300, true)).toBe("opening");
  });

  it("treats very low material as endgame even during the opening", () => {
    expect(detectPhase(10, 400, true)).toBe("endgame");
  });

  it("treats low non-pawn material + no queens as endgame after ply 20", () => {
    expect(detectPhase(40, 1000, false)).toBe("endgame");
  });

  it("treats everything else as middlegame", () => {
    expect(detectPhase(30, 4000, true)).toBe("middlegame");
  });
});

describe("classifyMove", () => {
  const base = { phase: "middlegame" as const, missedMate: false };

  it("classifies a move matching the engine's best line as best", () => {
    const result = classifyMove({ ...base, cpAfter: 20, bestCpAfter: 20 });
    expect(result).toBe("best");
  });

  it("classifies a small loss as good", () => {
    const result = classifyMove({ ...base, cpAfter: 5, bestCpAfter: 20 });
    expect(result).toBe("good");
  });

  it("classifies a mid-range loss as an inaccuracy", () => {
    const result = classifyMove({ ...base, cpAfter: -40, bestCpAfter: 20 });
    expect(result).toBe("inaccuracy");
  });

  it("classifies a larger loss as a mistake", () => {
    const result = classifyMove({ ...base, cpAfter: -110, bestCpAfter: 20 });
    expect(result).toBe("mistake");
  });

  it("classifies a severe loss as a blunder", () => {
    const result = classifyMove({ ...base, cpAfter: -290, bestCpAfter: 20 });
    expect(result).toBe("blunder");
  });

  it("always blunders on a missed forced mate regardless of raw cp delta", () => {
    const result = classifyMove({ ...base, cpAfter: 20, bestCpAfter: 20, missedMate: true });
    expect(result).toBe("blunder");
  });

  it("uses tighter endgame thresholds than the middlegame", () => {
    const middlegame = classifyMove({ ...base, phase: "middlegame", cpAfter: -80, bestCpAfter: 20 });
    const endgame = classifyMove({ ...base, phase: "endgame", cpAfter: -80, bestCpAfter: 20 });
    expect(middlegame).toBe("inaccuracy");
    expect(endgame).toBe("mistake");
  });

  it("dampens a large raw cp swing when both sides of it are already decided", () => {
    // Best line: +1200 (already crushing). Actual: +700 (still crushing).
    // Raw cp loss is 500, which alone would be a blunder, but neither side
    // of the swing changes the practical outcome.
    const result = classifyMove({ ...base, cpAfter: 700, bestCpAfter: 1200 });
    expect(result).not.toBe("blunder");
  });
});

describe("cpLossForClassification", () => {
  it("is zero when the played move matches or exceeds the best line", () => {
    expect(cpLossForClassification(50, 20)).toBe(0);
  });

  it("is the positive gap when the played move underperforms", () => {
    expect(cpLossForClassification(-30, 20)).toBe(50);
  });
});

describe("winProbability", () => {
  it("is 0.5 at an even evaluation", () => {
    expect(winProbability(0)).toBeCloseTo(0.5, 5);
  });

  it("approaches 1 for a large positive evaluation", () => {
    expect(winProbability(2000)).toBeGreaterThan(0.99);
  });

  it("approaches 0 for a large negative evaluation", () => {
    expect(winProbability(-2000)).toBeLessThan(0.01);
  });
});

describe("winPctLossForMove", () => {
  it("is zero when the move does not worsen the mover's position", () => {
    expect(winPctLossForMove(20, 20)).toBe(0);
    expect(winPctLossForMove(20, 50)).toBe(0);
  });

  it("is large for a game-losing blunder", () => {
    expect(winPctLossForMove(30, -99900)).toBeGreaterThan(50);
  });

  it("is small for a cp loss in an already-decided position", () => {
    // +1200 → +700: both overwhelmingly winning; win% barely moves
    // (~6 points on the Lichess curve vs 500 raw centipawns).
    expect(winPctLossForMove(1200, 700)).toBeLessThan(8);
  });
});

describe("accuracy from win%-losses", () => {
  it("is 100 for a perfect game with no losses", () => {
    expect(accuracyFromWinPctLosses([])).toBe(100);
  });

  it("scores a near-perfect game above 85", () => {
    // ~15cp losses around equality are ~2 win% points each.
    expect(accuracyFromWinPctLosses([2, 2, 1, 3, 2])).toBeGreaterThan(85);
  });

  it("decreases as losses increase", () => {
    const clean = accuracyFromWinPctLosses([0, 0, 1]);
    const sloppy = accuracyFromWinPctLosses([10, 20, 35]);
    expect(clean).toBeGreaterThan(sloppy);
  });

  it("punishes a single game-losing blunder more than averaging alone would", () => {
    const withBlunder = accuracyFromWinPctLosses([0, 0, 0, 0, 55]);
    const arithmeticOnly =
      [0, 0, 0, 0, 55].map(moveAccuracyFromWinPctLoss).reduce((sum, value) => sum + value, 0) / 5;
    expect(withBlunder).toBeLessThan(arithmeticOnly);
  });

  it("stays within the 0-100 range", () => {
    const value = accuracyFromWinPctLosses([100, 100, 100]);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});
