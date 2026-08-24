/** Planner-consumable action definition + execution metadata. */
import type { AgentId, LocationId } from "@echosim/core";
import type { FactCondition, FactEffect, PlannerWorldState } from "../goap/plannerState.js";
import type { NeedKind } from "../needs/needs.js";

export interface ActivityRelief {
  kind: NeedKind;
  amount: number; // positive relieves; negative drains
}

export interface PlanningAction {
  id: string;
  displayName: string;
  preconditions: readonly FactCondition[];
  effects: readonly FactEffect[];
  baseCost: number;
  dynamicCost?: (agent: AgentId) => number;
  durationMinutes: number;
  requiredLocation?: LocationId | undefined;
  isMovement: boolean;
  relief: readonly ActivityRelief[];
  interruptible: boolean;
}

export function defineAction(
  id: string,
  displayName: string,
  opts: {
    preconditions?: readonly FactCondition[];
    effects?: readonly FactEffect[];
    baseCost: number;
    durationMinutes?: number;
    requiredLocation?: string | undefined;
    relief?: readonly ActivityRelief[];
    dynamicCost?: (agent: AgentId) => number;
    interruptible?: boolean;
    isMovement?: boolean;
  },
): PlanningAction {
  if (!Number.isFinite(opts.baseCost) || opts.baseCost < 0)
    throw new Error("Action base cost must be finite and non-negative.");
  return {
    id,
    displayName,
    preconditions: opts.preconditions ?? [],
    effects: opts.effects ?? [],
    baseCost: opts.baseCost,
    dynamicCost: opts.dynamicCost,
    durationMinutes: opts.durationMinutes ?? 0,
    requiredLocation: opts.requiredLocation !== undefined ? (opts.requiredLocation as LocationId) : undefined,
    isMovement: opts.isMovement ?? false,
    relief: opts.relief ?? [],
    interruptible: opts.interruptible ?? true,
  };
}

export function isApplicableIn(action: PlanningAction, state: PlannerWorldState): boolean {
  return action.preconditions.every((c) =>
    c.atLeast ? state.get(c.key) >= c.value : state.get(c.key) <= c.value);
}

export function applyEffectsTo(action: PlanningAction, state: PlannerWorldState): void {
  for (const e of action.effects) state.apply(e);
}

export function costFor(action: PlanningAction, agent: AgentId): number {
  let cost = action.baseCost + (action.dynamicCost ? Math.max(0, action.dynamicCost(agent)) : 0);
  if (!Number.isFinite(cost)) throw new Error(`Action '${action.id}' produced non-finite cost.`);
  return cost < 0 ? 0 : cost;
}

