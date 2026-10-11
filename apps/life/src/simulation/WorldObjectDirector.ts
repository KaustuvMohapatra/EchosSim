/**
 * Low-priority resident leisure behavior for player-built objects.
 *
 * Unlike the Phase 03 opportunistic use, Phase 04 can cause a *new visit*.
 * The native PlanningDirector retains ownership of survival, shift/work and
 * all existing GOAP runs. A resident only takes an object excursion when
 * genuinely idle, and navigation/arrival is handled by the existing sim.
 *
 * All decisions use sim-time, sorted placements and stable identity hashes:
 * no Math.random, per-render-frame decisions or independent NPC brains.
 */
import { NeedKind, PersonalityTrait } from "@echosim/cognition";
import { computeJobPressure, NavigationPathStatus } from "@echosim/world";
import {
  activityForObject, objectActivityAvailable, performWorldObjectActivity,
} from "@echosim/simulation";
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

export interface LeisureSuggestion {
  objectId: string;
  lotId: string;
  kind: BuildPlacement["kind"];
  score: number;
}
interface PendingTrip { objectId: string; lotId: string; startedAt: number }

export class WorldObjectDirector {
  private lastEvaluatedMinute: number;
  private readonly unsubscribe: () => void;
  private readonly previousIdleHook: typeof this.adapter.director.externalIdleActivity;
  private readonly pending = new Map<string, PendingTrip>();
  private readonly lastOfferedSlot = new Map<string, number>();
  private readonly lastLeisureAt = new Map<string, number>();

  constructor(
    private readonly adapter: LifeModeAdapter,
    private readonly build: BuildController,
    private readonly controlledId: () => string,
  ) {
    this.lastEvaluatedMinute = adapter.town.clock.currentTime.totalMinutes;
    this.previousIdleHook = adapter.director.externalIdleActivity;
    adapter.director.externalIdleActivity = (id, critical) =>
      this.beforeIdleGoal(id, critical) ||
      (this.previousIdleHook?.(id, critical) ?? false);
    this.unsubscribe = adapter.subscribe(() => this.onSimulationChanged());
  }

  /** Explainable, side-effect-free leisure candidate used by AI and tests. */
  recommendAttraction(agentId: string): LeisureSuggestion | undefined {
    const town = this.adapter.town;
    const mind = town.residents.tryMind(agentId);
    const state = town.agentsById.get(agentId);
    if (!mind || !state?.hasLocation || !state.currentLocationId) return;
    const now = town.clock.currentTime.totalMinutes;
    const hour = ((now % 1440) + 1440) % 1440;
    // Nights, late shifts and urgent survival needs belong to the GOAP AI.
    if (hour < 480 || hour > 1260 ||
      mind.needs.get(NeedKind.Energy).current >= 66 ||
      mind.needs.get(NeedKind.Hunger).current >= 72 ||
      mind.needs.get(NeedKind.Safety).current >= 74 ||
      mind.needs.findInterrupting() !== null) return;
    const loc = state.currentLocationId;
    const openness = mind.personality.get(PersonalityTrait.Curiosity);
    const sociability = mind.personality.get(PersonalityTrait.Sociability);
    const ambition = mind.personality.get(PersonalityTrait.Ambition);
    const fun = mind.needs.get(NeedKind.Fun).current / 100;
    const social = mind.needs.get(NeedKind.Social).current / 100;
    const comfort = mind.needs.get(NeedKind.Comfort).current / 100;

    const candidates: LeisureSuggestion[] = [];
    for (const object of this.build.list()) {
      if (object.lotId === loc) continue; // Phase 03 handles already-present props
      const dest = town.locations.tryGet(object.lotId as never);
      if (!dest?.isOpen) continue;
      const travel = town.navigation.getTravelTime(loc, object.lotId);
      if (travel > 45) continue;
      if (mind.job && (
        computeJobPressure(mind.job, mind.routineOffsetMinutes, false, now) > 0 ||
        computeJobPressure(mind.job, mind.routineOffsetMinutes, false, now + travel + 45) > 0
      )) continue;
      // An existing use, even before restoring this director, penalizes
      // repeat trips. All cooldown truth is kept in core episodic memory.
      const past = town.memory.storeFor(agentId).all.filter((entry) =>
        entry.eventType === "world_object" && entry.subject === object.objectId).at(-1);
      const spec = activityForObject(object.kind);
      if (past && now - past.timestampMinutes < Math.max(240, spec.cooldownMinutes)) continue;
      const bias = affinityForObject(agentId, object.kind, openness, sociability, ambition);
      const relief = spec.needs.reduce((sum, need) => sum +
        (need.amount > 0 ? need.amount / 25 *
          (need.kind === NeedKind.Fun ? fun :
           need.kind === NeedKind.Social ? social :
           need.kind === NeedKind.Comfort ? comfort : 0.25) : 0), 0);
      const score = bias * 0.48 + Math.min(1, relief) * 0.38 +
        (spec.skill ? 0.09 : 0) - travel / 250;
      candidates.push({
        objectId: object.objectId, kind: object.kind,
        lotId: object.lotId, score: Math.round(score * 1000) / 1000,
      });
    }
    return candidates.sort((a, b) => b.score - a.score ||
      a.objectId.localeCompare(b.objectId))[0];
  }

  /**
   * Called only on an idle GOAP tick. Pending travel suppresses competing
   * idle plans until arrival. Critical needs interrupt and reclaim ownership.
   */
  private beforeIdleGoal(agentId: string, critical: boolean): boolean {
    const town = this.adapter.town;
    const pending = this.pending.get(agentId);
    if (critical) {
      if (pending) this.abandon(agentId);
      return false;
    }
    if (pending) {
      const stillThere = this.build.get(pending.objectId);
      const travelling = town.navigation.getState(agentId);
      if (!stillThere || stillThere.lotId !== pending.lotId ||
          travelling.status !== NavigationPathStatus.EnRoute ||
          town.clock.currentTime.totalMinutes - pending.startedAt > 90) {
        this.abandon(agentId);
        return false;
      }
      return true;
    }
    if (agentId === this.controlledId() ||
      town.navigation.getState(agentId).status === NavigationPathStatus.EnRoute) return false;

    const now = town.clock.currentTime.totalMinutes;
    const slot = Math.floor(now / 120);
    if (this.lastOfferedSlot.get(agentId) === slot) return false;
    this.lastOfferedSlot.set(agentId, slot);
    if (now - (this.lastLeisureAt.get(agentId) ?? -Infinity) < 240) return false;
    const suggestion = this.recommendAttraction(agentId);
    if (!suggestion || suggestion.score < 0.31) return false;
    // Cap trips: the player should see occasional visits, not NPCs
    // abandoning routines every idle tick.
    const chance = Math.min(75, Math.max(15, Math.round(22 + suggestion.score * 65)));
    const roll = stableNumber(agentId + ":" + slot + ":" + suggestion.objectId) % 100;
    if (roll >= chance) return false;
    this.pending.set(agentId, {
      objectId: suggestion.objectId, lotId: suggestion.lotId, startedAt: now,
    });
    try {
      town.navigation.beginMove(agentId, suggestion.lotId, (arrival) =>
        this.completeTrip(agentId, suggestion.objectId, arrival.success));
    } catch {
      this.pending.delete(agentId);
      return false;
    }
    town.events.publish("sim:world-object-trip-started", {
      agent: agentId, objectId: suggestion.objectId, kind: suggestion.kind,
      locationId: suggestion.lotId,
    });
    return true;
  }

  private completeTrip(agentId: string, objectId: string, success: boolean): void {
    const pending = this.pending.get(agentId);
    if (!pending || pending.objectId !== objectId) return;
    this.pending.delete(agentId);
    if (!success) return;
    const placement = this.build.get(objectId);
    if (!placement || placement.lotId !== pending.lotId) return;
    const result = performWorldObjectActivity(this.adapter.town, agentId,
      placement, activityForObject(placement.kind).id);
    if (result.ok) {
      this.lastLeisureAt.set(agentId, this.adapter.town.clock.currentTime.totalMinutes);
      this.adapter.touch();
    }
  }

  private abandon(agentId: string): void {
    this.pending.delete(agentId);
    this.adapter.town.navigation.cancel(agentId);
  }

  /** Existing Phase 03 on-site spontaneous use: preserve it for local objects. */
  private onSimulationChanged(): void {
    const now = this.adapter.town.clock.currentTime.totalMinutes;
    if (now < this.lastEvaluatedMinute) {
      this.lastEvaluatedMinute = now;
      return;
    }
    if (now - this.lastEvaluatedMinute < 60) return;
    this.lastEvaluatedMinute = now;
    const available = new Map<string, BuildPlacement[]>();
    for (const placement of this.build.list()) {
      const list = available.get(placement.lotId) ?? [];
      list.push(placement);
      available.set(placement.lotId, list);
    }
    for (const id of this.adapter.town.residents.orderedIds()) {
      if (id === this.controlledId() || this.pending.has(id) ||
          this.adapter.director.isBusy(id)) continue;
      const state = this.adapter.town.agentsById.get(id);
      if (!state?.hasLocation || !state.currentLocationId) continue;
      const options = available.get(state.currentLocationId);
      if (!options?.length) continue;
      const mind = this.adapter.town.residents.tryMind(id);
      if (!mind || mind.needs.findInterrupting()) continue;
      const open = mind.personality.get(PersonalityTrait.Curiosity);
      const social = mind.personality.get(PersonalityTrait.Sociability);
      const ambition = mind.personality.get(PersonalityTrait.Ambition);
      const chance = stableNumber(id + ":" + Math.floor(now / 60)) % 100;
      const eligible = options
        .filter((p) => objectActivityAvailable(this.adapter.town, id, p).ok)
        .map((p) => ({ p, score: affinityForObject(id, p.kind, open, social, ambition) }))
        .sort((a, b) => b.score - a.score || a.p.objectId.localeCompare(b.p.objectId));
      const best = eligible[0];
      if (!best || best.score < 0.26 || chance >= 10 + 34 * best.score) continue;
      performWorldObjectActivity(this.adapter.town, id, best.p,
        activityForObject(best.p.kind).id);
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.adapter.director.externalIdleActivity = this.previousIdleHook;
    for (const id of [...this.pending.keys()]) this.abandon(id);
  }
}
