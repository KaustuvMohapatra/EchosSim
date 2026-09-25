/**
 * Versioned, engine-free save format + deterministic restore.
 *
 * The round-trip contract: serialize a living town mid-flight, restore it,
 * run both forward — their futures are byte-for-byte identical. A saved world
 * IS the same world (verified by tests/persistence/roundtrip.test.ts).
 */
import { PersonalityProfile } from "@echosim/cognition";
import { Belief, type SkillName } from "@echosim/social";
import { Town, PlanningDirector } from "@echosim/simulation";
import { UnsupportedSaveVersionException } from "./migrations.js";

export const CURRENT_SAVE_VERSION = 3;

export interface SaveLocation {
  id: string; name: string;
  capacity: number;
  hours?: { openMinuteOfDay: number; closeMinuteOfDay: number };
  isOpen: boolean;
}
export interface SaveAgent {
  id: string; name: string;
  home?: string;
  locationId?: string;
  personality: number[];
  needs: Record<string, number>;
  emotionValence: number;
  money: number;
  routineOffsetMinutes: number;
  plannerMemory: Record<string, number>;
  inventory: Record<string, number>;
  lastSelected: Record<string, number>;
  committedGoalId: string | null;
  job?: { id: string; title: string; workplace: string;
          shiftStartMinuteOfDay: number; shiftEndMinuteOfDay: number;
          incomePerHour: number };
}
export interface SaveRelationship {
  from: string; to: string;
  familiarity: number; affinity: number; trust: number; respect: number;
  attraction: number; fear: number; grievance: number; obligation: number;
}
export interface SaveMemory {
  id: number; timestampMinutes: number; eventType: string; subject: string;
  where?: string; summary: string; importance: number; valence: number;
  confidence: number; source: number; sourceEventId: number;
  accessCount: number; lastAccessMinutes: number;
}
export interface SaveBelief {
  id: number; subjectKey: string; predicate: string; stance: number;
  confidence: number; hopCount: number; sourceAgent?: string;
  sourceEvent?: number; learnedAtMinutes: number;
}
export interface SaveActiveRun {
  agentId: string; goalId: string; stepActionIds: string[];
  nextStepIndex: number; remainingMinutes: number;
}
export interface SaveMessage {
  id: number; from: string; to: string; text: string; atMinutes: number;
}
export interface SaveInvitation {
  id: number; from: string; to: string; activityLabel: string;
  lotId: string; atMinutes: number;
  status: "pending" | "accepted" | "declined" | "expired";
}
export interface SaveObservation {
  observer: string; eventId: number; eventType: string;
  actors: string[]; where?: string; timestampMinutes: number;
  confidence: number; source: number;
}
export interface SaveTownStory {
  id: number; day: number; text: string; participants: string[];
  category: "relationships" | "careers" | "social" | "town";
  visibility: "participants" | "shared-groups";
}

export interface SaveDocument {
  version: number;
  seed: string;
  clockMinutes: number;
  weather: number;
  locations: SaveLocation[];
  agents: SaveAgent[];
  relationships: SaveRelationship[];
  memoriesByOwner: Record<string, SaveMemory[]>;
  beliefsByOwner: Record<string, SaveBelief[]>;
  suppressions: Array<{ agent: string; goal: string; untilMinutes: number }>;
  activeRuns: SaveActiveRun[];
  /** Director lifetime counters so restored towns keep comparable stats. */
  planTotals: { created: number; succeeded: number; failed: number; replans: number };
  /** v3+: durable semantic knowledge (Sprint 23). */
  semanticMemoriesByOwner?: Record<string, Array<{
    id: number; subjectKey: string; concept: string; polarity: number;
    confidence: number; supportingIds: number[];
    createdAtMinutes: number; lastReinforcedAtMinutes: number;
  }>>;
  /** v3+: formed habits (Sprint 24). */
  habitsByOwner?: Record<string, Array<{
    id: number; behavior: string; targetKey: string; strength: number;
    repetitionCount: number; firstPerformedMinutes: number; lastPerformedMinutes: number;
  }>>;
  /** v3+: simulation-owned Life phone state. Optional for older v3 saves. */
  messages?: SaveMessage[];
  invitations?: SaveInvitation[];
  /** v3+: durable skill progression. Optional for older v3 saves. */
  skillsByOwner?: Record<string, Array<{
    skill: SkillName; xp: number; level: number;
  }>>;
  /** v3+: recent resident perception history used by knowledge-scoped Life UI. */
  observationsByOwner?: Record<string, SaveObservation[]>;
  /** v3+: knowledge-filtered neighborhood story history. */
  townStories?: {
    stories: SaveTownStory[];
    seenFriendPairs: string[];
  };
  /** v3+: group content snapshot so restores stay self-contained (Sprint 25). */
  groups?: {
    defs: Array<{ id: string; kind: string; name: string; meetingLocationId?: string }>;
    memberships: Record<string, string[]>;
  };
}

// ---------------- Serialize ----------------

export function serializeTown(town: Town, director: PlanningDirector): SaveDocument {
  const locations: SaveLocation[] = town.locations.orderedIds.map((id) => {
    const rt = town.locations.get(id);
    const def = rt.definition;
    return {
      id, name: def.displayName, capacity: def.capacity,
      ...(def.hours ? {
        hours: {
          openMinuteOfDay: def.hours.openMinuteOfDay,
          closeMinuteOfDay: def.hours.closeMinuteOfDay,
        },
      } : {}),
      isOpen: rt.isOpen,
    };
  });

  const agents: SaveAgent[] = [];
  for (const id of town.residents.orderedIds()) {
    const m = town.residents.mind(id);
    const state = town.agentsById.get(id);
    const needs: Record<string, number> = {};
    for (const n of m.needs.all()) needs[String(n.definition.kind)] = n.current;

    const plannerMemory: Record<string, number> = {};
    for (const [k, v] of m.plannerMemory) plannerMemory[k] = v;
    const inventory: Record<string, number> = {};
    for (const [k, v] of m.inventory) inventory[k] = v;
    const lastSelected: Record<string, number> = {};
    for (const [k, v] of m.lastSelectedSnapshot()) lastSelected[k] = v;

    agents.push({
      id, name: m.displayName,
      ...(m.homeLocationId !== undefined ? { home: m.homeLocationId } : {}),
      ...(state?.hasLocation && state.currentLocationId !== undefined
        ? { locationId: state.currentLocationId } : {}),
      personality: m.personality.toArray(),
      needs,
      emotionValence: m.emotionValence,
      money: m.money,
      routineOffsetMinutes: m.routineOffsetMinutes,
      plannerMemory, inventory, lastSelected,
      committedGoalId: m.committedGoal?.id ?? null,
      ...(m.job ? {
        job: {
          id: m.job.id, title: m.job.title, workplace: m.job.workplace,
          shiftStartMinuteOfDay: m.job.shiftStartMinuteOfDay,
          shiftEndMinuteOfDay: m.job.shiftEndMinuteOfDay,
          incomePerHour: m.job.incomePerHour,
        },
      } : {}),
    });
  }

  const relationships: SaveRelationship[] = town.relationships.all().map((l) => ({
    from: l.from, to: l.to,
    familiarity: l.rel.familiarity, affinity: l.rel.affinity,
    trust: l.rel.trust, respect: l.rel.respect,
    attraction: l.rel.attraction, fear: l.rel.fear,
    grievance: l.rel.grievance, obligation: l.rel.obligation,
  }));

  const memoriesByOwner: Record<string, SaveMemory[]> = {};
  for (const owner of town.memory.ownerIds()) {
    memoriesByOwner[owner] = town.memory.storeFor(owner).all.map((m) => ({
      id: m.id, timestampMinutes: m.timestampMinutes, eventType: m.eventType,
      subject: m.subject,
      where: m.where,
      summary: m.summary, importance: m.importance, valence: m.valence,
      confidence: m.confidence, source: m.source as number,
      sourceEventId: m.sourceEventId, accessCount: m.accessCount,
      lastAccessMinutes: m.lastAccessMinutes,
    }));
  }

  const beliefsByOwner: Record<string, SaveBelief[]> = {};
  for (const { owner, store } of town.beliefs.owners()) {
    beliefsByOwner[owner] = store.all.map((b) => ({
      id: b.id, subjectKey: b.subjectKey, predicate: b.predicate,
      stance: b.stance, confidence: b.confidence, hopCount: b.hopCount,
      ...(b.sourceAgent !== undefined ? { sourceAgent: b.sourceAgent } : {}),
      ...(b.sourceEvent !== undefined ? { sourceEvent: b.sourceEvent } : {}),
      learnedAtMinutes: b.learnedAtMinutes,
    }));
  }

  const activeRuns: SaveActiveRun[] = director.activeRunsSnapshot()
    .filter((r) => r.lifecycle === "Running" || r.lifecycle === "Starting")
    .map((r) => {
      const remaining = Math.max(0,
        (r.currentStepDueMinutes ?? town.clock.currentTime.totalMinutes) -
        town.clock.currentTime.totalMinutes);
      return {
        agentId: r.agentId, goalId: r.goalId,
        stepActionIds: [...r.plan.map((a) => a.id)],
        nextStepIndex: r.nextStepIndex,
        remainingMinutes: Math.round(remaining),
      };
    });

  const semanticMemoriesByOwner: SaveDocument["semanticMemoriesByOwner"] = {};
  const habitsByOwner: SaveDocument["habitsByOwner"] = {};
  const skillsByOwner: NonNullable<SaveDocument["skillsByOwner"]> = {};
  const observationsByOwner: NonNullable<SaveDocument["observationsByOwner"]> = {};
  for (const owner of town.residents.orderedIds()) {
    const list = town.reflections.exportFor(owner);
    if (list.length > 0)
      semanticMemoriesByOwner[owner] = list.map((s) => ({ ...s, supportingIds: [...s.supportingIds] }));
    const habits = town.habits.habitsOf(owner);
    if (habits.length > 0)
      habitsByOwner[owner] = habits.map((h) => ({ ...h }));
    const skills = town.skills.allOf(owner);
    if (skills.length > 0)
      skillsByOwner[owner] = skills.map((skill) => ({ ...skill }));
    const observations = town.perception.observationsOf(owner);
    if (observations.length > 0) {
      observationsByOwner[owner] = observations.map((observation) => ({
        observer: observation.observer,
        eventId: observation.eventId,
        eventType: observation.eventType,
        actors: [...observation.actors],
        ...(observation.where !== undefined ? { where: observation.where } : {}),
        timestampMinutes: observation.timestampMinutes,
        confidence: observation.confidence,
        source: observation.source as number,
      }));
    }
  }

  return {
    version: CURRENT_SAVE_VERSION,
    seed: town.seed.toString(),
    clockMinutes: town.clock.currentTime.totalMinutes,
    weather: town.weather.current,
    locations, agents, relationships, memoriesByOwner, beliefsByOwner,
    suppressions: town.cognition.suppressionSnapshot(),
    activeRuns,
    planTotals: {
      created: director.totalPlansCreated,
      succeeded: director.totalPlansSucceeded,
      failed: director.totalPlansFailed,
      replans: director.totalReplans,
    },
    ...(Object.keys(semanticMemoriesByOwner).length > 0
      ? { semanticMemoriesByOwner }
      : {}),
    ...(Object.keys(habitsByOwner).length > 0 ? { habitsByOwner } : {}),
    ...(Object.keys(skillsByOwner).length > 0 ? { skillsByOwner } : {}),
    ...(Object.keys(observationsByOwner).length > 0 ? { observationsByOwner } : {}),
    townStories: {
      stories: town.stories.snapshot().stories.map((story) => ({
        ...story,
        participants: [...story.participants],
      })),
      seenFriendPairs: [...town.stories.snapshot().seenFriendPairs],
    },
    messages: town.messages.all().map((message) => ({ ...message })),
    invitations: town.invitations.all().map((invitation) => ({ ...invitation })),
    groups: {
      defs: town.groups.allGroups().map((g) => ({
        id: g.id, kind: g.kind, name: g.name,
        ...(g.meetingLocationId !== undefined ? { meetingLocationId: g.meetingLocationId } : {}),
      })),
      memberships: Object.fromEntries(
        town.groups.allGroups().map((g) => [g.id, town.groups.membersOf(g.id)])),
    },
  };
}

// ---------------- Restore ----------------

export interface RestoredWorld {
  town: Town;
  director: PlanningDirector;
}

export function deserializeAndRestore(doc: SaveDocument): RestoredWorld {
  if (doc.version > CURRENT_SAVE_VERSION)
    throw new UnsupportedSaveVersionException(doc.version);

  const town = new Town(BigInt(doc.seed));

  // Locations first (agents need them).
  for (const l of doc.locations) {
    town.registerLocation({
      id: l.id, displayName: l.name, capacity: l.capacity,
      hours: l.hours
        ? { openMinuteOfDay: l.hours.openMinuteOfDay, closeMinuteOfDay: l.hours.closeMinuteOfDay }
        : undefined,
    });
    const rt = town.locations.get(l.id as never);
    // forceOpen keeps authored-hours sweeps live after restore (regression:
    // manual-override leakage used to freeze hours reactivity).
    rt.forceOpen(l.isOpen);
  }

  // Agents.
  for (const a of doc.agents) {
    const needs: Partial<Record<number, number>> = {};
    for (const [k, v] of Object.entries(a.needs)) needs[Number(k)] = v;
    town.spawnResident({
      id: a.id, displayName: a.name,
      homeLocationId: a.home,
      // Restore directly into the saved semantic location. Using moveAgent
      // here would publish synthetic arrival/perception events during load.
      startLocationId: a.locationId,
      personality: PersonalityProfile.fromArray(a.personality),
      initialNeeds: needs,
    });
    const mind = town.residents.mind(a.id);
    mind.setEmotion(a.emotionValence);
    mind.money = a.money;
    mind.routineOffsetMinutes = a.routineOffsetMinutes;
    for (const [k, v] of Object.entries(a.plannerMemory)) mind.plannerMemory.set(k, v);
    for (const [k, v] of Object.entries(a.inventory)) mind.inventory.set(k, v);
    if (a.job) {
      mind.job = { ...a.job };
      mind.isRestDayToday = (_t) => false;
    }
  }

  // spawnResident updated each saved lot's occupancy directly, without
  // emitting gameplay movement events during restoration.

  // Cognition state (commitments, cooldowns, suppressions).
  for (const a of doc.agents) {
    town.cognition.restoreResidentState(a.id, a.committedGoalId, a.lastSelected,
      doc.suppressions.filter((s) => s.agent === a.id));
  }

  // Social state.
  for (const r of doc.relationships) {
    town.relationships.import(r.from, r.to, {
      familiarity: r.familiarity, affinity: r.affinity, trust: r.trust,
      respect: r.respect, attraction: r.attraction, fear: r.fear,
      grievance: r.grievance, obligation: r.obligation,
    });
  }
  for (const [owner, list] of Object.entries(doc.memoriesByOwner)) {
    let maxId = 0;
    for (const m of list) {
      if (m.id > maxId) maxId = m.id;
      town.memory.storeFor(owner).add(m.timestampMinutes, () => ({
        id: m.id, timestampMinutes: m.timestampMinutes, eventType: m.eventType,
        subject: m.subject,
        ...(m.where !== undefined ? { where: m.where } : {}),
        summary: m.summary, importance: m.importance, valence: m.valence,
        confidence: m.confidence,
        source: m.source as never, sourceEventId: m.sourceEventId,
        accessCount: m.accessCount, lastAccessMinutes: m.lastAccessMinutes,
      }));
    }
    // Keep the town's encoder id counter clear of imported ids.
    town.ensureMemoryIdBeyond(maxId + 1);
  }
  for (const [owner, list] of Object.entries(doc.beliefsByOwner)) {
    const store = town.beliefs.storeFor(owner);
    for (const b of list) {
      const belief = new Belief(b.id, owner, b.subjectKey, b.predicate,
        b.stance, b.confidence, b.hopCount);
      belief.learnedAtMinutes = b.learnedAtMinutes;
      store.import(belief);
      const stored = store.tryGet(b.subjectKey, b.predicate)!;
      stored.sourceAgent = b.sourceAgent;
      stored.sourceEvent = b.sourceEvent;
    }
  }

  // Recent perception history. Import is side-effect free and preserves event ids.
  for (const list of Object.values(doc.observationsByOwner ?? {})) {
    for (const observation of list)
      town.perception.import({
        ...observation,
        actors: [...observation.actors],
        source: observation.source as never,
      });
  }

  // Simulation-owned Life phone state. Missing fields are valid older v3 saves.
  for (const message of doc.messages ?? [])
    town.messages.import({ ...message });
  for (const invitation of doc.invitations ?? [])
    town.invitations.import({ ...invitation });

  // Durable semantic knowledge (Sprint 23) + habits (Sprint 24).
  if (doc.semanticMemoriesByOwner !== undefined) {
    for (const [owner, list] of Object.entries(doc.semanticMemoriesByOwner)) {
      for (const s of list) town.reflections.import(owner, { ...s, supportingIds: [...s.supportingIds] });
    }
  }
  if (doc.habitsByOwner !== undefined) {
    for (const [owner, list] of Object.entries(doc.habitsByOwner)) {
      for (const h of list) town.habits.import(owner, { ...h });
    }
  }
  if (doc.skillsByOwner !== undefined) {
    for (const [owner, list] of Object.entries(doc.skillsByOwner)) {
      for (const skill of list)
        town.skills.import(owner, skill.skill, { xp: skill.xp, level: skill.level });
    }
  }
  if (doc.groups !== undefined) {
    for (const def of doc.groups.defs) {
      try {
        town.groups.define({
          id: def.id,
          kind: def.kind as never,
          name: def.name,
          ...(def.meetingLocationId !== undefined ? { meetingLocationId: def.meetingLocationId } : {}),
        });
      } catch { /* duplicate definition from content re-registration — fine */ }
    }
    for (const [groupId, memberIds] of Object.entries(doc.groups.memberships)) {
      for (const memberId of memberIds) {
        try { town.groups.addMember(groupId, memberId); } catch { /* already a member */ }
      }
    }
  }

  if (doc.townStories !== undefined) {
    town.stories.restore({
      stories: doc.townStories.stories.map((story) => ({
        ...story,
        participants: [...story.participants],
      })),
      seenFriendPairs: [...doc.townStories.seenFriendPairs],
    });
  }

  // Fast-forward clock BEFORE restoring in-flight runs so due times line up.
  const elapsed = doc.clockMinutes - town.clock.currentTime.totalMinutes;
  if (elapsed > 0) {
    for (let i = 0; i < elapsed; i += 10) {
      town.clock.advance({ totalMinutes: Math.min(10, elapsed - i) });
    }
  }
  town.weather.set(doc.weather as never);

  const director = new PlanningDirector(town);
  director.totalPlansCreated = doc.planTotals.created;
  director.totalPlansSucceeded = doc.planTotals.succeeded;
  director.totalPlansFailed = doc.planTotals.failed;
  director.totalReplans = doc.planTotals.replans;
  for (const run of doc.activeRuns) {
    try {
      director.restoreRun(run.agentId as never, run.goalId,
        run.stepActionIds, run.nextStepIndex, run.remainingMinutes);
    } catch {
      // Unknown action/goal in save (content changed): drop the run; the next
      // tick plans fresh. Never fail the whole restore for one stale run.
    }
  }

  return { town, director };
}

/** Convenience: full JSON round-trip through strings (what disk sees). */
export function saveToJson(town: Town, director: PlanningDirector): string {
  return JSON.stringify(serializeTown(town, director));
}

export function restoreFromJson(json: string): RestoredWorld {
  return deserializeAndRestore(JSON.parse(json) as SaveDocument);
}
