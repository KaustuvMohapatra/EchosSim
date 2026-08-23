/** Agent character visuals: capsules + labels with smooth interpolation. */
import {
  Color3, DynamicTexture, Mesh, MeshBuilder, Scene,
  StandardMaterial, Vector3,
} from "@babylonjs/core";
import { agentOffset, lotOf } from "../world/layout.js";
import type { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";

interface AgentVisual {
  root: Mesh;
  label: Mesh;
  targetX: number;
  targetZ: number;
}

const PALETTE = [0x7dd3fc, 0x34d399, 0xf472b6, 0xa78bfa, 0xfb923c, 0x4ade80, 0xfde68a];
export const PLAYER_COLOR = 0xfbbf24;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function colorOf(agentId: string): number {
  return agentId === "player" ? PLAYER_COLOR : PALETTE[hash(agentId) % PALETTE.length]!;
}

function makeLabel(scene: Scene, text: string): Mesh {
  const dt = new DynamicTexture(`al-tex-${text}`, { width: 256, height: 64 }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "bold 34px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#e6edf6";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 5;
  ctx.fillText(text, 128, 34);
  dt.update();
  const mat = new StandardMaterial(`al-mat-${text}`, scene);
  mat.diffuseTexture = dt; mat.opacityTexture = dt;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.disableLighting = true; mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(`al-${text}`, { width: 2.4, height: 0.6 }, scene);
  plane.billboardMode = 7;
  plane.material = mat;
  plane.isPickable = false;
  return plane;
}

export class AgentLayer {
  private readonly visuals = new Map<string, AgentVisual>();

  constructor(private readonly scene: Scene, private readonly adapter: LifeModeAdapter) {}

  /** Sync visual set to snapshot; interpolate toward semantic positions. */
  update(): void {
    const seen = new Set<string>();
    for (const summary of this.adapter.snapshot().agents) seen.add(summary.id);
    void seen;

    for (const summary of this.adapter.inspector.getAgents()) {
      let vis = this.visuals.get(summary.id);
      if (!vis) {
        vis = this.create(summary.id, summary.name);
        this.visuals.set(summary.id, vis);
      }
      const lot = summary.locationId ? lotOf(summary.locationId) : undefined;
      if (lot) {
        const off = agentOffset(summary.id);
        vis.targetX = lot.x + off.dx;
        vis.targetZ = lot.z + off.dz + lot.depth / 4;
      }
    }
    // Remove departed agents (should not happen in current content, but safe).
    for (const [id, vis] of [...this.visuals]) {
      if (!this.adapter.town.residents.tryMind(id)) {
        vis.root.dispose(); vis.label.dispose();
        this.visuals.delete(id);
      }
    }
  }

  private create(agentId: string, name: string): AgentVisual {
    const homeMind = this.adapter.town.residents.mind(agentId as never);
    const startLot = (homeMind.homeLocationId && lotOf(homeMind.homeLocationId)) || lotOf("park")!;
    const off = agentOffset(agentId);

    const root = MeshBuilder.CreateCapsule(`agent-${agentId}`, {
      radius: 0.38, height: 1.75, tessellation: 10,
    }, this.scene);
    root.position.set(startLot.x + off.dx, 0.875, startLot.z + off.dz);
    const mat = new StandardMaterial(`amat-${agentId}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(
      `#${colorOf(agentId).toString(16).padStart(6, "0")}`);
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    root.material = mat;
    root.isPickable = true;
    root.metadata = { kind: "agent", agentId };

    const label = makeLabel(this.scene, name);
    label.parent = root;
    label.position.y = 2.35;

    return { root, label, targetX: root.position.x, targetZ: root.position.z };
  }

  /** Frame update: lerp positions (presentation-only interpolation). */
  renderFrame(): void {
    for (const vis of this.visuals.values()) {
      vis.root.position.x += (vis.targetX - vis.root.position.x) * 0.06;
      vis.root.position.z += (vis.targetZ - vis.root.position.z) * 0.06;
    }
  }

  positionOf(agentId: string): Vector3 | undefined {
    return this.visuals.get(agentId)?.root.position;
  }

  dispose(): void {
    for (const vis of this.visuals.values()) {
      vis.root.dispose(); vis.label.dispose();
    }
    this.visuals.clear();
  }
}
