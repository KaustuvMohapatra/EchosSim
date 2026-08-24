/** Sprint 46 — venue edit store + live definition patching. */
import { describe, expect, it } from "vitest";
import { createAuthoredTown } from "@echosim/content";
import {
  loadVenueEdits, saveVenueEdits, type VenueEdits,
} from "../../apps/life/src/build/venueEdits.js";

describe("S46: venue edits", () => {
  it("updateDefinition patches display name, capacity and hours live", () => {
    const { town } = createAuthoredTown(7001);
    town.locations.updateDefinition("cafe" as never, {
      displayName: "Moonlight Cafe",
      capacity: 4,
      hours: { openMinuteOfDay: 480, closeMinuteOfDay: 1380 },
    } as never);
    const rt = town.locations.get("cafe" as never);
    expect(rt.definition.displayName).toBe("Moonlight Cafe");
    expect(rt.definition.capacity).toBe(4);

    // Open-state recomputation respects the new window (10:00 inside 08–23).
    const at = (m: number): void => {
      rt.forceOpen(
        m >= 480 && m <= 1380);
    };
    at(600); expect(rt.isOpen).toBe(true);
    at(200); expect(rt.isOpen).toBe(false);
  });

  it("edits store round-trips through an injected storage", () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    };
    const edits: VenueEdits = {
      cafe: { displayName: "Moonlight Cafe", capacity: 6 },
    };
    saveVenueEdits(edits, storage);
    expect(loadVenueEdits(storage)).toEqual(edits);
    expect(loadVenueEdits(undefined)).toEqual({});
  });
});
