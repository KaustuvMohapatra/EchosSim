/**
 * Checked-in 2D art pack for EchoSim Life.
 * Every resident has a stable, deterministic choice from 32 authored atlases.
 * Rows: front, back, left, right, seated; 4 frames per row at 32x48px.
 */
import { residentHash } from "./pixelResident.js";

export const RESIDENT_ATLAS_COUNT = 32;

export function residentAtlasIndex(agentId: string): number {
  return residentHash(agentId) % RESIDENT_ATLAS_COUNT;
}

export function residentAtlasUrl(agentId: string): string {
  return "/assets/residents/resident-" +
    String(residentAtlasIndex(agentId)).padStart(2, "0") + ".png";
}

/**
 * Find the lowest free generated ID associated with the desired visual look.
 * The atlas assignment lives in the ID itself: no parallel appearance save,
 * no load-order dependence and no mutation of the cognitive personality.
 */
export function nextResidentIdForAppearance(
  existing: readonly string[],
  requestedAtlas: number,
): string {
  if (!Number.isInteger(requestedAtlas) ||
      requestedAtlas < 0 || requestedAtlas >= RESIDENT_ATLAS_COUNT)
    throw new Error("Unknown resident appearance.");
  const used = new Set(existing);
  for (let n = 1; n <= 100_000; n++) {
    const id = "created_" + String(n).padStart(4, "0");
    if (!used.has(id) && residentAtlasIndex(id) === requestedAtlas) return id;
  }
  throw new Error("Resident ID capacity reached.");
}
