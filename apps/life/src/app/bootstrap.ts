/** App bootstrap: engine, scene, lighting, layers, render loop (S36+S37). */
import {
  Color3, DirectionalLight, Engine, HemisphericLight, PointerEventTypes,
  Scene, Vector3,
} from "@babylonjs/core";
import { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import { buildTownMeshes } from "../world/townMeshes.js";
import { AgentLayer } from "../characters/AgentLayer.js";
import { createLifeCamera } from "../camera/lifeCamera.js";
import { CameraController } from "../camera/CameraController.js";

export interface LifeApp {
  adapter: LifeModeAdapter;
  agents: AgentLayer;
  camera: CameraController;
  start(): void;
  dispose(): void;
}

export function createLifeApp(canvas: HTMLCanvasElement,
  handlers: { onAgentSelected?(agentId: string): void } = {}): LifeApp {
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

  const cam = new CameraController(camera, scene, () => {
    const p = agents.positionOf(adapter.playerId);
    return p ? { x: p.x, z: p.z } : undefined;
  });

  // Picking: lots issue player travel commands; agents select.
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERPICK) return;
    const mesh = pi.pickInfo?.pickedMesh;
    const meta = mesh?.metadata as
      | { kind?: string; locationId?: string; agentId?: string }
      | undefined;
    if (!meta?.kind) return;
    if (meta.kind === "lot" && meta.locationId)
      adapter.commandMoveTo(meta.locationId);
    else if (meta.kind === "agent" && meta.agentId)
      handlers.onAgentSelected?.(meta.agentId);
  });

  engine.runRenderLoop(() => {
    cam.update();
    agents.renderFrame();
    scene.render();
  });
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    adapter,
    agents,
    camera: cam,
    start(): void { adapter.play(); },
    dispose(): void {
      window.removeEventListener("resize", onResize);
      adapter.dispose();
      agents.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
