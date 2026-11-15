// Automated players for balance testing (scripts/batch.mjs, the probe test).
// Each policy is called once per game hour with the clock stopped on any
// event; it reads the state and issues the same commands the UI does.
//
//   idle      does nothing: the baseline the bloodlines win against.
//   responder keeps 8 agents (recruiting), answers every lead and site in
//             reach, takes cover-ups while secrecy is under 75 and money
//             allows, makes every arrival decision by best odds.
//   builder   a responder that also researches, builds containment and up to
//             3 SIGINT stations, hires staff and runs a media campaign where
//             support is slipping.
import { AIRCRAFT } from "../data/aircraft";
import { REGIONS } from "../data/regions";
import { build, buildBlocker } from "./commands";
import { coverUpAgents, coverUpBlocker, startCoverUp } from "./coverups";
import { monthlyIncome } from "./economy";
import { setMedia } from "./media";
import { dismissAsset } from "./humint";
import { availableAgents, availableAircraft, decide, dispatch, dispatchCost, type DispatchPlan } from "./missions";
import { agentsAt, basesInReach, dismissStaff, freeCells, hireBlocker, hireStaff, recruit, recruitBlocker, releaseAircraft, upgradeBase, upgradeBlocker } from "./personnel";
import { projectBlocker, startProject, visibleProjects } from "./research";
import { isReady, type GameState } from "./state";

export type PolicyId = "idle" | "responder" | "builder";
export const POLICIES: PolicyId[] = ["idle", "responder", "builder"];

/** Counters a policy keeps while it plays (summed across games by the runner; keys starting with _ are its own memory). */
export type BotStats = Record<string, number>;
const bump = (st: BotStats, k: string, by = 1) => (st[k] = (st[k] ?? 0) + by);

/** Orders for a team on the ground: the option with the best odds (or the first). */
export function decideArrivals(s: GameState, st: BotStats) {
  const e = s.events[0];
  if (e?.kind !== "arrival" || !e.refId) return;
  const m = s.missions.find((x) => x.id === e.refId);
  if (!m?.decision) return;
  const opts = m.decision.options.filter((o) => o.id !== "abort");
  const rank = { good: 3, fair: 2, poor: 1 } as const;
  const best = [...opts].sort((a, b) => (b.odds ? rank[b.odds] : 2) - (a.odds ? rank[a.odds] : 2))[0] ?? m.decision.options[0]!;
  decide(s, m.id, best.id);
  bump(st, `opt_${best.id}`);
}

/** Keeps the first base at 8 agents or more while money allows, best candidates first. */
function recruitUp(s: GameState, st: BotStats) {
  const home = s.installations.find((b) => b.kind === "base" && isReady(s, b));
  if (!home || agentsAt(s, home.id).length >= 8 || s.funds < reserve(s)) return;
  const best = [...s.candidates].sort((a, b) => {
    const sum = (c: typeof a) => c.stats.combat + c.stats.tradecraft + c.stats.insight + c.stats.faith;
    return sum(b) - sum(a);
  })[0];
  if (best && !recruitBlocker(s, home.id) && !recruit(s, best.id, home.id)) bump(st, "recruited");
}

/** What a sensible player does when the books don't balance: hand back the
 *  jet, let idle staff go, drop media campaigns. Checked weekly. */
function economise(s: GameState, st: BotStats) {
  const week = Math.floor(s.time / (7 * 86_400_000));
  if (st._econ === week) return;
  st._econ = week;
  const net = monthlyIncome(s).net;
  if (net >= 0 || s.funds > -net * 6) return;
  const jet = s.aircraft.find((a) => AIRCRAFT[a.kind].ownership === "leased" && !a.deployed);
  if (jet && s.aircraft.length > 1 && !releaseAircraft(s, jet.id)) return void bump(st, "cut_jet");
  for (const id of Object.keys(s.media)) if (!setMedia(s, id, null)) return void bump(st, "cut_media");
  const dearest = [...s.assets].sort((a, b) => b.monthly - a.monthly)[0];
  if (dearest && !dismissAsset(s, dearest.id)) return void bump(st, "cut_asset");
  for (const b of s.installations)
    for (const k of ["engineer", "scientist"] as const)
      if (!dismissStaff(s, b.id, k)) return void bump(st, "cut_staff");
}

/** Money the bot keeps back: a few months of losses, at least $1.5M. */
const reserve = (s: GameState) => Math.max(1_500_000, -monthlyIncome(s).net * 4);

function respond(s: GameState, st: BotStats) {
  economise(s, st);
  recruitUp(s, st);
  const targets = [
    ...s.leads.filter((l) => !l.missionId).map((l) => ({ kind: "lead" as const, id: l.id, pos: l.pos, lk: l.kind })),
    ...s.sites.filter((x) => !x.missionId).map((x) => ({ kind: "site" as const, id: x.id, pos: x.pos, lk: null, lair: x.kind === "lair" })),
  ];
  for (const t of targets) {
    const b = basesInReach(s, t.pos)[0];
    if (!b) continue;
    const agents = availableAgents(s, b.base.id).sort((a, c) => c.stats.combat - a.stats.combat);
    const air = availableAircraft(s, b.base.id)
      .filter((a) => AIRCRAFT[a.kind].reachNm >= b.distance)
      .sort((a, c) => AIRCRAFT[a.kind].noise - AIRCRAFT[c.kind].noise)[0];
    if (!air || !agents.length) continue;
    const strike = t.kind === "site" || t.lk === "rescue";
    const lair = "lair" in t && t.lair;
    // A lair takes everyone: wait until there are at least 8 fit agents.
    if (lair && agents.length < 8) continue;
    const n = Math.min(lair ? AIRCRAFT[air.kind].seats : strike ? 5 : 2, agents.length);
    const p: DispatchPlan = {
      target: { kind: t.kind, id: t.id }, baseId: b.base.id, aircraftId: air.id,
      agentIds: agents.slice(0, n).map((a) => a.id), kit: strike ? "tactical" : "plainclothes",
    };
    const c = dispatchCost(s, p);
    if (!c || c.lateBy > 0) continue;
    if (!dispatch(s, p)) {
      bump(st, "dispatched");
      bump(st, "noise", c.secrecy);
    }
  }
  for (const c of s.coverUps) {
    if (c.startedAt || s.secrecy >= 75 || s.funds < c.cost + reserve(s)) continue;
    const ids = coverUpAgents(s).sort((a, b) => b.stats[c.stat] - a.stats[c.stat]).slice(0, c.agents).map((a) => a.id);
    if (coverUpBlocker(s, c, ids)) continue;
    startCoverUp(s, c.id, ids);
    bump(st, "coverups");
    bump(st, "coverSpend", c.cost / 1e6);
  }
}

/** Research order for the builder: cheap and useful first, then the vampire line. */
const PRIORITY = [
  "field-medicine", "signal-analysis", "station-retrofit", "composite-armour", "ceramic-plate", "vampire-physiology",
  "uv-weaponry", "uv-munitions", "haematology", "pheromones", "interrogate-vampire", "interrogate-thrall",
];

function develop(s: GameState, st: BotStats) {
  const bases = s.installations.filter((b) => b.kind === "base" && isReady(s, b));
  // Research and engineering: each base puts its free staff on the next project it can run.
  for (const kind of ["research", "engineering"] as const) {
    const options = visibleProjects(s, kind).sort((a, b) => {
      const ia = PRIORITY.indexOf(a.id), ib = PRIORITY.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const base of bases)
      for (const p of options) {
        if (p.id === "build-helicopter") continue;
        if (p.cost && s.funds < p.cost + reserve(s)) continue;
        if (projectBlocker(s, p.id, base.id)) continue;
        if (!startProject(s, p.id, base.id)) bump(st, `started_${kind}`);
        break;
      }
  }
  // Once a week: containment at the first base, more scientists, another station, media.
  const week = Math.floor(s.time / (7 * 86_400_000));
  if (st._week === week) return;
  st._week = week;
  const home = bases[0];
  if (!home) return;
  if (freeCells(home) <= 0 && s.funds > 3_000_000 && !upgradeBlocker(s, home.id, "containment") && (home.containment ?? 0) < 1) {
    if (!upgradeBase(s, home.id, "containment")) bump(st, "built_containment");
  }
  if (s.funds > 2_500_000 && monthlyIncome(s).net > 100_000 && !hireBlocker(s, home.id, "scientist")) {
    if (!hireStaff(s, home.id, "scientist")) bump(st, "hired");
  }
  if (s.funds > 4_000_000 && s.installations.filter((i) => i.kind === "sigint").length < 3) {
    // A new station where support allows and none listens yet: the best-funded such region.
    const heard = new Set(s.installations.filter((i) => i.kind === "sigint").map((i) => i.regionId));
    const pick = REGIONS.filter((r) => !heard.has(r.id) && !buildBlocker(s, "sigint", r.id)).sort((a, b) => b.funding - a.funding)[0];
    if (pick && !build(s, "sigint", pick.id, pick.label)) bump(st, "built_sigint");
  }
  // Media: a quiet campaign wherever we have an installation and support is under +1.
  for (const i of s.installations) {
    const sup = s.regions[i.regionId]?.support ?? 0;
    const on = s.media[i.regionId];
    if (sup < 1 && !on && s.funds > 1_500_000) setMedia(s, i.regionId, 1) || bump(st, "media_on");
    else if (sup >= 2.5 && on) setMedia(s, i.regionId, null);
  }
}

/** One hourly turn for a policy. The clock is stopped while events wait. */
export function playTurn(s: GameState, policy: PolicyId, st: BotStats) {
  if (policy === "idle") return;
  respond(s, st);
  if (policy === "builder") develop(s, st);
}
