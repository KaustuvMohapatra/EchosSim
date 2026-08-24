/**
 * Drives resident cognition: advances needs, builds goal contexts, selects and
 * commits goals with hysteresis. Planning-failure backoff suppresses goals so
 * the director never retry-spams (spec §3.8).
 */
import type { SimDuration } from "@echosim/core";
import type { AgentMind } from "./planning/agentMind.js";
import {
  DEFAULT_SELECTION_OPTIONS,
  selectGoals,
  type GoalContext,
  type GoalDefinition,
  type GoalScoreEntry,
} from "./goals/goalModel.js";
import { createDefaultGoals } from "./goals/standardGoals.js";

export class GoalDecision {
  constructor(
    readonly rawRanked: readonly GoalScoreEntry[],
    readonly effective: GoalScoreEntry,
    readonly keptPrevious: boolean,
  ) {}
}

export interface ResidentDirectory {
  allMinds(): AgentMind[];
  mind(agent: string): AgentMind;
}

export interface SuppressionEntry {
  agent: string;
  goal: string;
  untilMinutes: number;
}

export class CognitionSystem {
  private readonly goals: readonly GoalDefinition[];
  private schedulePressureProvider?: (agent: string, timeMinutes: number) => number;
  private weatherProvider?: () => number; // WeatherState numeric
  private locationKeyProvider?: (agent: string) => string | undefined;
  private habitProvider?: (agent: string, locationKey?: string) => number;
  private intentionProvider?: (agent: string) => number;
  private crowdingProvider?: (agent: string) => number;
  /** agent -> goal -> untilMinutes */
  private readonly suppressed = new Map<string, Map<string, number>>();

  constructor(
    private readonly residents: ResidentDirectory,
    private readonly timeMinutes: () => number,
    goals?: readonly GoalDefinition[],
  ) {
    this.goals = goals ?? createDefaultGoals();
  }

  setSchedulePressureProvider(provider: (agent: string, timeMinutes: number) => number): void {
    this.schedulePressureProvider = provider;
  }
  setWeatherProvider(provider: () => number): void {
    this.weatherProvider = provider;
  }
  setLocationKeyProvider(provider: (agent: string) => string | undefined): void {
    this.locationKeyProvider = provider;
  }
  setHabitProvider(provider: (agent: string, locationKey?: string) => number): void {
    this.habitProvider = provider;
  }
  setIntentionProvider(provider: (agent: string) => number): void {
    this.intentionProvider = provider;
  }
  setCrowdingProvider(provider: (agent: string) => number): void {
    this.crowdingProvider = provider;
  }
  findGoal(id: string): GoalDefinition | undefined {
    return this.goals.find((g) => g.id === id);
  }

  advanceNeeds(delta: SimDuration): void {
    for (const mind of this.residents.allMinds()) mind.needs.advance(delta);
  }

  suppressGoal(agent: string, goal: string, untilMinutes: number): void {
    let map = this.suppressed.get(agent);
    if (!map) {
      map = new Map<string, number>();
      this.suppressed.set(agent, map);
    }
    const current = map.get(goal);
    if (current === undefined || untilMinutes > current) map.set(goal, untilMinutes);
  }

  suppressionSnapshot(): Array<{ agent: string; goal: string; untilMinutes: number }> {
    const now = this.timeMinutes();
    const out: Array<{ agent: string; goal: string; untilMinutes: number }> = [];
    for (const [agent, goals] of this.suppressed)
      for (const [goal, until] of goals)
        if (until > now) out.push({ agent, goal, untilMinutes: until });
    return out;
  }

  private isSuppressed(agent: string, goal: string, nowMinutes: number): boolean {
    const until = this.suppressed.get(agent)?.get(goal);
    return until !== undefined && until > nowMinutes;
  }

  private eligibleGoals(agent: string, nowMinutes: number): readonly GoalDefinition[] {
    const filtered = this.goals.filter((g) => !this.isSuppressed(agent, g.id, nowMinutes));
    return filtered.length > 0 ? filtered : this.goals; // never strand a resident
  }

  evaluate(agent: string): { winner: GoalScoreEntry | null; ranked: readonly GoalScoreEntry[] } {
    const mind = this.residents.mind(agent);
    const ctx = this.buildContext(mind);
    return selectGoals(ctx, this.eligibleGoals(mind.agent, ctx.timeMinutes));
  }

  decide(agent: string): GoalDecision {
    const mind = this.residents.mind(agent);
    const now = this.timeMinutes();

    // Expired commitment releases BEFORE evaluation — otherwise the selector
    // treats it as "current" and waives switch cost + cooldown forever.
    if (mind.hasCommitment) mind.commitmentHolds();

    // An interrupting need the commitment does NOT relieve breaks commitment.
    const interrupting = mind.needs.findInterrupting();
    if (interrupting && mind.hasCommitment && mind.committedGoal) {
      const relieves = mind.committedGoal.reliefNeeds.includes(interrupting.definition.kind);
      if (!relieves) mind.releaseCommitment();
    }

    const ctx = this.buildContext(mind);
    const result = selectGoals(ctx, this.eligibleGoals(mind.agent, now));
    if (!result.winner) throw new Error(`No goals available for '${agent}'.`);
    const winner = result.winner;

    // Hysteresis: keep commitment unless a critical override wins.
    if (!winner.criticalOverride && mind.hasCommitment && mind.commitmentHolds()) {
      const committedEntry = result.ranked.find((e) => e.goal === mind.currentGoalId);
      if (committedEntry) return new GoalDecision(result.ranked, committedEntry, true);
    }

    mind.releaseCommitment();
    const def = this.findGoal(winner.goal);
    if (!def) throw new Error(`Selected goal '${winner.goal}' has no definition.`);
    mind.committedGoal = def;
    mind.noteSelection(winner.goal, now);
    return new GoalDecision(result.ranked, winner, false);
  }

  restoreResidentState(
    agent: string,
    currentGoalId: string | null | undefined,
    lastSelectedMinutes: Readonly<Record<string, number>> | ReadonlyMap<string, number>,
    suppressions?: readonly SuppressionEntry[],
  ): void {
    const mind = this.residents.mind(agent);
    if (currentGoalId) {
      const def = this.findGoal(currentGoalId);
      if (def) mind.committedGoal = def;
    }
    const entries =
      lastSelectedMinutes instanceof Map
        ? [...lastSelectedMinutes.entries()]
        : Object.entries(lastSelectedMinutes ?? {});
    for (const [goal, min] of entries) mind.noteSelection(goal, min);
    if (suppressions)
      for (const s of suppressions)
        if (s.agent === agent) this.suppressGoal(s.agent, s.goal, s.untilMinutes);
  }

  private buildContext(mind: AgentMind): GoalContext {
    const locationKey = this.locationKeyProvider?.(mind.agent);
    const habitRaw = this.habitProvider?.(mind.agent, locationKey) ?? 0;
    return {
      timeMinutes: this.timeMinutes(),
      needs: mind.needs,
      personality: mind.personality,
      currentGoal: mind.currentGoalId,
      schedulePressure: Math.max(0, Math.min(1,
        this.schedulePressureProvider
          ? this.schedulePressureProvider(mind.agent, this.timeMinutes())
          : 0)),
      emotionValence: Math.max(-1, Math.min(1, mind.emotionValence)),
      lastSelectedAt: mind.lastSelectedSnapshot(),
      weather: (this.weatherProvider ? this.weatherProvider() : 0),
      preferences: mind.preferences,
      ...(locationKey !== undefined ? { currentLocationKey: locationKey } : {}),
      habitBonus: Math.max(0, Math.min(0.15, habitRaw)),
      crowding: Math.max(0, this.crowdingProvider ? this.crowdingProvider(mind.agent) : 0),
      intentionBias: Math.max(-0.1, Math.min(0.1,
        this.intentionProvider ? this.intentionProvider(mind.agent) : 0)),
    };
  }
}

