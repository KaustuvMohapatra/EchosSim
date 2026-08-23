/**
 * Experiment configuration + reproducible run harness (Sprint 30).
 * Ablations flip first-class Town feature switches; nothing is monkey-patched.
 */
import { PersonalityProfile } from "@echosim/cognition";
import { createAuthoredTown, createDemoTown, createScaledTown } from "@echosim/content";
import { EventJournal } from "@echosim/inspector";
import type { Town, PlanningDirector } from "@echosim/simulation";

export interface FeatureFlags {
  memory: boolean;
  reflection: boolean;
  gossip: boolean;
  habits: boolean;
  /** Uniform personalities (ablates trait-driven variation). */
  personality: boolean;
  /** LLM dialogue rendering (presentation-only; recorded for metadata). */
  llmDialogue: boolean;
}

export const ALL_ON: FeatureFlags = {
  memory: true, reflection: true, gossip: true,
  habits: true, personality: true, llmDialogue: false,
};

export interface ExperimentConfig {
  experimentId: string;
  seeds: number[];
  population: "demo" | "authored" | number;
  durationDays: number;
  stepMinutes?: number;
  variants: Array<{ name: string; features: Partial<FeatureFlags> }>;
}

export const MEMORY_ABLATION: ExperimentConfig = {
  experimentId: "memory-ablation",
  seeds: [1001],
  population: "authored",
  durationDays: 2,
  variants: [
    { name: "baseline", features: {} },
    { name: "memory-off", features: { memory: false } },
    { name: "reflection-off", features: { reflection: false } },
    { name: "gossip-off", features: { gossip: false } },
    { name: "personality-off", features: { personality: false } },
    { name: "habits-off", features: { habits: false } },
  ],
};

export function parseConfig(json: unknown): ExperimentConfig {
  const c = json as ExperimentConfig;
  if (!c || typeof c.experimentId !== "string")
    throw new Error("config.experimentId required");
  if (!Array.isArray(c.seeds) || c.seeds.length === 0)
    throw new Error("config.seeds must be a non-empty array");
  if (typeof c.durationDays !== "number" || c.durationDays <= 0)
    throw new Error("config.durationDays must be positive");
  if (!Array.isArray(c.variants) || c.variants.length === 0)
    throw new Error("config.variants must be non-empty");
  return {
    stepMinutes: 10,
    population: "demo",
    ...c,
  };
}

export interface BuiltWorld {
  town: Town;
  director: PlanningDirector;
  journal: EventJournal;
  residentIds: string[];
}

/** Builds the configured world with variant flags applied. */
export function buildWorld(config: ExperimentConfig, seed: number,
  features: Partial<FeatureFlags>): BuiltWorld {
  const flags = { ...ALL_ON, ...features };
  let world: ReturnType<typeof createScaledTown>;
  if (config.population === "authored") {
    world = wrapAuthored(seed);
  } else if (config.population === "demo") {
    world = wrapDemo(seed);
  } else {
    world = createScaledTown(seed, config.population as number);
  }
  const { town, director } = world;

  town.features.memory = flags.memory;
  town.features.reflection = flags.reflection;
  town.features.gossip = flags.gossip;
  town.features.habits = flags.habits;

  // Personality ablation: flatten every resident to neutral traits.
  if (!flags.personality) {
    for (const id of town.residents.orderedIds()) {
      const mind = town.residents.mind(id);
      (mind as unknown as { personality: PersonalityProfile }).personality =
        PersonalityProfile.uniform(0.5);
    }
  }

  return { town, director, journal: new EventJournal(town), residentIds: world.residentIds };
}

function wrapAuthored(seed: number) {
  const w = createAuthoredTown(seed);
  return { town: w.town, director: w.director, residentIds: w.residentIds };
}
function wrapDemo(seed: number) {
  const w = createDemoTown(seed);
  return { town: w.town, director: w.director, residentIds: [...w.town.residents.orderedIds()] };
}
