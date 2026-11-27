// Vampire operations and the leads they throw off.
//
// Every bloodline keeps running small operations, each from one of the sites of
// its network (sim/intel/networks.ts), so only in its own homelands. Each one that
// finishes undisturbed costs support in its region. The intelligence section
// finds them (sim/intel/intel.ts: stations and assets are its collection), and
// volunteers come forward on their own; a real lead left to expire costs
// extra support (we knew, and did nothing).

import { changeFeeding, FEEDING } from "../campaign/feeding";
import { noteActivity } from "./activity";
import { difficulty } from "../../data/difficulty";
import { bloodlineById } from "../../data/bloodlines";
import { regionById } from "../../data/regions";
import { aliveBloodlines, boldness, isDormant } from "../campaign/bloodlines";
import { nearRegion, runner } from "./networks";
import { maybeNoise, openCase, priorOf } from "./intel";
import { leadEngaged } from "../missions/missions";
import {
  ASSET_KINDS,
  DOUBLE_SHARE,
  sourceProfile,
  volunteerChance,
  withArticle,
  CLERGY,
  type AssetKind,
} from "./humint";

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
import { changeSupport, creditRegion, PLEDGE } from "../economy/economy";
import { rng } from "../core/rng";
import {
  addLog,
  post,
  type GameState,
  type Lead,
  type LeadKind,
  type Operation,
  type OperationKind,
  LeadVia,
} from "../core/state";
import { DAY, HOUR, type LatLon } from "../core/time";

const OP_KINDS: { kind: OperationKind; weight: number; damage: number }[] = [
  { kind: "feeding", weight: 0.5, damage: 0.06 },
  { kind: "recruitment", weight: 0.3, damage: 0.05 },
  { kind: "infiltration", weight: 0.2, damage: 0.08 },
];

/** What kind of lead each operation tends to produce. */
const LEADS_BY_OP: Record<OperationKind, [LeadKind, number][]> = {
  feeding: [
    ["rescue", 0.3],
    ["recovery", 0.3],
    ["capture", 0.2],
    ["source", 0.2],
  ],
  recruitment: [
    ["source", 0.4],
    ["capture", 0.3],
    ["surveillance", 0.3],
  ],
  infiltration: [
    ["surveillance", 0.45],
    ["source", 0.3],
    ["capture", 0.25],
  ],
};

export const LEAD_KIND_NAMES: Record<LeadKind, string> = {
  capture: "Capture & interrogate",
  source: "Source",
  double: "Source",
  surveillance: "Surveillance",
  recovery: "Recovery",
  rescue: "Rescue",
};

/** A lead's story. A source story either names a fixed person (`who`: role, asset and sex,
 *  so the recruited asset matches the story) or uses {role}, filled from a random profile. */
interface LeadTemplate {
  title: string;
  text: string;
  who?: { role: string; asset: AssetKind; female?: boolean };
}

const TEMPLATES: Record<Exclude<LeadKind, "double">, LeadTemplate[]> = {
  capture: [
    {
      title: "Night orderly, {city}",
      text: "Phone intercepts tie a night-shift orderly at a {city} hospital to blood bags that never reach the wards. He knows who collects them. He'll talk, given the right room.",
    },
    {
      title: "The courier, {city}",
      text: "A courier firm in {city} makes 3 a.m. deliveries to an address where nobody lives. By every sign we can read, the driver is a familiar. Take him.",
    },
    {
      title: "Club promoter, {city}",
      text: "A promoter in {city} keeps posting guest lists for parties no venue has on its books. Guests who go don't come back to work. Bring him in.",
    },
  ],
  source: [
    {
      title: "Came back wrong, {city}",
      text: 'A parish priest in {city} passes on a message: {a role} says their brother "came back wrong" from a private party, and wants to talk to someone who will believe them.',
    },
    {
      title: "A detective, off the record, {city}",
      text: "A police detective in {city} has a stack of missing-persons files his superiors keep closing. He asked his confessor whether anyone in the Church takes such things seriously.",
      who: { role: "police detective", asset: "informant", female: false },
    },
    {
      title: "A nurse with questions, {city}",
      text: "A nurse in {city} has noticed transfusions billed to patients who never needed them. She has copies. She'll meet once, somewhere public.",
      who: { role: "night-shift nurse", asset: "informant", female: true },
    },
    {
      title: "A call at 2 a.m., {city}",
      text: "{A role} in {city} rang a Catholic radio phone-in at two in the morning, asked whether the dead can walk, and hung up before going on air. We traced the number.",
    },
  ],
  surveillance: [
    {
      title: "Blackout glass, {city}",
      text: "Bank records show a {city} property firm ordering blackout glass by the container. Somebody should watch who comes and goes after dark.",
    },
    {
      title: "A clinic that never closes, {city}",
      text: "A private clinic in {city} admits patients after dark and discharges no one. Watch it for a few nights before anyone goes in.",
    },
    {
      title: "The gallery, {city}",
      text: "An art gallery in {city} with no sales and enormous wire transfers. Its owner has never been photographed in daylight.",
    },
  ],
  recovery: [
    {
      title: "A body in the morgue, {city}",
      text: "Police in {city} have a body drained through the femoral artery. The autopsy is scheduled for the morning. We need the samples, and the file, first.",
    },
    {
      title: "Traffic camera, {city}",
      text: "A traffic camera in {city} caught something it shouldn't have. The footage sits on a municipal server until a clerk deletes it, or a journalist finds it.",
    },
    {
      title: "The evidence locker, {city}",
      text: "Clothing from an attack in {city} sits in a police evidence locker, soaked in blood that won't test as human. It cannot reach a lab.",
    },
  ],
  rescue: [
    {
      title: "Missing three days, {city}",
      text: "A missing-person case in {city} fits a feeding pattern: three days gone, phone pinging from the same block every night. She may still be alive.",
    },
    {
      title: "The guest of honour, {city}",
      text: 'A teenager in {city} vanished after a casting call. Intercepts mention "the guest of honour". There is maybe a day left.',
    },
    {
      title: "The basement, {city}",
      text: "Neighbours in {city} report screaming from a basement that, according to the deeds, doesn't exist.",
    },
  ],
};

function launchOperation(s: GameState, bloodlineId: string) {
  const r = rng(s);
  // Run by the people of one of its sites (sim/intel/networks.ts): near it, sometimes further afield, but only in the homelands.
  const site = runner(s, bloodlineId, r);
  if (!site) return;
  const b = bloodlineById(bloodlineId)!;
  const regionId = nearRegion(r, b, site.regionId);
  const region = regionById(regionId)!;
  const city =
    regionId === site.regionId
      ? { name: site.city, lat: site.pos.lat, lon: site.pos.lon }
      : region.cities.length
        ? r.pick(region.cities.slice(0, 6))
        : { name: region.name, ...region.label };
  const op: Operation = {
    id: `op-${s.nextId++}`,
    bloodline: bloodlineId,
    siteId: site.id,
    kind: r.weighted(OP_KINDS.map((k) => [k.kind, k.weight] as const)),
    regionId,
    city: city.name,
    pos: { lat: city.lat + r.real(-0.2, 0.2), lon: city.lon + r.real(-0.2, 0.2) },
    startedAt: s.time,
    endsAt: s.time + r.real(4, 9) * DAY,
    leadId: null,
  };
  s.operations.push(op);
}

/** A volunteer, in their own words: who they are and why they came to us.
 *  `laity`: only for someone who would go to a parish priest (not a priest, a prioress or the bishop's own office). */
const VOLUNTEER_TEMPLATES: (LeadTemplate & { laity?: boolean })[] = [
  {
    title: "{A role} comes forward, {city}",
    text: "{A role} in {city} went to their parish priest, who went to the bishop, who called us. They have seen something they can't explain, and want to talk to someone who will believe them.",
    laity: true,
  },
  {
    title: "A letter to the nunciature, {city}",
    text: "A handwritten letter from {a role} in {city}: names, dates, and a request to meet. The nuncio's secretary thinks it is genuine. He is not always right.",
  },
  {
    title: "A confession, {city}",
    text: "{A role} in {city} told a priest more than a confession should hold, and asked him to pass it on. They will meet one of us, once.",
  },
];

/** Where a lead is, and what is behind it: an operation, or nothing (noise). */
export interface LeadSource {
  op: Operation | null;
  regionId: string;
  city: string;
  pos: LatLon;
}

/** A lead's story and who it is about, from a source and the channel it came by (not yet posted). */
export function composeLead(
  s: GameState,
  src: LeadSource,
  via: LeadVia,
  caseId: string,
  kind?: Exclude<LeadKind, "double">,
): Lead {
  const r = rng(s);
  const opKind = src.op?.kind ?? r.pick(OP_KINDS.map((k) => k.kind));
  // A volunteer is always a person who wants to meet; the analysts and informants hear all kinds of things.
  let k: LeadKind = kind ?? (via === "volunteer" ? "source" : r.weighted(LEADS_BY_OP[opKind]));
  // Only real activity sets traps: a double needs someone behind it.
  if (k === "source" && src.op && r.chance(DOUBLE_SHARE[via])) k = "double";
  const isSource = k === "source" || k === "double";
  let profile: { asset: AssetKind; role: string; female?: boolean } | null = null;
  let template: LeadTemplate;
  if (via === "volunteer" && k === "source") {
    profile = sourceProfile(r);
    const role = profile.role;
    template = r.pick(VOLUNTEER_TEMPLATES.filter((t) => !t.laity || !CLERGY.test(role)));
  } else {
    template = r.pick(TEMPLATES[k === "double" ? "source" : k]);
    if (isSource) profile = template.who ?? sourceProfile(r);
  }
  const role = profile?.role ?? "local";
  const fill = (t: string) =>
    t
      .replaceAll("{city}", src.city)
      .replaceAll("{A role}", capitalize(withArticle(role)))
      .replaceAll("{a role}", withArticle(role))
      .replaceAll("{role}", role);
  return {
    id: `lead-${s.nextId++}`,
    opId: src.op?.id ?? "",
    caseId,
    kind: k,
    regionId: src.regionId,
    pos: src.pos,
    city: src.city,
    appearedAt: s.time,
    expiresAt: s.time + r.real(2, 5) * DAY,
    intel: Math.round(r.real(0.3, 0.9) * 100) / 100,
    title: fill(template.title),
    text:
      fill(template.text) +
      (profile
        ? `\n\nThe source is ${withArticle(profile.role)}. Recruited, they would be an agent: ${ASSET_KINDS[profile.asset].name.toLowerCase()} (${ASSET_KINDS[profile.asset].gives}).`
        : ""),
    missionId: null,
    via,
    ...(profile
      ? {
          who: profile.role,
          asset: profile.asset,
          ...(profile.female !== undefined ? { whoFemale: profile.female } : {}),
        }
      : {}),
  };
}

/** Puts a lead on the map and on the cardinal's desk. */
export function announceLead(s: GameState, lead: Lead) {
  const op = s.operations.find((o) => o.id === lead.opId);
  if (op) {
    op.leadId = lead.id;
    op.endsAt = Math.max(op.endsAt, lead.expiresAt);
  }
  s.leads.push(lead);
  noteActivity(s, lead.regionId);
  const via = lead.via;
  const heading =
    via === "volunteer"
      ? "A volunteer"
      : via === "humint"
        ? "From an informant"
        : via === "osint"
          ? "Open sources"
          : undefined;
  // Every lead comes across the cardinal's desk: a line of his, then the intelligence.
  const lines = OPENERS[s.story.act === 2 ? "hostage" : "open"][via];
  const opener = lines[s.nextId % lines.length]!;
  post(s, {
    kind: "lead",
    speaker: "cardinal",
    scene: via === "sigint" || via === "osint" ? "sigint" : "humint",
    ...(heading ? { heading } : {}),
    title: `New lead: ${lead.title}`,
    body: `${opener}\n\n${lead.text}`,
    regionId: lead.regionId,
    pos: lead.pos,
    refId: lead.id,
  });
}

/** A lead from real activity, as a new case whose prior is the channel's share of real leads (sim/intel/intel.ts).
 *  With `noise`, channels that can't tell real from noise also send noise, in proportion, so the prior stays honest. */
export function surfaceLead(s: GameState, op: Operation, via: LeadVia, noise = false): Lead {
  const c = openCase(s, true, priorOf(s, via, op.bloodline));
  const lead = composeLead(s, { op, regionId: op.regionId, city: op.city, pos: op.pos }, via, c.id);
  announceLead(s, lead);
  if (noise) maybeNoise(s, via, op.regionId, op.bloodline);
  return lead;
}

function finishOperation(s: GameState, op: Operation, ignored: boolean) {
  const def = OP_KINDS.find((k) => k.kind === op.kind)!;
  const b = bloodlineById(op.bloodline)!;
  if (op.kind === "feeding") changeFeeding(s, op.bloodline, FEEDING.fed);
  const hit = def.damage * b.pr * difficulty(s.difficulty).vampirePressure * (ignored ? 2.5 : 1);
  changeSupport(s, op.regionId, -hit);
  if (ignored) {
    creditRegion(s, op.regionId, PLEDGE.ignored);
    addLog(
      s,
      `We knew about ${op.city}, and did nothing. Support in ${regionById(op.regionId)?.name} falls.`,
      "bad",
    );
  }
}

/** Hourly: launch operations, expire leads, finish operations. */
export function hourlyOperations(s: GameState) {
  const r = rng(s);
  for (const b of aliveBloodlines(s)) {
    const due = s.nextOperation[b.id] ?? 0;
    if (s.time < due || isDormant(s, b.id)) continue;
    if (due > 0) launchOperation(s, b.id);
    // Busier as the war goes on, and bolder for every bloodline that has fallen.
    s.nextOperation[b.id] =
      s.time +
      (r.real(0.7, 1.5) / ((1 + 0.08 * s.monthIndex) * boldness(s))) * DAY +
      r.int(0, 23) * HOUR;
  }

  // Leads go cold, unless a team is working them right now.
  const expired = new Set<string>();
  for (const l of s.leads) if (l.expiresAt <= s.time && !leadEngaged(s, l)) expired.add(l.id);
  if (expired.size) s.leads = s.leads.filter((l) => !expired.has(l.id));

  const engaged = new Set(s.leads.filter((l) => leadEngaged(s, l)).map((l) => l.opId));
  const done = s.operations.filter((o) => o.endsAt <= s.time && !engaged.has(o.id));
  if (done.length) {
    const ids = new Set(done.map((o) => o.id));
    s.operations = s.operations.filter((o) => !ids.has(o.id));
    // A lead that existed and is gone without anyone acting on it was ignored.
    for (const op of done)
      finishOperation(
        s,
        op,
        op.leadId !== null && !op.handled && !s.leads.some((l) => l.id === op.leadId),
      );
  }
}

/** The cardinal's word before a lead: by channel, and whether he can still speak openly (Act II: the reserve channel). */
export const OPENERS: Record<"open" | "hostage", Record<LeadVia, string[]>> = {
  open: {
    sigint: [
      "Our listeners have something. Read it and decide.",
      "This came off the intercepts overnight. It's yours.",
      "The analysts flagged this one for you before breakfast.",
      "Something in the traffic. I don't like the look of it.",
    ],
    humint: [
      "One of our people heard this, and took a risk to tell us.",
      "From our source. Treat it kindly; they won't get many chances.",
      "Our informant has been busy. Here is what they brought.",
    ],
    osint: [
      "The analysts found this in the open: the papers, the registries, the forums.",
      "Nothing secret about this one. Somebody just had to read it all.",
      "Open sources. Thin, maybe. Read it and decide.",
    ],
    volunteer: [
      "Someone came forward. They were frightened, and they came anyway.",
      "A parish priest passed this up the chain. He asked for nothing.",
      "Not everyone out there is theirs. Someone wants to help.",
    ],
  },
  hostage: {
    sigint: [
      "Reserve channel. Our stations caught this. Act on it if you can.",
      "Valsecchi, reserve channel. The intercept is below. Be careful.",
      "I am told this is good. I am also told I should not be sending it.",
      "From our listeners, by way of a room nobody is supposed to know about.",
    ],
    humint: [
      "Reserve channel. Our source is still talking to us, God bless them.",
      "Valsecchi. One of our people sent this. They are braver than I am.",
      "From our informant, passed hand to hand to reach you.",
    ],
    osint: [
      "Reserve channel. Our analysts read the papers so you don't have to.",
      "Valsecchi. From the open sources. Worth a look, perhaps no more.",
    ],
    volunteer: [
      "Reserve channel. Someone still trusts the Church. Don't make them regret it.",
      "A volunteer, who found us even now. I don't know how.",
      "Valsecchi. A frightened soul came forward. I gave them your channel.",
    ],
  },
};

/** Daily: someone who has seen an operation may come forward on their own, anywhere. Everything
 *  else is found by the intelligence section (sim/intel/intel.ts). Walk-ins can't tell the real thing
 *  from their fears, so some volunteers bring nothing (noise, in the honest proportion). */
export function dailyOperations(s: GameState) {
  const r = rng(s);
  for (const op of [...s.operations]) {
    if (op.leadId) continue;
    if (r.chance(volunteerChance(s, op.regionId))) surfaceLead(s, op, "volunteer", true);
  }
}
