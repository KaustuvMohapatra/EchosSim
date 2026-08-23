/** Social layer: perception, memory, emotion, relationships, beliefs/gossip, social actions. */
import { EventId } from "@echosim/core";
import { NeedKind, PersonalityTrait } from "@echosim/cognition";

// ---------------- Perception ----------------
export enum PerceptionSource { DirectParticipation, VisualNearby, AudibleNearby, Announcement }
export enum ObservationReach { SameLocation, Nearby, Town }

export interface Observation {
  observer: string; eventId: number; eventType: string;
  actors: string[]; where?: string; timestampMinutes: number;
  confidence: number; source: PerceptionSource;
}

export interface PerceptionHost {
  residentIds(): string[];
  locationOf(agent: string): string | undefined;
}

export class PerceptionSystem {
  private readonly logs = new Map<string, Observation[]>();
  private nextEventNumber = 1;
  logCapacity = 200;
  totalDelivered = 0;
  isAdjacent?: (a: string, b: string) => boolean;

  constructor(private readonly host: PerceptionHost,
              private readonly nowMinutes: () => number,
              private readonly onRecorded?: (o: Observation) => void) {}

  publish(eventType: string, actors: string[], where: string | undefined,
          reach: ObservationReach, baseConfidence = 1): number {
    if (!eventType.trim()) throw new Error("Event type required.");
    const id = this.nextEventNumber++;
    const atMinutes = this.nowMinutes();
    for (const observer of this.host.residentIds()) {
      let o: Observation | null = null;
      if (actors.includes(observer)) {
        o = mkObs(observer, id, eventType, actors, where, atMinutes, baseConfidence, PerceptionSource.DirectParticipation);
      } else if (reach === ObservationReach.Town) {
        o = mkObs(observer, id, eventType, actors, where, atMinutes, 0.95 * baseConfidence, PerceptionSource.Announcement);
      } else if (where !== undefined) {
        const loc = this.host.locationOf(observer);
        if (loc !== undefined) {
          const same = loc === where;
          const audible = same || (reach === ObservationReach.Nearby && this.isAdjacent?.(loc, where) === true);
          if (audible) {
            const src = same ? PerceptionSource.VisualNearby : PerceptionSource.AudibleNearby;
            const conf = same ? 0.9 * baseConfidence : 0.7 * baseConfidence;
            o = mkObs(observer, id, eventType, actors, where, atMinutes, conf, src);
          }
        }
      }
      if (o) this.append(o);
    }
    return id;
  }

  announce(eventType: string, actors: string[], where?: string): number {
    return this.publish(eventType, actors, where, ObservationReach.Town);
  }

  private append(o: Observation): void {
    let log = this.logs.get(o.observer);
    if (!log) { log = []; this.logs.set(o.observer, log); }
    log.push(o);
    if (log.length > this.logCapacity) log.shift();
    this.totalDelivered++;
    this.onRecorded?.(o);
  }

  observationsOf(agent: string): readonly Observation[] { return this.logs.get(agent) ?? []; }
}

function mkObs(observer: string, eventId: number, eventType: string, actors: string[],
  where: string | undefined, atMinutes: number, confidence: number,
  source: PerceptionSource): Observation {
  return { observer, eventId, eventType, actors, where, timestampMinutes: atMinutes,
           confidence: Math.min(1, Math.max(0, confidence)), source };
}

// ---------------- Memory ----------------
export interface EpisodicMemory {
  id: number; timestampMinutes: number; eventType: string; subject: string;
  where?: string; summary: string; importance: number; valence: number;
  confidence: number; source: PerceptionSource; sourceEventId: number;
  accessCount: number; lastAccessMinutes: number;
}

const IMPORTANCE_TABLE: Record<string, { importance: number; valence: number }> = {
  insult_incident: { importance: 0.72, valence: -0.8 },
  insult: { importance: 0.7, valence: -0.75 },
  help: { importance: 0.75, valence: 0.7 },
  gift: { importance: 0.68, valence: 0.6 },
  compliment: { importance: 0.52, valence: 0.5 },
  tease: { importance: 0.42, valence: -0.15 },
  confront: { importance: 0.6, valence: -0.45 },
  comfort: { importance: 0.55, valence: 0.55 },
  apologize: { importance: 0.5, valence: 0.4 },
  gossip: { importance: 0.45, valence: 0 },
  chat: { importance: 0.34, valence: 0.1 },
  greeting: { importance: 0.2, valence: 0.1 },
  location_closed: { importance: 0.3, valence: -0.2 },
  location_opened: { importance: 0.18, valence: 0.05 },
  town_announcement: { importance: 0.4, valence: 0.1 },
};
export function importanceFor(eventType: string) {
  return IMPORTANCE_TABLE[eventType] ?? { importance: 0.4, valence: 0 };
}
export const MEMORY_ENCODE_FLOOR = 0.15;

export class MemoryEncoder {
  /** Returns null for noise below the floor. Subject = the OTHER party (regression-tested). */
  encode(observation: Observation, personality: { get(t: PersonalityTrait): number }, id: number): EpisodicMemory | null {
    const t = importanceFor(observation.eventType);
    let importance = t.importance;
    if (importance < MEMORY_ENCODE_FLOOR) return null;
    if (t.valence < 0 && observation.actors.length > 0)
      importance *= 1 + personality.get(PersonalityTrait.GrudgeRetention) * 0.3;
    const sourceFactor =
      observation.source === PerceptionSource.DirectParticipation ? 1 :
      observation.source === PerceptionSource.VisualNearby ? 0.9 :
      observation.source === PerceptionSource.AudibleNearby ? 0.8 : 0.7;
    importance *= sourceFactor;

    let subject = "";
    for (const a of observation.actors) if (a !== observation.observer) { subject = a; break; }
    if (!subject && observation.actors.length > 0) subject = observation.actors[0]!;

    const spaced = observation.eventType.replace(/_/g, " ");
    const summary =
      observation.actors.length >= 2 ? `${observation.actors[0]} ${spaced} ${observation.actors[1]}` :
      observation.actors.length === 1 ? `${observation.actors[0]} ${spaced}` : spaced;

    return {
      id, timestampMinutes: observation.timestampMinutes, eventType: observation.eventType,
      subject, where: observation.where, summary,
      importance: Math.min(1, Math.max(0, importance)), valence: t.valence,
      confidence: observation.confidence, source: observation.source,
      sourceEventId: observation.eventId, accessCount: 0,
      lastAccessMinutes: observation.timestampMinutes,
    };
  }
}

export class MemoryStore {
  private readonly memories: EpisodicMemory[] = [];
  private nextId = 1;
  constructor(readonly capacity = 250) {}
  get count(): number { return this.memories.length; }
  get all(): readonly EpisodicMemory[] { return this.memories; }
  add(nowMinutes: number, make: (id: number) => EpisodicMemory): EpisodicMemory {
    const m = make(this.nextId++);
    this.memories.push(m);
    if (this.memories.length > this.capacity) {
      let worst = 0;
      for (let i = 1; i < this.memories.length; i++) {
        const w = this.memories[worst]!, c = this.memories[i]!;
        if (c.importance < w.importance ||
            (c.importance === w.importance && c.timestampMinutes < w.timestampMinutes)) worst = i;
      }
      this.memories.splice(worst, 1);
    }
    m.lastAccessMinutes = nowMinutes;
    return m;
  }
  import(m: EpisodicMemory): void {
    this.memories.push(m);
    if (m.id >= this.nextId) this.nextId = m.id + 1;
    if (this.memories.length > this.capacity) this.memories.shift();
  }
  consolidate(nowMinutes: number, retentionFloor: number): number {
    const doomed = this.memories.filter(
      (m) => m.importance < retentionFloor && m.accessCount === 0 &&
             (nowMinutes - m.timestampMinutes) / 60 > 48);
    for (const d of doomed) {
      const i = this.memories.indexOf(d);
      if (i >= 0) this.memories.splice(i, 1);
    }
    return doomed.length;
  }
}

export interface RetrievedMemory {
  memory: EpisodicMemory; score: number;
  breakdown: Array<{ label: string; value: number }>;
}

export class MemoryRetriever {
  wRecency = 0.3; wImportance = 0.3; wActor = 0.25; wLocation = 0.15;
  /**
   * Read-only ranked retrieval: never touches accessCount/lastAccessMinutes.
   * Used by debug inspection; gameplay retrieval uses retrieve().
   */
  peek(store: MemoryStore, q: { aboutAgent?: string; nearLocation?: string; nowMinutes: number; recencyHalfLifeHours?: number }, topN: number): RetrievedMemory[] {
    return this.rankAll(store, q).slice(0, topN);
  }
  retrieve(store: MemoryStore, q: { aboutAgent?: string; nearLocation?: string; nowMinutes: number; recencyHalfLifeHours?: number }, topN: number): RetrievedMemory[] {
    const ranked = this.rankAll(store, q);
    const out = ranked.slice(0, topN);
    for (const r of out) { r.memory.accessCount++; r.memory.lastAccessMinutes = q.nowMinutes; }
    return out;
  }
  private rankAll(store: MemoryStore, q: { aboutAgent?: string; nearLocation?: string; nowMinutes: number; recencyHalfLifeHours?: number }): RetrievedMemory[] {
    const halfLife = Math.max(0.1, q.recencyHalfLifeHours ?? 48);
    const ranked: RetrievedMemory[] = [];
    for (const m of store.all) {
      const h = Math.max(0, (q.nowMinutes - m.timestampMinutes) / 60);
      const recency = Math.pow(0.5, h / halfLife);
      const actorMatch = q.aboutAgent !== undefined && m.subject === q.aboutAgent ? 1 : 0;
      const locMatch = q.nearLocation !== undefined && m.where === q.nearLocation ? 1 : 0;
      const score = this.wRecency * recency + this.wImportance * m.importance +
                    this.wActor * actorMatch + this.wLocation * locMatch;
      ranked.push({ memory: m, score, breakdown: [
        { label: "Recency", value: this.wRecency * recency },
        { label: "Importance", value: this.wImportance * m.importance },
        { label: "ActorMatch", value: this.wActor * actorMatch },
        { label: "LocationMatch", value: this.wLocation * locMatch },
      ]});
    }
    ranked.sort((x, y) => (y.score - x.score !== 0 ? y.score - x.score : x.memory.id - y.memory.id));
    return ranked;
  }
}

// ---------------- Emotion ----------------
const clampRange = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function clampRel(r: Relationship): void {
  r.familiarity = clampRange(r.familiarity, 0, 1);
  r.attraction = clampRange(r.attraction, 0, 1);
  r.fear = clampRange(r.fear, 0, 1);
  r.grievance = clampRange(r.grievance, 0, 1);
  r.obligation = clampRange(r.obligation, 0, 1);
  r.affinity = clampRange(r.affinity, -1, 1);
  r.trust = clampRange(r.trust, -1, 1);
  r.respect = clampRange(r.respect, -1, 1);
}

export class EmotionSystem {
  private readonly arousal = new Map<string, number>();
  halfLifeMinutes = 240;
  constructor(
    private readonly getValence: (agent: string) => number,
    private readonly setValence: (agent: string, v: number) => void,
    private readonly residentIds: () => string[],
  ) {}
  arousalOf(agent: string): number { return this.arousal.get(agent) ?? 0; }
  apply(agent: string, vd: number, ad: number): void {
    this.setValence(agent, clampRange(this.getValence(agent) + vd, -1, 1));
    const a = clampRange(this.arousalOf(agent) + ad, 0, 1);
    if (a <= 0.001) this.arousal.delete(agent); else this.arousal.set(agent, a);
  }
  tick(deltaMinutes: number): void {
    const factor = Math.pow(0.5, deltaMinutes / this.halfLifeMinutes);
    for (const agent of this.residentIds()) {
      const v = this.getValence(agent);
      if (Math.abs(v) > 0.001) this.setValence(agent, clampRange(v * factor, -1, 1));
      const a = this.arousal.get(agent);
      if (a !== undefined) {
        const na = a * factor;
        if (na <= 0.001) this.arousal.delete(agent); else this.arousal.set(agent, na);
      }
    }
  }
}

// ---------------- Relationships ----------------
export interface Relationship {
  familiarity: number; affinity: number; trust: number; respect: number;
  attraction: number; fear: number; grievance: number; obligation: number;
}
export enum RelationshipLabel { Stranger, Acquaintance, Friend, CloseFriend, Rival, Enemy, Crush }
export function relationshipLabel(r: Relationship): RelationshipLabel {
  if (r.grievance >= 0.6 && r.affinity <= -0.2) return RelationshipLabel.Enemy;
  if (r.affinity <= -0.35) return RelationshipLabel.Rival;
  if (r.familiarity < 0.15) return RelationshipLabel.Stranger;
  if (r.attraction >= 0.6) return RelationshipLabel.Crush;
  if (r.affinity >= 0.6 && r.trust >= 0.5) return RelationshipLabel.CloseFriend;
  if (r.affinity >= 0.3) return RelationshipLabel.Friend;
  return RelationshipLabel.Acquaintance;
}

export class RelationshipSystem {
  private readonly links = new Map<string, Relationship>();
  constructor(
    private readonly personalityOf: (agent: string) => { get(t: PersonalityTrait): number } | undefined,
    private readonly scheduleDrift: (everySimHours: number, cb: (dh: number) => void) => void,
  ) { this.scheduleDrift(2, (dh) => this.drift(dh)); }

  getOrCreate(from: string, to: string): Relationship {
    const key = `${from}>${to}`;
    let r = this.links.get(key);
    if (!r) { r = { familiarity: 0, affinity: 0, trust: 0, respect: 0, attraction: 0, fear: 0, grievance: 0, obligation: 0 }; this.links.set(key, r); }
    return r;
  }
  import(from: string, to: string, snap: Relationship): void {
    Object.assign(this.getOrCreate(from, to), snap);
    clampRel(this.getOrCreate(from, to));
  }
  all(): Array<{ from: string; to: string; rel: Relationship }> {
    const out: Array<{ from: string; to: string; rel: Relationship }> = [];
    for (const [key, rel] of this.links) {
      const i = key.indexOf(">");
      out.push({ from: key.slice(0, i), to: key.slice(i + 1), rel });
    }
    return out;
  }
  private scale(observer: string, base: number, negative: boolean): number {
    const p = this.personalityOf(observer);
    if (!p) return base;
    let s = 1;
    if (negative) { s += p.get(PersonalityTrait.GrudgeRetention) * 0.5; s -= p.get(PersonalityTrait.Patience) * 0.25; }
    else { s += p.get(PersonalityTrait.Agreeableness) * 0.4; s -= p.get(PersonalityTrait.RiskTolerance) * 0.1; }
    return base * Math.max(0.25, s);
  }
  handleSocialEvent(observer: string, eventType: string, actor: string,
                    target: string | null, _confidence: number): void {
    if (actor === observer) return; // self-relationship regression guard
    const rel = this.getOrCreate(observer, actor);
    rel.familiarity = Math.min(1, rel.familiarity + 0.05);
    const thirdPartyHarm = target !== null && target !== actor && target !== observer &&
                           eventType.includes("insult");
    const apply = (o: Partial<Record<"affinity"|"trust"|"respect"|"grievance"|"fear"|"obligation", number>>, neg: boolean) => {
      for (const k of ["affinity","trust","respect","grievance","fear","obligation"] as const)
        if (o[k] !== undefined) rel[k] += this.scale(observer, o[k]!, neg);
      clampRel(rel);
    };
    switch (eventType) {
      case "insult_incident": case "insult": apply({ affinity: -0.22, respect: -0.12, grievance: 0.2, fear: 0.03 }, true); break;
      case "confront": apply({ affinity: -0.1, grievance: 0.12 }, true); break;
      case "tease": { const b = rel.affinity >= 0.3 ? 0.04 : -0.06; apply({ affinity: b, grievance: b < 0 ? 0.05 : 0 }, b < 0); break; }
      case "help": apply({ affinity: 0.18, trust: 0.2, obligation: 0.15, respect: 0.08 }, false); break;
      case "compliment": apply({ affinity: 0.12, respect: 0.05 }, false); break;
      case "comfort": apply({ affinity: 0.15, trust: 0.1 }, false); break;
      case "apologize": apply({ affinity: 0.1, trust: 0.08, grievance: -0.25 }, false); break;
      case "gift": apply({ affinity: 0.16, obligation: 0.1 }, false); break;
      case "chat": case "greeting": case "gossip": apply({ affinity: 0.04, trust: 0.02 }, false); break;
      default: break;
    }
    if (thirdPartyHarm && target !== null) {
      const tp = this.getOrCreate(observer, target);
      tp.affinity = clampRange(tp.affinity - 0.05, -1, 1);
    }
  }
  drift(deltaHours: number): void {
    for (const rel of this.links.values()) {
      rel.grievance = Math.max(0, rel.grievance - 0.01 * deltaHours);
      rel.obligation = Math.max(0, rel.obligation - 0.008 * deltaHours);
      if (rel.familiarity > 0.02) rel.familiarity = Math.max(0, rel.familiarity - 0.004 * deltaHours);
    }
  }
}

// ---------------- Beliefs & gossip ----------------
export class Belief {
  readonly key: string;
  stance: number; confidence: number; hopCount: number;
  sourceAgent?: string; sourceEvent?: number; learnedAtMinutes = 0;
  constructor(readonly id: number, readonly owner: string,
              readonly subjectKey: string, readonly predicate: string,
              stance: number, confidence: number, hopCount: number) {
    this.key = `${subjectKey}|${predicate}`;
    this.stance = clampRange(stance, -1, 1);
    this.confidence = clampRange(confidence, 0, 1);
    this.hopCount = hopCount;
  }
}

export class BeliefStore {
  private readonly byKey = new Map<string, Belief>();
  private nextId = 1;
  get count(): number { return this.byKey.size; }
  get all(): readonly Belief[] { return [...this.byKey.values()]; }
  addOrUpdate(b: Belief): void {
    const e = this.byKey.get(b.key);
    if (!e) { this.byKey.set(b.key, b); if (b.id >= this.nextId) this.nextId = b.id + 1; return; }
    const wNew = b.confidence, wOld = e.confidence * 0.7 + 0.15;
    e.stance = clampRange((e.stance * wOld + b.stance * wNew) / Math.max(0.001, wOld + wNew), -1, 1);
    e.confidence = Math.max(e.confidence, b.confidence);
    e.hopCount = Math.min(e.hopCount, b.hopCount);
    e.sourceAgent = b.sourceAgent ?? e.sourceAgent;
    e.sourceEvent = b.sourceEvent ?? e.sourceEvent;
    e.learnedAtMinutes = b.learnedAtMinutes;
  }
  import(b: Belief): void {
    this.byKey.set(b.key, b);
    if (b.id >= this.nextId) this.nextId = b.id + 1;
  }
  tryGet(s: string, p: string): Belief | undefined { return this.byKey.get(`${s}|${p}`); }
  mintId(): number { return this.nextId++; }
}

export class BeliefSystem {
  private readonly stores = new Map<string, BeliefStore>();
  private readonly seenEvents = new Set<string>(); // loop guard
  hopDecay = 0.65;
  storeFor(owner: string): BeliefStore {
    let s = this.stores.get(owner);
    if (!s) { s = new BeliefStore(); this.stores.set(owner, s); }
    return s;
  }
  /** Read-only access for inspection: never creates a store. */
  tryStoreFor(owner: string): BeliefStore | undefined {
    return this.stores.get(owner);
  }
  owners(): Array<{ owner: string; store: BeliefStore }> {
    return [...this.stores].map(([owner, store]) => ({ owner, store }));
  }
  learnDirect(owner: string, subjectKey: string, predicate: string,
              stance: number, confidence: number, sourceEvent: number, nowMinutes: number): void {
    const store = this.storeFor(owner);
    store.addOrUpdate(new Belief(store.mintId(), owner, subjectKey, predicate, stance, confidence, 0));
    const b = store.tryGet(subjectKey, predicate)!;
    b.sourceEvent = sourceEvent; b.learnedAtMinutes = nowMinutes;
    this.seenEvents.add(`${owner}:${sourceEvent}`);
  }
  tryTransfer(speaker: string, listener: string, subjectKey: string, predicate: string,
              originEvent: number, listenerTrustTowardSpeaker: number, nowMinutes: number): boolean {
    if (speaker === listener) return false;
    const sb = this.storeFor(speaker).tryGet(subjectKey, predicate);
    if (!sb) return false;
    const guard = `${listener}:${originEvent}`;
    if (this.seenEvents.has(guard)) return false; // loop prevention
    const trustFactor = Math.max(0.1, Math.min(1, 0.5 + listenerTrustTowardSpeaker * 0.5));
    const hops = sb.hopCount + 1;
    const confidence = sb.confidence * Math.pow(this.hopDecay, hops - sb.hopCount) * trustFactor;
    const store = this.storeFor(listener);
    const belief = new Belief(store.mintId(), listener, subjectKey, predicate, sb.stance, confidence, hops);
    belief.sourceAgent = speaker;
    belief.sourceEvent = sb.sourceEvent ?? originEvent;
    belief.learnedAtMinutes = nowMinutes;
    store.addOrUpdate(belief);
    this.seenEvents.add(guard);
    return true;
  }
  reconcileWithDirectExperience(owner: string, subjectKey: string, predicate: string,
                                experiencedStance: number, nowMinutes: number): void {
    const b = this.storeFor(owner).tryGet(subjectKey, predicate);
    if (!b || b.hopCount <= 0) return;
    b.stance = clampRange(b.stance * 0.3 + experiencedStance * 0.9, -1, 1);
    b.confidence = Math.min(1, b.confidence + 0.35);
    b.hopCount = 0; b.sourceAgent = undefined; b.sourceEvent = undefined;
    b.learnedAtMinutes = nowMinutes;
  }
}

// ---------------- Social actions ----------------
export enum SocialActionType {
  Greet, Chat, Compliment, Tease, Joke, Help, AskForHelp,
  Comfort, Apologize, Invite, Confront, Insult, ShareInformation, Goodbye,
}
export function mapToEventType(a: SocialActionType): string {
  const names = ["greeting","chat","compliment","tease","joke","help","ask_for_help",
                 "comfort","apologize","invite","confront","insult","gossip","goodbye"];
  return names[a] ?? "social";
}
function baseAcceptance(a: SocialActionType): number {
  switch (a) {
    case SocialActionType.Greet: case SocialActionType.Chat: case SocialActionType.Goodbye: return 0.9;
    case SocialActionType.Compliment: case SocialActionType.Comfort: case SocialActionType.Apologize: return 0.8;
    case SocialActionType.Help: case SocialActionType.AskForHelp: case SocialActionType.Invite: return 0.7;
    case SocialActionType.ShareInformation: return 0.75;
    case SocialActionType.Joke: return 0.65;
    case SocialActionType.Tease: return 0.5;
    case SocialActionType.Confront: return 0.4;
    case SocialActionType.Insult: return 1;
    default: return 0.6;
  }
}

export interface SocialActorSnapshot {
  location?: string; sociability: number; emotionValence: number; hasInterruptingNeed: boolean;
}
export interface SocialAttemptResult { accepted: boolean; reason: string; emittedEvent?: number }

export class SocialSystem {
  constructor(private readonly host: {
    actorSnapshot(agent: string): SocialActorSnapshot | undefined;
    reserveConversationLock(agent: string, by: string, untilMinutes: number): boolean;
    releaseConversationLock(agent: string, by: string): void;
    emitSocialEvent(type: string, initiator: string, target: string, atLocation: string): number;
  }, private readonly nowMinutes: () => number,
     private readonly rng: { chance(p: number): boolean }) {}

  attempt(initiator: string, target: string, action: SocialActionType,
          listenerState?: SocialActorSnapshot): SocialAttemptResult {
    const a = this.host.actorSnapshot(initiator);
    const t = listenerState ?? this.host.actorSnapshot(target);
    if (!a || !t || !a.location || !t.location)
      return { accepted: false, reason: "participant missing or unplaced" };
    if (a.location !== t.location) return { accepted: false, reason: "not co-located" };

    const conversational = action !== SocialActionType.Insult && action !== SocialActionType.Help;
    const lockUntil = this.nowMinutes() + 30;
    let lockedInitiator = false;
    if (conversational) {
      lockedInitiator = this.host.reserveConversationLock(initiator, initiator, lockUntil);
      const lockedTarget = lockedInitiator && target !== initiator
        ? this.host.reserveConversationLock(target, initiator, lockUntil) : lockedInitiator;
      if (!lockedInitiator || !lockedTarget) {
        if (lockedInitiator && !lockedTarget) this.host.releaseConversationLock(initiator, initiator);
        return { accepted: false, reason: "busy: already in conversation" };
      }
    }
    try {
      let p = baseAcceptance(action);
      const hostile = action === SocialActionType.Insult || action === SocialActionType.Confront;
      if (!hostile) {
        if (t.hasInterruptingNeed) return { accepted: false, reason: "declined: urgent needs" };
        p += 0.2 * (t.sociability - 0.5) + 0.15 * t.emotionValence;
      } else {
        p += 0.1 * -t.emotionValence;
      }
      p = Math.max(0.05, Math.min(1, p));
      if (!this.rng.chance(p)) {
        this.host.emitSocialEvent(mapToEventType(action) + "_rejected", initiator, target, a.location);
        return { accepted: false, reason: "declined" };
      }
      const emitted = this.host.emitSocialEvent(mapToEventType(action), initiator, target, a.location);
      return { accepted: true, reason: "ok", emittedEvent: emitted };
    } finally {
      if (conversational) {
        this.host.releaseConversationLock(initiator, initiator);
        if (target !== initiator) this.host.releaseConversationLock(target, initiator);
      }
    }
  }
}

// ---------------- Conversation engine (deterministic templates) ----------------
export enum ConversationIntent {
  Greet, SmallTalk, Gossip, Complain, Ask, Offer,
  Apologize, Comfort, Tease, Invite, Confront, Goodbye,
}

export interface ConversationSession {
  initiator: string; listener: string; intent: ConversationIntent;
  topicLabel: string; utterances: string[]; startedAtMinutes: number;
  transferredBelief?: string;
}

export class ConversationSystem {
  private readonly rareLineCooldown = new Map<string, number>();

  selectIntent(a: string, b: string, host: {
    relationshipOf(x: string, y: string): Relationship;
    strongestFirstHandNegativeAboutThirdParty(speaker: string, excluding: string):
      { subjectKey: string; stance: number; confidence: number } | undefined;
    freshestBeliefAboutOther(speaker: string, excluding: string): boolean;
    chattiness(speaker: string): number; // 0..1
    chance(p: number): boolean;
  }): ConversationIntent {
    const rel = host.relationshipOf(a, b);
    const strong = host.strongestFirstHandNegativeAboutThirdParty(a, b);
    if (strong && strong.stance < -0.4 && strong.confidence > 0.5)
      return rel.affinity > 0.3 ? ConversationIntent.Complain : ConversationIntent.Gossip;
    if (host.freshestBeliefAboutOther(a, b) && host.chance(0.35 + host.chattiness(a) * 0.4))
      return ConversationIntent.Gossip;
    if (rel.familiarity < 0.1) return ConversationIntent.Greet;
    if (rel.affinity < -0.3) return ConversationIntent.Confront;
    if (rel.affinity > 0.5 && rel.familiarity > 0.3 && host.chance(0.15))
      return ConversationIntent.Tease;
    return ConversationIntent.SmallTalk;
  }

  buildUtterances(intent: ConversationIntent, a: string, b: string,
                  displayNameB: string, topicLabel: string,
                  rngIntExclusive: (max: number) => number,
                  rareTeaseLine: (() => string | null) | undefined): string[] {
    const variation = rngIntExclusive(2);
    const lines: string[] = [];
    switch (intent) {
      case ConversationIntent.Greet:
        lines.push(variation === 0 ? `Hey, ${displayNameB}.` : `Oh — hi, ${displayNameB}.`); break;
      case ConversationIntent.SmallTalk:
        lines.push("Nice weather for a walk.");
        lines.push(`Mm. Seen ${a} around lately?`); break;
      case ConversationIntent.Gossip:
        lines.push(`Did you hear about ${topicLabel}?`);
        lines.push("That's what I heard."); break;
      case ConversationIntent.Complain:
        lines.push(`It's ${topicLabel} again. Honestly.`); break;
      case ConversationIntent.Confront:
        lines.push(`${displayNameB}, we need to talk.`); break;
      case ConversationIntent.Apologize:
        lines.push(`I'm sorry about earlier, ${displayNameB}.`); break;
      case ConversationIntent.Comfort:
        lines.push(`You're doing fine, ${displayNameB}. Really.`); break;
      case ConversationIntent.Tease: {
        const rare = rareTeaseLine?.();
        lines.push(rare ?? (variation === 0 ? `Late again? Impressive, ${displayNameB}.` : `${displayNameB}, you never change.`));
        break;
      }
      case ConversationIntent.Invite:
        lines.push("Join me at the cafe later?"); break;
      default:
        lines.push(variation === 0 ? `See you around, ${displayNameB}.` : `Take care, ${displayNameB}.`); break;
    }
    return lines;
  }

  rareTeaseLine(a: string, b: string, nowMinutes: number,
                relationshipOf: (x: string, y: string) => Relationship,
                chance: (p: number) => boolean): string | null {
    const rel = relationshipOf(a, b);
    if (rel.affinity <= 0.5 || !chance(0.1)) return null;
    const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`;
    const last = this.rareLineCooldown.get(pairKey);
    if (last !== undefined && nowMinutes - last < 360) return null; // 6h cooldown
    this.rareLineCooldown.set(pairKey, nowMinutes);
    return "u dummy.";
  }
}


export class MemorySystem {
  private readonly stores = new Map<string, MemoryStore>();
  readonly encoder = new MemoryEncoder();
  readonly retriever = new MemoryRetriever();

  storeFor(owner: string): MemoryStore {
    let s = this.stores.get(owner);
    if (!s) { s = new MemoryStore(); this.stores.set(owner, s); }
    return s;
  }

  /** Read-only access for inspection: never creates a store. */
  tryStoreFor(owner: string): MemoryStore | undefined {
    return this.stores.get(owner);
  }

  ownerIds(): string[] { return [...this.stores.keys()]; }
}
