# Master Chess — AI-Enhanced Standalone App

**Diagnose → Explain → Prescribe.** A player uploads their own games; the system builds
a persistent, explainable model of their chess ability and prescribes exactly what to
study next — grounded in engine truth, never in LLM guesswork.

This document is the source of truth for the standalone app in `ai_chess/`. It is
independent of the sibling `agentic-chess` classroom product — no code is shared at
runtime; proven modules are ported by copy where noted.

---

## 1. Vision & Positioning

Every competitor in this space (Chess.com, Lichess, Aimchess, Chessvia, Chessiro, Magnus
Trainer) runs Stockfish and produces, at best, a thin narrative layer over engine lines.
None of them:

- persist a **structured, explainable player model** across games,
- close the loop from **diagnosis to a prioritized training plan**,
- ground every AI claim so it **cannot contradict the engine**,
- or offer a **coach/academy tier** with real multi-student diagnostics.

Master Chess's wedge is closing that full loop, and then going further with AI-native
functionality no competitor has attempted (§3).

## 2. The Two Learning Loops

Per the SRS, the system has exactly two places where "learning" happens — the LLM is
not one of them:

1. **Player Model & Skill-Tracking Engine** — a persistent, structured representation
   of the player across 23 skills (4 categories, 7 levels), updated by Bayesian
   Knowledge Tracing from engine-verified evidence in every game and drill.
2. **Chess Knowledge Layer** — engine + tablebase ground truth, opening/master-game
   data, and a 65-title book corpus mapped to the skill taxonomy.

The **AI Reasoning Layer** sits on top of both, producing prose explanations and
structuring prescriptions. It is provider-abstracted, model-tiered by subscription, and
**always subordinate to engine ground truth** — a runtime claim-guard rejects any
generated text that contradicts a verified move or evaluation.

## 3. Unseen Functionality — the Differentiators

Each of these is a genuine mechanism, not a marketing label. They're phased into M2–M5
(§7) but designed for from day one so the schema and pipeline don't need rework later.

### Shadow Twin
A sparring bot that plays like *you*, not like a fixed-strength engine. At analysis
time we build a per-player **error model**: for each phase × skill-demand bucket, the
empirical probability of {best, good, inaccuracy, mistake, blunder} and the cp-loss
distribution within each class, drawn from the player's own classified move history.
At play time, Stockfish returns multipv candidates; we classify them by cp-loss,
contextually reweight the error-class distribution by the skills the position
currently demands (a tactical position inflates P(blunder) for a player weak in
tactical pattern recognition specifically), sample a class, then softmax-sample a move
within it. The result: a bot that hangs pieces the way *you* hang pieces, in the
positions where you're statistically most likely to. A "beat your past self" ladder
tracks win rate against successive snapshots of your own error model over time. The
identical selector, fed an opponent's error model instead, powers the Opponent Dossier
imitation bot below.

### Evidence Receipts
Every skill score is a claim, and every claim has a receipt. The skill-inference layer
writes an `evidence` row every time a rule fires against a move — direction (for/against),
weight, and the exact move it came from. The player model UI is never just a number; it's
a number with a "show me" that jumps straight to the 6 moves across your last 4 games that
prove you're weak at prophylaxis. This is what makes the diagnosis trustworthy instead of
a black box, and it falls out of the pipeline design for free rather than being bolted on.

### Counterfactual Time Machine
At any critical moment (a position where the top engine lines diverge sharply in
evaluation), the player can branch: "what if I'd played the top engine move instead?"
The system replays forward from that branch with the engine playing both sides at a
matched strength, so the player sees not just "you should have played Nf6" but the
resulting position 6 moves later, engine-narrated. Branches are stored, not thrown away,
so a player builds a personal library of "moments that mattered."

### Eval-Calibration Trainer
Before the engine's evaluation is revealed for a position, the player predicts it
(a slider, ±. Winning for me / equal / winning for opponent, refined to a cp guess at
higher levels). Calibration — the gap between predicted and actual eval — is tracked
as its own metacognitive skill, distinct from tactical accuracy. Chronically
overconfident players (who predict "winning" in equal positions) get flagged
differently than chronically blind ones, because the fix is different.

### Opponent-Prep Dossier
Ingest an opponent's public games (same PGN pipeline, tagged as "opponent" rather than
"self"). Produces a tendency report — opening repertoire, time-management patterns,
common tactical/positional weaknesses — using the identical skill-inference rules run
against a third party. Feeds a Shadow-Twin-style imitation bot for pre-tournament
sparring against a simulation of your actual next opponent.

### Multi-Coach Debate Panel
For genuinely ambiguous positions, spin up 2–3 coach personas (already modeled in the
architecture as tunable archetypes) who argue for different plans, citing engine lines
to support their case. The student picks a side and states why; the engine arbitrates
who was actually right. This turns "just tell me the answer" into a structured
disagreement the player has to reason through — closer to how strong players actually
train with seconds.

### Tilt / Fatigue Telemetry
Chess.com and Lichess exports carry `%clk` (clock remaining) per move. Cross-referencing
move time against accuracy within a single game surfaces the pattern where a player's
error rate spikes after a specific elapsed time or after a blunder earlier in the same
game ("tilt"). Session-level aggregation recommends breaks before it happens again,
pulling the pitch's "Phase 2 — Fatigue Awareness" feature forward without any wearable
integration: the signal is already sitting in every PGN export.

### Plateau-Breaker Programs
The five named plateaus from the Player Framework (Blunder Wall, Strategy Desert,
Conversion Ceiling, Prophylaxis Gap, Precision Boundary) are auto-diagnosed from the
skill vector's shape, not self-reported. Each diagnosis triggers a structured multi-week
program — not just "here are some drills" but a sequenced plan with a stated hypothesis
("you're not converting won endgames") and a checkpoint re-diagnosis at the end.

### Own-Mistake Drills
The simplest and most concretely differentiating feature: every drill in the review
queue is generated from a position the player *actually reached and misplayed*, not a
generic puzzle. SM-2-lite spacing brings it back until it's fixed. A generic puzzle
book teaches patterns in the abstract; this teaches the exact gap in your own play.

## 4. Architecture

### 4.1 Repo Layout

Single `package.json`, no workspaces — the sibling app proves this is sufficient at this
scale and avoids multi-tsconfig/vitest-project friction. Isomorphic domain logic lives in
`shared/` and is imported by relative path from both `server/` and `client/`.

```
ai_chess/
├── package.json              # scripts: dev, build, test, eval, db:migrate, db:studio
├── tsconfig.json              # paths: @shared/* → shared/*
├── vite.config.ts             # client root, dev server :5175, proxy /api → :8030
├── drizzle.config.ts
├── .env.example
├── shared/
│   ├── taxonomy.ts            # 23 skills / 4 categories / 7 levels / 5 plateaus
│   ├── classification.ts      # cp-loss → blunder/mistake/inaccuracy thresholds
│   ├── bkt.ts                 # Bayesian Knowledge Tracing (ported)
│   ├── reviewSchedule.ts      # SM-2-lite (ported)
│   ├── playerModel.ts         # skill vector, level mapping, plateau rules
│   ├── evidence.ts            # evidence-receipt types
│   └── api.ts                 # zod request/response schemas, shared client↔server
├── server/
│   ├── index.ts
│   ├── db/
│   │   ├── schema.ts           # drizzle schema (§4.2)
│   │   ├── client.ts           # better-sqlite3, WAL mode
│   │   └── migrations/
│   ├── auth/                   # PBKDF2, roles, tiers, sessions, gdpr.ts
│   ├── engine/
│   │   ├── stockfish.ts        # ported UCI wrapper
│   │   ├── enginePool.ts       # N-process pool, round-robin, health restart
│   │   └── evalCache.ts        # DB-backed FEN→eval cache + in-memory LRU
│   ├── pipeline/                # pgnIngest, analysisQueue, evaluator, classifier,
│   │                             # skillInference (M2), playerModelUpdater (M2), narrator (M4)
│   ├── llm/                     # provider abstraction, router, tiering, claimGuard (M4)
│   ├── agents/                  # ported agent loop, coach chat, debate panel (M4)
│   ├── features/                # shadowTwin, counterfactual, calibration, tilt, dossier (M5)
│   ├── prescription/            # prescriptionEngine, bookCorpus, repertoire, drillFactory (M3)
│   └── routes/                  # auth, games, analyses, playerModel, prescriptions, ...
├── client/
│   ├── index.html
│   └── src/                     # React 19 + zustand
├── eval/                        # QA harness: ground-truth corpus + vitest suites
│   ├── corpus/positions.json
│   ├── corpus/games/*.pgn
│   └── *.eval.test.ts
└── data/                        # gitignored: sqlite file, fixtures
```

### 4.2 Database — SQLite via Drizzle, Postgres-ready

SQLite (`better-sqlite3`) for zero-config local development; discipline kept for a clean
Postgres migration later (text UUID PKs, epoch-ms timestamps, JSON as validated text
columns, no SQLite-only SQL, all access through Drizzle).

| Table | Key columns | Milestone |
|---|---|---|
| `users` | id, email, password_hash/salt/iterations, role (player\|coach\|admin), tier (free\|pro\|academy), display_name, created_at, deleted_at | M0 |
| `sessions` | token, user_id, created_at, expires_at, ip_hash | M0 |
| `usage_counters` | user_id\|ip_hash, day, analyses_used | M0 |
| `coach_students` | coach_id, student_id, status | M5 |
| `games` | id, user_id, source, pgn_raw, white/black, player_color, result, time_control, played_at, opening_eco, import_batch_id | M1 |
| `moves` | id, game_id, ply, san, uci, fen_before, fen_after, clock_ms, move_time_ms, phase, eval_cp_before/after, cp_loss, classification, best_move_uci, multipv_json | M1 |
| `eval_cache` | fen_key, depth, multipv, engine_version → PK; best_move, lines_json, computed_at | M1 |
| `analyses` | id, game_id, user_id, status, progress, engine_depth, summary_json, llm_narrative_json, created_at, finished_at | M1 |
| `skill_scores` | id, user_id, skill_id, category, p_know, mastery_0_100, sample_count, trend, updated_at | M2 |
| `evidence` | id, skill_score_id, move_id, analysis_id, direction, weight, rule_id, note | M2 |
| `player_snapshots` | id, user_id, taken_at, skill_vector_json, level, plateau_diagnosis, confidence | M2 |
| `prescriptions` | id, user_id, created_at, plan_json, source_snapshot_id, status | M3 |
| `drills` | id, user_id, source_move_id, fen, correct_uci, skill_id, kind, created_from_analysis_id | M3 |
| `review_queue` | id, user_id, drill_id, due_at, interval_days, ease, streak, lapses | M3 |
| `drill_attempts` | id, drill_id, user_id, answered_uci, correct, ms_taken, eval_prediction_cp, created_at | M3 |
| `dossiers` | id, owner_user_id, opponent_name, source_game_ids_json, report_json, error_model_json | M5 |
| `training_programs` | id, user_id, plateau, week_plan_json, started_at, status | M5 |
| `audit_log` | id, user_id, actor_id, action, entity, entity_id, detail_json, at | M0 (GDPR events) |

All tables are defined in `schema.ts` from M0 so migrations stay linear even though
most stay empty until their milestone lands.

### 4.3 Game-Analysis Pipeline

| Module | Responsibility |
|---|---|
| `pgnIngest.ts` | Split multi-game exports, `chess.loadPgn`, `getHeaders()`, `history({verbose:true})` for before/after FENs, parse `%clk`, detect player color, per-game error isolation |
| `analysisQueue.ts` | In-process promise queue, concurrency = engine pool size, jobs persisted in `analyses` for resume, progress via SSE |
| `evaluator.ts` | Per-ply: `eval_cache` lookup (normalized FEN+depth+multipv+engine_version) → miss → `enginePool` (depth ~16, multipv 4) → write-through |
| `classifier.ts` | Phase detection, cp-loss from mover's perspective, phase-scaled thresholds, win%-dampening at extreme evals |
| `skillInference.ts` (M2) | Rule engine: motif detectors (hanging piece, missed fork/pin, bad trade, passed-pawn mishandling, time-scramble, conversion failure, prophylaxis miss) → evidence rows |
| `playerModelUpdater.ts` (M2) | Folds evidence into per-skill BKT, recomputes level + plateau, writes snapshot |
| `narrator.ts` (M4) | LLM prose layer; runs last, receives only verified facts, output re-checked by claim guard |

### 4.4 LLM Provider Abstraction (M4, designed now)

```ts
interface LlmProvider {
  readonly name: string;                 // "ollama" | "openrouter" | "anthropic"
  complete(req: LlmRequest): Promise<LlmResponse>;
  stream(req: LlmRequest): AsyncIterable<LlmStreamEvent>;
}
```

Call sites request a **capability** (`narrate | coach-chat | debate | dossier`) plus the
user's tier; `modelTiers.ts` maps tier to an ordered fallback chain terminating in a
deterministic, engine-only template narration. Local development defaults to **Ollama
running `gemma4:32k`** (already installed, zero API cost, no key required) so the full
loop is testable offline; Pro/Academy tiers in a deployed environment would route to
hosted models (OpenRouter/Anthropic) via the same interface — swapping providers is a
config change, never a call-site change. Streaming is used for chat surfaces only
(coach chat, debate panel); batch analysis narration is a single validated call.

### 4.5 Shadow Twin — Implementation Sketch

1. Build the error model from classified move history: per phase × skill-demand bucket,
   `P(class)` for {best, good, inaccuracy, mistake, blunder} plus cp-loss mean/σ per class.
2. At each bot move: `enginePool.evaluate(fen, {multipv: 8, depth: 12})`.
3. Classify the 8 candidates by cp-loss into the same five buckets.
4. Reweight bucket probabilities by the active skill-demand of the position (using the
   same motif detectors as `skillInference.ts`).
5. Sample a bucket, then softmax-sample a move within it by `exp(-cpLoss/τ)`.
6. Deterministic seed per game for reproducible testing.

### 4.6 Evaluation / QA Harness

- `groundTruth.eval.test.ts` — known positions (mate-in-N, famous blunders), asserts
  engine wrapper returns the correct best move / eval sign; skips with a warning if
  `STOCKFISH_BIN` is unset.
- `classification.eval.test.ts` — annotated reference PGNs, asserts classifier
  precision/recall against expected labels within tolerance bands.
- `taxonomyMapping.eval.test.ts` (M2) — every evidence rule maps to a valid skill; every
  skill reachable by ≥1 rule; every plateau derivable from some skill-vector shape.
- `claimGuard.eval.test.ts` (M4) — adversarial fake LLM outputs, asserts contradictions
  with engine facts are caught and stripped/regenerated.
- `shadowTwin.eval.test.ts` (M5) — seeded profiles, asserts sampled cp-loss distribution
  matches the target error model within tolerance.

## 5. User Classes & Tiers

- **Anonymous visitor** — limited analyses per day (ip-hash quota), no persistence.
- **Player (Free / Pro)** — full player model, history, prescriptions per tier limits.
- **Coach / Academy** — manages multiple student player models, aggregated progress.
- **Admin** — operational role, separated from player roles.

## 6. Non-Functional Requirements

- **GDPR** — export (all rows keyed by user_id → JSON bundle) and delete (hard-delete +
  tombstone + audit entry) from day one; no user-scoped table reachable without an
  owning check at the route layer.
- **Cost governance** — usage counters gate free-tier and anonymous analysis volume;
  local Ollama removes LLM cost entirely from the development loop.
- **Engine authority** — the reasoning layer is never permitted to override engine or
  tablebase verdicts; enforced by the claim guard, tested continuously (§4.6).

## 7. Milestones

| Milestone | Scope | Demoable |
|---|---|---|
| **M0** | Scaffold, schema + migrations, auth (roles/tiers/sessions), taxonomy constants | Register, log in, empty dashboard |
| **M1** | pgnIngest → enginePool + evalCache → classifier → analysis queue with SSE; GameReview UI | Upload a real PGN export, watch analysis stream, review move-by-move with classifications |
| **M2** | skillInference, evidence receipts, BKT updates, snapshots, level + plateau diagnosis; SkillRadar UI | "You're L3, Blunder Wall — here are the 14 moves that prove it" |
| **M3** | Prescription engine, book corpus, own-mistake drills + review queue, calibration trainer | Personalized plan; daily drill session |
| **M4** | LLM provider abstraction (Ollama-first) + tiering + claim guard, narrator, coach chat, debate panel; QA harness complete | Engine-grounded prose and chat, fully local |
| **M5** | Shadow Twin arena, counterfactual replay, opponent dossier, tilt detection, plateau programs, coach multi-student views, GDPR UI, tier gating | Full investor-deck demo |

This session builds **M0 and M1**.

---
*Master Chess · Internal architecture document · July 2026*
