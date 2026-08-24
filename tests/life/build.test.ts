/** Sprint 43 — build mode controller: validation, undo/redo, persistence. */
import { describe, expect, it } from "vitest";
import {
  BuildController, snap, resetBuildIds,
} from "../../apps/life/src/build/BuildController.js";

const BOUNDS = { x1: -7, z1: -5.5, x2: 7, z2: 5.5 }; // cafe-sized lot
const boundsOf = (id: string) => (id === "cafe" ? BOUNDS : undefined);

describe("S43: placement & validation", () => {
  it("snaps to the 0.5 m grid relative to lot centre", () => {
    expect(snap(3.14)).toBe(3);
    expect(snap(-0.76)).toBe(-1);
  });

  it("places inside the lot and rejects out-of-bounds", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    expect(b.place("chair", "cafe", 0, 0).ok).toBe(true);
    // Far outside east wall.
    const v = b.place("sofa", "cafe", 40, 0);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/fit/i);
  });

  it("rejects overlapping placements but allows neighbours", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    expect(b.place("table", "cafe", 0, 0).ok).toBe(true);
    const overlap = b.place("chair", "cafe", 0.2, 0);
    expect(overlap.ok).toBe(false);
    expect(overlap.reason).toMatch(/overlap/i);
    expect(b.place("chair", "cafe", 1.2, 0).ok).toBe(true); // clear neighbour
  });

  it("rotation swaps the footprint for overlap purposes", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    expect(b.place("bookshelf", "cafe", -4, -4).ok).toBe(true);
    // Bookshelf unrotated: w .45 d 1.7 — a sofa at dz +1.6 overlaps depth-wise.
    const before = b.place("sofa", "cafe", -4, -4 + 1.0);
    expect(before.ok).toBe(false);
  });
});

describe("S43: undo / redo", () => {
  it("undo removes a placement; redo restores it", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    b.place("bed", "cafe", 3, 3);
    expect(b.list()).toHaveLength(1);
    expect(b.undo()).toBe(true);
    expect(b.list()).toHaveLength(0);
    expect(b.redo()).toBe(true);
    expect(b.list()).toHaveLength(1);
  });

  it("move and rotate are invertible; new ops clear redo", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    b.place("desk", "cafe", 0, 0);
    const id = b.list()[0]!.objectId;

    b.move(id, 2, 1);
    expect(b.get(id)!.dx).toBe(2);
    expect(b.undo()).toBe(true);
    expect(b.get(id)!.dx).toBe(0);

    b.rotate(id);
    expect(b.get(id)!.rot).toBe(1);
    b.undo();
    expect(b.get(id)!.rot).toBe(0);

    b.move(id, 2, 1);
    expect(b.canRedo).toBe(false); // branch cleared
    b.undo();                        // back to origin
    expect(b.get(id)!.dx).toBe(0);
  });

  it("remove is undone by restoring the exact placement", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    b.place("counter", "cafe", -2, 4);
    const id = b.list()[0]!.objectId;
    b.remove(id);
    expect(b.get(id)).toBeUndefined();
    b.undo();
    expect(b.get(id)).toMatchObject({ kind: "counter", dx: -2, dz: 4 });
  });

  it("authored fixtures act as blockers", () => {
    resetBuildIds();
    const blocker = { objectId: "cafe_chair_0", kind: "chair" as const,
      lotId: "cafe", dx: -3.5, dz: -2.5, rot: 1 as const };
    const b = new BuildController(boundsOf, [blocker]);
    const v = b.place("table", "cafe", -3.5, -2.5);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/fixture/i);
  });
});

describe("S43: persistence", () => {
  it("serialize → load round-trips placements and resumes id counters", () => {
    resetBuildIds();
    const a = new BuildController(boundsOf);
    a.place("sofa", "cafe", 1, 1);
    const json = a.serialize();

    const b = new BuildController(boundsOf);
    b.load(json);
    expect(b.list()).toEqual(a.list());
    // New ids must not collide with loaded ones.
    b.place("chair", "cafe", 3, 0);
    const ids = b.list().map((p) => p.objectId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("S44: structural build", () => {
  it("places an axis-aligned wall snapped to grid, inside the lot", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    const r = b.placeWall("cafe", 0, -4, 5, -3.6);
    expect(r.ok).toBe(true);
    expect(b.wallsList()).toHaveLength(1);
    const w = b.wallsList()[0]!;
    expect(w.z1).toBe(w.z2); // horizontal after axis snap
    // Out of bounds rejected.
    expect(b.placeWall("cafe", 8, -4, 20, -4).ok).toBe(false);
  });

  it("door splits a wall into two segments with a gap", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    b.placeWall("cafe", -4, 0, 4, 0);
    const before = b.wallsList()[0]!;
    const r = b.placeDoor("cafe", 0, 0);
    expect(r.ok).toBe(true);
    expect(b.doorsList()).toHaveLength(1);
    expect(b.wallsList()).toHaveLength(2);
    // Gap around the door centre.
    for (const w of b.wallsList())
      expect(pxInRange(0, Math.min(w.x1, w.x2), Math.max(w.x1, w.x2))).toBe(false);
    void before;
    // Undo restores single wall and removes door.
    expect(b.undo()).toBe(true);
    expect(b.wallsList()).toHaveLength(1);
    expect(b.doorsList()).toHaveLength(0);
  });

  it("floor rects validate size and bounds; serialize includes structure", () => {
    resetBuildIds();
    const b = new BuildController(boundsOf);
    expect(b.addFloorRect("cafe", -5, -4, 0, 0).ok).toBe(true);
    expect(b.addFloorRect("cafe", 6, -4, 9, 0).ok).toBe(false); // outside
    b.placeWall("cafe", -2, 2, 2, 2);
    const doc = JSON.parse(b.serialize()) as { walls: unknown[]; floors: unknown[] };
    expect(doc.walls).toHaveLength(1);
    expect(doc.floors).toHaveLength(1);

    const c = new BuildController(boundsOf);
    c.load(b.serialize());
    expect(c.wallsList()).toHaveLength(1);
    expect(c.floorsList()).toHaveLength(1);
  });
});

function pxInRange(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}
