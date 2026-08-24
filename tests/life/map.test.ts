/** Sprint 45 — districts & map model. */
import { describe, expect, it } from "vitest";
import { DISTRICTS, districtOf, mapLots } from "../../apps/life/src/world/map.js";
import { LOTS } from "../../apps/life/src/world/layout.js";

describe("S45: districts", () => {
  it("every authored lot belongs to exactly one district", () => {
    for (const lot of LOTS) {
      const d = districtOf(lot.locationId);
      expect(d).toBeDefined();
      const matches = DISTRICTS.filter((dd) => dd.lots.includes(lot.locationId));
      expect(matches).toHaveLength(1);
    }
  });

  it("normalised map coordinates stay in [0,1]", () => {
    for (const l of mapLots()) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(1);
      expect(l.z).toBeGreaterThanOrEqual(0);
      expect(l.z).toBeLessThanOrEqual(1);
    }
  });
});
