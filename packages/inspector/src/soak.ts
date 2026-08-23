/** Continuous invariant checking + stuck detection (Sprint 28). */
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

export interface InvariantReport {
  violations: string[];
  checkedAtMinutes: number;
}

export interface StuckRecord {
  agentId: string;
  goalId: string;
  lastFailure?: string;
  locationId?: string;
  firstSeenMinutes: number;
  seenCount: number;
  /** Internal tracking (not part of the public report). */
  reported?: boolean;
  lastSeenSignature?: string;
}

export class SoakMonitor {
  /** Same goal+failure+location for this many consecutive checks ⇒ stuck. */
  stuckThresholdChecks = 36; // ~6 h at 10-min cadence
  private readonly stuck = new Map<string, StuckRecord>();

  visit(town: Town, director: PlanningDirector): InvariantReport {
    const v: string[] = [];
    const now = town.clock.currentTime.totalMinutes;

    for (const id of town.residents.orderedIds()) {
      const m = town.residents.mind(id);
      // Numeric sanity.
      if (Number.isNaN(m.emotionValence) || !Number.isFinite(m.emotionValence))
        v.push(`${id}: emotion NaN/Inf`);
      if (!Number.isFinite(m.money)) v.push(`${id}: money NaN/Inf`);
      for (const n of m.needs.all())
        if (!Number.isFinite(n.current) || n.current < -1e-9 || n.current > 100.000001)
          v.push(`${id}: need ${n.definition.kind} out of range (${n.current})`);

      // Location reference validity.
      const state = town.agentsById.get(id);
      if (state?.hasLocation) {
        if (!state.currentLocationId)
          v.push(`${id}: hasLocation but no id`);
        else if (!town.locations.tryGet(state.currentLocationId as never))
          v.push(`${id}: references unknown location ${state.currentLocationId}`);
      }

      // Stuck detection.
      const run = director.peekActive(id);
      const diag = director.diagnosticsOf(id);
      const sig = JSON.stringify([
        m.currentGoalId ?? null,
        diag.lastFailureDetail ?? null,
        state?.hasLocation ? state.currentLocationId : null,
        run?.nextStepIndex ?? null,
      ]);
      const prev = this.stuck.get(id);
      if (prev && prev.lastSeenSignature === sig) {
        prev.seenCount++;
        if (prev.seenCount >= this.stuckThresholdChecks && prev.reported !== true) {
          prev.reported = true;
          v.push(`STUCK ${id}: signature ${sig} unchanged for ` +
                 `${prev.seenCount} checks (since ${prev.firstSeenMinutes})`);
        }
      } else {
        this.stuck.set(id, {
          agentId: id,
          goalId: m.currentGoalId ?? "",
          ...(diag.lastFailureDetail !== undefined
            ? { lastFailure: diag.lastFailureDetail } : {}),
          ...(state?.hasLocation && state.currentLocationId !== undefined
            ? { locationId: state.currentLocationId } : {}),
          firstSeenMinutes: now,
          seenCount: 1,
          reported: false,
          lastSeenSignature: sig,
        });
      }
    }

    // Self relationships.
    for (const l of town.relationships.all())
      if (l.from === l.to) v.push(`self-relationship ${l.from}`);

    // Belief sanity: hops bounded, confidence in range.
    for (const { owner, store } of town.beliefs.owners())
      for (const b of store.all) {
        if (b.hopCount > 8) v.push(`${owner}: belief hop explosion (${b.hopCount})`);
        if (!(b.confidence >= 0 && b.confidence <= 1))
          v.push(`${owner}: belief confidence out of range`);
      }

    // Memory growth bounded by store capacity.
    for (const owner of town.memory.ownerIds())
      if (town.memory.storeFor(owner).count > 251)
        v.push(`${owner}: memory store exceeded capacity`);

    return { violations: v, checkedAtMinutes: now };
  }
}
