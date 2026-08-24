/** App bootstrap: engine, scene, lighting, layers, render loop (S36–S38). */
import {
  Color3, DirectionalLight, Engine, HemisphericLight, PointerEventTypes,
  Scene, Vector3,
} from "@babylonjs/core";
import { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import { buildTownMeshes } from "../world/townMeshes.js";
import { buildFurniture, placeFurniture } from "../world/furniture.js";
import { AgentLayer } from "../characters/AgentLayer.js";
import { createLifeCamera } from "../camera/lifeCamera.js";
import { CameraController } from "../camera/CameraController.js";
import { InteractionController } from "../interaction/InteractionController.js";
import { PlayerAgentController } from "../simulation/PlayerAgentController.js";
import {
  BuildController, type BuildKind,
} from "../build/BuildController.js";
import { MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
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
  const agents = new AgentLayer(scene, adapter);
  agents.update();

  const interactions = new InteractionController(adapter);
  const player = new PlayerAgentController(adapter);
  const townDisplayName = (locationId: string): string =>
    adapter.town.locations.tryGet(locationId as never)?.definition.displayName ?? locationId;
  // Lot picks arrive before `player` exists in closure order; resolve lazily.
  function appPlayer(): PlayerAgentController { return player; }
  function nearestLot(x: number, z: number): string | undefined {
    let best: { id: string; d: number } | undefined;
    for (const lot of LOTS_ALL) {
      const cx = lot.x, cz = lot.z;
      const d = Math.hypot(x - cx, z - cz);
      const halfW = lot.width / 2 + 4, halfD = lot.depth / 2 + 4;
      if (Math.abs(x - cx) <= halfW && Math.abs(z - cz) <= halfD &&
          (!best || d < best.d)) best = { id: lot.locationId, d };
    }
    return best?.id;
  }

  // ---- Build mode (Sprints 43–44) ----
  let buildMode = false;
  let buildSelection: BuildKind | null = null;
  const buildMeshes = new Map<string, import("@babylonjs/core").Mesh>();

  const lotBoundsOf = (id: string) => {
    const lot = lotOf(id);
    return lot ? {
      x1: lot.x - lot.width / 2, z1: lot.z - lot.depth / 2,
      x2: lot.x + lot.width / 2, z2: lot.z + lot.depth / 2,
    } : undefined;
  };
  const build = new BuildController(lotBoundsOf, [], () => rebuildBuildMeshes());
  try {
    const saved = window.localStorage.getItem("echosim-life-build");
    if (saved) build.load(saved);
  } catch { /* private mode etc. */ }
  // Venue edits (Sprint 46): persisted overrides re-applied at boot.
  let venueEdits: Record<string, { displayName?: string; capacity?: number;
    hours?: { openMinuteOfDay: number; closeMinuteOfDay: number } }> = {};
  try {
    const rawV = window.localStorage.getItem("echosim-life-venues");
    if (rawV) venueEdits = JSON.parse(rawV) as typeof venueEdits;
    for (const [locationId, edit] of Object.entries(venueEdits)) {
      adapter.town.locations.updateDefinition(locationId as never, edit as never);
    }
  } catch { /* ignore */ }
  const persist = (): void => {
    try { window.localStorage.setItem("echosim-life-build", build.serialize()); }
    catch { /* ignore */ }
  };
  build.setOnChange(persist);

  function rebuildBuildMeshes(): void {
    for (const m of buildMeshes.values()) m.dispose();
    buildMeshes.clear();
    for (const p of build.list()) {
      const lot = lotOf(p.lotId);
      if (!lot) continue;
      const mesh = MeshBuilder.CreateBox(`built-${p.objectId}`, {
        width: p.kind === "table" ? 1.1 : p.rot % 2 ? 0.8 : 1.1,
        height: 0.7,
        depth: p.kind === "table" ? 1.1 : p.rot % 2 ? 1.1 : 0.8,
      }, scene);
      mesh.position.set(lot.x + p.dx, 0.35, lot.z + p.dz);
      mesh.rotation.y = p.rot * Math.PI / 2;
      const mat = new StandardMaterial(`bmat-${p.objectId}`, scene);
      mat.diffuseColor = new Color3(0.55, 0.45, 0.3);
      mat.specularColor = new Color3(0.05, 0.05, 0.05);
      mesh.material = mat;
      mesh.isPickable = true;
      mesh.metadata = { kind: "built", objectId: p.objectId };
      buildMeshes.set(p.objectId, mesh);
    }
    persist();
  }

  // Built-object picking: delete via context menu affordance list.
  const builtMenuItems: Array<{ id: string; label: string }> = [
    { id: "rotate", label: "Rotate" },
    { id: "delete", label: "Delete" },
  ];
  void builtMenuItems;
  placeFurniture(buildFurniture(scene), (id) => {
    const lot = lotOf(id);
    return lot ? { x: lot.x, z: lot.z } : undefined;
  });

  const camCtl = new CameraController(camera, scene, () => {
    const p = agents.positionOf(player.controlled);
    return p ? { x: p.x, z: p.z } : undefined;
  });

  // Picking: lots → travel; agents → select; objects → context menu.
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERPICK) return;
    const meta = pi.pickInfo?.pickedMesh?.metadata as
      | { kind?: string; locationId?: string; agentId?: string; objectId?: string }
      | undefined;
    if (!meta?.kind) { handlers.onDismissMenu?.(); return; }
    if (meta.kind === "built" && meta.objectId) {
      const ev = pi.event as unknown as MouseEvent;
      handlers.onBuiltMenu?.(meta.objectId, ev.clientX, ev.clientY);
      return;
    }
    if (buildMode && pi.pickInfo?.pickedPoint) {
      // Build placement on the picked lot surface.
      const point = pi.pickInfo.pickedPoint;
      const lotId = meta.kind === "lot" && meta.locationId
        ? meta.locationId : nearestLot(point.x, point.z);
      if (buildSelection && lotId) {
        const v = build.place(buildSelection, lotId, point.x, point.z);
        handlers.onBuildFeedback?.(v.ok ? "Placed." : v.reason ?? "");
      }
      return;
    }
    if (meta.kind === "lot" && meta.locationId) {
      handlers.onDismissMenu?.();
      const name = townDisplayName(meta.locationId);
      appPlayer().enqueueMove(meta.locationId, name);
    } else if (meta.kind === "agent" && meta.agentId) {
      handlers.onDismissMenu?.();
      handlers.onAgentSelected?.(meta.agentId);
    } else if (meta.kind === "object" && meta.objectId) {
      const ev = pi.event as unknown as MouseEvent;
      handlers.onObjectMenu?.(meta.objectId, ev.clientX, ev.clientY);
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
      buildMode = on;
      // Spec §49: simulation pauses during structural edits.
      if (on) adapter.pause(); else adapter.play();
      handlers.onBuildFeedback?.(on ? "Build mode — sim paused." : "");
    },
    get buildSelection(): BuildKind | null { return buildSelection; },
    setBuildSelection(kind: BuildKind | null): void { buildSelection = kind; },
    start(): void { adapter.play(); },
    dispose(): void {
      window.removeEventListener("resize", onResize);
      player.dispose();
      interactions.dispose();
      for (const m of buildMeshes.values()) m.dispose();
      adapter.dispose();
      agents.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
