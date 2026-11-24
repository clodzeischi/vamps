// The whole campaign as plain, JSON-serialisable data. Everything saved lives
// here; systems are free functions that take a GameState and mutate it.
import type { AircraftKind } from "../data/aircraft";
import type { DifficultyId } from "../data/difficulty";
import type { KitId } from "../data/kit";
import { APTITUDE_CAP, APTITUDES, type Aptitudes, type OperatorAptitude, type Role, type StaffRole } from "../data/aptitudes";
import type { BaseUpgradeKind, InstallationKind } from "../data/installations";
import type { CultureId } from "../data/names";
import type { StoryState } from "./story";
import type { Tier } from "./judged";
import type { Leg } from "./routes";
import type { ItemId } from "../data/equipment";
import type { Asset, AssetKind } from "./humint";
import type { Gear } from "./inventory";
import type { LatLon } from "./time";
import type { PackedBattle } from "../tactical/save";
import type { Room } from "./building";

export const STATE_VERSION = 13;

export interface RegionState {
  /** -5 (backs the vampires) .. +5 (backs the OPV). Shown rounded. */
  support: number;
  /** What the region pledges, as a share of its usual contribution (1 = as usual).
   *  Moves at each month's review with what we did there (sim/economy.ts). */
  pledge?: number;
  /** This month's record in the region, settled into the pledge at month end. */
  credit?: number;
}

/** Goods sold on the dark web (sim/market.ts). */
export type GoodId = "tissue" | "plasma" | "blockers" | "sterilisers" | "inserts";

/** A piece of a bloodline's hoarded history, taken in a raid. */
export interface Artifact {
  id: string;
  name: string;
  bloodline: string;
  /** Where it was taken (returning it pleases this region). */
  regionId: string;
  city: string;
  /** What a collector pays at full demand. */
  value: number;
  takenAt: number;
  /** A line's treasure, from its lair. */
  treasure?: boolean;
}

export interface MarketState {
  /** Products on hand (tissue is counted from the remains at our bases). */
  stock: Partial<Record<GoodId, number>>;
  /** 0.1..1 per market (absent = 1). */
  demand: Partial<Record<GoodId | "artifacts", number>>;
  artifacts: Artifact[];
  /** Every artifact name ever found, so none turns up twice. */
  found: string[];
  /** Sales this month, for the report. */
  earned: number;
  /** Research we sold, by project id: when it was sold and when it goes public (out once announced). */
  sold?: Record<string, { soldAt: number; publicAt: number; out?: boolean }>;
}

export interface Installation {
  id: string;
  kind: InstallationKind;
  name: string;
  regionId: string;
  pos: LatLon;
  /** Game time at which construction finishes (<= time means operational). */
  readyAt: number;
  /** Set when the region has warned it will evict this installation. */
  evictionWarned: boolean;
  /** A church cell (sim/story.ts): a base in a parish basement, cheap to keep. */
  cell?: boolean;
  /** Operational Bases only: aircraft slots. (Beds, labs, workshops and cells are its rooms.) */
  hangars?: number;
  /** The lead engineer (a staff id): their aptitudes multiply everyone else's here (sim/engineering.ts). */
  leadEngineer?: string;
  /** SIGINT centre level (0-2): the base listens like a station. */
  sigintCentre?: number;
  /** The armoury: equipment in stock here, not carried by anyone. */
  armoury?: Partial<Record<ItemId, number>>;
  /** Vampire remains in cold storage. */
  remains?: number;
  captives?: Captive[];
  /** Rooms under way; a new room has its tile (floor −1..1, slot 0..7 round the core). */
  upgrades?: { kind: BaseUpgradeKind; readyAt: number; floor?: number; slot?: number }[];
  /** Operational Bases only: built rooms in the building (sim/building.ts), laid out when the base is founded. */
  rooms?: Room[];
}

/** Anyone the Order has, or could take on: an operator (one of its agents) or a lay scientist, engineer
 *  or analyst. Every role has four aptitudes (data/aptitudes.ts). */
export interface Person {
  id: string;
  role: Role;
  name: string;
  /** Sets the title (Sr. or Br., for an operator) and the portrait. */
  female: boolean;
  /** Where the name comes from. */
  culture: CultureId;
  /** Their role's four aptitudes, 0–100 (staff grow in fractions). */
  aptitudes: Aptitudes;
}

/** Someone the Church's network has put forward this month, for any role. */
export interface Candidate extends Person {
  /** An operator's Vitality: their hit points. */
  vitality?: number;
}

/** A person on a base's roster: they take a bed there. */
export interface Member extends Person {
  baseId: string;
  joinedAt: number;
  /** In transit to baseId (aboard a ferry flight or by airline) until then. */
  arriveAt?: number;
}

/** A scientist, engineer or analyst: lay staff, paid a salary. */
export interface StaffMember extends Member {
  role: StaffRole;
}

/** An operator: one of the Order's agents, under vows. */
export interface Agent extends Member {
  role: "operator";
  aptitudes: Record<OperatorAptitude, number>;
  /** How much punishment the body takes: full health. */
  vitality: number;
  /** Current health; at most vitality. */
  hp: number;
  /** Game time when wounds heal (0 = fit). */
  woundedUntil: number;
  missions: number;
  kills: number;
  /** What the agent carries (data/equipment.ts). Missing weapon: a knife. */
  gear?: Gear;
}

/** An agent's loadout: worn items and a grid of pockets and a backpack (sim/inventory.ts). */
export type { Gear } from "./inventory";

export interface Aircraft {
  id: string;
  kind: AircraftKind;
  name: string;
  baseId: string;
  /** Flying to another base (sim/transfers.ts): baseId is already the new base. */
  ferry?: { fromBaseId: string; departAt: number; arriveAt: number; people: string[]; /** Where it set out from, after a change of course. */ from?: LatLon };
  /** Aboard and bound for baseId: unloaded on landing (sim/transfers.ts). */
  cargo?: Cargo;
}

/** What an aircraft carries besides people. */
export interface Cargo {
  /** Sets of vampire remains (a corpse each). */
  remains: number;
  captives: Captive[];
  /** Armoury items in crates. */
  items?: Partial<Record<ItemId, number>>;
}

/** Items on their way by courier (only what may travel that way: data/equipment.ts), or a dark-web order. */
export interface Shipment {
  id: string;
  toBaseId: string;
  arriveAt: number;
  items: Partial<Record<ItemId, number>>;
  /** Bought on the dark web (sim/market.ts), not sent from one of our bases. */
  darkWeb?: boolean;
}

export type OperationKind = "feeding" | "recruitment" | "infiltration";
export type LeadKind = "capture" | "source" | "double" | "surveillance" | "recovery" | "rescue";

/** Something a bloodline is doing somewhere. Seen only through SIGINT leads. */
export interface Operation {
  id: string;
  bloodline: string;
  kind: OperationKind;
  regionId: string;
  pos: LatLon;
  city: string;
  startedAt: number;
  endsAt: number;
  leadId: string | null;
  /** A team dealt with its lead (well or badly): it no longer counts as ignored. */
  handled?: boolean;
  /** The site in the house's network whose people run it (sim/networks.ts). */
  siteId?: string;
}

/** The discipline a lead or a piece of evidence came by (docs/design/intelligence.md). */
export type Discipline = "osint" | "humint" | "sigint";
/** How a lead reached us: by a discipline the section works (sim/intel.ts), or a volunteer who came
 *  forward (HUMINT, but a channel of its own: likelier real, likelier a trap). */
export type LeadVia = Discipline | "volunteer";

/** One piece of evidence on a case: for or against, and how much it says (its likelihood ratio). */
export interface Evidence {
  at: number;
  disc: Discipline;
  /** Points toward the case being real (true) or noise (false). */
  supports: boolean;
  /** P(this evidence | real) / P(this evidence | noise). */
  lr: number;
  text: string;
}

/** What one or more leads are about: real activity or noise. The confidence shown is the honest
 *  posterior: the prior is the share of real leads where it came from, and each piece of evidence
 *  moves it by its likelihood ratio (sim/intel.ts). */
export interface IntelCase {
  id: string;
  /** The truth, hidden from the player. */
  real: boolean;
  /** P(real) when the first lead turned up. */
  prior: number;
  evidence: Evidence[];
}

/** A lead: one thread of an operation the player can pull on, or of nothing at all. */
export interface Lead {
  id: string;
  /** The operation behind it; "" for a lead that is only noise. */
  opId: string;
  /** The case it belongs to (sim/intel.ts). */
  caseId: string;
  /** What it really is. A double agent is shown to the player as a source. */
  kind: LeadKind;
  regionId: string;
  pos: LatLon;
  city: string;
  appearedAt: number;
  expiresAt: number;
  /** 0..1: how good the intel is. Better intel, better odds and warnings. */
  intel: number;
  title: string;
  text: string;
  /** The team sent to it, if any. */
  missionId?: string | null;
  /** How it reached us. */
  via: LeadVia;
  /** Sources (and doubles posing as one): who they are, and what they could be for us as an asset. */
  who?: string;
  asset?: AssetKind;
  /** Set when the lead's story fixed the source's sex (the nurse, the detective). */
  whoFemale?: boolean;
}

/** A haven is a skirmish size only: in the campaign the elder's haven is the lair. */
export type SiteKind = "nest" | "den" | "haven" | "lair";

/** One site of a house's network (sim/networks.ts). It exists whether we know of it or not. */
export interface NetSite {
  id: string;
  kind: Exclude<SiteKind, "haven">;
  /** The den over a nest, the lair over a den; null for the lair. */
  parentId: string | null;
  regionId: string;
  city: string;
  pos: LatLon;
  /** On the map as a strike target (a Site with this netId). */
  known: boolean;
  /** Burned out by our team. */
  raided: boolean;
}

/** A house's network and how far up it we have climbed. */
export interface HouseNetwork {
  sites: NetSite[];
  /** Den clues found and not yet spent: every CLUES_PER_DEN reveal a den. */
  clues: number;
  /** Raids, snatches and questionings that taught us something: each opens a page of the chronicle. */
  pages: number;
  /** Once its lair is found: the house may assault one of our bases from this time. */
  nextAssaultAt: number | null;
}

/** What the Order's analysts are doing: looking for signs in a house or region (Find), and working
 *  one lead (Fix). While they fix, a thin trickle of Find goes on. */
export interface IntelSection {
  find: { kind: "house" | "region"; id: string } | null;
  fixing: string | null;
  /** Points toward the next lead found, and the next piece of evidence. */
  findPoints: number;
  fixPoints: number;
}

/** Where the war stands with one bloodline. */
export interface BloodlineState {
  /** The lair's site id, once we have climbed to it. */
  lairId: string | null;
  /** When its lair fell and the bloodline was destroyed. */
  destroyedAt: number | null;
}

/** A vampire site revealed by a lead: something to strike before it moves. */
export interface Site {
  id: string;
  /** The network site it is. */
  netId: string;
  bloodline: string;
  kind: SiteKind;
  regionId: string;
  city: string;
  pos: LatLon;
  revealedAt: number;
  /** Disinformation has drawn it into a trap: a strike on it has better odds. */
  trapped?: boolean;
  /** A site placed by the story (sim/story.ts), which reacts when it lapses. */
  story?: string;
  /** The bloodline abandons the site at this time. */
  expiresAt: number;
  thralls: number;
  vampires: number;
  missionId: string | null;
}

export interface DecisionOption {
  id: string;
  label: string;
  detail: string;
  /** The analysts' read of the odds, if they have one. */
  odds: "good" | "fair" | "poor" | null;
}

/** The choice a team faces on arrival. */
export interface Decision {
  situation: string;
  /** Something the team noticed (a double agent's tell, or a false alarm). */
  warning: string | null;
  options: DecisionOption[];
}

export type MissionPhase = "outbound" | "on-site" | "returning";

/** A team in the field: out to a lead or site, working there, or flying home. */
export interface Mission {
  id: string;
  target: { kind: "lead" | "site"; id: string };
  baseId: string;
  aircraftId: string;
  /** More of our aircraft flying with the first (docs/WEB_PORT.md 3.7c): seats and room for the haul. */
  escorts?: string[];
  agentIds: string[];
  kit: KitId;
  /** Snapshot of the target, for when it is gone by the time the team arrives. */
  title: string;
  city: string;
  regionId: string;
  pos: LatLon;
  bloodline: string;
  /** The lead's true kind (null for a strike on a site). */
  leadKind: LeadKind | null;
  intel: number;
  from: LatLon;
  departAt: number;
  arriveAt: number;
  phase: MissionPhase;
  decision: Decision | null;
  /** Chosen option, while on-site work (a stakeout, waiting for daylight) runs. */
  option: string | null;
  workUntil: number;
  returnStart: number;
  returnAt: number;
  /** A source lead: who the source is, and the asset they could become. */
  who?: string;
  asset?: AssetKind;
  whoFemale?: boolean;
  /** The current flight (outbound or home) as legs on the clock, when it stops to refuel (sim/routes.ts). */
  legs?: Leg[];
  /** Cut off in Europe by the fall: must get out before coming home (sim/story.ts). */
  stranded?: boolean;
  /** Getting out overland; the aircraft was left behind. */
  overland?: boolean;
  /** A fight the team is about to have, waiting for the player: command it, or let it resolve (sim/missions.ts). */
  battle?: PendingBattle;
  /** More teams sent to the same objective, each from its own base (Phoenix Point style). */
  wings?: Wing[];
  /** On the ground and holding until the player starts the mission. */
  waiting?: boolean;
  /** After the fight: the haul is aboard and the player may move it between aircraft before take-off. */
  haul?: boolean;
}

/** A team flying to join a mission. On landing its agents join the team on the
 *  ground; after the fight its aircraft take them home to their own base. */
export interface Wing {
  id: string;
  aircraftId: string;
  escorts?: string[];
  baseId: string;
  agentIds: string[];
  from: LatLon;
  departAt: number;
  arriveAt: number;
  legs?: Leg[];
  landed: boolean;
}

/** A mission's fight, held until the player takes command or auto-resolves it. */
export interface PendingBattle {
  /** The play that led to it, replayed once the fight is settled. */
  optionId: string;
  /** The random state when the play began, so the replay takes the same path to the fight. */
  rng: number;
  thralls: number;
  vampires: number;
  /** The auto-combat's edge (surprise, daylight, a trap). */
  advantage: number;
  /** Strikes on a site (a nest, a den...), or a fight that blew up on a lead. */
  site: SiteKind | null;
  /** A rescue: the prisoner is on the map. */
  hostage?: boolean;
  /**
   * The battle under way, when the player took command (saved after every
   * action, tactical/save.ts): loading the save goes straight back into it.
   */
  live?: { title: string; battle: PackedBattle };
}

/** The Order's dead, remembered. */
/** A thrall or vampire held in a containment cell. */
export interface Captive {
  id: string;
  kind: "thrall" | "vampire";
  bloodline: string;
  takenAt: number;
  /** Where they were taken. */
  city: string;
  regionId?: string;
}

/** A research project or engineering job under way at one base, worked by
 *  the staff assigned to it there. */
export interface ActiveProject {
  /** This run's id ("proj-12"). */
  id: string;
  /** Which project (data/research.ts). */
  projectId: string;
  baseId: string;
  /** Staff-days done so far. */
  progress: number;
  startedAt: number;
  /** Interrogations: the captive being questioned. */
  captiveId?: string;
  /** Engineering: no money for today's materials, so no work (noted once in the log). */
  short?: boolean;
  /** Engineering made in quantity: units still to make, this one included (absent: 1). */
  count?: number;
}

export interface ProjectTrack {
  /** Completed projects (repeatable ones aren't listed). */
  done: string[];
}

export interface Fallen {
  name: string;
  female: boolean;
  died: number;
  where: string;
}

/** A place something happened, for offers that follow an incident. */
export interface Place {
  regionId: string;
  city: string;
  pos: LatLon;
}

/**
 * An off-screen operation to restore secrecy: offered, then (if accepted)
 * running for a few days with money and sometimes agents committed.
 */
export interface CoverUp extends Place {
  id: string;
  template: string;
  title: string;
  text: string;
  offeredAt: number;
  /** The offer lapses at this time if not taken. */
  expiresAt: number;
  cost: number;
  days: number;
  /** Agents it needs (0 = money and contacts only). */
  agents: number;
  /** Judged events (sim/judged.ts): how hard it is and the stat weights it rolls (the heaviest gets the
   *  experience: primaryStat). A money-only cover-up is routine, on tradecraft. */
  tier: Tier;
  weights: Partial<Record<OperatorAptitude, number>>;
  /** Which reading of the situation (judged templates only). */
  variant?: number;
  /** Secrecy restored on success. */
  gain: number;
  /** Set once accepted. */
  agentIds: string[];
  startedAt: number;
  doneAt: number;
  /** What kind of covert action this is. See sim/humint.ts. */
  kind: CovertKind;
  /** Asset calls and disinformation: the asset it runs through. */
  assetId?: string;
  /** Disinformation: the bloodline it's aimed at. */
  bloodline?: string;
  /** Asset calls and disinformation: what success brings. */
  effect?: CovertEffect;
}

export type CovertKind = "coverup" | "call" | "disinfo";
/** How a covert job came out: a cover-up succeeds, fails or backfires; an asset job can leave the asset shaken, or blow the network. */
export type CovertResult = "success" | "fail" | "backfire" | "shaken" | "catastrophe";
export type CovertEffect = "steady" | "lead" | "intel" | "cheaper" | "false-trail" | "counter-story" | "bait";

/** The Order's own media campaign in a region: 1 quiet, 2 sustained, 3 saturation. */
export type MediaLevel = 1 | 2 | 3;

/** The kind the player sees. */
export const shownLeadKind = (l: Lead): LeadKind => (l.kind === "double" ? "source" : l.kind);

export type EventKind =
  | "info" | "lead" | "construction" | "monthly" | "eviction-warning" | "evicted" | "open-war" | "game-over"
  | "arrival" | "battle" | "debrief" | "haul" | "site" | "coverup" | "coverup-result" | "vampire" | "research" | "debt" | "sigil" | "story";

/** A message that pauses the clock until the player dismisses it. */
/** A dispatch picture: how a lead came in, or how a team reached the target. */
export type SceneId = "sigint" | "humint" | "freefall" | "rooftop" | "passport";

export interface GameEvent {
  id: number;
  kind: EventKind;
  /** Overrides the heading for its kind ("Volunteer" for a lead that came from a person). */
  heading?: string;
  /** Who it comes from, shown with their portrait: "cardinal" or a bloodline id for its elder (data/people.ts). */
  speaker?: string;
  /** A picture shown in place of the speaker's portrait: how a lead came in, or how a team got in (data/people.ts SCENES). */
  scene?: SceneId;
  title: string;
  body: string;
  time: number;
  regionId?: string;
  pos?: LatLon;
  /** The lead, installation, site or mission this event is about, if any. */
  refId?: string;
  /** Debriefs: names of the dead and wounded. */
  casualties?: { dead: string[]; wounded: string[] };
  /** Debriefs: what changed (support, secrecy, intel), one line. */
  effects?: string;
  /** Debriefs and cover-up results: who got better at what ("Br. Marco Rossi: Tradecraft +2"). */
  improved?: string[];
}

export interface LogEntry {
  time: number;
  text: string;
  tone: "good" | "bad" | "neutral";
}

/** One cause of secrecy moving this month; repeats add up (sim/ledger.ts). */
export interface SecrecyEntry {
  reason: string;
  delta: number;
  count: number;
  /** The latest time it happened. */
  time: number;
  regionId?: string;
}

/** A month's books: where things stood when it opened, and what moved secrecy. */
export interface MonthLedger {
  month: number;
  secrecyStart: number;
  /** Per region, at the month's start. */
  support: Record<string, number>;
  /** Per region, the monthly contribution at the month's start. */
  contribution: Record<string, number>;
  secrecy: SecrecyEntry[];
  /** Once closed: secrecy, support and what each region paid at month end. */
  secrecyEnd?: number;
  supportEnd?: Record<string, number>;
  paid?: Record<string, number>;
}

export interface MonthlyReport {
  month: string;
  stipend: number;
  regional: number;
  running: number;
  upkeep: number;
  /** Jet leases plus helicopter crew and maintenance. */
  leases: number;
  /** Scientists' and engineers' salaries. */
  staff: number;
  /** Containment upkeep: guards, food, medical. */
  containment?: number;
  /** HUMINT assets' fees. */
  humint?: number;
  /** Dark web sales. */
  market?: number;
  /** Regions that changed their pledge at this review: $/month gained or lost. */
  pledges?: { regionId: string; delta: number }[];
  media: number;
  balance: number;
  supportChange: number;
  /** Regions that would evict us, at month end. */
  hostile?: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  difficulty: DifficultyId;
  startTime: number;
  time: number;
  funds: number;
  /** 0..100. Reaching 0 starts open war, which is permanent. */
  secrecy: number;
  openWar: boolean;
  regions: Record<string, RegionState>;
  installations: Installation[];
  agents: Agent[];
  /** Scientists, engineers and analysts, one record each (sim/personnel.ts). */
  staff: StaffMember[];
  /** The lead scientist (a staff id), for the Order and whatever topic is on top (sim/science.ts). */
  leadScientist?: string;
  /** The lead analyst (a staff id), for the Order (sim/intel.ts). */
  leadAnalyst?: string;
  /** The intelligence section: what it is finding and fixing (sim/intel.ts). */
  section: IntelSection;
  /** Cases behind the leads, true or false (sim/intel.ts). */
  cases: IntelCase[];
  /** Courier shipments between bases (sim/transfers.ts). */
  shipments?: Shipment[];
  /** This month's candidates, for every role (sim/personnel.ts). */
  candidates: Candidate[];
  aircraft: Aircraft[];
  operations: Operation[];
  leads: Lead[];
  missions: Mission[];
  sites: Site[];
  /** Each house's network: lair, dens, nests, and the clues we hold (sim/networks.ts). */
  networks: Record<string, HouseNetwork>;
  bloodlines: Record<string, BloodlineState>;
  /** HUMINT: people recruited in regions, each doing one job for a fee (sim/humint.ts). */
  assets: Asset[];
  /** Where the campaign's story stands: the act, the fall, the hostage rules (sim/story.ts). */
  story: StoryState;
  /** The dark web: stock, demand, artifacts, research sold (sim/market.ts). */
  market: MarketState;
  fallen: Fallen[];
  /** Cover-up offers and the ones under way. */
  coverUps: CoverUp[];
  /** Recent noise (secrecy lost lately, decaying): makes cover-up offers likelier. */
  heat: number;
  /** Where the last loud thing happened. */
  lastIncident: Place | null;
  /** Running media campaigns by region. */
  media: Record<string, MediaLevel>;
  /** Spent on media campaigns so far this month (charged daily). */
  mediaSpent: number;
  research: ProjectTrack;
  engineering: ProjectTrack;
  /** Everything under way in the labs and workshops. */
  projects: ActiveProject[];
  /** Month ends in a row with funds below zero (three dissolves the Order). */
  debtMonths: number;
  /** The Holy See has warned about hostile regions (reset when things improve). */
  hostileWarned: boolean;
  /** When each bloodline launches its next operation. */
  nextOperation: Record<string, number>;
  events: GameEvent[];
  log: LogEntry[];
  nextId: number;
  monthIndex: number;
  /** Average support at the start of the month, for the report. */
  monthStartSupport: number;
  lastReport: MonthlyReport | null;
  /** This month's books and last month's (sim/ledger.ts). */
  ledger: { current: MonthLedger; previous: MonthLedger | null };
  gameOver: string | null;
}

export const isReady = (s: GameState, i: Installation) => i.readyAt <= s.time;

export function post(s: GameState, e: Omit<GameEvent, "id" | "time">) {
  s.events.push({ ...e, id: s.nextId++, time: s.time });
  if (e.kind !== "debrief" && e.kind !== "coverup-result") addLog(s, `${e.title}`, e.kind === "evicted" || e.kind === "game-over" || e.kind === "eviction-warning" ? "bad" : "neutral");
}

export function addLog(s: GameState, text: string, tone: LogEntry["tone"] = "neutral") {
  s.log.push({ time: s.time, text, tone });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

export const supportLevel = (support: number) => Math.round(support);

export function averageSupport(s: GameState): number {
  const v = Object.values(s.regions);
  return v.length ? v.reduce((a, r) => a + r.support, 0) / v.length : 0;
}

export const basesOf = (s: GameState) => s.installations.filter((i) => i.kind === "base");

/** "Br. Marco Rossi", "Sr. Anna Weber". */
export const agentName = (a: { female: boolean; name: string }) => `${a.female ? "Sr." : "Br."} ${a.name}`;
export const isWounded = (s: GameState, a: Agent) => a.woundedUntil > s.time;

/** Away from base: on a team in the field (or flying to join one), on a covert job under way, or in transit. */
export function isDeployed(s: GameState, a: Agent): boolean {
  return a.arriveAt !== undefined ||
    s.missions.some((m) => m.agentIds.includes(a.id) || !!m.wings?.some((w) => w.agentIds.includes(a.id))) ||
    s.coverUps.some((c) => c.agentIds.includes(a.id));
}

/** Away from base: with a team (or a wing flying to join one), or ferrying to another base. */
export function isCraftDeployed(s: GameState, c: Aircraft): boolean {
  const flies = (x: { aircraftId: string; escorts?: string[] }) => x.aircraftId === c.id || !!x.escorts?.includes(c.id);
  return !!c.ferry || s.missions.some((m) => flies(m) || !!m.wings?.some(flies));
}

/** Raises an operator's aptitude by up to `gain` (to the cap); returns what it actually rose. */
export function train(a: Agent, apt: OperatorAptitude, gain: number): number {
  const before = a.aptitudes[apt];
  a.aptitudes[apt] = Math.min(APTITUDE_CAP, before + gain);
  return a.aptitudes[apt] - before;
}

/** "Br. Marco Rossi: Tradecraft +2, Insight +1" for a debrief, or null if nothing rose. */
export function improvementLine(a: Agent, gains: Partial<Record<OperatorAptitude, number>>): string | null {
  const parts = Object.entries(gains)
    .filter(([, g]) => g && g > 0)
    .map(([id, g]) => `${APTITUDES.operator.find((x) => x.id === id)!.name} +${g}`);
  return parts.length ? `${agentName(a)}: ${parts.join(", ")}` : null;
}
