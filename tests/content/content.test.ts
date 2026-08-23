/** Sprint 29 — authored content: validation, composition, determinism. */
import { describe, expect, it } from "vitest";
import {
  createAuthoredTown, validateContent,
} from "@echosim/content";
import {
  TOWN_LOCATIONS, TOWN_GROUPS, RESIDENTS, SEED_RELATIONSHIPS,
} from "@echosim/content";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S29: content validation", () => {
  it("shipped content validates cleanly", () => {
    const issues = validateContent({
      locations: TOWN_LOCATIONS,
      groups: TOWN_GROUPS,
      residents: RESIDENTS,
      relationships: SEED_RELATIONSHIPS,
    });
    expect(issues).toEqual([]);
  });

  it("catches duplicate ids", () => {
    const issues = validateContent({
      locations: [...TOWN_LOCATIONS, { id: "cafe", name: "Dup" }],
      groups: TOWN_GROUPS,
      residents: RESIDENTS,
      relationships: SEED_RELATIONSHIPS,
    });
    expect(issues.some((i) => i.rule === "duplicate-id" && i.detail.includes("cafe"))).toBe(true);
  });

  it("catches unknown locations, jobs and group references", () => {
    const residents = [
      ...RESIDENTS.slice(0, 3),
      {
        id: "npc_bad", name: "Bad", homeId: "nowhere",
        job: { title: "X", workplaceId: "unemployed_land",
               shiftStartMinuteOfDay: 0, shiftEndMinuteOfDay: 60, incomePerHour: 1 },
        groups: ["club_ghosts"],
        traits: {},
      },
    ];
    const issues = validateContent({
      locations: TOWN_LOCATIONS,
      groups: TOWN_GROUPS,
      residents,
      relationships: [],
    });
    expect(issues.map((i) => i.rule)).toContain("unknown-location");
    expect(issues.map((i) => i.rule)).toContain("unknown-group");
  });

  it("catches trait values outside [0,1] and self-relationships", () => {
    const bad = [{
      ...RESIDENTS[1]!,
      id: "npc_traitbad",
      traits: { 7: 1.7 },
      homeId: RESIDENTS[1]!.homeId,
    }];
    const issues = validateContent({
      locations: TOWN_LOCATIONS,
      groups: TOWN_GROUPS,
      residents: bad,
      relationships: [{ from: "npc_traitbad", to: "npc_traitbad" }],
    });
    expect(issues.map((i) => i.rule)).toContain("trait-out-of-range");
    expect(issues.map((i) => i.rule)).toContain("self-relationship");
  });
});

describe("S29: authored town", () => {
  it("builds a population of 20-30 placed residents with groups", () => {
    const { town, residentIds } = createAuthoredTown(7001);
    expect(RESIDENTS.length).toBeGreaterThanOrEqual(20);
    expect(RESIDENTS.length).toBeLessThanOrEqual(30);
    expect(residentIds.length).toBe(RESIDENTS.length);

    for (const id of residentIds) {
      const state = town.agentsById.get(id)!;
      expect(state.hasLocation).toBe(true); // everyone starts at home
    }
    // Mira is present but ordinary: no special-cased fields beyond content.
    const mira = town.residents.mind("npc_mira");
    expect(mira.displayName).toBe("Mira");
    expect(mira.job?.workplace).toBe("studio");

    // Groups assigned per content.
    expect(town.groups.groupsOf("npc_mira").map((g) => g.id))
      .toContain("club_books");
  });

  it("seeded relationships exist directionally (incl. frictions)", () => {
    const { town } = createAuthoredTown(7001);
    const rels = town.relationships.all();
    expect(rels.length).toBeGreaterThanOrEqual(SEED_RELATIONSHIPS.length);

    const sanaNadia = rels.find(
      (l) => l.from === "npc_sana" && l.to === "npc_nadia")!;
    expect(sanaNadia.rel.grievance).toBeGreaterThan(0.4);

    // No self links from seeds.
    expect(rels.every((l) => l.from !== l.to)).toBe(true);
  });

  it("the authored town runs headlessly and stays invariant-clean", { timeout: 90_000 }, () => {
    const { town, director } = createAuthoredTown(7001);
    step(town, director, 720); // first day incl. work shifts

    for (const id of town.residents.orderedIds()) {
      const m = town.residents.mind(id);
      for (const n of m.needs.all())
        expect(Number.isFinite(n.current)).toBe(true);
    }
    expect(director.totalPlansCreated).toBeGreaterThan(0);
  });

  it("same seed produces an identical initial world (determinism)", () => {
    function snapshot() {
      const { town, residentIds } = createAuthoredTown(123456);
      return JSON.stringify(residentIds.map((id) => {
        const m = town.residents.mind(id);
        return [m.personality.toArray(), m.money,
          [...town.groups.groupsOf(id)].map((g) => g.id).sort()];
      }));
    }
    expect(snapshot()).toBe(snapshot());
  });
});
