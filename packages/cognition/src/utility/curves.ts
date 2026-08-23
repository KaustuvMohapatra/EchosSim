/** Normalized utility curves: inputs clamped to [0,1]; outputs finite by construction. */

export abstract class UtilityCurve {
  abstract evaluate(input01: number): number;
  abstract toString(): string;
  protected static clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
  protected static guard(value: number, curve: string): number {
    if (Number.isNaN(value) || !Number.isFinite(value))
      throw new Error(`Utility curve '${curve}' produced a non-finite value.`);
    return value;
  }
}

export class LinearCurve extends UtilityCurve {
  evaluate(input01: number): number { return UtilityCurve.guard(UtilityCurve.clamp01(input01), "linear"); }
  toString(): string { return "linear"; }
}

export class QuadraticCurve extends UtilityCurve {
  constructor(private readonly exponent = 2) {
    super();
    if (exponent < 0.25 || exponent > 8) throw new Error("exponent out of range");
  }
  evaluate(input01: number): number {
    return UtilityCurve.guard(Math.pow(UtilityCurve.clamp01(input01), this.exponent), "quadratic");
  }
  toString(): string { return `quadratic^${this.exponent}`; }
}

export class LogisticCurve extends UtilityCurve {
  constructor(private readonly midpoint = 0.6, private readonly steepness = 10) {
    super();
    if (midpoint <= 0 || midpoint >= 1) throw new Error("midpoint in (0,1)");
    if (steepness < 1 || steepness > 30) throw new Error("steepness out of range");
  }
  evaluate(input01: number): number {
    const x = UtilityCurve.clamp01(input01);
    return UtilityCurve.guard(1 / (1 + Math.exp(-this.steepness * (x - this.midpoint))), "logistic");
  }
  toString(): string { return `logistic(${this.midpoint})`; }
}

export class InverseCurve extends UtilityCurve {
  evaluate(input01: number): number { return UtilityCurve.guard(1 - UtilityCurve.clamp01(input01), "inverse"); }
  toString(): string { return "inverse"; }
}

export class ThresholdCurve extends UtilityCurve {
  private static readonly SOFTNESS = 0.05;
  constructor(private readonly edge: number) {
    super();
    if (edge < ThresholdCurve.SOFTNESS || edge > 1 - ThresholdCurve.SOFTNESS)
      throw new Error("edge out of range");
  }
  evaluate(input01: number): number {
    const x = UtilityCurve.clamp01(input01);
    let t = (x - (this.edge - ThresholdCurve.SOFTNESS)) / (2 * ThresholdCurve.SOFTNESS);
    t = UtilityCurve.clamp01(t);
    return UtilityCurve.guard(t * t * (3 - 2 * t), "threshold");
  }
  toString(): string { return `threshold@${this.edge}`; }
}
