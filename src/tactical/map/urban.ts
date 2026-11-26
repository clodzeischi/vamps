// Urban maps: a street grid, a building on each lot between the roads.
import { type Rng } from "../../sim/core/rng";
import { hospital, petrolStation, supermarket } from "./sites";
import { isTown, skinAt, T, VEHICLE_LENGTH, type BattleMap } from "./map";
import {
  ROAD_W,
  type Rect,
  rw,
  rh,
  type MapRequest,
  type Building,
  inset,
  PAVE,
  centre,
  dist,
} from "./mapgen";
import {
  fill,
  isRoad,
  someVehicle,
  vehicle,
  streetSides,
  plazaTrees,
  houseLot,
  carPark,
  park,
  streetTrees,
  landingZone,
} from "./dressing";

// ---------------------------------------------------------------------------
// Urban

/**
 * Where a road crosses an axis: its first tile, leaving a block of at least
 * 13 either side (the block holds its pavement and a lot).
 */
function roadAt(r: Rng, n: number): number {
  const lo = 13,
    hi = n - ROAD_W - 13;
  return hi <= lo ? Math.floor((n - ROAD_W) / 2) : r.int(lo, hi);
}

/**
 * The town's streets: a road down (x = px … px + 7) and one across (y = py …),
 * crossing; or, a time in three, one of them stops at the other (a T). Parked
 * vehicles along the outer lanes, the odd one stopped in the road; none near
 * a junction (the crossings).
 */
function streets(m: BattleMap, r: Rng): { blocks: Rect[] } {
  const n = m.w,
    g = m.ground;
  const px = roadAt(r, n),
    py = roadAt(r, n);
  const down: Rect = { x0: px, y0: 0, x1: px + ROAD_W - 1, y1: n - 1 };
  const across: Rect = { x0: 0, y0: py, x1: n - 1, y1: py + ROAD_W - 1 };
  if (r.chance(0.33)) {
    // A T: one road ends at the other.
    const stem = r.chance(0.5) ? down : across;
    const low = r.chance(0.5);
    if (stem === down) low ? (down.y1 = py - 1) : (down.y0 = py + ROAD_W);
    else low ? (across.x1 = px - 1) : (across.x0 = px + ROAD_W);
  }
  for (const rd of [down, across]) fill(m, rd, g, T.FLOOR, "road");
  const isRoad = (x: number, y: number) => skinAt(m, x, y, g) === "road";
  const inJunction = (x: number, y: number) =>
    x >= px && x < px + ROAD_W && y >= py && y < py + ROAD_W;
  /** Tiles to the nearest junction tile along a road (far: 99). */
  const toJunction = (x: number, y: number) => {
    let d = 99;
    for (let k = 0; k < n; k++)
      for (const [ax, ay] of [
        [x + k, y],
        [x - k, y],
        [x, y + k],
        [x, y - k],
      ] as const)
        if (inJunction(ax, ay)) d = Math.min(d, k);
    return d;
  };
  // Blocks: what the roads leave, as rectangles (each a pavement round a lot),
  // found before anything is parked on the roads.
  const blocks: Rect[] = [];
  const seen = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (seen[y * n + x] || isRoad(x, y)) continue;
      let x1 = x;
      while (x1 + 1 < n && !isRoad(x1 + 1, y)) x1++;
      let y1 = y;
      while (y1 + 1 < n && !isRoad(x, y1 + 1)) y1++;
      for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) seen[j * n + i] = 1;
      blocks.push({ x0: x, y0: y, x1, y1 });
    }
  // Along each road: its two parking lanes (traffic keeps right, so cars face
  // the way their side's traffic runs), and now and then one in a traffic lane.
  for (const [rd, alongX] of [
    [down, false],
    [across, true],
  ] as const) {
    const len = alongX ? rw(rd) : rh(rd);
    const at = (i: number, lane: number) =>
      alongX ? { x: rd.x0 + i, y: rd.y0 + lane } : { x: rd.x0 + lane, y: rd.y0 + i };
    for (const [lane, front] of [
      [0, alongX ? -1 : 1],
      [ROAD_W - 2, alongX ? 1 : -1],
    ] as const) {
      let i = r.int(0, 3);
      while (i < len) {
        const kind = someVehicle(r);
        const vl = VEHICLE_LENGTH[kind];
        const a = at(i, lane),
          b = at(i + vl - 1, lane);
        const clear = toJunction(a.x, a.y) > 3 && toJunction(b.x, b.y) > 3 && isRoad(b.x, b.y);
        if (clear && r.chance(0.55) && vehicle(m, r, a.x, a.y, alongX, kind, front))
          i += vl + r.int(1, 3);
        else i += r.int(1, 3);
      }
    }
    if (r.chance(0.45)) {
      const lane = r.pick([2, 4]);
      const i = r.int(2, len - 8);
      const a = at(i, lane),
        b = at(i + 3, lane);
      if (toJunction(a.x, a.y) > 3 && toJunction(b.x, b.y) > 3)
        vehicle(
          m,
          r,
          a.x,
          a.y,
          alongX,
          someVehicle(r),
          lane === 2 ? (alongX ? -1 : 1) : alongX ? 1 : -1,
        );
    }
  }
  return { blocks };
}

/**
 * The 3 × 3 tiles at a block's corner on a junction, where the kerb is
 * rounded and the lot's corner with it (the renderer cuts them): nothing
 * stands there.
 */
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

/** Back wall, wards, the corridor and a lobby on the street (sites.ts corridorPlan). */
const HOSPITAL_DEPTH = 7;

/** Null: this layout has no lot for the landmark. */
export function urban(
  m: BattleMap,
  r: Rng,
  basement: boolean,
  landmark?: MapRequest["landmark"],
): Building[] | null {
  const n = m.w;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, m.ground, T.FLOOR, "pavement");
  const { blocks } = streets(m, r);

  // Lots: the blocks between roads, a pavement round each.
  const lots: Rect[] = blocks.map((b) => inset(b, PAVE)).filter((l) => rw(l) >= 5 && rh(l) >= 5);
  // Big lots split in two by an alley.
  for (let i = 0; i < lots.length; i++) {
    const l = lots[i]!;
    if (rw(l) >= 15 && rw(l) >= rh(l)) {
      const s = r.int(l.x0 + 6, l.x1 - 6);
      lots.splice(i--, 1, { ...l, x1: s - 1 }, { ...l, x0: s + 1 });
    } else if (rh(l) >= 15) {
      const s = r.int(l.y0 + 6, l.y1 - 6);
      lots.splice(i--, 1, { ...l, y1: s - 1 }, { ...l, y0: s + 1 });
    }
  }
  // The landing plaza: a lot on the edge of the map.
  const onEdge = lots.filter((l) => l.x0 <= 1 || l.y0 <= 1 || l.x1 >= n - 2 || l.y1 >= n - 2);
  const plaza = r.pick(onEdge.length ? onEdge : lots);
  const lzAt = centre(plaza);
  // The hideout: the biggest lot of those farthest from the plaza.
  const buildable = lots.filter((l) => l !== plaza && rw(l) >= 5 && rh(l) >= 5);
  const far = [...buildable].sort((a, b) => dist(centre(b), lzAt) - dist(centre(a), lzAt));
  // A landmark (a hospital, a supermarket) is the hideout: the biggest lot on a street in the far half.
  const street = (l: Rect) => streetSides(m, l).length > 0;
  // (Its smaller side counts most: a deep enough hall or wards either side of a corridor.)
  const roomy = (l: Rect) => Math.min(rw(l), rh(l)) * 100 + rw(l) * rh(l);
  const hideoutLot = landmark
    ? (far
        .slice(0, Math.max(2, Math.ceil(far.length / 2)))
        .filter(street)
        .sort((a, b) => roomy(b) - roomy(a))[0] ?? far[0])
    : far.slice(0, 2).sort((a, b) => rw(b) * rh(b) - rw(a) * rh(a))[0];
  // At least two buildings, and the far side of the map built up.
  const forced = new Set(far.slice(0, Math.max(2, Math.ceil(buildable.length * 0.4))));

  // Now and then a petrol station on a big lot on a street.
  const fuelOpts = buildable.filter(
    (l) => l !== hideoutLot && !forced.has(l) && rw(l) >= 10 && rh(l) >= 10 && street(l),
  );
  const fuelLot = fuelOpts.length && r.chance(0.55) ? r.pick(fuelOpts) : null;

  const buildings: Building[] = [];
  for (const lot of lots) {
    if (lot === plaza) {
      fill(m, lot, m.ground, T.FLOOR, "stone");
      plazaTrees(m, r, lot, lzAt);
      continue;
    }
    const isHideout = lot === hideoutLot;
    const front = streetSides(m, lot)[0];
    if (isHideout && landmark && front !== undefined) {
      // Too shallow for the lobby: another map.
      if (landmark === "hospital" && (front < 2 ? rh(lot) : rw(lot)) < HOSPITAL_DEPTH) return null;
      buildings.push(
        (landmark === "hospital" ? hospital : supermarket)(m, r, lot, front, basement),
      );
      continue;
    }
    if (lot === fuelLot && front !== undefined) {
      const station = petrolStation(m, r, lot, front);
      if (station) {
        buildings.push(station);
        continue;
      }
    }
    const roll = r.next();
    if (isHideout || forced.has(lot) || (rw(lot) >= 6 && rh(lot) >= 6 && roll < 0.65))
      buildings.push(houseLot(m, r, lot, isHideout, basement, !isHideout && r.chance(0.25)));
    else if (roll >= 0.8 || !carPark(m, r, lot)) park(m, r, lot);
  }
  streetTrees(m, r, plaza);
  m.lz = landingZone(m, lzAt);
  return buildings;
}
