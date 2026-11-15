// Agents, recruitment, aircraft and base capacity.
import { AGENT_UPKEEP, CANDIDATES_PER_MONTH, HEAL_PER_DAY, RECRUIT_COST, RECRUIT_STAT_RANGES, SISTER_SHARE, STARTING_AGENTS, STATS, type Stats } from "../data/agents";
import { AIRCRAFT, type AircraftKind } from "../data/aircraft";
import { BASE_CAPACITY, CELLS_PER_CONTAINMENT, CONTAINMENT_UPKEEP, FACILITIES, STAFF, type BaseUpgradeKind, type StaffKind } from "../data/installations";
import { projectById, RESEARCH_EFFECTS } from "../data/research";
import { CULTURES, REGION_RECRUITING, type CultureId } from "../data/names";
import { REGIONS, regionById } from "../data/regions";
import { distanceNm } from "./geo";
import { rng } from "./rng";
import { addLog, post, type Agent, type Aircraft, type Candidate, type GameState, type Installation } from "./state";
import { DAY, type LatLon } from "./time";

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
    s.installations.filter((i) => i.kind === "base").map((i) => regionById(i.regionId)?.group).filter(Boolean),
  );
  return REGIONS.map((r) => {
    const support = Math.max(0, s.regions[r.id]?.support ?? 0);
    const presence = REGION_RECRUITING[r.id]?.presence ?? 0.1;
    const opv = 1 + (installed.has(r.id) ? 1 : 0) + (baseTheatres.has(r.group) ? 1 : 0);
    return { regionId: r.id, weight: support * support * presence * opv };
  }).filter((w) => w.weight > 0);
}

function weightedPick<T>(items: { item: T; weight: number }[], roll: number): T {
  const total = items.reduce((a, i) => a + i.weight, 0);
  let x = roll * total;
  for (const i of items) if ((x -= i.weight) <= 0) return i.item;
  return items[items.length - 1]!.item;
}

function takenNames(s: GameState) {
  return new Set([...s.agents.map((a) => a.name), ...s.candidates.map((c) => c.name)]);
}

export function generateCandidate(s: GameState): Candidate {
  const r = rng(s);
  const weights = recruitingWeights(s);
  const regionId = weights.length ? weightedPick(weights.map((w) => ({ item: w.regionId, weight: w.weight })), r.next()) : "italy";
  const region = regionById(regionId)!;
  const mix = REGION_RECRUITING[regionId]?.cultures ?? { italian: 1 };
  const culture = weightedPick(
    Object.entries(mix).map(([c, w]) => ({ item: c as CultureId, weight: w! })),
    r.next(),
  );
  const pool = CULTURES[culture];
  const sister = r.chance(SISTER_SHARE);
  const taken = takenNames(s);
  let name = "";
  for (let tries = 0; tries < 12; tries++) {
    name = `${r.pick(sister ? pool.female : pool.male)} ${r.pick(pool.surnames)}`;
    if (!taken.has(name)) break;
  }
  const stats = Object.fromEntries(
    STATS.map(({ id }) => [id, r.int(RECRUIT_STAT_RANGES[id][0], RECRUIT_STAT_RANGES[id][1])]),
  ) as Stats;
  const city = region.cities.length ? r.pick(region.cities.slice(0, 6)).name : region.name;
  return { id: `cand-${s.nextId++}`, name, sister, culture, originRegion: regionId, originCity: city, stats };
}

export function refreshCandidates(s: GameState) {
  s.candidates = [];
  for (let i = 0; i < CANDIDATES_PER_MONTH; i++) s.candidates.push(generateCandidate(s));
}

function toAgent(s: GameState, c: Candidate, baseId: string): Agent {
  // Haematology: every new agent is that much harder to break.
  const vitality = Math.min(95, c.stats.vitality + (s.research?.done.includes("haematology") ? RESEARCH_EFFECTS.vitality : 0));
  const stats = { ...c.stats, vitality };
  return { ...c, stats, id: `agent-${s.nextId++}`, baseId, hp: vitality, woundedUntil: 0, deployed: false, missions: 0, kills: 0, joinedAt: s.time };
}

/** A rookie from the Church's network joins a base directly (no fee). */
export function enlist(s: GameState, baseId: string): Agent {
  const a = toAgent(s, generateCandidate(s), baseId);
  s.agents.push(a);
  return a;
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export const agentsAt = (s: GameState, baseId: string) => s.agents.filter((a) => a.baseId === baseId);
export const aircraftAt = (s: GameState, baseId: string) => s.aircraft.filter((a) => a.baseId === baseId);
export const quartersOf = (b: Installation) => b.quarters ?? BASE_CAPACITY.startQuarters;
export const hangarsOf = (b: Installation) => b.hangars ?? BASE_CAPACITY.startHangars;

const FACILITY_FIELD = { hangar: "hangars", quarters: "quarters", lab: "labs", workshop: "workshops", containment: "containment" } as const;
/** How much of a facility a base has (hangars, beds, labs...). */
export const facilityCount = (b: Installation, kind: BaseUpgradeKind): number => b[FACILITY_FIELD[kind]] ?? FACILITIES[kind].startNew;
const setFacility = (b: Installation, kind: BaseUpgradeKind, n: number) => {
  b[FACILITY_FIELD[kind]] = n;
};

/** Scientists or engineers at a base. */
export const staffAt = (b: Installation, kind: StaffKind): number => (kind === "scientist" ? b.scientists : b.engineers) ?? 0;
/** How many a base's labs (workshops) can hold. */
export const staffRoom = (b: Installation, kind: StaffKind): number => facilityCount(b, STAFF[kind].facility) * STAFF[kind].perFacility;
/** Free containment cells at a base. */
export const freeCells = (b: Installation): number => facilityCount(b, "containment") * CELLS_PER_CONTAINMENT - (b.captives?.length ?? 0);

/** The furthest any aircraft at this base can take a team, in nautical miles. */
export function baseReachNm(s: GameState, baseId: string): number {
  return aircraftAt(s, baseId).reduce((m, a) => Math.max(m, AIRCRAFT[a.kind].reachNm), 0);
}

/** Operational bases whose aircraft can reach a point, nearest first. */
export function basesInReach(s: GameState, pos: LatLon) {
  return s.installations
    .filter((b) => b.kind === "base" && b.readyAt <= s.time)
    .map((b) => ({ base: b, distance: distanceNm(b.pos, pos), reach: baseReachNm(s, b.id) }))
    .filter((x) => x.distance <= x.reach)
    .sort((a, b) => a.distance - b.distance);
}

// ---------------------------------------------------------------------------
// Commands (each returns an error message, or null on success)
// ---------------------------------------------------------------------------

function findBase(s: GameState, baseId: string) {
  return s.installations.find((i) => i.id === baseId && i.kind === "base" && i.readyAt <= s.time);
}

export function recruitBlocker(s: GameState, baseId: string): string | null {
  const base = findBase(s, baseId);
  if (!base) return "No operational base there.";
  if (agentsAt(s, baseId).length >= quartersOf(base)) return `${base.name} has no free quarters.`;
  if (s.funds < RECRUIT_COST) return "Not enough funds.";
  return null;
}

export function recruit(s: GameState, candidateId: string, baseId: string): string | null {
  const why = recruitBlocker(s, baseId);
  if (why) return why;
  const c = s.candidates.find((x) => x.id === candidateId);
  if (!c) return "That candidate is no longer available.";
  s.candidates = s.candidates.filter((x) => x.id !== candidateId);
  s.funds -= RECRUIT_COST;
  const a = toAgent(s, c, baseId);
  s.agents.push(a);
  addLog(s, `${a.sister ? "Sister" : "Brother"} ${a.name} takes vows and joins the Order.`, "good");
  return null;
}

export function dismissAgent(s: GameState, agentId: string): string | null {
  const a = s.agents.find((x) => x.id === agentId);
  if (!a) return "No such agent.";
  if (a.deployed) return `${a.name} is in the field.`;
  s.agents = s.agents.filter((x) => x.id !== agentId);
  addLog(s, `${a.name} is released from service.`);
  return null;
}

/** What it takes now to add an aircraft: the price, or the first month's lease. */
export const upfrontCost = (kind: AircraftKind) => (AIRCRAFT[kind].ownership === "owned" ? AIRCRAFT[kind].price : AIRCRAFT[kind].monthly);

export function acquireBlocker(s: GameState, baseId: string, kind: AircraftKind): string | null {
  const base = findBase(s, baseId);
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
  const a: Aircraft = { id: `air-${s.nextId++}`, kind, name: nextCallsign(s, kind), baseId, deployed: false };
  s.aircraft.push(a);
  if (!free) addLog(s, `${a.name} (${AIRCRAFT[kind].name}) ${AIRCRAFT[kind].ownership === "owned" ? "bought" : "leased"}.`);
  return null;
}

/** What selling an owned aircraft brings back (0 for a lease). */
export const resaleValue = (kind: AircraftKind) => Math.round(AIRCRAFT[kind].price * AIRCRAFT[kind].resale);

/** Sells a helicopter, or hands a leased jet back. */
export function releaseAircraft(s: GameState, aircraftId: string): string | null {
  const a = s.aircraft.find((x) => x.id === aircraftId);
  if (!a) return "No such aircraft.";
  if (a.deployed) return `${a.name} is flying.`;
  s.aircraft = s.aircraft.filter((x) => x.id !== aircraftId);
  if (AIRCRAFT[a.kind].ownership === "owned") {
    s.funds += resaleValue(a.kind);
    addLog(s, `${a.name} sold.`);
  } else addLog(s, `${a.name} returned to the lessor.`);
  return null;
}

export function upgradeBlocker(s: GameState, baseId: string, kind: BaseUpgradeKind): string | null {
  const base = findBase(s, baseId);
  if (!base) return "No operational base there.";
  const f = FACILITIES[kind];
  const pending = (base.upgrades ?? []).filter((u) => u.kind === kind).length;
  if (facilityCount(base, kind) + (pending + 1) * f.step > f.max) return `No room for more ${f.name.toLowerCase()}.`;
  if (s.funds < f.cost) return "Not enough funds.";
  return null;
}

export function upgradeBase(s: GameState, baseId: string, kind: BaseUpgradeKind): string | null {
  const why = upgradeBlocker(s, baseId, kind);
  if (why) return why;
  const base = findBase(s, baseId)!;
  const f = FACILITIES[kind];
  s.funds -= f.cost;
  (base.upgrades ??= []).push({ kind, readyAt: s.time + f.days * DAY });
  addLog(s, `Work begins on ${f.article} at ${base.name}.`);
  return null;
}

// ----- Scientists and engineers -----

export function hireBlocker(s: GameState, baseId: string, kind: StaffKind): string | null {
  const base = findBase(s, baseId);
  if (!base) return "No operational base there.";
  const room = staffRoom(base, kind);
  if (!room) return `${base.name} has no ${FACILITIES[STAFF[kind].facility].name.toLowerCase().replace(/s$/, "")} yet.`;
  if (staffAt(base, kind) >= room) return `No room: build another ${FACILITIES[STAFF[kind].facility].article.replace(/^an? /, "")}.`;
  if (s.funds < STAFF[kind].hire) return "Not enough funds.";
  return null;
}

export function hireStaff(s: GameState, baseId: string, kind: StaffKind): string | null {
  const why = hireBlocker(s, baseId, kind);
  if (why) return why;
  const base = findBase(s, baseId)!;
  s.funds -= STAFF[kind].hire;
  if (kind === "scientist") base.scientists = staffAt(base, kind) + 1;
  else base.engineers = staffAt(base, kind) + 1;
  return null;
}

export function dismissStaff(s: GameState, baseId: string, kind: StaffKind): string | null {
  const base = findBase(s, baseId);
  if (!base) return "No operational base there.";
  if (!staffAt(base, kind)) return `No ${STAFF[kind].plural.toLowerCase()} to let go.`;
  const assigned = (s.projects ?? [])
    .filter((a) => a.baseId === baseId && (projectById(a.projectId)?.kind === "research" ? "scientist" : "engineer") === kind)
    .reduce((t, a) => t + a.staff, 0);
  if (assigned >= staffAt(base, kind)) return `Every one at ${base.name} is on a project. Take someone off one first.`;
  if (kind === "scientist") base.scientists = staffAt(base, kind) - 1;
  else base.engineers = staffAt(base, kind) - 1;
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
      setFacility(b, u.kind, facilityCount(b, u.kind) + f.step);
      const body: Record<BaseUpgradeKind, string> = {
        hangar: `${b.name} now has room for ${hangarsOf(b)} aircraft.`,
        quarters: `${b.name} can now house ${quartersOf(b)} agents.`,
        lab: `${b.name} now has room for ${staffRoom(b, "scientist")} scientists. Hire them on the base's Science tab.`,
        workshop: `${b.name} now has room for ${staffRoom(b, "engineer")} engineers. Hire them on the base's Science tab.`,
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
  for (const a of s.agents) {
    if (a.hp < a.stats.vitality) a.hp = Math.min(a.stats.vitality, a.hp + healPerDay(s));
    // Fit again once healed (also clears wounds set at an older, slower rate).
    if (a.woundedUntil && (a.woundedUntil <= s.time || a.hp >= a.stats.vitality)) a.woundedUntil = 0;
  }
}

/** Hit points an agent recovers a day. */
export const healPerDay = (s: GameState) =>
  s.research?.done.includes("combat-surgery") ? RESEARCH_EFFECTS.surgeryHealPerDay : s.research?.done.includes("field-medicine") ? RESEARCH_EFFECTS.healPerDay : HEAL_PER_DAY;

export function monthlyPersonnelCost(s: GameState) {
  const upkeep = s.agents.length * AGENT_UPKEEP;
  const staff = s.installations.reduce((t, b) => t + staffAt(b, "scientist") * STAFF.scientist.salary + staffAt(b, "engineer") * STAFF.engineer.salary, 0);
  // Jet leases, plus crew and maintenance for helicopters we own.
  const leases = s.aircraft.reduce((t, a) => t + AIRCRAFT[a.kind].monthly, 0);
  const containment = s.installations.reduce((t, b) => t + (b.kind === "base" ? facilityCount(b, "containment") * CONTAINMENT_UPKEEP : 0), 0);
  return { upkeep, leases, staff, containment };
}

/** New campaigns (and v1 saves): the founding team at Padua. */
export function foundOrder(s: GameState, baseId: string) {
  const base = s.installations.find((i) => i.id === baseId);
  if (base) {
    base.hangars ??= BASE_CAPACITY.startHangars;
    base.quarters ??= BASE_CAPACITY.startQuarters;
    base.upgrades ??= [];
    equipFirstBase(base);
  }
  for (let i = 0; i < STARTING_AGENTS; i++) s.agents.push(toAgent(s, generateCandidate(s), baseId));
  acquireAircraft(s, baseId, "helicopter", true);
  acquireAircraft(s, baseId, "jet", true);
  refreshCandidates(s);
}

/** The founding base's science wing: a lab, a workshop and a few staff. */
export function equipFirstBase(base: Installation) {
  base.labs ??= FACILITIES.lab.start;
  base.workshops ??= FACILITIES.workshop.start;
  base.containment ??= FACILITIES.containment.start;
  base.scientists ??= STAFF.scientist.start;
  base.engineers ??= STAFF.engineer.start;
  base.remains ??= 0;
  base.captives ??= [];
}
