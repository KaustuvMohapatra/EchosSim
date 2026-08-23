/** Sprint 25 — households, friend groups & social structure. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { PlanningDirector } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import { saveToJson, restoreFromJson } from "@echosim/persistence";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S25: membership", () => {
  it("supports multi-membership and shared-group lookup", () => {
    const { town, miraId, rohanId, anikaId } = createDemoTown(7001);
    expect(town.groups.groupsOf(miraId).map((g) => g.id).sort()).toEqual(
      ["grp_book_club", "grp_household_a"]);
    expect(town.groups.sharedGroups(miraId, rohanId)).toHaveLength(1); // household
    expect(town.groups.sharedGroups(miraId, anikaId)).toHaveLength(2); // household+club
    expect(town.groups.isMember("grp_book_club", rohanId)).toBe(false);
  });

  it("group content survives save/restore so bonuses continue identically", () => {
    const a = createDemoTown(7001);
    const b = restoreFromJson(saveToJson(a.town, a.director));
    expect(b.town.groups.groupsOf(a.miraId).map((g) => g.id).sort())
      .toEqual(a.town.groups.groupsOf(a.miraId).map((g) => g.id).sort());
    expect(b.town.groups.sharedGroups(a.miraId, a.anikaId)).toHaveLength(2);
  });
});

describe("S25: knowledge boundaries (no telepathy)", () => {
  it("a group meeting is experienced ONLY by members present at the venue", () => {
    const { town, director, miraId, rohanId, anikaId } = createDemoTown(4242);
    // Book-club gathering at the always-open park in 60 minutes. Only Anika
    // attends; Mira and Rohan stay home.
    town.scheduleGroupMeeting("grp_book_club", 60, "loc_park");

    step(town, director, 50);
    town.moveAgent(anikaId as never, "loc_park" as never);
    step(town, director, 40); // cross the scheduled time

    const seen = (id: string) =>
      town.perception.observationsOf(id).filter((o) => o.eventType === "group_event");
    expect(seen(anikaId).length).toBeGreaterThanOrEqual(1);      // attendee knows
    expect(seen(miraId)).toHaveLength(0);                        // absent → nothing
    expect(seen(rohanId)).toHaveLength(0);
  });
});

describe("S25: conversation topic eligibility", () => {
  function setup() {
    const ctx = createDemoTown(4242);
    const { town } = ctx;
    // Fourth resident with no group ties, placed far away (never listener).
    town.spawnResident({
      id: "npc_outsider", displayName: "Outsider",
      startLocationId: "loc_park",
      personality: town.residents.mind("npc_rohan").personality,
    });
    return ctx;
  }

  it("prefers subjects sharing a group with the listener over stronger rumours", () => {
    const { town, director, miraId, rohanId } = setup();
    // Make Anika the listener by sending Rohan to the park.
    town.moveAgent(rohanId as never, "loc_park" as never);

    const now = town.clock.currentTime.totalMinutes;
    town.beliefs.learnDirect(miraId, "npc_outsider", "regard", -0.95, 0.95, 1, now); // stronger
    town.beliefs.learnDirect(miraId, rohanId, "regard", -0.60, 0.95, 2, now);        // club/household peer

    let capturedTopic: string | undefined;
    town.events.subscribe<{ topicLabel: string }>("sim:conversation",
      (c) => { capturedTopic = c.topicLabel; });
    town.events.publish("sim:plan-step-completed",
      { agent: miraId, action: "act_talk", index: 0 });

    expect(capturedTopic).toBe("Rohan"); // group-relevant beats stronger stance
  });

  it("without any shared group the strongest stance wins", () => {
    const { town, miraId, rohanId, anikaId } = setup();
    town.moveAgent(rohanId as never, "loc_park" as never);
    // Strip Anika's memberships: no overlap with either candidate.
    for (const gid of town.groups.groupsOf(anikaId).map((g) => g.id))
      town.groups.removeMember(gid, anikaId);

    const now = town.clock.currentTime.totalMinutes;
    town.beliefs.learnDirect(miraId, "npc_outsider", "regard", -0.95, 0.95, 1, now);
    town.beliefs.learnDirect(miraId, rohanId, "regard", -0.60, 0.95, 2, now);

    let capturedTopic: string | undefined;
    town.events.subscribe<{ topicLabel: string }>("sim:conversation",
      (c) => { capturedTopic = c.topicLabel; });
    town.events.publish("sim:plan-step-completed",
      { agent: miraId, action: "act_talk", index: 0 });

    expect(capturedTopic).toBe("Outsider");
  });
});
