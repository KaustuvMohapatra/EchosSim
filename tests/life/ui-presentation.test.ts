import { describe, expect, it } from "vitest";
import { PersonalityProfile } from "@echosim/cognition";
import type { AgentSummary, SimEventEntry } from "@echosim/inspector";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import {
  autonomyView, orderResidentRail, readableActivity, relativePresenceAge,
  residentProfilePresenceView, residentRailItem, residentRailItemFromPresence,
} from "../../apps/life/src/ui/models/residentView.js";
import {
  dayPeriod, residentCountsByLocation,
} from "../../apps/life/src/ui/models/townView.js";
import {
  eventToStory, groupTownStories, liveStories, observerMomentStories, townStoryViews,
} from "../../apps/life/src/ui/models/storyView.js";
import {
  careerRequirementProgress, formatClockMinute, formatSimMoment, habitText,
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

    const initialPresence = adapter.residentPresenceFor("player");
    const initialMira = initialPresence.find((resident) => resident.id === "npc_mira");
    expect(initialMira?.visibility).toBe("unknown");
    expect(initialPresence.filter((resident) => resident.current)
      .some((resident) => resident.id === "npc_mira")).toBe(false);
    expect(adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_anika")?.visibility).toBe("current");

    adapter.town.moveAgent("player" as never, "park" as never);
    adapter.town.moveAgent("npc_mira" as never, "park" as never);
    const visibleAtPark = adapter.residentPresenceFor("player");
    expect(visibleAtPark.find((resident) => resident.id === "npc_mira")).toMatchObject({
      visibility: "current",
      current: expect.objectContaining({ locationId: "park" }),
    });
    expect(visibleAtPark.filter((resident) => resident.current)
      .some((resident) => resident.id === "npc_mira")).toBe(true);

    adapter.town.moveAgent("npc_mira" as never, "apt_a" as never);
    const rawMiraAfterLeaving = adapter.inspector.getAgent("npc_mira")!;
    expect(rawMiraAfterLeaving.summary.locationId).toBe("apt_a");
    const lastKnownMira = adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_mira")!;
    expect(lastKnownMira).toMatchObject({
      visibility: "last-known",
      lastKnownLocationId: "park",
      lastKnownAtMinutes: expect.any(Number),
    });
    expect(lastKnownMira.current).toBeUndefined();
    expect(lastKnownMira.lastKnownLocationId).not.toBe(
      rawMiraAfterLeaving.summary.locationId);
    const now = adapter.town.clock.currentTime.totalMinutes + 90;
    const rail = residentRailItemFromPresence(lastKnownMira, {
      controlled: false, household: false, selected: false, followed: false,
    }, now);
    expect(rail.mood).toBeUndefined();
    expect(rail.activity).toContain("Last seen");
    expect(rail.activity).toContain("ago");
    expect(residentProfilePresenceView(lastKnownMira, now)).toEqual({
      status: "Last known",
      activity: "Current activity unknown",
      location: expect.stringMatching(/^Last seen .+ ago at Park$/),
    });
    expect(relativePresenceAge(200, 110)).toBe("1h ago");
    const unknown = adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_rohan")!;
    expect(residentProfilePresenceView(unknown)).toEqual({
      status: "Out of sight",
      activity: "Current activity unknown",
      location: "Location unknown",
    });
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

  it("keeps live observer history tied to actual perception time", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    adapter.town.moveAgent("player" as never, "apt_b" as never);
    adapter.town.moveAgent("npc_rohan" as never, "cafe" as never);

    // Arriving at the cafe later must not reveal Rohan's earlier arrival there.
    adapter.town.moveAgent("player" as never, "cafe" as never);
    const afterArrival = adapter.observerMomentsFor("player");
    expect(afterArrival.some((moment) =>
      moment.kind === "movement" &&
      moment.participants.includes("npc_rohan") &&
      moment.locationId === "cafe")).toBe(false);

    // A moment genuinely observed at the park remains known after leaving it.
    adapter.town.moveAgent("player" as never, "park" as never);
    adapter.town.moveAgent("npc_mira" as never, "park" as never);
    adapter.town.moveAgent("player" as never, "apt_b" as never);
    const remembered = adapter.observerMomentsFor("player");
    expect(remembered.some((moment) =>
      moment.kind === "movement" &&
      moment.participants.includes("npc_mira") &&
      moment.locationId === "park")).toBe(true);

    const stories = observerMomentStories(
      remembered,
      adapter.town.clock.currentTime.totalMinutes,
      new Map([["npc_mira", "Mira"], ["player", "You"]]),
      new Map([["park", "Park"], ["apt_b", "Birch Apartments"]]),
    );
    expect(stories.some((item) => item.text === "Mira arrived at Park.")).toBe(true);
    adapter.dispose();
  });

  it("does not leak omniscient movement events into the legacy event filter", () => {
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
    expect(careerRequirementProgress(2, 4)).toBe(0.5);
    expect(careerRequirementProgress(7, 5)).toBe(1);
    expect(intentionText("repair", "Mira")).toBe("Repair things with Mira");
    expect(intentionStrengthLabel(0.7)).toBe("Strong intention");
    expect(habitText("visit", "Maple & Bean", 4)).toBe("Often visits Maple & Bean");
  });

  it("keeps phone contacts and messages resident-scoped and skill state simulation-backed", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    adapter.createResident({
      id: "ui_unknown_contact", name: "Unknown Contact",
      personality: PersonalityProfile.balanced(),
    });
    expect(adapter.personalLifeFor("player")!.contacts.some((contact) =>
      contact.id === "ui_unknown_contact")).toBe(false);
    expect(adapter.sendMessage("player", "ui_unknown_contact", "Hello?")).toBe(false);
    expect(adapter.lastCommandFeedback).toContain("contacts");

    adapter.town.relationships.getOrCreate("player", "npc_mira");
    expect(adapter.sendMessage("player", "npc_mira", "Coffee later?")).toBe(true);
    expect(adapter.town.messages.between("player", "npc_mira")).toHaveLength(1);

    const playerLife = adapter.personalLifeFor("player")!;
    expect(playerLife.contacts.some((contact) => contact.id === "npc_mira")).toBe(true);
    expect(playerLife.contacts.some((contact) => contact.id === "ui_unknown_contact")).toBe(false);
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
    expect(adapter.personalLifeFor("player")!.calendar).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "meeting", locationId: "cafe", relatedResidentId: "npc_mira",
      }),
    ]));

    const socialRel = adapter.town.relationships.getOrCreate("player", "npc_mira");
    socialRel.familiarity = 0.5;
    socialRel.affinity = 0.6;
    socialRel.trust = 0.2;
    adapter.town.habits.record("player", "visit", "cafe", 0);
    adapter.town.habits.record("player", "visit", "cafe", 1440);
    adapter.town.habits.record("player", "visit", "cafe", 2880);
    const mind = adapter.town.residents.mind("player");
    mind.job = {
      id: "job_player", title: "Junior Architect", workplace: "studio",
      shiftStartMinuteOfDay: 540, shiftEndMinuteOfDay: 1020, incomePerHour: 16,
    };
    mind.plannerMemory.set("career_days", 3);
    adapter.town.skills.award("player", "Professional", 90);
    const developedLife = adapter.personalLifeFor("player")!;
    expect(developedLife.career).toMatchObject({
      currentTitle: "Junior Architect",
      professionalLevel: 3,
      daysAtTier: 3,
      nextTitle: "Designer",
      requiredProfessionalLevel: 3,
      requiredDays: 5,
    });
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

  it("keeps private inspector detail behind the household boundary", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    expect(adapter.privateResidentDetailsFor("player", "player")).toBeDefined();
    expect(adapter.privateResidentDetailsFor("player", "npc_anika")).toBeDefined();
    expect(adapter.privateResidentDetailsFor("player", "npc_mira")).toBeUndefined();

    adapter.town.moveAgent("player" as never, "park" as never);
    adapter.town.moveAgent("npc_mira" as never, "park" as never);
    expect(adapter.residentPresenceFor("player")
      .find((resident) => resident.id === "npc_mira")?.visibility).toBe("current");
    expect(adapter.privateResidentDetailsFor("player", "npc_mira")).toBeUndefined();
    adapter.dispose();
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
    adapter.town.relationships.getOrCreate("npc_mira", "player");
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
