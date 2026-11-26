// People (every role: candidates, hiring, letting go, leads), aircraft and base capacity.
import { FOUNDING_ARMOURY } from "../../data/equipment";
import { issueBest, returnGear, standardIssue } from "./equipment";
import { planRoute } from "../missions/routes";
import { PAY_AT_MIDDLE, CANDIDATES_PER_MONTH, HEAL_PER_DAY, RECRUIT_COST, SISTER_SHARE, STARTING_AGENTS, VITALITY_CAP, VITALITY_RANGE } from "../../data/agents";
import { APTITUDE_MIDDLE, aptitudeIds, ROLES, type Role, type StaffRole } from "../../data/aptitudes";
import { AIRCRAFT, type AircraftKind } from "../../data/aircraft";
import { FACILITIES, STAFF, LAY_FEMALE_SHARE, STAFF_CANDIDATES_PER_MONTH, type BaseUpgradeKind } from "../../data/installations";
import { RESEARCH_EFFECTS } from "../../data/research";
import { bestPlace, countRooms, ROOM_KINDS, freePlaces, furnish, isFree, isRoomKind, roomAt, roomsOf, synergy, type Place } from "../base/building";
import { CULTURES, REGION_RECRUITING, type CultureId } from "../../data/names";
import { REGIONS, regionById } from "../../data/regions";
import { distanceNm } from "../core/geo";
import { aptitude, rollAptitudes } from "./aptitudes";
import { rng } from "../core/rng";
import { addLog, isReady, post, type Agent, type Aircraft, type Candidate, type GameState, type Installation, type StaffMember, isCraftDeployed, isDeployed, basesOf, agentById, craftById, installationById, readyBase } from "../core/state";
import { DAY, type LatLon } from "../core/time";

// ---------------------------------------------------------------------------
// Where recruits come from
// ---------------------------------------------------------------------------

/**
 * Relative chance that a recruit comes from each region: support² × Catholic
 * presence × OPV presence (+1 for an installation in the region, +1 for a
 * base in the same theatre). Early on that means Europe.
 */
export function recruitingWeights(s: GameState): { regionId: string; weight: number }[] {
  const installed = new Set(s.installations.map((i) => i.regionId));
  const baseTheatres = new Set(
    basesOf(s).map((i) => regionById(i.regionId)?.group).filter(Boolean),
  );
  return REGIONS.map((r) => {
    const support = Math.max(0, s.regions[r.id]?.support ?? 0);
    const presence = REGION_RECRUITING[r.id]?.presence ?? 0.1;
    const opv = 1 + (installed.has(r.id) ? 1 : 0) + (baseTheatres.has(r.group) ? 1 : 0);
    return { regionId: r.id, weight: support * support * presence * opv };
  }).filter((w) => w.weight > 0);
}


// ---------------------------------------------------------------------------
// People: candidates for every role, joining a base, hiring, letting go
// ---------------------------------------------------------------------------

function takenNames(s: GameState) {
  return new Set([...s.agents, ...s.staff, ...s.candidates].map((p) => p.name));
}

/** A name from a region's mix of cultures, not already in use. */
function pickName(s: GameState, regionId: string, female: boolean): { name: string; culture: CultureId } {
  const r = rng(s);
  const mix = REGION_RECRUITING[regionId]?.cultures ?? { italian: 1 };
  const culture = r.weighted(Object.entries(mix).map(([c, w]) => [c as CultureId, w!] as const));
  const pool = CULTURES[culture];
  const taken = takenNames(s);
  let name = "";
  for (let tries = 0; tries < 12; tries++) {
    name = `${r.pick(female ? pool.female : pool.male)} ${r.pick(pool.surnames)}`;
    if (!taken.has(name)) break;
  }
  return { name, culture };
}

/** Someone the Church's network puts forward for a role, from where the Order is trusted. */
export function generateCandidate(s: GameState, role: Role): Candidate {
  const r = rng(s);
  const weights = recruitingWeights(s);
  const regionId = weights.length ? r.weighted(weights.map((w) => [w.regionId, w.weight] as const)) : "italy";
  const female = r.chance(role === "operator" ? SISTER_SHARE : LAY_FEMALE_SHARE);
  const { name, culture } = pickName(s, regionId, female);
  const c: Candidate = { id: `cand-${s.nextId++}`, role, name, female, culture, aptitudes: rollAptitudes(r, role) };
  if (role === "operator") c.vitality = r.int(...VITALITY_RANGE);
  return c;
}

/** Candidates put forward each month, by role. */
const POOL: Record<Role, number> = { operator: CANDIDATES_PER_MONTH, scientist: STAFF_CANDIDATES_PER_MONTH, engineer: STAFF_CANDIDATES_PER_MONTH, analyst: STAFF_CANDIDATES_PER_MONTH };

/** A new month's candidates, for every role. */
export function refreshCandidates(s: GameState) {
  s.candidates = [];
  for (const role of ROLES) for (let i = 0; i < POOL[role]; i++) s.candidates.push(generateCandidate(s, role));
}

/** This month's candidates, of one role or all. */
export const candidatesOf = (s: GameState, role?: Role): Candidate[] => s.candidates.filter((c) => !role || c.role === role);

/** A candidate joins a base's roster: an operator (with their kit), or lay staff. */
function join(s: GameState, c: Candidate, baseId: string): Agent | StaffMember {
  const p = { role: c.role, name: c.name, female: c.female, culture: c.culture, aptitudes: { ...c.aptitudes }, baseId, joinedAt: s.time };
  if (c.role !== "operator") {
    const m: StaffMember = { ...p, role: c.role, id: `staff-${s.nextId++}` };
    s.staff.push(m);
    return m;
  }
  // Haematology: every new operator is that much harder to break.
  const vitality = Math.min(VITALITY_CAP, (c.vitality ?? VITALITY_RANGE[0]) + (s.research?.done.includes("haematology") ? RESEARCH_EFFECTS.vitality : 0));
  const a: Agent = {
    ...p, role: "operator", aptitudes: p.aptitudes as Agent["aptitudes"], id: `agent-${s.nextId++}`,
    vitality, hp: vitality, woundedUntil: 0, missions: 0, kills: 0, gear: standardIssue(), lowViz: standardIssue(),
  };
  s.agents.push(a);
  return a;
}

/** Someone from the Church's network joins a base directly, with no fee: the founding team, a cell's rookies, tests. */
export function enlist(s: GameState, baseId: string, role: "operator"): Agent;
export function enlist(s: GameState, baseId: string, role: StaffRole): StaffMember;
export function enlist(s: GameState, baseId: string, role: Role = "operator"): Agent | StaffMember {
  return join(s, generateCandidate(s, role), baseId);
}

/** What it costs to take someone on: an operator's training, or a lay hire's vetting. */
const hireFee = (role: Role) => (role === "operator" ? RECRUIT_COST : STAFF[role].hire);

/** Why a base can't take on someone of this role now, or null. */
export function hireBlocker(s: GameState, baseId: string, role: Role): string | null {
  const base = readyBase(s, baseId);
  if (!base) return "No operational base there.";
  const f = role === "operator" ? null : STAFF[role].facility;
  if (f && role !== "operator") {
    const room = staffRoom(base, role);
    if (!room) return `${base.name} has no ${FACILITIES[f].name.toLowerCase().replace(/s$/, "")} yet.`;
    if (staffAt(s, base, role) >= room) return `No room: build another ${FACILITIES[f].article.replace(/^an? /, "")}.`;
  }
  if (occupantsAt(s, baseId) >= quartersOf(base)) return `${base.name} has no free beds. Build quarters.`;
  if (!candidatesOf(s, role).length) return "Nobody left this month.";
  if (s.funds < hireFee(role)) return "Not enough funds.";
  return null;
}

/** Takes on a candidate (the one named, or the first of the role) at a base. */
export function hire(s: GameState, baseId: string, role: Role, candidateId?: string): string | null {
  const why = hireBlocker(s, baseId, role);
  if (why) return why;
  const c = candidateId ? candidatesOf(s, role).find((x) => x.id === candidateId) : candidatesOf(s, role)[0];
  if (!c) return "That candidate is no longer available.";
  s.candidates = s.candidates.filter((x) => x !== c);
  s.funds -= hireFee(role);
  const p = join(s, c, baseId);
  if (p.role === "operator") addLog(s, `${p.female ? "Sister" : "Brother"} ${p.name} takes vows and joins the Order.`, "good");
  else addLog(s, `${p.name} joins ${readyBase(s, baseId)!.name} as a ${STAFF[p.role].name.toLowerCase()}.`);
  return null;
}

/** Lets someone go: an operator who is home (their kit goes back to the armoury), or a member of staff who is here. */
export function dismiss(s: GameState, personId: string): string | null {
  const a = agentById(s, personId);
  if (a) {
    if (isDeployed(s, a)) return `${a.name} is in the field.`;
    returnGear(s, a);
    s.agents = s.agents.filter((x) => x !== a);
    addLog(s, `${a.name} is released from service.`);
    return null;
  }
  const p = s.staff.find((x) => x.id === personId);
  if (!p) return "No one by that name.";
  if (p.arriveAt) return `${p.name} is still on the way.`;
  s.staff = s.staff.filter((x) => x !== p);
  addLog(s, `${p.name}, ${STAFF[p.role].name.toLowerCase()}, leaves ${readyBase(s, p.baseId)?.name ?? "the Order"}.`);
  return null;
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export const agentsAt = (s: GameState, baseId: string) => s.agents.filter((a) => a.baseId === baseId);
export const aircraftAt = (s: GameState, baseId: string) => s.aircraft.filter((a) => a.baseId === baseId);
/** How much of a facility a base has: hangars, beds (8 a quarters room), labs, workshops and
 *  containment by the rooms built, and the SIGINT centre's level. */
export function facilityCount(b: Installation, kind: BaseUpgradeKind): number {
  if (kind === "hangar") return b.hangars ?? FACILITIES.hangar.start;
  if (kind === "sigint") return b.sigintCentre ?? 0;
  return countRooms(b, kind) * (kind === "quarters" ? FACILITIES.quarters.step : 1);
}
export const quartersOf = (b: Installation) => facilityCount(b, "quarters");
export const hangarsOf = (b: Installation) => facilityCount(b, "hangar");

/** The scientists or engineers at a base, by name. */
export const staffOf = (s: GameState, baseId: string, kind?: StaffRole): StaffMember[] =>
  s.staff.filter((p) => p.baseId === baseId && (!kind || p.role === kind));
/** How many scientists or engineers a base has. */
export const staffAt = (s: GameState, b: Installation, kind: StaffRole): number => staffOf(s, b.id, kind).filter((p) => !p.arriveAt).length;
/** Everyone sleeping at a base: agents (even when away on a mission) and staff. */
export const occupantsAt = (s: GameState, baseId: string): number => agentsAt(s, baseId).length + staffOf(s, baseId).length;
/** Staff of a role at work: not in transit, at a base that stands (at that base, if given). */
export function staffAtWork(s: GameState, role: StaffRole, baseId?: string): StaffMember[] {
  const ready = new Set(s.installations.filter((b) => b.kind === "base" && isReady(s, b) && (!baseId || b.id === baseId)).map((b) => b.id));
  return s.staff.filter((p) => p.role === role && !p.arriveAt && ready.has(p.baseId));
}

/** A role's lead: their aptitudes, over 50, multiply everyone else's (sim/people/aptitudes.ts). One scientist
 *  and one analyst for the Order; one engineer for each base. The lead named, if they are at work. */
export function staffLead(s: GameState, role: StaffRole, base?: Installation): StaffMember | undefined {
  const id = role === "engineer" ? base?.leadEngineer : role === "scientist" ? s.leadScientist : s.leadAnalyst;
  return id ? staffAtWork(s, role, role === "engineer" ? base!.id : undefined).find((p) => p.id === id) : undefined;
}

/** Names (or, with null, clears) a role's lead (an engineer, at `baseId`). Takes effect at once. */
export function setStaffLead(s: GameState, role: StaffRole, staffId: string | null, baseId?: string): string | null {
  const base = role === "engineer" ? s.installations.find((b) => b.id === baseId && b.kind === "base") : undefined;
  if (role === "engineer" && !base) return "No such base.";
  if (staffId !== null) {
    const p = s.staff.find((x) => x.id === staffId);
    if (!p || p.role !== role || (base && p.baseId !== base.id)) return base ? `Not an engineer at ${base.name}.` : `Not one of our ${STAFF[role].plural.toLowerCase()}.`;
    if (p.arriveAt) return "Still in transit.";
  }
  const holder: { leadEngineer?: string; leadScientist?: string; leadAnalyst?: string } = base ?? s;
  const key = role === "engineer" ? "leadEngineer" : role === "scientist" ? "leadScientist" : "leadAnalyst";
  if (staffId === null) delete holder[key];
  else holder[key] = staffId;
  return null;
}

/** Sets how many of a kind a base has (founding, tests): adds or removes the newest. */
export function setStaff(s: GameState, base: Installation, role: StaffRole, n: number) {
  while (staffAt(s, base, role) < n) enlist(s, base.id, role);
  while (staffAt(s, base, role) > n) {
    const last = staffOf(s, base.id, role).at(-1)!;
    s.staff = s.staff.filter((p) => p !== last);
  }
}
/** How many a base's labs (workshops, fusion centres) can hold. */
export const staffRoom = (b: Installation, kind: StaffRole): number => {
  const f = FACILITIES[STAFF[kind].facility];
  return facilityCount(b, f.kind) * f.holds!;
};
/** Free containment cells at a base. */
export const freeCells = (b: Installation, s?: GameState): number =>
  facilityCount(b, "containment") * FACILITIES.containment.holds! - (b.captives?.length ?? 0) - (s ? inboundCaptives(s, b.id) : 0);
/** Captives aboard aircraft bound for a base: their cells are kept for them. */
const inboundCaptives = (s: GameState, baseId: string): number =>
  s.aircraft.reduce((t, a) => t + (a.baseId === baseId ? a.cargo?.captives.length ?? 0 : 0), 0);

/** The furthest any aircraft at this base can take a team, in nautical miles. */
export function baseReachNm(s: GameState, baseId: string): number {
  return aircraftAt(s, baseId).reduce((m, a) => Math.max(m, AIRCRAFT[a.kind].reachNm), 0);
}

/** Whether an aircraft of this kind can get from a base to a point (direct, or through refuelling stations). */
export const canReach = (s: GameState, from: LatLon, pos: LatLon, kind: AircraftKind) => !!planRoute(s, from, pos, kind);

/** Operational bases whose aircraft can reach a point (directly or by refuelling), nearest first. */
export function basesInReach(s: GameState, pos: LatLon) {
  return s.installations
    .filter((b) => b.kind === "base" && b.readyAt <= s.time)
    .map((b) => ({ base: b, distance: distanceNm(b.pos, pos), reach: baseReachNm(s, b.id) }))
    .filter((x) => [...new Set(aircraftAt(s, x.base.id).map((a) => a.kind))].some((k) => canReach(s, x.base.pos, pos, k)))
    .sort((a, b) => a.distance - b.distance);
}

// ---------------------------------------------------------------------------
// Commands (each returns an error message, or null on success)
// ---------------------------------------------------------------------------

/** What it takes now to add an aircraft: the price, or the first month's lease. */
export const upfrontCost = (kind: AircraftKind) => (AIRCRAFT[kind].ownership === "owned" ? AIRCRAFT[kind].price : AIRCRAFT[kind].monthly);

export function acquireBlocker(s: GameState, baseId: string, kind: AircraftKind): string | null {
  const base = readyBase(s, baseId);
  if (!base) return "No operational base there.";
  if (aircraftAt(s, baseId).length >= hangarsOf(base)) return `${base.name} has no free hangar.`;
  if (s.funds < upfrontCost(kind)) return AIRCRAFT[kind].ownership === "owned" ? "Not enough funds to buy one." : "Not enough funds for the first month's lease.";
  return null;
}

function nextCallsign(s: GameState, kind: AircraftKind) {
  const used = new Set(s.aircraft.map((a) => a.name));
  for (let n = 1; ; n++) {
    const name = `${AIRCRAFT[kind].callsign}-${n}`;
    if (!used.has(name)) return name;
  }
}

/** Buys a helicopter or leases a jet (first month up front). */
export function acquireAircraft(s: GameState, baseId: string, kind: AircraftKind, free = false): string | null {
  const why = free ? null : acquireBlocker(s, baseId, kind);
  if (why) return why;
  if (!free) s.funds -= upfrontCost(kind);
  const a: Aircraft = { id: `air-${s.nextId++}`, kind, name: nextCallsign(s, kind), baseId };
  s.aircraft.push(a);
  if (!free) addLog(s, `${a.name} (${AIRCRAFT[kind].name}) ${AIRCRAFT[kind].ownership === "owned" ? "bought" : "leased"}.`);
  return null;
}

/** What selling an owned aircraft brings back (0 for a lease). */
export const resaleValue = (kind: AircraftKind) => Math.round(AIRCRAFT[kind].price * AIRCRAFT[kind].resale);

/** Sells a helicopter, or hands a leased jet back. */
export function releaseAircraft(s: GameState, aircraftId: string): string | null {
  const a = craftById(s, aircraftId);
  if (!a) return "No such aircraft.";
  if (isCraftDeployed(s, a)) return `${a.name} is flying.`;
  s.aircraft = s.aircraft.filter((x) => x.id !== aircraftId);
  if (AIRCRAFT[a.kind].ownership === "owned") {
    s.funds += resaleValue(a.kind);
    addLog(s, `${a.name} sold.`);
  } else addLog(s, `${a.name} returned to the lessor.`);
  return null;
}

export function upgradeBlocker(s: GameState, baseId: string, kind: BaseUpgradeKind, at?: Place): string | null {
  const base = readyBase(s, baseId);
  if (!base) return "No operational base there.";
  const f = FACILITIES[kind];
  const pending = (base.upgrades ?? []).filter((u) => u.kind === kind).length;
  const next = facilityCount(base, kind) + pending * f.step;
  if (next + f.step > f.max) return `No room for more ${f.name.toLowerCase()}.`;
  if (f.research && next >= f.research.atLevel && !s.research.done.includes(f.research.id)) return `Needs ${f.research.name}.`;
  if (needsTile(base, kind)) {
    if (at ? !isFree(base, at) : !freePlaces(base).length) return at ? "That room is taken." : "No free rooms in the building.";
  }
  if (s.funds < f.cost) return "Not enough funds.";
  return null;
}

/** A new room needs a free tile; a SIGINT centre's upgrade and a hangar don't. */
const needsTile = (b: Installation, kind: BaseUpgradeKind) =>
  isRoomKind(kind) && !(kind === "sigint" && (facilityCount(b, "sigint") > 0 || (b.upgrades ?? []).some((u) => u.kind === "sigint")));

/** Starts building. A room goes on the given tile, or the one with the most synergy. */
export function upgradeBase(s: GameState, baseId: string, kind: BaseUpgradeKind, at?: Place): string | null {
  const why = upgradeBlocker(s, baseId, kind, at);
  if (why) return why;
  const base = readyBase(s, baseId)!;
  const f = FACILITIES[kind];
  const place = needsTile(base, kind) && isRoomKind(kind) ? at ?? bestPlace(base, kind)! : undefined;
  s.funds -= f.cost;
  (base.upgrades ??= []).push({ kind, readyAt: s.time + f.days * DAY, ...place });
  addLog(s, `Work begins on ${f.article} at ${base.name}.`);
  return null;
}

/** Why a room can't be cleared back to office space, or null. */
export function demolishBlocker(s: GameState, baseId: string, at: Place): string | null {
  const base = readyBase(s, baseId);
  const room = base && roomAt(base, at);
  if (!base || !room) return "Nothing built there.";
  const f = FACILITIES[room.kind];
  const left = facilityCount(base, room.kind) - (room.kind === "sigint" ? facilityCount(base, "sigint") : f.step);
  if (room.kind === "lab" && staffAt(s, base, "scientist") > left * FACILITIES.lab.holds!) return "Let some scientists go first.";
  if (room.kind === "workshop" && staffAt(s, base, "engineer") > left * FACILITIES.workshop.holds!) return "Let some engineers go first.";
  if (room.kind === "containment" && (base.captives?.length ?? 0) > left * FACILITIES.containment.holds!) return "The cells are in use.";
  if (room.kind === "quarters" && occupantsAt(s, baseId) > left) return "People are sleeping there.";
  if (room.kind === "sigint" && base.upgrades?.some((u) => u.kind === "sigint")) return "The upgrade is under way.";
  return null;
}

/** Clears a room back to office space. Nothing is refunded. */
export function demolishRoom(s: GameState, baseId: string, at: Place): string | null {
  const why = demolishBlocker(s, baseId, at);
  if (why) return why;
  const base = readyBase(s, baseId)!;
  const room = roomAt(base, at)!;
  const f = FACILITIES[room.kind];
  if (room.kind === "sigint") base.sigintCentre = 0;
  base.rooms = roomsOf(base).filter((r) => r !== room);
  addLog(s, `${f.name} at ${base.name} cleared back to office space.`);
  return null;
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

export function hourlyPersonnel(s: GameState) {
  for (const b of s.installations) {
    if (!b.upgrades?.length) continue;
    const done = b.upgrades.filter((u) => u.readyAt <= s.time);
    if (!done.length) continue;
    b.upgrades = b.upgrades.filter((u) => u.readyAt > s.time);
    for (const u of done) {
      const f = FACILITIES[u.kind];
      if (isRoomKind(u.kind) && u.floor !== undefined && u.slot !== undefined) {
        (b.rooms ??= []).push({ kind: u.kind, floor: u.floor, slot: u.slot });
        if (u.kind === "sigint") b.sigintCentre = 1;
      } else if (u.kind === "hangar") b.hangars = hangarsOf(b) + f.step;
      else if (u.kind === "sigint") b.sigintCentre = facilityCount(b, "sigint") + f.step;
      const body: Record<BaseUpgradeKind, string> = {
        hangar: `${b.name} now has room for ${hangarsOf(b)} aircraft.`,
        quarters: `${b.name} now has ${quartersOf(b)} beds for operatives and staff.`,
        lab: `${b.name} now has room for ${staffRoom(b, "scientist")} scientists. Hire them in Personnel.`,
        workshop: `${b.name} now has room for ${staffRoom(b, "engineer")} engineers. Hire them in Personnel.`,
        fusion: `${b.name} now has room for ${staffRoom(b, "analyst")} analysts. Hire them in Personnel.`,
        storage: `${b.name} now has storage: equipment can be shipped there.`,
        sigint: (b.sigintCentre ?? 0) > 1
          ? `The SIGINT centre at ${b.name} is upgraded. It now hears more than a station.`
          : `${b.name} now has a SIGINT centre. It listens to its region like a SIGINT station.`,
        containment: `${b.name} can now hold ${freeCells(b) + (b.captives?.length ?? 0)} captives.`,
      };
      post(s, {
        kind: "construction",
        title: `New ${u.kind === "quarters" ? "quarters" : f.article.replace(/^an? /, "")} at ${b.name}`,
        body: body[u.kind],
        regionId: b.regionId,
        pos: b.pos,
      });
    }
  }
}

export function dailyPersonnel(s: GameState) {
  // Staff whose base is gone (evicted, raided, fallen) are lost with it.
  const bases = new Set(s.installations.map((b) => b.id));
  if (s.staff?.some((p) => !bases.has(p.baseId))) s.staff = s.staff.filter((p) => bases.has(p.baseId));
  for (const a of s.agents) {
    if (a.hp < a.vitality) a.hp = Math.min(a.vitality, a.hp + healPerDay(s) * (1 + synergy(readyBase(s, a.baseId), "quarters")));
    // Fit again once healed (also clears wounds set at an older, slower rate).
    if (a.woundedUntil && (a.woundedUntil <= s.time || a.hp >= a.vitality)) a.woundedUntil = 0;
  }
}

/** Hit points an agent recovers a day. */
export const healPerDay = (s: GameState) =>
  s.research?.done.includes("combat-surgery") ? RESEARCH_EFFECTS.surgeryHealPerDay : s.research?.done.includes("field-medicine") ? RESEARCH_EFFECTS.healPerDay : HEAL_PER_DAY;

/** A month's pay (a salary; an operator's upkeep): PAY_AT_MIDDLE at 50 in every aptitude, in proportion
 *  to their mean aptitude, to the $100. So a better hire costs more, and grows dearer as they learn. */
export function monthlyPay(p: Pick<Candidate, "role" | "aptitudes">): number {
  const ids = aptitudeIds(p.role);
  const mean = ids.reduce((t, id) => t + aptitude(p, id), 0) / ids.length;
  return Math.round((PAY_AT_MIDDLE * mean) / APTITUDE_MIDDLE / 100) * 100;
}

export function monthlyPersonnelCost(s: GameState) {
  const upkeep = s.agents.reduce((t, a) => t + monthlyPay(a), 0);
  const bases = new Set(s.installations.map((b) => b.id));
  const staff = s.staff.reduce((t, p) => t + (bases.has(p.baseId) ? monthlyPay(p) : 0), 0);
  // Jet leases, plus crew and maintenance for helicopters we own.
  const leases = s.aircraft.reduce((t, a) => t + AIRCRAFT[a.kind].monthly, 0);
  const containment = s.installations.reduce((t, b) => t + (b.kind === "base" ? facilityCount(b, "containment") * FACILITIES.containment.upkeep! : 0), 0);
  return { upkeep, leases, staff, containment };
}

/** A base is gone (evicted, or lost to an assault): its agents make for the nearest other base, its aircraft on the ground
 *  are lost, its teams in the field fly home elsewhere. Its staff are lost with it (dailyPersonnel). */
export function loseBase(s: GameState, base: Installation): Installation | null {
  const others = s.installations.filter((i) => i.kind === "base" && i.id !== base.id).sort((a, b) => distanceNm(a.pos, base.pos) - distanceNm(b.pos, base.pos));
  const refuge = others.find((i) => isReady(s, i)) ?? others[0] ?? null;
  s.installations = s.installations.filter((i) => i !== base);
  s.projects = s.projects.filter((p) => p.baseId !== base.id);
  s.aircraft = s.aircraft.filter((a) => a.baseId !== base.id || isCraftDeployed(s, a));
  if (refuge) {
    for (const a of s.agents) if (a.baseId === base.id) a.baseId = refuge.id;
    for (const a of s.aircraft) if (a.baseId === base.id) a.baseId = refuge.id;
    for (const m of s.missions) {
      if (m.baseId === base.id) m.baseId = refuge.id;
      for (const w of m.wings ?? []) if (w.baseId === base.id) w.baseId = refuge.id;
    }
  }
  return refuge;
}

/** A new campaign: the founding team at Padua, and its science wing (a lab, a workshop, a few staff). */
export function foundOrder(s: GameState, baseId: string) {
  const base = installationById(s, baseId);
  if (base) {
    base.hangars ??= FACILITIES.hangar.start;
    base.upgrades ??= [];
    // Padua's rooms: FACILITIES' `start`, those with a `startAt` there, the rest where synergy puts them.
    furnish(base, Object.fromEntries(ROOM_KINDS.map((k) => [k, FACILITIES[k].start])),
      ROOM_KINDS.flatMap((kind) => (FACILITIES[kind].startAt && FACILITIES[kind].start ? [{ kind, ...FACILITIES[kind].startAt! }] : [])));
    base.sigintCentre = FACILITIES.sigint.start;
    base.remains ??= 0;
    base.armoury ??= { ...FOUNDING_ARMOURY };
    base.captives ??= [];
    for (const role of ["scientist", "engineer", "analyst"] as const) setStaff(s, base, role, STAFF[role].start);
  }
  for (let i = 0; i < STARTING_AGENTS; i++) enlist(s, baseId, "operator");
  // The founding armoury fits the team's Full tactical loadouts.
  for (const a of s.agents) if (a.baseId === baseId) issueBest(s, a.id, "tactical");
  acquireAircraft(s, baseId, "helicopter", true);
  acquireAircraft(s, baseId, "jet", true);
  refreshCandidates(s);
}

