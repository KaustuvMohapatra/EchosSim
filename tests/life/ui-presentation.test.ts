import { describe, expect, it } from "vitest";
import { PersonalityProfile } from "@echosim/cognition";
import type { AgentSummary, SimEventEntry } from "@echosim/inspector";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import {
  autonomyView, readableActivity, residentRailItem,
} from "../../apps/life/src/ui/models/residentView.js";
import { dayPeriod } from "../../apps/life/src/ui/models/townView.js";
import { eventToStory, liveStories } from "../../apps/life/src/ui/models/storyView.js";
import {
  formatClockMinute, formatSimMoment, skillProgress,
} from "../../apps/life/src/ui/models/personalLifeView.js";

describe("Life UI presentation models", () => {
  it("derives the day period from simulation minutes", () => {
    expect(dayPeriod(5 * 60 + 59)).toBe("Night");
    expect(dayPeriod(6 * 60)).toBe("Morning");
    expect(dayPeriod(12 * 60)).toBe("Afternoon");
    expect(dayPeriod(17 * 60)).toBe("Evening");
    expect(dayPeriod(21 * 60)).toBe("Night");
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
  });

  it("keeps phone messages resident-scoped and skill state simulation-backed", () => {
    const adapter = new LifeModeAdapter({ seed: 7001n });
    expect(adapter.sendMessage("player", "npc_mira", "Coffee later?")).toBe(true);

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
