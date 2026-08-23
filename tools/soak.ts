/** Soak gauntlet (Sprint 28): 50 NPCs x 30 simulated days, invariant-checked.
 *  Usage: npx tsx tools/soak.ts [population] [days] [seed] */
import { createScaledTown } from "@echosim/content";
import { SoakMonitor } from "@echosim/inspector";
import { writeFileSync, mkdirSync } from "fs";

const population = Number(process.argv[2] ?? 50);
const days = Number(process.argv[3] ?? 30);
const seed = process.argv[4] ?? "28001";

const world = createScaledTown(BigInt(seed), population);
const { town, director } = world;
const monitor = new SoakMonitor();

let totalViolations: string[] = [];
let checks = 0;
const started = performance.now();

outer:
for (let d = 0; d < days; d++) {
  for (let m = 0; m < 1440; m += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();

    if ((m / 10) % 6 === 0) { // every simulated hour
      const report = monitor.visit(town, director);
      checks++;
      if (report.violations.length > 0) {
        console.error(`Invariant violations at day ${d + 1} ${Math.floor((m % 1440) / 60)}:00:`);
        for (const v of report.violations.slice(0, 10)) console.error("  - " + v);
        totalViolations.push(...report.violations);
        // Failure artifact (spec 28.5): everything needed to reproduce.
        mkdirSync("results", { recursive: true });
        writeFileSync(`results/soak-fail-${seed}.json`, JSON.stringify({
          seed, population, days,
          failedAtDay: d + 1, failedAtMinute: d * 1440 + m,
          violations: report.violations,
          save: null as unknown, // full save attached below when available
          stats: {
            residents: town.residents.orderedIds().length,
            plansSucceeded: director.totalPlansSucceeded,
            plansFailed: director.totalPlansFailed,
            events: town.events.statistics.publishedEvents,
          },
        }, null, 2));
        break outer;
      }
    }
  }
  const memories = world.residentIds.reduce(
    (s, id) => s + (town.memory.tryStoreFor(id)?.count ?? 0), 0);
  process.stdout.write(
    `day ${String(d + 1).padStart(2)}/${days} | plans ✓${director.totalPlansSucceeded} ` +
    `✗${director.totalPlansFailed} | memories ${memories} | rel ${town.relationships.all().length}\r`);
}

const wallS = Math.round((performance.now() - started) / 100) / 10;
const memoryTotal = world.residentIds.reduce(
  (s, id) => s + (town.memory.tryStoreFor(id)?.count ?? 0), 0);

console.log("\n\n=== SOAK RESULT ===");
console.log(`population   : ${population}`);
console.log(`sim duration : ${days} days (${seed ? "seed " + seed : ""})`);
console.log(`wall time    : ${wallS}s`);
console.log(`checks       : ${checks} hourly invariant sweeps`);
console.log(`violations   : ${totalViolations.length}`);
console.log(`plans        : ✓${director.totalPlansSucceeded} ✗${director.totalPlansFailed}`);
console.log(`memories     : ${memoryTotal} (bounded stores: ${population * 250} max)`);
console.log(`beliefs      : ${town.beliefs.owners().reduce((s, o) => s + o.store.count, 0)}`);
process.exit(totalViolations.length > 0 ? 1 : 0);
