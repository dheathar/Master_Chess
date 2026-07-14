/**
 * Grounding corpus for the in-app help assistant. The assistant may answer
 * ONLY from this text (plus the safe per-user context the route adds). It is
 * deliberately hand-authored and factual — the same "no black box, engine is
 * the source of truth" discipline the rest of the app follows. Keep it in sync
 * with real behaviour; it is small enough to inject wholesale into the prompt,
 * so no vector store is needed.
 */
export const HELP_KNOWLEDGE = `
# Master Chess — Help Knowledge Base

## What Master Chess is
An adaptive educational chess tutor. You upload your own games (PGN); every move
is analysed by the Stockfish engine; from that the app builds an explainable
model of your ability across 27 skills, diagnoses your level and plateau,
prescribes a training plan with book recommendations, and turns your own
mistakes into spaced-repetition drills. Guiding principle: every score has a
receipt — it links back to the exact moves that produced it. The loop is
Diagnose → Explain → Prescribe. An AI layer writes prose but is always
subordinate to the engine; it can never invent a move or evaluation.

## Screens and what you do on each
- Games (dashboard): your landing screen. Stat cards for games analysed, average
  accuracy, and games with a blunder, plus a list of recent games. Click a game
  to open its review.
- Upload: paste PGN or drop a .pgn file, choose the source (Chess.com, Lichess,
  or manual), and enter your username as it appears in the PGN so the app knows
  which colour you played. Analysis streams live.
- Game Review: a move-by-move board with the evaluation bar, each move's
  classification (Best / Good / Inaccuracy / Mistake / Blunder), centipawns
  lost, the engine's preferred move, top engine lines, a game-accuracy card, and
  an engine-grounded coaching note.
- Player Model: your level, diagnosed plateau, an 8-skill radar, a mastery-over-
  time sparkline, the full 27-skill list with mastery bars and trend arrows, and
  an Evidence panel — click a skill to see the exact moves behind its score.
- Training Plan: a hypothesis tied to your diagnosis, then up to 3 focus blocks,
  each with a weak skill, its mastery, a rationale, and matched book
  recommendations. A skill needs at least 3 evidence samples to be prescribed.
- Drills: your own mistakes turned into 4-choice "find the better move" puzzles,
  scheduled by SM-2 spaced repetition. Shows cards due, your day streak, and
  retention. Answer correctly and the card is scheduled further out; miss it and
  it returns tomorrow.
- Library: a searchable catalogue of ~6,000 master games (Morphy, Capablanca,
  Fischer, Tal, Kasparov). Search by player/opening/event; filter by ECO,
  result, source; sort; paginate. "Play through" loads a game for full analysis.
  The Opening Explorer tab compares what masters played in a position with what
  you have played there. Note: loaded library games are analysed for review but
  are NOT folded into your player model (a historical game has no honest "your
  side").
- Account & data: export all your data as JSON, or delete your account (type
  DELETE to confirm) — full GDPR controls.

## How move classification works
Each move is scored by how many centipawns it lost versus the engine's best,
with phase-scaled thresholds. Blunder thresholds: opening 350, middlegame 300,
endgame 200 cp; mistake: 150 / 120 / 90; inaccuracy: 60 / 50 / 40. Win-
probability dampening prevents calling a harmless move in an already-decided
position a blunder. Missing a forced mate is always at least a mistake. Game
accuracy uses the Lichess win%-loss curve, blending arithmetic and harmonic
means so one game-losing blunder hurts more than a plain average.

## The skill model (Bayesian Knowledge Tracing)
Each of the 27 skills holds a probability you have mastered it; the mastery
number shown is that probability times 100. A new skill starts at 30. Evidence
from your games moves it up ("for") or down ("against"), weighted by how strong
the evidence is. Confidence in the whole model grows with the number of samples,
capped at 95%. Inaccuracies do not generate per-move skill evidence — only clear
errors (mistake/blunder) and clearly good moves do.

## Skills, levels, plateaus
27 skills across 4 categories (Opening, Middlegame, Endgame, Psychology/Mental).
7 levels by rating: L1 Newcomer (0-799), L2 Beginner (800-1199), L3 Casual club
(1200-1499), L4 Improving club (1500-1799), L5 Strong club (1800-1999), L6
Expert/CM (2000-2299), L7 Master (2300+). Level is only shown if your uploaded
games carry a rating in their PGN headers. 5 plateaus, auto-diagnosed from the
shape of your skill vector: the blunder wall (0-1399), the strategy desert
(1400-1600), the conversion ceiling (1500-2000), the prophylaxis gap
(1700-1900), the precision boundary (2000-2200). A plateau needs your rating in
its zone plus at least 5 evidence samples on its target skills.

## Drills and spaced repetition (SM-2)
Every mistake/blunder you made that lost at least 100 cp, and where the engine
had a clearly better move, becomes a drill; the correct answer is the engine's
best move. Answer correctly and the interval grows (up to 21 days); miss it and
it returns in a few minutes and the card gets harder. A card is suspended after
4 lapses. Any engine move within ~25 cp of the best is accepted as correct.

## Accounts, tiers, quotas
New accounts are free tier. Daily analysis limits: anonymous 1/day, free 5/day,
pro and academy unlimited. Uploads are capped at 50 games per batch; duplicate
re-uploads are detected and cost nothing. Loading a library game costs one
analysis. Passwords need at least 8 characters. Data is private to your account;
export and deletion are self-service under Account & data.

## Common questions
- "Why is a skill blank / not scored?" It has no evidence yet, or it isn't
  diagnosable from game data alone. Play/upload more games.
- "Why no level or plateau?" Your uploaded games have no rating in their PGN
  headers, or there isn't enough evidence yet (needs 5+ samples on the plateau's
  skills).
- "Why didn't my library game change my player model?" By design — historical
  games aren't attributed to you. Upload your own games to build the model.
- "How do I get a training plan?" Upload and analyse several of your own games so
  skills accumulate at least 3 evidence samples each.
- "Why is my famous-loss opening scored well?" The model scores each phase on its
  own evidence; a sound opening can score well even in a game you lost.

## If the assistant cannot answer
If a question is outside this knowledge (billing specifics, a bug report, account
recovery, or anything not covered here), say you are not sure and point the user
to the Account & data page or to contact their administrator — do not guess.
`;
