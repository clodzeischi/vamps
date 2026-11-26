// The battlescape grid (docs/design/tactical.md): w × h tiles on several whole
// levels. Level indices run from 0 (the lowest: a basement if there is one)
// up; `ground` is the street level. Walls, windows and doorways stand on the
// edges between tiles, as in XCOM (a whole-tile WALL still works, for test
// maps and the odd solid block). Plain data, no DOM.

/** What a tile is. Props (LOW, HIGH) stand on a floor; VOID is nothing at all (open air, solid earth). */
import { PIECES, type PieceCover } from "./pieces";

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
  /** Under a flight of stairs (map.flights): nobody stands here; the flight is one step from its foot to its head. */
  FLIGHT: 8,
} as const;
type TileKind = (typeof T)[keyof typeof T];

/**
 * What stands on the edge between two tiles. DOOR is an open doorway (or a
 * door standing open); SHUT a closed door: it blocks sight, and walking
 * through opens it (for TU_COST.door), after which it stays open. GLASS is a
 * floor-to-ceiling pane (shopfronts, penthouses): seen through, no cover,
 * not walked through, shattered by a shot or a fire (then open). A window
 * shatters the same way and leaves SILL: the frame with its glass gone, the
 * same for the rules (half cover, seen through, climbed through).
 */
export const E = { NONE: 0, WALL: 1, WINDOW: 2, DOOR: 3, SHUT: 4, GLASS: 5, SILL: 6, RAIL: 7 } as const;
export type EdgeKind = (typeof E)[keyof typeof E];
/** Edges: can it be walked through, does it block sight, what cover it gives the tile behind it. */
export const EDGE_INFO: Record<EdgeKind, { name: string; walk: boolean; opaque: boolean; cover: 0 | 1 | 2 }> = {
  [E.NONE]: { name: "", walk: true, opaque: false, cover: 0 },
  [E.WALL]: { name: "wall", walk: false, opaque: true, cover: 2 },
  [E.WINDOW]: { name: "window", walk: false, opaque: false, cover: 1 },
  [E.DOOR]: { name: "doorway", walk: true, opaque: false, cover: 0 },
  [E.SHUT]: { name: "closed door", walk: true, opaque: true, cover: 2 },
  [E.GLASS]: { name: "glass", walk: false, opaque: false, cover: 0 },
  [E.SILL]: { name: "broken window", walk: false, opaque: false, cover: 1 },
  /** A railing along a raised edge (a deck, a dock, a landing): half cover, seen and shot over, not walked through. */
  [E.RAIL]: { name: "railing", walk: false, opaque: false, cover: 1 },
};

/** A window, whole or broken. */
export const isWindow = (e: EdgeKind) => e === E.WINDOW || e === E.SILL;
/** What a shot or a fire shatters: a glass wall or a window's glass. */
export const breakable = (e: EdgeKind) => e === E.GLASS || e === E.WINDOW;

/** A door, open or shut (not a bare gap). */
export const isDoor = (e: EdgeKind) => e === E.DOOR || e === E.SHUT;

const COVER_NONE = 0;
export const COVER_HALF = 1;
export const COVER_FULL = 2;

interface TileInfo {
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
  [T.FLIGHT]: { name: "stairs", walk: false, opaque: false, cover: COVER_NONE },
};

/** What a tile looks like (the renderer's palette) and what to call it. */
export const SKINS = [
  "none", "grass", "road", "pavement", "indoor", "dirt", "wood", "stone", "roof",
  "brick", "plaster", "car", "crate", "tree", "hedge", "hay", "fence", "bin", "table", "bench", "planks", "parapet", "tarmac",
  "grave", "rock", "sarcophagus", "pillar", "altar", "rubble", "crypt", "truck",
  // Shops, the hospital, the warehouse: props, then floors (tiles, concrete), then walls (cladding, clinic white).
  "bed", "shelf", "counter", "fridge", "pump", "rack", "tile", "concrete", "metal", "clinic",
  // Flats: a sofa, a TV on its stand (furniture over two tiles).
  "sofa", "tv",
] as const;
export type Skin = (typeof SKINS)[number];
const SKIN: Record<Skin, number> = Object.fromEntries(SKINS.map((s, i) => [s, i])) as Record<Skin, number>;

export type Setting = "urban" | "rural" | "apartments" | "industrial" | "lair" | "montsegur";
/** Settings with town streets: roads with kerbs, pavements, street lamps. */
export const isTown = (s: Setting) => s === "urban" || s === "apartments" || s === "industrial";

export interface Pt { x: number; y: number }
export interface Pt3 extends Pt { z: number }

export interface Spawn extends Pt3 {
  side: "thrall" | "vampire" | "civilian";
  /** A lair's eldest. */
  elder?: boolean;
}

/** Vehicles: a car or an SUV is half cover; a truck, an ambulance (a van) or a shipping container full cover. */
export type VehicleKind = "car" | "suv" | "truck" | "ambulance" | "container";
/** Footprints in tiles: two across, this many long. */
export const VEHICLE_LENGTH: Record<VehicleKind, number> = { car: 3, suv: 4, truck: 6, ambulance: 4, container: 4 };
/** What a vehicle's tiles are: LOW "car" (half cover) or HIGH "truck" (full). */
export const vehicleSkin = (k: VehicleKind): "car" | "truck" => (k === "car" || k === "suv" ? "car" : "truck");

/** A lamp. Street lamps and braziers by default; a ceiling light is a fitting indoors or under a canopy, no post. */
export interface Light extends Pt3 {
  ceiling?: boolean;
  /** A ceiling light's height above its floor (metres; default just under the ceiling). */
  h?: number;
  /** A lamp on a wall, over a door: the way from its tile to that wall (the light is drawn there, above the doorway). */
  wall?: readonly [number, number];
}

/**
 * A shop sign (the look): on the outside face of the wall on the edge from
 * tile (x, y) toward (x + dx, y + dy), level z, `w` tiles wide, centred there.
 */
export interface Sign { x: number; y: number; z: number; dx: number; dy: number; w: number; text: string; bg: string; fg: string }

/** A canopy over a forecourt (the look): its tiles, on level z, at height h metres above the floor. */
export interface Canopy { x0: number; y0: number; x1: number; y1: number; z: number; h: number }

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
  /** Burnt out (fire reached it: a blast, an incendiary): drawn as a wreck; its cover stays. */
  wrecked?: boolean;
}

/**
 * Furniture: pieces placed whole, each over its own footprint. The first
 * few (a flat's sofa and TV stand 2 × 1 and double bed 2 × 2; out of doors a
 * concrete barrier and a low metal railing, 2 × 1) are half cover; the prop
 * kit's pieces (tactical/map/pieces.ts) give the cover each is listed with.
 */
type BasicFurniture = "sofa" | "tv" | "bed" | "concrete_barrier" | "railing_low";
export type FurnitureKind = BasicFurniture | (string & {});
const BASIC_SIZE: Record<BasicFurniture, readonly [number, number]> = { sofa: [2, 1], tv: [2, 1], bed: [2, 2], concrete_barrier: [2, 1], railing_low: [2, 1] };
export const FURNITURE_SIZE: Record<FurnitureKind, readonly [number, number]> = {
  ...BASIC_SIZE,
  ...Object.fromEntries(Object.entries(PIECES).map(([k, d]) => [k, d.size])),
};
/** Its footprint: length across the way it faces, then depth (1 × 1 for a kind we don't know). */
export const furnitureSize = (k: FurnitureKind): readonly [number, number] => FURNITURE_SIZE[k] ?? [1, 1];
/** Its tiles' skin, which the rules see (a shot's height over it). */
export const furnitureSkin = (k: FurnitureKind): Skin =>
  PIECES[k]?.skin ?? (k === "concrete_barrier" ? "concrete" : k === "railing_low" ? "fence" : (k as Skin));
/** The cover its tiles give: HIGH, LOW, or none (left as they are, walked over and seen through). */
export const furnitureCover = (k: FurnitureKind): PieceCover => PIECES[k]?.cover ?? "low";
/** Where its model stands: its footprint's middle, or the edge behind it (a piece on a wall). */
export const furnitureAnchor = (k: FurnitureKind): "centre" | "back" => PIECES[k]?.anchor ?? "centre";

/**
 * Street dressing the rules don't see (no cover, walked past or over): a
 * stop sign or a bollard on a grid corner, where four tiles meet, so it
 * blocks none of them; a manhole or a drain on a tile.
 */
export type DecorKind = "stop_sign" | "bollard" | "manhole" | "drain_grate";
/** Where each kind sits: on a grid corner, or a tile's middle. */
export const DECOR_AT: Record<DecorKind, "corner" | "tile"> = { stop_sign: "corner", bollard: "corner", manhole: "tile", drain_grate: "tile" };
/** A piece of dressing: at (x, y) in tiles (a corner is whole numbers, a tile's middle +0.5), level z, its front toward (dx, dy). */
export interface Decor { kind: DecorKind; x: number; y: number; z: number; dx: number; dy: number }

/**
 * A piece of furniture: its footprint (level z; w × h tiles from x, y) and
 * the way its front faces (dx, dy): the seat side of a sofa, the screen of a
 * TV, the foot of a bed (its head against the wall behind). The tiles carry
 * the rules; this, the look.
 */
export interface Furniture { x: number; y: number; z: number; w: number; h: number; kind: FurnitureKind; dx: number; dy: number }

/**
 * Stairs as a piece (docs/design/levels.md, Stairs and height): an outdoor
 * flight 2 wide and 2 long, an indoor one 1 wide and 2 long. Nobody stands
 * on one: walking it is a single step from a tile at its foot (level z, just
 * before it) to the tile at its head (level z + 1, just past it).
 */
export type FlightKind = "outdoor" | "indoor";
/** Across, then along the way up (tiles). */
export const FLIGHT_SIZE: Record<FlightKind, readonly [number, number]> = { outdoor: [2, 2], indoor: [1, 2] };
/** A flight: its footprint (level z; w × h tiles from x, y) and the way up (dx, dy). Its tiles are FLIGHT; the level above them is open. */
export interface Flight { x: number; y: number; z: number; w: number; h: number; kind: FlightKind; dx: number; dy: number }

/** A flight's footprint from its corner, going up (dx, dy). */
export function flightAt(kind: FlightKind, x: number, y: number, z: number, dx: number, dy: number): Flight {
  const [across, len] = FLIGHT_SIZE[kind];
  return dy ? { x, y, z, w: across, h: len, kind, dx, dy } : { x, y, z, w: len, h: across, kind, dx, dy };
}

/** A flight's lanes: per tile across it, the foot (level z, before the bottom step) and the head (level z + 1, past the top one). */
export function flightEnds(f: Flight): { foot: Pt3; head: Pt3 }[] {
  const out: { foot: Pt3; head: Pt3 }[] = [];
  if (f.dy) {
    const bottom = f.dy < 0 ? f.y + f.h : f.y - 1, top = f.dy < 0 ? f.y - 1 : f.y + f.h;
    for (let x = f.x; x < f.x + f.w; x++) out.push({ foot: { x, y: bottom, z: f.z }, head: { x, y: top, z: f.z + 1 } });
  } else {
    const bottom = f.dx < 0 ? f.x + f.w : f.x - 1, top = f.dx < 0 ? f.x - 1 : f.x + f.w;
    for (let y = f.y; y < f.y + f.h; y++) out.push({ foot: { x: bottom, y, z: f.z }, head: { x: top, y, z: f.z + 1 } });
  }
  return out;
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
  lights: Light[];
  /** Vehicles, each over several tiles (the tiles carry the rules; this, the look). */
  vehicles: Vehicle[];
  /** Painted parking-bay dividers (the look): a line through the tile's middle, along x or along y. */
  bayLines: { x: number; y: number; alongX: boolean }[];
  /** Winter: snow lies outdoors (the look only). */
  winter: boolean;
  /** Rain: a drizzle, wet ground and puddles outdoors (the look only; never with snow). */
  rain?: boolean;
  /** Furniture over several tiles. */
  furniture: Furniture[];
  /** Flights of stairs (pieces; older maps have none, only STAIRS tiles). */
  flights?: Flight[];
  /** Street dressing (the look only). */
  decor?: Decor[];
  /**
   * Where a helicopter drops the team instead, when it isn't where a
   * team arriving by road starts (an apartment block's roof, a works yard):
   * replaces lz for a helicopter arrival.
   */
  airLz?: Pt3[];
  signs: Sign[];
  canopies: Canopy[];
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
    w, h, levels, ground, setting, seed, tiles: new Uint8Array(w * h * levels), skin: new Uint8Array(w * h * levels), lz: [], spawns: [], lights: [], vehicles: [], furniture: [], flights: [], decor: [], bayLines: [], winter: false, signs: [], canopies: [],
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

/** Open, and not a closed door: a straight or diagonal walk may pass without stopping to open it. */
export const edgeFree = (m: BattleMap, x: number, y: number, z: number, dx: number, dy: number) => edgeOpen(m, x, y, z, dx, dy) && edgeAt(m, x, y, z, dx, dy) !== E.SHUT;

/**
 * One step to any of the 8 neighbours: the tile is walkable, the edge is
 * open, and no corner is cut past a wall, a prop or a closed door (a closed
 * door is gone through straight).
 */
export function canStep(m: BattleMap, x: number, y: number, z: number, dx: number, dy: number): boolean {
  if (!walkable(m, x + dx, y + dy, z)) return false;
  if (!dx || !dy) return edgeOpen(m, x, y, z, dx, dy);
  return walkable(m, x + dx, y, z) && walkable(m, x, y + dy, z)
    && edgeFree(m, x, y, z, dx, 0) && edgeFree(m, x + dx, y, z, 0, dy)
    && edgeFree(m, x, y, z, 0, dy) && edgeFree(m, x, y + dy, z, dx, 0);
}

/** Is there a closed door between a tile and its 4-neighbour? */
export const shutBetween = (m: BattleMap, a: Pt3, b: Pt3) =>
  a.z === b.z && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 && edgeAt(m, a.x, a.y, a.z, b.x - a.x, b.y - a.y) === E.SHUT;

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** Each map's flights as steps: from a tile index, where a flight takes you (worked out once per map and flight list). */
const flightCache = new WeakMap<BattleMap, { list: Flight[] | undefined; n: number; steps: Map<number, Pt3[]> }>();
function flightSteps(m: BattleMap): Map<number, Pt3[]> {
  const c = flightCache.get(m);
  if (c && c.list === m.flights && c.n === (m.flights?.length ?? 0)) return c.steps;
  const steps = new Map<number, Pt3[]>();
  const add = (a: Pt3, b: Pt3) => {
    const i = idx(m, a.x, a.y, a.z);
    (steps.get(i) ?? steps.set(i, []).get(i)!).push(b);
  };
  for (const f of m.flights ?? []) {
    // The edges walked through: into the bottom step on the flight's level, out of the top one on the level above.
    for (const { foot, head } of flightEnds(f)) {
      if (!walkable(m, foot.x, foot.y, foot.z) || !walkable(m, head.x, head.y, head.z)) continue;
      if (!edgeOpen(m, foot.x, foot.y, foot.z, f.dx, f.dy) || !edgeOpen(m, head.x, head.y, head.z, -f.dx, -f.dy)) continue;
      add(foot, head);
      add(head, foot);
    }
  }
  flightCache.set(m, { list: m.flights, n: m.flights?.length ?? 0, steps });
  return steps;
}

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
  for (const q of flightSteps(m).get(idx(m, p.x, p.y, p.z)) ?? []) out.push({ ...q });
  if (climb) out.push(...climbs(m, p));
  return out;
}

/** What climbs: a parapet, a window, a fence or a crate. */
const climbable = (t: TileKind) => t === T.LOW || t === T.WINDOW;

/**
 * Vampires climb (docs/design/tactical.md): up a wall and over the parapet
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
    if (sky && face && isWindow(edgeAt(m, p.x, p.y, p.z + 1, dx, dy)) && walkable(m, ex, ey, p.z + 1))
      out.push({ x: ex, y: ey, z: p.z + 1 });
    if (p.z <= 0) continue;
    // Down, over the edge in front, to open ground below with sky above it.
    const wallBelow = (fx: number, fy: number) => !walkable(m, fx, fy, p.z - 1) || !edgeOpen(m, fx, fy, p.z - 1, dx, dy);
    if (climbable(tileAt(m, ex, ey, p.z)) && wallBelow(ex, ey) && walkable(m, tx, ty, p.z - 1) && tileAt(m, tx, ty, p.z) === T.VOID)
      out.push({ x: tx, y: ty, z: p.z - 1 });
    // Down, out of a window on this tile's edge.
    if (isWindow(edgeAt(m, p.x, p.y, p.z, dx, dy)) && tileAt(m, ex, ey, p.z) === T.VOID && walkable(m, ex, ey, p.z - 1))
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
