/** Current persisted schema. Keep version checks aligned with saveLoad.ts. */
export const SUPPORTED_SAVE_VERSION = 3;

export class UnsupportedSaveVersionException extends Error {
  constructor(public readonly foundVersion: number) {
    super(`Save schema version ${foundVersion} is not supported by this build.`);
    this.name = "UnsupportedSaveVersionException";
  }
}

/** Reject unknown or future schemas before the restore mutates a town. */
export function migrateToCurrent(data: { SchemaVersion: number }): void {
  if (!Number.isInteger(data.SchemaVersion) ||
      data.SchemaVersion < 1 ||
      data.SchemaVersion > SUPPORTED_SAVE_VERSION)
    throw new UnsupportedSaveVersionException(data.SchemaVersion);
}
