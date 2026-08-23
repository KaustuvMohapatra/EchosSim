export function migrateToCurrent(data: { SchemaVersion: number }): void {
  if (data.SchemaVersion > 1)
    throw new Error(`Save schema version ${data.SchemaVersion} is not supported by this build.`);
}
