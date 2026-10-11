/** Pixel-textured 2.5D Babylon neighbourhood, preserving lot picking. */
import {
  Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { LOTS, WORLD_BOUNDS } from "./layout.js";
import { STREET_LANES, CROSS_STREETS, laneOf } from "./pedestrianPaths.js";
import {
  grassMaterial, pavementMaterial, roofMaterial, facadeMaterial,
  flowerMaterial, treeMaterial, lampMaterial,
} from "./pixelWorldArt.js";
import type { Town } from "@echosim/simulation";

function smallHash(x: number, z: number): number {
  let v = Math.imul(x + 74, 1337) ^ Math.imul(z + 15, 9187);
  v = Math.imul(v ^ (v >>> 13), 152111);
  return (v ^ (v >>> 16)) >>> 0;
}

export interface TownScenery { update(deltaSeconds: number): void }

export function buildTownMeshes(scene: Scene, town: Town): TownScenery {
  const ground = MeshBuilder.CreateGround("pixel-grassland", {
    width: WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 36,
    height: WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ + 36,
  }, scene);
  ground.material = grassMaterial(scene);
  ground.isPickable = false;

  const cobbles = pavementMaterial(scene);
  const roofs = roofMaterial(scene);
  // Keep visual pavement and pathfinding on precisely the same corridors.
  for (const x of STREET_LANES) {
    const strip = MeshBuilder.CreateGround(`pixel-walkway-x-${x}`, {
      width: 3.9, height: 115,
    }, scene);
    strip.position.set(x, 0.032, 0);
    strip.material = cobbles;
    strip.metadata = { kind: "walkway" };
  }
  for (const z of CROSS_STREETS) {
    const strip = MeshBuilder.CreateGround(`pixel-walkway-z-${z}`, {
      width: 146, height: 3.9,
    }, scene);
    strip.position.set(0, 0.036, z);
    strip.material = cobbles;
    strip.metadata = { kind: "walkway" };
  }

  // Pickable solid building meshes remain the authoritative pointer targets.
  for (const lot of LOTS) {
    const rt = town.locations.tryGet(lot.locationId as never);
    const name = rt?.definition.displayName ?? lot.locationId;
    const isPark = lot.locationId === "park";
    const wall = MeshBuilder.CreateBox(`lot-${lot.locationId}`, {
      width: lot.width, depth: lot.depth, height: lot.height,
    }, scene);
    wall.position.set(lot.x, lot.height / 2 + (isPark ? 0.012 : 0.06), lot.z);
    const base = new StandardMaterial(`lot-wall-${lot.locationId}`, scene);
    base.diffuseColor = isPark ? new Color3(0.33, 0.53, 0.34)
      : new Color3(...lot.color);
    base.specularColor = Color3.Black();
    wall.material = base;
    wall.isPickable = true;
    wall.metadata = { kind: "lot", locationId: lot.locationId };

    if (isPark) {
      wall.scaling.y = 0.06;
      wall.position.y = 0.04;
      makeLabel(scene, name, new Vector3(lot.x, 1.7, lot.z), 7);
      continue;
    }

    const roof = MeshBuilder.CreateBox(`pixel-roof-${lot.locationId}`, {
      width: lot.width + 0.9, depth: lot.depth + 0.9, height: 0.42,
    }, scene);
    roof.position.set(lot.x, lot.height + 0.37, lot.z);
    roof.material = roofs;
    roof.isPickable = false;

    // 2D façade sprites match the chosen sidewalk-facing exterior walls.
    const onEast = laneOf(lot) > lot.x;
    const facade = MeshBuilder.CreatePlane(`pixel-front-${lot.locationId}`, {
      width: Math.max(2, lot.depth - 0.3),
      height: Math.max(2, lot.height - 0.38),
    }, scene);
    facade.position.set(lot.x + (onEast ? 1 : -1) * (lot.width / 2 + 0.075),
      lot.height / 2 + 0.07, lot.z);
    facade.rotation.y = onEast ? Math.PI / 2 : -Math.PI / 2;
    facade.material = facadeMaterial(scene, lot);
    facade.isPickable = false;

    // Small warm entrance light indicates where the resident sprites arrive.
    const porch = MeshBuilder.CreateBox(`pixel-porch-${lot.locationId}`, {
      width: 1.25, height: 0.13, depth: 2.1,
    }, scene);
    porch.position.set(lot.x + (onEast ? 1 : -1) * (lot.width / 2 + 0.9),
      0.09, lot.z);
    const mat = new StandardMaterial(`porch-mat-${lot.locationId}`, scene);
    mat.diffuseColor = new Color3(0.78, 0.68, 0.49);
    mat.specularColor = Color3.Black();
    porch.material = mat;
    porch.isPickable = false;
    makeLabel(scene, name, new Vector3(lot.x, lot.height + 2.2, lot.z), 8);
  }

  const foliage = populateFoliage(scene);
  populateLamps(scene);
  let elapsed = 0;
  return {
    update(deltaSeconds: number): void {
      elapsed += Math.max(0, Math.min(0.1, deltaSeconds));
      foliage.forEach((tree, i) => {
        // Soft breeze, intentionally subtle and independent of sim decisions.
        tree.scaling.x = 1 + 0.025 * Math.sin(elapsed * 1.1 + i * 1.7);
      });
    },
  };
}

/** Pixel billboard vegetation, placed away from sidewalks and solid buildings. */
function populateFoliage(scene: Scene): Mesh[] {
  const foliage: Mesh[] = [];
  const trees = [treeMaterial(scene, 0), treeMaterial(scene, 1), treeMaterial(scene, 2)];
  const flowers = flowerMaterial(scene);
  let index = 0;
  for (let x = WORLD_BOUNDS.minX + 7; x < WORLD_BOUNDS.maxX - 4; x += 11) {
    for (let z = WORLD_BOUNDS.minZ + 7; z < WORLD_BOUNDS.maxZ - 4; z += 11) {
      const random = smallHash(x, z);
      if (random % 5 > 1) continue;
      if (STREET_LANES.some((lane) => Math.abs(x - lane) < 5) ||
          CROSS_STREETS.some((cross) => Math.abs(z - cross) < 4.5)) continue;
      if (LOTS.some((lot) =>
        lot.locationId !== "park" &&
        Math.abs(lot.x - x) < lot.width / 2 + 4 &&
        Math.abs(lot.z - z) < lot.depth / 2 + 4)) continue;

      const tree = MeshBuilder.CreatePlane(`pixel-tree-${index++}`, {
        width: 3.8, height: 5.2,
      }, scene);
      tree.position.set(x, 2.6, z);
      tree.billboardMode = Mesh.BILLBOARDMODE_Y;
      tree.material = trees[random % 3]!;
      tree.isPickable = false;
      foliage.push(tree);

      if (random % 3 === 0) {
        const flower = MeshBuilder.CreatePlane(`pixel-flowers-${index}`, {
          width: 1.4, height: 1.4,
        }, scene);
        flower.position.set(x + 2.15, 0.7, z + 1.1);
        flower.billboardMode = Mesh.BILLBOARDMODE_Y;
        flower.material = flowers;
        flower.isPickable = false;
      }
    }
  }
  return foliage;
}

function populateLamps(scene: Scene): void {
  const material = lampMaterial(scene);
  for (const x of STREET_LANES) for (const z of CROSS_STREETS) {
    const lamp = MeshBuilder.CreatePlane(`pixel-streetlamp-${x}-${z}`, {
      width: 2.1, height: 4.3,
    }, scene);
    lamp.position.set(x + 2.9, 2.16, z + 2.8);
    lamp.billboardMode = Mesh.BILLBOARDMODE_Y;
    lamp.material = material;
    lamp.isPickable = false;
  }
}

function makeLabel(scene: Scene, text: string, position: Vector3, width: number): void {
  const dt = new DynamicTexture(`label-tex-${text}`, { width: 512, height: 128 }, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = "bold 40px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#f4edde";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#182735";
  ctx.shadowBlur = 7;
  ctx.fillText(text, 256, 64, 484);
  dt.update();
  const mat = new StandardMaterial(`label-mat-${text}`, scene);
  mat.diffuseTexture = dt;
  mat.opacityTexture = dt;
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(`label-${text}`, {
    width, height: 1.35,
  }, scene);
  plane.position.copyFrom(position);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.material = mat;
  plane.isPickable = false;
}
