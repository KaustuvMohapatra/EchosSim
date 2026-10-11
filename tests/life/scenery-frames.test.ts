import { describe, expect, it } from "vitest";
import { sceneryFrameSeconds } from "../../apps/life/src/world/townMeshes.js";

describe("Babylon scenery animation frame safety", () => {
  it("does not propagate non-finite frame times into foliage transforms", () => {
    let elapsed = 0.25;
    for (const delta of [NaN, Infinity, -Infinity, -1]) {
      elapsed += sceneryFrameSeconds(delta);
      expect(elapsed).toBe(0.25);
      const treeScale = 1 + 0.025 * Math.sin(elapsed * 1.1);
      expect(Number.isFinite(treeScale)).toBe(true);
    }
    elapsed += sceneryFrameSeconds(1 / 60);
    expect(elapsed).toBeCloseTo(0.25 + 1 / 60);
  });

  it("caps long frames while retaining ordinary frame timing", () => {
    expect(sceneryFrameSeconds(0)).toBe(0);
    expect(sceneryFrameSeconds(0.02)).toBe(0.02);
    expect(sceneryFrameSeconds(1)).toBe(0.1);
    expect(sceneryFrameSeconds(10_000)).toBe(0.1);
  });
});
