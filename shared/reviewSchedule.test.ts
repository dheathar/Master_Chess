import { describe, expect, it } from "vitest";
import { initialReviewState, isDue, nextReviewState, type ReviewState } from "./reviewSchedule";

describe("initialReviewState", () => {
  it("is due immediately", () => {
    const now = 1_000_000;
    const state = initialReviewState(now);
    expect(isDue(state, now)).toBe(true);
  });
});

describe("nextReviewState", () => {
  const now = 1_000_000;

  it("resets the streak and schedules a short retry on an incorrect answer", () => {
    const current: ReviewState = { dueAt: now, intervalDays: 5, ease: 2.4, streak: 3, lapses: 0, suspended: false };
    const next = nextReviewState(current, "incorrect", 60, now);
    expect(next.streak).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.dueAt).toBeGreaterThan(now);
    expect(next.intervalDays).toBeLessThan(current.intervalDays);
  });

  it("grows the interval on a correct answer", () => {
    const current = initialReviewState(now);
    const first = nextReviewState(current, "correct", 40, now);
    const second = nextReviewState(first, "correct", 40, first.dueAt);
    expect(second.streak).toBe(2);
    expect(second.intervalDays).toBeGreaterThan(first.intervalDays);
  });

  it("schedules higher-mastery skills further out than low-mastery ones", () => {
    const current = initialReviewState(now);
    const highMastery = nextReviewState(current, "correct", 90, now);
    const lowMastery = nextReviewState(current, "correct", 10, now);
    expect(highMastery.intervalDays).toBeGreaterThan(lowMastery.intervalDays);
  });

  it("caps the interval at the maximum", () => {
    let state = initialReviewState(now);
    for (let i = 0; i < 30; i += 1) {
      state = nextReviewState(state, "correct", 90, now);
    }
    expect(state.intervalDays).toBeLessThanOrEqual(21);
  });
});

describe("isDue", () => {
  it("is false before the due time and true at or after it", () => {
    const state: ReviewState = { dueAt: 1000, intervalDays: 1, ease: 2, streak: 1, lapses: 0, suspended: false };
    expect(isDue(state, 999)).toBe(false);
    expect(isDue(state, 1000)).toBe(true);
    expect(isDue(state, 1001)).toBe(true);
  });
});
