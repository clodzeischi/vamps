// Crude procedural battlescapes (docs/design/tactical.md), seeded: the same
// request always gives the same map.
//
// Urban: a street grid; each lot between the roads holds a building (rooms
// split by BSP, doors, windows, stairs to an upper floor and a roof), a park
// or a car park, and one lot is the plaza where the team lands. Rural: a
// farmhouse, a barn and sheds by a dirt road, fenced fields, hedges and trees.
// The bloodline's hideout is the building farthest from the landing zone,
// often with a basement where the vampires sleep.
//
// Plans are drawn with walls a tile thick, then thinned: each wall tile
// becomes floor of the room beside it, and the wall stands on the edge
// between tiles (XCOM style). Rooms gain the space the walls took.
//
// Every walkable tile must be reachable from the landing zone. Props that
// wall a pocket off are cleared; a map that still fails is generated again.
import { rng } from "../../sim/core/rng";
import { apartments, APARTMENT_STOREYS } from "./apartments";
import { industrial } from "./industrial";
import { emptyMap, idx, reachable, type BattleMap, type Pt, type Setting } from "./map";
import { lair, lairSpawns } from "./lair";
import { blockMap } from "./blockgen";
import { urban } from "./urban";
import { rural } from "./rural";
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
  /** Put the hideout's vampires in a basement (default: likelier the bigger the site). */
  basement?: boolean;
  /** Snow on the ground (the look only). */
  winter?: boolean;
  /** Rain: drizzle and puddles (the look only; snow wins if both). */
  rain?: boolean;
  /** A town's recognisable building, made the hideout (the vampires, any prisoner). */
  landmark?: "hospital" | "store";
  /** Light urban from authored blocks (proof of concept, tactical/map/blockgen.ts). */
  blocks?: boolean;
}

export const MAP_SIZE: Record<SiteSize, number> = { nest: 28, den: 32, haven: 36, lair: 44 };
/** Towns are bigger: their roads are near real width (ROAD_W) with pavements (PAVE). */
const URBAN_SIZE: Record<SiteSize, number> = { nest: 38, den: 44, haven: 50, lair: 44 };
/** An apartment block and its street: small, but tall (APARTMENT_STOREYS). */
const APARTMENT_SIZE: Record<SiteSize, number> = { nest: 34, den: 38, haven: 42, lair: 42 };
/** A works yard with its warehouse and street. */
const INDUSTRIAL_SIZE: Record<SiteSize, number> = { nest: 36, den: 40, haven: 44, lair: 44 };
/** A map's side in tiles. */
export const mapSize = (setting: Setting, size: SiteSize) => {
  if (setting === "lair" || setting === "montsegur") return MAP_SIZE.lair;
  return (
    setting === "urban"
      ? URBAN_SIZE
      : setting === "apartments"
        ? APARTMENT_SIZE
        : setting === "industrial"
          ? INDUSTRIAL_SIZE
          : MAP_SIZE
  )[size];
};
/** A town road: a parking lane, two traffic lanes, a parking lane (2 tiles each). */
export const ROAD_W = 8;
export const PAVE = 2;
/** Storeys a building can have above the ground floor (its roof sits on top). */
export const MAX_UPPER = 1;

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

/** One attempt at a map, before validation (exported for debugging). */
function buildMap(req: MapRequest, attempt = 0) {
  const seed = (req.seed + attempt * 7919) >>> 0;
  const r = rng({ rng: seed });
  if (req.setting === "lair" || req.setting === "montsegur")
    return { m: lair(req, r), r, buildings: [] as Building[] };
  // The blood bank is always below the warehouse.
  const basement =
    req.setting === "industrial" || (req.basement ?? r.chance(req.size === "nest" ? 0.5 : 0.8));
  const n = mapSize(req.setting, req.size);
  const ground = basement ? 1 : 0;
  // Storeys above the ground floor, then the roof.
  const upper = req.setting === "apartments" ? APARTMENT_STOREYS[req.size] - 1 : MAX_UPPER;
  const m = emptyMap(n, n, ground + upper + 2, ground, req.setting, req.seed);
  m.winter = !!req.winter;
  m.rain = !m.winter && !!req.rain;
  const buildings =
    req.setting === "urban"
      ? urban(m, r, basement, req.landmark)
      : req.setting === "apartments"
        ? apartments(m, r, basement)
        : req.setting === "industrial"
          ? industrial(m, r)
          : rural(m, r, basement);
  return { m, r, buildings };
}

/** Tries a seed until a map comes out fully connected (it nearly always does first time). */
export function generateMap(req: MapRequest): BattleMap {
  if (req.blocks) return fromBlocks(req);
  for (let attempt = 0; attempt < 20; attempt++) {
    const { m, r, buildings } = buildMap(req, attempt);
    if (!buildings || !repair(m)) continue;
    dropBrokenVehicles(m);
    dropBrokenFurniture(m);
    const deep = m.setting === "lair" || m.setting === "montsegur";
    m.spawns = deep ? lairSpawns(m, r, req) : spawnsFor(m, r, req, buildings);
    m.lights = [...m.lights, ...lightsFor(m, r)];
    if (!deep) shutDoors(m, r);
    const seen = reachable(m, m.lz[0]!);
    if (m.spawns.every((s) => seen[idx(m, s.x, s.y, s.z)])) return m;
  }
  throw new Error(`No connected map for seed ${req.seed}`);
}

/** A light-urban map from blocks: 4 × 4 slots for a nest or den, 5 × 5 for a haven. */
function fromBlocks(req: MapRequest): BattleMap {
  const { m, buildings } = blockMap(
    req.seed,
    req.size === "haven" ? 5 : 4,
    req.size === "den" ? "den" : "nest",
  );
  const r = rng({ rng: (req.seed ^ 0x5bd1e995) >>> 0 });
  m.winter = !!req.winter;
  m.rain = !m.winter && !!req.rain;
  m.spawns = spawnsFor(m, r, req, buildings);
  m.lights = [...m.lights, ...lightsFor(m, r)];
  shutDoors(m, r);
  return m;
}
