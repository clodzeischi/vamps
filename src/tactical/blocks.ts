// Map blocks (docs/design/levels.md): authored pieces of a battle map, 12 × 12
// tiles or a multiple, every level of them, as X-COM's map blocks. A map
// script places them on a grid, turned to fit; this file holds the format,
// its conversion to and from a BattleMap (what the editor edits and the
// battle view draws), and stamping a block, turned, onto a map.
//
// The file format is JSON meant to read in a diff: each level is rows of
// characters, one per tile, and two grids of edges (the west edge of each
// tile, w + 1 to a row; the north edge, h + 1 rows), each character looked
// up in the block's legends ("floor:indoor", "wall:brick"). A space is
// nothing (VOID) and "." no edge. Everything else is plain lists.
//
// To add a kind of anything (a terrain, a node role, a mission), add it to
// the lists below: the editor builds its menus from them.
import {
  E, emptyMap, edgeAt, edgeSkinAt, setEdge, setTile, SKINS, T, tileAt, skinAt,
  type BattleMap, type Canopy, type EdgeKind, type Furniture, type Light, type Setting, type Sign, type Skin, type TileKind, type Vehicle,
} from "./map";

export const BLOCK = 12;
/** The sizes a block can be, in tiles (w × h). */
export const BLOCK_SIZES: readonly (readonly [number, number])[] = [[12, 12], [24, 12], [12, 24], [24, 24]];

export const TERRAINS = ["dense", "light", "rural", "industrial"] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_NAME: Record<Terrain, string> = { dense: "Dense urban", light: "Light urban", rural: "Rural", industrial: "Industrial" };

/** What a block is, for a map script: a road piece, a building, open ground… */
export const BLOCK_KINDS = ["building", "road", "road_junction", "road_t", "road_corner", "road_end", "yard", "open", "landing"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

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
  kind: BlockKind;
  fronts: Side[];
  targets: Target[];
  /** Wall skins a map may swap the block's main wall skin for (empty: keep it). */
  wallSet?: Skin[];
}

interface LevelRows { tiles: string[]; ew: string[]; ns: string[] }

/** A block as saved. */
export interface Block extends BlockMeta {
  format: 1;
  w: number;
  h: number;
  /** Levels below the street (basements). */
  below: number;
  /** Levels in all, bottom up: basements, the ground floor, storeys, the roof. */
  levels: number;
  /** "kind:skin" for each tile character. */
  tileLegend: Record<string, string>;
  /** "kind:skin" for each edge character. */
  edgeLegend: Record<string, string>;
  floors: LevelRows[];
  furniture: Furniture[];
  lights: Light[];
  signs: Sign[];
  canopies: Canopy[];
  vehicles: Vehicle[];
  bayLines: { x: number; y: number; alongX: boolean }[];
  nodes: BlockNode[];
}

const TILE_NAMES: Record<TileKind, string> = { 0: "void", 1: "floor", 2: "wall", 3: "window", 4: "door", 5: "low", 6: "high", 7: "stairs" };
const TILE_BY_NAME = Object.fromEntries(Object.entries(TILE_NAMES).map(([k, v]) => [v, Number(k) as TileKind])) as Record<string, TileKind>;
const EDGE_NAMES: Record<EdgeKind, string> = { 0: "none", 1: "wall", 2: "window", 3: "door", 4: "shut", 5: "glass", 6: "sill" };
const EDGE_BY_NAME = Object.fromEntries(Object.entries(EDGE_NAMES).map(([k, v]) => [v, Number(k) as EdgeKind])) as Record<string, EdgeKind>;
/** Characters for legends, in order (never space or "."). */
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*+=-~^!?:;<>/|()[]{}_'\"`,\\";

/** The battle setting a block is drawn as on its own (its terrain's look: kerbs in towns). */
export function settingFor(b: Pick<BlockMeta, "terrains">): Setting {
  const t = b.terrains[0] ?? "light";
  return t === "dense" ? "apartments" : t === "light" ? "urban" : t;
}

/** A block as a map of its own size (to edit, draw, or stamp from). */
export function blockMap(b: Block): BattleMap {
  const m = emptyMap(b.w, b.h, b.levels, b.below, settingFor(b), 0);
  const tile = (c: string) => {
    const [k, s] = (b.tileLegend[c] ?? "void:none").split(":");
    return { t: TILE_BY_NAME[k!] ?? T.VOID, skin: (SKINS as readonly string[]).includes(s!) ? (s as Skin) : "none" };
  };
  const edge = (c: string) => {
    if (c === "." || c === undefined) return null;
    const [k, s] = (b.edgeLegend[c] ?? "none:none").split(":");
    return { e: EDGE_BY_NAME[k!] ?? E.NONE, skin: (SKINS as readonly string[]).includes(s!) ? (s as Skin) : "none" };
  };
  b.floors.forEach((f, z) => {
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const c = f.tiles[y]?.[x] ?? " ";
        if (c === " ") continue;
        const { t, skin } = tile(c);
        setTile(m, x, y, z, t, skin);
      }
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x <= b.w; x++) {
        const e = edge(f.ew[y]?.[x] ?? ".");
        // The west edge of tile x (x = w: the east edge of the last tile).
        if (e) x < b.w ? setEdge(m, x, y, z, -1, 0, e.e, e.skin) : setEdge(m, x - 1, y, z, 1, 0, e.e, e.skin);
      }
    for (let y = 0; y <= b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const e = edge(f.ns[y]?.[x] ?? ".");
        if (e) y < b.h ? setEdge(m, x, y, z, 0, -1, e.e, e.skin) : setEdge(m, x, y - 1, z, 0, 1, e.e, e.skin);
      }
  });
  m.furniture = b.furniture.map((f) => ({ ...f }));
  m.lights = b.lights.map((l) => ({ ...l }));
  m.signs = b.signs.map((s) => ({ ...s }));
  m.canopies = b.canopies.map((c) => ({ ...c }));
  m.vehicles = b.vehicles.map((v) => ({ ...v }));
  m.bayLines = b.bayLines.map((l) => ({ ...l }));
  return m;
}

/** A map (of the block's size) back into a block, with its metadata and nodes. */
export function toBlock(m: BattleMap, meta: BlockMeta, nodes: BlockNode[]): Block {
  const tileLegend: Record<string, string> = {}, edgeLegend: Record<string, string> = {};
  const tileChar = new Map<string, string>(), edgeChar = new Map<string, string>();
  const charFor = (key: string, map: Map<string, string>, legend: Record<string, string>) => {
    let c = map.get(key);
    if (!c) {
      c = CHARS[map.size];
      if (!c) throw new Error("block: too many kinds of tile or edge for one legend");
      map.set(key, c);
      legend[c] = key;
    }
    return c;
  };
  const tc = (x: number, y: number, z: number) => {
    const t = tileAt(m, x, y, z);
    return t === T.VOID ? " " : charFor(`${TILE_NAMES[t]}:${skinAt(m, x, y, z)}`, tileChar, tileLegend);
  };
  const ec = (x: number, y: number, z: number, dx: number, dy: number) => {
    const e = edgeAt(m, x, y, z, dx, dy);
    return e === E.NONE ? "." : charFor(`${EDGE_NAMES[e]}:${edgeSkinAt(m, x, y, z, dx, dy)}`, edgeChar, edgeLegend);
  };
  const floors: LevelRows[] = [];
  for (let z = 0; z < m.levels; z++) {
    const tiles: string[] = [], ew: string[] = [], ns: string[] = [];
    for (let y = 0; y < m.h; y++) {
      let row = "";
      for (let x = 0; x < m.w; x++) row += tc(x, y, z);
      tiles.push(row);
      let e = "";
      for (let x = 0; x <= m.w; x++) e += x < m.w ? ec(x, y, z, -1, 0) : ec(x - 1, y, z, 1, 0);
      ew.push(e);
    }
    for (let y = 0; y <= m.h; y++) {
      let row = "";
      for (let x = 0; x < m.w; x++) row += y < m.h ? ec(x, y, z, 0, -1) : ec(x, y - 1, z, 0, 1);
      ns.push(row);
    }
    floors.push({ tiles, ew, ns });
  }
  return {
    format: 1, ...meta, w: m.w, h: m.h, below: m.ground, levels: m.levels, tileLegend, edgeLegend, floors,
    furniture: m.furniture.map((f) => ({ ...f })), lights: m.lights.map((l) => ({ ...l })), signs: m.signs.map((s) => ({ ...s })),
    canopies: m.canopies.map((c) => ({ ...c })), vehicles: m.vehicles.map((v) => ({ ...v })), bayLines: m.bayLines.map((l) => ({ ...l })),
    nodes: nodes.map((n) => ({ ...n })),
  };
}

/** A new, empty block: bare floor of the terrain's ground on the street level. */
export function newBlock(meta: BlockMeta, w = BLOCK, h = BLOCK, below = 0, above = 2): Block {
  const m = emptyMap(w, h, below + above, below, settingFor(meta), 0);
  const ground: Skin = meta.terrains[0] === "rural" ? "grass" : meta.terrains[0] === "industrial" ? "tarmac" : "pavement";
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setTile(m, x, y, below, T.FLOOR, ground);
  return toBlock(m, meta, []);
}

/** Checks a block's shape before it's used: sizes, rows, legends. Throws on anything off. */
export function checkBlock(raw: unknown): Block {
  const b = raw as Block;
  if (!b || typeof b !== "object" || b.format !== 1) throw new Error("block: not a block (format 1)");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(b.id ?? "")) throw new Error(`block: bad id "${b.id}"`);
  if (!BLOCK_SIZES.some(([w, h]) => w === b.w && h === b.h)) throw new Error(`${b.id}: size ${b.w}×${b.h} isn't a block size`);
  if (!Array.isArray(b.floors) || b.floors.length !== b.levels || b.below < 0 || b.below >= b.levels) throw new Error(`${b.id}: levels don't add up`);
  for (const f of b.floors) {
    if (f.tiles.length !== b.h || f.tiles.some((r) => r.length !== b.w)) throw new Error(`${b.id}: a tile grid is the wrong size`);
    if (f.ew.length !== b.h || f.ew.some((r) => r.length !== b.w + 1)) throw new Error(`${b.id}: an edge grid (west) is the wrong size`);
    if (f.ns.length !== b.h + 1 || f.ns.some((r) => r.length !== b.w)) throw new Error(`${b.id}: an edge grid (north) is the wrong size`);
  }
  for (const k of ["furniture", "lights", "signs", "canopies", "vehicles", "bayLines", "nodes", "terrains", "fronts", "targets"] as const) if (!Array.isArray(b[k])) (b as unknown as Record<string, unknown[]>)[k] = [];
  return b;
}

/** A block as its file: JSON that reads in a diff (rows one to a line, small objects and short lists on one). */
export function blockJson(b: Block): string {
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
  return fmt(b, "") + "\n";
}

// ---------------------------------------------------------------------------
// Turning and stamping

/** A quarter turn count, clockwise as drawn (y down): 0–3. */
export type Turn = 0 | 1 | 2 | 3;

/** Where block tile (x, y) lands once the block (w × h) is turned. */
export function turnPt(x: number, y: number, w: number, h: number, r: Turn): { x: number; y: number } {
  return r === 0 ? { x, y } : r === 1 ? { x: h - 1 - y, y: x } : r === 2 ? { x: w - 1 - x, y: h - 1 - y } : { x: y, y: w - 1 - x };
}
/** A direction turned the same way. */
export function turnDir(dx: number, dy: number, r: Turn): { x: number; y: number } {
  return r === 0 ? { x: dx, y: dy } : r === 1 ? { x: -dy, y: dx } : r === 2 ? { x: -dx, y: -dy } : { x: dy, y: -dx };
}
/** A side turned: where a block's front ends up. */
export function turnSide(s: Side, r: Turn): Side {
  const d = turnDir(SIDE_DIR[s][0], SIDE_DIR[s][1], r);
  return SIDES.find((k) => SIDE_DIR[k][0] === d.x && SIDE_DIR[k][1] === d.y)!;
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
export function stamp(m: BattleMap, b: Block, x0: number, y0: number, r: Turn = 0): BlockNode[] {
  const src = blockMap(b);
  const dz = m.ground - b.below;
  if (dz < 0 || dz + b.levels > m.levels) throw new Error(`${b.id}: needs ${b.below} levels below and ${b.levels - b.below} above the street`);
  const P = (x: number, y: number) => {
    const p = turnPt(x, y, b.w, b.h, r);
    return { x: x0 + p.x, y: y0 + p.y };
  };
  for (let z = 0; z < b.levels; z++) {
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
