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

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
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
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 5;
  ctx.fillText(text, 128, 34);
  dt.update();
  const mat = new StandardMaterial(`al-mat-${text}`, scene);
  mat.diffuseTexture = dt;
  mat.opacityTexture = dt;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane(`al-${text}`, { width: 2.4, height: 0.6 }, scene);
  plane.billboardMode = 7;
  plane.material = mat;
  plane.isPickable = false;
  return plane;
}

export class AgentLayer {
  private readonly visuals = new Map<string, AgentVisual>();

  constructor(
    private readonly scene: Scene,
    private readonly adapter: LifeModeAdapter,
    private readonly viewerId: () => string = () => adapter.playerId,
  ) {}

  /** Sync knowledge-scoped semantic snapshots only when the adapter emits. */
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

    for (const [id, visual] of [...this.visuals]) {
      if (seen.has(id)) continue;
      visual.root.dispose();
      visual.label.dispose();
      this.visuals.delete(id);
    }
  }

  private create(agentId: string, name: string, locationId?: string): AgentVisual {
    const startLot = (locationId && lotOf(locationId)) || lotOf("park")!;
    const offset = agentOffset(agentId);
    const root = MeshBuilder.CreateCapsule(`agent-${agentId}`, {
      radius: 0.38, height: 1.75, tessellation: 10,
    }, this.scene);
    root.position.set(startLot.x + offset.dx, 0.875, startLot.z + offset.dz);
    const mat = new StandardMaterial(`amat-${agentId}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(`#${colorOf(agentId).toString(16).padStart(6, "0")}`);
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    root.material = mat;
    root.isPickable = true;
    root.metadata = { kind: "agent", agentId };

    const label = makeLabel(this.scene, name);
    label.parent = root;
    label.position.y = 2.35;
    return { root, label, targetX: root.position.x, targetZ: root.position.z };
  }

  renderFrame(): void {
    for (const [id, visual] of this.visuals) {
      const seated = this.adapter.seatedAt.get(id);
      if (seated) {
        visual.root.position.set(seated.x, 0.55, seated.z);
        visual.root.rotation.y = seated.rotY;
        continue;
      }
      visual.root.position.x += (visual.targetX - visual.root.position.x) * 0.06;
      visual.root.position.z += (visual.targetZ - visual.root.position.z) * 0.06;
    }
  }

  positionOf(agentId: string): Vector3 | undefined {
    return this.visuals.get(agentId)?.root.position;
  }

  dispose(): void {
    for (const visual of this.visuals.values()) {
      visual.root.dispose();
      visual.label.dispose();
    }
    this.visuals.clear();
  }
}
