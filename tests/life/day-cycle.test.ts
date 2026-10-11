import { describe, expect, it } from "vitest";
import type { TimeInfo } from "@echosim/inspector";
import { dayCycleView, dayPeriod, minuteOfDay } from "../../apps/life/src/ui/models/townView.js";

const viewAt = (minutes: number) =>
  dayCycleView({ totalMinutes: minutes } as TimeInfo);

describe("Day Cycle dawn-to-dawn timeline", () => {
  it("keeps Night as one continuous final segment through midnight", () => {
    const beforeMidnight = viewAt(23 * 60 + 59);
    const midnight = viewAt(1440);
    const beforeDawn = viewAt(1440 + 359);
    for (const view of [beforeMidnight, midnight, beforeDawn]) {
      expect(view.current).toBe("Night");
      expect(view.periods.filter((p) => p.active).map((p) => p.name)).toEqual(["Night"]);
    }
    expect(beforeMidnight.dayProgress).toBeLessThan(midnight.dayProgress);
    expect(midnight.dayProgress).toBeLessThan(beforeDawn.dayProgress);
    expect(viewAt(1440 + 360).dayProgress).toBe(0);
    expect(viewAt(1440 + 360).current).toBe("Morning");
  });

  it("aligns the progress marker with the actual period boundaries", () => {
    const boundaries = [
      [360, "Morning", 0],
      [720, "Afternoon", 360 / 1440],
      [1020, "Evening", 660 / 1440],
      [1260, "Night", 900 / 1440],
      [1440, "Night", 1080 / 1440],
    ] as const;
    for (const [minute, expected, progress] of boundaries) {
      expect(viewAt(minute).current).toBe(expected);
      expect(viewAt(minute).dayProgress).toBeCloseTo(progress);
    }
  });

  it("gives timeline segments their actual relative durations", () => {
    const segments = viewAt(360).periods;
    expect(segments.map((p) => p.name)).toEqual([
      "Morning", "Afternoon", "Evening", "Night",
    ]);
    expect(segments.map((p) => p.widthPercent)).toEqual([
      25, 300 / 1440 * 100, 240 / 1440 * 100, 37.5,
    ]);
    expect(segments.reduce((sum, p) => sum + p.widthPercent, 0)).toBeCloseTo(100);
  });

  it("preserves daily and negative-minute wraparound", () => {
    for (const minute of [0, 359, 360, 720, 1020, 1260, 1439]) {
      expect(dayPeriod(minute - 1440)).toBe(dayPeriod(minute));
      expect(minuteOfDay(minute - 1440)).toBe(minute);
      expect(viewAt(minute - 1440).dayProgress).toBe(viewAt(minute).dayProgress);
    }
  });
});
