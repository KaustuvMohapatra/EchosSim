/**
 * EchoSim sidewalk routing, presentation only.
 *
 * Semantic agent locations continue to come from the Town. These waypoints
 * make travel legible while the richer street/path graph is being developed.
 * No cognition or simulation timing depends on rendering framerate.
 */
import { LOTS, agentOffset, lotOf, type LotPlacement } from "./layout.js";

export interface WalkPoint { x: number; z: number }
export const STREET_LANES = [-28, 6, 37] as const;
export const CROSS_STREETS = [-8, 34] as const;

/** Visual arrival points are outside solid buildings, never inside their walls. */
export function standingPoint(locationId: string, agentId: string): WalkPoint | undefined {
  const lot = lotOf(locationId);
  if (!lot) return undefined;
  const wiggle = agentOffset(agentId).dz * 0.65;
  if (locationId === "park")
    return { x: -21.5, z: lot.z + wiggle };
  const lane = laneOf(lot);
  const edge = lane > lot.x
    ? lot.x + lot.width / 2 + 2
    : lot.x - lot.width / 2 - 2;
  return { x: edge, z: lot.z + wiggle };
}

export function laneOf(lot: LotPlacement): number {
  if (lot.locationId === "park") return -28;
  return STREET_LANES.reduce((best, lane) =>
    Math.abs(lot.x - lane) < Math.abs(lot.x - best) ? lane : best);
}

export function routeBetweenLocations(
  fromId: string,
  toId: string,
  agentId: string,
): WalkPoint[] {
  const from = lotOf(fromId), to = lotOf(toId);
  const fromPoint = standingPoint(fromId, agentId);
  const toPoint = standingPoint(toId, agentId);
  if (!from || !to || !fromPoint || !toPoint) return toPoint ? [toPoint] : [];
  if (fromId === toId) return [toPoint];
  const startLane = laneOf(from);
  const finishLane = laneOf(to);
  const points: WalkPoint[] = [{ ...fromPoint }, { x: startLane, z: fromPoint.z }];

  if (startLane !== finishLane) {
    // Only cross between lanes on clear streets, not through buildings.
    const crossing = CROSS_STREETS.reduce((best, z) =>
      Math.abs(fromPoint.z - z) + Math.abs(toPoint.z - z) <
      Math.abs(fromPoint.z - best) + Math.abs(toPoint.z - best) ? z : best);
    points.push({ x: startLane, z: crossing });
    points.push({ x: finishLane, z: crossing });
  }
  points.push({ x: finishLane, z: toPoint.z });
  points.push({ ...toPoint });
  return collapseCollinear(points);
}

/** Removes redundant waypoints but preserves exact corners and arrival. */
export function collapseCollinear(points: readonly WalkPoint[]): WalkPoint[] {
  const out: WalkPoint[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - p.x, prev.z - p.z) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!, b = out[out.length - 1]!;
      const abx = b.x - a.x, abz = b.z - a.z;
      const bpx = p.x - b.x, bpz = p.z - b.z;
      if (Math.abs(abx * bpz - abz * bpx) < 0.001 &&
          abx * bpx + abz * bpz >= 0) {
        out[out.length - 1] = { ...p };
        continue;
      }
    }
    out.push({ ...p });
  }
  return out;
}

/** Debug and regression tool: is a route cutting through solid architecture? */
export function crossesSolidLot(
  a: WalkPoint, b: WalkPoint, excluded: readonly string[] = [],
  padding = 0.35,
): boolean {
  return LOTS.some((lot) => {
    if (lot.locationId === "park" || excluded.includes(lot.locationId)) return false;
    const x1 = lot.x - lot.width / 2 - padding;
    const x2 = lot.x + lot.width / 2 + padding;
    const z1 = lot.z - lot.depth / 2 - padding;
    const z2 = lot.z + lot.depth / 2 + padding;
    // Segment vs axis-aligned rectangle (Liang-Barsky).
    let near = 0, far = 1;
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const [p, q] of [[-dx, a.x - x1], [dx, x2 - a.x],
                          [-dz, a.z - z1], [dz, z2 - a.z]]) {
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return false;
      } else {
        const t = q / p;
        if (p < 0) near = Math.max(near, t);
        else far = Math.min(far, t);
      }
    }
    return near <= far;
  });
}

/** A frame-independent step along a queue of world-space waypoints. */
export function advanceWalk(
  current: WalkPoint,
  waypoints: readonly WalkPoint[],
  distance: number,
): { point: WalkPoint; remaining: WalkPoint[]; moving: boolean } {
  let x = current.x, z = current.z, budget = Math.max(0, distance);
  const remaining = [...waypoints];
  // May consume several very short segments in a single render frame.
  while (remaining.length) {
    const target = remaining[0]!;
    const dx = target.x - x, dz = target.z - z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) { x = target.x; z = target.z; remaining.shift(); continue; }
    if (budget <= 0) break;
    if (length <= budget) {
      x = target.x; z = target.z; budget -= length;
      remaining.shift();
    } else {
      x += dx / length * budget; z += dz / length * budget;
      budget = 0;
    }
  }
  return { point: { x, z }, remaining, moving: remaining.length > 0 };
}
