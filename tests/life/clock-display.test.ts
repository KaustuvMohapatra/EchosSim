import { describe, expect, it } from "vitest";
import { dayCycleView, dayPeriod, minuteOfDay } from "../../apps/life/src/ui/models/townView.js";
import { formatClockMinute, formatSimMoment } from "../../apps/life/src/ui/models/personalLifeView.js";
import type { TimeInfo } from "@echosim/inspector";

describe("life clock presentation", () => {
  it("keeps the cycle marker bounded through invalid read-model timestamps", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(minuteOfDay(value)).toBe(0);
      expect(dayPeriod(value)).toBe("Night");
      const view = dayCycleView({ totalMinutes: value } as TimeInfo);
      expect(view.minuteOfDay).toBe(0);
      expect(view.dayProgress).toBe(0);
      expect(view.periods.filter((p) => p.active).map((p) => p.name)).toEqual(["Night"]);
    }
  });

  it("preserves the existing midnight wraparound for finite clocks", () => {
    expect(minuteOfDay(-1)).toBe(1439);
    expect(minuteOfDay(1440)).toBe(0);
    expect(dayCycleView({ totalMinutes: 720 } as TimeInfo).dayProgress).toBe(0.5);
  });

  it("keeps personal-life message/calendar times readable when timestamps are invalid", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(formatClockMinute(value)).toBe("00:00");
      expect(formatSimMoment(value, 600)).toBe("Time unavailable");
      expect(formatSimMoment(600, value)).toBe("Today · 10:00");
    }
    expect(formatClockMinute(-1)).toBe("23:59");
    expect(formatSimMoment(1440, 600)).toBe("Tomorrow · 00:00");
  });
});
