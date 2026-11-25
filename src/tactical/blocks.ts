// Map blocks (docs/design/levels.md): authored pieces of a battle map, 10 × 10
// tiles or a multiple, every level of them, as X-COM's map blocks. A map
// script places them on a grid, turned to fit: each block has a type
// (corridor, structure, open) and its entrances, the sides with a way in,
// which the map script turns toward a road.
//
// A block records what was meant, not every wall: each tile's floor and,
// for a building, its exterior and interior wall skins ("wood/brick/plaster";
// a plain "pavement" has no walls); what stands on it (a prop); and
// only the exceptions on its edges (a door, a window, glass, no wall, a wall
// where none would be). Walls follow from the floors (compile): a walled
// floor gets a wall on every edge where its neighbour isn't the same floor:
// the exterior skin against unwalled ground or nothing, the interior skin
// against another walled floor.
//
// The file is JSON meant to read in a diff: per level, rows of characters
// (floors, things on them, west edges and north edges), each character
// looked up in the block's legends. A space is no floor; "." nothing.
//
// To add a kind of anything (a terrain, a node role, a mission, an edge
// exception), add it to the lists below: the editor builds its menus from them.
import {
  E, emptyMap, edgeAt, edgeSkinAt, furnitureCover, furnitureSkin, setEdge, setTile, SKINS, T, tileAt, skinAt, vehicleSkin,
  type BattleMap, type Canopy, type Decor, type EdgeKind, type Flight, type Furniture, type Light, type Setting, type Sign, type Skin, type Vehicle,
} from "./map";

export const BLOCK = 10;
/** The sizes a block can be, in tiles (w × h). */
export const BLOCK_SIZES: readonly (readonly [number, number])[] = [[10, 10], [20, 10], [10, 20], [20, 20]];
/**
 * Where a road meets a corridor block's edge, across each 10 tiles of it:
 * pavement 1, road 8, pavement 1, so every road lines up with the next.
 */
export const ROAD_PROFILE = { pavement: 1, road: 8 } as const;

export const TERRAINS = ["dense", "light", "rural", "industrial"] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_NAME: Record<Terrain, string> = { dense: "Dense urban", light: "Light urban", rural: "Rural", industrial: "Industrial" };

/**
 * What a block is: a corridor (a road and its pavements: how the map is
 * crossed), a structure (anything with a building on it), or open ground
 * (fields, parks, car parks, plazas, the landing zone).
 */
export const BLOCK_TYPES = ["corridor", "structure", "open"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const BLOCK_TYPE_NAME: Record<BlockType, string> = { corridor: "Corridor", structure: "Structure", open: "Open ground" };

/** Missions a block can be the target of (docs/design/levels.md, "Missions"). */
export const TARGETS = ["nest", "den", "haven", "rescue", "ambush", "feeding", "recovery"] as const;
export type Target = (typeof TARGETS)[number];

/** Sides of a block: its front faces the street (or a car park). */
export const SIDES = ["n", "e", "s", "w"] as const;
export type Side = (typeof SIDES)[number];
const SIDE_DIR: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** Authored points: who spawns where, where things happen. */
export const NODE_ROLES = ["vampire", "elder", "thrall", "patrol", "civilian", "prisoner", "loot", "landing", "extraction", "parking"] as const;
export type NodeRole = (typeof NODE_ROLES)[number];
export interface BlockNode { x: number; y: number; z: number; role: NodeRole; /** Indices of linked nodes (patrol routes). */ links?: number[] }

export interface BlockMeta {
  id: string;
  name: string;
  notes?: string;
  terrains: Terrain[];
  type: BlockType;
  /** Per side, what may stand there. */
  /**
   * Sides with a way in (a front door, a drive, a gate). Each must reach a
   * road, directly or through an open block that does (docs/design/levels.md,
   * "Every way in reaches a road"). A corridor block's: where its road leaves.
   */
  entrances: Side[];
  targets: Target[];
  /** Wall skins a map may swap the block's exterior skin for (empty: keep it). */
  wallSet?: Skin[];
}

/**
 * One level as edited: a string per tile or edge ("" for none).
 *   floor  "skin" (no walls) or "skin/exterior/interior" (a building's floor)
 *   obj    "low:skin" or "high:skin" (stairs are pieces: BlockData.flights)
 *   ew     the west edge of each tile, w + 1 to a row (x = w: the last tile's east edge)
 *   ns     the north edge of each tile, h + 1 rows
 * ew and ns hold only exceptions to the walls the floors give: door, window, glass, rail, open, wall.
 */
interface BlockLevel { floor: string[]; obj: string[]; ew: string[]; ns: string[] }

/** A block as the editor and the generator hold it. */
export interface BlockData extends BlockMeta {
  w: number;
  h: number;
  /** Levels below the street (basements). */
  below: number;
  /** Bottom up: basements, the ground floor, storeys, the roof. */
  lv: BlockLevel[];
  furniture: Furniture[];
  flights: Flight[];
  decor: Decor[];
  lights: Light[];
  signs: Sign[];
  canopies: Canopy[];
  vehicles: Vehicle[];
  bayLines: { x: number; y: number; alongX: boolean }[];
  nodes: BlockNode[];
}

/** A block as saved (format 2). */
interface BlockFile extends BlockMeta {
  format: 2;
  w: number;
  h: number;
  below: number;
  levels: number;
  legend: { floor: Record<string, string>; obj: Record<string, string>; edge: Record<string, string> };
  floors: { floor: string[]; obj: string[]; ew: string[]; ns: string[] }[];
  furniture: Furniture[];
  flights: Flight[];
  decor: Decor[];
  lights: Light[];
  signs: Sign[];
  canopies: Canopy[];
  vehicles: Vehicle[];
  bayLines: { x: number; y: number; alongX: boolean }[];
  nodes: BlockNode[];
}

// ---------------------------------------------------------------------------
// Cells

interface FloorCell { skin: Skin; walls: { ext: Skin; int: Skin } | null }
const isSkin = (s: string | undefined): s is Skin => (SKINS as readonly string[]).includes(s ?? "");
export function floorCell(s: string): FloorCell | null {
  if (!s) return null;
  const [skin, ext, int] = s.split("/");
  return { skin: isSkin(skin) ? skin : "none", walls: ext !== undefined ? { ext: isSkin(ext) ? ext : "brick", int: isSkin(int) ? int : "plaster" } : null };
}

const levelSize = (w: number, h: number) => ({ tiles: w * h, ew: (w + 1) * h, ns: w * (h + 1) });
export const emptyLevel = (w: number, h: number): BlockLevel => {
  const n = levelSize(w, h);
  return { floor: Array(n.tiles).fill(""), obj: Array(n.tiles).fill(""), ew: Array(n.ew).fill(""), ns: Array(n.ns).fill("") };
};
/** The index of the edge on a tile's side (dx, dy) in its level's ew or ns list. */
export function edgeIndex(w: number, x: number, y: number, dx: number, dy: number): { list: "ew" | "ns"; i: number } {
  return dx ? { list: "ew", i: y * (w + 1) + x + (dx > 0 ? 1 : 0) } : { list: "ns", i: (y + (dy > 0 ? 1 : 0)) * w + x };
}

// ---------------------------------------------------------------------------
// Compiling: the map the rules and the renderer see

/** The battle setting a block is drawn as on its own (its terrain's look: kerbs in towns). */
function settingFor(b: Pick<BlockMeta, "terrains">): Setting {
  const t = b.terrains[0] ?? "light";
  return t === "dense" ? "apartments" : t === "light" ? "urban" : t;
}

/** The wall the floors put on the edge between two tiles' floors (either may be none), and its skin. */
export function wallBetween(a: string, b: string): { e: EdgeKind; skin: Skin } {
  if (a === b) return { e: E.NONE, skin: "none" };
  const A = floorCell(a), B = floorCell(b);
  if (A?.walls && B?.walls) return { e: E.WALL, skin: A.walls.int };
  if (A?.walls) return { e: E.WALL, skin: A.walls.ext };
  if (B?.walls) return { e: E.WALL, skin: B.walls.ext };
  return { e: E.NONE, skin: "none" };
}

/** An exception's edge: a door or window takes the wall it stands in (or, where none would be, the interior skin beside it). */
function withException(x: string, a: string, b: string): { e: EdgeKind; skin: Skin } {
  const base = wallBetween(a, b);
  const skin: Skin = base.e === E.WALL ? base.skin : floorCell(a)?.walls?.int ?? floorCell(b)?.walls?.int ?? "plaster";
  switch (x) {
    case "door": return { e: E.DOOR, skin };
    case "window": return { e: E.WINDOW, skin };
    case "glass": return { e: E.GLASS, skin };
    case "rail": return { e: E.RAIL, skin: "metal" };
    case "open": return { e: E.NONE, skin: "none" };
    case "wall": return { e: E.WALL, skin };
    default: return base;
  }
}

/** A random car's paint (a vehicle saved with paint −1): picked per map, the same every time that map is drawn. */
const paintFor = (seed: number, x: number, y: number, z: number) => (Math.imul(seed ^ 0x9e3779b9, 31) + x * 7919 + y * 104729 + z * 1299709) >>> 0;

/**
 * A block as a map of its own size (to draw, check, preview, or stamp from).
 * `seed` picks what's left to chance: the paint of a car saved without one.
 */
export function compile(b: BlockData, seed = 0): BattleMap {
  const m = emptyMap(b.w, b.h, b.lv.length, b.below, settingFor(b), seed);
  const { w, h } = b;
  b.lv.forEach((L, z) => {
    const fl = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? "" : L.floor[y * w + x]!);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = floorCell(L.floor[y * w + x]!);
        if (!c) continue;
        const o = L.obj[y * w + x]!;
        if (o.startsWith("low:") || o.startsWith("high:")) {
          const [k, s] = o.split(":");
          setTile(m, x, y, z, k === "low" ? T.LOW : T.HIGH, isSkin(s) ? s : "crate");
        } else setTile(m, x, y, z, T.FLOOR, c.skin);
      }
    // West edges (x = 0 … w), then north edges (y = 0 … h).
    for (let y = 0; y < h; y++)
      for (let x = 0; x <= w; x++) {
        const r = withException(L.ew[y * (w + 1) + x]!, fl(x - 1, y), fl(x, y));
        if (r.e !== E.NONE) x < w ? setEdge(m, x, y, z, -1, 0, r.e, r.skin) : setEdge(m, x - 1, y, z, 1, 0, r.e, r.skin);
      }
    for (let y = 0; y <= h; y++)
      for (let x = 0; x < w; x++) {
        const r = withException(L.ns[y * w + x]!, fl(x, y - 1), fl(x, y));
        if (r.e !== E.NONE) y < h ? setEdge(m, x, y, z, 0, -1, r.e, r.skin) : setEdge(m, x, y - 1, z, 0, 1, r.e, r.skin);
      }
  });
  // Furniture: its tiles HIGH or LOW by the cover it gives (a piece with none leaves them as they are).
  for (const f of b.furniture) {
    const cover = furnitureCover(f.kind);
    if (cover === "none") continue;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) if (tileAt(m, x, y, f.z) !== T.VOID) setTile(m, x, y, f.z, cover === "high" ? T.HIGH : T.LOW, furnitureSkin(f.kind));
  }
  // Vehicles: their tiles LOW "car" or HIGH "truck"; the floor under them kept for the look.
  m.vehicles = [];
  for (const v of b.vehicles) {
    const under = skinAt(m, v.x, v.y, v.z);
    const skin = vehicleSkin(v.kind), t = skin === "truck" ? T.HIGH : T.LOW;
    for (let y = v.y; y < v.y + v.h; y++) for (let x = v.x; x < v.x + v.w; x++) if (tileAt(m, x, y, v.z) !== T.VOID) setTile(m, x, y, v.z, t, skin);
    m.vehicles.push({ ...v, under, paint: v.paint >= 0 ? v.paint : paintFor(seed, v.x, v.y, v.z) });
  }
  m.furniture = b.furniture.map((f) => ({ ...f }));
  // Flights: their tiles on their level, open air over them on the next.
  for (const f of b.flights)
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) {
        setTile(m, x, y, f.z, T.FLIGHT, f.kind === "outdoor" ? "concrete" : "wood");
        setTile(m, x, y, f.z + 1, T.VOID, "none");
      }
  m.flights = b.flights.map((f) => ({ ...f }));
  m.lights = b.lights.map((l) => ({ ...l }));
  m.signs = b.signs.map((s) => ({ ...s }));
  m.canopies = b.canopies.map((c) => ({ ...c }));
  m.decor = b.decor.map((d) => ({ ...d }));
  m.bayLines = b.bayLines.map((l) => ({ ...l }));
  return m;
}

// ---------------------------------------------------------------------------
// Files

/** Characters for legends, in order (never space or "."). */
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*+=-~^!?:;<>/|()[]{}_'\"`,\\";

/** A new, empty block: bare ground of the terrain on the street level, no walls. */
export function newBlock(meta: BlockMeta, w = BLOCK, h = BLOCK, below = 0, above = 2): BlockData {
  const lv = Array.from({ length: below + above }, () => emptyLevel(w, h));
  const ground: Skin = meta.terrains[0] === "rural" ? "grass" : meta.terrains[0] === "industrial" ? "tarmac" : "pavement";
  lv[below]!.floor.fill(ground);
  return { ...meta, w, h, below, lv, furniture: [], flights: [], decor: [], lights: [], signs: [], canopies: [], vehicles: [], bayLines: [], nodes: [] };
}

const lists = (b: BlockData | BlockFile) => ({
  furniture: b.furniture.map((f) => ({ ...f })), flights: (b.flights ?? []).map((f) => ({ ...f })), decor: (b.decor ?? []).map((d) => ({ ...d })), lights: b.lights.map((l) => ({ ...l })), signs: b.signs.map((s) => ({ ...s })),
  canopies: b.canopies.map((c) => ({ ...c })), vehicles: b.vehicles.map((v) => ({ ...v })), bayLines: b.bayLines.map((l) => ({ ...l })),
  nodes: b.nodes.map((n) => ({ ...n, ...(n.links ? { links: [...n.links] } : {}) })),
});

const metaOf = (b: BlockMeta): BlockMeta => ({
  id: b.id, name: b.name, notes: b.notes ?? "", terrains: [...b.terrains], type: BLOCK_TYPES.includes(b.type) ? b.type : "structure",
  entrances: SIDES.filter((k) => b.entrances?.includes(k)),
  targets: [...b.targets], wallSet: [...(b.wallSet ?? [])],
});

/** A block as its file. */
export function toFile(b: BlockData): BlockFile {
  const legend = { floor: {} as Record<string, string>, obj: {} as Record<string, string>, edge: {} as Record<string, string> };
  const chars = { floor: new Map<string, string>(), obj: new Map<string, string>(), edge: new Map<string, string>() };
  const ch = (kind: keyof typeof legend, v: string, blank: string) => {
    if (!v) return blank;
    let c = chars[kind].get(v);
    if (!c) {
      c = CHARS[chars[kind].size];
      if (!c) throw new Error("block: too many kinds for one legend");
      chars[kind].set(v, c);
      legend[kind][c] = v;
    }
    return c;
  };
  const rows = (list: string[], width: number, kind: keyof typeof legend, blank: string) => {
    const out: string[] = [];
    for (let i = 0; i < list.length; i += width) out.push(list.slice(i, i + width).map((v) => ch(kind, v, blank)).join(""));
    return out;
  };
  const floors = b.lv.map((L) => ({
    floor: rows(L.floor, b.w, "floor", " "), obj: rows(L.obj, b.w, "obj", "."), ew: rows(L.ew, b.w + 1, "edge", "."), ns: rows(L.ns, b.w, "edge", "."),
  }));
  return { format: 2, ...metaOf(b), w: b.w, h: b.h, below: b.below, levels: b.lv.length, legend, floors, ...lists(b) };
}

/** A block from its file; throws, naming the block, on anything off. */
export function fromFile(raw: unknown): BlockData {
  const f = raw as BlockFile;
  if (!f || typeof f !== "object" || f.format !== 2) throw new Error("block: not a block (format 2)");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(f.id ?? "")) throw new Error(`block: bad id "${f.id}"`);
  if (!BLOCK_SIZES.some(([w, h]) => w === f.w && h === f.h)) throw new Error(`${f.id}: size ${f.w}×${f.h} isn't a block size`);
  if (!Array.isArray(f.floors) || f.floors.length !== f.levels || f.below < 0 || f.below >= f.levels) throw new Error(`${f.id}: levels don't add up`);
  for (const k of ["furniture", "flights", "decor", "lights", "signs", "canopies", "vehicles", "bayLines", "nodes", "terrains", "targets"] as const) if (!Array.isArray(f[k])) (f as unknown as Record<string, unknown[]>)[k] = [];
  const { w, h } = f;
  const unrows = (r: string[] | undefined, width: number, height: number, legend: Record<string, string>, what: string) => {
    if (!Array.isArray(r) || r.length !== height || r.some((s) => s.length !== width)) throw new Error(`${f.id}: a ${what} grid is the wrong size`);
    return r.flatMap((s) => [...s].map((c) => (c === " " || c === "." ? "" : legend[c] ?? "")));
  };
  const lv = f.floors.map((L) => ({
    floor: unrows(L.floor, w, h, f.legend?.floor ?? {}, "floor"),
    obj: unrows(L.obj, w, h, f.legend?.obj ?? {}, "object"),
    ew: unrows(L.ew, w + 1, h, f.legend?.edge ?? {}, "west edge"),
    ns: unrows(L.ns, w, h + 1, f.legend?.edge ?? {}, "north edge"),
  }));
  return { ...metaOf(f), w, h, below: f.below, lv, ...lists(f) };
}

/** A block as its file's text: rows one to a line, small objects and short lists on one. */
export function blockJson(b: BlockData): string {
  const prim = (x: unknown) => x === null || typeof x !== "object";
  const short = (v: unknown[]) => v.length <= 8 && v.every((x) => prim(x) && String(x).length <= 11);
  const flat = (v: unknown) => prim(v) || (Array.isArray(v) ? short(v) : Object.values(v as object).every((x) => prim(x) || (Array.isArray(x) && short(x))));
  const fmt = (v: unknown, ind: string): string => {
    const next = ind + "  ";
    if (Array.isArray(v)) {
      if (!v.length || short(v)) return JSON.stringify(v);
      return "[\n" + v.map((x) => next + (flat(x) ? JSON.stringify(x) : fmt(x, next))).join(",\n") + "\n" + ind + "]";
    }
    if (v && typeof v === "object") {
      const e = Object.entries(v as object).filter(([, x]) => x !== undefined);
      return "{\n" + e.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next)}`).join(",\n") + "\n" + ind + "}";
    }
    return JSON.stringify(v);
  };
  return fmt(toFile(b), "") + "\n";
}

// ---------------------------------------------------------------------------
// Turning and stamping

/** A quarter turn count, clockwise as drawn (y down): 0–3. */
export type Turn = 0 | 1 | 2 | 3;

/** Where block tile (x, y) lands once the block (w × h) is turned. */
function turnPt(x: number, y: number, w: number, h: number, r: Turn): { x: number; y: number } {
  return r === 0 ? { x, y } : r === 1 ? { x: h - 1 - y, y: x } : r === 2 ? { x: w - 1 - x, y: h - 1 - y } : { x: y, y: w - 1 - x };
}
/** A direction turned the same way. */
function turnDir(dx: number, dy: number, r: Turn): { x: number; y: number } {
  return r === 0 ? { x: dx, y: dy } : r === 1 ? { x: -dy, y: dx } : r === 2 ? { x: -dx, y: -dy } : { x: dy, y: -dx };
}
/** A side turned: where a block's front ends up. */
export function turnSide(s: Side, r: Turn): Side {
  const d = turnDir(SIDE_DIR[s][0], SIDE_DIR[s][1], r);
  return SIDES.find((k) => SIDE_DIR[k][0] === d.x && SIDE_DIR[k][1] === d.y)!;
}

/** A point in tiles (a corner, a tile's middle) once the block is turned: like turnPt, measured from the block's corner. */
function turnXY(x: number, y: number, w: number, h: number, r: Turn): { x: number; y: number } {
  return r === 0 ? { x, y } : r === 1 ? { x: h - y, y: x } : r === 2 ? { x: w - x, y: h - y } : { x: y, y: w - x };
}

function turnRect(x: number, y: number, rw: number, rh: number, w: number, h: number, r: Turn) {
  const a = turnPt(x, y, w, h, r), b = turnPt(x + rw - 1, y + rh - 1, w, h, r);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/**
 * Stamps a block onto a map, turned r quarter turns, its corner at (x0, y0)
 * and its street level on the map's ground. Tiles and the edges inside it
 * are written; an edge on its rim only when the block has one there (so a
 * neighbour's wall survives). Returns its nodes in map coordinates.
 */
export function stamp(m: BattleMap, b: BlockData, x0: number, y0: number, r: Turn = 0): BlockNode[] {
  const src = compile(b, m.seed);
  const dz = m.ground - b.below;
  if (dz < 0 || dz + b.lv.length > m.levels) throw new Error(`${b.id}: needs ${b.below} levels below and ${b.lv.length - b.below} above the street`);
  const P = (x: number, y: number) => {
    const p = turnPt(x, y, b.w, b.h, r);
    return { x: x0 + p.x, y: y0 + p.y };
  };
  for (let z = 0; z < b.lv.length; z++) {
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const t = tileAt(src, x, y, z);
        if (t === T.VOID) continue;
        const p = P(x, y);
        setTile(m, p.x, p.y, z + dz, t, skinAt(src, x, y, z));
      }
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
          const rim = x + dx < 0 || y + dy < 0 || x + dx >= b.w || y + dy >= b.h;
          // Inner edges once each (from the west or north tile); rim edges from inside.
          if (!rim && (dx < 0 || dy < 0)) continue;
          const e = edgeAt(src, x, y, z, dx, dy);
          if (rim && e === E.NONE) continue;
          const p = P(x, y), d = turnDir(dx, dy, r);
          setEdge(m, p.x, p.y, z + dz, d.x, d.y, e, edgeSkinAt(src, x, y, z, dx, dy));
        }
  }
  const at = (x: number, y: number) => P(x, y);
  for (const f of src.furniture) {
    const q = turnRect(f.x, f.y, f.w, f.h, b.w, b.h, r), d = turnDir(f.dx, f.dy, r);
    m.furniture.push({ ...f, x: x0 + q.x, y: y0 + q.y, w: q.w, h: q.h, z: f.z + dz, dx: d.x, dy: d.y });
  }
  for (const f of src.flights ?? []) {
    const q = turnRect(f.x, f.y, f.w, f.h, b.w, b.h, r), d = turnDir(f.dx, f.dy, r);
    (m.flights ??= []).push({ ...f, x: x0 + q.x, y: y0 + q.y, w: q.w, h: q.h, z: f.z + dz, dx: d.x, dy: d.y });
  }
  for (const dc of src.decor ?? []) {
    const p = turnXY(dc.x, dc.y, b.w, b.h, r), d = turnDir(dc.dx, dc.dy, r);
    (m.decor ??= []).push({ ...dc, x: x0 + p.x, y: y0 + p.y, z: dc.z + dz, dx: d.x, dy: d.y });
  }
  for (const l of src.lights) {
    const p = at(l.x, l.y);
    const wall = l.wall ? turnDir(l.wall[0], l.wall[1], r) : null;
    m.lights.push({ ...l, x: p.x, y: p.y, z: l.z + dz, ...(wall ? { wall: [wall.x, wall.y] as const } : {}) });
  }
  for (const s of src.signs) {
    const p = at(s.x, s.y), d = turnDir(s.dx, s.dy, r);
    m.signs.push({ ...s, x: p.x, y: p.y, z: s.z + dz, dx: d.x, dy: d.y });
  }
  for (const c of src.canopies) {
    const q = turnRect(c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1, b.w, b.h, r);
    m.canopies.push({ ...c, x0: x0 + q.x, y0: y0 + q.y, x1: x0 + q.x + q.w - 1, y1: y0 + q.y + q.h - 1, z: c.z + dz });
  }
  for (const v of src.vehicles) {
    const q = turnRect(v.x, v.y, v.w, v.h, b.w, b.h, r);
    const d = turnDir(v.w > v.h ? v.front : 0, v.w > v.h ? 0 : v.front, r);
    m.vehicles.push({ ...v, x: x0 + q.x, y: y0 + q.y, z: v.z + dz, w: q.w, h: q.h, front: (q.w > q.h ? d.x : d.y) as 1 | -1 });
  }
  for (const l of src.bayLines) {
    const p = at(l.x, l.y);
    m.bayLines.push({ x: p.x, y: p.y, alongX: r % 2 ? !l.alongX : l.alongX });
  }
  return b.nodes.map((n) => {
    const p = at(n.x, n.y);
    return { ...n, x: p.x, y: p.y, z: n.z + dz };
  });
}
