// Moving people between bases (docs/WEB_PORT.md 3.7c): aboard one of our
// aircraft (a ferry flight, limited by its capacity), or by airline (a fee a
// head, no aircraft needed). Everyone keeps a bed: the new base's, reserved
// at departure. Cargo comes later; for now a person is the only load.
import { AIRCRAFT } from "../data/aircraft";
import { STAFF, type StaffKind } from "../data/installations";
import { distanceNm } from "./geo";
import { aircraftAt, hangarsOf, occupantsAt, quartersOf } from "./personnel";
import { freeStaff } from "./research";
import { planRoute } from "./routes";
import { addLog, isReady, type Agent, type GameState, type Installation, type StaffMember } from "./state";
import { DAY, HOUR } from "./time";

/** Load each thing takes against an aircraft's capacity. */
export const LOAD = { person: 1 };
export const capacityOf = (kind: keyof typeof AIRCRAFT) => AIRCRAFT[kind].seats;
/** Airline: a fee a head, and a day's travel plus the flight. */
export const AIRLINE_FEE = 3_000;
const AIRLINE_KN = 450;

export type Person = { kind: "agent"; p: Agent } | { kind: "staff"; p: StaffMember };

const baseOf = (s: GameState, id: string) => s.installations.find((i) => i.id === id && i.kind === "base" && isReady(s, i));

/** People at a base who can travel now: agents at home and not busy, staff not on a project. */
export function movablePeople(s: GameState, baseId: string): Person[] {
  const busy = new Set(s.coverUps.filter((c) => c.startedAt).flatMap((c) => c.agentIds));
  const agents: Person[] = s.agents.filter((a) => a.baseId === baseId && !a.deployed && !a.arriveAt && !busy.has(a.id)).map((p) => ({ kind: "agent", p }));
  const staff: Person[] = s.staff.filter((p) => p.baseId === baseId && !p.arriveAt).map((p) => ({ kind: "staff", p }));
  return [...agents, ...staff];
}

function peopleBlocker(s: GameState, from: Installation, to: Installation, ids: string[]): string | null {
  if (!ids.length) return "Choose who goes.";
  const movable = new Map(movablePeople(s, from.id).map((x) => [x.p.id, x]));
  if (ids.some((id) => !movable.has(id))) return "Someone chosen is busy or not here.";
  for (const role of ["scientist", "engineer"] as StaffKind[]) {
    const n = ids.filter((id) => { const x = movable.get(id)!; return x.kind === "staff" && x.p.role === role; }).length;
    if (n > Math.max(0, freeStaff(s, from, role))) return `Take ${STAFF[role].plural.toLowerCase()} off their projects first.`;
  }
  if (occupantsAt(s, to.id) + ids.length > quartersOf(to)) return `${to.name} hasn't the beds.`;
  return null;
}

function move(s: GameState, ids: string[], toId: string, arriveAt: number) {
  for (const a of s.agents) if (ids.includes(a.id)) { a.baseId = toId; a.deployed = true; a.arriveAt = arriveAt; }
  for (const p of s.staff) if (ids.includes(p.id)) { p.baseId = toId; p.arriveAt = arriveAt; }
}

// ----- Ferry flights -----

export function ferryBlocker(s: GameState, aircraftId: string, toBaseId: string, ids: string[]): string | null {
  const c = s.aircraft.find((a) => a.id === aircraftId);
  if (!c || c.deployed) return "The aircraft is away.";
  const from = baseOf(s, c.baseId), to = baseOf(s, toBaseId);
  if (!from || !to) return "Choose a base.";
  if (from === to) return "It is already there.";
  if (!planRoute(s, from.pos, to.pos, c.kind)) return `${to.name} is out of reach, even with refuelling.`;
  if (aircraftAt(s, to.id).length >= hangarsOf(to)) return `${to.name} has no free hangar.`;
  if (ids.length * LOAD.person > capacityOf(c.kind)) return "Over capacity.";
  return ids.length ? peopleBlocker(s, from, to, ids) : null;
}

/** Flight time to a base, or null when out of reach. */
export function ferryHours(s: GameState, aircraftId: string, toBaseId: string): number | null {
  const c = s.aircraft.find((a) => a.id === aircraftId);
  const from = c && baseOf(s, c.baseId), to = baseOf(s, toBaseId);
  return c && from && to ? planRoute(s, from.pos, to.pos, c.kind)?.hours ?? null : null;
}

/** Flies an aircraft to another base with people aboard; it lives there from now on. */
export function ferry(s: GameState, aircraftId: string, toBaseId: string, ids: string[]): string | null {
  const why = ferryBlocker(s, aircraftId, toBaseId, ids);
  if (why) return why;
  const c = s.aircraft.find((a) => a.id === aircraftId)!;
  const from = baseOf(s, c.baseId)!, to = baseOf(s, toBaseId)!;
  const arriveAt = s.time + Math.ceil(ferryHours(s, aircraftId, toBaseId)!) * HOUR;
  c.ferry = { fromBaseId: from.id, departAt: s.time, arriveAt, people: ids };
  c.baseId = to.id;
  c.deployed = true;
  move(s, ids, to.id, arriveAt);
  addLog(s, `${c.name} leaves ${from.name} for ${to.name}${ids.length ? ` with ${ids.length} aboard` : ""}.`);
  return null;
}

// ----- Airline -----

export function airlineDays(s: GameState, fromBaseId: string, toBaseId: string): number {
  const from = baseOf(s, fromBaseId), to = baseOf(s, toBaseId);
  if (!from || !to) return 0;
  return Math.max(1, Math.ceil((12 + distanceNm(from.pos, to.pos) / AIRLINE_KN) / 24));
}

export function airlineBlocker(s: GameState, fromBaseId: string, toBaseId: string, ids: string[]): string | null {
  const from = baseOf(s, fromBaseId), to = baseOf(s, toBaseId);
  if (!from || !to) return "Choose a base.";
  if (from === to) return "They are already there.";
  const why = peopleBlocker(s, from, to, ids);
  if (why) return why;
  if (s.funds < ids.length * AIRLINE_FEE) return "Not enough funds.";
  return null;
}

/** Sends people by airline, unarmed. */
export function sendByAirline(s: GameState, fromBaseId: string, toBaseId: string, ids: string[]): string | null {
  const why = airlineBlocker(s, fromBaseId, toBaseId, ids);
  if (why) return why;
  s.funds -= ids.length * AIRLINE_FEE;
  move(s, ids, toBaseId, s.time + airlineDays(s, fromBaseId, toBaseId) * DAY);
  addLog(s, `${ids.length} ${ids.length === 1 ? "person flies" : "people fly"} commercially from ${baseOf(s, fromBaseId)!.name} to ${baseOf(s, toBaseId)!.name}.`);
  return null;
}

// ----- Arrivals -----

export function hourlyTransfers(s: GameState) {
  for (const c of s.aircraft) {
    if (!c.ferry || c.ferry.arriveAt > s.time) continue;
    const n = c.ferry.people.length;
    delete c.ferry;
    c.deployed = false;
    const to = s.installations.find((i) => i.id === c.baseId);
    addLog(s, `${c.name} has landed at ${to?.name ?? "its new base"}${n ? ` with ${n} aboard` : ""}.`, "good");
  }
  for (const a of s.agents) if (a.arriveAt && a.arriveAt <= s.time) { delete a.arriveAt; a.deployed = false; }
  for (const p of s.staff) if (p.arriveAt && p.arriveAt <= s.time) delete p.arriveAt;
}
