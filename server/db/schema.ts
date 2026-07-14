import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Auth & users (M0) ────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["player", "coach", "admin"] }).notNull().default("player"),
  tier: text("tier", { enum: ["free", "pro", "academy"] }).notNull().default("free"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const sessions = sqliteTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    ipHash: text("ip_hash"),
  },
  (table) => ({
    userIdx: index("sessions_user_idx").on(table.userId),
    expiresIdx: index("sessions_expires_idx").on(table.expiresAt),
  }),
);

export const usageCounters = sqliteTable(
  "usage_counters",
  {
    subjectKey: text("subject_key").notNull(), // user_id or ip_hash
    day: text("day").notNull(), // YYYY-MM-DD
    analysesUsed: integer("analyses_used").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.subjectKey, table.day] }),
  }),
);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detailJson: text("detail_json"),
  at: integer("at").notNull(),
});

// ── Coach / academy (M5, table exists from M0 for linear migrations) ─────

export const coachStudents = sqliteTable(
  "coach_students",
  {
    coachId: text("coach_id").notNull().references(() => users.id),
    studentId: text("student_id").notNull().references(() => users.id),
    status: text("status", { enum: ["active", "invited", "removed"] }).notNull().default("invited"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.coachId, table.studentId] }),
  }),
);

// ── Games & moves (M1) ───────────────────────────────────────────────────

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    source: text("source", { enum: ["chesscom", "lichess", "manual"] }).notNull(),
    pgnRaw: text("pgn_raw").notNull(),
    white: text("white").notNull(),
    black: text("black").notNull(),
    whiteElo: integer("white_elo"),
    blackElo: integer("black_elo"),
    playerColor: text("player_color", { enum: ["white", "black"] }),
    result: text("result"),
    timeControl: text("time_control"),
    playedAt: text("played_at"),
    openingEco: text("opening_eco"),
    openingName: text("opening_name"),
    plyCount: integer("ply_count").notNull().default(0),
    importBatchId: text("import_batch_id"),
    /** Content hash of the movetext — dedupes re-uploads so evidence isn't double-folded into the player model. */
    pgnHash: text("pgn_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    userIdx: index("games_user_idx").on(table.userId, table.createdAt),
    userPgnHashIdx: index("games_user_pgn_hash_idx").on(table.userId, table.pgnHash),
  }),
);

export const moves = sqliteTable(
  "moves",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => games.id),
    ply: integer("ply").notNull(),
    san: text("san").notNull(),
    uci: text("uci").notNull(),
    fenBefore: text("fen_before").notNull(),
    fenAfter: text("fen_after").notNull(),
    color: text("color", { enum: ["white", "black"] }).notNull(),
    clockMs: integer("clock_ms"),
    moveTimeMs: integer("move_time_ms"),
    phase: text("phase", { enum: ["opening", "middlegame", "endgame"] }),
    evalCpBefore: integer("eval_cp_before"),
    evalCpAfter: integer("eval_cp_after"),
    cpLoss: integer("cp_loss"),
    classification: text("classification", { enum: ["best", "good", "inaccuracy", "mistake", "blunder"] }),
    bestMoveUci: text("best_move_uci"),
    bestMoveSan: text("best_move_san"),
    multipvJson: text("multipv_json"),
    missedMate: integer("missed_mate", { mode: "boolean" }),
  },
  (table) => ({
    gamePlyIdx: index("moves_game_ply_idx").on(table.gameId, table.ply),
    // Range-scannable by normalized-FEN prefix for the personal opening explorer.
    fenBeforeIdx: index("moves_fen_before_idx").on(table.fenBefore),
  }),
);

// ── Master-game library (Chess Knowledge Layer, SRS §3.2) ────────────────

export const libraryGames = sqliteTable(
  "library_games",
  {
    id: text("id").primaryKey(),
    white: text("white").notNull(),
    black: text("black").notNull(),
    whiteElo: integer("white_elo"),
    blackElo: integer("black_elo"),
    result: text("result").notNull(),
    eco: text("eco"),
    opening: text("opening"),
    event: text("event"),
    playedAt: text("played_at"),
    source: text("source", { enum: ["classic", "twic", "lichess", "upload"] }).notNull(),
    /** Space-separated SAN movetext — compact storage; replay derives FENs client-side. */
    sanMoves: text("san_moves").notNull(),
    plyCount: integer("ply_count").notNull(),
    /** SHA-256 over players+date+movetext; blocks duplicate imports. */
    dedupeHash: text("dedupe_hash").notNull().unique(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    ecoIdx: index("library_games_eco_idx").on(table.eco),
    whiteIdx: index("library_games_white_idx").on(table.white),
    blackIdx: index("library_games_black_idx").on(table.black),
  }),
);

/**
 * Aggregated opening-tree ("book") rows: for a normalized position key, each
 * move that was played in library games with W/D/L tallies. Aggregation
 * happens at import time so explorer queries are a single indexed read.
 */
export const libraryPositions = sqliteTable(
  "library_positions",
  {
    fenKey: text("fen_key").notNull(),
    san: text("san").notNull(),
    uci: text("uci").notNull(),
    whiteWins: integer("white_wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    blackWins: integer("black_wins").notNull().default(0),
    total: integer("total").notNull().default(0),
    /** One representative game for "view a game from here". */
    sampleGameId: text("sample_game_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fenKey, table.san] }),
  }),
);

export const evalCache = sqliteTable(
  "eval_cache",
  {
    fenKey: text("fen_key").notNull(),
    depth: integer("depth").notNull(),
    multipv: integer("multipv").notNull(),
    engineVersion: text("engine_version").notNull(),
    bestMove: text("best_move"),
    linesJson: text("lines_json").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fenKey, table.depth, table.multipv, table.engineVersion] }),
  }),
);

export const analyses = sqliteTable(
  "analyses",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull().references(() => games.id),
    userId: text("user_id").notNull().references(() => users.id),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0), // stored as 0-1000 int, presented as 0-1
    engineDepth: integer("engine_depth").notNull(),
    summaryJson: text("summary_json"),
    llmNarrativeJson: text("llm_narrative_json"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => ({
    gameIdx: index("analyses_game_idx").on(table.gameId, table.createdAt),
    userIdx: index("analyses_user_idx").on(table.userId),
  }),
);

// ── Player model (M2) ────────────────────────────────────────────────────

export const skillScores = sqliteTable(
  "skill_scores",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    skillId: text("skill_id").notNull(),
    category: text("category").notNull(),
    pKnow: integer("p_know").notNull(), // stored *1000
    mastery: integer("mastery").notNull(), // 0-100
    sampleCount: integer("sample_count").notNull().default(0),
    trend: text("trend", { enum: ["up", "down", "flat"] }).notNull().default("flat"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userSkillUnique: uniqueIndex("skill_scores_user_skill_unique").on(table.userId, table.skillId),
  }),
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    skillScoreId: text("skill_score_id").notNull().references(() => skillScores.id),
    moveId: text("move_id").notNull().references(() => moves.id),
    analysisId: text("analysis_id").notNull().references(() => analyses.id),
    direction: text("direction", { enum: ["for", "against", "neutral"] }).notNull(),
    weight: integer("weight").notNull(), // stored *1000
    ruleId: text("rule_id").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    skillScoreIdx: index("evidence_skill_score_idx").on(table.skillScoreId, table.createdAt),
  }),
);

export const playerSnapshots = sqliteTable(
  "player_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    takenAt: integer("taken_at").notNull(),
    skillVectorJson: text("skill_vector_json").notNull(),
    /** Null when no PGN-header rating data exists yet to place the player on the 7-level scale. */
    level: text("level"),
    plateauDiagnosis: text("plateau_diagnosis"),
    confidence: integer("confidence").notNull(),
  },
  (table) => ({
    userIdx: index("player_snapshots_user_idx").on(table.userId, table.takenAt),
  }),
);

// ── Prescription / drills (M3) ───────────────────────────────────────────

export const prescriptions = sqliteTable("prescriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: integer("created_at").notNull(),
  planJson: text("plan_json").notNull(),
  sourceSnapshotId: text("source_snapshot_id"),
  status: text("status", { enum: ["active", "completed", "archived"] }).notNull().default("active"),
});

export const drills = sqliteTable("drills", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  sourceMoveId: text("source_move_id").references(() => moves.id),
  fen: text("fen").notNull(),
  correctUci: text("correct_uci").notNull(),
  skillId: text("skill_id").notNull(),
  kind: text("kind", { enum: ["tactic", "conversion", "calibration", "counterfactual"] }).notNull(),
  createdFromAnalysisId: text("created_from_analysis_id"),
  createdAt: integer("created_at").notNull(),
});

export const reviewQueue = sqliteTable("review_queue", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  drillId: text("drill_id").notNull().references(() => drills.id),
  dueAt: integer("due_at").notNull(),
  intervalDays: integer("interval_days").notNull().default(0), // stored *1000 (millidays) to keep sub-day precision
  ease: integer("ease").notNull(), // stored *1000
  streak: integer("streak").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
});

export const drillAttempts = sqliteTable("drill_attempts", {
  id: text("id").primaryKey(),
  drillId: text("drill_id").notNull().references(() => drills.id),
  userId: text("user_id").notNull().references(() => users.id),
  answeredUci: text("answered_uci"),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  msTaken: integer("ms_taken"),
  evalPredictionCp: integer("eval_prediction_cp"),
  createdAt: integer("created_at").notNull(),
});

// ── Dossier / programs (M5) ──────────────────────────────────────────────

export const dossiers = sqliteTable("dossiers", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  opponentName: text("opponent_name").notNull(),
  sourceGameIdsJson: text("source_game_ids_json").notNull(),
  reportJson: text("report_json"),
  errorModelJson: text("error_model_json"),
  createdAt: integer("created_at").notNull(),
});

export const trainingPrograms = sqliteTable("training_programs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  plateau: text("plateau").notNull(),
  weekPlanJson: text("week_plan_json").notNull(),
  startedAt: integer("started_at").notNull(),
  status: text("status", { enum: ["active", "completed", "abandoned"] }).notNull().default("active"),
});
