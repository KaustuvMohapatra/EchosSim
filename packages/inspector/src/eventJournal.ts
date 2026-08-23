/** Bounded chronological journal of simulation bus events for inspection. */
import type { Town } from "@echosim/simulation";
import {
  DAY_NAMES, WEATHER_NAMES,
  type EventFilter, type SimEventEntry, type TimeInfo,
} from "./types.js";

export class EventJournal {
  private readonly entries: SimEventEntry[] = [];
  private nextSeq = 1;
  readonly capacity: number;
  totalCaptured = 0;

  constructor(town: Town, capacity = 4000) {
    this.capacity = capacity;
    const at = () => town.clock.currentTime.totalMinutes;

    town.events.subscribe<{ agent: string; from?: string; to: string; atMinutes: number }>(
      "sim:agent-moved", (e) => this.push({
        seq: 0, atMinutes: e.atMinutes, kind: "movement", type: "sim:agent-moved",
        agent: e.agent, location: e.to,
        text: `${e.agent} arrived at ${e.to}`,
      }));

    town.events.subscribe<{ agent: string; goal: string; steps: number; cost: number; atMinutes: number }>(
      "sim:plan-started", (e) => this.push({
        seq: 0, atMinutes: e.atMinutes, kind: "plan", type: "sim:plan-started",
        agent: e.agent,
        text: `${e.agent} plans ${e.goal} (${e.steps} steps, cost ${e.cost.toFixed(2)})`,
      }));

    town.events.subscribe<{ agent: string; action: string; index: number }>(
      "sim:plan-step-completed", (e) => this.push({
        seq: 0, atMinutes: at(), kind: "step", type: "sim:plan-step-completed",
        agent: e.agent, text: `${e.agent} completed ${e.action}`,
      }));

    town.events.subscribe<{ agent: string; goal: string; outcome: string; reason: string; atMinutes: number }>(
      "sim:plan-finished", (e) => this.push({
        seq: 0, atMinutes: e.atMinutes, kind: "plan", type: "sim:plan-finished",
        agent: e.agent,
        text: `${e.agent} ${e.goal} ${e.outcome.toUpperCase()} (${e.reason})`,
      }));

    town.events.subscribe<{ from: number; to: number }>(
      "sim:weather-changed", (e) => this.push({
        seq: 0, atMinutes: at(), kind: "weather", type: "sim:weather-changed",
        text: `Weather: ${WEATHER_NAMES[e.from] ?? e.from} → ${WEATHER_NAMES[e.to] ?? e.to}`,
      }));

    town.events.subscribe<{
      initiator: string; listener: string; intent: string;
      topicLabel: string; utterances: readonly string[]; atMinutes: number;
    }>("sim:conversation", (c) => this.push({
      seq: 0, atMinutes: c.atMinutes, kind: "conversation", type: "sim:conversation",
      agent: c.initiator, text: `[${c.intent}] ${c.initiator}→${c.listener}: ${c.utterances.join(" / ")}`,
    }));

    // Social events surfaced by perception (insults, help, ...) for timeline.
    town.events.subscribe<{
      observer: string; eventType: string; actors: readonly string[];
      where?: string; timestampMinutes: number; confidence: number;
    }>("sim:observation-recorded", (o) => {
      if (o.eventType === "arrival") return; // movement already journaled
      this.push({
        seq: 0, atMinutes: o.timestampMinutes, kind: "social",
        type: "sim:" + o.eventType, agent: o.actors[0], location: o.where,
        text: `${o.actors.join(" & ")} — ${o.eventType.replace(/_/g, " ")} @ ${o.where ?? "?"}` +
              ` (seen by ${o.observer}, conf ${o.confidence.toFixed(2)})`,
      });
    });
  }

  private push(e: SimEventEntry): void {
    e.seq = this.nextSeq++;
    this.entries.push(e);
    if (this.entries.length > this.capacity) this.entries.shift();
    this.totalCaptured++;
  }

  query(filter: EventFilter = {}): SimEventEntry[] {
    const out: SimEventEntry[] = [];
    // Newest last in buffer; walk backwards so limit keeps the most recent.
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (filter.agent !== undefined && e.agent !== filter.agent) continue;
      if (filter.kind !== undefined && e.kind !== filter.kind) continue;
      if (filter.typePrefix !== undefined && !e.type.startsWith(filter.typePrefix)) continue;
      if (filter.sinceMinute !== undefined && e.atMinutes < filter.sinceMinute) continue;
      if (filter.untilMinute !== undefined && e.atMinutes > filter.untilMinute) continue;
      if (filter.textContains !== undefined &&
          !e.text.toLowerCase().includes(filter.textContains.toLowerCase())) continue;
      out.push(e);
      if (filter.limit !== undefined && out.length >= filter.limit) break;
    }
    return out.reverse(); // chronological order
  }

  all(): readonly SimEventEntry[] { return this.entries; }
}

export function timeInfoOf(totalMinutes: number, weatherState: number): TimeInfo {
  const day = Math.floor(totalMinutes / 1440);
  const hh = String(Math.floor((totalMinutes % 1440) / 60)).padStart(2, "0");
  const mm = String(Math.floor(totalMinutes % 60)).padStart(2, "0");
  return {
    totalMinutes,
    day,
    dayName: DAY_NAMES[day % 7]!,
    hhmm: `${hh}:${mm}`,
    weather: WEATHER_NAMES[weatherState] ?? String(weatherState),
  };
}
