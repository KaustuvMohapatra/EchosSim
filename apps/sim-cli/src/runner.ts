/** EchoSim headless simulation runner: seed-driven, deterministic, no browser needed. */
import { createDemoTown, createAuthoredTown } from "@echosim/content";

const args = process.argv.slice(2);
const seedArg = args.find((a) => a.startsWith("--seed="));
const daysArg = args.find((a) => a.startsWith("--days="));
const authored = args.includes("--authored");
const seed = seedArg ? BigInt(seedArg.split("=")[1]!) : 42069n;
const numDays = daysArg ? parseInt(daysArg.split("=")[1]!) : 7;

console.log("EchoSim Simulation");
console.log(`Seed: ${seed}`);
console.log(`Days: ${numDays}${authored ? " (authored town)" : ""}`);
console.log();

const world = authored ? createAuthoredTown(seed) : createDemoTown(seed);
const { town, director } = world;
const residentIds = town.residents.orderedIds();
console.log(`Residents: ${residentIds.length}`);

let totalEvents = 0;
let conversations = 0;
town.events.subscribe("sim:plan-started", () => { totalEvents++; });
town.events.subscribe("sim:agent-moved", () => { totalEvents++; });
town.events.subscribe("sim:weather-changed", () => { totalEvents++; });
town.events.subscribe("sim:conversation", () => { conversations++; totalEvents++; });

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
console.log(`Memories: ${residentIds.reduce((sum, id) => sum + town.memory.storeFor(id).count, 0)}`);
console.log(`Relationships: ${town.relationships.all().length}`);
console.log(`Conversations: ${conversations}`);
console.log(`Plans succeeded: ${director.totalPlansSucceeded}`);
console.log(`Plans failed: ${director.totalPlansFailed}`);
console.log(`Replans: ${director.totalReplans}`);
