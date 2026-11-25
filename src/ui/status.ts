// What an agent or aircraft is doing right now, in words, with when it ends.
// Shared by the base view and the operations dashboard so both say the same thing.
import { VITALITY } from "../data/agents";
import { APTITUDES, type Aptitude, type Role } from "../data/aptitudes";
import { aptitude } from "../sim/aptitudes";
import type { Person } from "../sim/state";
import { hasIcon, type IconName } from "./components/Icon";
import { covertLabel } from "../sim/coverups";
import { isWounded, type Agent, type Aircraft, type GameState, type Mission, installationById } from "../sim/state";
import { formatDate } from "../sim/time";
import { timeLeft } from "./screens/geoscape/FocusPanels";

type StatusKind = "ready" | "field" | "covert" | "wounded";

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
function missionStatus(g: GameState, m: Mission): Omit<Status, "kind"> {
  const base = { missionId: m.id };
  if (m.phase === "outbound") return { ...base, label: `Outbound to ${m.city}`, note: `lands in ${timeLeft(m.arriveAt - g.time)}`, until: m.arriveAt };
  if (m.phase === "on-site")
    return m.option
      ? { ...base, label: `On the ground, ${m.city}`, note: `at work, ${timeLeft(m.workUntil - g.time)} left`, until: m.workUntil }
      : { ...base, label: `On the ground, ${m.city}`, note: m.haul ? "loading the haul" : m.waiting ? "holding for the others" : "waiting for orders" };
  return { ...base, label: m.overland ? `Getting out overland from ${m.city}` : `Returning from ${m.city}`, note: `home in ${timeLeft(m.returnAt - g.time)}`, until: m.returnAt };
}

export function agentStatus(g: GameState, a: Agent): Status {
  const m = g.missions.find((x) => x.agentIds.includes(a.id));
  if (m) return { kind: "field", ...missionStatus(g, m) };
  const joining = g.missions.find((x) => x.wings?.some((w) => !w.landed && w.agentIds.includes(a.id)));
  if (joining) {
    const w = joining.wings!.find((x) => x.agentIds.includes(a.id))!;
    return { kind: "field", label: `Flying to join the team in ${joining.city}`, note: `lands in ${timeLeft(w.arriveAt - g.time)}`, until: w.arriveAt, missionId: joining.id };
  }
  const c = g.coverUps.find((x) => x.startedAt && x.agentIds.includes(a.id));
  if (c) return { kind: "covert", label: `${covertLabel(c)}: ${c.title}`, note: `back in ${timeLeft(c.doneAt - g.time)}`, until: c.doneAt, coverUpId: c.id };
  if (a.arriveAt) {
    const to = installationById(g, a.baseId)?.name ?? "a new base";
    return { kind: "field", label: `In transit to ${to}`, note: `arrives in ${timeLeft(a.arriveAt - g.time)}`, until: a.arriveAt };
  }
  if (isWounded(g, a)) return { kind: "wounded", label: "Wounded", note: `fit ${formatDate(a.woundedUntil)}`, until: a.woundedUntil };
  return { kind: "ready", label: "Ready", note: "" };
}

export function aircraftStatus(g: GameState, c: Aircraft): Status {
  const m = g.missions.find((x) => (x.aircraftId === c.id || x.escorts?.includes(c.id) || x.wings?.some((w) => w.landed && (w.aircraftId === c.id || w.escorts?.includes(c.id)))) && !x.overland);
  if (m) return { kind: "field", ...missionStatus(g, m) };
  const joining = g.missions.find((x) => x.wings?.some((w) => !w.landed && (w.aircraftId === c.id || w.escorts?.includes(c.id))));
  if (joining) {
    const w = joining.wings!.find((x) => x.aircraftId === c.id || x.escorts?.includes(c.id))!;
    return { kind: "field", label: `Flying to join the team in ${joining.city}`, note: `lands in ${timeLeft(w.arriveAt - g.time)}`, until: w.arriveAt, missionId: joining.id };
  }
  if (c.ferry) {
    const to = installationById(g, c.baseId)?.name ?? "a new base";
    return { kind: "field", label: `Flying to ${to}`, note: `lands in ${timeLeft(c.ferry.arriveAt - g.time)}`, until: c.ferry.arriveAt };
  }
  return { kind: "ready", label: "In the hangar", note: "ready to fly" };
}

export const STATUS_TONE: Record<StatusKind, string> = { ready: "good", field: "field", covert: "covert", wounded: "warn" };

export { agentName } from "../sim/state";

/** One bar a person shows: an aptitude, or an operator's Vitality. */
interface Trait { id: string; name: string; short: string; covers: string; icon?: IconName }

/** The bars a role shows: its four aptitudes, and for an operator their Vitality. */
export const traitsOf = (role: Role): Trait[] => [
  ...APTITUDES[role].map((a) => ({ ...a, ...(hasIcon(`stat-${a.id}`) ? { icon: `stat-${a.id}` as IconName } : {}) })),
  ...(role === "operator" ? [{ id: "vitality", ...VITALITY, icon: "stat-vitality" as IconName }] : []),
];

/** A trait's value for a person (whole numbers on screen; staff grow in fractions). */
export const traitValue = (p: Person & { vitality?: number }, id: string): number =>
  Math.floor(id === "vitality" ? (p.vitality ?? 0) : aptitude(p, id as Aptitude));
