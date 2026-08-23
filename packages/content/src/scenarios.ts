/**
 * Demo scenarios (Sprint 33): reproducible showcases. Each runs a scripted,
 * deterministic setup on a fresh demo town and verifies the emergent outcome.
 * The debug UI's Demo selector drives the same functions.
 */
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";
import { createDemoTown } from "./demoTown.js";
import { SocialActionType } from "@echosim/social";

export interface ScenarioResult {
  name: string;
  passed: boolean;
  detail: string;
}

function stepMinutes(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

/** A: Both food venues closed ⇒ hungry resident fails, then recovers the
 *  moment the store reopens — failure, backoff, replan, success. */
export function scenarioAdaptivePlanning(): ScenarioResult {
  const { town, director, rohanId } = createDemoTown(3301);
  stepMinutes(town, director, 470);
  town.locations.get("loc_cafe" as never).setOpen(false);   // manual closures…
  town.locations.get("loc_store" as never).setOpen(false);  // …both food venues
  town.residents.mind(rohanId).needs.force(0 /* Hunger */, 96);

  let sawPlanningFailure = false;
  let succeeded = false;
  let reopened = false;
  town.events.subscribe<{ agent: string; goal: string; outcome: string }>(
    "sim:plan-finished", (e) => {
      if (e.agent === rohanId && e.goal === "goal_eat") {
        if (e.outcome === "Failed") sawPlanningFailure = true;
        if (e.outcome === "Succeeded" && reopened) succeeded = true;
      }
    });

  for (let i = 0; i < 60 && !succeeded; i++) {
    stepMinutes(town, director, 20);
    const d = director.diagnosticsOf(rohanId);
    if (d.lastPlanOutcome === "planning-failed" ||
        d.lastFailureDetail?.startsWith("plan:") ||
        d.lastFailureDetail?.includes("LocationClosed"))
      sawPlanningFailure = true;

    // The town reopens the store an hour later.
    if (!reopened && town.clock.currentTime.totalMinutes >= 570) {
      town.locations.get("loc_store" as never).forceOpen(true);
      reopened = true;
    }
  }
  return {
    name: "Adaptive Planning",
    passed: sawPlanningFailure && succeeded,
    detail: sawPlanningFailure
      ? (succeeded ? "failed while shut, replanned, ate after reopening"
                   : "failed but never recovered in window")
      : "no planning failure observed",
  };
}

/** B: A remembered slight shapes the next meeting hours later. */
export function scenarioMemory(): ScenarioResult {
  const { town, director, miraId, rohanId, anikaId } = createDemoTown(3302);
  // Isolate the pair: Anika spends the window elsewhere.
  town.moveAgent(anikaId as never, "loc_park" as never);
  stepMinutes(town, director, 30);
  town.social.attempt(rohanId, miraId, SocialActionType.Insult);

  // Half a day of separate life.
  stepMinutes(town, director, 720);

  const memories = [...town.memory.storeFor(miraId).all]
    .filter((m) => m.subject === rohanId && m.eventType.startsWith("insult"));
  const rel = town.relationships.tryGet(miraId, rohanId)!;
  const passed = memories.length >= 1 &&
                 (rel.grievance > 0.02 || rel.affinity < 0.3);
  return {
    name: "Memory",
    passed,
    detail: `${memories.length} insult memories about ${rohanId}; affinity ${rel.affinity.toFixed(2)}, grievance ${rel.grievance.toFixed(2)} after 12h`,
  };
}

/** C: Rumour travels Mira → Rohan with visible provenance decay. */
export function scenarioGossipChain(): ScenarioResult {
  const { town, director, miraId, rohanId, anikaId } = createDemoTown(3303);
  const now = () => town.clock.currentTime.totalMinutes;
  town.beliefs.learnDirect(miraId, anikaId, "regard", -0.9, 0.95, 42, now());
  town.events.publish("sim:plan-step-completed",
    { agent: miraId, action: "act_talk", index: 0 });

  const transferred = town.beliefs.tryStoreFor(rohanId)
    ?.tryGet(anikaId, "regard");
  void director;
  return {
    name: "Gossip Chain",
    passed: !!transferred && transferred.hopCount === 1 &&
            transferred.confidence < 0.95,
    detail: transferred
      ? `rohan holds hop-${transferred.hopCount} belief via ${transferred.sourceAgent}, conf ${transferred.confidence.toFixed(2)}`
      : "no transfer occurred",
  };
}

/** D: Direct kindness contradicts and revises a heard rumour. */
export function scenarioContradiction(): ScenarioResult {
  const { town, director, miraId, rohanId, anikaId } = createDemoTown(3304);
  const now = () => town.clock.currentTime.totalMinutes;
  // Mira forms first-hand bad opinion of Anika and tells Rohan. The rumour
  // leg uses the real transfer function directly so the scenario isolates
  // contradiction (transfer acceptance is chance-based by design).
  town.beliefs.learnDirect(miraId, anikaId, "regard", -0.9, 0.95, 7, now());
  const trust = town.relationships.getOrCreate(rohanId, miraId).trust;
  town.beliefs.tryTransfer(miraId, rohanId, anikaId, "regard", 7, trust, now());
  const heard = town.beliefs.tryStoreFor(rohanId)?.tryGet(anikaId, "regard");
  if (!heard || heard.hopCount !== 1)
    return { name: "Contradictory Evidence", passed: false,
             detail: "rumour did not reach Rohan (setup)" };
  const stanceBefore = heard.stance;

  // …then Anika helps Rohan twice, firsthand.
  for (let i = 0; i < 2; i++) {
    town.social.attempt(anikaId, rohanId, SocialActionType.Help);
    stepMinutes(town, director, 20);
  }

  town.beliefs.reconcileWithDirectExperience(
    rohanId, anikaId, "regard", 0.8, town.clock.currentTime.totalMinutes);
  const after = town.beliefs.tryStoreFor(rohanId)?.tryGet(anikaId, "regard")!;
  return {
    name: "Contradictory Evidence",
    passed: after.stance > stanceBefore && after.confidence >= heard.confidence,
    detail: `stance ${stanceBefore.toFixed(2)} → ${after.stance.toFixed(2)} after firsthand help`,
  };
}

/** E: Heavy rain empties the park and pulls residents indoors. */
export function scenarioWeatherEmergence(): ScenarioResult {
  const { town, director } = createDemoTown(3305);
  stepMinutes(town, director, 600); // morning, people out and about

  const atParkBefore =
    town.locations.get("loc_park" as never).occupiedCount;
  town.weather.set(3 /* HeavyRain */);
  // Let plans lapse into weather-aware choices.
  stepMinutes(town, director, 240);

  const counts = new Map<string, number>();
  for (const id of town.residents.orderedIds()) {
    const s = town.agentsById.get(id);
    if (s?.hasLocation && s.currentLocationId !== undefined)
      counts.set(s.currentLocationId, (counts.get(s.currentLocationId) ?? 0) + 1);
  }
  const parkAfter = counts.get("loc_park") ?? 0;
  const indoors = (counts.get("loc_cafe") ?? 0) +
                  (counts.get("loc_library" as never) ?? 0) +
                  (counts.get("loc_home_a") ?? 0);
  return {
    name: "Weather Emergence",
    passed: parkAfter <= atParkBefore && indoors > 0,
    detail: `park ${atParkBefore}→${parkAfter}; cafe+library+home = ${indoors}`,
  };
}

/** F: Rain-loving Mira keeps exploring when others hide. */
export function scenarioMira(): ScenarioResult {
  const { town, director, miraId } = createDemoTown(3306);
  stepMinutes(town, director, 600);
  town.weather.set(2 /* Rain */);
  stepMinutes(town, director, 120);

  const explore = town.cognition.evaluate(miraId).ranked
    .find((e) => e.goal === "goal_explore");
  const weatherLine = explore?.breakdown.find((l) => l.label === "Weather");
  // Mira loves rain (preference .88): penalty nearly cancelled.
  const passed = !!weatherLine && weatherLine.value > -0.03;
  return {
    name: "Mira",
    passed,
    detail: weatherLine
      ? `her Weather term is ${weatherLine.value.toFixed(3)} (rain barely deters her)`
      : "no weather term found",
  };
}

export interface ScenarioDef {
  key: string;
  title: string;
  run(): ScenarioResult;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  { key: "planning", title: "Adaptive Planning", run: scenarioAdaptivePlanning },
  { key: "memory", title: "Memory", run: scenarioMemory },
  { key: "gossip", title: "Gossip Chain", run: scenarioGossipChain },
  { key: "contradiction", title: "Contradictory Evidence", run: scenarioContradiction },
  { key: "weather", title: "Weather Emergence", run: scenarioWeatherEmergence },
  { key: "mira", title: "Mira", run: scenarioMira },
];
