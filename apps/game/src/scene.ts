/** Phaser scene: town rendering, interpolation, bubbles, rain (S31–32). */
import Phaser from "phaser";
import { director, inspector, PLAYER_ID, town } from "./sim.js";

export const locPositions: Record<string, { x: number; y: number }> = {
  apt_a: { x: 140, y: 120 }, apt_b: { x: 140, y: 300 }, apt_c: { x: 140, y: 480 },
  cafe: { x: 420, y: 210 }, bakery: { x: 400, y: 380 },
  bookstore: { x: 640, y: 120 }, library: { x: 650, y: 260 },
  clinic: { x: 640, y: 430 }, studio: { x: 860, y: 140 },
  store: { x: 870, y: 300 }, restaurant: { x: 880, y: 460 },
  hall: { x: 420, y: 540 }, park: { x: 660, y: 580 },
};

export interface AgentVisual {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  bubble?: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}
export const visuals = new Map<string, AgentVisual>();
export const locationRects: Array<{ rect: Phaser.GameObjects.Rectangle; locId: string }> = [];
export let reducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function hashOffset(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function jitter(seed: string): number { return (hashOffset(seed) % 56) - 28; }
function hashColor(id: string): number {
  return [0x7dd3fc, 0x34d399, 0xf472b6, 0xa78bfa, 0xfb923c, 0x4ade80][hashOffset(id) % 6]!;
}

let rainEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
let rainTintRect: Phaser.GameObjects.Rectangle | null = null;

export class TownScene extends Phaser.Scene {
  constructor() { super({ key: "TownScene" }); }

  create(): void {
    this.cameras.main.setBackgroundColor("#101728");

    // Street grid.
    const g = this.add.graphics();
    g.lineStyle(1, 0x1c2742, 1);
    for (let x = 0; x <= this.scale.width; x += 48) g.lineBetween(x, 0, x, this.scale.height);
    for (let y = 0; y <= this.scale.height; y += 48) g.lineBetween(0, y, this.scale.width, y);

    // Location buildings.
    for (const locId of town.locations.orderedIds) {
      const pos = locPositions[locId];
      if (!pos) continue;
      const rt = town.locations.get(locId);
      const rect = this.add.rectangle(pos.x, pos.y, 150, 72,
        rt.isOpen ? 0x14264a : 0x33384a)
        .setStrokeStyle(2, 0x2e4a7a)
        .setInteractive({ useHandCursor: true });
      rect.on("pointerdown", () => {
        this.events.emit("player-move", locId);
      });
      this.add.text(pos.x, pos.y - 22, rt.definition.displayName,
        { fontSize: "12px", color: "#9fc3ef" }).setOrigin(0.5);
      const status = this.add.text(pos.x, pos.y + 25, "",
        { fontSize: "10px", color: "#64748b" }).setOrigin(0.5);
      rect.setData("status", status);
      locationRects.push({ rect, locId });
    }

    // Residents.
    for (const summary of inspector.getAgents()) {
      const pos = locPositions[summary.locationId ?? ""] ??
        locPositions[summary.id === PLAYER_ID ? "apt_b" : "park"]!;
      const color = summary.id === PLAYER_ID ? 0xfbbf24 : hashColor(summary.id);
      const circle = this.add.circle(
        pos.x + jitter(summary.id), pos.y + jitter(summary.id + "y"),
        summary.id === PLAYER_ID ? 11 : 9, color)
        .setStrokeStyle(2, 0x0b1220)
        .setInteractive({ useHandCursor: true });
      circle.on("pointerdown", () => this.events.emit("agent-selected", summary.id));
      const label = this.add.text(circle.x - 12, circle.y + 12, summary.name,
        { fontSize: "10px", color: "#cbd5e1" });
      visuals.set(summary.id, { circle, label, targetX: circle.x, targetY: circle.y });
    }

    // Rain particles + tint (Sprint 32.4).
    rainEmitter = this.add.particles(0, 0, undefined as never, {
      speed: { min: 220, max: 340 }, angle: 78, lifespan: 520,
      scale: { start: 0.55, end: 0 }, frequency: reducedMotion ? 40 : 11,
      tint: 0x7dd3fc, quantity: 2,
    }) as unknown as Phaser.GameObjects.Particles.ParticleEmitter;
    rainEmitter.stop();
    rainTintRect = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d3a5f, 0.16)
      .setOrigin(0);

    // Conversation speech indicators (Sprint 32.3).
    town.events.subscribe<{ initiator: string; utterances: readonly string[] }>(
      "sim:conversation", (c) => {
        const vis = visuals.get(c.initiator);
        const line = c.utterances[0];
        if (!vis || !line) return;
        vis.bubble?.destroy();
        const bubble = this.add.text(vis.circle.x + 14, vis.circle.y - 24,
          line.slice(0, 60),
          { fontSize: "11px", backgroundColor: "#000000aa", color: "#fde68a",
            padding: { x: 4, y: 2 } });
        vis.bubble = bubble;
        this.time.delayedCall(reducedMotion ? 3600 : 2300, () => {
          bubble.destroy();
          if (vis.bubble === bubble) vis.bubble = undefined;
        });
      });

    // Fixed-step simulation beat.
    this.time.addEvent({
      delay: 400, loop: true,
      callback: () => this.events.emit("sim-beat"),
    });
  }

  update(): void {
    for (const [id, vis] of visuals) {
      const state = town.agentsById.get(id);
      const pos = state?.hasLocation && state.currentLocationId
        ? locPositions[state.currentLocationId] : undefined;
      if (pos) {
        vis.targetX = pos.x + jitter(id);
        vis.targetY = pos.y + jitter(id + "y");
      }
      if (!reducedMotion) {
        vis.circle.x += (vis.targetX - vis.circle.x) * 0.06;
        vis.circle.y += (vis.targetY - vis.circle.y) * 0.06;
      } else {
        vis.circle.x = vis.targetX;
        vis.circle.y = vis.targetY;
      }
      vis.label.setPosition(vis.circle.x - 12, vis.circle.y + 12);
    }
  }

  /** Presentation-side weather reaction; never touches simulation semantics. */
  syncWeather(stateNow: number): void {
    if (!rainEmitter || !rainTintRect) return;
    if (stateNow >= 2) {
      rainEmitter.start();
      rainTintRect.setVisible(true);
    } else {
      rainEmitter.stop();
      rainTintRect.setVisible(false);
    }
  }
}

import type { AgentSummary } from "@echosim/inspector";
export type { AgentSummary };
