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
import { lotOf } from "../world/layout.js";
import { advanceWalk, routeFromPosition, standingPoint, type WalkPoint } from "../world/pedestrianPaths.js";
import type { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import {
  makeResidentAtlas, PIXEL_FRAMES, PIXEL_POSE_ROW, PIXEL_ROWS,
  residentHash, type PixelPose,
} from "./pixelResident.js";
import { residentAtlasUrl } from "./residentAssets.js";
import { activityPresentation } from "./activityStates.js";
import type { WorldObjectKind } from "@echosim/simulation";

interface AgentVisual {
  root: Mesh;
  label: Mesh;
  texture: Texture;
  locationId?: string;
  waypoints: WalkPoint[];
  facing: Exclude<PixelPose, "seated">;
  elapsed: number;
  poseRow: number;
  poseFrame: number;
  badge: Mesh;
  badgeTexture: DynamicTexture;
  activity?: {
    kind: WorldObjectKind;
    timeLeft: number;
    target?: WalkPoint;
    headedToObject: boolean;
    arrived: boolean;
  };
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

function createActivityBadge(scene: Scene, id: string): {
  plane: Mesh; texture: DynamicTexture;
} {
  const texture = new DynamicTexture("resident-action-" + id,
    { width: 256, height: 64 }, scene, false);
  const material = new StandardMaterial("resident-action-mat-" + id, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane("resident-action-bubble-" + id,
    { width: 2.5, height: 0.60 }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.material = material;
  plane.isVisible = false;
  plane.isPickable = false;
  return { plane, texture };
}

function showActivityBadge(texture: DynamicTexture, title: string): void {
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = "#172d36";
  ctx.fillRect(5, 5, 246, 54);
  ctx.fillStyle = "#70c8ad";
  ctx.fillRect(5, 5, 246, 4);
  ctx.fillStyle = "#f4edde";
  ctx.font = "bold 25px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 128, 35, 220);
  texture.update();
}

export class AgentLayer {
  private readonly visuals = new Map<string, AgentVisual>();
  private resolveActivityAnchor: (objectId: string) => WalkPoint | undefined = () => undefined;
  private readonly unsubscribeObjectUsed: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly adapter: LifeModeAdapter,
    private readonly viewerId: () => string = () => adapter.playerId,
    private readonly showWorld: () => boolean = () => false,
  ) {
    this.unsubscribeObjectUsed = adapter.town.events.subscribe<{
      agent: string; kind: WorldObjectKind; objectId: string;
    }>("sim:world-object-used", (event) => this.showObjectUse(
      event.agent, event.objectId, event.kind));
  }

  /** Read-only visual geometry lookup: does not change an NPC's navigation. */
  setActivityAnchorResolver(resolve: (objectId: string) => WalkPoint | undefined): void {
    this.resolveActivityAnchor = resolve;
  }

  private showObjectUse(agentId: string, objectId: string, kind: WorldObjectKind): void {
    const visual = this.visuals.get(agentId);
    if (!visual) return;
    // A new activity supersedes an earlier object approach. Without this,
    // the previous object's waypoint stays ahead of the new object's target.
    if (visual.activity?.headedToObject && !visual.activity.arrived) {
      visual.waypoints = [];
    }
    const presentation = activityPresentation(kind);
    visual.activity = {
      kind, timeLeft: presentation.seconds,
      target: this.resolveActivityAnchor(objectId),
      headedToObject: false, arrived: false,
    };
    showActivityBadge(visual.badgeTexture, presentation.label);
  }

  /** World state is read only on adapter emissions, never polled from render FPS. */
  update(): void {
    const summaries = (this.showWorld()
      ? this.adapter.worldPresenceFor()
      : this.adapter.residentPresenceFor(this.viewerId()))
      .flatMap((presence) => presence.current ? [presence.current] : []);
    const seen = new Set(summaries.map((summary) => summary.id));
    for (const summary of summaries) {
      let visual = this.visuals.get(summary.id);
      if (!visual) {
        visual = this.create(summary.id, summary.name, summary.locationId);
        this.visuals.set(summary.id, visual);
      }
      // Semantic movement is authoritative; the view follows sidewalk
      // waypoints without modifying cognition, arrival times or occupancy.
      if (summary.locationId && visual.locationId !== summary.locationId) {
        visual.waypoints = routeFromPosition(
          { x: visual.root.position.x, z: visual.root.position.z },
          summary.locationId, summary.id,
        ).slice(1);
        visual.locationId = summary.locationId;
        // Any destination change interrupts the old cosmetic activity, even
        // while walking toward an object. Otherwise its stale anchor can be
        // enqueued when the new location's sidewalk route completes.
        visual.activity = undefined;
        visual.badge.isVisible = false;
        // A new journey invalidates an old presentation-only sitting pose.
        this.adapter.seatedAt.delete(summary.id);
      }
    }
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue;
      this.release(visual);
      this.visuals.delete(id);
    }
  }

  private create(id: string, name: string, locationId?: string): AgentVisual {
    const start = locationId ? standingPoint(locationId, id) : undefined;
    const fallback = lotOf("park")!;
    const root = MeshBuilder.CreatePlane("resident-sprite-" + id, {
      width: 1.7, height: 2.55,
    }, this.scene);
    root.position.set(start?.x ?? fallback.x, 1.275, start?.z ?? fallback.z);
    root.billboardMode = Mesh.BILLBOARDMODE_Y;
    root.isPickable = true;
    root.metadata = { kind: "agent", agentId: id };

    // Use real checked-in sprite atlas; retain deterministic drawing as a
    // fallback for missing assets/offline builds. One atlas has all 20 frames.
    let visual: AgentVisual | undefined;
    const texture = new Texture(
      residentAtlasUrl(id), this.scene, true, false, Texture.NEAREST_SAMPLINGMODE,
      undefined,
      (_message, error) => {
        console.warn("EchoSim resident sprite failed; using fallback art.", id, error);
        const fallback = makeResidentAtlas(this.scene, id);
        mat.diffuseTexture = fallback;
        if (visual) {
          visual.texture = fallback;
          // Force UV refresh to the exact pose after the fallback swap.
          visual.poseRow = -1;
          visual.poseFrame = -1;
        }
        texture.dispose();
      },
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.uScale = 1 / PIXEL_FRAMES;
    texture.vScale = 1 / PIXEL_ROWS;
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
    const bubble = createActivityBadge(this.scene, id);
    bubble.plane.parent = root;
    bubble.plane.position.y = 2.42;

    visual = {
      root, label, texture, badge: bubble.plane, badgeTexture: bubble.texture,
      locationId,
      waypoints: [],
      facing: "front",
      elapsed: (residentHash(id) % 60) / 60,
      poseRow: -1, poseFrame: -1,
    };
    return visual;
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
      const activity = visual.activity;
      // Only walk to an object after reaching its semantic destination.
      // Built props appear in sidewalk-facing courtyards, so this final
      // short step stays outside opaque Babylon building shells.
      if (activity && !activity.headedToObject && visual.waypoints.length === 0) {
        activity.headedToObject = true;
        if (activity.target) visual.waypoints.push(activity.target);
      }
      const oldX = visual.root.position.x, oldZ = visual.root.position.z;
      // Walk on authored footpaths at a consistent visual speed. Large
      // frame hitches cannot launch the character through several buildings.
      const result = advanceWalk(
        { x: oldX, z: oldZ }, visual.waypoints, 25 * dt,
      );
      visual.waypoints = result.remaining;
      visual.root.position.x = result.point.x;
      visual.root.position.z = result.point.z;
      const dx = result.point.x - oldX, dz = result.point.z - oldZ;
      const moving = Math.hypot(dx, dz) > 0.001;
      if (moving) {
        visual.facing = Math.abs(dx) > Math.abs(dz)
          ? (dx < 0 ? "left" : "right")
          : (dz < 0 ? "back" : "front");
      }
      const frame = moving
        ? Math.floor(visual.elapsed * 8) % PIXEL_FRAMES
        : Math.floor(visual.elapsed * 2) % 2;
      if (activity && activity.headedToObject && !moving &&
          visual.waypoints.length === 0) {
        activity.arrived = true;
        activity.timeLeft -= dt;
        visual.badge.isVisible = activity.timeLeft > 0;
        if (activity.timeLeft > 0) {
          const spec = activityPresentation(activity.kind);
          visual.root.position.y = spec.pose === "seated" ? 0.94 : 1.275;
          // While using an object, four-frame front/seated gestures loop.
          this.setPose(visual, spec.pose, Math.floor(visual.elapsed * 4) % PIXEL_FRAMES);
          continue;
        }
        visual.activity = undefined;
      } else {
        visual.badge.isVisible = false;
      }
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
    visual.badge.material?.dispose(false, false);
    visual.badgeTexture.dispose();
    visual.badge.dispose();
    visual.root.dispose();
  }

  dispose(): void {
    this.unsubscribeObjectUsed();
    for (const visual of this.visuals.values()) this.release(visual);
    this.visuals.clear();
  }
}
