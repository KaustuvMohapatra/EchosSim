import { describe, expect, it } from "vitest";
import { daylightParams } from "../../apps/life/src/world/daylight.js";

describe("Life time-of-day lighting continuity", () => {
  it("wraps clock values without changing the lighting", () => {
    for (const minute of [0, 315, 360, 720, 1200, 1439]) {
      expect(daylightParams(minute)).toEqual(daylightParams(minute + 1440));
      expect(daylightParams(minute)).toEqual(daylightParams(minute - 1440));
    }
  });

  it("keeps sunrise and sunset smooth with no single-minute flash", () => {
    for (const transition of [360, 1200]) {
      const before = daylightParams(transition - 1);
      const after = daylightParams(transition + 1);
      expect(Math.abs(before.sunIntensity - after.sunIntensity)).toBeLessThan(0.03);
      expect(Math.abs(before.hemiIntensity - after.hemiIntensity)).toBeLessThan(0.03);
      expect(Math.abs(before.nightFactor - after.nightFactor)).toBeLessThan(0.03);
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(before.sunColor[channel]! - after.sunColor[channel]!)).toBeLessThan(0.04);
      }
    }
  });

  it("has stable nighttime values and bright midday values", () => {
    const midnight = daylightParams(0);
    const midday = daylightParams(780);
    expect(midnight.elevation).toBe(0);
    expect(midnight.sunIntensity).toBeCloseTo(0.12);
    expect(midnight.hemiIntensity).toBeCloseTo(0.28);
    expect(midnight.nightFactor).toBe(1);
    expect(midday.elevation).toBeCloseTo(1);
    expect(midday.sunIntensity).toBeGreaterThan(midnight.sunIntensity);
    expect(midday.hemiIntensity).toBeGreaterThan(midnight.hemiIntensity);
    expect(midday.nightFactor).toBeCloseTo(0);
  });

  it("keeps all lighting values finite and within physical display ranges", () => {
    for (let minute = -1440; minute <= 2880; minute += 5) {
      const light = daylightParams(minute);
      expect(light.elevation).toBeGreaterThanOrEqual(0);
      expect(light.elevation).toBeLessThanOrEqual(1);
      expect(light.nightFactor).toBeGreaterThanOrEqual(0);
      expect(light.nightFactor).toBeLessThanOrEqual(1);
      expect(light.sunIntensity).toBeGreaterThanOrEqual(0.12);
      expect(light.hemiIntensity).toBeGreaterThanOrEqual(0.28);
      for (const channel of light.sunColor) {
        expect(Number.isFinite(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
    expect(() => daylightParams(Number.NaN)).toThrow(RangeError);
    expect(() => daylightParams(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
