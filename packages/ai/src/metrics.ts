/** Provider call metrics (spec 21.7). Cheap counters; snapshot for inspection. */
import type { AiFailureKind } from "./types.js";

export interface AiMetricsSnapshot {
  calls: number;
  success: number;
  failure: number;
  fallback: number;
  cacheHits: number;
  totalLatencyMs: number;
  worstLatencyMs: number;
  failuresByKind: Record<string, number>;
}

export class AiMetrics {
  calls = 0;
  success = 0;
  failure = 0;
  fallback = 0;
  cacheHits = 0;
  totalLatencyMs = 0;
  worstLatencyMs = 0;
  readonly failuresByKind = new Map<AiFailureKind | "disabled", number>();

  recordCall(): void { this.calls++; }

  recordSuccess(latencyMs: number): void {
    this.success++;
    this.totalLatencyMs += latencyMs;
    if (latencyMs > this.worstLatencyMs) this.worstLatencyMs = latencyMs;
  }

  recordFailure(kind: AiFailureKind): void {
    this.failure++;
    this.failuresByKind.set(kind, (this.failuresByKind.get(kind) ?? 0) + 1);
  }

  recordFallback(): void { this.fallback++; }
  recordCacheHit(): void { this.cacheHits++; }
  recordDisabled(): void {
    this.failuresByKind.set("disabled", (this.failuresByKind.get("disabled") ?? 0) + 1);
  }

  snapshot(): AiMetricsSnapshot {
    return {
      calls: this.calls,
      success: this.success,
      failure: this.failure,
      fallback: this.fallback,
      cacheHits: this.cacheHits,
      totalLatencyMs: Math.round(this.totalLatencyMs),
      worstLatencyMs: Math.round(this.worstLatencyMs),
      failuresByKind: Object.fromEntries(this.failuresByKind),
    };
  }
}
