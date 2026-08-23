/**
 * Deterministic scheduler for simulation operations, driven by the clock:
 * due work executes ordered by (due time, insertion sequence); repeating
 * operations re-arm from their previous deadline (no drift). This replaces
 * Unity's Invoke()-style timing entirely.
 */
import type { EventBus } from "../events/eventBus.js";
import {
  addTime,
  days,
  duration,
  hours,
  minutes,
  simTimeOfDay,
  type SimDuration,
  type SimTime,
  SimulationClock,
} from "../time/time.js";

export interface ScheduledOperationHandle {
  readonly value: number;
}

const HANDLE_NONE: ScheduledOperationHandle = { value: -1 };

interface Entry {
  sequence: number;
  due: SimTime;
  repeatIntervalMinutes: number; // 0 = one-shot
  callback: (t: SimTime) => void;
  label?: string;
  cancelled: boolean;
}

function comesBefore(a: Entry, b: Entry): boolean {
  return a.due.totalMinutes < b.due.totalMinutes;
}

export class SimulationScheduler {
  private readonly queue: Entry[] = [];
  private nextSequence = 1;

  totalScheduled = 0;
  totalExecuted = 0;
  totalCancelled = 0;

  private readonly detachClock: () => void;

  constructor(
    private readonly clock: SimulationClock,
    private readonly events?: EventBus,
  ) {
    this.detachClock = clock.onTimeAdvanced(() => this.processDue());
  }

  get pendingCount(): number {
    let count = 0;
    for (const e of this.queue) if (!e.cancelled) count++;
    return count;
  }

  /** One-shot at an absolute simulated time. */
  scheduleAt(when: SimTime, callback: (t: SimTime) => void, label?: string): ScheduledOperationHandle {
    if (typeof callback !== "function") throw new Error("Callback required.");
    return this.enqueue(when, 0, callback, label);
  }

  /** One-shot after a delay from the current time. */
  scheduleIn(delay: SimDuration, callback: (t: SimTime) => void, label?: string): ScheduledOperationHandle {
    if (typeof callback !== "function") throw new Error("Callback required.");
    return this.enqueue(addTime(this.clock.currentTime, delay), 0, callback, label);
  }

  /** Repeating; first run one interval from now; anchored to previous deadline forever. */
  scheduleRepeating(interval: SimDuration, callback: (t: SimTime) => void, label?: string): ScheduledOperationHandle {
    if (interval.totalMinutes <= 0)
      throw new Error("Repeat interval must be positive.");
    if (typeof callback !== "function") throw new Error("Callback required.");
    return this.enqueue(
      addTime(this.clock.currentTime, interval),
      interval.totalMinutes,
      callback,
      label,
    );
  }

  /** Repeats daily at hh:mm; first occurrence is the next such instant. */
  scheduleDailyAt(hour: number, minute: number, callback: (t: SimTime) => void, label?: string): ScheduledOperationHandle {
    const now = this.clock.currentTime;
    const todayAt = simTimeOfDay(Math.floor(now.totalMinutes / 1440), hour, minute);
    const candidate =
      todayAt.totalMinutes <= now.totalMinutes
        ? addTime(todayAt, days(1))
        : todayAt;
    return this.enqueue(candidate, 1440, callback, label);
  }

  cancel(handle: ScheduledOperationHandle): boolean {
    for (const entry of this.queue) {
      if (entry.sequence !== handle.value) continue;
      if (entry.cancelled) return false;
      entry.cancelled = true;
      this.totalCancelled++;
      return true;
    }
    return false;
  }

  /** Executes every operation whose deadline has passed, in deterministic order. */
  processDue(): void {
    while (this.queue.length > 0) {
      const entry = this.queue[0]!;
      if (entry.cancelled) {
        this.queue.shift();
        continue;
      }
      if (entry.due.totalMinutes > this.clock.currentTime.totalMinutes) return;

      const executedAt = entry.due;
      this.queue.shift();
      if (entry.repeatIntervalMinutes > 0) {
        entry.due = addTime(entry.due, duration(entry.repeatIntervalMinutes));
        this.insertSorted(entry);
      }

      this.events?.publish("sim:scheduled-op", { handle: entry.sequence, label: entry.label });
      entry.callback(executedAt);
      this.totalExecuted++;
    }
  }

  dispose(): void {
    this.detachClock();
  }

  // -- internals -------------------------------------------------------------

  private enqueue(due: SimTime, repeatIntervalMinutes: number, callback: (t: SimTime) => void, label?: string): ScheduledOperationHandle {
    const entry: Entry = {
      sequence: this.nextSequence++,
      due,
      repeatIntervalMinutes,
      callback,
      label,
      cancelled: false,
    };
    this.insertSorted(entry);
    this.totalScheduled++;
    return { value: entry.sequence };
  }

  private insertSorted(entry: Entry): void {
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const other = this.queue[mid]!;
      const otherBefore =
        other.due.totalMinutes < entry.due.totalMinutes ||
        (other.due.totalMinutes === entry.due.totalMinutes && other.sequence < entry.sequence);
      if (otherBefore) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, entry);
  }
}
