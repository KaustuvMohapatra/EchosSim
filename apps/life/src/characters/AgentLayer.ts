/**
 * Babylon resident presentation: flat pixel-art billboards, not 3D capsules.
 *
 * The simulation still owns actual location, activity, memory and autonomy.
 * This layer interpolates only between observed semantic positions and renders
 * a deterministic animated sprite atlas per resident.
 */
import {
  Color3, DynamicTexture, Material, Mesh, MeshBuilder, Scene,
  StandardMaterial, Texture, Vector3,
} from "@babylonjs/core";
import { agentOffset, lotOf } from "../world/layout.js";
import type { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import {
  makeResidentAtlas, PIXEL_FRAMES, PIXEL_POSE_ROW, PIXEL_ROWS,
  residentHash, type PixelPose,
} from "./pixelResident.js";

interface AgentVisual {
  root: Mesh;
  label: Mesh;
  texture: DynamicTexture;
  targetX: number;
  targetZ: number;
  facing: Exclude<PixelPose, "seated">;
  elapsed: number;
  poseRow: number;
  poseFrame: number;
}

function makeLabel(scene: Scene, id: string, name: string): Mesh {
  const dt = new DynamicTexture("resident-label-" + id, {
    width: 256, height: 64,
  }, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "bold 30px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = id === "player" ? "#f6d48b" : "#eef1e9";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 5;
  ctx.fillText(name.length > 19 ? name.slice(0, 18) + "…" : name, 128, 35);
  dt.update();
  const mat = new StandardMaterial("resident-label-mat-" + id, scene);
  mat.diffuseTexture = dt;
  mat.opacityTexture = dt;
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  const label = MeshBuilder.CreatePlane("resident-label-plane-" + id, {
    width: 2.75, height: 0.68,
  }, scene);
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.material = mat;
  label.isPickable = false;
  return label;
}

export class AgentLayer {
  private readonly visuals = new Map<string, AgentVisual>();

  constructor(
    private readonly scene: Scene,
    private readonly adapter: LifeModeAdapter,
    private readonly viewerId: () => string = () => adapter.playerId,
  ) {}

  /** World state is read only on adapter emissions, never polled from render FPS. */
  update(): void {
    const summaries = this.adapter.residentPresenceFor(this.viewerId())
      .flatMap((presence) => presence.current ? [presence.current] : []);
    const seen = new Set(summaries.map((summary) => summary.id));
    for (const summary of summaries) {
      let visual = this.visuals.get(summary.id);
      if (!visual) {
        visual = this.create(summary.id, summary.name, summary.locationId);
        this.visuals.set(summary.id, visual);
      }
      const lot = summary.locationId ? lotOf(summary.locationId) : undefined;
      if (lot) {
        const offset = agentOffset(summary.id);
        visual.targetX = lot.x + offset.dx;
        visual.targetZ = lot.z + offset.dz + lot.depth / 4;
      }
    }
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue;
      this.release(visual);
      this.visuals.delete(id);
    }
  }

  private create(id: string, name: string, locationId?: string): AgentVisual {
    const start = (locationId && lotOf(locationId)) || lotOf("park")!;
    const offset = agentOffset(id);
    const root = MeshBuilder.CreatePlane("resident-sprite-" + id, {
      width: 1.7, height: 2.55,
    }, this.scene);
    root.position.set(start.x + offset.dx, 1.275, start.z + offset.dz + start.depth / 4);
    root.billboardMode = Mesh.BILLBOARDMODE_Y;
    root.isPickable = true;
    root.metadata = { kind: "agent", agentId: id };

    const texture = makeResidentAtlas(this.scene, id);
    const mat = new StandardMaterial("resident-pixels-" + id, this.scene);
    mat.diffuseTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.transparencyMode = Material.MATERIAL_ALPHATEST;
    mat.alphaCutOff = 0.45;
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    root.material = mat;

    const label = makeLabel(this.scene, id, name);
    label.parent = root;
    label.position.y = 1.66;

    return {
      root, label, texture,
      targetX: root.position.x, targetZ: root.position.z,
      facing: "front",
      elapsed: (residentHash(id) % 60) / 60,
      poseRow: -1, poseFrame: -1,
    };
  }

  /** Delta-based movement and animation are visual only; no simulation mutations. */
  renderFrame(deltaSeconds = 1 / 60): void {
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    for (const [id, visual] of this.visuals) {
      visual.elapsed += dt;
      const seated = this.adapter.seatedAt.get(id);
      if (seated) {
        visual.root.position.set(seated.x, 0.94, seated.z);
        this.setPose(visual, "seated", 0);
        continue;
      }
      visual.root.position.y = 1.275;
      const dx = visual.targetX - visual.root.position.x;
      const dz = visual.targetZ - visual.root.position.z;
      const moving = Math.hypot(dx, dz) > 0.06;
      if (moving) {
        visual.facing = Math.abs(dx) > Math.abs(dz)
          ? (dx < 0 ? "left" : "right")
          : (dz < 0 ? "back" : "front");
      }
      const smoothing = 1 - Math.exp(-8 * dt);
      visual.root.position.x += dx * smoothing;
      visual.root.position.z += dz * smoothing;
      const frame = moving
        ? Math.floor(visual.elapsed * 8) % PIXEL_FRAMES
        : Math.floor(visual.elapsed * 2) % 2;
      this.setPose(visual, visual.facing, frame);
    }
  }

  private setPose(visual: AgentVisual, pose: PixelPose, frame: number): void {
    const row = PIXEL_POSE_ROW[pose];
    if (visual.poseRow === row && visual.poseFrame === frame) return;
    visual.poseRow = row;
    visual.poseFrame = frame;
    visual.texture.uOffset = frame / PIXEL_FRAMES;
    visual.texture.vOffset = row / PIXEL_ROWS;
  }

  positionOf(agentId: string): Vector3 | undefined {
    return this.visuals.get(agentId)?.root.position;
  }

  private release(visual: AgentVisual): void {
    visual.root.material?.dispose(false, false);
    visual.texture.dispose();
    visual.label.material?.dispose(false, true);
    visual.label.dispose();
    visual.root.dispose();
  }

  dispose(): void {
    for (const visual of this.visuals.values()) this.release(visual);
    this.visuals.clear();
  }
}
