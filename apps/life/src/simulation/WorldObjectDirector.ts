/**
 * Deterministic ambient activities around actual player-installed objects.
 *
 * This is an opportunistic idle/break behavior, not a competing navigation
 * planner. Residents pursue goals through the original GOAP/utility AI and
 * can interact with built equipment when their regular routines bring them
 * to the same venue. Personality biases the choice; effects go through the
 * real simulation and thus survive world saves.
 */
import { PersonalityTrait } from "@echosim/cognition";
import { activityForObject, objectActivityAvailable, performWorldObjectActivity } from "@echosim/simulation";
import type { BuildController, BuildPlacement } from "../build/BuildController.js";
import type { LifeModeAdapter } from "./LifeModeAdapter.js";

function stableNumber(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function affinityForObject(
  agentId: string, kind: BuildPlacement["kind"],
  openness: number, sociability: number, ambition: number,
): number {
  const traits = kind === "arcade" || kind === "counter"
    ? sociability
    : kind === "easel" || kind === "bookshelf" || kind === "noticeboard"
      ? openness
      : kind === "garden" || kind === "desk"
        ? ambition
        : (sociability + openness + ambition) / 3;
  const identityBias = stableNumber(agentId + ":" + kind) % 12 / 100;
  return traits * 0.73 + identityBias;
}

export class WorldObjectDirector {
  private lastEvaluatedMinute: number;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly adapter: LifeModeAdapter,
    private readonly build: BuildController,
    private readonly controlledId: () => string,
  ) {
    this.lastEvaluatedMinute = adapter.town.clock.currentTime.totalMinutes;
    this.unsubscribe = adapter.subscribe(() => this.onSimulationChanged());
  }

  private onSimulationChanged(): void {
    const now = this.adapter.town.clock.currentTime.totalMinutes;
    if (now < this.lastEvaluatedMinute) {
      this.lastEvaluatedMinute = now;
      return;
    }
    if (now - this.lastEvaluatedMinute < 60) return;
    this.lastEvaluatedMinute = now;
    const placed = this.build.list();
    if (placed.length === 0) return;
    const available = new Map<string, BuildPlacement[]>();
    for (const placement of placed) {
      const list = available.get(placement.lotId) ?? [];
      list.push(placement);
      available.set(placement.lotId, list);
    }

    for (const id of this.adapter.town.residents.orderedIds()) {
      if (id === this.controlledId()) continue;
      const state = this.adapter.town.agentsById.get(id);
      if (!state?.hasLocation || !state.currentLocationId) continue;
      const options = available.get(state.currentLocationId);
      if (!options?.length) continue;
      const mind = this.adapter.town.residents.tryMind(id);
      if (!mind) continue;
      const openness = mind.personality.get(PersonalityTrait.Curiosity);
      const sociability = mind.personality.get(PersonalityTrait.Sociability);
      const ambition = mind.personality.get(PersonalityTrait.Ambition);
      // An occasional optional activity, not a forced hourly task; everyone
      // has different thresholds and a seeded deterministic opportunity roll.
      const chance = stableNumber(id + ":" + Math.floor(now / 60)) % 100;
      const eligible = options
        .filter((placement) => objectActivityAvailable(this.adapter.town, id, placement).ok)
        .map((placement) => ({
          placement, affinity: affinityForObject(id, placement.kind, openness, sociability, ambition),
        }))
        .sort((a, b) => b.affinity - a.affinity ||
          a.placement.objectId.localeCompare(b.placement.objectId));
      const best = eligible[0];
      if (!best || best.affinity < 0.26 || chance >= 10 + 34 * best.affinity) continue;
      performWorldObjectActivity(this.adapter.town, id, best.placement,
        activityForObject(best.placement.kind).id);
    }
  }

  dispose(): void { this.unsubscribe(); }
}
