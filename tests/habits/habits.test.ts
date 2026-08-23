/** Sprint 24 — habits & long-term intentions. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { HabitSystem } from "@echosim/social";
import { deriveIntentions, socialBiasOf } from "@echosim/simulation";
import { saveToJson, restoreFromJson } from "@echosim/persistence";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S24: habit formation", () => {
  it("requires recurrence AND a multi-day span (no one-event habits)", () => {
    const hs = new HabitSystem();
    hs.record("npc_mira", "visit", "loc_cafe", 500);
    expect(hs.habitsOf("npc_mira")).toHaveLength(0);
    // Two more visits but all within the same day → still not a habit.
    hs.record("npc_mira", "visit", "loc_cafe", 560);
    hs.record("npc_mira", "visit", "loc_cafe", 610);
    expect(hs.habitsOf("npc_mira")).toHaveLength(0);
  });

  it("forms after enough repetitions spread across days", () => {
    const hs = new HabitSystem();
    hs.record("npc_mira", "visit", "loc_cafe", 400);      // day 1 morning
    hs.record("npc_mira", "visit", "loc_cafe", 1600);     // day 2
    hs.record("npc_mira", "visit", "loc_cafe", 2900);     // day 3
    const habits = hs.habitsOf("npc_mira");
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ behavior: "visit", targetKey: "loc_cafe" });
    expect(habits[0]!.strength).toBeGreaterThan(0.05);
    expect(hs.strengthAt("npc_mira", "loc_cafe")).toBeGreaterThan(0);
    expect(hs.strengthAt("npc_mira", "loc_park")).toBe(0);
  });

  it("decays when unused and vanishes below the active floor", () => {
    const hs = new HabitSystem();
    hs.record("npc_mira", "visit", "loc_park", 100);
    hs.record("npc_mira", "visit", "loc_park", 2000);
    hs.record("npc_mira", "visit", "loc_park", 3900);
    expect(hs.habitsOf("npc_mira")).toHaveLength(1);

    // ~20 idle days of decay.
    for (let i = 0; i < 20 * 24; i++) hs.tickDecay(60);
    expect(hs.habitsOf("npc_mira")).toHaveLength(0);
  });

  it("repeated performance strengthens toward a hard cap", () => {
    const hs = new HabitSystem();
    let t = 100;
    for (let i = 0; i < 30; i++) { hs.record("m", "visit", "x", t); t += 1500; }
    const h = hs.habitsOf("m")[0]!;
    expect(h.strength).toBeLessThanOrEqual(hs.maxStrength + 1e-9);
    expect(h.repetitionCount).toBeGreaterThanOrEqual(28);
  });
});

describe("S24: autonomous formation + utility influence", () => {
  it("a resident who keeps visiting the cafe develops cafe pull", () => {
    const { town, director, miraId } = createDemoTown(7001);
    // Force repeated daytime cafe visits through real movement.
    for (let day = 0; day < 4; day++) {
      const at = 600 + day * 1440; // 10:00 each day (cafe open)
      town.clock.advance({ totalMinutes: at - town.clock.currentTime.totalMinutes });
      town.moveAgent(miraId as never, "loc_cafe" as never);
      town.moveAgent(miraId as never, "loc_home_a" as never);
    }
    town.moveAgent(miraId as never, "loc_cafe" as never);

    const habit = town.habits.habitsOf(miraId)
      .find((h) => h.targetKey === "loc_cafe");
    expect(habit).toBeDefined();

    // Utility influence: Explore scored AT the cafe includes the habit term.
    const evaluation = town.cognition.evaluate(miraId);
    const explore = evaluation.ranked.find((g) => g.goal === "goal_explore")!;
    const habitLine = explore.breakdown.find((l) => l.label === "Habit");
    expect(habitLine).toBeDefined();
    expect(habitLine!.value).toBeGreaterThan(0);
    expect(habitLine!.value).toBeLessThanOrEqual(0.15 + 1e-9); // hard cap
  });
});

describe("S24: long-term intentions", () => {
  it("derives avoid/befriend/repair from semantics and relationships", () => {
    const { town, miraId, rohanId } = createDemoTown(7001);
    town.reflections.import(miraId, {
      id: 1, subjectKey: rohanId, concept: "unpleasantness",
      polarity: -0.7, confidence: 0.7, supportingIds: [1, 2],
      createdAtMinutes: 100, lastReinforcedAtMinutes: 200,
    });
    town.reflections.import(miraId, {
      id: 2, subjectKey: "npc_anika", concept: "reliability",
      polarity: 0.8, confidence: 0.75, supportingIds: [3],
      createdAtMinutes: 100, lastReinforcedAtMinutes: 200,
    });
    town.relationships.import(miraId, rohanId, {
      familiarity: 0.4, affinity: -0.5, trust: -0.2, respect: 0,
      attraction: 0, fear: 0, grievance: 0.7, obligation: 0,
    });

    const intents = deriveIntentions(town, miraId);
    expect(intents.some((i) => i.kind === "avoid" && i.subjectKey === rohanId)).toBe(true);
    expect(intents.some((i) => i.kind === "befriend" && i.subjectKey === "npc_anika")).toBe(true);

    const bias = socialBiasOf(intents);
    expect(bias).toBeLessThan(0.1 + 1e-9);
    expect(bias).toBeGreaterThan(-0.1 - 1e-9);
  });

  it("repair intention appears for high-grievance non-enemies", () => {
    const { town, miraId, rohanId } = createDemoTown(7001);
    town.relationships.import(miraId, rohanId, {
      familiarity: 0.35, affinity: 0.1, trust: 0, respect: 0,
      attraction: 0, fear: 0, grievance: 0.55, obligation: 0,
    });
    const repair = deriveIntentions(town, miraId)
      .find((i) => i.kind === "repair" && i.subjectKey === rohanId);
    expect(repair).toBeDefined();
    expect(socialBiasOf([repair!])).toBeGreaterThan(0);
  });
});

describe("S24: persistence", () => {
  it("habits survive save/restore and continue decaying identically", () => {
    const a = createDemoTown(7001);
    a.town.habits.import(a.miraId, {
      id: 1, behavior: "visit", targetKey: "loc_cafe",
      strength: 0.42, repetitionCount: 9,
      firstPerformedMinutes: 300, lastPerformedMinutes: 2900,
    });

    const json = saveToJson(a.town, a.director);
    const b = restoreFromJson(json);
    expect(b.town.habits.habitsOf(a.miraId)[0]!.strength).toBeCloseTo(0.42, 12);

    b.town.habits.tickDecay(1440);
    a.town.habits.tickDecay(1440);
    expect(b.town.habits.habitsOf(a.miraId)[0]!.strength)
      .toBeCloseTo(a.town.habits.habitsOf(a.miraId)[0]!.strength, 12);
  });
});
