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
//   campaign  plays the story (docs/design/story.md): builds a base outside
//             Europe at once, springs the fall with everyone aboard the jet
//             once it's ready, arms the new base, puts stations over the
//             homelands of the bloodline it's closest to finishing, storms
//             lairs, and in Act III rebuilds in Europe for Montségur.
import type { ItemId } from "../../data/equipment";
import { issueBest, stockAt } from "../people/equipment";
import { AIRCRAFT } from "../../data/aircraft";
import { AGNES, BLOODLINES, bloodlineById } from "../../data/bloodlines";
import { FACILITIES, INSTALLATIONS } from "../../data/installations";
import { neighboursOf, REGIONS, regionById } from "../../data/regions";
import { isDestroyed, isDormant, ownerOf } from "../campaign/bloodlines";
import { knowledgeOf } from "../intel/networks";
import {
  caseOf,
  collection,
  confidence,
  discardLead,
  fixLead,
  MAX_EVIDENCE,
  setFind,
} from "../intel/intel";
import { distanceNm } from "../core/geo";
import { isEurope } from "../campaign/story";
import type { LatLon } from "../core/time";
import { build, buildBlocker } from "../core/commands";
import { coverUpAgents, coverUpBlocker, startCoverUp } from "../campaign/coverups";
import { primaryStat } from "../intel/judged";
import { monthlyIncome } from "../economy/economy";
import { setMedia } from "../campaign/media";
import { dismissAsset } from "../intel/humint";
import {
  availableAgents,
  availableAircraft,
  dispatch,
  dispatchCost,
  type DispatchPlan,
} from "../missions/dispatch";
import { decide } from "../missions/arrival";
import {
  acquireAircraft,
  acquireBlocker,
  agentsAt,
  basesInReach,
  canReach,
  facilityCount,
  freeCells,
  hireBlocker,
  staffAt,
  releaseAircraft,
  upgradeBase,
  upgradeBlocker,
  setStaffLead,
  staffAtWork,
  candidatesOf,
  dismiss,
  hire,
  staffOf,
} from "../people/personnel";
import { projectBlocker, queueJob, startProject, visibleProjects } from "../base/research";
import { engineeringQueue, teamOn, topOfQueue } from "../base/engineering";
import { researchQueue, researchTeam, topOfResearch } from "../base/science";
import { projectById } from "../../data/research";
import {
  demandOf,
  GOOD_IDS,
  onOrder,
  placeOrder,
  sellArtifact,
  sellBlocker,
  sellGood,
  stockOf,
} from "../economy/market";
import {
  isReady,
  type GameState,
  type Installation,
  isCraftDeployed,
  basesOf,
  Candidate,
  installationById,
  leadById,
  missionById,
} from "../core/state";

export type PolicyId = "idle" | "responder" | "builder" | "campaign";
export const POLICIES: PolicyId[] = ["idle", "responder", "builder", "campaign"];

/** Counters a policy keeps while it plays (summed across games by the runner; keys starting with _ are its own memory). */
export type BotStats = Record<string, number>;
const bump = (st: BotStats, k: string, by = 1) => (st[k] = (st[k] ?? 0) + by);

/** Orders for a team on the ground: the option with the best odds (or the first). A thrifty
 *  bot recruits a source only while the books are comfortably in the black. */
export function decideArrivals(s: GameState, st: BotStats, thrifty = false) {
  const e = s.events[0];
  if (e?.kind !== "arrival" || !e.refId) return;
  const m = missionById(s, e.refId);
  if (!m?.decision) return;
  const affordable = !thrifty || (monthlyIncome(s).net > 150_000 && s.funds > 1_500_000);
  const opts = m.decision.options.filter(
    (o) => o.id !== "abort" && (o.id !== "recruit" || affordable),
  );
  const rank = { good: 3, fair: 2, poor: 1 } as const;
  const best =
    [...opts].sort((a, b) => (b.odds ? rank[b.odds] : 2) - (a.odds ? rank[a.odds] : 2))[0] ??
    m.decision.options[0]!;
  decide(s, m.id, best.id);
  bump(st, `opt_${best.id}`);
}

/** Keeps a base (the first, by default) at `target` agents while money allows, best candidates first. */
function recruitUp(
  s: GameState,
  st: BotStats,
  home = s.installations.find((b) => b.kind === "base" && isReady(s, b)),
  target = 8,
) {
  if (!home || agentsAt(s, home.id).length >= target || s.funds < reserve(s)) return;
  const sum = (c: Candidate) =>
    Object.values(c.aptitudes).reduce((t: number, v) => t + (v ?? 0), 0);
  const best = candidatesOf(s, "operator").sort((a, b) => sum(b) - sum(a))[0];
  if (best && !hireBlocker(s, home.id, "operator") && !hire(s, home.id, "operator", best.id))
    bump(st, "recruited");
}

/** What a sensible player does when the books don't balance: hand back the
 *  jet, let idle staff go, drop media campaigns. Checked weekly. */
function economise(s: GameState, st: BotStats) {
  const week = Math.floor(s.time / (7 * 86_400_000));
  if (st._econ === week) return;
  st._econ = week;
  const net = monthlyIncome(s).net;
  if (net >= 0 || s.funds > -net * 6) return;
  const jet = s.aircraft.find(
    (a) => AIRCRAFT[a.kind].ownership === "leased" && !isCraftDeployed(s, a),
  );
  if (jet && s.aircraft.length > 1 && !releaseAircraft(s, jet.id)) return void bump(st, "cut_jet");
  for (const id of Object.keys(s.media))
    if (!setMedia(s, id, null)) return void bump(st, "cut_media");
  const dearest = [...s.assets].sort((a, b) => b.monthly - a.monthly)[0];
  if (dearest && !dismissAsset(s, dearest.id)) return void bump(st, "cut_asset");
  for (const b of s.installations)
    for (const k of ["engineer", "scientist"] as const) {
      const last = staffOf(s, b.id, k)
        .filter((p) => !p.arriveAt)
        .at(-1);
      if (last && !dismiss(s, last.id)) return void bump(st, "cut_staff");
    }
}

/** Money the bot keeps back: a few months of losses, at least $1.5M (the campaign bot runs leaner: $400k). */
let reserveFloor = 1_500_000;
const reserve = (s: GameState) => Math.max(reserveFloor, -monthlyIncome(s).net * 4);

interface RespondOptions {
  /** Don't send teams from this base (the campaign bot holding Padua back until the fall). */
  hold?: (baseId: string) => boolean;
  /** Send everyone available from this base (springing the fall with all aboard). */
  everyone?: (baseId: string) => boolean;
  /** The house the analysts should look at. */
  house?: string;
}

/** Leads below this confidence are dropped; above BOT_COMMIT a team goes; between, the analysts work them. */
const BOT_DROP = 0.2;
const BOT_COMMIT = 0.55;

/** The intelligence section: look where we hunt, drop what's likely noise, work the doubtful. */
function analyse(s: GameState, st: BotStats, house?: string) {
  // The section finds the leads: keep analysts at work (one when money is short, three when there's plenty), not at a base about to fall.
  const net = monthlyIncome(s).net;
  const want = s.funds > 3_000_000 ? 3 : net > 0 || s.funds > 1_500_000 ? 2 : 1;
  if (staffAtWork(s, "analyst").length < want && s.funds > 150_000) {
    const safe = (b: Installation) =>
      b.kind === "base" &&
      isReady(s, b) &&
      !(
        s.story.act === 1 &&
        isEurope(b.regionId) &&
        s.installations.some((x) => x.kind === "base" && !isEurope(x.regionId))
      );
    const at = s.installations.find((b) => safe(b) && !hireBlocker(s, b.id, "analyst"));
    if (at && !hire(s, at.id, "analyst")) bump(st, "hired_analyst");
    // Analysts work in a fusion centre: with nowhere to put one, build one (a new base starts without).
    if (!at && !s.installations.some((b) => (b.upgrades ?? []).some((u) => u.kind === "fusion"))) {
      const home = s.installations.find((b) => safe(b) && !upgradeBlocker(s, b.id, "fusion"));
      if (home && s.funds > FACILITIES.fusion.cost + 150_000 && !upgradeBase(s, home.id, "fusion"))
        bump(st, "built_fusion");
    }
  }
  // With no house named, keep looking where we are, unless that house is gone or quiet: then the nearest.
  const cur = s.section.find
    ? s.section.find.kind === "house"
      ? s.section.find.id
      : (ownerOf(s.section.find.id) ?? null)
    : null;
  if (!house && (!cur || isDestroyed(s, cur) || isDormant(s, cur)))
    house =
      quarry(
        s,
        s.installations.filter(
          (b) => b.kind === "base" && !(s.story.act < 3 && isEurope(b.regionId)),
        ),
      )?.id ??
      cur ??
      undefined;
  // Look closely where we can act: the house's region in reach of a base with the best collection (a station), else the whole house.
  if (house) {
    const b = bloodlineById(house)!;
    const fighting = s.installations.filter((x) => x.kind === "base" && isReady(s, x));
    const near = b.homeRegions
      .filter((r) => fighting.some((x) => distanceNm(x.pos, regionById(r)!.label) <= NEAR))
      .map((r) => ({ r, w: collection(s, r).sigint + collection(s, r).humint }))
      .sort((x, y) => y.w - x.w)[0];
    const want =
      near && near.w > 0
        ? { kind: "region" as const, id: near.r }
        : { kind: "house" as const, id: house };
    if (s.section.find?.kind !== want.kind || s.section.find.id !== want.id) setFind(s, want);
  }
  for (const l of [...s.leads])
    if (!l.missionId && confidence(s, l) < BOT_DROP && !discardLead(s, l.id))
      bump(st, "dropped_lead");
  // A case that's settled either way needs no more work.
  const working = leadById(s, s.section.fixing);
  if (working && (confidence(s, working) >= BOT_COMMIT || confidence(s, working) < BOT_DROP))
    fixLead(s, null);
  if (s.section.fixing) return;
  const doubtful = s.leads
    .filter(
      (l) =>
        !l.missionId &&
        confidence(s, l) < BOT_COMMIT &&
        (caseOf(s, l)?.evidence.length ?? MAX_EVIDENCE) < MAX_EVIDENCE,
    )
    .sort((a, b) => confidence(s, b) - confidence(s, a))[0];
  if (doubtful && !fixLead(s, doubtful.id)) bump(st, "fixed_lead");
}

function respond(s: GameState, st: BotStats, o: RespondOptions = {}) {
  economise(s, st);
  if (!o.hold) recruitUp(s, st);
  analyse(s, st, o.house);
  const targets = [
    ...s.leads
      .filter((l) => !l.missionId && confidence(s, l) >= BOT_COMMIT)
      .map((l) => ({ kind: "lead" as const, id: l.id, pos: l.pos, lk: l.kind })),
    ...s.sites
      .filter((x) => !x.missionId)
      .map((x) => ({
        kind: "site" as const,
        id: x.id,
        pos: x.pos,
        lk: null,
        lair: x.kind === "lair",
      })),
  ];
  for (const t of targets) {
    const b = basesInReach(s, t.pos).find((x) => !o.hold?.(x.base.id));
    if (!b) continue;
    const agents = availableAgents(s, b.base.id).sort(
      (a, c) => c.aptitudes.combat - a.aptitudes.combat,
    );
    const all = o.everyone?.(b.base.id) ?? false;
    const air = availableAircraft(s, b.base.id)
      .filter((a) => canReach(s, b.base.pos, t.pos, a.kind))
      .sort((a, c) =>
        all
          ? AIRCRAFT[c.kind].seats - AIRCRAFT[a.kind].seats
          : AIRCRAFT[a.kind].noise - AIRCRAFT[c.kind].noise,
      )[0];
    if (!air || !agents.length) continue;
    const strike = t.kind === "site" || t.lk === "rescue";
    const lair = "lair" in t && t.lair;
    // A lair takes everyone: wait until there are at least 8 fit agents.
    if (lair && agents.length < 8) continue;
    const n = Math.min(lair || all ? AIRCRAFT[air.kind].seats : strike ? 5 : 2, agents.length);
    const p: DispatchPlan = {
      target: { kind: t.kind, id: t.id },
      baseId: b.base.id,
      aircraftId: air.id,
      agentIds: agents.slice(0, n).map((a) => a.id),
      kit: strike || all ? "tactical" : "plainclothes",
    };
    const c = dispatchCost(s, p);
    if (!c || c.lateBy > 0) continue;
    for (const id of p.agentIds) issueBest(s, id, p.kit); // kit up from the armoury
    if (!dispatch(s, p)) {
      bump(st, "dispatched");
      bump(st, "noise", c.secrecy);
    }
  }
  for (const c of s.coverUps) {
    // Cover-ups only when secrecy needs it; asset calls and disinformation whenever money allows.
    if (
      c.startedAt ||
      ((c.kind ?? "coverup") === "coverup" && s.secrecy >= 75) ||
      s.funds < c.cost + reserve(s)
    )
      continue;
    const stat = primaryStat(c.weights);
    const ids = coverUpAgents(s)
      .sort((a, b) => b.aptitudes[stat] - a.aptitudes[stat])
      .slice(0, c.agents)
      .map((a) => a.id);
    if (coverUpBlocker(s, c, ids)) continue;
    startCoverUp(s, c.id, ids);
    bump(st, "coverups");
    bump(st, "coverSpend", c.cost / 1e6);
  }
}

/** Research order for the builder: cheap and useful first, then the vampire line. */
const PRIORITY = [
  "field-medicine",
  "signal-analysis",
  "station-retrofit",
  "composite-armour",
  "ceramic-plate",
  "vampire-physiology",
  "uv-weaponry",
  "uv-munitions",
  "haematology",
  "pheromones",
  "interrogate-vampire",
  "interrogate-thrall",
  "make-plasma",
  "make-blockers",
  "make-sterilisers",
  "make-inserts",
];

/** The dark web: sell whatever is in stock while its buyers are keen, everything when money is short.
 *  Keeps one set of remains for vampire research until that's done. */
function trade(s: GameState, st: BotStats) {
  const short = s.funds < reserve(s);
  for (const id of GOOD_IDS) {
    const keep = id === "tissue" && !s.research.done.includes("vampire-physiology") ? 1 : 0;
    if (stockOf(s, id) <= keep || sellBlocker(s, id)) continue;
    if ((demandOf(s, id) >= 0.85 || short) && !sellGood(s, id)) bump(st, `sold_${id}`);
  }
  const piece = s.market.artifacts[0];
  if (piece && (demandOf(s, "artifacts") >= 0.8 || short) && !sellArtifact(s, piece.id))
    bump(st, "sold_artifact");
}

/**
 * The bot's steady habits: keep the research and workshop queues going and
 * the best leads named; once a week, stock the armouries, build and hire as
 * money allows, and run quiet media campaigns where support is weak.
 */
function develop(s: GameState, st: BotStats, stations = true, labs = false) {
  const bases = s.installations.filter((b) => b.kind === "base" && isReady(s, b) && !b.cell);
  for (const kind of ["research", "engineering"] as const) queueProjects(s, st, bases, kind);
  nameResearchLead(s);
  nameEngineeringLeads(s, bases);
  // Once a week from here.
  const week = Math.floor(s.time / (7 * 86_400_000));
  if (st._week === week) return;
  st._week = week;
  // The main base: one abroad once there is one (Padua won't last).
  const home = bases.find((b) => !isEurope(b.regionId)) ?? bases[0];
  if (!home) return;
  stockArmouries(s, st, bases);
  buildContainment(s, st, home);
  hireScientist(s, st, home);
  if (labs) setUpNewBase(s, st, home);
  if (stations) buildStation(s, st);
  runMedia(s, st);
}

/**
 * Research: keep two topics in the Order's queue (a captive's questioning at
 * the base that holds it). Engineering: a base queues one job at a time
 * (goods two at a time while the shelf is nearly empty).
 */
function queueProjects(
  s: GameState,
  st: BotStats,
  bases: Installation[],
  kind: "research" | "engineering",
) {
  const rank = (id: string) => {
    const i = PRIORITY.indexOf(id);
    return i < 0 ? 99 : i;
  };
  const options = visibleProjects(s, kind).sort((a, b) => rank(a.id) - rank(b.id));
  for (const base of bases) {
    const busy = engineeringQueue(s, base.id).some((a) => !projectById(a.projectId)?.product);
    if (kind === "engineering" && busy) continue;
    if (kind === "research" && researchQueue(s).length >= 2) continue;
    for (const p of options) {
      if (p.id === "build-helicopter") continue;
      if (p.cost && s.funds < p.cost + reserve(s)) continue;
      // One line per product, and only while the shelf is nearly empty.
      if (p.product) {
        const stocked = stockOf(s, p.product) >= 2;
        const running = s.projects.some((a) => a.projectId === p.id);
        if (stocked || running || demandOf(s, p.product) < 0.5) continue;
      }
      if (projectBlocker(s, p.id, base.id)) continue;
      const error = p.product ? queueJob(s, p.id, base.id, 2) : startProject(s, p.id, base.id);
      if (!error) bump(st, `started_${kind}`);
      break;
    }
  }
}

/** Name the lead scientist best for the top topic (none, if nobody beats the team without one). */
function nameResearchLead(s: GameState) {
  const topic = topOfResearch(s);
  const tp = topic && projectById(topic.projectId);
  if (!tp) return;
  const none = researchTeam(s, tp, null).rate;
  const best = staffAtWork(s, "scientist")
    .map((e) => ({ id: e.id, rate: researchTeam(s, tp, e.id).rate }))
    .sort((x, y) => y.rate - x.rate)[0];
  if (best && best.rate > none && s.leadScientist !== best.id)
    setStaffLead(s, "scientist", best.id);
  else if ((!best || best.rate <= none) && s.leadScientist) setStaffLead(s, "scientist", null);
}

/** At each base, name the lead engineer best for the top job. */
function nameEngineeringLeads(s: GameState, bases: Installation[]) {
  for (const base of bases) {
    const top = topOfQueue(s, base.id);
    const p = top && projectById(top.projectId);
    if (!p) continue;
    const none = teamOn(s, base, p, null).rate;
    const best = staffAtWork(s, "engineer", base.id)
      .map((e) => ({ id: e.id, rate: teamOn(s, base, p, e.id).rate }))
      .sort((x, y) => y.rate - x.rate)[0];
    if (best && best.rate > none && base.leadEngineer !== best.id)
      setStaffLead(s, "engineer", best.id, base.id);
    else if (best && best.rate <= none && base.leadEngineer)
      setStaffLead(s, "engineer", null, base.id);
  }
}

/** Keep a strike team's worth of tactical kit at each base, and some consumables. */
function stockArmouries(s: GameState, st: BotStats, bases: Installation[]) {
  const want: Partial<Record<ItemId, number>> = {
    rifle: 4,
    "tactical-vest": 4,
    incendiary: 6,
    medkit: 4,
  };
  for (const b of bases) {
    const items: Partial<Record<ItemId, number>> = {};
    for (const [item, n] of Object.entries(want) as [ItemId, number][]) {
      const short = n - stockAt(b, item) - onOrder(s, b.id, item);
      if (short > 0) items[item] = short;
    }
    const n = Object.values(items).reduce((t, k) => t + (k ?? 0), 0);
    if (n && s.funds > 600_000 + reserve(s) && !placeOrder(s, { items, info: [], baseId: b.id }))
      bump(st, "bought_kit", n);
  }
}

/** Containment at the main base once its cells are full and money allows. */
function buildContainment(s: GameState, st: BotStats, home: Installation) {
  if (freeCells(home) > 0 || s.funds <= 3_000_000) return;
  if (upgradeBlocker(s, home.id, "containment") || facilityCount(home, "containment") >= 1) return;
  if (!upgradeBase(s, home.id, "containment")) bump(st, "built_containment");
}

/** Another scientist while the money comes in. */
function hireScientist(s: GameState, st: BotStats, home: Installation) {
  if (s.funds <= 2_500_000 || monthlyIncome(s).net <= 100_000) return;
  if (hireBlocker(s, home.id, "scientist")) return;
  if (!hire(s, home.id, "scientist")) bump(st, "hired");
}

/** A new base starts with no labs: a laboratory first, then a workshop, and a few staff for each. */
function setUpNewBase(s: GameState, st: BotStats, home: Installation) {
  const net = monthlyIncome(s).net;
  const canBuild = (kind: "lab" | "workshop") =>
    s.funds > 1_200_000 + reserve(s) && !upgradeBlocker(s, home.id, kind);
  if (!facilityCount(home, "lab") && canBuild("lab")) {
    if (!upgradeBase(s, home.id, "lab")) bump(st, "built_lab");
  } else if (
    facilityCount(home, "lab") &&
    !facilityCount(home, "workshop") &&
    canBuild("workshop")
  ) {
    if (!upgradeBase(s, home.id, "workshop")) bump(st, "built_workshop");
  }
  for (const k of ["scientist", "engineer"] as const) {
    const affordable = (net > -100_000 || s.funds > 2_000_000) && s.funds > 300_000 + reserve(s);
    if (staffAt(s, home, k) < 4 && affordable && !hireBlocker(s, home.id, k))
      if (!hire(s, home.id, k)) bump(st, `hired_${k}`);
  }
}

/** Up to three SIGINT stations: a new one where support allows and none listens yet, in the best-funded such region. */
function buildStation(s: GameState, st: BotStats) {
  const stations = s.installations.filter((i) => i.kind === "sigint");
  if (s.funds <= 4_000_000 || stations.length >= 3) return;
  const heard = new Set(stations.map((i) => i.regionId));
  const pick = REGIONS.filter((r) => !heard.has(r.id) && !buildBlocker(s, "sigint", r.id)).sort(
    (a, b) => b.funding - a.funding,
  )[0];
  if (pick && !build(s, "sigint", pick.id, pick.label)) bump(st, "built_sigint");
}

/** Media: a quiet campaign wherever we have an installation and support is under +1; stopped once it's +2.5. */
function runMedia(s: GameState, st: BotStats) {
  for (const i of s.installations) {
    const support = s.regions[i.regionId]?.support ?? 0;
    const on = s.media[i.regionId];
    if (support < 1 && !on && s.funds > 1_500_000) {
      if (!setMedia(s, i.regionId, 1)) bump(st, "media_on");
    } else if (support >= 2.5 && on) setMedia(s, i.regionId, null);
  }
}

// ---------------------------------------------------------------------------
// The campaign bot
// ---------------------------------------------------------------------------

const JET_REACH = AIRCRAFT.jet.reachNm;
const serpenta = new Set(bloodlineById(AGNES)!.homeRegions);
const lesserAlive = (s: GameState) =>
  BLOODLINES.filter((b) => b.id !== AGNES && !isDestroyed(s, b.id));

/** How far the bot looks for work around a base: a region and its neighbours (with some slack, regions are big).
 *  Fixed, not tied to the helicopter's reach: a longer reach shouldn't make the bot spread itself thinner. */
const NEAR = 585;

/** Homeland regions of the living lesser bloodlines near a point (where a helicopter could work). */
function reachScore(s: GameState, pos: LatLon): number {
  let n = 0;
  for (const b of lesserAlive(s))
    for (const id of b.homeRegions) {
      const r = regionById(id);
      if (r && distanceNm(pos, r.label) <= NEAR) n++;
    }
  return n;
}

/** Where to build: the buildable region whose label scores best (abroad: never Europe or Agnes's lands). */
function bestRegion(
  s: GameState,
  kind: "base" | "sigint",
  ok: (id: string) => boolean,
  score: (pos: LatLon, id: string) => number,
) {
  return REGIONS.filter((r) => ok(r.id) && !buildBlocker(s, kind, r.id))
    .map((r) => ({ r, v: score(r.label, r.id) }))
    .sort((a, b) => b.v - a.v)[0]?.r;
}

/** The bloodline to hunt: the living lesser one whose homelands are nearest our bases (then the one we know most about). */
function quarry(s: GameState, bases: { pos: LatLon }[]) {
  const near = (id: string) =>
    bloodlineById(id)!.homeRegions.filter((r) =>
      bases.some((x) => distanceNm(x.pos, regionById(r)!.label) <= NEAR),
    ).length;
  return [...lesserAlive(s)].sort(
    (a, b) => near(b.id) - near(a.id) || knowledgeOf(s, b.id) - knowledgeOf(s, a.id),
  )[0];
}

function campaignPlan(s: GameState, st: BotStats) {
  const day = Math.floor(s.time / 86_400_000);
  if (st._plan === day) return;
  st._plan = day;
  const act = s.story.act;
  const bases = basesOf(s);
  const abroad = bases.filter((b) => !isEurope(b.regionId) && !b.cell);
  const baseCost = INSTALLATIONS.base.buildCost;

  // 1. A real base outside Europe, as soon as money allows (in Act I before anything else).
  // Somewhere friendly that no bloodline calls home (its media would erode us), with the most to reach.
  const homeland = (id: string) =>
    BLOODLINES.some((b) => !isDestroyed(s, b.id) && b.homeRegions.includes(id));
  if (!abroad.length && s.funds >= baseCost + 600_000) {
    const r = bestRegion(
      s,
      "base",
      (id) => !isEurope(id) && !serpenta.has(id),
      (pos, id) => reachScore(s, pos) + 3 * (s.regions[id]?.support ?? 0) - (homeland(id) ? 6 : 0),
    );
    if (r && !build(s, "base", r.id, r.label)) bump(st, "built_base_abroad");
  }
  // Act II: a second base abroad once money allows, where new homelands are in reach.
  if (act >= 2 && abroad.length === 1 && s.funds >= baseCost + 400_000) {
    const first = abroad[0]!;
    const r = bestRegion(
      s,
      "base",
      (id) =>
        !isEurope(id) &&
        !serpenta.has(id) &&
        distanceNm(regionById(id)!.label, first.pos) > NEAR * 2,
      (pos, id) => reachScore(s, pos) + 2 * (s.regions[id]?.support ?? 0),
    );
    if (r && !build(s, "base", r.id, r.label)) bump(st, "built_base_second");
  }
  // Act III: back into Europe, within reach of Montségur.
  const montsegur = bloodlineById(AGNES)!.lair!;
  if (act === 3 && !bases.some((b) => isEurope(b.regionId)) && s.funds >= baseCost + 600_000) {
    const r = bestRegion(
      s,
      "base",
      (id) => isEurope(id),
      (pos, id) => (s.regions[id]?.support ?? 0) - distanceNm(pos, montsegur) / 1000,
    );
    if (r && !build(s, "base", r.id, r.label)) bump(st, "built_base_europe");
  }

  // 2. Arm the bases we fight from with a helicopter. A jet only while a lair we've found is
  //    beyond every helicopter, handed back once it isn't (a lease is $350k a month).
  const fighting = bases.filter((x) => isReady(s, x) && !(act === 1 && isEurope(x.regionId)));
  for (const b of fighting) {
    const air = s.aircraft.filter((a) => a.baseId === b.id);
    if (
      !air.some((a) => a.kind === "helicopter") &&
      s.funds > AIRCRAFT.helicopter.price + 300_000 &&
      !acquireBlocker(s, b.id, "helicopter")
    )
      if (!acquireAircraft(s, b.id, "helicopter")) bump(st, "bought_heli");
  }
  const lairs = s.sites.filter((x) => x.kind === "lair" && !x.missionId);
  const heliReach = (pos: LatLon) =>
    s.aircraft.some(
      (a) =>
        a.kind === "helicopter" &&
        distanceNm(installationById(s, a.baseId)?.pos ?? pos, pos) <= AIRCRAFT.helicopter.reachNm,
    );
  const needJet = act >= 2 && lairs.some((l) => !heliReach(l.pos));
  const jets = s.aircraft.filter((a) => a.kind === "jet");
  if (needJet && !jets.length) {
    const b = fighting
      .map((x) => ({ x, d: Math.min(...lairs.map((l) => distanceNm(x.pos, l.pos))) }))
      .filter((y) => y.d <= JET_REACH)
      .sort((p, q) => p.d - q.d)[0]?.x;
    if (
      b &&
      s.funds > 800_000 &&
      !acquireBlocker(s, b.id, "jet") &&
      !acquireAircraft(s, b.id, "jet")
    )
      bump(st, "leased_jet");
  } else if (act >= 2 && !needJet) {
    for (const j of jets)
      if (!isCraftDeployed(s, j) && !releaseAircraft(s, j.id)) bump(st, "returned_jet");
  }

  // 3. Stations over the quarry's homelands, in reach of a base we fight from; more as the war goes on.
  const from = bases.filter((b) => !(act < 3 && isEurope(b.regionId)));
  const q = quarry(s, from);
  const stations = s.installations.filter((i) => i.kind === "sigint").length;
  const want = 2 + Math.floor(s.monthIndex / 2);
  // Stations once the base abroad has its helicopter (in Act I the money goes to base and helicopter first).
  const armedAbroad = abroad.some((b) =>
    s.aircraft.some((a) => a.baseId === b.id && a.kind === "helicopter"),
  );
  const spare = act === 1 ? (armedAbroad ? 400_000 : 1e12) : 100_000;
  const armedFrom = from.some((b) => s.aircraft.some((a) => a.baseId === b.id));
  if (stations < want && armedFrom && s.funds > INSTALLATIONS.sigint.buildCost + spare) {
    const heard = new Set(
      s.installations.filter((i) => i.kind === "sigint").map((i) => i.regionId),
    );
    // Act III: listen around Agnes. Otherwise any living lesser homeland a helicopter from our bases can work, the quarry's first.
    const lesserHomes = new Set(lesserAlive(s).flatMap((b) => b.homeRegions));
    const targets =
      act === 3 ? new Set(["france_benelux", ...neighboursOf("france_benelux")]) : lesserHomes;
    const dist = (pos: LatLon) => Math.min(...from.map((b) => distanceNm(b.pos, pos)), 1e9);
    const r = bestRegion(
      s,
      "sigint",
      (id) =>
        targets.has(id) &&
        !heard.has(id) &&
        (act === 3 || !isEurope(id)) &&
        dist(regionById(id)!.label) <= NEAR,
      (pos, id) => (q?.homeRegions.includes(id) ? 1000 : 0) - dist(pos),
    );
    if (r && !build(s, "sigint", r.id, r.label)) bump(st, "built_sigint");
  }
}

function playCampaign(s: GameState, st: BotStats) {
  // Until the base abroad has its helicopter, keep the money for it.
  const armedAbroad = s.installations.some(
    (b) =>
      b.kind === "base" &&
      !isEurope(b.regionId) &&
      s.aircraft.some((a) => a.baseId === b.id && a.kind === "helicopter"),
  );
  reserveFloor = s.story.act === 1 && !armedAbroad ? 1_300_000 : 600_000;
  campaignPlan(s, st);
  const act = s.story.act;
  const ready = (b: { readyAt: number }) => b.readyAt <= s.time;
  // Somewhere for the survivors to go (they fly out on Padua's own jet), with a helicopter waiting.
  const abroadReady = s.installations.some(
    (b) =>
      b.kind === "base" &&
      !isEurope(b.regionId) &&
      ready(b) &&
      s.aircraft.some((a) => a.baseId === b.id && a.kind === "helicopter"),
  );
  const european = (id: string) => isEurope(installationById(s, id)?.regionId ?? "");
  const nearFall = act === 1 && s.time >= s.story.fallAt - 15 * 86_400_000;
  const armed = act === 1 && s.time >= s.story.fallAt;
  respond(s, st, {
    // Close to the fall, Padua holds its people until the base abroad is ready, then sends everyone out at once.
    hold: (id) => european(id) && armed && !abroadReady,
    everyone: (id) => european(id) && armed && abroadReady,
    // Act I hunts Agnes; after, the lesser house nearest our bases.
    house:
      act === 1
        ? AGNES
        : quarry(
            s,
            s.installations.filter((b) => b.kind === "base" && !(act < 3 && isEurope(b.regionId))),
          )?.id,
  });
  // Recruit where the war will be fought: abroad once there's a base there, never at Padua near the fall.
  const main =
    s.installations.find((b) => b.kind === "base" && ready(b) && !isEurope(b.regionId)) ??
    (nearFall ? undefined : s.installations.find((b) => b.kind === "base" && ready(b)));
  recruitUp(s, st, main, act === 1 ? 8 : 9);
  // The labs only abroad (Padua's are lost when it falls), and while the books balance.
  if (act >= 2 && (monthlyIncome(s).net > 0 || s.funds > 1_500_000)) develop(s, st, false, true);
  trade(s, st);
}

/** One hourly turn for a policy. The clock is stopped while events wait. */
export function playTurn(s: GameState, policy: PolicyId, st: BotStats) {
  if (policy === "idle") return;
  reserveFloor = 1_500_000;
  if (policy === "campaign") return playCampaign(s, st);
  respond(s, st);
  if (policy === "builder") {
    develop(s, st);
    trade(s, st);
  }
}
