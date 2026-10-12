import type { LifeSkillSummary } from "../../simulation/LifeModeAdapter.js";

export function formatClockMinute(minuteOfDay: number): string {
  const safeMinute = Number.isFinite(minuteOfDay) ? Math.floor(minuteOfDay) : 0;
  const normalized = ((safeMinute % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatSimMoment(atMinutes: number, nowMinutes: number): string {
  if (!Number.isFinite(atMinutes)) return "Time unavailable";
  const day = Math.floor(atMinutes / 1440);
  const nowDay = Number.isFinite(nowMinutes) ? Math.floor(nowMinutes / 1440) : day;
  const clock = formatClockMinute(atMinutes);
  if (day === nowDay) return `Today · ${clock}`;
  if (day === nowDay + 1) return `Tomorrow · ${clock}`;
  return `Day ${day + 1} · ${clock}`;
}

/** Presentation fallback for invalid read-model progress. */
function boundedProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function careerRequirementProgress(
  current: number,
  required: number | undefined,
): number {
  if (required === undefined) return 1;
  if (!Number.isFinite(required) || !Number.isFinite(current)) return 0;
  if (required <= 0) return 1;
  return boundedProgress(current / required);
}

export function skillProgress(skill: LifeSkillSummary): number {
  if (skill.nextLevelXp === undefined) return 1;
  const { xp, levelFloorXp, nextLevelXp } = skill;
  if (![xp, levelFloorXp, nextLevelXp].every(Number.isFinite)) return 0;
  const span = nextLevelXp - levelFloorXp;
  if (!Number.isFinite(span) || span <= 0) return 1;
  return boundedProgress((xp - levelFloorXp) / span);
}


export function intentionText(
  kind: "befriend" | "repair" | "avoid",
  subjectName: string,
): string {
  switch (kind) {
    case "befriend": return `Get closer to ${subjectName}`;
    case "repair": return `Repair things with ${subjectName}`;
    case "avoid": return `Keep some distance from ${subjectName}`;
  }
}

export function habitText(
  behavior: string,
  targetName: string,
  repetitionCount: number,
): string {
  if (behavior === "visit")
    return repetitionCount >= 6 ? `Regularly visits ${targetName}` : `Often visits ${targetName}`;
  const readable = behavior.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${readable}: ${targetName}`;
}

export function intentionStrengthLabel(strength: number): string {
  if (strength >= 0.65) return "Strong intention";
  if (strength >= 0.45) return "Growing intention";
  return "Background intention";
}
