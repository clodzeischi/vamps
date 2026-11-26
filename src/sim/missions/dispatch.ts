// Sending a team: the plan (base, aircraft, operatives, kit, target), its cost, what blocks it, and dispatching it.
import { AIRCRAFT, hiredFlight } from "../../data/aircraft";
import { BLOODLINES, bloodlineById } from "../../data/bloodlines";
import { KIT, type KitId } from "../../data/kit";
import { distanceNm } from "../core/geo";
import { planRoute, routeLegs } from "./routes";
import { ownerOf } from "../campaign/bloodlines";
import { accessBlocker, type AssetKind } from "../intel/humint";
import { capacityOf } from "../base/transfers";
import { changeSecrecy } from "../campaign/secrecy";
import {
  addLog,
  isWounded,
  type GameState,
  type LeadKind,
  type Mission,
  type Site,
  type Aircraft,
  type Wing,
  isCraftDeployed,
  isDeployed,
  agentName,
  craftById,
  installationById,
  leadById,
  missionById,
  siteById,
} from "../core/state";
import { HOUR, type LatLon } from "../core/time";
import { SITE_KINDS, ceilHour, PREP_HOURS } from "./common";

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

interface TargetInfo {
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
    const l = leadById(s, t.id);
    if (!l) return null;
    const op = s.operations.find((o) => o.id === l.opId);
    return {
      pos: l.pos,
      title: l.title,
      city: l.city,
      regionId: l.regionId,
      bloodline: op?.bloodline ?? ownerOf(l.regionId) ?? BLOODLINES[0]!.id,
      leadKind: l.kind,
      intel: l.intel,
      expiresAt: l.expiresAt,
      missionId: l.missionId ?? null,
      ...(l.asset
        ? {
            who: l.who,
            asset: l.asset,
            ...(l.whoFemale !== undefined ? { whoFemale: l.whoFemale } : {}),
          }
        : {}),
    };
  }
  const site = siteById(s, t.id);
  if (!site) return null;
  return {
    pos: site.pos,
    title: siteTitle(site),
    city: site.city,
    regionId: site.regionId,
    bloodline: site.bloodline,
    leadKind: null,
    intel: 0.6,
    expiresAt: site.expiresAt,
    missionId: site.missionId,
  };
}

export const siteTitle = (site: Site) =>
  `${SITE_KINDS[site.kind].name} of the ${bloodlineById(site.bloodline)?.short ?? "?"}, ${site.city}`;

function flightHours(distance: number, aircraftKind: keyof typeof AIRCRAFT): number {
  return distance / AIRCRAFT[aircraftKind].speedKn;
}

/** A hired flight (charter or airline), not one of our aircraft. */
export const isHired = (aircraftId: string) => !!hiredFlight(aircraftId);

/** What carried a mission: an aircraft's name, or "Chartered jet" / "Commercial flight". */
function craftName(s: GameState, aircraftId: string): string {
  return hiredFlight(aircraftId)?.name ?? craftById(s, aircraftId)?.name ?? "The team";
}
/** What carries a mission, escorts included: "CHERUB-1 and CHERUB-2". */
export function missionCraftName(s: GameState, m: Pick<Mission, "aircraftId" | "escorts">): string {
  const own = missionCraft(s, m);
  return own.length > 1 ? own.map((a) => a.name).join(" and ") : craftName(s, m.aircraftId);
}
/** The mission (if any) an aircraft is flying, as the first aircraft or an escort. */
export const missionOf = (s: GameState, aircraftId: string) =>
  s.missions.find(
    (m) =>
      m.aircraftId === aircraftId ||
      m.escorts?.includes(aircraftId) ||
      m.wings?.some((w) => w.aircraftId === aircraftId || w.escorts?.includes(aircraftId)),
  );

/** Flight time for a mission's aircraft (or hired flight) over a distance. */
export function legHours(s: GameState, aircraftId: string, distance: number): number | null {
  const hired = hiredFlight(aircraftId);
  if (hired) return distance / hired.speedKn;
  const air = craftById(s, aircraftId);
  return air ? flightHours(distance, air.kind) : null;
}

/** What a deployment costs: secrecy (noise), money (fuel, crews), and when it arrives. */
export function dispatchCost(s: GameState, plan: DispatchPlan) {
  const target = targetInfo(s, plan.target);
  const base = installationById(s, plan.baseId);
  const hired = hiredFlight(plan.aircraftId);
  const air = craftById(s, plan.aircraftId);
  if (!target || !base || (!air && !hired)) return null;
  const kit = KIT[plan.kit];
  const n = plan.agentIds.length;
  // Our own aircraft may have to hop through refuelling stations. With escorts, the slowest sets the pace.
  const flights = (hired ? [] : [air!, ...escortsOf(s, plan)]).map((a) => ({
    a,
    route: planRoute(s, base.pos, target.pos, a.kind),
  }));
  const slowest = flights.reduce<(typeof flights)[number] | null>(
    (w, f) => (!w || (f.route?.hours ?? Infinity) > (w.route?.hours ?? Infinity) ? f : w),
    null,
  );
  const route = slowest?.route ?? null;
  const distance = route?.distance ?? distanceNm(base.pos, target.pos);
  const noise = hired ? hired.noise : flights.reduce((t, f) => t + AIRCRAFT[f.a.kind].noise, 0);
  // One or two people in street clothes travel as passengers: no one notices the aircraft.
  const airNoise = plan.kit === "civilian" && n <= 2 && flights.length <= 1 ? 0 : noise;
  const secrecy = n
    ? Math.round((kit.noiseBase + kit.noisePerAgent * (n - 1) + airNoise) * 10) / 10
    : 0;
  // Hired flights round to $500 (an airline ticket is cheap); our own to $1k.
  const money = hired
    ? Math.round((hired.fee + 2 * distance * hired.costPerNm) / 500) * 500
    : Math.round(
        flights.reduce(
          (t, f) => t + 2 * (f.route?.distance ?? distance) * AIRCRAFT[f.a.kind].costPerNm,
          0,
        ) / 1000,
      ) * 1000;
  const hours = route?.hours ?? legHours(s, plan.aircraftId, distance)!;
  const arriveAt = ceilHour(s.time + ((hired ? hired.prepHours : PREP_HOURS) + hours) * HOUR);
  return {
    secrecy,
    money,
    distance,
    hours,
    arriveAt,
    route,
    slowestKind: slowest?.a.kind ?? null,
    lateBy: Math.max(0, arriveAt - target.expiresAt),
  };
}

/** A plan's (or mission's) escorting aircraft that still exist. */
const escortsOf = (s: GameState, x: { escorts?: string[] }) =>
  (x.escorts ?? []).map((id) => craftById(s, id)).filter((a): a is NonNullable<typeof a> => !!a);
/** Every one of our aircraft on a mission: the first, then the escorts. */
export const missionCraft = (
  s: GameState,
  m: Pick<Mission, "aircraftId" | "escorts"> & { wings?: Wing[] },
): Aircraft[] =>
  [
    craftById(s, m.aircraftId),
    ...escortsOf(s, m),
    ...(m.wings ?? []).filter((w) => w.landed).flatMap((w) => missionCraft(s, w)),
  ].filter((a): a is NonNullable<typeof a> => !!a);
/** A mission a team can still join: on its way, or on the ground and not yet started. */
export const joinable = (m: Mission) =>
  m.phase === "outbound" || (m.phase === "on-site" && !m.option && !m.battle && !m.haul);
/** Seats on a plan's aircraft together (hired flights have their own). */
export function planSeats(s: GameState, plan: DispatchPlan): number {
  const hired = hiredFlight(plan.aircraftId);
  if (hired) return hired.seats;
  return missionCraft(s, plan).reduce((t, a) => t + capacityOf(a.kind), 0);
}

/** Fit and at home: who a team is made of by default (and by the bot). */
export const availableAgents = (s: GameState, baseId: string) =>
  s.agents.filter((a) => a.baseId === baseId && !isDeployed(s, a) && !isWounded(s, a));
/** Everyone at home, the wounded too: the player may send them, with the HP they have left. */
const deployableAgents = (s: GameState, baseId: string) =>
  s.agents.filter((a) => a.baseId === baseId && !isDeployed(s, a) && a.hp > 0);
export const availableAircraft = (s: GameState, baseId: string) =>
  s.aircraft.filter((a) => a.baseId === baseId && !isCraftDeployed(s, a));

export function dispatchBlocker(s: GameState, plan: DispatchPlan): string | null {
  if (s.gameOver) return "The campaign is over.";
  const target = targetInfo(s, plan.target);
  if (!target)
    return plan.target.kind === "lead" ? "That lead has gone cold." : "That site is gone.";
  const joining = target.missionId ? missionById(s, target.missionId) : undefined;
  if (target.missionId && (!joining || !joinable(joining))) return "A team is already on it.";
  if (joining) {
    if (isHired(plan.aircraftId)) return "Only our own aircraft can join a team already out.";
    if (plan.kit !== joining.kit)
      return `Joining teams wear the same kit: ${KIT[joining.kit].name.toLowerCase()}.`;
  }
  const closed = accessBlocker(s, target.regionId);
  if (closed) return closed;
  const base = s.installations.find(
    (i) => i.id === plan.baseId && i.kind === "base" && i.readyAt <= s.time,
  );
  if (!base) return "Choose an operational base.";
  const hired = hiredFlight(plan.aircraftId);
  if (hired) {
    if (!hired.kits.includes(plan.kit))
      return hired.id === "commercial"
        ? "Airport security: civilian clothes only, no weapons."
        : "Tactical kit doesn't get through a charter terminal.";
    if (plan.agentIds.length > hired.seats)
      return `A ${hired.name.toLowerCase()} takes ${hired.seats === 1 ? "one operative" : `${hired.seats} operatives`}.`;
  } else {
    const air = craftById(s, plan.aircraftId);
    if (!air || air.baseId !== base.id) return "Choose an aircraft at that base.";
    if (isCraftDeployed(s, air)) return `${air.name} is already flying.`;
    if (!planRoute(s, base.pos, target.pos, air.kind))
      return `${air.name} can't reach ${target.city} (${Math.round(distanceNm(base.pos, target.pos))} nm), even by refuelling.`;
    const escorts = plan.escorts ?? [];
    if (new Set([plan.aircraftId, ...escorts]).size !== escorts.length + 1)
      return "An aircraft is chosen twice.";
    for (const id of escorts) {
      const e = craftById(s, id);
      if (!e || e.baseId !== base.id) return "Choose escorts at that base.";
      if (isCraftDeployed(s, e)) return `${e.name} is already flying.`;
      if (!planRoute(s, base.pos, target.pos, e.kind))
        return `${e.name} can't reach ${target.city}.`;
    }
    const seats = planSeats(s, plan);
    if (plan.agentIds.length > seats)
      return escorts.length
        ? `The aircraft seat ${seats} together.`
        : `${air.name} seats ${seats}.`;
  }
  if (!plan.agentIds.length) return "Choose at least one operative.";
  const ready = new Set(deployableAgents(s, base.id).map((a) => a.id));
  for (const id of plan.agentIds)
    if (!ready.has(id)) return "One of those operatives isn't available.";
  const cost = dispatchCost(s, plan)!;
  if (s.funds < cost.money) return "Not enough funds for the flight.";
  return null;
}

export function dispatch(s: GameState, plan: DispatchPlan): string | null {
  const why = dispatchBlocker(s, plan);
  if (why) return why;
  const target = targetInfo(s, plan.target)!;
  const base = installationById(s, plan.baseId)!;
  const hired = hiredFlight(plan.aircraftId);
  const air = hired ? null : craftById(s, plan.aircraftId)!;
  const cost = dispatchCost(s, plan)!;
  const joining = target.missionId ? missionById(s, target.missionId) : undefined;
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
      ...(cost.route?.stops.length
        ? {
            legs: routeLegs(
              cost.route,
              base.pos,
              target.pos,
              cost.slowestKind ?? air.kind,
              s.time + PREP_HOURS * HOUR,
              cost.arriveAt,
            ),
          }
        : {}),
      landed: false,
    };
    (joining.wings ??= []).push(w);
    s.funds -= cost.money;
    addLog(
      s,
      `${missionCraft(s, w)
        .map((a) => a.name)
        .join(
          " and ",
        )} ${w.escorts?.length ? "leave" : "leaves"} ${base.name} to join the team in ${target.city}, ${w.agentIds.length} aboard.`,
    );
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
    ...(target.asset
      ? {
          who: target.who,
          asset: target.asset,
          ...(target.whoFemale !== undefined ? { whoFemale: target.whoFemale } : {}),
        }
      : {}),
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
    ...(air && cost.route?.stops.length
      ? {
          legs: routeLegs(
            cost.route,
            base.pos,
            target.pos,
            cost.slowestKind ?? air.kind,
            s.time + PREP_HOURS * HOUR,
            cost.arriveAt,
          ),
        }
      : {}),
  };
  s.missions.push(m);
  if (plan.target.kind === "lead") leadById(s, plan.target.id)!.missionId = m.id;
  else siteById(s, plan.target.id)!.missionId = m.id;
  s.funds -= cost.money;
  if (air)
    addLog(
      s,
      `${missionCraft(s, m)
        .map((a) => a.name)
        .join(
          " and ",
        )} ${m.escorts?.length ? "leave" : "leaves"} ${base.name} for ${target.city} with ${m.agentIds.length} aboard.`,
    );
  else {
    const names = s.agents.filter((x) => m.agentIds.includes(x.id)).map((a) => `${agentName(a)}`);
    const who = names.length ? names.join(" and ") : "An operative";
    addLog(
      s,
      hired?.id === "commercial"
        ? `${who} flies commercial from ${base.name} to ${target.city}.`
        : `${who} board${names.length > 1 ? "" : "s"} a chartered jet at ${base.name} for ${target.city}.`,
    );
  }
  changeSecrecy(s, -cost.secrecy, `a team is seen moving toward ${target.city}`, target);
  return null;
}
