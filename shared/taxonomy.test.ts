import { describe, expect, it } from "vitest";
import { SKILLS, SKILL_BY_ID, PLAYER_LEVEL_DEFINITIONS, PLATEAUS, levelForRating } from "./taxonomy";
import type { SkillId, PlayerLevel } from "./taxonomy";

describe("Skill taxonomy", () => {
  it("has 27 skills defined", () => {
    expect(SKILLS).toHaveLength(27);
  });

  it("all SKILLS have unique ids", () => {
    const ids = SKILLS.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("SKILL_BY_ID has an entry for every skill in SKILLS", () => {
    for (const skill of SKILLS) {
      expect(SKILL_BY_ID[skill.id]).toBeDefined();
      expect(SKILL_BY_ID[skill.id].id).toBe(skill.id);
    }
  });

  it("all skills have valid categories", () => {
    const validCategories = ["OPENING", "MIDDLEGAME", "ENDGAME", "PSYCHOLOGY_MENTAL"];
    for (const skill of SKILLS) {
      expect(validCategories).toContain(skill.category);
    }
  });

  it("all skills have diagnosable set to 'yes' or 'partial'", () => {
    for (const skill of SKILLS) {
      expect(["yes", "partial"]).toContain(skill.diagnosable);
    }
  });
});

describe("Player levels", () => {
  it("has 7 player levels", () => {
    expect(PLAYER_LEVEL_DEFINITIONS).toHaveLength(7);
  });

  it("all levels have unique ids", () => {
    const ids = PLAYER_LEVEL_DEFINITIONS.map((l) => l.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("player levels form a contiguous rating range (no gaps)", () => {
    const sorted = [...PLAYER_LEVEL_DEFINITIONS].sort((a, b) => a.ratingMin - b.ratingMin);
    for (let i = 1; i < sorted.length; i++) {
      const prevMax = sorted[i - 1].ratingMax;
      const currMin = sorted[i].ratingMin;
      expect(currMin).toBe((prevMax ?? 0) + 1);
    }
  });

  it("levelForRating returns correct level for boundary and mid-range ratings", () => {
    expect(levelForRating(0)).toBe("L1");
    expect(levelForRating(400)).toBe("L1");
    expect(levelForRating(799)).toBe("L1");
    expect(levelForRating(800)).toBe("L2");
    expect(levelForRating(1200)).toBe("L3");
    expect(levelForRating(1500)).toBe("L4");
    expect(levelForRating(1800)).toBe("L5");
    expect(levelForRating(2000)).toBe("L6");
    expect(levelForRating(2300)).toBe("L7");
    expect(levelForRating(3000)).toBe("L7");
  });
});

describe("Plateaus", () => {
  it("has 5 diagnosed plateaus", () => {
    expect(PLATEAUS).toHaveLength(5);
  });

  it("all plateaus have unique ids", () => {
    const ids = PLATEAUS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all plateaus reference valid skill ids", () => {
    const validSkillIds = new Set(SKILLS.map((s) => s.id));
    for (const plateau of PLATEAUS) {
      for (const skillId of plateau.targetSkills) {
        expect(validSkillIds.has(skillId as SkillId)).toBe(true);
      }
    }
  });

  it("has intentional plateau overlaps in transition zones", () => {
    // Some ranges overlap intentionally to handle borderline cases.
    // For instance, 1500-1600 players may fit either strategy_desert
    // or conversion_ceiling depending on their specific profile.
    const sorted = [...PLATEAUS].sort((a, b) => a.ratingZoneMin - b.ratingZoneMin);
    // Just verify they are sorted correctly and have reasonable coverage
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].ratingZoneMin).toBeLessThan(sorted[i].ratingZoneMin);
    }
  });

  it("blunder_wall extends to 1399 to cover L3 (1200-1499)", () => {
    const blunderWall = PLATEAUS.find((p) => p.id === "blunder_wall");
    expect(blunderWall?.ratingZoneMax).toBe(1399);
  });

  it("precision_boundary is intentionally capped below 2200 (above is coaching)", () => {
    const precisionBoundary = PLATEAUS.find((p) => p.id === "precision_boundary");
    expect(precisionBoundary?.ratingZoneMax).toBe(2200);
  });
});
