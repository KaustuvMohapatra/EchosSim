import type { AgentSummary, TimeInfo } from "@echosim/inspector";

export type DayPeriodName = "Morning" | "Afternoon" | "Evening" | "Night";

export interface DayPeriodView {
  name: DayPeriodName;
  tagline: string;
  active: boolean;
}

export interface DayCycleView {
  current: DayPeriodName;
  tagline: string;
  dayProgress: number;
  minuteOfDay: number;
  periods: readonly DayPeriodView[];
}

const PERIODS: readonly { name: DayPeriodName; start: number; end: number; tagline: string }[] = [
  { name: "Morning", start: 360, end: 720, tagline: "Things begin" },
  { name: "Afternoon", start: 720, end: 1020, tagline: "Lives unfold" },
  { name: "Evening", start: 1020, end: 1260, tagline: "Town comes together" },
  { name: "Night", start: 1260, end: 1800, tagline: "Stories continue" },
];

export function minuteOfDay(totalMinutes: number): number {
  return ((totalMinutes % 1440) + 1440) % 1440;
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
  return {
    current,
    tagline: period.tagline,
    minuteOfDay: minute,
    dayProgress: minute / 1440,
    periods: PERIODS.map((p) => ({
      name: p.name,
      tagline: p.tagline,
      active: p.name === current,
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
