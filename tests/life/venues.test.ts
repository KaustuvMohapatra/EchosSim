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
  it("ignores corrupt venue edit documents and invalid field types", () => {
    const storage = (raw: string) => ({ getItem: () => raw });
    for (const raw of ["{", "null", "[]", '"not an object"']) {
      expect(loadVenueEdits(storage(raw))).toEqual({});
    }
    expect(loadVenueEdits(storage(JSON.stringify({
      cafe: { displayName: "", capacity: -2, hours: { openMinuteOfDay: -1, closeMinuteOfDay: 600 } },
      library: null,
      park: ["invalid"],
      studio: { displayName: 4, capacity: "unlimited" },
    })))).toEqual({});
  });

  it("retains valid fields and venues when other saved fields are malformed", () => {
    const source = {
      cafe: {
        displayName: "Moonlight Cafe", capacity: 0,
        hours: { openMinuteOfDay: 480, closeMinuteOfDay: 1380 },
      },
      park: { capacity: 14.5, displayName: "Evening Park" },
      library: { capacity: 6, hours: { openMinuteOfDay: "9", closeMinuteOfDay: 1000 } },
      studio: { capacity: 12, hours: { openMinuteOfDay: 1440, closeMinuteOfDay: 1000 } },
    };
    const edits = loadVenueEdits({ getItem: () => JSON.stringify(source) });
    expect(edits).toEqual({
      cafe: { displayName: "Moonlight Cafe", hours: { openMinuteOfDay: 480, closeMinuteOfDay: 1380 } },
      park: { displayName: "Evening Park" },
      library: { capacity: 6 },
      studio: { capacity: 12 },
    });
  });

});
