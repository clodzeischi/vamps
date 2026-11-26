// Streets round the special sites: parked cars, trees, the road along the south edge, landing on it.
import type { Rng } from "../../sim/core/rng";
import { skinAt, T, tileAt, type BattleMap, type Pt3 } from "./map";
import { PAVE, ROAD_W, type Rect } from "./mapgen";
import { clearVehicles, fill, landingZone, prop, someVehicle, treeRoom, vehicle } from "./dressing";

/** Parks cars along a street's two parking lanes (a road along x, rows y0 … y0 + 7), clear of `keep` columns. */
export function parkStreet(m: BattleMap, r: Rng, y0: number, keep: (x: number) => boolean) {
  for (const [lane, front] of [
    [y0, -1],
    [y0 + ROAD_W - 2, 1],
  ] as const)
    for (let x = r.int(0, 3); x < m.w;) {
      const kind = someVehicle(r);
      const len = { car: 3, suv: 4, truck: 6, ambulance: 4, container: 4 }[kind];
      let clear = x + len <= m.w;
      for (let i = 0; i < len; i++) if (keep(x + i)) clear = false;
      if (clear && r.chance(0.5) && vehicle(m, r, x, lane, true, kind, front))
        x += len + r.int(1, 3);
      else x += r.int(1, 3);
    }
}

/** Trees on grass in a rect, spaced (never two side by side). */
export function scatterTrees(m: BattleMap, r: Rng, a: Rect, chance: number) {
  for (let y = a.y0; y <= a.y1; y++)
    for (let x = a.x0; x <= a.x1; x++)
      if (
        skinAt(m, x, y, m.ground) === "grass" &&
        tileAt(m, x, y, m.ground) === T.FLOOR &&
        treeRoom(m, x, y) &&
        r.chance(chance)
      )
        prop(m, x, y, T.HIGH, "tree");
}

/** A street along the map's south edge: the road (8) and its pavement (PAVE). Returns the road's first row. */
export function southStreet(m: BattleMap): number {
  const n = m.w,
    y0 = m.h - ROAD_W;
  fill(m, { x0: 0, y0, x1: n - 1, y1: m.h - 1 }, m.ground, T.FLOOR, "road");
  fill(m, { x0: 0, y0: y0 - PAVE, x1: n - 1, y1: y0 - 1 }, m.ground, T.FLOOR, "pavement");
  return y0;
}

/** A 3 × 3 landing zone on the road at column x (vehicles moved off first). */
export function roadLz(m: BattleMap, x: number, roadY: number): Pt3[] {
  clearVehicles(m, { x0: x - 3, y0: roadY, x1: x + 3, y1: m.h - 1 });
  return landingZone(m, { x, y: roadY + 4 });
}
