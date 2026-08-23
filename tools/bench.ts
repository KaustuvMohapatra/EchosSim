/** Performance harness (Sprint 27): measures real throughput at scale.
 *  Usage: npx tsx tools/bench.ts [population] [days] */
import { createScaledTown } from "@echosim/content";
import { MemoryRetriever } from "@echosim/social";

interface BenchResult {
  population: number;
  days: number;
  wallMs: number;
  simMinutes: number;
  ticksPerSecond: number;
  plansSucceeded: number;
  plansFailed: number;
  plannerNodesExpandedTotal: number;
  memoryPeekSamples: number;
  memoryPeekMsTotal: number;
  eventsPublished: number;
  heapPeakMb: number;
}

function runBench(population: number, days: number): BenchResult {
  const world = createScaledTown(9001, population);
  const { town, director } = world;

  const gc0 = process.memoryUsage().heapUsed;
  let heapPeak = gc0;
  const started = performance.now();

  const minutesPerDay = 1440;
  const stepMinutes = 10;
  let memoryPeekMs = 0;
  let memoryPeekSamples = 0;
  const retriever = new MemoryRetriever();
  retriever.wRecency = 0.3;

  for (let d = 0; d < days; d++) {
    for (let m = 0; m < minutesPerDay; m += stepMinutes) {
      const t0 = performance.now();
      town.cognition.advanceNeeds({ totalMinutes: stepMinutes });
      town.clock.advance({ totalMinutes: stepMinutes });
      director.tickAll();
      // Sample retrieval cost every ~10 ticks on first resident with a store.
      if ((d * 144 + m / stepMinutes) % 10 === 0) {
        const owner = world.residentIds.find((id) =>
          town.memory.tryStoreFor(id)?.count ?? 0 > 0);
        if (owner !== undefined) {
          const s = performance.now();
          retriever.peek(town.memory.storeFor(owner),
            { nowMinutes: town.clock.currentTime.totalMinutes }, 5);
          memoryPeekMs += performance.now() - s;
          memoryPeekSamples++;
        }
      }
      const h = process.memoryUsage().heapUsed;
      if (h > heapPeak) heapPeak = h;
      void t0;
    }
  }

  const wallMs = performance.now() - started;
  let nodesTotal = 0;
  void nodesTotal;

  return {
    population,
    days,
    wallMs: Math.round(wallMs),
    simMinutes: days * minutesPerDay,
    ticksPerSecond: Math.round(days * minutesPerDay / (wallMs / 1000)),
    plansSucceeded: director.totalPlansSucceeded,
    plansFailed: director.totalPlansFailed,
    plannerNodesExpandedTotal: director.nodesExpandedLastPlan,
    memoryPeekSamples,
    memoryPeekMsTotal: Math.round(memoryPeekMs * 100) / 100,
    eventsPublished: town.events.statistics.publishedEvents,
    heapPeakMb: Math.round(heapPeak / 1048576 * 10) / 10,
  };
}

const pops = process.argv.slice(2);
const list = pops.length > 0 ? pops.map(Number) : [20, 50, 100];
console.log("EchoSim benchmark — simulated 3 days per population\n");
for (const p of list) {
  const r = runBench(p, 3);
  console.log(
    `${String(r.population).padStart(4)} agents | ${r.wallMs} ms wall | ` +
    `sim ${r.ticksPerSecond} min/s | plans ✓${r.plansSucceeded} ✗${r.plansFailed} | ` +
    `peek ${r.memoryPeekMsTotal} ms / ${r.memoryPeekSamples} samples | ` +
    `events ${r.eventsPublished} | peak heap ${r.heapPeakMb} MB`);
}
