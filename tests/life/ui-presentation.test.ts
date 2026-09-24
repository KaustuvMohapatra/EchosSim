import { describe, expect, it } from "vitest";
import { PersonalityProfile } from "@echosim/cognition";
import type { AgentSummary, SimEventEntry } from "@echosim/inspector";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import {
  autonomyView, readableActivity, residentRailItem,
} from "../../apps/life/src/ui/models/residentView.js";
import { dayPeriod } from "../../apps/life/src/ui/models/townView.js";
import { eventToStory, liveStories } from "../../apps/life/src/ui/models/storyView.js";

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
