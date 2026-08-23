/** Life camera (Sprint 36 base): orbit/pan/zoom ArcRotate with limits. */
import { ArcRotateCamera, Scene, Vector3 } from "@babylonjs/core";
import { WORLD_BOUNDS } from "../world/layout.js";

export function createLifeCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  const camera = new ArcRotateCamera(
    "life-camera",
    -Math.PI / 2.4,      // alpha
    0.95,                // beta (~55° tilt)
    95,                  // radius
    new Vector3(0, 0, 0),
    scene,
  );
  camera.lowerRadiusLimit = 12;
  camera.upperRadiusLimit = 160;
  camera.lowerBetaLimit = 0.15;
  camera.upperBetaLimit = 1.35;
  camera.wheelDeltaPercentage = 0.02;
  camera.panningSensibility = 900;
  camera.panningAxis = new Vector3(1, 0, 1); // no vertical panning
  camera.inertia = 0.86;
  camera.attachControl(canvas, true);

  // Soft world bounds on the target.
  const clampTarget = (): void => {
    const t = camera.target;
    t.x = Math.max(WORLD_BOUNDS.minX - 20, Math.min(WORLD_BOUNDS.maxX + 20, t.x));
    t.z = Math.max(WORLD_BOUNDS.minZ - 20, Math.min(WORLD_BOUNDS.maxZ + 20, t.z));
    t.y = 0;
  };
  camera.onViewMatrixChangedObservable.add(clampTarget);
  clampTarget();

  return camera;
}
