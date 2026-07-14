import { describe, expect, it } from "vitest";
import { ingestPgnBatch, ingestSingleGame, splitPgnGames } from "./pgnIngest";

const SCHOLARS_MATE_PGN = `[Event "Casual Game"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[WhiteElo "1200"]
[BlackElo "1180"]
[TimeControl "600"]
[ECO "C50"]

1. e4 {[%clk 0:10:00]} e5 {[%clk 0:10:00]} 2. Bc4 {[%clk 0:09:55]} Nc6 {[%clk 0:09:50]} 3. Qh5 {[%clk 0:09:48]} Nf6 {[%clk 0:09:20]} 4. Qxf7# {[%clk 0:09:40]} 1-0`;

describe("splitPgnGames", () => {
  it("splits a multi-game export into individual game texts", () => {
    const combined = `${SCHOLARS_MATE_PGN}\n\n${SCHOLARS_MATE_PGN.replace("Alice", "Carol")}`;
    const games = splitPgnGames(combined);
    expect(games).toHaveLength(2);
    expect(games[0]).toContain("Alice");
    expect(games[1]).toContain("Carol");
  });

  it("returns an empty array for blank input", () => {
    expect(splitPgnGames("")).toEqual([]);
    expect(splitPgnGames("   \n  ")).toEqual([]);
  });

  it("does not split inside a brace comment that contains an [Event line (regression)", () => {
    const withCommentEvent = `[Event "Real Game"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 { annotator note:
[Event "not a real header, just quoted inside a comment"] } e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
    const games = splitPgnGames(withCommentEvent);
    expect(games).toHaveLength(1);
    expect(games[0]).toContain("Real Game");
  });
});

describe("ingestSingleGame", () => {
  it("extracts headers, moves, and %clk telemetry", () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "chesscom", "Alice");
    expect(game.white).toBe("Alice");
    expect(game.black).toBe("Bob");
    expect(game.whiteElo).toBe(1200);
    expect(game.playerColor).toBe("white");
    expect(game.moves).toHaveLength(7);
    expect(game.moves[0].san).toBe("e4");
    expect(game.moves[0].uci).toBe("e2e4");
    expect(game.moves[0].clockMs).toBe(600_000);
    expect(game.moves[5].san).toBe("Nf6");
    expect(game.moves[5].fenBefore).toContain("b");
  });

  it("derives per-move think time from consecutive same-color clocks", () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "chesscom", "Alice");
    // First move of each color has no prior clock reading — stays null.
    expect(game.moves[0].moveTimeMs).toBeNull();
    expect(game.moves[1].moveTimeMs).toBeNull();
    // White's 2nd move: 10:00 → 9:55 = 5s (TimeControl "600", no increment).
    expect(game.moves[2].moveTimeMs).toBe(5_000);
    // Black's 2nd move: 10:00 → 9:50 = 10s.
    expect(game.moves[3].moveTimeMs).toBe(10_000);
    // White's 3rd move: 9:55 → 9:48 = 7s.
    expect(game.moves[4].moveTimeMs).toBe(7_000);
  });

  it("detects the player's color case-insensitively", () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "chesscom", "bob");
    expect(game.playerColor).toBe("black");
  });

  it("leaves playerColor null when no name is given", () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "chesscom");
    expect(game.playerColor).toBeNull();
    expect(game.warnings).toEqual([]);
  });

  it("warns when a provided player name matches neither side", () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "chesscom", "Zebediah");
    expect(game.playerColor).toBeNull();
    expect(game.warnings).toHaveLength(1);
    expect(game.warnings[0]).toMatch(/Zebediah/);
    expect(game.warnings[0]).toMatch(/player model/i);
  });

  it("produces before/after FENs that chain correctly", () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "chesscom");
    for (let i = 1; i < game.moves.length; i += 1) {
      expect(game.moves[i].fenBefore).toBe(game.moves[i - 1].fenAfter);
    }
  });
});

describe("ingestPgnBatch", () => {
  it("ingests all valid games and reports none rejected for a clean batch", () => {
    const result = ingestPgnBatch(SCHOLARS_MATE_PGN, "chesscom", "Alice");
    expect(result.games).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("isolates a malformed game so the rest of the batch still ingests", () => {
    const malformed = `[Event "Broken"]\n[White "X"]\n[Black "Y"]\n\n1. e4 e5 2. NOTAMOVE $$$ *`;
    const combined = `${SCHOLARS_MATE_PGN}\n\n${malformed}`;
    const result = ingestPgnBatch(combined, "manual");
    expect(result.games).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
  });

  it("rejects a syntactically valid but move-free game", () => {
    const empty = `[Event "Empty"]\n[White "X"]\n[Black "Y"]\n\n*`;
    const result = ingestPgnBatch(empty, "manual");
    expect(result.games).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/no legal moves/i);
  });
});
