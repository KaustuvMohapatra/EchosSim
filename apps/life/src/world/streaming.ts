/**
 * Lot streaming (Sprint 58): decides which lots need full interior/detail
 * meshes based on the viewer position. Simulation truth is unaffected —
 * distant residents keep their semantic locations.
 */
import type { LotPlacement } from "./layout.js";

export interface ActiveLots {
  active: Set<string>;
  detail: Set<string>;
}

export class LotActivationManager {
  /** Lots within this radius are fully instantiated. */
  detailRadius = 55;
  /** Lots within this radius keep simplified meshes; beyond → unloaded. */
  keepRadius = 90;

  private lastValidPosition?: { x: number; z: number };

  constructor(private readonly lots: readonly LotPlacement[]) {}

  update(playerX: number, playerZ: number): ActiveLots {
    // Camera positions can briefly be invalid during mode switches or scene
    // initialization. Reuse the last valid point instead of unloading the
    // neighbourhood or arbitrarily displaying the first authored lot.
    if (Number.isFinite(playerX) && Number.isFinite(playerZ)) {
      this.lastValidPosition = { x: playerX, z: playerZ };
    }
    const position = this.lastValidPosition;
    if (!position) return { active: new Set(), detail: new Set() };

    const detailRadius = Number.isFinite(this.detailRadius)
      ? Math.max(0, this.detailRadius) : 0;
    const keepRadius = Number.isFinite(this.keepRadius)
      ? Math.max(detailRadius, this.keepRadius) : detailRadius;
    const active = new Set<string>();
    const detail = new Set<string>();
    let nearest: LotPlacement | undefined;
    let nearestDistance = Infinity;
    for (const lot of this.lots) {
      const d = Math.hypot(lot.x - position.x, lot.z - position.z);
      if (!Number.isFinite(d)) continue;
      if (d < nearestDistance) {
        nearest = lot;
        nearestDistance = d;
      }
      if (d <= keepRadius) active.add(lot.locationId);
      if (d <= detailRadius) detail.add(lot.locationId);
    }
    // Keep a nearest authored lot visible when the viewer leaves the town.
    // Invalid input and malformed lot positions must never produce NaN-driven
    // arbitrary fallback picks. Detailed lots always belong to active lots.
    if (active.size === 0 && nearest) {
      active.add(nearest.locationId);
      detail.add(nearest.locationId);
    }
    return { active, detail };
  }
}
