// Lairs (docs/design/tactical.md). Three levels on a 44 × 44 map. The
// surface: a walled churchyard with a ruined chapel (or, for Montségur, the
// castle's broken walls on a rocky slope). From inside the chapel a stair goes
// down to the catacombs: rooms cut into the rock, joined by corridors, with
// sarcophagi, pillars and braziers. From the farthest room another stair goes
// down to the crypt: the eldest's hall, lined with pillars, and its side
// chambers.
import { type Rng } from "../../sim/core/rng";
import {
  E,
  emptyMap,
  idx,
  setEdge,
  setTile,
  T,
  tileAt,
  type BattleMap,
  type Pt,
  type Pt3,
  type Skin,
  type Spawn,
} from "./map";
import {
  type Rect,
  type MapRequest,
  MAP_SIZE,
  inset,
  overlaps,
  centre,
  dist,
  rw,
  rh,
} from "./mapgen";
import { ORTHO, placeBuilding } from "./buildings";
import { fill, prop, landingZone } from "./dressing";

const LAIR = { crypt: 0, catacombs: 1, surface: 2 } as const;

/** Rooms carved into rock on one level; walls of rock stand on their edges, solid rock beyond. */
class Carver {
  readonly cut: Uint8Array;
  constructor(
    readonly m: BattleMap,
    readonly z: number,
  ) {
    this.cut = new Uint8Array(m.w * m.h);
  }
  room(a: Rect) {
    for (let y = a.y0; y <= a.y1; y++)
      for (let x = a.x0; x <= a.x1; x++)
        if (x > 0 && y > 0 && x < this.m.w - 1 && y < this.m.h - 1) this.cut[y * this.m.w + x] = 1;
  }
  /** An L-shaped corridor from a to b. */
  corridor(r: Rng, a: Pt, b: Pt, wide: boolean) {
    const xFirst = r.chance(0.5);
    const mid = xFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    for (const [p, q] of [
      [a, mid],
      [mid, b],
    ] as const) {
      for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++)
        for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++)
          this.room({ x0: x, y0: y, x1: x + (wide ? 1 : 0), y1: y + (wide ? 1 : 0) });
    }
  }
  /** Carved floor, walled round on its edges; the rest left solid (nothing drawn). */
  apply(floor: Skin, wall: Skin) {
    const { m, z } = this;
    const cut = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < m.w && y < m.h && !!this.cut[y * m.w + x];
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!cut(x, y)) continue;
        setTile(m, x, y, z, T.FLOOR, floor);
        for (const [dx, dy] of ORTHO)
          if (!cut(x + dx, y + dy)) setEdge(m, x, y, z, dx, dy, E.WALL, wall);
      }
  }
}

/** Where the deep levels' rooms are, for spawns. */
const lairRooms = new WeakMap<
  BattleMap,
  { catacombs: Rect[]; hall: Rect; chambers: Rect[]; chapel: Rect }
>();

export function lair(req: MapRequest, r: Rng): BattleMap {
  const n = MAP_SIZE.lair;
  const mont = req.setting === "montsegur";
  const m = emptyMap(n, n, 4, LAIR.surface, req.setting, req.seed);
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, LAIR.surface, T.FLOOR, mont ? "dirt" : "grass");
  const cw = r.int(11, 13),
    ch = r.int(9, 10);
  const chapel = rectAt(r.int(14, n - cw - 14), r.int(14, n - ch - 14), cw, ch);
  if (mont) castleRuins(m, r, chapel);
  else churchyard(m, r, chapel);
  const keep = placeBuilding(
    m,
    r,
    chapel,
    0,
    {
      wall: "stone",
      floor: "stone",
      furniture: ["bench", "bench", "altar"],
      rooms: false,
      doors: 2,
      doorWidth: 2,
      windowChance: mont ? 0.1 : 0.4,
    },
    false,
  );
  const { rooms, entry } = catacombs(m, r, chapel, keep.stair);
  const { hall, chambers } = crypt(m, r, rooms, entry, mont);
  lairRooms.set(m, { catacombs: rooms, hall, chambers, chapel });
  m.lz = landingZone(m, landingSpot(n, chapel));
  return m;
}

/** A rectangle from its corner and size. */
const rectAt = (x0: number, y0: number, w: number, h: number): Rect => ({
  x0,
  y0,
  x1: x0 + w - 1,
  y1: y0 + h - 1,
});

/** Montségur: a broken curtain wall round the keep, rubble where it fell; rock on the slope. */
function castleRuins(m: BattleMap, r: Rng, chapel: Rect) {
  const n = m.w,
    g = LAIR.surface;
  const ring: Rect = inset({ x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, 7);
  // The wall stands on the ring's outer edge; rubble lies where it fell.
  const wallOrRubble = (x: number, y: number, dx: number, dy: number) => {
    const roll = r.next();
    if (roll < 0.6) setEdge(m, x, y, g, dx, dy, E.WALL, "stone");
    else if (roll < 0.8) setTile(m, x, y, g, T.LOW, "rubble");
  };
  for (let x = ring.x0; x <= ring.x1; x++)
    for (const y of [ring.y0, ring.y1]) wallOrRubble(x, y, 0, y === ring.y0 ? -1 : 1);
  for (let y = ring.y0; y <= ring.y1; y++)
    for (const x of [ring.x0, ring.x1]) wallOrRubble(x, y, x === ring.x0 ? -1 : 1, 0);
  for (let k = 0; k < 70; k++) {
    const x = r.int(1, n - 2),
      y = r.int(1, n - 2);
    if (!overlaps({ x0: x, y0: y, x1: x, y1: y }, chapel, 2))
      prop(m, x, y, r.chance(0.6) ? T.HIGH : T.LOW, r.chance(0.6) ? "rock" : "rubble");
  }
}

/** A churchyard: a low wall with gaps, rows of graves, yews. */
function churchyard(m: BattleMap, r: Rng, chapel: Rect) {
  const n = m.w;
  const yard: Rect = inset(chapel, -6);
  for (let x = yard.x0; x <= yard.x1; x++)
    for (const y of [yard.y0, yard.y1]) if (r.chance(0.8)) prop(m, x, y, T.LOW, "parapet");
  for (let y = yard.y0; y <= yard.y1; y++)
    for (const x of [yard.x0, yard.x1]) if (r.chance(0.8)) prop(m, x, y, T.LOW, "parapet");
  for (let y = yard.y0 + 2; y < yard.y1 - 1; y += 3)
    for (let x = yard.x0 + 2; x < yard.x1 - 1; x += 2)
      if (!overlaps({ x0: x, y0: y, x1: x, y1: y }, chapel, 1) && r.chance(0.55))
        prop(m, x, y, T.LOW, "grave");
  for (let k = 0; k < 30; k++) {
    const x = r.int(1, n - 2),
      y = r.int(1, n - 2);
    if (!overlaps({ x0: x, y0: y, x1: x, y1: y }, yard, 1)) prop(m, x, y, T.HIGH, "tree");
  }
}

/**
 * The catacombs: the first room is under the chapel, round the way down;
 * up to nine rooms joined in a tree (each to the nearest already joined) and
 * a couple of loops; sarcophagi, pillars and a light in each.
 */
function catacombs(m: BattleMap, r: Rng, chapel: Rect, chapelStair: Pt) {
  const n = m.w,
    g = LAIR.surface,
    z = LAIR.catacombs;
  const cat = new Carver(m, z);
  const free = (p: Pt) =>
    tileAt(m, p.x, p.y, g) === T.FLOOR &&
    Math.abs(p.x - chapelStair.x) + Math.abs(p.y - chapelStair.y) > 2;
  let entry: Pt = centre(chapel);
  for (let k = 0; k < 40; k++) {
    const p = { x: r.int(chapel.x0 + 2, chapel.x1 - 2), y: r.int(chapel.y0 + 2, chapel.y1 - 2) };
    if (free(p)) {
      entry = p;
      break;
    }
  }
  setTile(m, entry.x, entry.y, g, T.FLOOR, "stone");
  const rooms: Rect[] = [{ x0: entry.x - 2, y0: entry.y - 2, x1: entry.x + 2, y1: entry.y + 2 }];
  for (let k = 0; k < 60 && rooms.length < 9; k++) {
    const w = r.int(4, 8),
      h = r.int(4, 7);
    const a = rectAt(r.int(3, n - w - 4), r.int(3, n - h - 4), w, h);
    if (!rooms.some((q) => overlaps(q, a, 2))) rooms.push(a);
  }
  for (const a of rooms) cat.room(a);
  const joined = [rooms[0]!];
  const byDistance = (from: Pt) => (p: Rect, q: Rect) =>
    dist(centre(p), from) - dist(centre(q), from);
  for (const a of rooms.slice(1).sort(byDistance(entry))) {
    const near = [...joined].sort(byDistance(centre(a)))[0]!;
    cat.corridor(r, centre(a), centre(near), r.chance(0.3));
    joined.push(a);
  }
  for (let k = 0; k < 2; k++) cat.corridor(r, centre(r.pick(rooms)), centre(r.pick(rooms)), false);
  cat.apply("crypt", "rock");
  setTile(m, entry.x, entry.y, z, T.STAIRS, "wood");
  // Sarcophagi and pillars, clear of the corridors' mouths (anything that blocks a pocket is cleared by repair).
  for (const a of rooms.slice(1)) {
    if (rw(a) >= 6 && rh(a) >= 5)
      for (const p of [
        { x: a.x0 + 1, y: a.y0 + 1 },
        { x: a.x1 - 1, y: a.y1 - 1 },
      ])
        setTile(m, p.x, p.y, z, T.HIGH, "pillar");
    for (let k = r.int(1, 3); k > 0; k--) {
      const x = r.int(a.x0 + 1, a.x1 - 1),
        y = r.int(a.y0 + 1, a.y1 - 1);
      if (tileAt(m, x, y, z) === T.FLOOR && dist({ x, y }, entry) > 2)
        setTile(m, x, y, z, T.LOW, "sarcophagus");
    }
    m.lights.push({ ...centre(a), z });
  }
  return { rooms, entry };
}

/**
 * The crypt, under the catacombs' farthest room: the eldest's hall (two rows
 * of pillars, the altar at the far end) and a side chamber on each side that fits.
 */
function crypt(m: BattleMap, r: Rng, rooms: Rect[], entry: Pt, mont: boolean) {
  const n = m.w,
    z = LAIR.crypt;
  const far = [...rooms].sort((p, q) => dist(centre(q), entry) - dist(centre(p), entry))[0]!;
  const down = centre(far);
  if (tileAt(m, down.x, down.y, LAIR.catacombs) !== T.FLOOR)
    setTile(m, down.x, down.y, LAIR.catacombs, T.FLOOR, "crypt");
  const carver = new Carver(m, z);
  const hw = mont ? 18 : 15,
    hh = mont ? 12 : 10;
  const hall = rectAt(
    Math.max(3, Math.min(n - hw - 3, down.x - (down.x > n / 2 ? hw - 3 : 2))),
    Math.max(3, Math.min(n - hh - 3, down.y - Math.floor(hh / 2))),
    hw,
    hh,
  );
  carver.room(hall);
  // The way down lands inside the hall, at one end.
  const landing = {
    x: Math.max(hall.x0, Math.min(hall.x1, down.x)),
    y: Math.max(hall.y0, Math.min(hall.y1, down.y)),
  };
  if (landing.x !== down.x || landing.y !== down.y) carver.corridor(r, landing, down, false);
  const chambers: Rect[] = [];
  for (const side of [-1, 1]) {
    const cy = side < 0 ? hall.y0 - 6 : hall.y1 + 2;
    const c: Rect = { x0: hall.x0 + r.int(2, hw - 7), y0: cy, x1: 0, y1: cy + 3 };
    c.x1 = c.x0 + 4;
    if (c.y0 < 2 || c.y1 > n - 3) continue;
    carver.room(c);
    carver.corridor(r, centre(c), { x: centre(c).x, y: side < 0 ? hall.y0 : hall.y1 }, false);
    chambers.push(c);
  }
  carver.apply("crypt", "rock");
  setTile(m, down.x, down.y, z, T.STAIRS, "wood");
  for (const py of [hall.y0 + 2, hall.y1 - 2])
    for (let x = hall.x0 + 3; x <= hall.x1 - 3; x += 3)
      if (dist({ x, y: py }, down) > 2) setTile(m, x, py, z, T.HIGH, "pillar");
  const mid = centre(hall);
  const altarX = down.x > (hall.x0 + hall.x1) / 2 ? hall.x0 + 1 : hall.x1 - 1;
  for (let y = mid.y - 1; y <= mid.y + 1; y++) setTile(m, altarX, y, z, T.LOW, "altar");
  for (const x of [hall.x0 + 2, mid.x, hall.x1 - 2]) m.lights.push({ x, y: mid.y, z });
  return { hall, chambers };
}

/** Land at the edge, far from the chapel: the corner or side midpoint farthest from it. */
function landingSpot(n: number, chapel: Rect): Pt {
  const spots = [
    { x: 3, y: 3 },
    { x: n - 4, y: 3 },
    { x: 3, y: n - 4 },
    { x: n - 4, y: n - 4 },
    { x: n / 2, y: 3 },
    { x: 3, y: n / 2 },
  ];
  let best: Pt = { x: 3, y: 3 },
    score = -1;
  for (const c of spots) {
    const d = dist(c, centre(chapel));
    if (d > score) {
      best = { x: Math.floor(c.x), y: Math.floor(c.y) };
      score = d;
    }
  }
  return best;
}

/** The eldest at the altar; the vampires in the crypt and the catacombs; thralls through the catacombs and up top. */
export function lairSpawns(m: BattleMap, r: Rng, req: MapRequest): Spawn[] {
  const info = lairRooms.get(m)!;
  const out: Spawn[] = [];
  const used = new Set<number>();
  const pick = (rooms: Rect[], z: number): Pt3 | null => {
    const spots: Pt3[] = [];
    for (const a of rooms)
      for (let y = a.y0; y <= a.y1; y++)
        for (let x = a.x0; x <= a.x1; x++) {
          const i = idx(m, x, y, z);
          if (tileAt(m, x, y, z) === T.FLOOR && !used.has(i)) spots.push({ x, y, z });
        }
    if (!spots.length) return null;
    const p = r.pick(spots);
    used.add(idx(m, p.x, p.y, p.z));
    return p;
  };
  const hallFar: Rect = { ...info.hall };
  const elder = pick([hallFar], LAIR.crypt);
  if (elder) out.push({ ...elder, side: "vampire", elder: true });
  for (let k = 1; k < req.vampires; k++) {
    const p =
      k % 3 === 2
        ? pick(info.catacombs.slice(1), LAIR.catacombs)
        : pick([info.hall, ...info.chambers], LAIR.crypt);
    if (p) out.push({ ...p, side: "vampire" });
  }
  const surface: Rect = inset(info.chapel, -5);
  for (let k = 0; k < req.thralls; k++) {
    const p =
      k % 3 === 0
        ? pick([surface], LAIR.surface)
        : k % 3 === 1
          ? pick(info.catacombs, LAIR.catacombs)
          : pick([...info.chambers, info.hall], LAIR.crypt);
    if (p) out.push({ ...p, side: "thrall" });
  }
  return out;
}
