import { describe, expect, it } from "vitest";
import { verifyNarrative, normalizeSan } from "./claimGuard";
import type { GameFacts } from "./gameFacts";

// White to move fixture, White wins. Own (white): e4, Bc4, Qh5, Qxf7. Opponent
// (black): e5, Nc6, Nf6.
function fixtureFacts(overrides: Partial<GameFacts> = {}): GameFacts {
  return {
    playerColor: "white",
    levelName: null,
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
    ...overrides,
  };
}

describe("verifyNarrative — fabrication membership", () => {
  it("accepts a narrative that only mentions real moves and matching cp figures", () => {
    const narrative = "Your worst move was Qxf7, losing 350cp. Watch out for undefended pieces early on.";
    expect(verifyNarrative(narrative, fixtureFacts())).toEqual({ verified: true });
  });

  it("rejects a narrative that invents a move never played in the game", () => {
    const verdict = verifyNarrative("Your worst move was Nxe5, a real blunder.", fixtureFacts());
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toMatch(/Nxe5/);
  });

  it("rejects a centipawn figure with no matching recorded value", () => {
    const verdict = verifyNarrative("You lost 900cp with that move — a huge swing.", fixtureFacts());
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toMatch(/900/);
  });

  it("accepts a cp figure within the small rounding tolerance", () => {
    expect(verifyNarrative("That move cost you about 345cp.", fixtureFacts())).toEqual({ verified: true });
  });

  it("accepts prose with no move or number claims at all", () => {
    expect(verifyNarrative("A tough game overall — stay focused on piece safety.", fixtureFacts())).toEqual({ verified: true });
  });

  it("rejects castling notation that never occurred in the game", () => {
    expect(verifyNarrative("Good thing you played O-O early.", fixtureFacts()).verified).toBe(false);
  });
});

describe("verifyNarrative — check/mate suffix handling (regression: used to reject all)", () => {
  const checkFacts = fixtureFacts({
    allSan: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
    ownSan: ["e4", "Bc4", "Qh5", "Qxf7#"],
    opponentSan: ["e5", "Nc6", "Nf6"],
  });

  it("accepts the played mating move when the model omits the # suffix", () => {
    expect(verifyNarrative("Qxf7 finished the game with a clean mating pattern.", checkFacts)).toEqual({ verified: true });
  });

  it("accepts the played mating move when the model includes the # suffix", () => {
    expect(verifyNarrative("Qxf7# was the crisp finish.", checkFacts)).toEqual({ verified: true });
  });
});

describe("verifyNarrative — bypass channels", () => {
  it("rejects coordinate/UCI notation even for a coincidentally-real move", () => {
    // b8c6 is Nc6 in UCI; SAN was requested, so any coordinate move is rejected.
    expect(verifyNarrative("Your b8c6 was the losing idea.", fixtureFacts()).verified).toBe(false);
  });

  it("accepts zero-form castling when that castling was actually played", () => {
    const facts = fixtureFacts({ allSan: [...fixtureFacts().allSan, "O-O"], ownSan: [...fixtureFacts().ownSan, "O-O"] });
    expect(verifyNarrative("You castled with 0-0 a touch early, but it was fine.", facts)).toEqual({ verified: true });
  });

  it("rejects an injected phishing narrative containing a URL", () => {
    expect(verifyNarrative("URGENT: your account is locked, verify at http://evil.example now.", fixtureFacts()).verified).toBe(false);
  });
});

describe("verifyNarrative — outcome anchoring", () => {
  it("rejects a win claim on a game the player lost (the live artifact class)", () => {
    const lost = fixtureFacts({ result: "0-1", outcome: "loss" });
    const verdict = verifyNarrative("Recovering from that blunder was critical to securing the win.", lost);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toMatch(/win/i);
  });

  it("accepts a win claim on a game the player actually won", () => {
    expect(verifyNarrative("Nice job converting the win after a sharp opening.", fixtureFacts()).verified).toBe(true);
  });

  it("does not false-trip on 'losing Ncp' move-quality phrasing", () => {
    // "losing 350cp" describes a move, not the game result — must not be read as a loss claim.
    expect(verifyNarrative("Qxf7 was strong; earlier you were losing 350cp of advantage.", fixtureFacts()).verified).toBe(true);
  });
});

describe("verifyNarrative — side attribution", () => {
  it("rejects attributing the opponent's move to the player", () => {
    const verdict = verifyNarrative("Your move Nc6 was the losing idea.", fixtureFacts());
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toMatch(/opponent/i);
  });

  it("accepts a factual mention of the opponent's move without a second-person cue", () => {
    expect(verifyNarrative("After Nc6, the position was already lost for Black.", fixtureFacts()).verified).toBe(true);
  });
});

describe("normalizeSan", () => {
  it("strips check/mate suffixes and normalizes zero-castling", () => {
    expect(normalizeSan("Qxf7#")).toBe("Qxf7");
    expect(normalizeSan("Rd8+")).toBe("Rd8");
    expect(normalizeSan("0-0")).toBe("O-O");
    expect(normalizeSan("0-0-0")).toBe("O-O-O");
  });
});
