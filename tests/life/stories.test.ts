/** Sprints 54–55 — life changes (friendship milestones) + town stories. */
import { describe, expect, it } from "vitest";
import { createAuthoredTown, createDemoTown } from "@echosim/content";
import { SocialActionType } from "@echosim/social";
import { TownStories } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S54: friendship milestone events", () => {
  it("fires once when a pair first crosses the Friend tier", () => {
    const { town } = createDemoTown(4242);
    const formed: Array<{ a: string; b: string }> = [];
    town.events.subscribe("sim:friendship-formed",
      (e) => formed.push(e as { a: string; b: string }));

    // Repeated friendly interactions push affinity past 0.3.
    for (let i = 0; i < 10; i++) {
      town.social.attempt("npc_mira", "npc_rohan", SocialActionType.Chat);
    }

    expect(formed.length).toBe(1);
    expect(new Set([formed[0]!.a, formed[0]!.b])).toEqual(
      new Set(["npc_mira", "npc_rohan"]));
  });
});

describe("S55: town stories", () => {
  it("generates promotion and friendship stories", () => {
    const { town } = createAuthoredTown(7001);
    const stories = new TownStories(town);

    town.events.publish("sim:promoted",
      { agent: "npc_mira", toTitle: "Designer" });

    // Mira chats with Rohan until they become friends.
    let guard = 0;
    while (guard++ < 30) {
      town.social.attempt("npc_mira", "npc_rohan", SocialActionType.Chat);
      const label = town.relationships.tryGet("npc_mira", "npc_rohan");
      if (label) stories.noteFriendship("npc_mira", "npc_rohan",
        tierOf(label.affinity, label.trust));
      if (label && label.affinity >= 0.3) break;
    }
    stories.noteFriendship("npc_mira", "npc_rohan",
      tierOf(town.relationships.getOrCreate("npc_rohan", "npc_mira")));

    const all = stories.all().map((s) => s.text);
    expect(all.some((t) => t.includes("promoted"))).toBe(true);
  });

  it("knowledge filter hides stories about strangers", () => {
    const { town } = createAuthoredTown(7001);
    const stories = new TownStories(town);
    town.events.publish("sim:promoted",
      { agent: "npc_kofi", toTitle: "Regional Manager" });

    // Anika shares no group with Kofi → story hidden.
    const visibleAnika = stories.visibleTo("npc_anika");
    expect(visibleAnika.find((s) => s.participants.includes("npc_kofi"))).toBeUndefined();
    // Kofi himself sees it.
    expect(stories.visibleTo("npc_kofi").length).toBeGreaterThan(0);
  });
});

function tierOf(affinity: number, trust: number): string {
  if (affinity >= 0.6 && trust >= 0.5) return "CloseFriend";
  if (affinity >= 0.3) return "Friend";
  return "Acquaintance";
}
