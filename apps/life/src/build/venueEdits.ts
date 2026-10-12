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

/** Treat localStorage as untrusted input; keep valid fields from partially corrupt saves. */
export function loadVenueEdits(
  storage?: Pick<VenueEditStorage, "getItem">,
): VenueEdits {
  if (!storage) return {};
  try {
    const raw = storage.getItem(VENUE_EDITS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    const edits: VenueEdits = {};
    for (const [locationId, input] of Object.entries(parsed)) {
      if (!locationId || typeof input !== "object" || input === null || Array.isArray(input)) continue;
      const source = input as Record<string, unknown>;
      const edit: VenueEdit = {};

      if (typeof source.displayName === "string" &&
          source.displayName.trim().length > 0 &&
          source.displayName.length <= 120) {
        edit.displayName = source.displayName;
      }
      if (typeof source.capacity === "number" &&
          Number.isSafeInteger(source.capacity) && source.capacity > 0) {
        edit.capacity = source.capacity;
      }
      if (typeof source.hours === "object" && source.hours !== null &&
          !Array.isArray(source.hours)) {
        const hours = source.hours as Record<string, unknown>;
        const open = hours.openMinuteOfDay;
        const close = hours.closeMinuteOfDay;
        if (typeof open === "number" && Number.isInteger(open) && open >= 0 && open < 1440 &&
            typeof close === "number" && Number.isInteger(close) && close >= 0 && close < 1440) {
          edit.hours = { openMinuteOfDay: open, closeMinuteOfDay: close };
        }
      }

      if (Object.keys(edit).length > 0) edits[locationId] = edit;
    }
    return edits;
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
