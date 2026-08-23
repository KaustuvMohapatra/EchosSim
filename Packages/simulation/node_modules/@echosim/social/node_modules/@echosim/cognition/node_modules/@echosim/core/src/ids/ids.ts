/**
 * Strongly typed, stable identifiers. Values are authored constants, never
 * derived from display names. Branded string types keep call sites safe while
 * staying JSON-serializable.
 */

type Brand<T, B extends string> = T & { readonly __brand: B };

export type AgentId = Brand<string, "AgentId">;
export type LocationId = Brand<string, "LocationId">;
export type ActionId = Brand<string, "ActionId">;
export type GoalId = Brand<string, "GoalId">;
export type ResourceId = Brand<string, "ResourceId">;
export type ItemId = Brand<string, "ItemId">;

const MAX_LENGTH = 128;

function brand<B extends string>(value: string, label: string): Brand<string, B> {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} value must be a non-empty, non-whitespace string.`);
  if (value.length > MAX_LENGTH)
    throw new Error(`${label} value exceeds ${MAX_LENGTH} characters.`);
  return value as Brand<string, B>;
}

export function AgentId(value: string): AgentId {
  return brand(value, "AgentId");
}
export function LocationId(value: string): LocationId {
  return brand(value, "LocationId");
}
export function ActionId(value: string): ActionId {
  return brand(value, "ActionId");
}
export function GoalId(value: string): GoalId {
  return brand(value, "GoalId");
}
export function ResourceId(value: string): ResourceId {
  return brand(value, "ResourceId");
}
export function ItemId(value: string): ItemId {
  return brand(value, "ItemId");
}

/** Positive integer identifier (memories, events). */
export interface MemoryId {
  readonly value: number;
}
export function MemoryId(value: number): MemoryId {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("MemoryId must be a positive integer.");
  return { value };
}

export interface EventId {
  readonly value: number;
}
export function EventId(value: number): EventId {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("EventId must be a positive integer.");
  return { value };
}

/** Unwrap to the raw string for logging/storage. */
export function idValue(id: Brand<string, never> | string): string {
  return id as string;
}
