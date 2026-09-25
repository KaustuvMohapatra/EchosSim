import type { SimEventEntry } from "@echosim/inspector";
import type {
  LifeObserverMomentSummary, LifeTownStorySummary,
} from "../../simulation/LifeModeAdapter.js";
import { humanizeToken } from "./residentView.js";

export type StoryTone = "quiet" | "social" | "warm" | "weather" | "conflict";
export type StoryCategory = LifeTownStorySummary["category"];

export interface StoryView {
  id: string;
  text: string;
  when: string;
  participants: readonly string[];
  tone: StoryTone;
  category: StoryCategory;
  kind: "live" | "town";
}

export interface StoryGroup {
  category: StoryCategory;
  label: string;
  stories: StoryView[];
}

function lookup(id: string | undefined, values: ReadonlyMap<string, string>): string {
  if (!id) return "Someone";
  return values.get(id) ?? humanizeToken(id);
}

export function relativeSimulationTime(nowMinutes: number, atMinutes: number): string {
  const delta = Math.max(0, nowMinutes - atMinutes);
  if (delta < 20) return "Just now";
  if (delta < 60) return `${delta} min ago`;
  if (delta < 360) return `${Math.floor(delta / 60)}h ago`;
  const days = Math.floor(delta / 1440);
  if (days === 0) return "Earlier today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function eventActorIds(event: SimEventEntry): string[] {
  const ids = new Set<string>();
  if (event.agent) ids.add(event.agent);
  if (event.kind === "conversation") {
    const match = event.text.match(/\]\s*([^→]+)→([^:]+):/);
    if (match?.[1]) ids.add(match[1].trim());
    if (match?.[2]) ids.add(match[2].trim());
  } else if (event.kind === "social") {
    const actorPart = event.text.split(" — ")[0] ?? "";
    for (const actor of actorPart.split(" & ").map((x) => x.trim()).filter(Boolean))
      ids.add(actor);
  }
  return [...ids];
}

function socialSentence(event: SimEventEntry, names: ReadonlyMap<string, string>): string {
  const actorIds = eventActorIds(event);
  const actorNames = actorIds.map((id) => lookup(id, names));
  const action = event.type.replace(/^sim:/, "").toLowerCase();
  if (actorNames.length >= 2) {
    const [a, b] = actorNames;
    switch (action) {
      case "greet": return `${a} greeted ${b}.`;
      case "chat": return `${a} talked with ${b}.`;
      case "compliment": return `${a} complimented ${b}.`;
      case "tease": return `${a} teased ${b}.`;
      case "help": return `${a} helped ${b}.`;
      case "apologize": return `${a} apologized to ${b}.`;
      case "insult": return `${a} insulted ${b}.`;
    }
  }
  const who = actorNames.length > 0 ? actorNames.join(" and ") : "Around town";
  return `${who}: ${humanizeToken(action)}.`;
}

export function eventToStory(
  event: SimEventEntry,
  nowMinutes: number,
  names: ReadonlyMap<string, string>,
  locations: ReadonlyMap<string, string>,
): StoryView | null {
  const participants = eventActorIds(event);
  if (event.kind === "movement" && event.agent && event.location) {
    return {
      id: `event-${event.seq}`,
      text: `${lookup(event.agent, names)} arrived at ${lookup(event.location, locations)}.`,
      when: relativeSimulationTime(nowMinutes, event.atMinutes),
      participants,
      tone: "quiet",
      category: "town",
      kind: "live",
    };
  }

  if (event.kind === "conversation") {
    const match = event.text.match(/\]\s*([^→]+)→([^:]+):/);
    const first = match?.[1]?.trim() ?? event.agent;
    const second = match?.[2]?.trim();
    return {
      id: `event-${event.seq}`,
      text: second
        ? `${lookup(first, names)} and ${lookup(second, names)} started talking.`
        : `${lookup(event.agent, names)} started a conversation.`,
      when: relativeSimulationTime(nowMinutes, event.atMinutes),
      participants,
      tone: "social",
      category: "social",
      kind: "live",
    };
  }

  if (event.kind === "social") {
    const lower = event.type.toLowerCase();
    const conflict = lower.includes("insult") || lower.includes("tease") || lower.includes("apolog");
    return {
      id: `event-${event.seq}`,
      text: socialSentence(event, names),
      when: relativeSimulationTime(nowMinutes, event.atMinutes),
      participants,
      tone: conflict ? "conflict" : "social",
      category: "social",
      kind: "live",
    };
  }

  if (event.kind === "weather") {
    const transition = event.text.replace(/^Weather:\s*/, "").replace("→", "to");
    return {
      id: `event-${event.seq}`,
      text: `The weather changed: ${transition}.`,
      when: relativeSimulationTime(nowMinutes, event.atMinutes),
      participants: [],
      tone: "weather",
      category: "town",
      kind: "live",
    };
  }

  return null;
}

export function liveStories(
  events: readonly SimEventEntry[],
  nowMinutes: number,
  names: ReadonlyMap<string, string>,
  locations: ReadonlyMap<string, string>,
  limit = 12,
  viewer?: { id: string; locationId?: string },
): StoryView[] {
  const out: StoryView[] = [];
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const event = events[i]!;
    const story = eventToStory(event, nowMinutes, names, locations);
    if (!story) continue;
    if (viewer) {
      if ((event.kind === "social" || event.kind === "conversation") &&
          !story.participants.includes(viewer.id)) continue;
      if (event.kind === "movement" && event.agent !== viewer.id &&
          event.location !== viewer.locationId) continue;
    }
    const key = `${event.atMinutes}|${story.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(story);
  }
  return out;
}

export function observerMomentToStory(
  moment: LifeObserverMomentSummary,
  nowMinutes: number,
  names: ReadonlyMap<string, string>,
  locations: ReadonlyMap<string, string>,
): StoryView {
  const participants = [...moment.participants];
  if (moment.kind === "movement") {
    const actor = participants[0];
    return {
      id: moment.id,
      text: `${lookup(actor, names)} arrived at ${lookup(moment.locationId, locations)}.`,
      when: relativeSimulationTime(nowMinutes, moment.atMinutes),
      participants,
      tone: "quiet",
      category: "town",
      kind: "live",
    };
  }

  if (moment.kind === "weather") {
    const transition = (moment.detail ?? humanizeToken(moment.eventType))
      .replace(/^Weather:\s*/, "").replace("→", "to");
    return {
      id: moment.id,
      text: `The weather changed: ${transition}.`,
      when: relativeSimulationTime(nowMinutes, moment.atMinutes),
      participants: [],
      tone: "weather",
      category: "town",
      kind: "live",
    };
  }

  const actorNames = participants.map((id) => lookup(id, names));
  const action = moment.eventType.replace(/^sim:/, "").replace(/_rejected$/, "").toLowerCase();
  let text: string;
  if (actorNames.length >= 2) {
    const [a, b] = actorNames;
    switch (action) {
      case "greeting": text = `${a} greeted ${b}.`; break;
      case "chat": text = `${a} talked with ${b}.`; break;
      case "compliment": text = `${a} complimented ${b}.`; break;
      case "tease": text = `${a} teased ${b}.`; break;
      case "help": text = `${a} helped ${b}.`; break;
      case "apologize": text = `${a} apologized to ${b}.`; break;
      case "insult":
      case "insult_incident": text = `${a} insulted ${b}.`; break;
      default: text = `${a} and ${b}: ${humanizeToken(action)}.`; break;
    }
  } else {
    text = `${actorNames[0] ?? "Someone"}: ${humanizeToken(action)}.`;
  }
  const conflict = action.includes("insult") || action.includes("tease") ||
    action.includes("confront") || action.includes("apolog");
  return {
    id: moment.id,
    text,
    when: relativeSimulationTime(nowMinutes, moment.atMinutes),
    participants,
    tone: conflict ? "conflict" : "social",
    category: "social",
    kind: "live",
  };
}

export function observerMomentStories(
  moments: readonly LifeObserverMomentSummary[],
  nowMinutes: number,
  names: ReadonlyMap<string, string>,
  locations: ReadonlyMap<string, string>,
  limit = 12,
): StoryView[] {
  const seen = new Set<string>();
  const out: StoryView[] = [];
  for (let i = moments.length - 1; i >= 0 && out.length < limit; i--) {
    const story = observerMomentToStory(moments[i]!, nowMinutes, names, locations);
    const key = `${moments[i]!.atMinutes}|${story.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(story);
  }
  return out;
}

export function townStoryViews(
  stories: readonly LifeTownStorySummary[],
  currentDay: number,
): StoryView[] {
  return [...stories].reverse().map((story) => ({
    id: `town-${story.id}`,
    text: story.text,
    when: story.day === currentDay ? "Today"
      : story.day === currentDay - 1 ? "Yesterday"
      : `Day ${story.day + 1}`,
    participants: [...story.participants],
    tone: story.category === "careers" ? "warm"
      : story.category === "town" ? "quiet"
      : "social",
    category: story.category,
    kind: "town" as const,
  }));
}

const STORY_GROUPS: ReadonlyArray<{ category: StoryCategory; label: string }> = [
  { category: "relationships", label: "Relationships" },
  { category: "careers", label: "Careers" },
  { category: "social", label: "Social life" },
  { category: "town", label: "Town life" },
];

export function groupTownStories(stories: readonly StoryView[]): StoryGroup[] {
  return STORY_GROUPS.flatMap(({ category, label }) => {
    const matching = stories.filter((story) => story.category === category);
    return matching.length > 0 ? [{ category, label, stories: matching }] : [];
  });
}

export function followedStories(
  stories: readonly StoryView[],
  followed: ReadonlySet<string>,
): StoryView[] {
  if (followed.size === 0) return [];
  return stories.filter((story) => story.participants.some((id) => followed.has(id)));
}
