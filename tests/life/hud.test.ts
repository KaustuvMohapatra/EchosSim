/** Sprint 41 — HUD model: need shaping + mood derivation (pure). */
import { describe, expect, it } from "vitest";
import { characterCard, moodOf, needViews } from "../../apps/life/src/ui/hudModel.js";
import type { AgentInspectorSnapshot } from "@echosim/inspector";

function fakeAgent(overrides: {
  valence?: number; needs?: Array<{ kind: number; name: string; value: number }>;
}): AgentInspectorSnapshot {
  return {
    summary: { id: "player", name: "You", emotionValence: overrides.valence ?? 0,
      status: "Idle" },
    traits: [],
    needs: (overrides.needs ?? ["Hunger", "Energy", "Social", "Fun", "Comfort",
      "Hygiene", "Safety"].map((name, kind) => ({ kind, name, value: 20 })))
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
    const a = fakeAgent({});
    a.needs[0]!.value = 90; // Hunger critical
    const views = needViews(a);
    expect(views).toHaveLength(7);
    expect(views[0]).toMatchObject({ key: "Hunger", fill: 0.9, level: "critical" });
    expect(views[1]!.level).toBe("good");
  });
});

describe("S41: mood derivation", () => {
  it("survival exhaustion outranks positive valence", () => {
    const a = fakeAgent({ valence: 0.6 });
    a.needs[1]!.value = 95;
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
