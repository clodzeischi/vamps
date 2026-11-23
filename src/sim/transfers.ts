// Moving people between bases (docs/WEB_PORT.md 3.7c): aboard one of our
// aircraft (a ferry flight, limited by its capacity), or by airline (a fee a
// head, no aircraft needed). Everyone keeps a bed: the new base's, reserved
// at departure. Cargo: vampire remains and captives, by our own aircraft only
// (remains by helicopter only); a mission's haul rides home the same way.
import { AIRCRAFT } from "../data/aircraft";
import { STAFF, type StaffKind } from "../data/installations";
import { ITEM_LOAD, ITEMS, type ItemId } from "../data/equipment";
import { addStock, stockAt } from "./equipment";
import { distanceNm } from "./geo";
import { aircraftAt, freeCells, hangarsOf, occupantsAt, quartersOf } from "./personnel";
import { freeStaff, questioning } from "./research";
import { planRoute } from "./routes";
import { addLog, isReady, type Agent, type Aircraft, type Cargo, type GameState, type Installation, type StaffMember } from "./state";
import type { LatLon } from "./time";
import { DAY, HOUR } from "./time";

/** Load each thing takes against an aircraft's capacity (docs/WEB_PORT.md 3.7c). */
export const LOAD = { person: 1, remains: 2, captive: 2 };
/** Only a helicopter lifts bodies (a jet lands at airports, with customs). */
export const carriesRemains = (kind: keyof typeof AIRCRAFT) => kind === "helicopter";
export const itemCount = (items: Partial<Record<ItemId, number>> | undefined) => Object.values(items ?? {}).reduce((t: number, n) => t + (n ?? 0), 0);
export const cargoLoad = (c: Cargo | undefined) => c ? c.remains * LOAD.remains + c.captives.length * LOAD.captive + itemCount(c.items) * ITEM_LOAD : 0;
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
  // A lead engineer leads where they are: one who leaves stops leading.
  for (const b of s.installations) if (b.leadEngineer && ids.includes(b.leadEngineer) && b.id !== toId) delete b.leadEngineer;
}

// ----- Ferry flights -----

/** Remains, captives (by id) and armoury items to load from a base. */
export interface CargoPick { remains: number; captives: string[]; items?: Partial<Record<ItemId, number>> }
const NO_CARGO: CargoPick = { remains: 0, captives: [] };

function cargoBlocker(s: GameState, c: Aircraft, from: Installation, to: Installation, pick: CargoPick): string | null {
  if (pick.remains < 0 || !Number.isInteger(pick.remains)) return "Choose how many remains.";
  if (pick.remains > (from.remains ?? 0)) return "Not that many remains here.";
  if (pick.remains && !carriesRemains(c.kind)) return "Only a helicopter lifts bodies.";
  const here = new Set((from.captives ?? []).map((x) => x.id));
  if (pick.captives.some((id) => !here.has(id))) return "That captive isn't here.";
  if (pick.captives.some((id) => questioning(s, id))) return "A captive chosen is being questioned.";
  if (pick.captives.length > freeCells(to, s)) return `${to.name} hasn't the cells.`;
  for (const [x, n] of Object.entries(pick.items ?? {}) as [ItemId, number][])
    if (!Number.isInteger(n) || n < 0 || n > stockAt(from, x)) return `Not that many ${ITEMS[x].name.toLowerCase()}s in the armoury.`;
  return null;
}

export function ferryBlocker(s: GameState, aircraftId: string, toBaseId: string, ids: string[], pick: CargoPick = NO_CARGO): string | null {
  const c = s.aircraft.find((a) => a.id === aircraftId);
  if (!c || c.deployed) return "The aircraft is away.";
  const from = baseOf(s, c.baseId), to = baseOf(s, toBaseId);
  if (!from || !to) return "Choose a base.";
  if (from === to) return "It is already there.";
  if (!planRoute(s, from.pos, to.pos, c.kind)) return `${to.name} is out of reach, even with refuelling.`;
  if (aircraftAt(s, to.id).length >= hangarsOf(to)) return `${to.name} has no free hangar.`;
  const load = ids.length * LOAD.person + pick.remains * LOAD.remains + pick.captives.length * LOAD.captive + itemCount(pick.items) * ITEM_LOAD;
  if (load > capacityOf(c.kind)) return "Over capacity.";
  return cargoBlocker(s, c, from, to, pick) ?? (ids.length ? peopleBlocker(s, from, to, ids) : null);
}

/** Flight time to a base, or null when out of reach. */
export function ferryHours(s: GameState, aircraftId: string, toBaseId: string): number | null {
  const c = s.aircraft.find((a) => a.id === aircraftId);
  const from = c && baseOf(s, c.baseId), to = baseOf(s, toBaseId);
  return c && from && to ? planRoute(s, from.pos, to.pos, c.kind)?.hours ?? null : null;
}

/** Flies an aircraft to another base with people aboard; it lives there from now on. */
export function ferry(s: GameState, aircraftId: string, toBaseId: string, ids: string[], pick: CargoPick = NO_CARGO): string | null {
  const why = ferryBlocker(s, aircraftId, toBaseId, ids, pick);
  if (why) return why;
  const c = s.aircraft.find((a) => a.id === aircraftId)!;
  const from = baseOf(s, c.baseId)!, to = baseOf(s, toBaseId)!;
  const arriveAt = s.time + Math.ceil(ferryHours(s, aircraftId, toBaseId)!) * HOUR;
  c.ferry = { fromBaseId: from.id, departAt: s.time, arriveAt, people: ids };
  if (pick.remains || pick.captives.length || itemCount(pick.items)) {
    from.remains = (from.remains ?? 0) - pick.remains;
    const going = (from.captives ?? []).filter((x) => pick.captives.includes(x.id));
    from.captives = (from.captives ?? []).filter((x) => !pick.captives.includes(x.id));
    const items: Partial<Record<ItemId, number>> = {};
    for (const [x, n] of Object.entries(pick.items ?? {}) as [ItemId, number][]) if (n > 0) { items[x] = n; addStock(from, x, -n); }
    c.cargo = { remains: pick.remains, captives: going, ...(itemCount(items) ? { items } : {}) };
  }
  c.baseId = to.id;
  c.deployed = true;
  move(s, ids, to.id, arriveAt);
  addLog(s, `${c.name} leaves ${from.name} for ${to.name}${ids.length ? ` with ${ids.length} aboard` : ""}.`);
  return null;
}

/** Where a ferry flight is now (a straight line between its start and its base). */
export function ferryPos(s: GameState, c: Aircraft): LatLon | null {
  if (!c.ferry) return null;
  const from = c.ferry.from ?? s.installations.find((i) => i.id === c.ferry!.fromBaseId)?.pos;
  const to = s.installations.find((i) => i.id === c.baseId)?.pos;
  if (!from || !to) return null;
  const k = Math.min(1, Math.max(0, (s.time - c.ferry.departAt) / Math.max(1, c.ferry.arriveAt - c.ferry.departAt)));
  return { lat: from.lat + (to.lat - from.lat) * k, lon: from.lon + (to.lon - from.lon) * k };
}

export function redirectBlocker(s: GameState, aircraftId: string, toBaseId: string): string | null {
  const c = s.aircraft.find((a) => a.id === aircraftId);
  if (!c?.ferry) return "It isn't on a transfer flight.";
  const to = baseOf(s, toBaseId);
  if (!to) return "Choose a base.";
  if (to.id === c.baseId) return "It is already bound there.";
  const pos = ferryPos(s, c);
  if (!pos || !planRoute(s, pos, to.pos, c.kind)) return `${to.name} is out of reach from where it is.`;
  if (aircraftAt(s, to.id).length >= hangarsOf(to)) return `${to.name} has no free hangar.`;
  if (occupantsAt(s, to.id) + c.ferry.people.length > quartersOf(to)) return `${to.name} hasn't the beds.`;
  if ((c.cargo?.captives.length ?? 0) > freeCells(to, s)) return `${to.name} hasn't the cells.`;
  return null;
}

/** Changes a transfer flight's destination in the air: it flies on from where it is; beds and cells move with it. */
export function redirectFerry(s: GameState, aircraftId: string, toBaseId: string): string | null {
  const why = redirectBlocker(s, aircraftId, toBaseId);
  if (why) return why;
  const c = s.aircraft.find((a) => a.id === aircraftId)!;
  const to = baseOf(s, toBaseId)!;
  const pos = ferryPos(s, c)!;
  const hours = planRoute(s, pos, to.pos, c.kind)!.hours;
  c.ferry = { ...c.ferry!, from: pos, departAt: s.time, arriveAt: s.time + Math.max(1, Math.ceil(hours)) * HOUR };
  c.baseId = to.id;
  for (const a of s.agents) if (c.ferry.people.includes(a.id)) { a.baseId = to.id; a.arriveAt = c.ferry.arriveAt; }
  for (const p of s.staff) if (c.ferry.people.includes(p.id)) { p.baseId = to.id; p.arriveAt = c.ferry.arriveAt; }
  addLog(s, `${c.name} changes course for ${to.name}.`);
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

// ----- Courier -----

/** Per item sent by courier, and how long it takes (like the airline). */
export const COURIER_FEE = 150;

export function courierBlocker(s: GameState, fromBaseId: string, toBaseId: string, items: Partial<Record<ItemId, number>>): string | null {
  const from = baseOf(s, fromBaseId), to = baseOf(s, toBaseId);
  if (!from || !to) return "Choose a base.";
  if (from === to) return "It is already there.";
  const n = itemCount(items);
  if (!n) return "Choose what to send.";
  for (const [x, k] of Object.entries(items) as [ItemId, number][]) {
    if (!ITEMS[x].courier) return `${ITEMS[x].name}s can't go by courier.`;
    if (!Number.isInteger(k) || k < 0 || k > stockAt(from, x)) return `Not that many ${ITEMS[x].name.toLowerCase()}s here.`;
  }
  if (s.funds < n * COURIER_FEE) return "Not enough funds.";
  return null;
}

export function sendByCourier(s: GameState, fromBaseId: string, toBaseId: string, items: Partial<Record<ItemId, number>>): string | null {
  const why = courierBlocker(s, fromBaseId, toBaseId, items);
  if (why) return why;
  const from = baseOf(s, fromBaseId)!;
  const sent: Partial<Record<ItemId, number>> = {};
  for (const [x, n] of Object.entries(items) as [ItemId, number][]) if (n > 0) { sent[x] = n; addStock(from, x, -n); }
  s.funds -= itemCount(sent) * COURIER_FEE;
  (s.shipments ??= []).push({ id: `ship-${s.nextId++}`, toBaseId, arriveAt: s.time + airlineDays(s, fromBaseId, toBaseId) * DAY, items: sent });
  addLog(s, `${itemCount(sent)} items go by courier from ${from.name} to ${baseOf(s, toBaseId)!.name}.`);
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
    if (to) unloadCargo(s, c, to);
    addLog(s, `${c.name} has landed at ${to?.name ?? "its new base"}${n ? ` with ${n} aboard` : ""}.`, "good");
  }
  for (const a of s.agents) if (a.arriveAt && a.arriveAt <= s.time) { delete a.arriveAt; a.deployed = false; }
  for (const p of s.staff) if (p.arriveAt && p.arriveAt <= s.time) delete p.arriveAt;
  for (const x of [...(s.shipments ?? [])]) {
    if (x.arriveAt > s.time) continue;
    s.shipments = s.shipments!.filter((y) => y !== x);
    const to = s.installations.find((i) => i.id === x.toBaseId);
    if (!to) continue; // the base is gone, and the parcel with it
    for (const [k, n] of Object.entries(x.items) as [ItemId, number][]) addStock(to, k, n ?? 0);
    addLog(s, x.darkWeb ? `A dark-web parcel arrives at ${to.name}: ${itemCount(x.items)} item${itemCount(x.items) === 1 ? "" : "s"} to the armoury.` : `A courier delivers ${itemCount(x.items)} items to ${to.name}.`, x.darkWeb ? "good" : undefined);
  }
}

/** On landing at a base: remains to cold storage, captives to the cells kept for them. Returns what was unloaded. */
export function unloadCargo(s: GameState, c: Aircraft, base: Installation): string[] {
  const cargo = c.cargo;
  delete c.cargo; // first, so the cells kept for these captives are free again
  if (!cargo) return [];
  const out: string[] = [];
  for (const [x, n] of Object.entries(cargo.items ?? {}) as [ItemId, number][]) addStock(base, x, n ?? 0);
  if (itemCount(cargo.items)) out.push(`${itemCount(cargo.items)} items to the armoury`);
  if (cargo.remains) {
    base.remains = (base.remains ?? 0) + cargo.remains;
    out.push(`${cargo.remains === 1 ? "vampire remains" : `${cargo.remains} sets of vampire remains`} to cold storage`);
  }
  for (const x of cargo.captives) {
    if (freeCells(base, s) > 0) { (base.captives ??= []).push(x); out.push(`a captive ${x.kind} to the cells`); }
    else addLog(s, `No cell for the ${x.kind} aboard ${c.name}: released.`, "bad");
  }
  if (out.length) addLog(s, `${c.name} unloads at ${base.name}: ${out.join(", ")}.`);
  return out;
}
