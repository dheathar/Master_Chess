import { describe, expect, it } from "vitest";
import { inferSkillEvidence } from "./skillInference";
import type { ClassifiedMove } from "./classifier";
import type { MoveClassification, GamePhase } from "@shared/classification";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ClassifiedMove> & { ply: number; color: "white" | "black" }): ClassifiedMove {
  return {
    san: "e4",
    uci: "e2e4",
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    clockMs: null,
    moveTimeMs: null,
    phase: "middlegame" as GamePhase,
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

describe("inferSkillEvidence — opening phase", () => {
  it("counts an opening blunder against opening_principles", () => {
    const moves = [move({ ply: 1, color: "white", phase: "opening", classification: "blunder", cpLoss: 350 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "opening_principles", direction: "against" }));
  });

  it("credits clean opening play lightly", () => {
    const moves = [move({ ply: 1, color: "white", phase: "opening", classification: "best", cpLoss: 0 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "opening_principles", direction: "for" }));
  });

  it("ignores the opponent's opening moves", () => {
    const moves = [move({ ply: 1, color: "black", phase: "opening", classification: "blunder", cpLoss: 350 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toHaveLength(0);
  });
});

describe("inferSkillEvidence — middlegame tactics", () => {
  it("fires tactical_consistency and tactical_pattern_recognition on a blunder", () => {
    const moves = [move({ ply: 20, color: "white", phase: "middlegame", classification: "blunder", cpLoss: 400 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence.map((e) => e.skillId)).toEqual(
      expect.arrayContaining(["tactical_consistency", "tactical_pattern_recognition"]),
    );
    expect(evidence.every((e) => e.direction === "against" || e.skillId === "piece_activity_coordination")).toBe(true);
  });

  it("fires only tactical_pattern_recognition on a mistake", () => {
    const moves = [move({ ply: 20, color: "white", phase: "middlegame", classification: "mistake", cpLoss: 150 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    const skillIds = evidence.map((e) => e.skillId);
    expect(skillIds).toContain("tactical_pattern_recognition");
    expect(skillIds).not.toContain("tactical_consistency");
  });

  it("credits a held blunder-check lightly", () => {
    const moves = [move({ ply: 20, color: "white", phase: "middlegame", classification: "good", cpLoss: 10 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "tactical_consistency", direction: "for" }));
  });

  it("attributes a genuinely missed forced mate (missedMate flag) to calculation_precision", () => {
    const moves = [
      move({ ply: 20, color: "white", phase: "middlegame", classification: "blunder", cpLoss: 100_649, missedMate: true }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "calculation_precision", direction: "against", weight: 1 }));
    // The missed-mate branch is exclusive of the ordinary blunder rules...
    expect(evidence.map((e) => e.skillId)).not.toContain("tactical_consistency");
    // ...and it never leaks the encoded ~100000cp magnitude into the receipt.
    const receipt = evidence.find((e) => e.ruleId === "missed-forced-mate");
    expect(receipt?.note).not.toMatch(/\d{4,}cp/);
  });

  it("treats a huge-cpLoss blunder that is NOT a missed mate (walked into mate) as a tactical blunder, not a calculation miss", () => {
    // The Scholar's-Mate victim: the mover had no mate, they blundered INTO one.
    const moves = [
      move({ ply: 6, color: "black", phase: "opening", classification: "blunder", cpLoss: 100_649, missedMate: false }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "black", result: "1-0" });
    // Opening blunder → opening_principles, never calculation_precision "missed mate".
    expect(evidence.map((e) => e.skillId)).not.toContain("calculation_precision");
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "opening_principles", direction: "against" }));
    // And the receipt humanizes the mate-magnitude loss instead of printing it.
    const opening = evidence.find((e) => e.ruleId === "opening-error");
    expect(opening?.note).toMatch(/allowed a forced mate/);
    expect(opening?.note).not.toMatch(/\d{4,}cp/);
  });
});

describe("inferSkillEvidence — hanging piece (board-level check)", () => {
  const HANGING_BISHOP_FEN = "4k3/8/8/b7/8/8/3Q4/4K3 w - - 0 1"; // black bishop a5, attacked by white queen d2, undefended

  it("fires piece_activity_coordination when a blunder leaves a piece hanging", () => {
    const moves = [
      move({ ply: 21, color: "black", phase: "middlegame", classification: "blunder", cpLoss: 300, fenAfter: HANGING_BISHOP_FEN, san: "Ba5" }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "black", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "piece_activity_coordination", direction: "against" }));
  });

  it("does not fire when the move was not flagged an error (avoids penalizing intentional sacrifices)", () => {
    const moves = [
      move({ ply: 21, color: "black", phase: "middlegame", classification: "best", cpLoss: 0, fenAfter: HANGING_BISHOP_FEN, san: "Ba5" }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "black", result: null });
    expect(evidence.map((e) => e.skillId)).not.toContain("piece_activity_coordination");
  });
});

describe("inferSkillEvidence — endgame material-signature attribution", () => {
  const PAWN_ENDGAME_FEN = "8/4k3/8/8/8/8/4K3/8 w - - 0 1"; // kings + pawns only (no pawns here, but no other pieces either)
  const ROOK_ENDGAME_FEN = "4k3/8/8/8/8/8/4K3/R7 w - - 0 1";
  const KNIGHT_ENDGAME_FEN = "4k3/8/8/8/8/8/4K3/N7 w - - 0 1";
  const BISHOP_ENDGAME_FEN = "4k3/8/8/8/8/8/4K3/B7 w - - 0 1";

  it("attributes an endgame error to pawn_endings when no pieces are on the board", () => {
    const moves = [
      move({ ply: 41, color: "white", phase: "endgame", classification: "mistake", cpLoss: 150, fenBefore: PAWN_ENDGAME_FEN }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "pawn_endings", direction: "against" }));
  });

  it("attributes an endgame error to rook_endings with only rooks on board", () => {
    const moves = [
      move({ ply: 41, color: "white", phase: "endgame", classification: "mistake", cpLoss: 150, fenBefore: ROOK_ENDGAME_FEN }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "rook_endings", direction: "against" }));
  });

  it("attributes an endgame error to knight_endings with only knights on board", () => {
    const moves = [
      move({ ply: 41, color: "white", phase: "endgame", classification: "mistake", cpLoss: 150, fenBefore: KNIGHT_ENDGAME_FEN }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "knight_endings", direction: "against" }));
  });

  it("attributes an endgame error to bishop_mixed_endings with only bishops on board", () => {
    const moves = [
      move({ ply: 41, color: "white", phase: "endgame", classification: "mistake", cpLoss: 150, fenBefore: BISHOP_ENDGAME_FEN }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "bishop_mixed_endings", direction: "against" }));
  });

  it("also always fires the generic endgame skills alongside the specific one", () => {
    const moves = [
      move({ ply: 41, color: "white", phase: "endgame", classification: "mistake", cpLoss: 150, fenBefore: ROOK_ENDGAME_FEN }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    const skillIds = evidence.map((e) => e.skillId);
    expect(skillIds).toEqual(expect.arrayContaining(["endgame_principles", "endgame_precision_conversion", "rook_endings"]));
  });
});

describe("inferSkillEvidence — time management", () => {
  it("flags a snap blunder against time_management", () => {
    const moves = [
      move({ ply: 20, color: "white", phase: "middlegame", classification: "blunder", cpLoss: 300, moveTimeMs: 1500 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "time_management", direction: "against" }));
  });

  it("flags a slow-but-wrong move against thought_process_candidate_moves", () => {
    const moves = [
      move({ ply: 20, color: "white", phase: "middlegame", classification: "mistake", cpLoss: 150, moveTimeMs: 120_000 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "thought_process_candidate_moves", direction: "against" }));
  });

  it("does not fire either time rule for a mid-range think", () => {
    const moves = [
      move({ ply: 20, color: "white", phase: "middlegame", classification: "mistake", cpLoss: 150, moveTimeMs: 20_000 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    const skillIds = evidence.map((e) => e.skillId);
    expect(skillIds).not.toContain("time_management");
    expect(skillIds).not.toContain("thought_process_candidate_moves");
  });
});

describe("inferSkillEvidence — conversion failure", () => {
  it("fires against converting_advantages when a winning position is not converted to a win", () => {
    const moves = [
      move({ ply: 30, color: "white", phase: "middlegame", classification: "good", evalCpAfter: 500 }),
      move({ ply: 31, color: "black", phase: "middlegame", classification: "good", evalCpAfter: 500 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: "1/2-1/2" });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "converting_advantages", direction: "against" }));
  });

  it("does not fire when the player won", () => {
    const moves = [move({ ply: 30, color: "white", phase: "middlegame", classification: "good", evalCpAfter: 500 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: "1-0" });
    expect(evidence.map((e) => e.skillId)).not.toContain("converting_advantages");
  });
});

describe("inferSkillEvidence — attack/initiative and defence/counterplay", () => {
  it("credits sustained initiative when eval climbs from near-equal to decisive", () => {
    const moves = [
      move({ ply: 21, color: "white", phase: "middlegame", classification: "good", evalCpAfter: 30 }),
      move({ ply: 22, color: "black", phase: "middlegame", classification: "good", evalCpAfter: 30 }),
      move({ ply: 23, color: "white", phase: "middlegame", classification: "best", evalCpAfter: 600 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: "1-0" });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "attack_initiative", direction: "for" }));
  });

  it("credits holding a worse position to a draw as defence_counterplay", () => {
    const moves = [
      move({ ply: 21, color: "white", phase: "middlegame", classification: "mistake", evalCpAfter: -350 }),
      move({ ply: 22, color: "black", phase: "middlegame", classification: "good", evalCpAfter: -350 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: "1/2-1/2" });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "defence_counterplay", direction: "for" }));
  });

  it("does not credit defence_counterplay when the player lost", () => {
    const moves = [move({ ply: 21, color: "white", phase: "middlegame", classification: "mistake", evalCpAfter: -350 })];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: "0-1" });
    expect(evidence.map((e) => e.skillId)).not.toContain("defence_counterplay");
  });
});

describe("inferSkillEvidence — resilience", () => {
  function gameWithClusteredErrors(): ClassifiedMove[] {
    // 12 white moves: 5 quiet, then blunder, then 6 worse ones (tilt pattern).
    return [
      move({ ply: 1, color: "white", classification: "best", cpLoss: 5 }),
      move({ ply: 3, color: "white", classification: "best", cpLoss: 10 }),
      move({ ply: 5, color: "white", classification: "good", cpLoss: 15 }),
      move({ ply: 7, color: "white", classification: "best", cpLoss: 8 }),
      move({ ply: 9, color: "white", classification: "good", cpLoss: 12 }),
      move({ ply: 11, color: "white", classification: "blunder", cpLoss: 320 }),
      move({ ply: 13, color: "white", classification: "mistake", cpLoss: 140 }),
      move({ ply: 15, color: "white", classification: "mistake", cpLoss: 160 }),
      move({ ply: 17, color: "white", classification: "mistake", cpLoss: 180 }),
      move({ ply: 19, color: "white", classification: "mistake", cpLoss: 150 }),
      move({ ply: 21, color: "white", classification: "mistake", cpLoss: 170 }),
      move({ ply: 23, color: "white", classification: "mistake", cpLoss: 155 }),
    ];
  }

  it("flags post-blunder tilt when errors cluster after the first blunder", () => {
    const evidence = inferSkillEvidence(gameWithClusteredErrors(), { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "psychological_resilience", direction: "against", ruleId: "post-blunder-tilt" }));
  });

  it("credits recovery when cp-loss stays controlled after an early blunder", () => {
    // 12 moves: 5 before blunder, then blunder, then 6 with low cp-loss (recovery pattern).
    const moves = [
      move({ ply: 1, color: "white", classification: "best", cpLoss: 15 }),
      move({ ply: 3, color: "white", classification: "mistake", cpLoss: 40 }),
      move({ ply: 5, color: "white", classification: "mistake", cpLoss: 50 }),
      move({ ply: 7, color: "white", classification: "good", cpLoss: 20 }),
      move({ ply: 9, color: "white", classification: "good", cpLoss: 18 }),
      move({ ply: 11, color: "white", classification: "blunder", cpLoss: 320 }),
      move({ ply: 13, color: "white", classification: "good", cpLoss: 10 }),
      move({ ply: 15, color: "white", classification: "best", cpLoss: 5 }),
      move({ ply: 17, color: "white", classification: "best", cpLoss: 0 }),
      move({ ply: 19, color: "white", classification: "good", cpLoss: 15 }),
      move({ ply: 21, color: "white", classification: "best", cpLoss: 8 }),
      move({ ply: 23, color: "white", classification: "best", cpLoss: 3 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence).toContainEqual(expect.objectContaining({ skillId: "psychological_resilience", direction: "for", ruleId: "post-blunder-recovery" }));
  });

  it("does not evaluate resilience for very short games", () => {
    const moves = [
      move({ ply: 1, color: "white", classification: "blunder", cpLoss: 320 }),
      move({ ply: 3, color: "white", classification: "best", cpLoss: 5 }),
    ];
    const evidence = inferSkillEvidence(moves, { playerColor: "white", result: null });
    expect(evidence.map((e) => e.skillId)).not.toContain("psychological_resilience");
  });
});
