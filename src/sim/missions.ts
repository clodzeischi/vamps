// Teams in the field: dispatch, the flight out, the decision on arrival,
// resolution by lead kind, revealed vampire sites, strikes, the flight home.
//
//   dispatch ──▶ outbound ──▶ on-site (arrival decision; maybe hours of work)
//                                │
//                                ▼
//                     resolve: debrief, sites, wounds ──▶ returning ──▶ home
import { addStock, bringHome, useMedkits } from "./equipment";
import type { Gear } from "./inventory";
import type { ItemId } from "../data/equipment";
import type { StatId } from "../data/agents";
import { AIRCRAFT, CHARTER, hiredFlight } from "../data/aircraft";
import { BLOODLINES } from "../data/bloodlines";
import { KIT, type KitId } from "../data/kit";
import { regionById } from "../data/regions";
import { fight, teamSkill, winChance, type FightResult, type Threat } from "./combat";
import { changeSupport, creditAround, creditRegion, PLEDGE } from "./economy";
import { distanceNm } from "./geo";
import { planRoute, routeLegs } from "./routes";
import { rng, type Rng } from "./rng";
import { destroyBloodline, ownerOf } from "./bloodlines";
import { exfiltrate, storySiteLapsed } from "./story";
import { accessBlocker, TRAP_BONUS, ASSET_KINDS, hasAsset, RATLINE_ESCAPE, RATLINE_FIGHT_BONUS, RATLINE_USE_FEE, recruitAsset, type AssetKind } from "./humint";
import { freeCells, healPerDay } from "./personnel";
import { capacityOf, cargoLoad, carriesRemains, LOAD, unloadCargo } from "./transfers";
import { combatMods, holdCaptive } from "./research";
import { findArtifact, shortName } from "./market";
import { changeSecrecy } from "./secrecy";
import {
  addIntel, addLog, improvementLine, isWounded, post, train, type Agent, type Decision, type DecisionOption, type GameState, type Lead,
  type LeadKind, type Mission, type Site, type SiteKind, type Captive, type Cargo, type Aircraft, type Wing, type SceneId,
} from "./state";
import { DAY, HOUR, type LatLon } from "./time";

/** Briefing, kit and boarding before wheels-up. */
export const PREP_HOURS = 1;
/** Scales everything a mission learns about a bloodline (0..100 each), so
 *  that a focused player with good coverage finds a lair in about three
 *  months (all six in about a year needs coverage everywhere). */
export const MISSION_INTEL_RATE = 1.5;

/** Taking one alive from a won strike: a helicopter lifts out whoever is taken;
 *  a jet team has to carry them to extraction. Vampire remains come back only
 *  by helicopter (a jet team burns the bodies on site). */
export const CAPTURE_CHANCE = {
  helicopter: { vampire: 0.3, thrall: 0.5 },
  carried: { vampire: 0.1, thrall: 0.25 },
} as const;

/** A helicopter waits on the landing zone, in reach of a fight: the chance it is
 *  destroyed when the team loses a fight, or wins one; the secrecy a burning
 *  helicopter costs. Jets wait at an airfield and are never at risk. */
export const HELICOPTER_LOSS = { lost: 0.35, won: 0.05, secrecy: 1.5 } as const;
/** A revealed site stays put this many days (min, max) before the bloodline moves it. */
export const SITE_LIFETIME_DAYS = [10, 16] as const;

export const SITE_KINDS: Record<SiteKind, { name: string; thralls: number; vampires: number; weight: number; description: string }> = {
  nest: { name: "Nest", thralls: 3, vampires: 1, weight: 0.6, description: "A fledgling and its keepers: a flat, a basement, a lock-up." },
  den: { name: "Den", thralls: 4, vampires: 2, weight: 0.3, description: "A working site of the bloodline: feeding, storage, a few of them by day." },
  haven: { name: "Haven", thralls: 5, vampires: 3, weight: 0.1, description: "Where an elder sleeps. Guarded, and worth it." },
  // Never revealed by chance: intel at 100 finds it (sim/bloodlines.ts).
  lair: { name: "Lair", thralls: 14, vampires: 6, weight: 0, description: "The bloodline's heart: its eldest, its guard, its sigil. Burn it and the line dies." },
};

/** The bloodline's money a won strike seizes, by site (docs/WEB_PORT.md 3.5: spoils fund the hostage years). */
export const SPOILS: Record<SiteKind, [number, number]> = {
  nest: [70_000, 130_000],
  den: [150_000, 250_000],
  haven: [250_000, 350_000],
  lair: [1_500_000, 2_000_000],
};
/** Share of the spoils a team carries out without a helicopter. */
export const SPOILS_CARRIED = 0.5;

const ceilHour = (t: number) => Math.ceil(t / HOUR) * HOUR;
/** A bloodline's name for use mid-sentence ("the Carcassonne Perfecti"). */
const bloodlineName = (id: string) => (BLOODLINES.find((b) => b.id === id)?.name ?? "an unknown bloodline").replace(/^The /, "the ");
const regionName = (id: string) => regionById(id)?.name ?? id;

/** Vampires escalate as secrecy falls and the war goes on. */
export function escalation(s: GameState): number {
  return 1 + ((80 - Math.min(80, s.secrecy)) / 80) * 0.6 + s.monthIndex * 0.04;
}

function scaled(s: GameState, t: Threat): Threat {
  const e = escalation(s);
  const sc = (n: number) => (n > 0 ? Math.max(1, Math.round(n * e)) : 0);
  return { thralls: sc(t.thralls), vampires: sc(t.vampires) };
}

/** Hours until a given local solar hour at a longitude (0 if it is that hour now). */
export function hoursUntilLocal(time: number, lon: number, hour: number): number {
  const utc = (time % DAY) / HOUR;
  const local = (((utc + lon / 15) % 24) + 24) % 24;
  return Math.ceil((((hour - local) % 24) + 24) % 24);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface DispatchPlan {
  target: { kind: "lead" | "site"; id: string };
  baseId: string;
  /** One of the base's aircraft, or CHARTER.id for a chartered jet. */
  aircraftId: string;
  /** More of the base's own aircraft, flying with the first: more seats, more room for the haul. */
  escorts?: string[];
  agentIds: string[];
  kit: KitId;
}

export interface TargetInfo {
  pos: LatLon;
  title: string;
  city: string;
  regionId: string;
  bloodline: string;
  leadKind: LeadKind | null;
  intel: number;
  expiresAt: number;
  missionId: string | null;
  who?: string;
  asset?: AssetKind;
  whoFemale?: boolean;
}

export function targetInfo(s: GameState, t: DispatchPlan["target"]): TargetInfo | null {
  if (t.kind === "lead") {
    const l = s.leads.find((x) => x.id === t.id);
    if (!l) return null;
    const op = s.operations.find((o) => o.id === l.opId);
    return {
      pos: l.pos, title: l.title, city: l.city, regionId: l.regionId, bloodline: op?.bloodline ?? ownerOf(l.regionId) ?? BLOODLINES[0]!.id,
      leadKind: l.kind, intel: l.intel, expiresAt: l.expiresAt, missionId: l.missionId ?? null,
      ...(l.asset ? { who: l.who, asset: l.asset, ...(l.whoFemale !== undefined ? { whoFemale: l.whoFemale } : {}) } : {}),
    };
  }
  const site = s.sites.find((x) => x.id === t.id);
  if (!site) return null;
  return {
    pos: site.pos, title: siteTitle(site), city: site.city, regionId: site.regionId, bloodline: site.bloodline,
    leadKind: null, intel: 0.6, expiresAt: site.expiresAt, missionId: site.missionId,
  };
}

export const siteTitle = (site: Site) => `${SITE_KINDS[site.kind].name} of the ${BLOODLINES.find((b) => b.id === site.bloodline)?.short ?? "?"}, ${site.city}`;

export function flightHours(distance: number, aircraftKind: keyof typeof AIRCRAFT): number {
  return distance / AIRCRAFT[aircraftKind].speedKn;
}

/** A hired flight (charter or airline), not one of our aircraft. */
export const isHired = (aircraftId: string) => !!hiredFlight(aircraftId);

/** What carried a mission: an aircraft's name, or "Chartered jet" / "Commercial flight". */
export function craftName(s: GameState, aircraftId: string): string {
  return hiredFlight(aircraftId)?.name ?? s.aircraft.find((a) => a.id === aircraftId)?.name ?? "The team";
}
/** What carries a mission, escorts included: "CHERUB-1 and CHERUB-2". */
export function missionCraftName(s: GameState, m: Pick<Mission, "aircraftId" | "escorts">): string {
  const own = missionCraft(s, m);
  return own.length > 1 ? own.map((a) => a.name).join(" and ") : craftName(s, m.aircraftId);
}
/** The mission (if any) an aircraft is flying, as the first aircraft or an escort. */
export const missionOf = (s: GameState, aircraftId: string) =>
  s.missions.find((m) => m.aircraftId === aircraftId || m.escorts?.includes(aircraftId) || m.wings?.some((w) => w.aircraftId === aircraftId || w.escorts?.includes(aircraftId)));

/** Flight time for a mission's aircraft (or hired flight) over a distance. */
function legHours(s: GameState, aircraftId: string, distance: number): number | null {
  const hired = hiredFlight(aircraftId);
  if (hired) return distance / hired.speedKn;
  const air = s.aircraft.find((a) => a.id === aircraftId);
  return air ? flightHours(distance, air.kind) : null;
}

/** What a deployment costs: secrecy (noise), money (fuel, crews), and when it arrives. */
export function dispatchCost(s: GameState, plan: DispatchPlan) {
  const target = targetInfo(s, plan.target);
  const base = s.installations.find((i) => i.id === plan.baseId);
  const hired = hiredFlight(plan.aircraftId);
  const air = s.aircraft.find((a) => a.id === plan.aircraftId);
  if (!target || !base || (!air && !hired)) return null;
  const kit = KIT[plan.kit];
  const n = plan.agentIds.length;
  // Our own aircraft may have to hop through refuelling stations. With escorts, the slowest sets the pace.
  const flights = (hired ? [] : [air!, ...escortsOf(s, plan)]).map((a) => ({ a, route: planRoute(s, base.pos, target.pos, a.kind) }));
  const slowest = flights.reduce<(typeof flights)[number] | null>((w, f) => (!w || (f.route?.hours ?? Infinity) > (w.route?.hours ?? Infinity) ? f : w), null);
  const route = slowest?.route ?? null;
  const distance = route?.distance ?? distanceNm(base.pos, target.pos);
  const noise = hired ? hired.noise : flights.reduce((t, f) => t + AIRCRAFT[f.a.kind].noise, 0);
  // One or two people in street clothes travel as passengers: no one notices the aircraft.
  const airNoise = plan.kit === "civilian" && n <= 2 && flights.length <= 1 ? 0 : noise;
  const secrecy = n ? Math.round((kit.noiseBase + kit.noisePerAgent * (n - 1) + airNoise) * 10) / 10 : 0;
  // Hired flights round to $500 (an airline ticket is cheap); our own to $1k.
  const money = hired
    ? Math.round((hired.fee + 2 * distance * hired.costPerNm) / 500) * 500
    : Math.round(flights.reduce((t, f) => t + 2 * (f.route?.distance ?? distance) * AIRCRAFT[f.a.kind].costPerNm, 0) / 1000) * 1000;
  const hours = route?.hours ?? legHours(s, plan.aircraftId, distance)!;
  const arriveAt = ceilHour(s.time + ((hired ? hired.prepHours : PREP_HOURS) + hours) * HOUR);
  return { secrecy, money, distance, hours, arriveAt, route, slowestKind: slowest?.a.kind ?? null, lateBy: Math.max(0, arriveAt - target.expiresAt) };
}

/** A plan's (or mission's) escorting aircraft that still exist. */
export const escortsOf = (s: GameState, x: { escorts?: string[] }) =>
  (x.escorts ?? []).map((id) => s.aircraft.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
/** Every one of our aircraft on a mission: the first, then the escorts. */
export const missionCraft = (s: GameState, m: Pick<Mission, "aircraftId" | "escorts"> & { wings?: Wing[] }): Aircraft[] =>
  [s.aircraft.find((a) => a.id === m.aircraftId), ...escortsOf(s, m), ...(m.wings ?? []).filter((w) => w.landed).flatMap((w) => missionCraft(s, w))]
    .filter((a): a is NonNullable<typeof a> => !!a);
/** A mission a team can still join: on its way, or on the ground and not yet started. */
export const joinable = (m: Mission) => m.phase === "outbound" || (m.phase === "on-site" && !m.option && !m.battle && !m.haul);
/** The mission (if any) an agent is on, flying with a wing included. */
export const missionOfAgent = (s: GameState, agentId: string) =>
  s.missions.find((m) => m.agentIds.includes(agentId) || m.wings?.some((w) => w.agentIds.includes(agentId)));
/** Seats on a plan's aircraft together (hired flights have their own). */
export function planSeats(s: GameState, plan: DispatchPlan): number {
  const hired = hiredFlight(plan.aircraftId);
  if (hired) return hired.seats;
  return missionCraft(s, plan).reduce((t, a) => t + capacityOf(a.kind), 0);
}

/** Fit and at home: who a team is made of by default (and by the bot). */
export const availableAgents = (s: GameState, baseId: string) =>
  s.agents.filter((a) => a.baseId === baseId && !a.deployed && !isWounded(s, a));
/** Everyone at home, the wounded too: the player may send them, with the HP they have left. */
export const deployableAgents = (s: GameState, baseId: string) =>
  s.agents.filter((a) => a.baseId === baseId && !a.deployed && a.hp > 0);
export const availableAircraft = (s: GameState, baseId: string) =>
  s.aircraft.filter((a) => a.baseId === baseId && !a.deployed);

export function dispatchBlocker(s: GameState, plan: DispatchPlan): string | null {
  if (s.gameOver) return "The campaign is over.";
  const target = targetInfo(s, plan.target);
  if (!target) return plan.target.kind === "lead" ? "That lead has gone cold." : "That site is gone.";
  const joining = target.missionId ? s.missions.find((x) => x.id === target.missionId) : undefined;
  if (target.missionId && (!joining || !joinable(joining))) return "A team is already on it.";
  if (joining) {
    if (isHired(plan.aircraftId)) return "Only our own aircraft can join a team already out.";
    if (plan.kit !== joining.kit) return `Joining teams wear the same kit: ${KIT[joining.kit].name.toLowerCase()}.`;
  }
  const closed = accessBlocker(s, target.regionId);
  if (closed) return closed;
  const base = s.installations.find((i) => i.id === plan.baseId && i.kind === "base" && i.readyAt <= s.time);
  if (!base) return "Choose an operational base.";
  const hired = hiredFlight(plan.aircraftId);
  if (hired) {
    if (!hired.kits.includes(plan.kit))
      return hired.id === "commercial" ? "Airport security: civilian clothes only, no weapons." : "Tactical kit doesn't get through a charter terminal.";
    if (plan.agentIds.length > hired.seats) return `A ${hired.name.toLowerCase()} takes ${hired.seats === 1 ? "one agent" : `${hired.seats} agents`}.`;
  } else {
    const air = s.aircraft.find((a) => a.id === plan.aircraftId);
    if (!air || air.baseId !== base.id) return "Choose an aircraft at that base.";
    if (air.deployed) return `${air.name} is already flying.`;
    if (!planRoute(s, base.pos, target.pos, air.kind))
      return `${air.name} can't reach ${target.city} (${Math.round(distanceNm(base.pos, target.pos))} nm), even by refuelling.`;
    const escorts = plan.escorts ?? [];
    if (new Set([plan.aircraftId, ...escorts]).size !== escorts.length + 1) return "An aircraft is chosen twice.";
    for (const id of escorts) {
      const e = s.aircraft.find((a) => a.id === id);
      if (!e || e.baseId !== base.id) return "Choose escorts at that base.";
      if (e.deployed) return `${e.name} is already flying.`;
      if (!planRoute(s, base.pos, target.pos, e.kind)) return `${e.name} can't reach ${target.city}.`;
    }
    const seats = planSeats(s, plan);
    if (plan.agentIds.length > seats) return escorts.length ? `The aircraft seat ${seats} together.` : `${air.name} seats ${seats}.`;
  }
  if (!plan.agentIds.length) return "Choose at least one agent.";
  const ready = new Set(deployableAgents(s, base.id).map((a) => a.id));
  for (const id of plan.agentIds) if (!ready.has(id)) return "One of those agents isn't available.";
  const cost = dispatchCost(s, plan)!;
  if (s.funds < cost.money) return "Not enough funds for the flight.";
  return null;
}

export function dispatch(s: GameState, plan: DispatchPlan): string | null {
  const why = dispatchBlocker(s, plan);
  if (why) return why;
  const target = targetInfo(s, plan.target)!;
  const base = s.installations.find((i) => i.id === plan.baseId)!;
  const hired = hiredFlight(plan.aircraftId);
  const air = hired ? null : s.aircraft.find((a) => a.id === plan.aircraftId)!;
  const cost = dispatchCost(s, plan)!;
  const joining = target.missionId ? s.missions.find((x) => x.id === target.missionId) : undefined;
  if (joining && air) {
    const w: Wing = {
      id: `wing-${s.nextId++}`,
      aircraftId: air.id,
      ...(plan.escorts?.length ? { escorts: [...plan.escorts] } : {}),
      baseId: base.id,
      agentIds: [...plan.agentIds],
      from: { ...base.pos },
      departAt: s.time + PREP_HOURS * HOUR,
      arriveAt: cost.arriveAt,
      ...(cost.route?.stops.length ? { legs: routeLegs(cost.route, base.pos, target.pos, cost.slowestKind ?? air.kind, s.time + PREP_HOURS * HOUR, cost.arriveAt) } : {}),
      landed: false,
    };
    (joining.wings ??= []).push(w);
    for (const a of missionCraft(s, w)) a.deployed = true;
    for (const a of s.agents) if (w.agentIds.includes(a.id)) a.deployed = true;
    s.funds -= cost.money;
    addLog(s, `${missionCraft(s, w).map((a) => a.name).join(" and ")} ${w.escorts?.length ? "leave" : "leaves"} ${base.name} to join the team in ${target.city}, ${w.agentIds.length} aboard.`);
    changeSecrecy(s, -cost.secrecy, `a team is seen moving toward ${target.city}`, target);
    return null;
  }
  const m: Mission = {
    id: `mission-${s.nextId++}`,
    target: { ...plan.target },
    baseId: base.id,
    aircraftId: plan.aircraftId,
    ...(!hired && plan.escorts?.length ? { escorts: [...plan.escorts] } : {}),
    agentIds: [...plan.agentIds],
    kit: plan.kit,
    title: target.title,
    city: target.city,
    regionId: target.regionId,
    pos: { ...target.pos },
    bloodline: target.bloodline,
    leadKind: target.leadKind,
    ...(target.asset ? { who: target.who, asset: target.asset, ...(target.whoFemale !== undefined ? { whoFemale: target.whoFemale } : {}) } : {}),
    intel: target.intel,
    from: { ...base.pos },
    departAt: s.time + (hired ? hired.prepHours : PREP_HOURS) * HOUR,
    arriveAt: cost.arriveAt,
    phase: "outbound",
    decision: null,
    option: null,
    workUntil: 0,
    returnStart: 0,
    returnAt: 0,
    ...(air && cost.route?.stops.length ? { legs: routeLegs(cost.route, base.pos, target.pos, cost.slowestKind ?? air.kind, s.time + PREP_HOURS * HOUR, cost.arriveAt) } : {}),
  };
  s.missions.push(m);
  for (const a of missionCraft(s, m)) a.deployed = true;
  for (const a of s.agents) if (m.agentIds.includes(a.id)) a.deployed = true;
  if (plan.target.kind === "lead") s.leads.find((l) => l.id === plan.target.id)!.missionId = m.id;
  else s.sites.find((x) => x.id === plan.target.id)!.missionId = m.id;
  s.funds -= cost.money;
  if (air) addLog(s, `${missionCraft(s, m).map((a) => a.name).join(" and ")} ${m.escorts?.length ? "leave" : "leaves"} ${base.name} for ${target.city} with ${m.agentIds.length} aboard.`);
  else {
    const names = s.agents.filter((x) => m.agentIds.includes(x.id)).map((a) => `${a.sister ? "Sr." : "Br."} ${a.name}`);
    const who = names.length ? names.join(" and ") : "An agent";
    addLog(s, hired?.id === "commercial" ? `${who} flies commercial from ${base.name} to ${target.city}.` : `${who} board${names.length > 1 ? "" : "s"} a chartered jet at ${base.name} for ${target.city}.`);
  }
  changeSecrecy(s, -cost.secrecy, `a team is seen moving toward ${target.city}`, target);
  return null;
}

// ---------------------------------------------------------------------------
// Plays: what a team can do on arrival, by lead kind
// ---------------------------------------------------------------------------

type Result = "success" | "partial" | "fail" | "abort";
type Weights = Partial<Record<StatId, number>>;

interface Ctx {
  s: GameState;
  m: Mission;
  r: Rng;
  agents: Agent[];
  lead: Lead | null;
  site: Site | null;
  text: string[];
  secrecy: number;
  support: number;
  intel: number;
  fought: FightResult | null;
  used: Set<StatId>;
  revealed: Site | null;
  /** Someone taken alive, to hold in containment if there's a cell. */
  captive: "thrall" | "vampire" | null;
  /** Vampire remains recovered (only a helicopter lifts bodies out). */
  remains: number;
  /** Agents taken by the other side (a double's trap): lost, like the dead. */
  lost: Set<string>;
  /** The bloodline's money seized on a won strike (before what the aircraft can carry). */
  spoils: number;
  /** A won strike on a site (for the region's pledge and the artifact roll). */
  burned: SiteKind | null;
  /** How a fight is settled: the auto-combat; a probe that stops at the first fight; or a battle the player fought. */
  mode: "auto" | "probe" | TacticalOutcome;
}

/**
 * The tactical layer (docs/WEB_PORT.md 3.11, T4). When it's on, a play that
 * comes to a fight stops there: the mission holds a PendingBattle and posts
 * a "battle" event. The player commands the fight, or auto-resolves it; then
 * the play is run again from the same random state, with the fight's result
 * in place of the auto-combat, so the rest (debrief, intel, captives) follows
 * as before. Off in tests and the batch simulator.
 */
export const tactical = { on: false };

/** What a fought battle hands back to the mission. */
export interface TacticalOutcome {
  won: boolean;
  /** Turns it took. */
  turns: number;
  /** Agents killed. */
  dead: string[];
  /** Health left, as a share of each surviving agent's full health. */
  health: Record<string, number>;
  thrallsKilled: number;
  /** Vampires destroyed (finished, burned). */
  vampiresKilled: number;
  /** Vampires taken in torpor. */
  captured: number;
  /** The helicopter was destroyed on its pad. */
  craftLost: boolean;
  /** Share of the site's loot carried out (null: there was none). */
  lootShare: number | null;
  /** A rescue: did the prisoner get out? */
  hostage: "saved" | "lost" | null;
  /** What each surviving agent carried out (picked up, used up, rearranged). */
  gear?: Record<string, Gear>;
  /** Our kit left on the ground, gathered up after a win (to the armoury). */
  recovered?: ItemId[];
}

/** A rescue's prisoner, if the player fought it: true saved, false lost, null (auto-combat) unknown. */
const prisonerSaved = (c: Ctx): boolean | null =>
  typeof c.mode === "object" && c.mode.hostage ? c.mode.hostage === "saved" : null;

/** Thrown by a probe at the first fight: what the fight would be. */
class BattleNeeded {
  constructor(readonly threat: Threat, readonly advantage: number) {}
}

/** A fight: the auto-combat, or the battle the player fought. */
function settle(c: Ctx, threat: Threat, advantage: number): FightResult {
  if (c.mode === "probe") throw new BattleNeeded(threat, advantage);
  if (c.mode === "auto") return fight(c.r, c.agents, c.m.kit, threat, advantage, combatMods(c.s, c.m.kit));
  const o = c.mode;
  return {
    won: o.won, rounds: Math.min(10, Math.ceil(o.turns * 0.7)), dead: o.dead,
    wounded: Object.entries(o.health).filter(([, h]) => h < 1).map(([id]) => id),
    thrallsKilled: o.thrallsKilled, vampiresKilled: o.vampiresKilled,
  };
}

interface Play {
  id: string;
  label: string;
  detail: string;
  /** Only offered when the team noticed something. */
  whenWarned?: boolean;
  /** Hours on site before the outcome (a stakeout, waiting for daylight). */
  hours?: (s: GameState, m: Mission) => number;
  /** The analysts' estimate of success (0..1), from what the player can see. */
  odds?: (s: GameState, m: Mission, agents: Agent[]) => number;
  run(c: Ctx): Result;
}

/** Chance of a skill check passing. Intel helps. */
function checkChance(agents: Agent[], kit: KitId, intel: number, w: Weights, difficulty: number) {
  let skill = 0;
  for (const [stat, weight] of Object.entries(w)) skill += weight * teamSkill(agents, stat as StatId, kit);
  return Math.min(0.95, Math.max(0.05, 0.5 + (skill - difficulty) / 50 + (intel - 0.5) * 0.3));
}

/** A skill check: success, partial (roughly half of the misses) or fail. */
function check(c: Ctx, w: Weights, difficulty: number): Exclude<Result, "abort"> {
  for (const k of Object.keys(w)) c.used.add(k as StatId);
  const p = checkChance(c.agents, c.m.kit, c.m.intel, w, difficulty);
  const roll = c.r.next();
  return roll < p ? "success" : roll < p + (1 - p) * 0.5 ? "partial" : "fail";
}

const odds = (w: Weights, difficulty: number) => (_s: GameState, m: Mission, agents: Agent[]) =>
  checkChance(agents, m.kit, m.intel, w, difficulty);

/** A fight. Gunfire is loud; how loud depends on how long it lasts. */
function brawl(c: Ctx, threat: Threat, advantage: number): boolean {
  const t = scaled(c.s, threat);
  const res = settle(c, t, advantage);
  c.fought = res;
  c.used.add("combat");
  if (t.vampires) c.used.add("faith");
  c.secrecy -= 0.5 + res.rounds * 0.25;
  const foes = `${t.thralls} thrall${t.thralls === 1 ? "" : "s"}${t.vampires ? ` and ${t.vampires === 1 ? "one of them" : `${t.vampires} of them`}` : ""}`;
  c.text.push(
    res.won
      ? `The team fought ${foes} and held the field${res.vampiresKilled ? `. Fire finished what the bullets started` : ""}.`
      : `The team ran into ${foes} and had to break off.`,
  );
  return res.won;
}

const fightOdds = (threat: Threat, advantage: number) => (s: GameState, m: Mission, agents: Agent[]) =>
  winChance(agents, m.kit, scaled(s, threat), advantage, m.agentIds.length + Math.round(m.arriveAt / HOUR), combatMods(s, m.kit));

/** A site near the lead, if the thread leads anywhere. */
function reveal(c: Ctx, chance: number) {
  if (c.revealed || !c.r.chance(chance)) return;
  const { s, m, r } = c;
  const kinds = Object.entries(SITE_KINDS) as [SiteKind, (typeof SITE_KINDS)[SiteKind]][];
  let x = r.next() * kinds.reduce((a, [, k]) => a + k.weight, 0);
  let kind: SiteKind = "nest";
  for (const [id, k] of kinds) if ((x -= k.weight) <= 0) { kind = id; break; }
  const t = scaled(s, SITE_KINDS[kind]);
  const site: Site = {
    id: `site-${s.nextId++}`,
    bloodline: m.bloodline,
    kind,
    regionId: m.regionId,
    city: m.city,
    pos: { lat: m.pos.lat + r.real(-0.12, 0.12), lon: m.pos.lon + r.real(-0.12, 0.12) },
    revealedAt: s.time,
    expiresAt: s.time + r.real(SITE_LIFETIME_DAYS[0], SITE_LIFETIME_DAYS[1]) * DAY,
    thralls: t.thralls,
    vampires: t.vampires,
    missionId: null,
  };
  s.sites.push(site);
  c.revealed = site;
  c.intel += 6;
  c.text.push(`It leads somewhere: a ${SITE_KINDS[kind].name.toLowerCase()} of ${bloodlineName(m.bloodline)} in ${m.city}. It won't stay there long.`);
}

/** Questioning a captive. */
function interrogate(c: Ctx, bonus = 0) {
  const res = check(c, { insight: 1 }, 40 - bonus);
  if (res === "success") {
    c.intel += 8;
    c.text.push("In the room, it all came out: names, an address, the hours they keep.");
    reveal(c, 0.65);
  } else if (res === "partial") {
    c.intel += 4;
    c.text.push("Under questioning there was fear and fragments, but one useful address among them.");
    reveal(c, 0.3);
  } else {
    c.text.push("Questioning got nowhere. Whatever hold they have on him is stronger than fear of us.");
  }
  c.captive = "thrall"; // kept for longer questioning, if there's a cell
}

/**
 * A double agent springs its trap (docs/WEB_PORT.md 3.8): the meeting is
 * compromised. Unarmed, the agent at the table is taken (unless a ratline in
 * the region gets them out); armed, the team fights its way out, an escape
 * mission (auto-resolved until the tactical layer), with better odds if a
 * ratline is waiting. Winning takes the double alive.
 */
function compromised(c: Ctx, advantage: number, bonus = 5): Result {
  const ratline = hasAsset(c.s, c.m.regionId, "ratline");
  if (c.m.kit === "civilian") {
    const victim = [...c.agents].sort((a, b) => b.stats.insight - a.stats.insight)[0];
    c.secrecy -= 2;
    if (!victim) return "fail";
    const who = `${victim.sister ? "Sr." : "Br."} ${victim.name}`;
    if (ratline && c.r.chance(RATLINE_ESCAPE)) {
      c.s.funds -= RATLINE_USE_FEE;
      c.text.push(`It was a setup: the door opened behind ${who} and the room filled. ${who} went out through the kitchen and into our ratline, and was over the border by morning.`);
      return "fail";
    }
    c.lost.add(victim.id);
    c.text.push(`It was a setup. They were waiting, and ${who} was unarmed. They took ${victim.sister ? "her" : "him"} out between two of them. The rest of the team could only watch.`);
    return "fail";
  }
  c.text.push("It was a setup, but the team came armed. They fought their way out.");
  if (ratline) c.text.push("Our ratline had a car waiting two streets over.");
  const won = brawl(c, { thralls: 3, vampires: 1 }, advantage + (ratline ? RATLINE_FIGHT_BONUS : 0));
  // (Paid after the fight: a play must change nothing in the campaign before its fight, so it can be replayed.)
  if (ratline) c.s.funds -= RATLINE_USE_FEE;
  if (won) {
    c.text.push("We took the 'source' alive, which they did not plan for.");
    interrogate(c, bonus);
    return "success";
  }
  return "fail";
}

/** Recruiting a source as an asset: a tradecraft pitch. */
const RECRUIT_DIFFICULTY = 45;

const ABORT: Play = {
  id: "abort",
  label: "Abort",
  detail: "Pull the team out. Nothing gained, nothing risked. The lead stays open, if time allows.",
  run: () => "abort",
};

const PLAYS: Record<Exclude<LeadKind, "double"> | "site", Play[]> = {
  capture: [
    {
      id: "street",
      label: "Take him on the street",
      detail: "Fast and simple, if the street stays empty. Combat and tradecraft.",
      odds: odds({ combat: 0.5, tradecraft: 0.5 }, 45),
      run(c) {
        const res = check(c, { combat: 0.5, tradecraft: 0.5 }, 45);
        if (res === "fail") {
          c.secrecy -= 2;
          c.text.push("He saw them coming and ran, shouting. Lights went on up and down the street.");
          return "fail";
        }
        if (res === "partial") {
          c.secrecy -= 2;
          c.text.push("He was in the van inside a minute, but a passer-by filmed part of it.");
        } else c.text.push("He was in the van before he finished his sentence. Nobody saw.");
        interrogate(c);
        return "success";
      },
    },
    {
      id: "follow",
      label: "Follow him home",
      detail: "Patient tradecraft: take him where nobody is watching. Takes the night.",
      hours: () => 8,
      odds: odds({ tradecraft: 0.7, insight: 0.3 }, 50),
      run(c) {
        const res = check(c, { tradecraft: 0.7, insight: 0.3 }, 50);
        if (res === "success") {
          c.text.push("They followed him to a flat on the edge of town and took him quietly at the door.");
          interrogate(c, 10);
          return "success";
        }
        if (res === "partial") {
          c.intel += 3;
          c.text.push("They lost him in the old town. His route, at least, tells us something.");
          return "partial";
        }
        c.text.push("He knew he was followed, and led them straight to his masters.");
        if (brawl(c, { thralls: 2, vampires: 1 }, -0.1)) {
          c.text.push("They took him anyway, and saw where he had been going.");
          reveal(c, 0.9);
          return "success";
        }
        return "fail";
      },
    },
    ABORT,
  ],

  source: [
    {
      id: "recruit",
      label: "Recruit them",
      detail: "Make the pitch: they work for us from now on, for a monthly fee. Tradecraft. Less to learn tonight.",
      odds: odds({ tradecraft: 1 }, RECRUIT_DIFFICULTY),
      run(c) {
        if (c.m.leadKind === "double") return compromised(c, -0.2);
        const res = check(c, { tradecraft: 1 }, RECRUIT_DIFFICULTY);
        if (res === "fail") {
          c.secrecy -= 1;
          c.text.push("The pitch went wrong: the source took it as a threat, and left. Who will they tell?");
          return "fail";
        }
        if (res === "partial") {
          c.intel += 3;
          c.text.push("The source talked, but wouldn't sign on. Not yet, they said; maybe not ever.");
          return "partial";
        }
        const kind = c.m.asset ?? "informant";
        const a = recruitAsset(c.s, kind, c.m.who ?? ASSET_KINDS[kind].roles[0]!, c.m.regionId, c.m.city, c.m.pos, c.m.whoFemale);
        c.intel += 2;
        c.text.push(`${a.name}, ${a.role}, is ours: ${ASSET_KINDS[kind].name.toLowerCase()} in ${c.m.city}, for $${a.monthly.toLocaleString("en-US")} a month. The team leaves a number, and goes home.`);
        return "success";
      },
    },
    {
      id: "meet",
      label: "Meet as arranged",
      detail: "A quiet table, a quiet conversation. Insight.",
      odds: odds({ insight: 1 }, 40),
      run(c) {
        if (c.m.leadKind === "double") return compromised(c, -0.2);
        const res = check(c, { insight: 1 }, 40);
        if (res === "success") {
          c.text.push("The source talked for two hours, and brought papers.");
          c.intel += 6;
          reveal(c, 0.55);
          return "success";
        }
        if (res === "partial") {
          c.intel += 3;
          c.text.push("The source was too frightened to say much, but promised to stay in touch.");
          return "partial";
        }
        c.secrecy -= 1;
        c.text.push("The source panicked halfway through and left. Who will they tell?");
        return "fail";
      },
    },
    {
      id: "watch",
      label: "Watch the meeting point first",
      detail: "Sweep the area for two hours before anyone sits down. Insight, to spot a setup. A nervous source may not wait.",
      hours: () => 2,
      odds: odds({ insight: 1 }, 40),
      run(c) {
        if (c.m.leadKind === "double") {
          // Spotting a double is a perception roll: Insight (docs/WEB_PORT.md 3.8).
          const res = check(c, { insight: 1 }, 45 - c.m.intel * 20);
          if (res === "success") {
            c.text.push("The sweep found them: a van, two watchers, a back door propped open. It was a trap.");
            if (c.m.kit === "civilian") {
              c.text.push("Unarmed, the team did the only sensible thing: walked away and never sat down.");
              return "partial";
            }
            c.text.push("The team was armed, and sprang it first.");
            if (brawl(c, { thralls: 3, vampires: 1 }, 0.25)) {
              c.text.push("The 'source' is in our custody now.");
              interrogate(c, 10);
              return "success";
            }
            return "fail";
          }
          c.text.push("The sweep turned up nothing.");
          return compromised(c, -0.1, 0);
        }
        c.used.add("insight");
        if (c.r.chance(0.15)) {
          c.text.push("The source saw us watching, lost their nerve and left.");
          return "partial";
        }
        const res = check(c, { insight: 1 }, 35);
        if (res === "fail") {
          c.text.push("The area was clean, but the meeting went badly: the source wanted guarantees we could not give.");
          return "partial";
        }
        c.text.push("The area was clean. The source, reassured, told us everything they knew.");
        c.intel += 6;
        reveal(c, res === "success" ? 0.6 : 0.3);
        return "success";
      },
    },
    {
      id: "snatch",
      label: "Grab the source and go",
      detail: "Assume the worst and take the source before anyone else moves. Combat and tradecraft.",
      whenWarned: true,
      odds: odds({ combat: 0.5, tradecraft: 0.5 }, 35),
      run(c) {
        if (c.m.leadKind === "double") {
          c.text.push("We moved first. The watchers outside were theirs.");
          return compromised(c, 0.3, 15);
        }
        check(c, { combat: 0.5, tradecraft: 0.5 }, 35);
        c.secrecy -= 2;
        c.support -= 0.3;
        c.intel += 3;
        c.text.push(
          "The source was exactly who they said they were: frightened, honest, and now bundled into a van by the people they came to for help. They will talk to us. They will never trust the Church again, and nor will their family.",
        );
        return "partial";
      },
    },
    ABORT,
  ],

  surveillance: [
    {
      id: "stakeout",
      label: "Watch it for three nights",
      detail: "Shifts from a rented flat across the street. Tradecraft. Three days.",
      hours: () => 72,
      odds: odds({ tradecraft: 0.8, insight: 0.2 }, 40),
      run(c) {
        const res = check(c, { tradecraft: 0.8, insight: 0.2 }, 40);
        if (res === "success") {
          c.intel += 6;
          c.text.push("Three nights of photographs: faces, plates, and where the cars went afterwards.");
          reveal(c, 0.85);
          return "success";
        }
        if (res === "partial") {
          c.intel += 3;
          c.text.push("They kept odd hours and the photographs are poor, but it's something.");
          reveal(c, 0.3);
          return "partial";
        }
        c.secrecy -= 2;
        c.text.push("On the second night the curtains across the street twitched once, and the building went dark for good. They made us.");
        return "fail";
      },
    },
    {
      id: "breakin",
      label: "Go in tonight",
      detail: "Pick the lock at 3 a.m., photograph everything, leave. Tradecraft and nerve.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 3),
      odds: odds({ tradecraft: 0.6, faith: 0.4 }, 50),
      run(c) {
        const res = check(c, { tradecraft: 0.6, faith: 0.4 }, 50);
        if (res === "success") {
          c.intel += 6;
          c.text.push("In and out in forty minutes, with a ledger, two phones photographed and a list of addresses.");
          reveal(c, 0.6);
          return "success";
        }
        if (res === "partial") {
          c.text.push("Inside there was little worth the risk: empty rooms, scrubbed clean.");
          reveal(c, 0.2);
          return "partial";
        }
        c.text.push("The building was not empty.");
        if (brawl(c, { thralls: 2, vampires: 0 }, 0)) {
          c.secrecy -= 1;
          reveal(c, 0.5);
          return "success";
        }
        return "fail";
      },
    },
    ABORT,
  ],

  recovery: [
    {
      id: "talk",
      label: "Talk your way in",
      detail: "Papers, a collar, a plausible story. Insight. Civilian clothes help; tactical kit doesn't.",
      odds: odds({ insight: 0.7, tradecraft: 0.3 }, 45),
      run(c) {
        const res = check(c, { insight: 0.7, tradecraft: 0.3 }, 45);
        if (res === "success") {
          c.secrecy += 2;
          c.intel += 6;
          c.text.push("The duty officer signed it over to 'the diocese' without a second look. It's in our hands, and nowhere else.");
          reveal(c, 0.25);
          return "success";
        }
        if (res === "partial") {
          c.secrecy += 0.5;
          c.intel += 3;
          c.text.push("We got most of it. Copies may exist.");
          return "partial";
        }
        c.secrecy -= 3;
        c.text.push("Questions were asked, phone calls made, and the team left empty-handed with a description of their faces on file.");
        return "fail";
      },
    },
    {
      id: "night",
      label: "Go in after dark",
      detail: "In through the loading bay at 3 a.m. Tradecraft. Getting caught is worse.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 3),
      odds: odds({ tradecraft: 0.8, combat: 0.2 }, 45),
      run(c) {
        const res = check(c, { tradecraft: 0.8, combat: 0.2 }, 45);
        if (res === "success") {
          c.secrecy += 2;
          c.intel += 6;
          c.text.push("Gone before the morning shift, and so is the evidence. Nobody will know it ever existed.");
          reveal(c, 0.25);
          return "success";
        }
        if (res === "partial") {
          c.secrecy += 0.5;
          c.intel += 3;
          c.text.push("A guard came early. We got most of it out.");
          return "partial";
        }
        c.secrecy -= 4;
        c.text.push("An alarm, a chase through the car park, and a break-in at a police building for tomorrow's papers.");
        return "fail";
      },
    },
    ABORT,
  ],

  rescue: [
    {
      id: "now",
      label: "Go in now",
      detail: "Every hour counts. Expect thralls and at least one of them. Combat and faith.",
      odds: fightOdds({ thralls: 2, vampires: 1 }, 0),
      run(c) {
        if (brawl(c, { thralls: 2, vampires: 1 }, 0)) {
          reveal(c, 0.5);
          if (prisonerSaved(c) === false) {
            c.support -= 0.1;
            c.text.push("We took the place, but not in time for her.");
            return "partial";
          }
          c.support += 0.35;
          c.text.push("We got her out. Pale, cold and alive.");
          return "success";
        }
        c.secrecy -= 2;
        c.text.push("We could not reach her.");
        return "fail";
      },
    },
    {
      id: "daylight",
      label: "Wait for daylight",
      detail: "They sleep by day; their thralls don't. A safer fight, if she lasts that long.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 11),
      odds: fightOdds({ thralls: 2, vampires: 0 }, 0.1),
      run(c) {
        if (!brawl(c, { thralls: 2, vampires: 0 }, 0.1)) {
          c.text.push("We could not reach her.");
          return "fail";
        }
        reveal(c, 0.5);
        if (prisonerSaved(c) ?? c.r.chance(0.6)) {
          c.support += 0.35;
          c.text.push("She was still alive. Whoever kept her was asleep in the next room, and is not asleep any more.");
          return "success";
        }
        c.support -= 0.1;
        c.text.push("We were too late for her. We were not too late for the thing that did it.");
        return "partial";
      },
    },
    ABORT,
  ],

  site: [
    {
      id: "midday",
      label: "Strike at midday",
      detail: "They are in torpor; only their thralls stand guard. A daylight raid is hard to hide.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 12),
      odds: (s, m, agents) => {
        const site = s.sites.find((x) => x.id === m.target.id);
        return site ? siteOdds(s, m, agents, { thralls: site.thralls, vampires: Math.ceil(site.vampires * (site.kind === "lair" ? 0.67 : 0.4)) }, 0.15) : 0;
      },
      run(c) {
        const site = c.site!;
        c.secrecy -= 1.5;
        return strike(c, { thralls: site.thralls, vampires: Math.ceil(site.vampires * (site.kind === "lair" ? 0.67 : 0.4)) }, 0.15);
      },
    },
    {
      id: "night",
      label: "Strike at 3 a.m.",
      detail: "The streets are empty and they are awake. Tradecraft buys surprise.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 3),
      odds: (s, m, agents) => {
        const site = s.sites.find((x) => x.id === m.target.id);
        return site ? siteOdds(s, m, agents, { thralls: site.thralls, vampires: site.vampires }, nightAdvantage(agents, m.kit)) : 0;
      },
      run(c) {
        const site = c.site!;
        c.used.add("tradecraft");
        return strike(c, { thralls: site.thralls, vampires: site.vampires }, nightAdvantage(c.agents, c.m.kit));
      },
    },
    ABORT,
  ],
};

/** A site's numbers were scaled when it was revealed. */
const siteOdds = (s: GameState, m: Mission, agents: Agent[], threat: Threat, advantage: number) =>
  winChance(agents, m.kit, threat, advantage + (s.sites.find((x) => x.id === m.target.id)?.trapped ? TRAP_BONUS : 0), m.agentIds.length + Math.round(m.arriveAt / HOUR), combatMods(s, m.kit));

const nightAdvantage = (agents: Agent[], kit: KitId) =>
  Math.max(-0.1, Math.min(0.2, (teamSkill(agents, "tradecraft", kit) - 45) / 150));

/** A strike on a site. Threat is already scaled when the site was revealed. */
function strike(c: Ctx, threat: Threat, advantage: number): Result {
  if (c.site?.trapped) c.text.push("They were where our disinformation put them, and not expecting us.");
  const res = settle(c, threat, advantage + (c.site?.trapped ? TRAP_BONUS : 0));
  c.fought = res;
  c.used.add("combat");
  c.used.add("faith");
  c.secrecy -= 0.5 + res.rounds * 0.25;
  if (res.won && c.site?.kind === "lair") {
    c.support += 1;
    c.spoils = c.r.real(SPOILS.lair[0], SPOILS.lair[1]);
    c.burned = "lair";
    c.text.push(`The lair is burned out: ${res.thrallsKilled} of its guard dead, ${res.vampiresKilled} of them destroyed, the eldest among them. The sigil on the wall was smashed before the team withdrew.`);
    return "success";
  }
  if (!res.won && c.site?.kind === "lair") {
    c.text.push("The lair held. The team was thrown back with what it could carry. It will still be there, and it will be ready.");
    return "fail";
  }
  if (res.won) {
    c.support += 0.4;
    const k = c.site?.kind ?? "nest";
    if (k !== "lair") c.spoils = c.r.real(SPOILS[k][0], SPOILS[k][1]);
    c.burned = k;
    c.intel += 20;
    c.s.nextOperation[c.m.bloodline] = (c.s.nextOperation[c.m.bloodline] ?? c.s.time) + 3 * DAY;
    // What comes out with the team depends on what carries it.
    const byHeli = missionCraft(c.s, c.m).some((a) => a.kind === "helicopter");
    const odds = byHeli ? CAPTURE_CHANCE.helicopter : CAPTURE_CHANCE.carried;
    const taken = typeof c.mode === "object" ? c.mode.captured : 0;
    if (typeof c.mode === "object" ? taken > 0 : threat.vampires > 0 && c.r.chance(odds.vampire)) c.captive = "vampire";
    else if (c.r.chance(odds.thrall)) c.captive = "thrall";
    if (byHeli) c.remains = res.vampiresKilled;
    else if (res.vampiresKilled) c.text.push("With no way to lift the bodies out, the team burned them where they lay.");
    c.text.push(
      `The ${SITE_KINDS[c.site!.kind].name.toLowerCase()} is burned out: ${res.thrallsKilled} thralls dead, ${res.vampiresKilled} of them destroyed. What they kept there is ours now: phones, ledgers, a map with pins in it.`,
    );
    return "success";
  }
  c.text.push("The team was driven out. By morning the place will be empty, and they will know we are coming.");
  return "fail";
}

/** The plays on offer: the lead kind the player sees decides it, never the true kind. */
function playsFor(m: Mission): Play[] {
  if (m.target.kind === "site") return PLAYS.site;
  const shown = m.leadKind === "double" ? "source" : (m.leadKind ?? "source");
  return PLAYS[shown];
}

// ---------------------------------------------------------------------------
// Arrival
// ---------------------------------------------------------------------------

const SITUATIONS: Record<Exclude<LeadKind, "double">, string> = {
  capture: "The target is where the intercepts said he would be. He finishes at two and walks home alone.",
  source: "The source has agreed to meet at a café near the cathedral at nine.",
  surveillance: "The building is quiet. Lights on the top floor, blinds down, and a man smoking by the side door who never seems to leave.",
  recovery: "The material is still where it was. For now.",
  rescue: "The signal still pings from the same block every night. If she is alive, she is in there.",
};

/** Tells that a meeting is a trap, or look like one. */
const TELLS = [
  "A van has been parked across from the café for two hours. Nobody has got out.",
  "The source chose the table furthest from the windows, and keeps glancing at the kitchen door.",
  "Two men at the bar have nursed the same drinks since we arrived. Neither has touched his phone.",
  "The source's phone has been off since this morning. They say they lost the charger.",
  "The source asked, twice, how many of us would come.",
];

function oddsWord(p: number): DecisionOption["odds"] {
  return p >= 0.7 ? "good" : p >= 0.45 ? "fair" : "poor";
}

export const missionAgents = (s: GameState, m: Mission) => s.agents.filter((a) => m.agentIds.includes(a.id));

function makeDecision(s: GameState, m: Mission): Decision {
  const r = rng(s);
  const agents = missionAgents(s, m);
  let situation: string;
  let warning: string | null = null;
  if (m.target.kind === "site") {
    const site = s.sites.find((x) => x.id === m.target.id)!;
    situation = `${SITE_KINDS[site.kind].description} SIGINT counts about ${site.thralls} thralls and ${site.vampires === 1 ? "one of them" : `${site.vampires} of them`}.`;
  } else {
    const shown = m.leadKind === "double" ? "source" : (m.leadKind ?? "source");
    situation = SITUATIONS[shown];
    if (shown === "source") {
      // A double agent may give itself away to a sharp team; an honest source is sometimes just nervous.
      const insight = Math.max(...agents.map((a) => a.stats.insight));
      const p = m.leadKind === "double" ? 0.25 + m.intel * 0.35 + insight / 300 : 0.15;
      if (r.chance(p)) warning = r.pick(TELLS);
    }
  }
  return { situation, warning, options: decisionOptions(s, m, warning) };
}

/** The plays open to the team on the ground, and "wait" while another team is in the air. */
function decisionOptions(s: GameState, m: Mission, warning: string | null): DecisionOption[] {
  const agents = missionAgents(s, m);
  const options: DecisionOption[] = playsFor(m)
    .filter((p) => !p.whenWarned || warning)
    .map((p) => ({ id: p.id, label: p.label, detail: p.detail, odds: p.odds ? oddsWord(p.odds(s, m, agents)) : null }));
  const flying = (m.wings ?? []).filter((w) => !w.landed);
  if (flying.length) {
    const next = flying.reduce((a, b) => (a.arriveAt <= b.arriveAt ? a : b));
    const names = flying.flatMap((w) => missionCraft(s, w).map((a) => a.name)).join(", ");
    options.push({ id: "wait", label: `Wait for ${names}`, detail: `Hold on the ground until the next team lands (${Math.max(1, Math.round((next.arriveAt - s.time) / HOUR))} h). Nothing is lost by waiting while the target is there.`, odds: null });
  }
  return options;
}

/** New orders for a team on the ground: who is there has changed. The tell (if any) stays what it was. */
function refreshOrders(s: GameState, m: Mission) {
  const warning = m.decision?.warning ?? null;
  const base = m.decision?.situation ?? makeDecision(s, m).situation;
  m.decision = { situation: base, warning, options: decisionOptions(s, m, warning) };
  m.waiting = false;
  s.events = s.events.filter((e) => !(e.kind === "arrival" && e.refId === m.id));
  const landed = (m.wings ?? []).filter((w) => w.landed);
  postArrival(s, m, landed.at(-1)?.aircraftId ?? m.aircraftId);
}

/** How a team got in, for the arrival picture: our jet drops it in free fall, a helicopter
 *  sets down on a roof, a hired flight (charter or airline) lands at an airport. */
function arrivalScene(s: GameState, aircraftId: string): SceneId {
  if (hiredFlight(aircraftId)) return "passport";
  return s.aircraft.find((a) => a.id === aircraftId)?.kind === "jet" ? "freefall" : "rooftop";
}

/** "Brother Anselm, Sister Clare and 3 others" */
function teamNames(agents: Agent[]): string {
  const names = agents.map((a) => a.name);
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "The team");
}

/** The team is on the ground and waits for orders: who, where, how they got in. */
function postArrival(s: GameState, m: Mission, aircraftId: string) {
  const agents = missionAgents(s, m);
  post(s, {
    kind: "arrival", scene: arrivalScene(s, aircraftId), heading: "Begin mission?",
    title: `${teamNames(agents)} arrived in ${m.city}`,
    body: m.decision!.situation, regionId: m.regionId, pos: m.pos, refId: m.id,
  });
}

/** "Start mission" for a team holding on the ground: the orders again. */
export function startMission(s: GameState, missionId: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m || m.phase !== "on-site" || !m.waiting) return "That team is not waiting.";
  refreshOrders(s, m);
  return null;
}

function arrive(s: GameState, m: Mission) {
  const gone = m.target.kind === "lead" ? !s.leads.some((l) => l.id === m.target.id) : !s.sites.some((x) => x.id === m.target.id);
  if (gone) {
    post(s, {
      kind: "info",
      title: `Too late: ${m.city}`,
      body: m.target.kind === "lead"
        ? `By the time the team reached ${m.city}, the trail had gone cold. They are on their way home.`
        : `The team reached ${m.city} to find the place empty: they moved on. The team is on its way home.`,
      regionId: m.regionId,
      pos: m.pos,
      refId: m.id,
    });
    startReturn(s, m);
    return;
  }
  m.phase = "on-site";
  m.decision = makeDecision(s, m);
  postArrival(s, m, m.aircraftId);
}

/** The player's choice on arrival. Returns an error, or null. */
export function decide(s: GameState, missionId: string, optionId: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m || m.phase !== "on-site" || !m.decision) return "That team is not waiting for orders.";
  if (!m.decision.options.some((o) => o.id === optionId)) return "That is not an option here.";
  s.events = s.events.filter((e) => !(e.kind === "arrival" && e.refId === m.id));
  if (optionId === "wait") {
    m.waiting = true;
    addLog(s, `${m.city}: the team holds on the ground for the others.`);
    return null;
  }
  const play = playsFor(m).find((p) => p.id === optionId);
  if (!play) return "That is not an option here.";
  m.decision = null;
  m.waiting = false;
  recallWings(s, m); // the mission starts with whoever is on the ground
  const hours = play.hours?.(s, m) ?? 0;
  if (hours > 0) {
    m.option = optionId;
    m.workUntil = s.time + hours * HOUR;
    // The target holds still while the team works it.
    const until = m.workUntil + HOUR;
    const lead = s.leads.find((l) => l.id === m.target.id);
    if (lead) {
      lead.expiresAt = Math.max(lead.expiresAt, until);
      const op = s.operations.find((o) => o.id === lead.opId);
      if (op) op.endsAt = Math.max(op.endsAt, until);
    }
    const site = s.sites.find((x) => x.id === m.target.id);
    if (site) site.expiresAt = Math.max(site.expiresAt, until);
    addLog(s, `${m.city}: the team settles in (${hours} h).`);
    return null;
  }
  resolve(s, m, play);
  return null;
}

// ---------------------------------------------------------------------------
// Battles (the tactical layer)
// ---------------------------------------------------------------------------

/** What the team is walking into, for the battle event. */
function battleBrief(s: GameState, m: Mission): string {
  const b = m.battle!;
  const foes = `${b.thralls} thrall${b.thralls === 1 ? "" : "s"}${b.vampires ? ` and ${b.vampires === 1 ? "one of them" : `${b.vampires} of them`}` : ""}`;
  const where = b.site ? `The ${SITE_KINDS[b.site].name.toLowerCase()} in ${m.city}` : `In ${m.city}, it has come to a fight`;
  return `${where}: ${foes}. ${missionAgents(s, m).length} of ours on the ground. Take command, or leave it to the team.`;
}

/** The pending battle's play, for replay. */
function battlePlay(m: Mission): Play | undefined {
  return m.battle ? playsFor(m).find((p) => p.id === m.battle!.optionId) : undefined;
}

/** Let the team fight it out (the auto-combat), and carry on. */
export function autoResolveBattle(s: GameState, missionId: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  const play = m && battlePlay(m);
  if (!m || !play) return "No battle waiting there.";
  s.rng = m.battle!.rng;
  m.battle = undefined;
  s.events = s.events.filter((e) => !(e.kind === "battle" && e.refId === m.id));
  resolve(s, m, play, "auto");
  return null;
}

/** The player fought it: wounds and deaths as they fell, then the mission carries on with that result. */
export function finishBattle(s: GameState, missionId: string, outcome: TacticalOutcome): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  const play = m && battlePlay(m);
  if (!m || !play) return "No battle waiting there.";
  for (const a of missionAgents(s, m)) {
    if (outcome.dead.includes(a.id)) a.hp = 0;
    else a.hp = Math.max(1, Math.round(a.stats.vitality * (outcome.health[a.id] ?? 1)));
    // What they carried out comes home with them; what the kit left behind is still there.
    const fought = outcome.gear?.[a.id];
    if (fought && !outcome.dead.includes(a.id)) bringHome(s, a, m.kit, fought);
  }
  const home = s.installations.find((i) => i.id === missionAgents(s, m)[0]?.baseId);
  if (home) for (const x of outcome.recovered ?? []) addStock(home, x, 1);
  s.rng = m.battle!.rng;
  m.battle = undefined;
  s.events = s.events.filter((e) => !(e.kind === "battle" && e.refId === m.id));
  resolve(s, m, play, outcome);
  return null;
}

/** The auto-combat's odds for a waiting battle (for the event's buttons). */
export function battleOdds(s: GameState, m: Mission): number {
  const b = m.battle;
  if (!b) return 0;
  return winChance(missionAgents(s, m), m.kit, { thralls: b.thralls, vampires: b.vampires }, b.advantage, m.agentIds.length + Math.round(m.arriveAt / HOUR), combatMods(s, m.kit));
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const RESULT_WORDS: Record<Result, string> = { success: "Success", partial: "Partial success", fail: "Failure", abort: "Aborted" };

function resolve(s: GameState, m: Mission, play: Play, mode: Ctx["mode"] = tactical.on ? "probe" : "auto") {
  const rngBefore = s.rng;
  const r = rng(s);
  const c: Ctx = {
    s, m, r,
    agents: missionAgents(s, m),
    lead: m.target.kind === "lead" ? (s.leads.find((l) => l.id === m.target.id) ?? null) : null,
    site: m.target.kind === "site" ? (s.sites.find((x) => x.id === m.target.id) ?? null) : null,
    text: [], secrecy: 0, support: 0, intel: 0, fought: null, used: new Set(), revealed: null, captive: null, remains: 0, lost: new Set(), spoils: 0, burned: null,
    mode,
  };
  m.option = null;
  if (!c.lead && !c.site) {
    addLog(s, `${m.city}: nothing left to do. The team heads home.`);
    startReturn(s, m);
    return;
  }
  let result: Result;
  try {
    result = play.run(c);
  } catch (e) {
    if (!(e instanceof BattleNeeded)) throw e;
    // A fight: hold it for the player, and replay the play from here once it's settled.
    s.rng = rngBefore;
    m.battle = {
      optionId: play.id, rng: rngBefore, thralls: e.threat.thralls, vampires: e.threat.vampires, advantage: e.advantage,
      site: c.site?.kind ?? null,
      hostage: m.leadKind === "rescue",
    };
    post(s, {
      kind: "battle",
      title: `Contact: ${m.title}`,
      body: battleBrief(s, m),
      regionId: m.regionId,
      pos: m.pos,
      refId: m.id,
    });
    return;
  }

  // The lead or site.
  if (c.lead) {
    if (result === "abort") c.lead.missionId = null;
    else {
      s.leads = s.leads.filter((l) => l.id !== c.lead!.id);
      const op = s.operations.find((o) => o.id === c.lead!.opId);
      if (op) {
        if (result === "success") {
          s.operations = s.operations.filter((o) => o !== op);
          c.support += 0.15;
        } else op.handled = true;
      }
    }
  }
  if (c.site) {
    // A lair that holds stays where it is, waiting for the next assault.
    if (result === "abort" || (c.site.kind === "lair" && result !== "success")) c.site.missionId = null;
    else s.sites = s.sites.filter((x) => x !== c.site);
  }
  if (result === "success") c.intel += 6;
  else if (result === "partial") c.intel += 2;

  if (result === "abort") {
    addLog(s, `${m.city}: the team stands down and heads home.`);
    startReturn(s, m);
    return;
  }

  // A fight can reach a helicopter on the landing zone; each one there is at risk.
  // If none of ours is left, the team gets home on a hired flight.
  let lostCraft: string | null = null;
  const helis = c.fought ? missionCraft(s, m).filter((a) => a.kind === "helicopter") : [];
  const lostNames: string[] = [];
  for (const heli of helis) {
    const shotDown = typeof c.mode === "object" ? heli.id === m.aircraftId && c.mode.craftLost : r.chance(c.fought!.won ? HELICOPTER_LOSS.won : HELICOPTER_LOSS.lost);
    if (!shotDown) continue;
    s.aircraft = s.aircraft.filter((a) => a !== heli);
    c.secrecy -= HELICOPTER_LOSS.secrecy;
    lostNames.push(heli.name);
    c.text.push(`${heli.name} was caught on the landing zone and burned. The crew got clear.`);
    addLog(s, `${heli.name} lost in ${m.city}.`, "bad");
  }
  if (lostNames.length) {
    lostCraft = lostNames.join(" and ");
    pruneLost(s, m);
    if (!missionCraft(s, m).some((a) => a.kind === "helicopter")) c.remains = 0; // the bodies burned with them
  }

  // The haul rides home aboard, after the survivors: a captive first, then
  // the bodies (2 of capacity each). What doesn't fit is burned. A team on a
  // hired flight hands a captive over for the trip, as before.
  const home = homeBase(s, m);
  const held: string[] = [];
  const lostNow = new Set([...(c.fought?.dead ?? []), ...c.lost]);
  const hold = haulSeats(s, { ...m, agentIds: m.agentIds.filter((id) => !lostNow.has(id)) });
  // A captive goes on an aircraft bound for a base with a free cell (a jet first: helicopters keep room for bodies).
  const cellAt = (a: Aircraft) => { const b = s.installations.find((i) => i.id === a.baseId); return !!b && freeCells(b, s) > 0; };
  const fits = hold.filter((h) => h.room >= LOAD.captive && cellAt(h.a));
  const craft = fits.find((h) => h.a.kind !== "helicopter")?.a ?? fits[0]?.a ?? hold.find((h) => cellAt(h.a))?.a ?? hold[0]?.a;
  const room = hold.reduce((t, h) => t + (h.a === craft ? h.room : 0), 0);
  const dest = craft ? s.installations.find((i) => i.id === craft.baseId) ?? home : home;
  const cargo = (a = craft!): Cargo => (a.cargo ??= { remains: 0, captives: [] });
  if (home && c.captive) {
    const what = c.captive === "vampire" ? "a vampire" : "a thrall";
    const taken: Captive = { id: `captive-${s.nextId++}`, kind: c.captive, bloodline: m.bloodline, takenAt: s.time, city: m.city, regionId: m.regionId };
    if (!dest || freeCells(dest, s) <= 0) {
      if (c.captive === "vampire" || m.leadKind !== "capture") c.text.push(`They could have taken ${what} alive, but ${home.name} has no free cell to hold one. Build containment.`);
    } else if (craft && room < LOAD.captive) {
      c.text.push(`They could have taken ${what} alive, but there was no room aboard ${craft.name}. A second aircraft would have carried it.`);
    } else {
      if (craft) { cargo().captives.push(taken); hold.find((h) => h.a === craft)!.room -= LOAD.captive; held.push(`${what} taken alive, aboard ${craft.name} for ${dest!.name}`); }
      else if (holdCaptive(s, home, c.captive, m.bloodline, m.city, m.regionId)) held.push(`${what} taken alive, held at ${home.name}`);
      c.text.push(c.captive === "vampire" ? "One of them was taken alive, chained and hooded, and is on its way to a cell." : "The thrall is coming back with them for longer questioning.");
    }
  }
  if (home && c.remains > 0 && hold.length) {
    // Sensitive site exploitation: the bodies go wherever a helicopter has room.
    let left = c.remains;
    for (const h of hold.filter((x) => carriesRemains(x.a.kind))) {
      const fit = Math.min(left, Math.max(0, Math.floor(h.room / LOAD.remains)));
      if (!fit) continue;
      cargo(h.a).remains += fit;
      h.room -= fit * LOAD.remains;
      left -= fit;
      held.push(`${fit === 1 ? "Vampire remains" : `${fit} sets of vampire remains`} aboard ${h.a.name} for cold storage at ${s.installations.find((i) => i.id === h.a.baseId)?.name ?? home.name}`);
    }
    const fit = c.remains - left;
    if (left) c.text.push(`${hold.length > 1 ? "The aircraft" : hold[0]!.a.name} had room for ${fit ? `only ${fit === 1 ? "one body" : `${fit} bodies`}` : "none of the bodies"}; the team burned the rest where they lay.`);
  }

  // Consequences.
  const regionLabel = regionName(m.regionId);
  if (c.support) changeSupport(s, m.regionId, c.support);
  if (c.secrecy) changeSecrecy(s, c.secrecy, `operation in ${m.city}`, m);
  addIntel(s, m.bloodline, c.intel * MISSION_INTEL_RATE);

  // People: deaths, wounds, experience. Trauma kits patch the worst wounds first.
  const dead = new Set([...(c.fought?.dead ?? []), ...c.lost]);
  if (c.fought) useMedkits(s, c.agents.filter((a) => !dead.has(a.id)), m.kit);
  const deadNames: string[] = [];
  const woundedNames: string[] = [];
  const improved: string[] = [];
  for (const a of c.agents) {
    const label = `${a.sister ? "Sr." : "Br."} ${a.name}`;
    if (dead.has(a.id)) {
      deadNames.push(label);
      s.fallen.push({ name: a.name, sister: a.sister, died: s.time, where: m.city });
      continue;
    }
    a.missions++;
    const gains: Partial<Record<StatId, number>> = {};
    for (const stat of c.used) gains[stat] = train(a, stat, result === "success" ? r.int(1, 3) : r.int(0, 1));
    const line = improvementLine(a, gains);
    if (line) improved.push(line);
    if (a.hp < a.stats.vitality * 0.75) {
      a.woundedUntil = s.time + Math.ceil((a.stats.vitality - a.hp) / healPerDay(s)) * DAY;
      woundedNames.push(label);
    }
  }
  const survivors = c.agents.filter((a) => !dead.has(a.id));
  const kills = (c.fought?.thrallsKilled ?? 0) + (c.fought?.vampiresKilled ?? 0);
  for (let i = 0; i < kills && survivors.length; i++) r.pick(survivors).kills++;
  if (dead.size) {
    s.agents = s.agents.filter((a) => !dead.has(a.id));
    m.agentIds = m.agentIds.filter((id) => !dead.has(id));
    c.text.push(`We lost ${deadNames.join(", ")}. Requiescat in pace.`);
    for (const n of deadNames) addLog(s, `${n} fell in ${m.city}.`, "bad");
  }

  const effects: string[] = [];
  if (Math.abs(c.support) >= 0.05) effects.push(`Support in ${regionLabel} ${c.support > 0 ? "+" : ""}${c.support.toFixed(2)}`);
  if (Math.abs(c.secrecy) >= 0.1) effects.push(`Secrecy ${c.secrecy > 0 ? "+" : ""}${c.secrecy.toFixed(1)}`);
  if (c.intel) effects.push(`Intel on ${bloodlineName(m.bloodline)} ${Math.round(s.intel[m.bloodline]!)}/100`);
  if (lostCraft) {
    effects.push(`${lostCraft} lost`);
    if (m.agentIds.length) c.text.push("The team came home on a hired flight.");
  }
  if (c.spoils > 0) {
    // A helicopter lifts everything out; a team flying commercial or by jet carries what it can (half).
    const byHeli = missionCraft(s, m).some((a) => a.kind === "helicopter");
    // Fought by hand: what the team actually got out. Otherwise the rule of thumb.
    const share = typeof c.mode === "object" && c.mode.lootShare !== null ? c.mode.lootShare : byHeli ? 1 : SPOILS_CARRIED;
    const seized = Math.round((c.spoils * share) / 1_000) * 1_000;
    s.funds += seized;
    effects.push(seized > 0 ? `Seized $${seized.toLocaleString("en-US")}${share >= 1 ? "" : " (what the team could carry)"}` : "The spoils were left behind");
  }
  if (c.burned) {
    // Eight hundred years of keeping things: some of it comes out with the team.
    for (const a of findArtifact(s, m.bloodline, c.burned, m.regionId, m.city)) {
      c.text.push(a.treasure ? `In the deepest room, under glass: ${a.name.toLowerCase()}.` : `Among what they kept: ${a.name.charAt(0).toLowerCase() + a.name.slice(1)}.`);
      held.push(`${shortName(a)} to the vault (Market)`);
    }
  }
  if (result === "success")
    creditAround(s, m.regionId, PLEDGE.success + (c.burned ? PLEDGE.strike : 0) + (c.burned === "lair" ? PLEDGE.lair : 0));
  for (const h of held) effects.push(h.charAt(0).toUpperCase() + h.slice(1));

  post(s, {
    kind: "debrief",
    title: `${RESULT_WORDS[result]}: ${m.title}`,
    body: c.text.join("\n\n"),
    regionId: m.regionId,
    pos: c.revealed?.pos ?? m.pos,
    refId: c.revealed?.id ?? m.id,
    casualties: { dead: deadNames, wounded: woundedNames },
    effects: effects.join(" · "),
    improved,
  });
  addLog(s, `${RESULT_WORDS[result]}: ${m.title}.`, result === "success" ? "good" : result === "fail" ? "bad" : "neutral");
  if (c.site?.kind === "lair" && result === "success") destroyBloodline(s, c.site.bloodline);
  // Sensitive site exploitation: with more than one aircraft on the ground and something to carry,
  // the player may move the haul between them before take-off. Otherwise they leave now.
  const craftHere = missionCraft(s, m);
  if (craftHere.length > 1 && craftHere.some((a) => cargoLoad(a.cargo) > 0)) {
    m.haul = true;
    post(s, { kind: "haul", title: `The haul: ${m.title}`, body: "Everything is aboard. Each aircraft flies home to its own base: choose which carries what.", regionId: m.regionId, pos: m.pos, refId: m.id });
    return;
  }
  // If nobody survived, the aircrew bring the aircraft home empty.
  startReturn(s, m);
}

/** Who rides where after the fight: each team on its own aircraft (jets first, helicopters keep room for bodies). */
export function haulSeats(s: GameState, m: Mission): { a: Aircraft; people: number; room: number }[] {
  const wingIds = new Set((m.wings ?? []).filter((w) => w.landed).flatMap((w) => w.agentIds));
  const groups = [
    { craft: missionCraft(s, { aircraftId: m.aircraftId, escorts: m.escorts }), people: m.agentIds.filter((id) => !wingIds.has(id)).length },
    ...(m.wings ?? []).filter((w) => w.landed).map((w) => ({ craft: missionCraft(s, w), people: m.agentIds.filter((id) => w.agentIds.includes(id)).length })),
  ];
  return groups.flatMap(({ craft, people }) => {
    let left = people;
    return [...craft].sort((a, b) => Number(carriesRemains(a.kind)) - Number(carriesRemains(b.kind))).map((a) => {
      const seated = Math.min(left, Math.floor((capacityOf(a.kind) - cargoLoad(a.cargo)) / LOAD.person));
      left -= seated;
      return { a, people: seated, room: capacityOf(a.kind) - cargoLoad(a.cargo) - seated * LOAD.person };
    });
  });
}

/** Moves a body (or a captive, by id) from one aircraft on the ground to another. */
export function moveHaul(s: GameState, missionId: string, fromId: string, toId: string, captiveId?: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m?.haul) return "Nothing is being loaded there.";
  const seats = haulSeats(s, m);
  const from = seats.find((x) => x.a.id === fromId), to = seats.find((x) => x.a.id === toId);
  if (!from || !to || from === to) return "Choose two aircraft on the ground.";
  const load = captiveId ? LOAD.captive : LOAD.remains;
  if (to.room < load) return `No room aboard ${to.a.name}.`;
  if (captiveId) {
    const x = from.a.cargo?.captives.find((c) => c.id === captiveId);
    if (!x) return "That captive isn't aboard.";
    const dest = s.installations.find((i) => i.id === to.a.baseId);
    if (!dest || freeCells(dest, s) <= 0) return `${dest?.name ?? "That base"} has no free cell.`;
    from.a.cargo!.captives = from.a.cargo!.captives.filter((c) => c !== x);
    (to.a.cargo ??= { remains: 0, captives: [] }).captives.push(x);
  } else {
    if (!carriesRemains(to.a.kind)) return "Only a helicopter lifts bodies.";
    if (!from.a.cargo?.remains) return "No bodies aboard.";
    from.a.cargo.remains--;
    (to.a.cargo ??= { remains: 0, captives: [] }).remains++;
  }
  for (const a of [from.a, to.a]) if (a.cargo && !a.cargo.remains && !a.cargo.captives.length) delete a.cargo;
  return null;
}

/** Leaves part of the haul behind to make room: a body is burned, a captive let go. */
export function dropHaul(s: GameState, missionId: string, aircraftId: string, captiveId?: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m?.haul) return "Nothing is being loaded there.";
  const a = missionCraft(s, m).find((x) => x.id === aircraftId);
  if (!a?.cargo) return "Nothing aboard.";
  if (captiveId) {
    const x = a.cargo.captives.find((c) => c.id === captiveId);
    if (!x) return "That captive isn't aboard.";
    a.cargo.captives = a.cargo.captives.filter((c) => c !== x);
    addLog(s, x.kind === "vampire" ? `${m.city}: the captive vampire is destroyed on site.` : `${m.city}: the thrall is let go, hooded, by a roadside.`);
  } else {
    if (!a.cargo.remains) return "No bodies aboard.";
    a.cargo.remains--;
    addLog(s, `${m.city}: a body is burned where it lay.`);
  }
  if (!a.cargo.remains && !a.cargo.captives.length) delete a.cargo;
  return null;
}

/** Recalls a team on its way: a joining team (by wing id) turns back alone; the team itself turns back,
 *  and a team still flying behind it takes over (or the mission ends). */
export function recallTeam(s: GameState, missionId: string, wingId?: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m) return "No such team.";
  if (wingId) {
    const w = m.wings?.find((x) => x.id === wingId && !x.landed);
    if (!w) return "That team isn't in the air.";
    recallWing(s, m, w);
    return null;
  }
  if (m.phase !== "outbound") return "The team isn't on its way out.";
  const next = (m.wings ?? []).filter((w) => !w.landed).sort((a, b) => a.arriveAt - b.arriveAt)[0];
  if (next) {
    swapLead(m, next); // the next team in the air carries on; the old lead is now a wing, and turns back
    recallWing(s, m, m.wings!.find((w) => w.id === next.id)!);
    return null;
  }
  // Nobody else: the mission ends; the team turns around where it is.
  const k = Math.min(1, Math.max(0, (s.time - m.departAt) / Math.max(1, m.arriveAt - m.departAt)));
  const here = { lat: m.from.lat + (m.pos.lat - m.from.lat) * k, lon: m.from.lon + (m.pos.lon - m.from.lon) * k };
  if (m.target.kind === "lead") { const l = s.leads.find((x) => x.id === m.target.id); if (l) l.missionId = null; }
  else { const x = s.sites.find((y) => y.id === m.target.id); if (x) x.missionId = null; }
  const base = homeBase(s, m);
  m.phase = "returning";
  m.decision = null;
  m.pos = here;
  if (base) m.from = { ...base.pos };
  delete m.legs;
  m.returnStart = s.time;
  m.returnAt = ceilHour(s.time + Math.max(HOUR / 2, s.time - m.departAt));
  addLog(s, `${missionCraftName(s, m)} turns back for ${base?.name ?? "home"}.`);
  return null;
}

/** Take-off after the haul is loaded: everyone heads home. */
export function finishHaul(s: GameState, missionId: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m?.haul) return "Nothing is being loaded there.";
  delete m.haul;
  s.events = s.events.filter((e) => !(e.kind === "haul" && e.refId === m.id));
  startReturn(s, m);
  return null;
}

function homeBase(s: GameState, m: Mission) {
  const own = s.installations.find((i) => i.id === m.baseId && i.kind === "base");
  if (own) return own;
  // The base is gone: the nearest one left takes them in.
  return s.installations
    .filter((i) => i.kind === "base")
    .sort((a, b) => distanceNm(a.pos, m.pos) - distanceNm(b.pos, m.pos))[0];
}

export function startReturn(s: GameState, m: Mission) {
  // Teams that joined on the ground fly home to their own bases, with what their aircraft carry.
  for (const w of [...(m.wings ?? [])]) {
    if (!w.landed) { recallWing(s, m, w); continue; }
    const theirs = m.agentIds.filter((id) => w.agentIds.includes(id));
    m.agentIds = m.agentIds.filter((id) => !w.agentIds.includes(id));
    const back = splitOff(s, m, w, theirs, m.pos);
    startReturn(s, back);
  }
  delete m.wings;
  // Nobody left (all killed or taken) and nothing of ours to fly back: there is no flight home.
  // (Our own helicopter or jet still comes home empty; a lost helicopter has become a hired flight.)
  if (!m.agentIds.length && isHired(m.aircraftId)) {
    s.missions = s.missions.filter((x) => x !== m);
    return;
  }
  const base = homeBase(s, m);
  m.phase = "returning";
  m.decision = null;
  if (base) m.from = { ...base.pos };
  // Stranded in Europe by the fall: out by air if the aircraft can make it, else overland.
  const out = m.stranded ? exfiltrate(s, m, base) : null;
  // Home the way they came: through refuelling stations if the base is out of reach. The slowest sets the pace.
  const air = base ? missionCraft(s, m).sort((a, b) => (planRoute(s, m.pos, base.pos, b.kind)?.hours ?? 0) - (planRoute(s, m.pos, base.pos, a.kind)?.hours ?? 0))[0] : undefined;
  const route = out === null && base && air && !m.overland ? planRoute(s, m.pos, base.pos, air.kind) : null;
  const hours = out ?? route?.hours ?? (base ? legHours(s, m.aircraftId, distanceNm(m.pos, base.pos)) : null) ?? 1;
  m.returnStart = s.time;
  m.returnAt = ceilHour(s.time + Math.max(0.5, hours) * HOUR);
  if (route?.stops.length && base && air) m.legs = routeLegs(route, m.pos, base.pos, air.kind, m.returnStart, m.returnAt);
  else delete m.legs;
}

function home(s: GameState, m: Mission) {
  const base = homeBase(s, m);
  s.missions = s.missions.filter((x) => x !== m);
  if (!base) return;
  for (const air of missionCraft(s, m)) {
    if (m.overland) {
      // Left behind in Europe.
      s.aircraft = s.aircraft.filter((a) => a !== air);
      addLog(s, `${air.name} is written off, abandoned in Europe.`, "bad");
    } else {
      air.deployed = false;
      air.baseId = base.id;
      unloadCargo(s, air, base);
    }
  }
  for (const a of s.agents)
    if (m.agentIds.includes(a.id)) {
      a.deployed = false;
      a.baseId = base.id;
    }
  addLog(s, `${missionCraftName(s, m)} ${m.escorts?.length ? "are" : "is"} back at ${base.name}.`);
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

export function hourlyMissions(s: GameState) {
  for (const m of [...s.missions]) {
    if (s.events.some((e) => e.kind === "arrival")) break; // one decision at a time
    if (landWings(s, m)) continue;
    // Holding on the ground: the target can still go cold (it doesn't notice us; it just ends).
    if (m.phase === "on-site" && m.waiting && targetGone(s, m)) {
      post(s, { kind: "info", title: `Gone cold: ${m.city}`, body: `The team held in ${m.city} too long: the trail is cold. Everyone heads home.`, regionId: m.regionId, pos: m.pos, refId: m.id });
      if (m.target.kind === "lead") { const l = s.leads.find((x) => x.id === m.target.id); if (l) l.missionId = null; }
      recallWings(s, m);
      startReturn(s, m);
      continue;
    }
    if (m.phase === "outbound" && m.arriveAt <= s.time) arrive(s, m);
    else if (m.phase === "on-site" && m.option && m.workUntil <= s.time) {
      const play = playsFor(m).find((p) => p.id === m.option);
      if (play) resolve(s, m, play);
      else startReturn(s, m);
    } else if (m.phase === "returning" && m.returnAt <= s.time) home(s, m);
  }
  // Sites the bloodline abandons (unless a team is working them right now).
  for (const site of [...s.sites]) {
    if (site.expiresAt > s.time) continue;
    const m = s.missions.find((x) => x.id === site.missionId);
    if (m?.phase === "on-site" && !m.waiting) continue; // a team at work holds it; one only waiting doesn't
    s.sites = s.sites.filter((x) => x !== site);
    addLog(s, `The ${SITE_KINDS[site.kind].name.toLowerCase()} in ${site.city} has gone quiet. They moved on.`);
    storySiteLapsed(s, site);
    creditRegion(s, site.regionId, PLEDGE.lapsed);
  }
}

/** Leads being worked by a team on site don't expire (a team only holding for the others doesn't count). */
export const leadEngaged = (s: GameState, l: Lead) =>
  !!l.missionId && s.missions.some((m) => m.id === l.missionId && m.phase === "on-site" && !m.waiting);

const targetGone = (s: GameState, m: Mission) =>
  m.target.kind === "lead" ? !s.leads.some((l) => l.id === m.target.id) : !s.sites.some((x) => x.id === m.target.id);

/** Wings landing at their mission. One that lands before the team takes the lead (and its orders);
 *  one that lands beside a team on the ground joins it, and the orders come again. Returns whether orders were posted. */
function landWings(s: GameState, m: Mission): boolean {
  for (const w of m.wings ?? []) {
    if (w.landed || w.arriveAt > s.time) continue;
    if (targetGone(s, m)) {
      recallWing(s, m, w);
      continue;
    }
    if (m.phase === "outbound") {
      swapLead(m, w); // the wing is now the team; the old lead flies on as a wing
      arrive(s, m);
      return true;
    }
    if (m.phase !== "on-site" || !joinable(m)) {
      recallWing(s, m, w);
      continue;
    }
    w.landed = true;
    m.agentIds.push(...w.agentIds);
    addLog(s, `${missionCraft(s, w).map((a) => a.name).join(" and ")} on the ground in ${m.city}: ${missionAgents(s, m).length} of ours there now.`);
    refreshOrders(s, m);
    return true;
  }
  return false;
}

/** After aircraft are lost: each group flies on what it has left; a joined team with nothing left rides with the main team. */
function pruneLost(s: GameState, m: Mission) {
  const have = (id: string) => s.aircraft.some((a) => a.id === id);
  const regroup = (g: { aircraftId: string; escorts?: string[] }) => {
    const left = [g.aircraftId, ...(g.escorts ?? [])].filter(have);
    if (!left.length) return false;
    g.aircraftId = left[0]!;
    if (left.length > 1) g.escorts = left.slice(1); else delete g.escorts;
    return true;
  };
  for (const w of [...(m.wings ?? [])]) if (w.landed && !regroup(w)) m.wings = m.wings!.filter((x) => x !== w); // its people ride with the team
  if (!regroup(m)) {
    // Nothing of the main team's left: a joined team's aircraft takes over, or a hired flight.
    const w = m.wings?.find((x) => x.landed);
    if (w) { m.aircraftId = w.aircraftId; if (w.escorts) m.escorts = w.escorts; else delete m.escorts; m.wings = m.wings!.filter((x) => x !== w); }
    else { m.aircraftId = CHARTER.id; delete m.escorts; }
  }
}

/** Trades places between a mission's lead team and a wing (both still in the air). */
function swapLead(m: Mission, w: Wing) {
  const lead: Wing = { id: w.id, aircraftId: m.aircraftId, ...(m.escorts ? { escorts: m.escorts } : {}), baseId: m.baseId, agentIds: m.agentIds,
    from: m.from, departAt: m.departAt, arriveAt: m.arriveAt, ...(m.legs ? { legs: m.legs } : {}), landed: false };
  m.aircraftId = w.aircraftId;
  if (w.escorts) m.escorts = w.escorts; else delete m.escorts;
  m.baseId = w.baseId;
  m.agentIds = w.agentIds;
  m.from = w.from;
  m.departAt = w.departAt;
  m.arriveAt = w.arriveAt;
  if (w.legs) m.legs = w.legs; else delete m.legs;
  m.wings = (m.wings ?? []).map((x) => (x === w ? lead : x));
}

/** Wings still in the air when the mission starts (or ends) turn back. */
function recallWings(s: GameState, m: Mission) {
  for (const w of [...(m.wings ?? [])]) if (!w.landed) recallWing(s, m, w);
}

/** A team of a wing goes home as a mission of its own, so it flies, lands and unloads like any other. */
function splitOff(s: GameState, m: Mission, w: Wing, agentIds: string[], pos: LatLon): Mission {
  const back: Mission = {
    ...m, id: `mission-${s.nextId++}`, aircraftId: w.aircraftId, baseId: w.baseId, agentIds, from: w.from, pos,
    phase: "returning", decision: null, option: null, battle: undefined, wings: undefined, waiting: false, legs: undefined,
  };
  if (w.escorts) back.escorts = w.escorts; else delete back.escorts;
  delete back.battle; delete back.wings; delete back.legs;
  m.wings = (m.wings ?? []).filter((x) => x !== w);
  s.missions.push(back);
  return back;
}

function recallWing(s: GameState, m: Mission, w: Wing) {
  // Turned around where it is: home in the time it has flown.
  const k = Math.min(1, Math.max(0, (s.time - w.departAt) / Math.max(1, w.arriveAt - w.departAt)));
  const pos = { lat: w.from.lat + (m.pos.lat - w.from.lat) * k, lon: w.from.lon + (m.pos.lon - w.from.lon) * k };
  const back = splitOff(s, m, w, w.agentIds, pos);
  back.returnStart = s.time;
  back.returnAt = ceilHour(s.time + Math.max(HOUR / 2, s.time - w.departAt));
  addLog(s, `${missionCraftName(s, back)} turns back for ${s.installations.find((i) => i.id === w.baseId)?.name ?? "home"}.`);
}

/** Where a mission is now, for the globe: its current leg (while refuelling, the next one, not yet begun). */
export function missionLeg(m: Mission, now = 0): { from: LatLon; to: LatLon; start: number; end: number } {
  if (m.legs?.length && m.phase !== "on-site") return m.legs.find((l) => l.end > now) ?? m.legs[m.legs.length - 1]!;
  if (m.phase === "outbound") return { from: m.from, to: m.pos, start: m.departAt, end: m.arriveAt };
  if (m.phase === "returning") return { from: m.pos, to: m.from, start: m.returnStart, end: m.returnAt };
  return { from: m.pos, to: m.pos, start: 0, end: 0 };
}

