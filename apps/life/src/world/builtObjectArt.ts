/**
 * Visible, pickable 2.5D models for player-built activity equipment.
 *
 * Indoor venue interiors do not yet have cutaway rendering. As an intentional
 * intermediate visual treatment, interactive props are exhibited in a narrow
 * frontage/courtyard beside the sidewalk, not hidden inside opaque buildings.
 * Their BuildController lot ownership/footprints remain unchanged.
 */
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import type { BuildPlacement } from "../build/BuildController.js";
import { lotOf } from "./layout.js";
import { laneOf } from "./pedestrianPaths.js";

const geometry: Record<BuildPlacement["kind"], {
  w: number; h: number; d: number; color: [number, number, number];
}> = {
  chair: { w: 0.8, h: 0.65, d: 0.75, color: [0.54, 0.39, 0.28] },
  sofa: { w: 1.7, h: 0.85, d: 0.85, color: [0.40, 0.51, 0.62] },
  table: { w: 1.3, h: 0.65, d: 1.15, color: [0.55, 0.38, 0.27] },
  bookshelf: { w: 0.75, h: 1.9, d: 1.3, color: [0.48, 0.34, 0.28] },
  bench: { w: 1.8, h: 0.65, d: 0.7, color: [0.55, 0.41, 0.27] },
  bed: { w: 2.0, h: 0.60, d: 1.4, color: [0.57, 0.51, 0.64] },
  desk: { w: 1.5, h: 0.74, d: 0.85, color: [0.54, 0.43, 0.30] },
  counter: { w: 1.5, h: 1.1, d: 0.8, color: [0.38, 0.43, 0.47] },
  arcade: { w: 1.2, h: 2.0, d: 0.9, color: [0.31, 0.38, 0.58] },
  easel: { w: 1.1, h: 1.65, d: 0.85, color: [0.63, 0.45, 0.32] },
  garden: { w: 2.1, h: 0.42, d: 1.4, color: [0.41, 0.38, 0.27] },
  noticeboard: { w: 1.4, h: 1.65, d: 0.50, color: [0.56, 0.41, 0.26] },
};

function material(scene: Scene, name: string, color: [number,number,number]): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = new Color3(...color);
  mat.specularColor = Color3.Black();
  return mat;
}

function part(scene: Scene, root: Mesh, id: string,
  dims: { w: number; h: number; d: number },
  at: { x: number; y: number; z: number },
  color: [number,number,number],
): Mesh {
  const piece = MeshBuilder.CreateBox("prop-" + id, {
    width: dims.w, height: dims.h, depth: dims.d,
  }, scene);
  piece.parent = root;
  piece.position.set(at.x, at.y, at.z);
  piece.material = material(scene, "prop-mat-" + id, color);
  piece.isPickable = true;
  piece.metadata = root.metadata;
  return piece;
}

export function buildWorldObjectMesh(scene: Scene, placement: BuildPlacement): Mesh {
  const g = geometry[placement.kind];
  const root = MeshBuilder.CreateBox("built-" + placement.objectId, {
    width: g.w, height: g.h, depth: g.d,
  }, scene);
  const lot = lotOf(placement.lotId);
  const placeX = lot ? lot.x + placement.dx : placement.dx;
  const placeZ = lot ? lot.z + placement.dz : placement.dz;
  if (lot && lot.locationId !== "park") {
    const east = laneOf(lot) > lot.x;
    const direction = east ? 1 : -1;
    // Display the prop in front of the façade rather than inside a solid box.
    const courtyardX = lot.x + direction * (lot.width / 2 + 1.6 +
      Math.max(-3, Math.min(3, placement.dx)) * 0.18);
    root.position.set(courtyardX, g.h / 2 + 0.07,
      Math.max(lot.z - lot.depth / 2 + 1.2,
        Math.min(lot.z + lot.depth / 2 - 1.2, placeZ)));
  } else {
    root.position.set(placeX, g.h / 2 + 0.07, placeZ);
  }
  root.rotation.y = placement.rot * Math.PI / 2;
  root.metadata = { kind: "built", objectId: placement.objectId };
  root.isPickable = true;
  root.material = material(scene, "built-mat-" + placement.objectId, g.color);

  const label = placement.objectId;
  switch (placement.kind) {
    case "arcade":
      part(scene, root, label+"-screen", { w: 0.93, h: 0.62, d: 0.07 },
        { x: 0, y: 0.25, z: -0.49 }, [0.10, 0.77, 0.77]);
      part(scene, root, label+"-marquee", { w: 1.0, h: 0.20, d: 0.09 },
        { x: 0, y: 0.77, z: -0.49 }, [0.97, 0.73, 0.33]);
      part(scene, root, label+"-controls", { w: 0.84, h: 0.12, d: 0.3 },
        { x: 0, y: -0.16, z: -0.42 }, [0.72, 0.26, 0.49]);
      break;
    case "easel":
      part(scene, root, label+"-canvas", { w: 0.96, h: 0.84, d: 0.10 },
        { x: 0, y: 0.18, z: -0.48 }, [0.96, 0.89, 0.73]);
      part(scene, root, label+"-painting", { w: 0.44, h: 0.30, d: 0.025 },
        { x: 0.10, y: 0.21, z: -0.55 }, [0.38, 0.65, 0.65]);
      break;
    case "garden":
      part(scene, root, label+"-soil", { w: 1.8, h: 0.06, d: 1.13 },
        { x: 0, y: 0.24, z: 0 }, [0.37, 0.25, 0.20]);
      for (let i = 0; i < 4; i++) {
        part(scene, root, label+"-plant-"+i, { w: 0.28, h: 0.40, d: 0.30 },
          { x: -0.67 + i*0.43, y: 0.49, z: i%2 ? 0.22 : -0.25 },
          i%2 ? [0.39, 0.68, 0.39] : [0.54, 0.74, 0.42]);
      }
      break;
    case "noticeboard":
      part(scene, root, label+"-panel", { w: 1.21, h: 0.88, d: 0.08 },
        { x: 0, y: 0.23, z: -0.30 }, [0.76, 0.65, 0.44]);
      for (let i = 0; i < 3; i++) {
        part(scene, root, label+"-note-"+i, { w: 0.28, h: 0.34, d: 0.025 },
          { x: -0.38 + i*0.38, y: 0.24, z: -0.35 },
          i === 1 ? [0.91, 0.77, 0.83] : [0.92, 0.87, 0.68]);
      }
      break;
    default:
      break;
  }
  return root;
}
