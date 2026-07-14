import { z } from "zod";

// ── Auth ─────────────────────────────────────────────────────────────────

export const userRoleSchema = z.enum(["player", "coach", "admin"]);
export const userTierSchema = z.enum(["free", "pro", "academy"]);

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: userRoleSchema,
  tier: userTierSchema,
  createdAt: z.number(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const registerRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authResponseSchema = z.object({
  user: publicUserSchema,
  token: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// ── Games / analysis ─────────────────────────────────────────────────────

export const gameSourceSchema = z.enum(["chesscom", "lichess", "manual"]);
export const playerColorSchema = z.enum(["white", "black"]);

export const uploadGamesRequestSchema = z.object({
  pgn: z.string().min(1).max(8_000_000), // body limit is 10mb; leave headroom for JSON overhead
  source: gameSourceSchema.default("manual"),
  /** Username to match against PGN headers to auto-detect the uploader's color per game. */
  playerName: z.string().max(100).optional(),
});
export type UploadGamesRequest = z.infer<typeof uploadGamesRequestSchema>;

export const moveClassificationSchema = z.enum(["best", "good", "inaccuracy", "mistake", "blunder"]);
export type MoveClassification = z.infer<typeof moveClassificationSchema>;
export const gamePhaseSchema = z.enum(["opening", "middlegame", "endgame"]);

export const engineLineSchema = z.object({
  rank: z.number().int(),
  san: z.string().nullable(),
  cp: z.number().int().nullable(),
  mate: z.number().int().nullable(),
});
export type EngineLineSummary = z.infer<typeof engineLineSchema>;

export const analyzedMoveSchema = z.object({
  id: z.string(),
  ply: z.number().int().min(1),
  san: z.string(),
  uci: z.string(),
  fenBefore: z.string(),
  fenAfter: z.string(),
  color: playerColorSchema,
  clockMs: z.number().int().nullable(),
  moveTimeMs: z.number().int().nullable(),
  phase: gamePhaseSchema,
  evalCpBefore: z.number().int().nullable(),
  evalCpAfter: z.number().int().nullable(),
  cpLoss: z.number().int().nullable(),
  classification: moveClassificationSchema.nullable(),
  bestMoveUci: z.string().nullable(),
  bestMoveSan: z.string().nullable(),
  /** Top engine lines considered before this move was played (up to 3), for "what else was on the table". */
  topLines: z.array(engineLineSchema).max(3),
});
export type AnalyzedMove = z.infer<typeof analyzedMoveSchema>;

export const gameSummarySchema = z.object({
  id: z.string(),
  source: gameSourceSchema,
  white: z.string(),
  black: z.string(),
  whiteElo: z.number().int().nullable(),
  blackElo: z.number().int().nullable(),
  playerColor: playerColorSchema.nullable(),
  result: z.string().nullable(),
  timeControl: z.string().nullable(),
  playedAt: z.string().nullable(),
  openingEco: z.string().nullable(),
  openingName: z.string().nullable(),
  plyCount: z.number().int(),
  createdAt: z.number(),
  analysisStatus: z.enum(["queued", "running", "done", "failed"]).nullable(),
  /** The uploader's own-color accuracy once analysis is done; null until then or if color is unknown. */
  accuracy: z.number().nullable(),
  /** True when the uploader's own side had at least one blunder. */
  hadBlunder: z.boolean(),
});
export type GameSummary = z.infer<typeof gameSummarySchema>;

export const analysisStatusSchema = z.enum(["queued", "running", "done", "failed"]);

export const analysisSummarySchema = z.object({
  whiteAccuracy: z.number().nullable(),
  blackAccuracy: z.number().nullable(),
  whiteCounts: z.record(moveClassificationSchema, z.number().int()),
  blackCounts: z.record(moveClassificationSchema, z.number().int()),
});
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export const llmNarrativeSchema = z.object({
  narrative: z.string(),
  model: z.string(),
  generatedAt: z.number(),
});
export type LlmNarrative = z.infer<typeof llmNarrativeSchema>;

export const analysisStateSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  status: analysisStatusSchema,
  progress: z.number().min(0).max(1),
  engineDepth: z.number().int(),
  summary: analysisSummarySchema.nullable(),
  llmNarrative: llmNarrativeSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
});
export type AnalysisState = z.infer<typeof analysisStateSchema>;

export const uploadGamesResponseSchema = z.object({
  games: z.array(
    z.object({
      game: gameSummarySchema,
      analysisId: z.string(),
      parseWarnings: z.array(z.string()),
    }),
  ),
  batchId: z.string(),
  rejected: z.array(z.object({ index: z.number().int(), reason: z.string() })),
});
export type UploadGamesResponse = z.infer<typeof uploadGamesResponseSchema>;

export const gameDetailResponseSchema = z.object({
  game: gameSummarySchema,
  analysis: analysisStateSchema,
  moves: z.array(analyzedMoveSchema),
});
export type GameDetailResponse = z.infer<typeof gameDetailResponseSchema>;

// ── Player model (M2) ────────────────────────────────────────────────────

export const skillCategorySchema = z.enum(["OPENING", "MIDDLEGAME", "ENDGAME", "PSYCHOLOGY_MENTAL"]);
export const trendSchema = z.enum(["up", "down", "flat"]);

export const skillSummarySchema = z.object({
  skillId: z.string(),
  name: z.string(),
  category: skillCategorySchema,
  mastery: z.number().int().min(0).max(100),
  sampleCount: z.number().int().min(0),
  trend: trendSchema,
  /** True once at least one evidence entry has been recorded — distinguishes "not yet observed" from a real low score. */
  hasEvidence: z.boolean(),
  description: z.string(),
  whyItMatters: z.string(),
  assessmentMethod: z.string(),
});
export type SkillSummary = z.infer<typeof skillSummarySchema>;

export const plateauSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  whatHappens: z.string(),
  diagnosisSignal: z.string(),
  averageMastery: z.number(),
});
export type PlateauSummary = z.infer<typeof plateauSummarySchema>;

export const playerModelResponseSchema = z.object({
  level: z.string().nullable(),
  levelName: z.string().nullable(),
  rating: z.number().nullable(),
  confidence: z.number().int().min(0).max(100),
  plateau: plateauSummarySchema.nullable(),
  skills: z.array(skillSummarySchema),
  gamesAnalyzed: z.number().int(),
});
export type PlayerModelResponse = z.infer<typeof playerModelResponseSchema>;

export const playerSnapshotSummarySchema = z.object({
  takenAt: z.number(),
  level: z.string().nullable(),
  plateauDiagnosis: z.string().nullable(),
  confidence: z.number().int(),
  /** Average mastery across only the skills that had evidence at snapshot time — not all 27. */
  avgMasteryOfEvidencedSkills: z.number().nullable(),
  evidencedSkillCount: z.number().int(),
});
export type PlayerSnapshotSummary = z.infer<typeof playerSnapshotSummarySchema>;

export const playerHistoryResponseSchema = z.object({
  snapshots: z.array(playerSnapshotSummarySchema),
});
export type PlayerHistoryResponse = z.infer<typeof playerHistoryResponseSchema>;

export const evidenceReceiptSchema = z.object({
  id: z.string(),
  direction: z.enum(["for", "against", "neutral"]),
  note: z.string().nullable(),
  createdAt: z.number(),
  move: z.object({ san: z.string(), ply: z.number().int(), color: playerColorSchema }),
  game: z.object({ id: z.string(), white: z.string(), black: z.string() }),
});
export type EvidenceReceipt = z.infer<typeof evidenceReceiptSchema>;

// ── Master-game library ──────────────────────────────────────────────────

export const librarySourceSchema = z.enum(["classic", "twic", "lichess", "upload"]);
export type LibrarySource = z.infer<typeof librarySourceSchema>;

export const libraryGameSummarySchema = z.object({
  id: z.string(),
  white: z.string(),
  black: z.string(),
  whiteElo: z.number().int().nullable(),
  blackElo: z.number().int().nullable(),
  result: z.string(),
  eco: z.string().nullable(),
  opening: z.string().nullable(),
  event: z.string().nullable(),
  playedAt: z.string().nullable(),
  plyCount: z.number().int(),
  source: librarySourceSchema,
});
export type LibraryGameSummary = z.infer<typeof libraryGameSummarySchema>;

export const librarySortSchema = z.enum([
  "date_desc",
  "date_asc",
  "white_asc",
  "black_asc",
  "plies_desc",
  "plies_asc",
]);
export type LibrarySort = z.infer<typeof librarySortSchema>;

/** Query for the library browser — all optional; drives search/filter/sort/paging. */
export const libraryGamesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  eco: z.string().trim().max(3).optional(),
  result: z.string().trim().max(7).optional(),
  source: librarySourceSchema.optional(),
  sort: librarySortSchema.default("date_desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type LibraryGamesQuery = z.infer<typeof libraryGamesQuerySchema>;

export const libraryGamesResponseSchema = z.object({
  games: z.array(libraryGameSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type LibraryGamesResponse = z.infer<typeof libraryGamesResponseSchema>;

export const loadLibraryGameResponseSchema = z.object({
  gameId: z.string(),
  analysisId: z.string(),
});
export type LoadLibraryGameResponse = z.infer<typeof loadLibraryGameResponseSchema>;

// ── Opening explorer ─────────────────────────────────────────────────────

export const explorerMoveStatSchema = z.object({
  san: z.string(),
  uci: z.string(),
  total: z.number().int(),
  whiteWins: z.number().int(),
  draws: z.number().int(),
  blackWins: z.number().int(),
  /** One representative game id to "view a game from here" — only present for master stats. */
  sampleGameId: z.string().nullable(),
});
export type ExplorerMoveStat = z.infer<typeof explorerMoveStatSchema>;

export const explorerResponseSchema = z.object({
  fen: z.string(),
  master: z.array(explorerMoveStatSchema),
  personal: z.array(explorerMoveStatSchema),
});
export type ExplorerResponse = z.infer<typeof explorerResponseSchema>;

// ── Drills (M3) ───────────────────────────────────────────────────────────

export const drillKindSchema = z.enum(["tactic", "conversion", "calibration", "counterfactual"]);

export const dueDrillSchema = z.object({
  id: z.string(),
  fen: z.string(),
  correctUci: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  kind: drillKindSchema,
  dueAt: z.number(),
  streak: z.number().int(),
});
export type DueDrill = z.infer<typeof dueDrillSchema>;

export const drillStatsSchema = z.object({
  dueToday: z.number().int(),
  dayStreak: z.number().int(),
  retentionPct: z.number().nullable(),
});
export type DrillStats = z.infer<typeof drillStatsSchema>;

export const submitDrillAttemptRequestSchema = z.object({
  answeredUci: z.string().min(4).max(5),
  msTaken: z.number().int().min(0).nullable(),
});
export type SubmitDrillAttemptRequest = z.infer<typeof submitDrillAttemptRequestSchema>;

export const drillAttemptResultSchema = z.object({
  correct: z.boolean(),
  correctUci: z.string(),
  correctSan: z.string().nullable(),
  nextDueInDays: z.number(),
  streak: z.number().int(),
});
export type DrillAttemptResult = z.infer<typeof drillAttemptResultSchema>;

// ── Prescription / training plan (M3) ───────────────────────────────────

export const bookPickSchema = z.object({
  title: z.string(),
  author: z.string(),
  level: z.string(),
  themes: z.string(),
});

export const focusBlockSchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  mastery: z.number(),
  sampleCount: z.number().int(),
  rationale: z.string(),
  books: z.array(bookPickSchema),
});

export const trainingPlanSchema = z.object({
  generatedAt: z.number(),
  rating: z.number().nullable(),
  levelId: z.string().nullable(),
  plateauId: z.string().nullable(),
  hypothesis: z.string(),
  focusBlocks: z.array(focusBlockSchema),
});
export type TrainingPlanResponse = z.infer<typeof trainingPlanSchema>;

// ── SSE progress events ──────────────────────────────────────────────────

export const analysisProgressEventSchema = z.object({
  analysisId: z.string(),
  status: analysisStatusSchema,
  progress: z.number().min(0).max(1),
  movesDone: z.number().int(),
  movesTotal: z.number().int(),
});
export type AnalysisProgressEvent = z.infer<typeof analysisProgressEventSchema>;

// ── Help / support assistant ─────────────────────────────────────────────

export const helpChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export type HelpChatMessage = z.infer<typeof helpChatMessageSchema>;

export const helpChatRequestSchema = z.object({
  /** Full conversation so far (oldest first), ending with the user's latest question. */
  messages: z.array(helpChatMessageSchema).min(1).max(20),
  /** The screen the user is on, for contextual answers (free-form, optional). */
  screen: z.string().max(40).optional(),
});
export type HelpChatRequest = z.infer<typeof helpChatRequestSchema>;

export const helpChatResponseSchema = z.object({
  answer: z.string(),
  /** False when the LLM backend is unavailable and a deterministic fallback was returned. */
  llmAvailable: z.boolean(),
});
export type HelpChatResponse = z.infer<typeof helpChatResponseSchema>;

// ── Journey / progress ("guide to success") ─────────────────────────────

export const journeyNextActionSchema = z.object({
  title: z.string(),
  detail: z.string(),
  /** Sidebar destination for the CTA. */
  screen: z.enum(["dashboard", "upload", "library", "model", "prescription", "drill"]),
});
export type JourneyNextAction = z.infer<typeof journeyNextActionSchema>;

export const journeyResponseSchema = z.object({
  stats: z.object({
    gamesAnalyzed: z.number().int(),
    evidencedSkillCount: z.number().int(),
    level: z.string().nullable(),
    levelName: z.string().nullable(),
    plateauName: z.string().nullable(),
    dueDrills: z.number().int(),
    drillsCompleted: z.number().int(),
    retentionPct: z.number().nullable(),
  }),
  /** Deterministic, fact-based bullet points about what the player has done. */
  achievements: z.array(z.string()),
  nextAction: journeyNextActionSchema,
  /** AI-narrated coach's summary, grounded in the stats above. */
  narrative: z.string(),
  llmAvailable: z.boolean(),
});
export type JourneyResponse = z.infer<typeof journeyResponseSchema>;
