import { beforeEach, describe, expect, it, vi } from "vitest";
import { findProphylaxisCandidates } from "./prophylaxisProbe";
import type { ClassifiedMove } from "./classifier";
import type { GamePhase, MoveClassification } from "@shared/classification";

const probeMock = vi.fn();
vi.mock("../engine/evalCache", () => ({
  evaluateWithCache: (...args: unknown[]) => probeMock(...args),
}));

// A real, legal, NOT-in-check position with White to move (Italian/Ruy-ish).
const WHITE_TO_MOVE_FEN = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
// A real, legal position where White is IN CHECK (black queen h4 checks e1 down the diagonal).
const WHITE_IN_CHECK_FEN = "4k3/8/8/8/7q/8/8/4K3 w - - 0 1";

function move(overrides: Partial<ClassifiedMove> & { fenBefore: string }): ClassifiedMove {
  return {
    ply: 20,
    san: "Bd3",
    uci: "f1d3",
    fenAfter: "irrelevant",
    color: "white",
    clockMs: null,
    moveTimeMs: null,
    phase: "middlegame" as GamePhase,
    evalCpBefore: 0,
    evalCpAfter: 0,
    cpLoss: 0,
    classification: "good" as MoveClassification,
    bestMoveUci: null,
    bestMoveSan: null,
    multipvJson: "[]",
    missedMate: false,
    ...overrides,
  };
}

// A player move (white) followed by an opponent reply carrying evalCpAfter.
function sequence(playerEvalBefore: number, opponentEvalAfter: number): ClassifiedMove[] {
  return [
    move({ ply: 20, color: "white", fenBefore: WHITE_TO_MOVE_FEN, evalCpBefore: playerEvalBefore }),
    move({ ply: 21, color: "black", fenBefore: "irrelevant", evalCpAfter: opponentEvalAfter }),
  ];
}

describe("findProphylaxisCandidates", () => {
  beforeEach(() => probeMock.mockReset());

  it("never probes an in-check position (would flip to an illegal, king-capturable FEN)", async () => {
    const moves = [
      move({ ply: 20, color: "white", fenBefore: WHITE_IN_CHECK_FEN, evalCpBefore: 0 }),
      move({ ply: 21, color: "black", fenBefore: "irrelevant", evalCpAfter: -400 }),
    ];
    const result = await findProphylaxisCandidates(moves, "white");
    expect(probeMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("flags a threat that landed as an 'against' candidate", async () => {
    probeMock.mockResolvedValueOnce({ lines: [{ cp: 500, san: "Qxh7" }] });
    const result = await findProphylaxisCandidates(sequence(0, -400), "white");
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ direction: "against", threatMoveSan: "Qxh7", threatCp: 500, swingAfterCp: 400 });
  });

  it("flags a real threat the player neutralized as a 'for' candidate", async () => {
    probeMock.mockResolvedValueOnce({ lines: [{ cp: 500, san: "Qxh7" }] });
    const result = await findProphylaxisCandidates(sequence(0, 50), "white"); // held: no bad swing
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ direction: "for", threatCp: 500 });
  });

  it("maps a mate-scored standing threat instead of dropping it", async () => {
    probeMock.mockResolvedValueOnce({ lines: [{ cp: null, mate: 2, san: "Qh7#" }] });
    const result = await findProphylaxisCandidates(sequence(0, -400), "white");
    expect(result).toHaveLength(1);
    expect(result[0].threatMoveSan).toBe("Qh7#");
    expect(result[0].threatCp).toBeGreaterThan(90_000);
  });

  it("does not flag when the free-move delta is below the threat threshold", async () => {
    probeMock.mockResolvedValueOnce({ lines: [{ cp: 100, san: "Nf3" }] }); // threatCp = 0 + 100 < 300
    const result = await findProphylaxisCandidates(sequence(0, -400), "white");
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it("skips opening-phase moves", async () => {
    const moves = [
      move({ ply: 6, color: "white", fenBefore: WHITE_TO_MOVE_FEN, phase: "opening", evalCpBefore: 0 }),
      move({ ply: 7, color: "black", fenBefore: "irrelevant", evalCpAfter: -400 }),
    ];
    const result = await findProphylaxisCandidates(moves, "white");
    expect(probeMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("does not probe a position that is already decided", async () => {
    // Player already +1500 — nothing to prophylax.
    const result = await findProphylaxisCandidates(sequence(1500, 1200), "white");
    expect(probeMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
