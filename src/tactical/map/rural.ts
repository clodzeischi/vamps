// Rural maps: a farm and its fields.
import { type Rng } from "../../sim/core/rng";
import { setTile, skinAt, T, tileAt, type BattleMap, type Pt, type VehicleKind } from "./map";
import { type Building, type Rect, overlaps, MAX_UPPER, dist, centre } from "./mapgen";
import { fill, vehicle, prop, landingZone } from "./dressing";
import { placeBuilding, HOUSE, type BuildingStyle } from "./buildings";

// ---------------------------------------------------------------------------
// Rural

export function rural(m: BattleMap, r: Rng, basement: boolean): Building[] {
  const n = m.w;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, m.ground, T.FLOOR, "grass");
  const lots = new Lots(n, r);
  // A dirt road across the map, four wide (a country lane, room to pass).
  const horizontal = r.chance(0.5);
  const at = r.int(Math.floor(n * 0.3), Math.floor(n * 0.6));
  const road: Rect = horizontal
    ? { x0: 0, y0: at, x1: n - 1, y1: at + 3 }
    : { x0: at, y0: 0, x1: at + 3, y1: n - 1 };
  fill(m, road, m.ground, T.FLOOR, "dirt");
  lots.taken.push(road);

  const buildings: Building[] = [];
  const houseRect = lots.place(r.int(8, 11), r.int(7, 9), road);
  if (houseRect) {
    const style = { ...HOUSE, wall: "plaster" as const, windowChance: 0.4 };
    buildings.push(placeBuilding(m, r, houseRect, MAX_UPPER, style, basement));
  }
  const barnRect = lots.place(r.int(10, 13), r.int(8, 10), houseRect ?? road);
  if (barnRect) buildings.push(barn(m, r, barnRect));
  for (let k = r.int(1, 2); k > 0; k--) {
    const shed = lots.place(r.int(5, 6), r.int(5, 6), houseRect ?? undefined);
    if (shed) buildings.push(placeBuilding(m, r, shed, 0, SHED, false));
  }
  // A car or tractor by the house.
  if (houseRect) {
    const x = Math.min(n - 3, houseRect.x1 + 2);
    vehicle(m, r, x, houseRect.y0, false, r.pick<VehicleKind>(["car", "suv", "suv", "truck"]), 1);
  }
  fields(m, r, lots);
  woods(m, r, lots);
  // A hedgerow along the road.
  for (let i = 0; i < n; i++) {
    const x = horizontal ? i : road.x0 - 1,
      y = horizontal ? road.y0 - 1 : i;
    if (r.chance(0.35)) prop(m, x, y, T.LOW, "hedge");
  }
  m.lz = landingZone(m, landingSpot(r, lots, houseRect));
  return buildings;
}

/** The farm's lots: what's taken, and finding room for the next (near another, if asked). */
class Lots {
  readonly taken: Rect[] = [];
  constructor(
    readonly n: number,
    readonly r: Rng,
  ) {}

  place(w: number, h: number, near?: Rect): Rect | null {
    const { n, r } = this;
    for (let tries = 0; tries < 200; tries++) {
      let x: number, y: number;
      if (near && tries < 120) {
        x = r.int(Math.max(2, near.x0 - w - 6), Math.min(n - w - 2, near.x1 + 6));
        y = r.int(Math.max(2, near.y0 - h - 6), Math.min(n - h - 2, near.y1 + 6));
      } else {
        x = r.int(2, n - w - 2);
        y = r.int(2, n - h - 2);
      }
      const rect = { x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 };
      if (rect.x1 > n - 3 || rect.y1 > n - 3 || rect.x0 < 2 || rect.y0 < 2) continue;
      if (this.taken.some((t) => overlaps(t, rect, 2))) continue;
      this.taken.push(rect);
      return rect;
    }
    return null;
  }

  /** Nothing taken within `margin` of the rectangle. */
  clear(rect: Rect, margin: number) {
    return !this.taken.some((t) => overlaps(t, rect, margin));
  }
}

const SHED: BuildingStyle = {
  wall: "planks",
  floor: "dirt",
  furniture: ["crate"],
  rooms: false,
  doors: 1,
  doorWidth: 1,
  windowChance: 0.15,
};

/** A plank barn, with hay bales in clumps. */
function barn(m: BattleMap, r: Rng, rect: Rect): Building {
  const b = placeBuilding(
    m,
    r,
    rect,
    0,
    {
      wall: "planks",
      floor: "dirt",
      furniture: ["hay", "hay", "crate"],
      rooms: false,
      doors: 2,
      doorWidth: 2,
      windowChance: 0.1,
    },
    false,
  );
  for (let k = r.int(3, 6); k > 0; k--) {
    const x = r.int(rect.x0 + 2, rect.x1 - 2),
      y = r.int(rect.y0 + 2, rect.y1 - 2);
    const clearOfStair = Math.abs(x - b.stair.x) + Math.abs(y - b.stair.y) > 1;
    if (tileAt(m, x, y, m.ground) === T.FLOOR && clearOfStair)
      setTile(m, x, y, m.ground, T.LOW, "hay");
  }
  return b;
}

/** Fenced fields with gaps, ploughed inside. */
function fields(m: BattleMap, r: Rng, lots: Lots) {
  for (let k = r.int(1, 3); k > 0; k--) {
    const f = lots.place(r.int(6, 10), r.int(6, 10));
    if (!f) break;
    for (let x = f.x0; x <= f.x1; x++)
      for (const y of [f.y0, f.y1]) if (r.chance(0.85)) prop(m, x, y, T.LOW, "fence");
    for (let y = f.y0; y <= f.y1; y++)
      for (const x of [f.x0, f.x1]) if (r.chance(0.85)) prop(m, x, y, T.LOW, "fence");
    for (let y = f.y0 + 1; y < f.y1; y++)
      for (let x = f.x0 + 1; x < f.x1; x++) setTile(m, x, y, m.ground, T.FLOOR, "dirt");
  }
}

/** Woods: clumps of trees on open grass. */
function woods(m: BattleMap, r: Rng, lots: Lots) {
  const n = m.w;
  for (let k = r.int(3, 6); k > 0; k--) {
    const c = { x: r.int(1, n - 2), y: r.int(1, n - 2) };
    const rad = r.int(2, 4);
    for (let y = c.y - rad; y <= c.y + rad; y++)
      for (let x = c.x - rad; x <= c.x + rad; x++)
        if (
          dist({ x, y }, c) <= rad &&
          r.chance(0.45) &&
          skinAt(m, x, y, m.ground) === "grass" &&
          lots.clear({ x0: x, y0: y, x1: x, y1: y }, 1)
        )
          prop(m, x, y, T.HIGH, "tree");
  }
}

/** A random spot on one of the map's four edges, three tiles in. */
function edgeSpot(r: Rng, n: number): Pt {
  switch (r.int(0, 3)) {
    case 0:
      return { x: r.int(3, n - 4), y: 3 };
    case 1:
      return { x: r.int(3, n - 4), y: n - 4 };
    case 2:
      return { x: 3, y: r.int(3, n - 4) };
    default:
      return { x: n - 4, y: r.int(3, n - 4) };
  }
}

/** Land in the open, far from the house: the best of many spots along the edges. */
function landingSpot(r: Rng, lots: Lots, houseRect: Rect | null): Pt {
  const n = lots.n;
  const hc = houseRect ? centre(houseRect) : { x: n / 2, y: n / 2 };
  let best: Pt = { x: 3, y: 3 },
    bestScore = -1;
  for (let k = 0; k < 120; k++) {
    const c = edgeSpot(r, n);
    const clear = lots.clear({ x0: c.x - 1, y0: c.y - 1, x1: c.x + 1, y1: c.y + 1 }, 1);
    const score = dist(c, hc) * (clear ? 1 : 0.3);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
