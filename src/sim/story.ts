// The campaign's three acts, from the book (docs/WEB_PORT.md 2b).
//
//   Act 1  The Order at Padua hunts Agnes of Toulouse and learns she is far
//          beyond it. The Serpenta Sigil strikes back: Base Padua falls.
//   Act 2  The hostage years. The Vatican is held to ransom: a trickle of a
//          stipend, Europe closed, and if secrecy breaks Agnes exposes the
//          Order. A cell outside Europe fights the five lesser bloodlines.
//   Act 3  Three sigils broken: Europe reopens, and the road ends at Montségur.
import { AGNES, BLOODLINES } from "../data/bloodlines";
import { neighboursOf, REGIONS, regionById } from "../data/regions";
import { isDestroyed } from "./bloodlines";
import { changeSupport } from "./economy";
import { distanceNm } from "./geo";
import { AIRCRAFT } from "../data/aircraft";
import { detectionChance, SIGINT_OWN_RATE, sigintRates } from "./commands";
import { enlist } from "./personnel";
import { RATLINE_SPEEDUP, RATLINE_USE_FEE } from "./humint";
import { isHired, SITE_KINDS, startReturn } from "./missions";
import { rng } from "./rng";
import { addLog, isReady, post, type GameState, type Installation, type Site } from "./state";
import { surfaceLead } from "./operations";
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
  /** Act I beats already played (see BEATS). */
  beats: string[];
  /** Act II: the cardinal's dispatches from Europe played so far, and when the next is due. */
  dispatches: number;
  nextDispatchAt: number | null;
}

export const ACT_NAMES: Record<Act, string> = { 1: "Act I · The hunt for Agnes", 2: "Act II · The hostage years", 3: "Act III · The return" };

/** From this day the Serpenta Sigil waits for a team to leave Padua, then strikes
 *  (as the Normandy was hit the moment Shepard took the shuttle). If no team
 *  ever leaves, it strikes anyway after the deadline. */
export const FALL_DAY = 45;
/** SIGINT may intercept the build-up from this many days before FALL_DAY, until it
 *  comes: each day by the detection chance for what we hear of Italy (the target)
 *  and France (Agnes's seat). Our own station there hears it clearly and early; a
 *  neighbour's faintly, if at all; no coverage, no warning. */
export const FALL_LISTEN_DAYS = 14;
export const FALL_LISTEN_REGIONS = ["italy", "france_benelux"];
export const FALL_DEADLINE_DAYS = 21;
/** Rookies a dormant church cell can muster, and nothing else. */
export const CELL_AGENTS = 4;
/** A parish basement costs little to keep (a built base is $500k a month). */
export const CELL_MONTHLY_COST = 60_000;
/** Support every European region loses when Padua falls. */
export const FALL_SUPPORT_HIT = 2.5;
/** Lesser sigils to break before Europe reopens. */
export const SIGILS_TO_RETURN = 3;
/** Support every European region regains when it reopens. */
export const RETURN_SUPPORT = 1;
/** Share of the Holy See's stipend that gets through: by lesser sigils broken while hostage; after the return. */
export const HOSTAGE_STIPEND = [0.2, 0.35, 0.5];
export const RETURN_STIPEND = 0.75;

export const LESSER = BLOODLINES.filter((b) => b.id !== AGNES).map((b) => b.id);

export function newStory(startTime: number): StoryState {
  return { act: 1, fallAt: startTime + FALL_DAY * DAY, fallWarned: false, fellAt: null, returnedAt: null, exposed: false, won: false, beats: [], dispatches: 0, nextDispatchAt: null };
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
 * The safety net, and meant to hurt: a player with no base outside Europe gets
 * a dormant church cell where the Church is best liked outside Europe. Four
 * rookies, a few beds, room for one aircraft, and nothing else: no aircraft,
 * no SIGINT, no labs. (HUMINT assets abroad, when they exist, will carry over.)
 */
function churchCell(s: GameState): Installation {
  const r = rng(s);
  // A lifeline: where our assets are (most first), else anywhere friendly, never under the Serpenta Sigil
  // (Europe, and Agnes's homelands beyond it).
  const serpenta = new Set(BLOODLINES.find((b) => b.id === AGNES)!.homeRegions);
  const held = (id: string) => s.assets.filter((a) => a.regionId === id).length;
  const region = REGIONS.filter((x) => !isEurope(x.id) && !serpenta.has(x.id) && x.cities.length)
    .sort((a, b) => held(b.id) - held(a.id) || (s.regions[b.id]?.support ?? 0) - (s.regions[a.id]?.support ?? 0) || b.funding - a.funding)[0]!;
  const city = r.pick(region.cities.slice(0, 2));
  const cell: Installation = {
    id: `ob-cell-${s.nextId++}`, kind: "base", name: `Cell ${city.name}`, regionId: region.id,
    pos: { lat: city.lat, lon: city.lon }, readyAt: s.startTime, evictionWarned: false, cell: true, // dormant, but always there
    hangars: 1, quarters: 8, labs: 0, workshops: 0, containment: 0, scientists: 0, engineers: 0, remains: 0, captives: [], upgrades: [],
  };
  s.installations.push(cell);
  for (let i = 0; i < CELL_AGENTS; i++) enlist(s, cell.id);
  return cell;
}

/** How well SIGINT hears the build-up: the summed daily rate over Italy and France. */
export function fallListening(s: GameState): number {
  const rates = sigintRates(s);
  return FALL_LISTEN_REGIONS.reduce((a, id) => a + (rates.get(id) ?? 0), 0);
}

/** Daily in the weeks before the fall: maybe a station picks up the Serpenta Sigil moving. */
function listenForFall(s: GameState) {
  const rate = fallListening(s);
  if (rate <= 0 || !rng(s).chance(detectionChance(rate))) return;
  s.story.fallWarned = true;
  const clear = rate >= SIGINT_OWN_RATE / 2; // a station of our own in Italy or France
  const near = new Set(FALL_LISTEN_REGIONS.flatMap((id) => [id, ...neighboursOf(id)]));
  const station =
    s.installations.find((i) => i.kind === "sigint" && isReady(s, i) && FALL_LISTEN_REGIONS.includes(i.regionId)) ??
    s.installations.find((i) => i.kind === "sigint" && isReady(s, i) && near.has(i.regionId));
  const padua = s.installations.find((i) => i.id === "ob-padua");
  const abroad = s.installations.some((i) => i.kind === "base" && !isEurope(i.regionId));
  const by = station?.name ?? "One of our stations";
  post(s, {
    kind: "lead",
    scene: "sigint",
    title: clear ? "Serpenta traffic: they are coming for Padua" : "Serpenta traffic, faint",
    body: clear
      ? `${by} has been tracking traffic under the Serpenta Sigil for days: couriers out of Montségur, money moving through Lyon and Turin, a block of rooms rented outside ${padua ? "Padua" : "our base"} and never slept in. ` +
        `Tonight it intercepted one line, sent to every cell at once: "When the birds fly, the nest is ours."\n\n` +
        `They are watching ${padua?.name ?? "the base"} and waiting for a team to fly out. When one does, they strike whoever is left behind. Anyone at the base is in danger.` +
        (abroad ? "" : " And if Padua is lost, we have nowhere outside Europe to go.")
      : `${by} caught the edge of something: a burst of traffic under the Serpenta Sigil, routed toward northern Italy, then silence. ` +
        `It could be nothing. Our analysts don't think it is nothing.` +
        (abroad ? "" : "\n\nWe have no base outside Europe."),
    regionId: padua?.regionId,
    pos: padua?.pos,
  });
}

/** Act 1 ends: the Serpenta Sigil destroys Base Padua and everything the Order has in Europe.
 *  Only those in the field live, and those in Europe must get out. */
export function theFall(s: GameState) {
  const st = s.story;
  if (st.act !== 1) return;
  const padua = s.installations.find((i) => i.id === "ob-padua") ?? s.installations.find((i) => i.kind === "base" && isEurope(i.regionId));
  const fallenBases = s.installations.filter((i) => i.kind === "base" && isEurope(i.regionId));
  const fallenIds = new Set(fallenBases.map((b) => b.id));
  const lost = s.installations.filter((i) => isEurope(i.regionId));
  const refuge = haven(s, padua);

  // Those in the field live, and find their way to the refuge. Nobody at the base gets out.
  const dead: string[] = [];
  for (const a of [...s.agents]) {
    if (!fallenIds.has(a.baseId)) continue;
    if (a.deployed) {
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
  for (const i of lost) razeInstallation(s, i);
  // Teams out of Padua: those in Europe, or flying back into it, are stranded and must get out.
  const stranded: string[] = [];
  for (const m of s.missions) {
    if (!fallenIds.has(m.baseId)) continue;
    m.baseId = refuge.id;
    if (!isEurope(m.regionId) && m.phase !== "returning") continue;
    m.stranded = true;
    stranded.push(m.city);
  }
  for (const reg of REGIONS) if (isEurope(reg.id)) changeSupport(s, reg.id, -FALL_SUPPORT_HIT);

  st.act = 2;
  st.fellAt = s.time;
  // Teams already flying home re-route now; the rest when their work is done.
  for (const m of s.missions) if (m.stranded && m.phase === "returning") startReturn(s, m);
  const stations = lost.filter((i) => i.kind === "sigint").length;
  post(s, {
    kind: "story",
    speaker: AGNES,
    title: `${padua?.name ?? "Base Padua"} has fallen`,
    body:
      `They came at dusk, more of them than we knew existed, under the Serpenta Sigil. ${padua?.name ?? "The base"} burned until morning.` +
      (stations ? ` Our ${stations === 1 ? "station" : `${stations} stations`} in Europe went dark the same night.` : "") +
      `\n\nThen Agnes sent a letter to the Holy Father. She holds proof of everything the Order has done, and will publish it the day the Vatican moves against her. The Holy See can do nothing: the stipend is cut to a trickle and Europe is closed to us.` +
      (stranded.length ? `\n\nOur team in ${stranded.join(" and ")} is all that got out. With Europe closed, they will have to find their own way to ${refuge.name}.` : "") +
      `\n\nWhat is left of the Order gathers at ${refuge.name}. Break three of the lesser bloodlines and her hold will weaken. Until then, whatever happens, the world must not learn of us: if the secret breaks, Agnes will make sure it breaks on the Church.`,
    regionId: refuge.regionId,
    pos: refuge.pos,
    refId: refuge.id,
    casualties: { dead, wounded: [] },
    effects: [
      burned.length ? `Lost: ${burned.join(", ")}` : null,
      `Support in Europe −${FALL_SUPPORT_HIT}`,
      `Stipend ${Math.round(stipendShare(s) * 100)}%`,
    ].filter(Boolean).join(" · "),
  });
  // A voice from inside the Vatican.
  post(s, {
    kind: "story",
    speaker: "cardinal",
    title: "The reserve channel",
    body:
      `This is still Ettore Valsecchi. I am speaking on the reserve channel, from a room in the Apostolic Palace that I am told is not listened to. I pray that is true.\n\n` +
      `The Holy See cannot support the Order as it did. Our accounts are watched, our friends are frightened, and there are men in the Curia now who take her calls. Officially, the Order no longer exists. ` +
      `But rest assured: the war continues. I will feed you what I can, the leads and the money and whatever I learn of what she is doing in Europe.\n\n` +
      `Break the lesser bloodlines. Every one that falls makes her weaker, and makes the cowards here braver. I will be listening.`,
    regionId: refuge.regionId,
    pos: refuge.pos,
  });
  st.nextDispatchAt = s.time + 10 * DAY;
}

// ---------------------------------------------------------------------------
// Act II: the cardinal's dispatches from Europe, on the reserve channel. Lore,
// in order, one every couple of weeks while the Vatican is held.
// ---------------------------------------------------------------------------

export const DISPATCH_DAYS: [number, number] = [12, 20];

export const DISPATCHES: { title: string; body: string }[] = [
  {
    title: "What is left of Padua",
    body:
      `The carabinieri report a gas explosion at a former seminary outside Padua. Eleven bodies, they say, unidentified. I have asked for the names and been told, politely, to stop asking.\n\n` +
      `I said a Mass for them this morning, alone, in a side chapel. I read every name. I wanted you to know that someone did.`,
  },
  {
    title: "Her people in the Curia",
    body:
      `Three cardinals dined last week at a villa outside Lyon owned by a holding company in Geneva. The company's directors do not exist. One of the three now chairs the commission that reviews my budget.\n\n` +
      `I do not know if they are hers or only afraid of her. In Rome the difference has never mattered much.`,
  },
  {
    title: "The night trains",
    body:
      `Something is moving on the night freight between Toulouse and Milan: refrigerated wagons, manifested as pharmaceuticals, that no pharmacy ever receives. A railwayman in Modane counted them for me and then stopped answering his phone.\n\n` +
      `She is feeding something, or someone, at a scale we have not seen. I have no team to send. I am telling you so that someone knows.`,
  },
  {
    title: "Sermons in Carcassonne",
    body:
      `A new preacher fills the cathedral in Carcassonne every evening. He speaks of the Perfect, of purity, of a Church that burns its saints. The young love him. The bishop has stopped coming to his own cathedral.\n\n` +
      `It is the old heresy, dressed for television. She is not hiding any more. She is recruiting.`,
  },
  {
    title: "A letter for the Holy Father",
    body:
      `Another letter came, on paper eight hundred years old, sealed with a serpent. The Holy Father read it in front of me and then burned it in his own hand. He would not tell me what it said.\n\n` +
      `Afterwards he asked me how the war was going. I told him the truth: that you are still fighting. He said, "Good," and nothing else. I think he meant it.`,
  },
  {
    title: "The Swiss Guard",
    body:
      `Two of the Swiss Guard were found at the foot of the Leonine Wall, drained. The Vatican has announced a training accident. The Guard knows better, and the Guard is angry.\n\n` +
      `Their commandant came to me last night and asked, very quietly, whether the Order is hiring. I told him to wait. When we return to Europe, we will need men who are angry.`,
  },
  {
    title: "Montségur",
    body:
      `A geologist from Toulouse sent me survey data from the mountain at Montségur: chambers under the castle, cut into the rock, older than the castle itself. The survey was never published. Its author has moved to Canada, suddenly, and does not want to talk about it.\n\n` +
      `That is where she began. I think it is where she sleeps. Keep breaking her allies and one day we will go and see.`,
  },
  {
    title: "Faith",
    body:
      `I have been asked by friends I trust to resign, for my health. I said my health is excellent. They said that it might not stay so.\n\n` +
      `I am an old man, and I have been afraid of the wrong things all my life. Not any more. Whatever happens to me, the channel stays open. There are others who know how to use it.`,
  },
];

function playDispatch(s: GameState) {
  const st = s.story;
  const d = DISPATCHES[st.dispatches];
  st.nextDispatchAt = s.time + rng(s).real(...DISPATCH_DAYS) * DAY;
  if (!d) return;
  st.dispatches++;
  post(s, { kind: "story", speaker: "cardinal", title: d.title, body: d.body });
}

/** Overland, a stranded team covers this much a day on the Church's old escape routes. */
export const OVERLAND_NM_PER_DAY = 600;
export const OVERLAND_EXTRA_DAYS = 4;

/**
 * A team stranded in Europe by the fall starts for the refuge. An aircraft
 * that can reach it flies them out; otherwise they leave it behind and go
 * overland, which takes days. Returns the hours it takes, or null for an
 * ordinary flight.
 */
export function exfiltrate(s: GameState, m: GameState["missions"][number], base: Installation | undefined): number | null {
  m.stranded = false;
  if (!base || isHired(m.aircraftId)) return null;
  const air = s.aircraft.find((a) => a.id === m.aircraftId);
  const distance = distanceNm(m.pos, base.pos);
  if (air && AIRCRAFT[air.kind].reachNm >= distance) {
    addLog(s, `${air.name} slips out of European airspace with the team from ${m.city}, bound for ${base.name}.`);
    return null;
  }
  m.overland = true;
  // A ratline of ours in the region takes them out by its own roads, much faster.
  const ratline = s.assets.find((a) => a.kind === "ratline" && a.regionId === m.regionId);
  const plain = OVERLAND_EXTRA_DAYS + Math.round(distance / OVERLAND_NM_PER_DAY);
  const days = ratline ? Math.max(2, Math.round(plain * RATLINE_SPEEDUP)) : plain;
  if (ratline) s.funds -= RATLINE_USE_FEE;
  post(s, {
    kind: "story",
    title: `Out of Europe: the team from ${m.city}`,
    body:
      `${air ? `${air.name} can't reach ${base.name} and every airfield is watched; the team leaves it where it stands. ` : ""}` +
      (ratline
        ? `${ratline.name}, our ${ratline.role} in ${ratline.city}, takes them out along the ratline. About ${days} days to ${base.name}.`
        : `They go the old way: priests' houses, convent cellars, fishing boats at night. It will take about ${days} days to reach ${base.name}, if nobody talks.`),
    regionId: m.regionId,
    pos: m.pos,
  });
  return days * 24;
}

/** Three sigils broken: Act 3. */
function theReturn(s: GameState) {
  const st = s.story;
  st.act = 3;
  st.returnedAt = s.time;
  for (const reg of REGIONS) if (isEurope(reg.id)) changeSupport(s, reg.id, RETURN_SUPPORT);
  post(s, {
    kind: "story",
    speaker: "cardinal",
    title: "Europe reopens",
    body:
      `This is Valsecchi, on an open line, for the first time in a long time. Three sigils are broken, and her allies have learned what it costs to stand beside her. Cardinals who would not take my calls now ask for meetings. The Holy See has found the nerve to send us money again, and Europe is open to us.` +
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
  post(s, { kind: "game-over", speaker: "cardinal", title: "Victory at Montségur", body: s.gameOver });
}

/** Secrecy broke while the Vatican was hostage. Called by changeSecrecy. */
export function exposeOrder(s: GameState) {
  s.story.exposed = true;
  post(s, {
    kind: "open-war",
    speaker: AGNES,
    title: "Agnes exposes the Order",
    body:
      `The Masquerade is broken, and Agnes was ready. Within the hour every newsroom in Europe has the Order's files: the burned houses, the disappeared, the Vatican's money. The Holy See disowns us before nightfall.` +
      `\n\nNo more stipend, no more protection. The bloodlines stop pretending. This is open war, and we fight it alone.`,
  });
}

// ---------------------------------------------------------------------------
// Act I: the nudges outward (docs/WEB_PORT.md 2b, step 3). A few scripted
// beats teach the shape of the war and push the player to look beyond Europe
// before Padua falls: the Church's people abroad come forward, a problem in
// North America can't be answered from Padua, and Agnes is out of reach.
// ---------------------------------------------------------------------------

/** Support the region loses if the Boston nest is left alone. */
export const BOSTON_SUPPORT_HIT = 0.8;
/** How long the Boston nest waits. */
export const BOSTON_DAYS = 6;

interface Beat {
  id: string;
  day: number;
  /** Plays only if this holds (checked from `day` on, until the fall). */
  when?: (s: GameState) => boolean;
  play: (s: GameState) => void;
}

const placeIn = (regionId: string, prefer: string) => {
  const region = regionById(regionId)!;
  const city = region.cities.find((c) => c.name === prefer) ?? region.cities[0] ?? { name: region.name, ...region.label };
  return { regionId, city: city.name, pos: { lat: city.lat, lon: city.lon } };
};

/** An operation of `bloodline` at a place, for a scripted lead or site to hang from. */
function scriptedOperation(s: GameState, bloodline: string, where: ReturnType<typeof placeIn>, days: number) {
  const op = {
    id: `op-${s.nextId++}`, bloodline, kind: "recruitment" as const, regionId: where.regionId, pos: { ...where.pos },
    city: where.city, startedAt: s.time, endsAt: s.time + days * DAY, leadId: null,
  };
  s.operations.push(op);
  return op;
}

const hasBaseAbroad = (s: GameState) => s.installations.some((i) => i.kind === "base" && !isEurope(i.regionId));

const BEATS: Beat[] = [
  {
    id: "briefing", day: 0,
    play(s) {
      post(s, {
        kind: "story",
        speaker: "cardinal",
        title: "OPV's Standing Orders",
        body:
          `I am Ettore Valsecchi, the Cardinal of OPV. We are the Vatican's clandestine Order, and we have been at war with the Serpenta Sigil for eight hundred years. The Sigil is a bloodline of vampires, and Agnes of Toulouse is its mistress.\n\n` +
          `We are closer than ever to finding her and destroying her brood once and for all. She is somewhere here in Europe. You will need to leverage every tool: SIGINT, HUMINT, and covert action.\n\n` +
          `We are granting you control of Base Padua and our European SIGINT station. We also have many allies all over the world willing to help us.\n\n` +
          `You have a chance to finish an 800-year war. May the Lord guide you.`,
      });
    },
  },
  {
    id: "sao-paulo", day: 6,
    play(s) {
      const where = placeIn("brazil", "Sao Paulo");
      const op = scriptedOperation(s, "huaca", where, 8);
      surfaceLead(s, op, "volunteer");
    },
  },
  {
    id: "boston-volunteer", day: 11,
    play(s) {
      const where = placeIn("us_northeast", "Boston");
      const op = scriptedOperation(s, "ashgrove", where, 8);
      surfaceLead(s, op, "volunteer");
    },
  },
  {
    // A nest only an armed team can burn, an ocean away from Padua.
    id: "boston-nest", day: 17,
    play(s) {
      const where = placeIn("us_northeast", "Boston");
      scriptedOperation(s, "ashgrove", where, BOSTON_DAYS + 1);
      const site: Site = {
        id: `site-${s.nextId++}`, bloodline: "ashgrove", kind: "den", regionId: where.regionId, city: where.city,
        pos: { lat: where.pos.lat + 0.05, lon: where.pos.lon - 0.05 }, revealedAt: s.time, expiresAt: s.time + BOSTON_DAYS * DAY,
        thralls: SITE_KINDS.den.thralls, vampires: SITE_KINDS.den.vampires, missionId: null, story: "boston",
      };
      s.sites.push(site);
      const reach = s.installations.some((b) => b.kind === "base" && !isEurope(b.regionId) && distanceNm(b.pos, site.pos) < 2600);
      post(s, {
        kind: "site",
        speaker: "cardinal",
        title: `A den of House Ashgrove, ${where.city}`,
        body:
          `The archdiocese of Boston has found it for us: a house in Dorchester where three parishioners went in and came out wrong. Four thralls at least, and two of Ashgrove's own. They will move within the week.\n\n` +
          (reach
            ? "We have a base close enough to send an armed team."
            : "This needs an armed team, and we have none on that side of the ocean. A chartered jet takes two agents, armed with nothing heavier than what fits under a coat; an airline seat takes one, unarmed. If nobody goes, Boston will pay for it."),
        regionId: where.regionId,
        pos: site.pos,
        refId: site.id,
      });
    },
  },
  {
    id: "agnes", day: 24,
    play(s) {
      post(s, {
        kind: "story",
        speaker: "cardinal",
        title: "The name Agnes",
        body:
          `Every thread we have pulled in Europe ends in the same place. The money, the couriers, the cardinals who stopped returning our calls: all of it runs back to Agnes of Toulouse and the Serpenta Sigil.\n\n` +
          `And there it stops. We don't know where she sleeps. We don't know how many serve her. We know she has been doing this for eight hundred years, and that she knows our names. For now she is out of our reach. Pray that we are out of hers.`,
      });
    },
  },
  {
    id: "where-would-we-go", day: 34,
    when: (s) => !hasBaseAbroad(s),
    play(s) {
      post(s, {
        kind: "story",
        speaker: "cardinal",
        title: "Where would we go?",
        body:
          `A question, and I want you to sit with it: if something happened to Padua, where would the Order go? Everything we have is in Europe, and Europe is hers.\n\n` +
          `An Operational Base outside Europe (Build new base) would keep the Order alive if the worst came. So would people of our own abroad, or at least a station listening there.`,
      });
    },
  },
];

/** The first beat, posted as the campaign opens (the clock starts paused). */
export function openingBriefing(s: GameState) {
  const b = BEATS[0]!;
  s.story.beats.push(b.id);
  b.play(s);
}

function playBeats(s: GameState) {
  const day = Math.floor((s.time - s.startTime) / DAY);
  for (const b of BEATS) {
    if (s.story.beats.includes(b.id) || day < b.day) continue;
    if (b.when && !b.when(s)) continue;
    s.story.beats.push(b.id);
    b.play(s);
    return; // one at a time
  }
}

/** A scripted site lapsed with nobody sent: the lesson lands. Called when a site is abandoned. */
export function storySiteLapsed(s: GameState, site: Site) {
  if (site.story !== "boston") return;
  changeSupport(s, site.regionId, -BOSTON_SUPPORT_HIT);
  post(s, {
    kind: "story",
    speaker: "cardinal",
    title: `Nobody came to ${site.city}`,
    body:
      `The house in ${site.city} is empty now. Two more parishioners are missing, and the archdiocese has stopped calling. They asked the Church for help and the Church had nothing to send.\n\n` +
      `Our reach ends where our aircraft's does. A base in North America, or anywhere outside Europe, would have changed that.`,
    regionId: site.regionId,
    pos: site.pos,
    effects: `Support in ${regionById(site.regionId)?.name} −${BOSTON_SUPPORT_HIT}`,
  });
}

/** Hourly: the story's clock. */
export function hourlyStory(s: GameState) {
  const st = s.story;
  if (st.act === 1) {
    if (s.time % DAY === 0 || !st.beats.length) playBeats(s);
    if (!st.fallWarned && s.time % DAY === 0 && s.time >= st.fallAt - FALL_LISTEN_DAYS * DAY) listenForFall(s);
    if (s.time >= st.fallAt) {
      // They wait for a team to leave Padua, and strike the moment it's in the air.
      const away = s.missions.some((m) => m.phase === "outbound" && m.departAt <= s.time && isEurope(s.installations.find((i) => i.id === m.baseId)?.regionId ?? ""));
      if (away || s.time >= st.fallAt + FALL_DEADLINE_DAYS * DAY) theFall(s);
    }
  } else if (st.act === 2 && lesserBroken(s) >= SIGILS_TO_RETURN) theReturn(s);
  else if (st.act === 2 && !st.exposed && st.nextDispatchAt !== null && s.time >= st.nextDispatchAt) playDispatch(s);
  if (!st.won && !s.gameOver && isDestroyed(s, AGNES)) victory(s);
}
