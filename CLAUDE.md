# Master Chess — Project Constitution

> **Read this first.** This file is the source of truth for anyone (human or agent)
> working on Master Chess. It records what the app *is*, how it works, the
> invariants that must not be broken, and the mistakes already made so they are
> not repeated. When something here conflicts with your assumptions, this file
> wins — or update it in the same change.

---

## 1. What this is

**Master Chess** is an adaptive educational chess tutor. A player uploads their
own games (PGN); the server analyses every move with Stockfish and builds a
persistent, **explainable** model of the player across a **27-skill** taxonomy.
It then diagnoses the player's **level** and **plateau**, prescribes a
personalised **training plan** with matched reading, and harvests the player's
own mistakes into spaced-repetition **drills**.

The loop is **Diagnose → Explain → Prescribe**, and the guiding principle is:
**every score has a receipt** — it links back to the exact moves that produced
it. No black box.

This is a **standalone product**. The sibling `agentic-chess` app in the parent
directory (a classroom/teacher-student tutor) is a *different* product; no code
is shared at runtime. Do not conflate them. In particular, the teacher/student
dashboards belong to that other app, **not** this one.

The full product vision lives in [`MASTERPLAN.md`](MASTERPLAN.md).

---

## 2. Stack & how to run

- **Client:** React + Vite (dev port **5173**).
- **Server:** Express on `tsx` (default port **8030**).
- **DB:** SQLite via Drizzle ORM (`better-sqlite3`, WAL mode).
- **Engine:** Stockfish over UCI, pooled (`ENGINE_DEPTH` default 16, multi-PV 4).
- **LLM:** provider-abstracted; local **Ollama** by default, hosted models by tier.

```bash
npm install
cp .env.example .env      # then set STOCKFISH_BIN to a real Stockfish path
npm run dev               # client + server together
npm test                  # vitest (excludes the eval suite)
npm run eval              # engine/classifier ground-truth suite (needs STOCKFISH_BIN)
npm run db:migrate        # apply Drizzle migrations
npm run db:generate       # generate a migration after editing schema.ts
```

`data/masterchess.db` is created on first run. It is **gitignored** and contains
real user data — never commit it, never paste its rows into anything shared.

---

## 3. Architecture in one screen

Two places do "learning"; **the LLM is neither**:

1. **Player Model** (`shared/bkt.ts`, `server/pipeline/playerModelUpdater.ts`) —
   Bayesian Knowledge Tracing over the 27 skills, updated from engine-verified
   evidence.
2. **Chess Knowledge Layer** — Stockfish ground truth, the master-game/opening
   library, and the book corpus (`shared/bookCorpus.json`).

The **AI reasoning layer** (`server/llm/`) only writes prose, and is always
subordinate to engine truth. A runtime **claim guard** (`server/llm/claimGuard.ts`)
rejects any generated sentence that contradicts a verified move or evaluation;
on rejection the app falls back to a deterministic, engine-only summary.

**Pipeline** (`server/pipeline/`): `pgnIngest` → `analysisQueue` (Stockfish eval,
cached) → `classifier` → `skillInference` + `openingInference` + prophylaxis probe
→ `playerModelUpdater` (BKT + snapshot) → `drillFactory` → `prescriptionEngine`
→ `narrator`. Engine analysis is committed and shown **before** the enrichment
step runs; enrichment is failure-isolated and idempotent (a restart never
double-counts evidence).

Isomorphic domain logic is in `shared/` (imported by both client and server via
the `@shared/*` path alias). Key files: `taxonomy.ts` (27 skills / 7 levels /
5 plateaus — the single source of truth), `classification.ts` (cp-loss →
verdict), `bkt.ts`, `reviewSchedule.ts` (SM-2), `playerModel.ts` (plateau
diagnosis), `api.ts` (zod schemas shared client↔server).

---

## 4. Invariants — do not break these

- **27 skills, 7 levels, 5 plateaus.** The count is 27 (a runtime assertion in
  `taxonomy.ts` enforces it). Older copy said "23" — that was stale and has been
  corrected everywhere. Do not reintroduce "23".
- **Engine authority.** The LLM may only phrase facts it is handed. It may never
  introduce a move, number, or verdict. Any change to the narrator/coach must
  keep the claim guard in front of it.
- **Every score has a receipt.** Skill changes must write an `evidence` row that
  cites the exact move and rule. Don't add a scoring path that moves mastery
  without a receipt.
- **Honest by construction.** The model reports only what the game shows. Skills
  with no rule show "not yet scored" rather than a fabricated number; plateaus
  need ≥5 target-skill samples; plans need ≥3 samples per skill; levels/plateaus
  require a real PGN-header rating (never estimated).
- **Player color is required for the model.** Skill inference, drills, and
  snapshots only run when `games.player_color` is set (`analysisQueue.ts`:
  `if (!gameRow.playerColor) return;`). See the Library gotcha below.
- **Never commit** `data/*.db`, `.env`, or anything with real user data.

---

## 5. Known gotchas & design decisions (learned the hard way)

- **Library games do not feed the player model.** A loaded classic
  (`loadIntoAccount.ts`) is stored with `playerColor: null` *by design* — there
  is no honest "your side" for a historical game — so it is analysed for review
  but produces no evidence, no drills, no model update. There is no UI to set
  your colour on a library game. If you want a game to feed the model, it must
  be **uploaded** with a `playerName` that matches a PGN header.
- **Verify any move-level claim against the real engine output.** The first
  draft of the user manual hand-wrote the worked example's classifications from
  chess intuition and got 4 of 7 verdicts wrong (it called Morphy Opera Game's
  `9…b5` "the losing blunder"; the classifier grades it an *inaccuracy* — the
  real blunder is `15…Nxd7`). **Never present classifications, cp-losses, or
  mastery numbers you have not pulled from an actual analysis.** To generate a
  grounded example, run the real `inferSkillEvidence`/BKT code on stored moves.
- **Inaccuracies emit no per-move skill evidence.** Only clear errors
  (mistake/blunder) and clearly good moves (best/good) generate per-move
  evidence. This is intentional; don't "fix" it without understanding why.
- **cp-loss is mover-perspective; stored evals are White-perspective.** Mate is
  encoded as `100000 − min(99,|mate|)·100`. Several rules exclude mate-magnitude
  losses via `MATE_MAGNITUDE_CP = 30000`.
- **The M5 differentiators are designed, not built.** Shadow Twin, Counterfactual
  Time Machine, Opponent Dossier, Tilt telemetry, plateau *programs*, and
  coach/multi-student views exist in `MASTERPLAN.md` and have schema tables
  (`dossiers`, `training_programs`, `coach_students`) but **no implementation or
  UI**. The app today is a single-player M1–M4 core. Don't describe them as
  shipped.
- **Security posture** (post-audit): session tokens are stored as SHA-256
  hashes, PBKDF2 at 600k iterations, login does a constant-time dummy verify for
  absent users, `helmet` + trust-proxy are on, library-load charges quota, and
  GDPR export includes `evidence` + `coachStudents`.

---

## 6. Status

- A five-domain audit produced ~50 findings, fixed across **7 phases** (BKT
  correctness, LLM safety, prophylaxis probe, engine robustness, SM-2/player
  model/classification/drills, security/backend, cosmetic+docs).
- **200 tests pass** (`npm test`); `tsc --noEmit` is clean.
- Migrations `0000`–`0006` applied (latest: hashed session tokens).
- A player+mechanics manual is in [`docs/manual/`](docs/manual/) (LaTeX source +
  built PDF); its worked example is generated from real pipeline output.

---

## 7. Working agreements

- Match the surrounding code's style; keep `shared/` isomorphic (no Node-only or
  browser-only APIs there).
- After changing scoring, taxonomy, or schema: run `npm test`, and if schema
  changed, `npm run db:generate` + `npm run db:migrate`.
- When you learn something non-obvious about how the system behaves, add it to
  §5 here so the next person doesn't rediscover it.
