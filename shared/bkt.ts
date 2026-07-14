/**
 * Bayesian Knowledge Tracing over the 27-skill taxonomy.
 * Ported from the sibling agentic-chess app (src/domain/bkt.ts) and generalized
 * from a fixed concept-tag enum to the SkillId taxonomy in ./taxonomy.ts.
 */
import type { SkillId } from "./taxonomy";

export type BktParams = {
  pInit: number;
  pTransit: number;
  pSlip: number;
  pGuess: number;
};

export const bktParams: BktParams = {
  pInit: 0.3,
  pTransit: 0.15,
  pSlip: 0.1,
  pGuess: 0.2,
};

/** Evidence direction from a single move: "for" strengthens the skill, "against" weakens it. */
export type EvidenceOutcome = "for" | "against" | "neutral";

export function updatePKnow(
  prior: number,
  outcome: EvidenceOutcome,
  weight: number = 1,
  params: BktParams = bktParams,
): number {
  const clamped = clamp01(prior);
  if (outcome === "neutral") {
    return clamped;
  }

  const evidence = outcome === "for" ? 1 : 0;
  const pCorrectGivenKnow = 1 - params.pSlip;
  const pCorrectGivenNotKnow = params.pGuess;
  const likelihoodKnow = evidence * pCorrectGivenKnow + (1 - evidence) * (1 - pCorrectGivenKnow);
  const likelihoodNotKnow = evidence * pCorrectGivenNotKnow + (1 - evidence) * (1 - pCorrectGivenNotKnow);
  const posteriorNumerator = clamped * likelihoodKnow;
  const denominator = posteriorNumerator + (1 - clamped) * likelihoodNotKnow;
  const posterior = denominator === 0 ? clamped : posteriorNumerator / denominator;

  const w = clamp01(weight);
  const blended = clamped + (posterior - clamped) * w;

  // The learning-transition bump models skill *acquisition*, so it may only
  // ever raise mastery on POSITIVE evidence, and its strength must scale with
  // the evidence weight. Previously it was applied unconditionally at full
  // strength — which made weight-0 evidence add ~7.5 mastery points and let
  // weak "against" evidence net a mastery *increase*, turning mastery into a
  // saturating count of observations rather than a skill estimate. Applying it
  // only to "for" (and scaled by w) makes a full-weight "against" strictly
  // lower pKnow and a zero-weight observation a true no-op.
  const transit = outcome === "for" ? (1 - blended) * params.pTransit * w : 0;
  return clamp01(blended + transit);
}

export function masteryFromPKnow(pKnow: number): number {
  return Math.round(clamp01(pKnow) * 100);
}

export function pKnowFromMastery(mastery: number | undefined): number {
  if (typeof mastery !== "number") {
    return bktParams.pInit;
  }
  return clamp01(mastery / 100);
}

export interface SkillMasteryState {
  pKnow: number;
  mastery: number;
  sampleCount: number;
}

export function initialSkillState(skillId: SkillId, params: BktParams = bktParams): SkillMasteryState {
  void skillId;
  return { pKnow: params.pInit, mastery: masteryFromPKnow(params.pInit), sampleCount: 0 };
}

export function applySkillEvidence(
  state: SkillMasteryState,
  outcome: EvidenceOutcome,
  weight: number = 1,
  params: BktParams = bktParams,
): SkillMasteryState {
  const nextPKnow = updatePKnow(state.pKnow, outcome, weight, params);
  return {
    pKnow: nextPKnow,
    mastery: masteryFromPKnow(nextPKnow),
    sampleCount: state.sampleCount + (outcome === "neutral" ? 0 : 1),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
