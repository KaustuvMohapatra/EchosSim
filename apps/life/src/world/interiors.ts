/**
 * Building interiors (Sprint 42): data-driven rooms/walls/doors per authored
 * lot. Engine-free geometry so it is testable; Babylon renders wall boxes.
 */

export type RoomType =
  | "Bedroom" | "Kitchen" | "Bathroom" | "LivingRoom" | "Office"
  | "Cafe" | "ShopFloor" | "Library" | "Studio" | "Outdoor";

export interface RoomDef {
  roomId: string;
  lotId: string;
  type: RoomType;
  /** Footprint-relative bounds (metres, centred on 0 like layout offsets). */
  x1: number; z1: number; x2: number; z2: number;
  privacy: "Public" | "Guests" | "Household" | "OwnerOnly";
}

export interface WallSegment {
  id: string;
  lotId: string;
  x1: number; z1: number; x2: number; z2: number;
}

export interface DoorPlacement {
  id: string;
  lotId: string;
  x: number; z: number;
  /** Doors sit on an axis-aligned wall. */
  horizontal: boolean;
  width: number;
}

export interface InteriorDef {
  lotId: string;
  rooms: RoomDef[];
  walls: WallSegment[];
  doors: DoorPlacement[];
}

type Rect = { x1: number; z1: number; x2: number; z2: number };

/** Builds a rectangular wall ring of `thickness` with door gaps at `doors`. */
function ring(lotId: string, r: Rect, thickness: number,
  doors: Array<{ x: number; z: number; width: number }>,
  prefix: string): { walls: WallSegment[]; doorPlacements: DoorPlacement[] } {
  const walls: WallSegment[] = [];
  const T = thickness / 2;

  const spanWithGaps = (
    ax: number, az: number, bx: number, bz: number,
    horizontal: boolean,
    gaps: typeof doors,
  ): void => {
    // Collect gaps along the running axis.
    const axis = horizontal
      ? gaps.map((g) => ({ at: g.x - Math.min(ax, bx), w: g.width }))
      : gaps.map((g) => ({ at: g.z - Math.min(az, bz), w: g.width }));
    axis.sort((p, q) => p.at - q.at);

    let cursor = 0;
    const length = horizontal ? Math.abs(bx - ax) : Math.abs(bz - az);
    const pieces: Array<{ from: number; to: number }> = [];
    for (const g of axis) {
      const from = Math.max(0, g.at - g.w / 2);
      if (from > cursor) pieces.push({ from: cursor, to: from });
      cursor = Math.min(length, g.at + g.w / 2);
    }
    if (cursor < length) pieces.push({ from: cursor, to: length });

    for (const p of pieces) {
      if (horizontal) {
        const x1 = Math.min(ax, bx) + p.from;
        walls.push({ id: `${prefix}-h${walls.length}`, lotId,
          x1, z1: az - T, x2: Math.min(ax, bx) + p.to, z2: az + T });
      } else {
        const z1 = Math.min(az, bz) + p.from;
        walls.push({ id: `${prefix}-v${walls.length}`, lotId,
          x1: ax - T, z1, x2: ax + T, z2: Math.min(az, bz) + p.to });
      }
    }
  };

  const top = doors.filter((d) => Math.abs(d.z - r.z1) < 0.6);
  const bottom = doors.filter((d) => Math.abs(d.z - r.z2) < 0.6);
  const left = doors.filter((d) => Math.abs(d.x - r.x1) < 0.6);
  const right = doors.filter((d) => Math.abs(d.x - r.x2) < 0.6);

  spanWithGaps(r.x1, r.z1, r.x2, r.z1, true, top);
  spanWithGaps(r.x1, r.z2, r.x2, r.z2, true, bottom);
  spanWithGaps(r.x1, r.z1, r.x1, r.z2, false, left);
  spanWithGaps(r.x2, r.z1, r.x2, r.z2, false, right);

  const doorPlacements: DoorPlacement[] = doors.map((d, i) => ({
    id: `${prefix}-door${i}`, lotId,
    x: d.x, z: d.z,
    horizontal: Math.abs(d.z - r.z1) < 0.6 || Math.abs(d.z - r.z2) < 0.6,
    width: d.width,
  }));

  return { walls, doorPlacements };
}

/** Authored interiors for social lots and homes (compact starters). */
export function buildInteriors(): Map<string, InteriorDef> {
  const out = new Map<string, InteriorDef>();

  const addLot = (
    lotId: string,
    outer: Rect,
    dividers: Array<Rect & { roomA: Omit<RoomDef, "lotId" | "x1" | "z1" | "x2" | "z2">;
                            roomB: Omit<RoomDef, "lotId" | "x1" | "z1" | "x2" | "z2"> }>,
    entranceDoor: { x: number; z: number },
  ): void => {
    const { walls, doorPlacements } =
      ring(lotId, outer, 0.35,
        [{ x: entranceDoor.x, z: entranceDoor.z, width: 1.8 }], lotId);
    const rooms: RoomDef[] = [];
    for (const d of dividers) {
      rooms.push({ ...d.roomA, lotId,
        x1: outer.x1, z1: outer.z1, x2: d.x2, z2: outer.z2 });
      rooms.push({ ...d.roomB, lotId,
        x1: d.x1, z1: d.z1, x2: outer.x2, z2: outer.z2 });
      // Divider: two vertical segments leaving a centred doorway gap.
      const T = 0.15;
      const midZ = (d.z1 + d.z2) / 2;
      const gap = 0.7;
      walls.push({ id: `${lotId}-div-${rooms.length}-a`, lotId,
        x1: d.x1 - T, z1: d.z1, x2: d.x1 + T, z2: midZ - gap });
      walls.push({ id: `${lotId}-div-${rooms.length}-b`, lotId,
        x1: d.x1 - T, z1: midZ + gap, x2: d.x1 + T, z2: d.z2 });
      doorPlacements.push({ id: `${lotId}-div-door-${rooms.length}`, lotId,
        x: d.x1, z: midZ, horizontal: false, width: gap * 2 });
    }
    rooms.push({
      roomId: `${lotId}_outdoor`, lotId, type: "Outdoor",
      x1: outer.x1 - 3, z1: outer.z2, x2: outer.x2 + 3, z2: outer.z2 + 4,
      privacy: "Public",
    });
    out.set(lotId, { lotId, rooms, walls, doors: doorPlacements });
  };

  addLot("cafe", { x1: -7, z1: -5.5, x2: 7, z2: 5.5 }, [
    { x1: 2.5, z1: -5.5, x2: 2.5, z2: 5.5,
      roomA: { roomId: "cafe_floor", type: "Cafe", privacy: "Public" },
      roomB: { roomId: "cafe_kitchen", type: "Kitchen", privacy: "Staff" } },
  ], { x: -7, z: 0 });

  addLot("library", { x1: -8, z1: -6, x2: 8, z2: 6 }, [
    { x1: 3, z1: -6, x2: 3, z2: 6,
      roomA: { roomId: "lib_reading", type: "Library", privacy: "Public" },
      roomB: { roomId: "lib_office", type: "Office", privacy: "Staff" } },
  ], { x: -8, z: 4 });

  addLot("studio", { x1: -8, z1: -6, x2: 8, z2: 6 }, [
    { x1: 0, z1: -6, x2: 0, z2: 6,
      roomA: { roomId: "studio_main", type: "Studio", privacy: "Guests" },
      roomB: { roomId: "studio_meeting", type: "Office", privacy: "Household" } },
  ], { x: -8, z: 2 });

  addLot("apt_a", { x1: -9, z1: -7, x2: 9, z2: 7 }, [
    { x1: 1, z1: -7, x2: 1, z2: 7,
      roomA: { roomId: "apt_a_living", type: "LivingRoom", privacy: "Guests" },
      roomB: { roomId: "apt_a_bed", type: "Bedroom", privacy: "Household" } },
  ], { x: -9, z: 5 });

  return out;
}

export function pointInRoom(room: RoomDef, lotX: number, lotZ: number,
  worldX: number, worldZ: number): boolean {
  const px = worldX - lotX;
  const pz = worldZ - lotZ;
  return px >= room.x1 && px <= room.x2 && pz >= room.z1 && pz <= room.z2;
}

/**
 * Cutaway (spec §19): hide exterior wall segments that sit between the
 * camera and the focus point — segment midpoint closer to focus than to
 * camera AND roughly aligned with the view direction.
 */
export function wallsToHide(
  walls: readonly WallSegment[],
  cam: { x: number; z: number },
  focus: { x: number; z: number },
): Set<string> {
  const hidden = new Set<string>();
  const dx = focus.x - cam.x;
  const dz = focus.z - cam.z;
  const len2 = dx * dx + dz * dz || 1;

  for (const w of walls) {
    const mx = (w.x1 + w.x2) / 2;
    const mz = (w.z1 + w.z2) / 2;
    const t = ((mx - cam.x) * dx + (mz - cam.z) * dz) / len2;
    if (t <= 0.05 || t >= 0.95) continue; // not between
    // Point→segment distance so LONG walls qualify via their nearest part.
    const px = cam.x + dx * t;
    const pz = cam.z + dz * t;
    const dist = segmentDistance(px, pz, w);
    if (dist < 1.6) hidden.add(w.id);
  }
  return hidden;
}

function segmentDistance(px: number, pz: number, w: WallSegment): number {
  const sx = w.x2 - w.x1;
  const sz = w.z2 - w.z1;
  const len2 = sx * sx + sz * sz || 1;
  let u = ((px - w.x1) * sx + (pz - w.z1) * sz) / len2;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - (w.x1 + u * sx), pz - (w.z1 + u * sz));
}
