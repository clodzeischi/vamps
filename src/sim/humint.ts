// HUMINT: recruited assets (docs/WEB_PORT.md 3.8).
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
//   informant  hears bloodline operations in its region, like a weaker station
import { BLOODLINES } from "../data/bloodlines";
import { CULTURES, REGION_RECRUITING, type CultureId } from "../data/names";
import { REGIONS, regionById } from "../data/regions";
import { isDestroyed } from "./bloodlines";
import { changeSupport, isHostile, neutralAnchor } from "./economy";
import { distanceNm } from "./geo";
import { coverUpChance } from "./coverups";
import { surfaceLead } from "./operations";
import { findCaptive, questioning } from "./research";
import { rng, type Rng } from "./rng";
import { changeSecrecy } from "./secrecy";
import { addIntel, addLog, improvementLine, isReady, isWounded, post, train, type CoverUp, type CovertEffect, type GameState, type Installation } from "./state";
import { EUROPE_CLOSED, europeClosed, isEurope } from "./story";
import { DAY, type LatLon } from "./time";

export type AssetKind = "access" | "pr" | "ratline" | "informant";
export const ASSET_KIND_IDS: AssetKind[] = ["access", "pr", "ratline", "informant"];
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
  /** A turned thrall: a source inside this bloodline (a steady trickle of intel on it). */
  bloodline?: string;
}

/** How leads reach us. */
export type LeadVia = "sigint" | "informant" | "volunteer";

export const ASSET_KINDS: Record<AssetKind, { name: string; gives: string; base: number; weight: number; roles: string[] }> = {
  access: {
    name: "Access", base: 40_000, weight: 0.3,
    gives: "lets our teams operate here even when the region is hostile or closed to us, and hears a little where no station can",
    roles: ["customs officer", "border police captain", "airport security chief", "ministry clerk", "port authority inspector"],
  },
  pr: {
    name: "PR", base: 60_000, weight: 0.25,
    gives: "works opinion in the region for us, and blunts the bloodlines' media campaigns here",
    roles: ["newspaper editor", "television producer", "city councillor", "bishop's press secretary", "radio host"],
  },
  ratline: {
    name: "Ratline", base: 30_000, weight: 0.2,
    gives: "runs an escape route out of the region for teams that are blown or stranded",
    roles: ["fishing-boat captain", "convent prioress", "long-haul trucker", "parish priest near the border", "people smuggler"],
  },
  informant: {
    name: "Informant", base: 50_000, weight: 0.25,
    gives: "hears bloodline activity in the region and passes it on as leads",
    roles: ["night-shift nurse", "morgue attendant", "police dispatcher", "hotel concierge", "taxi dispatcher"],
  },
};

/** Share of source leads that are doubles, by how they reached us. */
export const DOUBLE_SHARE: Record<LeadVia, number> = { sigint: 0.08, informant: 0.15, volunteer: 0.25 };
/** Daily detection rate an informant adds in its region (a station's own is 0.5). */
export const INFORMANT_RATE = 0.2;
/** Daily detection rate an access asset adds where no station can be (hostile, or closed Europe). */
export const ACCESS_HEARING_RATE = 0.1;
/** Daily chance, per unheard operation and per point of Catholic presence, that a volunteer comes forward. */
export const VOLUNTEER_RATE = 0.0015;
/** Support a PR asset adds a day, and how much of the bloodlines' media damage gets through where one works. */
export const PR_SUPPORT_PER_DAY = 0.004;
export const PR_MEDIA_DAMPING = 0.5;
/** A ratline: chance an unarmed agent caught by a double gets out along it; odds bonus for an armed escape; fee each use; overland exfiltration time multiplier. */
export const RATLINE_ESCAPE = 0.6;
export const RATLINE_FIGHT_BONUS = 0.2;
export const RATLINE_USE_FEE = 25_000;
export const RATLINE_SPEEDUP = 0.5;

export const assetsIn = (s: GameState, regionId: string, kind?: AssetKind) =>
  s.assets.filter((a) => a.regionId === regionId && (!kind || a.kind === kind));
export const hasAsset = (s: GameState, regionId: string, kind: AssetKind) => s.assets.some((a) => a.regionId === regionId && a.kind === kind);

/** Why a team can't operate in a region, or null. An access asset opens hostile and closed regions. */
export function accessBlocker(s: GameState, regionId: string): string | null {
  if (hasAsset(s, regionId, "access")) return null;
  const name = regionById(regionId)?.name ?? "That region";
  if (europeClosed(s) && isEurope(regionId)) return `${EUROPE_CLOSED} (An access asset in ${name} would get a team in.)`;
  if (isHostile(s.regions[regionId]?.support ?? 0)) return `${name} is hostile to the Church. We can't operate there without an access asset.`;
  return null;
}

/** A fee in line with what the asset is worth: more in rich regions, more where it's dangerous to help us. */
export function assetFee(s: GameState, kind: AssetKind, regionId: string): number {
  const region = regionById(regionId);
  const mean = REGIONS.reduce((a, r) => a + r.funding, 0) / REGIONS.length;
  const rich = Math.max(0.6, Math.min(1.6, 0.6 + 0.4 * ((region?.funding ?? mean) / mean)));
  const support = s.regions[regionId]?.support ?? 0;
  const danger = 1 + 0.15 * Math.max(0, -support);
  return Math.round((ASSET_KINDS[kind].base * rich * danger) / 5_000) * 5_000;
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

/** A source agreed to work for us. */
export function recruitAsset(s: GameState, kind: AssetKind, role: string, regionId: string, city: string, pos: LatLon): Asset {
  const r = rng(s);
  const a: Asset = {
    id: `asset-${s.nextId++}`, kind, role, regionId, city,
    name: personName(r, regionId, /prioress/.test(role) ? true : undefined),
    // A little apart from the others in town, so markers don't stack.
    pos: { lat: pos.lat + r.real(-0.3, 0.3), lon: pos.lon + r.real(-0.3, 0.3) },
    recruitedAt: s.time,
    monthly: assetFee(s, kind, regionId),
  };
  s.assets.push(a);
  addLog(s, `New asset in ${city}: ${a.name}, ${role} (${ASSET_KINDS[kind].name}).`, "good");
  return a;
}

export function dismissAsset(s: GameState, id: string): string | null {
  const a = s.assets.find((x) => x.id === id);
  if (!a) return "No such asset.";
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
      const r = s.regions[a.regionId];
      if (r) r.support = Math.min(5, r.support + PR_SUPPORT_PER_DAY);
    }
    if (a.bloodline && !isDestroyed(s, a.bloodline)) addIntel(s, a.bloodline, TURNED_INTEL_PER_DAY);
  }
  if (s.openWar && s.story.exposed) return; // disowned: nobody calls a Church that has none
  const r = rng(s);
  for (const a of [...s.assets]) {
    if (s.coverUps.some((c) => c.assetId === a.id)) continue;
    if (r.chance(callChance(s, a))) offerHumint(s, a, "call");
  }
  const open = s.coverUps.filter((c) => c.kind === "disinfo" && !c.startedAt).length;
  if (s.assets.length && open < MAX_DISINFO_OFFERS && r.chance(DISINFO_RATE)) {
    const a = r.pick(s.assets);
    if (!s.coverUps.some((c) => c.assetId === a.id)) offerHumint(s, a, "disinfo");
  }
}

// ---------------------------------------------------------------------------
// Asset calls and disinformation: covert actions offered like cover-ups
// (sim/coverups.ts runs them; the Covert actions screen lists them). Each runs
// through an asset, takes one operator and a few days, and ends in a
// tradecraft roll: a failure burns the asset, a catastrophe every asset we
// have in the region. Calling one off costs a little secrecy and no roll.
// ---------------------------------------------------------------------------

/** An asset calls about once in this many days (more in a bloodline's homeland, and when secrecy is low). */
export const CALL_RATE = 1 / 50;
/** A call nobody answers: the chance the asset is burned anyway. */
export const IGNORED_BURN = 0.15;
/** Daily chance of a disinformation offer while we hold any asset; at most this many open. */
export const DISINFO_RATE = 0.035;
export const MAX_DISINFO_OFFERS = 2;
/** Share of failures that are catastrophic (the whole regional network burns). */
export const CATASTROPHE_SHARE = 0.3;
/** A strike on a site disinformation has drawn into a trap. */
export const TRAP_BONUS = 0.25;
/** False trail: how long the bloodline's next operation is put off. */
export const FALSE_TRAIL_DAYS = 10;
export const COUNTER_STORY_SUPPORT = 0.6;
export const BAIT_INTEL = 10;
export const CALL_INTEL = 5;
/** A turned thrall: intel on its bloodline a day; the recruiting roll; its fee against an informant's. */
export const TURNED_INTEL_PER_DAY = 0.1;
export const TURN_DIFFICULTY = 50;
export const TURNED_FEE_SHARE = 0.5;

export const EFFECT_WORDS: Record<CovertEffect, string> = {
  steady: "They stay with us",
  lead: "A lead",
  intel: `Intel +${CALL_INTEL}`,
  cheaper: "Their fee drops 20%",
  "false-trail": "Their operations put off, sites drawn into a trap",
  "counter-story": `Support +${COUNTER_STORY_SUPPORT}`,
  bait: `Intel +${BAIT_INTEL} toward their lair`,
};

interface HumintTemplate {
  id: string;
  kind: "call" | "disinfo";
  effect: CovertEffect;
  title: string;
  text: string;
  cost: [number, number];
  days: [number, number];
  difficulty: number;
  success: string;
  fail: string;
  catastrophe: string;
}

// {name} the asset, {role} who they are, {city}, {region}, {bloodline} the target.
const HUMINT_TEMPLATES: HumintTemplate[] = [
  {
    id: "call-money", kind: "call", effect: "steady", cost: [10_000, 30_000], days: [1, 2], difficulty: 35,
    title: "{name} wants more money",
    text: "{name}, our {role} in {city}, says the risk has gone up and so should the fee. Someone should go and explain, kindly, why it hasn't.",
    success: "A long lunch and an envelope. {name} is still ours, at the old fee.",
    fail: "{name} took the envelope and stopped answering the phone. We have to assume they are gone.",
    catastrophe: "{name} went to the police with everything, including the names of everyone else we run in {region}.",
  },
  {
    id: "call-followed", kind: "call", effect: "lead", cost: [5_000, 20_000], days: [1, 3], difficulty: 45,
    title: "{name} thinks they're being followed",
    text: "{name} has seen the same car three nights running outside their flat in {city}. Send someone to watch the watchers.",
    success: "{name} was right. The watcher was a thrall, and he led us home.",
    fail: "Our operator was spotted watching. {name} is blown, and has gone to ground.",
    catastrophe: "The watcher saw our operator, followed them in turn, and rolled up everything we have in {region}.",
  },
  {
    id: "call-cousin", kind: "call", effect: "intel", cost: [10_000, 25_000], days: [2, 3], difficulty: 45,
    title: "{name}'s cousin wants in",
    text: "{name} has a cousin who works nights at the port in {city} and has seen things. {name} wants us to meet him. Nobody has vetted him.",
    success: "The cousin is real, frightened, and full of useful detail.",
    fail: "The cousin talked to the wrong people about the meeting. {name} is burned with him.",
    catastrophe: "The cousin belonged to them. He knew {name}, and {name} knew the others in {region}.",
  },
  {
    id: "call-tonight", kind: "call", effect: "lead", cost: [5_000, 15_000], days: [1, 1], difficulty: 40,
    title: "{name} needs a meeting tonight",
    text: "A coded call from {name} in {city}: something has happened, and it can't be said on the phone.",
    success: "Something had happened, and now we know where.",
    fail: "Our operator was late, and {name} was gone. We don't know if they ran or were taken.",
    catastrophe: "It was a trap, and {name} had walked into it first. They had our other names in {region} by morning.",
  },
  {
    id: "call-sell", kind: "call", effect: "intel", cost: [40_000, 80_000], days: [2, 4], difficulty: 50,
    title: "{name} has something to sell",
    text: "{name} has copied a file in {city} that they swear is worth a great deal of money. Someone needs to see it before we pay.",
    success: "The file is genuine. Worth every cent.",
    fail: "The file was a fake, and someone knew {name} had made it. {name} is finished.",
    catastrophe: "The file was bait, and asking about it burned {name} and everyone near them in {region}.",
  },
  {
    id: "call-enough", kind: "call", effect: "cheaper", cost: [5_000, 15_000], days: [1, 2], difficulty: 45,
    title: "{name} has had enough",
    text: "{name} wants out. They are scared, tired, and their family has started asking questions. An operator could talk them round.",
    success: "{name} stays, and for less: they want this to end as much as we do.",
    fail: "{name} couldn't be talked round, and is out.",
    catastrophe: "{name} told their family everything, and the family told the papers. Our network in {region} is finished.",
  },
  {
    id: "dis-trail", kind: "disinfo", effect: "false-trail", cost: [80_000, 150_000], days: [4, 7], difficulty: 50,
    title: "A false trail for {bloodline}, {region}",
    text: "Through {name}, our {role} in {city}, we can feed {bloodline} a story: that we are closing in, from the wrong direction. They will move, and wait, and we will know where.",
    success: "{bloodline} believed it. They have gone quiet in {region}, and what they kept here is where we said it would be.",
    fail: "{bloodline} smelled it, and traced the story back to {name}. {name} is burned.",
    catastrophe: "{bloodline} traced the story back through {name} to everyone we run in {region}.",
  },
  {
    id: "dis-counter", kind: "disinfo", effect: "counter-story", cost: [60_000, 120_000], days: [3, 5], difficulty: 45,
    title: "Kill the story, {region}",
    text: "The bloodlines' campaign in {region} has worked. {name}, our {role} in {city}, can plant the other side of it: the money behind it, and who it serves.",
    success: "The counter-story ran everywhere. Opinion in {region} has swung back.",
    fail: "Nobody ran it, and the people who were asked remember who asked. {name} is burned.",
    catastrophe: "It ran, with {name}'s name on it, and the names of everyone else we have in {region}.",
  },
  {
    id: "dis-bait", kind: "disinfo", effect: "bait", cost: [100_000, 180_000], days: [5, 8], difficulty: 55,
    title: "Bait for {bloodline}, {city}",
    text: "{name} can let it slip, in the right ears in {city}, that the Order has something {bloodline} wants back. Whoever comes for it will show us where they come from.",
    success: "They came for it, and we followed them home. We know a great deal more about {bloodline}.",
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

function offerHumint(s: GameState, a: Asset, kind: "call" | "disinfo") {
  const r = rng(s);
  const bloodline = bloodlineIn(s, a.regionId, r);
  const eroded = (s.regions[a.regionId]?.support ?? 0) < neutralAnchor(a.regionId) - 0.3;
  const options = HUMINT_TEMPLATES.filter((t) => {
    if (t.kind !== kind) return false;
    if (t.effect === "counter-story") return eroded;
    if (t.effect === "false-trail" || t.effect === "bait") return !!bloodline;
    return true;
  });
  if (!options.length) return;
  const t = r.pick(options);
  const region = regionById(a.regionId)!;
  const bl = BLOODLINES.find((b) => b.id === bloodline);
  const fill = (x: string) => fillHumint(x, a, region.name, bl?.name);
  const round = (n: number) => Math.round(n / 5_000) * 5_000;
  const c: CoverUp = {
    id: `covert-${s.nextId++}`,
    template: t.id,
    title: fill(t.title),
    text: fill(t.text),
    regionId: a.regionId,
    city: a.city,
    pos: { ...a.pos },
    offeredAt: s.time,
    expiresAt: s.time + (kind === "call" ? r.real(2, 4) : r.real(3, 6)) * DAY,
    cost: round(r.real(t.cost[0], t.cost[1])),
    days: r.int(t.days[0], t.days[1]),
    agents: 1,
    stat: "tradecraft",
    difficulty: t.difficulty,
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
    heading: kind === "call" ? "An asset calls" : "Disinformation",
    title: c.title,
    body: c.text + (kind === "call" ? "\n\nIgnore it, and we may lose them anyway." : ""),
    regionId: c.regionId,
    pos: c.pos,
    refId: c.id,
    effects: `$${c.cost.toLocaleString("en-US")} · ${c.days} day${c.days === 1 ? "" : "s"} · one operator, tradecraft · ${EFFECT_WORDS[t.effect]} if it works; a failure burns ${a.name}`,
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
    heading: "An asset is lost",
    title: `${a.name} is gone`,
    body: `Nobody answered when ${a.name}, our ${a.role} in ${a.city}, called. They stopped calling.`,
    regionId: a.regionId,
    pos: a.pos,
    effects: `${ASSET_KINDS[a.kind].name} asset lost`,
  });
}

/** An asset call or disinformation offer has run its course: the roll. */
export function finishHumint(s: GameState, c: CoverUp) {
  const r = rng(s);
  const t = humintTemplate(c.template);
  const a = s.assets.find((x) => x.id === c.assetId);
  const agents = s.agents.filter((x) => c.agentIds.includes(x.id));
  s.coverUps = s.coverUps.filter((x) => x !== c);
  const p = coverUpChance(s, c, agents);
  const result = !a ? "fail" : r.next() < p ? "success" : r.chance(CATASTROPHE_SHARE) ? "catastrophe" : "fail";

  const improved: string[] = [];
  const bases = s.installations.filter((i) => i.kind === "base");
  for (const x of agents) {
    x.deployed = false;
    if (!bases.some((b) => b.id === x.baseId) && bases[0]) x.baseId = bases[0].id;
    const line = improvementLine(x, { tradecraft: train(x, "tradecraft", result === "success" ? r.int(1, 2) : r.int(0, 1)) });
    if (line) improved.push(line);
    x.missions++;
  }
  const region = regionById(c.regionId)?.name ?? c.regionId;
  const bl = BLOODLINES.find((b) => b.id === c.bloodline);
  const fill = (x: string) => (a ? fillHumint(x, a, region, bl?.name) : x);
  const effects: string[] = [];
  let body: string;
  if (!a) {
    body = "The asset it depended on is gone. There was nothing to do.";
  } else if (result === "success") {
    body = fill(t?.success ?? "It worked.");
    effects.push(...applyEffect(s, c, a));
  } else {
    const lost = burn(s, a, result === "catastrophe");
    if (result === "catastrophe") changeSecrecy(s, -2, `our network in ${region} is blown`, c);
    body = fill(result === "catastrophe" ? (t?.catastrophe ?? "Everything went wrong.") : (t?.fail ?? "It didn't work."));
    effects.push(lost.length > 1 ? `${lost.length} assets in ${region} burned` : `${a.name} burned`);
    if (result === "catastrophe") effects.push("Secrecy −2");
  }
  const words = { success: c.kind === "call" ? "Handled" : "It worked", fail: "Burned", catastrophe: "Network blown" } as const;
  post(s, {
    kind: "coverup-result",
    heading: c.kind === "call" ? "An asset calls" : "Disinformation",
    title: `${words[result]}: ${c.title}`,
    body,
    regionId: c.regionId,
    pos: c.pos,
    effects: effects.join(" · "),
    improved,
  });
  addLog(s, `${words[result]}: ${c.title}.`, result === "success" ? "good" : "bad");
}

function applyEffect(s: GameState, c: CoverUp, a: Asset): string[] {
  const region = regionById(c.regionId)?.name ?? c.regionId;
  const bl = c.bloodline ?? bloodlineIn(s, c.regionId, rng(s));
  const name = (id: string | null) => BLOODLINES.find((b) => b.id === id)?.name ?? "the bloodline";
  switch (c.effect) {
    case "lead": {
      const op = s.operations.find((o) => o.regionId === c.regionId && !o.leadId);
      if (op) {
        surfaceLead(s, op, "informant");
        return ["A lead"];
      }
      if (bl) addIntel(s, bl, CALL_INTEL);
      return bl ? [`Intel on ${name(bl)} +${CALL_INTEL}`] : [];
    }
    case "intel":
      if (bl) addIntel(s, bl, CALL_INTEL);
      return bl ? [`Intel on ${name(bl)} +${CALL_INTEL}`] : [];
    case "cheaper":
      a.monthly = Math.round((a.monthly * 0.8) / 1_000) * 1_000;
      return [`${a.name}'s fee now $${a.monthly.toLocaleString("en-US")}/mo`];
    case "false-trail": {
      if (!bl) return [];
      s.nextOperation[bl] = Math.max(s.nextOperation[bl] ?? s.time, s.time) + FALSE_TRAIL_DAYS * DAY;
      let trapped = 0;
      for (const x of s.sites)
        if (x.bloodline === bl && x.regionId === c.regionId && x.kind !== "lair") {
          x.trapped = true;
          x.expiresAt += 4 * DAY;
          trapped++;
        }
      return [`${name(bl)} quiet for ${FALSE_TRAIL_DAYS} days`, ...(trapped ? [`${trapped} site${trapped === 1 ? "" : "s"} in ${region} drawn into a trap`] : [])];
    }
    case "counter-story":
      changeSupport(s, c.regionId, COUNTER_STORY_SUPPORT);
      return [`Support in ${region} +${COUNTER_STORY_SUPPORT}`];
    case "bait":
      if (bl) addIntel(s, bl, BAIT_INTEL);
      return bl ? [`Intel on ${name(bl)} +${BAIT_INTEL}`] : [];
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
    .filter((x) => x.baseId === held.base.id && !x.deployed && !isWounded(s, x))
    .sort((x, y) => y.stats.tradecraft - x.stats.tradecraft)[0] ?? null;
}

export const turnChance = (tradecraft: number) => Math.min(0.9, Math.max(0.1, 0.5 + (tradecraft - TURN_DIFFICULTY) / 50));

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
  const bl = BLOODLINES.find((b) => b.id === captive.bloodline);
  const regionId = captive.regionId ?? REGIONS.find((x) => x.cities.some((c) => c.name === captive.city))?.id ?? bl?.homeRegions[0] ?? base.regionId;
  const region = regionById(regionId);
  const city = region?.cities.find((c) => c.name === captive.city) ?? region?.cities[0] ?? { name: captive.city, ...base.pos };
  const who = `${op.sister ? "Sr." : "Br."} ${op.name}`;
  const ok = r.next() < turnChance(op.stats.tradecraft);
  const gain = train(op, "tradecraft", ok ? r.int(1, 2) : r.int(0, 1));
  const improved = [improvementLine(op, { tradecraft: gain })].filter((x): x is string => !!x);
  if (ok) {
    const a = recruitAsset(s, "informant", `turned thrall of ${bl?.short ?? "a bloodline"}`, regionId, city.name, { lat: city.lat, lon: city.lon });
    a.bloodline = captive.bloodline;
    a.monthly = Math.round((a.monthly * TURNED_FEE_SHARE) / 5_000) * 5_000;
    post(s, {
      kind: "coverup-result",
      heading: "A thrall is turned",
      title: `Turned: the thrall from ${captive.city}`,
      body: `${who} sat with the thrall from ${captive.city} for three nights, and on the fourth it agreed. It goes back to ${bl?.name ?? "its masters"} as ours: a voice inside the bloodline, for as long as they don't notice.`,
      regionId,
      pos: a.pos,
      effects: `Informant in ${region?.name}, intel on ${bl?.short ?? "the bloodline"} every day · $${a.monthly.toLocaleString("en-US")}/mo`,
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
    effects: worse ? "Secrecy −2" : "No asset",
    improved,
  });
  return null;
}

/** How much of a bloodline media hit lands in a region (PR assets blunt it). */
export const mediaDamping = (s: GameState, regionId: string) => (hasAsset(s, regionId, "pr") ? PR_MEDIA_DAMPING : 1);
