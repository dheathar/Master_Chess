import { describe, expect, it } from "vitest";
import { decideNextAction, type JourneyFacts } from "./journey";

const base: JourneyFacts = {
  gamesAnalyzed: 5,
  evidenced: [],
  level: "L3",
  levelName: "Casual club player",
  plateauName: "The blunder wall",
  dueDrills: 0,
  drillsCompleted: 0,
  retentionPct: null,
};

describe("decideNextAction (guide-to-success ladder)", () => {
  it("with no games, sends the user to upload their first game", () => {
    const a = decideNextAction({ ...base, gamesAnalyzed: 0 });
    expect(a.screen).toBe("upload");
    expect(a.title.toLowerCase()).toContain("first game");
  });

  it("with too few games, asks for enough to unlock the plan", () => {
    const a = decideNextAction({ ...base, gamesAnalyzed: 1 });
    expect(a.screen).toBe("upload");
    expect(a.title).toContain("2 more"); // needs 3 total
  });

  it("prioritises due drills once there is enough data", () => {
    const a = decideNextAction({ ...base, gamesAnalyzed: 5, dueDrills: 4 });
    expect(a.screen).toBe("drill");
    expect(a.title).toContain("4");
  });

  it("otherwise points to the lowest well-evidenced skill in the training plan", () => {
    const a = decideNextAction({
      ...base,
      dueDrills: 0,
      evidenced: [
        { skillId: "tactical_consistency", name: "Tactical consistency", mastery: 20, sampleCount: 5 },
        { skillId: "opening_principles", name: "Opening principles", mastery: 70, sampleCount: 6 },
      ],
    });
    expect(a.screen).toBe("prescription");
    expect(a.title.toLowerCase()).toContain("tactical consistency");
  });

  it("ignores under-evidenced skills (fewer than 3 samples) when choosing a focus", () => {
    const a = decideNextAction({
      ...base,
      dueDrills: 0,
      evidenced: [{ skillId: "prophylaxis", name: "Prophylaxis", mastery: 10, sampleCount: 2 }],
    });
    // Only skill has 2 samples → not eligible → falls through to the keep-fresh nudge.
    expect(a.screen).toBe("upload");
  });
});
