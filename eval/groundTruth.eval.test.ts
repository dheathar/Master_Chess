import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { enginePool } from "../server/engine/enginePool";

/**
 * Ground-truth corpus tests per SRS §7: "A fixed corpus of positions with
 * known engine verdicts; any reasoning output contradicting them fails the
 * build." This suite exercises the engine wrapper directly (not the LLM
 * layer, which doesn't exist until M4) — it is the foundation the future
 * claim-guard will be checked against.
 *
 * Skips with a warning if STOCKFISH_BIN is not resolvable, matching the
 * sibling app's graceful-degradation posture rather than failing CI on
 * machines without the engine installed.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(path.join(__dirname, "corpus/positions.json"), "utf8")) as Array<{
  name: string;
  fen: string;
  expectedBestMoveUci?: string;
  expectedMateIn?: number;
  expectedEvalSign?: "positive" | "negative";
  expectedEvalRangeCp?: [number, number];
}>;

function stockfishAvailable(): boolean {
  const bin = process.env.STOCKFISH_BIN ?? "stockfish";
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    if (bin.startsWith("/") || bin.startsWith(".")) {
      try {
        execSync(`test -x ${bin}`, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

const available = stockfishAvailable();
if (!available) {
  console.warn(
    "[eval] STOCKFISH_BIN not found — skipping ground-truth engine tests. Set STOCKFISH_BIN to run this suite.",
  );
}

describe.skipIf(!available)("ground-truth engine corpus", () => {
  afterAll(() => {
    enginePool.dispose();
  });

  for (const position of corpus) {
    it(`${position.name}`, async () => {
      const evaluation = await enginePool.evaluate(position.fen, { depth: 14, multipv: 1, timeoutMs: 6000 });

      if (position.expectedBestMoveUci) {
        expect(evaluation.bestMove).toBe(position.expectedBestMoveUci);
      }

      const topLine = evaluation.lines[0];

      if (position.expectedMateIn !== undefined) {
        expect(topLine?.mate).not.toBeNull();
        expect(Math.abs(topLine!.mate!)).toBeLessThanOrEqual(position.expectedMateIn);
      }

      if (position.expectedEvalSign) {
        const cp = topLine?.mate ? (topLine.mate > 0 ? 1 : -1) * 100_000 : topLine?.cp ?? 0;
        if (position.expectedEvalSign === "positive") {
          expect(cp).toBeGreaterThan(0);
        } else {
          expect(cp).toBeLessThan(0);
        }
      }

      if (position.expectedEvalRangeCp) {
        const [min, max] = position.expectedEvalRangeCp;
        expect(topLine?.cp ?? 0).toBeGreaterThanOrEqual(min);
        expect(topLine?.cp ?? 0).toBeLessThanOrEqual(max);
      }
    }, 15_000);
  }
});
