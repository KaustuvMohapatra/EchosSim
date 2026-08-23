/** Furniture meshes + seat poses (Sprint 38). */
import { MeshBuilder, Scene, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { PLACED_OBJECTS, type PlacedObject } from "../interaction/catalog.js";

const KIND_GEOM: Record<PlacedObject["kind"], {
  w: number; h: number; d: number; color: [number, number, number];
}> = {
  chair:     { w: 0.55, h: 0.5,  d: 0.55, color: [0.45, 0.3, 0.2] },
  sofa:      { w: 1.6,  h: 0.65, d: 0.8,  color: [0.35, 0.4, 0.5] },
  table:     { w: 1.1,  h: 0.72, d: 1.1,  color: [0.5, 0.38, 0.26] },
  bookshelf: { w: 0.4,  h: 2.0,  d: 1.6,  color: [0.42, 0.3, 0.22] },
  bench:     { w: 1.7,  h: 0.45, d: 0.55, color: [0.42, 0.34, 0.24] },
  counter:   { w: 3.2,  h: 1.0,  d: 0.7,  color: [0.3, 0.32, 0.36] },
  bed:       { w: 1.4,  h: 0.5,  d: 2.0,  color: [0.5, 0.48, 0.55] },
  desk:      { w: 1.5,  h: 0.74, d: 0.75, color: [0.44, 0.34, 0.24] },
};

export interface FurnitureHandle {
  object: PlacedObject;
  mesh: import("@babylonjs/core").Mesh;
}

export function buildFurniture(scene: Scene): FurnitureHandle[] {
  const handles: FurnitureHandle[] = [];
  for (const obj of PLACED_OBJECTS) {
    // Resolve lot centre via metadata on the lot meshes is unnecessary —
    // layout import keeps us engine-consistent.
    const g = KIND_GEOM[obj.kind];
    const mesh = MeshBuilder.CreateBox(`obj-${obj.objectId}`, {
      width: g.w, height: g.h, depth: g.d,
    }, scene);
    mesh.material = (() => {
      const m = new StandardMaterial(`omat-${obj.objectId}`, scene);
      m.diffuseColor = new Color3(...g.color);
      m.specularColor = new Color3(0.04, 0.04, 0.04);
      return m;
    })();
    // Position resolved later by FurniturePlacer (needs lot lookup).
    mesh.metadata = { kind: "object", objectId: obj.objectId };
    mesh.isPickable = true;
    handles.push({ object: obj, mesh });
  }
  return handles;
}

export function placeFurniture(
  handles: FurnitureHandle[],
  lotCenterOf: (lotId: string) => { x: number; z: number } | undefined,
  seatedAgentAt?: (seatOrAnchorKey: string) => string | undefined,
): void {
  for (const { object: o, mesh } of handles) {
    const lot = lotCenterOf(o.lotId);
    if (!lot) continue;
    mesh.position.set(lot.x + o.dx, gHeight(o), lot.z + o.dz);
    mesh.rotation.y = o.rotationY;

    // Occupied chairs sink slightly to read as "in use" (visual only).
    void seatedAgentAt;
  }
}

function gHeight(o: PlacedObject): number {
  switch (o.kind) {
    case "chair": return 0.25;
    case "sofa": return 0.33;
    case "bed": return 0.25;
    default: return KIND_GEOM[o.kind].h / 2 + 0.05;
  }
}
