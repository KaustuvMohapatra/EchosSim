/** The round-trip contract: a saved world IS the same world. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { saveToJson, restoreFromJson } from "@echosim/persistence";
import { UnsupportedSaveVersionException } from "@echosim/persistence";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

export function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

function fingerprint(town: Town, director: PlanningDirector): string {
  const parts: unknown[] = [
    town.clock.currentTime.totalMinutes, town.weather.current,
  ];
  for (const id of town.residents.orderedIds()) {
    const m = town.residents.mind(id);
    const state = town.agentsById.get(id);
    parts.push(id,
      state?.hasLocation ? state.currentLocationId : null,
      [...m.needs.all()].map((n) => n.current.toFixed(9)).join(","),
      m.emotionValence.toFixed(9), m.money, m.committedGoal?.id ?? null,
      [...m.plannerMemory].sort().join("|"),
      [...m.inventory].sort().join("|"));
    const store = town.memory.storeFor(id);
    parts.push(store.all.map((x) =>
      `${x.id}:${x.importance.toFixed(9)}:${x.accessCount}:${x.lastAccessMinutes}`).join(";"));
  }
  parts.push([...town.relationships.all()].map((l) =>
    `${l.from}>${l.to}:` +
    ["familiarity","affinity","trust","respect","attraction","fear","grievance","obligation"]
      .map((k) => l.rel[k as keyof typeof l.rel].toFixed(9)).join(",")
  ).sort());
  parts.push(town.beliefs.owners().map(({ owner, store }) =>
    `${owner}:` + store.all.map((b) =>
      `${b.subjectKey}|${b.predicate}|${b.stance.toFixed(9)}|${b.confidence.toFixed(9)}|${b.hopCount}|${b.sourceAgent ?? "-"}`
    ).sort().join(";")).sort());
  parts.push(director.totalPlansCreated, director.totalPlansSucceeded,
    director.totalPlansFailed);
  return JSON.stringify(parts);
}

describe("persistence: mid-flight round trip", () => {
  it("restored and original towns stay byte-identical going forward", () => {
    const a = createDemoTown(7001);
    step(a.town, a.director, 480); // wake-up + morning activity, plans in flight

    // Mid-flight snapshot with at least one running plan if possible.
    const json = saveToJson(a.town, a.director);

    const b = restoreFromJson(json);

    expect(b.town.clock.currentTime.totalMinutes).toBe(
      a.town.clock.currentTime.totalMinutes);

    step(a.town, a.director, 360);
    step(b.town, b.director, 360);

    expect(fingerprint(b.town, b.director)).toBe(fingerprint(a.town, a.director));
  });

  it("restore is deterministic: two restores of the same JSON agree", () => {
    const a = createDemoTown(4242);
    step(a.town, a.director, 240);
    const json = saveToJson(a.town, a.director);

    const b1 = restoreFromJson(json);
    const b2 = restoreFromJson(json);
    expect(fingerprint(b1.town, b1.director)).toBe(fingerprint(b2.town, b2.director));
  });

  it("rejects saves from a newer schema version gracefully", () => {
    const a = createDemoTown(7001);
    const doc = JSON.parse(saveToJson(a.town, a.director)) as { version: number };
    doc.version = 999;
    expect(() => restoreFromJson(JSON.stringify(doc)))
      .toThrow(UnsupportedSaveVersionException);
  });

  it("JSON is stable across serializations of an unchanged world", () => {
    const a = createDemoTown(4242);
    step(a.town, a.director, 120);
    expect(saveToJson(a.town, a.director)).toBe(saveToJson(a.town, a.director));
  });
});
