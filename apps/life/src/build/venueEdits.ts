/** Stable, storage-injected venue editor persistence (S46 regression). */
export interface VenueEdit {
  displayName?: string;
  capacity?: number;
  hours?: { openMinuteOfDay: number; closeMinuteOfDay: number };
}
export type VenueEdits = Record<string, VenueEdit>;
export interface VenueEditStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const VENUE_EDITS_KEY = "echosim-life-venues";

export function loadVenueEdits(
  storage?: Pick<VenueEditStorage, "getItem">,
): VenueEdits {
  if (!storage) return {};
  try {
    const raw = storage.getItem(VENUE_EDITS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as VenueEdits;
  } catch {
    return {};
  }
}

export function saveVenueEdits(
  edits: VenueEdits,
  storage?: Pick<VenueEditStorage, "setItem">,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VENUE_EDITS_KEY, JSON.stringify(edits));
    return true;
  } catch {
    return false;
  }
}
