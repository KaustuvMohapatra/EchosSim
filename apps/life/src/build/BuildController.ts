/**
 * Build Mode controller.
 *
 * The current main branch references this file from both the Life bootstrap and
 * the committed Sprint 43/44 tests, but the source file itself is absent. This
 * implementation restores the test-backed contract: grid placement,
 * collision/bounds validation, undo/redo, structural walls/doors/floors and
 * versioned local persistence. It remains presentation-side and engine-free.
 */

export type BuildKind =
  | "chair" | "sofa" | "table" | "bookshelf"
  | "bench" | "bed" | "desk" | "counter"
  | "arcade" | "easel" | "garden" | "noticeboard";

export interface LotBounds { x1: number; z1: number; x2: number; z2: number }

export interface BuildPlacement {
  objectId: string;
  kind: BuildKind;
  lotId: string;
  /** Lot-relative metres. */
  dx: number;
  dz: number;
  /** Quarter turns clockwise. */
  rot: 0 | 1 | 2 | 3;
}

export interface WallSegment {
  wallId: string;
  lotId: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface DoorOpening {
  doorId: string;
  lotId: string;
  x: number;
  z: number;
  axis: "x" | "z";
}

export interface FloorRect {
  floorId: string;
  lotId: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface BuildResult { ok: boolean; reason?: string }

interface BuildSnapshot {
  placements: BuildPlacement[];
  walls: WallSegment[];
  doors: DoorOpening[];
  floors: FloorRect[];
}

interface BuildDocumentV2 extends BuildSnapshot { version: 2 }

const GRID = 0.5;
const DOOR_HALF_WIDTH = 0.75;

const FOOTPRINT: Readonly<Record<BuildKind, { w: number; d: number }>> = {
  chair: { w: 0.8, d: 0.8 },
  sofa: { w: 1.8, d: 0.9 },
  table: { w: 1.2, d: 1.2 },
  bookshelf: { w: 0.45, d: 1.7 },
  bench: { w: 1.8, d: 0.65 },
  bed: { w: 2.0, d: 1.4 },
  desk: { w: 1.4, d: 0.75 },
  counter: { w: 1.3, d: 0.7 },
  arcade: { w: 1.0, d: 0.8 },
  easel: { w: 1.0, d: 0.9 },
  garden: { w: 2.0, d: 1.3 },
  noticeboard: { w: 1.3, d: 0.5 },
};

let nextObjectId = 1;
let nextWallId = 1;
let nextDoorId = 1;
let nextFloorId = 1;

export function resetBuildIds(): void {
  nextObjectId = 1;
  nextWallId = 1;
  nextDoorId = 1;
  nextFloorId = 1;
}

export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export class BuildController {
  private placements: BuildPlacement[] = [];
  private walls: WallSegment[] = [];
  private doors: DoorOpening[] = [];
  private floors: FloorRect[] = [];
  private undoStack: BuildSnapshot[] = [];
  private redoStack: BuildSnapshot[] = [];
  private onChange: () => void;

  constructor(
    private readonly boundsOf: (lotId: string) => LotBounds | undefined,
    private readonly authored: readonly BuildPlacement[] = [],
    onChange: () => void = () => {},
  ) {
    this.onChange = onChange;
  }

  setOnChange(fn: () => void): void { this.onChange = fn; }

  list(): readonly BuildPlacement[] { return this.placements.map(copyPlacement); }
  wallsList(): readonly WallSegment[] { return this.walls.map((x) => ({ ...x })); }
  doorsList(): readonly DoorOpening[] { return this.doors.map((x) => ({ ...x })); }
  floorsList(): readonly FloorRect[] { return this.floors.map((x) => ({ ...x })); }
  get(objectId: string): BuildPlacement | undefined {
    const p = this.placements.find((x) => x.objectId === objectId);
    return p ? copyPlacement(p) : undefined;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  place(kind: BuildKind, lotId: string, worldX: number, worldZ: number): BuildResult {
    const bounds = this.boundsOf(lotId);
    if (!bounds) return fail("Unknown lot.");
    const centre = centreOf(bounds);
    const candidate: BuildPlacement = {
      objectId: `built_${nextObjectId}`,
      kind,
      lotId,
      dx: snap(worldX - centre.x),
      dz: snap(worldZ - centre.z),
      rot: 0,
    };
    const valid = this.validatePlacement(candidate);
    if (!valid.ok) return valid;
    this.recordMutation();
    nextObjectId++;
    this.placements.push(candidate);
    this.changed();
    return ok();
  }

  move(objectId: string, dx: number, dz: number): BuildResult {
    const index = this.placements.findIndex((p) => p.objectId === objectId);
    if (index < 0) return fail("Furniture not found.");
    const candidate: BuildPlacement = {
      ...this.placements[index]!,
      dx: snap(dx),
      dz: snap(dz),
    };
    const valid = this.validatePlacement(candidate, objectId);
    if (!valid.ok) return valid;
    this.recordMutation();
    this.placements[index] = candidate;
    this.changed();
    return ok();
  }

  rotate(objectId: string): BuildResult {
    const index = this.placements.findIndex((p) => p.objectId === objectId);
    if (index < 0) return fail("Furniture not found.");
    const current = this.placements[index]!;
    const candidate: BuildPlacement = {
      ...current,
      rot: ((current.rot + 1) % 4) as 0 | 1 | 2 | 3,
    };
    const valid = this.validatePlacement(candidate, objectId);
    if (!valid.ok) return valid;
    this.recordMutation();
    this.placements[index] = candidate;
    this.changed();
    return ok();
  }

  remove(objectId: string): boolean {
    const index = this.placements.findIndex((p) => p.objectId === objectId);
    if (index < 0) return false;
    this.recordMutation();
    this.placements.splice(index, 1);
    this.changed();
    return true;
  }

  placeWall(lotId: string, worldX1: number, worldZ1: number,
    worldX2: number, worldZ2: number): BuildResult {
    const bounds = this.boundsOf(lotId);
    if (!bounds) return fail("Unknown lot.");
    const centre = centreOf(bounds);
    let x1 = snap(worldX1 - centre.x);
    let z1 = snap(worldZ1 - centre.z);
    let x2 = snap(worldX2 - centre.x);
    let z2 = snap(worldZ2 - centre.z);
    if (Math.abs(x2 - x1) >= Math.abs(z2 - z1)) z2 = z1;
    else x2 = x1;
    if (Math.hypot(x2 - x1, z2 - z1) < GRID) return fail("Wall is too short.");
    if (!relativePointInside(bounds, x1, z1) || !relativePointInside(bounds, x2, z2))
      return fail("Wall must stay inside the lot.");

    this.recordMutation();
    this.walls.push({ wallId: `wall_${nextWallId++}`, lotId, x1, z1, x2, z2 });
    this.changed();
    return ok();
  }

  placeDoor(lotId: string, worldX: number, worldZ: number): BuildResult {
    const bounds = this.boundsOf(lotId);
    if (!bounds) return fail("Unknown lot.");
    const centre = centreOf(bounds);
    const x = snap(worldX - centre.x);
    const z = snap(worldZ - centre.z);
    const match = this.findWallAt(lotId, x, z);
    if (!match) return fail("Place the door on a wall.");

    const wall = this.walls[match.index]!;
    const horizontal = wall.z1 === wall.z2;
    const start = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.z1, wall.z2);
    const end = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.z1, wall.z2);
    const pos = horizontal ? x : z;
    if (pos - DOOR_HALF_WIDTH <= start || pos + DOOR_HALF_WIDTH >= end)
      return fail("Door needs more wall on both sides.");

    this.recordMutation();
    this.walls.splice(match.index, 1);
    if (horizontal) {
      this.walls.push(
        { wallId: `wall_${nextWallId++}`, lotId, x1: start, z1: wall.z1,
          x2: pos - DOOR_HALF_WIDTH, z2: wall.z1 },
        { wallId: `wall_${nextWallId++}`, lotId, x1: pos + DOOR_HALF_WIDTH, z1: wall.z1,
          x2: end, z2: wall.z1 },
      );
    } else {
      this.walls.push(
        { wallId: `wall_${nextWallId++}`, lotId, x1: wall.x1, z1: start,
          x2: wall.x1, z2: pos - DOOR_HALF_WIDTH },
        { wallId: `wall_${nextWallId++}`, lotId, x1: wall.x1, z1: pos + DOOR_HALF_WIDTH,
          x2: wall.x1, z2: end },
      );
    }
    this.doors.push({
      doorId: `door_${nextDoorId++}`,
      lotId,
      x,
      z,
      axis: horizontal ? "x" : "z",
    });
    this.changed();
    return ok();
  }

  addFloorRect(lotId: string, worldX1: number, worldZ1: number,
    worldX2: number, worldZ2: number): BuildResult {
    const bounds = this.boundsOf(lotId);
    if (!bounds) return fail("Unknown lot.");
    const centre = centreOf(bounds);
    const x1 = snap(Math.min(worldX1, worldX2) - centre.x);
    const x2 = snap(Math.max(worldX1, worldX2) - centre.x);
    const z1 = snap(Math.min(worldZ1, worldZ2) - centre.z);
    const z2 = snap(Math.max(worldZ1, worldZ2) - centre.z);
    if (x2 - x1 < GRID || z2 - z1 < GRID) return fail("Floor area is too small.");
    if (!relativePointInside(bounds, x1, z1) || !relativePointInside(bounds, x2, z2))
      return fail("Floor must stay inside the lot.");
    this.recordMutation();
    this.floors.push({ floorId: `floor_${nextFloorId++}`, lotId, x1, z1, x2, z2 });
    this.changed();
    return ok();
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.snapshot());
    this.restore(previous);
    this.changed();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.changed();
    return true;
  }

  serialize(): string {
    const doc: BuildDocumentV2 = { version: 2, ...this.snapshot() };
    return JSON.stringify(doc);
  }

  load(json: string): void {
    // Validate the complete document before touching live Build Mode state.
    // Legacy saves are either a placement array or an unversioned snapshot.
    const parsed: unknown = JSON.parse(json);
    const snapshot = parseBuildSnapshot(parsed, this.boundsOf);
    this.restore(snapshot);
    this.undoStack = [];
    this.redoStack = [];
    resumeCounters(this.placements, this.walls, this.doors, this.floors);
    this.changed();
  }

  private validatePlacement(candidate: BuildPlacement, excludeId?: string): BuildResult {
    const bounds = this.boundsOf(candidate.lotId);
    if (!bounds) return fail("Unknown lot.");
    const box = placementBox(candidate);
    const halfW = (bounds.x2 - bounds.x1) / 2;
    const halfD = (bounds.z2 - bounds.z1) / 2;
    if (box.x1 < -halfW || box.x2 > halfW || box.z1 < -halfD || box.z2 > halfD)
      return fail("Furniture does not fit inside this lot.");

    for (const p of this.placements) {
      if (p.objectId === excludeId || p.lotId !== candidate.lotId) continue;
      if (overlap(box, placementBox(p))) return fail("Furniture would overlap another item.");
    }
    for (const p of this.authored) {
      if (p.lotId !== candidate.lotId) continue;
      if (overlap(box, placementBox(p))) return fail("Furniture would overlap an authored fixture.");
    }
    return ok();
  }

  private findWallAt(lotId: string, x: number, z: number): { index: number } | undefined {
    for (let i = 0; i < this.walls.length; i++) {
      const wall = this.walls[i]!;
      if (wall.lotId !== lotId) continue;
      if (wall.z1 === wall.z2) {
        if (Math.abs(z - wall.z1) <= GRID && between(x, wall.x1, wall.x2)) return { index: i };
      } else if (wall.x1 === wall.x2) {
        if (Math.abs(x - wall.x1) <= GRID && between(z, wall.z1, wall.z2)) return { index: i };
      }
    }
    return undefined;
  }

  private recordMutation(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack = [];
  }

  private snapshot(): BuildSnapshot {
    return {
      placements: this.placements.map(copyPlacement),
      walls: this.walls.map((x) => ({ ...x })),
      doors: this.doors.map((x) => ({ ...x })),
      floors: this.floors.map((x) => ({ ...x })),
    };
  }

  private restore(snapshot: BuildSnapshot): void {
    this.placements = snapshot.placements.map(copyPlacement);
    this.walls = snapshot.walls.map((x) => ({ ...x }));
    this.doors = snapshot.doors.map((x) => ({ ...x }));
    this.floors = snapshot.floors.map((x) => ({ ...x }));
  }

  private changed(): void { this.onChange(); }
}


/** Reject malformed, future, or non-finite build saves before they reach Babylon. */
function parseBuildSnapshot(
  source: unknown,
  boundsOf: (lotId: string) => LotBounds | undefined,
): BuildSnapshot {
  if (!Array.isArray(source) && !isRecord(source)) throw new Error("Invalid Build Mode save.");
  if (!Array.isArray(source) && source.version !== undefined
    && source.version !== 1 && source.version !== 2)
    throw new Error("Unsupported Build Mode save version.");

  const readArray = (value: unknown, label: string): Record<string, unknown>[] => {
    if (!Array.isArray(value) || !value.every(isRecord))
      throw new Error(`Invalid Build Mode ${label}.`);
    return value;
  };
  const data = Array.isArray(source) ? { placements: source } : source;
  const placements = readArray(data.placements ?? [], "placements").map((p) => {
    if (!validId(p.objectId) || !validId(p.lotId)
      || !Object.prototype.hasOwnProperty.call(FOOTPRINT, p.kind)
      || !isFiniteNumber(p.dx) || !isFiniteNumber(p.dz)
      || !Number.isInteger(p.rot) || (p.rot as number) < 0 || (p.rot as number) > 3)
      throw new Error("Invalid Build Mode placement.");
    const bounds = boundsOf(p.lotId as string);
    if (!bounds || !insidePlacement(bounds, p as unknown as BuildPlacement))
      throw new Error("Build Mode placement outside a valid lot.");
    return p as unknown as BuildPlacement;
  });
  const walls = readArray(data.walls ?? [], "walls").map((w) => {
    if (!validId(w.wallId) || !validId(w.lotId)
      || !coordinates(w, "x1", "z1", "x2", "z2"))
      throw new Error("Invalid Build Mode wall.");
    const bounds = boundsOf(w.lotId as string);
    if (!bounds || !relativePointInside(bounds, w.x1 as number, w.z1 as number)
      || !relativePointInside(bounds, w.x2 as number, w.z2 as number)
      || !((w.x1 === w.x2) !== (w.z1 === w.z2)))
      throw new Error("Invalid Build Mode wall geometry.");
    return w as unknown as WallSegment;
  });
  const doors = readArray(data.doors ?? [], "doors").map((d) => {
    if (!validId(d.doorId) || !validId(d.lotId)
      || !coordinates(d, "x", "z") || (d.axis !== "x" && d.axis !== "z"))
      throw new Error("Invalid Build Mode door.");
    const bounds = boundsOf(d.lotId as string);
    if (!bounds || !relativePointInside(bounds, d.x as number, d.z as number))
      throw new Error("Build Mode door outside a valid lot.");
    return d as unknown as DoorOpening;
  });
  const floors = readArray(data.floors ?? [], "floors").map((f) => {
    if (!validId(f.floorId) || !validId(f.lotId)
      || !coordinates(f, "x1", "z1", "x2", "z2")
      || (f.x2 as number) <= (f.x1 as number)
      || (f.z2 as number) <= (f.z1 as number))
      throw new Error("Invalid Build Mode floor.");
    const bounds = boundsOf(f.lotId as string);
    if (!bounds || !relativePointInside(bounds, f.x1 as number, f.z1 as number)
      || !relativePointInside(bounds, f.x2 as number, f.z2 as number))
      throw new Error("Build Mode floor outside a valid lot.");
    return f as unknown as FloorRect;
  });
  for (const [label, rows, key] of [
    ["object", placements, "objectId"],
    ["wall", walls, "wallId"],
    ["door", doors, "doorId"],
    ["floor", floors, "floorId"],
  ] as const) {
    if (new Set(rows.map((row) => row[key])).size !== rows.length)
      throw new Error(`Duplicate Build Mode ${label} identifier.`);
  }
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    const box = placementBox(p);
    if (placements.some((other, j) => i !== j && other.lotId === p.lotId
      && overlap(box, placementBox(other))))
      throw new Error("Overlapping Build Mode placements.");
  }
  return { placements, walls, doors, floors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function coordinates(row: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.every((key) => isFiniteNumber(row[key]));
}
function insidePlacement(bounds: LotBounds, placement: BuildPlacement): boolean {
  const box = placementBox(placement);
  const halfW = (bounds.x2 - bounds.x1) / 2;
  const halfD = (bounds.z2 - bounds.z1) / 2;
  return box.x1 >= -halfW && box.x2 <= halfW && box.z1 >= -halfD && box.z2 <= halfD;
}

function centreOf(bounds: LotBounds): { x: number; z: number } {
  return { x: (bounds.x1 + bounds.x2) / 2, z: (bounds.z1 + bounds.z2) / 2 };
}

function relativePointInside(bounds: LotBounds, x: number, z: number): boolean {
  const halfW = (bounds.x2 - bounds.x1) / 2;
  const halfD = (bounds.z2 - bounds.z1) / 2;
  return x >= -halfW && x <= halfW && z >= -halfD && z <= halfD;
}

function placementBox(p: BuildPlacement): { x1: number; z1: number; x2: number; z2: number } {
  const base = FOOTPRINT[p.kind];
  const swapped = p.rot % 2 !== 0;
  const w = swapped ? base.d : base.w;
  const d = swapped ? base.w : base.d;
  return { x1: p.dx - w / 2, x2: p.dx + w / 2, z1: p.dz - d / 2, z2: p.dz + d / 2 };
}

function overlap(a: { x1: number; z1: number; x2: number; z2: number },
  b: { x1: number; z1: number; x2: number; z2: number }): boolean {
  // Touching edges are fine; an actual positive-area overlap is not.
  return a.x1 < b.x2 && a.x2 > b.x1 && a.z1 < b.z2 && a.z2 > b.z1;
}

function between(v: number, a: number, b: number): boolean {
  return v >= Math.min(a, b) && v <= Math.max(a, b);
}

function copyPlacement(p: BuildPlacement): BuildPlacement { return { ...p }; }
function ok(): BuildResult { return { ok: true }; }
function fail(reason: string): BuildResult { return { ok: false, reason }; }

function numericSuffix(id: string): number {
  const match = id.match(/_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function resumeCounters(placements: readonly BuildPlacement[], walls: readonly WallSegment[],
  doors: readonly DoorOpening[], floors: readonly FloorRect[]): void {
  nextObjectId = Math.max(nextObjectId, 1 + Math.max(0, ...placements.map((x) => numericSuffix(x.objectId))));
  nextWallId = Math.max(nextWallId, 1 + Math.max(0, ...walls.map((x) => numericSuffix(x.wallId))));
  nextDoorId = Math.max(nextDoorId, 1 + Math.max(0, ...doors.map((x) => numericSuffix(x.doorId))));
  nextFloorId = Math.max(nextFloorId, 1 + Math.max(0, ...floors.map((x) => numericSuffix(x.floorId))));
}
