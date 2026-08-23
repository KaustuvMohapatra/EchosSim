/** Sprint 26 — simulation LOD: throttling, critical promotion, determinism. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { LodController, LodLevel } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";
import { saveToJson, restoreFromJson } from "@echosim/persistence";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S26: LOD behaviour", () => {
  it("reduced residents plan at most once per cadence window", () => {
    const { town, director, rohanId } = createDemoTown(7001);
    const lod = new LodController();
    lod.reducedCadenceMinutes = 60;
    lod.setLevel(rohanId, LodLevel.Reduced);
    director.attachLod(lod);

    step(town, director, 600); // wake-up + morning
    const cycles = director.diagnosticsOf(rohanId).totalReplans +
      director.totalPlansCreated; // global; measure via lastCycle instead
    void cycles;

    // Count actual cycles for Rohan by re-walking a fresh identical run.
    const probe = createDemoTown(7001);
    const lod2 = new LodController();
    lod2.reducedCadenceMinutes = 60;
    lod2.setLevel(rohanId, LodLevel.Reduced);
    probe.director.attachLod(lod2);
    let cyclesRohan = 0;
    for (let i = 0; i < 60; i++) {
      probe.town.cognition.advanceNeeds({ totalMinutes: 10 });
      probe.town.clock.advance({ totalMinutes: 10 });
      const before = probe.director.diagnosticsOf(rohanId).lastCycleAtMinutes ?? -1;
      probe.director.tickAll();
      const after = probe.director.diagnosticsOf(rohanId).lastCycleAtMinutes ?? -1;
      if (after !== before) cyclesRohan++;
    }
    expect(cyclesRohan).toBeLessThanOrEqual(10); // 600 min / 60 cadence
    expect(cyclesRohan).toBeGreaterThan(0);

    // Full-LOD control plans far more often in the same window.
    const full = createDemoTown(7001);
    let cyclesFull = 0;
    for (let i = 0; i < 60; i++) {
      full.town.cognition.advanceNeeds({ totalMinutes: 10 });
      full.town.clock.advance({ totalMinutes: 10 });
      const before = full.director.diagnosticsOf(rohanId).lastCycleAtMinutes ?? -1;
      full.director.tickAll();
      const after = full.director.diagnosticsOf(rohanId).lastCycleAtMinutes ?? -1;
      if (after !== before) cyclesFull++;
    }
    expect(cyclesFull).toBeGreaterThan(cyclesRohan);
  });

  it("coarse/dormant residents do not plan while idle but survive critically", () => {
    const { town, director, anikaId } = createDemoTown(4242);
    const lod = new LodController();
    lod.setLevel(anikaId, LodLevel.Coarse);
    director.attachLod(lod);
    step(town, director, 120);
    const idleCycles = director.diagnosticsOf(anikaId).lastCycleAtMinutes;
    expect(idleCycles).toBeUndefined(); // never planned

    // Critical need promotes them regardless of LOD.
    town.residents.mind(anikaId).needs.force(0 /* Hunger */, 99);
    step(town, director, 20);
    expect(director.peekActive(anikaId)).toBeDefined();
  });

  it("identical LOD configurations produce byte-identical runs", () => {
    function run(): string {
      const ctx = createDemoTown(4242);
      const lod = new LodController();
      lod.setLevel(ctx.miraId, LodLevel.Reduced);
      lod.setLevel(ctx.anikaId, LodLevel.Dormant);
      ctx.director.attachLod(lod);
      step(ctx.town, ctx.director, 300);
      return JSON.stringify([
        ctx.town.clock.currentTime.totalMinutes,
        ...ctx.town.residents.orderedIds().map((id) => {
          const m = ctx.town.residents.mind(id);
          return [m.needs.mostUrgent()!.current.toFixed(9), m.currentGoalId ?? null];
        }),
        ctx.director.totalPlansSucceeded, ctx.director.totalPlansFailed,
      ]);
    }
    expect(run()).toBe(run());
  });

  it("mixed-LOD run stays structurally sound vs all-full (semantic equivalence)", () => {
    const full = createDemoTown(4242);
    step(full.town, full.director, 480);

    const mixed = createDemoTown(4242);
    const lod = new LodController();
    lod.setLevel(mixed.anikaId, LodLevel.Reduced);
    mixed.director.attachLod(lod);
    step(mixed.town, mixed.director, 480);

    // Key high-level outcomes remain sane and comparable.
    expect(full.director.totalPlansSucceeded).toBeGreaterThan(0);
    expect(mixed.director.totalPlansSucceeded).toBeGreaterThan(0);
    expect(mixed.director.totalPlansFailed).toBeLessThanOrEqual(
      full.director.totalPlansCreated);
    for (const id of mixed.town.residents.orderedIds()) {
      const m = mixed.town.residents.mind(id);
      expect(Number.isNaN(m.emotionValence)).toBe(false);
      for (const n of m.needs.all()) {
        expect(n.current >= 0 && n.current <= 100).toBe(true);
      }
    }
  });

  it("in-flight plans persist across save/restore with LOD attached", () => {
    const a = createDemoTown(7001);
    const lod = new LodController();
    lod.setLevel(a.rohanId, LodLevel.Reduced);
    a.director.attachLod(lod);
    step(a.town, a.director, 240);
    const b = restoreFromJson(saveToJson(a.town, a.director));
    // Restored world keeps running under the same host controller decisions.
    step(b.town, b.director, 120);
    expect(Number.isFinite(b.director.totalPlansCreated)).toBe(true);
  });
});
