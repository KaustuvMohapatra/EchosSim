/** Town: composition root wiring every system together, engine-free. */
import {
  NeedSet, NeedKind, CognitionSystem, GoapPlanner,
  standardNeedLibrary, AgentMind,
} from "@echosim/cognition";
import {
  EventBus, SimulationClock, SimulationScheduler,
  AgentId, LocationId, SimRandomProvider, RandomStreams,
} from "@echosim/core";
import type { SimDuration } from "@echosim/core";
import {
  LocationRepository, ReservationService, TimedNavigationService,
  WeatherSystem, computeJobPressure,
} from "@echosim/world";
import {
  PerceptionSystem, MemorySystem, MemoryRetriever, EmotionSystem, RelationshipSystem,
  BeliefSystem, SocialSystem, ConversationSystem,
  ObservationReach,
} from "@echosim/social";
import type { SocialActorSnapshot } from "@echosim/social";
import { PersonalityTrait } from "@echosim/cognition";
import { wireAutonomousSocial } from "./socialWire.js";

declare module "@echosim/cognition" {
  interface AgentMind {
    job?: { id: string; title: string; workplace: string;
            shiftStartMinuteOfDay: number; shiftEndMinuteOfDay: number; incomePerHour: number };
    isRestDayToday(timeMinutes: number): boolean;
  }
}

export class ResidentRegistry {
  private readonly minds = new Map<string, AgentMind>();
  private readonly order: string[] = [];
  add(mind: AgentMind): void { this.minds.set(mind.agent, mind); this.order.push(mind.agent); }
  allMinds(): AgentMind[] { return this.order.map((id) => this.minds.get(id)!); }
  mind(agent: string): AgentMind {
    const m = this.minds.get(agent);
    if (!m) throw new Error(`Unknown resident '${agent}'.`);
    return m;
  }
  tryMind(agent: string): AgentMind | undefined { return this.minds.get(agent); }
  orderedIds(): string[] { return [...this.order]; }
}

interface AgentLocationState {
  hasLocation: boolean;
  currentLocationId?: string;
}

export class Town {
  readonly clock = new SimulationClock();
  readonly events = new EventBus();
  readonly scheduler: SimulationScheduler;
  readonly locations = new LocationRepository();
  readonly reservations: ReservationService;
  readonly navigation: TimedNavigationService;
  readonly perception: PerceptionSystem;
  readonly memory = new MemorySystem();
  readonly retriever = new MemoryRetriever();
  readonly emotion: EmotionSystem;
  readonly relationships: RelationshipSystem;
  readonly weather: WeatherSystem;
  readonly cognition: CognitionSystem;
  readonly planner = new GoapPlanner();
  readonly residents = new ResidentRegistry();
  readonly beliefs = new BeliefSystem();
  readonly conversations = new ConversationSystem();
  readonly social: SocialSystem;
  readonly agentsById = new Map<string, AgentLocationState>();
  economy?: { tryPurchase(agent: string, itemId: string): string; payWage(agent: string, hours: number): number };

  private memoryIdCounter = 100_000;
  private randomProvider?: SimRandomProvider;

  constructor(readonly seed: bigint | number) {
    const nowMinutes = () => this.clock.currentTime.totalMinutes;

    this.scheduler = new SimulationScheduler(this.clock);

    this.reservations = new ReservationService(nowMinutes);

    this.navigation = new TimedNavigationService(
      {
        currentLocationOf: (a) => this.agentsById.get(a)?.currentLocationId,
        locationExists: (id) => this.locations.tryGet(id as never as LocationId) !== undefined,
        moveAgent: (a, to) => this.moveAgent(a as AgentId, to as LocationId),
      },
      nowMinutes,
      (delayMinutes, cb) => {
        this.scheduler.scheduleIn({ totalMinutes: delayMinutes }, cb);
      },
    );

    this.perception = new PerceptionSystem(
      {
        residentIds: () => this.residents.orderedIds(),
        locationOf: (a) => this.agentsById.get(a)?.currentLocationId,
      },
      nowMinutes,
      (o) => {
        const mind = this.residents.tryMind(o.observer);
        if (!mind) return;
        ++this.memoryIdCounter;
        const encoded = this.memory.encoder.encode(o, mind.personality, ++this.memoryIdCounter);
        if (encoded)
          this.memory.storeFor(o.observer).add(nowMinutes(), () => encoded!);
        this.events.publish("sim:observation-recorded", o);
      },
    );

    this.emotion = new EmotionSystem(
      (a) => this.residents.tryMind(a)?.emotionValence ?? 0,
      (a, v) => { const m = this.residents.tryMind(a); if (m) m.setEmotion(v); },
      () => this.residents.orderedIds(),
    );

    this.relationships = new RelationshipSystem(
      (a) => this.residents.tryMind(a)?.personality,
      (_everySimHours, cb) => {
        this.scheduler.scheduleRepeating({ totalMinutes: 120 }, () => cb(2));
      },
    );

    this.weather = new WeatherSystem(
      (e) => this.events.publish("sim:weather-changed", e),
      // Always routed through the current provider: seeded by default,
      // replaceable via attachRandoms for host-supplied streams.
      { nextDouble: () => this.randoms().getStream(RandomStreams.World).nextDouble() },
    );

    this.social = new SocialSystem(
      {
        actorSnapshot: (agent): SocialActorSnapshot | undefined => {
          const mind = this.residents.tryMind(agent);
          if (!mind) return undefined;
          const state = this.agentsById.get(agent);
          return {
            location: state?.hasLocation ? state.currentLocationId : undefined,
            sociability: mind.personality.get(PersonalityTrait.Sociability),
            emotionValence: mind.emotionValence,
            hasInterruptingNeed: mind.needs.findInterrupting() !== null,
          };
        },
        reserveConversationLock: (agent, by, untilMinutes) =>
          this.reservations.reserve("conv:" + agent, by, untilMinutes),
        releaseConversationLock: (agent, by) => {
          void this.reservations.release("conv:" + agent, by);
        },
        emitSocialEvent: (type, initiator, target, atLocation) =>
          this.perception.publish(
            type, [initiator, target], atLocation, ObservationReach.Nearby),
      },
      nowMinutes,
      { chance: (p) => this.socialChance(p) },
    );

    this.cognition = new CognitionSystem(
      { allMinds: () => this.residents.allMinds(), mind: (a) => this.residents.mind(a) },
      nowMinutes,
    );
    this.cognition.setWeatherProvider(() => this.weather.current);
    this.cognition.setSchedulePressureProvider((agent, t) => {
      const mind = this.residents.tryMind(agent);
      if (!mind?.job) return 0;
      return computeJobPressure(
        mind.job, mind.routineOffsetMinutes, mind.isRestDayToday(t), t,
      );
    });

    // Opening-hours sweep.
    this.scheduler.scheduleRepeating({ totalMinutes: 10 }, () => {
      for (const id of this.locations.orderedIds)
        void this.locations.get(id).refreshFromHours(nowMinutes());
    });

    // Daily weather roll at each simulated midnight.
    this.scheduler.scheduleRepeating({ totalMinutes: 1440 }, () => {
      this.weather.rollForNewDay();
    });

    wireAutonomousSocial(this);
  }

  /** Lazily created seeded provider; deterministic per seed. */
  randoms(): SimRandomProvider {
    if (!this.randomProvider) this.randomProvider = new SimRandomProvider(this.seed);
    return this.randomProvider;
  }

  /** Replace the RNG provider with a host-supplied one (before advancing). */
  attachRandoms(provider: SimRandomProvider): void {
    this.randomProvider = provider;
  }

  /** Named stream access used by social systems. */
  socialRng() {
    return this.randoms().getStream(RandomStreams.Social);
  }
  socialChance(p: number): boolean {
    return this.socialRng().chance(p);
  }

  registerLocation(def: { id: string; displayName: string; capacity?: number; hours?: { openMinuteOfDay: number; closeMinuteOfDay: number } }): void {
    this.locations.add({
      id: def.id as unknown as LocationId,
      displayName: def.displayName,
      capacity: def.capacity ?? Number.MAX_SAFE_INTEGER,
      hours: def.hours,
    });
  }

  spawnResident(spec: {
    id: string; displayName: string;
    homeLocationId?: string; startLocationId?: string;
    personality: import("@echosim/cognition").PersonalityProfile;
    initialNeeds?: Partial<Record<number, number>>;
  }): AgentMind {
    const initialValues: Partial<Record<NeedKind, number>> = {};
    for (const key of Object.keys(spec.initialNeeds ?? {}))
      initialValues[Number(key) as NeedKind] = spec.initialNeeds![Number(key) as NeedKind]!;
    const needSet = new NeedSet(standardNeedLibrary(), initialValues);
    const mind = new AgentMind(
      spec.id, spec.displayName,
      spec.homeLocationId || undefined,
      spec.personality, needSet,
    );
    mind.isRestDayToday = (_t) => false;
    this.residents.add(mind);

    const state: AgentLocationState = { hasLocation: false };
    this.agentsById.set(mind.agent, state);
    const start = spec.startLocationId ?? spec.homeLocationId;
    if (start) {
      const target = this.locations.get(start as unknown as LocationId);
      target.onAgentEntered();
      state.hasLocation = true;
      state.currentLocationId = start;
    }
    return mind;
  }

  moveAgent(agent: AgentId, locationId: LocationId): void {
    const a = this.agentsById.get(agent as unknown as string)!;
    const target = this.locations.get(locationId);
    if (!target.isOpen) throw new Error(`Cannot move '${agent}': location closed.`);
    if (a.hasLocation && a.currentLocationId === locationId) return;
    const from = a.hasLocation ? a.currentLocationId : undefined;
    if (from) this.locations.get(from as unknown as LocationId).onAgentLeft();
    target.onAgentEntered();
    a.currentLocationId = locationId;
    a.hasLocation = true;
    this.events.publish("sim:agent-moved", {
      agent, from, to: locationId, atMinutes: this.clock.currentTime.totalMinutes,
    });
  }

  runFor(deltaMinutes: number, stepMinutes = 10): void {
    let remaining = deltaMinutes;
    while (remaining > 0) {
      const step = Math.min(remaining, stepMinutes);
      this.clock.advance({ totalMinutes: step });
      remaining -= step;
    }
  }

  advanceNeeds(delta: SimDuration): void {
    this.cognition.advanceNeeds(delta);
  }
}
