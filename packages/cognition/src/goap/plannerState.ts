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
  /** Lazily maintained sorted key order (invalidated on new-key insertion). */
  private sortedKeys: string[] | null = null;

  clone(): PlannerWorldState {
    const copy = new PlannerWorldState();
    for (const [k, v] of this.facts) copy.facts.set(k, v);
    // Sorted order can be shared safely: both maps have identical keys and
    // the array is regenerated if either side ever inserts a new key.
    copy.sortedKeys = this.sortedKeys;
    return copy;
  }
  get(key: string): number { return this.facts.get(key) ?? 0; }
  set(key: string, value: number): void {
    if (!this.facts.has(key)) {
      this.facts.set(key, value);
      this.sortedKeys = null;
    } else {
      this.facts.set(key, value);
    }
  }
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

  /**
   * Canonical content hash. Two-lane 32-bit rolling hash over the sorted
   * key/value stream (Sprint 27: replaced per-call BigInt FNV — 40x faster,
   * identical determinism semantics for identical content).
   */
  computeHash(): string {
    const keys = this.sortedKeys ?? (this.sortedKeys = [...this.facts.keys()].sort());
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      for (let j = 0; j < k.length; j++) {
        const ch = k.charCodeAt(j);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ 61, 2654435761) ^ (h2 >>> 15);
      const v = this.facts.get(k)!;
      const vs = `${v}`;
      for (let j = 0; j < vs.length; j++) {
        const ch = vs.charCodeAt(j);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h2 = Math.imul(h2 ^ 59, 1597334677) ^ (h1 >>> 13);
    }
    h1 = (h1 ^ (h2 >>> 16)) >>> 0;
    h2 = (h2 ^ (h1 * 5)) >>> 0;
    return `${h1.toString(36)}${h2.toString(36)}`;
  }
}
