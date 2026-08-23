/** Babylon world construction: ground, streets, lots, labels (Sprint 36). */
import {
  Color3, DynamicTexture, MeshBuilder, Scene, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { LOTS, WORLD_BOUNDS } from "./layout.js";
import type { Town } from "@echosim/simulation";

export function buildTownMeshes(scene: Scene, town: Town): void {
  // Ground.
  const ground = MeshBuilder.CreateGround("ground", {
    width: WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 40,
    height: WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ + 40,
  }, scene);
  const groundMat = new StandardMaterial("ground-mat", scene);
  groundMat.diffuseColor = new Color3(0.16, 0.19, 0.17);
  ground.material = groundMat;

  // Street cross (asphalt strips).
  const streetMat = new StandardMaterial("street-mat", scene);
  streetMat.diffuseColor = new Color3(0.12, 0.13, 0.15);
  for (const [w, d, x, z] of [
    [150, 10, 0, -8], [10, 120, -28, 0], [10, 120, 14, 0],
  ] as const) {
    const street = MeshBuilder.CreateGround(`street${x}_${z}`, { width: w, height: d }, scene);
    street.position.set(x, 0.01, z);
    street.material = streetMat;
  }

  // Lots.
  for (const lot of LOTS) {
    const rt = town.locations.tryGet(lot.locationId as never);
    const name = rt?.definition.displayName ?? lot.locationId;

    const box = MeshBuilder.CreateBox(`lot-${lot.locationId}`, {
      width: lot.width, depth: lot.depth, height: lot.height,
    }, scene);
    box.position.set(lot.x, lot.height / 2 + 0.05, lot.z);
    const mat = new StandardMaterial(`mat-${lot.locationId}`, scene);
    mat.diffuseColor = new Color3(...lot.color);
    mat.specularColor = new Color3(0.05, 0.05, 0.05);
    box.material = mat;
    box.isPickable = true;
    box.metadata = { kind: "lot", locationId: lot.locationId };

    if (lot.locationId === "park") {
      // Park stays flat: replace the box with a green pad.
      box.scaling.y = 0.02;
      box.position.y = 0.03;
    }

    makeLabel(scene, name,
      new Vector3(lot.x, lot.height + 1.6, lot.z), lot.width);
  }
}

function makeLabel(scene: Scene, text: string, position: Vector3, width: number): void {
  const dt = new DynamicTexture(`label-tex-${text}`, { width: 512, height: 128 }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = "bold 56px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#dbe7f5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 8;
  ctx.fillText(text, 256, 64);
  dt.update();

  const mat = new StandardMaterial(`label-mat-${text}`, scene);
  mat.diffuseTexture = dt;
  mat.opacityTexture = dt;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = MeshBuilder.CreatePlane(`label-${text}`,
    { width: Math.max(9, width * 0.85), height: 2.4 }, scene);
  plane.position.copyFrom(position);
  plane.billboardMode = 7; // all axes
  plane.material = mat;
  plane.isPickable = false;
}
