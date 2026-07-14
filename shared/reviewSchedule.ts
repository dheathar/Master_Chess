/**
 * SM-2-lite spaced repetition scheduling.
 * Ported from the sibling agentic-chess app and generalized to drill review
 * queue rows. Unlike a from-scratch recomputation, the ease factor now
 * *evolves* on the card (floored at 1.3, à la SM-2) and the interval grows
 * multiplicatively (interval × ease) on success — so a correct answer can
 * never shorten the interval, even if the skill's mastery estimate dropped.
 */
import { pKnowFromMastery } from "./bkt";

const MIN_EASE = 1.3;
const MAX_EASE = 2.6;
const baseMinutes = 5; // relearning step after a lapse / for a brand-new card
const graduatingBaseDays = 1; // seed interval a card grows from once answered correctly
const maxIntervalDays = 21; // cap at 3 weeks
const LEECH_LAPSES = 4; // suspend a card that has lapsed this many times
const HINT_GROWTH = 1.3; // gentle interval growth for a hinted-correct (partial credit)

export type ReviewOutcome = "correct" | "incorrect";

export interface ReviewState {
  dueAt: number;
  intervalDays: number;
  ease: number;
  streak: number;
  lapses: number;
  /** A leech (too many lapses) is suspended and stops being scheduled until manually revived. */
  suspended: boolean;
}

export function initialReviewState(now: number = Date.now()): ReviewState {
  return { dueAt: now, intervalDays: 0, ease: 2.0, streak: 0, lapses: 0, suspended: false };
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.min(MAX_EASE, ease));
}

export function nextReviewState(
  current: ReviewState,
  outcome: ReviewOutcome,
  currentMastery: number | undefined,
  now: number = Date.now(),
  hinted: boolean = false,
): ReviewState {
  if (outcome === "incorrect") {
    // Decay the ease (floored), reset the streak, and relearn soon. Suspend as
    // a leech once lapses pile up so an unlearnable card stops recurring forever.
    const ease = clampEase(current.ease - 0.2);
    const lapses = current.lapses + 1;
    return {
      dueAt: now + baseMinutes * 60 * 1000,
      intervalDays: baseMinutes / (60 * 24),
      ease,
      streak: 0,
      lapses,
      suspended: lapses >= LEECH_LAPSES,
    };
  }

  const base = current.intervalDays > 0 ? current.intervalDays : graduatingBaseDays;

  // Hinted-correct = partial credit: a solve you needed help for isn't proof of
  // independent recall. Don't reward the ease, don't count it toward the streak,
  // and grow the interval only gently, so the card returns sooner than a clean
  // solve would schedule it.
  if (hinted) {
    const intervalDays = Math.min(maxIntervalDays, base * HINT_GROWTH);
    return {
      dueAt: now + intervalDays * 24 * 60 * 60 * 1000,
      intervalDays,
      ease: current.ease,
      streak: current.streak,
      lapses: current.lapses,
      suspended: false,
    };
  }

  // Unaided correct: nudge ease up (weighted by how well the underlying skill is
  // known) and grow the interval multiplicatively so it strictly increases.
  const pKnow = pKnowFromMastery(currentMastery);
  const ease = clampEase(current.ease + 0.05 + pKnow * 0.1);
  const streak = current.streak + 1;
  const intervalDays = Math.min(maxIntervalDays, base * ease);
  return {
    dueAt: now + intervalDays * 24 * 60 * 60 * 1000,
    intervalDays,
    ease,
    streak,
    lapses: current.lapses,
    suspended: false,
  };
}

export function isDue(state: ReviewState, now: number = Date.now()): boolean {
  return !state.suspended && state.dueAt <= now;
}
