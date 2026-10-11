/** Sprints 56–58 — daylight model, ambience settings, lot streaming logic. */
import { describe, expect, it } from "vitest";
import { daylightParams } from "../../apps/life/src/world/daylight.js";
import {
  ambienceGain, DEFAULT_SETTINGS, loadSettings, saveSettings,
} from "../../apps/life/src/audio/ambience.js";
import { LotActivationManager } from "../../apps/life/src/world/streaming.js";
import { LOTS } from "../../apps/life/src/world/layout.js";

describe("S56: daylight", () => {
  it("noon is brightest with neutral-warm sun", () => {
    const noon = daylightParams(720);
    expect(noon.elevation).toBeGreaterThan(0.9);
    expect(noon.sunIntensity).toBeGreaterThan(1.0);
    expect(noon.nightFactor).toBeLessThan(0.1);
  });

  it("midnight is dark and cool", () => {
    const night = daylightParams(0);
    expect(night.elevation).toBe(0);
    expect(night.sunIntensity).toBeLessThan(0.2);
    expect(night.sunColor[2]).toBeGreaterThan(night.sunColor[0]);
  });

  it("golden hours are warm (red >= blue)", () => {
    const dawn = daylightParams(420); // 07:00
    expect(dawn.sunColor[0]).toBeGreaterThanOrEqual(dawn.sunColor[2]);
  });
});

describe("S56: continuous daylight boundaries", () => {
  it.each([360, 1200])("does not abruptly change lighting at minute %i", (boundary) => {
    const before = daylightParams(boundary - 0.001);
    const after = daylightParams(boundary + 0.001);
    expect(Math.abs(after.sunIntensity - before.sunIntensity)).toBeLessThan(0.001);
    expect(Math.abs(after.hemiIntensity - before.hemiIntensity)).toBeLessThan(0.001);
    expect(Math.abs(after.nightFactor - before.nightFactor)).toBeLessThan(0.001);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(after.sunColor[i]! - before.sunColor[i]!)).toBeLessThan(0.001);
    }
  });

  it("preserves the same lighting after a complete day and for negative minutes", () => {
    for (const minute of [0, 359, 375, 420, 720, 1185, 1200, 1439]) {
      expect(daylightParams(minute + 1440)).toEqual(daylightParams(minute));
      expect(daylightParams(minute - 1440)).toEqual(daylightParams(minute));
    }
  });

  it("has smooth intermediate twilight illumination without darkening at noon", () => {
    const midnight = daylightParams(0);
    const dawn = daylightParams(375);
    const noon = daylightParams(720);
    const dusk = daylightParams(1185);
    expect(dawn.sunIntensity).toBeGreaterThan(midnight.sunIntensity);
    expect(dawn.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(dusk.sunIntensity).toBeGreaterThan(midnight.sunIntensity);
    expect(dusk.sunIntensity).toBeLessThan(noon.sunIntensity);
  });
});

describe("S57: ambience settings", () => {
  it("persists through injected storage and clamps volume", () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    };
    saveSettings({ enabled: true, volume: 5 }, storage);
    const s = loadSettings(storage);
    expect(s.enabled).toBe(true);
    expect(s.volume).toBe(1);
  });

  it("gain is zero while disabled; rain raises gain when enabled", () => {
    const off = ambienceGain(DEFAULT_SETTINGS, 0, false);
    expect(off).toBe(0);
    const on = ambienceGain({ enabled: true, volume: 0.5 }, 0, false);
    const rain = ambienceGain({ enabled: true, volume: 0.5 }, 3, false);
    expect(rain).toBeGreaterThan(on);
  });
});

describe("S58: lot streaming", () => {
  const mgr = new LotActivationManager(LOTS);

  it("lots near the viewer activate with detail", () => {
    const cafe = LOTS.find((l) => l.locationId === "cafe")!;
    const { active, detail } = mgr.update(cafe.x, cafe.z);
    expect(active.has("cafe")).toBe(true);
    expect(detail.has("cafe")).toBe(true);
    // Distant lots may stay inactive but the nearest fallback never empties.
    expect(active.size).toBeGreaterThan(0);
  });

  it("never returns an empty active set even far outside town", () => {
    const { active } = mgr.update(9999, -9999);
    expect(active.size).toBeGreaterThanOrEqual(1);
  });
});
