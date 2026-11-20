// The battlescape's sizes in metres (docs/design/tactical.md, "Scale"). The
// ones shots fly through (levels, sills, props, figures) live with the rules
// in tactical/geometry.ts and are re-exported here; the rest are the look's.
import type { Skin } from "../tactical/map";
import { TILE } from "../tactical/geometry";
export { DOOR_LINTEL, LEVEL_H, lowProp, SILL, SLAB, TILE, VEHICLE_H, WINDOW_LINTEL } from "../tactical/geometry";

/** How thick a wall on a tile edge is drawn. */
export const WALL_T = 0.15;

/** World x or z of a tile's centre (fractional while moving). */
export const wc = (t: number) => (t + 0.5) * TILE;

/** Town kerbs: a road's surface sits this far below the pavement. */
export const KERB = 0.15;
/**
 * A rounded kerb at a junction corner: its radius (three tiles), and the
 * kerbstone's width. Grass or cobbles inside the pavement round the same
 * centre (LOT_R: the pavement, two tiles, keeps its width round the bend).
 */
export const KERB_R = 3 * TILE;
export const KERB_W = 0.2;
export const LOT_R = KERB_R - 2 * TILE;

/** A tree: trunk and canopy (heights above the floor). */
export const TREE = { trunk: 0.3, trunkH: 2.0, canopy: 1.05 * TILE, canopyY0: 1.9, canopyY1: 4.1 };
/** Other high props (pillars, rocks, stacks): height and footprint. */
export const HIGH = { h: 2.3, s: 0.85 * TILE };
/** Full-cover props with their own size: shelving, racking, fridges, fuel pumps (height, side). */
export const HIGH_PROP: Partial<Record<Skin, { h: number; s: number }>> = {
  shelf: { h: 2.0, s: 0.9 * TILE }, rack: { h: 2.3, s: TILE }, fridge: { h: 2.05, s: 0.85 * TILE }, pump: { h: 1.75, s: 0.5 * TILE },
};

/** Lamps: a street lamp's head, a brazier's fire (height above the floor). */
export const LAMP_H = { street: 3.6, brazier: 1.0 };
