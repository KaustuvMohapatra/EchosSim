/** Needs: 0 = satisfied, 100 = critical; linear hourly growth; thresholds ordered survival-first. */
import type { SimDuration } from "@echosim/core";

export enum NeedKind {
  Hunger = 0, Energy = 1, Social = 2, Fun = 3,
  Comfort = 4, Hygiene = 5, Safety = 6,
}

export interface NeedDefinition {
  readonly kind: NeedKind;
  readonly growthPerSimHour: number;
  readonly satisfactionThreshold: number;
  readonly criticalThreshold: number;
  readonly interruptThreshold: number;
}

function def(kind: NeedKind, growthPerSimHour: number, satisfactionThreshold: number,
             criticalThreshold: number, interruptThreshold: number): NeedDefinition {
  if (growthPerSimHour < 0) throw new Error("growth must be >= 0");
  if (satisfactionThreshold < 0 || satisfactionThreshold > 100) throw new Error("satisfaction out of range");
  if (criticalThreshold <= satisfactionThreshold || criticalThreshold > 100)
    throw new Error("Must satisfy SatisfactionThreshold < CriticalThreshold <= 100.");
  if (interruptThreshold < criticalThreshold || interruptThreshold > 100)
    throw new Error("Must satisfy CriticalThreshold <= InterruptThreshold <= 100.");
  return { kind, growthPerSimHour, satisfactionThreshold, criticalThreshold, interruptThreshold };
}

export function standardNeedLibrary(): NeedDefinition[] {
  return [
    def(NeedKind.Hunger, 3.5, 30, 80, 92),
    def(NeedKind.Energy, 2.8, 22, 85, 95),
    def(NeedKind.Social, 1.9, 25, 75, 93),
    def(NeedKind.Fun, 2.4, 30, 78, 97),
    def(NeedKind.Comfort, 1.4, 35, 72, 96),
    def(NeedKind.Hygiene, 1.7, 32, 79, 96),
    def(NeedKind.Safety, 0.9, 40, 82, 98),
  ];
}

const clamp = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

export class NeedState {
  current = 20;
  constructor(readonly definition: NeedDefinition, initial?: number) {
    if (initial !== undefined) this.current = clamp(initial);
  }
  advance(delta: SimDuration): void {
    const h = delta.totalMinutes / 60.0;
    this.current = clamp(this.current + this.definition.growthPerSimHour * h);
  }
  apply(amount: number): void { this.current = clamp(this.current - amount); }
  force(value: number): void { this.current = clamp(value); }
  get isSatisfied(): boolean { return this.current <= this.definition.satisfactionThreshold; }
  get isCritical(): boolean { return this.current >= this.definition.criticalThreshold; }
  get shouldInterrupt(): boolean { return this.current >= this.definition.interruptThreshold; }
  get normalized(): number { return this.current / 100; }
}

export class NeedSet {
  private readonly needs = new Map<NeedKind, NeedState>();
  constructor(definitions: readonly NeedDefinition[], initialValues?: Partial<Record<NeedKind, number>>) {
    for (const d of definitions) this.needs.set(d.kind, new NeedState(d, initialValues?.[d.kind]));
  }
  get(kind: NeedKind): NeedState {
    const s = this.needs.get(kind);
    if (!s) throw new Error(`No need '${kind}' in this set.`);
    return s;
  }
  all(): NeedState[] { return [...this.needs.values()]; }
  advance(delta: SimDuration): void { for (const n of this.needs.values()) n.advance(delta); }
  relieve(kind: NeedKind, amount: number): void { this.get(kind).apply(amount); }
  force(kind: NeedKind, value: number): void { this.get(kind).force(value); }
  mostUrgent(): NeedState | null {
    let best: NeedState | null = null;
    for (const n of this.needs.values()) if (!best || n.current > best.current) best = n;
    return best;
  }
  findInterrupting(): NeedState | null {
    let best: NeedState | null = null;
    for (const n of this.needs.values())
      if (n.shouldInterrupt && (!best || n.current > best.current)) best = n;
    return best;
  }
}
