// Teams in the field. A mission goes through these stages, each in its own file:
//
//   dispatch.ts ──▶ outbound ──▶ arrival.ts (the decision on arrival)
//                                   │
//                                   ▼
//          resolution.ts (plays.ts, battles.ts): debrief, sites, wounds
//                                   │
//                                   ▼
//                    haul.ts: returning ──▶ home
//
// This file moves them along: the hourly tick, raids on nothing, wings
// splitting off and coming back, and where a team is on its flight.
import { changeSupport, creditRegion, PLEDGE } from "../economy/economy";
import { siteLapsed } from "../intel/networks";
import { storySiteLapsed } from "../campaign/story";
import { changeSecrecy } from "../campaign/secrecy";
import {
  addLog,
  post,
  type GameState,
  type Lead,
  type Mission,
  type Wing,
  installationById,
  leadById,
  missionById,
} from "../core/state";
import { HOUR, type LatLon } from "../core/time";
import { startReturn, home } from "./haul";
import { arrive, refreshOrders } from "./arrival";
import { playsFor } from "./plays";
import { resolve } from "./resolution";
import { SITE_KINDS, regionName, missionAgents, ceilHour } from "./common";
import { joinable, missionCraft, missionCraftName } from "./dispatch";

export function hourlyMissions(s: GameState) {
  for (const m of [...s.missions]) {
    if (s.events.some((e) => e.kind === "arrival")) break; // one decision at a time
    if (landWings(s, m)) continue;
    // Holding on the ground: the target can still go cold (it doesn't notice us; it just ends).
    if (m.phase === "on-site" && m.waiting && targetGone(s, m)) {
      post(s, {
        kind: "info",
        title: `Gone cold: ${m.city}`,
        body: `The team held in ${m.city} too long: the trail is cold. Everyone heads home.`,
        regionId: m.regionId,
        pos: m.pos,
        refId: m.id,
      });
      if (m.target.kind === "lead") {
        const l = leadById(s, m.target.id);
        if (l) l.missionId = null;
      }
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
    const m = missionById(s, site.missionId);
    if (m?.phase === "on-site" && !m.waiting) continue; // a team at work holds it; one only waiting doesn't
    s.sites = s.sites.filter((x) => x !== site);
    siteLapsed(s, site);
    addLog(
      s,
      `The ${SITE_KINDS[site.kind].name.toLowerCase()} in ${site.city} has gone quiet. They moved on.`,
    );
    storySiteLapsed(s, site);
    creditRegion(s, site.regionId, PLEDGE.lapsed);
  }
}

/** Support and secrecy a raid in full tactical kit costs when there was nothing there. */
export const FALSE_RAID = { support: 0.3, secrecy: 1 } as const;

/** The lead was noise: the team looks, finds people living their lives, and leaves. Quiet kit costs
 *  nothing; a tactical team kicking in an innocent door is a story. */
export function nothingThere(s: GameState, m: Mission, lead: Lead) {
  s.leads = s.leads.filter((l) => l !== lead);
  if (s.section?.fixing === lead.id) s.section.fixing = null;
  const loud = m.kit === "tactical";
  const text = [
    `There was nothing in ${m.city}. ${lead.kind === "source" ? "Nobody came to the meeting, and nobody there had ever heard of us." : "The address is what it looks like: ordinary people, ordinary lives."} Whatever we read into it, it wasn't there.`,
    loud
      ? "A team in full kit doesn't go unnoticed. By morning the neighbours have filmed it, and the local news is asking who."
      : "Nobody noticed a few quiet visitors. The team leaves the way it came.",
  ];
  if (loud) {
    changeSupport(s, m.regionId, -FALSE_RAID.support);
    changeSecrecy(s, -FALSE_RAID.secrecy, `a raid on the wrong door in ${m.city}`, m);
  }
  post(s, {
    kind: "debrief",
    title: `Nothing there: ${m.title}`,
    body: text.join("\n\n"),
    regionId: m.regionId,
    pos: m.pos,
    refId: m.id,
    casualties: { dead: [], wounded: [] },
    effects: loud
      ? `Support in ${regionName(m.regionId)} −${FALSE_RAID.support} · Secrecy −${FALSE_RAID.secrecy}`
      : "A false lead, and no harm done",
  });
  addLog(s, `Nothing there: ${m.title}.`);
  startReturn(s, m);
}

/** Leads being worked by a team on site don't expire (a team only holding for the others doesn't count). */
export const leadEngaged = (s: GameState, l: Lead) =>
  !!l.missionId &&
  s.missions.some((m) => m.id === l.missionId && m.phase === "on-site" && !m.waiting);

const targetGone = (s: GameState, m: Mission) =>
  m.target.kind === "lead"
    ? !s.leads.some((l) => l.id === m.target.id)
    : !s.sites.some((x) => x.id === m.target.id);

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
    addLog(
      s,
      `${missionCraft(s, w)
        .map((a) => a.name)
        .join(
          " and ",
        )} on the ground in ${m.city}: ${missionAgents(s, m).length} of ours there now.`,
    );
    refreshOrders(s, m);
    return true;
  }
  return false;
}

/** Trades places between a mission's lead team and a wing (both still in the air). */
export function swapLead(m: Mission, w: Wing) {
  const lead: Wing = {
    id: w.id,
    aircraftId: m.aircraftId,
    ...(m.escorts ? { escorts: m.escorts } : {}),
    baseId: m.baseId,
    agentIds: m.agentIds,
    from: m.from,
    departAt: m.departAt,
    arriveAt: m.arriveAt,
    ...(m.legs ? { legs: m.legs } : {}),
    landed: false,
  };
  m.aircraftId = w.aircraftId;
  if (w.escorts) m.escorts = w.escorts;
  else delete m.escorts;
  m.baseId = w.baseId;
  m.agentIds = w.agentIds;
  m.from = w.from;
  m.departAt = w.departAt;
  m.arriveAt = w.arriveAt;
  if (w.legs) m.legs = w.legs;
  else delete m.legs;
  m.wings = (m.wings ?? []).map((x) => (x === w ? lead : x));
}

/** Wings still in the air when the mission starts (or ends) turn back. */
export function recallWings(s: GameState, m: Mission) {
  for (const w of [...(m.wings ?? [])]) if (!w.landed) recallWing(s, m, w);
}

/** A team of a wing goes home as a mission of its own, so it flies, lands and unloads like any other. */
export function splitOff(
  s: GameState,
  m: Mission,
  w: Wing,
  agentIds: string[],
  pos: LatLon,
): Mission {
  const back: Mission = {
    ...m,
    id: `mission-${s.nextId++}`,
    aircraftId: w.aircraftId,
    baseId: w.baseId,
    agentIds,
    from: w.from,
    pos,
    phase: "returning",
    decision: null,
    option: null,
    battle: undefined,
    wings: undefined,
    waiting: false,
    legs: undefined,
  };
  if (w.escorts) back.escorts = w.escorts;
  else delete back.escorts;
  delete back.battle;
  delete back.wings;
  delete back.legs;
  m.wings = (m.wings ?? []).filter((x) => x !== w);
  s.missions.push(back);
  return back;
}

export function recallWing(s: GameState, m: Mission, w: Wing) {
  // Turned around where it is: home in the time it has flown.
  const k = Math.min(1, Math.max(0, (s.time - w.departAt) / Math.max(1, w.arriveAt - w.departAt)));
  const pos = {
    lat: w.from.lat + (m.pos.lat - w.from.lat) * k,
    lon: w.from.lon + (m.pos.lon - w.from.lon) * k,
  };
  const back = splitOff(s, m, w, w.agentIds, pos);
  back.returnStart = s.time;
  back.returnAt = ceilHour(s.time + Math.max(HOUR / 2, s.time - w.departAt));
  addLog(
    s,
    `${missionCraftName(s, back)} turns back for ${installationById(s, w.baseId)?.name ?? "home"}.`,
  );
}

/** Where a mission is now, for the globe: its current leg (while refuelling, the next one, not yet begun). */
export function missionLeg(
  m: Mission,
  now = 0,
): { from: LatLon; to: LatLon; start: number; end: number } {
  if (m.legs?.length && m.phase !== "on-site")
    return m.legs.find((l) => l.end > now) ?? m.legs[m.legs.length - 1]!;
  if (m.phase === "outbound")
    return { from: m.from, to: m.pos, start: m.departAt, end: m.arriveAt };
  if (m.phase === "returning")
    return { from: m.pos, to: m.from, start: m.returnStart, end: m.returnAt };
  return { from: m.pos, to: m.pos, start: 0, end: 0 };
}
