/**
 * Camera rig math (Sprint 37) — engine-free so it is unit-testable.
 * The Babylon camera controller applies these values each frame with easing.
 */

export type CameraMode = "life" | "follow" | "shoulder";

export interface RigPose {
  targetX: number;
  targetZ: number;
  targetY: number;
  radius: number;
  beta: number;
}

export interface PlayerPose {
  x: number;
  z: number;
}

export const MODE_LIMITS: Record<CameraMode, { minRadius: number; maxRadius: number }> = {
  life: { minRadius: 12, maxRadius: 160 },
  follow: { minRadius: 10, maxRadius: 26 },
  shoulder: { minRadius: 3.2, maxRadius: 8 },
};

const EASE = 0.12;

/**
 * Computes the next eased pose for the requested mode. `life` mode is
 * pass-through (user-driven orbit); follow/shoulder track the player and ease
 * radius/beta toward mode defaults while preserving user alpha.
 */
export function computeRig(
  mode: CameraMode,
  player: PlayerPose | undefined,
  current: RigPose,
): RigPose {
  if (mode === "life" || !player) return current;
  // Tracking transiently invalid sprite poses must not corrupt the camera.
  // Keep its last usable target until the authoritative pose is finite again.
  if (!Number.isFinite(player.x) || !Number.isFinite(player.z)) return current;

  // Camera input can become invalid after a resize, restore, or external
  // controller update. Recover individual channels rather than spreading NaN.
  const safe: RigPose = {
    targetX: Number.isFinite(current.targetX) ? current.targetX : player.x,
    targetZ: Number.isFinite(current.targetZ) ? current.targetZ : player.z,
    targetY: Number.isFinite(current.targetY) ? current.targetY : 1.2,
    radius: Number.isFinite(current.radius) ? current.radius : 17,
    beta: Number.isFinite(current.beta) ? current.beta : 1.02,
  };

  const desired = mode === "follow"
    ? { targetX: player.x, targetZ: player.z, targetY: 1.2, radius: 17, beta: 1.02 }
    : { targetX: player.x, targetZ: player.z + 0.4, targetY: 1.5, radius: 5.2, beta: 1.22 };

  return {
    targetX: lerp(safe.targetX, desired.targetX),
    targetZ: lerp(safe.targetZ, desired.targetZ),
    targetY: lerp(safe.targetY, desired.targetY),
    radius: lerp(safe.radius, desired.radius),
    beta: clamp(lerp(safe.beta, desired.beta), 0.15, 1.35),
  };
}

/** True once a tracked pose has effectively converged (used by tests/UI). */
export function converged(a: RigPose, b: RigPose, epsilon = 0.05): boolean {
  return Math.abs(a.targetX - b.targetX) < epsilon &&
         Math.abs(a.targetZ - b.targetZ) < epsilon &&
         Math.abs(a.radius - b.radius) < epsilon &&
         Math.abs(a.beta - b.beta) < epsilon &&
         Math.abs(a.targetY - b.targetY) < epsilon;
}

function lerp(from: number, to: number): number {
  return from + (to - from) * EASE;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
