/** CLI: pnpm experiment --config experiments/memory-ablation.json */
import { readFileSync, existsSync } from "fs";
import { parseConfig, runExperiment, exportResults } from "./index.js";

const argPath = process.argv.slice(2).find((a) => a.startsWith("--config="));
const configPath = argPath?.split("=")[1] ?? "experiments/memory-ablation.json";

if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  process.exit(1);
}

const config = parseConfig(JSON.parse(readFileSync(configPath, "utf-8")));
console.log(`Experiment '${config.experimentId}': ` +
  `${config.variants.length} variants x ${config.seeds.length} seed(s), ` +
  `${config.durationDays} day(s), population=${config.population}`);

const summaries = runExperiment(config);
for (const s of summaries) {
  console.log(
    `${s.variant.padEnd(18)} seed ${String(s.seed).padEnd(6)} ` +
    `success ${(Number(s.metrics.goalSuccessRate) * 100).toFixed(1)}% ` +
    `conv/day ${s.metrics.conversationsPerDay} mem/day ${s.metrics.memoriesPerDay} ` +
    `habits ${s.metrics.habitCount}`);
}

const dir = exportResults(config, summaries);
console.log(`\nResults written to ${dir}/`);
