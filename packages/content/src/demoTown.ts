/**
 * Authored demo town: the canonical three-resident scenario used by the CLI,
 * tests and the debug UI. Data-driven composition — no engine code.
 */
import { Town, PlanningDirector } from "@echosim/simulation";
import { PersonalityProfile } from "@echosim/cognition";

export interface DemoResidentSpec {
  id: string;
  name: string;
}

export const DEMO_CAST: readonly DemoResidentSpec[] = [
  { id: "npc_mira", name: "Mira" },
  { id: "npc_rohan", name: "Rohan" },
  { id: "npc_anika", name: "Anika" },
];

export interface DemoTown {
  town: Town;
  director: PlanningDirector;
  miraId: string;
  rohanId: string;
  anikaId: string;
}

/** Deterministic per seed. Locations, residents and Mira's preferences. */
export function createDemoTown(seed: bigint | number): DemoTown {
  const town = new Town(seed);

  town.registerLocation({ id: "loc_home_a", displayName: "Home A" });
  town.registerLocation({
    id: "loc_cafe", displayName: "Corner Cafe",
    hours: { openMinuteOfDay: 360, closeMinuteOfDay: 1200 },
  });
  town.registerLocation({
    id: "loc_bakery", displayName: "Bakery",
    hours: { openMinuteOfDay: 300, closeMinuteOfDay: 840 },
  });
  town.registerLocation({ id: "loc_park", displayName: "Park" });
  town.registerLocation({
    id: "loc_store", displayName: "General Store",
    hours: { openMinuteOfDay: 480, closeMinuteOfDay: 1260 },
  });

  for (const r of DEMO_CAST) {
    town.spawnResident({
      id: r.id,
      displayName: r.name,
      homeLocationId: "loc_home_a",
      personality: r.id === DEMO_CAST[0]!.id
        ? PersonalityProfile.miraLike()
        : PersonalityProfile.balanced(),
      initialNeeds: { [1 /* Hunger */]: 55 },
    });
  }

  // Mira authored preferences (Sprint 14 fixture).
  town.residents.mind(DEMO_CAST[0]!.id).setPreferences({
    get(key) {
      if (key === "rain") return 0.88;
      return key === "cafe" ? 0.78 : 0;
    },
  });

  const director = new PlanningDirector(town);
  return {
    town, director,
    miraId: DEMO_CAST[0]!.id,
    rohanId: DEMO_CAST[1]!.id,
    anikaId: DEMO_CAST[2]!.id,
  };
}
