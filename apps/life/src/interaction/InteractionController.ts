/**
 * InteractionController (Sprint 38): turns object affordances into validated
 * simulation commands plus presentation-only seat poses. Engine-free.
 */
import type { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
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

  private pendingSeatForPlayer: string | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly adapter: LifeModeAdapter) {
    this.unsubscribe = this.adapter.subscribe(() => this.onTick());
  }

  affordancesOf(objectId: string) {
    return PLACED_OBJECTS.find((o) => o.objectId === objectId)?.affordances ?? [];
  }

  objectDef(objectId: string) {
    return PLACED_OBJECTS.find((o) => o.objectId === objectId);
  }

  /**
   * Player uses an object: routes its command through the simulation and,
   * for seating, claims the visual seat once arrival is observed.
   */
  use(objectId: string, affordanceId: string): UseResult {
    const def = this.objectDef(objectId);
    const aff = def?.affordances.find((a) => a.id === affordanceId);
    if (!def || !aff) return { ok: false, feedback: "Nothing happens." };
    if (aff.command.type !== "move")
      return { ok: false, feedback: `${aff.label}: not available yet.` };

    if (SEAT_KINDS.has(def.kind)) {
      this.standUp(this.adapter.playerId);
      this.pendingSeatForPlayer = def.objectId;
    }

    const ok = this.adapter.commandMoveTo(aff.command.locationId);
    if (!ok && this.pendingSeatForPlayer === def.objectId)
      this.pendingSeatForPlayer = null;
    return { ok, feedback: this.adapter.lastCommandFeedback };
  }

  standUp(agentId: string): void {
    this.seats.release(agentId);
    if (agentId === this.adapter.playerId) this.adapter.playerSeatedAt = undefined;
  }

  private onTick(): void {
    const seatId = this.pendingSeatForPlayer;
    if (!seatId) return;
    const def = this.objectDef(seatId)!;
    if (this.adapter.playerLocationId() !== def.lotId) return;

    const anchor = this.anchors.get(seatId);
    this.pendingSeatForPlayer = null; // resolve exactly once
    if (!anchor) return;

    if (this.seats.claim(seatId, this.adapter.playerId)) {
      this.adapter.playerSeatedAt = { x: anchor.x, z: anchor.z, rotY: anchor.rotationY };
      this.adapter.lastCommandFeedback = "Seated.";
    } else {
      this.adapter.lastCommandFeedback = "Seat taken.";
    }
  }

  dispose(): void { this.unsubscribe(); }
}
