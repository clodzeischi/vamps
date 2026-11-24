// Starting a new campaign: Base Padua (an Operational Base) plus one SIGINT station in a
// random European region (never Italy).
import { newBloodlineStates } from "./bloodlines";
import { newNetworks } from "./networks";
import { difficulty, type DifficultyId } from "../data/difficulty";
import { PADUA } from "../data/places";
import { REGIONS } from "../data/regions";
import { foundOrder } from "./personnel";
import { suggestName } from "./commands";
import { rng } from "./rng";
import { addLog, STATE_VERSION, type GameState, type Installation } from "./state";
import { newStory, openingBriefing } from "./story";
import { newMarket } from "./market";
import { regionalContribution } from "./economy";
import { openLedger } from "./ledger";
import { CAMPAIGN_START } from "./time";



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
    staff: [],
    candidates: [],
    aircraft: [],
    operations: [],
    leads: [],
    missions: [],
    sites: [],
    networks: newNetworks(seed),
    // Act I: Padua hunts Agnes, so the section starts on her house.
    section: { find: { kind: "house", id: "carcassonne" }, fixing: null, findPoints: 0, fixPoints: 0 },
    cases: [],
    fallen: [],
    coverUps: [],
    heat: 0,
    lastIncident: null,
    media: {},
    mediaSpent: 0,
    research: { done: [] },
    engineering: { done: [] },
    projects: [],
    bloodlines: newBloodlineStates(),
    story: newStory(CAMPAIGN_START, seed),
    assets: [],
    market: newMarket(),
    debtMonths: 0,
    hostileWarned: false,
    nextOperation: {},
    events: [],
    log: [],
    nextId: 1,
    monthIndex: 0,
    monthStartSupport: 0,
    lastReport: null,
    gameOver: null,
    // Opened properly below, once the founding base stands.
    ledger: { current: { month: 0, secrecyStart: 0, support: {}, contribution: {}, secrecy: [] }, previous: null },
  };
  const r = rng(s);

  const padua: Installation = {
    id: "ob-padua", kind: "base", name: "Base Padua", regionId: "italy",
    pos: PADUA, readyAt: s.startTime, evictionWarned: false,
  };
  const european = REGIONS.filter((x) => x.group === "Europe" && x.id !== "italy");
  const region = r.pick(european);
  const city = region.station ?? r.pick(region.cities.slice(0, 3));
  const pos = { lat: city.lat, lon: city.lon };
  const station: Installation = {
    id: `sigint-${s.nextId++}`, kind: "sigint", name: suggestName(s, "sigint", region.id, pos), regionId: region.id,
    pos, readyAt: s.startTime, evictionWarned: false,
  };
  s.installations.push(padua, station);
  foundOrder(s, padua.id);
  s.monthStartSupport = Object.values(s.regions).reduce((a, x) => a + x.support, 0) / REGIONS.length;
  s.ledger = { current: openLedger(s, (id) => regionalContribution(s, id)), previous: null };
  addLog(s, "The Ordo Potestatis Vera is reconstituted. May God forgive us what we must do.");
  openingBriefing(s);
  return s;
}
