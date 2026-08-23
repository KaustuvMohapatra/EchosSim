/** World layer: locations+hours, reservations, timed navigation graph, jobs/schedules, weather, town events/storylets. */
import { AgentId, LocationId, ResourceId } from "@echosim/core";

// ---------------- Locations ----------------
export interface OpeningHours { openMinuteOfDay: number; closeMinuteOfDay: number }
export function openingHours(oh: number, om: number, ch: number, cm: number): OpeningHours {
  const o = oh * 60 + om, c = ch * 60 + cm;
  if (o < 0 || o > 1439 || c < 0 || c > 1439) throw new Error("Minutes must be within [0,1439].");
  return { openMinuteOfDay: o, closeMinuteOfDay: c };
}
export function isOpenAtHours(h: OpeningHours, m: number): boolean {
  return h.openMinuteOfDay <= h.closeMinuteOfDay
    ? m >= h.openMinuteOfDay && m <= h.closeMinuteOfDay
    : m >= h.openMinuteOfDay || m <= h.closeMinuteOfDay;
}
export interface LocationDefinition { id: LocationId; displayName: string; capacity: number; hours?: OpeningHours }

export class LocationRuntimeState {
  isOpen = true;
  occupiedCount = 0;
  private manualOverride = false;
  constructor(readonly definition: LocationDefinition) {}
  get capacity(): number { return this.definition.capacity; }
  get isFull(): boolean { return this.occupiedCount >= this.capacity; }
  setOpen(open: boolean): void { this.isOpen = open; this.manualOverride = true; }
  forceOpen(open: boolean): void { this.isOpen = open; }
  refreshFromHours(nowMinutes: number): boolean {
    if (this.manualOverride || !this.definition.hours) return false;
    const desired = isOpenAtHours(this.definition.hours, nowMinutes % 1440);
    if (desired === this.isOpen) return false;
    this.isOpen = desired;
    return true;
  }
  onAgentEntered(): void {
    if (this.occupiedCount >= this.definition.capacity)
      throw new Error(`Location '${this.definition.id}' is at capacity (${this.definition.capacity}).`);
    this.occupiedCount++;
  }
  onAgentLeft(): void {
    if (this.occupiedCount <= 0) throw new Error(`Location '${this.definition.id}' occupancy underflow.`);
    this.occupiedCount--;
  }
}

export class LocationRepository {
  private readonly states = new Map<string, LocationRuntimeState>();
  private readonly order: string[] = [];
  get orderedIds(): LocationId[] { return this.order.map((id) => id as LocationId); }
  get count(): number { return this.order.length; }
  add(d: LocationDefinition): LocationRuntimeState {
    if (this.states.has(d.id)) throw new Error(`Duplicate location id '${d.id}'.`);
    const rt = new LocationRuntimeState(d);
    this.states.set(d.id, rt);
    this.order.push(d.id);
    return rt;
  }
  remove(id: LocationId): void {
    const rt = this.states.get(id);
    if (!rt) throw new Error(`Unknown location '${id}'.`);
    if (rt.occupiedCount > 0) throw new Error(`Cannot remove '${id}': still occupied.`);
    this.states.delete(id);
    const i = this.order.indexOf(id); if (i >= 0) this.order.splice(i, 1);
  }
  tryGet(id: LocationId): LocationRuntimeState | undefined { return this.states.get(id); }
  get(id: LocationId): LocationRuntimeState {
    const s = this.states.get(id);
    if (!s) throw new Error(`Unknown location '${id}'.`);
    return s;
  }
}

// ---------------- Reservations ----------------
export class ReservationService {
  private readonly holds = new Map<string, { owner: string; untilMinutes: number }>();
  totalGranted = 0; totalDenied = 0; totalExpired = 0; totalReleased = 0;
  constructor(private readonly now: () => number) {}
  reserve(resource: string, owner: string, untilMinutes: number): boolean {
    const e = this.holds.get(resource);
    if (e) {
      if (e.owner === owner) { e.untilMinutes = Math.max(e.untilMinutes, untilMinutes); this.totalGranted++; return true; }
      if (e.untilMinutes > this.now()) { this.totalDenied++; return false; }
      this.totalExpired++;
    }
    this.holds.set(resource, { owner, untilMinutes });
    this.totalGranted++;
    return true;
  }
  release(resource: string, owner: string): boolean {
    const h = this.holds.get(resource);
    if (!h || h.owner !== owner) return false;
    this.holds.delete(resource); this.totalReleased++; return true;
  }
  isHeldBy(resource: string, owner: string): boolean {
    const h = this.holds.get(resource); return !!h && h.owner === owner;
  }
  expire(now: number): void {
    for (const [k, h] of [...this.holds]) if (h.untilMinutes <= now) { this.holds.delete(k); this.totalExpired++; }
  }
  static seatFor(locationId: string): string { return "seat:" + locationId; }
  static conversationLockFor(agentId: string): string { return "conv:" + agentId; }
}

// ---------------- Timed navigation over an authored graph ----------------
export enum NavigationPathStatus { Idle, EnRoute, Arrived, Failed }
export enum NavigationFailure { None, NoPath, DestinationBlocked, TargetDestroyed, Superseded, NoProgress }
export interface NavigationArrival { agent: string; destination: string; success: boolean; failure: NavigationFailure }
export interface NavigationHost {
  currentLocationOf(agent: string): string | undefined;
  locationExists(id: string): boolean;
  moveAgent(agent: string, to: string): void;
}
interface Trip { destination: string; onArrive: (a: NavigationArrival) => void; generation: number }

export class TimedNavigationService {
  private readonly states = new Map<string, { destination?: string; status: NavigationPathStatus; failure: NavigationFailure; remainingMinutes: number; expectedArrival?: number }>();
  private readonly trips = new Map<string, Trip>();
  private readonly travel = new Map<string, number>();
  private readonly generations = new Map<string, number>();
  defaultTravelMinutes = 15;
  stuckGraceMinutes = 10;

  constructor(
    private readonly host: NavigationHost,
    private readonly nowMinutes: () => number,
    /** Host re-arm helper: scheduleIn(delayMinutes, cb). */
    private readonly scheduleIn: (delayMinutes: number, cb: () => void) => void,
  ) {}

  setTravelTime(a: string, b: string, minutes: number): void {
    if (minutes < 0) throw new Error("travel minutes must be >= 0");
    if (a === b) return;
    this.travel.set(pair(a, b), minutes);
    this.travel.set(pair(b, a), minutes);
  }
  getTravelTime(from: string, to: string): number {
    return from === to ? 0 : this.travel.get(pair(from, to)) ?? this.defaultTravelMinutes;
  }

  beginMove(agent: string, destination: string, onArrive: (a: NavigationArrival) => void):
    { accepted: boolean } {
    if (!this.host.locationExists(destination)) throw new Error(`Unknown location '${destination}'.`);
    const from = this.host.currentLocationOf(agent);
    if (from === undefined) throw new Error(`Unknown agent '${agent}'.`);
    this.cancel(agent, NavigationFailure.Superseded);
    const travel = this.getTravelTime(from, destination);
    const gen = this.bump(agent);
    this.states.set(agent, {
      destination, status: NavigationPathStatus.EnRoute, failure: NavigationFailure.None,
      remainingMinutes: travel, expectedArrival: this.nowMinutes() + travel,
    });
    this.trips.set(agent, { destination, onArrive, generation: gen });
    this.scheduleIn(travel, () => this.completeIfCurrent(agent, gen));
    if (travel === 0) this.completeIfCurrent(agent, gen);
    return { accepted: true };
  }

  cancel(agent: string, reason: NavigationFailure = NavigationFailure.Superseded): boolean {
    const trip = this.trips.get(agent);
    if (!trip) return false;
    const dest = trip.destination;
    this.trips.delete(agent);
    this.bump(agent);
    const st = this.states.get(agent);
    if (st) { st.status = NavigationPathStatus.Failed; st.failure = reason; st.expectedArrival = undefined; st.remainingMinutes = 0; }
    trip.onArrive({ agent, destination: dest, success: false, failure: reason });
    return true;
  }

  getState(agent: string) {
    return this.states.get(agent) ?? {
      destination: undefined, status: NavigationPathStatus.Idle,
      failure: NavigationFailure.None, remainingMinutes: 0,
    };
  }

  checkForStuck(now: number): void {
    const stuck: Array<[string, Trip]> = [];
    for (const [agent, trip] of this.trips) {
      const st = this.states.get(agent)!;
      if (st.expectedArrival !== undefined && now > st.expectedArrival + this.stuckGraceMinutes)
        stuck.push([agent, trip]);
    }
    for (const [agent, trip] of stuck) {
      this.trips.delete(agent); this.bump(agent);
      const st = this.states.get(agent)!;
      st.status = NavigationPathStatus.Failed; st.failure = NavigationFailure.NoProgress;
      trip.onArrive({ agent, destination: st.destination!, success: false, failure: NavigationFailure.NoProgress });
    }
  }

  private completeIfCurrent(agent: string, generation: number): void {
    const trip = this.trips.get(agent);
    if (!trip || trip.generation !== generation) return; // stale callback regression guard
    this.trips.delete(agent);
    const st = this.states.get(agent)!;
    const dest = trip.destination;
    if (!this.host.locationExists(dest)) {
      st.status = NavigationPathStatus.Failed; st.failure = NavigationFailure.TargetDestroyed; st.destination = undefined;
      trip.onArrive({ agent, destination: dest, success: false, failure: NavigationFailure.TargetDestroyed });
      return;
    }
    try {
      this.host.moveAgent(agent, dest);
      st.status = NavigationPathStatus.Arrived; st.failure = NavigationFailure.None;
      st.remainingMinutes = 0; st.destination = undefined;
      trip.onArrive({ agent, destination: dest, success: true, failure: NavigationFailure.None });
    } catch {
      st.status = NavigationPathStatus.Failed; st.failure = NavigationFailure.DestinationBlocked; st.destination = undefined;
      trip.onArrive({ agent, destination: dest, success: false, failure: NavigationFailure.DestinationBlocked });
    }
  }
  private bump(a: string): number {
    const g = (this.generations.get(a) ?? 0) + 1;
    this.generations.set(a, g); return g;
  }
}

function pair(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

// ---------------- Jobs / schedules ----------------
export interface JobDefinition {
  id: string; title: string; workplace: string;
  shiftStartMinuteOfDay: number; shiftEndMinuteOfDay: number; incomePerHour: number;
}
export function defineJob(id: string, title: string, workplace: string,
  startMin: number, endMin: number, incomePerHour: number): JobDefinition {
  if (!id.trim()) throw new Error("Job id required.");
  if (incomePerHour < 0) throw new Error("incomePerHour must be >= 0");
  return { id, title, workplace, shiftStartMinuteOfDay: startMin, shiftEndMinuteOfDay: endMin, incomePerHour };
}
const mod1440 = (v: number) => ((v % 1440) + 1440) % 1440;
const withinWindow = (m: number, s: number, e: number) => (s <= e ? m >= s && m <= e : m >= s || m <= e);
const circularForward = (from: number, to: number) => (to - from + 1440) % 1440;

/** 1.0 across offset-shifted shift; ±30-min shoulders; 0 on rest days. */
export function computeJobPressure(
  job: JobDefinition | undefined, routineOffsetMinutes: number,
  hasEmptyProfileToday: boolean, timeMinutes: number,
): number {
  if (!job || hasEmptyProfileToday) return 0;
  const start = mod1440(job.shiftStartMinuteOfDay + routineOffsetMinutes);
  const end = mod1440(job.shiftEndMinuteOfDay + routineOffsetMinutes);
  const m = timeMinutes % 1440;
  if (withinWindow(m, start, end)) return 1;
  const toStart = circularForward(m, start), pastEnd = circularForward(end, m);
  if (toStart <= 30) return 0.9 * (1 - toStart / 30);
  if (pastEnd <= 30) return 0.9 * (1 - pastEnd / 30);
  return 0;
}

// ---------------- Weather ----------------
export type WeatherState = 0 | 1 | 2 | 3; // Clear, Cloudy, Rain, HeavyRain
export interface WeatherChangedEvent { from: WeatherState; to: WeatherState }

export class WeatherSystem {
  current: WeatherState = 0;
  constructor(private readonly publish: (e: WeatherChangedEvent) => void,
              private readonly rng: { nextDouble(): number }) {}
  rollForNewDay(): void { this.set(this.nextState(this.current)); }
  set(s: WeatherState): void {
    if (s === this.current) return;
    const old = this.current; this.current = s;
    this.publish({ from: old, to: s });
  }
  private nextState(cur: WeatherState): WeatherState {
    const r = this.rng.nextDouble();
    switch (cur) {
      case 0: return r < 0.6 ? 0 : r < 0.9 ? 1 : 2;
      case 1: return r < 0.4 ? 0 : r < 0.75 ? 1 : r < 0.95 ? 2 : 3;
      case 2: return r < 0.25 ? 1 : r < 0.7 ? 2 : 3;
      default: return r < 0.4 ? 2 : r < 0.8 ? 1 : 3;
    }
  }
}

// ---------------- Town events & storylets ----------------
export interface TownEventDefinition {
  key: string; title: string; where: string;
  dayOfWeek: number; startMinuteOfDay: number; durationMinutes: number; interest: number;
}
export function isActiveOn(def: TownEventDefinition, timeMinutes: number): boolean {
  const day = Math.floor(timeMinutes / 1440) % 7;
  if (day !== def.dayOfWeek) return false;
  const m = timeMinutes % 1440;
  return m >= def.startMinuteOfDay && m < def.startMinuteOfDay + def.durationMinutes;
}
export interface StoryletConditionCtx {
  subject: string; other: string; services: Record<string, unknown>;
}
