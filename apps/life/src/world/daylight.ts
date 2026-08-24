/** Time-of-day lighting model (Sprint 56): pure function of clock minutes. */
export interface DaylightParams {
  /** Sun elevation factor 0..1 (1 = noon). */
  elevation: number;
  sunIntensity: number;
  hemiIntensity: number;
  /** Warm at golden hours, neutral midday, cool dark blue at night. */
  sunColor: [number, number, number];
  nightFactor: number;
}

/** minuteOfDay in [0,1440). Deterministic and continuous-ish. */
export function daylightParams(minuteOfDay: number): DaylightParams {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  // Solar phase: sunrise 06:00, sunset 20:00.
  const t = (m - 360) / (840); // 0..1 across daytime
  const day = m >= 360 && m <= 1200;
  const elevation = day
    ? Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, t))))
    : 0;

  const golden = day && (m < 480 || m > 1080);
  const night = !day;

  const r = night ? 0.45 : golden ? 1.0 : 1.0;
  const g = night ? 0.52 : golden ? 0.72 : 0.96;
  const b = night ? 0.75 : golden ? 0.55 : 0.88;

  return {
    elevation,
    sunIntensity: night ? 0.12 : 0.35 + 0.8 * elevation,
    hemiIntensity: night ? 0.28 : 0.55 + 0.3 * elevation,
    sunColor: [r, g, b],
    nightFactor: night ? 1 : 1 - elevation,
  };
}
