/**
 * Town stories (Sprints 54–55): human-readable neighbourhood feed generated
 * from milestone events. Each story carries an explicit category and
 * visibility policy so presentation never has to infer semantics from prose.
 */
import type { Town } from "./town.js";

export type StoryCategory = "relationships" | "careers" | "social" | "town";
export type StoryVisibility = "participants" | "shared-groups";

export interface Story {
  id: number;
  day: number;
  text: string;
  participants: readonly string[];
  category: StoryCategory;
  visibility: StoryVisibility;
}

export class TownStories {
  private readonly stories: Story[] = [];
  private nextId = 1;
  private seenFriendPairs = new Set<string>();

  constructor(private readonly town: Town) {
    town.events.subscribe<{ agent: string; toTitle: string }>(
      "sim:promoted", (e) => this.add(
        [e.agent],
        `${nameOf(town, e.agent)} was promoted to ${e.toTitle}.`,
        "careers"));

    town.events.subscribe<{ a: string; b: string }>(
      "sim:friendship-formed", (e) => this.add(
        [e.a, e.b],
        `${nameOf(town, e.a)} and ${nameOf(town, e.b)} became friends.`,
        "relationships"));

    town.events.subscribe<{ from: string; to: string; activityLabel: string }>(
      "sim:invitation", (e) => this.add(
        [e.from, e.to],
        `${nameOf(town, e.from)} invited ${nameOf(town, e.to)} out for ${e.activityLabel}.`,
        "social",
        "participants"));
  }

  /** Social wire calls this after each relationship update. */
  noteFriendship(a: string, b: string, label: string): void {
    const strong = label === "CloseFriend";
    if (!strong && label !== "Friend") return;
    const key = pairKey(a, b);
    if (this.seenFriendPairs.has(key)) return;
    // Only announce genuine Friend-tier formations once per pair.
    if (label === "Friend") {
      this.seenFriendPairs.add(key);
      this.town.events.publish("sim:friendship-formed", { a, b });
    }
  }

  private add(
    participants: readonly string[],
    text: string,
    category: StoryCategory,
    visibility: StoryVisibility = "shared-groups",
  ): void {
    const day = Math.floor(this.town.clock.currentTime.totalMinutes / 1440);
    this.stories.push({
      id: this.nextId++,
      day,
      text,
      participants: [...participants],
      category,
      visibility,
    });
    if (this.stories.length > 200) this.stories.shift();
  }

  /**
   * Knowledge-filtered stories. Participant-only stories (for example private
   * invitations) never spread merely because a viewer shares a household,
   * workplace or club with one of the participants.
   */
  visibleTo(viewerId: string): Story[] {
    return this.stories.filter((story) => {
      if (story.participants.includes(viewerId)) return true;
      if (story.visibility === "participants") return false;
      return story.participants.some((participant) =>
        this.town.groups.sharedGroups(viewerId, participant).length > 0);
    });
  }

  all(): readonly Story[] { return [...this.stories]; }
}

function nameOf(town: Town, agentId: string): string {
  return town.residents.tryMind(agentId)?.displayName ?? agentId;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

