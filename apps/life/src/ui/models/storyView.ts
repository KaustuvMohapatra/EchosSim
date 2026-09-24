import type { SimEventEntry } from "@echosim/inspector";
import type { LifeTownStorySummary } from "../../simulation/LifeModeAdapter.js";
import { humanizeToken } from "./residentView.js";

export type StoryTone = "quiet" | "social" | "warm" | "weather" | "conflict";

export interface StoryView {
  id: string;
  text: string;
  when: string;
  participants: readonly string[];
  tone: StoryTone;
  kind: "live" | "town";
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
  viewerId?: string,
): StoryView[] {
  const out: StoryView[] = [];
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const event = events[i]!;
    const story = eventToStory(event, nowMinutes, names, locations);
    if (!story) continue;
    if (viewerId && (event.kind === "social" || event.kind === "conversation") &&
        !story.participants.includes(viewerId)) continue;
    const key = `${event.atMinutes}|${story.text}`;
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
    tone: story.text.toLowerCase().includes("promoted") ? "warm" : "social",
    kind: "town" as const,
  }));
}

export function followedStories(
  stories: readonly StoryView[],
  followed: ReadonlySet<string>,
): StoryView[] {
  if (followed.size === 0) return [];
  return stories.filter((story) => story.participants.some((id) => followed.has(id)));
}
