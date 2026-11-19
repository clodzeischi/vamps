// The battlescape grid (docs/WEB_PORT.md 3.11): w × h tiles on several whole
// levels. Level indices run from 0 (the lowest: a basement if there is one)
// up; `ground` is the street level. Walls, windows and doorways stand on the
// edges between tiles, as in XCOM (a whole-tile WALL still works, for test
// maps and the odd solid block). Plain data, no DOM.

/** What a tile is. Props (LOW, HIGH) stand on a floor; VOID is nothing at all (open air, solid earth). */
export const T = {
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  WINDOW: 3,
  DOOR: 4,
  /** Half cover: a crate, a car, a low wall, a pew, a gravestone. */
  LOW: 5,
  /** Full cover that isn't a wall: a tree, a pillar, a stack of crates. */
  HIGH: 6,
  /** Walkable; leads up to the same x, y one level above. */
  STAIRS: 7,
} as const;
export type TileKind = (typeof T)[keyof typeof T];

/** What stands on the edge between two tiles. */
export const E = { NONE: 0, WALL: 1, WINDOW: 2, DOOR: 3 } as const;
export type EdgeKind = (typeof E)[keyof typeof E];
/** Edges: can it be walked through, does it block sight, what cover it gives the tile behind it. */
export const EDGE_INFO: Record<EdgeKind, { name: string; walk: boolean; opaque: boolean; cover: 0 | 1 | 2 }> = {
  [E.NONE]: { name: "", walk: true, opaque: false, cover: 0 },
  [E.WALL]: { name: "wall", walk: false, opaque: true, cover: 2 },
  [E.WINDOW]: { name: "window", walk: false, opaque: false, cover: 1 },
  [E.DOOR]: { name: "doorway", walk: true, opaque: false, cover: 0 },
};

export const COVER_NONE = 0;
export const COVER_HALF = 1;
export const COVER_FULL = 2;

export interface TileInfo {
  name: string;
  walk: boolean;
  /** Blocks line of sight. */
  opaque: boolean;
  /** Cover it gives a unit on the tile next to it. */
  cover: 0 | 1 | 2;
}

export const TILE_INFO: Record<TileKind, TileInfo> = {
  [T.VOID]: { name: "nothing", walk: false, opaque: false, cover: COVER_NONE },
  [T.FLOOR]: { name: "floor", walk: true, opaque: false, cover: COVER_NONE },
  [T.WALL]: { name: "wall", walk: false, opaque: true, cover: COVER_FULL },
  [T.WINDOW]: { name: "window", walk: false, opaque: false, cover: COVER_HALF },
  [T.DOOR]: { name: "doorway", walk: true, opaque: false, cover: COVER_NONE },
  [T.LOW]: { name: "low cover", walk: false, opaque: false, cover: COVER_HALF },
  [T.HIGH]: { name: "high cover", walk: false, opaque: true, cover: COVER_FULL },
  [T.STAIRS]: { name: "stairs", walk: true, opaque: false, cover: COVER_NONE },
};

/** What a tile looks like (the renderer's palette) and what to call it. */
export const SKINS = [
  "none", "grass", "road", "pavement", "indoor", "dirt", "wood", "stone", "roof",
  "brick", "plaster", "car", "crate", "tree", "hedge", "hay", "fence", "bin", "table", "bench", "planks", "parapet", "tarmac",
  "grave", "rock", "sarcophagus", "pillar", "altar", "rubble", "crypt", "truck",
] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN: Record<Skin, number> = Object.fromEntries(SKINS.map((s, i) => [s, i])) as Record<Skin, number>;

export type Setting = "urban" | "rural" | "lair" | "montsegur";

export interface Pt { x: number; y: number }
export interface Pt3 extends Pt { z: number }

export interface Spawn extends Pt3 {
  side: "thrall" | "vampire" | "civilian";
  /** A lair's eldest. */
  elder?: boolean;
}

/** Vehicles: a car or an SUV is half cover, a truck full cover. */
export type VehicleKind = "car" | "suv" | "truck";
/** Footprints in tiles: two across, this many long. */
export const VEHICLE_LENGTH: Record<VehicleKind, number> = { car: 3, suv: 4, truck: 6 };

/**
 * A vehicle: its footprint (on level z; w × h tiles, long along x when w > h),
 * the way its front faces along that axis (+1 or −1), the floor under it, and
 * a number for its paint. Its tiles are LOW "car" (car, SUV) or HIGH "truck".
 */
export interface Vehicle {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  kind: VehicleKind;
  front: 1 | -1;
  under: Skin;
  paint: number;
}

export interface BattleMap {
  w: number;
  h: number;
  /** Number of levels. */
  levels: number;
  /** Index of street level (1 when there's a basement, else 0). */
  ground: number;
  tiles: Uint8Array;
  skin: Uint8Array;
  setting: Setting;
  seed: number;
  /** Where the team arrives and leaves: the landing or extraction zone (on the ground level). */
  lz: Pt3[];
  spawns: Spawn[];
  /** Lamps: at night, what's near one can be seen from afar. */
  lights: Pt3[];
  /** Vehicles, each over several tiles (the tiles carry the rules; this, the look). */
  vehicles: Vehicle[];
  /** Edges on the west side of each tile (x from 0 to w): (z·h + y)·(w + 1) + x. */
  ew: Uint8Array;
  /** Edges on the north side of each tile (y from 0 to h): (z·(h + 1) + y)·w + x. */
  ns: Uint8Array;
  /** Skins of those edges. */
  ewSkin: Uint8Array;
  nsSkin: Uint8Array;
}

export function emptyMap(w: number, h: number, levels: number, ground: number, setting: Setting, seed: number): BattleMap {
  const ew = (w + 1) * h * levels, ns = w * (h + 1) * levels;
  return {
    w, h, levels, ground, setting, seed, tiles: new Uint8Array(w * h * levels), skin: new Uint8Array(w * h * levels), lz: [], spawns: [], lights: [], vehicles: [],
    ew: new Uint8Array(ew), ns: new Uint8Array(ns), ewSkin: new Uint8Array(ew), nsSkin: new Uint8Array(ns),
  };
}

export const inBounds = (m: BattleMap, x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < m.w && y < m.h && z < m.levels;
export const idx = (m: BattleMap, x: number, y: number, z: number) => (z * m.h + y) * m.w + x;
export const tileAt = (m: BattleMap, x: number, y: number, z: number): TileKind => (inBounds(m, x, y, z) ? (m.tiles[idx(m, x, y, z)]! as TileKind) : T.VOID);
export const skinAt = (m: BattleMap, x: number, y: number, z: number): Skin => SKINS[inBounds(m, x, y, z) ? m.skin[idx(m, x, y, z)]! : 0]!;
export function setTile(m: BattleMap, x: number, y: number, z: number, t: TileKind, skin: Skin) {
  if (!inBounds(m, x, y, z)) return;
  const i = idx(m, x, y, z);
  m.tiles[i] = t;
  m.skin[i] = SKIN[skin];
}
export const walkable = (m: BattleMap, x: number, y: number, z: number) => TILE_INFO[tileAt(m, x, y, z)].walk;

/**
 * Where the edge between a tile and its neighbour one step along x or y
 * lives: which array and which index (null off the map or not a 4-neighbour).
 */
function edgeSlot(m: BattleMap, x: number, y: number, z: number, dx: number, dy: number): { a: "ew" | "ns"; i: number } | null {
  if (z < 0 || z >= m.levels) return null;
  if (dy === 0 && (dx === 1 || dx === -1)) {
    const ex = dx > 0 ? x + 1 : x; // the west edge of the tile to the east
    if (y < 0 || y >= m.h || ex < 0 || ex > m.w) return null;
    return { a: "ew", i: (z * m.h + y) * (m.w + 1) + ex };
  }
  if (dx === 0 && (dy === 1 || dy === -1)) {
    const ey = dy > 0 ? y + 1 : y;
    if (x < 0 || x >= m.w || ey < 0 || ey > m.h) return null;
    return { a: "ns", i: (z * (m.h + 1) + ey) * m.w + x };
  }
  return null;
}

/** The edge between (x, y) and the tile one step (dx, dy) away (4 ways only). */
export function edgeAt(m: BattleMap, x: number, y: number, z: number, dx: number, dy: number): EdgeKind {
  const s = edgeSlot(m, x, y, z, dx, dy);
  return s ? (m[s.a][s.i]! as EdgeKind) : E.NONE;
}
export function edgeSkinAt(m: BattleMap, x: number, y: number, z: number, dx: number, dy: number): Skin {
  const s = edgeSlot(m, x, y, z, dx, dy);
  return SKINS[s ? m[s.a === "ew" ? "ewSkin" : "nsSkin"][s.i]! : 0]!;
}
export function setEdge(m: BattleMap, x: number, y: number, z: number, dx: number, dy: number, e: EdgeKind, skin: Skin = "none") {
  const s = edgeSlot(m, x, y, z, dx, dy);
  if (!s) return;
  m[s.a][s.i] = e;
  m[s.a === "ew" ? "ewSkin" : "nsSkin"][s.i] = SKIN[skin];
}
/** Can a unit step from (x, y) to the 4-neighbour (dx, dy) across the edge between them? */
export const edgeOpen = (m: BattleMap, x: number, y: number, z: number, dx: number, dy: number) => EDGE_INFO[edgeAt(m, x, y, z, dx, dy)].walk;

/** One step to any of the 8 neighbours: the tile is walkable, the edge is open, and no corner is cut past a wall or a prop. */
export function canStep(m: BattleMap, x: number, y: number, z: number, dx: number, dy: number): boolean {
  if (!walkable(m, x + dx, y + dy, z)) return false;
  if (!dx || !dy) return edgeOpen(m, x, y, z, dx, dy);
  return walkable(m, x + dx, y, z) && walkable(m, x, y + dy, z)
    && edgeOpen(m, x, y, z, dx, 0) && edgeOpen(m, x + dx, y, z, 0, dy)
    && edgeOpen(m, x, y, z, 0, dy) && edgeOpen(m, x, y + dy, z, dx, 0);
}

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * The tiles one step from a tile: the eight around it on its level (no
 * cutting a corner past something you can't walk through), and up or down a
 * staircase.
 */
export function neighbours(m: BattleMap, p: Pt3, climb = false): Pt3[] {
  const out: Pt3[] = [];
  for (const [dx, dy] of DIRS8) if (canStep(m, p.x, p.y, p.z, dx, dy)) out.push({ x: p.x + dx, y: p.y + dy, z: p.z });
  if (tileAt(m, p.x, p.y, p.z) === T.STAIRS && walkable(m, p.x, p.y, p.z + 1)) out.push({ x: p.x, y: p.y, z: p.z + 1 });
  if (tileAt(m, p.x, p.y, p.z - 1) === T.STAIRS) out.push({ x: p.x, y: p.y, z: p.z - 1 });
  if (climb) out.push(...climbs(m, p));
  return out;
}

/** What climbs: a parapet, a window, a fence or a crate. */
const climbable = (t: TileKind) => t === T.LOW || t === T.WINDOW;

/**
 * Vampires climb (docs/WEB_PORT.md 3.11): up a wall and over the parapet
 * onto a roof, or in at an upper window; and down the same way. A climb goes
 * from a tile with open air above it, up the wall face in front, to the floor
 * beyond a parapet or through a window one level up.
 */
export function climbs(m: BattleMap, p: Pt3): Pt3[] {
  const out: Pt3[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ex = p.x + dx, ey = p.y + dy, tx = p.x + 2 * dx, ty = p.y + 2 * dy;
    const sky = tileAt(m, p.x, p.y, p.z + 1) === T.VOID;
    // A wall face in front: a wall edge, or a tile that can't be walked.
    const face = !walkable(m, ex, ey, p.z) || !edgeOpen(m, p.x, p.y, p.z, dx, dy);
    // Up, over a parapet (or a whole-tile window) one level up, to the floor beyond it.
    if (sky && face && climbable(tileAt(m, ex, ey, p.z + 1)) && walkable(m, tx, ty, p.z + 1) && edgeOpen(m, ex, ey, p.z + 1, dx, dy))
      out.push({ x: tx, y: ty, z: p.z + 1 });
    // Up, in at a window on the edge one level up.
    if (sky && face && edgeAt(m, p.x, p.y, p.z + 1, dx, dy) === E.WINDOW && walkable(m, ex, ey, p.z + 1))
      out.push({ x: ex, y: ey, z: p.z + 1 });
    if (p.z <= 0) continue;
    // Down, over the edge in front, to open ground below with sky above it.
    const wallBelow = (fx: number, fy: number) => !walkable(m, fx, fy, p.z - 1) || !edgeOpen(m, fx, fy, p.z - 1, dx, dy);
    if (climbable(tileAt(m, ex, ey, p.z)) && wallBelow(ex, ey) && walkable(m, tx, ty, p.z - 1) && tileAt(m, tx, ty, p.z) === T.VOID)
      out.push({ x: tx, y: ty, z: p.z - 1 });
    // Down, out of a window on this tile's edge.
    if (edgeAt(m, p.x, p.y, p.z, dx, dy) === E.WINDOW && tileAt(m, ex, ey, p.z) === T.VOID && walkable(m, ex, ey, p.z - 1))
      out.push({ x: ex, y: ey, z: p.z - 1 });
  }
  return out;
}

/** Every tile reachable on foot from `from` (a flag per tile index). */
export function reachable(m: BattleMap, from: Pt3): Uint8Array {
  const seen = new Uint8Array(m.tiles.length);
  if (!walkable(m, from.x, from.y, from.z)) return seen;
  const q: Pt3[] = [from];
  seen[idx(m, from.x, from.y, from.z)] = 1;
  while (q.length) {
    const p = q.pop()!;
    for (const n of neighbours(m, p)) {
      const i = idx(m, n.x, n.y, n.z);
      if (!seen[i]) {
        seen[i] = 1;
        q.push(n);
      }
    }
  }
  return seen;
}

/** Walkable tiles that can't be reached from the landing zone. */
export function unreachableTiles(m: BattleMap): Pt3[] {
  const start = m.lz[0];
  if (!start) return [];
  const seen = reachable(m, start);
  const out: Pt3[] = [];
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) if (walkable(m, x, y, z) && !seen[idx(m, x, y, z)]) out.push({ x, y, z });
  return out;
}

/** "Ground floor", "Basement", "Floor 2", "Roof" (a level's name for the HUD). */
export function levelName(m: BattleMap, z: number): string {
  if ((m.setting === "lair" || m.setting === "montsegur") && z < m.ground) return z === m.ground - 1 ? "Catacombs" : "Crypt";
  if (z < m.ground) return z === m.ground - 1 ? "Basement" : `Basement ${m.ground - z}`;
  if (z === m.ground) return "Ground floor";
  return `Floor ${z - m.ground + 1}`;
}

/** How far a lamp lights the ground around it (same level). */
export const LIGHT_RADIUS = 4;
export const isLit = (m: BattleMap, p: Pt3) => m.lights.some((l) => l.z === p.z && Math.hypot(l.x - p.x, l.y - p.y) <= LIGHT_RADIUS);

/** Under a roof or a floor: out of the sun. */
export const indoors = (m: BattleMap, p: Pt3) => {
  for (let z = p.z + 1; z < m.levels; z++) if (tileAt(m, p.x, p.y, z) !== T.VOID) return true;
  return false;
};
