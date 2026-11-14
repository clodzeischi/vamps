import * as THREE from "three";
import type { LatLon } from "../sim/time";

const DEG = Math.PI / 180;

/**
 * Lat/lon to a point on a sphere, matching THREE.SphereGeometry's UV layout
 * with an equirectangular texture whose left edge is longitude -180.
 */
export function latLonToVector3(p: LatLon, radius = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = (p.lon + 180) * DEG;
  const theta = (90 - p.lat) * DEG;
  return out.set(-radius * Math.sin(theta) * Math.cos(phi), radius * Math.cos(theta), radius * Math.sin(theta) * Math.sin(phi));
}

export function vector3ToLatLon(v: THREE.Vector3): LatLon {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG;
  let lon = Math.atan2(n.z, -n.x) / DEG - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

export function formatLatLon(p: LatLon): string {
  const ns = p.lat >= 0 ? "N" : "S";
  const ew = p.lon >= 0 ? "E" : "W";
  return `${Math.abs(p.lat).toFixed(2)}° ${ns}  ${Math.abs(p.lon).toFixed(2)}° ${ew}`;
}
