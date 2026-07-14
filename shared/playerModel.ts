import { PLATEAUS, type PlateauId, type SkillId } from "./taxonomy";

export interface SkillSnapshotEntry {
  skillId: SkillId;
  mastery: number;
  sampleCount: number;
}

/** Minimum total evidence across a plateau's target skills before it can be diagnosed. */
const MIN_PLATEAU_SAMPLES = 5;

export interface PlateauDiagnosis {
  plateauId: PlateauId;
  /** Average mastery across the plateau's target skills that we actually have evidence for. */
  averageMastery: number;
  /** How many of the plateau's target skills have any evidence at all. */
  skillsWithEvidence: number;
}

/**
 * Diagnoses the most relevant plateau from the player's rating and observed
 * skill vector. Honest by construction: a plateau is only considered if the
 * player's rating falls in its zone AND at least one of its target skills
 * has real evidence (sampleCount > 0) — we never guess a diagnosis from
 * skills we have no data for. Returns null if neither condition is met for
 * any plateau (e.g. brand new account with no analyzed games).
 */
export function diagnosePlateau(rating: number | null, skills: SkillSnapshotEntry[]): PlateauDiagnosis | null {
  if (rating === null) return null;

  const skillById = new Map(skills.map((s) => [s.skillId, s]));
  const inZone = PLATEAUS.filter(
    (plateau) => rating >= plateau.ratingZoneMin && (plateau.ratingZoneMax === null || rating <= plateau.ratingZoneMax),
  );

  let worst: PlateauDiagnosis | null = null;
  for (const plateau of inZone) {
    const evidenced = plateau.targetSkills.map((id) => skillById.get(id)).filter((s): s is SkillSnapshotEntry => !!s && s.sampleCount > 0);
    if (evidenced.length === 0) continue;
    // Require a minimum body of evidence before a plateau can be diagnosed —
    // otherwise a single low-mastery sample outranks a well-evidenced plateau
    // and the headline diagnosis flaps on one move.
    const totalSamples = evidenced.reduce((sum, s) => sum + s.sampleCount, 0);
    if (totalSamples < MIN_PLATEAU_SAMPLES) continue;
    const averageMastery = evidenced.reduce((sum, s) => sum + s.mastery, 0) / evidenced.length;
    if (!worst || averageMastery < worst.averageMastery) {
      worst = { plateauId: plateau.id, averageMastery, skillsWithEvidence: evidenced.length };
    }
  }
  return worst;
}
