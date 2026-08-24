/** Sprint 47 — character creator model. */
import { describe, expect, it } from "vitest";
import {
  profileFromPicks, nextCreatorId, resetCreatorIds,
} from "../../apps/life/src/creator/creatorModel.js";
import { PersonalityTrait } from "@echosim/cognition";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";

describe("S47: personality from picks", () => {
  it("maps UI picks onto continuous traits with clamping", () => {
    const p = profileFromPicks(["outgoing", "creative"]);
    expect(p.get(PersonalityTrait.Extraversion)).toBeCloseTo(0.7, 5);
    expect(p.get(PersonalityTrait.Sociability)).toBeCloseTo(0.75, 5);
    expect(p.get(PersonalityTrait.Openness)).toBeCloseTo(0.75, 5);
    // Untouched traits stay at baseline.
    expect(p.get(PersonalityTrait.Patience)).toBeCloseTo(0.45, 5);
  });

  it("is deterministic and clamps at the [0,1] bounds", () => {
    const a = profileFromPicks(["outgoing", "outgoing" as never]);
    for (const v of a.toArray()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(profileFromPicks(["calm"]).toArray())
      .toEqual(profileFromPicks(["calm"]).toArray());
  });

  it("unknown pick ids are ignored safely", () => {
    const p = profileFromPicks(["nonexistent"]);
    expect(p.get(PersonalityTrait.Openness)).toBeCloseTo(0.45, 5);
  });
});

describe("S47: creation through the adapter", () => {
  it("registers a full resident that appears in snapshots", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const before = a.snapshot().stats.residents;
    resetCreatorIds();
    const id = nextCreatorId();
    a.createResident({
      id, name: "Kay", pronouns: "they/them",
      personality: profileFromPicks(["outgoing"]),
      lifeGoal: "goal_friends",
    });
    const snap = a.snapshot();
    expect(snap.stats.residents).toBe(before + 1);
    expect(snap.agents.find((x) => x.id === id)?.name).toBe("Kay");
    a.dispose();
  });

  it("life goal biases the preference channel", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    a.createResident({
      id: "npc_goal_test", name: "G",
      personality: profileFromPicks([]),
      lifeGoal: "goal_friends",
    });
    const mind = a.town.residents.mind("npc_goal_test");
    expect(mind.preferences.get("goal_social")).toBe(0.6);
    expect(mind.preferences.get("rain")).toBe(0); // untouched channel
    a.dispose();
  });
});
