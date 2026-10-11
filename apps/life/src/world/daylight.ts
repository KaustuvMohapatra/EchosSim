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

const DAY_START = 360;
const DAY_END = 1200;
const TWILIGHT_MINUTES = 30;

/** Interpolate smoothly without introducing frame- or wall-clock state. */
function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Deterministic, periodic lighting with continuous sunrise/sunset transitions. */
export function daylightParams(minuteOfDay: number): DaylightParams {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const daytime = m >= DAY_START && m <= DAY_END;
  const t = (m - DAY_START) / (DAY_END - DAY_START);
  const elevation = daytime ? Math.max(0, Math.sin(Math.PI * t)) : 0;

  // Fade artificial night illumination into daylight over a short twilight.
  // At sunrise/sunset the original implementation jumped between branches.
  const daylightBlend = smoothstep(DAY_START, DAY_START + TWILIGHT_MINUTES, m)
    * (1 - smoothstep(DAY_END - TWILIGHT_MINUTES, DAY_END, m));

  // Warm light in the morning/evening, cooler neutral daylight at noon.
  const golden = 1 - smoothstep(420, 540, m) *
    (1 - smoothstep(1020, 1140, m));
  const dayG = lerp(0.96, 0.72, golden);
  const dayB = lerp(0.88, 0.55, golden);

  return {
    elevation,
    sunIntensity: lerp(0.12, 0.35 + 0.8 * elevation, daylightBlend),
    hemiIntensity: lerp(0.28, 0.55 + 0.3 * elevation, daylightBlend),
    sunColor: [
      lerp(0.45, 1.0, daylightBlend),
      lerp(0.52, dayG, daylightBlend),
      lerp(0.75, dayB, daylightBlend),
    ],
    nightFactor: 1 - daylightBlend * elevation,
  };
}
