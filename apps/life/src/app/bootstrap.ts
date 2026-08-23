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
import { lotOf } from "../world/layout.js";

export interface LifeHandlers {
  onAgentSelected?(agentId: string): void;
  onObjectMenu?(objectId: string, screenX: number, screenY: number): void;
  onDismissMenu?(): void;
}

export interface LifeApp {
  adapter: LifeModeAdapter;
  agents: AgentLayer;
  camera: CameraController;
  interactions: InteractionController;
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
  placeFurniture(buildFurniture(scene), (id) => {
    const lot = lotOf(id);
    return lot ? { x: lot.x, z: lot.z } : undefined;
  });

  const camCtl = new CameraController(camera, scene, () => {
    const p = agents.positionOf(adapter.playerId);
    return p ? { x: p.x, z: p.z } : undefined;
  });

  // Picking: lots → travel; agents → select; objects → context menu.
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERPICK) return;
    const meta = pi.pickInfo?.pickedMesh?.metadata as
      | { kind?: string; locationId?: string; agentId?: string; objectId?: string }
      | undefined;
    if (!meta?.kind) { handlers.onDismissMenu?.(); return; }
    if (meta.kind === "lot" && meta.locationId) {
      handlers.onDismissMenu?.();
      adapter.commandMoveTo(meta.locationId);
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
    start(): void { adapter.play(); },
    dispose(): void {
      window.removeEventListener("resize", onResize);
      interactions.dispose();
      adapter.dispose();
      agents.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
