import { describe, expect, it } from "vitest";
import { relativeSimulationTime } from "../../apps/life/src/ui/models/storyView.js";

describe("relativeSimulationTime", () => {
  it("shows elapsed simulation time in whole minutes", () => {
    expect(relativeSimulationTime(530.9, 510.1)).toBe("20 min ago");
    expect(relativeSimulationTime(550.9, 510.1)).toBe("40 min ago");
    expect(relativeSimulationTime(570.9, 510.1)).toBe("1h ago");
  });

  it("preserves age thresholds and rounds down fractional differences", () => {
    expect(relativeSimulationTime(519.99, 500)).toBe("Just now");
    expect(relativeSimulationTime(520, 500)).toBe("20 min ago");
    expect(relativeSimulationTime(560, 500)).toBe("1h ago");
    expect(relativeSimulationTime(860, 500)).toBe("Earlier today");
    expect(relativeSimulationTime(1940, 500)).toBe("Yesterday");
    expect(relativeSimulationTime(3380, 500)).toBe("2 days ago");
  });

  it("does not show invalid or future timestamps", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(relativeSimulationTime(invalid, 500)).toBe("Just now");
      expect(relativeSimulationTime(500, invalid)).toBe("Just now");
    }
    expect(relativeSimulationTime(400, 500)).toBe("Just now");
    // Extreme finite input pairs can overflow during subtraction.
    expect(relativeSimulationTime(Number.MAX_VALUE, -Number.MAX_VALUE)).toBe("Just now");
  });
});
