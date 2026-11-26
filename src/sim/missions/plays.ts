// Plays: what a team can do on arrival, by lead kind, and the checks and fights behind them.
import type { Gear } from "../people/inventory";
import type { ItemId } from "../../data/equipment";
import type { OperatorAptitude } from "../../data/aptitudes";
import { type KitId } from "../../data/kit";
import { fight, winChance, type FightResult, type Threat } from "./combat";
import { skillChance, teamSkill } from "../people/skill";
import { type Rng } from "../core/rng";
import { addClues, addPage, revealFromLead } from "../intel/networks";
import {
  TRAP_BONUS,
  ASSET_KINDS,
  hasAsset,
  RATLINE_ESCAPE,
  RATLINE_FIGHT_BONUS,
  RATLINE_USE_FEE,
  recruitAsset,
} from "../intel/humint";
import { combatMods } from "../base/research";
import {
  type Agent,
  type GameState,
  type Lead,
  type LeadKind,
  type Mission,
  type Site,
  type SiteKind,
  agentName,
  siteById,
} from "../core/state";
import { DAY, HOUR } from "../core/time";
import { scaled, hoursUntilLocal, SPOILS, CAPTURE_CHANCE, SITE_KINDS } from "./common";
import { missionCraft } from "./dispatch";

export type Result = "success" | "partial" | "fail" | "abort";
type Weights = Partial<Record<OperatorAptitude, number>>;

export interface Ctx {
  s: GameState;
  m: Mission;
  r: Rng;
  agents: Agent[];
  lead: Lead | null;
  site: Site | null;
  text: string[];
  secrecy: number;
  support: number;
  /** What we climbed of the house's network: den clues, dens found, the lair (sim/intel/networks.ts). */
  clues: string[];
  fought: FightResult | null;
  used: Set<OperatorAptitude>;
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
 * The tactical layer (docs/design/tactical.md). When it's on, a play that
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
export class BattleNeeded {
  constructor(
    readonly threat: Threat,
    readonly advantage: number,
  ) {}
}

/** A fight: the auto-combat, or the battle the player fought. */
function settle(c: Ctx, threat: Threat, advantage: number): FightResult {
  if (c.mode === "probe") throw new BattleNeeded(threat, advantage);
  if (c.mode === "auto")
    return fight(c.r, c.agents, c.m.kit, threat, advantage, combatMods(c.s, c.m.kit));
  const o = c.mode;
  return {
    won: o.won,
    rounds: Math.min(10, Math.ceil(o.turns * 0.7)),
    dead: o.dead,
    wounded: Object.entries(o.health)
      .filter(([, h]) => h < 1)
      .map(([id]) => id),
    thrallsKilled: o.thrallsKilled,
    vampiresKilled: o.vampiresKilled,
  };
}

export interface Play {
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

/** Points of margin a play's checks gain per unit of intel above an even 0.5 (perfect intel +7.5, none −7.5). */
const INTEL_EDGE = 15;

/** Chance of a skill check passing (sim/people/skill.ts). Intel helps. */
function checkChance(agents: Agent[], kit: KitId, intel: number, w: Weights, difficulty: number) {
  let skill = 0;
  for (const [stat, weight] of Object.entries(w))
    skill += weight * teamSkill(agents, stat as OperatorAptitude, kit);
  return skillChance(skill - difficulty + (intel - 0.5) * INTEL_EDGE);
}

/** A skill check: success, partial (roughly half of the misses) or fail. */
function check(c: Ctx, w: Weights, difficulty: number): Exclude<Result, "abort"> {
  for (const k of Object.keys(w)) c.used.add(k as OperatorAptitude);
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

const fightOdds =
  (threat: Threat, advantage: number) => (s: GameState, m: Mission, agents: Agent[]) =>
    winChance(
      agents,
      m.kit,
      scaled(s, threat),
      advantage,
      m.agentIds.length + Math.round(m.arriveAt / HOUR),
      combatMods(s, m.kit),
    );

/** The site behind the lead, if the thread leads anywhere (sim/intel/networks.ts). */
function reveal(c: Ctx, chance: number) {
  if (c.revealed || !c.r.chance(chance)) return;
  const { s, m } = c;
  const op = c.lead ? s.operations.find((o) => o.id === c.lead!.opId) : undefined;
  const found = revealFromLead(s, m.bloodline, op?.siteId, {
    regionId: m.regionId,
    city: m.city,
    pos: m.pos,
  });
  c.revealed = found.site;
  c.clues.push(...found.lines);
  c.text.push(found.text);
}

/** Questioning a captive. */
function interrogate(c: Ctx, bonus = 0) {
  const res = check(c, { insight: 1 }, 40 - bonus);
  if (res === "success") {
    c.text.push("In the room, it all came out: names, an address, the hours they keep.");
    // A snatch: one of the house's own people, talking.
    c.clues.push(...addClues(c.s, c.m.bloodline, 1));
    addPage(c.s, c.m.bloodline);
    reveal(c, 0.65);
  } else if (res === "partial") {
    c.text.push(
      "Under questioning there was fear and fragments, but one useful address among them.",
    );
    reveal(c, 0.3);
  } else {
    c.text.push(
      "Questioning got nowhere. Whatever hold they have on him is stronger than fear of us.",
    );
  }
  c.captive = "thrall"; // kept for longer questioning, if there's a cell
}

/**
 * A double agent springs its trap (docs/design/covert.md): the meeting is
 * compromised. Unarmed, the agent at the table is taken (unless a ratline in
 * the region gets them out); armed, the team fights its way out, an escape
 * mission (auto-resolved until the tactical layer), with better odds if a
 * ratline is waiting. Winning takes the double alive.
 */
function compromised(c: Ctx, advantage: number, bonus = 5): Result {
  const ratline = hasAsset(c.s, c.m.regionId, "ratline");
  if (c.m.kit === "civilian") {
    const victim = [...c.agents].sort((a, b) => b.aptitudes.insight - a.aptitudes.insight)[0];
    c.secrecy -= 2;
    if (!victim) return "fail";
    const who = `${agentName(victim)}`;
    if (ratline && c.r.chance(RATLINE_ESCAPE)) {
      c.s.funds -= RATLINE_USE_FEE;
      c.text.push(
        `It was a setup: the door opened behind ${who} and the room filled. ${who} went out through the kitchen and into our ratline, and was over the border by morning.`,
      );
      return "fail";
    }
    c.lost.add(victim.id);
    c.text.push(
      `It was a setup. They were waiting, and ${who} was unarmed. They took ${victim.female ? "her" : "him"} out between two of them. The rest of the team could only watch.`,
    );
    return "fail";
  }
  c.text.push("It was a setup, but the team came armed. They fought their way out.");
  if (ratline) {
    c.text.push("Our ratline had a car waiting two streets over.");
    c.s.funds -= RATLINE_USE_FEE;
  }
  const won = brawl(
    c,
    { thralls: 3, vampires: 1 },
    advantage + (ratline ? RATLINE_FIGHT_BONUS : 0),
  );
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
          c.text.push(
            "He saw them coming and ran, shouting. Lights went on up and down the street.",
          );
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
          c.text.push(
            "They followed him to a flat on the edge of town and took him quietly at the door.",
          );
          interrogate(c, 10);
          return "success";
        }
        if (res === "partial") {
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
      detail:
        "Make the pitch: they work for us from now on, for a monthly fee. Tradecraft. Less to learn tonight.",
      odds: odds({ tradecraft: 1 }, RECRUIT_DIFFICULTY),
      run(c) {
        if (c.m.leadKind === "double") return compromised(c, -0.2);
        const res = check(c, { tradecraft: 1 }, RECRUIT_DIFFICULTY);
        if (res === "fail") {
          c.secrecy -= 1;
          c.text.push(
            "The pitch went wrong: the source took it as a threat, and left. Who will they tell?",
          );
          return "fail";
        }
        if (res === "partial") {
          c.text.push(
            "The source talked, but wouldn't sign on. Not yet, they said; maybe not ever.",
          );
          return "partial";
        }
        const kind = c.m.asset ?? "informant";
        const a = recruitAsset(
          c.s,
          kind,
          c.m.who ?? ASSET_KINDS[kind].roles[0]!,
          c.m.regionId,
          c.m.city,
          c.m.pos,
          c.m.whoFemale,
        );
        c.text.push(
          `${a.name}, ${a.role}, is ours: ${ASSET_KINDS[kind].name.toLowerCase()} in ${c.m.city}, for $${a.monthly.toLocaleString("en-US")} a month. The team leaves a number, and goes home.`,
        );
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
          reveal(c, 0.55);
          return "success";
        }
        if (res === "partial") {
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
      detail:
        "Sweep the area for two hours before anyone sits down. Insight, to spot a setup. A nervous source may not wait.",
      hours: () => 2,
      odds: odds({ insight: 1 }, 40),
      run(c) {
        if (c.m.leadKind === "double") {
          // Spotting a double is a perception roll: Insight (docs/design/covert.md).
          const res = check(c, { insight: 1 }, 45 - c.m.intel * 20);
          if (res === "success") {
            c.text.push(
              "The sweep found them: a van, two watchers, a back door propped open. It was a trap.",
            );
            if (c.m.kit === "civilian") {
              c.text.push(
                "Unarmed, the team did the only sensible thing: walked away and never sat down.",
              );
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
          c.text.push(
            "The area was clean, but the meeting went badly: the source wanted guarantees we could not give.",
          );
          return "partial";
        }
        c.text.push("The area was clean. The source, reassured, told us everything they knew.");
        reveal(c, res === "success" ? 0.6 : 0.3);
        return "success";
      },
    },
    {
      id: "snatch",
      label: "Grab the source and go",
      detail:
        "Assume the worst and take the source before anyone else moves. Combat and tradecraft.",
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
          c.text.push(
            "Three nights of photographs: faces, plates, and where the cars went afterwards.",
          );
          reveal(c, 0.85);
          return "success";
        }
        if (res === "partial") {
          c.text.push("They kept odd hours and the photographs are poor, but it's something.");
          reveal(c, 0.3);
          return "partial";
        }
        c.secrecy -= 2;
        c.text.push(
          "On the second night the curtains across the street twitched once, and the building went dark for good. They made us.",
        );
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
          c.text.push(
            "In and out in forty minutes, with a ledger, two phones photographed and a list of addresses.",
          );
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
      detail:
        "Papers, a collar, a plausible story. Insight. Civilian clothes help; tactical kit doesn't.",
      odds: odds({ insight: 0.7, tradecraft: 0.3 }, 45),
      run(c) {
        const res = check(c, { insight: 0.7, tradecraft: 0.3 }, 45);
        if (res === "success") {
          c.secrecy += 2;
          c.text.push(
            "The duty officer signed it over to 'the diocese' without a second look. It's in our hands, and nowhere else.",
          );
          reveal(c, 0.25);
          return "success";
        }
        if (res === "partial") {
          c.secrecy += 0.5;
          c.text.push("We got most of it. Copies may exist.");
          return "partial";
        }
        c.secrecy -= 3;
        c.text.push(
          "Questions were asked, phone calls made, and the team left empty-handed with a description of their faces on file.",
        );
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
          c.text.push(
            "Gone before the morning shift, and so is the evidence. Nobody will know it ever existed.",
          );
          reveal(c, 0.25);
          return "success";
        }
        if (res === "partial") {
          c.secrecy += 0.5;
          c.text.push("A guard came early. We got most of it out.");
          return "partial";
        }
        c.secrecy -= 4;
        c.text.push(
          "An alarm, a chase through the car park, and a break-in at a police building for tomorrow's papers.",
        );
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
          c.text.push(
            "She was still alive. Whoever kept her was asleep in the next room, and is not asleep any more.",
          );
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
      detail:
        "They are in torpor; only their thralls stand guard. A daylight raid is hard to hide.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 12),
      odds: (s, m, agents) => {
        const site = siteById(s, m.target.id);
        return site
          ? siteOdds(
              s,
              m,
              agents,
              {
                thralls: site.thralls,
                vampires: Math.ceil(site.vampires * (site.kind === "lair" ? 0.67 : 0.4)),
              },
              0.15,
            )
          : 0;
      },
      run(c) {
        const site = c.site!;
        c.secrecy -= 1.5;
        return strike(
          c,
          {
            thralls: site.thralls,
            vampires: Math.ceil(site.vampires * (site.kind === "lair" ? 0.67 : 0.4)),
          },
          0.15,
        );
      },
    },
    {
      id: "night",
      label: "Strike at 3 a.m.",
      detail: "The streets are empty and they are awake. Tradecraft buys surprise.",
      hours: (s, m) => hoursUntilLocal(s.time, m.pos.lon, 3),
      odds: (s, m, agents) => {
        const site = siteById(s, m.target.id);
        return site
          ? siteOdds(
              s,
              m,
              agents,
              { thralls: site.thralls, vampires: site.vampires },
              nightAdvantage(agents, m.kit),
            )
          : 0;
      },
      run(c) {
        const site = c.site!;
        c.used.add("tradecraft");
        return strike(
          c,
          { thralls: site.thralls, vampires: site.vampires },
          nightAdvantage(c.agents, c.m.kit),
        );
      },
    },
    ABORT,
  ],
};

/** A site's numbers were scaled when it was revealed. */
const siteOdds = (s: GameState, m: Mission, agents: Agent[], threat: Threat, advantage: number) =>
  winChance(
    agents,
    m.kit,
    threat,
    advantage + (siteById(s, m.target.id)?.trapped ? TRAP_BONUS : 0),
    m.agentIds.length + Math.round(m.arriveAt / HOUR),
    combatMods(s, m.kit),
  );

const nightAdvantage = (agents: Agent[], kit: KitId) =>
  Math.max(-0.1, Math.min(0.2, (teamSkill(agents, "tradecraft", kit) - 45) / 150));

/** A strike on a site. Threat is already scaled when the site was revealed. */
function strike(c: Ctx, threat: Threat, advantage: number): Result {
  if (c.site?.trapped)
    c.text.push("They were where our disinformation put them, and not expecting us.");
  const res = settle(c, threat, advantage + (c.site?.trapped ? TRAP_BONUS : 0));
  c.fought = res;
  c.used.add("combat");
  c.used.add("faith");
  c.secrecy -= 0.5 + res.rounds * 0.25;
  if (res.won && c.site?.kind === "lair") {
    c.support += 1;
    c.spoils = c.r.real(SPOILS.lair[0], SPOILS.lair[1]);
    c.burned = "lair";
    c.text.push(
      `The lair is burned out: ${res.thrallsKilled} of its guard dead, ${res.vampiresKilled} of them destroyed, the eldest among them. The sigil on the wall was smashed before the team withdrew.`,
    );
    return "success";
  }
  if (!res.won && c.site?.kind === "lair") {
    c.text.push(
      "The lair held. The team was thrown back with what it could carry. It will still be there, and it will be ready.",
    );
    return "fail";
  }
  if (res.won) {
    c.support += 0.4;
    const k = c.site?.kind ?? "nest";
    if (k !== "lair") c.spoils = c.r.real(SPOILS[k][0], SPOILS[k][1]);
    c.burned = k;
    c.s.nextOperation[c.m.bloodline] = (c.s.nextOperation[c.m.bloodline] ?? c.s.time) + 3 * DAY;
    // What comes out with the team depends on what carries it.
    const byHeli = missionCraft(c.s, c.m).some((a) => a.kind === "helicopter");
    const odds = byHeli ? CAPTURE_CHANCE.helicopter : CAPTURE_CHANCE.carried;
    const taken = typeof c.mode === "object" ? c.mode.captured : 0;
    if (typeof c.mode === "object" ? taken > 0 : threat.vampires > 0 && c.r.chance(odds.vampire))
      c.captive = "vampire";
    else if (c.r.chance(odds.thrall)) c.captive = "thrall";
    if (byHeli) c.remains = res.vampiresKilled;
    else if (res.vampiresKilled)
      c.text.push("With no way to lift the bodies out, the team burned them where they lay.");
    c.text.push(
      `The ${SITE_KINDS[c.site!.kind].name.toLowerCase()} is burned out: ${res.thrallsKilled} thralls dead, ${res.vampiresKilled} of them destroyed. What they kept there is ours now: phones, ledgers, a map with pins in it.`,
    );
    return "success";
  }
  c.text.push(
    "The team was driven out. By morning the place will be empty, and they will know we are coming.",
  );
  return "fail";
}

/** The plays on offer: the lead kind the player sees decides it, never the true kind. */
export function playsFor(m: Mission): Play[] {
  if (m.target.kind === "site") return PLAYS.site;
  const shown = m.leadKind === "double" ? "source" : (m.leadKind ?? "source");
  return PLAYS[shown];
}
