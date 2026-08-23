/**
 * World layout (Sprint 36): authored EchoSim locations placed on a
 * metre-scale ground plane (x/z, Y-up). Presentation-only coordinates —
 * the simulation stays semantic.
 */

export interface LotPlacement {
  locationId: string;
  x: number;
  z: number;
  /** Building footprint in metres. */
  width: number;
  depth: number;
  height: number;
  color: [number, number, number];
}

export const WORLD_BOUNDS = { minX: -70, maxX: 70, minZ: -55, maxZ: 55 };

export const LOTS: readonly LotPlacement[] = [
  // Residential row (west).
  { locationId: "apt_a", x: -52, z: -28, width: 18, depth: 14, height: 9,  color: [0.32, 0.38, 0.5] },
  { locationId: "apt_b", x: -52, z: 0,   width: 18, depth: 14, height: 9,  color: [0.3, 0.42, 0.46] },
  { locationId: "apt_c", x: -52, z: 28,  width: 18, depth: 14, height: 9,  color: [0.36, 0.34, 0.48] },

  // Market street (centre).
  { locationId: "cafe",      x: -8,  z: -20, width: 14, depth: 11, height: 5, color: [0.55, 0.4, 0.28] },
  { locationId: "bakery",    x: -8,  z: 2,   width: 13, depth: 10, height: 5, color: [0.6, 0.45, 0.25] },
  { locationId: "store",     x: -6,  z: 24,  width: 15, depth: 12, height: 5, color: [0.35, 0.45, 0.4] },
  { locationId: "bookstore", x: 22,  z: -22, width: 12, depth: 10, height: 5, color: [0.45, 0.35, 0.52] },

  // Civic / work (east).
  { locationId: "library",    x: 26,  z: 2,   width: 16, depth: 12, height: 7, color: [0.4, 0.42, 0.55] },
  { locationId: "clinic",     x: 24,  z: 26,  width: 14, depth: 11, height: 6, color: [0.5, 0.55, 0.58] },
  { locationId: "studio",     x: 50,  z: -16, width: 16, depth: 12, height: 7, color: [0.5, 0.42, 0.3] },
  { locationId: "restaurant", x: 52,  z: 12,  width: 16, depth: 13, height: 6, color: [0.58, 0.36, 0.3] },
  { locationId: "hall",       x: 20,  z: 46,  width: 17, depth: 12, height: 6, color: [0.44, 0.44, 0.5] },

  // Park (open space).
  { locationId: "park", x: -14, z: 44, width: 30, depth: 18, height: 0.4, color: [0.22, 0.42, 0.26] },
];

const byId = new Map(LOTS.map((l) => [l.locationId, l]));
export function lotOf(locationId: string): LotPlacement | undefined {
  return byId.get(locationId);
}

/** Stable pseudo-random offset for agents inside a lot (deterministic). */
export function agentOffset(agentId: string): { dx: number; dz: number } {
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const dx = ((h >>> 0) % 100) / 100 - 0.5;
  const dz = (((h >>> 10) % 100) / 100) - 0.5;
  return { dx: dx * 8, dz: dz * 5 };
}
