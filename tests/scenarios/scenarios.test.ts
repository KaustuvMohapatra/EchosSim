/** Sprint 33 — demo scenarios: every showcase must verify deterministically. */
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@echosim/content";

describe("S33: demo scenarios", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.title} plays out as designed`, { timeout: 60_000 }, () => {
      const result = scenario.run();
      if (!result.passed) {
        throw new Error(`${scenario.title}: ${result.detail}`);
      }
      expect(result.passed).toBe(true);
    });
  }

  it("scenario runs are deterministic (same outcome twice)", () => {
    const a = SCENARIOS.find((s) => s.key === "gossip")!.run();
    const b = SCENARIOS.find((s) => s.key === "gossip")!.run();
    expect(a.passed).toBe(b.passed);
    expect(a.detail).toBe(b.detail);
  });
});
