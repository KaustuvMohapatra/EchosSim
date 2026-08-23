export class UnsupportedSaveVersionException extends Error {
  constructor(public readonly foundVersion: number) {
    super(`Save schema version ${foundVersion} is not supported by this build.`);
    this.name = "UnsupportedSaveVersionException";
  }
}

export function migrateToCurrent(data: { SchemaVersion: number }): void {
  if (data.SchemaVersion > 1)
    throw new UnsupportedSaveVersionException(data.SchemaVersion);
}
