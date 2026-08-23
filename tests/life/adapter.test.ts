/** Sprint 36 — LifeModeAdapter: engine-free, deterministic, read-model based. */
import { describe, expect, it } from "vitest";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import { LOTS } from "../../apps/life/src/world/layout.js";

describe("S36: life adapter", () => {
  it("boots the authored town with inspector read models", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    expect(a.town.residents.orderedIds().length).toBeGreaterThanOrEqual(20);

    const snap = a.snapshot();
    expect(snap.agents.length).toBe(a.town.residents.orderedIds().length);
    expect(snap.time.day).toBe(0);
    expect(snap.stats.residents).toBe(snap.agents.length);
    a.dispose();
  });

  it("beat stepping advances the clock deterministically", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    a.setSpeed(1);
    for (let i = 0; i < 6; i++) a.stepOnce();
    expect(a.town.clock.currentTime.totalMinutes).toBe(60);

    const b = new LifeModeAdapter({ seed: 7001 });
    for (let i = 0; i < 6; i++) b.stepOnce();
    expect(b.town.clock.currentTime.totalMinutes).toBe(60);
    // Same seed ⇒ same world state after identical steps.
    expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
    a.dispose(); b.dispose();
  });

  it("speed presets include pause (0) and are reflected in reads", () => {
    const a = new LifeModeAdapter();
    a.setSpeed(4);
    expect(a.speed).toBe(4);
    a.setSpeed(0);
    expect(a.speed).toBe(0);
    a.dispose();
  });

  it("play/pause lifecycle manages its timer", () => {
    const a = new LifeModeAdapter();
    expect(a.running).toBe(false);
    a.play();
    expect(a.running).toBe(true);
    a.pause();
    expect(a.running).toBe(false);
    a.dispose();
  });

  it("layout covers every authored location with sane geometry", () => {
    const a = new LifeModeAdapter({ seed: 1 });
    const simLocations = a.town.locations.orderedIds.map(String);
    const layoutIds = LOTS.map((l) => l.locationId).sort();
    expect(layoutIds).toEqual([...simLocations].sort());
    for (const lot of LOTS) {
      expect(lot.width).toBeGreaterThan(0);
      expect(lot.depth).toBeGreaterThan(0);
      expect(lot.height).toBeGreaterThan(0);
    }
    a.dispose();
  });

  it("snapshots are read-only over time (no mutation during read)", () => {
    const a = new LifeModeAdapter({ seed: 7001 });
    for (let i = 0; i < 10; i++) a.stepOnce();
    const before = JSON.stringify(a.snapshot());
    void a.snapshot();
    void a.snapshot(20);
    expect(JSON.stringify(a.snapshot())).toBe(before);
    a.dispose();
  });
});
