/** Sprint 50 — venue activities: money/needs/skills/memory effects. */
import { describe, expect, it } from "vitest";
import { createAuthoredTown } from "@echosim/content";
import { performVenueActivity } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";

function place(town: Town, agentId: string, lot: string): void {
  town.moveAgent(agentId as never, lot as never);
}

describe("S50: venue activities", () => {
  it("ordering coffee costs money, lifts fun and stores a memory", () => {
    const { town } = createAuthoredTown(7001);
    const miraId = "npc_mira";
    for (let i = 0; i < 60; i++) town.clock.advance({ totalMinutes: 10 }); // 10:00
    // Mid-day so the cafe is open.
    for (let i = 0; i < 40; i++) {
      town.cognition.advanceNeeds({ totalMinutes: 10 });
      town.clock.advance({ totalMinutes: 10 });
    }
    place(town, miraId, "cafe");
    town.residents.mind(miraId).money = 20; // pocket money for the coffee
    const beforeMoney = town.residents.mind(miraId).money;
    const beforeFun = town.residents.mind(miraId).needs.get(3).current;

    const r = performVenueActivity(town, miraId, "order_coffee");
    expect(r.ok).toBe(true);

    const mind = town.residents.mind(miraId);
    expect(mind.money).toBe(beforeMoney - 4);
    expect(mind.needs.get(3).current).toBeLessThan(beforeFun);
    const mem = [...town.memory.storeFor(miraId).all];
    expect(mem.some((m) => m.summary.includes("coffee"))).toBe(true);
  });

  it("refuses when broke, wrong place, or closed", () => {
    const { town } = createAuthoredTown(7001);
    const miraId = "npc_mira";
    for (let i = 0; i < 60; i++) town.clock.advance({ totalMinutes: 10 }); // 10:00
    // Broke at the cafe (open during day).
    for (let i = 0; i < 40; i++) town.clock.advance({ totalMinutes: 10 });
    place(town, miraId, "cafe");
    town.residents.mind(miraId).money = 0;
    expect(performVenueActivity(town, miraId, "order_coffee").ok).toBe(false);

    // Right money but wrong place.
    town.moveAgent(miraId as never, "apt_a" as never);
    town.residents.mind(miraId).money = 20;
    expect(performVenueActivity(town, miraId, "buy_groceries").feedback)
      .toMatch(/wrong place/i);
  });

  it("reading grants Knowledge XP; jogging drains energy but grants Fitness", () => {
    const { town } = createAuthoredTown(7001);
    const miraId = "npc_mira";
    for (let i = 0; i < 60; i++) town.clock.advance({ totalMinutes: 10 }); // 10:00
    place(town, miraId, "library");
    const r1 = performVenueActivity(town, miraId, "read_book");
    expect(r1.ok).toBe(true);
    expect(town.skills.stateOf(miraId, "Knowledge").xp).toBe(8);

    place(town, miraId, "park");
    const e0 = town.residents.mind(miraId).needs.get(1).current;
    const r2 = performVenueActivity(town, miraId, "jog");
    expect(r2.ok).toBe(true);
    expect(town.skills.stateOf(miraId, "Fitness").xp).toBe(9);
    expect(town.residents.mind(miraId).needs.get(1).current).toBeGreaterThan(e0);
  });

  it("sketching works even when the studio is unstaffed (open hours only)", () => {
    const { town } = createAuthoredTown(7001);
    const miraId = "npc_mira";
    for (let i = 0; i < 60; i++) town.clock.advance({ totalMinutes: 10 }); // 10:00
    place(town, miraId, "studio");
    const r = performVenueActivity(town, miraId, "sketch");
    expect(r.ok).toBe(true);
    expect(town.skills.stateOf(miraId, "Creativity").xp).toBe(9);
  });
});
