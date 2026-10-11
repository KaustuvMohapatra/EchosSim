/** Sprint 41 — HUD model: need shaping + mood derivation (pure). */
import { describe, expect, it } from "vitest";
import { characterCard, moodOf, needViews } from "../../apps/life/src/ui/hudModel.js";
import { relevantNeeds } from "../../apps/life/src/ui/models/residentView.js";
import type { AgentInspectorSnapshot } from "@echosim/inspector";

function fakeAgent(overrides: {
  valence?: number; needs?: Array<{ kind: number; name: string; value: number }>;
}): AgentInspectorSnapshot {
  return {
    summary: { id: "player", name: "You", emotionValence: overrides.valence ?? 0,
      status: "Idle" },
    traits: [],
    needs: (overrides.needs ?? ["Hunger", "Energy", "Social", "Fun", "Comfort",
      "Hygiene", "Safety"].map((name, kind) => ({ kind, name, value: 40 })))
      .map((n) => ({
        kind: n.kind, name: n.name, value: n.value,
        satisfied: n.value <= 30, critical: n.value >= 80, interrupting: false,
      })),
    emotionValence: overrides.valence ?? 0,
    money: 42.5,
    utility: [],
    plan: { revision: 0, hasPlan: false, steps: [], nextStepIndex: 0,
      lastPlannerNodesExpanded: 0 },
    memories: [],
    relationships: [],
    beliefs: [],
    suppressions: [],
  } as unknown as AgentInspectorSnapshot;
}

describe("S41: needs views", () => {
  it("maps raw values to fills and levels (no raw numbers in UI model)", () => {
    const a = fakeAgent({ needs: [
      { kind: 0, name: "Hunger", value: 90 },
      { kind: 1, name: "Energy", value: 15 },
    ] });
    const views = needViews(a);
    expect(views[0]).toEqual({ key: "Hunger", fill: 0.9, level: "critical" });
    expect(views[1]).toMatchObject({ key: "Energy", level: "good" });
  });
});

describe("S41: malformed inspector need pressures", () => {
  it("renders finite bounded bars and derives urgency from normalized pressure", () => {
    const agent = fakeAgent({ needs: [
      { kind: 0, name: "Hunger", value: Number.NaN },
      { kind: 1, name: "Energy", value: Number.POSITIVE_INFINITY },
      { kind: 2, name: "Social", value: Number.NEGATIVE_INFINITY },
      { kind: 3, name: "Fun", value: 150 },
      { kind: 4, name: "Comfort", value: 68 },
      { kind: 5, name: "Hygiene", value: -50 },
    ] });
    expect(needViews(agent)).toEqual([
      { key: "Hunger", fill: 0, level: "good" },
      { key: "Energy", fill: 0, level: "good" },
      { key: "Social", fill: 0, level: "good" },
      { key: "Fun", fill: 1, level: "critical" },
      { key: "Comfort", fill: 0.68, level: "warn" },
      { key: "Hygiene", fill: 0, level: "good" },
    ]);
    expect(relevantNeeds(agent, 2).map((need) => need.key)).toEqual([
      "Fun", "Comfort",
    ]);
  });

  it("keeps ordinary urgency thresholds consistent with inspector state", () => {
    const agent = fakeAgent({ needs: [
      { kind: 0, name: "Hunger", value: 80 },
      { kind: 1, name: "Energy", value: 55 },
      { kind: 2, name: "Social", value: 56 },
    ] });
    expect(needViews(agent).map((need) => need.level)).toEqual([
      "critical", "good", "warn",
    ]);
  });
});

describe("S41: mood derivation", () => {
  it("survival exhaustion outranks positive valence", () => {
    const a = fakeAgent({
      valence: 0.6,
      needs: [{ kind: 1, name: "Energy", value: 95 }],
    });
    expect(moodOf(a)).toBe("Exhausted");
  });

  it("valence bands map to readable moods", () => {
    expect(moodOf(fakeAgent({ valence: -0.8 }))).toBe("Angry");
    expect(moodOf(fakeAgent({ valence: -0.3 }))).toBe("Tense");
    expect(moodOf(fakeAgent({ valence: 0.6 }))).toBe("Happy");
    expect(moodOf(fakeAgent({ valence: 0.2 }))).toBe("Good");
    expect(moodOf(fakeAgent({}))).toBe("Fine");
  });

  it("character card shapes the full panel model", () => {
    const card = characterCard(fakeAgent({ valence: 0.5 }));
    expect(card).toMatchObject({ name: "You", money: 42.5, mood: "Happy" });
    expect(card.needs).toHaveLength(7);
  });
});
