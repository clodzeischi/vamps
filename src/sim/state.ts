// The whole campaign as plain, JSON-serialisable data. Everything saved lives
// here; systems are free functions that take a GameState and mutate it.
import type { DifficultyId } from "../data/difficulty";
import type { InstallationKind } from "../data/installations";
import type { LatLon } from "./time";

export const STATE_VERSION = 1;

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
}

export type EventKind = "info" | "construction" | "monthly" | "eviction-warning" | "evicted" | "open-war" | "game-over";

/** A message that pauses the clock until the player dismisses it. */
export interface GameEvent {
  id: number;
  kind: EventKind;
  title: string;
  body: string;
  time: number;
  regionId?: string;
  pos?: LatLon;
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
