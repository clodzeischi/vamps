// The campaign's three acts, from the book (docs/WEB_PORT.md 2b).
//
//   Act 1  The Order at Padua hunts Agnes of Toulouse and learns she is far
//          beyond it. The Serpenta Sigil strikes back: Base Padua falls.
//   Act 2  The hostage years. The Vatican is held to ransom: a trickle of a
//          stipend, Europe closed, and if secrecy breaks Agnes exposes the
//          Order. A cell outside Europe fights the five lesser bloodlines.
//   Act 3  Three sigils broken: Europe reopens, and the road ends at Montségur.
import { AGNES, BLOODLINES } from "../data/bloodlines";
import { REGIONS, regionById } from "../data/regions";
import { isDestroyed } from "./bloodlines";
import { suggestName } from "./commands";
import { changeSupport } from "./economy";
import { distanceNm } from "./geo";
import { acquireAircraft, enlist } from "./personnel";
import { rng } from "./rng";
import { addLog, post, type GameState, type Installation } from "./state";
import { DAY, formatDate } from "./time";

export type Act = 1 | 2 | 3;

export interface StoryState {
  act: Act;
  /** Act 1: when the Serpenta Sigil strikes Padua. */
  fallAt: number;
  /** The player has been warned the assault is coming. */
  fallWarned: boolean;
  fellAt: number | null;
  /** Act 3 began: Europe reopened. */
  returnedAt: number | null;
  /** Secrecy broke while the Vatican was hostage: Agnes exposed the Order. */
  exposed: boolean;
  /** Agnes is dead. */
  won: boolean;
}

export const ACT_NAMES: Record<Act, string> = { 1: "Act I · The hunt for Agnes", 2: "Act II · The hostage years", 3: "Act III · The return" };

/** The fall comes this many days into the campaign, telegraphed a week ahead. */
export const FALL_DAY = 45;
export const FALL_WARNING_DAYS = 7;
/** Support every European region loses when Padua falls. */
export const FALL_SUPPORT_HIT = 2.5;
/** Agents at a European base when it falls who get out alive (the rest die with it). */
export const FALL_ESCAPE_CHANCE = 0.5;
/** Lesser sigils to break before Europe reopens. */
export const SIGILS_TO_RETURN = 3;
/** Support every European region regains when it reopens. */
export const RETURN_SUPPORT = 1;
/** Share of the Holy See's stipend that gets through: by lesser sigils broken while hostage; after the return. */
export const HOSTAGE_STIPEND = [0.15, 0.3, 0.45];
export const RETURN_STIPEND = 0.75;

export const LESSER = BLOODLINES.filter((b) => b.id !== AGNES).map((b) => b.id);

export function newStory(startTime: number): StoryState {
  return { act: 1, fallAt: startTime + FALL_DAY * DAY, fallWarned: false, fellAt: null, returnedAt: null, exposed: false, won: false };
}

export const isEurope = (regionId: string) => regionById(regionId)?.group === "Europe";
/** Act 2: no building or operations in Europe. */
export const europeClosed = (s: GameState) => s.story.act === 2;
export const EUROPE_CLOSED = "Europe is closed to us while the Vatican is held hostage. Break three of the lesser sigils first.";
export const lesserBroken = (s: GameState) => LESSER.filter((id) => isDestroyed(s, id)).length;

/** Share of the Holy See's stipend that reaches the Order. */
export function stipendShare(s: GameState): number {
  const st = s.story;
  if (st.exposed) return 0;
  if (st.act === 1) return 1;
  if (st.act === 2) return HOSTAGE_STIPEND[Math.min(HOSTAGE_STIPEND.length - 1, lesserBroken(s))]!;
  return RETURN_STIPEND;
}

/** Removes an installation and everything at it. Agents and aircraft in the field are rehomed by their missions. */
function razeInstallation(s: GameState, inst: Installation) {
  s.installations = s.installations.filter((i) => i !== inst);
  s.projects = s.projects.filter((p) => p.baseId !== inst.id);
}

/** Where the survivors go: the nearest base outside Europe, or a church cell raised for them. */
function haven(s: GameState, from: Installation | undefined): Installation {
  const abroad = s.installations
    .filter((i) => i.kind === "base" && !isEurope(i.regionId))
    .sort((a, b) => (from ? distanceNm(a.pos, from.pos) - distanceNm(b.pos, from.pos) : 0));
  return abroad.find((b) => b.readyAt <= s.time) ?? abroad[0] ?? churchCell(s);
}

/**
 * The safety net: a player with no base outside Europe gets a dormant church
 * cell, bare-bones (one helicopter, a few beds, no labs) with a listening post,
 * where the Church is best liked outside Europe.
 */
function churchCell(s: GameState): Installation {
  const r = rng(s);
  const region = REGIONS.filter((x) => !isEurope(x.id) && x.cities.length)
    .sort((a, b) => (s.regions[b.id]?.support ?? 0) - (s.regions[a.id]?.support ?? 0) || b.funding - a.funding)[0]!;
  const city = r.pick(region.cities.slice(0, 2));
  const cell: Installation = {
    id: `ob-cell-${s.nextId++}`, kind: "base", name: `Cell ${city.name}`, regionId: region.id,
    pos: { lat: city.lat, lon: city.lon }, readyAt: s.startTime, evictionWarned: false, // dormant, but always there
    hangars: 1, quarters: 6, labs: 0, workshops: 0, containment: 0, scientists: 0, engineers: 0, remains: 0, captives: [], upgrades: [],
  };
  // A listening post in the same region (unless we already have one), so the cell isn't deaf.
  const post_: Installation | null = s.installations.some((i) => i.kind === "sigint" && i.regionId === region.id) ? null : {
    id: `sigint-${s.nextId++}`, kind: "sigint", name: suggestName(s, "sigint", region.id, cell.pos), regionId: region.id,
    pos: { ...cell.pos }, readyAt: s.startTime, evictionWarned: false,
  };
  s.installations.push(cell, ...(post_ ? [post_] : []));
  acquireAircraft(s, cell.id, "helicopter", true);
  for (let i = 0; i < 2; i++) enlist(s, cell.id);
  return cell;
}

function warnFall(s: GameState) {
  s.story.fallWarned = true;
  const padua = s.installations.find((i) => i.id === "ob-padua");
  const abroad = s.installations.some((i) => i.kind === "base" && !isEurope(i.regionId));
  post(s, {
    kind: "story",
    title: "The Serpenta Sigil stirs",
    body:
      `Our sources in the Curia have gone silent one by one. A cardinal who dined with Agnes of Toulouse last week will not leave his rooms. Every thread we pulled on led back to her, and she has noticed.\n\n` +
      `Something is coming for ${padua?.name ?? "us"}, within the week. Whoever is in the field when it comes, or at a base outside Europe, will live to fight on.` +
      (abroad ? "" : " We have no base outside Europe. If Padua falls, the Church will have to find us somewhere to go."),
    regionId: padua?.regionId,
    pos: padua?.pos,
  });
}

/** Act 1 ends: the Serpenta Sigil destroys Base Padua and everything the Order has in Europe. */
export function theFall(s: GameState) {
  const st = s.story;
  if (st.act !== 1) return;
  const r = rng(s);
  const padua = s.installations.find((i) => i.id === "ob-padua") ?? s.installations.find((i) => i.kind === "base" && isEurope(i.regionId));
  const fallenBases = s.installations.filter((i) => i.kind === "base" && isEurope(i.regionId));
  const fallenIds = new Set(fallenBases.map((b) => b.id));
  const lost = s.installations.filter((i) => isEurope(i.regionId));
  const refuge = haven(s, padua);

  // Those in the field live, and find their way to the refuge.
  const dead: string[] = [];
  let escaped = 0;
  for (const a of [...s.agents]) {
    if (!fallenIds.has(a.baseId)) continue;
    if (a.deployed || r.chance(FALL_ESCAPE_CHANCE)) {
      if (!a.deployed) escaped++;
      a.baseId = refuge.id;
      continue;
    }
    s.agents = s.agents.filter((x) => x !== a);
    s.fallen.push({ name: a.name, sister: a.sister, died: s.time, where: padua?.name ?? "Padua" });
    dead.push(`${a.sister ? "Sr." : "Br."} ${a.name}`);
  }
  const burned: string[] = [];
  for (const a of [...s.aircraft]) {
    if (!fallenIds.has(a.baseId)) continue;
    if (a.deployed) a.baseId = refuge.id;
    else {
      s.aircraft = s.aircraft.filter((x) => x !== a);
      burned.push(a.name);
    }
  }
  for (const m of s.missions) if (fallenIds.has(m.baseId)) m.baseId = refuge.id;
  for (const i of lost) razeInstallation(s, i);
  for (const reg of REGIONS) if (isEurope(reg.id)) changeSupport(s, reg.id, -FALL_SUPPORT_HIT);

  st.act = 2;
  st.fellAt = s.time;
  const stations = lost.filter((i) => i.kind === "sigint").length;
  addLog(s, `${padua?.name ?? "Base Padua"} has fallen.`, "bad");
  post(s, {
    kind: "story",
    title: `${padua?.name ?? "Base Padua"} has fallen`,
    body:
      `They came at dusk, more of them than we knew existed, under the Serpenta Sigil. ${padua?.name ?? "The base"} burned until morning.` +
      (stations ? ` Our ${stations === 1 ? "station" : `${stations} stations`} in Europe went dark the same night.` : "") +
      `\n\nThen Agnes sent a letter to the Holy Father. She holds proof of everything the Order has done, and will publish it the day the Vatican moves against her. The Holy See can do nothing: the stipend is cut to a trickle and Europe is closed to us.` +
      `\n\nWhat is left of the Order gathers at ${refuge.name}. Break three of the lesser bloodlines and her hold will weaken. Until then, whatever happens, the world must not learn of us: if the secret breaks, Agnes will make sure it breaks on the Church.`,
    regionId: refuge.regionId,
    pos: refuge.pos,
    refId: refuge.id,
    casualties: { dead, wounded: [] },
    effects: [
      escaped ? `${escaped} got out of Padua` : null,
      burned.length ? `Lost: ${burned.join(", ")}` : null,
      `Support in Europe −${FALL_SUPPORT_HIT}`,
      `Stipend ${Math.round(stipendShare(s) * 100)}%`,
    ].filter(Boolean).join(" · "),
  });
}

/** Three sigils broken: Act 3. */
function theReturn(s: GameState) {
  const st = s.story;
  st.act = 3;
  st.returnedAt = s.time;
  for (const reg of REGIONS) if (isEurope(reg.id)) changeSupport(s, reg.id, RETURN_SUPPORT);
  post(s, {
    kind: "story",
    title: "Europe reopens",
    body:
      `Three sigils are broken, and Agnes's allies have learned what it costs to stand beside her. Cardinals who would not take our calls now ask for meetings. The Holy See has found the nerve to send us money again, and Europe is open to us.` +
      `\n\nShe knows we are coming. Rebuild in Europe, learn where she sleeps, and end it at Montségur, where her line began.`,
  });
  addLog(s, "Europe reopens to the Order.", "good");
}

function victory(s: GameState) {
  s.story.won = true;
  const left = BLOODLINES.filter((b) => b.id !== AGNES && !isDestroyed(s, b.id)).length;
  s.gameOver =
    `Agnes of Toulouse is ash, and the Serpenta Sigil is broken at Montségur, where it was made eight hundred years ago. ` +
    (left ? `The ${left === 1 ? "last lesser bloodline scatters" : `${left} lesser bloodlines left scatter`} without her, to be hunted for years. ` : "Every bloodline is destroyed. ") +
    `The Holy See is free, and the Order returns to the shadows it came from. Victory, ${formatDate(s.time)}.`;
  post(s, { kind: "game-over", title: "Victory at Montségur", body: s.gameOver });
}

/** Secrecy broke while the Vatican was hostage. Called by changeSecrecy. */
export function exposeOrder(s: GameState) {
  s.story.exposed = true;
  post(s, {
    kind: "open-war",
    title: "Agnes exposes the Order",
    body:
      `The Masquerade is broken, and Agnes was ready. Within the hour every newsroom in Europe has the Order's files: the burned houses, the disappeared, the Vatican's money. The Holy See disowns us before nightfall.` +
      `\n\nNo more stipend, no more protection. The bloodlines stop pretending. This is open war, and we fight it alone.`,
  });
}

/** Hourly: the story's clock. */
export function hourlyStory(s: GameState) {
  const st = s.story;
  if (st.act === 1) {
    if (!st.fallWarned && s.time >= st.fallAt - FALL_WARNING_DAYS * DAY) warnFall(s);
    else if (s.time >= st.fallAt) theFall(s);
  } else if (st.act === 2 && lesserBroken(s) >= SIGILS_TO_RETURN) theReturn(s);
  if (!st.won && !s.gameOver && isDestroyed(s, AGNES)) victory(s);
}
