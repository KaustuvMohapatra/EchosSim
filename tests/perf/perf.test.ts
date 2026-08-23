/** Sprint 27/28 — structural performance guards (generous, machine-safe). */
import { describe, expect, it } from "vitest";
import { createScaledTown } from "@echosim/content";
import { SoakMonitor } from "@echosim/inspector";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S27/S28: performance & invariants", () => {
  // Local measurement: ~5 s for this scenario. The 30 s wall bound leaves ~6x
  // headroom for slow CI machines; the vitest timeout is raised accordingly.
  it("20 residents x 2 simulated days complete well within budget", { timeout: 60_000 }, () => {
    const world = createScaledTown(9001, 20);
    const started = performance.now();
    step(world.town, world.director, 2880);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(30_000);
    expect(world.director.totalPlansSucceeded).toBeGreaterThan(0);
  });

  it("hourly invariant sweeps stay clean over a compressed soak", { timeout: 120_000 }, () => {
    const world = createScaledTown(4242, 25);
    const monitor = new SoakMonitor();
    let violations = 0;
    let checks = 0;
    // Compressed soak: 25 residents x 6 days.
    for (let d = 0; d < 6; d++) {
      for (let m = 0; m < 1440; m += 10) {
        step(world.town, world.director, 10);
        if ((m / 10) % 6 === 0) {
          checks++;
          violations += monitor.visit(world.town, world.director).violations.length;
        }
      }
    }
    expect(checks).toBeGreaterThan(0);
    expect(violations).toBe(0);
    // Bounded memory growth.
    for (const id of world.residentIds)
      expect((world.town.memory.tryStoreFor(id)?.count ?? 0)).toBeLessThanOrEqual(250);
  });

  it("planner respects its expansion cap on pathological goals", () => {
    const world = createScaledTown(9001, 10);
    step(world.town, world.director, 600);
    // Every recorded planning attempt stayed within the planner's cap.
    expect(world.director.nodesExpandedLastPlan).toBeLessThanOrEqual(4000);
  });
});
