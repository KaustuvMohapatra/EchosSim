/**
 * Level-of-detail control (Sprint 26). The host decides which residents get
 * full cognition and which are simulated coarsely or left dormant; the
 * planning director consults this controller each tick. Assignment is host
 * state, so determinism is preserved: identical configurations produce
 * identical simulations. Critical needs always bypass throttling.
 */

export enum LodLevel {
  /** Fully active: normal planning/execution every tick. */
  Full = 0,
  /** Active but less frequent planning (staggered by cadence). */
  Reduced = 1,
  /** Coarse: no autonomous planning while idle; existing runs finish. */
  Coarse = 2,
  /** Dormant: only needs growth and critical interrupts reach them. */
  Dormant = 3,
}

export class LodController {
  private readonly levels = new Map<string, LodLevel>();
  /** Minutes between planning attempts for Reduced residents. */
  reducedCadenceMinutes = 30;

  setLevel(agentId: string, level: LodLevel): void {
    if (level === LodLevel.Full) this.levels.delete(agentId);
    else this.levels.set(agentId, level);
  }

  levelOf(agentId: string): LodLevel {
    return this.levels.get(agentId) ?? LodLevel.Full;
  }

  counts(): Record<"full" | "reduced" | "coarse" | "dormant", number> {
    const c = { full: 0, reduced: 0, coarse: 0, dormant: 0 };
    for (const v of this.levels.values()) {
      if (v === LodLevel.Reduced) c.reduced++;
      else if (v === LodLevel.Coarse) c.coarse++;
      else if (v === LodLevel.Dormant) c.dormant++;
    }
    return c;
  }
}
