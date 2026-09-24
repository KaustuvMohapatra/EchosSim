/**
 * InteractionController: validates object affordances against simulation state.
 * It accepts a controlled-resident provider so household switching does not
 * silently route interactions back to the original player resident.
 */
import type { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import { performVenueActivity } from "@echosim/simulation";
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

  constructor(
    private readonly adapter: LifeModeAdapter,
    private readonly controlledId: () => string = () => adapter.playerId,
  ) {
    this.unsubscribe = this.adapter.subscribe(() => this.onTick());
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

    if (affordance.command.type === "activity") {
      if (this.adapter.playerLocationId(actor) !== def.lotId) {
        const moved = this.adapter.commandMoveTo(def.lotId, actor);
        if (!moved) return { ok: false, feedback: this.adapter.lastCommandFeedback };
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

  dispose(): void { this.unsubscribe(); }
}
