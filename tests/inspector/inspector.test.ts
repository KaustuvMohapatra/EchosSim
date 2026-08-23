/**
 * Sprint 19 — Debug Inspector read-model tests.
 *
 * Covers: snapshots, utility breakdowns, plan/failure explainability, event
 * journal filters, memory sorts (incl. non-mutating retrieval peek), belief
 * formation/gossip transfer, and the read-only invariant over the API surface.
 */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { SimulationInspector } from "@echosim/inspector";
import { ActionFailureType, PlanningDirector } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import type { PlanningDiagnostics } from "@echosim/simulation";
import { NeedKind } from "@echosim/cognition";
import { SocialActionType } from "@echosim/social";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

// ------------------------------------------------------------------
// Fingerprint: deep structural state of everything the sim owns.
// ------------------------------------------------------------------
function fingerprint(town: Town, director: PlanningDirector): string {
  const parts: unknown[] = [];
  parts.push(["clock", town.clock.currentTime.totalMinutes]);
  parts.push(["weather", town.weather.current]);
  parts.push(["reservations", town.reservations.totalGranted,
    town.reservations.totalDenied, town.reservations.totalExpired,
    town.reservations.totalReleased]);

  for (const id of town.residents.orderedIds()) {
    const m = town.residents.mind(id);
    parts.push([
      "mind", id,
      [...m.needs.all()].map((n) => n.current.toFixed(6)).join(","),
      m.emotionValence.toFixed(6), m.money,
      m.committedGoal?.id ?? null, m.routineOffsetMinutes,
      [...m.plannerMemory].sort().map(([k, v]) => `${k}=${v}`).join("|"),
      [...m.inventory].sort().map(([k, v]) => `${k}=${v}`).join("|"),
      [...m.lastSelectedSnapshot()].sort().map(([k, v]) => `${k}:${v}`).join("|"),
    ]);
    const store = town.memory.storeFor(id);
    parts.push([
      "mem", id, store.count,
      ...store.all.map((x) => `${x.id}/${x.accessCount}/${x.lastAccessMinutes}`),
    ]);
  }

  parts.push([...town.relationships.all()]
    .map((l) => `${l.from}>${l.to}:${["familiarity","affinity","trust","respect","attraction","fear","grievance","obligation"]
      .map((k) => l.rel[k as never as keyof typeof l.rel]).join(",")}`)
    .sort());

  parts.push(town.beliefs.owners()
    .map(({ owner, store }) => `${owner}:` +
      store.all.map((b) => `${b.subjectKey}|${b.predicate}|${b.stance.toFixed(6)}|${b.confidence.toFixed(6)}|${b.hopCount}|${b.sourceAgent ?? "-"}|${b.learnedAtMinutes}`)
        .sort().join(";"))
    .sort());

  for (const id of town.residents.orderedIds()) {
    const log = town.perception.observationsOf(id);
    parts.push(["obs", id, log.length, log.reduce((s, o) => s + o.eventId * 31 + Math.round(o.confidence * 97), 0)]);
  }
  parts.push(["perception", town.perception.totalDelivered]);

  parts.push(["director", director.totalPlansCreated, director.totalPlansSucceeded,
    director.totalPlansFailed, director.totalReplans]);
  parts.push(director.activeRunsSnapshot()
    .map((r) => `${r.agentId}:${r.goalId}:${r.nextStepIndex}:${r.generation}`).sort());
  parts.push(["locations", ...town.locations.orderedIds.map((id) => {
    const rt = town.locations.get(id);
    return `${id}:${rt.isOpen ? 1 : 0}:${rt.occupiedCount}`;
  })]);

  return JSON.stringify(parts);
}

describe("Sprint 19: inspector snapshots", () => {
  it("lists residents with location/goal/action summaries", () => {
    const { town, director, miraId } = createDemoTown(7001);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 120);

    const agents = inspector.getAgents();
    expect(agents).toHaveLength(3);
    const mira = agents.find((a) => a.id === miraId)!;
    expect(mira.name).toBe("Mira");
    expect(mira.locationName).toBeTruthy();
    expect(mira.status).toBeTruthy();
  });

  it("full agent snapshot exposes identity/needs/traits/utility/plan/memories", () => {
    const { town, director, miraId } = createDemoTown(7001);
    const inspector = new SimulationInspector(town, director);
    // Seed a couple of social events so memory/relationships are populated.
    step(town, director, 60);
    town.social.attempt(miraId, "npc_rohan", SocialActionType.Compliment);
    step(town, director, 30);

    const snap = inspector.getAgent(miraId)!;
    expect(snap.summary.id).toBe(miraId);
    expect(snap.traits).toHaveLength(14);
    expect(snap.needs).toHaveLength(7);
    expect(snap.needs.map((n) => n.name)).toEqual(
      ["Hunger", "Energy", "Social", "Fun", "Comfort", "Hygiene", "Safety"]);
    expect(snap.utility.length).toBeGreaterThan(0);
    expect(snap.memories.length).toBeGreaterThan(0);
    expect(snap.relationships.length).toBeGreaterThan(0);
    expect(snap.plan.revision).toBeGreaterThanOrEqual(0);
    expect(snap.suppressions).toBeInstanceOf(Array);
  });

  it("utility candidate breakdown sums to the final score", () => {
    const { town, director, miraId } = createDemoTown(4001);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 90);

    for (const c of inspector.utilityFor(miraId)) {
      const sum = c.breakdown.reduce((s, l) => s + l.value, 0);
      expect(Math.abs(sum - c.score)).toBeLessThan(1e-9);
      expect(c.breakdown[0]!.label).toBe("Base");
    }
  });
});

describe("Sprint 19: planning explainability", () => {
  it("records replan reason and failure detail through the plan snapshot", () => {
    const { town, director, miraId } = createDemoTown(7001);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 30);

    // Force every movement step into the cafe to fail.
    director.intervention = (_agent, action) =>
      action.requiredLocation === "loc_cafe"
        ? ActionFailureType.LocationClosed
        : null;

    let sawFailureDetail = false;
    let diag: PlanningDiagnostics | undefined;
    for (let i = 0; i < 40 && !sawFailureDetail; i++) {
      step(town, director, 20);
      diag = director.diagnosticsOf(miraId);
      sawFailureDetail = !!diag.lastFailureDetail &&
        diag.lastFailureDetail.startsWith("LocationClosed");
    }
    director.intervention = undefined;

    expect(diag).toBeDefined();
    expect(sawFailureDetail).toBe(true);
    expect(diag!.lastReplanReason).toBe("action-failed");
    expect(diag!.totalReplans).toBeGreaterThan(0);

    const snap = inspector.getAgent(miraId)!;
    expect(snap.plan.lastFailureDetail).toContain("LocationClosed");

    // Journal captured the failure narrative too.
    const finished = inspector.journal.query({ agent: miraId, typePrefix: "sim:plan-finished" });
    expect(finished.some((e) => /FAILED/.test(e.text) && /LocationClosed/.test(e.text))).toBe(true);
  });
});

describe("Sprint 19: event journal", () => {
  it("captures chronological events with working filters", () => {
    const { town, director, miraId } = createDemoTown(7001);
    const inspector = new SimulationInspector(town, director);
    // Run past the initial sleep block (420 min) into an active morning.
    step(town, director, 1200);

    const all = inspector.getEvents();
    expect(all.length).toBeGreaterThan(10);
    for (let i = 1; i < all.length; i++)
      expect(all[i]!.seq).toBeGreaterThan(all[i - 1]!.seq);

    const miraOnly = inspector.getEvents({ agent: miraId });
    expect(miraOnly.length).toBeGreaterThan(0);
    expect(miraOnly.every((e) => e.agent === miraId)).toBe(true);

    const limited = inspector.getEvents({ limit: 5 });
    expect(limited).toHaveLength(5);
    // Limit keeps the MOST RECENT five.
    expect(limited[4]!.seq).toBe(all[all.length - 1]!.seq);

    const moves = inspector.getEvents({ kind: "movement", agent: miraId, limit: 3 });
    expect(moves.every((e) => e.kind === "movement")).toBe(true);
    expect(moves.every((e) => /arrived at /.test(e.text))).toBe(true);

    const searched = inspector.getEvents({ textContains: "plans" });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((e) => e.text.toLowerCase().includes("plans"))).toBe(true);
  });

  it("arrival observations stay below the encode floor (no memory spam)", () => {
    const { town, director, miraId, rohanId, anikaId } = createDemoTown(12345);
    new SimulationInspector(town, director); // attach journal like real hosts
    const before = ["npc_mira", "npc_rohan", "npc_anika"]
      .map((id) => town.memory.storeFor(id).count);
    expect(before).toEqual([0, 0, 0]);

    // Pure movement window: no social events injected.
    step(town, director, 240);

    // Memories may exist from autonomous conversations but arrivals alone
    // must not encode: verify every stored memory is a non-arrival type.
    for (const id of [miraId, rohanId, anikaId])
      for (const m of town.memory.storeFor(id).all)
        expect(m.eventType).not.toBe("arrival");
  });
});

describe("Sprint 19: memory inspection", () => {
  it("supports recency/importance/retrieval sorting without mutating state", () => {
    const { town, director, miraId, rohanId } = createDemoTown(9001);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 60);
    town.social.attempt(rohanId, miraId, SocialActionType.Insult);
    town.social.attempt(rohanId, miraId, SocialActionType.Help);
    step(town, director, 30);
    const store = town.memory.storeFor(miraId);
    if (store.count < 2) throw new Error("scenario expected >=2 memories");

    const before = store.all.map((m) => `${m.id}:${m.accessCount}:${m.lastAccessMinutes}`).join();

    const recent = inspector.getMemories(miraId, { sort: "recency" });
    for (let i = 1; i < recent.length; i++)
      expect(recent[i]!.timestampMinutes).toBeLessThanOrEqual(recent[i - 1]!.timestampMinutes);

    const important = inspector.getMemories(miraId, { sort: "importance" });
    for (let i = 1; i < important.length; i++)
      expect(important[i]!.importance).toBeLessThanOrEqual(important[i - 1]!.importance);

    const retrieved = inspector.getMemories(miraId, { sort: "retrieval", limit: 3 });
    expect(retrieved.length).toBeGreaterThan(0);
    expect(retrieved[0]!.retrievalScore).toBeDefined();
    for (const r of retrieved) expect(r.source).toBeTruthy();

    // Peek must not have touched access accounting (gameplay retrieve() does).
    const after = store.all.map((m) => `${m.id}:${m.accessCount}:${m.lastAccessMinutes}`).join();
    expect(after).toBe(before);
  });

  it("filters memories by subject actor", () => {
    const { town, director, miraId, rohanId } = createDemoTown(9001);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 60);
    town.social.attempt(rohanId, miraId, SocialActionType.Insult);
    step(town, director, 10);

    const aboutRohan = inspector.getMemories(miraId, { aboutAgent: rohanId });
    expect(aboutRohan.length).toBeGreaterThan(0);
    expect(aboutRohan.every((m) => m.subject === rohanId)).toBe(true);
    // Memory subject convention: observer remembers the OTHER party.
    expect(aboutRohan.some((m) => /rohan insult/i.test(m.summary))).toBe(true);
  });
});

describe("Sprint 19: beliefs & gossip visibility", () => {
  it("direct experience forms first-hand beliefs; conversations transfer them", () => {
    const { town, director, miraId, rohanId, anikaId } = createDemoTown(4242);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 60);

    // Rohan insults Mira publicly at home; both form first-hand regard beliefs.
    town.social.attempt(rohanId, miraId, SocialActionType.Insult);

    const miraOnRohan = inspector.getBeliefs(miraId)
      .filter((b) => b.subjectKey === rohanId && b.predicate === "regard");
    expect(miraOnRohan).toHaveLength(1);
    expect(miraOnRohan[0]!.stance).toBeLessThan(-0.4);
    expect(miraOnRohan[0]!.hopCount).toBe(0);

    // Mira holds a strong negative belief ABOUT Anika; a Talk from Mira should
    // gossip it to whoever is nearby (first other resident = Rohan).
    town.beliefs.learnDirect(miraId, anikaId, "regard", -0.9, 0.95, 999_001,
      town.clock.currentTime.totalMinutes);
    town.events.publish("sim:plan-step-completed", { agent: miraId, action: "act_talk", index: 0 });

    const convos = inspector.journal.query({ kind: "conversation" });
    expect(convos.length).toBeGreaterThan(0);

    const rohanOnAnika = inspector.getBeliefs(rohanId)
      .filter((b) => b.subjectKey === anikaId && b.predicate === "regard");
    expect(rohanOnAnika).toHaveLength(1);
    expect(rohanOnAnika[0]!.hopCount).toBe(1);
    expect(rohanOnAnika[0]!.sourceAgent).toBe(miraId);
    expect(rohanOnAnika[0]!.confidence).toBeLessThan(0.95); // hop decay applied

    const stats = inspector.getTownStats();
    expect(stats.conversations).toBe(convos.length);
    expect(stats.beliefs).toBeGreaterThan(0);
  });
});

describe("Sprint 19: read-only invariant", () => {
  it("the whole inspector API leaves simulation state bit-for-bit untouched", () => {
    const { town, director, miraId, rohanId } = createDemoTown(7001);
    const inspector = new SimulationInspector(town, director);
    step(town, director, 180);
    town.social.attempt(rohanId, miraId, SocialActionType.Chat);

    const before = fingerprint(town, director);

    void inspector.getAgents();
    void inspector.getAgent(miraId);
    void inspector.getAgent(rohanId);
    void inspector.getAgent("npc_unknown");
    void inspector.getRelationships(miraId);
    void inspector.getMemories(miraId);
    void inspector.getMemories(miraId, { sort: "recency" });
    void inspector.getMemories(miraId, { sort: "importance" });
    void inspector.getMemories(miraId, { sort: "retrieval" });
    void inspector.getMemories(miraId, { sort: "retrieval", aboutAgent: rohanId, limit: 2 });
    void inspector.getEvents();
    void inspector.getEvents({ agent: miraId, limit: 4 });
    void inspector.getEvents({ typePrefix: "sim:plan" });
    void inspector.getBeliefs(rohanId);
    void inspector.utilityFor(miraId);
    void inspector.planFor(miraId);
    void inspector.getTime();
    void inspector.getTownStats();
    void inspector.getConversations();

    const after = fingerprint(town, director);
    expect(after).toBe(before);
  });
});

describe("Sprint 19: time info", () => {
  it("formats day-of-week, hh:mm and weather labels", () => {
    const { town, director } = createDemoTown(7001);
    const inspector = new SimulationInspector(town, director);
    const t = inspector.getTime();
    expect(t.day).toBe(0);
    expect(t.dayName).toBe("Mon");
    expect(t.hhmm).toMatch(/^\d{2}:\d{2}$/);
    expect(["Clear", "Cloudy", "Rain", "HeavyRain"]).toContain(t.weather);
  });
});
