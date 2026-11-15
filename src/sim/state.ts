// The whole campaign as plain, JSON-serialisable data. Everything saved lives
// here; systems are free functions that take a GameState and mutate it.
import type { AircraftKind } from "../data/aircraft";
import { STATS, type StatId, type Stats } from "../data/agents";

const STAT_NAMES = Object.fromEntries(STATS.map((x) => [x.id, x.name])) as Record<StatId, string>;
import type { DifficultyId } from "../data/difficulty";
import type { KitId } from "../data/kit";
import type { BaseUpgradeKind, InstallationKind } from "../data/installations";
import type { CultureId } from "../data/names";
import type { LatLon } from "./time";

export const STATE_VERSION = 4;

export interface RegionState {
  /** -5 (backs the vampires) .. +5 (backs the OPV). Shown rounded. */
  support: number;
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
  /** Operational Bases only: aircraft slots and agent beds. */
  hangars?: number;
  quarters?: number;
  upgrades?: { kind: BaseUpgradeKind; readyAt: number }[];
}

/** Someone the Church's network has put forward; not yet trained. */
export interface Candidate {
  id: string;
  name: string;
  sister: boolean;
  culture: CultureId;
  originRegion: string;
  originCity: string;
  stats: Stats;
}

export interface Agent extends Candidate {
  baseId: string;
  /** Current health; at most stats.vitality. */
  hp: number;
  /** Game time when wounds heal (0 = fit). */
  woundedUntil: number;
  deployed: boolean;
  missions: number;
  kills: number;
  joinedAt: number;
}

export interface Aircraft {
  id: string;
  kind: AircraftKind;
  name: string;
  baseId: string;
  deployed: boolean;
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
}

/** A SIGINT lead: one thread of an operation the player can pull on. */
export interface Lead {
  id: string;
  opId: string;
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
}

export type SiteKind = "nest" | "den" | "haven";

/** A vampire site revealed by a lead: something to strike before it moves. */
export interface Site {
  id: string;
  bloodline: string;
  kind: SiteKind;
  regionId: string;
  city: string;
  pos: LatLon;
  revealedAt: number;
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
}

/** The Order's dead, remembered. */
export interface Fallen {
  name: string;
  sister: boolean;
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
  /** The skill the agents use. */
  stat: StatId;
  difficulty: number;
  /** Secrecy restored on success. */
  gain: number;
  /** Set once accepted. */
  agentIds: string[];
  startedAt: number;
  doneAt: number;
}

/** The Order's own media campaign in a region: 1 quiet, 2 sustained, 3 saturation. */
export type MediaLevel = 1 | 2 | 3;

/** The kind the player sees. */
export const shownLeadKind = (l: Lead): LeadKind => (l.kind === "double" ? "source" : l.kind);

export type EventKind =
  | "info" | "lead" | "construction" | "monthly" | "eviction-warning" | "evicted" | "open-war" | "game-over"
  | "arrival" | "debrief" | "site" | "coverup" | "coverup-result" | "vampire";

/** A message that pauses the clock until the player dismisses it. */
export interface GameEvent {
  id: number;
  kind: EventKind;
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

export interface MonthlyReport {
  month: string;
  stipend: number;
  regional: number;
  running: number;
  upkeep: number;
  /** Jet leases plus helicopter crew and maintenance. */
  leases: number;
  media: number;
  balance: number;
  supportChange: number;
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
  candidates: Candidate[];
  aircraft: Aircraft[];
  operations: Operation[];
  leads: Lead[];
  missions: Mission[];
  sites: Site[];
  /** 0..100 per bloodline: what the Order knows about it. */
  intel: Record<string, number>;
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
  /** When each bloodline launches its next operation. */
  nextOperation: Record<string, number>;
  events: GameEvent[];
  log: LogEntry[];
  nextId: number;
  monthIndex: number;
  /** Average support at the start of the month, for the report. */
  monthStartSupport: number;
  lastReport: MonthlyReport | null;
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

export const bases = (s: GameState) => s.installations.filter((i) => i.kind === "base");
export const isWounded = (s: GameState, a: Agent) => a.woundedUntil > s.time;

/** Stats grow with use, up to this. */
export const STAT_CAP = 95;

/** Raises an agent's stat by up to `gain` (capped); returns what it actually rose. */
export function train(a: Agent, stat: StatId, gain: number): number {
  const before = a.stats[stat];
  a.stats[stat] = Math.min(STAT_CAP, before + gain);
  return a.stats[stat] - before;
}

/** "Br. Marco Rossi: Tradecraft +2, Insight +1" for a debrief, or null if nothing rose. */
export function improvementLine(a: Agent, gains: Partial<Record<StatId, number>>): string | null {
  const parts = Object.entries(gains)
    .filter(([, g]) => g && g > 0)
    .map(([id, g]) => `${STAT_NAMES[id as StatId]} +${g}`);
  return parts.length ? `${a.sister ? "Sr." : "Br."} ${a.name}: ${parts.join(", ")}` : null;
}
