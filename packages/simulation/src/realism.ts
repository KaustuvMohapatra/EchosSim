/**
 * Social realism services (Sprint 51) + object state (Sprint 52).
 * Privacy: entering private rooms uninvited is a violation witnesses react to.
 * Cleanliness: shared fixtures get dirtier per use and can be cleaned.
 */
import type { Town } from "@echosim/simulation";

export interface PrivacyViolation {
  agentId: string;
  roomId: string;
  roomPrivacy: string;
  witnesses: string[];
}

const HOUSEHOLD_PRIVACY = new Set(["Household", "OwnerOnly"]);

/** Checks the room the agent currently occupies against lot-ownership. */
export function checkPrivacy(
  town: Town,
  agentId: string,
  roomAt: (lotId: string, worldX: number, worldZ: number) =>
    { roomId: string; privacy: string } | undefined,
): PrivacyViolation | null {
  const state = town.agentsById.get(agentId);
  if (!state?.hasLocation || !state.currentLocationId) return null;
  const lotId = state.currentLocationId;
  const pos = (town as unknown as {
    _lastWorldPos?: Map<string, { x: number; z: number }> })._lastWorldPos?.get(agentId);
  const room = roomAt(lotId, pos?.x ?? 0, pos?.z ?? 0);
  if (!room) return null;
  if (!HOUSEHOLD_PRIVACY.has(room.privacy)) return null;

  // Allowed when the agent shares a Household group with someone whose HOME
  // is this lot (i.e. the household that owns the space).
  const owners = town.residents.orderedIds().filter((id) => {
    const m = town.residents.mind(id);
    return m.homeLocationId === lotId;
  });
  for (const owner of owners) {
    const shared = town.groups
      .sharedGroups(agentId, owner)
      .some((g) => g.kind === "Household");
    if (shared) return null;
  }

  const witnesses = town.residents.orderedIds().filter((id) => {
    if (id === agentId) return false;
    const s = town.agentsById.get(id);
    return s?.hasLocation && s.currentLocationId === lotId;
  });
  return { agentId, roomId: room.roomId, roomPrivacy: room.privacy, witnesses };
}

export class ObjectCleanliness {
  private readonly state = new Map<string, number>();
  decayPerUse = 0.15;
  constructor(trackedIds: Iterable<string>) {
    for (const id of trackedIds) this.state.set(id, 1);
  }
  use(objectId: string): number {
    const cur = this.state.get(objectId) ?? 1;
    const next = Math.max(0, cur - this.decayPerUse);
    this.state.set(objectId, next);
    return next;
  }
  clean(objectId: string): number {
    const cur = this.state.get(objectId) ?? 1;
    const next = Math.min(1, cur + 0.5);
    this.state.set(objectId, next);
    return next;
  }
  levelOf(objectId: string): number { return this.state.get(objectId) ?? 1; }
}
