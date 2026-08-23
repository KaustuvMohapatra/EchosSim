/**
 * Content validation + authored-town composition (Sprint 29).
 * Fails fast on: duplicate ids, unknown location/job/group refs, invalid
 * trait values, bad relationship targets, malformed hours.
 */
import { PersonalityProfile, PersonalityTrait, TRAIT_COUNT } from "@echosim/cognition";
import { Town, PlanningDirector } from "@echosim/simulation";
import {
  TOWN_LOCATIONS, TOWN_GROUPS, RESIDENTS, SEED_RELATIONSHIPS,
  type ResidentDef,
} from "./townContent.js";

export interface ValidationIssue {
  rule: string;
  detail: string;
}

export function validateContent(
  content: {
    locations: readonly { id: string; hours?: { openMinuteOfDay: number; closeMinuteOfDay: number } }[];
    groups: readonly { id: string; kind: string; meetingLocationId?: string }[];
    residents: readonly ResidentDef[];
    relationships: readonly { from: string; to: string }[];
  },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Duplicate ids.
  const seenLoc = new Set<string>();
  for (const l of content.locations) {
    if (seenLoc.has(l.id)) issues.push({ rule: "duplicate-id", detail: `location '${l.id}'` });
    seenLoc.add(l.id);
    if (l.hours) {
      const { openMinuteOfDay: o, closeMinuteOfDay: c } = l.hours;
      if (!(o >= 0 && o <= 1439 && c >= 0 && c <= 1439))
        issues.push({ rule: "bad-hours", detail: `location '${l.id}' (${o}-${c})` });
    }
  }

  const seenGroup = new Set<string>();
  for (const g of content.groups) {
    if (seenGroup.has(g.id)) issues.push({ rule: "duplicate-id", detail: `group '${g.id}'` });
    seenGroup.add(g.id);
    if (g.meetingLocationId !== undefined && !seenLoc.has(g.meetingLocationId))
      issues.push({ rule: "unknown-location", detail: `group '${g.id}' -> '${g.meetingLocationId}'` });
  }

  const residentIds = new Set<string>();
  for (const r of content.residents) {
    if (residentIds.has(r.id))
      issues.push({ rule: "duplicate-id", detail: `resident '${r.id}'` });
    residentIds.add(r.id);
    if (!seenLoc.has(r.homeId))
      issues.push({ rule: "unknown-location", detail: `${r.id} home '${r.homeId}'` });
    if (r.job && !seenLoc.has(r.job.workplaceId))
      issues.push({ rule: "unknown-location", detail: `${r.id} workplace '${r.job.workplaceId}'` });
    if (r.job && r.job.shiftEndMinuteOfDay < r.job.shiftStartMinuteOfDay &&
        r.job.shiftEndMinuteOfDay > 240)
      issues.push({ rule: "bad-shift", detail: `${r.id} shift wraps oddly` });
    if (r.traits) {
      for (const [k, v] of Object.entries(r.traits)) {
        const idx = Number(k);
        if (!Number.isInteger(idx) || idx < 0 || idx >= TRAIT_COUNT)
          issues.push({ rule: "bad-trait-index", detail: `${r.id} trait ${k}` });
        else if (v === undefined || v < 0 || v > 1)
          issues.push({ rule: "trait-out-of-range", detail: `${r.id} trait ${k}=${v}` });
      }
    }
    for (const g of r.groups)
      if (!seenGroup.has(g))
        issues.push({ rule: "unknown-group", detail: `${r.id} -> '${g}'` });
    if (r.preferences)
      for (const [k, v] of Object.entries(r.preferences))
        if (typeof v !== "number" || v < 0 || v > 1)
          issues.push({ rule: "preference-out-of-range", detail: `${r.id} ${k}=${v}` });
  }

  const known = new Set([...residentIds]);
  for (const rel of content.relationships) {
    if (!known.has(rel.from)) issues.push({ rule: "unknown-resident", detail: `rel from '${rel.from}'` });
    if (!known.has(rel.to)) issues.push({ rule: "unknown-resident", detail: `rel to '${rel.to}'` });
    if (rel.from === rel.to)
      issues.push({ rule: "self-relationship", detail: rel.from });
  }
  return issues;
}

export interface AuthoredTown {
  town: Town;
  director: PlanningDirector;
  residentIds: string[];
}

/** Builds the full authored town. Throws if content validation fails. */
export function createAuthoredTown(seed: bigint | number): AuthoredTown {
  const issues = validateContent({
    locations: TOWN_LOCATIONS,
    groups: TOWN_GROUPS,
    residents: RESIDENTS,
    relationships: SEED_RELATIONSHIPS,
  });
  if (issues.length > 0) {
    const summary = issues.map((i) => `[${i.rule}] ${i.detail}`).join("; ");
    throw new Error(`Invalid town content: ${summary}`);
  }

  // Lazy import avoided — no cycle exists (simulation never imports content).
  const town = new Town(seed);

  for (const l of TOWN_LOCATIONS) {
    town.registerLocation({
      id: l.id, displayName: l.name,
      capacity: l.capacity ?? Number.MAX_SAFE_INTEGER,
      hours: l.hours,
    });
  }

  for (const g of TOWN_GROUPS) {
    town.groups.define({
      id: g.id, kind: g.kind, name: g.name,
      ...(g.meetingLocationId !== undefined ? { meetingLocationId: g.meetingLocationId } : {}),
    });
  }

  for (const r of RESIDENTS) {
    let personality = PersonalityProfile.balanced();
    if (r.traits) {
      const b = personality.edit();
      for (const [k, v] of Object.entries(r.traits))
        b.set(Number(k) as PersonalityTrait, v as number);
      personality = b.build();
    }
    town.spawnResident({
      id: r.id,
      displayName: r.name,
      homeLocationId: r.homeId,
      personality,
      initialNeeds: { [1 /* Hunger */]: 45 + (seedHash(r.id) % 30) },
    });
    for (const gid of r.groups) town.groups.addMember(gid, r.id);

    const mind = town.residents.mind(r.id);
    if (r.job) {
      mind.job = {
        id: `job_${r.id}`, title: r.job.title, workplace: r.job.workplaceId,
        shiftStartMinuteOfDay: r.job.shiftStartMinuteOfDay,
        shiftEndMinuteOfDay: r.job.shiftEndMinuteOfDay,
        incomePerHour: r.job.incomePerHour,
      };
      mind.isRestDayToday = () => false;
    }
    if (r.preferences) mind.setPreferences({ get: (key) => r.preferences![key] ?? 0 });
  }

  for (const rel of SEED_RELATIONSHIPS) {
    town.relationships.import(rel.from, rel.to, {
      familiarity: rel.familiarity ?? 0,
      affinity: rel.affinity ?? 0,
      trust: rel.trust ?? 0,
      respect: rel.respect ?? 0,
      attraction: rel.attraction ?? 0,
      fear: 0, grievance: rel.grievance ?? 0, obligation: 0,
    });
  }

  const director = new PlanningDirector(town);
  return { town, director, residentIds: [...town.residents.orderedIds()] };
}

function seedHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
