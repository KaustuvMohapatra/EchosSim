/** Regression tests preserving the bug history from the .NET implementation. */
import { describe, expect, it } from "vitest";
import { PlannerWorldState, GoapPlanner, trueFact, setTrue, defineAction } from "@echosim/cognition";
import { NeedSet, standardNeedLibrary, NeedKind, PersonalityProfile,
         AgentMind, CognitionSystem } from "@echosim/cognition";

describe("regression: greedy goal selection", () => {
  // The planner must test goals on POP so the cheapest complete path wins.
  it("expensive single-step plan does not beat cheap multi-step plan", () => {
    const start = new PlannerWorldState();
    const planner = new GoapPlanner();
    const actions = [
      Object.assign(defineAction("expensive_eat", "ExpensiveEat",
        { effects: [setTrue("just_ate")], baseCost: 10 }), {}),
      defineAction("get", "Get", { effects: [setTrue("ing")], baseCost: 0.2 }),
      defineAction("cook", "Cook", { preconditions: [trueFact("ing")], effects: [setTrue("meal")], baseCost: 0.3 }),
      defineAction("eat", "Eat", { preconditions: [trueFact("meal")], effects: [setTrue("just_ate")], baseCost: 0.1 }),
    ];
    const result = planner.plan(start, [trueFact("just_ate")], actions);
    expect(result.success).toBe(true);
    expect(result.plan!.steps.map((s) => s.id)).toEqual(["get", "cook", "eat"]);
  });
});

describe("regression: commitment cooldown livelock", () => {
  // An expired commitment must release BEFORE evaluation; otherwise the
  // satisfied goal re-elects itself forever by waiving switch cost + cooldown.
  it("satisfied goal does not re-elect itself forever via stale commitment", () => {
    const world = { timeMinutes: 0 };
    const needs = new NeedSet(standardNeedLibrary(), {
      [NeedKind.Social]: 55, [NeedKind.Fun]: 40,
    });
    const mind = new AgentMind("npc_test", "Test", undefined,
      PersonalityProfile.balanced(), needs);

    const residents = {
      allMinds: () => [mind], mind: (a: string) => mind,
    };
    const cognition = new CognitionSystem(residents, () => world.timeMinutes);
    const d1 = cognition.decide(mind.agent);
    // Commitment holds while social need is above satisfaction threshold (25).
    expect(d1.effective.goal).toBe("goal_socialize");

    // Small step: social still above threshold → kept.
    world.timeMinutes += 30;
    cognition.advanceNeeds({ totalMinutes: 30 });
    const d2 = cognition.decide(mind.agent);
    expect(d2.keptPrevious).toBe(true);

    // Fully relieve: below satisfaction threshold releases commitment.
    needs.get(NeedKind.Social).apply(100); // → 0
    const d3 = cognition.decide(mind.agent);
    expect(d3.keptPrevious).toBe(false);
  });
});

