import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { residentAtlasIndex, residentAtlasUrl, nextResidentIdForAppearance, RESIDENT_ATLAS_COUNT } from "../../apps/life/src/characters/residentAssets.js";

describe("EchoSim original pixel art asset pack", () => {
  it("contains 32 PNG atlases in the correct 4×5 animation layout", () => {
    expect(RESIDENT_ATLAS_COUNT).toBe(32);
    for (let n = 0; n < RESIDENT_ATLAS_COUNT; n++) {
      const file = new URL(
        "../../apps/life/public/assets/residents/resident-" +
        String(n).padStart(2, "0") + ".png",
        import.meta.url,
      );
      const data = readFileSync(file);
      expect(data.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      )).toBe(true);
      expect(data.readUInt32BE(16)).toBe(128);
      expect(data.readUInt32BE(20)).toBe(240);
      expect(data[25]).toBe(3); // palette-indexed PNG
      expect(data.includes(Buffer.from("tRNS"))).toBe(true); // transparent background
    }
  });

  it("lets players choose any look with stable collision-free IDs", () => {
    const used: string[] = [];
    const selected = new Set<string>();
    for (let n = 0; n < RESIDENT_ATLAS_COUNT; n++) {
      const id = nextResidentIdForAppearance(used, n);
      expect(id).toMatch(/^created_[0-9]{4,}$/);
      expect(residentAtlasIndex(id)).toBe(n);
      expect(selected.has(id)).toBe(false);
      selected.add(id);
      used.push(id);
    }
    expect(nextResidentIdForAppearance(["created_0001"], residentAtlasIndex("created_0001")))
      .not.toBe("created_0001");
    expect(() => nextResidentIdForAppearance([], -1)).toThrow();
    expect(() => nextResidentIdForAppearance([], RESIDENT_ATLAS_COUNT)).toThrow();
  });

  it("maps any resident to a deterministic and existing atlas", () => {
    const first = residentAtlasIndex("npc_mira");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(RESIDENT_ATLAS_COUNT);
    expect(residentAtlasIndex("npc_mira")).toBe(first);
    expect(residentAtlasUrl("npc_mira")).toBe(
      "/assets/residents/resident-" + String(first).padStart(2, "0") + ".png",
    );
  });
});
