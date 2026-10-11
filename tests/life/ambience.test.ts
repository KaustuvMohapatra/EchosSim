import { describe, expect, it } from "vitest";
import {
  ambienceGain, DEFAULT_SETTINGS, loadSettings, saveSettings,
} from "../../apps/life/src/audio/ambience.js";

describe("Life ambience finite-volume safeguards", () => {
  it("rejects non-finite persisted volume and clamps finite values", () => {
    const store = (raw: string) => ({ getItem: () => raw, setItem: () => {} });
    for (const value of ['"broken"', 'null', '"Infinity"', '1e999']) {
      expect(loadSettings(store(`{"enabled":true,"volume":${value}}`)).volume)
        .toBe(DEFAULT_SETTINGS.volume);
    }
    expect(loadSettings(store('{"enabled":true,"volume":-2}')).volume).toBe(0);
    expect(loadSettings(store('{"enabled":true,"volume":4}')).volume).toBe(1);
  });

  it("normalizes runtime settings on persistence", () => {
    let stored = "";
    const storage = { getItem: () => stored, setItem: (_key: string, val: string) => { stored = val; } };
    saveSettings({ enabled: true, volume: Number.POSITIVE_INFINITY }, storage);
    expect(JSON.parse(stored)).toEqual({ enabled: true, volume: DEFAULT_SETTINGS.volume });
    saveSettings({ enabled: false, volume: -5 }, storage);
    expect(JSON.parse(stored)).toEqual({ enabled: false, volume: 0 });
  });

  it("never emits non-finite gain, even with invalid in-memory volume", () => {
    for (const value of [NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const weather of [0, 2]) {
        for (const night of [true, false]) {
          const gain = ambienceGain({ enabled: true, volume: value }, weather, night);
          expect(Number.isFinite(gain)).toBe(true);
          expect(gain).toBe(0);
        }
      }
    }
    expect(ambienceGain({ enabled: true, volume: 0.4 }, 2, false)).toBeCloseTo(0.18);
    expect(ambienceGain({ enabled: false, volume: 0.4 }, 2, false)).toBe(0);
  });
});
