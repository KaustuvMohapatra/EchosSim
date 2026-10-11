/** Ambience audio settings (Sprint 57): persisted, gesture-gated playback. */
export interface AmbienceSettings {
  enabled: boolean;
  volume: number; // 0..1
}

const KEY = "echosim-life-ambience";
export const DEFAULT_SETTINGS: AmbienceSettings = { enabled: false, volume: 0.4 };

function clamp01(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function loadSettings(storage?: {
  getItem(k: string): string | null; setItem(k: string, v: string): void;
}): AmbienceSettings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { ...DEFAULT_SETTINGS };
    const settings = parsed as Partial<AmbienceSettings>;
    return {
      enabled: typeof settings.enabled === "boolean"
        ? settings.enabled : DEFAULT_SETTINGS.enabled,
      volume: typeof settings.volume === "number"
        ? clamp01(settings.volume, DEFAULT_SETTINGS.volume) : DEFAULT_SETTINGS.volume,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: AmbienceSettings, storage?: {
  getItem(k: string): string | null; setItem(k: string, v: string): void;
}): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify({
      enabled: s.enabled === true,
      volume: clamp01(s.volume, DEFAULT_SETTINGS.volume),
    }));
  } catch { /* ignore */ }
}

/**
 * Gain envelope per weather/time state. Presentation-only; the simulation's
 * weather system remains the single source of truth.
 */
export function ambienceGain(settings: AmbienceSettings,
  weatherState: number, isNight: boolean): number {
  if (!settings.enabled) return 0;
  const volume = clamp01(settings.volume, DEFAULT_SETTINGS.volume);
  const base = volume * 0.25;
  if (Number.isFinite(weatherState) && weatherState >= 2)
    return base + volume * 0.2; // rain layers up
  if (isNight) return base * 0.4; // quiet nights
  return base;
}
