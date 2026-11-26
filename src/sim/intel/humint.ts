// HUMINT: recruited assets (docs/design/covert.md).
//
// Leads come from SIGINT (fewer doubles), from informants we pay, or from
// volunteers who come forward on their own (more doubles). A source lead can
// be worked for intel or recruited as an asset: a person in a region who does
// one job for a monthly fee. Agents make the meeting and go home.
//
//   access     teams can operate where they otherwise can't (hostile regions,
//              Europe while the Vatican is hostage), and hears a little there
//   pr         a steady push on support, and blunts the bloodlines' campaigns
//   ratline    an escape-and-evasion route out of the region to our nearest base
//   informant  HUMINT collection for the intelligence section in its region (sim/intel/intel.ts)
import { BLOODLINES, bloodlineById } from "../../data/bloodlines";
import { CULTURES, REGION_RECRUITING, type CultureId } from "../../data/names";
import { REGIONS, regionById } from "../../data/regions";
import { isDestroyed } from "../campaign/bloodlines";
import { changeSupport, isHostile, neutralAnchor } from "../economy/economy";
import { distanceNm } from "../core/geo";
import { isSevere, pickJudged, TIER_REWARD, verdictLine, type JudgedTemplate, type Tier } from "./judged";
import { skillChance } from "../people/skill";
import { surfaceLead } from "./operations";
import { findCaptive, questioning } from "../base/research";
import { rng, type Rng } from "../core/rng";
import { changeSecrecy } from "../campaign/secrecy";
import { addLog, improvementLine, isReady, isWounded, post, train, type Agent, type CoverUp, type CovertEffect, type CovertResult, type GameState, type Installation, isDeployed, agentName, LeadVia } from "../core/state";
import { addClues, revealNest } from "./networks";
import { EUROPE_CLOSED, europeClosed, isEurope } from "../campaign/story";
import { DAY, type LatLon } from "../core/time";

export type AssetKind = "access" | "pr" | "ratline" | "informant";
const ASSET_KIND_IDS: AssetKind[] = ["access", "pr", "ratline", "informant"];
export const isAssetKind = (k: unknown): k is AssetKind => ASSET_KIND_IDS.includes(k as AssetKind);

export interface Asset {
  id: string;
  kind: AssetKind;
  /** The person. */
  name: string;
  /** Who they are ("customs officer"). */
  role: string;
  regionId: string;
  city: string;
  pos: LatLon;
  recruitedAt: number;
  /** Their fee, fixed when recruited. */
  monthly: number;
  /** A turned thrall: a source inside this bloodline (now and then a den clue on it). */
  bloodline?: string;
}


export const ASSET_KINDS: Record<AssetKind, { name: string; gives: string; base: number; weight: number; roles: string[] }> = {
  access: {
    name: "Access", base: 20_000, weight: 0.3,
    gives: "lets our teams operate here even when the region is hostile or closed to us, and hears a little where no station can",
    roles: ["customs officer", "border police captain", "airport security chief", "ministry clerk", "port authority inspector"],
  },
  pr: {
    name: "PR", base: 30_000, weight: 0.25,
    gives: "works opinion in the region for us, and blunts the bloodlines' media campaigns here",
    roles: ["newspaper editor", "television producer", "city councillor", "bishop's press secretary", "radio host"],
  },
  ratline: {
    name: "Ratline", base: 15_000, weight: 0.2,
    gives: "runs an escape route out of the region for teams that are blown or stranded",
    roles: ["charter pilot", "convent prioress", "long-haul trucker", "parish priest near the border", "people smuggler"],
  },
  informant: {
    name: "Informant", base: 25_000, weight: 0.25,
    gives: "gives the intelligence section HUMINT in the region: surer leads, and evidence from people",
    roles: ["night-shift nurse", "morgue attendant", "police dispatcher", "hotel concierge", "taxi dispatcher"],
  },
};

/** Share of source leads that are doubles, by how they reached us. */
export const DOUBLE_SHARE: Record<LeadVia, number> = { sigint: 0.08, humint: 0.15, volunteer: 0.25, osint: 0.05 };
/** Daily detection rate an informant adds in its region (a station's own is 0.5). */
export const INFORMANT_RATE = 0.2;
/** Daily detection rate an access asset adds where no station can be (hostile, or closed Europe). */
const ACCESS_HEARING_RATE = 0.1;
/** Daily chance, per unheard operation and per point of Catholic presence, that a volunteer comes forward. */
const VOLUNTEER_RATE = 0.0015;
/** Support a PR asset adds a day, and how much of the bloodlines' media damage gets through where one works. */
const PR_SUPPORT_PER_DAY = 0.004;
const PR_MEDIA_DAMPING = 0.5;
/** A ratline: chance an unarmed agent caught by a double gets out along it; odds bonus for an armed escape; fee each use; overland exfiltration time multiplier. */
export const RATLINE_ESCAPE = 0.6;
export const RATLINE_FIGHT_BONUS = 0.2;
export const RATLINE_USE_FEE = 25_000;
export const RATLINE_SPEEDUP = 0.5;

export const hasAsset = (s: GameState, regionId: string, kind: AssetKind) => s.assets.some((a) => a.regionId === regionId && a.kind === kind);

/** Why a team can't operate in a region, or null. An access asset opens hostile and closed regions. */
export function accessBlocker(s: GameState, regionId: string): string | null {
  if (hasAsset(s, regionId, "access")) return null;
  const name = regionById(regionId)?.name ?? "That region";
  if (europeClosed(s) && isEurope(regionId)) return `${EUROPE_CLOSED} (An access agent in ${name} would get a team in.)`;
  if (isHostile(s.regions[regionId]?.support ?? 0)) return `${name} is hostile to the Church. We can't operate there without an access agent.`;
  return null;
}

/** A fee in line with what the asset is worth: more in rich regions, more where it's dangerous to help us. */
export function assetFee(s: GameState, kind: AssetKind, regionId: string): number {
  const region = regionById(regionId);
  const mean = REGIONS.reduce((a, r) => a + r.funding, 0) / REGIONS.length;
  const rich = Math.max(0.6, Math.min(1.6, 0.6 + 0.4 * ((region?.funding ?? mean) / mean)));
  const support = s.regions[regionId]?.support ?? 0;
  const danger = 1 + 0.15 * Math.max(0, -support);
  return Math.round((ASSET_KINDS[kind].base * rich * danger) / 1_000) * 1_000;
}

export const monthlyHumintCost = (s: GameState) => s.assets.reduce((a, x) => a + x.monthly, 0);

/** Daily detection rates from HUMINT, by region (added to SIGINT's). */
export function humintRates(s: GameState): Map<string, number> {
  const rates = new Map<string, number>();
  for (const a of s.assets) {
    let v = 0;
    if (a.kind === "informant") v = INFORMANT_RATE;
    else if (a.kind === "access" && (isHostile(s.regions[a.regionId]?.support ?? 0) || (europeClosed(s) && isEurope(a.regionId)))) v = ACCESS_HEARING_RATE;
    if (v) rates.set(a.regionId, (rates.get(a.regionId) ?? 0) + v);
  }
  return rates;
}

/** Daily chance a volunteer comes forward about an operation nobody has heard of yet. */
export function volunteerChance(s: GameState, regionId: string): number {
  const presence = REGION_RECRUITING[regionId]?.presence ?? 0.1;
  const support = s.regions[regionId]?.support ?? 0;
  // People come forward where the Church is present and trusted.
  return VOLUNTEER_RATE * presence * Math.max(0.2, Math.min(2, 1 + support / 3));
}

/** Who a source is, and what they could become for us. */
export function sourceProfile(r: Rng): { asset: AssetKind; role: string } {
  let x = r.next() * ASSET_KIND_IDS.reduce((a, k) => a + ASSET_KINDS[k].weight, 0);
  let asset: AssetKind = "informant";
  for (const k of ASSET_KIND_IDS) if ((x -= ASSET_KINDS[k].weight) <= 0) { asset = k; break; }
  return { asset, role: r.pick(ASSET_KINDS[asset].roles) };
}

function personName(r: Rng, regionId: string, female?: boolean): string {
  const mix = REGION_RECRUITING[regionId]?.cultures ?? { italian: 1 };
  const entries = Object.entries(mix) as [CultureId, number][];
  let x = r.next() * entries.reduce((a, [, w]) => a + w, 0);
  let culture = entries[0]![0];
  for (const [c, w] of entries) if ((x -= w) <= 0) { culture = c; break; }
  const pool = CULTURES[culture];
  return `${r.pick(female ?? r.chance(0.5) ? pool.female : pool.male)} ${r.pick(pool.surnames)}`;
}

/** Roles under vows (or the bishop's own office): no Mass "again", no new car, no children. */
export const CLERGY = /priest|prioress|bishop/;

/** "a customs officer", "an airport security chief". */
export const withArticle = (role: string) => `${/^[aeiou]/i.test(role) ? "an" : "a"} ${role}`;

/** A source agreed to work for us. `female` when the lead already said who they are (a nurse "she", a detective "he"). */
export function recruitAsset(s: GameState, kind: AssetKind, role: string, regionId: string, city: string, pos: LatLon, female?: boolean): Asset {
  const r = rng(s);
  const a: Asset = {
    id: `asset-${s.nextId++}`, kind, role, regionId, city,
    name: personName(r, regionId, female ?? (/prioress/.test(role) ? true : undefined)),
    // A little apart from the others in town, so markers don't stack.
    pos: { lat: pos.lat + r.real(-0.3, 0.3), lon: pos.lon + r.real(-0.3, 0.3) },
    recruitedAt: s.time,
    monthly: assetFee(s, kind, regionId),
  };
  s.assets.push(a);
  addLog(s, `New agent in ${city}: ${a.name}, ${role} (${ASSET_KINDS[kind].name}).`, "good");
  return a;
}

export function dismissAsset(s: GameState, id: string): string | null {
  const a = s.assets.find((x) => x.id === id);
  if (!a) return "No such agent.";
  if (s.coverUps.some((c) => c.assetId === id && c.startedAt)) return `${a.name} is in the middle of something. Call it off first.`;
  removeAsset(s, a);
  addLog(s, `${a.name} (${a.role}, ${a.city}) is let go.`);
  return null;
}

/** An asset is gone (let go or burned): offers that ran through them lapse. */
function removeAsset(s: GameState, a: Asset) {
  s.assets = s.assets.filter((x) => x !== a);
  s.coverUps = s.coverUps.filter((c) => c.assetId !== a.id || !!c.startedAt);
}

/** Where a ratline leads: our nearest operational base outside closed Europe. */
export function ratlineEnd(s: GameState, a: Asset): Installation | null {
  return s.installations
    .filter((b) => b.kind === "base" && isReady(s, b) && !(europeClosed(s) && isEurope(b.regionId)))
    .sort((x, y) => distanceNm(x.pos, a.pos) - distanceNm(y.pos, a.pos))[0] ?? null;
}

/** Daily: PR assets work opinion, turned thralls whisper, and assets call. */
export function dailyHumint(s: GameState) {
  for (const a of s.assets) {
    if (a.kind === "pr") {
      changeSupport(s, a.regionId, PR_SUPPORT_PER_DAY);
    }
    if (a.bloodline && !isDestroyed(s, a.bloodline) && rng(s).chance(TURNED_CLUE_CHANCE)) {
      const lines = addClues(s, a.bloodline, 1);
      addLog(s, `Our thrall inside ${bloodlineById(a.bloodline)?.name ?? "the bloodline"} whispers: ${lines.join("; ").toLowerCase()}.`, "good");
    }
  }
  if (s.openWar && s.story.exposed) return; // disowned: nobody calls a Church that has none
  const r = rng(s);
  for (const a of [...s.assets]) {
    if (s.coverUps.some((c) => c.assetId === a.id)) continue;
    if (r.chance(callChance(s, a))) offerHumint(s, a, "call");
  }
  const open = s.coverUps.filter((c) => c.kind === "disinfo" && !c.startedAt).length;
  if (s.assets.length && open < MAX_DISINFO_OFFERS && r.chance(DISINFO_RATE)) {
    // Through an asset placed to do it: a story to plant needs a PR asset, a false trail someone the bloodline listens to.
    const able = s.assets.filter((a) => !s.coverUps.some((c) => c.assetId === a.id) && humintOptions(s, a, "disinfo", r).length);
    if (able.length) offerHumint(s, r.pick(able), "disinfo");
  }
}

// ---------------------------------------------------------------------------
// Asset calls and disinformation: covert actions offered like cover-ups
// (sim/campaign/coverups.ts runs them; the Covert actions screen lists them). Each runs
// through an asset, takes one operator and a few days, and ends in a
// tradecraft roll: a failure burns the asset, a catastrophe every asset we
// have in the region. Calling one off costs a little secrecy and no roll.
// ---------------------------------------------------------------------------

/** An asset calls about once in this many days (more in a bloodline's homeland, and when secrecy is low). */
const CALL_RATE = 1 / 50;
/** A call nobody answers: the chance the asset is burned anyway. */
const IGNORED_BURN = 0.15;
/** Daily chance of a disinformation offer while we hold any asset; at most this many open. */
const DISINFO_RATE = 0.035;
const MAX_DISINFO_OFFERS = 2;
/** Share of failures that are catastrophic (the whole regional network burns). */
const CATASTROPHE_SHARE = 0.3;
const CATASTROPHE_SHARE_VERY_HARD = 0.45;
/** A strike on a site disinformation has drawn into a trap. */
export const TRAP_BONUS = 0.25;
/** False trail: how long the bloodline's next operation is put off. */
const FALSE_TRAIL_DAYS = 10;
const COUNTER_STORY_SUPPORT = 0.6;
/** A turned thrall: the daily chance it passes on a den clue; the recruiting roll; its fee against an informant's. */
const TURNED_CLUE_CHANCE = 1 / 30;
const TURN_DIFFICULTY = 50;
const TURNED_FEE_SHARE = 0.5;

/** What success brings, scaled by tier (hard jobs pay more). */
export function effectWords(e: CovertEffect, tier?: Tier): string {
  const k = TIER_REWARD[tier ?? "routine"];
  switch (e) {
    case "steady": return "They stay with us";
    case "lead": return "A lead";
    case "intel": return "A nest revealed";
    case "cheaper": return `Their fee drops ${Math.round(20 * k)}%`;
    case "false-trail": return "Their operations put off, sites drawn into a trap";
    case "counter-story": return `Support +${(Math.round(COUNTER_STORY_SUPPORT * k * 20) / 20).toFixed(2)}`;
    case "bait": return `${k >= TIER_REWARD.hard ? "Two den clues" : "A den clue"} toward their lair`;
  }
}

interface HumintTemplate {
  id: string;
  kind: "call" | "disinfo";
  effect: CovertEffect;
  title: string;
  cost: [number, number];
  days: [number, number];
  judged: JudgedTemplate;
  /** Only through these kinds of asset (default: any). */
  through?: AssetKind[];
  success: string;
  /** A failure on an easy or routine job: the asset stays, shaken. */
  shaken: string;
  /** A failure on a hard job: the asset is burned. */
  fail: string;
  catastrophe: string;
}

// {name} the asset, {role} who they are, {city}, {region}, {bloodline} the target.
// Hints follow the vocabulary in sim/campaign/coverups.ts.
const HUMINT_TEMPLATES: HumintTemplate[] = [
  {
    id: "call-money", kind: "call", effect: "steady", cost: [10_000, 30_000], days: [1, 2],
    title: "{name} wants more money",
    judged: {
      text: "{name}, our {role} in {city}, says the risk has gone up and so should the fee.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "They mention the new car twice, and the risk not at all.",
          laity: true,
          why: "It was never about the risk. Someone who could read them would have seen it.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "They have started going to Mass again, and asking whether what they do for us is a sin.",
          laity: true,
          why: "They needed to hear that it wasn't. We talked about money.",
          success: "An hour in a side chapel, and no envelope. {name} is still ours, at the old fee.",
        },
        {
          weights: { combat: 0.7, insight: 0.3 },
          hint: "Someone has been leaning on them for a cut, and they want it to stop.",
          why: "The man leaning on them is still leaning. It needed someone he'd have stepped back from.",
          success: "The man who wanted a cut has decided he doesn't. {name} is still ours, at the old fee.",
        },
      ],
      tiers: {
        easy: "They'd settle for being taken seriously.",
        routine: "",
        hard: "They have another buyer, or say they do.",
        "very-hard": "They have already met the other side, once.",
      },
    },
    success: "A long lunch and an envelope. {name} is still ours, at the old fee.",
    shaken: "{name} took the envelope and grumbled. They're still ours, for now, and not happy about it.",
    fail: "{name} took the envelope and stopped answering the phone. We have to assume they are gone.",
    catastrophe: "{name} went to the police with everything, including the names of everyone else we run in {region}.",
  },
  {
    id: "call-followed", kind: "call", effect: "lead", cost: [5_000, 20_000], days: [1, 3],
    title: "{name} thinks they're being followed",
    judged: {
      text: "{name} has seen the same car three nights running outside their door in {city}.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "It parks somewhere different each night, but always with a view of the door.",
          why: "We were seen watching. It needed someone who can disappear on a street.",
        },
        {
          weights: { insight: 0.8, faith: 0.2 },
          hint: "{name} is calling every hour, wants a bodyguard, and has been drinking.",
          why: "They needed calming, not guarding, and we didn't see it.",
          success: "There was a car, once. The rest was nerves, and {name} is steadier now. Talking it through, they remembered the one thing that mattered: where the car went.",
        },
        {
          weights: { combat: 0.7, tradecraft: 0.3 },
          hint: "Last night the driver got out and tried their door.",
          why: "The driver was waiting for us, and he was the stronger.",
        },
      ],
      tiers: {
        easy: "The watcher smokes with the window down: he isn't trying hard.",
        routine: "",
        hard: "Whoever it is has done this before.",
        "very-hard": "There are two cars now, and they change shifts like professionals.",
      },
    },
    success: "{name} was right. The watcher was a thrall, and he led us home.",
    shaken: "We didn't catch the watcher, but he hasn't been back. {name} jumps at every car now.",
    fail: "Our operator was spotted. {name} is blown, and has gone to ground.",
    catastrophe: "The watcher saw our operator, followed them in turn, and rolled up everything we have in {region}.",
  },
  {
    id: "call-cousin", kind: "call", effect: "intel", cost: [10_000, 25_000], days: [2, 3],
    title: "{name}'s cousin wants in",
    judged: {
      text: "{name} has a cousin who works nights at a freight depot in {city} and has seen things. {name} wants us to meet him. Nobody has vetted him.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "He talks too readily, and he asked {name} how much the Church pays.",
          why: "He was selling, and we were buying blind.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "He hasn't slept since he saw what was in the containers, and he crosses himself when he talks about it.",
          why: "He needed someone who could hear it without flinching.",
        },
        {
          weights: { tradecraft: 0.7, insight: 0.3 },
          hint: "The depot has cameras everywhere, and his shift boss watches him.",
          why: "The meeting was seen. It needed someone who knows how to make a meeting unseen.",
        },
      ],
      tiers: {
        easy: "He is desperate to tell someone.",
        routine: "",
        hard: "He has told two people already, and neither is ours.",
        "very-hard": "The depot is theirs, from the gate to the loading bays.",
      },
    },
    success: "The cousin is real, frightened, and full of useful detail.",
    shaken: "The cousin got cold feet and won't meet again. {name} is embarrassed, but still ours.",
    fail: "The cousin talked to the wrong people about the meeting. {name} is burned with him.",
    catastrophe: "The cousin belonged to them. He knew {name}, and {name} knew the others in {region}.",
  },
  {
    id: "call-tonight", kind: "call", effect: "lead", cost: [5_000, 15_000], days: [1, 1],
    title: "{name} needs a meeting tonight",
    judged: {
      text: "A coded call from {name} in {city}: something has happened, and it can't be said on the phone.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "They want to meet at the station at midnight, where the police make their rounds.",
          why: "The meeting needed someone who could get there, and away, unseen.",
        },
        {
          weights: { combat: 0.8, faith: 0.2 },
          hint: "There is shouting in the background before the line drops.",
          why: "Whoever was shouting was still there when we arrived, and we weren't ready for them.",
        },
        {
          weights: { faith: 0.8, insight: 0.2 },
          hint: "They are whispering, and they keep saying they saw its face.",
          why: "They had seen one of them, and needed someone who wouldn't break when they described it.",
        },
      ],
      tiers: {
        easy: "They sound more excited than afraid.",
        routine: "",
        hard: "They name a meeting place they've never used before.",
        "very-hard": "They say they can't be sure the line is clean, and hang up.",
      },
    },
    success: "Something had happened, and now we know where.",
    shaken: "The meeting went badly, and {name} couldn't say much that made sense. They're still ours.",
    fail: "Our operator was late, and {name} was gone. We don't know if they ran or were taken.",
    catastrophe: "It was a trap, and {name} had walked into it first. They had our other names in {region} by morning.",
  },
  {
    id: "call-sell", kind: "call", effect: "intel", cost: [40_000, 80_000], days: [2, 4], through: ["access", "pr", "informant"],
    title: "{name} has something to sell",
    judged: {
      text: "{name} has copied a file in {city} that they swear is worth a great deal of money.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "They won't let us see it before we pay, and the price keeps changing.",
          why: "The file was never what they said. Someone sharper would have known before the money changed hands.",
        },
        {
          weights: { tradecraft: 0.7, insight: 0.3 },
          hint: "They copied it in a hurry, from an office with cameras.",
          why: "The copy left a trail, and we followed it straight back in.",
        },
      ],
      tiers: {
        easy: "They're nervous, and want it off their hands.",
        routine: "",
        hard: "Someone else has been asking about the same file.",
        "very-hard": "The file came from the bloodline's own lawyers, and they count their papers.",
      },
    },
    success: "The file is genuine. Worth every cent.",
    shaken: "The file was worthless, and we didn't buy it. {name} is sulking, but still ours.",
    fail: "The file was a fake, and someone knew {name} had made it. {name} is finished.",
    catastrophe: "The file was bait, and asking about it burned {name} and everyone near them in {region}.",
  },
  {
    id: "call-enough", kind: "call", effect: "cheaper", cost: [5_000, 15_000], days: [1, 2],
    title: "{name} has had enough",
    judged: {
      text: "{name} wants out.",
      variants: [
        {
          weights: { faith: 1 },
          hint: "They have been to confession for the first time in years, and haven't stopped thinking about it since.",
          laity: true,
          why: "They needed to be told that what they do is good. We couldn't make them believe it.",
        },
        {
          weights: { insight: 0.8, tradecraft: 0.2 },
          hint: "They say it's their family. They've also been seen twice with a man nobody knows.",
          why: "It wasn't the family. We didn't see it.",
        },
        {
          weights: { combat: 0.6, faith: 0.4 },
          hint: "Someone spoke to their daughter at the school gates, and said their name.",
          laity: true,
          why: "They needed to know someone would stand between them and it. We didn't convince them.",
        },
      ],
      tiers: {
        easy: "They want to be talked round.",
        routine: "",
        hard: "They have already packed.",
        "very-hard": "They have already told their family everything.",
      },
    },
    success: "{name} stays, and for less: they want this to end as much as we do.",
    shaken: "{name} stays, for now, but they've stopped returning calls the same day.",
    fail: "{name} couldn't be talked round, and is out.",
    catastrophe: "{name} told their family everything, and the family told the papers. Our network in {region} is finished.",
  },
  {
    id: "dis-trail", kind: "disinfo", effect: "false-trail", cost: [80_000, 150_000], days: [4, 7], through: ["informant", "access"],
    title: "A false trail for {bloodline}, {region}",
    judged: {
      text: "Through {name}, our {role} in {city}, we can feed {bloodline} a story: that we are closing in, from the wrong direction. They will move, and wait, and we will know where.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "The story has to reach one of their go-betweens, a lawyer who believes nothing he can't check.",
          why: "The lawyer didn't believe it. We misjudged what he'd swallow.",
        },
        {
          weights: { tradecraft: 1 },
          hint: "It has to be planted: papers left where their people search, on a phone line we know they tap.",
          why: "The plant was clumsy, and they saw the hand behind it.",
        },
      ],
      tiers: {
        routine: "",
        hard: "They have been fooled once before, and are watching for it.",
        "very-hard": "Their elder checks every story twice, in person.",
      },
    },
    success: "{bloodline} believed it. They have gone quiet in {region}, and what they kept here is where we said it would be.",
    shaken: "{bloodline} didn't bite, and doesn't seem to know who tried. {name} is still ours.",
    fail: "{bloodline} smelled it, and traced the story back to {name}. {name} is burned.",
    catastrophe: "{bloodline} traced the story back through {name} to everyone we run in {region}.",
  },
  {
    id: "dis-counter", kind: "disinfo", effect: "counter-story", cost: [60_000, 120_000], days: [3, 5], through: ["pr"],
    title: "Kill the story, {region}",
    judged: {
      text: "The bloodlines' campaign in {region} has worked. {name}, our {role} in {city}, can plant the other side of it: the money behind it, and who it serves.",
      variants: [
        {
          weights: { insight: 1 },
          hint: "It needs an editor who will run it, and he will have to be persuaded it's true.",
          why: "The editor didn't believe us. Someone who could read him would have known what he needed to see.",
        },
        {
          weights: { faith: 0.7, insight: 0.3 },
          hint: "The campaign was against the Church itself, and the parishes of {region} want an answer from someone who believes it.",
          why: "The answer needed conviction behind it, and ours didn't carry.",
        },
      ],
      tiers: {
        easy: "The campaign has already started to sour on its own.",
        routine: "",
        hard: "The campaign's backers are local, and well liked.",
        "very-hard": "Half the press in {region} took their money.",
      },
    },
    success: "The counter-story ran everywhere. Opinion in {region} has swung back.",
    shaken: "Nobody ran it, and nobody remembers who asked. {name} is still ours.",
    fail: "Nobody ran it, and the people who were asked remember who asked. {name} is burned.",
    catastrophe: "It ran, with {name}'s name on it, and the names of everyone else we have in {region}.",
  },
  {
    id: "dis-bait", kind: "disinfo", effect: "bait", cost: [100_000, 180_000], days: [5, 8],
    title: "Bait for {bloodline}, {city}",
    judged: {
      text: "{name} can let it slip, in the right ears in {city}, that the Order has something {bloodline} wants back. Whoever comes for it will show us where they come from.",
      variants: [
        {
          weights: { tradecraft: 1 },
          hint: "Whoever comes will be careful, and the streets around the drop are narrow and quiet.",
          why: "They saw the tail. It needed someone who can follow without being followed.",
        },
        {
          weights: { combat: 0.7, tradecraft: 0.3 },
          hint: "Whoever comes will come in numbers, and won't leave without it.",
          why: "They came in numbers, and we couldn't hold them long enough to follow.",
        },
      ],
      tiers: {
        routine: "",
        hard: "They'll send someone who has done this before.",
        "very-hard": "They'll send one of their own, not a thrall.",
      },
    },
    success: "They came for it, and we followed them home. We know a great deal more about {bloodline}.",
    shaken: "Nobody took the bait, and nobody seems to have noticed who set it. {name} is still ours.",
    fail: "Nobody took the bait, but someone noticed who set it. {name} is burned.",
    catastrophe: "They took the bait, and {name}, and through {name} everyone we have in {region}.",
  },
];

export const isHumintTemplate = (id: string) => HUMINT_TEMPLATES.some((t) => t.id === id);
const humintTemplate = (id: string) => HUMINT_TEMPLATES.find((t) => t.id === id);

/** A living bloodline at work in a region: one whose homeland it is, or one with an operation there. */
function bloodlineIn(s: GameState, regionId: string, r: Rng): string | null {
  const home = BLOODLINES.filter((b) => !isDestroyed(s, b.id) && b.homeRegions.includes(regionId)).map((b) => b.id);
  const active = s.operations.filter((o) => o.regionId === regionId).map((o) => o.bloodline);
  const all = [...new Set([...home, ...active])];
  return all.length ? r.pick(all) : null;
}

function callChance(s: GameState, a: Asset): number {
  const homeland = BLOODLINES.some((b) => !isDestroyed(s, b.id) && b.homeRegions.includes(a.regionId));
  return CALL_RATE * (homeland ? 1.5 : 1) * (1 + Math.max(0, (50 - s.secrecy) / 50));
}

/** The calls or offers this asset could bring now: placed to do it, and with something to aim at. */
function humintOptions(s: GameState, a: Asset, kind: "call" | "disinfo", r: Rng): HumintTemplate[] {
  const bloodline = bloodlineIn(s, a.regionId, r);
  const eroded = (s.regions[a.regionId]?.support ?? 0) < neutralAnchor(a.regionId) - 0.3;
  return HUMINT_TEMPLATES.filter((t) => {
    if (t.kind !== kind) return false;
    if (t.through && !t.through.includes(a.kind)) return false;
    if (t.effect === "counter-story") return eroded;
    if (t.effect === "false-trail" || t.effect === "bait") return !!bloodline;
    return true;
  });
}

function offerHumint(s: GameState, a: Asset, kind: "call" | "disinfo") {
  const r = rng(s);
  const bloodline = bloodlineIn(s, a.regionId, r);
  const options = humintOptions(s, a, kind, r);
  if (!options.length) return;
  const t = r.pick(options);
  const region = regionById(a.regionId)!;
  const bl = bloodlineById(bloodline);
  const fill = (x: string) => fillHumint(x, a, region.name, bl?.name);
  const round = (n: number) => Math.round(n / 5_000) * 5_000;
  const lay = !CLERGY.test(a.role);
  const judged = pickJudged(t.judged, r, (v) => lay || !v.laity);
  const weights = t.judged.variants[judged.variant]!.weights;
  const c: CoverUp = {
    id: `covert-${s.nextId++}`,
    template: t.id,
    title: fill(t.title),
    text: fill(judged.text),
    regionId: a.regionId,
    city: a.city,
    pos: { ...a.pos },
    offeredAt: s.time,
    expiresAt: s.time + (kind === "call" ? r.real(2, 4) : r.real(3, 6)) * DAY,
    cost: round(r.real(t.cost[0], t.cost[1])),
    days: r.int(t.days[0], t.days[1]),
    agents: 1,
    tier: judged.tier,
    variant: judged.variant,
    weights: { ...weights },
    gain: 0,
    agentIds: [],
    startedAt: 0,
    doneAt: 0,
    kind,
    assetId: a.id,
    effect: t.effect,
    ...(bloodline && (t.effect === "false-trail" || t.effect === "bait" || t.effect === "intel") ? { bloodline } : {}),
  };
  s.coverUps.push(c);
  post(s, {
    kind: "coverup",
    heading: kind === "call" ? "An agent calls" : "Disinformation",
    title: c.title,
    body: c.text + (kind === "call" ? "\n\nIgnore it, and we may lose them anyway." : ""),
    regionId: c.regionId,
    pos: c.pos,
    refId: c.id,
    effects: `$${c.cost.toLocaleString("en-US")} · ${c.days} day${c.days === 1 ? "" : "s"} · one operator · ${effectWords(t.effect, judged.tier)} if it works`,
  });
}

function fillHumint(x: string, a: Asset, region: string, bloodline?: string) {
  return x.replaceAll("{name}", a.name).replaceAll("{role}", a.role).replaceAll("{city}", a.city).replaceAll("{region}", region).replaceAll("{bloodline}", bloodline ?? "the bloodline");
}

/** Burns an asset (or, in a catastrophe, everyone we run in its region). Returns who was lost. */
function burn(s: GameState, a: Asset, everyone: boolean): Asset[] {
  const lost = everyone ? s.assets.filter((x) => x.regionId === a.regionId) : [a];
  for (const x of lost) removeAsset(s, x);
  return lost;
}

/** A call nobody answered. */
export function ignoredCall(s: GameState, c: CoverUp) {
  const a = s.assets.find((x) => x.id === c.assetId);
  if (!a) return;
  if (!rng(s).chance(IGNORED_BURN)) {
    addLog(s, `Nobody answered ${a.name}'s call. They are still with us, for now.`);
    return;
  }
  burn(s, a, false);
  post(s, {
    kind: "coverup-result",
    heading: "An agent is lost",
    title: `${a.name} is gone`,
    body: `Nobody answered when ${a.name}, our ${a.role} in ${a.city}, called. They stopped calling.`,
    regionId: a.regionId,
    pos: a.pos,
    effects: `${ASSET_KINDS[a.kind].name} agent lost`,
  });
}

/** An asset call or disinformation offer's roll (sim/campaign/coverups.ts runs the job). Easy and routine failures
 *  leave the asset shaken; hard ones burn it, and some burn the network. Without its asset, it fails. */
export function rollHumint(s: GameState, c: CoverUp, p: number, r: Rng): CovertResult {
  if (!s.assets.some((x) => x.id === c.assetId)) return "fail";
  if (r.next() < p) return "success";
  if (!isSevere(c.tier)) return "shaken";
  return r.chance(c.tier === "very-hard" ? CATASTROPHE_SHARE_VERY_HARD : CATASTROPHE_SHARE) ? "catastrophe" : "fail";
}

/** What an asset job's result does: its debrief and effects (the verdict on a failure included). */
export function settleHumint(s: GameState, c: CoverUp, result: CovertResult, agents: readonly Agent[], r: Rng): { body: string; effects: string[] } {
  const t = humintTemplate(c.template);
  const a = s.assets.find((x) => x.id === c.assetId);
  if (!a) return { body: "The agent it depended on is gone. There was nothing to do.", effects: [] };
  const region = regionById(c.regionId)?.name ?? c.regionId;
  const bl = bloodlineById(c.bloodline);
  const fill = (x: string) => fillHumint(x, a, region, bl?.name);
  const variant = c.variant !== undefined ? t?.judged.variants[c.variant] : undefined;
  const effects: string[] = [];
  let body: string;
  if (result === "success") {
    body = fill(variant?.success ?? t?.success ?? "It worked.");
    effects.push(...applyEffect(s, c, a));
  } else if (result === "shaken") {
    body = fill(t?.shaken ?? "It didn't work, but they are still with us.");
    effects.push(`${a.name} stays, shaken`);
  } else {
    const lost = burn(s, a, result === "catastrophe");
    if (result === "catastrophe") changeSecrecy(s, -2, `our network in ${region} is blown`, c);
    body = fill(result === "catastrophe" ? (t?.catastrophe ?? "Everything went wrong.") : (t?.fail ?? "It didn't work."));
    effects.push(lost.length > 1 ? `${lost.length} agents in ${region} burned` : `${a.name} burned`);
    if (result === "catastrophe") effects.push("Secrecy −2");
  }
  if (result !== "success" && variant) body += `\n\n${fill(verdictLine(agents, variant, c.tier, r))}`;
  return { body, effects };
}

function applyEffect(s: GameState, c: CoverUp, a: Asset): string[] {
  const region = regionById(c.regionId)?.name ?? c.regionId;
  const bl = c.bloodline ?? bloodlineIn(s, c.regionId, rng(s));
  const name = (id: string | null) => bloodlineById(id)?.name ?? "the bloodline";
  // Hard jobs pay more.
  const k = TIER_REWARD[c.tier];
  const days = Math.round(FALSE_TRAIL_DAYS * k);
  const support = Math.round(COUNTER_STORY_SUPPORT * k * 20) / 20;
  const bait = k >= TIER_REWARD.hard ? 2 : 1;
  switch (c.effect) {
    case "lead": {
      const op = s.operations.find((o) => o.regionId === c.regionId && !o.leadId);
      if (op) {
        surfaceLead(s, op, "humint", true);
        return ["A lead"];
      }
      return bl ? revealNest(s, bl, c.regionId).lines : [];
    }
    case "intel":
      return bl ? revealNest(s, bl, c.regionId).lines : [];
    case "cheaper":
      a.monthly = Math.round((a.monthly * (1 - Math.round(20 * k) / 100)) / 1_000) * 1_000;
      return [`${a.name}'s fee now $${a.monthly.toLocaleString("en-US")}/mo`];
    case "false-trail": {
      if (!bl) return [];
      s.nextOperation[bl] = Math.max(s.nextOperation[bl] ?? s.time, s.time) + days * DAY;
      let trapped = 0;
      for (const x of s.sites)
        if (x.bloodline === bl && x.regionId === c.regionId && x.kind !== "lair") {
          x.trapped = true;
          x.expiresAt += 4 * DAY;
          trapped++;
        }
      return [`${name(bl)} quiet for ${days} days`, ...(trapped ? [`${trapped} site${trapped === 1 ? "" : "s"} in ${region} drawn into a trap`] : [])];
    }
    case "counter-story":
      changeSupport(s, c.regionId, support);
      return [`Support in ${region} +${support.toFixed(2)}`];
    case "bait":
      return bl ? addClues(s, bl, bait) : [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Turned thralls: released as a source inside their bloodline
// ---------------------------------------------------------------------------

/** The operator who would make the pitch: the best tradecraft free at the captive's base. */
export function turnOperator(s: GameState, captiveId: string) {
  const held = findCaptive(s, captiveId);
  if (!held) return null;
  return s.agents
    .filter((x) => x.baseId === held.base.id && !isDeployed(s, x) && !isWounded(s, x))
    .sort((x, y) => y.aptitudes.tradecraft - x.aptitudes.tradecraft)[0] ?? null;
}

export const turnChance = (tradecraft: number) => skillChance(tradecraft - TURN_DIFFICULTY);

export function turnBlocker(s: GameState, captiveId: string): string | null {
  const held = findCaptive(s, captiveId);
  if (!held) return "No such captive.";
  if (held.captive.kind !== "thrall") return "A vampire can't be turned.";
  if (questioning(s, captiveId)) return "They are being questioned. Abandon the interrogation first.";
  if (!turnOperator(s, captiveId)) return `Nobody at ${held.base.name} is free to make the pitch.`;
  return null;
}

/** Releases a thrall as our source inside its bloodline, if an operator can turn them (tradecraft). */
export function turnThrall(s: GameState, captiveId: string): string | null {
  const why = turnBlocker(s, captiveId);
  if (why) return why;
  const r = rng(s);
  const { base, captive } = findCaptive(s, captiveId)!;
  const op = turnOperator(s, captiveId)!;
  base.captives = (base.captives ?? []).filter((x) => x !== captive);
  const bl = bloodlineById(captive.bloodline);
  const regionId = captive.regionId ?? REGIONS.find((x) => x.cities.some((c) => c.name === captive.city))?.id ?? bl?.homeRegions[0] ?? base.regionId;
  const region = regionById(regionId);
  const city = region?.cities.find((c) => c.name === captive.city) ?? region?.cities[0] ?? { name: captive.city, ...base.pos };
  const who = `${agentName(op)}`;
  const ok = r.next() < turnChance(op.aptitudes.tradecraft);
  const gain = train(op, "tradecraft", ok ? r.int(1, 2) : r.int(0, 1));
  const improved = [improvementLine(op, { tradecraft: gain })].filter((x): x is string => !!x);
  if (ok) {
    const a = recruitAsset(s, "informant", `turned thrall of ${bl?.short ?? "a bloodline"}`, regionId, city.name, { lat: city.lat, lon: city.lon });
    a.bloodline = captive.bloodline;
    a.monthly = Math.round((a.monthly * TURNED_FEE_SHARE) / 1_000) * 1_000;
    post(s, {
      kind: "coverup-result",
      heading: "A thrall is turned",
      title: `Turned: the thrall from ${captive.city}`,
      body: `${who} sat with the thrall from ${captive.city} for three nights, and on the fourth it agreed. It goes back to ${bl?.name ?? "its masters"} as ours: a voice inside the bloodline, for as long as they don't notice.`,
      regionId,
      pos: a.pos,
      effects: `Informant in ${region?.name}, now and then a den clue on the ${bl?.short ?? "bloodline"} · $${a.monthly.toLocaleString("en-US")}/mo`,
      improved,
    });
    return null;
  }
  const worse = r.chance(CATASTROPHE_SHARE);
  if (worse) changeSecrecy(s, -2, `a thrall we released went straight back to its masters`, { regionId, city: city.name, pos: { lat: city.lat, lon: city.lon } });
  post(s, {
    kind: "coverup-result",
    heading: "A thrall is turned",
    title: `Not turned: the thrall from ${captive.city}`,
    body: worse
      ? `${who} thought it had worked. The thrall went straight back to ${bl?.name ?? "its masters"} and told them everything it had seen of ${base.name}.`
      : `${who} couldn't reach it. The thrall was handed to a convent hospital; the cell is free.`,
    regionId,
    pos: { lat: city.lat, lon: city.lon },
    effects: worse ? "Secrecy −2" : "No agent",
    improved,
  });
  return null;
}

/** How much of a bloodline media hit lands in a region (PR assets blunt it). */
export const mediaDamping = (s: GameState, regionId: string) => (hasAsset(s, regionId, "pr") ? PR_MEDIA_DAMPING : 1);
