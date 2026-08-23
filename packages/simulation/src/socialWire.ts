/**
 * Autonomous social wiring: connects the existing social systems (perception,
 * memory, relationships, emotion, beliefs, conversations) into the running
 * town. Everything here is deterministic and engine-free; it only subscribes to
 * simulation events and calls simulation systems.
 *
 * Restores behaviour the .NET implementation had (auto-sources + social
 * reactions + conversation flow) that was not yet re-wired after the TS port.
 */
import type { Town } from "./town.js";
import {
  ObservationReach,
  SocialActionType,
  ConversationIntent,
} from "@echosim/social";
import { PersonalityTrait } from "@echosim/cognition";

/** Event types that reshape relationships (whitelist — noise never links people). */
const SOCIAL_EVENT_TYPES: ReadonlySet<string> = new Set([
  "greeting", "chat", "compliment", "tease", "joke", "help", "ask_for_help",
  "comfort", "apologize", "invite", "confront", "insult", "insult_incident",
  "gossip", "goodbye",
]);

/** Direct-experience opinion stance about the other party, per event type. */
const OPINION_STANCE: Readonly<Record<string, number>> = {
  insult_incident: -0.7, insult: -0.65, confront: -0.4, tease: -0.1,
  help: 0.6, gift: 0.5, comfort: 0.5, compliment: 0.4, apologize: 0.3,
};

/** Valence impulse applied to direct participants, per event type. */
const EMOTION_IMPULSE: Readonly<Record<string, number>> = {
  insult_incident: -0.25, insult: -0.22, confront: -0.12, tease: -0.04,
  help: 0.18, comfort: 0.15, gift: 0.14, compliment: 0.1, apologize: 0.08,
  chat: 0.03, greeting: 0.02,
};

export interface ConversationRecord {
  initiator: string; listener: string; intent: string;
  topicLabel: string; utterances: readonly string[];
  transferredBelief?: string;
  atMinutes: number;
}

export function wireAutonomousSocial(town: Town): void {
  // --- a) Movements become quiet same-location observations. ---
  // "arrival" sits below the encode floor by design: perception logs stay
  // alive without flooding episodic memory (noise filtering regression holds).
  town.events.subscribe<{ agent: string; to: string }>("sim:agent-moved", (e) => {
    town.perception.publish("arrival", [e.agent], e.to, ObservationReach.SameLocation, 0.3);
  });

  // --- b) Recorded social observations reshape observers. ---
  town.events.subscribe<{
    observer: string; eventType: string; actors: readonly string[];
    confidence: number; eventId: number;
  }>("sim:observation-recorded", (o) => onObservation(town, o));

  // --- c) A completed Talk action becomes a real deterministic conversation. ---
  town.events.subscribe<{ agent: string; action: string }>(
    "sim:plan-step-completed", (e) => {
      if (e.action === "act_talk") driveConversation(town, e.agent);
    });
}

function onObservation(
  town: Town,
  o: { observer: string; eventType: string; actors: readonly string[]; confidence: number; eventId: number },
): void {
  if (!SOCIAL_EVENT_TYPES.has(o.eventType)) return;

  // Relationship link: observer -> other party (self-link guarded inside).
  const actor = o.actors.find((a) => a !== o.observer);
  if (!actor) return;
  const second = o.actors.length >= 2 ? o.actors[1] : undefined;
  const target = second !== undefined && second !== actor ? second : null;
  town.relationships.handleSocialEvent(o.observer, o.eventType, actor, target, o.confidence);

  // Emotion impulse for direct participants only.
  const impulse = EMOTION_IMPULSE[o.eventType];
  if (impulse !== undefined && o.actors.includes(o.observer)) {
    const hostile = impulse < 0;
    town.emotion.apply(o.observer, impulse, hostile ? 0.15 : 0.05);
  }

  // First-hand belief about the other party ("regard").
  const stanceBase = OPINION_STANCE[o.eventType];
  if (stanceBase !== undefined) {
    const involved = o.actors.includes(o.observer);
    const stance = Math.max(-1, Math.min(1, stanceBase * (involved ? 1 : 0.7)));
    town.beliefs.learnDirect(
      o.observer, actor, "regard", stance,
      Math.min(1, o.confidence * 0.9), o.eventId, town.clock.currentTime.totalMinutes,
    );
  }
}

function driveConversation(town: Town, initiatorId: string): void {
  const social = town.social;
  if (!social) return;
  const now = town.clock.currentTime.totalMinutes;

  const mine = town.agentsById.get(initiatorId);
  if (!mine?.hasLocation) return;
  const listener = town.residents.orderedIds().find((id) => {
    if (id === initiatorId) return false;
    const s = town.agentsById.get(id);
    return !!s?.hasLocation && s.currentLocationId === mine.currentLocationId;
  });
  if (!listener) return;

  const result = social.attempt(initiatorId, listener, SocialActionType.Chat);
  if (!result.accepted || result.emittedEvent === undefined) return;
  const originEvent = result.emittedEvent;

  const initiatorMind = town.residents.mind(initiatorId);
  const listenerMind = town.residents.mind(listener);

  const intent = town.conversations.selectIntent(initiatorId, listener, {
    relationshipOf: (a, b) => town.relationships.getOrCreate(a, b),
    strongestFirstHandNegativeAboutThirdParty: (speaker, excluding) =>
      strongestFirstHandNegative(town, speaker, excluding),
    freshestBeliefAboutOther: (speaker, excluding) => {
      const fresh = 1440;
      return town.beliefs.storeFor(speaker).all.some(
        (b) => b.subjectKey === excluding && b.hopCount > 0 &&
               now - b.learnedAtMinutes <= fresh);
    },
    chattiness: (speaker) =>
      town.residents.mind(speaker).personality.get(PersonalityTrait.Sociability),
    chance: (p) => town.socialChance(p),
  });

  let topicLabel = "the neighbourhood";
  let transferSubject: string | undefined;
  if (intent === ConversationIntent.Gossip || intent === ConversationIntent.Complain) {
    const strong = strongestFirstHandNegative(town, initiatorId, listener);
    if (strong) {
      const subjectMind = town.residents.tryMind(strong.subjectKey);
      topicLabel = subjectMind ? subjectMind.displayName : strong.subjectKey;
      transferSubject = strong.subjectKey;
    }
  }

  const rareTeaseLine = intent === ConversationIntent.Tease
    ? () => town.conversations.rareTeaseLine(
        initiatorId, listener, now,
        (a, b) => town.relationships.getOrCreate(a, b),
        (p) => town.socialChance(p))
    : undefined;

  const utterances = town.conversations.buildUtterances(
    intent, initiatorMind.displayName, listenerMind.displayName,
    listenerMind.displayName, topicLabel,
    (max) => town.socialRng().nextInt(0, max),
    rareTeaseLine,
  );

  let transferredBelief: string | undefined;
  if (transferSubject) {
    const trust = town.relationships.getOrCreate(listener, initiatorId).trust;
    const moved = town.beliefs.tryTransfer(
      initiatorId, listener, transferSubject, "regard", originEvent, trust, now);
    if (moved) transferredBelief = `${transferSubject}|regard`;
  }

  const record: ConversationRecord = {
    initiator: initiatorId, listener, intent: ConversationIntent[intent],
    topicLabel, utterances, atMinutes: now,
    ...(transferredBelief !== undefined ? { transferredBelief } : {}),
  };
  town.events.publish("sim:conversation", record);
}

/** Strongest first-hand (hop 0) negative regard belief held by speaker. */
function strongestFirstHandNegative(
  town: Town, speaker: string, excluding: string,
): { subjectKey: string; stance: number; confidence: number } | undefined {
  let best: { subjectKey: string; stance: number; confidence: number } | undefined;
  let bestId = Number.MAX_SAFE_INTEGER;
  for (const b of town.beliefs.storeFor(speaker).all) {
    if (b.hopCount !== 0 || b.stance >= -0.4 || b.confidence <= 0.5) continue;
    if (b.subjectKey === excluding || !town.residents.tryMind(b.subjectKey)) continue;
    if (!best || b.stance < best.stance ||
        (b.stance === best.stance && b.id < bestId)) {
      best = { subjectKey: b.subjectKey, stance: b.stance, confidence: b.confidence };
      bestId = b.id;
    }
  }
  return best;
}
