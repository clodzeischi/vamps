// The houses' networks (docs/design/intelligence.md). Each house is a lair,
// DENS dens under it and 2–4 nests under each den, placed when the campaign
// starts. A site's people run the house's operations, so a lead points at a
// real site. We climb: exploiting a raided nest, snatching one of its people
// or questioning a captive gives a den clue; every CLUES_PER_DEN clues reveal
// a den; DENS_FOR_LAIR dens raided reveal the lair. A found lair doesn't move:
// the house strikes first, assaulting one of our bases until the lair is hit.
import { noteActivity } from "./activity";
import { BLOODLINES, type BloodlineDef, bloodlineById } from "../../data/bloodlines";
import { LORE, LORE_STEP } from "../../data/lore";
import { ELDERS } from "../../data/people";
import { neighboursOf, regionById } from "../../data/regions";
import { aliveBloodlines, BOLDNESS_PER_FALLEN, destroyedCount, isDestroyed, isDormant, lairLocked } from "../campaign/bloodlines";
import { fight, type Threat } from "../missions/combat";
import { distanceNm } from "../core/geo";
import { scaled, SITE_KINDS } from "../missions/missions";
import { healPerDay, loseBase } from "../people/personnel";
import { combatMods } from "../base/research";
import { rng, type Rng } from "../core/rng";
import { changeSecrecy } from "../campaign/secrecy";
import { addLog, improvementLine, isReady, post, train, type GameState, type HouseNetwork, type Installation, type NetSite, type Site, isDeployed, agentName, agentById, missionById } from "../core/state";
import { agnesProvoked } from "../campaign/story";
import { DAY, type LatLon } from "../core/time";

export const DENS = 3;
export const NESTS_PER_DEN = [2, 4] as const;
/** Den clues that reveal one den. */
export const CLUES_PER_DEN = 2;
/** Dens raided that reveal the lair. */
export const DENS_FOR_LAIR = 2;
/** Each page (raid, snatch, questioning) opens this much of the chronicle (data/lore.ts: 20..80; 100 is the lair). */
export const PAGE_STEP = LORE_STEP;
/** Once its lair is found, a house waits this long before it may strike, then tries on any day by this chance. */
const ASSAULT_GRACE_DAYS = 5;
const ASSAULT_CHANCE = 0.05;
/** After an assault, won or lost, the house regroups this long. */
const ASSAULT_RESPITE_DAYS = 20;
/** A house strikes bases in its homelands or this close to its lair. */
const ASSAULT_REACH_NM = 3000;
/** What a house sends against a base (scaled like any site), and the defenders' edge at home. */
const ASSAULT_THREAT: Threat = { thralls: 8, vampires: 3 };
const HOME_ADVANTAGE = 0.15;
/** Secrecy a battle at one of our bases costs. */
const ASSAULT_SECRECY = 1.5;
/** A lair (and a den) stays put until it is hit (far future, JSON-safe). */
const NEVER = 8.64e15;
/** The networks have a random stream of their own, so placing them doesn't move the campaign's. */
const NETWORK_SALT = 0x2545f491;

const shortOf = (id: string) => bloodlineById(id)?.short ?? "the house";
const nameOf = (id: string) => (bloodlineById(id)?.name ?? "the bloodline").replace(/^The /, "the ");


/** A city in a region (one of its `top` largest), with a little scatter. */
function placeIn(r: Rng, regionId: string, top = 6, jitter = 0.12): { regionId: string; city: string; pos: LatLon } {
  const region = regionById(regionId)!;
  const city = region.cities.length ? r.pick(region.cities.slice(0, top)) : { name: region.name, ...region.label };
  return { regionId, city: city.name, pos: { lat: city.lat + r.real(-jitter, jitter), lon: city.lon + r.real(-jitter, jitter) } };
}

/** Where a nest stands, or where a site's people work: its own region, often next door, now and then anywhere in the homelands. */
export function nearRegion(r: Rng, b: BloodlineDef, regionId: string): string {
  const near = neighboursOf(regionId).filter((x) => b.homeRegions.includes(x));
  const x = r.next();
  if (x < 0.4) return regionId;
  if (x < 0.75 && near.length) return r.pick(near);
  return r.pick(b.homeRegions);
}

function buildNetwork(r: Rng, b: BloodlineDef): HouseNetwork {
  let n = 0;
  const id = (kind: string) => `net-${b.id}-${kind}${n++}`;
  const lairAt = b.lair
    ? { regionId: b.lair.regionId, city: b.lair.city, pos: { lat: b.lair.lat, lon: b.lair.lon } }
    : placeIn(r, r.pick(b.homeRegions), 3, 0);
  const lair: NetSite = { id: id("lair"), kind: "lair", parentId: null, ...lairAt, known: false, raided: false };
  const sites: NetSite[] = [lair];
  const regions = r.shuffle(b.homeRegions);
  for (let d = 0; d < DENS; d++) {
    const den: NetSite = { id: id("den"), kind: "den", parentId: lair.id, ...placeIn(r, regions[d % regions.length]!), known: false, raided: false };
    sites.push(den);
    for (let k = r.int(NESTS_PER_DEN[0], NESTS_PER_DEN[1]); k > 0; k--)
      sites.push({ id: id("nest"), kind: "nest", parentId: den.id, ...placeIn(r, nearRegion(r, b, den.regionId)), known: false, raided: false });
  }
  return { sites, clues: 0, pages: 0, nextAssaultAt: null };
}

/** Every house's network, from the campaign's seed. */
export function newNetworks(seed: number): Record<string, HouseNetwork> {
  const r = rng({ rng: (seed ^ NETWORK_SALT) | 0 });
  return Object.fromEntries(BLOODLINES.map((b) => [b.id, buildNetwork(r, b)]));
}

export const networkOf = (s: GameState, id: string): HouseNetwork => (s.networks[id] ??= { sites: [], clues: 0, pages: 0, nextAssaultAt: null });

/** A network site by id, with its house. */
export function findNetSite(s: GameState, netId: string | undefined): { bloodline: string; site: NetSite } | null {
  if (!netId) return null;
  for (const [bloodline, net] of Object.entries(s.networks)) {
    const site = net.sites.find((x) => x.id === netId);
    if (site) return { bloodline, site };
  }
  return null;
}

/** Dens we have found: on the map now, or already burned. */
export const densFound = (net: HouseNetwork) => net.sites.filter((x) => x.kind === "den" && (x.known || x.raided)).length;
export const densRaided = (net: HouseNetwork) => net.sites.filter((x) => x.kind === "den" && x.raided).length;

/** How much of a house's chronicle is open (0..100, data/lore.ts): a page per raid, all of it once the lair is found. */
export function knowledgeOf(s: GameState, id: string): number {
  const st = s.bloodlines[id];
  if (st?.lairId || st?.destroyedAt) return 100;
  return Math.min(100 - PAGE_STEP, (s.networks[id]?.pages ?? 0) * PAGE_STEP);
}

/** A raid, snatch or questioning taught us something: the next page of the chronicle. */
export function addPage(s: GameState, bloodline: string) {
  const before = knowledgeOf(s, bloodline);
  networkOf(s, bloodline).pages++;
  const after = knowledgeOf(s, bloodline);
  for (const e of LORE[bloodline] ?? [])
    if (before < e.at && after >= e.at && e.at < 100)
      addLog(s, `New in the file on ${bloodlineById(bloodline)?.name ?? "a bloodline"}: ${e.title} (Bloodlines, B).`, "good");
}

/** The site a new operation is run from: a nest, sometimes a den; the lair only when nothing else is left. */
export function runner(s: GameState, bloodline: string, r: Rng): NetSite | null {
  const live = networkOf(s, bloodline).sites.filter((x) => !x.raided);
  const pool: [NetSite, number][] = live.filter((x) => x.kind !== "lair").map((x) => [x, x.kind === "nest" ? 1 : 0.4]);
  if (!pool.length) return live.find((x) => x.kind === "lair") ?? null;
  let x = r.next() * pool.reduce((a, [, w]) => a + w, 0);
  for (const [site, w] of pool) if ((x -= w) <= 0) return site;
  return pool[pool.length - 1]![0];
}

/** Puts a network site on the map as a strike target (or returns the one already there). */
export function revealSite(s: GameState, ns: NetSite, bloodline: string, opts: { expiresAt?: number; story?: string } = {}): Site {
  const there = s.sites.find((x) => x.netId === ns.id);
  if (there) {
    ns.known = true;
    return there;
  }
  const t = ns.kind === "lair" ? SITE_KINDS.lair : scaled(s, SITE_KINDS[ns.kind]);
  const site: Site = {
    id: ns.kind === "lair" ? `lair-${bloodline}` : `site-${s.nextId++}`,
    netId: ns.id, bloodline, kind: ns.kind, regionId: ns.regionId, city: ns.city, pos: ns.pos, revealedAt: s.time,
    // A nest or den may move any day (dailyNetworks); a lair never does. The story can set a deadline.
    expiresAt: opts.expiresAt ?? NEVER,
    thralls: t.thralls, vampires: t.vampires, missionId: null,
    ...(opts.story ? { story: opts.story } : {}),
  };
  s.sites.push(site);
  ns.known = true;
  noteActivity(s, site.regionId, ns.kind === "lair" ? 2 : 1);
  if (ns.kind === "lair") {
    s.bloodlines[bloodline]!.lairId = site.id;
    networkOf(s, bloodline).nextAssaultAt = s.time + ASSAULT_GRACE_DAYS * DAY;
  }
  return site;
}

/** The site packs up and goes elsewhere in its region (or next door, in the homelands): we lose sight of it. */
export function moveSite(s: GameState, ns: NetSite, bloodline: string) {
  const b = bloodlineById(bloodline)!;
  const r = rng(s);
  Object.assign(ns, placeIn(r, nearRegion(r, b, ns.regionId)));
  ns.known = false;
  // Whatever we had on the map is stale now (a team already flying there finds it empty).
  s.sites = s.sites.filter((x) => x.netId !== ns.id || !!x.missionId);
}

/** Moves an unknown nest of the house to this city (a scripted operation). */
function nestAt(s: GameState, bloodline: string, regionId: string, city: string, pos: LatLon): NetSite | null {
  const free = networkOf(s, bloodline).sites.filter((x) => x.kind === "nest" && !x.raided && !x.known);
  const ns = free.find((x) => x.regionId === regionId && x.city === city) ?? free.find((x) => x.regionId === regionId) ?? free[0];
  if (!ns) return null;
  Object.assign(ns, { regionId, city, pos: { lat: pos.lat + 0.04, lon: pos.lon - 0.04 } });
  return ns;
}

/** A den the clues point to: under the nests we've burned, where we can. */
function nextDen(net: HouseNetwork): NetSite | undefined {
  const dens = net.sites.filter((x) => x.kind === "den" && !x.known && !x.raided);
  const burned = (d: NetSite) => net.sites.filter((x) => x.parentId === d.id && x.raided).length;
  return dens.sort((a, b) => burned(b) - burned(a))[0];
}

/** Adds den clues; enough of them reveal a den. Returns lines for a debrief. */
export function addClues(s: GameState, bloodline: string, n: number): string[] {
  if (n <= 0 || isDestroyed(s, bloodline)) return [];
  const net = networkOf(s, bloodline);
  net.clues += n;
  const lines: string[] = [];
  while (densFound(net) < Math.floor(net.clues / CLUES_PER_DEN)) {
    const den = nextDen(net);
    if (!den) break;
    const site = revealSite(s, den, bloodline);
    lines.push(`The clues meet: a den of the ${shortOf(bloodline)} in ${den.city}`);
    post(s, {
      kind: "site",
      title: `A den of ${nameOf(bloodline)}: ${den.city}`,
      body:
        `What we have taken from ${nameOf(bloodline)} points to one address in ${den.city}: a den, where the nests send their blood and money. ` +
        `About ${site.thralls} thralls and ${site.vampires === 1 ? "one of them" : `${site.vampires} of them`}. It will stay where it is until we hit it. ` +
        `Burn ${DENS_FOR_LAIR} of the house's dens and we will know where its elder sleeps.`,
      regionId: den.regionId,
      pos: den.pos,
      refId: site.id,
    });
  }
  if (!lines.length) {
    const toward = net.clues - densFound(net) * CLUES_PER_DEN;
    lines.push(nextDen(net) ? `Den clue on the ${shortOf(bloodline)} (${toward} of ${CLUES_PER_DEN})` : `Den clue on the ${shortOf(bloodline)}`);
  }
  return lines;
}

/** A lead that leads somewhere: the site behind its operation goes on the map (a den's people give a clue instead). */
export function revealFromLead(s: GameState, bloodline: string, siteId: string | undefined, where: { regionId: string; city: string; pos: LatLon }): { site: Site | null; lines: string[]; text: string } {
  let ns = findNetSite(s, siteId)?.site ?? null;
  if (!ns || ns.raided) ns = nestAt(s, bloodline, where.regionId, where.city, where.pos);
  if (!ns) return { site: null, lines: addClues(s, bloodline, 1), text: `It leads up the line, toward a den of ${nameOf(bloodline)}.` };
  if (ns.kind === "den" || ns.kind === "lair")
    return { site: null, lines: addClues(s, bloodline, 1), text: `The people behind this answer to a den of ${nameOf(bloodline)}. Another piece toward finding it.` };
  if (ns.known) return { site: s.sites.find((x) => x.netId === ns.id) ?? null, lines: [], text: `It leads to the nest of ${nameOf(bloodline)} we already know of in ${ns.city}.` };
  const site = revealSite(s, ns, bloodline);
  return { site, lines: [], text: `It leads somewhere: a nest of ${nameOf(bloodline)} in ${ns.city}. It won't stay there long.` };
}

/** A source points at a nest of the house: in this region if one is there, else the nearest. No nest left: a den clue. */
export function revealNest(s: GameState, bloodline: string, regionId: string): { site: Site | null; lines: string[] } {
  const free = networkOf(s, bloodline).sites.filter((x) => x.kind === "nest" && !x.raided && !x.known);
  const here = regionById(regionId);
  const at = here ? { lat: here.label.lat, lon: here.label.lon } : null;
  const ns = free.find((x) => x.regionId === regionId) ?? (at ? [...free].sort((a, b) => distanceNm(a.pos, at) - distanceNm(b.pos, at))[0] : free[0]);
  if (!ns) return { site: null, lines: addClues(s, bloodline, 1) };
  return { site: revealSite(s, ns, bloodline), lines: [`A nest of the ${shortOf(bloodline)} in ${ns.city}`] };
}

/** After a strike on a site: what it does to the network. Returns lines for the debrief. */
export function afterStrike(s: GameState, site: Site, result: "success" | "partial" | "fail" | "abort"): string[] {
  const found = findNetSite(s, site.netId);
  if (!found || result === "abort") return [];
  const { bloodline, site: ns } = found;
  const net = networkOf(s, bloodline);
  // Any raid on one of Agnes's dens, won or lost, brings her down on Padua (sim/campaign/story.ts).
  if (ns.kind === "den") agnesProvoked(s, bloodline);
  if (result === "success") {
    ns.raided = true;
    ns.known = false;
    addPage(s, bloodline);
    if (ns.kind === "nest") return addClues(s, bloodline, 1);
    if (ns.kind === "den") {
      const done = densRaided(net);
      if (done >= DENS_FOR_LAIR && !s.bloodlines[bloodline]?.lairId && !lairLocked(s, bloodline)) {
        revealLair(s, bloodline);
        return [`The lair of ${nameOf(bloodline)} is found`];
      }
      return [done >= DENS_FOR_LAIR ? `Dens of the ${shortOf(bloodline)} burned: ${done}` : `Dens of the ${shortOf(bloodline)} burned: ${done} of ${DENS_FOR_LAIR}`];
    }
    return [];
  }
  if (ns.kind === "lair") return [];
  moveSite(s, ns, bloodline);
  if (ns.kind === "den") {
    net.clues = Math.max(0, net.clues - 1);
    return [`The den has moved: one den clue lost`];
  }
  return [];
}

/** A nest gave up waiting and moved on. */
export function siteLapsed(s: GameState, site: Site) {
  const found = findNetSite(s, site.netId);
  if (found && !found.site.raided) moveSite(s, found.site, found.bloodline);
}

/** The lair, found by climbing: the elder's own words, and where. */
function revealLair(s: GameState, bloodline: string) {
  const b = bloodlineById(bloodline)!;
  const ns = networkOf(s, bloodline).sites.find((x) => x.kind === "lair");
  if (!ns) return;
  const site = revealSite(s, ns, bloodline);
  const elder = ELDERS[b.id];
  post(s, {
    kind: "site",
    speaker: b.id,
    title: `The lair of ${b.name}: ${ns.city}`,
    body:
      (elder ? `"${elder.reveal}"\n\n` : "") +
      `Two dens burned, and everything in them points to one place: ${ns.city}. ${elder ? `${elder.name} sleeps there` : "Its eldest sleeps there"}, under the sigil, guarded by everything the line has. Destroy the lair and the bloodline dies with it. ` +
      `It will not move. It will strike back: until the lair burns, ${b.name.replace(/^The /, "the ")} may come for any of our bases it can reach.`,
    regionId: ns.regionId,
    pos: site.pos,
    refId: site.id,
  });
}

/** Bases a house can reach from its lair: in its homelands, or close enough. */
export function basesUnderThreat(s: GameState, bloodline: string): Installation[] {
  const b = bloodlineById(bloodline)!;
  const lair = networkOf(s, bloodline).sites.find((x) => x.kind === "lair");
  if (!lair) return [];
  return s.installations
    .filter((i) => i.kind === "base" && isReady(s, i) && (b.homeRegions.includes(i.regionId) || distanceNm(i.pos, lair.pos) <= ASSAULT_REACH_NM))
    .sort((x, y) => distanceNm(x.pos, lair.pos) - distanceNm(y.pos, lair.pos));
}

/** Daily chance a known nest or den moves on its own: more as houses fall (the rest grow wary). A lair never moves. */
const MOVE_CHANCE = { nest: 0.06, den: 0.03 } as const;
export const moveChance = (s: GameState, kind: "nest" | "den") => MOVE_CHANCE[kind] * (1 + BOLDNESS_PER_FALLEN * destroyedCount(s));

/** Daily: known nests and dens may move (not with a team on the ground there). */
function dailyMoves(s: GameState, r: Rng) {
  for (const site of [...s.sites]) {
    if (site.kind === "lair" || site.kind === "haven" || site.expiresAt < NEVER || !r.chance(moveChance(s, site.kind))) continue;
    const m = missionById(s, site.missionId);
    if (m?.phase === "on-site" && !m.waiting) continue;
    const found = findNetSite(s, site.netId);
    if (!found) continue;
    addLog(s, `The ${site.kind} in ${site.city} has gone quiet. They moved on.`);
    moveSite(s, found.site, found.bloodline);
  }
}

/** Daily: sites move, a lair found once it may be (Act III for Agnes), and houses with a found lair striking our bases. */
export function dailyNetworks(s: GameState) {
  const r = rng(s);
  dailyMoves(s, r);
  for (const b of aliveBloodlines(s)) {
    const st = s.bloodlines[b.id];
    const net = s.networks[b.id];
    if (!st || !net) continue;
    if (!st.lairId && !lairLocked(s, b.id) && densRaided(net) >= DENS_FOR_LAIR) revealLair(s, b.id);
    if (!st.lairId || isDormant(s, b.id) || net.nextAssaultAt === null || s.time < net.nextAssaultAt) continue;
    if (!r.chance(ASSAULT_CHANCE)) continue;
    const target = basesUnderThreat(s, b.id)[0];
    if (target) assaultBase(s, b.id, target);
  }
}

/**
 * A house assaults one of our bases. Until base defence maps exist it is
 * fought by the auto-combat: everyone at the base, in full kit, with the edge
 * of fighting at home. Held: the house regroups. Lost: the base is lost; the
 * survivors get out to our nearest other base. Losing the last base loses the war.
 */
export function assaultBase(s: GameState, bloodline: string, base: Installation) {
  const r = rng(s);
  const net = networkOf(s, bloodline);
  net.nextAssaultAt = s.time + ASSAULT_RESPITE_DAYS * DAY;
  const name = nameOf(bloodline);
  const defenders = s.agents.filter((a) => a.baseId === base.id && !isDeployed(s, a) && a.hp > 0);
  const threat = scaled(s, ASSAULT_THREAT);
  const res = defenders.length
    ? fight(r, defenders, "tactical", threat, HOME_ADVANTAGE, combatMods(s, "tactical"))
    : { won: false, rounds: 0, dead: [], wounded: [], thrallsKilled: 0, vampiresKilled: 0 };
  const label = (id: string) => { const a = agentById(s, id)!; return `${agentName(a)}`; };
  const dead = res.dead.map(label);
  const wounded = res.wounded.filter((id) => !res.dead.includes(id)).map(label);
  const improved: string[] = [];
  for (const a of defenders) {
    if (res.dead.includes(a.id)) {
      s.fallen.push({ name: a.name, female: a.female, died: s.time, where: base.name });
      continue;
    }
    const line = improvementLine(a, { combat: train(a, "combat", res.won ? r.int(1, 3) : r.int(0, 1)), faith: train(a, "faith", r.int(0, 1)) });
    if (line) improved.push(line);
    if (a.hp < a.vitality * 0.75) a.woundedUntil = s.time + Math.ceil((a.vitality - a.hp) / healPerDay(s)) * DAY;
  }
  s.agents = s.agents.filter((a) => !res.dead.includes(a.id));
  changeSecrecy(s, -ASSAULT_SECRECY, `a battle at ${base.name}`, { regionId: base.regionId, city: base.name, pos: base.pos });
  const foes = `${threat.thralls} thralls and ${threat.vampires} of them`;
  if (res.won) {
    addLog(s, `${base.name} held against ${name}.`, "good");
    post(s, {
      kind: "debrief",
      title: `${base.name} held`,
      body:
        `${name.charAt(0).toUpperCase() + name.slice(1)} came for ${base.name} in the small hours: ${foes}, over the wall and through the hangar doors. ` +
        `They were thrown back. ${res.vampiresKilled ? `${res.vampiresKilled} of them burned in the yard. ` : ""}` +
        `They will come again when they have regrouped. The lair is still there to be hit.`,
      regionId: base.regionId,
      pos: base.pos,
      refId: base.id,
      casualties: { dead, wounded },
      effects: `Secrecy −${ASSAULT_SECRECY}`,
      improved,
    });
    return;
  }
  const refuge = loseBase(s, base);
  addLog(s, `${base.name} fell to ${name}.`, "bad");
  post(s, {
    kind: "evicted",
    title: `${base.name} has fallen`,
    body:
      `${name.charAt(0).toUpperCase() + name.slice(1)} came for ${base.name} in the small hours: ${foes}. ` +
      (defenders.length ? "The defenders couldn't hold. " : "There was nobody there to hold it. ") +
      `The base burned, and the staff with it.` +
      (refuge ? ` Whoever got out is making for ${refuge.name}.` : ""),
    regionId: base.regionId,
    pos: base.pos,
    casualties: { dead, wounded },
    effects: `${base.name} lost · Secrecy −${ASSAULT_SECRECY}`,
  });
}
