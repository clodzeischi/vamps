// Outdoor dressing: vehicles, props, the kerb line, landing zones.
import { type Rng } from "../../sim/core/rng";
import {
  furnitureSkin,
  setTile,
  skinAt,
  T,
  tileAt,
  walkable,
  VEHICLE_LENGTH,
  isTown,
  vehicleSkin,
  type BattleMap,
  type Pt,
  type Pt3,
  type Skin,
  type VehicleKind,
} from "./map";
import { type Rect } from "./mapgen";

export const fill = (
  m: BattleMap,
  rect: Rect,
  z: number,
  t: (typeof T)[keyof typeof T],
  skin: Skin,
) => {
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) setTile(m, x, y, z, t, skin);
};

/** A prop on open ground, if the tile is bare floor. */
export function prop(
  m: BattleMap,
  x: number,
  y: number,
  t: (typeof T)["LOW"] | (typeof T)["HIGH"],
  skin: Skin,
) {
  if (tileAt(m, x, y, m.ground) === T.FLOOR && !kerbCorner(m, x, y))
    setTile(m, x, y, m.ground, t, skin);
}

/**
 * A vehicle two tiles across, long along x or y, its corner at (x, y), if
 * every tile under it is bare floor. Its front faces `front` along its length.
 */
export function vehicle(
  m: BattleMap,
  r: Rng,
  x: number,
  y: number,
  alongX: boolean,
  kind: VehicleKind,
  front: 1 | -1,
): boolean {
  const len = VEHICLE_LENGTH[kind];
  const w = alongX ? len : 2,
    h = alongX ? 2 : len;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      if (tileAt(m, x + dx, y + dy, m.ground) !== T.FLOOR) return false;
  const under = skinAt(m, x, y, m.ground);
  const skin = vehicleSkin(kind),
    t = skin === "truck" ? T.HIGH : T.LOW;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) setTile(m, x + dx, y + dy, m.ground, t, skin);
  m.vehicles.push({ x, y, z: m.ground, w, h, kind, front, under, paint: r.int(0, 999) });
  return true;
}

/** Vehicles the repair had to break into (a tile cleared): gone, every tile back to the floor under it. */
export function dropBrokenVehicles(m: BattleMap) {
  m.vehicles = m.vehicles.filter((v) => {
    const skin = vehicleSkin(v.kind);
    let whole = true;
    for (let dy = 0; dy < v.h; dy++)
      for (let dx = 0; dx < v.w; dx++)
        if (
          skinAt(m, v.x + dx, v.y + dy, v.z) !== skin ||
          tileAt(m, v.x + dx, v.y + dy, v.z) === T.FLOOR
        )
          whole = false;
    if (whole) return true;
    for (let dy = 0; dy < v.h; dy++)
      for (let dx = 0; dx < v.w; dx++) setTile(m, v.x + dx, v.y + dy, v.z, T.FLOOR, v.under);
    return false;
  });
}

/** Furniture the repair had to break into: gone, its tiles back to bare floor. */
export function dropBrokenFurniture(m: BattleMap) {
  m.furniture = m.furniture.filter((f) => {
    const skin = furnitureSkin(f.kind);
    let whole = true;
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++)
        if (
          tileAt(m, f.x + dx, f.y + dy, f.z) !== T.LOW ||
          skinAt(m, f.x + dx, f.y + dy, f.z) !== skin
        )
          whole = false;
    if (whole) return true;
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++)
        if (tileAt(m, f.x + dx, f.y + dy, f.z) === T.LOW)
          setTile(m, f.x + dx, f.y + dy, f.z, T.FLOOR, "indoor");
    return false;
  });
}

// Lot sides: 0 north (y0), 1 south (y1), 2 west (x0), 3 east (x1).
/** The way out of a lot's side, and the side's tiles. */
export const OUT = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;
export function sideTiles(l: Rect, s: number): Pt[] {
  const out: Pt[] = [];
  if (s < 2) for (let x = l.x0; x <= l.x1; x++) out.push({ x, y: s === 0 ? l.y0 : l.y1 });
  else for (let y = l.y0; y <= l.y1; y++) out.push({ x: s === 2 ? l.x0 : l.x1, y });
  return out;
}

/** A road tile (a vehicle parked on the road counts). */
export function isRoad(m: BattleMap, x: number, y: number): boolean {
  const k = skinAt(m, x, y, m.ground);
  if (k === "road") return true;
  if (k !== "car" && k !== "truck") return false;
  return m.vehicles.some(
    (v) => v.under === "road" && x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h,
  );
}

/** One of the three tiles in from a rounded street corner (the kerb curves through them): nothing stands there. */
export function kerbCorner(m: BattleMap, x: number, y: number): boolean {
  if (!isTown(m.setting)) return false;
  const road = (i: number, j: number) => isRoad(m, i, j);
  if (road(x, y)) return false;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          // (x, y) is i, j tiles in from the corner tile (cx, cy), whose diagonal is road.
          const cx = x + i * sx,
            cy = y + j * sy;
          if (road(cx + sx, cy) && road(cx, cy + sy) && road(cx + sx, cy + sy) && !road(cx, cy))
            return true;
        }
  return false;
}

/** Street lamps along a kerb every STREET_GAP tiles; street trees halfway between. */
const STREET_GAP = 8;

/**
 * A tile on the kerb line (the pavement's outer row, or a driveway across
 * it): the side of it the road is on, and its place in the rhythm along the
 * street (0 … STREET_GAP − 1: lamps at 0, trees at half), staggered from one
 * side of the road to the other. Null off the kerb line.
 */
export function kerbSlot(
  m: BattleMap,
  x: number,
  y: number,
): { side: number; slot: number } | null {
  const k = skinAt(m, x, y, m.ground);
  if ((k !== "pavement" && k !== "tarmac") || kerbCorner(m, x, y)) return null;
  for (let side = 0; side < 4; side++) {
    const [dx, dy] = OUT[side]!;
    if (!isRoad(m, x + dx, y + dy)) continue;
    const along = side < 2 ? x : y;
    const stagger = side % 2 ? STREET_GAP / 2 : 0;
    return { side, slot: (along + (m.seed % STREET_GAP) + stagger) % STREET_GAP };
  }
  return null;
}

/** Free pavement on the kerb line, for a lamp or a tree. */
export const kerbFree = (m: BattleMap, x: number, y: number) =>
  skinAt(m, x, y, m.ground) === "pavement" &&
  tileAt(m, x, y, m.ground) === T.FLOOR &&
  kerbSlot(m, x, y) !== null;

/** A 3 × 3 landing zone, cleared, at `c`. */
export function landingZone(m: BattleMap, c: Pt): Pt3[] {
  const lz: Pt3[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx,
        y = c.y + dy;
      if (!walkable(m, x, y, m.ground))
        setTile(m, x, y, m.ground, T.FLOOR, m.setting === "urban" ? "pavement" : "grass");
      lz.push({ x, y, z: m.ground });
    }
  return lz;
}
