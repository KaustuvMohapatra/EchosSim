/**
 * Venue activities (Sprint 50): real interactions at businesses and public
 * spaces. Each validates place/hours then produces simulation effects
 * (money, needs, skills, memory) through existing systems.
 */
import type { Town } from "@echosim/simulation";
import type { SkillName } from "@echosim/social";

export type VenueActivity =
  | "order_coffee" | "buy_groceries" | "read_book" | "sketch" | "jog";

interface ActivitySpec {
  label: string;
  cost: number;
  requiresOpen: boolean;
  /** Substring matched against the agent's current location id. */
  lotIncludes?: string;
  /** Positive amounts relieve (value ↓), negatives drain (value ↑). */
  needs?: Array<{ kind: number; amount: number }>;
  skill?: { name: SkillName; xp: number };
  memory: string;
}

const ACTIVITIES: Record<VenueActivity, ActivitySpec> = {
  order_coffee: {
    label: "Ordered a coffee", cost: 4, requiresOpen: true, lotIncludes: "cafe",
    needs: [{ kind: 3 /* Fun */, amount: 8 }, { kind: 4 /* Comfort */, amount: 5 }],
    skill: { name: "Cooking", xp: 2 },
    memory: "enjoyed a coffee at the cafe",
  },
  buy_groceries: {
    label: "Bought groceries", cost: 12, requiresOpen: true, lotIncludes: "store",
    needs: [{ kind: 0 /* Hunger */, amount: 10 }],
    memory: "bought groceries",
  },
  read_book: {
    label: "Read a book", cost: 0, requiresOpen: true, lotIncludes: "library",
    needs: [{ kind: 3 /* Fun */, amount: 14 }],
    skill: { name: "Knowledge", xp: 8 },
    memory: "lost track of time reading",
  },
  sketch: {
    label: "Sketched the street", cost: 0, requiresOpen: true, lotIncludes: "studio",
    needs: [{ kind: 3 /* Fun */, amount: 12 }],
    skill: { name: "Creativity", xp: 9 },
    memory: "sketched something they were proud of",
  },
  jog: {
    label: "Went for a jog", cost: 0, requiresOpen: false, lotIncludes: "park",
    needs: [
      { kind: 1 /* Energy */, amount: -12 }, // exertion drains energy
      { kind: 3 /* Fun */, amount: 10 },
    ],
    skill: { name: "Fitness", xp: 9 },
    memory: "had an energising run",
  },
};

export interface ActivityResult {
  ok: boolean;
  feedback: string;
}

export function performVenueActivity(
  town: Town, agentId: string, activity: VenueActivity,
): ActivityResult {
  const spec = ACTIVITIES[activity];
  if (!spec) return { ok: false, feedback: "Unknown activity." };

  const state = town.agentsById.get(agentId);
  if (!state?.hasLocation || !state.currentLocationId)
    return { ok: false, feedback: "You are nowhere." };
  const locId: string = state.currentLocationId;
  if (spec.lotIncludes && !locId.includes(spec.lotIncludes))
    return { ok: false, feedback: "Wrong place for that." };

  const rt = town.locations.get(locId as never);
  if (spec.requiresOpen && !rt.isOpen)
    return { ok: false, feedback: `${rt.definition.displayName} is closed.` };

  const mind = town.residents.mind(agentId);

  if (spec.cost > 0) {
    if (mind.money < spec.cost)
      return { ok: false, feedback: "Not enough money." };
    mind.money -= spec.cost;
  }

  for (const n of spec.needs ?? [])
    mind.needs.relieve(n.kind as never, n.amount);

  if (spec.skill)
    town.skills.award(agentId, spec.skill.name, spec.skill.xp);

  const now = town.clock.currentTime.totalMinutes;
  town.memory.storeFor(agentId).add(now, (id) => ({
    id,
    timestampMinutes: now,
    eventType: "activity",
    subject: agentId,
    summary: spec.memory,
    importance: 0.32,
    valence: 0.35,
    confidence: 1,
    source: 0 as never,
    sourceEventId: 0,
    accessCount: 0,
    lastAccessMinutes: now,
  }));

  return { ok: true, feedback: spec.label + "." };
}
