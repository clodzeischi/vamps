// The battlescape grid (docs/WEB_PORT.md 3.11): w × h tiles on several whole
// levels. Level indices run from 0 (the lowest: a basement if there is one)
// up; `ground` is the street level. Walls fill whole tiles. Plain data, no DOM.

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
] as const;
export type Skin = (typeof SKINS)[number];
export const SKIN: Record<Skin, number> = Object.fromEntries(SKINS.map((s, i) => [s, i])) as Record<Skin, number>;

export type Setting = "urban" | "rural";

export interface Pt { x: number; y: number }
export interface Pt3 extends Pt { z: number }

export interface Spawn extends Pt3 {
  side: "thrall" | "vampire" | "civilian";
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
}

export function emptyMap(w: number, h: number, levels: number, ground: number, setting: Setting, seed: number): BattleMap {
  return { w, h, levels, ground, setting, seed, tiles: new Uint8Array(w * h * levels), skin: new Uint8Array(w * h * levels), lz: [], spawns: [] };
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

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * The tiles one step from a tile: the eight around it on its level (no
 * cutting a corner past something you can't walk through), and up or down a
 * staircase.
 */
export function neighbours(m: BattleMap, p: Pt3): Pt3[] {
  const out: Pt3[] = [];
  for (const [dx, dy] of DIRS8) {
    const x = p.x + dx, y = p.y + dy;
    if (!walkable(m, x, y, p.z)) continue;
    if (dx && dy && (!walkable(m, p.x + dx, p.y, p.z) || !walkable(m, p.x, p.y + dy, p.z))) continue;
    out.push({ x, y, z: p.z });
  }
  if (tileAt(m, p.x, p.y, p.z) === T.STAIRS && walkable(m, p.x, p.y, p.z + 1)) out.push({ x: p.x, y: p.y, z: p.z + 1 });
  if (tileAt(m, p.x, p.y, p.z - 1) === T.STAIRS) out.push({ x: p.x, y: p.y, z: p.z - 1 });
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
  if (z < m.ground) return z === m.ground - 1 ? "Basement" : `Basement ${m.ground - z}`;
  if (z === m.ground) return "Ground floor";
  return `Floor ${z - m.ground + 1}`;
}
