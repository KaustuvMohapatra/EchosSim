/**
 * Goal model: explainable additive scoring terms, switch inertia, re-selection
 * cooldown, critical-need override. Deterministic: score desc, then goal id ordinal.
 */
import type { NeedKind, NeedSet, NeedState } from "../needs/needs.js";
import type { PersonalityProfile, PersonalityTrait } from "../personality/personality.js";
import type { UtilityCurve } from "../utility/curves.js";
import type { FactCondition } from "../goap/plannerState.js";

export enum WeatherState {
  Clear = 0,
  Cloudy = 1,
  Rain = 2,
  HeavyRain = 3,
}

export interface PreferenceProfileLike {
  get(key: string): number;
}
export const EMPTY_PREFERENCES: PreferenceProfileLike = { get: () => 0 };
export interface GoalContext {
  timeMinutes: number;
  needs: NeedSet;
  personality: PersonalityProfile;
  currentGoal?: string | undefined;
  schedulePressure: number; // 0..1
  emotionValence: number;   // -1..1
  lastSelectedAt?: ReadonlyMap<string, number>;
  weather: WeatherState;
  preferences: PreferenceProfileLike;
  /** Location key of the resident's current location ("loc_cafe"), if placed. */
  currentLocationKey?: string;
  /** Bounded habit bonus (≤0.15) supplied by the host for the current spot. */
  habitBonus?: number;
  /** Bounded long-term-intention bias (−0.1..+0.1), host-derived. */
  intentionBias?: number;
  /** Occupancy ratio (0..1+) of the resident's current venue, if any. */
  crowding?: number;
}

export interface ScoreLine { label: string; value: number }

export class GoalScoreEntry {
  constructor(
    readonly goal: string,
    readonly displayName: string,
    readonly final: number,
    readonly breakdown: readonly ScoreLine[],
    readonly criticalOverride: boolean,
  ) {}
}

export class GoalSelectionResult {
  constructor(
    readonly winner: GoalScoreEntry | null,
    readonly ranked: readonly GoalScoreEntry[],
  ) {}
}

export interface NeedTerm { kind: NeedKind; curve: UtilityCurve; weight: number }
export interface TraitTerm { trait: PersonalityTrait; min: number; max: number }

export type ScoreTerm =
  | { kind: "fixed"; label: string; value: number }
  | { kind: "need"; label: string; term: NeedTerm }
  | { kind: "trait"; label: string; term: TraitTerm }
  | { kind: "custom"; label: string; evaluate: (ctx: GoalContext) => number };

export const fixedTerm = (label: string, value: number): ScoreTerm => ({ kind: "fixed", label, value });
export const needTerm = (label: string, t: NeedTerm): ScoreTerm => ({ kind: "need", label, term: t });
export const traitTerm = (label: string, t: TraitTerm): ScoreTerm => ({ kind: "trait", label, term: t });
export const customTerm = (label: string, fn: (ctx: GoalContext) => number): ScoreTerm => ({ kind: "custom", label, evaluate: fn });

export interface GoalDefinition {
  id: string;
  displayName: string;
  baseScore: number;
  terms: readonly ScoreTerm[];
  reliefNeeds: readonly NeedKind[];
  switchPenalty: number;
  criticalEligible: boolean;
  desiredFacts?: readonly FactCondition[] | undefined;
}

export function defineGoal(
  id: string, displayName: string, baseScore: number, terms: readonly ScoreTerm[],
  opts: {
    reliefNeeds?: readonly NeedKind[];
    switchPenalty?: number;
    criticalEligible?: boolean;
    desiredFacts?: readonly FactCondition[];
  } = {},
): GoalDefinition {
  if (!Number.isFinite(baseScore)) throw new Error("baseScore must be finite");
  return {
    id, displayName, baseScore, terms,
    reliefNeeds: opts.reliefNeeds ?? [],
    switchPenalty: opts.switchPenalty ?? 0.08,
    criticalEligible: opts.criticalEligible ?? false,
    desiredFacts: opts.desiredFacts,
  };
}

export interface GoalSelectionOptions {
  criticalBonus: number;
  reSelectionCooldownMinutes: number;
  reSelectionPenalty: number;
}

export const DEFAULT_SELECTION_OPTIONS: GoalSelectionOptions = {
  criticalBonus: 0.5,
  reSelectionCooldownMinutes: 45,
  reSelectionPenalty: 0.12,
};

function containsKind(list: readonly NeedKind[], kind: NeedKind): boolean {
  return list.includes(kind);
}

export function selectGoals(
  ctx: GoalContext,
  candidates: readonly GoalDefinition[],
  options: GoalSelectionOptions = DEFAULT_SELECTION_OPTIONS,
): GoalSelectionResult {
  const interrupting: NeedState | null = ctx.needs.findInterrupting();
  const ranked: GoalScoreEntry[] = [];

  for (const goal of candidates)
    ranked.push(scoreGoal(ctx, goal, interrupting, options));

  ranked.sort((x, y) => {
    const byScore = y.final - x.final;
    return byScore !== 0 ? byScore : x.goal < y.goal ? -1 : x.goal > y.goal ? 1 : 0;
  });

  return new GoalSelectionResult(candidates.length > 0 ? ranked[0]! : null, ranked);
}

function scoreGoal(
  ctx: GoalContext, goal: GoalDefinition,
  interrupting: NeedState | null, options: GoalSelectionOptions,
): GoalScoreEntry {
  const lines: ScoreLine[] = [];
  const isCurrent = ctx.currentGoal !== undefined && ctx.currentGoal === goal.id;
  let criticalOverride = false;
  let total = goal.baseScore;

  lines.push({ label: "Base", value: goal.baseScore });

  for (const term of goal.terms) {
    let value = 0;
    switch (term.kind) {
      case "fixed": value = term.value; break;
      case "need":
        value = term.term.curve.evaluate(ctx.needs.get(term.term.kind).normalized) * term.term.weight;
        break;
      case "trait": {
        const v = ctx.personality.get(term.term.trait);
        value = term.term.min + (term.term.max - term.term.min) * v;
        break;
      }
      case "custom":
        value = term.evaluate(ctx);
        if (!Number.isFinite(value))
          throw new Error(`Custom term '${term.label}' on '${goal.id}' produced a non-finite value.`);
        break;
    }
    total += value;
    lines.push({ label: term.label, value });
  }

  if (interrupting !== null && goal.criticalEligible &&
      containsKind(goal.reliefNeeds, interrupting.definition.kind)) {
    total += options.criticalBonus;
    lines.push({ label: "CriticalOverride", value: options.criticalBonus });
    criticalOverride = true;
  } else {
    if (!isCurrent && ctx.currentGoal !== undefined && goal.switchPenalty > 0) {
      total -= goal.switchPenalty;
      lines.push({ label: "SwitchCost", value: -goal.switchPenalty });
    }
    if (!isCurrent && ctx.lastSelectedAt) {
      const last = ctx.lastSelectedAt.get(goal.id);
      if (last !== undefined && ctx.timeMinutes - last < options.reSelectionCooldownMinutes) {
        total -= options.reSelectionPenalty;
        lines.push({ label: "RecentCooldown", value: -options.reSelectionPenalty });
      }
    }
  }

  if (!Number.isFinite(total)) throw new Error(`Goal '${goal.id}' scored non-finite.`);
  return new GoalScoreEntry(goal.id, goal.displayName, total, lines, criticalOverride);
}
