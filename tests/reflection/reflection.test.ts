/** Sprint 23 — reflection & semantic memory: threshold, patterns, dedup,
 *  reinforcement, contradiction, persistence, LLM phrasing fallback. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { ReflectionSystem } from "@echosim/social";
import type { MemoryStore } from "@echosim/social";
import { saveToJson, restoreFromJson } from "@echosim/persistence";
import { LanguageModelService, MockLanguageModelProvider, DEFAULT_AI_CONFIG } from "@echosim/ai";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

/** Deterministic store seeded with interpersonal episodes about a subject. */
function makeStore(entries: Array<{ id: number; eventType: string; subject: string; valence: number; importance: number; at: number }>): MemoryStore {
  const store = new MemoryStoreClass(500);
  for (const e of entries) {
    store.import({
      id: e.id, timestampMinutes: e.at, eventType: e.eventType,
      subject: e.subject, summary: `${e.eventType} by ${e.subject}`,
      importance: e.importance, valence: e.valence, confidence: 0.9,
      source: 0 as never, sourceEventId: e.id * 10,
      accessCount: 0, lastAccessMinutes: e.at,
    });
  }
  return store;
}
import { MemoryStore as MemoryStoreClass } from "@echosim/social";

describe("S23: reflection trigger", () => {
  it("stays quiet below the significance threshold", () => {
    let now = 1000;
    const rs = new ReflectionSystem(() => now);
    rs.accumulate("npc_mira", 3);
    const store = makeStore([
      { id: 1, eventType: "help", subject: "npc_rohan", valence: 0.7, importance: 0.75, at: 900 },
      { id: 2, eventType: "help", subject: "npc_rohan", valence: 0.7, importance: 0.75, at: 950 },
    ]);
    expect(rs.maybeReflect("npc_mira", store)).toHaveLength(0);
  });

  it("crossing the threshold produces a semantic generalisation", () => {
    let now = 1000;
    const rs = new ReflectionSystem(() => now);
    const store = makeStore([
      { id: 1, eventType: "insult", subject: "npc_rohan", valence: -0.75, importance: 4, at: 900 },
      { id: 2, eventType: "confront", subject: "npc_rohan", valence: -0.45, importance: 4, at: 950 },
    ]);
    rs.accumulate("npc_mira", 8); // exactly at threshold
    const out = rs.maybeReflect("npc_mira", store);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      subjectKey: "npc_rohan", concept: "unpleasantness",
    });
    expect(out[0]!.polarity).toBeLessThan(0);
    expect(out[0]!.supportingIds.sort()).toEqual([1, 2]);
    // Threshold resets after reflecting.
    expect(rs.accumulatedSignificance("npc_mira")).toBe(0);
  });
});

describe("S23: dedup + reinforcement + contradiction", () => {
  function reflectHelpBatch(rs: ReflectionSystem, store: MemoryStore, ids: number[], now: number) {
    rs.accumulate("npc_mira", 99);
    return rs.maybeReflect("npc_mira", store);
  }

  it("repeated evidence reinforces one concept instead of duplicating", () => {
    let now = 1000;
    const rs = new ReflectionSystem(() => now);
    const store = makeStore([
      { id: 1, eventType: "help", subject: "npc_anika", valence: 0.7, importance: 1, at: 800 },
      { id: 2, eventType: "help", subject: "npc_anika", valence: 0.7, importance: 1, at: 850 },
    ]);
    const first = reflectHelpBatch(rs, store, [1, 2], now)[0]!;
    expect(first.concept).toBe("reliability");
    const confAfterFirst = first.confidence;

    now += 600;
    store.import({ id: 3, timestampMinutes: now, eventType: "gift",
      subject: "npc_anika", where: undefined, summary: "gift from npc_anika",
      importance: 0.68, valence: 0.6, confidence: 0.9, source: 0 as never,
      sourceEventId: 30, accessCount: 0, lastAccessMinutes: now });
    store.import({ id: 4, timestampMinutes: now + 5, eventType: "compliment",
      subject: "npc_anika", where: undefined, summary: "compliment from npc_anika",
      importance: 0.52, valence: 0.5, confidence: 0.9, source: 0 as never,
      sourceEventId: 40, accessCount: 0, lastAccessMinutes: now });

    const second = reflectHelpBatch(rs, store, [3], now)[0]!;
    expect(second.id).toBe(first.id);                       // same concept identity
    expect(second.confidence).toBeGreaterThan(confAfterFirst); // reinforced
    expect(second.supportingIds).toContain(3);
    expect(second.lastReinforcedAtMinutes).toBe(now);

    // Only ONE semantic entry exists for that key.
    expect(rs.semanticOf("npc_mira")).toHaveLength(1);
  });

  it("strong contradictory evidence dents confidence and shifts polarity", () => {
    let now = 1000;
    const rs = new ReflectionSystem(() => now);
    const store = makeStore([
      { id: 1, eventType: "compliment", subject: "npc_rohan", valence: 0.5, importance: 5, at: 800 },
      { id: 2, eventType: "comfort", subject: "npc_rohan", valence: 0.55, importance: 5, at: 850 },
    ]);
    rs.accumulate("npc_mira", 50);
    const positive = rs.maybeReflect("npc_mira", store)[0]!;
    expect(positive.polarity).toBeGreaterThan(0);
    const goodConf = positive.confidence;
    const goodPolarity = positive.polarity;

    now += 600;
    for (let i = 0; i < 3; i++) {
      store.import({ id: 10 + i, timestampMinutes: now, eventType: "insult",
        subject: "npc_rohan", where: undefined, summary: `insult ${i}`,
        importance: 0.7, valence: -0.8, confidence: 0.95, source: 0 as never,
        sourceEventId: 100 + i, accessCount: 0, lastAccessMinutes: now });
    }
    rs.accumulate("npc_mira", 50);
    const after = rs.maybeReflect("npc_mira", store)[0]!;
    expect(after.id).toBe(positive.id);
    expect(after.confidence).toBeLessThan(goodConf);
    expect(after.polarity).toBeLessThan(goodPolarity);
  });
});

describe("S23: autonomous wiring + persistence + phrasing", () => {
  it("a living town forms semantic memories through normal social flow", () => {
    const { town, director, miraId, rohanId } = createDemoTown(4242);
    step(town, director, 60);
    // Direct insult traffic between the pair (deterministic acceptance).
    for (let i = 0; i < 14; i++) {
      town.social.attempt(rohanId, miraId, 11 /* Insult */);
      step(town, director, 30);
    }
    const semantics = town.reflections.semanticOf(miraId)
      .filter((s) => s.subjectKey === rohanId && s.concept === "unpleasantness");
    expect(semantics.length).toBeGreaterThanOrEqual(1);
    expect(semantics[0]!.confidence).toBeGreaterThan(0.3);
  });

  it("semantic memories survive the save/restore round trip identically", () => {
    const { town, director, miraId, rohanId } = createDemoTown(4242);
    step(town, director, 60);
    for (let i = 0; i < 14; i++) {
      town.social.attempt(rohanId, miraId, 11 /* Insult */);
      step(town, director, 30);
    }
    const before = JSON.stringify(town.reflections.exportFor(miraId));
    expect(JSON.parse(before).length).toBeGreaterThan(0);

    const json = saveToJson(town, director);
    const restored = restoreFromJson(json);
    expect(JSON.stringify(restored.town.reflections.exportFor(miraId))).toBe(before);

    // And both continue identically afterwards.
    step(town, director, 120);
    step(restored.town, restored.director, 120);
    expect(
      JSON.stringify(restored.town.reflections.exportFor(miraId)),
    ).toBe(JSON.stringify(town.reflections.exportFor(miraId)));
  });

  it("LLM may phrase a conclusion but never changes its structure", async () => {
    const { town, miraId, rohanId } = createDemoTown(7001);
    const mock = new MockLanguageModelProvider();
    mock.scriptReflection(() => ({ phrase: "I've learned I can rely on Rohan." }));
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: mock });

    const sem = {
      id: 1, subjectKey: rohanId, concept: "reliability", polarity: 0.7,
      confidence: 0.66, supportingIds: [5, 9],
      createdAtMinutes: 100, lastReinforcedAtMinutes: 200,
    };
    void sem;

    const request = {
      agentId: miraId, agentName: "Mira", subjectKey: rohanId,
      concept: "reliability", stance: 0.7, confidence: 0.66,
      supportingSummaries: ["rohan helped twice"],
    };
    const result = await svc.generateReflection(request);
    expect(result.source).toBe("llm");
    expect(result.phrase).toContain("rely on Rohan");
    // Structural record untouched by rendering.
    expect(town.reflections.semanticOf(miraId)).toHaveLength(0);
  });
});
