// The whole campaign as plain, JSON-serialisable data. Everything saved lives
// here; systems are free functions that take a GameState and mutate it.
import type { AircraftKind } from "../data/aircraft";
import type { Stats } from "../data/agents";
import type { DifficultyId } from "../data/difficulty";
import type { BaseUpgradeKind, InstallationKind } from "../data/installations";
import type { CultureId } from "../data/names";
import type { LatLon } from "./time";

export const STATE_VERSION = 2;

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
}

/** The kind the player sees. */
export const shownLeadKind = (l: Lead): LeadKind => (l.kind === "double" ? "source" : l.kind);

export type EventKind = "info" | "lead" | "construction" | "monthly" | "eviction-warning" | "evicted" | "open-war" | "game-over";

/** A message that pauses the clock until the player dismisses it. */
export interface GameEvent {
  id: number;
  kind: EventKind;
  title: string;
  body: string;
  time: number;
  regionId?: string;
  pos?: LatLon;
  /** The lead or installation this event is about, if any. */
  refId?: string;
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
  leases: number;
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
  addLog(s, `${e.title}`, e.kind === "evicted" || e.kind === "game-over" || e.kind === "eviction-warning" ? "bad" : "neutral");
}

export function addLog(s: GameState, text: string, tone: LogEntry["tone"] = "neutral") {
  s.log.push({ time: s.time, text, tone });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

export const supportLevel = (support: number) => Math.round(support);

export function averageSupport(s: GameState): number {
  const v = Object.values(s.regions);
  return v.length ? v.reduce((a, r) => a + r.support, 0) / v.length : 0;
}

export const bases = (s: GameState) => s.installations.filter((i) => i.kind === "base");
export const isWounded = (s: GameState, a: Agent) => a.woundedUntil > s.time;
