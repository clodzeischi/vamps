// The battlescape's sizes in metres, shared by the rules and the renderer
// (docs/design/tactical.md, "Scale"). The rules count most things in tiles,
// but shots are ballistic (tactical/ballistics.ts): a round flies through
// the same walls, sills, props and figures that are drawn, so their heights
// live here, once. render/scale.ts re-exports these and adds the look-only
// sizes (kerbs, trees, lamps).
import type { Skin } from "./map";

/** A tile's side. */
export const TILE = 1.5;
/** One level, floor to floor: 2.4 m to the ceiling, then the next floor's slab. */
export const LEVEL_H = 2.5;
export const SLAB = 0.1;
/** Openings: a window's sill and the wall over it; the wall over a doorway (a 2 m door). */
export const SILL = 0.9;
export const WINDOW_LINTEL = 0.3;
export const DOOR_LINTEL = 0.4;

/**
 * Vehicles (drawn over their whole footprint, two tiles across): the roof's
 * height for each kind; a truck's box is the tallest part.
 */
export const VEHICLE_H = { car: 1.45, suv: 1.8, truck: 3.2, ambulance: 2.6, container: 2.6 };

/** A low prop (half cover): its height above the floor and its footprint across. */
export function lowProp(skin: Skin): { h: number; s: number } {
  if (skin === "car") return { h: VEHICLE_H.suv, s: TILE };
  // About waist to chest high on a 1.78 m figure.
  const h = skin === "fence" || skin === "parapet" || skin === "counter" ? 1.0 : skin === "bench" ? 0.5 : skin === "bed" || skin === "tv" ? 0.6 : skin === "sofa" ? 0.85 : skin === "grave" ? 0.8 : skin === "rubble" ? 0.6 : 0.9;
  const s = (skin === "fence" || skin === "parapet" || skin === "altar" || skin === "counter" ? 1 : skin === "grave" ? 0.5 : skin === "sarcophagus" || skin === "bed" || skin === "sofa" ? 0.85 : 0.8) * TILE;
  return { h, s };
}

/**
 * What stops a round at a low prop: its height, but for a car's or an SUV's
 * tiles only the body (the windows above it are glass a round goes through).
 */
export const LOW_STOPS = (skin: Skin) => (skin === "car" ? 1.1 : lowProp(skin).h);

/**
 * Figures, as the rules see them for shots: an upright cylinder of this
 * radius, the height of the drawn figure (an agent 1.78 m, a vampire 1.89 m).
 * Beside low cover agents and thralls are drawn crouched, two thirds the
 * height, and are hit that way too; a body lying down is a low slab.
 */
export const FIGURE = { radius: 0.3, human: 1.78, vampire: 1.89, crouch: 0.66, lying: 0.35, helicopter: { radius: 1.6, h: 2.6 } };
/** Where a figure's chest is, the point a shot aims at (a share of its height). */
export const CHEST = 0.72;
/** Where a shooter's gun is: the shoulder (a share of its height). */
export const SHOULDER = 0.82;
