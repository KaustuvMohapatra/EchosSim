/** Per-resident cognition state: personality, needs, goal commitment, mood. */
import type { NeedSet } from "../needs/needs.js";
import type { PersonalityProfile } from "../personality/personality.js";
import type { GoalDefinition, PreferenceProfileLike } from "../goals/goalModel.js";
import { EPHEMERAL_FACTS } from "./facts.js";

export class AgentMind {
  committedGoal: GoalDefinition | null = null;
  emotionValence = 0;
  money = 0;
  routineOffsetMinutes = 0;
  readonly inventory = new Map<string, number>();
  readonly plannerMemory = new Map<string, number>();
  private readonly lastSelected = new Map<string, number>();
  preferences: PreferenceProfileLike = { get: () => 0 };

  constructor(
    readonly agent: string,
    readonly displayName: string,
    readonly homeLocationId: string | undefined,
    readonly personality: PersonalityProfile,
    readonly needs: NeedSet,
  ) {}

  get hasCommitment(): boolean { return this.committedGoal !== null; }
  get currentGoalId(): string | undefined { return this.committedGoal?.id ?? undefined; }

  noteSelection(goal: string, atMinutes: number): void {
    this.lastSelected.set(goal, atMinutes);
  }
  lastSelectedSnapshot(): ReadonlyMap<string, number> {
    return this.lastSelected;
  }
  releaseCommitment(): void {
    this.committedGoal = null;
  }
  setEmotion(valence: number): void {
    if (Number.isNaN(valence)) throw new Error("valence must be a number");
    this.emotionValence = Math.max(-1, Math.min(1, valence));
  }
  setPreferences(preferences: PreferenceProfileLike | undefined): void {
    this.preferences = preferences ?? { get: () => 0 };
  }

  /**
   * Commitment hysteresis: kept while any relief need is still above its
   * satisfaction threshold; releases (returns false) once fully satisfied.
   */
  commitmentHolds(): boolean {
    if (!this.committedGoal) return false;
    for (const kind of this.committedGoal.reliefNeeds) {
      if (!this.needs.get(kind).isSatisfied) return true;
    }
    this.committedGoal = null;
    return false;
  }
}

export interface ResidentSpec {
  id: string;
  displayName: string;
  homeLocationId?: string;
  startLocationId?: string;
  personality: import("../personality/personality.js").PersonalityProfile;
  initialNeeds?: Partial<Record<number, number>>;
  preferences?: PreferenceProfileLike;
}

/** Persistent non-location, non-ephemeral fact write-back used by execution. */
export function applyEffectToMemory(
  memory: Map<string, number>,
  effect: { mode: "assign"; key: string; value: number } | { mode: "add"; key: string; delta: number },
): void {
  if (effect.key.startsWith("at_")) return;
  if (EPHEMERAL_FACTS.has(effect.key)) return;
  const current = memory.get(effect.key) ?? 0;
  memory.set(effect.key, effect.mode === "assign" ? effect.value : current + effect.delta);
}

/** Copies persistent facts into a fresh planner view; ephemerals start at 0. */
export function copyPlannerMemoryInto(state: { set(key: string, value: number): void }, memory: ReadonlyMap<string, number>): void {
  for (const [k, v] of memory) {
    if (k.startsWith("at_")) continue;
    if (EPHEMERAL_FACTS.has(k)) continue;
    state.set(k, v);
  }
  for (const key of EPHEMERAL_FACTS) state.set(key, 0);
}
