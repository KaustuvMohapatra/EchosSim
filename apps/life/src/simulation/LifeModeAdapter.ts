/**
 * LIFE-MODE ADAPTER (Sprint 36 + UI presentation phase)
 *
 * The only bridge between EchoSim core and the 3D/presentation layer. It stays
 * engine-free: simulation state is read through inspector/read models and all
 * mutations are explicit commands into simulation systems.
 */
import { createAuthoredTown } from "@echosim/content";
import { PersonalityProfile } from "@echosim/cognition";
import { SimulationInspector } from "@echosim/inspector";
import type {
  AgentSummary, SimEventEntry, TimeInfo, TownStats,
} from "@echosim/inspector";
import { PlanningDirector, Town, LodController } from "@echosim/simulation";

export interface LifeLocationSummary {
  id: string;
  name: string;
  isOpen: boolean;
}

export interface LifeTownStorySummary {
  id: number;
  day: number;
  text: string;
  participants: readonly string[];
}

export interface LifeSnapshot {
  time: TimeInfo;
  stats: TownStats;
  agents: AgentSummary[];
  events: SimEventEntry[];
  locations: LifeLocationSummary[];
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
    this.lod = new LodController();
    this.director.attachLod(this.lod);

    if (!this.town.residents.tryMind(this.playerId)) {
      this.town.spawnResident({
        id: this.playerId,
        displayName: "You",
        homeLocationId: "apt_b",
        personality: PersonalityProfile.balanced(),
      });
      if (this.town.groups.definitionOf("fam_birch"))
        this.town.groups.addMember("fam_birch", this.playerId);
    }
  }

  // ---------------- player commands ----------------

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
    if (spec.pronouns) (mind as unknown as { pronouns?: string }).pronouns = spec.pronouns;
    this.lastCommandFeedback = `${spec.name} moved into the neighbourhood.`;
    this.emit();
  }

  /**
   * Semantic travel command for any controllable resident. The old adapter
   * accepted agentId but ignored it, causing switched household members to
   * queue travel for the original player resident instead.
   */
  commandMoveTo(locationId: string, agentId = this.playerId): boolean {
    const rt = this.town.locations.tryGet(locationId as never);
    if (!rt) {
      this.lastCommandFeedback = `Unknown place: ${locationId}`;
      this.emit();
      return false;
    }
    if (!this.town.residents.tryMind(agentId)) {
      this.lastCommandFeedback = "That resident is no longer available.";
      this.emit();
      return false;
    }
    if (!rt.isOpen) {
      this.lastCommandFeedback = `${rt.definition.displayName} is closed.`;
      this.emit();
      return false;
    }
    const accepted = this.town.navigation.beginMove(
      agentId as never, locationId as never, () => {});
    this.lastCommandFeedback = accepted.accepted === false
      ? "Already travelling."
      : `Walking to ${rt.definition.displayName}…`;
    this.emit();
    return accepted.accepted ?? true;
  }

  /** Current semantic location of a resident. Defaults to the authored player. */
  playerLocationId(agentId = this.playerId): string | undefined {
    const state = this.town.agentsById.get(agentId);
    return state?.hasLocation ? state.currentLocationId : undefined;
  }

  /** Presentation-only seated transforms, keyed by resident. */
  readonly seatedAt = new Map<string, { x: number; z: number; rotY: number }>();

  /** Back-compat bridge for the existing player-only interaction controller. */
  get playerSeatedAt(): { x: number; z: number; rotY: number } | undefined {
    return this.seatedAt.get(this.playerId);
  }
  set playerSeatedAt(value: { x: number; z: number; rotY: number } | undefined) {
    if (value) this.seatedAt.set(this.playerId, value);
    else this.seatedAt.delete(this.playerId);
  }

  touch(): void { this.emit(); }

  interactionsStandUp(agentId?: string): void {
    if (agentId !== undefined) this.seatedAt.delete(agentId);
    else this.seatedAt.clear();
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
      locations: this.town.locations.orderedIds.map((id) => {
        const runtime = this.town.locations.get(id);
        return {
          id: String(id),
          name: runtime.definition.displayName,
          isOpen: runtime.isOpen,
        };
      }),
    };
  }

  /** Knowledge-filtered stories; presentation cannot accidentally use all(). */
  townStoriesFor(viewerId = this.playerId): LifeTownStorySummary[] {
    return this.town.stories.visibleTo(viewerId).map((story) => ({
      id: story.id,
      day: story.day,
      text: story.text,
      participants: [...story.participants],
    }));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
