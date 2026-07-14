import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { enginePool } from "../server/engine/enginePool";
import { evaluatePositions } from "../server/pipeline/evaluator";
import { classifyGameMoves } from "../server/pipeline/classifier";
import { ingestSingleGame } from "../server/pipeline/pgnIngest";
import { db } from "../server/db/client";

/**
 * Reference-game classification test per SRS §7 (taxonomy-mapping /
 * quality gate): an annotated game with a known, unambiguous blunder must
 * be classified as such end-to-end through the real pipeline (ingest ->
 * evaluate -> classify), not just at the unit level.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCHOLARS_MATE_PGN = `[Event "Reference"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

function stockfishAvailable(): boolean {
  const bin = process.env.STOCKFISH_BIN ?? "stockfish";
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync(`test -x ${bin}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

const available = stockfishAvailable();
if (!available) {
  console.warn("[eval] STOCKFISH_BIN not found — skipping classification pipeline test.");
}

describe.skipIf(!available)("end-to-end classification against a known reference game", () => {
  beforeAll(() => {
    migrate(db, { migrationsFolder: path.join(__dirname, "../server/db/migrations") });
  });

  afterAll(() => {
    enginePool.dispose();
  });

  it("flags the Scholar's Mate defensive blunder (4...Nf6??) and nothing else as a blunder", async () => {
    const game = ingestSingleGame(SCHOLARS_MATE_PGN, "manual");
    const fens = [game.moves[0].fenBefore, ...game.moves.map((move) => move.fenAfter)];
    const positions = await evaluatePositions(fens, { depth: 14, multipv: 1 });
    const classified = classifyGameMoves(game.moves, positions);

    const blunders = classified.filter((move) => move.classification === "blunder");
    expect(blunders).toHaveLength(1);
    expect(blunders[0].san).toBe("Nf6");
    expect(blunders[0].color).toBe("black");

    const matingMove = classified.find((move) => move.san === "Qxf7#");
    expect(matingMove?.classification).toBe("best");
  }, 30_000);
});
