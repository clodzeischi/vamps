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
import { changeSupport } from "./economy";
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

/** Share of apparent sources that are really a double agent setting up an ambush. */
export const DOUBLE_AGENT_SHARE = 0.3;

export const LEAD_KIND_NAMES: Record<LeadKind, string> = {
  capture: "Capture & interrogate",
  source: "Volunteer source",
  double: "Volunteer source",
  surveillance: "Surveillance",
  recovery: "Recovery",
  rescue: "Rescue",
};

const TEMPLATES: Record<Exclude<LeadKind, "double">, { title: string; text: string }[]> = {
  capture: [
    { title: "Night orderly, {city}", text: "Phone intercepts tie a night-shift orderly at a {city} hospital to blood bags that never reach the wards. He knows who collects them. He'll talk, given the right room." },
    { title: "The courier, {city}", text: "A courier firm in {city} makes 3 a.m. deliveries to an address where nobody lives. By every sign we can read, the driver is a familiar. Take him." },
    { title: "Club promoter, {city}", text: "A promoter in {city} keeps posting guest lists for parties no venue has on its books. Guests who go don't come back to work. Bring him in." },
  ],
  source: [
    { title: "A frightened sister, {city}", text: "A parish priest in {city} passes on a message: a woman says her brother \"came back wrong\" from a private party, and she wants to talk to someone who will believe her." },
    { title: "A detective, off the record, {city}", text: "A police detective in {city} has a stack of missing-persons files his superiors keep closing. He asked his confessor whether anyone in the Church takes such things seriously." },
    { title: "A nurse with questions, {city}", text: "A nurse in {city} has noticed transfusions billed to patients who never needed them. She has copies. She'll meet once, somewhere public." },
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

function surfaceLead(s: GameState, op: Operation) {
  const r = rng(s);
  let kind = pickWeighted(r, LEADS_BY_OP[op.kind]);
  if (kind === "source" && r.chance(DOUBLE_AGENT_SHARE)) kind = "double";
  const template = r.pick(TEMPLATES[kind === "double" ? "source" : kind]);
  const fill = (t: string) => t.replaceAll("{city}", op.city);
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
    text: fill(template.text),
    missionId: null,
  };
  op.leadId = lead.id;
  op.endsAt = Math.max(op.endsAt, lead.expiresAt);
  s.leads.push(lead);
  post(s, { kind: "lead", title: `New lead: ${lead.title}`, body: lead.text, regionId: lead.regionId, pos: lead.pos, refId: lead.id });
}

function finishOperation(s: GameState, op: Operation, ignored: boolean) {
  const def = OP_KINDS.find((k) => k.kind === op.kind)!;
  const b = BLOODLINES.find((x) => x.id === op.bloodline)!;
  const hit = def.damage * b.pr * difficulty(s.difficulty).vampirePressure * (ignored ? 2.5 : 1);
  changeSupport(s, op.regionId, -hit);
  if (ignored) addLog(s, `We knew about ${op.city}, and did nothing. Support in ${regionById(op.regionId)?.name} falls.`, "bad");
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

/** Daily: operations SIGINT can hear may surface as leads (see sigintRates). */
export function dailyOperations(s: GameState) {
  const r = rng(s);
  const rates = sigintRates(s);
  for (const op of s.operations) {
    const rate = rates.get(op.regionId) ?? 0;
    if (!op.leadId && rate > 0 && r.chance(detectionChance(rate))) surfaceLead(s, op);
  }
}
