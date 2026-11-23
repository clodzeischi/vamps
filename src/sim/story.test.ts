import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { buildBlocker } from "./commands";
import { destroyBloodline } from "./bloodlines";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { decide, dispatch } from "./missions";
import { monthlyIncome } from "./economy";
import { changeSecrecy } from "./secrecy";
import { OPENERS, surfaceLead } from "./operations";
import { CELL_AGENTS, DISPATCHES, FALL_DAY, FALL_DEADLINE_DAYS, FALL_DELAY_DAYS, FALL_EARLIEST_DAY, FALL_INTEL, fallListening, HOSTAGE_STIPEND, isEurope, RETURN_STIPEND, stipendShare, theFall } from "./story";
import { DAY } from "./time";
import type { GameState } from "./state";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  return s;
};

/** Plays on, dismissing everything, until `day` or an event of `kind`. */
function playTo(s: GameState, day: number, kind?: string) {
  const end = s.startTime + day * DAY;
  while (s.time < end && !s.gameOver) {
    if (kind && s.events[0]?.kind === kind) return s.events[0];
    if (s.events.length) { dismissEvent(s); continue; }
    advance(s, end - s.time);
  }
  return kind && s.events[0]?.kind === kind ? s.events[0] : undefined;
}

describe("the story", () => {
  it("intel on Agnes sets the fall: the inside man, a warning, then the strike while the team is home; a bare church cell takes everyone", () => {
    const s = quiet();
    s.story.beats = ["briefing", "sao-paulo", "boston-volunteer", "boston-nest", "agnes", "where-would-we-go"]; // tested below
    // A station of our own in Italy hears the build-up clearly.
    s.installations.push({ id: "sigint-it", kind: "sigint", name: "Station Milan", regionId: "italy", pos: { lat: 45.46, lon: 9.19 }, readyAt: s.time, evictionWarned: false });
    // Six at Padua, so four stay home while two are out.
    s.agents.push(...s.agents.slice(0, 2).map((a, i) => ({ ...a, id: `agent-x${i}`, name: `Extra ${i}` })));
    s.intel.carcassonne = FALL_INTEL;
    s.events = []; // the opening briefing
    const report = playTo(s, FALL_EARLIEST_DAY + 1, "story")!;
    expect(report.title).toBe("Someone on the inside");
    expect(report.body).toMatch(/Doctrine of the Faith/);
    expect(s.time).toBeGreaterThanOrEqual(s.startTime + FALL_EARLIEST_DAY * DAY); // never before
    expect(s.story.fallAt).toBe(s.time + FALL_DELAY_DAYS * DAY);
    dismissEvent(s);
    const warn = playTo(s, FALL_EARLIEST_DAY + FALL_DELAY_DAYS, "lead")!;
    expect(warn.title).toMatch(/coming for Padua/);
    expect(warn.body).toMatch(/Station Milan/);
    expect(warn.body).toMatch(/come home/);
    dismissEvent(s);
    // An hour before the strike, a team of two leaves Padua for Milan: four stay home.
    expect(s.time).toBeLessThan(s.story.fallAt - 6 * 3_600_000);
    playTo(s, (s.story.fallAt - s.startTime) / DAY - 1 / 24);
    const pos = { lat: 45.46, lon: 9.19 };
    s.operations.push({ id: "op-t", bloodline: "carcassonne", kind: "feeding", regionId: "italy", pos, city: "Milan", startedAt: s.time, endsAt: s.time + 9 * DAY, leadId: "lead-t" });
    s.leads.push({ id: "lead-t", opId: "op-t", kind: "source", regionId: "italy", pos, city: "Milan", appearedAt: s.time, expiresAt: s.time + 4 * DAY, intel: 0.7, title: "Test, Milan", text: "", missionId: null });
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const team = s.agents.slice(0, 2).map((a) => a.id);
    expect(dispatch(s, { target: { kind: "lead", id: "lead-t" }, baseId: "ob-padua", aircraftId: heli.id, agentIds: team, kit: "plainclothes" })).toBeNull();
    const agents = s.agents.length;
    const fall = playTo(s, FALL_EARLIEST_DAY + FALL_DELAY_DAYS + 2, "story")!;
    expect(fall.title).toMatch(/fallen/);
    expect(fall.body).toMatch(/Milan/);
    expect(fall.body).toMatch(/by the roof/);
    expect(s.story.act).toBe(2);
    expect(s.installations.filter((i) => isEurope(i.regionId))).toHaveLength(0);
    const cell = s.installations.find((i) => i.kind === "base")!;
    expect(cell.name).toMatch(/^Cell /);
    expect(s.installations.some((i) => i.kind === "sigint")).toBe(false); // no SIGINT
    expect(s.aircraft.map((a) => a.id)).toEqual([heli.id]); // only the one in the air
    expect(s.fallen).toHaveLength(0); // those at Padua got out by the roof (the battle isn't built)
    expect(s.agents.filter((a) => !team.includes(a.id))).toHaveLength(agents - 2 + CELL_AGENTS);
    expect(s.agents.every((a) => a.baseId === cell.id)).toBe(true);
    expect(s.gameOver).toBeNull();
    // Hostage rules: a trickle of a stipend, Europe closed.
    expect(stipendShare(s)).toBe(HOSTAGE_STIPEND[0]);
    expect(buildBlocker(s, "sigint", "iberia")).toMatch(/Europe is closed/);
    expect(deserialize(serialize(s)).story.act).toBe(2);
    // The cardinal, on the reserve channel.
    dismissEvent(s);
    expect(s.events[0]!.title).toBe("The reserve channel");
    expect(s.events[0]!.speaker).toBe("cardinal");
    expect(s.events[0]!.body).toMatch(/the war continues/);
    // The team in Milan must get out of Europe: the helicopter can't reach the cell, so overland.
    dismissEvent(s);
    const m = s.missions[0]!;
    expect(m.stranded).toBe(true);
    let out;
    for (let i = 0; i < 40 && !out; i++) {
      const e = s.events[0];
      if (e?.kind === "arrival") decide(s, m.id, m.decision!.options[0]!.id);
      else if (e?.kind === "story" && e.title.startsWith("Out of Europe")) out = e;
      else if (e) dismissEvent(s);
      else advance(s, 6 * 3_600_000);
    }
    expect(out!.title).toMatch(/Out of Europe/);
    expect(m.overland).toBe(true);
    s.events = [];
    playTo(s, FALL_DAY + 40);
    expect(s.missions).toHaveLength(0);
    expect(s.aircraft).toHaveLength(0); // left behind
    expect(s.agents.filter((a) => team.includes(a.id)).every((a) => a.baseId === cell.id)).toBe(true);
  });

  it("without SIGINT on Italy or France there is no warning; without the intel the report comes by FALL_DAY anyway", () => {
    const s = quiet();
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    expect(fallListening(s)).toBe(0);
    let warned = false, report = 0;
    const end = s.startTime + (FALL_DAY + FALL_DELAY_DAYS + 1) * DAY;
    while (s.time < end) {
      if (s.events[0]?.title.startsWith("Serpenta traffic")) warned = true;
      if (s.events[0]?.title === "Someone on the inside") report = s.time;
      if (s.events.length) dismissEvent(s);
      else advance(s, end - s.time);
    }
    expect(warned).toBe(false);
    expect(report).toBe(s.startTime + FALL_DAY * DAY);
    expect(s.story.act).toBe(2);
    expect(s.agents).toHaveLength(4 + CELL_AGENTS); // all four out by the roof, and the cell's rookies
  });

  it("waits while fewer than three operators are home, and strikes the hour they are", () => {
    const s = quiet();
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    s.agents[0]!.deployed = s.agents[1]!.deployed = true; // two of the four out
    playTo(s, FALL_DAY + FALL_DELAY_DAYS + 3);
    expect(s.story.act).toBe(1);
    s.agents[0]!.deployed = false;
    playTo(s, (s.time + 3_600_000 - s.startTime) / DAY); // an hour, events dismissed
    expect(s.story.act).toBe(2);
    // And after the deadline it strikes whoever is there.
    const t = quiet(2);
    t.installations = t.installations.filter((i) => i.kind !== "sigint");
    for (const a of t.agents) a.deployed = true;
    playTo(t, FALL_DAY + FALL_DELAY_DAYS + FALL_DEADLINE_DAYS + 1);
    expect(t.story.act).toBe(2);
  });

  it("keeps a base outside Europe and the team in the field", () => {
    const s = quiet(2);
    s.installations.push({ id: "ob-x", kind: "base", name: "Base Cairo", regionId: "nile", pos: { lat: 30, lon: 31 }, readyAt: s.time, evictionWarned: false });
    const out = s.agents[0]!;
    out.deployed = true;
    theFall(s);
    expect(s.installations.filter((i) => i.kind === "base").map((i) => i.id)).toEqual(["ob-x"]);
    expect(s.agents.find((a) => a.id === out.id)?.baseId).toBe("ob-x");
  });

  it("secrecy 0 while hostage: Agnes exposes the Order and the stipend stops", () => {
    const s = quiet();
    theFall(s);
    s.events = [];
    changeSecrecy(s, -200, "test");
    expect(s.openWar).toBe(true);
    expect(s.story.exposed).toBe(true);
    expect(s.events[0]!.title).toMatch(/Agnes exposes/);
    expect(monthlyIncome(s).stipend).toBe(0);
  });

  it("three lesser sigils reopen Europe; Agnes's death wins", () => {
    const s = quiet();
    theFall(s);
    s.events = [];
    destroyBloodline(s, "jade");
    destroyBloodline(s, "sahel");
    expect(stipendShare(s)).toBe(HOSTAGE_STIPEND[2]);
    s.events = [];
    advance(s, DAY);
    expect(s.story.act).toBe(2);
    destroyBloodline(s, "huaca");
    s.events = [];
    advance(s, DAY);
    expect(s.story.act).toBe(3);
    expect(s.events[0]!.title).toBe("Europe reopens");
    expect(stipendShare(s)).toBe(RETURN_STIPEND);
    expect(buildBlocker(s, "sigint", "iberia") ?? "").not.toMatch(/Europe is closed/);
    s.events = [];
    destroyBloodline(s, "carcassonne");
    s.events = [];
    advance(s, DAY);
    expect(s.story.won).toBe(true);
    expect(s.gameOver).toMatch(/Montségur/);
  });

  it("Act I nudges: volunteers abroad, a Boston den Padua can't reach, Agnes out of reach, and the Prefect's question", () => {
    const s = quiet();
    s.story.fallAt = 8.64e15; s.story.insider = s.story.fallWarned = true;
    const seen: string[] = [];
    let boston: string | undefined;
    const end = s.startTime + 40 * DAY;
    while (s.time < end) {
      const e = s.events[0];
      if (e) {
        seen.push(`${e.kind}:${e.title}`);
        if (e.title.startsWith("A den of House Ashgrove")) boston = e.body;
        dismissEvent(s);
      } else advance(s, end - s.time);
    }
    const order = ["OPV's Standing Orders", "Sao Paulo", "Boston", "A den of House Ashgrove", "Nobody came to Boston", "The name Agnes", "Where would we go?"];
    let at = -1;
    for (const o of order) {
      const i = seen.findIndex((x, k) => k > at && x.includes(o));
      expect(i, o).toBeGreaterThan(at);
      at = i;
    }
    expect(boston).toMatch(/none on that side of the ocean/);
    expect(s.leads.every((l) => l.via !== "volunteer" || l.kind === "source" || l.kind === "double")).toBe(true);
  });

  it("the Prefect doesn't ask where we'd go when we already have a base abroad", () => {
    const s = quiet();
    s.story.fallAt = 8.64e15; s.story.insider = s.story.fallWarned = true;
    s.installations.push({ id: "ob-x", kind: "base", name: "Base Boston", regionId: "us_northeast", pos: { lat: 42.36, lon: -71.06 }, readyAt: s.time, evictionWarned: false });
    const seen: string[] = [];
    let boston = "";
    const end = s.startTime + 40 * DAY;
    while (s.time < end) {
      const e = s.events[0];
      if (e) {
        seen.push(e.title);
        if (e.title.startsWith("A den of House Ashgrove")) boston = e.body;
        dismissEvent(s);
      } else advance(s, end - s.time);
    }
    expect(seen).not.toContain("Where would we go?");
    expect(boston).toMatch(/close enough/);
  });
});

describe("the cardinal and the elders", () => {
  it("sends every lead with a word of his own, and dispatches from Europe through Act II", () => {
    const s = quiet();
    s.story.beats = ["briefing", "sao-paulo", "boston-volunteer", "boston-nest", "agnes", "where-would-we-go"];
    const op = { id: "op-x", bloodline: "ashgrove", kind: "recruitment" as const, regionId: "us_northeast", pos: { lat: 42.36, lon: -71.06 }, city: "Boston", startedAt: s.time, endsAt: s.time + 5 * DAY, leadId: null };
    s.operations.push(op);
    s.events = [];
    surfaceLead(s, op, "sigint");
    expect(s.events[0]!.speaker).toBe("cardinal");
    expect(OPENERS.open.sigint.some((o) => s.events[0]!.body.startsWith(o))).toBe(true);
    theFall(s);
    s.events = [];
    s.nextOperation = Object.fromEntries(Object.keys(s.nextOperation).map((b) => [b, 1e15]));
    const seen: string[] = [];
    const end = s.time + 120 * DAY;
    while (s.time < end && !s.gameOver) {
      const e = s.events[0];
      if (e) {
        if (e.kind === "story" && e.speaker === "cardinal") seen.push(e.title);
        dismissEvent(s);
      } else advance(s, end - s.time);
    }
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen[0]).toBe(DISPATCHES[0]!.title);
    expect(deserialize(serialize(s)).story.dispatches).toBe(s.story.dispatches);
  });

  it("lets each elder speak when their lair is found and when they die", () => {
    const s = quiet();
    s.intel.huaca = 100;
    s.events = [];
    advance(s, DAY);
    const found = s.events.find((e) => e.kind === "site")!;
    expect(found.speaker).toBe("huaca");
    expect(found.body).toMatch(/Inés Quispe Sisa/);
    s.events = [];
    destroyBloodline(s, "huaca");
    expect(s.events[0]!.speaker).toBe("huaca");
    expect(s.events[0]!.body).toMatch(/is ash/);
  });
});

