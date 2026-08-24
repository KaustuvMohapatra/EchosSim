/** Sprint 42 — interiors: rings with door gaps, rooms, cutaway selection. */
import { describe, expect, it } from "vitest";
import {
  buildInteriors, pointInRoom, wallsToHide,
} from "../../apps/life/src/world/interiors.js";
import { lotOf } from "../../apps/life/src/world/layout.js";

describe("S42: interior construction", () => {
  const interiors = buildInteriors();

  it("authored lots have walls and at least one door", () => {
    for (const lotId of ["cafe", "library", "studio", "apt_a"]) {
      const def = interiors.get(lotId)!;
      expect(def.walls.length).toBeGreaterThan(3);
      expect(def.doors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("door gaps interrupt the wall ring (no segment covers a door centre)", () => {
    const cafe = interiors.get("cafe")!;
    const door = cafe.doors[0]!;
    for (const w of cafe.walls) {
      const coversX = door.x >= Math.min(w.x1, w.x2) - 0.05 &&
                      door.x <= Math.max(w.x1, w.x2) + 0.05;
      const coversZ = door.z >= Math.min(w.z1, w.z2) - 0.05 &&
                      door.z <= Math.max(w.z1, w.z2) + 0.05;
      const isOnSameLine = (w.z1 === w.z2 && Math.abs(w.z1 - door.z) < 0.3) ||
                           (w.x1 === w.x2 && Math.abs(w.x1 - door.x) < 0.3);
      expect(coversX && coversZ && isOnSameLine).toBe(false);
    }
  });

  it("divider walls create distinct rooms with privacy levels", () => {
    const cafe = interiors.get("cafe")!;
    const types = cafe.rooms.map((r) => r.type);
    expect(types).toContain("Cafe");
    expect(types).toContain("Kitchen");
    const kitchen = cafe.rooms.find((r) => r.type === "Kitchen")!;
    expect(kitchen.privacy).toBe("Staff");
  });

  it("pointInRoom maps world coordinates through the lot origin", () => {
    const cafe = interiors.get("cafe")!;
    const lot = lotOf("cafe")!;
    // Kitchen is the +x side of the divider at x=+2.5.
    const kitchen = cafe.rooms.find((r) => r.type === "Kitchen")!;
    expect(pointInRoom(kitchen, lot.x, lot.z, lot.x + 4, lot.z)).toBe(true);
    expect(pointInRoom(kitchen, lot.x, lot.z, lot.x - 4, lot.z)).toBe(false);
  });
});

describe("S42: wall cutaway", () => {
  const interiors = buildInteriors();
  const cafe = interiors.get("cafe")!;

  it("hides only segments roughly between camera and focus", () => {
    // Walls are footprint-relative; caller transforms world→lot-relative.
    const focus = { x: 0, z: 0 };
    const cam = { x: -30, z: 0 }; // west of the building
    const hidden = wallsToHide(cafe.walls, cam, focus);
    expect(hidden.size).toBeGreaterThan(0);
    for (const id of hidden)
      expect(cafe.walls.find((w) => w.id === id)!.x2).toBeLessThan(0);
  });

  it("hides nothing when viewing from directly above", () => {
    const above = { x: 0, z: 0 };
    expect(wallsToHide(cafe.walls, above, above).size).toBe(0);
  });
});
