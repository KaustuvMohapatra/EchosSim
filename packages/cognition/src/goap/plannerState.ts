/** Compact planner world state with canonical sorted-key FNV-1a hashing. */
import { fnv1a64 } from "@echosim/core";

export interface FactCondition {
  key: string;
  atLeast: boolean;
  value: number;
}

export const atLeast = (key: string, value = 1): FactCondition => ({ key, atLeast: true, value });
export const trueFact = (key: string): FactCondition => ({ key, atLeast: true, value: 1 });
export const atMost = (key: string, value: number): FactCondition => ({ key, atLeast: false, value });

export type FactEffect =
  | { mode: "assign"; key: string; value: number }
  | { mode: "add"; key: string; delta: number };

export const setTrue = (key: string): FactEffect => ({ mode: "assign", key, value: 1 });
export const setFalse = (key: string): FactEffect => ({ mode: "assign", key, value: 0 });
export const assign = (key: string, value: number): FactEffect => ({ mode: "assign", key, value });
export const addDelta = (key: string, delta: number): FactEffect => ({ mode: "add", key, delta });

export class PlannerWorldState {
  private readonly facts = new Map<string, number>();

  clone(): PlannerWorldState {
    const copy = new PlannerWorldState();
    for (const [k, v] of this.facts) copy.facts.set(k, v);
    return copy;
  }
  get(key: string): number { return this.facts.get(key) ?? 0; }
  set(key: string, value: number): void { this.facts.set(key, value); }
  isTrue(key: string): boolean { return this.get(key) > 0; }

  satisfiesAll(conditions: readonly FactCondition[]): boolean {
    return conditions.every((c) =>
      c.atLeast ? this.get(c.key) >= c.value : this.get(c.key) <= c.value);
  }

  apply(effect: FactEffect): void {
    if (effect.mode === "assign") this.set(effect.key, effect.value);
    else this.set(effect.key, this.get(effect.key) + effect.delta);
  }
  applyAll(effects: readonly FactEffect[]): void {
    for (const e of effects) this.apply(e);
  }

  computeHash(): string {
    const MASK = (1n << 64n) - 1n;
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (const key of [...this.facts.keys()].sort()) {
      for (let i = 0; i < key.length; i++) {
        hash ^= BigInt(key.charCodeAt(i));
        hash = (hash * prime) & MASK;
      }
      hash ^= 61n; hash = (hash * prime) & MASK;
      const v = String(this.facts.get(key)!);
      for (let i = 0; i < v.length; i++) {
        hash ^= BigInt(v.charCodeAt(i));
        hash = (hash * prime) & MASK;
      }
      hash ^= 59n; hash = (hash * prime) & MASK;
    }
    return hash.toString();
  }
}
