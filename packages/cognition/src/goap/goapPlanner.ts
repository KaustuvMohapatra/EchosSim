/**
 * Uniform-cost best-first GOAP planner (Dijkstra): goal tested on POP so the
 * cheapest complete path always wins; closed-set cycle avoidance; expansion and
 * depth caps; deterministic tie-breaks by insertion sequence.
 */
import type { AgentId } from "@echosim/core";
import type { FactCondition, PlannerWorldState } from "./plannerState.js";
import { costFor, isApplicableIn, type PlanningAction } from "../actions/planningAction.js";

export enum PlanFailureReason {
  None = 0,
  NoViablePlan = 1,
  MaxExpansionsReached = 2,
  MaxDepthReached = 3,
}

export interface GoapPlan {
  steps: readonly PlanningAction[];
  totalCost: number;
}

export interface PlannerMetrics {
  nodesExpanded: number;
  deepestDepth: number;
  planLength: number;
  failureReason: PlanFailureReason;
  success: boolean;
}

export interface PlanResult {
  success: boolean;
  plan?: GoapPlan | undefined;
  metrics: PlannerMetrics;
}

interface SearchNode {
  state: PlannerWorldState;
  g: number;
  sequence: number;
  depth: number;
  parent: SearchNode | null;
  via: PlanningAction | null;
}

function failed(reason: PlanFailureReason, metrics: PlannerMetrics): PlanResult {
  metrics.success = false;
  metrics.failureReason = reason;
  return { success: false, metrics };
}

export class GoapPlanner {
  maxExpansions = 4000;
  maxDepth = 12;

  plan(
    start: PlannerWorldState,
    goalConditions: readonly FactCondition[],
    actions: readonly PlanningAction[],
    costAgent?: AgentId,
  ): PlanResult {
    const metrics: PlannerMetrics = {
      nodesExpanded: 0, deepestDepth: 0, planLength: 0,
      failureReason: PlanFailureReason.None, success: false,
    };
    const agent: AgentId = costAgent ?? ("agent" as AgentId);

    if (start.satisfiesAll(goalConditions)) {
      metrics.success = true;
      metrics.planLength = 0;
      return { success: true, plan: { steps: [], totalCost: 0 }, metrics };
    }

    const stepCosts = actions.map((a) => costFor(a, agent));

    const open: SearchNode[] = [];
    const closed = new Set<string>();
    let sequence = 0;

    open.push({ state: start, g: 0, sequence: sequence++, depth: 0, parent: null, via: null });

    while (open.length > 0) {
      if (metrics.nodesExpanded >= this.maxExpansions)
        return failed(PlanFailureReason.MaxExpansionsReached, metrics);

      // Deterministic extract-min: lowest g, then earliest insertion sequence.
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) {
        const c = open[i]!, b = open[bestIndex]!;
        if (c.g < b.g || (c.g === b.g && c.sequence < b.sequence)) bestIndex = i;
      }
      const node = open.splice(bestIndex, 1)[0]!;

      const hash = node.state.computeHash();
      if (closed.has(hash)) continue;
      closed.add(hash);

      metrics.nodesExpanded++;
      if (node.depth > metrics.deepestDepth) metrics.deepestDepth = node.depth;

      // Goal tested on POP so the cheapest complete path always wins
      // (regression: tests/regression/goal-selection).
      if (node.via !== null && node.state.satisfiesAll(goalConditions)) {
        const steps: PlanningAction[] = [];
        let cursor: SearchNode | null = node;
        while (cursor && cursor.via) {
          steps.push(cursor.via);
          cursor = cursor.parent;
        }
        steps.reverse();
        metrics.success = true;
        metrics.planLength = steps.length;
        return { success: true, plan: { steps, totalCost: node.g }, metrics };
      }

      if (node.depth >= this.maxDepth) continue;

      for (let a = 0; a < actions.length; a++) {
        const action = actions[a]!;
        if (!isApplicableIn(action, node.state)) continue;
        const next = node.state.clone();
        for (const e of action.effects) next.apply(e);
        const nextHash = next.computeHash();
        if (closed.has(nextHash)) continue;
        open.push({
          state: next,
          g: node.g + stepCosts[a]!,
          sequence: sequence++,
          depth: node.depth + 1,
          parent: node,
          via: action,
        });
      }
    }

    return failed(PlanFailureReason.NoViablePlan, metrics);
  }
}
