// Teams in the field: dispatch, the flight out, the decision on arrival,
// resolution by lead kind, revealed vampire sites, strikes, the flight home.
//
//   dispatch ──▶ outbound ──▶ on-site (arrival decision; maybe hours of work)
//                                │
//                                ▼
//                     resolve: debrief, sites, wounds ──▶ returning ──▶ home
import type { StatId } from "../data/agents";
import { AIRCRAFT } from "../data/aircraft";
import { BLOODLINES } from "../data/bloodlines";
import { KIT, type KitId } from "../data/kit";
import { regionById } from "../data/regions";
import { fight, teamSkill, winChance, type FightResult, type Threat } from "./combat";
import { changeSupport } from "./economy";
import { distanceNm } from "./geo";
import { rng, type Rng } from "./rng";
import { changeSecrecy } from "./secrecy";
import {
  addLog, isWounded, post, type Agent, type Decision, type DecisionOption, type GameState, type Lead,
  type LeadKind, type Mission, type Site, type SiteKind,
} from "./state";
import { DAY, HOUR, type LatLon } from "./time";

/** Briefing, kit and boarding before wheels-up. */
export const PREP_HOURS = 1;
/** A revealed site stays put this many days (min, max) before the bloodline moves it. */
export const SITE_LIFETIME_DAYS = [10, 16] as const;

export const SITE_KINDS: Record<SiteKind, { name: string; thralls: number; vampires: number; weight: number; description: string }> = {
  nest: { name: "Nest", thralls: 3, vampires: 1, weight: 0.6, description: "A fledgling and its keepers: a flat, a basement, a lock-up." },
  den: { name: "Den", thralls: 4, vampires: 2, weight: 0.3, description: "A working site of the bloodline: feeding, storage, a few of them by day." },
  haven: { name: "Haven", thralls: 5, vampires: 3, weight: 0.1, description: "Where an elder sleeps. Guarded, and worth it." },
};

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
  aircraftId: string;
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
}

export function targetInfo(s: GameState, t: DispatchPlan["target"]): TargetInfo | null {
  if (t.kind === "lead") {
    const l = s.leads.find((x) => x.id === t.id);
    if (!l) return null;
    const op = s.operations.find((o) => o.id === l.opId);
    return {
      pos: l.pos, title: l.title, city: l.city, regionId: l.regionId, bloodline: op?.bloodline ?? BLOODLINES[0]!.id,
      leadKind: l.kind, intel: l.intel, expiresAt: l.expiresAt, missionId: l.missionId ?? null,
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

/** What a deployment costs: secrecy (noise), money (fuel, crews), and when it arrives. */
export function dispatchCost(s: GameState, plan: DispatchPlan) {
  const target = targetInfo(s, plan.target);
  const base = s.installations.find((i) => i.id === plan.baseId);
  const air = s.aircraft.find((a) => a.id === plan.aircraftId);
  if (!target || !base || !air) return null;
  const def = AIRCRAFT[air.kind];
  const kit = KIT[plan.kit];
  const n = plan.agentIds.length;
  const distance = distanceNm(base.pos, target.pos);
  // One or two people in street clothes travel as passengers: no one notices the aircraft.
  const airNoise = plan.kit === "civilian" && n <= 2 ? 0 : def.noise;
  const secrecy = n ? Math.round((kit.noiseBase + kit.noisePerAgent * (n - 1) + airNoise) * 10) / 10 : 0;
  const money = Math.round((2 * distance * def.costPerNm) / 1000) * 1000;
  const hours = flightHours(distance, air.kind);
  const arriveAt = ceilHour(s.time + (PREP_HOURS + hours) * HOUR);
  return { secrecy, money, distance, hours, arriveAt, lateBy: Math.max(0, arriveAt - target.expiresAt) };
}

export const availableAgents = (s: GameState, baseId: string) =>
  s.agents.filter((a) => a.baseId === baseId && !a.deployed && !isWounded(s, a));
export const availableAircraft = (s: GameState, baseId: string) =>
  s.aircraft.filter((a) => a.baseId === baseId && !a.deployed);

export function dispatchBlocker(s: GameState, plan: DispatchPlan): string | null {
  if (s.gameOver) return "The campaign is over.";
  const target = targetInfo(s, plan.target);
  if (!target) return plan.target.kind === "lead" ? "That lead has gone cold." : "That site is gone.";
  if (target.missionId) return "A team is already on it.";
  const base = s.installations.find((i) => i.id === plan.baseId && i.kind === "base" && i.readyAt <= s.time);
  if (!base) return "Choose an operational base.";
  const air = s.aircraft.find((a) => a.id === plan.aircraftId);
  if (!air || air.baseId !== base.id) return "Choose an aircraft at that base.";
  if (air.deployed) return `${air.name} is already flying.`;
  const distance = distanceNm(base.pos, target.pos);
  if (distance > AIRCRAFT[air.kind].reachNm) return `${air.name} can't reach ${target.city} (${Math.round(distance)} nm).`;
  if (!plan.agentIds.length) return "Choose at least one agent.";
  if (plan.agentIds.length > AIRCRAFT[air.kind].seats) return `${air.name} seats ${AIRCRAFT[air.kind].seats}.`;
  const ready = new Set(availableAgents(s, base.id).map((a) => a.id));
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
  const air = s.aircraft.find((a) => a.id === plan.aircraftId)!;
  const cost = dispatchCost(s, plan)!;
  const m: Mission = {
    id: `mission-${s.nextId++}`,
    target: { ...plan.target },
    baseId: base.id,
    aircraftId: air.id,
    agentIds: [...plan.agentIds],
    kit: plan.kit,
    title: target.title,
    city: target.city,
    regionId: target.regionId,
    pos: { ...target.pos },
    bloodline: target.bloodline,
    leadKind: target.leadKind,
    intel: target.intel,
    from: { ...base.pos },
    departAt: s.time + PREP_HOURS * HOUR,
    arriveAt: cost.arriveAt,
    phase: "outbound",
    decision: null,
    option: null,
    workUntil: 0,
    returnStart: 0,
    returnAt: 0,
  };
  s.missions.push(m);
  air.deployed = true;
  for (const a of s.agents) if (m.agentIds.includes(a.id)) a.deployed = true;
  if (plan.target.kind === "lead") s.leads.find((l) => l.id === plan.target.id)!.missionId = m.id;
  else s.sites.find((x) => x.id === plan.target.id)!.missionId = m.id;
  s.funds -= cost.money;
  addLog(s, `${air.name} leaves ${base.name} for ${target.city} with ${m.agentIds.length} aboard.`);
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
  const res = fight(c.r, c.agents, c.m.kit, t, advantage);
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
  winChance(agents, m.kit, scaled(s, threat), advantage, m.agentIds.length + Math.round(m.arriveAt / HOUR));

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
}

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
      id: "meet",
      label: "Meet as arranged",
      detail: "A quiet table, a quiet conversation. Insight.",
      odds: odds({ insight: 1 }, 40),
      run(c) {
        if (c.m.leadKind === "double") {
          c.text.push("It was a setup. The 'source' stood up and walked to the toilets as the door opened behind us.");
          if (brawl(c, { thralls: 3, vampires: 1 }, -0.2)) {
            c.text.push("We took the 'source' alive, which they did not plan for.");
            interrogate(c, 5);
            return "success";
          }
          c.secrecy -= 2;
          return "fail";
        }
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
      detail: "Sweep the area for two hours before anyone sits down. Tradecraft. A nervous source may not wait.",
      hours: () => 2,
      odds: odds({ tradecraft: 1 }, 45),
      run(c) {
        if (c.m.leadKind === "double") {
          const res = check(c, { tradecraft: 1 }, 45 - c.m.intel * 20);
          if (res === "success") {
            c.text.push("The sweep found them: a van, two watchers, a back door propped open. It was a trap, and we sprang it first.");
            if (brawl(c, { thralls: 3, vampires: 1 }, 0.25)) {
              c.text.push("The 'source' is in our custody now.");
              interrogate(c, 10);
              return "success";
            }
            return "fail";
          }
          c.text.push("The sweep turned up nothing. Then the door opened behind us. It was a setup.");
          if (brawl(c, { thralls: 3, vampires: 1 }, -0.1)) {
            interrogate(c);
            return "success";
          }
          c.secrecy -= 2;
          return "fail";
        }
        c.used.add("tradecraft");
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
          if (brawl(c, { thralls: 2, vampires: 1 }, 0.3)) {
            c.text.push("The double agent is in our hands.");
            interrogate(c, 15);
            return "success";
          }
          return "fail";
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
          c.support += 0.35;
          c.text.push("We got her out. Pale, cold and alive.");
          reveal(c, 0.5);
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
        if (c.r.chance(0.6)) {
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
        return site ? siteOdds(m, agents, { thralls: site.thralls, vampires: Math.ceil(site.vampires * 0.4) }, 0.15) : 0;
      },
      run(c) {
        const site = c.site!;
        c.secrecy -= 1.5;
        return strike(c, { thralls: site.thralls, vampires: Math.ceil(site.vampires * 0.4) }, 0.15);
      },
    },
    {
      id: "night",
      label: "Strike at 3 a.m.",
      detail: "The streets are empty and they are awake. Tradecraft buys surprise.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 3),
      odds: (s, m, agents) => {
        const site = s.sites.find((x) => x.id === m.target.id);
        return site ? siteOdds(m, agents, { thralls: site.thralls, vampires: site.vampires }, nightAdvantage(agents, m.kit)) : 0;
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
const siteOdds = (m: Mission, agents: Agent[], threat: Threat, advantage: number) =>
  winChance(agents, m.kit, threat, advantage, m.agentIds.length + Math.round(m.arriveAt / HOUR));

const nightAdvantage = (agents: Agent[], kit: KitId) =>
  Math.max(-0.1, Math.min(0.2, (teamSkill(agents, "tradecraft", kit) - 45) / 150));

/** A strike on a site. Threat is already scaled when the site was revealed. */
function strike(c: Ctx, threat: Threat, advantage: number): Result {
  const res = fight(c.r, c.agents, c.m.kit, threat, advantage);
  c.fought = res;
  c.used.add("combat");
  c.used.add("faith");
  c.secrecy -= 0.5 + res.rounds * 0.25;
  if (res.won) {
    c.support += 0.4;
    c.intel += 20;
    c.s.nextOperation[c.m.bloodline] = (c.s.nextOperation[c.m.bloodline] ?? c.s.time) + 3 * DAY;
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
  const options = playsFor(m)
    .filter((p) => !p.whenWarned || warning)
    .map((p) => ({ id: p.id, label: p.label, detail: p.detail, odds: p.odds ? oddsWord(p.odds(s, m, agents)) : null }));
  return { situation: `The team is on the ground in ${m.city}. ${situation}`, warning, options };
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
  post(s, { kind: "arrival", title: `On the ground: ${m.title}`, body: m.decision.situation, regionId: m.regionId, pos: m.pos, refId: m.id });
}

/** The player's choice on arrival. Returns an error, or null. */
export function decide(s: GameState, missionId: string, optionId: string): string | null {
  const m = s.missions.find((x) => x.id === missionId);
  if (!m || m.phase !== "on-site" || !m.decision) return "That team is not waiting for orders.";
  if (!m.decision.options.some((o) => o.id === optionId)) return "That is not an option here.";
  const play = playsFor(m).find((p) => p.id === optionId);
  if (!play) return "That is not an option here.";
  s.events = s.events.filter((e) => !(e.kind === "arrival" && e.refId === m.id));
  m.decision = null;
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
// Resolution
// ---------------------------------------------------------------------------

const RESULT_WORDS: Record<Result, string> = { success: "Success", partial: "Partial success", fail: "Failure", abort: "Aborted" };

function resolve(s: GameState, m: Mission, play: Play) {
  const r = rng(s);
  const c: Ctx = {
    s, m, r,
    agents: missionAgents(s, m),
    lead: m.target.kind === "lead" ? (s.leads.find((l) => l.id === m.target.id) ?? null) : null,
    site: m.target.kind === "site" ? (s.sites.find((x) => x.id === m.target.id) ?? null) : null,
    text: [], secrecy: 0, support: 0, intel: 0, fought: null, used: new Set(), revealed: null,
  };
  m.option = null;
  if (!c.lead && !c.site) {
    addLog(s, `${m.city}: nothing left to do. The team heads home.`);
    startReturn(s, m);
    return;
  }
  const result = play.run(c);

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
    if (result === "abort") c.site.missionId = null;
    else s.sites = s.sites.filter((x) => x !== c.site);
  }
  if (result === "success") c.intel += 6;
  else if (result === "partial") c.intel += 2;

  if (result === "abort") {
    addLog(s, `${m.city}: the team stands down and heads home.`);
    startReturn(s, m);
    return;
  }

  // Consequences.
  const regionLabel = regionName(m.regionId);
  if (c.support) changeSupport(s, m.regionId, c.support);
  if (c.secrecy) changeSecrecy(s, c.secrecy, `operation in ${m.city}`, m);
  const intelBefore = s.intel[m.bloodline] ?? 0;
  s.intel[m.bloodline] = Math.min(100, intelBefore + c.intel);

  // People: deaths, wounds, experience.
  const dead = new Set(c.fought?.dead ?? []);
  const deadNames: string[] = [];
  const woundedNames: string[] = [];
  for (const a of c.agents) {
    const label = `${a.sister ? "Sr." : "Br."} ${a.name}`;
    if (dead.has(a.id)) {
      deadNames.push(label);
      s.fallen.push({ name: a.name, sister: a.sister, died: s.time, where: m.city });
      continue;
    }
    a.missions++;
    for (const stat of c.used) {
      const gain = result === "success" ? r.int(1, 3) : r.int(0, 1);
      a.stats[stat] = Math.min(95, a.stats[stat] + gain);
    }
    if (a.hp < a.stats.vitality * 0.75) {
      a.woundedUntil = s.time + Math.ceil((a.stats.vitality - a.hp) / 2) * DAY;
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

  post(s, {
    kind: "debrief",
    title: `${RESULT_WORDS[result]}: ${m.title}`,
    body: c.text.join("\n\n"),
    regionId: m.regionId,
    pos: c.revealed?.pos ?? m.pos,
    refId: c.revealed?.id ?? m.id,
    casualties: { dead: deadNames, wounded: woundedNames },
    effects: effects.join(" · "),
  });
  addLog(s, `${RESULT_WORDS[result]}: ${m.title}.`, result === "success" ? "good" : result === "fail" ? "bad" : "neutral");
  // If nobody survived, the aircrew bring the aircraft home empty.
  startReturn(s, m);
}

function homeBase(s: GameState, m: Mission) {
  const own = s.installations.find((i) => i.id === m.baseId && i.kind === "base");
  if (own) return own;
  // The base is gone: the nearest one left takes them in.
  return s.installations
    .filter((i) => i.kind === "base")
    .sort((a, b) => distanceNm(a.pos, m.pos) - distanceNm(b.pos, m.pos))[0];
}

function startReturn(s: GameState, m: Mission) {
  const base = homeBase(s, m);
  const air = s.aircraft.find((a) => a.id === m.aircraftId);
  m.phase = "returning";
  m.decision = null;
  if (base) m.from = { ...base.pos };
  const hours = air && base ? flightHours(distanceNm(m.pos, base.pos), air.kind) : 1;
  m.returnStart = s.time;
  m.returnAt = ceilHour(s.time + Math.max(0.5, hours) * HOUR);
}

function home(s: GameState, m: Mission) {
  const base = homeBase(s, m);
  s.missions = s.missions.filter((x) => x !== m);
  const air = s.aircraft.find((a) => a.id === m.aircraftId);
  if (!base) return;
  if (air) {
    air.deployed = false;
    air.baseId = base.id;
  }
  for (const a of s.agents)
    if (m.agentIds.includes(a.id)) {
      a.deployed = false;
      a.baseId = base.id;
    }
  addLog(s, `${air?.name ?? "The team"} is back at ${base.name}.`);
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

export function hourlyMissions(s: GameState) {
  for (const m of [...s.missions]) {
    if (s.events.some((e) => e.kind === "arrival")) break; // one decision at a time
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
    if (m?.phase === "on-site") continue;
    s.sites = s.sites.filter((x) => x !== site);
    addLog(s, `The ${SITE_KINDS[site.kind].name.toLowerCase()} in ${site.city} has gone quiet. They moved on.`);
  }
}

/** Leads being worked by a team on site don't expire. */
export const leadEngaged = (s: GameState, l: Lead) =>
  !!l.missionId && s.missions.some((m) => m.id === l.missionId && m.phase === "on-site");

/** Where a mission is now, for the globe: 0..1 along its current leg. */
export function missionLeg(m: Mission): { from: LatLon; to: LatLon; start: number; end: number } {
  if (m.phase === "outbound") return { from: m.from, to: m.pos, start: m.departAt, end: m.arriveAt };
  if (m.phase === "returning") return { from: m.pos, to: m.from, start: m.returnStart, end: m.returnAt };
  return { from: m.pos, to: m.pos, start: 0, end: 0 };
}

