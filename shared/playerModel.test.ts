import { describe, expect, it } from "vitest";
import { diagnosePlateau } from "./playerModel";
import type { SkillSnapshotEntry } from "./playerModel";

describe("diagnosePlateau", () => {
  it("returns null when no skills meet the minimum sample threshold", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "tactical_pattern_recognition", mastery: 80, sampleCount: 1 },
      { skillId: "tactical_consistency", mastery: 70, sampleCount: 1 },
    ];
    const result = diagnosePlateau(1000, skills);
    expect(result).toBeNull();
  });

  it("diagnoses the blunder wall for players rated below 1400 with low tactical skills", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "tactical_pattern_recognition", mastery: 40, sampleCount: 10 },
      { skillId: "tactical_consistency", mastery: 35, sampleCount: 10 },
      { skillId: "strategic_planning", mastery: 60, sampleCount: 5 },
    ];
    const result = diagnosePlateau(1200, skills);
    expect(result?.plateauId).toBe("blunder_wall");
  });

  it("diagnoses the strategy desert for players rated 1400-1600 with flat middlegame accuracy", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "tactical_pattern_recognition", mastery: 70, sampleCount: 10 },
      { skillId: "tactical_consistency", mastery: 68, sampleCount: 10 },
      { skillId: "strategic_planning", mastery: 30, sampleCount: 10 },
      { skillId: "pawn_endings", mastery: 20, sampleCount: 5 },
      { skillId: "endgame_principles", mastery: 25, sampleCount: 5 },
    ];
    const result = diagnosePlateau(1500, skills);
    expect(result?.plateauId).toBe("strategy_desert");
  });

  it("diagnoses the conversion ceiling for players rated 1500-2000 with low conversion skills", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "strategic_planning", mastery: 75, sampleCount: 10 },
      { skillId: "converting_advantages", mastery: 30, sampleCount: 10 },
      { skillId: "rook_endings", mastery: 35, sampleCount: 5 },
      { skillId: "endgame_precision_conversion", mastery: 40, sampleCount: 5 },
    ];
    const result = diagnosePlateau(1800, skills);
    expect(result?.plateauId).toBe("conversion_ceiling");
  });

  it("diagnoses the prophylaxis gap for players rated 1700-1900 with low prophylaxis", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "prophylaxis", mastery: 25, sampleCount: 10 },
      { skillId: "defence_counterplay", mastery: 30, sampleCount: 10 },
      { skillId: "converting_advantages", mastery: 75, sampleCount: 5 },
      { skillId: "rook_endings", mastery: 70, sampleCount: 5 },
    ];
    const result = diagnosePlateau(1800, skills);
    expect(result?.plateauId).toBe("prophylaxis_gap");
  });

  it("returns null for ratings above 2200 (coaching territory, no formulaic plateau)", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "calculation_precision", mastery: 40, sampleCount: 20 },
      { skillId: "endgame_precision_conversion", mastery: 50, sampleCount: 20 },
      { skillId: "time_management", mastery: 45, sampleCount: 15 },
      { skillId: "psychological_resilience", mastery: 30, sampleCount: 15 },
    ];
    const result = diagnosePlateau(2300, skills);
    expect(result).toBeNull();
  });

  it("returns null when rating is null (unrated players)", () => {
    const skills: SkillSnapshotEntry[] = [
      { skillId: "tactical_pattern_recognition", mastery: 50, sampleCount: 10 },
    ];
    const result = diagnosePlateau(null, skills);
    expect(result).toBeNull();
  });
});
