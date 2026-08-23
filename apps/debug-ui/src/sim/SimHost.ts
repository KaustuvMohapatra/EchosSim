/**
 * SimHost: owns the headless simulation loop for the debug UI and exposes
 * explicit debug-only control commands. Reads flow through SimulationInspector;
 * every manual command is recorded (nothing mutates the sim silently).
 */
import { createDemoTown } from "@echosim/content";
import { PlanningDirector, Town } from "@echosim/simulation";
import { SimulationInspector } from "@echosim/inspector";
import type {
  AgentInspectorSnapshot, AgentSummary, SimEventEntry, TimeInfo, TownStats,
} from "@echosim/inspector";

export interface ManualCommandRecord {
  atRealMs: number;
  atSimMinutes: number;
  command: string;
  detail?: string;
}

export interface UiSnapshot {
  time: TimeInfo;
  stats: TownStats;
  agents: AgentSummary[];
  events: SimEventEntry[];
  selected: AgentInspectorSnapshot | undefined;
  paused: boolean;
  speed: number;
}

export class SimHost {
  readonly town: Town;
  readonly director: PlanningDirector;
  readonly inspector: SimulationInspector;

  paused = true;
  speed: 1 | 2 | 4 | 8 | 16 = 1;
  seed: bigint;
  readonly manualCommands: ManualCommandRecord[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();

  constructor(seed: bigint | number) {
    this.seed = BigInt(seed);
    const demo = createDemoTown(this.seed);
    this.town = demo.town;
    this.director = demo.director;
    this.inspector = new SimulationInspector(this.town, this.director);
  }

  // ---------------- lifecycle ----------------

  start(): void {
    if (this.timer !== null) return;
    this.paused = false;
    this.timer = setInterval(() => this.beat(), 250);
    this.emit();
  }

  pause(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    this.paused = true;
    this.record("pause");
    this.emit();
  }

  toggle(): void {
    if (this.paused) {
      this.start();
      this.record("resume");
    } else {
      this.pause();
    }
    this.emit();
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  /** One fixed simulation beat: 10-minute steps scaled by speed. */
  private beat(): void {
    const minutes = 10 * this.speed;
    for (let i = 0; i < minutes; i += 10) {
      this.town.cognition.advanceNeeds({ totalMinutes: 10 });
      this.town.clock.advance({ totalMinutes: 10 });
      this.director.tickAll();
    }
    this.emit();
  }

  // ---------------- debug controls (all recorded) ----------------

  step(minutes = 10): void {
    for (let i = 0; i < minutes; i += 10) {
      this.town.cognition.advanceNeeds({ totalMinutes: 10 });
      this.town.clock.advance({ totalMinutes: 10 });
      this.director.tickAll();
    }
    this.record("step", `${minutes} min`);
    this.emit();
  }

  setSpeed(speed: 1 | 2 | 4 | 8 | 16): void {
    this.speed = speed;
    this.record("speed", `${speed}x`);
    this.emit();
  }

  jumpMinutes(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    for (let i = 0; i < minutes; i += 10) {
      this.town.cognition.advanceNeeds({ totalMinutes: Math.min(10, minutes - i) });
      this.town.clock.advance({ totalMinutes: Math.min(10, minutes - i) });
      this.director.tickAll();
    }
    this.record("jump", `${minutes} min`);
    this.emit();
  }

  forceWeather(state: 0 | 1 | 2 | 3): void {
    this.town.weather.set(state);
    this.record("force-weather", `state ${state}`);
    this.emit();
  }

  reseed(newSeed: bigint | number): void {
    this.dispose();
    this.seed = BigInt(newSeed);
    const demo = createDemoTown(this.seed);
    (this as { town: Town }).town = demo.town;
    (this as { director: PlanningDirector }).director = demo.director;
    (this as { inspector: SimulationInspector }).inspector =
      new SimulationInspector(demo.town, demo.director);
    this.paused = true;
    this.timer = null;
    this.record("reseed", String(this.seed));
    this.emit();
  }

  private record(command: string, detail?: string): void {
    this.manualCommands.push({
      atRealMs: Date.now(),
      atSimMinutes: this.town.clock.currentTime.totalMinutes,
      command,
      ...(detail !== undefined ? { detail } : {}),
    });
  }

  // ---------------- read models ----------------

  snapshot(selectedId: string | undefined, eventLimit = 120): UiSnapshot {
    return {
      time: this.inspector.getTime(),
      stats: this.inspector.getTownStats(),
      agents: this.inspector.getAgents(),
      events: this.inspector.getEvents({ limit: eventLimit }),
      selected: selectedId !== undefined ? this.inspector.getAgent(selectedId) : undefined,
      paused: this.paused,
      speed: this.speed,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}
