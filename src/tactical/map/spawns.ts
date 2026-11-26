// Spawns and validation: where each side starts, making sure every spawn can be reached, lights, doors shut.
import { type Rng } from "../../sim/core/rng";
import {
  E,
  edgeAt,
  edgeSkinAt,
  idx,
  indoors,
  isDoor,
  isTown,
  setEdge,
  setTile,
  skinAt,
  T,
  tileAt,
  unreachableTiles,
  walkable,
  type BattleMap,
  type Light,
  type Pt3,
  type Skin,
  type Spawn,
} from "./map";
import { type MapRequest, type Building, type Rect, dist, centre } from "./mapgen";
import { ORTHO } from "./buildings";
import { kerbSlot, kerbFree, OUT, sideTiles } from "./dressing";

// ---------------------------------------------------------------------------
// Spawns and validation

export function spawnsFor(m: BattleMap, r: Rng, req: MapRequest, buildings: Building[]): Spawn[] {
  const used = new Set<number>(m.lz.map((p) => idx(m, p.x, p.y, p.z)));
  const lz = m.lz[4] ?? m.lz[0]!;
  const free = (p: Pt3) => tileAt(m, p.x, p.y, p.z) === T.FLOOR && !used.has(idx(m, p.x, p.y, p.z));
  const inRooms = (rooms: Rect[], z: number): Pt3[] =>
    rooms
      .flatMap((q) => {
        const out: Pt3[] = [];
        for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) out.push({ x, y, z });
        return out;
      })
      .filter(free);
  const take = (from: Pt3[], side: Spawn["side"]): boolean => {
    const ok = from.filter(free);
    if (!ok.length) return false;
    const p = r.pick(ok);
    used.add(idx(m, p.x, p.y, p.z));
    out.push({ ...p, side });
    return true;
  };
  const out: Spawn[] = [];
  // The hideout: farthest from the landing zone.
  const byFar = [...buildings].sort((a, b) => dist(centre(b.rect), lz) - dist(centre(a.rect), lz));
  const hideout = byFar.find((b) => b.basement !== null) ?? byFar[0];
  // Below if there's a basement; else up top (an apartment block: the ground floor, the far end from the roof they land on).
  const vampireSpots = hideout
    ? hideout.basement !== null
      ? inRooms(hideout.basementRooms, hideout.basement)
      : inRooms(
          hideout.rooms,
          m.setting === "apartments" ? hideout.storeys[0]! : hideout.storeys.at(-1)!,
        )
    : [];
  // Anywhere outdoors at least 40% of the map away from the landing zone.
  const outdoors: Pt3[] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (dist({ x, y }, lz) > m.w * 0.4) outdoors.push({ x, y, z: m.ground });
  const hideoutGround = hideout ? inRooms(hideout.rooms, m.ground) : [];
  // Other buildings' rooms; on a site that's all one building (a block, a warehouse), every floor of it.
  const tall = m.setting === "apartments" || m.setting === "industrial";
  const otherRooms = (tall ? byFar.slice(0, 1) : byFar.slice(hideout ? 1 : 0, 3)).flatMap((b) =>
    b.storeys.flatMap((z) => inRooms(b.rooms, z)),
  );

  for (let k = 0; k < req.vampires; k++)
    take(vampireSpots, "vampire") || take(hideoutGround, "vampire") || take(outdoors, "vampire");
  // An apartment block: thralls on any floor of it (each its own pick), never out on the street.
  const anyFloor = () => (hideout ? inRooms(hideout.rooms, r.pick(hideout.storeys)) : []);
  for (let k = 0; k < req.thralls; k++) {
    const pool =
      m.setting === "apartments"
        ? k % 3 === 0
          ? hideoutGround
          : anyFloor()
        : k % 3 === 0
          ? hideoutGround
          : k % 3 === 1
            ? otherRooms
            : outdoors;
    take(pool, "thrall") || take(hideoutGround, "thrall") || take(outdoors, "thrall");
  }
  const anywhere: Pt3[] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) if (dist({ x, y }, lz) > 6) anywhere.push({ x, y, z: m.ground });
  for (let k = 0; k < (req.civilians ?? 0); k++) take(anywhere, "civilian");
  return out;
}

/** Clears props walling off unreachable pockets, a few passes. True if the map ends fully connected. */
export function repair(m: BattleMap): boolean {
  for (let pass = 0; pass < 6; pass++) {
    const lost = unreachableTiles(m);
    if (!lost.length) return true;
    for (const p of lost)
      for (const [dx, dy] of ORTHO) {
        const t = tileAt(m, p.x + dx, p.y + dy, p.z);
        if (t === T.LOW || t === T.HIGH) {
          const under = skinAt(m, p.x, p.y, p.z);
          setTile(m, p.x + dx, p.y + dy, p.z, T.FLOOR, under === "none" ? "grass" : under);
        }
        // Still shut in after a couple of passes: knock a doorway through.
        if (
          pass >= 2 &&
          edgeAt(m, p.x, p.y, p.z, dx, dy) === E.WALL &&
          walkable(m, p.x + dx, p.y + dy, p.z)
        )
          setEdge(m, p.x, p.y, p.z, dx, dy, E.DOOR, "stone");
      }
  }
  return !unreachableTiles(m).length;
}

/** Street lamps along the roads (town); a lamp over every outside door. */
export function lightsFor(m: BattleMap, r: Rng): Light[] {
  const out: Light[] = [];
  const g = m.ground;
  const far = (p: Pt3, d: number) => out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= d);
  // Doors to the outside: a lamp on the outdoor side of the doorway.
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      for (const [dx, dy] of ORTHO) {
        if (!isDoor(edgeAt(m, x, y, g, dx, dy)) || tileAt(m, x, y, g + 1) === T.VOID) continue;
        const p = { x: x + dx, y: y + dy, z: g };
        // On the wall over the door (the lit tile is the one outside it).
        if (
          walkable(m, p.x, p.y, g) &&
          tileAt(m, p.x, p.y, g + 1) === T.VOID &&
          far(p, 4) &&
          r.chance(0.7)
        )
          out.push({ ...p, wall: [-dx, -dy] });
      }
  // Street lamps: on the kerb line, evenly spaced (a step aside off a
  // driveway or a corner), clear of a door's lamp.
  if (isTown(m.setting))
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const k = kerbSlot(m, x, y);
        if (!k || k.slot !== 0) continue;
        const ax = k.side < 2 ? 1 : 0,
          ay = 1 - ax;
        const at = [
          { x, y },
          { x: x - ax, y: y - ay },
          { x: x + ax, y: y + ay },
        ].find((p) => kerbFree(m, p.x, p.y));
        if (at && far({ ...at, z: g }, 3)) out.push({ ...at, z: g });
      }
  return out;
}

/** Shops, offices, the hospital, the works: floors that aren't a home's. */
const COMMERCIAL_FLOORS = new Set<Skin>(["tile", "concrete"]);

/**
 * Which doors start closed: a door to the outside nearly always (0.9); one
 * inside a shop, the hospital or the works too (0.9); one inside a home or
 * a flat as it was left, more often closed than not (0.6). A double door
 * (doorways side by side) is one door: all shut or all open.
 */
export function shutDoors(m: BattleMap, r: Rng) {
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (edgeAt(m, x, y, z, dx, dy) !== E.DOOR) continue;
          const a = { x, y, z },
            b = { x: x + dx, y: y + dy, z };
          // The doorway beside it along the wall, already decided: the same.
          const prev = edgeAt(m, x - dy, y - dx, z, dx, dy);
          let shut: boolean;
          if (isDoor(prev)) shut = prev === E.SHUT;
          else {
            const outside = indoors(m, a) !== indoors(m, b);
            const shop =
              COMMERCIAL_FLOORS.has(skinAt(m, a.x, a.y, z)) ||
              COMMERCIAL_FLOORS.has(skinAt(m, b.x, b.y, z));
            shut = r.chance(outside || shop ? 0.9 : 0.6);
          }
          if (shut) setEdge(m, x, y, z, dx, dy, E.SHUT, edgeSkinAt(m, x, y, z, dx, dy));
        }
}

/**
 * Floor-to-ceiling glass on a building's outer walls (a shopfront, a
 * penthouse): each plain wall or window edge on these sides of `rect`,
 * level z, becomes glass with this chance (corners left solid).
 */
/** `chance`: a chance per pane, or which panes (by tile) are glass, for the same glazing on every floor. */
export function glaze(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  z: number,
  sides: number[],
  chance: number | ((x: number, y: number) => boolean),
) {
  for (const s of sides) {
    const [dx, dy] = OUT[s]!;
    for (const p of sideTiles(rect, s)) {
      const corner = (p.x === rect.x0 || p.x === rect.x1) && (p.y === rect.y0 || p.y === rect.y1);
      const e = edgeAt(m, p.x, p.y, z, dx, dy);
      if (
        !corner &&
        (e === E.WALL || e === E.WINDOW) &&
        walkable(m, p.x, p.y, z) &&
        (typeof chance === "number" ? r.chance(chance) : chance(p.x, p.y))
      )
        setEdge(m, p.x, p.y, z, dx, dy, E.GLASS, "none");
    }
  }
}
