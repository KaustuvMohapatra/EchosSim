import { describe, expect, it } from "vitest";
import {
  ambienceGain, DEFAULT_SETTINGS, loadSettings, saveSettings,
} from "../../apps/life/src/audio/ambience.js";

const storageOf = (value: string | null) => ({
  getItem: () => value,
  setItem: (_key: string, next: string) => { value = next; },
  read: () => value,
});

describe("ambience settings", () => {
  it("restores valid persisted settings and clamps ordinary volumes", () => {
    expect(loadSettings(storageOf('{"enabled":true,"volume":0.7}')))
      .toEqual({ enabled: true, volume: 0.7 });
    expect(loadSettings(storageOf('{"enabled":true,"volume":2}')))
      .toEqual({ enabled: true, volume: 1 });
    expect(loadSettings(storageOf('{"enabled":false,"volume":-3}')))
      .toEqual({ enabled: false, volume: 0 });
  });

  it("uses safe defaults for malformed and non-finite persisted values", () => {
    for (const value of [
      null, "not json", "null", "[]", "true",
      '{"enabled":"false","volume":"loud"}',
      '{"enabled":1,"volume":null}',
      '{"enabled":true,"volume":1e999}',
    ]) {
      const result = loadSettings(storageOf(value));
      expect(Number.isFinite(result.volume)).toBe(true);
      expect(result.volume).toBeGreaterThanOrEqual(0);
      expect(result.volume).toBeLessThanOrEqual(1);
      if (value?.includes("1e999")) {
        expect(result).toEqual({ enabled: true, volume: DEFAULT_SETTINGS.volume });
      }
    }
    expect(loadSettings(storageOf('{"enabled":"false","volume":"loud"}')))
      .toEqual(DEFAULT_SETTINGS);
  });

  it("sanitizes values before persisting, without mutating callers", () => {
    const store = storageOf(null);
    const settings = { enabled: true, volume: Number.NaN };
    saveSettings(settings, store);
    expect(settings.volume).toBeNaN();
    expect(loadSettings(store)).toEqual({ enabled: true, volume: DEFAULT_SETTINGS.volume });
    saveSettings({ enabled: true, volume: Number.POSITIVE_INFINITY }, store);
    expect(loadSettings(store)).toEqual({ enabled: true, volume: DEFAULT_SETTINGS.volume });
  });

  it("keeps gain finite and within the expected weather envelopes", () => {
    expect(ambienceGain({ enabled: false, volume: 1 }, 2, false)).toBe(0);
    expect(ambienceGain({ enabled: true, volume: 0.4 }, 0, false)).toBeCloseTo(0.1);
    expect(ambienceGain({ enabled: true, volume: 0.4 }, 0, true)).toBeCloseTo(0.04);
    expect(ambienceGain({ enabled: true, volume: 0.4 }, 2, true)).toBeCloseTo(0.18);
    for (const volume of [Number.NaN, Infinity, -Infinity, -4, 8]) {
      for (const weather of [Number.NaN, Infinity, -Infinity, 0, 2]) {
        const result = ambienceGain({ enabled: true, volume }, weather, false);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(0.45);
      }
    }
  });
});
