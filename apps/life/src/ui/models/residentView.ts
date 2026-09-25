import type {
  AgentInspectorSnapshot,
  AgentSummary,
  RelationshipSnapshot,
} from "@echosim/inspector";
import type {
  AutonomyMode, LifeResidentPresenceSummary,
} from "../../simulation/LifeModeAdapter.js";

export interface NeedView {
  key: string;
  /** 0 (satisfied) → 1 (critical): the bar fills toward pressure. */
  fill: number;
  level: "good" | "warn" | "critical";
}

export interface CharacterCardModel {
  name: string;
  money: number;
  mood: string;
  needs: NeedView[];
  locationName?: string;
}

export interface ResidentRailItem {
  id: string;
  name: string;
  initials: string;
  mood?: string;
  activity: string;
  location?: string;
  visibility: LifeResidentPresenceSummary["visibility"];
  controlled: boolean;
  household: boolean;
  selected: boolean;
  followed: boolean;
}

export interface AutonomyView {
  mode: AutonomyMode;
  label: string;
  description: string;
}

export function needViews(agent: AgentInspectorSnapshot): NeedView[] {
  return agent.needs.map((n) => ({
    key: n.name,
    fill: Math.max(0, Math.min(1, n.value / 100)),
    level: n.critical ? "critical" : n.value > 55 ? "warn" : "good",
  }));
}

/** Broad mood word derived from existing state — never a second emotion system. */
export function moodOf(agent: AgentInspectorSnapshot): string {
  const v = agent.emotionValence;
  if (agent.needs.some((n) => n.critical && n.kind === 1 /* Energy */))
    return "Exhausted";
  if (v <= -0.5) return "Angry";
  if (v <= -0.2) return "Tense";
  if (v < -0.05) return "Downbeat";
  if (v >= 0.45) return "Happy";
  if (v >= 0.15) {
    const fun = agent.needs.find((n) => n.name === "Fun");
    if (fun && fun.value > 60) return "Playful";
    return "Good";
  }
  const focusNeed = agent.needs.find((n) => n.name === "Comfort");
  if (focusNeed && focusNeed.value < 30) return "Focused";
  return "Fine";
}

export function moodOfSummary(agent: AgentSummary): string {
  const v = agent.emotionValence;
  if (v <= -0.5) return "Angry";
  if (v <= -0.2) return "Tense";
  if (v < -0.05) return "Downbeat";
  if (v >= 0.45) return "Happy";
  if (v >= 0.15) return "Good";
  return "Fine";
}

export function characterCard(agent: AgentInspectorSnapshot): CharacterCardModel {
  return {
    name: agent.summary.name,
    money: agent.money,
    mood: moodOf(agent),
    needs: needViews(agent),
    ...(agent.summary.locationName !== undefined
      ? { locationName: agent.summary.locationName } : {}),
  };
}

export function relevantNeeds(agent: AgentInspectorSnapshot, limit = 3): NeedView[] {
  const source = needViews(agent).map((view, index) => ({
    view,
    value: agent.needs[index]?.value ?? 0,
  }));
  return source
    .sort((a, b) => b.value - a.value || a.view.key.localeCompare(b.view.key))
    .slice(0, limit)
    .map((x) => x.view);
}

export function residentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts.at(-1)![0] ?? ""}`.toUpperCase();
}

const GOAL_LABELS: Readonly<Record<string, string>> = {
  goal_work: "At work",
  goal_eat: "Looking for food",
  goal_food: "Looking for food",
  goal_rest: "Resting",
  goal_sleep: "Resting",
  goal_social: "Looking for company",
  goal_fun: "Taking a break",
  goal_explore: "Out and about",
  goal_hygiene: "Taking care of themselves",
  goal_safety: "Seeking somewhere safe",
  goal_comfort: "Getting comfortable",
};

export function humanizeToken(value: string): string {
  const cleaned = value
    .replace(/^(goal_|act_|sim:)/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned[0]!.toUpperCase() + cleaned.slice(1);
}

export function readableActivity(agent: AgentSummary): string {
  if (agent.currentAction) return humanizeToken(agent.currentAction);
  if (agent.currentGoal) return GOAL_LABELS[agent.currentGoal] ?? humanizeToken(agent.currentGoal);
  return agent.status !== "Idle" ? humanizeToken(agent.status) : "No current action";
}

export function readableGoal(goal?: string): string {
  if (!goal) return "No current goal";
  return GOAL_LABELS[goal] ?? humanizeToken(goal);
}

export function cleanRelationshipLabel(label: string): string {
  switch (label) {
    case "CloseFriend": return "Close friend";
    case "Acquaintance": return "Acquaintance";
    case "Friend": return "Friend";
    case "Stranger": return "Stranger";
    case "Rival": return "Tense";
    case "Enemy": return "Tense";
    case "Crush": return "Crush";
    default: return humanizeToken(label);
  }
}

export function relationshipSummary(
  relationships: readonly RelationshipSnapshot[],
  targetId: string,
): string {
  const rel = relationships.find((r) => r.to === targetId);
  return rel ? cleanRelationshipLabel(rel.label) : "Stranger";
}

export function residentRailItem(
  agent: AgentSummary,
  flags: { controlled: boolean; household: boolean; selected: boolean; followed: boolean },
): ResidentRailItem {
  return {
    id: agent.id,
    name: agent.name,
    initials: residentInitials(agent.name),
    mood: moodOfSummary(agent),
    activity: readableActivity(agent),
    ...(agent.locationName ? { location: agent.locationName } : {}),
    visibility: "current",
    ...flags,
  };
}

export function residentRailItemFromPresence(
  presence: LifeResidentPresenceSummary,
  flags: { controlled: boolean; household: boolean; selected: boolean; followed: boolean },
): ResidentRailItem {
  if (presence.current) return residentRailItem(presence.current, flags);
  return {
    id: presence.id,
    name: presence.name,
    initials: residentInitials(presence.name),
    activity: presence.visibility === "last-known"
      ? `Last seen · ${presence.lastKnownLocationName ?? presence.lastKnownLocationId ?? "somewhere in town"}`
      : "Elsewhere in town",
    visibility: presence.visibility,
    ...flags,
  };
}

export function autonomyView(mode: AutonomyMode): AutonomyView {
  if (mode === "full-manual") {
    return { mode, label: "Manual", description: "You decide what they do." };
  }
  if (mode === "autonomous") {
    return { mode, label: "Autonomous", description: "They live their own life." };
  }
  return {
    mode,
    label: "Assisted",
    description: "They take care of themselves when you're not directing them.",
  };
}


/**
 * Stable rail ordering: the resident being played is always visible first,
 * followed by their household. Everyone else keeps simulation/authored order.
 */
export function orderResidentRail(items: readonly ResidentRailItem[]): ResidentRailItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      priority: item.controlled ? 0 : item.household ? 1 : 2,
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ item }) => item);
}
