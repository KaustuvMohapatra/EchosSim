/** Sprint 38 — object catalog, anchors, seat claiming, use() flow. */
import { describe, expect, it } from "vitest";
import {
  PLACED_OBJECTS, SeatRegistry, anchorsInWorld,
} from "../../apps/life/src/interaction/catalog.js";
import { InteractionController } from "../../apps/life/src/interaction/InteractionController.js";
import { LOTS } from "../../apps/life/src/world/layout.js";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";

const lotCentre = (id: string) => {
  const l = LOTS.find((x) => x.locationId === id);
  return l ? { x: l.x, z: l.z } : undefined;
};

describe("S38: catalog & anchors", () => {
  it("every placed object sits inside its lot footprint", () => {
    for (const o of PLACED_OBJECTS) {
      const lot = LOTS.find((l) => l.locationId === o.lotId)!;
      expect(Math.abs(o.dx)).toBeLessThanOrEqual(lot.width / 2);
      expect(Math.abs(o.dz)).toBeLessThanOrEqual(lot.depth / 2);
    }
  });

  it("object ids are unique and anchors resolve to world positions", () => {
    const ids = PLACED_OBJECTS.map((o) => o.objectId);
    expect(new Set(ids).size).toBe(ids.length);

    const anchors = anchorsInWorld(lotCentre);
    expect(anchors.size).toBe(PLACED_OBJECTS.length);
    // Cafe chairs anchor near the cafe centre.
    const chair = anchors.get("cafe_chair_0")!;
    const cafe = lotCentre("cafe")!;
    expect(Math.abs(chair.x - cafe.x)).toBeLessThan(8);
    expect(Math.abs(chair.z - cafe.z)).toBeLessThan(6);
  });
});

describe("S38: seat registry", () => {
  it("claims exclusively; same agent re-claims; release frees", () => {
    const s = new SeatRegistry();
    expect(s.claim("seat_a", "player")).toBe(true);
    expect(s.claim("seat_a", "npc_mira")).toBe(false); // occupied
    expect(s.claim("seat_a", "player")).toBe(true);     // idempotent
    s.release("player");
    expect(s.claim("seat_a", "npc_mira")).toBe(true);
  });
});

describe("S38: interaction flow", () => {
  it("sit on a free chair travels to the lot then claims the visual seat", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const ic = new InteractionController(a);
    // Cafe opens 06:00 — get there first.
    for (let i = 0; i < 40; i++) a.stepOnce();

    const r = ic.use("cafe_chair_0", "sit");
    expect(r.ok).toBe(true);
    // Travel consumes simulation minutes before arrival.
    for (let i = 0; i < 20; i++) a.stepOnce();
    expect(a.playerLocationId()).toBe("cafe");

    // Arrival tick claims the seat and sets the presentation pose.
    a.touch();
    expect(ic.seats.holderOf("cafe_chair_0")).toBe(a.playerId);
    expect(a.playerSeatedAt).toBeDefined();
    expect(a.playerSeatedAt!.x).not.toBeNaN();

    // Another agent cannot claim the same seat.
    expect(ic.seats.claim("cafe_chair_0", "npc_mira")).toBe(false);

    ic.dispose(); a.dispose();
  });

  it("a taken seat refuses politely instead of double-claiming", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const ic = new InteractionController(a);
    for (let i = 0; i < 40; i++) a.stepOnce();

    ic.seats.claim("cafe_chair_1", "npc_mira");
    const r = ic.use("cafe_chair_1", "sit");
    expect(r.ok).toBe(true);              // travel still fine…
    for (let i = 0; i < 20; i++) a.stepOnce();
    a.touch();                            // arrival resolves the claim
    expect(a.playerLocationId()).toBe("cafe");
    expect(a.playerSeatedAt).toBeUndefined(); // …but no seat pose
    expect(a.lastCommandFeedback).toMatch(/taken/i);
    ic.dispose(); a.dispose();
  });

  it("non-seat affordances route their command without seating side effects", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const ic = new InteractionController(a);
    for (let i = 0; i < 60; i++) a.stepOnce(); // past library 08:30 open

    const r = ic.use("library_shelf_a", "read");
    expect(r.ok).toBe(true);
    for (let i = 0; i < 20; i++) a.stepOnce();
    expect(a.playerLocationId()).toBe("library");
    expect(a.playerSeatedAt).toBeUndefined();
    ic.dispose(); a.dispose();
  });
});
