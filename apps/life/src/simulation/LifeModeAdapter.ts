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
import { PersonalityProfile } from "@echosim/cognition";
import { SimulationInspector } from "@echosim/inspector";
import type {
  AgentSummary, SimEventEntry, TimeInfo, TownStats,
} from "@echosim/inspector";
import { PlanningDirector, Town, LodController } from "@echosim/simulation";

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
  /** The player is a FULL EchoSim resident (Sprint 37). */
  readonly playerId = "player";
  /** Last command feedback for the UI (presentation info only). */
  lastCommandFeedback = "";

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
    // Player manual-priority + future LOD management route through here.
    this.lod = new LodController();
    this.director.attachLod(this.lod);

    // Player enters through the normal spawn pipeline — same downstream
    // systems as every NPC (needs, memory, relationships, planning).
    if (!this.town.residents.tryMind(this.playerId)) {
      this.town.spawnResident({
        id: this.playerId,
        displayName: "You",
        homeLocationId: "apt_b",
        personality: PersonalityProfile.balanced(),
      });
      // Join the household matching the home lot (Sprint 49 switching).
      if (this.town.groups.definitionOf("fam_birch"))
        this.town.groups.addMember("fam_birch", this.playerId);
    }
  }

  // ---------------- player commands ----------------

  /** Registers a brand-new resident through the normal spawn pipeline. */
  createResident(spec: {
    id: string; name: string; pronouns?: string;
    personality: import("@echosim/cognition").PersonalityProfile;
    lifeGoal?: string;
    homeLocationId?: string;
  }): void {
    this.town.spawnResident({
      id: spec.id,
      displayName: spec.name,
      homeLocationId: spec.homeLocationId ?? "apt_b",
      personality: spec.personality,
      initialNeeds: { [1 /* Hunger */]: 45 },
    });
    const mind = this.town.residents.mind(spec.id);
    if (spec.lifeGoal) {
      // Life goals bias social/exploratory utility via the preference channel.
      const base = mind.preferences;
      mind.setPreferences({
        get(key) {
          if (key === "goal_social" && spec.lifeGoal === "goal_friends") return 0.6;
          if (key === "goal_explore" && spec.lifeGoal === "goal_explore") return 0.6;
          if (key === "goal_work" && spec.lifeGoal === "goal_success") return 0.6;
          return base.get(key);
        },
      });
    }
    if (spec.pronouns) {
      (mind as unknown as { pronouns?: string }).pronouns = spec.pronouns;
    }
    this.lastCommandFeedback = `${spec.name} moved into the neighbourhood.`;
    this.emit();
  }

  /**
   * Player travel command: enters via the simulation's own navigation
   * service, exactly like any semantic move. Feedback string for the HUD.
   */
  commandMoveTo(locationId: string, agentId?: string): boolean {
    const rt = this.town.locations.tryGet(locationId as never);
    if (!rt) {
      this.lastCommandFeedback = `Unknown place: ${locationId}`;
      this.emit();
      return false;
    }
    if (!rt.isOpen) {
      this.lastCommandFeedback =
        `${rt.definition.displayName} is closed.`;
      this.emit();
      return false;
    }
    const accepted = this.town.navigation.beginMove(
      this.playerId as never, locationId as never, () => {});
    this.lastCommandFeedback = accepted
      ? `Walking to ${rt.definition.displayName}…`
      : "Already travelling.";
    this.emit();
    return accepted.accepted ?? true;
  }

  /** Current semantic location of the player (for camera + HUD). */
  playerLocationId(): string | undefined {
    const s = this.town.agentsById.get(this.playerId);
    return s?.hasLocation ? s.currentLocationId : undefined;
  }

  /**
   * Presentation hint: seated avatars park at these anchors (visual only —
   * simulation truth remains the semantic location). Keyed by agent so
   * household control switching works naturally (Sprint 49).
   */
  readonly seatedAt = new Map<string, { x: number; z: number; rotY: number }>();

  /** Manual notification hook for presentation-side controllers. */
  touch(): void { this.emit(); }

  /** Presentation hook used by the player controller to abandon seat poses. */
  interactionsStandUp(agentId?: string): void {
    if (agentId !== undefined) {
      this.seatedAt.delete(agentId);
    } else {
      this.seatedAt.clear();
    }
    this.lastCommandFeedback = "Action cancelled.";
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
