/** Population generator for benchmarks/soak: N residents over demo locations. */
import { createDemoTown } from "@echosim/content";
import { PersonalityProfile } from "@echosim/cognition";
import type { Town, PlanningDirector } from "@echosim/simulation";

export interface BenchWorld {
  town: Town;
  director: PlanningDirector;
  residentIds: string[];
}

/**
 * Deterministic scaled town: reuses the demo layout and fills it with
 * balanced-personality residents distributed across homes/jobs.
 */
export function createScaledTown(seed: bigint | number, population: number,
  options: { withJobs?: boolean } = {}): BenchWorld {
  const base = createDemoTown(seed);
  const { town } = base;
  const ids = [...town.residents.orderedIds()];

  const homes = ["loc_home_a", "loc_home_a", "loc_home_a"];
  const workplaces = [
    { id: "loc_bakery", start: 300, end: 840 },   // bakery shift
    { id: "loc_cafe", start: 360, end: 1200 },    // cafe shift
    { id: "loc_store", start: 480, end: 1260 },   // store shift
  ];

  for (let i = ids.length; i < population; i++) {
    const id = `npc_r${String(i).padStart(3, "0")}`;
    const jitter = ((Number(BigInt(seed) % 1000n) + i * 37) % 100) / 100;
    town.spawnResident({
      id,
      displayName: id.replace("npc_", "R"),
      homeLocationId: homes[i % homes.length]!,
      personality: PersonalityProfile.balanced()
        .edit()
        .set(7 /* Sociability */, 0.3 + jitter * 0.6)
        .set(11 /* Ambition */, 0.2 + ((i * 13) % 100) / 100 * 0.6)
        .build(),
      initialNeeds: { [1]: 55 },
      startLocationId: undefined,
    });
    if (options.withJobs !== false && i % 2 === 0) {
      const w = workplaces[i % workplaces.length]!;
      town.residents.mind(id).job = {
        id: `job_${i}`, title: "Shift Worker", workplace: w.id,
        shiftStartMinuteOfDay: w.start, shiftEndMinuteOfDay: w.end,
        incomePerHour: 9,
      };
      town.residents.mind(id).isRestDayToday = () => false;
    }
    ids.push(id);
  }

  return { town, director: base.director, residentIds: ids };
}
