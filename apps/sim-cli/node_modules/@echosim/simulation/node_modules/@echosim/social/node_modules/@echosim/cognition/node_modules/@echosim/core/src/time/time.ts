/**
 * Simulated time: integer minutes since the epoch. Day 0 is Monday 00:00.
 * No wall-clock access anywhere in simulation code — determinism first.
 */

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;

export enum SimDayOfWeek {
  Monday = 0,
  Tuesday = 1,
  Wednesday = 2,
  Thursday = 3,
  Friday = 4,
  Saturday = 5,
  Sunday = 6,
}

/** A span of simulated time (non-negative, minute granularity). */
export interface SimDuration {
  readonly totalMinutes: number;
}

export function duration(minutes: number): SimDuration {
  if (!Number.isFinite(minutes) || minutes < 0)
    throw new Error("Simulated durations cannot be negative.");
  return { totalMinutes: Math.floor(minutes) };
}
export const dur0 = (): SimDuration => ({ totalMinutes: 0 });
export const minutes = (n: number): SimDuration => duration(n);
export const hours = (n: number): SimDuration => duration(n * MINUTES_PER_HOUR);
export const days = (n: number): SimDuration => duration(n * MINUTES_PER_DAY);

export function addDurations(a: SimDuration, b: SimDuration): SimDuration {
  return { totalMinutes: a.totalMinutes + b.totalMinutes };
}

/** A point in simulated time. */
export interface SimTime {
  /** Total minutes since epoch. Always >= 0. */
  readonly totalMinutes: number;
}

export const EPOCH: SimTime = { totalMinutes: 0 };

export function simTime(totalMinutes: number): SimTime {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0)
    throw new Error("Simulation time cannot precede the epoch.");
  return { totalMinutes };
}

export function simTimeOfDay(dayNumber: number, hour: number, minute: number): SimTime {
  if (dayNumber < 0) throw new Error("dayNumber must be >= 0");
  if (hour < 0 || hour > 23) throw new Error("Hour must be within [0,23].");
  if (minute < 0 || minute > 59) throw new Error("Minute must be within [0,59].");
  return simTime(dayNumber * MINUTES_PER_DAY + hour * MINUTES_PER_HOUR + minute);
}

export function addTime(t: SimTime, d: SimDuration): SimTime {
  return simTime(t.totalMinutes + d.totalMinutes);
}

export function subTime(t: SimTime, d: SimDuration): SimTime {
  const result = t.totalMinutes - d.totalMinutes;
  if (result < 0) throw new Error("Resulting time precedes the epoch.");
  return simTime(result);
}

export function timeDifference(later: SimTime, earlier: SimTime): SimDuration {
  return { totalMinutes: later.totalMinutes - earlier.totalMinutes };
}

export function dayNumber(t: SimTime): number {
  return Math.floor(t.totalMinutes / MINUTES_PER_DAY);
}

export function minuteOfDay(t: SimTime): number {
  return t.totalMinutes % MINUTES_PER_DAY;
}

export function hourOf(t: SimTime): number {
  return Math.floor(minuteOfDay(t) / MINUTES_PER_HOUR);
}

export function minuteOf(t: SimTime): number {
  return minuteOfDay(t) % MINUTES_PER_HOUR;
}

export function dayOfWeek(t: SimTime): SimDayOfWeek {
  return dayNumber(t) % 7 as SimDayOfWeek;
}

export function isWeekend(t: SimTime): boolean {
  const d = dayOfWeek(t);
  return d === SimDayOfWeek.Saturday || d === SimDayOfWeek.Sunday;
}

/** Inclusive window that may wrap midnight; inputs are (hour, minute). */
export function isInWindow(
  t: SimTime,
  startHour: number, startMinute: number,
  endHour: number, endMinute: number,
): boolean {
  const m = minuteOfDay(t);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start <= end ? m >= start && m <= end : m >= start || m <= end;
}

export function formatTime(t: SimTime): string {
  const dd = String(dayNumber(t)).padStart(1, "0");
  const hh = String(hourOf(t)).padStart(2, "0");
  const mm = String(minuteOf(t)).padStart(2, "0");
  return `D${dd} ${hh}:${mm}`;
}

/** Named speed presets for the clock. */
export const SimulationSpeed = {
  Paused: 0,
  Half: 0.5,
  Normal: 1,
  Double: 2,
  Quadruple: 4,
  Octuple: 8,
  DebugSixteen: 16,
} as const;

/**
 * Authoritative source of simulated time. Headless hosts advance through
 * advance()/advanceTo(); frame-driven hosts convert real seconds via
 * convertRealSeconds(). Pausing blocks explicit advances (loud failure).
 */
export class SimulationClock {
  private current: SimTime = EPOCH;
  private pausedFlag = false;
  private scaleValue: number = SimulationSpeed.Normal;

  private timeAdvancedHandlers: Array<(t: SimTime) => void> = [];
  private pauseHandlers: Array<(paused: boolean) => void> = [];

  get currentTime(): SimTime {
    return this.current;
  }
  get isPaused(): boolean {
    return this.pausedFlag;
  }
  get scale(): number {
    return this.scaleValue;
  }

  onTimeAdvanced(handler: (t: SimTime) => void): () => void {
    this.timeAdvancedHandlers.push(handler);
    return () => {
      this.timeAdvancedHandlers = this.timeAdvancedHandlers.filter((h) => h !== handler);
    };
  }

  onPauseChanged(handler: (paused: boolean) => void): () => void {
    this.pauseHandlers.push(handler);
    return () => {
      this.pauseHandlers = this.pauseHandlers.filter((h) => h !== handler);
    };
  }

  advance(delta: SimDuration): void {
    if (this.pausedFlag && delta.totalMinutes > 0)
      throw new Error("Cannot advance a paused clock. Resume first.");
    if (delta.totalMinutes === 0) return;
    this.current = addTime(this.current, delta);
    for (const h of [...this.timeAdvancedHandlers]) h(this.current);
  }

  advanceTo(target: SimTime): void {
    if (target.totalMinutes < this.current.totalMinutes)
      throw new Error("Simulation time cannot move backwards.");
    if (this.pausedFlag && target.totalMinutes !== this.current.totalMinutes)
      throw new Error("Cannot advance a paused clock. Resume first.");
    if (target.totalMinutes === this.current.totalMinutes) return;
    this.current = target;
    for (const h of [...this.timeAdvancedHandlers]) h(this.current);
  }

  pause(): void {
    if (this.pausedFlag) return;
    this.pausedFlag = true;
    for (const h of [...this.pauseHandlers]) h(true);
  }

  resume(): void {
    if (!this.pausedFlag) return;
    this.pausedFlag = false;
    for (const h of [...this.pauseHandlers]) h(false);
  }

  setScale(scale: number): void {
    if (!Number.isFinite(scale) || scale < 0)
      throw new Error("Scale must be finite and non-negative.");
    this.scaleValue = scale;
  }

  /** Floor-to-minute conversion of real seconds under the current scale; 0 while paused. */
  convertRealSeconds(realSeconds: number): SimDuration {
    if (this.pausedFlag || !Number.isFinite(realSeconds) || realSeconds <= 0)
      return dur0();
    return duration(Math.floor(realSeconds * this.scaleValue));
  }
}
