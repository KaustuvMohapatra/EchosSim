/** EchoSim headless simulation runner: seed-driven, deterministic, no browser needed. */
import { Town, PlanningDirector } from "@echosim/simulation";
import { PersonalityProfile } from "@echosim/cognition";

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith("--seed="));
const daysArg = args.find((a) => a.startsWith("--days="));
const seed = seedArg ? BigInt(seedArg.split("=")[1]!) : 42069n;
const numDays = daysArg ? parseInt(daysArg.split("=")[1]!) : 7;

console.log("EchoSim Simulation");
console.log(`Seed: ${seed}`);
console.log(`Days: ${numDays}`);
console.log();

const town = new Town(seed);
town.registerLocation({ id: "loc_home_a", displayName: "Home A" });
town.registerLocation({ id: "loc_cafe", displayName: "Corner Cafe", hours: { openMinuteOfDay: 360, closeMinuteOfDay: 1200 } });
town.registerLocation({ id: "loc_bakery", displayName: "Bakery", hours: { openMinuteOfDay: 300, closeMinuteOfDay: 840 } });
town.registerLocation({ id: "loc_park", displayName: "Park" });
town.registerLocation({ id: "loc_store", displayName: "General Store", hours: { openMinuteOfDay: 480, closeMinuteOfDay: 1260 } });

const cast = [
  { id: "npc_mira", name: "Mira" },
  { id: "npc_rohan", name: "Rohan" },
  { id: "npc_anika", name: "Anika" },
];

for (const r of cast) {
  const spec = {
    id: r.id,
    displayName: r.name,
    homeLocationId: "loc_home_a",
    personality: r.id === "npc_mira" ? PersonalityProfile.miraLike() : PersonalityProfile.balanced(),
    initialNeeds: { [1]: 55 } as Partial<Record<number, number>>,
  };
  town.spawnResident(spec);
}

// Give Mira her rain preference.
town.residents.mind("npc_mira").setPreferences({
  get(key) { return key === "rain" ? 0.88 : key === "cafe" ? 0.78 : 0; },
});

const director = new PlanningDirector(town);

let totalEvents = 0;
town.events.subscribe("sim:plan-started", () => { totalEvents++; });
town.events.subscribe("sim:agent-moved", () => { totalEvents++; });
town.events.subscribe("sim:weather-changed", () => { totalEvents++; });

// Log notable moments.
town.events.subscribe("sim:plan-finished", (e: { agent: string; goal: string; outcome: string }) => {
  if (e.outcome === "Succeeded")
    console.log(`${new Date(town.clock.currentTime.totalMinutes * 60000).toISOString().slice(11, 16)} ${e.agent} → ${e.goal} ✓`);
});
town.events.subscribe("sim:weather-changed", (e: { to: number }) => {
  const names = ["Clear", "Cloudy", "Rain", "HeavyRain"];
  console.log(`  ☁ Weather → ${names[e.to] ?? e.to}`);
});

// Run simulation.
const minutesPerDay = 1440;
for (let day = 0; day < numDays; day++) {
  console.log(`\nDay ${day + 1}:`);
  for (let m = 0; m < minutesPerDay; m += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

console.log("\nSimulation complete.");
console.log(`\nDays: ${numDays}`);
console.log(`Events: ${totalEvents}`);
console.log(`Memories: ${town.memory.storeFor("npc_mira").count +
  town.memory.storeFor("npc_rohan").count + town.memory.storeFor("npc_anika").count}`);
console.log(`Relationships: ${town.relationships.all().length}`);
console.log(`Plans succeeded: ${director.totalPlansSucceeded}`);
console.log(`Plans failed: ${director.totalPlansFailed}`);
console.log(`Replans: ${director.totalReplans}`);
