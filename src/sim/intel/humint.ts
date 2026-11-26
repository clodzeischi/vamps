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
import { bloodlineById } from "../../data/bloodlines";
import { CULTURES, REGION_RECRUITING, type CultureId } from "../../data/names";
import { REGIONS, regionById } from "../../data/regions";
import { isDestroyed } from "../campaign/bloodlines";
import { changeSupport, isHostile } from "../economy/economy";
import { distanceNm } from "../core/geo";
import { TIER_REWARD, type Tier } from "./judged";
import { rng, type Rng } from "../core/rng";
import {
  addLog,
  isReady,
  type CovertEffect,
  type GameState,
  type Installation,
  LeadVia,
} from "../core/state";
import { addClues } from "./networks";
import { EUROPE_CLOSED, europeClosed, isEurope } from "../campaign/story";
import { type LatLon } from "../core/time";
import { callChance, offerHumint, humintOptions } from "./assetCalls";

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

export const ASSET_KINDS: Record<
  AssetKind,
  { name: string; gives: string; base: number; weight: number; roles: string[] }
> = {
  access: {
    name: "Access",
    base: 20_000,
    weight: 0.3,
    gives:
      "lets our teams operate here even when the region is hostile or closed to us, and hears a little where no station can",
    roles: [
      "customs officer",
      "border police captain",
      "airport security chief",
      "ministry clerk",
      "port authority inspector",
    ],
  },
  pr: {
    name: "PR",
    base: 30_000,
    weight: 0.25,
    gives: "works opinion in the region for us, and blunts the bloodlines' media campaigns here",
    roles: [
      "newspaper editor",
      "television producer",
      "city councillor",
      "bishop's press secretary",
      "radio host",
    ],
  },
  ratline: {
    name: "Ratline",
    base: 15_000,
    weight: 0.2,
    gives: "runs an escape route out of the region for teams that are blown or stranded",
    roles: [
      "charter pilot",
      "convent prioress",
      "long-haul trucker",
      "parish priest near the border",
      "people smuggler",
    ],
  },
  informant: {
    name: "Informant",
    base: 25_000,
    weight: 0.25,
    gives:
      "gives the intelligence section HUMINT in the region: surer leads, and evidence from people",
    roles: [
      "night-shift nurse",
      "morgue attendant",
      "police dispatcher",
      "hotel concierge",
      "taxi dispatcher",
    ],
  },
};

/** Share of source leads that are doubles, by how they reached us. */
export const DOUBLE_SHARE: Record<LeadVia, number> = {
  sigint: 0.08,
  humint: 0.15,
  volunteer: 0.25,
  osint: 0.05,
};
/** Daily detection rate an informant adds in its region (a station's own is 0.5). */
export const INFORMANT_RATE = 0.2;
/** Daily detection rate an access asset adds where no station can be (hostile, or closed Europe). */
const ACCESS_HEARING_RATE = 0.1;
/** Daily chance, per unheard operation and per point of Catholic presence, that a volunteer comes forward. */
const VOLUNTEER_RATE = 0.0015;
/** Support a PR asset adds a day, and how much of the bloodlines' media damage gets through where one works. */
const PR_SUPPORT_PER_DAY = 0.004;
export const PR_MEDIA_DAMPING = 0.5;
/** A ratline: chance an unarmed agent caught by a double gets out along it; odds bonus for an armed escape; fee each use; overland exfiltration time multiplier. */
export const RATLINE_ESCAPE = 0.6;
export const RATLINE_FIGHT_BONUS = 0.2;
export const RATLINE_USE_FEE = 25_000;
export const RATLINE_SPEEDUP = 0.5;

export const hasAsset = (s: GameState, regionId: string, kind: AssetKind) =>
  s.assets.some((a) => a.regionId === regionId && a.kind === kind);

/** Why a team can't operate in a region, or null. An access asset opens hostile and closed regions. */
export function accessBlocker(s: GameState, regionId: string): string | null {
  if (hasAsset(s, regionId, "access")) return null;
  const name = regionById(regionId)?.name ?? "That region";
  if (europeClosed(s) && isEurope(regionId))
    return `${EUROPE_CLOSED} (An access agent in ${name} would get a team in.)`;
  if (isHostile(s.regions[regionId]?.support ?? 0))
    return `${name} is hostile to the Church. We can't operate there without an access agent.`;
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
    else if (
      a.kind === "access" &&
      (isHostile(s.regions[a.regionId]?.support ?? 0) || (europeClosed(s) && isEurope(a.regionId)))
    )
      v = ACCESS_HEARING_RATE;
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
  for (const k of ASSET_KIND_IDS)
    if ((x -= ASSET_KINDS[k].weight) <= 0) {
      asset = k;
      break;
    }
  return { asset, role: r.pick(ASSET_KINDS[asset].roles) };
}

function personName(r: Rng, regionId: string, female?: boolean): string {
  const mix = REGION_RECRUITING[regionId]?.cultures ?? { italian: 1 };
  const entries = Object.entries(mix) as [CultureId, number][];
  let x = r.next() * entries.reduce((a, [, w]) => a + w, 0);
  let culture = entries[0]![0];
  for (const [c, w] of entries)
    if ((x -= w) <= 0) {
      culture = c;
      break;
    }
  const pool = CULTURES[culture];
  return `${r.pick((female ?? r.chance(0.5)) ? pool.female : pool.male)} ${r.pick(pool.surnames)}`;
}

/** Roles under vows (or the bishop's own office): no Mass "again", no new car, no children. */
export const CLERGY = /priest|prioress|bishop/;

/** "a customs officer", "an airport security chief". */
export const withArticle = (role: string) => `${/^[aeiou]/i.test(role) ? "an" : "a"} ${role}`;

/** A source agreed to work for us. `female` when the lead already said who they are (a nurse "she", a detective "he"). */
export function recruitAsset(
  s: GameState,
  kind: AssetKind,
  role: string,
  regionId: string,
  city: string,
  pos: LatLon,
  female?: boolean,
): Asset {
  const r = rng(s);
  const a: Asset = {
    id: `asset-${s.nextId++}`,
    kind,
    role,
    regionId,
    city,
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
  if (s.coverUps.some((c) => c.assetId === id && c.startedAt))
    return `${a.name} is in the middle of something. Call it off first.`;
  removeAsset(s, a);
  addLog(s, `${a.name} (${a.role}, ${a.city}) is let go.`);
  return null;
}

/** An asset is gone (let go or burned): offers that ran through them lapse. */
export function removeAsset(s: GameState, a: Asset) {
  s.assets = s.assets.filter((x) => x !== a);
  s.coverUps = s.coverUps.filter((c) => c.assetId !== a.id || !!c.startedAt);
}

/** Where a ratline leads: our nearest operational base outside closed Europe. */
export function ratlineEnd(s: GameState, a: Asset): Installation | null {
  return (
    s.installations
      .filter(
        (b) => b.kind === "base" && isReady(s, b) && !(europeClosed(s) && isEurope(b.regionId)),
      )
      .sort((x, y) => distanceNm(x.pos, a.pos) - distanceNm(y.pos, a.pos))[0] ?? null
  );
}

/** Daily: PR assets work opinion, turned thralls whisper, and assets call. */
export function dailyHumint(s: GameState) {
  for (const a of s.assets) {
    if (a.kind === "pr") {
      changeSupport(s, a.regionId, PR_SUPPORT_PER_DAY);
    }
    if (a.bloodline && !isDestroyed(s, a.bloodline) && rng(s).chance(TURNED_CLUE_CHANCE)) {
      const lines = addClues(s, a.bloodline, 1);
      addLog(
        s,
        `Our thrall inside ${bloodlineById(a.bloodline)?.name ?? "the bloodline"} whispers: ${lines.join("; ").toLowerCase()}.`,
        "good",
      );
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
    const able = s.assets.filter(
      (a) =>
        !s.coverUps.some((c) => c.assetId === a.id) && humintOptions(s, a, "disinfo", r).length,
    );
    if (able.length) offerHumint(s, r.pick(able), "disinfo");
  }
}

// The numbers behind asset calls and disinformation (assetCalls.ts) and turned
// thralls (turned.ts), shared with the daily tick here.

/** An asset calls about once in this many days (more in a bloodline's homeland, and when secrecy is low). */
export const CALL_RATE = 1 / 50;
/** A call nobody answers: the chance the asset is burned anyway. */
export const IGNORED_BURN = 0.15;
/** Daily chance of a disinformation offer while we hold any asset; at most this many open. */
const DISINFO_RATE = 0.035;
const MAX_DISINFO_OFFERS = 2;
/** Share of failures that are catastrophic (the whole regional network burns). */
export const CATASTROPHE_SHARE = 0.3;
export const CATASTROPHE_SHARE_VERY_HARD = 0.45;
/** A strike on a site disinformation has drawn into a trap. */
export const TRAP_BONUS = 0.25;
/** False trail: how long the bloodline's next operation is put off. */
export const FALSE_TRAIL_DAYS = 10;
export const COUNTER_STORY_SUPPORT = 0.6;
/** A turned thrall: the daily chance it passes on a den clue; the recruiting roll; its fee against an informant's. */
const TURNED_CLUE_CHANCE = 1 / 30;
export const TURN_DIFFICULTY = 50;
export const TURNED_FEE_SHARE = 0.5;

/** What success brings, scaled by tier (hard jobs pay more). */
export function effectWords(e: CovertEffect, tier?: Tier): string {
  const k = TIER_REWARD[tier ?? "routine"];
  switch (e) {
    case "steady":
      return "They stay with us";
    case "lead":
      return "A lead";
    case "intel":
      return "A nest revealed";
    case "cheaper":
      return `Their fee drops ${Math.round(20 * k)}%`;
    case "false-trail":
      return "Their operations put off, sites drawn into a trap";
    case "counter-story":
      return `Support +${(Math.round(COUNTER_STORY_SUPPORT * k * 20) / 20).toFixed(2)}`;
    case "bait":
      return `${k >= TIER_REWARD.hard ? "Two den clues" : "A den clue"} toward their lair`;
  }
}
