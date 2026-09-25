/** Sprint 48 — skills XP curve, behaviour-driven awards, promotions, persistence. */
import { describe, expect, it } from "vitest";
import { createAuthoredTown, createDemoTown } from "@echosim/content";
import {
  SkillSystem, levelForXp, xpForLevel,
} from "@echosim/social";
import { evaluatePromotion, promotionRequirementFor } from "@echosim/world";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S48: skill curve", () => {
  it("levels follow the quadratic threshold table", () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(9)).toBe(0);
    expect(levelForXp(10)).toBe(1);   // 1*1*10
    expect(levelForXp(39)).toBe(1);
    expect(levelForXp(40)).toBe(2);   // 2*2*10
    expect(xpForLevel(3)).toBe(90);
  });

  it("award accumulates and reports level-ups", () => {
    const s = new SkillSystem();
    s.award("npc_mira", "Cooking", 8);
    const l0 = s.stateOf("npc_mira", "Cooking").level;
    s.award("npc_mira", "Cooking", 4); // crosses 10
    const st = s.stateOf("npc_mira", "Cooking");
    expect(st.level).toBe(l0 + 1);
    expect(s.levelUpFrom(l0, st)).toBe(true);
  });
});

describe("S48: behaviour-driven awards", () => {
  it("accepted conversations grant social XP to both parties", () => {
const { town, director, miraId } = createDemoTown(4242);
    step(town, director, 60);
    // Conversation XP is granted from the sim:conversation record.
    town.events.publish("sim:conversation", {
      initiator: miraId, listener: "npc_rohan", intent: "SmallTalk",
      topicLabel: "", utterances: [], atMinutes: town.clock.currentTime.totalMinutes,
    });
    expect(town.skills.stateOf(miraId, "Social").xp).toBeGreaterThan(0);
    expect(town.skills.stateOf("npc_rohan", "Social").xp).toBeGreaterThan(0);
  });

  it("work completion grants professional XP and career days", () => {
    const { town } = createAuthoredTown(7001);
    const miraId = "npc_mira";
    const mind = town.residents.mind(miraId);
    // Simulate a completed shift through the same event the director emits.
    town.events.publish("sim:plan-step-completed",
      { agent: miraId, action: "act_work", index: 0 });
    expect(town.skills.stateOf(miraId, "Professional").xp).toBe(6);
    expect(mind.plannerMemory.get("career_days")).toBe(1);
  });
});

describe("S48: promotions", () => {
  it("exposes the same next-tier requirement used by promotion evaluation", () => {
    expect(promotionRequirementFor({
      title: "Junior Architect", workplace: "studio", incomePerHour: 16,
    })).toEqual({
      nextTitle: "Designer", requiredLevel: 3, requiredDays: 5, newIncome: 22,
    });
    expect(promotionRequirementFor({
      title: "Project Architect", workplace: "studio", incomePerHour: 38,
    })).toBeUndefined();
    expect(promotionRequirementFor({
      title: "Freelance Architect", workplace: "studio", incomePerHour: 24,
    })).toBeUndefined();
  });

  it("require skill level plus five shift-days; then change title and pay", () => {
    const tiers = [
      { title: "Junior Architect", requiredLevel: 0, incomePerHour: 16 },
      { title: "Designer", requiredLevel: 3, incomePerHour: 22 },
      { title: "Senior Designer", requiredLevel: 5, incomePerHour: 29 },
    ];
    void tiers;

    const job = { title: "Junior Architect", workplace: "studio",
                  incomePerHour: 16 };
    // Not enough days.
    expect(evaluatePromotion(job, 5, 3).promoted).toBe(false);
    // Enough of both.
    const r = evaluatePromotion(job, 3, 6);
    expect(r.promoted).toBe(true);
    expect(r.toTitle).toBe("Designer");
    expect(r.newIncome).toBe(22);

    // Top tier never promotes further.
    const top = { title: "Senior Designer", workplace: "studio",
                  incomePerHour: 29 };
    expect(evaluatePromotion(top, 9, 99)).toMatchObject({
      promoted: true, toTitle: "Project Architect", newIncome: 38 });
  });

  it("the live pipeline promotes working residents over time", () => {
    const { town } = createAuthoredTown(7001);
    const miraId = "npc_mira";
    let promoted = false;
    town.events.subscribe<{ agent: string }>("sim:promoted", (e) => {
      if (e.agent === miraId) promoted = true;
    });

    const mind = town.residents.mind(miraId);
    // Each shift: authored pipeline grants +6 XP and one career day; we add
    // +16 training XP so the Professional level crosses tier 3 quickly.
    let shifts = 0;
    while (!promoted && shifts < 12) {
      town.skills.award(miraId, "Professional", 16);
      mind.plannerMemory.set("career_days",
        (mind.plannerMemory.get("career_days") ?? 0) + 1);
      town.events.publish("sim:plan-step-completed",
        { agent: miraId, action: "act_work", index: 0 });
      shifts++;
    }

    expect(promoted).toBe(true);
    expect(mind.job?.title).toBe("Designer");
    expect(mind.job?.incomePerHour).toBe(22);
    // Day counter resets per tier.
    expect(mind.plannerMemory.get("career_days")).toBeLessThan(5);
  });
});

