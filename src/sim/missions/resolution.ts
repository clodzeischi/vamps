// Resolution: running a play to its end, the debrief, sites revealed, wounds and spoils.
import { changeFeeding, FEEDING } from "../campaign/feeding";
import { useMedkits } from "../people/equipment";
import type { OperatorAptitude } from "../../data/aptitudes";
import { fight } from "./combat";
import { changeSupport, creditAround, PLEDGE } from "../economy/economy";
import { rng } from "../core/rng";
import { destroyBloodline } from "../campaign/bloodlines";
import { afterStrike } from "../intel/networks";
import { isReal } from "../intel/intel";
import { freeCells, healPerDay } from "../people/personnel";
import { cargoLoad, carriesRemains, LOAD } from "../base/transfers";
import { holdCaptive } from "../base/research";
import { findArtifact, shortName } from "../economy/market";
import { changeSecrecy } from "../campaign/secrecy";
import {
  addLog,
  improvementLine,
  post,
  train,
  type GameState,
  type Mission,
  type Captive,
  type Cargo,
  type Aircraft,
  type Installation,
  agentName,
  installationById,
  leadById,
  missionById,
  siteById,
} from "../core/state";
import { DAY } from "../core/time";
import { type Result, type Play, type Ctx, tactical, BattleNeeded } from "./plays";
import { battleBrief } from "./battles";
import { missionAgents, regionName, SPOILS_CARRIED } from "./common";
import { startReturn, homeBase, haulSeats } from "./haul";
import { nothingThere } from "./missions";
import { missionCraft } from "./dispatch";

const RESULT_WORDS: Record<Result, string> = {
  success: "Success",
  partial: "Partial success",
  fail: "Failure",
  abort: "Aborted",
};

/**
 * Runs a play to its end. With the tactical layer on, it first runs on a copy
 * of the campaign to find out whether it comes to a fight: if it does, the
 * fight is held for the player (and the play run for real once it's settled,
 * from the same random state, so it takes the same path there); if not, it
 * runs for real now, the same way. Nothing the probe does sticks.
 */
export function resolve(
  s: GameState,
  m: Mission,
  play: Play,
  mode: Ctx["mode"] = tactical.on ? "probe" : "auto",
) {
  if (mode === "probe") {
    const fight = firstFight(s, m, play);
    if (fight) return holdBattle(s, m, play, fight);
    mode = "auto";
  }
  run(s, m, play, mode);
}

/** Where a play would first come to a fight, found on a throwaway copy of the campaign (null: it wouldn't). */
function firstFight(s: GameState, m: Mission, play: Play): BattleNeeded | null {
  const copy = structuredClone(s);
  try {
    run(copy, missionById(copy, m.id)!, play, "probe");
    return null;
  } catch (e) {
    if (e instanceof BattleNeeded) return e;
    throw e;
  }
}

/** A fight waits for the player: command it, or let the team fight it out. */
function holdBattle(s: GameState, m: Mission, play: Play, fight: BattleNeeded) {
  m.option = null;
  m.battle = {
    optionId: play.id,
    rng: s.rng,
    thralls: fight.threat.thralls,
    vampires: fight.threat.vampires,
    advantage: fight.advantage,
    site: m.target.kind === "site" ? (siteById(s, m.target.id)?.kind ?? null) : null,
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
}

/** Everything a play works on and writes into, for one run. */
function newContext(s: GameState, m: Mission, mode: Ctx["mode"]): Ctx {
  return {
    s,
    m,
    r: rng(s),
    agents: missionAgents(s, m),
    lead: m.target.kind === "lead" ? (leadById(s, m.target.id) ?? null) : null,
    site: m.target.kind === "site" ? (siteById(s, m.target.id) ?? null) : null,
    text: [],
    secrecy: 0,
    support: 0,
    clues: [],
    fought: null,
    used: new Set(),
    revealed: null,
    captive: null,
    remains: 0,
    lost: new Set(),
    spoils: 0,
    burned: null,
    mode,
  };
}

/** Runs a play for real and deals with everything it leaves behind. */
export function run(s: GameState, m: Mission, play: Play, mode: Ctx["mode"]) {
  const c = newContext(s, m, mode);
  m.option = null;
  if (!c.lead && !c.site) {
    addLog(s, `${m.city}: nothing left to do. The team heads home.`);
    startReturn(s, m);
    return;
  }
  if (c.lead && play.id !== "abort" && !isReal(s, c.lead)) return nothingThere(s, m, c.lead);

  const result = play.run(c);
  settleTarget(s, c, result);
  if (result === "abort") {
    addLog(s, `${m.city}: the team stands down and heads home.`);
    startReturn(s, m);
    return;
  }

  const dead = new Set([...(c.fought?.dead ?? []), ...c.lost]);
  const aboard = loadHaul(s, c, dead);

  if (c.support) changeSupport(s, m.regionId, c.support);
  if (c.secrecy) changeSecrecy(s, c.secrecy, `operation in ${m.city}`, m);

  const people = settlePeople(s, c, result, dead);
  const effects = [...regionEffects(c), ...c.clues];
  const seized = takeSpoils(s, c);
  if (seized) effects.push(seized);
  aboard.push(...takeRelics(s, c));
  if (result === "success") {
    let pledge = PLEDGE.success;
    if (c.burned) pledge += PLEDGE.strike;
    if (c.burned === "lair") pledge += PLEDGE.lair;
    creditAround(s, m.regionId, pledge);
  }
  for (const h of aboard) effects.push(h.charAt(0).toUpperCase() + h.slice(1));

  post(s, {
    kind: "debrief",
    title: `${RESULT_WORDS[result]}: ${m.title}`,
    body: c.text.join("\n\n"),
    regionId: m.regionId,
    pos: c.revealed?.pos ?? m.pos,
    refId: c.revealed?.id ?? m.id,
    casualties: { dead: people.dead, wounded: people.wounded },
    effects: effects.join(" · "),
    improved: people.improved,
  });
  addLog(s, `${RESULT_WORDS[result]}: ${m.title}.`, RESULT_TONE[result]);
  if (c.site?.kind === "lair" && result === "success") destroyBloodline(s, c.site.bloodline);
  leaveSite(s, m);
}

const RESULT_TONE = { success: "good", partial: "neutral", fail: "bad", abort: "neutral" } as const;

/** The lead is used up (or freed, on an abort); the site is gone, unless a lair held. */
function settleTarget(s: GameState, c: Ctx, result: Result) {
  if (c.lead) {
    const lead = c.lead;
    if (result === "abort") lead.missionId = null;
    else {
      s.leads = s.leads.filter((l) => l.id !== lead.id);
      const op = s.operations.find((o) => o.id === lead.opId);
      if (op && result === "success") {
        s.operations = s.operations.filter((o) => o !== op);
        // Foiled: the house goes hungrier.
        changeFeeding(
          s,
          op.bloodline,
          op.kind === "feeding" ? -FEEDING.foiledFeeding : -FEEDING.foiled,
        );
        c.support += 0.15;
      } else if (op) op.handled = true;
    }
  }
  if (c.site) {
    // A lair that holds stays where it is, waiting for the next assault.
    const holds = c.site.kind === "lair" && result !== "success";
    if (result === "abort" || holds) c.site.missionId = null;
    else s.sites = s.sites.filter((x) => x !== c.site);
    c.clues.push(...afterStrike(s, c.site, result));
  }
}

/**
 * The haul rides home aboard, after the survivors: a captive first, then the
 * bodies (2 of capacity each). What doesn't fit is burned. A team on a hired
 * flight hands a captive over for the trip, as before. Returns a line for
 * each thing loaded, for the debrief.
 */
function loadHaul(s: GameState, c: Ctx, dead: Set<string>): string[] {
  const { m } = c;
  const home = homeBase(s, m);
  if (!home) return [];
  const hold = haulSeats(s, { ...m, agentIds: m.agentIds.filter((id) => !dead.has(id)) });
  const aboard: string[] = [];
  if (c.captive) aboard.push(...loadCaptive(s, c, home, hold));
  if (c.remains > 0 && hold.length) aboard.push(...loadRemains(s, c, home, hold));
  return aboard;
}

type Hold = ReturnType<typeof haulSeats>;
const cargoOf = (a: Aircraft): Cargo => (a.cargo ??= { remains: 0, captives: [] });

function loadCaptive(s: GameState, c: Ctx, home: Installation, hold: Hold): string[] {
  const { m } = c;
  const kind = c.captive!;
  const what = kind === "vampire" ? "a vampire" : "a thrall";
  // Its id is taken now, whether or not it can be held (later ids stay the same).
  const taken: Captive = {
    id: `captive-${s.nextId++}`,
    kind,
    bloodline: m.bloodline,
    takenAt: s.time,
    city: m.city,
    regionId: m.regionId,
  };
  // A captive goes on an aircraft bound for a base with a free cell (a jet
  // first: helicopters keep room for bodies).
  const cellAt = (a: Aircraft) => {
    const b = installationById(s, a.baseId);
    return !!b && freeCells(b, s) > 0;
  };
  const fits = hold.filter((h) => h.room >= LOAD.captive && cellAt(h.a));
  const craft =
    fits.find((h) => h.a.kind !== "helicopter")?.a ??
    fits[0]?.a ??
    hold.find((h) => cellAt(h.a))?.a ??
    hold[0]?.a;
  const room = hold.reduce((t, h) => t + (h.a === craft ? h.room : 0), 0);
  const dest = craft ? (installationById(s, craft.baseId) ?? home) : home;

  if (freeCells(dest, s) <= 0) {
    if (kind === "vampire" || m.leadKind !== "capture")
      c.text.push(
        `They could have taken ${what} alive, but ${home.name} has no free cell to hold one. Build containment.`,
      );
    return [];
  }
  if (craft && room < LOAD.captive) {
    c.text.push(
      `They could have taken ${what} alive, but there was no room aboard ${craft.name}. A second aircraft would have carried it.`,
    );
    return [];
  }

  const aboard: string[] = [];
  if (craft) {
    cargoOf(craft).captives.push(taken);
    hold.find((h) => h.a === craft)!.room -= LOAD.captive;
    aboard.push(`${what} taken alive, aboard ${craft.name} for ${dest.name}`);
  } else if (holdCaptive(s, home, kind, m.bloodline, m.city, m.regionId)) {
    aboard.push(`${what} taken alive, held at ${home.name}`);
  }
  c.text.push(
    kind === "vampire"
      ? "One of them was taken alive, chained and hooded, and is on its way to a cell."
      : "The thrall is coming back with them for longer questioning.",
  );
  return aboard;
}

/** Sensitive site exploitation: the bodies go wherever a helicopter has room. */
function loadRemains(s: GameState, c: Ctx, home: Installation, hold: Hold): string[] {
  const aboard: string[] = [];
  let left = c.remains;
  for (const h of hold.filter((x) => carriesRemains(x.a.kind))) {
    const fit = Math.min(left, Math.max(0, Math.floor(h.room / LOAD.remains)));
    if (!fit) continue;
    cargoOf(h.a).remains += fit;
    h.room -= fit * LOAD.remains;
    left -= fit;
    const what = fit === 1 ? "Vampire remains" : `${fit} sets of vampire remains`;
    const where = installationById(s, h.a.baseId)?.name ?? home.name;
    aboard.push(`${what} aboard ${h.a.name} for cold storage at ${where}`);
  }
  if (left) {
    const loaded = c.remains - left;
    const carrier = hold.length > 1 ? "The aircraft" : hold[0]!.a.name;
    const room = !loaded
      ? "none of the bodies"
      : `only ${loaded === 1 ? "one body" : `${loaded} bodies`}`;
    c.text.push(`${carrier} had room for ${room}; the team burned the rest where they lay.`);
  }
  return aboard;
}

/** Deaths, wounds and experience. Trauma kits patch the worst wounds first. */
function settlePeople(s: GameState, c: Ctx, result: Result, dead: Set<string>) {
  const { m, r } = c;
  if (c.fought)
    useMedkits(
      s,
      c.agents.filter((a) => !dead.has(a.id)),
      m.kit,
    );
  const out = { dead: [] as string[], wounded: [] as string[], improved: [] as string[] };
  for (const a of c.agents) {
    if (dead.has(a.id)) {
      out.dead.push(agentName(a));
      s.fallen.push({ name: a.name, female: a.female, died: s.time, where: m.city });
      continue;
    }
    a.missions++;
    const gains: Partial<Record<OperatorAptitude, number>> = {};
    for (const stat of c.used)
      gains[stat] = train(a, stat, result === "success" ? r.int(1, 3) : r.int(0, 1));
    const line = improvementLine(a, gains);
    if (line) out.improved.push(line);
    if (a.hp < a.vitality * 0.75) {
      a.woundedUntil = s.time + Math.ceil((a.vitality - a.hp) / healPerDay(s)) * DAY;
      out.wounded.push(agentName(a));
    }
  }
  // Kills go to the survivors, at random.
  const survivors = c.agents.filter((a) => !dead.has(a.id));
  const kills = (c.fought?.thrallsKilled ?? 0) + (c.fought?.vampiresKilled ?? 0);
  for (let i = 0; i < kills && survivors.length; i++) r.pick(survivors).kills++;
  if (dead.size) {
    s.agents = s.agents.filter((a) => !dead.has(a.id));
    m.agentIds = m.agentIds.filter((id) => !dead.has(id));
    c.text.push(`We lost ${out.dead.join(", ")}. Requiescat in pace.`);
    for (const n of out.dead) addLog(s, `${n} fell in ${m.city}.`, "bad");
  }
  return out;
}

const signed = (n: number, digits: number) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

/** "Support in Italy +0.20 · Secrecy -1.0", when they moved enough to mention. */
function regionEffects(c: Ctx): string[] {
  const out: string[] = [];
  if (Math.abs(c.support) >= 0.05)
    out.push(`Support in ${regionName(c.m.regionId)} ${signed(c.support, 2)}`);
  if (Math.abs(c.secrecy) >= 0.1) out.push(`Secrecy ${signed(c.secrecy, 1)}`);
  return out;
}

/** The money found on site: all of it by helicopter, what the team can carry otherwise. */
function takeSpoils(s: GameState, c: Ctx): string | null {
  if (c.spoils <= 0) return null;
  // Fought by hand: what the team actually got out. Otherwise the rule of thumb.
  let share = SPOILS_CARRIED;
  if (typeof c.mode === "object" && c.mode.lootShare !== null) share = c.mode.lootShare;
  else if (missionCraft(s, c.m).some((a) => a.kind === "helicopter")) share = 1;
  const seized = Math.round((c.spoils * share) / 1_000) * 1_000;
  s.funds += seized;
  if (seized <= 0) return "The spoils were left behind";
  const carried = share >= 1 ? "" : " (what the team could carry)";
  return `Seized $${seized.toLocaleString("en-US")}${carried}`;
}

/** Eight hundred years of keeping things: from a site burned, some of it comes out with the team. */
function takeRelics(s: GameState, c: Ctx): string[] {
  if (!c.burned) return [];
  const { m } = c;
  return findArtifact(s, m.bloodline, c.burned, m.regionId, m.city).map((a) => {
    c.text.push(
      a.treasure
        ? `In the deepest room, under glass: ${a.name.toLowerCase()}.`
        : `Among what they kept: ${a.name.charAt(0).toLowerCase() + a.name.slice(1)}.`,
    );
    return `${shortName(a)} to the vault (Market)`;
  });
}

/**
 * Sensitive site exploitation: with more than one aircraft on the ground and
 * something to carry, the player may move the haul between them before
 * take-off. Otherwise they leave now (if nobody survived, the aircrew bring
 * the aircraft home empty).
 */
function leaveSite(s: GameState, m: Mission) {
  const craftHere = missionCraft(s, m);
  if (craftHere.length > 1 && craftHere.some((a) => cargoLoad(a.cargo) > 0)) {
    m.haul = true;
    post(s, {
      kind: "haul",
      title: `The haul: ${m.title}`,
      body: "Everything is aboard. Each aircraft flies home to its own base: choose which carries what.",
      regionId: m.regionId,
      pos: m.pos,
      refId: m.id,
    });
    return;
  }
  startReturn(s, m);
}
