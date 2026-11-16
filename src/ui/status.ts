// What an agent or aircraft is doing right now, in words, with when it ends.
// Shared by the base view and the operations dashboard so both say the same thing.
import { covertLabel } from "../sim/coverups";
import { isWounded, type Agent, type Aircraft, type GameState, type Mission } from "../sim/state";
import { formatDate } from "../sim/time";
import { timeLeft } from "./screens/geoscape/FocusPanels";

export type StatusKind = "ready" | "field" | "covert" | "wounded";

export interface Status {
  kind: StatusKind;
  /** "Ready", "Outbound to Lyon", "Wounded". */
  label: string;
  /** "lands in 3 h", "fit 12 March". */
  note: string;
  /** When it ends (game time), if known. */
  until?: number;
  missionId?: string;
  coverUpId?: string;
}

/** A mission's phase, for the team or its aircraft. */
export function missionStatus(g: GameState, m: Mission): Omit<Status, "kind"> {
  const base = { missionId: m.id };
  if (m.phase === "outbound") return { ...base, label: `Outbound to ${m.city}`, note: `lands in ${timeLeft(m.arriveAt - g.time)}`, until: m.arriveAt };
  if (m.phase === "on-site")
    return m.option
      ? { ...base, label: `On the ground, ${m.city}`, note: `at work, ${timeLeft(m.workUntil - g.time)} left`, until: m.workUntil }
      : { ...base, label: `On the ground, ${m.city}`, note: "waiting for orders" };
  return { ...base, label: m.overland ? `Getting out overland from ${m.city}` : `Returning from ${m.city}`, note: `home in ${timeLeft(m.returnAt - g.time)}`, until: m.returnAt };
}

export function agentStatus(g: GameState, a: Agent): Status {
  const m = g.missions.find((x) => x.agentIds.includes(a.id));
  if (m) return { kind: "field", ...missionStatus(g, m) };
  const c = g.coverUps.find((x) => x.startedAt && x.agentIds.includes(a.id));
  if (c) return { kind: "covert", label: `${covertLabel(c)}: ${c.title}`, note: `back in ${timeLeft(c.doneAt - g.time)}`, until: c.doneAt, coverUpId: c.id };
  if (a.arriveAt) {
    const to = g.installations.find((i) => i.id === a.baseId)?.name ?? "a new base";
    return { kind: "field", label: `In transit to ${to}`, note: `arrives in ${timeLeft(a.arriveAt - g.time)}`, until: a.arriveAt };
  }
  if (isWounded(g, a)) return { kind: "wounded", label: "Wounded", note: `fit ${formatDate(a.woundedUntil)}`, until: a.woundedUntil };
  return { kind: "ready", label: "Ready", note: "" };
}

export function aircraftStatus(g: GameState, c: Aircraft): Status {
  const m = g.missions.find((x) => x.aircraftId === c.id && !x.overland);
  if (m) return { kind: "field", ...missionStatus(g, m) };
  if (c.ferry) {
    const to = g.installations.find((i) => i.id === c.baseId)?.name ?? "a new base";
    return { kind: "field", label: `Flying to ${to}`, note: `lands in ${timeLeft(c.ferry.arriveAt - g.time)}`, until: c.ferry.arriveAt };
  }
  return { kind: "ready", label: "In the hangar", note: "ready to fly" };
}

export const STATUS_TONE: Record<StatusKind, string> = { ready: "good", field: "field", covert: "covert", wounded: "warn" };

export const honorific = (a: { sister: boolean }) => (a.sister ? "Sr." : "Br.");
export const agentName = (a: { sister: boolean; name: string }) => `${honorific(a)} ${a.name}`;
