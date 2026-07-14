import { describe, expect, it } from "vitest";
import { flipSideToMove } from "./fen";

describe("flipSideToMove", () => {
  it("flips white to move to black", () => {
    expect(flipSideToMove("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    );
  });

  it("flips black to move to white", () => {
    expect(flipSideToMove("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("clears the en passant target square", () => {
    expect(flipSideToMove("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3")).toBe(
      "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3",
    );
  });

  it("preserves castling rights", () => {
    expect(flipSideToMove("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 4 20")).toBe("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 4 20");
  });
});
