/** Babylon application of the camera rig + mode switching (Sprint 37). */
import type { ArcRotateCamera, Scene } from "@babylonjs/core";
import { Vector3 } from "@babylonjs/core";
import {
  computeRig, MODE_LIMITS,
  type CameraMode, type RigPose,
} from "./cameraRig.js";

export class CameraController {
  mode: CameraMode = "life";
  private readonly pose: RigPose = { targetX: 0, targetZ: 0, targetY: 0, radius: 95, beta: 0.95 };

  constructor(
    private readonly camera: ArcRotateCamera,
    scene: Scene,
    private readonly playerPose: () => { x: number; z: number } | undefined,
  ) {
    scene.onKeyboardObservable.add((kb) => {
      if (kb.type !== 1 /* KEYDOWN */) return;
      switch (kb.key) {
        case "f".charCodeAt(0):
        case "F".charCodeAt(0):
          this.focusPlayer();
          break;
        case "c".charCodeAt(0):
        case "C".charCodeAt(0):
          this.cycleMode();
          break;
      }
    });
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    const limits = MODE_LIMITS[mode];
    this.camera.lowerRadiusLimit = limits.minRadius;
    this.camera.upperRadiusLimit = limits.maxRadius;
  }

  cycleMode(): void {
    const order: CameraMode[] = ["life", "follow", "shoulder"];
    const next = order[(order.indexOf(this.mode) + 1) % order.length]!;
    this.setMode(next);
  }

  focusPlayer(): void {
    if (this.mode === "life") this.setMode("follow");
  }

  /** Per-frame update; life mode leaves the user in full control. */
  update(): CameraMode {
    if (this.mode !== "life") {
      const player = this.playerPose();
      this.pose.targetX = this.camera.target.x;
      this.pose.targetZ = this.camera.target.z;
      this.pose.targetY = this.camera.target.y;
      this.pose.radius = this.camera.radius;
      this.pose.beta = this.camera.beta;

      const next = computeRig(this.mode, player, this.pose);
      this.camera.setTarget(new Vector3(next.targetX, next.targetY, next.targetZ));
      this.camera.radius = next.radius;
      this.camera.beta = next.beta;
      return this.mode;
    }
    return this.mode;
  }
}
