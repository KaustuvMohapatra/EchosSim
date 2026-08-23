/** Regression S38: occupancy stays consistent even when venues reject entries. */
import { describe, expect, it } from "vitest";
import { createAuthoredTown } from "@echosim/content";
import { PersonalityProfile } from "@echosim/cognition";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

function occupancyMatchesTruth(town: Town): void {
  const want = new Map<string, number>();
  for (const id of town.residents.orderedIds()) {
    const s = town.agentsById.get(id)!;
    if (s.hasLocation && s.currentLocationId !== undefined)
      want.set(s.currentLocationId, (want.get(s.currentLocationId) ?? 0) + 1);
  }
  for (const locId of town.locations.orderedIds)
    expect(town.locations.get(locId).occupiedCount)
      .toBe(want.get(locId as never) ?? 0);
}

describe("regression: occupancy invariant under capacity pressure", () => {
  it("a full day of autonomous moves never desyncs lot counts", () => {
    const { town, director } = createAuthoredTown(7001);
    for (let m = 0; m < 1440; m += 10) {
      step(town, director, 10);
      occupancyMatchesTruth(town);
    }
  });

  it("capacity rejection fails the trip but keeps the traveller in place", () => {
    const { town } = createAuthoredTown(7001);
    // Cafe is authored with capacity 8.
    const rt = town.locations.get("cafe" as never);
    rt.forceOpen(true);

    for (let i = 0; i < 20; i++) {
      const ghost = `ghost_${i}`;
      town.spawnResident({
        id: ghost, displayName: ghost,
        homeLocationId: "apt_a",
        personality: PersonalityProfile.balanced(),
      });
      if (!rt.isFull) {
        const before = rt.occupiedCount;
        town.moveAgent(ghost as never, "cafe" as never);
        expect(rt.occupiedCount).toBe(before + 1);
      } else {
        // Full venue: entry must throw WITHOUT disturbing any counters.
        const beforeAll = town.locations.orderedIds
          .map((id) => town.locations.get(id).occupiedCount);
        expect(() => town.moveAgent(ghost as never, "cafe" as never))
          .toThrow(/full/);
        const afterAll = town.locations.orderedIds
          .map((id) => town.locations.get(id).occupiedCount);
        expect(afterAll).toEqual(beforeAll);

        // The rejected traveller still truthfully occupies their origin.
        const s = town.agentsById.get(ghost)!;
        expect(s.currentLocationId).toBe("apt_a");
        occupancyMatchesTruth(town);
        break;
      }
    }
    expect(rt.isFull).toBe(true);
  });
});
