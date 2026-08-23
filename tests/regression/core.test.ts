/** Regression tests preserving the bug history + determinism + architecture guardrails. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  PlannerWorldState, GoapPlanner, trueFact, setTrue, setFalse, defineAction,
  NeedSet, standardNeedLibrary, NeedKind, PersonalityProfile,
  AgentMind, CognitionSystem,
} from "@echosim/cognition";

// ---- helpers ----
const ROOT = join(__dirname, "../..");
const SIM_PACKAGES = [
  "packages/core/src", "packages/cognition/src", "packages/world/src",
  "packages/social/src", "packages/simulation/src",
  "packages/content/src", "packages/inspector/src",
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) out.push(...tsFiles(full));
      else if (e.endsWith(".ts")) out.push(full);
    }
  } catch { /* dir may not exist */ }
  return out;
}

// ============================================================
// Architecture Guardrails
// ============================================================
describe("architecture: engine independence", () => {
  it("simulation packages never import Phaser or DOM APIs", () => {
    for (const pkg of SIM_PACKAGES) {
      for (const file of tsFiles(join(ROOT, pkg))) {
        const src = readFileSync(file, "utf-8");
        expect(src).not.toMatch(/from\s+["']phaser/i);
        expect(src).not.toMatch(/import\s*\(\s*["']phaser/i);
        expect(src).not.toMatch(/\bdocument\./);
        expect(src).not.toMatch(/\bwindow\./);
        expect(src).not.toMatch(/from\s+["']fs["']/);
      }
    }
  });
});

// ============================================================
// Determinism
// ============================================================
describe("determinism", () => {
  it("same seed produces same random sequence", async () => {
    const { SeededRandom } = await import("@echosim/core");
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) expect(a.nextUint64()).toBe(b.nextUint64());
  });

  it("named streams from same master seed are independent but reproducible", async () => {
    const { SimRandomProvider } = await import("@echosim/core");
    const p1 = new SimRandomProvider(1234n);
    const p2 = new SimRandomProvider(1234n);
    const s1a = p1.getStream("agents").nextUint64();
    const s1b = p1.getStream("world").nextUint64();
    const s2a = p2.getStream("agents").nextUint64();
    const s2b = p2.getStream("world").nextUint64();
    expect(s1a).toBe(s2a);
    expect(s1b).toBe(s2b);
    expect(s1a).not.toBe(s1b); // streams must be independent
  });
});

// ============================================================
// GOAP Regressions
// ============================================================
describe("regression: greedy goal testing", () => {
  // Goal tested at child-generation time caused expensive single-step plans
  // to beat cheap multi-step ones. Must test on POP.
  it("cheapest multi-step plan wins over expensive single-step", () => {
    const start = new PlannerWorldState();
    const planner = new GoapPlanner();
    const actions = [
      defineAction("expensive", "ExpensiveEat", { effects: [setTrue("done")], baseCost: 10 }),
      defineAction("get", "Get", { effects: [setTrue("ing")], baseCost: 0.2 }),
      defineAction("cook", "Cook", { preconditions: [trueFact("ing")], effects: [setTrue("meal")], baseCost: 0.3 }),
      defineAction("eat", "Eat", { preconditions: [trueFact("meal")], effects: [setTrue("done")], baseCost: 0.1 }),
    ];
    const result = planner.plan(start, [trueFact("done")], actions);
    expect(result.success).toBe(true);
    expect(result.plan!.steps.map((s) => s.id)).toEqual(["get", "cook", "eat"]);
    expect(result.plan!.totalCost).toBeLessThan(10);
  });

  it("cycle avoidance terminates within expansion budget", () => {
    const start = new PlannerWorldState();
    const planner = new GoapPlanner();
    planner.maxDepth = 8;
    const actions = [
      defineAction("ping", "Ping",
        { preconditions: [{ key: "fb", atLeast: false, value: 1 }],
          effects: [setFalse("fa"), setTrue("fb")], baseCost: 0.5 }),
      defineAction("pong", "Pong",
        { preconditions: [{ key: "fa", atLeast: false, value: 1 }],
          effects: [setFalse("fb"), setTrue("fa")], baseCost: 0.5 }),
    ];
    const result = planner.plan(start, [trueFact("never_goal")], actions);
    expect(result.success).toBe(false);
    expect(result.metrics.nodesExpanded).toBeLessThanOrEqual(600);
  });
});

// ============================================================
// Commitment Hysteresis Livelock
// ============================================================
describe("regression: commitment cooldown livelock", () => {
  // Expired commitment releasing AFTER evaluation let satisfied goals re-elect
  // themselves forever by waiving switch cost + cooldown. Fix: release BEFORE.
  it("satisfied goal does not re-elect itself forever via stale commitment", () => {
    let clockMin = 0;
    const needs = new NeedSet(standardNeedLibrary(), {
      [NeedKind.Social]: 55, [NeedKind.Fun]: 40,
    });
    const mind = new AgentMind("npc_test", "Test", undefined,
      PersonalityProfile.balanced(), needs);
    const cognition = new CognitionSystem(
      { allMinds: () => [mind], mind: () => mind },
      () => clockMin,
    );

    // Initial: socialize wins.
    cognition.decide(mind.agent);

    // Small step: commitment holds (social above satisfaction threshold).
    clockMin += 30;
    needs.advance({ totalMinutes: 30 });
    const d2 = cognition.decide(mind.agent);
    expect(d2.keptPrevious).toBe(true);

    // Fully relieve social need → below threshold → commitment releases.
    needs.get(NeedKind.Social).apply(100);
    const d3 = cognition.decide(mind.agent);
    expect(d3.keptPrevious).toBe(false);
  });
});

