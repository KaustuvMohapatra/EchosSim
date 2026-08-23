/** Standard action catalog factory + planning director with generation tokens. */
import {
  GoapPlanner, PlanFailureReason, defineAction, trueFact, setTrue, setFalse,
  PlannerWorldState,
  NeedKind, type PlanningAction, type AgentMind,
} from "@echosim/cognition";
import { AgentId, LocationId } from "@echosim/core";
import { computeJobPressure } from "@echosim/world";
import { LodLevel, LodController } from "./lod.js";
import type { Town } from "./town.js";

export enum ActionFailureType {
  PathUnavailable, TargetUnavailable, LocationClosed,
  ResourceUnavailable, ReservationDenied, Interrupted, Timeout, InsufficientMoney,
}

export interface ActiveRun {
  agentId: string;
  goalId: string;
  plan: readonly PlanningAction[];
  nextStepIndex: number;
  lifecycle: "Starting" | "Running" | "Succeeded" | "Failed" | "Cancelled";
  lastFailure?: ActionFailureType;
  startedAtMinutes: number;
  generation: number;
  currentStepDueMinutes: number;
}

/** Explainability read model: why is this agent doing what it is doing? */
export interface PlanningDiagnostics {
  agentId: string;
  /** Why the most recent planning cycle began ("tick", "critical-interruption", ...). */
  lastReplanReason?: string;
  /** Outcome of the most recent planning attempt. */
  lastPlanOutcome?: "planned" | "already-satisfied" | "utility-goal" | "planning-failed";
  /** Human-readable detail of the most recent step/run failure. */
  lastFailureDetail?: string;
  lastPlannerNodesExpanded: number;
  totalReplans: number;
  lastCycleAtMinutes?: number;
}

export class PlanningDirector {
  private readonly active = new Map<string, ActiveRun>();
  private readonly generations = new Map<string, number>();
  private readonly diagnostics = new Map<string, PlanningDiagnostics>();
  planningFailureBackoffMinutes = 90;

  totalPlansCreated = 0;
  totalPlansSucceeded = 0;
  totalPlansFailed = 0;
  totalReplans = 0;
  nodesExpandedLastPlan = 0;

  intervention?: (agent: string, action: PlanningAction) => ActionFailureType | null;
  lod?: LodController;

  attachLod(controller: LodController): void {
    this.lod = controller;
  }

  constructor(private readonly town: Town) {}

  isBusy(agent: string): boolean { return this.active.has(agent); }
  peekActive(agent: string): ActiveRun | undefined { return this.active.get(agent); }
  activeRunsSnapshot(): ActiveRun[] { return [...this.active.values()]; }

  diagnosticsOf(agent: string): PlanningDiagnostics {
    let d = this.diagnostics.get(agent);
    if (!d) {
      d = {
        agentId: agent, lastPlannerNodesExpanded: 0, totalReplans: 0,
      };
      this.diagnostics.set(agent, d);
    }
    return d;
  }

  tickAll(): void {
    for (const id of [...this.town.residents.orderedIds()]) this.tick(id as AgentId);
  }

  tick(agent: AgentId): void {
    const lod = this.lod?.levelOf(agent) ?? LodLevel.Full;
    const mind = this.town.residents.mind(agent);
    const critical = mind.needs.findInterrupting() !== null;

    const running = this.active.get(agent);
    if (running) {
      // Reduced LOD: let in-flight plans run without per-tick replan checks.
      if (!critical && lod === LodLevel.Reduced) return;
      if (!this.shouldInterrupt(running)) return;
      this.cancelRun(agent, "critical-interruption");
      this.totalReplans++;
      const d = this.diagnosticsOf(agent);
      d.totalReplans++;
      d.lastReplanReason = "critical-interruption";
      this.startFreshCycle(agent, "critical-interruption");
      return;
    }

    // Critical needs bypass every LOD throttle (promotion by survival).
    if (!critical) {
      if (lod === LodLevel.Coarse || lod === LodLevel.Dormant) return;
      if (lod === LodLevel.Reduced) {
        const d = this.diagnosticsOf(agent);
        const last = d.lastCycleAtMinutes ?? -Infinity;
        if (this.now() - last < (this.lod?.reducedCadenceMinutes ?? 30)) return;
      }
    }
    this.startFreshCycle(agent, critical ? "critical-promotion" : "idle");
  }

  private shouldInterrupt(running: ActiveRun): boolean {
    const mind = this.town.residents.mind(running.agentId);
    const interrupting = mind.needs.findInterrupting();
    if (!interrupting) return false;
    const goalDef = this.town.cognition.findGoal(running.goalId);
    if (!goalDef) return true;
    return !goalDef.reliefNeeds.includes(interrupting.definition.kind);
  }

  startFreshCycle(agent: AgentId, reason = "tick"): void {
    const mind = this.town.residents.mind(agent);
    const now = this.town.clock.currentTime.totalMinutes;
    const d = this.diagnosticsOf(agent);
    d.lastReplanReason = reason;
    d.lastCycleAtMinutes = now;
    const decision = this.town.cognition.decide(agent);
    const goalDef = this.town.cognition.findGoal(decision.effective.goal);
    if (!goalDef) throw new Error(`Selected goal '${decision.effective.goal}' has no definition.`);

    if (!goalDef.desiredFacts || goalDef.desiredFacts.length === 0) {
      d.lastPlanOutcome = "utility-goal";
      this.publishStart(agent, goalDef.id, 0, 0, now);
      this.publishFinish(agent, goalDef.id, "Succeeded", "utility-goal", now);
      this.totalPlansCreated++;
      this.totalPlansSucceeded++;
      return;
    }

    const catalog = this.buildCatalog(mind);
    const state = this.buildPlannerState(mind);
    const result = this.town.planner.plan(state, goalDef.desiredFacts, catalog, agent);

    this.nodesExpandedLastPlan = result.metrics.nodesExpanded;
    d.lastPlannerNodesExpanded = result.metrics.nodesExpanded;
    this.totalPlansCreated++;

    if (!result.success || !result.plan) {
      d.lastPlanOutcome = "planning-failed";
      d.lastFailureDetail = "plan: " + PlanFailureReason[result.metrics.failureReason];
      this.totalPlansFailed++;
      this.town.cognition.suppressGoal(agent, goalDef.id, now + this.planningFailureBackoffMinutes);
      this.publishStart(agent, goalDef.id, 0, 0, now);
      this.publishFinish(agent, goalDef.id, "Failed",
        "planning:" + PlanFailureReason[result.metrics.failureReason], now);
      return;
    }

    if (result.plan.steps.length === 0) {
      d.lastPlanOutcome = "already-satisfied";
      this.totalPlansSucceeded++;
      this.publishStart(agent, goalDef.id, 0, 0, now);
      this.publishFinish(agent, goalDef.id, "Succeeded", "already-satisfied", now);
      return;
    }

    d.lastPlanOutcome = "planned";
    d.lastFailureDetail = undefined;
    const run: ActiveRun = {
      agentId: agent, goalId: goalDef.id, plan: result.plan.steps,
      nextStepIndex: 0, lifecycle: "Starting",
      startedAtMinutes: now, generation: this.nextGeneration(agent),
      currentStepDueMinutes: now,
    };
    this.active.set(agent, run);
    this.publishStart(agent, goalDef.id, result.plan.steps.length, result.plan.totalCost, now);
    this.executeNextStep(agent);
  }

  restoreRun(agentId: string, goalId: string, stepActionIds: readonly string[],
             nextStepIndex: number, remainingMinutes: number): void {
    const mind = this.town.residents.mind(agentId);
    const catalog = this.buildCatalog(mind);
    const steps = stepActionIds.map((id) => {
      const found = catalog.find((a) => a.id === id);
      if (!found) throw new Error(`Cannot restore: action '${id}' missing.`);
      return found;
    });
    const run: ActiveRun = {
      agentId, goalId, plan: steps, nextStepIndex,
      lifecycle: "Running", startedAtMinutes: this.town.clock.currentTime.totalMinutes,
      generation: this.nextGeneration(agentId as unknown as string),
      currentStepDueMinutes: this.town.clock.currentTime.totalMinutes + Math.max(0, remainingMinutes),
    };
    this.active.set(agentId as AgentId, run);
    const gen = run.generation, idx = run.nextStepIndex;
    if (remainingMinutes <= 0)
      this.completeStepIfCurrent(agentId as AgentId, gen, idx);
    else
      this.scheduleCompletion(remainingMinutes, agentId as AgentId, gen, idx);
  }

  private scheduleCompletion(minutes: number, agent: AgentId, gen: number, idx: number): void {
    this.town.scheduler.scheduleIn({ totalMinutes: minutes }, () =>
      this.completeStepIfCurrent(agent, gen, idx));
  }

  private executeNextStep(agent: AgentId): void {
    const run = this.active.get(agent);
    if (!run) return;
    const action = run.plan[run.nextStepIndex]!;

    const intercepted = this.intervention?.(agent as string, action);
    if (intercepted !== undefined && intercepted !== null) {
      this.failStep(agent, intercepted, "intervention");
      return;
    }

    // Between-steps critical check: cancel and yield.
    if (action.interruptible && this.shouldInterrupt(run)) {
      this.cancelRun(agent, "critical-interruption-between-steps");
      const d = this.diagnosticsOf(agent);
      d.totalReplans++;
      d.lastReplanReason = "critical-interruption";
      this.totalReplans++;
      return; // deferred retry via next external tick
    }

    if (action.requiredLocation !== undefined) {
      const targetLoc = action.requiredLocation as unknown as string;
      const runtime = this.town.locations.get(targetLoc as never as LocationId);
      if (!runtime.isOpen) {
        this.failStep(agent, ActionFailureType.LocationClosed, targetLoc + " closed");
        return;
      }
      const locState = this.town.agentsById.get(agent)!;
      if (!locState.hasLocation || locState.currentLocationId !== targetLoc) {
        if (action.isMovement) {
          const gen = run.generation, idx = run.nextStepIndex;
          this.town.navigation.beginMove(
            agent as never as import("@echosim/core").AgentId,
            targetLoc as never as LocationId,
            (arrival) => {
              if (arrival.success)
                this.completeStepIfCurrent(agent, gen, idx);
              else
                this.failStep(agent, navToAction(arrival.failure), String(arrival.failure));
            },
          );
          run.lifecycle = "Running";
          return;
        }
        this.failStep(agent, ActionFailureType.TargetUnavailable, "not at " + targetLoc);
        return;
      }
    }

    // Real purchases gate buy steps when an economy exists.
    if (this.town.economy &&
        (action.id === "act_buy_meal" || action.id === "act_buy_ingredients")) {
      const itemName = action.id === "act_buy_meal" ? "meal" : "ingredients";
      const failure = this.town.economy.tryPurchase(agent, itemName);
      if (failure !== "None") {
        this.failStep(agent,
          failure === "InsufficientMoney" ? ActionFailureType.InsufficientMoney : ActionFailureType.ResourceUnavailable,
          failure);
        return;
      }
    }

    run.lifecycle = "Running";
    if (action.durationMinutes <= 0) {
      this.completeStep(agent);
      return;
    }
    run.currentStepDueMinutes = this.now() + action.durationMinutes;
    const gen = run.generation, idx = run.nextStepIndex;
    this.scheduleCompletion(action.durationMinutes, agent, gen, idx);
  }

  private completeStepIfCurrent(agent: AgentId, generation: number, stepIndex: number): void {
    const run = this.active.get(agent);
    if (!run || run.generation !== generation || run.nextStepIndex !== stepIndex) return;
    this.completeStep(agent);
  }

  private completeStep(agent: AgentId): void {
    const run = this.active.get(agent);
    if (!run) return;
    const action = run.plan[run.nextStepIndex]!;
    const mind = this.town.residents.mind(agent);

    for (const r of action.relief) mind.needs.relieve(r.kind, r.amount);
    if (this.town.economy && action.id === "act_work")
      this.town.economy.payWage(agent, action.durationMinutes / 60);

    for (const e of action.effects) applyEffectToMemorySafe(mind.plannerMemory, e);

    run.nextStepIndex++;
    this.publishStepDone(agent, action.id, run.nextStepIndex - 1);

    if (run.nextStepIndex >= run.plan.length) {
      run.lifecycle = "Succeeded";
      this.totalPlansSucceeded++;
      this.finishRun(agent, run.goalId, "Succeeded", "plan-complete");
      return;
    }
    this.executeNextStep(agent);
  }

  private failStep(agent: AgentId, failureType: ActionFailureType, detail: string): void {
    this.totalPlansFailed++;
    const d = this.diagnosticsOf(agent);
    d.lastFailureDetail = ActionFailureType[failureType] + ": " + detail;
    d.lastReplanReason = "action-failed";
    d.totalReplans++;
    const run = this.active.get(agent);
    if (run) {
      run.lifecycle = "Failed";
      run.lastFailure = failureType;
      this.finishRun(agent, run.goalId, "Failed", ActionFailureType[failureType] + ": " + detail);
    }
    this.totalReplans++; // deferred retry via next external tick
  }

  private cancelRun(agent: AgentId, reason: string): void {
    const run = this.active.get(agent);
    if (!run) return;
    run.lifecycle = "Cancelled";
    this.finishRun(agent, run.goalId, "Cancelled", reason);
  }

  private finishRun(agent: AgentId, goal: string, outcome: string, reason: string): void {
    this.active.delete(agent);
    this.nextGeneration(agent); // invalidate pending callbacks
    this.publishFinish(agent, goal, outcome, reason, this.now());
  }

  private buildCatalog(mind: AgentMind): PlanningAction[] {
    const locations: Array<{ id: string; name: string }> = [];
    for (const id of this.town.locations.orderedIds)
      locations.push({ id: id as string, name: this.town.locations.get(id).definition.displayName });

    const list: PlanningAction[] = [];
    const home = mind.homeLocationId || undefined;
    const job = mind.job;
    const openOf = (loc?: string) => (loc ? this.town.locations.get(loc as never).isOpen : false);

    const moveEffects = (primaryKey: string, includeAlias: boolean) => {
      const effects = [setFalse(HOME), ...locations.map((l) => setFalse("at_" + l.id))];
      effects.push(setTrue(primaryKey));
      if (includeAlias && primaryKey !== HOME) effects.push(setTrue(HOME));
      return effects;
    };

    if (home) {
      list.push(defineAction("act_go_home", "GoHome", {
        preconditions: undefined,
        effects: moveEffects("at_" + home, true),
        baseCost: 0.6, durationMinutes: 15,
        requiredLocation: home, isMovement: true,
      }));
    }

    for (const loc of locations) {
      if (home && loc.id === home) continue;
      list.push(defineAction("act_goto_" + loc.id, "GoTo " + loc.name, {
        preconditions: undefined,
        effects: moveEffects("at_" + loc.id, false),
        baseCost: 1.0, durationMinutes: 15,
        requiredLocation: loc.id, isMovement: true,
      }));
    }

    // Cafe food chain
    const cafe = locations.find((l) => l.id.includes("cafe"));
    if (cafe) {
      list.push(defineAction("act_buy_meal", "BuyFood", {
        preconditions: [trueFact("at_" + cafe.id), trueFact("cafe_open")],
        effects: [setTrue("has_meal")],
        baseCost: 1.0, durationMinutes: 12,
        requiredLocation: cafe.id, dynamicCost: () => 0.8, interruptible: false,
      }));
    }

    const store = locations.find((l) => l.id.includes("store"));
    if (store) {
      list.push(defineAction("act_buy_ingredients", "BuyIngredients", {
        preconditions: [trueFact("at_" + store.id), trueFact("store_open")],
        effects: [setTrue("has_ingredients")],
        baseCost: 0.8, durationMinutes: 20,
        requiredLocation: store.id, dynamicCost: () => 0.6, interruptible: false,
      }));
    }

    if (home) {
      list.push(defineAction("act_get_ingredients", "GetFood", {
        preconditions: [trueFact(HOME), { key: PANTRY, atLeast: true, value: 1 }],
        effects: [setTrue("has_ingredients"), { mode: "add" as const, key: PANTRY, delta: -1 }],
        baseCost: 1.5, durationMinutes: 5,
      }));
      list.push(defineAction("act_cook_meal", "CookFood", {
        preconditions: [trueFact(HOME), trueFact("has_ingredients")],
        effects: [setTrue("has_meal"), setFalse("has_ingredients")],
        baseCost: 2.5, durationMinutes: 40,
        relief: [{ kind: NeedKind.Hunger, amount: 8 }],
      }));
    }

    list.push(defineAction("act_eat", "Eat", {
      preconditions: [trueFact("has_meal")],
      effects: [setTrue("just_ate"), setFalse("has_meal")],
      baseCost: 0.3, durationMinutes: 20,
      relief: [{ kind: NeedKind.Hunger, amount: 55 }],
    }));

    if (home) {
      list.push(defineAction("act_sleep", "Sleep", {
        preconditions: [trueFact(HOME)], effects: [setTrue("rested")],
        baseCost: 0.5, durationMinutes: 420,
        relief: [{ kind: NeedKind.Energy, amount: 70 }, { kind: NeedKind.Comfort, amount: 25 }],
        interruptible: false,
      }));
    }

    list.push(defineAction("act_relax", "Relax", {
      preconditions: undefined, effects: [setTrue("relaxed")],
      baseCost: 1.2, durationMinutes: 60,
      relief: [{ kind: NeedKind.Fun, amount: 30 }, { kind: NeedKind.Social, amount: 4 }],
    }));

    list.push(defineAction("act_explore", "Explore", {
      preconditions: [{ key: HOME, atLeast: false, value: 0 }],
      effects: [setTrue("explored")],
      baseCost: 0.9, durationMinutes: 45,
      relief: [{ kind: NeedKind.Fun, amount: 18 }],
    }));

    list.push(defineAction("act_talk", "Talk", {
      preconditions: [trueFact("social_target_nearby")],
      effects: [setTrue("socialized")],
      baseCost: 0.5, durationMinutes: 30,
      relief: [{ kind: NeedKind.Social, amount: 50 }],
    }));

    if (job?.workplace) {
      list.push(defineAction("act_work", "Work", {
        preconditions: [trueFact("at_" + job.workplace), trueFact("on_shift"), trueFact("work_open")],
        effects: [setTrue("worked")],
        baseCost: 0.5, durationMinutes: 240,
        requiredLocation: job.workplace,
        relief: [{ kind: NeedKind.Energy, amount: -18 }, { kind: NeedKind.Hunger, amount: -12 }],
        interruptible: false,
      }));
    }

    list.push(defineAction("act_idle", "Idle", {
      preconditions: undefined, effects: [setTrue("relaxed")],
      baseCost: 3.0, durationMinutes: 30,
      relief: [{ kind: NeedKind.Fun, amount: 6 }],
    }));

    return list;

    function applyEffectToMemorySafe(memory: Map<string, number>,
      effect: { mode: "assign"; key: string; value: number } | { mode: "add"; key: string; delta: number }): void {
      if (effect.key.startsWith("at_")) return;
      if (EPHEMERAL.has(effect.key)) return;
      const cur = memory.get(effect.key) ?? 0;
      memory.set(effect.key, effect.mode === "assign" ? effect.value : cur + effect.delta);
    }
  }

  private buildPlannerState(mind: AgentMind) {
    const state = new PlannerWorldState();

    let atHome = false;
    for (const locId of this.town.locations.orderedIds) {
      const agentState = this.town.agentsById.get(mind.agent);
      const here = agentState!.hasLocation && agentState!.currentLocationId === locId;
      state.set("at_" + locId, here ? 1 : 0);
      if (here && locId === mind.homeLocationId) atHome = true;
    }
    state.set(HOME, atHome ? 1 : 0);

    // Openness facts.
    for (const id of this.town.locations.orderedIds) {
      const rt = this.town.locations.get(id);
      const key = id.toString().includes("cafe") ? "cafe_open"
                : id.toString().includes("store") ? "store_open"
                : id.toString().includes("bakery") && mind.job ? "work_open"
                : null;
      if (key) state.set(key, rt.isOpen ? 1 : 0);
    }

    // Employment facts.
    if (mind.job) {
      const agentState = this.town.agentsById.get(mind.agent);
      const atWork = agentState!.hasLocation && agentState!.currentLocationId === mind.job.workplace;
      state.set("at_work", atWork ? 1 : 0);
      state.set("work_open", (() => { const rt = this.town.locations.get(mind.job!.workplace as never as LocationId); return rt.isOpen ? 1 : 0; })());
      state.set("on_shift", computeJobPressure(mind.job, mind.routineOffsetMinutes, false, this.now()) > 0 ? 1 : 0);
    } else {
      state.set("at_work", 0); state.set("work_open", 0); state.set("on_shift", 0);
    }

    // Persistent planner memory minus ephemerals and location keys.
    for (const [k, v] of mind.plannerMemory) {
      if (k.startsWith("at_")) continue;
      if (EPHEMERAL.has(k)) continue;
      state.set(k, v);
    }
    for (const key of EPHEMERAL) state.set(key, 0);

    // Company detection.
    let othersPresent = 0;
    const agentState = this.town.agentsById.get(mind.agent);
    if (agentState!.hasLocation) {
      for (const otherId of this.town.residents.orderedIds()) {
        if (otherId === mind.agent) continue;
        const other = this.town.agentsById.get(otherId);
        if (other!.hasLocation && other!.currentLocationId === agentState!.currentLocationId) othersPresent++;
      }
    }
    state.set("social_target_nearby", othersPresent > 0 ? 1 : 0);

    return state;
  }

  private publishStart(agent: AgentId, goal: string, steps: number, cost: number, at: number): void {
    this.town.events.publish("sim:plan-started", { agent, goal, steps, cost, atMinutes: at });
  }
  private publishStepDone(agent: AgentId, action: string, index: number): void {
    this.town.events.publish("sim:plan-step-completed", { agent, action, index });
  }
  private publishFinish(agent: AgentId, goal: string, outcome: string, reason: string, at: number): void {
    this.town.events.publish("sim:plan-finished", { agent, goal, outcome, reason, atMinutes: at });
  }

  private nextGeneration(agent: AgentId | string): number {
    const g = (this.generations.get(agent) ?? 0) + 1;
    this.generations.set(agent, g);
    return g;
  }

  private get now(): () => number {
    return () => this.town.clock.currentTime.totalMinutes;
  }
}

function navToAction(failure: number): ActionFailureType {
  // DestinationBlocked=2→LocationClosed(2), TargetDestroyed=3→TargetUnavailable(1),
  // NoProgress=5→Timeout(6)
  switch (failure) {
    case 2: return ActionFailureType.LocationClosed;
    case 3: return ActionFailureType.TargetUnavailable;
    case 5: return ActionFailureType.Timeout;
    default: return ActionFailureType.PathUnavailable;
  }
}

const HOME = "at_home";
const PANTRY = "pantry_stock";
const EPHEMERAL = new Set(["just_ate", "rested", "relaxed", "socialized", "explored", "worked"]);

// removed


const EPHEMERAL_SET = EPHEMERAL;
function applyEffectToMemorySafe(memory: Map<string, number>,
  effect: { mode: "assign"; key: string; value: number } | { mode: "add"; key: string; delta: number }): void {
  if (effect.key.startsWith("at_")) return;
  if (EPHEMERAL_SET.has(effect.key)) return;
  const cur = memory.get(effect.key) ?? 0;
  memory.set(effect.key, effect.mode === "assign" ? effect.value : cur + effect.delta);
}


