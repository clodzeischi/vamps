// An apartment block: tall and narrow, flats off a corridor on every floor, its street out front.
import type { Rng } from "../../sim/core/rng";
import { skinAt, T, tileAt, type BattleMap, type Pt, type Skin } from "./map";
import { centre, rh, rw, PAVE, type Building, type Rect } from "./mapgen";
import { fill, prop, vehicle } from "./dressing";
import { D } from "./buildings";
import { glaze } from "./spawns";
import { southStreet, scatterTrees, parkStreet, roadLz } from "./streets";
import { corridorPlan, raise, fit, roofOver, local } from "./planned";
import { furnishFlat, ceilingLights, cellar } from "./furnishing";

// ---------------------------------------------------------------------------
// Apartment block

/** Storeys of an apartment block (ground included), by site size. */
export const APARTMENT_STOREYS = { nest: 4, den: 5, haven: 6, lair: 6 } as const;

/**
 * An apartment block on a street: one tall block, a corridor through every
 * floor with flats either side, a stairwell at each end of it, a lobby off
 * the street, a walkable roof (a helicopter sets down there), a cellar. A
 * car park behind it, reached by a driveway down the side; a lawn with trees
 * on the other side; a paved forecourt in front.
 */
export function apartments(m: BattleMap, r: Rng, basement: boolean): Building[] {
  const n = m.w,
    g = m.ground;
  const storeys = m.levels - 1 - g;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: m.h - 1 }, g, T.FLOOR, "grass");
  const roadY = southStreet(m);
  const rect: Rect = { x0: 4, y0: 8, x1: n - 5, y1: roadY - PAVE - 4 };
  const w = rw(rect),
    h = rh(rect);
  // Outside: a car park behind (a row of bays, nose-in, off an aisle), a
  // driveway down the east side to the street, a forecourt in front.
  const bays: Rect = { x0: 0, y0: 0, x1: n - 2, y1: 3 };
  fill(m, { x0: 0, y0: 0, x1: n - 2, y1: 6 }, g, T.FLOOR, "tarmac");
  fill(m, { x0: 0, y0: 7, x1: n - 1, y1: 7 }, g, T.FLOOR, "pavement");
  const drive: Rect = { x0: n - 4, y0: 7, x1: n - 2, y1: roadY - 1 };
  fill(m, drive, g, T.FLOOR, "tarmac");
  fill(
    m,
    { x0: rect.x0, y0: rect.y1 + 1, x1: drive.x0 - 1, y1: roadY - PAVE - 1 },
    g,
    T.FLOOR,
    "pavement",
  );
  for (let x = 0; x + 2 <= bays.x1; x += 3) {
    for (let y = bays.y0; y <= bays.y1; y++) m.bayLines.push({ x, y, alongX: false });
    if (x + 2 < bays.x1 && r.chance(0.6))
      vehicle(m, r, x + 1, 0, false, r.chance(0.7) ? "car" : "suv", -1);
  }

  // The block.
  const cp = corridorPlan(r, w, h, { unit: [5, 7], split: true, lobby: true });
  const stairs: Pt[] = [
    { x: 1, y: cp.cy },
    { x: w - 2, y: cp.cy + 1 },
  ];
  const ground = new Uint8Array(cp.plan);
  // Ways out: each end of the corridor, and the lobby's front door (two wide) onto the street.
  ground[(cp.cy + 1) * w] = D;
  ground[cp.cy * w + w - 1] = D;
  const lobby = cp.lobby!;
  const lx = Math.floor((lobby.x0 + lobby.x1) / 2);
  ground[(h - 1) * w + lx] = D;
  ground[(h - 1) * w + lx + 1] = D;
  const wall = r.pick<Skin>(["brick", "plaster"]);
  // One rhythm of windows per face (every other tile, or two in three), the same on every floor: the flats are stacked alike.
  const rhythm = [0, 1, 2, 3].map(() => ({ every: r.pick([2, 3]), phase: r.int(0, 2) }));
  const windows = (x: number, y: number) => {
    const side = y === 0 ? 0 : y === h - 1 ? 1 : x === 0 ? 2 : 3;
    const { every, phase } = rhythm[side]!;
    return ((side < 2 ? x : y) + phase) % every !== 0;
  };
  const levels: number[] = [];
  for (let i = 0; i < storeys; i++) {
    const z = g + i;
    levels.push(z);
    raise(m, r, rect, {
      z,
      plan: i === 0 ? ground : cp.plan,
      rooms: cp.rooms,
      wall,
      floor: "indoor",
      windows: 0,
      pattern: windows,
      stairs,
    });
    // Flats on every floor; the lobby and the ground floor's flats alike.
    for (const unit of cp.units) furnishFlat(m, r, rect, z, unit, stairs);
    // A table or a crate besides, clear of the furniture (its front stays open).
    const byFurniture = (x: number, y: number) =>
      [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(
        ([dx, dy]) =>
          ["sofa", "tv", "bed"].includes(skinAt(m, x + dx!, y + dy!, z)) &&
          tileAt(m, x + dx!, y + dy!, z) === T.LOW,
      );
    fit(
      m,
      r,
      rect,
      z,
      cp.units.flat(),
      stairs,
      ["table", "crate", "table"],
      T.LOW,
      () => r.int(0, 1),
      byFurniture,
    );
    ceilingLights(m, rect, z, cp.corridor, []);
  }
  // A luxury block: the top two floors mostly glass, all round (a long view, and a sniper's).
  if (r.chance(0.5)) {
    const panes = new Set<number>();
    for (let y = rect.y0; y <= rect.y1; y++)
      for (let x = rect.x0; x <= rect.x1; x++) if (r.chance(0.7)) panes.add(y * m.w + x);
    for (const z of levels.slice(-2))
      glaze(m, r, rect, z, [0, 1, 2, 3], (x, y) => panes.has(y * m.w + x));
  }
  const roof = g + storeys;
  roofOver(m, rect, roof);
  let basementRooms: Rect[] = [];
  if (basement && g > 0)
    basementRooms = cellar(m, r, rect, g - 1, stairs, "stone", "concrete").map((q) =>
      local(rect, q),
    );

  // A lawn down the west side, planters and bins out front, lamps along the drive.
  scatterTrees(m, r, { x0: 0, y0: 8, x1: rect.x0 - 2, y1: roadY - PAVE - 1 }, 0.3);
  for (let x = rect.x0; x < drive.x0 - 1; x += 4)
    if (Math.abs(x - (rect.x0 + lx)) > 2)
      prop(m, x, roadY - PAVE - 1, T.LOW, r.chance(0.75) ? "hedge" : "bench");
  prop(m, rect.x0 + lx + 3, rect.y1 + 1, T.LOW, "bin");
  for (let y = 9; y < roadY - PAVE; y += 8) m.lights.push({ x: n - 1, y, z: g });

  // The street: parked both sides, clear of the driveway and the landing zone.
  const lzX = Math.floor(n * 0.3);
  parkStreet(
    m,
    r,
    roadY,
    (x) => (x >= drive.x0 - 2 && x <= drive.x1 + 2) || Math.abs(x - lzX) <= 3,
  );
  m.lz = roadLz(m, lzX, roadY);
  const c = centre(rect);
  m.airLz = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) m.airLz.push({ x: c.x + dx, y: c.y + dy, z: roof });
  return [
    {
      rect,
      storeys: levels,
      roof,
      basement: basementRooms.length ? g - 1 : null,
      rooms: cp.rooms.map((q) => local(rect, q)),
      basementRooms,
      stair: { x: rect.x0 + stairs[0]!.x, y: rect.y0 + stairs[0]!.y },
    },
  ];
}
