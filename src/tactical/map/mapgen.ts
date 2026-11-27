// Battle maps (docs/design/levels.md), seeded: the same request always gives
// the same map.
//
// Every setting but the lairs is assembled from blocks (blockgen.ts): roads
// first, as the dividers, then lots along them, each taking a block turned
// to face its road; the best of twenty candidates by approach, cover,
// sightlines and height. The lairs and Montségur are built whole (lair.ts).
//
// Every walkable tile must be reachable from the landing zone.
import { rng } from "../../sim/core/rng";
import { idx, reachable, type BattleMap, type Pt, type Setting } from "./map";
import { lair, lairSpawns } from "./lair";
import { blockMap, type Layout } from "./blockgen";
import { LANDMARKS, U } from "./blockbank";
import { repair, spawnsFor, lightsFor, shutDoors } from "./spawns";
import { dropBrokenVehicles, dropBrokenFurniture } from "./dressing";

export type SiteSize = "nest" | "den" | "haven" | "lair";

export interface MapRequest {
  setting: Setting;
  size: SiteSize;
  seed: number;
  thralls: number;
  vampires: number;
  civilians?: number;
  /** Prefer a hideout with a basement for the vampires (true) or without (false); default: any. */
  basement?: boolean;
  /** Snow on the ground (the look only). */
  winter?: boolean;
  /** Rain: drizzle and puddles (the look only; snow wins if both). */
  rain?: boolean;
  /** A town's recognisable building, made the hideout (the vampires, any prisoner). */
  landmark?: "hospital" | "store";
  /** "long": the 4 × 7 map of an extraction (a rescue: in at one end, the prisoner at the other). */
  layout?: Layout;
}

/** The lairs' side in tiles (built whole). */
export const MAP_SIZE = { lair: 44 } as const;
/** Units a side of a square block map: 5 (40 tiles) for a nest, 6 (48) for a den or haven. */
const UNITS: Record<SiteSize, number> = { nest: 5, den: 6, haven: 6, lair: 6 };
/** A map's width and height in tiles. */
export const mapDims = (setting: Setting, size: SiteSize, layout: Layout = "square") => {
  if (setting === "lair" || setting === "montsegur") return { w: MAP_SIZE.lair, h: MAP_SIZE.lair };
  if (layout === "long") return { w: 4 * U, h: 7 * U };
  return { w: UNITS[size] * U, h: UNITS[size] * U };
};
/** A square map's side in tiles. */
export const mapSize = (setting: Setting, size: SiteSize) => mapDims(setting, size).w;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export const rw = (r: Rect) => r.x1 - r.x0 + 1;
export const rh = (r: Rect) => r.y1 - r.y0 + 1;
export const inset = (r: Rect, d: number): Rect => ({
  x0: r.x0 + d,
  y0: r.y0 + d,
  x1: r.x1 - d,
  y1: r.y1 - d,
});
export const centre = (r: Rect): Pt => ({
  x: Math.floor((r.x0 + r.x1) / 2),
  y: Math.floor((r.y0 + r.y1) / 2),
});
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const overlaps = (a: Rect, b: Rect, margin = 0) =>
  a.x0 - margin <= b.x1 && b.x0 - margin <= a.x1 && a.y0 - margin <= b.y1 && b.y0 - margin <= a.y1;

/** A building as placed: where its rooms are on each level, for spawns. */
export interface Building {
  rect: Rect;
  /** Levels of its storeys (ground first), then its roof. */
  storeys: number[];
  roof: number;
  basement: number | null;
  /** Room interiors (shared by every storey). */
  rooms: Rect[];
  basementRooms: Rect[];
  stair: Pt;
}

/** Tries a seed until a map comes out fully connected. */
export function generateMap(req: MapRequest): BattleMap {
  if (req.setting !== "lair" && req.setting !== "montsegur") return fromBlocks(req);
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = rng({ rng: (req.seed + attempt * 7919) >>> 0 });
    const m = lair(req, r);
    if (!repair(m)) continue;
    dropBrokenVehicles(m);
    dropBrokenFurniture(m);
    m.spawns = lairSpawns(m, r, req);
    m.lights = [...m.lights, ...lightsFor(m, r)];
    const seen = reachable(m, m.lz[0]!);
    if (m.spawns.every((s) => seen[idx(m, s.x, s.y, s.z)])) return m;
  }
  throw new Error(`No connected map for seed ${req.seed}`);
}

const TERRAIN = {
  urban: "light",
  rural: "rural",
  apartments: "dense",
  industrial: "industrial",
} as const;

/** A map from blocks. */
function fromBlocks(req: MapRequest): BattleMap {
  const terrain = TERRAIN[req.setting as keyof typeof TERRAIN];
  const { m, buildings } = blockMap({
    seed: req.seed,
    terrain,
    size: UNITS[req.size],
    layout: req.layout ?? "square",
    target: req.size === "lair" ? "haven" : req.size,
    targetId:
      req.landmark && (terrain === "light" || terrain === "dense")
        ? LANDMARKS[req.landmark]
        : undefined,
    basement: req.basement,
  });
  const r = rng({ rng: (req.seed ^ 0x5bd1e995) >>> 0 });
  m.winter = !!req.winter;
  m.rain = !m.winter && !!req.rain;
  m.spawns = spawnsFor(m, r, req, buildings);
  m.lights = [...m.lights, ...lightsFor(m, r)];
  shutDoors(m, r);
  return m;
}
