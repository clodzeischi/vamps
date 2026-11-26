// Checks and counts the gallery shows beside each map.
import { E, edgeAt, idx, isDoor, T, tileAt, walkable, type BattleMap } from "../tactical/map/map";

export interface Issue {
  x: number;
  y: number;
  z: number;
  text: string;
}

/** A doorway with a prop or a lamp on the tile either side of it. */
export function blockedDoorways(m: BattleMap): Issue[] {
  const lit = new Set(m.lights.map((l) => idx(m, l.x, l.y, l.z)));
  const out: Issue[] = [];
  const seen = new Set<number>();
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ] as const) {
          // Each edge once (east and south), plus the map's west and north border.
          if ((dx < 0 && x > 0) || (dy < 0 && y > 0)) continue;
          if (!isDoor(edgeAt(m, x, y, z, dx, dy))) continue;
          for (const p of [
            { x, y },
            { x: x + dx, y: y + dy },
          ]) {
            const t = tileAt(m, p.x, p.y, z);
            if (t === T.VOID) continue;
            const i = idx(m, p.x, p.y, z);
            if (seen.has(i)) continue;
            if (t === T.LOW || t === T.HIGH)
              (out.push({ ...p, z, text: "prop in a doorway" }), seen.add(i));
            else if (lit.has(i)) (out.push({ ...p, z, text: "lamp in a doorway" }), seen.add(i));
          }
        }
  return out;
}

interface Stats {
  walkable: number;
  props: number;
  doors: number;
  windows: number;
  walls: number;
  lights: number;
  spawns: number;
}

export function statsOf(m: BattleMap): Stats {
  let walk = 0,
    props = 0;
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (walkable(m, x, y, z)) walk++;
        const t = tileAt(m, x, y, z);
        if (t === T.LOW || t === T.HIGH) props++;
      }
  let doors = 0,
    windows = 0,
    walls = 0;
  for (const a of [m.ew, m.ns])
    for (const e of a) {
      if (e === E.DOOR || e === E.SHUT) doors++;
      else if (e === E.WINDOW || e === E.SILL) windows++;
      else if (e === E.WALL) walls++;
    }
  return {
    walkable: walk,
    props,
    doors,
    windows,
    walls,
    lights: m.lights.length,
    spawns: m.spawns.length,
  };
}
