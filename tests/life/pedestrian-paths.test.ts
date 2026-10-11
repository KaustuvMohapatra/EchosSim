import { describe, expect, it } from "vitest";
import { LOTS } from "../../apps/life/src/world/layout.js";
import {
  advanceWalk, collapseCollinear, crossesSolidLot,
  routeBetweenLocations, routeFromPosition, standingPoint,
} from "../../apps/life/src/world/pedestrianPaths.js";

describe("Living World pedestrian waypoints", () => {
  it("places residents on accessible building frontages, not inside solid lots", () => {
    for (const lot of LOTS) {
      const point = standingPoint(lot.locationId, "npc_mira");
      expect(point).toBeDefined();
      expect(crossesSolidLot(point!, point!)).toBe(false);
    }
    expect(standingPoint("missing", "npc")).toBeUndefined();
  });

  it("routes every authored venue pair without cutting through any buildings", () => {
    for (const from of LOTS) for (const to of LOTS) {
      if (from.locationId === to.locationId) continue;
      const points = routeBetweenLocations(from.locationId, to.locationId, "npc_rohan");
      expect(points.length).toBeGreaterThanOrEqual(2);
      const destination = standingPoint(to.locationId, "npc_rohan");
      expect(points[points.length - 1]).toEqual(destination);
      for (let i = 1; i < points.length; i++) {
        expect(crossesSolidLot(points[i - 1]!, points[i]!),
          `${from.locationId} => ${to.locationId} segment ${i}`).toBe(false);
      }
    }
  });

  it("walks at stable distance per frame without overshooting any waypoint", () => {
    const path = [{ x: 5, z: 0 }, { x: 5, z: 5 }];
    let result = advanceWalk({ x: 0, z: 0 }, path, 7);
    expect(result.point).toEqual({ x: 5, z: 2 });
    expect(result.remaining).toEqual([{ x: 5, z: 5 }]);
    result = advanceWalk(result.point, result.remaining, 100);
    expect(result.point).toEqual({ x: 5, z: 5 });
    expect(result.moving).toBe(false);
    expect(advanceWalk(result.point, [], 5).point).toEqual({ x: 5, z: 5 });
  });

  it("never corrupts sprite coordinates on invalid frame distances", () => {
    const start = { x: 0, z: 0 };
    const path = [{ x: 5, z: 0 }];
    for (const distance of [Number.NaN, Infinity, -Infinity, -4]) {
      const result = advanceWalk(start, path, distance);
      expect(result.point).toEqual(start);
      expect(result.remaining).toEqual(path);
      expect(result.moving).toBe(true);
    }
    const recovered = advanceWalk(start, path, 2);
    expect(recovered.point).toEqual({ x: 2, z: 0 });
  });

  it("retargets while mid-route without teleporting the sprite", () => {
    const origin = standingPoint("cafe", "npc_mira")!;
    const route = routeFromPosition(origin, "studio", "npc_mira");
    const partially = advanceWalk(origin, route.slice(1), 10);
    const correction = routeFromPosition(partially.point, "apt_c", "npc_mira");
    expect(correction[0]).toEqual(partially.point);
    expect(correction.at(-1)).toEqual(standingPoint("apt_c", "npc_mira"));
    for (let i = 1; i < correction.length; i++)
      expect(crossesSolidLot(correction[i - 1]!, correction[i]!)).toBe(false);
  });

  it("simplifies straight line segments without altering corners", () => {
    const simplified = collapseCollinear([
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 5, z: 0 },
      { x: 5, z: 3 }, { x: 5, z: 3 },
    ]);
    expect(simplified).toEqual([
      { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 3 },
    ]);
  });
});
