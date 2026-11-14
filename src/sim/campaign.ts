// Starting a new campaign: Operational Base Padua plus one SIGINT station in a
// random European region (never Italy).
import { difficulty, type DifficultyId } from "../data/difficulty";
import { INSTALLATIONS, type InstallationKind } from "../data/installations";
import { PADUA } from "../data/places";
import { REGIONS, regionById } from "../data/regions";
import { foundOrder } from "./personnel";
import { angularDistance } from "./geo";
import { rng } from "./rng";
import { addLog, STATE_VERSION, type GameState, type Installation } from "./state";
import { CAMPAIGN_START, type LatLon } from "./time";


/** "SIGINT Station Norilsk", "Operational Base Lyon": named after the nearest city. */
export function installationName(kind: InstallationKind, regionId: string, pos: LatLon): string {
  const region = regionById(regionId);
  let place = region?.name ?? "Unknown";
  if (kind === "sigint" && region?.station) place = region.station.name;
  else if (region?.cities.length) {
    place = region.cities.reduce((best, c) => (angularDistance(c, pos) < angularDistance(best, pos) ? c : best)).name;
  }
  return `${INSTALLATIONS[kind].name} ${place}`;
}

export function newCampaign(diff: DifficultyId, seed: number): GameState {
  const s: GameState = {
    version: STATE_VERSION,
    seed,
    rng: seed | 0,
    difficulty: diff,
    startTime: CAMPAIGN_START,
    time: CAMPAIGN_START,
    funds: difficulty(diff).startFunds,
    secrecy: 80,
    openWar: false,
    regions: Object.fromEntries(REGIONS.map((r) => [r.id, { support: r.startSupport }])),
    installations: [],
    agents: [],
    candidates: [],
    aircraft: [],
    operations: [],
    leads: [],
    nextOperation: {},
    events: [],
    log: [],
    nextId: 1,
    monthIndex: 0,
    monthStartSupport: 0,
    lastReport: null,
    gameOver: null,
  };
  const r = rng(s);

  const padua: Installation = {
    id: "ob-padua", kind: "base", name: "Operational Base Padua", regionId: "italy",
    pos: PADUA, readyAt: s.startTime, evictionWarned: false,
  };
  const european = REGIONS.filter((x) => x.group === "Europe" && x.id !== "italy");
  const region = r.pick(european);
  const city = region.station ?? r.pick(region.cities.slice(0, 3));
  const pos = { lat: city.lat, lon: city.lon };
  const station: Installation = {
    id: `sigint-${s.nextId++}`, kind: "sigint", name: installationName("sigint", region.id, pos), regionId: region.id,
    pos, readyAt: s.startTime, evictionWarned: false,
  };
  s.installations.push(padua, station);
  foundOrder(s, padua.id);
  s.monthStartSupport = Object.values(s.regions).reduce((a, x) => a + x.support, 0) / REGIONS.length;
  addLog(s, "The Ordo Potestatis Vera is reconstituted. May God forgive us what we must do.");
  return s;
}
