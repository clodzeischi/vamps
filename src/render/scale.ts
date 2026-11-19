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
  if (skin === "car") return { h: VEHICLE_H.suv, s: TILE };
  // About waist to chest high on a 1.78 m figure.
  const h = skin === "fence" || skin === "parapet" || skin === "counter" ? 1.0 : skin === "bench" ? 0.5 : skin === "bed" ? 0.6 : skin === "grave" ? 0.8 : skin === "rubble" ? 0.6 : 0.9;
  const s = (skin === "fence" || skin === "parapet" || skin === "altar" || skin === "counter" ? 1 : skin === "grave" ? 0.5 : skin === "sarcophagus" || skin === "bed" ? 0.85 : 0.8) * TILE;
  return { h, s };
}

/**
 * Vehicles (drawn over their whole footprint, two tiles across): the roof's
 * height for each kind; a truck's box is the tallest part.
 */
export const VEHICLE_H = { car: 1.45, suv: 1.8, truck: 3.2, ambulance: 2.6, container: 2.6 };

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
