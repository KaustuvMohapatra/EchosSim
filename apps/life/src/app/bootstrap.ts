/** App bootstrap: engine, scene, lighting, layers, render loop (Sprint 36). */
import {
  Color3, DirectionalLight, Engine, HemisphericLight, Scene, Vector3,
} from "@babylonjs/core";
import { LifeModeAdapter } from "../simulation/LifeModeAdapter.js";
import { buildTownMeshes } from "../world/townMeshes.js";
import { AgentLayer } from "../characters/AgentLayer.js";
import { createLifeCamera } from "../camera/lifeCamera.js";

export interface LifeApp {
  adapter: LifeModeAdapter;
  agents: AgentLayer;
  start(): void;
  dispose(): void;
}

export function createLifeApp(canvas: HTMLCanvasElement): LifeApp {
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

  // Render loop: presentation interpolation every frame.
  engine.runRenderLoop(() => {
    agents.renderFrame();
    scene.render();
  });
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    adapter,
    agents,
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
