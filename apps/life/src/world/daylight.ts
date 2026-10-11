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

const DAY_MINUTES = 1440;
const SUNRISE = 360;
const SUNSET = 1200;
const TWILIGHT_MINUTES = 45;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Continuous, zero-slope interpolation at both ends. */
function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * The twilight envelope avoids discontinuities at 06:00 and 20:00.
 * Ramps are symmetric and periodic across midnight.
 */
export function daylightParams(minuteOfDay: number): DaylightParams {
  if (!Number.isFinite(minuteOfDay)) {
    throw new RangeError("minuteOfDay must be finite");
  }
  const m = ((minuteOfDay % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const dawn = smoothstep((m - (SUNRISE - TWILIGHT_MINUTES)) / (2 * TWILIGHT_MINUTES));
  const dusk = 1 - smoothstep((m - (SUNSET - TWILIGHT_MINUTES)) / (2 * TWILIGHT_MINUTES));
  const daylight = dawn * dusk;

  const solarProgress = clamp01((m - SUNRISE) / (SUNSET - SUNRISE));
  const elevation = Math.max(0, Math.sin(Math.PI * solarProgress)) * daylight;
  const goldenWeight = daylight * (1 - smoothstep(elevation / 0.40));

  const nightColor: readonly number[] = [0.45, 0.52, 0.75];
  const dayColor: readonly number[] = [1.0, 0.96, 0.88];
  const goldenColor: readonly number[] = [1.0, 0.72, 0.55];
  const sunColor = dayColor.map((channel, index) =>
    mix(mix(nightColor[index]!, channel, daylight), goldenColor[index]!, goldenWeight),
  ) as [number, number, number];

  return {
    elevation,
    sunIntensity: mix(0.12, 0.35 + 0.8 * elevation, daylight),
    hemiIntensity: mix(0.28, 0.55 + 0.3 * elevation, daylight),
    sunColor,
    nightFactor: 1 - elevation,
  };
}
