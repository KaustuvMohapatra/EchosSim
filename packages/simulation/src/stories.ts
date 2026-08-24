/**
 * Town stories (Sprints 54–55): human-readable neighbourhood feed generated
 * from milestone events (promotions, friendships, invitations). Visibility is
 * knowledge-filtered: the player sees a story when they participate or share
 * a group with a participant.
 */
import type { Town } from "@echosim/simulation";

export interface Story {
  id: number;
  day: number;
  text: string;
  participants: readonly string[];
}

export class TownStories {
  private readonly stories: Story[] = [];
  private nextId = 1;
  private seenFriendPairs = new Set<string>();

  constructor(private readonly town: Town) {
    town.events.subscribe<{ agent: string; toTitle: string }>(
      "sim:promoted", (e) => this.add(
        [e.agent],
        `${nameOf(town, e.agent)} was promoted to ${e.toTitle}.`));

    town.events.subscribe<{ a: string; b: string }>(
      "sim:friendship-formed", (e) => this.add(
        [e.a, e.b],
        `${nameOf(town, e.a)} and ${nameOf(town, e.b)} became close friends.`));

    town.events.subscribe<{ from: string; to: string; activityLabel: string }>(
      "sim:invitation", (e) => this.add(
        [e.from, e.to],
        `${nameOf(town, e.from)} invited ${nameOf(town, e.to)} out for ${e.activityLabel}.`,
        { soft: true }));
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

  private add(participants: readonly string[], text: string,
    opts: { soft?: boolean } = {}): void {
    if (opts.soft && Math.random !== undefined) {
      // Deterministic: invitation stories are low-priority; keep all for now
      // but mark nothing special — kept simple for v0.2.
    }
    const day = Math.floor(this.town.clock.currentTime.totalMinutes / 1440);
    this.stories.push({ id: this.nextId++, day, text, participants: [...participants] });
    if (this.stories.length > 200) this.stories.shift();
  }

  /** Stories visible to the viewer: participation or shared group. */
  visibleTo(viewerId: string): Story[] {
    return this.stories.filter((s) => {
      if (s.participants.includes(viewerId)) return true;
      return s.participants.some((p) =>
        this.town.groups.sharedGroups(viewerId, p).length > 0);
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

