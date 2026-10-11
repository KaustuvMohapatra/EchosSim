import { describe, expect, it } from "vitest";
import { LOTS } from "../../apps/life/src/world/layout.js";
import { LotActivationManager } from "../../apps/life/src/world/streaming.js";

describe("lot activation streaming", () => {
  it("keeps detail a subset of loaded lots on the authored map", () => {
    const manager = new LotActivationManager(LOTS);
    for (const [x, z] of [[-52, -28], [50, -16], [20, 46], [300, 300]]) {
      const result = manager.update(x!, z!);
      expect(result.active.size).toBeGreaterThan(0);
      for (const id of result.detail) expect(result.active.has(id)).toBe(true);
    }
  });

  it("holds the previous valid scene selection through transient invalid coordinates", () => {
    const manager = new LotActivationManager(LOTS);
    manager.detailRadius = 15;
    manager.keepRadius = 20;
    const expected = manager.update(50, -16);
    for (const [x, z] of [[NaN, -16], [50, Infinity], [-Infinity, 0]]) {
      const result = manager.update(x!, z!);
      expect([...result.active]).toEqual([...expected.active]);
      expect([...result.detail]).toEqual([...expected.detail]);
    }
    expect([...manager.update(-52, -28).detail]).toContain("apt_a");
  });

  it("does not guess a first lot before receiving a valid camera position", () => {
    const manager = new LotActivationManager(LOTS);
    expect(manager.update(NaN, Infinity)).toEqual({
      active: new Set(), detail: new Set(),
    });
    const after = manager.update(-52, 0);
    expect(after.detail.has("apt_b")).toBe(true);
  });

  it("clamps invalid/reversed radii without allowing unloaded detailed lots", () => {
    const manager = new LotActivationManager(LOTS);
    manager.detailRadius = 20;
    manager.keepRadius = -5;
    const reversed = manager.update(-52, 0);
    expect(reversed.detail.has("apt_b")).toBe(true);
    for (const id of reversed.detail) expect(reversed.active.has(id)).toBe(true);
    manager.detailRadius = Infinity;
    manager.keepRadius = NaN;
    const invalid = manager.update(-52, 0);
    expect(invalid.detail.has("apt_b")).toBe(true);
    for (const id of invalid.detail) expect(invalid.active.has(id)).toBe(true);
  });

  it("skips malformed lot centres instead of selecting them as a fallback", () => {
    const malformed = [{ ...LOTS[0]!, x: NaN }, LOTS[1]!];
    const manager = new LotActivationManager(malformed);
    const result = manager.update(10000, 10000);
    expect([...result.active]).toEqual(["apt_b"]);
    expect([...result.detail]).toEqual(["apt_b"]);
  });
});
