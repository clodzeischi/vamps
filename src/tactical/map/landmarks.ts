// The town's recognisable buildings: a hospital, a supermarket, a petrol station, a corner shop.
import type { Rng } from "../../sim/core/rng";
import { setTile, skinAt, T, tileAt, type BattleMap, type Pt, type Skin } from "./map";
import { rh, rw, PAVE, type Building, type Rect } from "./mapgen";
import { clearVehicles, doorsOut, fill, isRoad, OUT, vehicle } from "./dressing";
import { D, F, placeBuilding, W } from "./buildings";
import { kerbCorner } from "./urban";
import { glaze } from "./spawns";
import { corridorPlan, raise, fit, roofOver, local } from "./planned";
import { ceilingLights, cellar } from "./furnishing";

// ---------------------------------------------------------------------------
// The town's recognisable buildings

/**
 * Plans are drawn facing south (the street along their bottom edge, y = d − 1)
 * and turned to face the lot's street side: these map a canonical tile, rect
 * or plan to the lot's frame (w × d canonical; front side 0 N, 1 S, 2 W, 3 E).
 */
function turn(w: number, d: number, front: number) {
  const pt = (p: Pt): Pt =>
    front === 1
      ? p
      : front === 0
        ? { x: p.x, y: d - 1 - p.y }
        : front === 2
          ? { x: d - 1 - p.y, y: p.x }
          : { x: p.y, y: p.x };
  const rect = (q: Rect): Rect => {
    const a = pt({ x: q.x0, y: q.y0 }),
      b = pt({ x: q.x1, y: q.y1 });
    return {
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y),
    };
  };
  const size = front < 2 ? { w, h: d } : { w: d, h: w };
  const plan = (p: Uint8Array) => {
    const out = new Uint8Array(size.w * size.h);
    for (let y = 0; y < d; y++)
      for (let x = 0; x < w; x++) {
        const q = pt({ x, y });
        out[q.y * size.w + q.x] = p[y * w + x]!;
      }
    return out;
  };
  return { pt, rect, plan, size };
}

/** A lit sign over the outside of the doorway at canonical tile (x, d − 1) of a turned plan. */
function signAt(
  m: BattleMap,
  rect: Rect,
  t: ReturnType<typeof turn>,
  x: number,
  d: number,
  front: number,
  z: number,
  text: string,
  w: number,
  bg: string,
  fg: string,
) {
  const p = t.pt({ x, y: d - 1 });
  const [dx, dy] = OUT[front]!;
  m.signs.push({ x: rect.x0 + p.x, y: rect.y0 + p.y, z, dx, dy, w, text, bg, fg });
}

/** Where a lot's frontage puts a vehicle in the street's near parking lane, `len` long, at `along` tiles from the lot's start. */
function kerbside(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  front: number,
  along: number,
  kind: "ambulance" | "car",
) {
  const len = kind === "ambulance" ? 4 : 3;
  const alongX = front < 2;
  const x = alongX ? lot.x0 + along : front === 2 ? lot.x0 - PAVE - 2 : lot.x1 + PAVE + 1;
  const y = alongX ? (front === 0 ? lot.y0 - PAVE - 2 : lot.y1 + PAVE + 1) : lot.y0 + along;
  const area: Rect = alongX
    ? { x0: x - 1, y0: y, x1: x + len, y1: y + 1 }
    : { x0: x, y0: y - 1, x1: x + 1, y1: y + len };
  clearVehicles(m, area);
  vehicle(m, r, x, y, alongX, kind, front === 1 || front === 2 ? -1 : 1);
}

/**
 * A hospital: two storeys of wards off a corridor (beds along the walls), a
 * lobby with the reception desk off the street, a stairwell at each end of
 * the corridor, the morgue below when there's a basement; an ambulance at
 * the kerb, a red sign over the doors.
 */
export function hospital(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  front: number,
  basement: boolean,
): Building {
  const g = m.ground;
  const W0 = front < 2 ? rw(lot) : rh(lot),
    D0 = front < 2 ? rh(lot) : rw(lot);
  const t = turn(W0, D0, front);
  const rect: Rect = {
    x0: lot.x0,
    y0: lot.y0,
    x1: lot.x0 + t.size.w - 1,
    y1: lot.y0 + t.size.h - 1,
  };
  const cp = corridorPlan(r, W0, D0, { unit: [4, 6], split: false, lobby: true });
  const stairsC: Pt[] = [
    { x: 1, y: cp.cy },
    { x: W0 - 2, y: cp.cy + 1 },
  ];
  const lobby = cp.lobby!,
    lx = Math.floor((lobby.x0 + lobby.x1) / 2);
  const ground = new Uint8Array(cp.plan);
  ground[(D0 - 1) * W0 + lx] = ground[(D0 - 1) * W0 + lx + 1] = D;
  ground[(cp.cy + 1) * W0] = D;
  const rooms = cp.rooms.map(t.rect),
    wards = cp.units.flat().map(t.rect),
    stairs = stairsC.map(t.pt);
  const levels = [g, g + 1];
  for (const z of levels) {
    raise(m, r, rect, {
      z,
      plan: t.plan(z === g ? ground : cp.plan),
      rooms,
      wall: "clinic",
      floor: "tile",
      windows: 0.55,
      stairs,
    });
    fit(m, r, rect, z, wards, stairs, ["bed"], T.LOW, (q) =>
      Math.min(4, Math.max(2, Math.floor((rw(q) * rh(q)) / 5))),
    );
    ceilingLights(
      m,
      rect,
      z,
      null,
      [...wards, t.rect(cp.corridor)].map((q) => q),
    );
  }
  // Reception: a desk across the lobby, benches to wait on.
  fit(m, r, rect, g, [t.rect(lobby)], stairs, ["counter"], T.LOW, () => 2);
  fit(m, r, rect, g, [t.rect(lobby)], stairs, ["bench"], T.LOW, () => 2);
  roofOver(m, rect, g + 2);
  let basementRooms: Rect[] = [];
  if (basement && g > 0) {
    const cells = cellar(m, r, rect, g - 1, stairs, "clinic", "tile");
    fit(m, r, rect, g - 1, cells, stairs, ["fridge"], T.HIGH, () => 2);
    fit(m, r, rect, g - 1, cells, stairs, ["bed"], T.LOW, () => 1);
    basementRooms = cells.map((q) => local(rect, q));
  }
  signAt(m, rect, t, lx, D0, front, g, "+ HOSPITAL", 4, "#b8202a", "#ffffff");
  kerbside(m, r, lot, front, 1, "ambulance");
  return {
    rect,
    storeys: levels,
    roof: g + 2,
    basement: basementRooms.length ? g - 1 : null,
    rooms: rooms.map((q) => local(rect, q)),
    basementRooms,
    stair: { x: rect.x0 + stairs[0]!.x, y: rect.y0 + stairs[0]!.y },
  };
}

/**
 * A supermarket: one big hall, glass along the street with the doors in the
 * middle, checkouts inside them, aisles of shelving, fridges along the back
 * wall, a stockroom behind (crates; a ladder to the roof); a green sign.
 */
export function supermarket(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  front: number,
  basement: boolean,
): Building {
  const g = m.ground;
  const W0 = front < 2 ? rw(lot) : rh(lot),
    D0 = front < 2 ? rh(lot) : rw(lot);
  const t = turn(W0, D0, front);
  const rect: Rect = {
    x0: lot.x0,
    y0: lot.y0,
    x1: lot.x0 + t.size.w - 1,
    y1: lot.y0 + t.size.h - 1,
  };
  const plan = new Uint8Array(W0 * D0).fill(F);
  const set = (x: number, y: number, v: number) => (plan[y * W0 + x] = v);
  // A deep lot has a stockroom across the back (a wall at row 4); a shallow one is all shop floor.
  const deep = D0 >= 12,
    hy = deep ? 5 : 1;
  for (let x = 0; x < W0; x++) (set(x, 0, W), set(x, D0 - 1, W), deep && set(x, 4, W));
  for (let y = 0; y < D0; y++) (set(0, y, W), set(W0 - 1, y, W));
  const mid = Math.floor(W0 / 2) - 1;
  if (deep) (set(mid, 4, D), set(mid + 1, 4, D)); // to the stockroom
  (set(mid, D0 - 1, D), set(mid + 1, D0 - 1, D)); // the entrance
  set(W0 - 1, 2, D); // the delivery door
  const stock: Rect = { x0: 1, y0: 1, x1: W0 - 2, y1: 3 },
    hall: Rect = { x0: 1, y0: hy, x1: W0 - 2, y1: D0 - 2 };
  const rooms = deep ? [stock, hall] : [hall];
  const ladder = t.pt({ x: 1, y: 1 });
  raise(m, r, rect, {
    z: g,
    plan: t.plan(plan),
    rooms: rooms.map(t.rect),
    wall: r.pick<Skin>(["brick", "plaster"]),
    floor: "tile",
    windows: 0,
    stairs: [ladder],
  });
  // Floor-to-ceiling glass all along the front, but the doors.
  glaze(m, r, rect, g, [front], 1);
  const at = (x: number, y: number, k: (typeof T)["LOW"] | (typeof T)["HIGH"], skin: Skin) => {
    const p = t.pt({ x, y });
    if (tileAt(m, rect.x0 + p.x, rect.y0 + p.y, g) === T.FLOOR)
      setTile(m, rect.x0 + p.x, rect.y0 + p.y, g, k, skin);
  };
  // Fridges along the back of the hall, clear of the stockroom doors (and the ladder and the delivery door).
  for (let x = 2; x < W0 - 3; x++) if (x < mid - 1 || x > mid + 2) at(x, hy, T.HIGH, "fridge");
  // Aisles: shelving runs across, a tile deep, two clear between, broken for a cross aisle; checkouts inside the doors.
  const cross = new Set([mid, mid + 1]);
  for (let y = hy + 2; y <= D0 - 5; y += 3)
    for (let x = 2; x < W0 - 2; x++) if (!cross.has(x)) at(x, y, T.HIGH, "shelf");
  for (let x = 2; x < W0 - 2; x += 3) if (!cross.has(x)) at(x, D0 - 3, T.LOW, "counter");
  const cellarStair = t.pt({ x: W0 - 3, y: 2 });
  if (deep)
    fit(m, r, rect, g, [t.rect(stock)], [ladder, cellarStair], ["crate"], T.LOW, () => r.int(3, 6));
  for (let x = 3; x < W0 - 2; x += 6)
    for (const y of [hy + 1, D0 - 4]) {
      const p = t.pt({ x, y });
      m.lights.push({ x: rect.x0 + p.x, y: rect.y0 + p.y, z: g, ceiling: true });
    }
  roofOver(m, rect, g + 1);
  let basementRooms: Rect[] = [];
  if (basement && g > 0) {
    // The cellar's stairs come up in the stockroom.
    basementRooms = cellar(m, r, rect, g - 1, [cellarStair], "stone", "concrete").map((q) =>
      local(rect, q),
    );
  }
  signAt(m, rect, t, mid, D0, front, g, "SUPERMARKET", 5, "#1f6a3a", "#f4f0d8");
  return {
    rect,
    storeys: [g],
    roof: g + 1,
    basement: basementRooms.length ? g - 1 : null,
    rooms: rooms.map(t.rect).map((q) => local(rect, q)),
    basementRooms,
    stair: { x: rect.x0 + ladder.x, y: rect.y0 + ladder.y },
  };
}

/**
 * A petrol station: the forecourt at road height with a driveway in and one
 * out across the pavement, two islands of pumps under a canopy (lit
 * beneath), the kiosk at the back with its sign, a car filling up.
 */
export function petrolStation(m: BattleMap, r: Rng, lot: Rect, front: number): Building | null {
  const g = m.ground;
  const W0 = front < 2 ? rw(lot) : rh(lot),
    D0 = front < 2 ? rh(lot) : rw(lot);
  if (W0 < 10 || D0 < 9) return null;
  const t = turn(W0, D0, front);
  const P = (x: number, y: number) => {
    const p = t.pt({ x, y });
    return { x: lot.x0 + p.x, y: lot.y0 + p.y };
  };
  // The driveways must reach the road (outside the lot: canonical y = D0 … D0 + PAVE, road at D0 + PAVE).
  const drives = [1, W0 - 4];
  for (const dx of drives)
    for (let k = 0; k < 3; k++) {
      const p = P(dx + k, D0 + PAVE);
      if (!isRoad(m, p.x, p.y)) return null;
    }
  for (const dx of drives)
    for (let k = 0; k < 3; k++)
      for (let y = D0; y < D0 + PAVE; y++) {
        const p = P(dx + k, y);
        if (skinAt(m, p.x, p.y, g) !== "pavement" || kerbCorner(m, p.x, p.y)) return null;
      }
  fill(m, lot, g, T.FLOOR, "tarmac");
  for (const dx of drives)
    for (let k = 0; k < 3; k++)
      for (let y = D0; y < D0 + PAVE; y++) {
        const p = P(dx + k, y);
        setTile(m, p.x, p.y, g, T.FLOOR, "tarmac");
      }
  for (const dx of drives) {
    const a = P(dx - 1, D0 + PAVE),
      b = P(dx + 3, D0 + PAVE + 1);
    clearVehicles(m, {
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y),
    });
  }
  // The kiosk: across the back, its door onto the forecourt.
  const kw = Math.min(W0, 7),
    kx = Math.floor((W0 - kw) / 2);
  const kioskC: Rect = { x0: kx, y0: 0, x1: kx + kw - 1, y1: 3 };
  const kiosk = t.rect(kioskC);
  const kioskW = {
    x0: lot.x0 + kiosk.x0,
    y0: lot.y0 + kiosk.y0,
    x1: lot.x0 + kiosk.x1,
    y1: lot.y0 + kiosk.y1,
  };
  for (let y = kioskW.y0; y <= kioskW.y1; y++)
    for (let x = kioskW.x0; x <= kioskW.x1; x++) setTile(m, x, y, g, T.FLOOR, "tile");
  const b = placeBuilding(
    m,
    r,
    kioskW,
    0,
    {
      wall: "plaster",
      floor: "tile",
      furniture: ["counter", "crate"],
      rooms: false,
      doors: 1,
      doorWidth: 1,
      windowChance: 0.6,
    },
    false,
    front,
  );
  glaze(m, r, kioskW, g, [front], 0.9); // the kiosk's front: glass onto the pumps
  for (const d of doorsOut(m, kioskW))
    if (d.dx === OUT[front]![0] && d.dy === OUT[front]![1])
      m.signs.push({
        x: d.x - d.dx,
        y: d.y - d.dy,
        z: g,
        dx: d.dx,
        dy: d.dy,
        w: 3,
        text: r.pick(["FUEL", "PETROL", "GAS"]),
        bg: "#d8a020",
        fg: "#2a1a10",
      });
  // Pump islands under the canopy, the canopy lit beneath.
  const iy = Math.max(5, Math.floor((4 + D0) / 2) - 0);
  const islands = [Math.floor(W0 / 2) - 3, Math.floor(W0 / 2) + 2];
  for (const ix of islands)
    for (const y of [iy - 1, iy]) {
      const p = P(ix, y);
      setTile(m, p.x, p.y, g, T.HIGH, "pump");
    }
  const c0 = P(islands[0]! - 2, iy - 2),
    c1 = P(islands[1]! + 2, iy + 1);
  m.canopies.push({
    x0: Math.min(c0.x, c1.x),
    y0: Math.min(c0.y, c1.y),
    x1: Math.max(c0.x, c1.x),
    y1: Math.max(c0.y, c1.y),
    z: g,
    h: 3.6,
  });
  for (const ix of islands) {
    const p = P(ix + 1, iy);
    m.lights.push({ x: p.x, y: p.y, z: g, ceiling: true, h: 3.5 });
  }
  // A car at a pump.
  const car = t.rect({ x0: islands[0]! + 1, y0: iy - 1, x1: islands[0]! + 2, y1: iy + 1 });
  if (r.chance(0.7)) vehicle(m, r, lot.x0 + car.x0, lot.y0 + car.y0, front >= 2, "car", 1);
  return b;
}

const SHOPS: { text: string; bg: string; fg: string }[] = [
  { text: "MINI MART", bg: "#c83a2a", fg: "#fff4d8" },
  { text: "GROCERY", bg: "#2a6a3a", fg: "#f4f0d8" },
  { text: "PHARMACY", bg: "#1a8a4a", fg: "#ffffff" },
  { text: "BAKERY", bg: "#7a4a2a", fg: "#f8e8c8" },
  { text: "NEWS", bg: "#1a3a7a", fg: "#ffffff" },
  { text: "24 HRS", bg: "#2a2a2e", fg: "#f8d040" },
];

/**
 * A corner shop on a house's ground floor: shelving and a counter instead of
 * the furniture, glass along the street, a sign over the street door, a
 * ceiling light in each room (a shop is lit; the flats above aren't).
 */
export function cornerShop(m: BattleMap, r: Rng, b: Building, front: number) {
  const g = m.ground,
    [dx, dy] = OUT[front]!;
  const all: Rect = { x0: 0, y0: 0, x1: m.w - 1, y1: m.h - 1 };
  for (const q of b.rooms)
    for (let y = q.y0 - 1; y <= q.y1 + 1; y++)
      for (let x = q.x0 - 1; x <= q.x1 + 1; x++)
        if (
          x >= b.rect.x0 &&
          x <= b.rect.x1 &&
          y >= b.rect.y0 &&
          y <= b.rect.y1 &&
          tileAt(m, x, y, g) === T.LOW
        )
          setTile(m, x, y, g, T.FLOOR, "indoor");
  fit(m, r, all, g, b.rooms, [b.stair], ["shelf"], T.HIGH, (q) =>
    Math.min(3, Math.floor((rw(q) * rh(q)) / 6)),
  );
  fit(m, r, all, g, b.rooms.slice(0, 1), [b.stair], ["counter"], T.LOW, () => 1);
  ceilingLights(m, all, g, null, b.rooms);
  // A glass shopfront along the street side.
  glaze(m, r, b.rect, g, [front], 0.85);
  const door = doorsOut(m, b.rect).find((d) => d.dx === dx && d.dy === dy);
  if (door) m.signs.push({ x: door.x - dx, y: door.y - dy, z: g, dx, dy, w: 3, ...r.pick(SHOPS) });
}
