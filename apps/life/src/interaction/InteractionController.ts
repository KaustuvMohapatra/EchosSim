/**
 * InteractionController: validates object affordances against simulation state.
 * It accepts a controlled-resident provider so household switching does not
 * silently route interactions back to the original player resident.
 */
import type { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import { performVenueActivity, performWorldObjectActivity, activityForObject } from "@echosim/simulation";
import type { BuildController } from "../build/BuildController.js";
import { PLACED_OBJECTS, SeatRegistry, anchorsInWorld } from "./catalog.js";
import { lotOf } from "../world/layout.js";

export interface UseResult {
  ok: boolean;
  feedback: string;
}

const SEAT_KINDS = new Set(["chair", "sofa", "bench"]);

export class InteractionController {
  readonly seats = new SeatRegistry();
  readonly anchors = anchorsInWorld((id) => {
    const lot = lotOf(id);
    return lot ? { x: lot.x, z: lot.z } : undefined;
  });

  private pendingSeat: { agentId: string; objectId: string } | null = null;
  private readonly unsubscribe: () => void;
  private build: BuildController | null = null;
  private pendingBuiltUse: { agentId: string; objectId: string } | null = null;
  private pendingActivity: { agentId: string; objectId: string; affordanceId: string } | null = null;

  constructor(
    private readonly adapter: LifeModeAdapter,
    private readonly controlledId: () => string = () => adapter.playerId,
  ) {
    this.unsubscribe = this.adapter.subscribe(() => this.onTick());
  }

  attachBuildController(build: BuildController): void { this.build = build; }

  builtAffordance(objectId: string): { id: string; label: string } | undefined {
    const placement = this.build?.get(objectId);
    if (!placement) return undefined;
    const activity = activityForObject(placement.kind);
    return { id: activity.id, label: activity.label };
  }

  /** Built items are resolved from live inventory every time, never stale catalog data. */
  useBuiltObject(objectId: string): UseResult {
    const placement = this.build?.get(objectId);
    if (!placement) return { ok: false, feedback: "This object has been removed." };
    this.pendingActivity = null;
    this.pendingSeat = null;
    const agentId = this.controlledId();
    if (this.adapter.playerLocationId(agentId) !== placement.lotId) {
      const ok = this.adapter.commandMoveTo(placement.lotId, agentId);
      if (!ok) return { ok: false, feedback: this.adapter.lastCommandFeedback };
      this.pendingBuiltUse = { agentId, objectId };
      return { ok: true, feedback: "Traveling to use " + placement.kind + "…" };
    }
    this.pendingBuiltUse = null;
    const result = performWorldObjectActivity(this.adapter.town, agentId,
      placement, activityForObject(placement.kind).id);
    this.adapter.lastCommandFeedback = result.feedback;
    if (result.ok) this.adapter.touch();
    return result;
  }

  affordancesOf(objectId: string) {
    return PLACED_OBJECTS.find((object) => object.objectId === objectId)?.affordances ?? [];
  }

  objectDef(objectId: string) {
    return PLACED_OBJECTS.find((object) => object.objectId === objectId);
  }

  use(objectId: string, affordanceId: string): UseResult {
    const def = this.objectDef(objectId);
    const affordance = def?.affordances.find((item) => item.id === affordanceId);
    if (!def || !affordance) return { ok: false, feedback: "Nothing happens." };
    const actor = this.controlledId();
    // An explicit new interaction supersedes unfinished arrival actions.
    this.pendingActivity = null;
    this.pendingBuiltUse = null;
    this.pendingSeat = null;

    if (affordance.command.type === "activity") {
      if (this.adapter.playerLocationId(actor) !== def.lotId) {
        const moved = this.adapter.commandMoveTo(def.lotId, actor);
        if (!moved) return { ok: false, feedback: this.adapter.lastCommandFeedback };
        this.pendingActivity = { agentId: actor, objectId, affordanceId };
        return { ok: true, feedback: `Heading to ${def.lotId.replace("loc_", "")}…` };
      }
      return performVenueActivity(
        this.adapter.town, actor, affordance.command.activity as never);
    }

    if (affordance.command.type !== "move")
      return { ok: false, feedback: `${affordance.label}: not available yet.` };

    if (SEAT_KINDS.has(def.kind)) {
      this.standUp(actor);
      this.pendingSeat = { agentId: actor, objectId: def.objectId };
    }

    const ok = this.adapter.commandMoveTo(affordance.command.locationId, actor);
    if (!ok && this.pendingSeat?.objectId === def.objectId) this.pendingSeat = null;
    return { ok, feedback: this.adapter.lastCommandFeedback };
  }

  standUp(agentId: string): void {
    this.seats.release(agentId);
    this.adapter.seatedAt.delete(agentId);
  }

  private onTick(): void {
    const pendingActivity = this.pendingActivity;
    if (pendingActivity) {
      const def = this.objectDef(pendingActivity.objectId);
      const affordance = def?.affordances.find((item) => item.id === pendingActivity.affordanceId);
      if (!def || affordance?.command.type !== "activity") this.pendingActivity = null;
      else if (this.adapter.playerLocationId(pendingActivity.agentId) === def.lotId) {
        // Clear before invoking the simulation: touch() may synchronously notify listeners.
        this.pendingActivity = null;
        const result = performVenueActivity(this.adapter.town, pendingActivity.agentId,
          affordance.command.activity as never);
        this.adapter.lastCommandFeedback = result.feedback;
        if (result.ok) this.adapter.touch();
      }
    }
    const built = this.pendingBuiltUse;
    if (built && this.build) {
      const placement = this.build.get(built.objectId);
      if (!placement) this.pendingBuiltUse = null;
      else if (this.adapter.playerLocationId(built.agentId) === placement.lotId) {
        // Clear first: touch() below fires another subscription synchronously.
        this.pendingBuiltUse = null;
        const result = performWorldObjectActivity(this.adapter.town, built.agentId,
          placement, activityForObject(placement.kind).id);
        this.adapter.lastCommandFeedback = result.feedback;
        if (result.ok) this.adapter.touch();
      }
    }
    const pending = this.pendingSeat;
    if (!pending) return;
    const def = this.objectDef(pending.objectId);
    if (!def) { this.pendingSeat = null; return; }
    if (this.adapter.playerLocationId(pending.agentId) !== def.lotId) return;

    const anchor = this.anchors.get(pending.objectId);
    this.pendingSeat = null;
    if (!anchor) return;

    if (this.seats.claim(pending.objectId, pending.agentId)) {
      this.adapter.seatedAt.set(pending.agentId, { x: anchor.x, z: anchor.z, rotY: anchor.rotationY });
      this.adapter.lastCommandFeedback = "Seated.";
    } else {
      this.adapter.lastCommandFeedback = "Seat taken.";
    }
  }

  dispose(): void {
    this.pendingActivity = null;
    this.pendingBuiltUse = null;
    this.pendingSeat = null;
    this.unsubscribe();
  }
}
