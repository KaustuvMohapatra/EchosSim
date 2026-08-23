/** Experiment runner + CSV/JSON export (Sprint 30). */
import { mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import {
  ALL_ON, buildWorld, type ExperimentConfig, type FeatureFlags,
} from "./config.js";
import {
  RunObserver, agentRow, relationshipRows, beliefRows,
} from "./metrics.js";

export interface RunSummary {
  variant: string;
  seed: number;
  days: number;
  population: string | number;
  metrics: Record<string, string | number>;
}

export const METRIC_COLUMNS = [
  "experiment_id", "variant", "seed", "days", "population",
  "goal_success_rate", "action_failure_rate", "avg_plan_length",
  "conversations_per_day", "memories_per_day",
  "relationship_affinity_stddev", "network_density",
  "belief_max_hops", "rumour_accuracy", "routine_diversity",
  "habit_count", "git_commit", "timestamp",
] as const;

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Runs one variant on one seed and returns its summary row. */
export function runOnce(config: ExperimentConfig, variantName: string,
  features: Partial<FeatureFlags>, seed: number): RunSummary {
  const world = buildWorld(config, seed, features);
  const observer = new RunObserver(world);
  stepWorld(world, config.durationDays, config.stepMinutes ?? 10);

  const metrics = observer.collect(config.durationDays) as unknown as
    Record<string, string | number>;
  return {
    variant: variantName,
    seed,
    days: config.durationDays,
    population: String(config.population),
    metrics,
  };
}

/** Advances the world one day at a time in fixed steps (deterministic). */
export function stepWorld(
  world: { town: import("@echosim/simulation").Town; director: import("@echosim/simulation").PlanningDirector },
  days: number, stepMinutes: number,
): void {
  for (let d = 0; d < days; d++) {
    for (let m = 0; m < 1440; m += stepMinutes) {
      world.town.cognition.advanceNeeds({ totalMinutes: stepMinutes });
      world.town.clock.advance({ totalMinutes: stepMinutes });
      world.director.tickAll();
    }
  }
}

/** Full experiment: every variant x every seed. */
export function runExperiment(config: ExperimentConfig): RunSummary[] {
  const rows: RunSummary[] = [];
  for (const variant of config.variants) {
    for (const seed of config.seeds) {
      rows.push(runOnce(config, variant.name, variant.features, seed));
    }
  }
  return rows;
}

// ---------------- Export ----------------

export function toCsv(rows: Array<Record<string, string | number>>,
  columns?: readonly string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]!);
  const esc = (v: unknown): string => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/**
 * Writes the results tree:
 *   results/<id>/config.json summary.json agents.csv relationships.csv beliefs.csv events.csv
 */
export function exportResults(config: ExperimentConfig, summaries: RunSummary[],
  outDir = "results"): string {
  const dir = join(outDir, config.experimentId);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "config.json"), JSON.stringify({
    ...config,
    metadata: {
      gitCommit: gitCommit(),
      timestamp: new Date().toISOString(),
      featureFlagsBaseline: ALL_ON,
    },
  }, null, 2));

  // Summary rows carry experiment metadata inline (analysis-friendly flat CSV).
  const metricRows = summaries.map((s) => ({
    experiment_id: config.experimentId,
    variant: s.variant,
    seed: s.seed,
    days: s.days,
    population: s.population,
    ...s.metrics,
    git_commit: gitCommit(),
    timestamp: new Date().toISOString(),
  }));
  writeFileSync(join(dir, "summary.csv"),
    toCsv(metricRows, METRIC_COLUMNS as unknown as readonly string[]));
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summaries, null, 2));

  // Per-seed detail exports use the FIRST seed's baseline run for inspection.
  const firstSeed = config.seeds[0]!;
  const baselineVariant = config.variants[0]!;
  const world = buildWorld(config, firstSeed, baselineVariant.features);
  const observer = new RunObserver(world);
  stepWorld(world, config.durationDays, config.stepMinutes ?? 10);
  const finalMetrics = observer.collect(config.durationDays);
  void finalMetrics;

  writeFileSync(join(dir, "agents.csv"),
    toCsv(world.residentIds.map((id) => agentRow(world, id))));
  writeFileSync(join(dir, "relationships.csv"), toCsv(relationshipRows(world)));
  writeFileSync(join(dir, "beliefs.csv"), toCsv(beliefRows(world)));
  const events = world.journal.query({ limit: 5000 });
  writeFileSync(join(dir, "events.csv"), toCsv(events.map((e) => ({
    seq: e.seq, at_minutes: e.atMinutes, kind: e.kind,
    type: e.type, agent: e.agent ?? "", text: e.text,
  }))));
  return dir;
}
