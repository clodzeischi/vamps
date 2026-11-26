// Flight routes. An aircraft flies direct when the target is within its reach;
// otherwise it hops through our refuelling stations, each leg within reach,
// stopping a couple of hours at each to refuel. The quickest route wins.
// Hired flights (charter, airline) reach anywhere and don't use this.
import { AIRCRAFT, type AircraftKind } from "../../data/aircraft";
import { distanceNm } from "../core/geo";
import { isReady, type GameState, type Installation } from "../core/state";
import { HOUR, type LatLon } from "../core/time";

/** Hours on the ground at each refuelling stop. */
export const REFUEL_HOURS = 2;

interface Route {
  /** Refuelling stations on the way, in order (empty: direct). */
  stops: Installation[];
  /** Total distance flown, nm. */
  distance: number;
  /** Total time, flying and refuelling. */
  hours: number;
}

/** One stretch of a flight on the clock (a refuelling stop is the gap between two). */
export interface Leg {
  from: LatLon;
  to: LatLon;
  start: number;
  end: number;
}

const refuelStations = (s: GameState) => s.installations.filter((i) => i.kind === "fuel" && isReady(s, i));

/** The quickest route for an aircraft of this kind, or null if nothing gets it there. */
export function planRoute(s: GameState, from: LatLon, to: LatLon, kind: AircraftKind): Route | null {
  const { reachNm, speedKn } = AIRCRAFT[kind];
  const direct = distanceNm(from, to);
  if (direct <= reachNm) return { stops: [], distance: direct, hours: direct / speedKn };
  // Dijkstra on time over: start, the stations, the target.
  const stations = refuelStations(s);
  const nodes: LatLon[] = [from, ...stations.map((x) => x.pos), to];
  const end = nodes.length - 1;
  const time = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  time[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && time[i]! < Infinity && (u < 0 || time[i]! < time[u]!)) u = i;
    if (u < 0 || u === end) break;
    done[u] = true;
    for (let v = 1; v < nodes.length; v++) {
      if (done[v] || v === u) continue;
      const d = distanceNm(nodes[u]!, nodes[v]!);
      if (d > reachNm) continue;
      // Landing somewhere other than the target means a refuelling stop there.
      const t = time[u]! + d / speedKn + (v === end ? 0 : REFUEL_HOURS);
      if (t < time[v]!) {
        time[v] = t;
        prev[v] = u;
      }
    }
  }
  if (time[end] === Infinity) return null;
  const path: number[] = [];
  for (let v = end; v >= 0; v = prev[v]!) path.unshift(v);
  let distance = 0;
  for (let i = 1; i < path.length; i++) distance += distanceNm(nodes[path[i - 1]!]!, nodes[path[i]!]!);
  return { stops: path.slice(1, -1).map((i) => stations[i - 1]!), distance, hours: time[end]! };
}

/** The legs of a route on the clock, leaving at `depart` and arriving at `arrive` (the last leg absorbs any rounding). */
export function routeLegs(route: Route, from: LatLon, to: LatLon, kind: AircraftKind, depart: number, arrive: number): Leg[] {
  const points = [from, ...route.stops.map((x) => x.pos), to];
  const legs: Leg[] = [];
  let t = depart;
  for (let i = 1; i < points.length; i++) {
    const hours = distanceNm(points[i - 1]!, points[i]!) / AIRCRAFT[kind].speedKn;
    const last = i === points.length - 1;
    legs.push({ from: points[i - 1]!, to: points[i]!, start: t, end: last ? arrive : t + hours * HOUR });
    t += (hours + REFUEL_HOURS) * HOUR;
  }
  return legs;
}

/** "direct", "via Airstrip Lyon", "via Airstrip Lyon and Airstrip Tunis". */
export function routeWords(route: Route): string {
  if (!route.stops.length) return "direct";
  const names = route.stops.map((x) => x.name);
  return `via ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}`;
}
