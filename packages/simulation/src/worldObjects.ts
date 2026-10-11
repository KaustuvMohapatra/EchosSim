/**
 * Engine-independent effects of player-placed world objects.
 *
 * The caller must resolve the object from its authoritative, currently installed
 * world inventory. This module validates location, hours, cooldown, resident and
 * activity compatibility again so deleted/out-of-venue objects cannot be used.
 */
import { ObservationReach, PerceptionSource, type SkillName } from "@echosim/social";
import type { Town } from "./town.js";

export type WorldObjectKind =
  | "chair" | "sofa" | "table" | "bookshelf" | "bench" | "bed" | "desk" | "counter"
  | "arcade" | "easel" | "garden" | "noticeboard";

export interface WorldObject {
  objectId: string;
  kind: WorldObjectKind;
  lotId: string;
}

export interface WorldObjectActivity {
  id: string;
  label: string;
  verb: string;
  /** Positive need relief lowers accumulated pressure. */
  needs: readonly { kind: number; amount: number }[];
  skill?: { name: SkillName; xp: number };
  requiresOpen?: boolean;
  cooldownMinutes: number;
}

const activities: Record<WorldObjectKind, WorldObjectActivity> = {
  chair: { id: "rest", label: "Take a seat", verb: "rested for a while",
    needs: [{ kind: 4, amount: 7 }], cooldownMinutes: 100 },
  sofa: { id: "relax", label: "Relax", verb: "relaxed on the sofa",
    needs: [{ kind: 4, amount: 12 }, { kind: 3, amount: 4 }], cooldownMinutes: 120 },
  table: { id: "reflect", label: "Reflect", verb: "spent a quiet moment thinking",
    needs: [{ kind: 4, amount: 5 }], cooldownMinutes: 130 },
  bookshelf: { id: "read", label: "Read a book", verb: "read a book",
    needs: [{ kind: 3, amount: 14 }], skill: { name: "Knowledge", xp: 7 }, cooldownMinutes: 140 },
  bench: { id: "rest", label: "Take a break", verb: "took a break on a bench",
    needs: [{ kind: 4, amount: 9 }], cooldownMinutes: 100 },
  bed: { id: "nap", label: "Take a nap", verb: "took a restorative nap",
    needs: [{ kind: 1, amount: 14 }], cooldownMinutes: 180 },
  desk: { id: "create", label: "Work on a project", verb: "worked on a creative project",
    needs: [{ kind: 3, amount: 7 }], skill: { name: "Creativity", xp: 6 }, cooldownMinutes: 150 },
  counter: { id: "chat", label: "Chat with locals", verb: "chatted at the counter",
    needs: [{ kind: 3, amount: 8 }], skill: { name: "Social", xp: 4 }, cooldownMinutes: 150 },
  arcade: { id: "play", label: "Play arcade game", verb: "played an arcade game",
    needs: [{ kind: 3, amount: 22 }, { kind: 1, amount: -3 }],
    skill: { name: "Social", xp: 5 }, cooldownMinutes: 130 },
  easel: { id: "paint", label: "Paint", verb: "painted at an easel",
    needs: [{ kind: 3, amount: 15 }], skill: { name: "Creativity", xp: 11 },
    cooldownMinutes: 150 },
  garden: { id: "tend", label: "Tend the garden", verb: "tended a community garden",
    needs: [{ kind: 3, amount: 10 }, { kind: 1, amount: -5 }],
    skill: { name: "Fitness", xp: 6 }, cooldownMinutes: 160 },
  noticeboard: { id: "browse", label: "Browse community notices", verb: "read the neighbourhood notices",
    needs: [{ kind: 3, amount: 5 }], skill: { name: "Knowledge", xp: 4 },
    cooldownMinutes: 180 },
};

export function activityForObject(kind: WorldObjectKind): WorldObjectActivity {
  return activities[kind];
}

export function objectActivityAvailable(
  town: Town, agentId: string, object: WorldObject,
): { ok: boolean; feedback: string } {
  if (!town.residents.tryMind(agentId)) return { ok: false, feedback: "Resident not found." };
  const state = town.agentsById.get(agentId);
  if (!state?.hasLocation || state.currentLocationId !== object.lotId)
    return { ok: false, feedback: "Visit this object's location first." };
  const location = town.locations.tryGet(object.lotId as never);
  if (!location) return { ok: false, feedback: "The location no longer exists." };
  const spec = activityForObject(object.kind);
  if (spec.requiresOpen && !location.isOpen)
    return { ok: false, feedback: "This location is currently closed." };
  const now = town.clock.currentTime.totalMinutes;
  const previous = town.memory.storeFor(agentId).all
    .filter((entry) => entry.eventType === "world_object" &&
      entry.subject === object.objectId)
    .at(-1);
  if (previous && now - previous.timestampMinutes < spec.cooldownMinutes)
    return { ok: false, feedback: "They've used this recently. Try later." };
  return { ok: true, feedback: "" };
}

export function performWorldObjectActivity(
  town: Town, agentId: string, object: WorldObject, activityId: string,
): { ok: boolean; feedback: string } {
  const spec = activityForObject(object.kind);
  if (activityId !== spec.id) return { ok: false, feedback: "Unsupported object action." };
  const check = objectActivityAvailable(town, agentId, object);
  if (!check.ok) return check;
  const mind = town.residents.mind(agentId);
  for (const need of spec.needs) mind.needs.relieve(need.kind as never, need.amount);
  if (spec.skill) town.skills.award(agentId, spec.skill.name, spec.skill.xp);
  const now = town.clock.currentTime.totalMinutes;
  // The subject is the actual installed object: survives world save/restore and
  // prevents spam after a reload without maintaining an unsaved cooldown map.
  town.memory.storeFor(agentId).add(now, (id) => ({
    id, timestampMinutes: now, eventType: "world_object",
    subject: object.objectId, where: object.lotId,
    summary: spec.verb + " at " +
      town.locations.get(object.lotId as never).definition.displayName,
    importance: 0.35, valence: 0.32, confidence: 1,
    source: PerceptionSource.DirectParticipation, sourceEventId: 0,
    accessCount: 0, lastAccessMinutes: now,
  }));
  // Genuine simulation perception: only the actor and co-located observers
  // can witness this, never a telepathic update for the whole town.
  town.perception.publish("world_object_activity", [agentId], object.lotId,
    ObservationReach.SameLocation);
  return { ok: true, feedback: spec.label + " completed." };
}
