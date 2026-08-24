/** World map model (Sprint 45): districts over the authored layout. */
import { LOTS } from "./layout.js";

export interface District {
  id: string;
  name: string;
  lots: readonly string[];
  tint: string;
}

export const DISTRICTS: readonly District[] = [
  { id: "central", name: "Central", tint: "#7dd3fc",
    lots: ["cafe", "bakery", "store", "bookstore", "hall"] },
  { id: "residential", name: "Residential", tint: "#34d399",
    lots: ["apt_a", "apt_b", "apt_c"] },
  { id: "riverside", name: "Riverside", tint: "#f472b6",
    lots: ["restaurant", "park"] },
  { id: "civic", name: "Civic", tint: "#a78bfa",
    lots: ["library", "clinic", "studio"] },
];

export function districtOf(lotId: string): District | undefined {
  return DISTRICTS.find((d) => d.lots.includes(lotId));
}

export interface MapLot {
  locationId: string;
  x: number; z: number;
  width: number; depth: number;
  district?: District;
}

/** Normalised 0..1 coordinates for a minimap-style render. */
export function mapLots(): MapLot[] {
  const spanX = WORLD_SPAN.maxX - WORLD_SPAN.minX;
  const spanZ = WORLD_SPAN.maxZ - WORLD_SPAN.minZ;
  return LOTS.map((l) => ({
    locationId: l.locationId,
    x: (l.x - WORLD_SPAN.minX) / spanX,
    z: (l.z - WORLD_SPAN.minZ) / spanZ,
    width: l.width / spanX,
    depth: l.depth / spanZ,
    district: districtOf(l.locationId),
  }));
}

export const WORLD_SPAN = { minX: -70, maxX: 70, minZ: -55, maxZ: 55 };
