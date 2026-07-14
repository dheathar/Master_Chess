import { describe, expect, it } from "vitest";
import { applySkillEvidence, initialSkillState, masteryFromPKnow, pKnowFromMastery, updatePKnow } from "./bkt";

describe("updatePKnow", () => {
  it("increases p(know) on positive evidence", () => {
    const next = updatePKnow(0.3, "for");
    expect(next).toBeGreaterThan(0.3);
  });

  it("decreases p(know) on negative evidence", () => {
    const next = updatePKnow(0.6, "against");
    expect(next).toBeLessThan(0.6);
  });

  it("leaves p(know) unchanged on neutral evidence", () => {
    expect(updatePKnow(0.5, "neutral")).toBe(0.5);
  });

  it("stays within [0, 1] after repeated updates", () => {
    let p = 0.5;
    for (let i = 0; i < 50; i += 1) {
      p = updatePKnow(p, i % 2 === 0 ? "for" : "against");
    }
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("scales the update magnitude by evidence weight", () => {
    const strong = updatePKnow(0.5, "for", 1);
    const weak = updatePKnow(0.5, "for", 0.2);
    expect(strong).toBeGreaterThan(weak);
  });

  it("treats zero-weight evidence as a true no-op in both directions", () => {
    expect(updatePKnow(0.5, "for", 0)).toBeCloseTo(0.5, 10);
    expect(updatePKnow(0.5, "against", 0)).toBeCloseTo(0.5, 10);
  });

  it("lowers p(know) for weak negative evidence (regression: used to net an increase)", () => {
    // With pSlip=0.1, pGuess=0.2 the "against" posterior at prior 0.5 is 0.111;
    // blended at weight 0.2 is 0.5 + (0.111 - 0.5)*0.2 = 0.42222, and no learning
    // bump is applied to negative evidence.
    expect(updatePKnow(0.5, "against", 0.2)).toBeCloseTo(0.42222, 4);
    expect(updatePKnow(0.5, "against", 0.2)).toBeLessThan(0.5);
  });

  it("applies the learning-transition bump only to positive evidence, scaled by weight", () => {
    // "for" at weight 1 from 0.5: posterior 0.81818, then +(1-0.81818)*0.15*1.
    expect(updatePKnow(0.5, "for", 1)).toBeCloseTo(0.84545, 4);
    // A single weak positive credit must not saturate a low prior.
    expect(updatePKnow(0.3, "for", 0.12)).toBeLessThan(0.4);
  });

  it("weight-tempered transit no longer over-inflates on repeated weak positives (regression)", () => {
    let p = 0.3;
    for (let i = 0; i < 12; i += 1) p = updatePKnow(p, "for", 0.12);
    // Previously the full-strength transit bump climbed this to ~0.97 in a
    // few steps; tempering it by weight keeps twelve weak credits below ~0.85.
    expect(p).toBeLessThan(0.85);

    // And a single full-weight blunder must visibly pull it back down.
    const afterBlunder = updatePKnow(p, "against", 1);
    expect(afterBlunder).toBeLessThan(p - 0.2);
  });
});

describe("mastery <-> pKnow conversions", () => {
  it("round-trips through mastery and back", () => {
    expect(masteryFromPKnow(0.5)).toBe(50);
    expect(pKnowFromMastery(50)).toBe(0.5);
  });

  it("defaults to the prior for an undefined mastery", () => {
    expect(pKnowFromMastery(undefined)).toBeCloseTo(0.3);
  });
});

describe("skill state helpers", () => {
  it("seeds a new skill at the BKT prior", () => {
    const state = initialSkillState("tactical_consistency");
    expect(state.mastery).toBe(30);
    expect(state.sampleCount).toBe(0);
  });

  it("increments sample count only on non-neutral evidence", () => {
    let state = initialSkillState("tactical_consistency");
    state = applySkillEvidence(state, "for");
    expect(state.sampleCount).toBe(1);
    state = applySkillEvidence(state, "neutral");
    expect(state.sampleCount).toBe(1);
    state = applySkillEvidence(state, "against");
    expect(state.sampleCount).toBe(2);
  });

  it("mastery trends upward with repeated positive evidence", () => {
    let state = initialSkillState("tactical_consistency");
    for (let i = 0; i < 8; i += 1) {
      state = applySkillEvidence(state, "for");
    }
    expect(state.mastery).toBeGreaterThan(30);
  });
});
