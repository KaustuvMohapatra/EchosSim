/**
 * Dialogue rendering bridge (Sprint 22): turns simulation-owned conversation
 * records into bounded LLM contexts and renders surface text ONLY.
 *
 * Hard rules honoured here:
 * - Simulation outcomes never depend on this module (async, read-only).
 * - Context contains only whitelisted relevant data (spec 22.2), never the
 *   whole memory store.
 * - Tone may flavour rendering; it cannot change what happened (spec 22.5).
 */
import type { Town } from "./town.js";
import type { ConversationRecord } from "./socialWire.js";
import {
  PersonalityTrait,
} from "@echosim/cognition";
import type {
  DialogueGenerationRequest, LanguageModelService,
  ManagedDialogueResult,
} from "@echosim/ai";

/** Derive concise stylistic descriptors from personality + mood (spec 22.3). */
export function voiceDescriptors(
  traits: { get(t: PersonalityTrait): number },
  moodValence: number,
): string[] {
  const out: string[] = [];
  const t = (k: PersonalityTrait) => traits.get(k);
  if (t(PersonalityTrait.Openness) > 0.7) out.push("creative");
  if (t(PersonalityTrait.Sociability) > 0.6) out.push("sociable");
  if (t(PersonalityTrait.Honesty) > 0.65) out.push("candid");
  if (t(PersonalityTrait.GrudgeRetention) > 0.6) out.push("holds grudges");
  if (t(PersonalityTrait.EmotionalVolatility) > 0.65) out.push("moody");
  if (t(PersonalityTrait.Generosity) > 0.7) out.push("warm toward friends");
  out.push(moodValence > 0.1 ? "in good spirits" : moodValence < -0.1 ? "downbeat" : "even-keeled");
  return out;
}

function relationshipSummary(label: string): string {
  switch (label) {
    case "CloseFriend": return "close friend";
    case "Friend": return "friend";
    case "Crush": return "secretly admires them";
    case "Rival": return "rival";
    case "Enemy": return "open enemy";
    case "Acquaintance": return "acquaintance";
    default: return "barely knows them";
  }
}

function moodBucket(v: number): string {
  return v > 0.15 ? "cheerful" : v < -0.15 ? "sour" : "calm";
}

/** Bounded known-facts for the topic: beliefs about the subject plus a few
 *  strongest related memories. Never the whole store. */
function knownFactsFor(
  town: Town, speakerId: string, topicSubjectKey: string | undefined,
  listenerName: string,
): string[] {
  const facts: string[] = [];
  const now = town.clock.currentTime.totalMinutes;

  if (topicSubjectKey !== undefined && topicSubjectKey !== speakerId) {
    const belief = town.beliefs.tryStoreFor(speakerId)
      ?.tryGet(topicSubjectKey, "regard");
    if (belief) {
      const via = belief.hopCount > 0
        ? ` (heard via ${belief.sourceAgent ?? "someone"}, not firsthand)`
        : "";
      const stanceWord = belief.stance > 0.2 ? "good things"
        : belief.stance < -0.2 ? "bad things" : "mixed things";
      facts.push(`Speaker believes ${stanceWord} about ${topicSubjectKey}${via}.`);
    }
  }

  const store = town.memory.tryStoreFor(speakerId);
  const memories = topicSubjectKey !== undefined && store !== undefined
    ? town.retriever.peek(
        store, { aboutAgent: topicSubjectKey, nowMinutes: now }, 3,
      )
    : [];
  for (const m of memories)
    facts.push(`Remembers: ${m.memory.summary}.`);

  facts.push(`Listener's name is ${listenerName}.`);
  return facts.slice(0, 6);
}

export function buildDialogueContext(
  town: Town,
  record: ConversationRecord,
): DialogueGenerationRequest {
  const speakerMind = town.residents.mind(record.initiator);
  const listenerMind = town.residents.mind(record.listener);

  // Gossip/complain records carry a topic person in the label when available.
  let topicSubjectKey: string | undefined;
  for (const id of town.residents.orderedIds()) {
    if (record.topicLabel.includes(town.residents.mind(id).displayName)) {
      topicSubjectKey = id;
      break;
    }
  }

  const rel = town.relationships.tryGet(record.initiator, record.listener);

  return {
    speakerId: record.initiator,
    speakerName: speakerMind.displayName,
    listenerName: listenerMind.displayName,
    intent: record.intent,
    topicLabel: record.topicLabel,
    personalityDescriptors: voiceDescriptors(speakerMind.personality, speakerMind.emotionValence),
    moodDescriptor: moodBucket(speakerMind.emotionValence),
    relationshipSummary: rel !== undefined
      ? relationshipSummary(relLabel(rel.affinity, rel.trust, rel.grievance))
      : "barely knows them",
    knownFacts: knownFactsFor(town, record.initiator, topicSubjectKey, listenerMind.displayName),
    recentTurns: [],
    maxUtterances: record.intent === "Gossip" || record.intent === "Complain" ? 2 : 1,
  };
}

function relLabel(affinity: number, trust: number, grievance: number): string {
  if (grievance >= 0.6 && affinity <= -0.2) return "Enemy";
  if (affinity <= -0.35) return "Rival";
  if (affinity >= 0.6 && trust >= 0.5) return "CloseFriend";
  if (affinity >= 0.3) return "Friend";
  if (affinity >= 0.05) return "Acquaintance";
  return "Stranger";
}

export interface RenderedDialogue {
  eventSeqHint?: number;
  request: DialogueGenerationRequest;
  result: ManagedDialogueResult;
}

const ALLOWED_TONES = new Set([
  "neutral", "friendly", "warm", "playful", "hushed", "weary", "tense",
  "gentle", "sincere", "conspiratorial", "dry", "cheerful", "somber",
]);

/** Renders dialogue for presentation only. Never mutates the town. */
export async function renderDialogue(
  town: Town,
  service: LanguageModelService,
  record: ConversationRecord,
): Promise<RenderedDialogue> {
  const request = buildDialogueContext(town, record);
  const result = await service.generateDialogue(request);
  // Spec 22.5: a wild tone is downgraded to neutral; it may only colour text.
  if (result.tone !== undefined && !ALLOWED_TONES.has(result.tone)) {
    result.tone = "neutral";
  }
  return { request, result };
}
