import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { fight, winChance } from "./combat";
import { CHARTER } from "../data/aircraft";
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

  it("charters a jet for one agent anywhere, and brings them home", () => {
    const s = withLead("source", 1, { lat: -33.9, lon: 151.2 }); // Sydney: out of every aircraft's reach
    s.leads[0]!.expiresAt = s.time + 6 * DAY;
    expect(dispatchBlocker(s, plan(s, 2, "plainclothes", CHARTER.id))).toMatch(/one agent/);
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
