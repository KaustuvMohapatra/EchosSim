/**
 * Player command API (Sprint 31.4): the ONLY ways the presentation mutates
 * the simulation. Commands enter through the simulation's own systems.
 */
import { SocialActionType } from "@echosim/social";
import type { Town } from "@echosim/simulation";

export function issueMoveCommand(town: Town, agentId: string, locationId: string): void {
  town.navigation.beginMove(agentId as never, locationId as never, () => { });
}

export function issueSocialCommand(
  town: Town, playerId: string, targetId: string, action: SocialActionType,
): string {
  const result = town.social.attempt(playerId, targetId, action);
  return `${SocialActionType[action]} → ${targetName(town, targetId)}: ${result.reason}`;
}

function targetName(town: Town, id: string): string {
  return town.residents.tryMind(id)?.displayName ?? id;
}
