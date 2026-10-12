/** Sprint 45 — districts & map model. */
import { describe, expect, it } from "vitest";
import { DISTRICTS, WORLD_SPAN, districtOf, mapLots } from "../../apps/life/src/world/map.js";
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

  it("map rectangles represent actual world-space lot bounds, not their centres", () => {
    const spanX = WORLD_SPAN.maxX - WORLD_SPAN.minX;
    const spanZ = WORLD_SPAN.maxZ - WORLD_SPAN.minZ;
    const mapped = new Map(mapLots().map((lot) => [lot.locationId, lot]));
    for (const lot of LOTS) {
      const rect = mapped.get(lot.locationId)!;
      expect(rect.x * spanX + WORLD_SPAN.minX).toBeCloseTo(lot.x - lot.width / 2);
      expect(rect.z * spanZ + WORLD_SPAN.minZ).toBeCloseTo(lot.z - lot.depth / 2);
      expect((rect.x + rect.width / 2) * spanX + WORLD_SPAN.minX).toBeCloseTo(lot.x);
      expect((rect.z + rect.depth / 2) * spanZ + WORLD_SPAN.minZ).toBeCloseTo(lot.z);
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
