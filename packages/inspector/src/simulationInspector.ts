/**
 * SimulationInspector: the read-only bridge between the running simulation and
 * any presentation layer. Implements SimulationInspectorAPI; every method is
 * side-effect free over the simulation (memory retrieval uses peek, utility
 * evaluation uses the read-only evaluate path).
 */
import type { AgentMind } from "@echosim/cognition";
import { PersonalityTrait } from "@echosim/cognition";
import { NeedKind } from "@echosim/cognition";
import { PlanningDirector } from "@echosim/simulation";
import type { Town } from "@echosim/simulation";
import {
  NEED_NAMES, TRAIT_NAMES,
  relationshipLabelOf,
  type AgentInspectorSnapshot, type AgentSummary, type BeliefSnapshot,
  type EventFilter, type JobSnapshot, type MemoryInspectorEntry,
  type NeedSnapshot, type PlanSnapshot, type PlanStepView,
  type RelationshipSnapshot, type SimEventEntry,
  type SuppressionTimerView, type TimeInfo, type TownStats,
  type TraitSnapshot, type UtilityCandidate, type SimulationInspectorAPI,
} from "./types.js";
import { EventJournal, timeInfoOf } from "./eventJournal.js";

export class SimulationInspector implements SimulationInspectorAPI {
  readonly journal: EventJournal;

  constructor(private readonly town: Town, private readonly director: PlanningDirector) {
    this.journal = new EventJournal(town);
  }

  // ---------------- agents ----------------

  getAgents(): AgentSummary[] {
    const out: AgentSummary[] = [];
    for (const id of this.town.residents.orderedIds()) {
      out.push(this.summaryOf(id));
    }
    return out;
  }

  getAgent(id: string): AgentInspectorSnapshot | undefined {
    const mind = this.town.residents.tryMind(id);
    if (!mind) return undefined;
    const summary = this.summaryOf(id);
    const utility = this.utilityFor(id);
    const plan = this.planFor(id);
    const memories = this.getMemories(id, { sort: "recency" });
    const relationships = this.getRelationships(id);
    const beliefs = this.getBeliefs(id);
    const suppressions = this.suppressionsFor(id);

    const job: JobSnapshot | undefined = mind.job
      ? { ...mind.job }
      : undefined;

    return {
      summary,
      homeLocationId: mind.homeLocationId,
      traits: traitSnapshots(mind),
      needs: needSnapshots(mind),
      emotionValence: mind.emotionValence,
      money: mind.money,
      committedGoalId: mind.currentGoalId,
      ...(job !== undefined ? { job } : {}),
      utility,
      plan,
      memories,
      relationships,
      beliefs,
      suppressions,
    };
  }

  // ---------------- focused reads ----------------

  getRelationships(id: string): RelationshipSnapshot[] {
    const out: RelationshipSnapshot[] = [];
    for (const link of this.town.relationships.all()) {
      if (link.from !== id) continue;
      out.push({
        from: link.from, to: link.to, ...link.rel,
        label: relationshipLabelOf(link.rel),
      });
    }
    // Deterministic order: by target id.
    out.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
    return out;
  }

  getMemories(
    id: string,
    opts: {
      sort?: "recency" | "importance" | "retrieval";
      aboutAgent?: string;
      limit?: number;
    } = {},
  ): MemoryInspectorEntry[] {
    const store = this.town.memory.tryStoreFor(id);
    if (!store) return [];
    const now = this.now();
    let entries: MemoryInspectorEntry[];

    if (opts.sort === "retrieval") {
      const ranked = this.town.retriever.peek(
        store, { aboutAgent: opts.aboutAgent, nowMinutes: now }, store.count);
      entries = ranked.map((r) => ({
        ...toMemoryEntry(r.memory),
        retrievalScore: r.score,
      }));
    } else {
      entries = store.all.map(toMemoryEntry);
    }

    if (opts.aboutAgent !== undefined && opts.sort !== "retrieval")
      entries = entries.filter((m) => m.subject === opts.aboutAgent);

    if (opts.sort === "importance")
      entries.sort((a, b) =>
        b.importance - a.importance !== 0 ? b.importance - a.importance : b.timestampMinutes - a.timestampMinutes);
    else if (opts.sort !== "retrieval")
      entries.sort((a, b) => b.timestampMinutes - a.timestampMinutes); // recency default

    if (opts.limit !== undefined) entries = entries.slice(0, opts.limit);
    return entries;
  }

  getEvents(filter?: EventFilter): SimEventEntry[] {
    return this.journal.query(filter);
  }

  getBeliefs(id: string): BeliefSnapshot[] {
    const store = this.town.beliefs.tryStoreFor(id);
    if (!store) return [];
    return store.all
      .map((b) => ({
        subjectKey: b.subjectKey, predicate: b.predicate,
        stance: b.stance, confidence: b.confidence, hopCount: b.hopCount,
        ...(b.sourceAgent !== undefined ? { sourceAgent: b.sourceAgent } : {}),
        learnedAtMinutes: b.learnedAtMinutes,
      }))
      .sort((a, b) =>
        a.subjectKey < b.subjectKey ? -1 : a.subjectKey > b.subjectKey ? 1 :
        a.predicate < b.predicate ? -1 : a.predicate > b.predicate ? 1 : 0);
  }

  utilityFor(id: string): UtilityCandidate[] {
    const evaluation = this.town.cognition.evaluate(id);
    const committed = this.town.residents.mind(id).currentGoalId;
    return evaluation.ranked.map((entry) => ({
      goal: entry.goal,
      displayName: entry.displayName,
      score: entry.final,
      breakdown: entry.breakdown.map((l) => ({ label: l.label, value: l.value })),
      criticalOverride: entry.criticalOverride,
      isCommittedGoal: entry.goal === committed,
    }));
  }

  planFor(id: string): PlanSnapshot {
    const run = this.director.peekActive(id);
    const diag = this.director.diagnosticsOf(id);
    const steps: PlanStepView[] = run
      ? run.plan.map((a) => ({
          actionId: a.id, label: a.displayName, durationMinutes: a.durationMinutes,
        }))
      : [];
    return {
      ...(run?.goalId !== undefined ? { goalId: run.goalId } : {}),
      revision: run?.generation ?? 0,
      hasPlan: !!run,
      steps,
      nextStepIndex: run?.nextStepIndex ?? 0,
      ...(run ? {
        currentAction: run.plan[run.nextStepIndex]?.displayName,
        lifecycle: run.lifecycle,
        startedAtMinutes: run.startedAtMinutes,
        currentStepDueMinutes: run.currentStepDueMinutes,
      } : {}),
      ...(diag.lastFailureDetail !== undefined ? { lastFailureDetail: diag.lastFailureDetail } : {}),
      ...(diag.lastReplanReason !== undefined ? { lastReplanReason: diag.lastReplanReason } : {}),
      ...(diag.lastPlanOutcome !== undefined ? { lastPlanOutcome: diag.lastPlanOutcome } : {}),
      lastPlannerNodesExpanded: diag.lastPlannerNodesExpanded,
    };
  }

  getTime(): TimeInfo {
    return timeInfoOf(this.now(), this.town.weather.current);
  }

  getTownStats(): TownStats {
    let memoryCount = 0;
    for (const owner of this.town.memory.ownerIds()) memoryCount += this.town.memory.storeFor(owner).count;
    let beliefCount = 0;
    for (const { store } of this.town.beliefs.owners()) beliefCount += store.count;
    return {
      residents: this.town.residents.orderedIds().length,
      locations: this.town.locations.count,
      activePlans: this.director.activeRunsSnapshot().length,
      memories: memoryCount,
      relationships: this.town.relationships.all().length,
      beliefs: beliefCount,
      conversations: this.journal.all().filter((e) => e.kind === "conversation").length,
      plansSucceeded: this.director.totalPlansSucceeded,
      plansFailed: this.director.totalPlansFailed,
      replans: this.director.totalReplans,
    };
  }

  /** Conversation records captured by the journal, newest first. */
  getConversations(limit = 50) {
    return this.journal.query({ kind: "conversation", limit }).reverse()
      .map((e) => e.text);
  }

  // ---------------- internals ----------------

  private now(): number {
    return this.town.clock.currentTime.totalMinutes;
  }

  private summaryOf(id: string): AgentSummary {
    const mind = this.town.residents.mind(id);
    const state = this.town.agentsById.get(id);
    const locId = state?.hasLocation ? state.currentLocationId : undefined;
    const locationName = locId
      ? this.town.locations.get(locId as never).definition.displayName
      : undefined;
    const run = this.director.peekActive(id);
    const currentAction = run?.plan[run.nextStepIndex]?.displayName;
    const status = run ? (run.lifecycle as string) : "Idle";
    const s: AgentSummary = {
      id,
      name: mind.displayName,
      emotionValence: mind.emotionValence,
      status,
      ...(locId !== undefined ? { locationId: locId } : {}),
      ...(locationName !== undefined ? { locationName } : {}),
      ...(mind.currentGoalId !== undefined ? { currentGoal: mind.currentGoalId } : {}),
      ...(currentAction !== undefined ? { currentAction } : {}),
    };
    return s;
  }

  private suppressionsFor(id: string): SuppressionTimerView[] {
    const now = this.now();
    return this.town.cognition.suppressionSnapshot()
      .filter((s) => s.agent === id && s.untilMinutes > now)
      .map((s) => ({ goal: s.goal, untilMinutes: s.untilMinutes }));
  }
}

function toMemoryEntry(m: {
  id: number; timestampMinutes: number; summary: string; eventType: string;
  subject: string; where?: string; importance: number; valence: number;
  confidence: number; source: unknown; accessCount: number;
}): MemoryInspectorEntry {
  return {
    id: m.id, timestampMinutes: m.timestampMinutes, summary: m.summary,
    type: m.eventType, subject: m.subject,
    where: m.where,
    importance: m.importance, valence: m.valence, confidence: m.confidence,
    source: String(m.source), accessCount: m.accessCount,
  };
}

function traitSnapshots(mind: AgentMind): TraitSnapshot[] {
  return TRAIT_NAMES.map((name, i) => ({
    name, value: mind.personality.get(i as PersonalityTrait),
  }));
}

function needSnapshots(mind: AgentMind): NeedSnapshot[] {
  const interrupting = mind.needs.findInterrupting()?.definition.kind;
  return mind.needs.all().map((n) => ({
    kind: n.definition.kind,
    name: NEED_NAMES[n.definition.kind] ?? String(n.definition.kind),
    value: n.current,
    satisfied: n.isSatisfied,
    critical: n.isCritical,
    interrupting: interrupting !== undefined && n.definition.kind === interrupting &&
                  n.shouldInterrupt,
  }));
}
