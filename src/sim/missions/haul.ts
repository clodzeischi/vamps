// The haul and the flight home: what the team carries back, recalling teams, landing at base.
import { distanceNm } from "../core/geo";
import { planRoute, routeLegs } from "./routes";
import { exfiltrate } from "../campaign/story";
import { freeCells } from "../people/personnel";
import { capacityOf, cargoLoad, carriesRemains, LOAD, unloadCargo } from "../base/transfers";
import {
  addLog,
  type GameState,
  type Mission,
  type Aircraft,
  installationById,
  leadById,
  missionById,
  siteById,
} from "../core/state";
import { HOUR } from "../core/time";
import { missionCraft, missionCraftName, isHired, legHours } from "./dispatch";
import { recallWing, swapLead, splitOff } from "./missions";
import { ceilHour } from "./common";

/** Who rides where after the fight: each team on its own aircraft (jets first, helicopters keep room for bodies). */
export function haulSeats(
  s: GameState,
  m: Mission,
): { a: Aircraft; people: number; room: number }[] {
  const wingIds = new Set((m.wings ?? []).filter((w) => w.landed).flatMap((w) => w.agentIds));
  const groups = [
    {
      craft: missionCraft(s, { aircraftId: m.aircraftId, escorts: m.escorts }),
      people: m.agentIds.filter((id) => !wingIds.has(id)).length,
    },
    ...(m.wings ?? [])
      .filter((w) => w.landed)
      .map((w) => ({
        craft: missionCraft(s, w),
        people: m.agentIds.filter((id) => w.agentIds.includes(id)).length,
      })),
  ];
  return groups.flatMap(({ craft, people }) => {
    let left = people;
    return [...craft]
      .sort((a, b) => Number(carriesRemains(a.kind)) - Number(carriesRemains(b.kind)))
      .map((a) => {
        const seated = Math.min(
          left,
          Math.floor((capacityOf(a.kind) - cargoLoad(a.cargo)) / LOAD.person),
        );
        left -= seated;
        return {
          a,
          people: seated,
          room: capacityOf(a.kind) - cargoLoad(a.cargo) - seated * LOAD.person,
        };
      });
  });
}

/** Moves a body (or a captive, by id) from one aircraft on the ground to another. */
export function moveHaul(
  s: GameState,
  missionId: string,
  fromId: string,
  toId: string,
  captiveId?: string,
): string | null {
  const m = missionById(s, missionId);
  if (!m?.haul) return "Nothing is being loaded there.";
  const seats = haulSeats(s, m);
  const from = seats.find((x) => x.a.id === fromId),
    to = seats.find((x) => x.a.id === toId);
  if (!from || !to || from === to) return "Choose two aircraft on the ground.";
  const load = captiveId ? LOAD.captive : LOAD.remains;
  if (to.room < load) return `No room aboard ${to.a.name}.`;
  if (captiveId) {
    const x = from.a.cargo?.captives.find((c) => c.id === captiveId);
    if (!x) return "That captive isn't aboard.";
    const dest = installationById(s, to.a.baseId);
    if (!dest || freeCells(dest, s) <= 0) return `${dest?.name ?? "That base"} has no free cell.`;
    from.a.cargo!.captives = from.a.cargo!.captives.filter((c) => c !== x);
    (to.a.cargo ??= { remains: 0, captives: [] }).captives.push(x);
  } else {
    if (!carriesRemains(to.a.kind)) return "Only a helicopter lifts bodies.";
    if (!from.a.cargo?.remains) return "No bodies aboard.";
    from.a.cargo.remains--;
    (to.a.cargo ??= { remains: 0, captives: [] }).remains++;
  }
  for (const a of [from.a, to.a])
    if (a.cargo && !a.cargo.remains && !a.cargo.captives.length) delete a.cargo;
  return null;
}

/** Leaves part of the haul behind to make room: a body is burned, a captive let go. */
export function dropHaul(
  s: GameState,
  missionId: string,
  aircraftId: string,
  captiveId?: string,
): string | null {
  const m = missionById(s, missionId);
  if (!m?.haul) return "Nothing is being loaded there.";
  const a = missionCraft(s, m).find((x) => x.id === aircraftId);
  if (!a?.cargo) return "Nothing aboard.";
  if (captiveId) {
    const x = a.cargo.captives.find((c) => c.id === captiveId);
    if (!x) return "That captive isn't aboard.";
    a.cargo.captives = a.cargo.captives.filter((c) => c !== x);
    addLog(
      s,
      x.kind === "vampire"
        ? `${m.city}: the captive vampire is destroyed on site.`
        : `${m.city}: the thrall is let go, hooded, by a roadside.`,
    );
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
  const m = missionById(s, missionId);
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
    recallWing(
      s,
      m,
      m.wings!.find((w) => w.id === next.id)!,
    );
    return null;
  }
  // Nobody else: the mission ends; the team turns around where it is.
  const k = Math.min(1, Math.max(0, (s.time - m.departAt) / Math.max(1, m.arriveAt - m.departAt)));
  const here = {
    lat: m.from.lat + (m.pos.lat - m.from.lat) * k,
    lon: m.from.lon + (m.pos.lon - m.from.lon) * k,
  };
  if (m.target.kind === "lead") {
    const l = leadById(s, m.target.id);
    if (l) l.missionId = null;
  } else {
    const x = siteById(s, m.target.id);
    if (x) x.missionId = null;
  }
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
  const m = missionById(s, missionId);
  if (!m?.haul) return "Nothing is being loaded there.";
  delete m.haul;
  s.events = s.events.filter((e) => !(e.kind === "haul" && e.refId === m.id));
  startReturn(s, m);
  return null;
}

export function homeBase(s: GameState, m: Mission) {
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
    if (!w.landed) {
      recallWing(s, m, w);
      continue;
    }
    const theirs = m.agentIds.filter((id) => w.agentIds.includes(id));
    m.agentIds = m.agentIds.filter((id) => !w.agentIds.includes(id));
    const back = splitOff(s, m, w, theirs, m.pos);
    startReturn(s, back);
  }
  delete m.wings;
  // Nobody left (all killed or taken) and nothing of ours to fly back: there is no flight home.
  // (Our own helicopter or jet still comes home empty.)
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
  const air = base
    ? missionCraft(s, m).sort(
        (a, b) =>
          (planRoute(s, m.pos, base.pos, b)?.hours ?? 0) -
          (planRoute(s, m.pos, base.pos, a)?.hours ?? 0),
      )[0]
    : undefined;
  const route =
    out === null && base && air && !m.overland ? planRoute(s, m.pos, base.pos, air) : null;
  const hours =
    out ??
    route?.hours ??
    (base ? legHours(s, m.aircraftId, distanceNm(m.pos, base.pos)) : null) ??
    1;
  m.returnStart = s.time;
  m.returnAt = ceilHour(s.time + Math.max(0.5, hours) * HOUR);
  if (route?.stops.length && base && air)
    m.legs = routeLegs(route, m.pos, base.pos, air.kind, m.returnStart, m.returnAt);
  else delete m.legs;
}

export function home(s: GameState, m: Mission) {
  const base = homeBase(s, m);
  s.missions = s.missions.filter((x) => x !== m);
  if (!base) return;
  for (const air of missionCraft(s, m)) {
    if (m.overland) {
      // Left behind in Europe.
      s.aircraft = s.aircraft.filter((a) => a !== air);
      addLog(s, `${air.name} is written off, abandoned in Europe.`, "bad");
    } else {
      air.baseId = base.id;
      unloadCargo(s, air, base);
    }
  }
  for (const a of s.agents)
    if (m.agentIds.includes(a.id)) {
      a.baseId = base.id;
    }
  addLog(s, `${missionCraftName(s, m)} ${m.escorts?.length ? "are" : "is"} back at ${base.name}.`);
}
