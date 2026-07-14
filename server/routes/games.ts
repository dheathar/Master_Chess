import crypto from "node:crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, rawSqlite } from "../db/client";
import { games, moves, analyses } from "../db/schema";
import { requireAuth } from "../auth/middleware";
import { dailyLimitFor, quotaRemaining, tryConsumeQuota } from "../auth/usageQuota";
import { ingestPgnBatch, splitPgnGames } from "../pipeline/pgnIngest";
import { createAnalysisRecord, enqueueAnalysis, onAnalysisProgress } from "../pipeline/analysisQueue";
import {
  uploadGamesRequestSchema,
  type UploadGamesResponse,
  type GameSummary,
  type GameDetailResponse,
  type AnalysisState,
  type AnalyzedMove,
  type AnalysisSummary,
} from "@shared/api";

export const gamesRouter = Router();

const ENGINE_DEPTH = Number(process.env.ENGINE_DEPTH ?? 16);

function toGameSummary(
  row: typeof games.$inferSelect,
  analysisRow?: typeof analyses.$inferSelect | null,
): GameSummary {
  const summary = analysisRow?.summaryJson ? (JSON.parse(analysisRow.summaryJson) as AnalysisSummary) : null;
  const accuracy = row.playerColor === "white" ? (summary?.whiteAccuracy ?? null) : summary?.blackAccuracy ?? null;
  const counts = row.playerColor === "white" ? summary?.whiteCounts : summary?.blackCounts;
  return {
    id: row.id,
    source: row.source,
    white: row.white,
    black: row.black,
    whiteElo: row.whiteElo,
    blackElo: row.blackElo,
    playerColor: row.playerColor,
    result: row.result,
    timeControl: row.timeControl,
    playedAt: row.playedAt,
    openingEco: row.openingEco,
    openingName: row.openingName,
    plyCount: row.plyCount,
    createdAt: row.createdAt,
    analysisStatus: analysisRow?.status ?? null,
    accuracy,
    hadBlunder: (counts?.blunder ?? 0) > 0,
  };
}

function toAnalysisState(row: typeof analyses.$inferSelect): AnalysisState {
  return {
    id: row.id,
    gameId: row.gameId,
    status: row.status,
    progress: row.progress / 1000,
    engineDepth: row.engineDepth,
    summary: row.summaryJson ? (JSON.parse(row.summaryJson) as AnalysisSummary) : null,
    llmNarrative: row.llmNarrativeJson ? (JSON.parse(row.llmNarrativeJson) as AnalysisState["llmNarrative"]) : null,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

function toAnalyzedMove(row: typeof moves.$inferSelect): AnalyzedMove {
  let topLines: AnalyzedMove["topLines"] = [];
  if (row.multipvJson) {
    try {
      const rawLines = JSON.parse(row.multipvJson) as Array<{ rank: number; san: string | null; cp: number | null; mate: number | null }>;
      // Stored cp/mate are from the mover's perspective (UCI convention); flip
      // to White-perspective so this list reads consistently with the eval
      // bar and evalCpBefore/After elsewhere on the same page.
      const sign = row.color === "white" ? 1 : -1;
      topLines = rawLines
        .slice(0, 3)
        .map((line) => ({
          rank: line.rank,
          san: line.san,
          cp: line.cp === null ? null : line.cp * sign,
          mate: line.mate === null ? null : line.mate * sign,
        }));
    } catch {
      topLines = [];
    }
  }

  return {
    id: row.id,
    ply: row.ply,
    san: row.san,
    uci: row.uci,
    fenBefore: row.fenBefore,
    fenAfter: row.fenAfter,
    color: row.color,
    clockMs: row.clockMs,
    moveTimeMs: row.moveTimeMs,
    phase: row.phase ?? "middlegame",
    evalCpBefore: row.evalCpBefore,
    evalCpAfter: row.evalCpAfter,
    cpLoss: row.cpLoss,
    classification: row.classification,
    bestMoveUci: row.bestMoveUci,
    bestMoveSan: row.bestMoveSan,
    topLines,
  };
}

/** Hard cap on games per upload — a 10MB multi-thousand-game export must not block the event loop. */
const MAX_GAMES_PER_BATCH = 50;

/** Content hash of a game (players + date + result + move sequence) for re-upload dedupe. */
function pgnContentHash(ingested: { white: string; black: string; result: string | null; playedAt: string | null; moves: { uci: string }[] }): string {
  const movetext = ingested.moves.map((m) => m.uci).join(" ");
  return crypto
    .createHash("sha256")
    .update(`${ingested.white}|${ingested.black}|${ingested.result ?? ""}|${ingested.playedAt ?? ""}|${movetext}`)
    .digest("hex");
}

/** Anonymous access is intentionally not wired to routes yet in M1 — every route below requires auth. */
gamesRouter.post("/upload", requireAuth, (req, res) => {
  const parsed = uploadGamesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    return;
  }

  const user = req.user!;
  const subjectKey = user.id;
  const limit = dailyLimitFor(user.tier);

  // Enforce the batch cap on the raw game count BEFORE the (expensive, full
  // chess.js replay) parse, so a multi-thousand-game export is rejected without
  // blocking the event loop parsing games we'll never keep.
  const gameCount = splitPgnGames(parsed.data.pgn).length;
  if (gameCount > MAX_GAMES_PER_BATCH) {
    res.status(413).json({
      error: `Too many games in one upload (${gameCount}). The limit is ${MAX_GAMES_PER_BATCH} per batch — split the export and upload in parts.`,
    });
    return;
  }

  const ingestResult = ingestPgnBatch(parsed.data.pgn, parsed.data.source, parsed.data.playerName);

  // Dedupe re-uploads: a game already in the user's library (or repeated within
  // this batch) is skipped so its evidence isn't folded into the player model a
  // second time. Filtered BEFORE charging quota so duplicates cost nothing.
  const batchSeen = new Set<string>();
  const rejected = [...ingestResult.rejected];
  const fresh: Array<{ ingested: (typeof ingestResult.games)[number]; hash: string }> = [];
  ingestResult.games.forEach((ingested, index) => {
    const hash = pgnContentHash(ingested);
    const dupeInDb = !!db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.userId, user.id), eq(games.pgnHash, hash)))
      .get();
    if (batchSeen.has(hash) || dupeInDb) {
      rejected.push({ index, reason: "Duplicate of a game already in your library — skipped." });
      return;
    }
    batchSeen.add(hash);
    fresh.push({ ingested, hash });
  });

  // Atomic check-and-charge: concurrent uploads cannot both pass a stale
  // limit check. Only fresh (non-duplicate) games are charged.
  if (fresh.length > 0 && !tryConsumeQuota(subjectKey, limit, fresh.length)) {
    const remaining = quotaRemaining(subjectKey, user.tier) ?? 0;
    res.status(429).json({
      error: `Daily analysis limit reached (${limit}/day on the ${user.tier} tier). ${remaining} analyses remaining today.`,
    });
    return;
  }

  const batchId = crypto.randomUUID();
  const response: UploadGamesResponse = { games: [], batchId, rejected };
  const analysisIdsToEnqueue: string[] = [];

  // All rows for the batch are written in one transaction so a crash cannot
  // leave orphan games with partial move lists.
  const writeBatch = rawSqlite.transaction(() => {
    for (const { ingested, hash } of fresh) {
      const gameId = crypto.randomUUID();
      db.insert(games)
        .values({
          id: gameId,
          userId: user.id,
          source: parsed.data.source,
          pgnRaw: ingested.pgn,
          white: ingested.white,
          black: ingested.black,
          whiteElo: ingested.whiteElo,
          blackElo: ingested.blackElo,
          playerColor: ingested.playerColor,
          result: ingested.result,
          timeControl: ingested.timeControl,
          playedAt: ingested.playedAt,
          openingEco: ingested.openingEco,
          openingName: ingested.openingName,
          plyCount: ingested.moves.length,
          importBatchId: batchId,
          pgnHash: hash,
          createdAt: Date.now(),
        })
        .run();

      for (const move of ingested.moves) {
        db.insert(moves)
          .values({
            id: crypto.randomUUID(),
            gameId,
            ply: move.ply,
            san: move.san,
            uci: move.uci,
            fenBefore: move.fenBefore,
            fenAfter: move.fenAfter,
            color: move.color,
            clockMs: move.clockMs,
            moveTimeMs: move.moveTimeMs,
          })
          .run();
      }

      const analysisId = createAnalysisRecord(gameId, user.id, ENGINE_DEPTH);
      analysisIdsToEnqueue.push(analysisId);

      const gameRow = db.select().from(games).where(eq(games.id, gameId)).get()!;
      response.games.push({
        game: toGameSummary(gameRow),
        analysisId,
        parseWarnings: ingested.warnings,
      });
    }
  });
  writeBatch();

  // Enqueue only after the transaction commits so workers never see partial rows.
  for (const analysisId of analysisIdsToEnqueue) {
    enqueueAnalysis(analysisId);
  }

  res.status(201).json(response);
});

gamesRouter.get("/", requireAuth, (req, res) => {
  const rows = db
    .select()
    .from(games)
    .where(eq(games.userId, req.user!.id))
    .orderBy(desc(games.createdAt))
    .all();

  const summaries = rows.map((row) => {
    const analysisRow = db
      .select()
      .from(analyses)
      .where(eq(analyses.gameId, row.id))
      .orderBy(desc(analyses.createdAt))
      .get();
    return toGameSummary(row, analysisRow);
  });

  res.json({ games: summaries });
});

gamesRouter.get("/:gameId", requireAuth, (req, res) => {
  const gameRow = db.select().from(games).where(eq(games.id, req.params.gameId)).get();
  if (!gameRow || gameRow.userId !== req.user!.id) {
    res.status(404).json({ error: "Game not found." });
    return;
  }
  const analysisRow = db
    .select()
    .from(analyses)
    .where(eq(analyses.gameId, gameRow.id))
    .orderBy(desc(analyses.createdAt))
    .get();
  const moveRows = db.select().from(moves).where(eq(moves.gameId, gameRow.id)).all().sort((a, b) => a.ply - b.ply);

  const response: GameDetailResponse = {
    game: toGameSummary(gameRow, analysisRow),
    analysis: analysisRow
      ? toAnalysisState(analysisRow)
      : {
          id: "",
          gameId: gameRow.id,
          status: "queued",
          progress: 0,
          engineDepth: ENGINE_DEPTH,
          summary: null,
          llmNarrative: null,
          error: null,
          createdAt: Date.now(),
          finishedAt: null,
        },
    moves: moveRows.map(toAnalyzedMove),
  };
  res.json(response);
});

/** Server-sent events stream of analysis progress for a single analysis id. */
gamesRouter.get("/analysis/:analysisId/stream", requireAuth, (req, res) => {
  const analysisId = req.params.analysisId;
  const analysisRow = db.select().from(analyses).where(eq(analyses.id, analysisId)).get();
  if (!analysisRow || analysisRow.userId !== req.user!.id) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  send({
    analysisId,
    status: analysisRow.status,
    progress: analysisRow.progress / 1000,
    movesDone: 0,
    movesTotal: 0,
  });

  // Already finished: close immediately so the client's EventSource doesn't
  // reconnect forever against a stream that will never emit again.
  if (analysisRow.status === "done" || analysisRow.status === "failed") {
    res.end();
    return;
  }

  // Heartbeat comments keep idle proxies from killing long-running streams.
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);
  heartbeat.unref();

  const unsubscribe = onAnalysisProgress(analysisId, (event) => {
    send(event);
    if (event.status === "done" || event.status === "failed") {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    }
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
