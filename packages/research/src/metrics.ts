/** Metric collection over a finished run (spec 30.3). */
import { relationshipLabelOf } from "@echosim/inspector";
import type { BuiltWorld } from "./config.js";

export interface RunMetrics {
  plansCreated: number;
  plansSucceeded: number;
  plansFailed: number;
  goalSuccessRate: number;
  actionFailureRate: number;
  avgPlanLength: number;
  conversationsPerDay: number;
  memoriesPerDay: number;
  relationshipAffinityStddev: number;
  networkDensity: number;
  beliefMaxHops: number;
  /** Fraction of transferred rumours whose stance sign matches the origin. */
  rumourAccuracy: number;
  /** Mean distinct locations visited per resident. */
  routineDiversity: number;
  habitCount: number;
}

export class RunObserver {
  private planStepSum = 0;
  planCount = 0;
  conversations = 0;
  memoryCreations = 0;
  private readonly visited = new Map<string, Set<string>>();

  constructor(private readonly world: BuiltWorld) {
    const { town } = world;

    town.events.subscribe<{ steps: number }>("sim:plan-started", (e) => {
      this.planCount++;
      this.planStepSum += e.steps ?? 0;
    });
    town.events.subscribe<unknown>("sim:conversation", () => { this.conversations++; });
    town.events.subscribe<{ agent: string; to: string }>("sim:agent-moved", (e) => {
      let set = this.visited.get(e.agent);
      if (!set) { set = new Set(); this.visited.set(e.agent, set); }
      set.add(e.to);
    });
    // Memory creations == successful encodes; count via reflected proxy is
    // wrong, so observe store growth cheaply at collect time instead.
    void world;
  }

  collect(days: number): RunMetrics {
    const { town, director, residentIds } = this.world;
    const created = director.totalPlansCreated || 1;

    // Relationship stats.
    const links = town.relationships.all();
    const affinities = links.map((l) => l.rel.affinity);
    const mean = affinities.reduce((s, v) => s + v, 0) / Math.max(1, affinities.length);
    const variance = affinities.length > 1
      ? affinities.reduce((s, v) => s + (v - mean) ** 2, 0) / (affinities.length - 1)
      : 0;

    // Network density (directed, among residents).
    const n = Math.max(1, residentIds.length);
    const density = links.length / (n * (n - 1));

    // Beliefs.
    const owners = town.beliefs.owners();
    let maxHops = 0;
    let rumours = 0;
    let accurate = 0;
    for (const { owner, store } of owners) {
      for (const b of store.all) {
        if (b.hopCount > maxHops) maxHops = b.hopCount;
        if (b.hopCount > 0) {
          rumours++;
          const originStore = b.sourceAgent !== undefined
            ? town.beliefs.tryStoreFor(b.sourceAgent) : undefined;
          const origin = originStore?.tryGet(b.subjectKey, b.predicate);
          if (origin && Math.sign(origin.stance) === Math.sign(b.stance)) accurate++;
        }
      }
    }

    // Habits.
    let habits = 0;
    for (const id of residentIds) habits += town.habits.habitsOf(id).length;

    // Routine diversity.
    let diversitySum = 0;
    for (const id of residentIds)
      diversitySum += this.visited.get(id)?.size ?? 0;

    return {
      plansCreated: director.totalPlansCreated,
      plansSucceeded: director.totalPlansSucceeded,
      plansFailed: director.totalPlansFailed,
      goalSuccessRate: director.totalPlansSucceeded / created,
      actionFailureRate: director.totalPlansFailed / created,
      avgPlanLength: this.planCount > 0 ? this.planStepSum / this.planCount : 0,
      conversationsPerDay: round(this.conversations / days),
      memoriesPerDay: round(this.countMemories() / days),
      relationshipAffinityStddev: round(Math.sqrt(variance), 5),
      networkDensity: round(density, 6),
      beliefMaxHops: maxHops,
      rumourAccuracy: rumours > 0 ? round(accurate / rumours, 4) : 0,
      routineDiversity: round(diversitySum / n, 3),
      habitCount: habits,
    };
  }

  private countMemories(): number {
    let total = 0;
    for (const id of this.world.residentIds)
      total += this.world.town.memory.tryStoreFor(id)?.count ?? 0;
    return total;
  }
}

function round(v: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Per-agent CSV row. */
export function agentRow(world: BuiltWorld, id: string): Record<string, string | number> {
  const mind = world.town.residents.mind(id);
  return {
    agent_id: id,
    name: mind.displayName,
    money: mind.money,
    emotion_valence: mind.emotionValence.toFixed(4),
    memories: world.town.memory.tryStoreFor(id)?.count ?? 0,
    semantic_count: world.town.reflections.semanticOf(id).length,
    habits: world.town.habits.habitsOf(id).length,
    intentions: 0,
  };
}

export function relationshipRows(world: BuiltWorld): Array<Record<string, string | number>> {
  return world.town.relationships.all().map((l) => ({
    from: l.from, to: l.to,
    familiarity: l.rel.familiarity.toFixed(4),
    affinity: l.rel.affinity.toFixed(4),
    trust: l.rel.trust.toFixed(4),
    respect: l.rel.respect.toFixed(4),
    grievance: l.rel.grievance.toFixed(4),
    label: relationshipLabelOf(l.rel),
  }));
}

export function beliefRows(world: BuiltWorld): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const { owner, store } of world.town.beliefs.owners())
    for (const b of store.all)
      rows.push({
        owner, subject: b.subjectKey, predicate: b.predicate,
        stance: b.stance.toFixed(4), confidence: b.confidence.toFixed(4),
        hops: b.hopCount, source_agent: b.sourceAgent ?? "",
      });
  return rows;
}
