/** Sprint 30 — research mode: ablations, metrics, exports, reproducibility. */
import { describe, expect, it } from "vitest";
import {
  MEMORY_ABLATION, buildWorld, parseConfig,
  runOnce, runExperiment, exportResults, toCsv, METRIC_COLUMNS, stepWorld,
} from "@echosim/research";

function mini(overrides: Partial<typeof MEMORY_ABLATION> = {}, features: Record<string, boolean> = {}) {
  return {
    ...MEMORY_ABLATION,
    seeds: [1001],
    population: "demo" as const,
    durationDays: 1,
    variants: [{ name: "v", features }],
    ...overrides,
  };
}

describe("S30: feature ablations actually ablate", () => {
  it("memory-off produces zero episodic memories", () => {
    const summary = runOnce(mini({}, { memory: false }), "v", { memory: false }, 1001);
    expect(summary.metrics.memoriesPerDay).toBe(0);
  });

  it("reflection-off yields no semantic memories despite social traffic", () => {
    const world = buildWorld(mini(), 1001, { reflection: false });
    stepWorld(world, 2, 10);
    for (const id of world.residentIds)
      expect(world.town.reflections.semanticOf(id)).toHaveLength(0);
  });

  it("gossip-off blocks belief transfer", () => {
    const world = buildWorld(mini(), 1001, { gossip: false });
    const now = world.town.clock.currentTime.totalMinutes;
    world.town.beliefs.learnDirect("npc_mira", "npc_anika", "regard", -0.9, 0.95, 7, now);
    // Mira gossips to whoever is beside her (Rohan).
    world.town.events.publish("sim:plan-step-completed",
      { agent: "npc_mira", action: "act_talk", index: 0 });

    const transferred = world.town.beliefs.tryStoreFor("npc_rohan")
      ?.tryGet("npc_anika", "regard");
    expect(transferred).toBeUndefined();
  });

  it("habits-off records nothing from movements", () => {
    const world = buildWorld(mini(), 1001, { habits: false });
    world.town.moveAgent("npc_mira" as never, "loc_park" as never);
    world.town.moveAgent("npc_mira" as never, "loc_home_a" as never);
    world.town.moveAgent("npc_mira" as never, "loc_park" as never);
    expect(world.town.habits.habitsOf("npc_mira")).toHaveLength(0);
  });

  it("personality-off flattens all traits to uniform 0.5", () => {
    const world = buildWorld(mini(), 1001, { personality: false });
    for (const id of world.residentIds) {
      for (const t of world.town.residents.mind(id).personality.toArray())
        expect(t).toBe(0.5);
    }
  });

  it("baseline flags reproduce normal memory formation", () => {
    const summary = runOnce(mini(), "v", {}, 1001);
    expect(Number(summary.metrics.memoriesPerDay)).toBeGreaterThan(0);
  });
});

describe("S30: metrics + exports", () => {
  const config = mini(
    { variants: [
      { name: "baseline", features: {} },
      { name: "memory-off", features: { memory: false } },
    ] },
  );

  it("metric invariants hold across a variant x seed batch", () => {
    const summaries = runExperiment(config);
    expect(summaries).toHaveLength(2);
    for (const s of summaries) {
      expect(Number(s.metrics.goalSuccessRate)).toBeGreaterThanOrEqual(0);
      expect(Number(s.metrics.goalSuccessRate)).toBeLessThanOrEqual(1);
      expect(Number(s.metrics.networkDensity)).toBeLessThanOrEqual(1);
      expect(Number(s.metrics.avgPlanLength)).toBeGreaterThan(0);
      expect(Number(s.metrics.routineDiversity)).toBeGreaterThanOrEqual(0);
    }
    // Ablation visibly zeroes the target metric.
    const off = summaries.find((s) => s.variant === "memory-off")!;
    const on = summaries.find((s) => s.variant === "baseline")!;
    expect(Number(off.metrics.memoriesPerDay)).toBe(0);
    expect(Number(on.metrics.memoriesPerDay)).toBeGreaterThan(0);
  });

  it("CSV export is flat, documented, and parseable", { timeout: 60_000 }, () => {
    const summaries = runExperiment(config);
    const row = summaries[0]!.metrics;
    const csvRow = { experiment_id: config.experimentId, variant: "baseline",
      seed: 1001, days: config.durationDays, population: String(config.population),
      ...row, git_commit: "test", timestamp: "2026-01-01T00:00:00.000Z" };
    const csv = toCsv([csvRow as unknown as Record<string, string | number>],
      METRIC_COLUMNS as unknown as readonly string[]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(METRIC_COLUMNS.join(","));
    expect(lines[1]!.split(",").length).toBe(METRIC_COLUMNS.length);

    // Directory export writes every promised artifact.
    const dir = exportResults(config, summaries, "results-test");
    const { existsSync, readFileSync } = require("fs") as typeof import("fs");
    const { join } = require("path") as typeof import("path");
    for (const f of ["config.json", "summary.json", "summary.csv",
      "agents.csv", "relationships.csv", "beliefs.csv", "events.csv"]) {
      expect(existsSync(join(dir, f))).toBe(true);
    }
    const meta = JSON.parse(readFileSync(join(dir, "config.json"), "utf-8")) as {
      metadata?: { gitCommit?: string; timestamp?: string };
    };
    expect(meta.metadata?.timestamp).toMatch(/^\d{4}-/);
    expect(meta.metadata?.gitCommit?.length).toBeGreaterThan(0);
  });

  it("parseConfig rejects malformed configs", () => {
    expect(() => parseConfig({})).toThrow(/experimentId/);
    expect(() => parseConfig({ experimentId: "x", seeds: [], durationDays: 1,
      variants: [{ name: "a", features: {} }] })).toThrow(/seeds/);
  });
});
