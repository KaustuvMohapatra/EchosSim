/** App bootstrap: engine, scene, lighting, layers, render loop. */
import {
  Color3, DirectionalLight, Engine, HemisphericLight, MeshBuilder,
  PointerEventTypes, Scene, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import { buildTownMeshes } from "../world/townMeshes.js";
import { buildFurniture, placeFurniture } from "../world/furniture.js";
import { AgentLayer } from "../characters/AgentLayer.js";
import { createLifeCamera } from "../camera/lifeCamera.js";
import { CameraController } from "../camera/CameraController.js";
import { InteractionController } from "../interaction/InteractionController.js";
import { PLACED_OBJECTS } from "../interaction/catalog.js";
import { PlayerAgentController } from "../simulation/PlayerAgentController.js";
import { BuildController, type BuildKind } from "../build/BuildController.js";
import { lotOf, LOTS as LOTS_ALL } from "../world/layout.js";

export interface LifeHandlers {
  onAgentSelected?(agentId: string): void;
  onObjectMenu?(objectId: string, screenX: number, screenY: number): void;
  onBuiltMenu?(objectId: string, screenX: number, screenY: number): void;
  onDismissMenu?(): void;
  onBuildFeedback?(text: string): void;
}

export interface LifeApp {
  adapter: LifeModeAdapter;
  agents: AgentLayer;
  camera: CameraController;
  interactions: InteractionController;
  player: PlayerAgentController;
  build: BuildController;
  buildMode: boolean;
  setBuildMode(on: boolean): void;
  buildSelection: BuildKind | null;
  setBuildSelection(kind: BuildKind | null): void;
  start(): void;
  dispose(): void;
}

export function createLifeApp(canvas: HTMLCanvasElement,
  handlers: LifeHandlers = {}): LifeApp {
  const engine = new Engine(canvas, true, { stencil: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color3(0.055, 0.07, 0.11).toColor4(1);
  scene.ambientColor = new Color3(0.2, 0.22, 0.26);

  const hemi = new HemisphericLight("hemi", new Vector3(0.4, 1, 0.25), scene);
  hemi.intensity = 0.75;
  hemi.groundColor = new Color3(0.18, 0.18, 0.24);

  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.35), scene);
  sun.intensity = 1.05;
  sun.diffuse = new Color3(1, 0.96, 0.88);

  const adapter = new LifeModeAdapter({ seed: 7001n });
  const camera = createLifeCamera(scene, canvas);
  scene.activeCamera = camera;

  buildTownMeshes(scene, adapter.town);
  const player = new PlayerAgentController(adapter);
  const agents = new AgentLayer(scene, adapter, () => player.controlled);
  agents.update();
  // Knowledge-scoped semantic presence changes on simulation boundaries, not render frames.
  const unsubscribeAgentSync = adapter.subscribe(() => agents.update());

  const interactions = new InteractionController(adapter, () => player.controlled);
  const townDisplayName = (locationId: string): string =>
    adapter.town.locations.tryGet(locationId as never)?.definition.displayName ?? locationId;
  function appPlayer(): PlayerAgentController { return player; }
  function nearestLot(x: number, z: number): string | undefined {
    let best: { id: string; d: number } | undefined;
    for (const lot of LOTS_ALL) {
      const d = Math.hypot(x - lot.x, z - lot.z);
      const halfW = lot.width / 2 + 4;
      const halfD = lot.depth / 2 + 4;
      if (Math.abs(x - lot.x) <= halfW && Math.abs(z - lot.z) <= halfD &&
          (!best || d < best.d)) best = { id: lot.locationId, d };
    }
    return best?.id;
  }

  // ---- Build mode ----
  let buildMode = false;
  let resumeAfterBuild = false;
  let buildSelection: BuildKind | null = null;
  const buildMeshes = new Map<string, import("@babylonjs/core").Mesh>();

  const lotBoundsOf = (id: string) => {
    const lot = lotOf(id);
    return lot ? {
      x1: lot.x - lot.width / 2, z1: lot.z - lot.depth / 2,
      x2: lot.x + lot.width / 2, z2: lot.z + lot.depth / 2,
    } : undefined;
  };
  const authoredFixtures = PLACED_OBJECTS.map((object) => ({
    objectId: object.objectId,
    kind: object.kind,
    lotId: object.lotId,
    dx: object.dx,
    dz: object.dz,
    rot: ((((Math.round(object.rotationY / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3),
  }));
  const build = new BuildController(lotBoundsOf, authoredFixtures);
  try {
    const saved = window.localStorage.getItem("echosim-life-build");
    if (saved) build.load(saved);
  } catch { /* private mode / malformed legacy saves */ }

  // Venue edits (Sprint 46): persisted overrides re-applied at boot.
  let venueEdits: Record<string, { displayName?: string; capacity?: number;
    hours?: { openMinuteOfDay: number; closeMinuteOfDay: number } }> = {};
  try {
    const rawV = window.localStorage.getItem("echosim-life-venues");
    if (rawV) venueEdits = JSON.parse(rawV) as typeof venueEdits;
    for (const [locationId, edit] of Object.entries(venueEdits))
      adapter.town.locations.updateDefinition(locationId as never, edit as never);
  } catch { /* ignore */ }

  const persistBuild = (): void => {
    try { window.localStorage.setItem("echosim-life-build", build.serialize()); }
    catch { /* ignore */ }
  };

  function rebuildBuildMeshes(): void {
    for (const mesh of buildMeshes.values()) mesh.dispose();
    buildMeshes.clear();
    for (const placement of build.list()) {
      const lot = lotOf(placement.lotId);
      if (!lot) continue;
      const mesh = MeshBuilder.CreateBox(`built-${placement.objectId}`, {
        width: placement.kind === "table" ? 1.1 : placement.rot % 2 ? 0.8 : 1.1,
        height: 0.7,
        depth: placement.kind === "table" ? 1.1 : placement.rot % 2 ? 1.1 : 0.8,
      }, scene);
      mesh.position.set(lot.x + placement.dx, 0.35, lot.z + placement.dz);
      mesh.rotation.y = placement.rot * Math.PI / 2;
      const material = new StandardMaterial(`bmat-${placement.objectId}`, scene);
      material.diffuseColor = new Color3(0.55, 0.45, 0.3);
      material.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = material;
      mesh.isPickable = true;
      mesh.metadata = { kind: "built", objectId: placement.objectId };
      buildMeshes.set(placement.objectId, mesh);
    }
  }
  build.setOnChange(() => {
    rebuildBuildMeshes();
    persistBuild();
    adapter.touch();
  });
  rebuildBuildMeshes();

  placeFurniture(buildFurniture(scene), (id) => {
    const lot = lotOf(id);
    return lot ? { x: lot.x, z: lot.z } : undefined;
  });

  const camCtl = new CameraController(camera, scene, () => {
    const pose = agents.positionOf(player.controlled);
    return pose ? { x: pose.x, z: pose.z } : undefined;
  });

  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
    const meta = pointerInfo.pickInfo?.pickedMesh?.metadata as
      | { kind?: string; locationId?: string; agentId?: string; objectId?: string }
      | undefined;
    if (!meta?.kind) { handlers.onDismissMenu?.(); return; }

    if (meta.kind === "built" && meta.objectId) {
      const event = pointerInfo.event as unknown as MouseEvent;
      handlers.onBuiltMenu?.(meta.objectId, event.clientX, event.clientY);
      return;
    }

    if (buildMode && pointerInfo.pickInfo?.pickedPoint) {
      const point = pointerInfo.pickInfo.pickedPoint;
      const lotId = meta.kind === "lot" && meta.locationId
        ? meta.locationId : nearestLot(point.x, point.z);
      if (buildSelection && lotId) {
        const result = build.place(buildSelection, lotId, point.x, point.z);
        handlers.onBuildFeedback?.(result.ok ? "Placed." : result.reason ?? "Could not place that here.");
      }
      return;
    }

    if (meta.kind === "lot" && meta.locationId) {
      handlers.onDismissMenu?.();
      appPlayer().enqueueMove(meta.locationId, townDisplayName(meta.locationId));
    } else if (meta.kind === "agent" && meta.agentId) {
      handlers.onDismissMenu?.();
      handlers.onAgentSelected?.(meta.agentId);
    } else if (meta.kind === "object" && meta.objectId) {
      const event = pointerInfo.event as unknown as MouseEvent;
      handlers.onObjectMenu?.(meta.objectId, event.clientX, event.clientY);
    }
  });

  engine.runRenderLoop(() => {
    camCtl.update();
    agents.renderFrame();
    scene.render();
  });
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    adapter,
    agents,
    camera: camCtl,
    interactions,
    player,
    build,
    get buildMode(): boolean { return buildMode; },
    setBuildMode(on: boolean): void {
      if (on === buildMode) return;
      if (on) {
        resumeAfterBuild = adapter.running;
        buildMode = true;
        adapter.pause();
      } else {
        buildMode = false;
        if (resumeAfterBuild) adapter.play();
        resumeAfterBuild = false;
      }
      handlers.onBuildFeedback?.(on ? "Build Mode — simulation paused." : "");
      adapter.touch();
    },
    get buildSelection(): BuildKind | null { return buildSelection; },
    setBuildSelection(kind: BuildKind | null): void {
      buildSelection = kind;
      adapter.touch();
    },
    start(): void { adapter.play(); },
    dispose(): void {
      window.removeEventListener("resize", onResize);
      unsubscribeAgentSync();
      player.dispose();
      interactions.dispose();
      for (const mesh of buildMeshes.values()) mesh.dispose();
      adapter.dispose();
      agents.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
