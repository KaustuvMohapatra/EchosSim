/**
 * Interactive object catalog (Sprint 38): metre-scale fixtures anchored
 * inside authored lots. Engine-free data + geometry helpers; Babylon only
 * renders these. Affordances here are presentation-facing labels whose
 * commands route through the adapter's simulation surface.
 */

export type ObjectKind =
  | "chair" | "sofa" | "table" | "bookshelf" | "bench"
  | "counter" | "bed" | "desk";

export interface Affordance {
  id: string;
  label: string;
  /** Simulation command this maps to today (S39 expands to queued goals). */
  command:
    | { type: "move"; locationId: string }
    | { type: "activity"; activity: string }
    | { type: "none" };
}

export interface PlacedObject {
  objectId: string;
  kind: ObjectKind;
  lotId: string;
  /** Offset within the lot footprint (metres). */
  dx: number;
  dz: number;
  rotationY: number;
  /** Where a character stands/parks while using it (relative). */
  anchorDx: number;
  anchorDz: number;
  affordances: readonly Affordance[];
}

const sit = (lotId: string): Affordance => ({
  id: "sit", label: "Sit",
  command: { type: "move", locationId: lotId },
});
const read = (lotId: string): Affordance => ({
  id: "read", label: "Read",
  command: { type: "move", locationId: lotId },
});

function chair(i: number, lotId: string, x: number, z: number, rot: number): PlacedObject {
  return {
    objectId: `${lotId}_chair_${i}`,
    kind: "chair", lotId, dx: x, dz: z, rotationY: rot,
    anchorDx: x, anchorDz: z,
    affordances: [sit(lotId)],
  };
}

/** Deterministic starter furnishing for social lots (spec §20/§56 spirit). */
export const PLACED_OBJECTS: readonly PlacedObject[] = [
  // Cafe seating (two tables of two).
  chair(0, "cafe", -3.5, -2.5, Math.PI / 2),
  chair(1, "cafe", -3.5, 0.5, Math.PI / 2),
  chair(2, "cafe", 2.5, -2.5, -Math.PI / 2),
  chair(3, "cafe", 2.5, 0.5, -Math.PI / 2),
  // Cafe counter (service landmark; ordering is an activity).
  {
    objectId: "cafe_counter", kind: "counter", lotId: "cafe",
    dx: 0, dz: 4.2, rotationY: 0, anchorDx: 0, anchorDz: 3.0,
    affordances: [{ id: "order", label: "Order coffee",
      command: { type: "activity", activity: "order_coffee" } }],
  },

  // Library reading chairs + shelves.
  chair(0, "library", -4, -2, Math.PI / 3),
  chair(1, "library", -4, 1, Math.PI / 3),
  {
    objectId: "library_shelf_a", kind: "bookshelf", lotId: "library",
    dx: 5, dz: -3, rotationY: -Math.PI / 2, anchorDx: 3.8, anchorDz: -3,
    affordances: [{ id: "read", label: "Read",
      command: { type: "activity", activity: "read_book" } }],
  },
  {
    objectId: "library_shelf_b", kind: "bookshelf", lotId: "library",
    dx: 5, dz: 1.5, rotationY: -Math.PI / 2, anchorDx: 3.8, anchorDz: 1.5,
    affordances: [{ id: "read", label: "Read",
      command: { type: "activity", activity: "read_book" } }],
  },

  // Park benches facing the pond side + a jogging affordance.
  chair(0, "park", -9, 4, 0),
  chair(1, "park", -4, 6.5, 0),
  chair(2, "park", 1, 4, Math.PI),
  {
    objectId: "park_trail", kind: "bench", lotId: "park",
    dx: 8, dz: -3, rotationY: Math.PI / 2, anchorDx: 8, anchorDz: -1.5,
    affordances: [{ id: "jog", label: "Jog",
      command: { type: "activity", activity: "jog" } }],
  },

  // Restaurant pairs.
  chair(0, "restaurant", -4, -2, Math.PI / 2),
  chair(1, "restaurant", 3, -2, -Math.PI / 2),

  // Studio workstation (sketching is an activity).
  {
    objectId: "studio_desk_mira", kind: "desk", lotId: "studio",
    dx: -3, dz: -2, rotationY: Math.PI / 2, anchorDx: -3, anchorDz: -0.8,
    affordances: [{ id: "sketch", label: "Sketch",
      command: { type: "activity", activity: "sketch" } }],
  },
];

/** World-space transform of an object's use anchor (for walk targets/poses). */
export interface AnchorWorld {
  objectId: string;
  x: number;
  z: number;
  rotationY: number;
}

export function anchorsInWorld(
  lotById: (id: string) => { x: number; z: number } | undefined,
): Map<string, AnchorWorld> {
  const out = new Map<string, AnchorWorld>();
  for (const o of PLACED_OBJECTS) {
    const lot = lotById(o.lotId);
    if (!lot) continue;
    out.set(o.objectId, {
      objectId: o.objectId,
      x: lot.x + o.anchorDx,
      z: lot.z + o.anchorDz,
      rotationY: o.rotationY,
    });
  }
  return out;
}

// ---------------- Seat claiming (visual state, not sim truth) ----------------

export class SeatRegistry {
  private readonly claimed = new Map<string, string>(); // seatId -> agentId
  claim(seatId: string, agentId: string): boolean {
    const holder = this.claimed.get(seatId);
    if (holder !== undefined && holder !== agentId) return false;
    this.claimed.set(seatId, agentId);
    return true;
  }
  release(agentId: string): void {
    for (const [seat, who] of [...this.claimed])
      if (who === agentId) this.claimed.delete(seat);
  }
  holderOf(seatId: string): string | undefined {
    return this.claimed.get(seatId);
  }
  get size(): number { return this.claimed.size; }
}
