import { describe, expect, it } from "vitest";
import { PersonalityProfile } from "@echosim/cognition";
import type { AgentSummary, SimEventEntry } from "@echosim/inspector";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import {
  autonomyView, orderResidentRail, readableActivity,
  residentRailItem, residentRailItemFromPresence,
} from "../../apps/life/src/ui/models/residentView.js";
import {
  dayPeriod, residentCountsByLocation,
} from "../../apps/life/src/ui/models/townView.js";
import {
  eventToStory, groupTownStories, liveStories, townStoryViews,
} from "../../apps/life/src/ui/models/storyView.js";
import {
  formatClockMinute, formatSimMoment, habitText,
  intentionStrengthLabel, intentionText, skillProgress,
} from "../../apps/life/src/ui/models/personalLifeView.js";

describe("Life UI presentation models", () => {
  it("derives the day period from simulation minutes", () => {
    expect(dayPeriod(5 * 60 + 59)).toBe("Night");
    expect(dayPeriod(6 * 60)).toBe("Morning");
    expect(dayPeriod(12 * 60)).toBe("Afternoon");
    expect(dayPeriod(17 * 60)).toBe("Evening");
    expect(dayPeriod(21 * 60)).toBe("Night");
  });

  it("counts map presence from resident summaries without inventing occupancy", () => {
    const counts = residentCountsByLocation([
      { locationId: "cafe" }, { locationId: "cafe" },
      { locationId: "park" }, {},
    ]);
    expect([...counts.entries()]).toEqual([["cafe", 2], ["park", 1]]);
  });

  it("maps real resident state into rail identity without inventing activity", () => {
    const summary: AgentSummary = {
      id: "mira",
      name: "Mira",
      locationId: "studio",
      locationName: "Studio",
      currentGoal: "goal_work",
      status: "Running",
      emotionValence: 0.3,
    };
    expect(readableActivity(summary)).toBe("At work");
    expect(residentRailItem(summary, {
      controlled: true, household: true, selected: false, followed: false,
    })).toMatchObject({
      id: "mira", mood: "Good", activity: "At work",
      controlled: true, household: true, selected: false,
    });
  });

  it("keeps remote resident presence knowledge-scoped", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });

    const initialMira = adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_mira");
    expect(initialMira?.visibility).toBe("unknown");
    expect(adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_anika")?.visibility).toBe("current");

    adapter.town.moveAgent("player" as never, "park" as never);
    adapter.town.moveAgent("npc_mira" as never, "park" as never);
    expect(adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_mira")).toMatchObject({
        visibility: "current",
        current: expect.objectContaining({ locationId: "park" }),
      });

    adapter.town.moveAgent("npc_mira" as never, "apt_a" as never);
    const lastKnownMira = adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_mira")!;
    expect(lastKnownMira).toMatchObject({
      visibility: "last-known",
      lastKnownLocationId: "park",
    });
    const rail = residentRailItemFromPresence(lastKnownMira, {
      controlled: false, household: false, selected: false, followed: false,
    });
    expect(rail.mood).toBeUndefined();
    expect(rail.activity).toContain("Last seen");
    adapter.dispose();
  });

  it("keeps the controlled resident and household at the front of a large rail", () => {
    const base = {
      initials: "AA", mood: "Fine", activity: "Idle",
      selected: false, followed: false,
    };
    const ordered = orderResidentRail([
      { ...base, id: "npc_a", name: "A", controlled: false, household: false },
      { ...base, id: "npc_b", name: "B", controlled: false, household: true },
      { ...base, id: "player", name: "You", controlled: true, household: true },
      { ...base, id: "npc_c", name: "C", controlled: false, household: true },
      { ...base, id: "npc_d", name: "D", controlled: false, household: false },
    ]);
    expect(ordered.map((resident) => resident.id)).toEqual([
      "player", "npc_b", "npc_c", "npc_a", "npc_d",
    ]);
  });

  it("keeps autonomy labels friendly while preserving exact modes", () => {
    expect(autonomyView("full-manual")).toEqual({
      mode: "full-manual", label: "Manual", description: "You decide what they do.",
    });
    expect(autonomyView("assisted").description).toContain("take care of themselves");
    expect(autonomyView("autonomous")).toMatchObject({
      mode: "autonomous", label: "Autonomous",
    });
  });

  it("turns journal movement into readable town activity using read-model names", () => {
    const event: SimEventEntry = {
      seq: 7, atMinutes: 500, kind: "movement", type: "sim:agent-moved",
      agent: "mira", location: "cafe", text: "mira arrived at cafe",
    };
    const story = eventToStory(
      event, 525,
      new Map([["mira", "Mira"]]),
      new Map([["cafe", "Maple & Bean"]]),
    );
    expect(story?.text).toBe("Mira arrived at Maple & Bean.");
    expect(story?.when).toBe("25 min ago");
    expect(story?.participants).toEqual(["mira"]);
  });

  it("does not leak omniscient movement events into the Life observer", () => {
    const events: SimEventEntry[] = [
      { seq: 1, atMinutes: 500, kind: "movement", type: "sim:agent-moved",
        agent: "mira", location: "cafe", text: "mira arrived at cafe" },
      { seq: 2, atMinutes: 510, kind: "movement", type: "sim:agent-moved",
        agent: "rohan", location: "library", text: "rohan arrived at library" },
    ];
    const stories = liveStories(
      events, 525,
      new Map([["mira", "Mira"], ["rohan", "Rohan"]]),
      new Map([["cafe", "Cafe"], ["library", "Library"]]),
      12, { id: "player", locationId: "cafe" },
    );
    expect(stories.map((story) => story.text)).toEqual(["Mira arrived at Cafe."]);
  });

  it("formats personal-life dates from simulation time only", () => {
    expect(formatClockMinute(9 * 60 + 5)).toBe("09:05");
    expect(formatSimMoment(600, 500)).toBe("Today · 10:00");
    expect(formatSimMoment(1440 + 75, 500)).toBe("Tomorrow · 01:15");
    expect(skillProgress({
      name: "Cooking", xp: 25, level: 1, levelFloorXp: 10, nextLevelXp: 40,
    })).toBeCloseTo(0.5);
    expect(intentionText("repair", "Mira")).toBe("Repair things with Mira");
    expect(intentionStrengthLabel(0.7)).toBe("Strong intention");
    expect(habitText("visit", "Maple & Bean", 4)).toBe("Often visits Maple & Bean");
  });

  it("keeps phone messages resident-scoped and skill state simulation-backed", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    expect(adapter.sendMessage("player", "npc_mira", "Coffee later?")).toBe(true);
    expect(adapter.town.messages.between("player", "npc_mira")).toHaveLength(1);

    const playerLife = adapter.personalLifeFor("player")!;
    const miraLife = adapter.personalLifeFor("npc_mira")!;
    const rohanLife = adapter.personalLifeFor("npc_rohan")!;
    expect(playerLife.messages).toHaveLength(1);
    expect(miraLife.messages).toHaveLength(1);
    expect(rohanLife.messages).toHaveLength(0);

    adapter.town.skills.award("player", "Cooking", 12);
    const cooking = adapter.personalLifeFor("player")!.skills
      .find((skill) => skill.name === "Cooking");
    expect(cooking).toMatchObject({
      xp: 12, level: 1, levelFloorXp: 10, nextLevelXp: 40,
    });
    expect(playerLife.households.some((household) =>
      household.members.some((member) => member.id === "player"))).toBe(true);

    const rel = adapter.town.relationships.getOrCreate("player", "npc_mira");
    rel.affinity = 0.7;
    const invitation = adapter.town.invitations.maybeInvite(
      "npc_mira", "player", "coffee", "cafe",
      adapter.town.clock.currentTime.totalMinutes + 60,
    );
    expect(invitation).not.toBeNull();
    expect(adapter.personalLifeFor("player")!.invitations).toEqual([
      expect.objectContaining({ id: invitation!.id, status: "pending" }),
    ]);
    expect(adapter.respondToInvitation("player", invitation!.id, "accept")).toBe(true);
    expect(adapter.town.invitations.get(invitation!.id)?.status).toBe("accepted");

    const socialRel = adapter.town.relationships.getOrCreate("player", "npc_mira");
    socialRel.familiarity = 0.5;
    socialRel.affinity = 0.6;
    socialRel.trust = 0.2;
    adapter.town.habits.record("player", "visit", "cafe", 0);
    adapter.town.habits.record("player", "visit", "cafe", 1440);
    adapter.town.habits.record("player", "visit", "cafe", 2880);
    const developedLife = adapter.personalLifeFor("player")!;
    expect(developedLife.intentions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "befriend", subjectKey: "npc_mira" }),
    ]));
    expect(developedLife.habits).toEqual(expect.arrayContaining([
      expect.objectContaining({ behavior: "visit", targetKey: "cafe" }),
    ]));
    adapter.dispose();
  });

  it("groups town stories by explicit simulation category", () => {
    const views = townStoryViews([
      {
        id: 1, day: 2, text: "Mira was promoted.", participants: ["npc_mira"],
        category: "careers",
      },
      {
        id: 2, day: 2, text: "Mira and Rohan became friends.",
        participants: ["npc_mira", "npc_rohan"], category: "relationships",
      },
      {
        id: 3, day: 2, text: "Mira invited Anika out.",
        participants: ["npc_mira", "npc_anika"], category: "social",
      },
    ], 2);
    const groups = groupTownStories(views);
    expect(groups.map((group) => group.label)).toEqual([
      "Relationships", "Careers", "Social life",
    ]);
    expect(groups.find((group) => group.category === "careers")?.stories[0])
      .toMatchObject({ tone: "warm", category: "careers" });
  });

  it("scopes unrelated resident profiles to the controlled resident's knowledge", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    const now = adapter.town.clock.currentTime.totalMinutes;
    adapter.town.memory.storeFor("npc_mira").add(now, (id) => ({
      id,
      timestampMinutes: now,
      eventType: "private_thought",
      subject: "npc_rohan",
      summary: "PRIVATE MIRA MEMORY",
      importance: 0.9,
      valence: 0,
      confidence: 1,
      source: 0 as never,
      sourceEventId: 999,
      accessCount: 0,
      lastAccessMinutes: now,
    }));
    adapter.sendMessage("npc_mira", "player", "Want coffee?");

    const stranger = adapter.residentKnowledgeFor("player", "npc_mira")!;
    expect(stranger.privateAccess).toBe(false);
    expect(stranger.memories.some((memory) => memory.summary === "PRIVATE MIRA MEMORY"))
      .toBe(false);
    expect(stranger.memories.some((memory) => memory.subject === "npc_mira"))
      .toBe(true);
    expect(stranger.relationships.every((relationship) =>
      relationship.from === "player" && relationship.to === "npc_mira")).toBe(true);

    // The player belongs to Birch household, so its authored members are controllable.
    expect(adapter.residentKnowledgeFor("player", "npc_anika")?.privateAccess).toBe(true);
    adapter.dispose();
  });

  it("keeps TownStories knowledge filtering intact at the adapter boundary", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    adapter.createResident({
      id: "ui_outsider", name: "Outsider",
      personality: PersonalityProfile.balanced(),
    });
    adapter.town.events.publish("sim:promoted", {
      agent: "npc_kofi", fromTitle: "Junior", toTitle: "Senior", income: 30,
    });
    expect(adapter.townStoriesFor("npc_kofi").some((story) =>
      story.participants.includes("npc_kofi"))).toBe(true);
    expect(adapter.townStoriesFor("ui_outsider")).toHaveLength(0);
    adapter.dispose();
  });
});
