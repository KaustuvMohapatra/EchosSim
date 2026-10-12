/** Ambience audio settings (Sprint 57): persisted, gesture-gated playback. */
export interface AmbienceSettings {
  enabled: boolean;
  volume: number; // 0..1
}

const KEY = "echosim-life-ambience";
export const DEFAULT_SETTINGS: AmbienceSettings = { enabled: false, volume: 0.4 };

export function loadSettings(storage?: {
  getItem(k: string): string | null; setItem(k: string, v: string): void;
}): AmbienceSettings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<AmbienceSettings>;
    return {
      enabled: !!p.enabled,
      volume: finiteVolume(p.volume, DEFAULT_SETTINGS.volume),
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: AmbienceSettings, storage?: {
  getItem(k: string): string | null; setItem(k: string, v: string): void;
}): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify({
      enabled: !!s.enabled,
      volume: finiteVolume(s.volume, DEFAULT_SETTINGS.volume),
    }));
  } catch { /* ignore */ }
}

function finiteVolume(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

/**
 * Gain envelope per weather/time state. Presentation-only; the simulation's
 * weather system remains the single source of truth.
 */
export function ambienceGain(settings: AmbienceSettings,
  weatherState: number, isNight: boolean): number {
  if (!settings.enabled) return 0;
  const volume = finiteVolume(settings.volume);
  const base = volume * 0.25;
  if (weatherState >= 2) return base + volume * 0.2; // rain layers up
  if (isNight) return base * 0.4;                              // quiet nights
  return base;
}
