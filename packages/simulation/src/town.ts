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
import { TownStories } from "./stories.js";
import { InvitationBoard, MessageLog } from "./phone.js";
import {
  PerceptionSystem, MemorySystem, MemoryRetriever, EmotionSystem, RelationshipSystem,
  BeliefSystem, SocialSystem, ConversationSystem,
  ObservationReach, ReflectionSystem, HabitSystem, GroupSystem,
  SkillSystem,
} from "@echosim/social";
import { evaluatePromotion } from "@echosim/world";
import type { SocialActorSnapshot } from "@echosim/social";
import { PersonalityTrait } from "@echosim/cognition";
import { wireAutonomousSocial } from "./socialWire.js";
import { deriveIntentions, socialBiasOf } from "./intentions.js";

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
  readonly reflections = new ReflectionSystem(
    () => this.clock.currentTime.totalMinutes);
  readonly habits = new HabitSystem();
  readonly groups = new GroupSystem();
  readonly skills = new SkillSystem();
  /** Simulation-owned personal-life state; presentation adapters only expose it. */
  readonly messages = new MessageLog();
  readonly invitations = new InvitationBoard(this);
  readonly stories = new TownStories(this);

  /**
   * Research feature switches (Sprint 30). Defaults reproduce normal
   * behaviour exactly; ablation runners flip these BEFORE advancing time.
   */
  readonly features = {
    /** Episodic memory encoding. */
    memory: true,
    /** Reflection/semantic-memory crystallisation. */
    reflection: true,
    /** Gossip belief transfer during conversations. */
    gossip: true,
    /** Habit recording + habit utility pull. */
    habits: true,
  };
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
        const encoded = this.features.memory
          ? this.memory.encoder.encode(o, mind.personality, ++this.memoryIdCounter)
          : null;
        if (encoded) {
          this.memory.storeFor(o.observer).add(nowMinutes(), () => encoded!);
          // Reflection: significance accumulates; patterns crystallise when
          // the threshold crosses (Sprint 23).
          if (this.features.reflection) {
            this.reflections.accumulate(o.observer, encoded!.importance);
            const produced =
              this.reflections.maybeReflect(o.observer, this.memory.storeFor(o.observer));
            for (const sem of produced)
              this.events.publish("sim:reflected", { agent: o.observer, semantic: sem });
          }
        }
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
    this.cognition.setLocationKeyProvider((agent) => {
      const state = this.agentsById.get(agent);
      return state?.hasLocation ? state.currentLocationId : undefined;
    });
    this.cognition.setHabitProvider(
      (agent, locationKey) =>
        this.features.habits ? this.habits.strengthAt(agent, locationKey) : 0);
    this.cognition.setCrowdingProvider((agent) => {
      const s = this.agentsById.get(agent);
      if (!s?.hasLocation || !s.currentLocationId) return 0;
      const rt = this.locations.get(s.currentLocationId as never);
      const cap = rt.definition.capacity;
      if (!cap || cap === Number.MAX_SAFE_INTEGER) return 0;
      return Math.max(0, rt.occupiedCount / cap);
    });
    this.cognition.setIntentionProvider((agent) =>
      socialBiasOf(deriveIntentions(this, agent)));
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

    // Invitation commitments become stale once their scheduled start arrives.
    this.scheduler.scheduleRepeating({ totalMinutes: 10 }, () => {
      this.invitations.expireDue(nowMinutes());
    });

    // Daily weather roll at each simulated midnight.
    this.scheduler.scheduleRepeating({ totalMinutes: 1440 }, () => {
      this.weather.rollForNewDay();
    });

    // Hourly habit decay (slow by design).
    this.scheduler.scheduleRepeating({ totalMinutes: 60 }, () => {
      this.habits.tickDecay(60);
    });

    // Skill XP from real behaviour (Sprint 48): cooking/work via plan steps,
    // social XP via accepted conversations.
    this.events.subscribe<{ agent: string; action: string }>(
      "sim:plan-step-completed", (e) => {
        if (e.action === "act_cook_meal")
          this.skills.award(e.agent, "Cooking", 8);
        else if (e.action === "act_work") {
          this.skills.award(e.agent, "Professional", 6);
          const mind = this.residents.tryMind(e.agent);
          if (mind?.job) {
            const days = (mind.plannerMemory.get("career_days") ?? 0) + 1;
            mind.plannerMemory.set("career_days", days);
            // Promotion check on shift completion (Sprint 48).
            const lvl = this.skills.stateOf(e.agent, "Professional").level;
            const promo = evaluatePromotion(mind.job, lvl, days);
            if (promo.promoted && promo.toTitle && promo.newIncome !== undefined) {
              const from = mind.job.title;
              mind.job.title = promo.toTitle;
              mind.job.incomePerHour = promo.newIncome;
              mind.plannerMemory.set("career_days", 0);
              this.events.publish("sim:promoted", {
                agent: e.agent, fromTitle: from, toTitle: promo.toTitle,
                income: promo.newIncome,
              });
            }
          }
        } else if (e.action === "act_read")
          this.skills.award(e.agent, "Knowledge", 6);
        else if (e.action === "act_sketch" || e.action === "act_write")
          this.skills.award(e.agent, "Creativity", 7);
        else if (e.action === "act_exercise" || e.action === "act_jog")
          this.skills.award(e.agent, "Fitness", 7);
      });
    this.events.subscribe<{ initiator: string; listener: string; intent: string }>(
      "sim:conversation", (c) => {
        this.skills.award(c.initiator, "Social", 5);
        this.skills.award(c.listener, "Social", 3);
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

  /** Persistence hook: keep the encoder id counter clear of imported ids. */
  ensureMemoryIdBeyond(value: number): void {
    if (this.memoryIdCounter < value) this.memoryIdCounter = value;
  }

  /**
   * Group gathering (spec 25.4): at the chosen time, members PRESENT at the
   * meeting location jointly experience the event through normal perception.
   * Absent members learn nothing — no telepathy.
   */
  scheduleGroupMeeting(groupId: string, inMinutes = 60, locationId?: string): { scheduledAtMinutes: number } {
    const def = this.groups.definitionOf(groupId);
    if (!def) throw new Error(`Unknown group '${groupId}'.`);
    const loc = locationId ?? def.meetingLocationId;
    if (!loc) throw new Error(`Group '${groupId}' has no meeting location.`);
    const atMinutes = this.clock.currentTime.totalMinutes + Math.max(0, inMinutes);
    this.scheduler.scheduleAt({ totalMinutes: atMinutes }, () => {
      const present = this.groups.membersOf(groupId).filter((id) => {
        const s = this.agentsById.get(id);
        return s?.hasLocation && s.currentLocationId === loc;
      });
      if (present.length === 0) return;
      this.perception.publish(
        "group_event", present, loc,
        ObservationReach.Nearby /* audible to adjacent locations too */,
      );
      this.events.publish("sim:group-meeting", { groupId, where: loc, present, atMinutes });
    });
    return { scheduledAtMinutes: atMinutes };
  }

  registerLocation(def: { id: string; displayName: string; capacity?: number; hours?: { openMinuteOfDay: number; closeMinuteOfDay: number } }): void {
    const state = this.locations.add({
      id: def.id as unknown as LocationId,
      displayName: def.displayName,
      capacity: def.capacity ?? Number.MAX_SAFE_INTEGER,
      hours: def.hours,
    });
    // Apply authored hours immediately so world truth is correct at t=0
    // (regression S37: locations defaulted open until the first sweep).
    if (def.hours)
      void state.refreshFromHours(this.clock.currentTime.totalMinutes);
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
    // Omitted startLocationId means "begin at home"; an explicitly supplied
    // undefined means "intentionally unplaced" (needed for exact save restore).
    const hasExplicitStart = Object.prototype.hasOwnProperty.call(spec, "startLocationId");
    const start = hasExplicitStart ? spec.startLocationId : spec.homeLocationId;
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

    // Capacity must be validated BEFORE mutating the origin lot, otherwise a
    // rejected entry leaves occupancy permanently desynced (regression S38).
    if (target.isFull)
      throw new Error(`Cannot move '${agent}': location full.`);

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
