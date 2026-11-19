// The battlescape's sizes in metres (docs/design/tactical.md, "Scale"). Shared
// by the renderer and the baked lighting, so what is drawn is what casts the
// shadows. The rules count in tiles; only the view knows the metres.
import type { Skin } from "../tactical/map";

/** A tile's side. */
export const TILE = 1.5;
/** One level, floor to floor: 2.4 m to the ceiling, then the next floor's slab. */
export const LEVEL_H = 2.5;
export const SLAB = 0.1;
/** How thick a wall on a tile edge is drawn. */
export const WALL_T = 0.15;
/** Openings: a window's sill and the wall over it; the wall over a doorway (a 2 m door). */
export const SILL = 0.9;
export const WINDOW_LINTEL = 0.3;
export const DOOR_LINTEL = 0.4;

/** World x or z of a tile's centre (fractional while moving). */
export const wc = (t: number) => (t + 0.5) * TILE;

/** A low prop (half cover): its height above the floor and its footprint across. */
export function lowProp(skin: Skin): { h: number; s: number } {
  if (skin === "car") return { h: 1.35, s: 0.9 * TILE };
  // About waist to chest high on a 1.78 m figure.
  const h = skin === "fence" || skin === "parapet" ? 1.0 : skin === "bench" ? 0.5 : skin === "grave" ? 0.8 : skin === "rubble" ? 0.6 : 0.9;
  const s = (skin === "fence" || skin === "parapet" || skin === "altar" ? 1 : skin === "grave" ? 0.5 : skin === "sarcophagus" ? 0.85 : 0.8) * TILE;
  return { h, s };
}

/** A tree: trunk and canopy (heights above the floor). */
export const TREE = { trunk: 0.3, trunkH: 2.0, canopy: 1.05 * TILE, canopyY0: 1.9, canopyY1: 4.1 };
/** Other high props (pillars, rocks, stacks): height and footprint. */
export const HIGH = { h: 2.3, s: 0.85 * TILE };

/** Lamps: a street lamp's head, a brazier's fire (height above the floor). */
export const LAMP_H = { street: 3.6, brazier: 1.0 };
