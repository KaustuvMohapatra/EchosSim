/** Sprint 21 — provider abstraction: validation, resilience, metrics, fallback. */
import { describe, expect, it } from "vitest";
import {
  AiError, LanguageModelService, MockLanguageModelProvider,
  OpenAICompatibleLanguageModelProvider, TemplateLanguageModelProvider,
  DEFAULT_AI_CONFIG,
  type DialogueGenerationRequest,
} from "@echosim/ai";

const REQ: DialogueGenerationRequest = {
  speakerId: "npc_mira", speakerName: "Mira", listenerName: "Rohan",
  intent: "Gossip", topicLabel: "the bakery",
  personalityDescriptors: ["creative", "playful"],
  knownFacts: ["rohan insulted anika yesterday"],
  recentTurns: [], maxUtterances: 3,
};

function okFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("S21: providers", () => {
  it("template provider is deterministic and schema-valid", async () => {
    const p = new TemplateLanguageModelProvider();
    const a = await p.generateDialogue(REQ);
    const b = await p.generateDialogue(REQ);
    expect(a).toEqual(b);
    expect(a.utterances.length).toBeGreaterThan(0);
    expect(a.utterances[0]).toContain("bakery");
  });

  it("mock provider honours scripted responses and counts calls", async () => {
    const m = new MockLanguageModelProvider();
    m.scriptDialogue(() => [{ utterance: "scripted line", tone: "dry" }]);
    const r = await m.generateDialogue(REQ);
    expect(r.utterances).toEqual(["scripted line"]);
    expect(m.calls.dialogue).toBe(1);
  });

  it("openai-compatible parses strict-JSON content via injected fetch", async () => {
    const fetchImpl = okFetch({
      choices: [{ message: { content:
        '[{"utterance":"Heard about the bakery?","tone":"hushed"}]' } }],
    });
    const p = new OpenAICompatibleLanguageModelProvider(
      { baseUrl: "http://x/v1", model: "m", temperature: 0.5 },
      { fetchImpl });
    const r = await p.generateDialogue(REQ);
    expect(r.utterances).toEqual(["Heard about the bakery?"]);
  });

  it("no api key is ever required or embedded by the factory path", () => {
    // Config only names an ENV VAR; key resolution happens at call time.
    expect(DEFAULT_AI_CONFIG.apiKeyEnv).toBeUndefined();
    expect(JSON.stringify(DEFAULT_AI_CONFIG)).not.toMatch(/sk-/i);
  });
});

describe("S21: guarded service", () => {
  it("disabled mode never touches the network and returns template output", async () => {
    let networkTouched = false;
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: false, provider: "openai-compatible" },
      { fetchImpl: okFetch({}) as typeof fetch },
    );
    void networkTouched;
    const r = await svc.generateDialogue(REQ);
    expect(r.source).toBe("template");
    expect(svc.metrics.snapshot().calls).toBe(0);
  });

  it("invalid JSON from endpoint falls back to template with failure metric", async () => {
    const fetchImpl = okFetch({
      choices: [{ message: { content: "not json at all" } }],
    });
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "openai-compatible",
        baseUrl: "http://x/v1", model: "m", retry: { maxAttempts: 1, backoffMs: 1 } },
      { fetchImpl },
    );
    const r = await svc.generateDialogue(REQ);
    expect(r.source).toBe("template");
    expect(r.utterances.length).toBeGreaterThan(0); // still usable
    const snap = svc.metrics.snapshot();
    expect(snap.failure).toBe(1);
    expect(snap.failuresByKind["invalid-json"]).toBe(1);
    expect(snap.fallback).toBe(1);
  });

  it("retries retryable failures then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response("overloaded", { status: 500 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: '["second try works"]' } }],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "openai-compatible",
        baseUrl: "http://x/v1", model: "m",
        retry: { maxAttempts: 3, backoffMs: 1 }, timeoutMs: 1000 },
      { fetchImpl, sleep: async () => {} },
    );
    const r = await svc.generateDialogue(REQ);
    expect(r.source).toBe("llm");
    expect(calls).toBe(2);
    expect(svc.metrics.snapshot().success).toBe(1);
  });

  it("timeout aborts and falls back cleanly", async () => {
    const slowFetch = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("AbortError")));
      })) as unknown as typeof fetch;

    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "openai-compatible",
        baseUrl: "http://x/v1", model: "m", timeoutMs: 15,
        retry: { maxAttempts: 1, backoffMs: 1 } },
      { fetchImpl: slowFetch },
    );
    const r = await svc.generateDialogue(REQ);
    expect(r.source).toBe("template");
    expect(svc.metrics.snapshot().failuresByKind["timeout"]).toBe(1);
  });

  it("caches identical archetype-level dialogue requests", async () => {
    const m = new MockLanguageModelProvider();
    m.scriptDialogue(() => [{ utterance: "cached line" }]);
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" },
      { provider: m },
    );
    const a = await svc.generateDialogue(REQ);
    const b = await svc.generateDialogue({ ...REQ }); // identical buckets
    expect(a.source).toBe("llm");
    expect(b.source).toBe("cache");
    expect(m.calls.dialogue).toBe(1);
    expect(svc.metrics.snapshot().cacheHits).toBe(1);
  });

  it("reflection results are never served from cache", async () => {
    const m = new MockLanguageModelProvider();
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: m });
    const base = { agentId: "npc_mira", agentName: "Mira", subjectKey: "npc_rohan",
      concept: "reliability", stance: 0.8, confidence: 0.7,
      supportingSummaries: ["helped twice"] };
    await svc.generateReflection(base);
    const second = await svc.generateReflection(base);
    expect(second.source).toBe("llm"); // not cache
    expect(m.calls.reflection).toBe(2);
  });

  it("schema mismatch (too many utterances) rejects without retrying", async () => {
    const m = new MockLanguageModelProvider();
    m.scriptDialogue(() => [1, 2, 3, 4].map((i) => ({ utterance: `line ${i}` })));
    const svc = new LanguageModelService(
      { ...DEFAULT_AI_CONFIG, enabled: true, provider: "mock" }, { provider: m });
    const r = await svc.generateDialogue({ ...REQ, maxUtterances: 3 });
    expect(r.source).toBe("template");
    expect(svc.metrics.snapshot().failuresByKind["schema-mismatch"]).toBe(1);
  });
});
