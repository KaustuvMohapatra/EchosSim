/** Sprint 37 — camera rig math + player command plumbing (engine-free). */
import { describe, expect, it } from "vitest";
import {
  computeRig, converged, MODE_LIMITS,
  type RigPose,
} from "../../apps/life/src/camera/cameraRig.js";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";

const POSE: RigPose = { targetX: 0, targetZ: 0, targetY: 0, radius: 95, beta: 0.95 };

describe("S37: camera rig", () => {
  it("life mode is pass-through (user-controlled)", () => {
    const out = computeRig("life", { x: 10, z: 10 }, POSE);
    expect(out).toBe(POSE);
  });

  it("follow mode eases toward the player with standard radius/beta", () => {
    let pose = computeRig("follow", { x: 40, z: -20 }, POSE);
    // First step moves partway.
    expect(pose.targetX).toBeGreaterThan(0);
    expect(pose.targetZ).toBeLessThan(0);
    for (let i = 0; i < 120; i++)
      pose = computeRig("follow", { x: 40, z: -20 }, pose);
    expect(converged(pose, {
      targetX: 40, targetZ: -20, targetY: 1.2, radius: 17, beta: 1.02,
    })).toBe(true);
    expect(MODE_LIMITS.follow.minRadius).toBeLessThanOrEqual(pose.radius);
  });

  it("shoulder mode is closer than follow", () => {
    let f = computeRig("follow", { x: 5, z: 5 }, POSE);
    let s = computeRig("shoulder", { x: 5, z: 5 }, POSE);
    for (let i = 0; i < 200; i++) {
      f = computeRig("follow", { x: 5, z: 5 }, f);
      s = computeRig("shoulder", { x: 5, z: 5 }, s);
    }
    expect(s.radius).toBeLessThan(f.radius);
    expect(s.beta).toBeGreaterThan(f.beta); // more top-down-ish tilt
  });

  it("beta stays inside sane limits while easing", () => {
    let pose = computeRig("shoulder", { x: 1, z: 1 }, POSE);
    for (let i = 0; i < 300; i++)
      pose = computeRig("shoulder", { x: 1, z: 1 }, pose);
    expect(pose.beta).toBeGreaterThanOrEqual(0.15);
    expect(pose.beta).toBeLessThanOrEqual(1.35);
  });
});

describe("S37: player actor + travel commands", () => {
  it("player exists as a full resident through the normal pipeline", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const mind = a.town.residents.tryMind(a.playerId)!;
    expect(mind).toBeDefined();
    expect(mind.displayName).toBe("You");
    // Player participates in needs/cognition like everyone.
    expect(mind.needs.all().length).toBe(7);
    a.dispose();
  });

  it("travel to an open lot is accepted and lands the player there", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    // Cafe opens at 06:00 — advance into the day first.
    for (let i = 0; i < 40; i++) a.stepOnce(); // t = 06:40
    expect(a.commandMoveTo("cafe")).toBe(true);
    for (let i = 0; i < 30; i++) a.stepOnce();
    expect(a.playerLocationId()).toBe("cafe");
    a.dispose();
  });

  it("travel respects authored hours at composition time (t=0 truth)", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    // Midnight: cafe (06:00–20:00) is closed immediately, not after a sweep.
    expect(a.town.locations.get("cafe" as never).isOpen).toBe(false);
    // Homes without hours are always available.
    expect(a.commandMoveTo("apt_a")).toBe(true);
    for (let i = 0; i < 10; i++) a.stepOnce();
    expect(a.playerLocationId()).toBe("apt_a");
    a.dispose();
  });

  it("travel to closed/unknown places is refused with friendly feedback", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    const cafe = a.town.locations.get("cafe" as never);
    cafe.setOpen(false);
    expect(a.commandMoveTo("cafe")).toBe(false);
    expect(a.lastCommandFeedback).toMatch(/closed/i);
    expect(a.commandMoveTo("nowhere_land")).toBe(false);
    expect(a.playerLocationId()).not.toBe("nowhere_land");
    a.dispose();
  });
});
