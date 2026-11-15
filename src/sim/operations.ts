// Vampire operations and the SIGINT leads they throw off.
//
// Every bloodline keeps running small operations in its home regions (and
// occasionally elsewhere). Each one that finishes undisturbed costs support
// in its region. SIGINT stations hear operations in their own region well and
// in neighbouring regions faintly (stations add up), and what they hear
// surfaces as leads; a lead left to expire costs extra support (we knew, and
// did nothing).
import { BLOODLINES } from "../data/bloodlines";
import { difficulty } from "../data/difficulty";
import { REGIONS, regionById } from "../data/regions";
import { aliveBloodlines, boldness, isDormant } from "./bloodlines";
import { detectionChance, sigintRates } from "./commands";
import { leadEngaged } from "./missions";
import { ASSET_KINDS, DOUBLE_SHARE, humintRates, sourceProfile, volunteerChance, withArticle, CLERGY, type AssetKind, type LeadVia } from "./humint";

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
import { changeSupport, creditRegion, PLEDGE } from "./economy";
import { rng, type Rng } from "./rng";
import { addLog, post, type GameState, type Lead, type LeadKind, type Operation, type OperationKind } from "./state";
import { DAY, HOUR } from "./time";

const OP_KINDS: { kind: OperationKind; weight: number; damage: number }[] = [
  { kind: "feeding", weight: 0.5, damage: 0.06 },
  { kind: "recruitment", weight: 0.3, damage: 0.05 },
  { kind: "infiltration", weight: 0.2, damage: 0.08 },
];

/** What kind of lead each operation tends to produce. */
const LEADS_BY_OP: Record<OperationKind, [LeadKind, number][]> = {
  feeding: [["rescue", 0.3], ["recovery", 0.3], ["capture", 0.2], ["source", 0.2]],
  recruitment: [["source", 0.4], ["capture", 0.3], ["surveillance", 0.3]],
  infiltration: [["surveillance", 0.45], ["source", 0.3], ["capture", 0.25]],
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
    { title: "Night orderly, {city}", text: "Phone intercepts tie a night-shift orderly at a {city} hospital to blood bags that never reach the wards. He knows who collects them. He'll talk, given the right room." },
    { title: "The courier, {city}", text: "A courier firm in {city} makes 3 a.m. deliveries to an address where nobody lives. By every sign we can read, the driver is a familiar. Take him." },
    { title: "Club promoter, {city}", text: "A promoter in {city} keeps posting guest lists for parties no venue has on its books. Guests who go don't come back to work. Bring him in." },
  ],
  source: [
    { title: "Came back wrong, {city}", text: "A parish priest in {city} passes on a message: {a role} says their brother \"came back wrong\" from a private party, and wants to talk to someone who will believe them." },
    { title: "A detective, off the record, {city}", text: "A police detective in {city} has a stack of missing-persons files his superiors keep closing. He asked his confessor whether anyone in the Church takes such things seriously.", who: { role: "police detective", asset: "informant", female: false } },
    { title: "A nurse with questions, {city}", text: "A nurse in {city} has noticed transfusions billed to patients who never needed them. She has copies. She'll meet once, somewhere public.", who: { role: "night-shift nurse", asset: "informant", female: true } },
    { title: "A call at 2 a.m., {city}", text: "{A role} in {city} rang a Catholic radio phone-in at two in the morning, asked whether the dead can walk, and hung up before going on air. We traced the number." },
  ],
  surveillance: [
    { title: "Blackout glass, {city}", text: "Bank records show a {city} property firm ordering blackout glass by the container. Somebody should watch who comes and goes after dark." },
    { title: "A clinic that never closes, {city}", text: "A private clinic in {city} admits patients after dark and discharges no one. Watch it for a few nights before anyone goes in." },
    { title: "The gallery, {city}", text: "An art gallery in {city} with no sales and enormous wire transfers. Its owner has never been photographed in daylight." },
  ],
  recovery: [
    { title: "A body in the morgue, {city}", text: "Police in {city} have a body drained through the femoral artery. The autopsy is scheduled for the morning. We need the samples, and the file, first." },
    { title: "Traffic camera, {city}", text: "A traffic camera in {city} caught something it shouldn't have. The footage sits on a municipal server until a clerk deletes it, or a journalist finds it." },
    { title: "The evidence locker, {city}", text: "Clothing from an attack in {city} sits in a police evidence locker, soaked in blood that won't test as human. It cannot reach a lab." },
  ],
  rescue: [
    { title: "Missing three days, {city}", text: "A missing-person case in {city} fits a feeding pattern: three days gone, phone pinging from the same block every night. She may still be alive." },
    { title: "The guest of honour, {city}", text: "A teenager in {city} vanished after a casting call. Intercepts mention \"the guest of honour\". There is maybe a day left." },
    { title: "The basement, {city}", text: "Neighbours in {city} report screaming from a basement that, according to the deeds, doesn't exist." },
  ],
};

function pickWeighted<T>(r: Rng, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r.next() * total;
  for (const [item, w] of items) if ((x -= w) <= 0) return item;
  return items[items.length - 1]![0];
}

function launchOperation(s: GameState, bloodlineId: string) {
  const r = rng(s);
  const b = BLOODLINES.find((x) => x.id === bloodlineId)!;
  const regionId = r.chance(0.85) ? r.pick(b.homeRegions) : r.pick(REGIONS).id;
  const region = regionById(regionId)!;
  const city = region.cities.length ? r.pick(region.cities.slice(0, 6)) : { name: region.name, ...region.label };
  const op: Operation = {
    id: `op-${s.nextId++}`,
    bloodline: b.id,
    kind: pickWeighted(r, OP_KINDS.map((k) => [k.kind, k.weight])),
    regionId,
    city: city.name,
    pos: { lat: city.lat + r.real(-0.25, 0.25), lon: city.lon + r.real(-0.25, 0.25) },
    startedAt: s.time,
    endsAt: s.time + r.real(4, 9) * DAY,
    leadId: null,
  };
  s.operations.push(op);
}

/** A volunteer, in their own words: who they are and why they came to us.
 *  `laity`: only for someone who would go to a parish priest (not a priest, a prioress or the bishop's own office). */
const VOLUNTEER_TEMPLATES: (LeadTemplate & { laity?: boolean })[] = [
  { title: "{A role} comes forward, {city}", text: "{A role} in {city} went to their parish priest, who went to the bishop, who called us. They have seen something they can't explain, and want to talk to someone who will believe them.", laity: true },
  { title: "A letter to the nunciature, {city}", text: "A handwritten letter from {a role} in {city}: names, dates, and a request to meet. The nuncio's secretary thinks it is genuine. He is not always right." },
  { title: "A confession, {city}", text: "{A role} in {city} told a priest more than a confession should hold, and asked him to pass it on. They will meet one of us, once." },
];

export function surfaceLead(s: GameState, op: Operation, via: LeadVia) {
  const r = rng(s);
  // A volunteer is always a person who wants to meet; SIGINT and informants hear all kinds of things.
  let kind = via === "volunteer" ? "source" : pickWeighted(r, LEADS_BY_OP[op.kind]);
  if (kind === "source" && r.chance(DOUBLE_SHARE[via])) kind = "double";
  const isSource = kind === "source" || kind === "double";
  let profile: { asset: AssetKind; role: string; female?: boolean } | null = null;
  let template: LeadTemplate;
  if (via === "volunteer") {
    profile = sourceProfile(r);
    const role = profile.role;
    template = r.pick(VOLUNTEER_TEMPLATES.filter((t) => !t.laity || !CLERGY.test(role)));
  } else {
    template = r.pick(TEMPLATES[kind === "double" ? "source" : kind]);
    if (isSource) profile = template.who ?? sourceProfile(r);
  }
  const role = profile?.role ?? "local";
  const fill = (t: string) =>
    t.replaceAll("{city}", op.city).replaceAll("{A role}", capitalize(withArticle(role))).replaceAll("{a role}", withArticle(role)).replaceAll("{role}", role);
  const lead: Lead = {
    id: `lead-${s.nextId++}`,
    opId: op.id,
    kind,
    regionId: op.regionId,
    pos: op.pos,
    city: op.city,
    appearedAt: s.time,
    expiresAt: s.time + r.real(2, 5) * DAY,
    intel: Math.round(r.real(0.3, 0.9) * 100) / 100,
    title: fill(template.title),
    text: fill(template.text) + (profile ? `\n\nThe source is ${withArticle(profile.role)}. Recruited, they would be an asset: ${ASSET_KINDS[profile.asset].name.toLowerCase()} (${ASSET_KINDS[profile.asset].gives}).` : ""),
    missionId: null,
    via,
    ...(profile ? { who: profile.role, asset: profile.asset, ...(profile.female !== undefined ? { whoFemale: profile.female } : {}) } : {}),
  };
  op.leadId = lead.id;
  op.endsAt = Math.max(op.endsAt, lead.expiresAt);
  s.leads.push(lead);
  const heading = via === "volunteer" ? "A volunteer" : via === "informant" ? "From an informant" : undefined;
  // Every lead comes across the cardinal's desk: a line of his, then the intelligence.
  const lines = OPENERS[s.story.act === 2 ? "hostage" : "open"][via];
  const opener = lines[s.nextId % lines.length]!;
  post(s, {
    kind: "lead", speaker: "cardinal", scene: via === "sigint" ? "sigint" : "humint", ...(heading ? { heading } : {}), title: `New lead: ${lead.title}`,
    body: `${opener}\n\n${lead.text}`, regionId: lead.regionId, pos: lead.pos, refId: lead.id,
  });
}

function finishOperation(s: GameState, op: Operation, ignored: boolean) {
  const def = OP_KINDS.find((k) => k.kind === op.kind)!;
  const b = BLOODLINES.find((x) => x.id === op.bloodline)!;
  const hit = def.damage * b.pr * difficulty(s.difficulty).vampirePressure * (ignored ? 2.5 : 1);
  changeSupport(s, op.regionId, -hit);
  if (ignored) {
    creditRegion(s, op.regionId, PLEDGE.ignored);
    addLog(s, `We knew about ${op.city}, and did nothing. Support in ${regionById(op.regionId)?.name} falls.`, "bad");
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
    s.nextOperation[b.id] = s.time + (r.real(0.7, 1.5) / ((1 + 0.08 * s.monthIndex) * boldness(s))) * DAY + r.int(0, 23) * HOUR;
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
      finishOperation(s, op, op.leadId !== null && !op.handled && !s.leads.some((l) => l.id === op.leadId));
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
    informant: [
      "One of our people heard this, and took a risk to tell us.",
      "From our source. Treat it kindly; they won't get many chances.",
      "Our informant has been busy. Here is what they brought.",
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
    informant: [
      "Reserve channel. Our source is still talking to us, God bless them.",
      "Valsecchi. One of our people sent this. They are braver than I am.",
      "From our informant, passed hand to hand to reach you.",
    ],
    volunteer: [
      "Reserve channel. Someone still trusts the Church. Don't make them regret it.",
      "A volunteer, who found us even now. I don't know how.",
      "Valsecchi. A frightened soul came forward. I gave them your channel.",
    ],
  },
};

/** Daily: operations we can hear may surface as leads. SIGINT and informants share one
 *  detection rate per region (so they saturate rather than stack); volunteers come
 *  forward on their own, anywhere. */
export function dailyOperations(s: GameState) {
  const r = rng(s);
  const sig = sigintRates(s);
  const hum = humintRates(s);
  for (const op of s.operations) {
    if (op.leadId) continue;
    const a = sig.get(op.regionId) ?? 0;
    const b = hum.get(op.regionId) ?? 0;
    if (a + b > 0 && r.chance(detectionChance(a + b))) surfaceLead(s, op, r.chance(a / (a + b)) ? "sigint" : "informant");
    else if (r.chance(volunteerChance(s, op.regionId))) surfaceLead(s, op, "volunteer");
  }
}
