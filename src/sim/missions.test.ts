import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { fight, winChance } from "./combat";
import { CHARTER, COMMERCIAL } from "../data/aircraft";
import { acquireAircraft } from "./personnel";
import { decide, dispatch, dispatchBlocker, dispatchCost, hoursUntilLocal, type DispatchPlan } from "./missions";
import { rng } from "./rng";
import type { GameState, LeadKind } from "./state";
import { DAY, HOUR } from "./time";

const MILAN = { lat: 45.46, lon: 9.19 };

/** A quiet campaign (no bloodline operations) with one lead near Padua. */
function withLead(kind: LeadKind, seed = 1, pos = MILAN) {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.operations.push({ id: "op-t", bloodline: "carcassonne", kind: "feeding", regionId: "italy", pos, city: "Milan", startedAt: s.time, endsAt: s.time + 9 * DAY, leadId: "lead-t" });
  s.leads.push({ id: "lead-t", opId: "op-t", kind, regionId: "italy", pos, city: "Milan", appearedAt: s.time, expiresAt: s.time + 4 * DAY, intel: 0.7, title: "Test, Milan", text: "", missionId: null });
  return s;
}

const heli = (s: GameState) => s.aircraft.find((a) => a.kind === "helicopter")!.id;
const jet = (s: GameState) => s.aircraft.find((a) => a.kind === "jet")!.id;

function plan(s: GameState, n: number, kit: DispatchPlan["kit"] = "plainclothes", aircraftId = heli(s)): DispatchPlan {
  return { target: { kind: "lead", id: "lead-t" }, baseId: "ob-padua", aircraftId, agentIds: s.agents.slice(0, n).map((a) => a.id), kit };
}

/** Runs the clock until an event of `kind` is at the front (dismissing others). */
function until(s: GameState, kind: string, days = 10) {
  const end = s.time + days * DAY;
  while (s.time < end) {
    if (s.events[0]?.kind === kind) return s.events[0];
    if (s.events.length) { dismissEvent(s); continue; }
    advance(s, end - s.time);
  }
  return s.events[0]?.kind === kind ? s.events[0] : undefined;
}

describe("dispatch", () => {
  it("costs no secrecy for one agent in civilian clothes, a lot for a tactical squad by jet", () => {
    const s = withLead("capture");
    expect(dispatchCost(s, plan(s, 1, "civilian"))!.secrecy).toBe(0);
    s.agents.push(...s.agents.map((a) => ({ ...a, id: a.id + "x" })));
    expect(dispatchCost(s, plan(s, 8, "tactical", jet(s)))!.secrecy).toBeGreaterThanOrEqual(7);
    expect(dispatchCost(s, plan(s, 2, "plainclothes"))!.secrecy).toBeLessThan(1.5);
  });

  it("checks the team, the aircraft and the reach", () => {
    const s = withLead("capture");
    expect(dispatchBlocker(s, plan(s, 0))).toMatch(/at least one/);
    s.agents[0]!.woundedUntil = s.time + DAY;
    expect(dispatchBlocker(s, plan(s, 2))).toMatch(/isn't available/);
    s.agents[0]!.woundedUntil = 0;
    const far = withLead("capture", 1, { lat: -33.9, lon: 151.2 });
    expect(dispatchBlocker(far, plan(far, 2, "plainclothes", jet(far)))).toMatch(/can't reach/);
    expect(dispatch(s, plan(s, 2))).toBeNull();
    expect(dispatchBlocker(s, plan(s, 2))).toMatch(/already on it/);
  });

  it("hires a commercial seat for one unarmed agent at a tenth of a charter", () => {
    const s = withLead("source", 1, { lat: -33.9, lon: 151.2 });
    s.leads[0]!.expiresAt = s.time + 6 * DAY;
    expect(dispatchBlocker(s, plan(s, 2, "civilian", COMMERCIAL.id))).toMatch(/one agent/);
    expect(dispatchBlocker(s, plan(s, 1, "plainclothes", COMMERCIAL.id))).toMatch(/Airport security/);
    const air = dispatchCost(s, plan(s, 1, "civilian", COMMERCIAL.id))!;
    const jet = dispatchCost(s, plan(s, 1, "civilian", CHARTER.id))!;
    expect(air.money / jet.money).toBeCloseTo(0.1, 2);
    expect(air.arriveAt).toBeGreaterThan(jet.arriveAt); // booking and connections
    expect(dispatch(s, plan(s, 1, "civilian", COMMERCIAL.id))).toBeNull();
  });

  it("charters a jet for two agents anywhere, armed if need be, and brings them home", () => {
    const s = withLead("source", 1, { lat: -33.9, lon: 151.2 }); // Sydney: out of every aircraft's reach
    s.leads[0]!.expiresAt = s.time + 6 * DAY;
    expect(dispatchBlocker(s, plan(s, 3, "plainclothes", CHARTER.id))).toMatch(/2 agents/);
    expect(dispatchBlocker(s, plan(s, 2, "plainclothes", CHARTER.id))).toBeNull();
    expect(dispatchBlocker(s, plan(s, 1, "tactical", CHARTER.id))).toMatch(/charter terminal/);
    const p = plan(s, 1, "civilian", CHARTER.id);
    const cost = dispatchCost(s, p)!;
    expect(cost.secrecy).toBe(0); // a lone passenger in street clothes
    expect(cost.money).toBeGreaterThan(CHARTER.fee);
    expect(cost.lateBy).toBe(0);
    const funds = s.funds;
    const planes = s.aircraft.map((a) => a.deployed);
    expect(dispatch(s, p)).toBeNull();
    expect(s.funds).toBe(funds - cost.money);
    expect(s.aircraft.map((a) => a.deployed)).toEqual(planes); // our own aircraft stay home
    const agent = s.agents.find((a) => a.id === p.agentIds[0])!;
    expect(agent.deployed).toBe(true);
    // Survives a save round trip, then plays out and comes home.
    const t = deserialize(serialize(s));
    expect(t.missions).toHaveLength(1);
    const arrival = until(t, "arrival", 3);
    expect(arrival).toBeDefined();
    decide(t, t.missions[0]!.id, t.missions[0]!.decision!.options[0]!.id);
    for (let i = 0; i < 40 && t.missions.length; i++) {
      if (t.events.length) dismissEvent(t);
      else advance(t, DAY);
    }
    expect(t.missions).toHaveLength(0);
    expect(t.agents.find((a) => a.id === agent.id)?.deployed ?? false).toBe(false);
  });
});

describe("a mission, end to end", () => {
  it("flies out, asks for a decision, resolves, and flies home", () => {
    const s = withLead("capture");
    const p = plan(s, 3);
    const funds = s.funds;
    expect(dispatch(s, p)).toBeNull();
    expect(s.funds).toBeLessThan(funds); // fuel and crew
    expect(s.agents.slice(0, 3).every((a) => a.deployed)).toBe(true);

    const arrival = until(s, "arrival");
    expect(arrival).toBeDefined();
    const m = s.missions[0]!;
    expect(m.phase).toBe("on-site");
    expect(m.decision!.options.map((o) => o.id)).toEqual(["street", "follow", "abort"]);
    expect(advance(s, HOUR)).toBe(0); // the clock waits for orders

    expect(decide(s, m.id, "street")).toBeNull();
    expect(s.events[0]?.kind).toBe("debrief");
    expect(s.leads.find((l) => l.id === "lead-t")).toBeUndefined();
    expect(m.phase).toBe("returning");

    dismissEvent(s);
    for (let i = 0; i < 20 && s.missions.length; i++) { advance(s, DAY); while (s.events.length) dismissEvent(s); }
    expect(s.missions).toHaveLength(0);
    expect(s.agents.every((a) => !a.deployed)).toBe(true);
    expect(s.aircraft.every((a) => !a.deployed)).toBe(true);
  });

  it("keeps the lead open when the team aborts", () => {
    const s = withLead("recovery");
    dispatch(s, plan(s, 1, "civilian"));
    until(s, "arrival");
    expect(decide(s, s.missions[0]!.id, "abort")).toBeNull();
    const lead = s.leads.find((l) => l.id === "lead-t")!;
    expect(lead).toBeDefined();
    expect(lead.missionId).toBeNull();
  });

  it("holds the lead while a stakeout runs, then resolves", () => {
    const s = withLead("surveillance");
    dispatch(s, plan(s, 2, "civilian"));
    until(s, "arrival");
    const m = s.missions[0]!;
    decide(s, m.id, "stakeout");
    expect(m.option).toBe("stakeout");
    const debrief = until(s, "debrief", 5);
    expect(debrief).toBeDefined();
    expect(s.time - m.arriveAt).toBeGreaterThanOrEqual(72 * HOUR);
  });

  it("never lets a double agent's decision give it away", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ids = (kind: LeadKind) => {
        const s = withLead(kind, seed);
        dispatch(s, plan(s, 2));
        until(s, "arrival");
        const d = s.missions[0]!.decision!;
        return { ids: d.options.filter((o) => o.id !== "snatch").map((o) => o.id), odds: d.options.find((o) => o.id === "meet")!.odds };
      };
      expect(ids("double")).toEqual(ids("source"));
    }
  });

  it("survives a save and load while waiting for orders", () => {
    const s = withLead("rescue");
    dispatch(s, plan(s, 4, "tactical"));
    until(s, "arrival");
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
    expect(decide(back, back.missions[0]!.id, "now")).toBeNull();
  });
});

describe("sites and strikes", () => {
  it("a strike on a site destroys it or drives the team out", () => {
    const s = withLead("capture");
    s.sites.push({ id: "site-t", bloodline: "carcassonne", kind: "nest", regionId: "italy", city: "Milan", pos: MILAN, revealedAt: s.time, expiresAt: s.time + 12 * DAY, thralls: 3, vampires: 1, missionId: null });
    const p: DispatchPlan = { ...plan(s, 6, "tactical"), target: { kind: "site", id: "site-t" } };
    expect(dispatch(s, p)).toBeNull();
    until(s, "arrival");
    const m = s.missions[0]!;
    expect(m.decision!.options.map((o) => o.id)).toEqual(["midday", "night", "abort"]);
    decide(s, m.id, "night");
    const debrief = until(s, "debrief", 2)!;
    expect(debrief.title).toMatch(/Success|Failure/);
    expect(s.sites).toHaveLength(0);
  });

  it("brings back remains only by helicopter, and captives when there's a cell", () => {
    const got = { heli: { remains: 0, captives: 0 }, jet: { remains: 0, captives: 0 } };
    for (let seed = 1; seed <= 25; seed++) {
      for (const [name, craft] of [["heli", heli], ["jet", jet]] as const) {
        const s = withLead("capture", seed);
        const base = s.installations.find((i) => i.kind === "base")!;
        base.containment = 2;
        s.agents.push(...s.agents.map((a) => ({ ...a, id: a.id + "x" })));
        s.sites.push({ id: "site-t", bloodline: "carcassonne", kind: "nest", regionId: "italy", city: "Milan", pos: MILAN, revealedAt: s.time, expiresAt: s.time + 12 * DAY, thralls: 2, vampires: 1, missionId: null });
        // Four aboard: room for a captive and one body on the helicopter (capacity 8).
        const p: DispatchPlan = { ...plan(s, 4, "tactical", craft(s)), target: { kind: "site", id: "site-t" } };
        expect(dispatch(s, p)).toBeNull();
        until(s, "arrival");
        decide(s, s.missions[0]!.id, "midday");
        until(s, "debrief", 2);
        // The haul is aboard until the aircraft lands.
        const aboard = s.aircraft.find((a) => a.id === p.aircraftId)?.cargo;
        got[name].remains += (base.remains ?? 0) + (aboard?.remains ?? 0);
        got[name].captives += (base.captives?.length ?? 0) + (aboard?.captives.length ?? 0);
      }
    }
    expect(got.heli.remains).toBeGreaterThan(3);
    expect(got.jet.remains).toBe(0);
    expect(got.heli.captives).toBeGreaterThan(got.jet.captives);
    expect(got.jet.captives).toBeGreaterThan(0);
  });

  it("flies escorts with the first aircraft: more seats, more room for the haul", () => {
    let one = 0, two = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const escorted of [false, true]) {
        const s = withLead("capture", seed);
        const base = s.installations.find((i) => i.kind === "base")!;
        base.hangars = 3;
        s.funds = 1e8;
        expect(acquireAircraft(s, base.id, "helicopter", true)).toBeNull();
        s.agents.push(...s.agents.map((a) => ({ ...a, id: a.id + "x" })));
        s.sites.push({ id: "site-t", bloodline: "carcassonne", kind: "den", regionId: "italy", city: "Milan", pos: MILAN, revealedAt: s.time, expiresAt: s.time + 12 * DAY, thralls: 3, vampires: 2, missionId: null });
        const [h1, h2] = s.aircraft.filter((a) => a.kind === "helicopter");
        const p: DispatchPlan = { ...plan(s, 8, "tactical", h1!.id), target: { kind: "site", id: "site-t" }, ...(escorted ? { escorts: [h2!.id] } : {}) };
        if (!escorted) expect(dispatchBlocker(s, { ...p, agentIds: [...p.agentIds, s.agents[8]!.id] })).toMatch(/seats 8/);
        expect(dispatch(s, p)).toBeNull();
        if (escorted) expect(h2!.deployed).toBe(true);
        until(s, "arrival");
        decide(s, s.missions[0]!.id, "midday");
        until(s, "debrief", 2);
        const aboard = s.aircraft.reduce((t, a) => t + (a.cargo?.remains ?? 0) + (a.cargo?.captives.length ?? 0), 0);
        if (escorted) two += aboard; else one += aboard;
        until(s, "never", 3); // home: everything lands and unloads
        expect(s.aircraft.every((a) => !a.deployed && !a.cargo)).toBe(true);
      }
    }
    // Eight aboard one helicopter leaves no room; a second one carries the haul.
    expect(one).toBe(0);
    expect(two).toBeGreaterThan(5);
  });

  it("can lose the helicopter on the landing zone, never the jet", () => {
    let heliLost = 0, jetLost = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const craft of [heli, jet]) {
        const s = withLead("capture", seed);
        // A haven against two agents in civilian clothes: the fight usually goes badly.
        s.sites.push({ id: "site-t", bloodline: "carcassonne", kind: "haven", regionId: "italy", city: "Milan", pos: MILAN, revealedAt: s.time, expiresAt: s.time + 12 * DAY, thralls: 5, vampires: 3, missionId: null });
        const id = craft(s);
        const p: DispatchPlan = { ...plan(s, 2, "civilian", id), target: { kind: "site", id: "site-t" } };
        expect(dispatch(s, p)).toBeNull();
        until(s, "arrival");
        decide(s, s.missions[0]!.id, "night");
        const debrief = until(s, "debrief", 2)!;
        if (!s.aircraft.some((a) => a.id === id)) {
          if (craft === heli) heliLost++;
          else jetLost++;
          expect(debrief.effects).toMatch(/CHERUB-1 lost/);
          // The team still gets home, on a hired flight.
          for (let i = 0; i < 10 && s.missions.length; i++) { if (s.events.length) dismissEvent(s); else advance(s, DAY); }
          expect(s.missions).toHaveLength(0);
        }
      }
    }
    expect(heliLost).toBeGreaterThan(3);
    expect(jetLost).toBe(0);
  });
});

describe("combat", () => {
  it("a strong tactical team usually beats a nest; one civilian rarely beats a haven", () => {
    const s = newCampaign("inquisitor", 3);
    expect(winChance(s.agents, "tactical", { thralls: 3, vampires: 1 }, 0)).toBeGreaterThan(0.75);
    expect(winChance(s.agents.slice(0, 1), "civilian", { thralls: 5, vampires: 3 }, 0)).toBeLessThan(0.1);
  });

  it("can kill agents, and never leaves a survivor below 1 hp", () => {
    const s = newCampaign("inquisitor", 3);
    const r = rng({ rng: 5 });
    let deaths = 0;
    for (let i = 0; i < 50; i++) {
      const team = s.agents.slice(0, 2).map((a) => ({ ...a, stats: { ...a.stats } }));
      const res = fight(r, team, "civilian", { thralls: 4, vampires: 2 }, 0);
      deaths += res.dead.length;
      for (const a of team) if (!res.dead.includes(a.id)) expect(a.hp).toBeGreaterThanOrEqual(1);
    }
    expect(deaths).toBeGreaterThan(0);
  });
});

describe("local time", () => {
  it("waits for the right hour at the target's longitude", () => {
    const midnightUtc = Date.UTC(2027, 0, 1, 0, 0);
    expect(hoursUntilLocal(midnightUtc, 0, 3)).toBe(3);
    expect(hoursUntilLocal(midnightUtc, 45, 12)).toBe(9); // local 03:00
    expect(hoursUntilLocal(midnightUtc, -90, 3)).toBe(9); // local 18:00
  });
});
