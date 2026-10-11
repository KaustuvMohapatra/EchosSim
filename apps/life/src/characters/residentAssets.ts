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
