// An industrial site: a works yard, a warehouse, and a blood bank under it.
import type { Rng } from "../../sim/core/rng";
import { setTile, T, tileAt, type BattleMap, type Pt, type Skin } from "./map";
import { rh, rw, PAVE, type Building, type Rect } from "./mapgen";
import { clearVehicles, fill, prop, vehicle } from "./dressing";
import { D, F, placeBuilding, W } from "./buildings";
import { southStreet, parkStreet, roadLz } from "./streets";
import { raise, fit, roofOver, corridorPlan, local } from "./planned";
import { ceilingLights } from "./furnishing";

/**
 * A works yard behind a fence on a street: a warehouse (a hall of pallet
 * racking two storeys high with a gallery round it, offices at one end,
 * dock doors with trucks backed up to them), shipping containers, pallets,
 * a gatehouse; under the warehouse, the blood bank (cold stores full of
 * fridges, a lab, a ward), where the vampires sleep.
 */
export function industrial(m: BattleMap, r: Rng): Building[] {
  const n = m.w,
    g = m.ground;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: m.h - 1 }, g, T.FLOOR, "grass");
  const roadY = southStreet(m);
  const yard: Rect = { x0: 0, y0: 0, x1: n - 1, y1: roadY - PAVE - 1 };
  fill(m, yard, g, T.FLOOR, "tarmac");
  // The gate: a driveway across the pavement.
  const gate = { x0: Math.floor(n * 0.55), x1: Math.floor(n * 0.55) + 5 };
  fill(m, { x0: gate.x0, y0: roadY - PAVE, x1: gate.x1, y1: roadY - 1 }, g, T.FLOOR, "tarmac");

  const rect: Rect = { x0: 3, y0: 2, x1: n - 4, y1: 15 };
  const house = warehouse(m, r, rect);
  const bank = bloodBank(m, r, rect, house.officeStair);
  const hut = yardDressing(m, r, rect, yard, gate, roadY, house.docks);
  arrival(m, r, rect, yard, gate, roadY);
  return [
    {
      rect,
      storeys: [g, g + 1],
      roof: g + 2,
      basement: g - 1,
      rooms: [...house.offices, house.hall].map((q) => local(rect, q)),
      basementRooms: bank.rooms.map((q) => local(rect, q)),
      stair: { x: rect.x0 + house.officeStair.x, y: rect.y0 + house.officeStair.y },
    },
    hut,
  ];
}

/** The offices' wall column in the warehouse plan. */
const OFF = 7;

/** The warehouse's plan for a storey: the outer wall and the offices' wall; doors to suit. */
function warehousePlan(w: number, h: number, storey: "ground" | "upper"): Uint8Array {
  const p = new Uint8Array(w * h).fill(F);
  const set = (x: number, y: number, v: number) => (p[y * w + x] = v);
  for (let x = 0; x < w; x++) {
    set(x, 0, W);
    set(x, h - 1, W);
  }
  for (let y = 0; y < h; y++) {
    set(0, y, W);
    set(w - 1, y, W);
    set(OFF, y, W);
  }
  if (storey === "ground") {
    for (let x = 1; x < OFF; x++) set(x, 6, W);
    set(3, 6, D);
    set(OFF, 10, D); // offices to the hall
    set(3, h - 1, D); // the office door
  } else set(OFF, 3, D); // the upstairs office onto the gallery
  return p;
}

/**
 * The warehouse: a hall of pallet racking two storeys high with a gallery
 * round it, offices at one end, dock doors onto the yard.
 */
function warehouse(m: BattleMap, r: Rng, rect: Rect) {
  const g = m.ground;
  const w = rw(rect),
    h = rh(rect);
  const hall: Rect = { x0: OFF + 1, y0: 1, x1: w - 2, y1: h - 2 };
  const offices: Rect[] = [
    { x0: 1, y0: 1, x1: OFF - 1, y1: 5 },
    { x0: 1, y0: 7, x1: OFF - 1, y1: h - 2 },
  ];
  const ground = warehousePlan(w, h, "ground");
  // Dock doors, two wide, onto the yard; a side door.
  const docks = [hall.x0 + 3, hall.x0 + Math.floor((rw(hall) - 2) / 2) + 2, hall.x1 - 4].filter(
    (x, i, a) => i === 0 || x - a[i - 1]! >= 5,
  );
  for (const x of docks) ground[(h - 1) * w + x] = ground[(h - 1) * w + x + 1] = D;
  ground[5 * w + w - 1] = D;
  const officeStair: Pt = { x: 2, y: 10 },
    hallStair: Pt = { x: w - 2, y: 1 };
  raise(m, r, rect, {
    z: g,
    plan: ground,
    rooms: [...offices, hall],
    wall: "metal",
    floor: "concrete",
    windows: 0.15,
    stairs: [officeStair, hallStair],
  });
  // Racking: double rows along the hall with aisles between, a cross aisle, the docks' end clear.
  const crossX = Math.floor((hall.x0 + hall.x1) / 2);
  for (const ry of [3, 7])
    for (let x = hall.x0 + 2; x <= hall.x1 - 2; x++)
      if (Math.abs(x - crossX) > 1)
        for (const y of [ry, ry + 1]) setTile(m, rect.x0 + x, rect.y0 + y, g, T.HIGH, "rack");
  fit(m, r, rect, g, offices, [officeStair], ["table", "table", "crate"], T.LOW, () => r.int(2, 3));
  // Upstairs: an office, and a gallery round the hall over the floor.
  const inHall = (x: number, y: number) =>
    x >= hall.x0 && x <= hall.x1 && y >= hall.y0 && y <= hall.y1;
  const onRim = (x: number, y: number) =>
    x === hall.x0 || x === hall.x1 || y === hall.y0 || y === hall.y1;
  const upstairsOffice: Rect = { x0: 1, y0: 1, x1: OFF - 1, y1: h - 2 };
  raise(m, r, rect, {
    z: g + 1,
    plan: warehousePlan(w, h, "upper"),
    rooms: [upstairsOffice, hall],
    wall: "metal",
    floor: "concrete",
    windows: 0.45,
    stairs: [officeStair],
    hole: (x, y) => inHall(x, y) && !onRim(x, y),
  });
  fit(m, r, rect, g + 1, [upstairsOffice], [officeStair], ["table", "crate"], T.LOW, () => 3);
  roofOver(m, rect, g + 2);
  // Lights over the hall (hung under the roof) and in the offices.
  for (let x = hall.x0 + 3; x <= hall.x1 - 2; x += 6)
    for (const y of [5, 9])
      m.lights.push({ x: rect.x0 + x, y: rect.y0 + y, z: g, ceiling: true, h: 2 * 2.5 - 0.4 });
  ceilingLights(m, rect, g, null, offices);
  return { hall, offices, docks, officeStair };
}

/** Under the warehouse, the blood bank: a corridor, and off it cold stores full of fridges, a ward, a lab, in turn. */
function bloodBank(m: BattleMap, r: Rng, rect: Rect, stair: Pt) {
  const z = m.ground - 1;
  const w = rw(rect),
    h = rh(rect);
  const bp = corridorPlan(r, w, h, { unit: [5, 8], split: false, lobby: false });
  bp.plan[stair.y * w + stair.x] = F;
  raise(m, r, rect, {
    z,
    plan: bp.plan,
    rooms: bp.rooms,
    wall: "clinic",
    floor: "tile",
    windows: 0,
    stairs: [stair],
  });
  bp.units.forEach((u, i) => {
    const furnishAs = (
      what: Skin[],
      kind: typeof T.LOW | typeof T.HIGH,
      count: (q: Rect) => number,
    ) => fit(m, r, rect, z, u, [stair], what, kind, count);
    if (i % 3 === 0) furnishAs(["fridge"], T.HIGH, (q) => Math.min(6, rw(q) + 1));
    else if (i % 3 === 1) furnishAs(["bed"], T.LOW, () => r.int(2, 4));
    else {
      furnishAs(["counter"], T.LOW, () => 2);
      furnishAs(["fridge"], T.HIGH, () => 1);
    }
  });
  ceilingLights(m, rect, z, bp.corridor, bp.units.flat());
  return bp;
}

/** The yard: trucks backed up to the docks, containers, pallets, a gatehouse, a fence with the gate, floodlights. */
function yardDressing(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  yard: Rect,
  gate: { x0: number; x1: number },
  roadY: number,
  docks: number[],
): Building {
  const n = m.w,
    g = m.ground;
  for (const x of docks)
    if (r.chance(0.75)) vehicle(m, r, rect.x0 + x, rect.y1 + 1, false, "truck", 1);
  const boxes: Rect = { x0: rect.x1 - 6, y0: rect.y1 + 9, x1: n - 2, y1: roadY - PAVE - 2 };
  for (let k = 0; k < 3; k++) {
    const x = r.int(2, Math.max(2, gate.x0 - 8));
    const y = r.int(rect.y1 + 9, Math.max(rect.y1 + 9, roadY - PAVE - 4));
    vehicle(m, r, x, y, true, "container", 1);
  }
  for (let k = r.int(4, 8); k > 0; k--)
    prop(m, r.int(boxes.x0, boxes.x1), r.int(boxes.y0, boxes.y1), T.LOW, "crate");
  const hutRect: Rect = {
    x0: gate.x1 + 2,
    y0: roadY - PAVE - 6,
    x1: gate.x1 + 5,
    y1: roadY - PAVE - 2,
  };
  clearVehicles(m, { x0: hutRect.x0 - 1, y0: hutRect.y0 - 1, x1: hutRect.x1 + 1, y1: hutRect.y1 });
  const hut = placeBuilding(
    m,
    r,
    hutRect,
    0,
    {
      wall: "metal",
      floor: "concrete",
      furniture: ["table"],
      rooms: false,
      doors: 1,
      doorWidth: 1,
      windowChance: 0.6,
    },
    false,
  );
  for (let x = 0; x < n; x++) if (x < gate.x0 || x > gate.x1) prop(m, x, yard.y1, T.LOW, "fence");
  for (let y = 0; y < yard.y1; y++) {
    prop(m, 0, y, T.LOW, "fence");
    prop(m, n - 1, y, T.LOW, "fence");
  }
  for (let x = 1; x < n - 1; x++) prop(m, x, 0, T.LOW, "fence");
  for (let x = 4; x < n - 2; x += 9) m.lights.push({ x, y: yard.y1 - 1, z: g });
  return hut;
}

/** Arriving: by road at the gate, or a helicopter in the open yard (cleared, 3 × 3). */
function arrival(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  yard: Rect,
  gate: { x0: number; x1: number },
  roadY: number,
) {
  const g = m.ground;
  parkStreet(m, r, roadY, (x) => x >= gate.x0 - 2 && x <= gate.x1 + 2);
  m.lz = roadLz(m, gate.x0 + 2, roadY);
  const air = { x: gate.x0 + 1, y: Math.floor((rect.y1 + 1 + yard.y1) / 2) + 2 };
  clearVehicles(m, { x0: air.x - 2, y0: air.y - 2, x1: air.x + 2, y1: air.y + 2 });
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      if (tileAt(m, air.x + dx, air.y + dy, g) !== T.FLOOR)
        setTile(m, air.x + dx, air.y + dy, g, T.FLOOR, "tarmac");
  m.airLz = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) m.airLz.push({ x: air.x + dx, y: air.y + dy, z: g });
}
