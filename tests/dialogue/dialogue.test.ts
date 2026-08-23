/** Sprint 22 — validated generative dialogue: context bounds, rendering, and
 *  the core acceptance guarantee: AI off vs AI on produce IDENTICAL towns. */
import { describe, expect, it } from "vitest";
import { createDemoTown } from "@echosim/content";
import { PlanningDirector } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import {
  buildDialogueContext, renderDialogue,
} from "@echosim/simulation";
import { LanguageModelService, MockLanguageModelProvider, DEFAULT_AI_CONFIG } from "@echosim/ai";
import type { ConversationRecord } from "@echosim/simulation";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

function fingerprint(town: Town, director: PlanningDirector): string {
  const parts: unknown[] = [town.clock.currentTime.totalMinutes];
  for (const id of town.residents.orderedIds()) {
    const m = town.residents.mind(id);
    parts.push([...m.needs.all()].map((n) => n.current).join(","),
      m.emotionValence, m.committedGoal?.id ?? null,
      [...m.plannerMemory].sort().join("|"));
    parts.push(town.memory.storeFor(id).all.map(
      (x) => `${x.id}/${x.importance.toFixed(4)}`).join(";"));
  }
  parts.push([...town.relationships.all()].map((l) =>
    `${l.from}>${l.to}:${l.rel.affinity.toFixed(5)}:${l.rel.trust.toFixed(5)}`).sort());
  parts.push(director.totalPlansSucceeded, director.totalPlansFailed);
  return JSON.stringify(parts);
}

describe("S22: dialogue context builder", () => {
  it("includes only bounded, relevant data (never the whole memory store)", async () => {
    const { town, director, miraId, rohanId } = createDemoTown(7001);
    step(town, director, 120);
    // Give Mira lots of memories + a belief about Rohan.
    for (let i = 0; i < 30; i++)
      town.social.attempt(rohanId, miraId, 1 /* Chat */);

    town.beliefs.learnDirect(miraId, rohanId, "regard", -0.5, 0.9, 555,
      town.clock.currentTime.totalMinutes);

    const record: ConversationRecord = {
      initiator: miraId, listener: rohanId, intent: "Complain",
      topicLabel: "Rohan", utterances: ["template"], atMinutes: town.clock.currentTime.totalMinutes,
    };
    const ctx = buildDialogueContext(town, record);

    expect(ctx.speakerName).toBe("Mira");
    expect(ctx.intent).toBe("Complain");
    expect(ctx.knownFacts.length).toBeLessThanOrEqual(6);           // bounded
    expect(ctx.personalityDescriptors.length).toBeGreaterThan(0);
    expect(typeof ctx.relationshipSummary).toBe("string");
    // No memory-store dump: facts are individual short strings.
    for (const f of ctx.knownFacts) expect(f.length).toBeLessThan(200);
    // Belief provenance surfaced when the topic person matches.
    expect(ctx.knownFacts.some((f) => /believes/i.test(f))).toBe(true);
  });
});

describe("S22: renderer", () => {
  it("renders via provider without mutating the town", async () => {
    const { town, director, miraId, rohanId } = createDemoTown(7001);
    step(town, director, 120);
    const mock = new MockLanguageModelProvider();
    mock.scriptDialogue(() => [{ utterance: "Rendered line.", tone: "playful" }]);
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: mock });

    const before = fingerprint(town, director);
    const record: ConversationRecord = {
      initiator: miraId, listener: rohanId, intent: "Gossip",
      topicLabel: "the bakery", utterances: ["template"], atMinutes: 0,
    };
    const rendered = await renderDialogue(town, svc, record);
    expect(rendered.result.source).toBe("llm");
    expect(rendered.result.utterances).toEqual(["Rendered line."]);
    expect(fingerprint(town, director)).toBe(before); // read-only rendering
  });

  it("downgrades unknown tones to neutral (tone cannot change meaning)", async () => {
    const { town, director } = createDemoTown(7001);
    const mock = new MockLanguageModelProvider();
    mock.scriptDialogue(() => [{ utterance: "Hi.", tone: "furious-rant" }]);
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: mock });
    const rendered = await renderDialogue(town, svc, {
      initiator: "npc_mira", listener: "npc_rohan", intent: "Greet",
      topicLabel: "x", utterances: [], atMinutes: 0,
    });
    expect(rendered.result.tone).toBe("neutral");
  });

  it("falls back to template lines when the provider fails entirely", async () => {
    const { town } = createDemoTown(7001);
    const broken = new MockLanguageModelProvider();
    broken.scriptDialogue(() => { throw new Error("boom"); });
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: broken });
    const rendered = await renderDialogue(town, svc, {
      initiator: "npc_mira", listener: "npc_rohan", intent: "SmallTalk",
      topicLabel: "y", utterances: [], atMinutes: 0,
    });
    expect(rendered.result.source).toBe("template");
    expect(rendered.result.utterances.length).toBeGreaterThan(0);
  });
});

describe("S22 ACCEPTANCE: outcome equivalence AI-off vs AI-on(mock)", () => {
  it("same seed + same steps ⇒ byte-identical towns regardless of AI", async () => {
    // Town A: no AI anywhere.
    const a = createDemoTown(7001);
    step(a.town, a.director, 1440);

    // Town B: identical run, plus an AI renderer invoked for every conversation.
    const b = createDemoTown(7001);
    const records: ConversationRecord[] = [];
    b.town.events.subscribe<ConversationRecord>("sim:conversation",
      (r) => records.push({ ...r }));

    const mock = new MockLanguageModelProvider();
    mock.scriptDialogue(() => [{ utterance: "LLM-flavoured line.", tone: "dry" }]);
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: mock });

    step(b.town, b.director, 1440);
    for (const r of records) await renderDialogue(b.town, svc, r);

    // Structural conversation data identical; simulation state identical.
    expect(records.length).toBeGreaterThan(0);
    expect(fingerprint(b.town, b.director)).toBe(fingerprint(a.town, a.director));
  });
});
