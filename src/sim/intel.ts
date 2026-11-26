// The intelligence section (docs/design/intelligence.md). Analysts at every
// base work as one section for the Order, multiplied by one lead analyst.
// They Find (look for signs of activity in a house or a region, which turns
// up leads) or Fix (work one lead: each piece of evidence builds or breaks its
// case, and some turn up follow-up leads). While they fix, a thin trickle of
// Find goes on.
//
// A lead is a sign of a real site, or of nothing. Its case's confidence is
// honest: the prior is the share of real leads from its discipline, and each
// piece of evidence moves it by the likelihood ratio it was drawn with, so a
// lead at 90% is wrong one time in ten. False leads are noise, never planted.
import { APTITUDE_MIDDLE, POINTS_PER_DAY, type AnalystAptitude, type Requirement } from "../data/aptitudes";
import { staffAtWork, staffLead } from "./personnel";
import { synergy } from "./building";
import { BLOODLINES, bloodlineById } from "../data/bloodlines";
import { regionById } from "../data/regions";
import { aptitude, growAptitudes, leadMultiplier, skillOn } from "./aptitudes";
import { sigintRates } from "./commands";
import { humintRates } from "./humint";
import { findNetSite, moveSite } from "./networks";
import { announceLead, composeLead, type LeadSource } from "./operations";
import { rng, type Rng } from "./rng";
import { addLog, post, type Discipline, type Evidence, type GameState, type IntelCase, type Lead, type Operation, LeadVia, leadById, installationById } from "./state";

/** Share of leads that are real, by how they came: the prior every case starts from. */
export const PRIOR: Record<LeadVia, number> = { osint: 0.3, humint: 0.55, volunteer: 0.6, sigint: 0.75 };
/** Points the section spends to turn up a lead, and to find a piece of evidence. */
export const FIND_POINTS = 6;
const FIX_POINTS = 3;
/** While fixing, this share of the section's work still goes to Find. */
export const FIND_TRICKLE = 0.25;
/** OSINT works anywhere: its weight against a region's SIGINT and HUMINT collection. */
const OSINT_WEIGHT = 0.25;
/** How much a piece of evidence says (P(for | real)), by discipline, before CI. */
const DIAGNOSTIC: Record<Discipline, number> = { osint: 0.6, humint: 0.65, sigint: 0.7 };
/** CI at 100 adds this much to it (at 0, takes it away); the bounds. */
const CI_DIAGNOSTIC = 0.15;
const DIAGNOSTIC_RANGE: [number, number] = [0.55, 0.9];
/** A case has this much to find; after it, there is nothing more to learn. */
export const MAX_EVIDENCE = 8;
/** A piece of evidence for the case turns up a follow-up lead this often. */
const FOLLOW_UP_CHANCE = 0.2;
/** Watching a real site while we fix its lead: the extra daily chance it notices and moves. */
const WATCH_MOVE = 0.03;

/** Every analyst's four aptitudes count alike toward the section's pace. */
const SECTION_REQ: Requirement = { osint: 0.25, humint: 0.25, sigint: 0.25, ci: 0.25 };

/** The section's points a day, and its skill on one aptitude (the lead's multiplier included). */
export function sectionPace(s: GameState) {
  const people = staffAtWork(s, "analyst");
  const lead = staffLead(s, "analyst");
  const total = people.reduce((t, p) => t + skillOn(SECTION_REQ, p, lead) * (1 + synergy(installationById(s, p.baseId), "fusion")), 0);
  const on = (id: AnalystAptitude) =>
    people.length ? people.reduce((t, p) => t + aptitude(p, id) * (lead && lead.id !== p.id ? leadMultiplier(lead, id) : 1), 0) / people.length : 0;
  return { analysts: people.length, rate: POINTS_PER_DAY * (total / APTITUDE_MIDDLE), on };
}

// ---------------------------------------------------------------------------
// Cases and confidence
// ---------------------------------------------------------------------------

export function openCase(s: GameState, real: boolean, prior: number): IntelCase {
  const c: IntelCase = { id: `case-${s.nextId++}`, real, prior, evidence: [] };
  s.cases.push(c);
  return c;
}

export const caseOf = (s: GameState, lead: Lead): IntelCase | undefined => s.cases.find((c) => c.id === lead.caseId);

/** The honest chance a case is real, from its prior and its evidence. */
export function posterior(c: IntelCase): number {
  const odds = (c.prior / (1 - c.prior)) * c.evidence.reduce((t, e) => t * e.lr, 1);
  return odds / (1 + odds);
}

/** What the player is shown: the chance the lead is real. */
export const confidence = (s: GameState, lead: Lead): number => {
  const c = caseOf(s, lead);
  return c ? posterior(c) : 1;
};

/** The truth, for the sim only. */
export const isReal = (s: GameState, lead: Lead): boolean => caseOf(s, lead)?.real ?? true;

/** Channels that can't tell real activity from noise send some noise too: after a real lead with
 *  prior p, a noise lead by the same channel with chance (1 − p) / p, so p stays the true share. */
export function maybeNoise(s: GameState, via: LeadVia, regionId: string) {
  const p = PRIOR[via];
  if (rng(s).chance((1 - p) / p)) noiseLead(s, via, regionId);
}

/** A lead about nothing: a story that sounds like the real thing, in a city of the region. */
export function noiseLead(s: GameState, via: LeadVia, regionId: string, near?: { city: string; pos: { lat: number; lon: number } }): Lead {
  const c = openCase(s, false, PRIOR[via]);
  const lead = composeLead(s, noiseSource(s, regionId, near), via, c.id);
  announceLead(s, lead);
  return lead;
}

function noiseSource(s: GameState, regionId: string, near?: { city: string; pos: { lat: number; lon: number } }): LeadSource {
  const r = rng(s);
  if (near) return { op: null, regionId, city: near.city, pos: { lat: near.pos.lat + r.real(-0.1, 0.1), lon: near.pos.lon + r.real(-0.1, 0.1) } };
  const region = regionById(regionId)!;
  const city = region.cities.length ? r.pick(region.cities.slice(0, 6)) : { name: region.name, ...region.label };
  return { op: null, regionId, city: city.name, pos: { lat: city.lat + r.real(-0.2, 0.2), lon: city.lon + r.real(-0.2, 0.2) } };
}

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/** Where the section can look: a house's homelands, or one region. */
export function findRegions(s: GameState): string[] {
  const f = s.section?.find;
  if (!f) return [];
  if (f.kind === "region") return regionById(f.id) ? [f.id] : [];
  return bloodlineById(f.id)?.homeRegions ?? [];
}

/** What a discipline can do in a region: its collection weight (OSINT always; SIGINT with a station in
 *  or next to it; HUMINT with assets there), times the section's aptitude for it. */
export function collection(s: GameState, regionId: string, pace = sectionPace(s)): Record<Discipline, number> {
  const sig = sigintRates(s).get(regionId) ?? 0;
  const hum = humintRates(s).get(regionId) ?? 0;
  const k = (id: AnalystAptitude) => pace.on(id) / APTITUDE_MIDDLE;
  return { osint: OSINT_WEIGHT * k("osint"), humint: hum * k("humint"), sigint: sig * k("sigint") };
}

/** A discipline, in proportion to what it can do here (OSINT if nothing can). */
function pickDiscipline(r: Rng, w: Record<Discipline, number>): Discipline {
  const items = (Object.entries(w) as [Discipline, number][]).filter(([, v]) => v > 0);
  return items.length ? r.weighted(items) : "osint";
}

/** The share of real leads Find turns up in a region: what each discipline would bring, weighted by how often it brings one. */
export function findOdds(s: GameState, regionId: string): number {
  const w = collection(s, regionId);
  const total = w.osint + w.humint + w.sigint;
  return total ? (w.osint * PRIOR.osint + w.humint * PRIOR.humint + w.sigint * PRIOR.sigint) / total : PRIOR.osint;
}

/** Find turns up one lead in the scope: a sign of an operation nobody has found, or noise. Where nothing
 *  is going on, nothing turns up (the analysts say so). */
function findOne(s: GameState): Lead | null {
  const r = rng(s);
  const regions = new Set(findRegions(s));
  const ops = s.operations.filter((o) => !o.leadId && regions.has(o.regionId));
  if (!ops.length) return null;
  const op = r.pick(ops);
  const disc = pickDiscipline(r, collection(s, op.regionId));
  const via: LeadVia = disc;
  if (r.chance(PRIOR[via])) {
    const c = openCase(s, true, PRIOR[via]);
    const lead = composeLead(s, { op, regionId: op.regionId, city: op.city, pos: op.pos }, via, c.id);
    announceLead(s, lead);
    return lead;
  }
  return noiseLead(s, via, op.regionId);
}

// ---------------------------------------------------------------------------
// Fix: evidence, follow-ups
// ---------------------------------------------------------------------------

const EVIDENCE: Record<Discipline, { for: string[]; against: string[] }> = {
  osint: {
    for: [
      "OSINT: a missing-person appeal from the same streets, three weeks old, and another from last month.",
      "OSINT: the company behind it was registered by a nominee director who fronts for forty others.",
      "OSINT: someone on a local forum asks why the ambulances there never use their sirens.",
    ],
    against: [
      "OSINT: nothing in the local press, the registries or the forums. The story doesn't hold together.",
      "OSINT: the business is what it says it is: accounts filed, reviews, a christening party in its photos.",
      "OSINT: the missing person turned up in another city, posting holiday pictures.",
    ],
  },
  humint: {
    for: [
      "HUMINT: our agent's contact in the police says the file was closed from above.",
      "HUMINT: a night porter remembers the same van, the same hours, and didn't want to say more.",
      "HUMINT: the parish priest has had three families ask him about the same address.",
    ],
    against: [
      "HUMINT: the police have no reports from there, and the neighbours sleep well.",
      "HUMINT: our agent's cousin works there nights. Nothing stranger than a broken boiler.",
      "HUMINT: the source who started this has told the same story about four other places.",
    ],
  },
  sigint: {
    for: [
      "SIGINT: a phone that only wakes after dark keeps calling a number we've seen before.",
      "SIGINT: burner handsets switch on together at the address, every night after midnight.",
      "SIGINT: a courier's phone we know stops there for an hour, twice a week.",
    ],
    against: [
      "SIGINT: no anomalies around the address; the phones there keep ordinary hours.",
      "SIGINT: the traffic that flagged it was a call-centre's night shift.",
      "SIGINT: the number at the heart of it belongs to a taxi firm, and nothing else.",
    ],
  },
};

/** How much one piece of evidence of a discipline says, with the section's CI. */
function diagnostic(s: GameState, disc: Discipline, pace = sectionPace(s)): number {
  const ci = Math.max(-1, Math.min(1, (pace.on("ci") - APTITUDE_MIDDLE) / APTITUDE_MIDDLE));
  return Math.max(DIAGNOSTIC_RANGE[0], Math.min(DIAGNOSTIC_RANGE[1], DIAGNOSTIC[disc] + CI_DIAGNOSTIC * ci));
}

/** One more piece of evidence on the lead's case, drawn from the truth with the odds it is weighed by. */
export function addEvidence(s: GameState, lead: Lead): Evidence | null {
  const c = caseOf(s, lead);
  if (!c || c.evidence.length >= MAX_EVIDENCE) return null;
  const r = rng(s);
  const pace = sectionPace(s);
  const disc = pickDiscipline(r, collection(s, lead.regionId, pace));
  const d = diagnostic(s, disc, pace);
  const supports = r.chance(c.real ? d : 1 - d);
  const e: Evidence = { at: s.time, disc, supports, lr: supports ? d / (1 - d) : (1 - d) / d, text: r.pick(EVIDENCE[disc][supports ? "for" : "against"]) };
  c.evidence.push(e);
  growAptitudes(staffAtWork(s, "analyst"), { [disc]: 0.7, ci: 0.3 });
  if (supports && r.chance(FOLLOW_UP_CHANCE)) followUp(s, lead, c);
  return e;
}

/** A thread off the same case: another way in to the same site (or the same nothing). */
function followUp(s: GameState, lead: Lead, c: IntelCase) {
  const op = s.operations.find((o) => o.id === lead.opId) ?? null;
  const via = lead.via;
  const src: LeadSource = op && c.real
    ? { op, regionId: op.regionId, city: op.city, pos: { lat: op.pos.lat + 0.03, lon: op.pos.lon - 0.03 } }
    : noiseSource(s, lead.regionId, { city: lead.city, pos: lead.pos });
  const kinds = (["capture", "source", "surveillance", "recovery"] as const).filter((k) => k !== lead.kind);
  const next = composeLead(s, src, via, c.id, rng(s).pick(kinds));
  next.title = `Follow-up: ${next.title}`;
  announceLead(s, next);
}

/** Starts the section on a lead (Fix). */
export function fixLead(s: GameState, leadId: string | null): string | null {
  if (leadId === null) {
    s.section.fixing = null;
    return null;
  }
  const lead = leadById(s, leadId);
  if (!lead) return "That lead has gone cold.";
  const c = caseOf(s, lead);
  if (!c) return "There is no case to build on this one.";
  if (c.evidence.length >= MAX_EVIDENCE) return "There's nothing more to learn without going there.";
  if (!staffAtWork(s, "analyst").length) return "We have no analysts. Hire some at a base.";
  s.section.fixing = leadId;
  return null;
}

/** Points the section at a house or a region (Find), or nowhere. */
export function setFind(s: GameState, find: { kind: "house" | "region"; id: string } | null): string | null {
  if (find && (find.kind === "house" ? !BLOODLINES.some((b) => b.id === find.id) : !regionById(find.id))) return "Nowhere we know.";
  s.section.find = find;
  return null;
}

/** Drops a lead the player has judged false (or not worth it). Nothing is lost if it was noise. */
export function discardLead(s: GameState, leadId: string): string | null {
  const lead = leadById(s, leadId);
  if (!lead) return "That lead has gone cold.";
  if (lead.missionId) return "A team is on it.";
  s.leads = s.leads.filter((l) => l !== lead);
  if (s.section.fixing === leadId) s.section.fixing = null;
  addLog(s, `Lead dropped: ${lead.title}.`);
  return null;
}

/** Daily: the section works. Find turns up leads in its scope; Fix adds evidence to one lead, and a
 *  real site being watched may notice and move (the lead goes cold). Cases with no leads left are closed. */
export function dailyIntel(s: GameState) {
  const sec = s.section;
  if (sec.fixing && !s.leads.some((l) => l.id === sec.fixing)) sec.fixing = null;
  const { rate } = sectionPace(s);
  const fixing = sec.fixing ? leadById(s, sec.fixing)! : null;
  if (sec.find) {
    sec.findPoints += rate * (fixing ? FIND_TRICKLE : 1);
    while (sec.findPoints >= FIND_POINTS) {
      sec.findPoints -= FIND_POINTS;
      if (!findOne(s)) {
        sec.findPoints = 0;
        break;
      }
    }
  }
  if (fixing) {
    sec.fixPoints += rate * (1 - (sec.find ? FIND_TRICKLE : 0));
    let found = 0;
    while (sec.fixPoints >= FIX_POINTS && s.leads.includes(fixing)) {
      sec.fixPoints -= FIX_POINTS;
      if (!addEvidence(s, fixing)) {
        sec.fixing = null;
        sec.fixPoints = 0;
        break;
      }
      found++;
    }
    if (found && sec.fixing) watched(s, fixing);
  } else sec.fixPoints = 0;
  const live = new Set(s.leads.map((l) => l.caseId));
  s.cases = s.cases.filter((c) => live.has(c.id));
}

/** We are watching a real site: it may notice, and move. Its leads go cold; clues found are kept. */
function watched(s: GameState, lead: Lead) {
  const op = s.operations.find((o) => o.id === lead.opId);
  const found = findNetSite(s, op?.siteId);
  if (!op || !found || found.site.raided || !rng(s).chance(WATCH_MOVE)) return;
  coldCase(s, op, `${lead.city}: they noticed us watching. The ${found.site.kind} has packed up, and the lead is cold.`);
  moveSite(s, found.site, found.bloodline);
}

function coldCase(s: GameState, op: Operation, why: string) {
  const ids = new Set(s.leads.filter((l) => l.opId === op.id && !l.missionId).map((l) => l.id));
  s.leads = s.leads.filter((l) => !ids.has(l.id));
  if (s.section.fixing && ids.has(s.section.fixing)) s.section.fixing = null;
  op.handled = true;
  post(s, { kind: "info", title: "A lead has gone cold", body: why, regionId: op.regionId, pos: op.pos });
}
