/**
 * Long-term intentions (Sprint 24): derived read-models from semantic memory
 * and relationships. They bias short-term utility modestly and never execute
 * actions directly. Deterministic; recomputed on demand, never stored.
 */
import type { Town } from "./town.js";
import { PersonalityTrait } from "@echosim/cognition";

export interface LongTermIntention {
  kind: "befriend" | "repair" | "avoid";
  subjectKey: string;
  /** 0..1 — how strongly this intention pulls (before host-side clamps). */
  strength: number;
}

export function deriveIntentions(town: Town, agentId: string): LongTermIntention[] {
  const out: LongTermIntention[] = [];
  const now = town.clock.currentTime.totalMinutes;

  // From durable semantic knowledge.
  for (const sem of town.reflections.semanticOf(agentId)) {
    if (!town.residents.tryMind(sem.subjectKey)) continue;
    // Stale semantics fade out of intention-formation.
    const ageDays = (now - sem.lastReinforcedAtMinutes) / 1440;
    if (ageDays > 14) continue;
    if (sem.concept === "reliability" && sem.polarity > 0.2)
      out.push({ kind: "befriend", subjectKey: sem.subjectKey,
        strength: Math.min(0.9, sem.confidence * 1.1) });
    else if (sem.concept === "unpleasantness" && sem.polarity < -0.3 &&
             town.residents.mind(agentId).personality.get(PersonalityTrait.GrudgeRetention) > 0.45)
      out.push({ kind: "avoid", subjectKey: sem.subjectKey,
        strength: Math.min(0.9, sem.confidence * sem.concept.length / 10 + Math.abs(sem.polarity) * 0.5) });
  }

  // From relationship standing.
  for (const link of town.relationships.all()) {
    if (link.from !== agentId || !town.residents.tryMind(link.to)) continue;
    const r = link.rel;
    if (r.grievance >= 0.45 && r.affinity > -0.2 && r.familiarity >= 0.15)
      out.push({ kind: "repair", subjectKey: link.to, strength: Math.min(0.8, 0.35 + r.grievance * 0.4) });
    else if (r.affinity <= -0.45)
      out.push({ kind: "avoid", subjectKey: link.to, strength: Math.min(0.8, 0.4 + -r.affinity * 0.5) });
    else if (r.affinity >= 0.55 && r.familiarity > 0.3 && r.trust < 0.75)
      out.push({ kind: "befriend", subjectKey: link.to, strength: 0.45 });
  }

  // Dedup per (kind,subject): strongest wins.
  const best = new Map<string, LongTermIntention>();
  for (const it of out) {
    const key = `${it.kind}:${it.subjectKey}`;
    const cur = best.get(key);
    if (!cur || it.strength > cur.strength) best.set(key, it);
  }
  return [...best.values()].sort((a, b) =>
    b.strength - a.strength !== 0 ? b.strength - a.strength :
    a.kind.localeCompare(b.kind));
}

/**
 * Aggregate social-goal bias in [-0.1, +0.1]: wanting to befriend/repair
 * someone nudges Socialize up; avoidance nudges it down. Bounded by design so
 * intentions can never outweigh critical needs (spec 24.7 philosophy).
 */
export function socialBiasOf(intentions: readonly LongTermIntention[]): number {
  let bias = 0;
  for (const it of intentions) {
    if (it.kind === "befriend") bias += 0.05 * it.strength;
    else if (it.kind === "repair") bias += 0.04 * it.strength;
    else bias -= 0.05 * it.strength;
  }
  return Math.max(-0.1, Math.min(0.1, bias));
}
