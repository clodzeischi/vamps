import { describe, expect, it } from "vitest";
import { setStaffLead, staffAtWork, staffLead } from "../people/personnel";
import { deserialize, serialize } from "../../save/format";
import { BLOODLINES } from "../../data/bloodlines";
import { newCampaign } from "../campaign/campaign";
import { advance, dismissEvent } from "../core/clock";
import {
  addEvidence, caseOf, confidence, dailyIntel, discardLead, FIND_POINTS, fixLead, isReal, MAX_EVIDENCE, noiseLead, openCase, posterior, PRIOR,
  sectionPace, setFind,
} from "./intel";
import { decide, dispatch, FALSE_RAID } from "../missions/missions";
import { moveChance, revealSite } from "./networks";
import { surfaceLead } from "./operations";
import { rng } from "../core/rng";
import type { GameState, Lead } from "../core/state";
import { DAY } from "../core/time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(BLOODLINES.map((b) => [b.id, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15;
  s.events = [];
  return s;
};
const MILAN = { lat: 45.46, lon: 9.19 };
const op = (s: GameState, i: number, regionId = "italy") => {
  const o = { id: `op-t${i}`, bloodline: "carcassonne", kind: "feeding" as const, regionId, pos: MILAN, city: "Milan", startedAt: s.time, endsAt: s.time + 9 * DAY, leadId: null };
  s.operations.push(o);
  return o;
};

describe("the intelligence section", () => {
  it("starts with two analysts at Padua, looking at Agnes's house", () => {
    const s = quiet();
    expect(staffAtWork(s, "analyst")).toHaveLength(2);
    expect(s.section.find).toEqual({ kind: "house", id: "carcassonne" });
    expect(sectionPace(s).rate).toBeGreaterThan(2);
  });

  it("a lead analyst multiplies the others", () => {
    const s = quiet();
    const [a, b] = staffAtWork(s, "analyst");
    Object.assign(a!.aptitudes!, { osint: 100, humint: 100, sigint: 100, ci: 100 });
    const before = sectionPace(s).rate;
    expect(setStaffLead(s, "analyst", a!.id)).toBeNull();
    expect(staffLead(s, "analyst")!.id).toBe(a!.id);
    expect(sectionPace(s).rate).toBeGreaterThan(before);
    expect(setStaffLead(s, "analyst", s.staff.find((p) => p.role === "scientist")!.id)).toMatch(/Not one of our analysts/);
    void b;
  });

  it("is honest: of the leads shown at a given confidence, about that share are real", () => {
    const s = quiet();
    const r = rng({ rng: 77 });
    const buckets = Array.from({ length: 5 }, () => ({ n: 0, real: 0, sum: 0 }));
    for (let i = 0; i < 4000; i++) {
      const via = r.pick(["osint", "humint", "sigint", "volunteer"] as const);
      const c = openCase(s, r.chance(PRIOR[via]), PRIOR[via]);
      const lead = { id: `l${i}`, opId: "", kind: "surveillance", caseId: c.id, regionId: r.pick(["italy", "france_benelux", "iberia"]), city: "Milan", pos: MILAN, via } as Lead;
      for (let k = r.int(0, 6); k > 0; k--) addEvidence(s, lead);
      const p = posterior(c);
      const b = buckets[Math.min(4, Math.floor(p * 5))]!;
      b.n++; b.sum += p; if (c.real) b.real++;
      s.cases = [];
      s.leads = [];
    }
    for (const b of buckets) if (b.n > 150) expect(Math.abs(b.real / b.n - b.sum / b.n)).toBeLessThan(0.05);
  });

  it("Find turns up leads in its scope, real at the prior's rate; where nothing goes on, nothing", () => {
    const s = quiet();
    setFind(s, { kind: "region", id: "italy" });
    for (let i = 0; i < 300; i++) op(s, i);
    let real = 0, shown = 0;
    for (let d = 0; d < 300 && s.leads.length < 120; d++) {
      s.section.findPoints = FIND_POINTS;
      dailyIntel(s);
    }
    for (const l of s.leads) {
      shown += confidence(s, l);
      if (isReal(s, l)) real++;
    }
    expect(s.leads.length).toBeGreaterThan(60);
    expect(s.leads.every((l) => l.regionId === "italy")).toBe(true);
    expect(Math.abs(real / s.leads.length - shown / s.leads.length)).toBeLessThan(0.15);
    // A region with nothing going on: nothing turns up.
    const t = quiet();
    setFind(t, { kind: "region", id: "brazil" });
    t.section.findPoints = FIND_POINTS * 3;
    dailyIntel(t);
    expect(t.leads).toHaveLength(0);
  });

  it("Fix adds evidence to one lead, day by day, until there is nothing more to learn", () => {
    const s = quiet();
    setFind(s, null);
    const lead = surfaceLead(s, op(s, 1), "sigint");
    expect(caseOf(s, lead)!.evidence).toHaveLength(0);
    expect(fixLead(s, lead.id)).toBeNull();
    for (let d = 0; d < 40 && s.section.fixing; d++) dailyIntel(s);
    const n = caseOf(s, s.leads.find((l) => l.id === lead.id) ?? lead)?.evidence.length ?? 0;
    expect(n === MAX_EVIDENCE || !s.leads.includes(lead)).toBe(true); // done, or the site noticed and the lead went cold
    expect(s.section.fixing).toBeNull();
  });

  it("follow-up leads join the same case", () => {
    const s = quiet();
    setFind(s, null);
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      const lead = surfaceLead(s, op(s, 100 + i), "sigint");
      for (let k = 0; k < MAX_EVIDENCE; k++) addEvidence(s, lead);
      const same = s.leads.filter((l) => l.caseId === lead.caseId);
      if (same.length > 1) {
        found = true;
        expect(same[1]!.title).toMatch(/^Follow-up/);
        expect(confidence(s, same[1]!)).toBe(confidence(s, lead));
      }
    }
    expect(found).toBe(true);
  });

  it("dropping a lead removes it; a noise lead dropped costs nothing", () => {
    const s = quiet();
    const lead = noiseLead(s, "osint", "italy");
    expect(isReal(s, lead)).toBe(false);
    expect(lead.opId).toBe("");
    const support = s.regions.italy!.support;
    expect(discardLead(s, lead.id)).toBeNull();
    expect(s.leads).toHaveLength(0);
    advance(s, 5 * DAY);
    expect(s.regions.italy!.support).toBeCloseTo(support, 1);
  });

  it("a raid on a false lead finds nothing: quiet kit costs nothing, a tactical team costs support and secrecy", () => {
    for (const kit of ["plainclothes", "tactical"] as const) {
      const s = quiet();
      const lead = noiseLead(s, "osint", "italy", { city: "Padua", pos: { lat: 45.42, lon: 11.9 } });
      s.events = [];
      const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
      expect(dispatch(s, { target: { kind: "lead", id: lead.id }, baseId: "ob-padua", aircraftId: heli.id, agentIds: s.agents.slice(0, 2).map((a) => a.id), kit })).toBeNull();
      const support = s.regions.italy!.support;
      const secrecy = s.secrecy;
      let debrief;
      for (let i = 0; i < 100 && !debrief; i++) {
        const e = s.events[0];
        if (e?.kind === "arrival") decide(s, s.missions[0]!.id, s.missions[0]!.decision!.options[0]!.id);
        else if (e?.kind === "debrief") debrief = e;
        else if (e) dismissEvent(s);
        else advance(s, 3_600_000);
      }
      expect(debrief!.title).toMatch(/^Nothing there/);
      if (kit === "tactical") {
        expect(s.regions.italy!.support).toBeLessThan(support - FALSE_RAID.support + 0.05);
        expect(s.secrecy).toBeLessThan(secrecy);
      } else expect(s.regions.italy!.support).toBeGreaterThan(support - 0.05);
    }
  });

  it("known nests and dens may move any day; a lair never does", () => {
    const s = quiet();
    const nest = s.networks.huaca!.sites.find((x) => x.kind === "nest")!;
    const site = revealSite(s, nest, "huaca");
    expect(site.expiresAt).toBeGreaterThan(s.time + 1000 * DAY);
    expect(moveChance(s, "nest")).toBeGreaterThan(moveChance(s, "den"));
    for (let d = 0; d < 200 && s.sites.includes(site); d++) {
      if (s.events.length) { dismissEvent(s); continue; }
      advance(s, DAY);
    }
    expect(s.sites.includes(site)).toBe(false);
    expect(nest.known).toBe(false);
  });

  it("survives a save", () => {
    const s = quiet();
    const lead = surfaceLead(s, op(s, 1), "osint");
    addEvidence(s, lead);
    fixLead(s, lead.id);
    const back = deserialize(serialize(s));
    expect(back.section.fixing).toBe(lead.id);
    expect(caseOf(back, back.leads[0]!)!.evidence).toHaveLength(1);
    expect(confidence(back, back.leads[0]!)).toBeCloseTo(confidence(s, lead));
  });
});
