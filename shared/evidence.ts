import type { SkillId } from "./taxonomy";
import type { EvidenceOutcome } from "./bkt";

/**
 * One evidence entry: a single skill-inference rule firing against a single
 * move. `weight` in [0,1] scales how strongly this one entry moves the BKT
 * estimate — a decisive blunder counts for more than a marginal inaccuracy.
 */
export interface EvidenceEntry {
  skillId: SkillId;
  direction: EvidenceOutcome;
  weight: number;
  ruleId: string;
  note: string;
  /** Index into the game's move list this evidence was derived from. */
  moveIndex: number;
}
