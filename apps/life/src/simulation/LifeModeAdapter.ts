/**
 * LIFE-MODE ADAPTER (Sprint 36)
 *
 * The ONLY bridge between EchoSim core and the 3D presentation. Engine-free:
 * imports @echosim/* exclusively, so Babylon never reaches past this file and
 * the adapter itself stays testable in Node.
 *
 * Reads flow through SimulationInspector snapshots; mutations go through
 * explicit command methods that enter simulation systems directly.
 */
import { createAuthoredTown } from "@echosim/content";
import { SimulationInspector } from "@echosim/inspector";
import type {
  AgentSummary, SimEventEntry, TimeInfo, TownStats,
} from "@echosim/inspector";
import { PlanningDirector, Town } from "@echosim/simulation";
import type { LodController } from "@echosim/simulation";

export interface LifeSnapshot {
  time: TimeInfo;
  stats: TownStats;
  agents: AgentSummary[];
  events: SimEventEntry[];
}

export type AutonomyMode = "full-manual" | "assisted" | "autonomous";

export interface AdapterOptions {
  seed?: bigint | number;
  /** Real ms per simulation beat. */
  beatMs?: number;
  /** Sim minutes advanced per beat at 1× speed. */
  stepMinutes?: number;
}

const SPEEDS = [0, 1, 2, 4, 8] as const;

export class LifeModeAdapter {
  readonly town: Town;
  readonly director: PlanningDirector;
  readonly inspector: SimulationInspector;
  lod: LodController;

  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private readonly beatMs: number;
  private readonly stepMinutes: number;
  private _speedIndex = 1; // 1×

  constructor(options: AdapterOptions = {}) {
    const demo = createAuthoredTown(options.seed ?? 7001n);
    this.town = demo.town;
    this.director = demo.director;
    this.inspector = new SimulationInspector(this.town, this.director);
    this.beatMs = options.beatMs ?? 400;
    this.stepMinutes = options.stepMinutes ?? 10;
    this.lod = this.director.lod!;
  }

  // ---------------- lifecycle ----------------

  get running(): boolean { return this.timer !== null; }
  get speed(): number { return SPEEDS[this._speedIndex]!; }

  play(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.beat(), this.beatMs);
    this.emit();
  }
  pause(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.emit();
  }
  togglePause(): void { this.running ? this.pause() : this.play(); }

  setSpeed(mult: 0 | 1 | 2 | 4 | 8): void {
    const idx = SPEEDS.indexOf(mult as never);
    if (idx >= 0) this._speedIndex = idx;
    this.emit();
  }

  dispose(): void {
    this.pause();
    this.listeners.clear();
  }

  /** One deterministic simulation beat. */
  private beat(): void {
    const mult = this.speed;
    if (mult === 0) return;
    const total = this.stepMinutes * mult;
    for (let i = 0; i < total; i += this.stepMinutes) {
      this.town.cognition.advanceNeeds({ totalMinutes: this.stepMinutes });
      this.town.clock.advance({ totalMinutes: this.stepMinutes });
      this.director.tickAll();
    }
    this.emit();
  }

  /** Manual single-step for paused inspection. */
  stepOnce(): void {
    this.town.cognition.advanceNeeds({ totalMinutes: this.stepMinutes });
    this.town.clock.advance({ totalMinutes: this.stepMinutes });
    this.director.tickAll();
    this.emit();
  }

  // ---------------- read models ----------------

  snapshot(eventLimit = 80): LifeSnapshot {
    return {
      time: this.inspector.getTime(),
      stats: this.inspector.getTownStats(),
      agents: this.inspector.getAgents(),
      events: this.inspector.getEvents({ limit: eventLimit }),
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}
