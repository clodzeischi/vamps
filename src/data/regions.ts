// Regions: hand-written definitions (regions.json) joined with data generated
// from Natural Earth by scripts/build-regions.mjs (label point, area, cities).
import defs from "./regions.json";
import generated from "./regions.generated.json";
import places from "./places.generated.json";
import adjacency from "./adjacency.generated.json";
import type { LatLon } from "../sim/time";

export interface City extends LatLon {
  name: string;
  pop: number;
}

interface RegionDef {
  id: string;
  /** Pixel value of this region in public/assets/regions.png. */
  index: number;
  name: string;
  group: string;
  startSupport: number;
  funding: number;
  label: LatLon;
  area: number;
  cities: City[];
  /** Fixed name and place for a SIGINT station here (e.g. Norilsk, Baikal). */
  station?: { name: string; lat: number; lon: number };
}

type Generated = Record<string, { index: number; label: LatLon; area: number; cities: City[] }>;
const gen = generated as Generated;

export const REGIONS: RegionDef[] = defs.regions.map((r) => {
  const g = gen[r.id];
  if (!g) throw new Error(`regions.generated.json is missing ${r.id}; run scripts/build-regions.mjs`);
  return {
    id: r.id,
    index: g.index,
    name: r.name,
    group: r.group,
    startSupport: r.support,
    funding: r.funding,
    label: g.label,
    area: g.area,
    cities: g.cities,
    station: (r as { station?: RegionDef["station"] }).station,
  };
});

const byId = new Map(REGIONS.map((r) => [r.id, r]));
const byIndex = new Map(REGIONS.map((r) => [r.index, r]));

export const regionById = (id: string) => byId.get(id);
export const regionByIndex = (index: number) => byIndex.get(index);
export const isRegionId = (id: string) => byId.has(id);

/** Every named town in a region (Natural Earth, via scripts/build-places.mjs), biggest first. For naming installations. */
export interface Place extends LatLon {
  name: string;
}
const gazetteer = places as unknown as Record<string, [string, number, number][]>;
export const placesIn = (regionId: string): Place[] =>
  (gazetteer[regionId] ?? []).map(([name, lat, lon]) => ({ name, lat, lon }));

/** Regions that share a border or a short sea crossing (scripts/build-adjacency.mjs). */
const neighbourMap = adjacency as Record<string, string[]>;
export const neighboursOf = (regionId: string): string[] => neighbourMap[regionId] ?? [];
