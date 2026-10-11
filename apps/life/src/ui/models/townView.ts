import type { AgentSummary, TimeInfo } from "@echosim/inspector";

export type DayPeriodName = "Morning" | "Afternoon" | "Evening" | "Night";

export interface DayPeriodView {
  name: DayPeriodName;
  tagline: string;
  active: boolean;
  /** Width of this period relative to a full simulated day. */
  widthPercent: number;
}

export interface DayCycleView {
  current: DayPeriodName;
  tagline: string;
  dayProgress: number;
  minuteOfDay: number;
  periods: readonly DayPeriodView[];
}

/**
 * The visual timeline begins at 06:00, the start of Morning, instead of
 * midnight. This keeps Night continuous across 00:00 until the next sunrise.
 * Durations sum to exactly one simulated day.
 */
const PERIODS: readonly { name: DayPeriodName; minutes: number; tagline: string }[] = [
  { name: "Morning", minutes: 360, tagline: "Things begin" },
  { name: "Afternoon", minutes: 300, tagline: "Lives unfold" },
  { name: "Evening", minutes: 240, tagline: "Town comes together" },
  { name: "Night", minutes: 540, tagline: "Stories continue" },
];
const MINUTES_PER_DAY = 1440;
const TIMELINE_START_MINUTE = 360;

export function minuteOfDay(totalMinutes: number): number {
  if (!Number.isFinite(totalMinutes)) return 0;
  return ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function dayPeriod(totalMinutes: number): DayPeriodName {
  const minute = minuteOfDay(totalMinutes);
  if (minute >= 360 && minute < 720) return "Morning";
  if (minute >= 720 && minute < 1020) return "Afternoon";
  if (minute >= 1020 && minute < 1260) return "Evening";
  return "Night";
}

export function dayCycleView(time: TimeInfo): DayCycleView {
  const minute = minuteOfDay(time.totalMinutes);
  const current = dayPeriod(time.totalMinutes);
  const period = PERIODS.find((p) => p.name === current)!;
  const validTime = Number.isFinite(time.totalMinutes);
  return {
    current,
    tagline: period.tagline,
    minuteOfDay: minute,
    // Dawn-to-dawn timeline: a single Night segment spans midnight.
    dayProgress: validTime ? minuteOfDay(minute - TIMELINE_START_MINUTE) / MINUTES_PER_DAY : 0,
    periods: PERIODS.map((p) => ({
      name: p.name,
      tagline: p.tagline,
      active: p.name === current,
      widthPercent: p.minutes / MINUTES_PER_DAY * 100,
    })),
  };
}

export function weatherLabel(weather: string): string {
  switch (weather) {
    case "Clear": return "Clear skies";
    case "Cloudy": return "Cloudy";
    case "Rain": return "Rain";
    case "HeavyRain": return "Heavy rain";
    default: return weather;
  }
}

export function residentCountsByLocation(
  agents: readonly Pick<AgentSummary, "locationId">[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    if (!agent.locationId) continue;
    counts.set(agent.locationId, (counts.get(agent.locationId) ?? 0) + 1);
  }
  return counts;
}
