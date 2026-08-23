/**
 * Deterministic random source: SplitMix64, fully specified bit-for-bit across
 * platforms (BigInt arithmetic keeps 64-bit multiplies exact). Identical seeds
 * produce identical sequences in every runtime — and identically to the
 * original .NET implementation of EchoSim.
 */

export interface SimRandom {
  nextUint64(): bigint;
  /** [0,1) with 53-bit precision. */
  nextDouble(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): void;
}

const MASK64 = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;
const MULT1 = 0xbf58476d1ce4e5b9n;
const MULT2 = 0x94d049bb133111ebn;

function mix64(value: bigint): bigint {
  let z = value & MASK64;
  z = ((z ^ (z >> 30n)) * MULT1) & MASK64;
  z = ((z ^ (z >> 27n)) * MULT2) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

export class SeededRandom implements SimRandom {
  private state: bigint;

  constructor(seed: bigint | number) {
    this.state = typeof seed === "bigint" ? seed & MASK64 : BigInt(Math.floor(seed)) & MASK64;
  }

  static mix(value: bigint): bigint {
    return mix64(value);
  }

  nextUint64(): bigint {
    this.state = (this.state + GOLDEN) & MASK64;
    return mix64(this.state);
  }

  nextDouble(): number {
    return Number(this.nextUint64() >> 11n) / 9007199254740992.0; // 2^53
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive))
      throw new Error("nextInt bounds must be integers.");
    if (maxExclusive <= minInclusive)
      throw new Error("maxExclusive must be greater than minInclusive.");
    const range = maxExclusive - minInclusive;
    if (range === 1) return minInclusive;
    const limit = (1n << 64n) - ((1n << 64n) % BigInt(range));
    let v = this.nextUint64();
    while (v >= limit) v = this.nextUint64();
    return minInclusive + Number(v % BigInt(range));
  }

  chance(probability: number): boolean {
    if (Number.isNaN(probability)) throw new Error("probability must be a number.");
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextDouble() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty collection.");
    return items[this.nextInt(0, items.length)] as T;
  }

  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
  }
}

/** Canonical stream names used across the simulation. */
export const RandomStreams = {
  World: "world",
  Agents: "agents",
  Events: "events",
  Social: "social",
  Content: "content",
} as const;

/** FNV-1a over UTF-16 code units (matches the .NET char iteration). */
export function fnv1a64(text: string): bigint {
  const offset = 14695981039346656037n;
  const prime = 1099511628211n;
  let hash = offset;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & MASK64;
  }
  return hash;
}

/**
 * Derives independent, reproducible named streams from one master seed.
 * Adding a consumer stream never perturbs any other system's sequence.
 */
export class SimRandomProvider {
  private readonly streams = new Map<string, SimRandom>();

  constructor(readonly masterSeed: bigint | number) {}

  getStream(name: string): SimRandom {
    const existing = this.streams.get(name);
    if (existing) return existing;
    const created = createStream(this.masterSeed, name);
    this.streams.set(name, created);
    return created;
  }
}

export function createStream(masterSeed: bigint | number, streamName: string): SimRandom {
  if (!streamName || streamName.trim().length === 0)
    throw new Error("Stream name required.");
  const seedBigInt =
    typeof masterSeed === "bigint" ? masterSeed : BigInt(Math.floor(masterSeed));
  return new SeededRandom(mix64(seedBigInt ^ fnv1a64(streamName)));
}
