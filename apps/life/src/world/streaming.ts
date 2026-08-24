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

  constructor(private readonly lots: readonly LotPlacement[]) {}

  update(playerX: number, playerZ: number): ActiveLots {
    const active = new Set<string>();
    const detail = new Set<string>();
    for (const lot of this.lots) {
      const d = Math.hypot(lot.x - playerX, lot.z - playerZ);
      if (d <= this.keepRadius) active.add(lot.locationId);
      if (d <= this.detailRadius) detail.add(lot.locationId);
    }
    // Always keep something visible: nearest lot even if far.
    if (active.size === 0 && this.lots.length > 0) {
      let best = this.lots[0]!;
      let bestD = Infinity;
      for (const l of this.lots) {
        const d = Math.hypot(l.x - playerX, l.z - playerZ);
        if (d < bestD) { bestD = d; best = l; }
      }
      active.add(best.locationId);
      detail.add(best.locationId);
    }
    return { active, detail };
  }
}
