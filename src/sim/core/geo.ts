import type { LatLon } from "./time";

const toRad = Math.PI / 180;
const EARTH_RADIUS_NM = 3440.065;

/** Great-circle angle between two points, in radians. */
export function angularDistance(a: LatLon, b: LatLon): number {
  const d =
    Math.sin(a.lat * toRad) * Math.sin(b.lat * toRad) +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((a.lon - b.lon) * toRad);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

export const distanceNm = (a: LatLon, b: LatLon) => angularDistance(a, b) * EARTH_RADIUS_NM;
