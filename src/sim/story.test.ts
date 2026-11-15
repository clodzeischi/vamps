import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { buildBlocker } from "./commands";
import { destroyBloodline } from "./bloodlines";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { decide, dispatch } from "./missions";
import { monthlyIncome } from "./economy";
import { changeSecrecy } from "./secrecy";
import { CELL_AGENTS, FALL_DAY, FALL_DEADLINE_DAYS, HOSTAGE_STIPEND, isEurope, RETURN_STIPEND, stipendShare, theFall } from "./story";
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
  it("telegraphs the fall, then strikes Padua the moment a team leaves; a bare church cell takes the survivors", () => {
    const s = quiet();
    const warn = playTo(s, FALL_DAY, "story")!;
    expect(warn.title).toMatch(/stirs/);
    dismissEvent(s);
    playTo(s, FALL_DAY + 2);
    expect(s.story.act).toBe(1); // they wait for us to leave
    // A team of two leaves Padua for Milan.
    const pos = { lat: 45.46, lon: 9.19 };
    s.operations.push({ id: "op-t", bloodline: "carcassonne", kind: "feeding", regionId: "italy", pos, city: "Milan", startedAt: s.time, endsAt: s.time + 9 * DAY, leadId: "lead-t" });
    s.leads.push({ id: "lead-t", opId: "op-t", kind: "source", regionId: "italy", pos, city: "Milan", appearedAt: s.time, expiresAt: s.time + 4 * DAY, intel: 0.7, title: "Test, Milan", text: "", missionId: null });
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const team = s.agents.slice(0, 2).map((a) => a.id);
    expect(dispatch(s, { target: { kind: "lead", id: "lead-t" }, baseId: "ob-padua", aircraftId: heli.id, agentIds: team, kit: "plainclothes" })).toBeNull();
    const agents = s.agents.length;
    const fall = playTo(s, FALL_DAY + 3, "story")!;
    expect(fall.title).toMatch(/fallen/);
    expect(fall.body).toMatch(/Milan/);
    expect(s.story.act).toBe(2);
    expect(s.installations.filter((i) => isEurope(i.regionId))).toHaveLength(0);
    const cell = s.installations.find((i) => i.kind === "base")!;
    expect(cell.name).toMatch(/^Cell /);
    expect(s.installations.some((i) => i.kind === "sigint")).toBe(false); // no SIGINT
    expect(s.aircraft.map((a) => a.id)).toEqual([heli.id]); // only the one in the air
    expect(s.fallen).toHaveLength(agents - 2); // nobody at Padua got out
    expect(s.agents.filter((a) => !team.includes(a.id))).toHaveLength(CELL_AGENTS);
    expect(s.agents.every((a) => a.baseId === cell.id)).toBe(true);
    expect(s.gameOver).toBeNull();
    // Hostage rules: a trickle of a stipend, Europe closed.
    expect(stipendShare(s)).toBe(HOSTAGE_STIPEND[0]);
    expect(buildBlocker(s, "sigint", "iberia")).toMatch(/Europe is closed/);
    expect(deserialize(serialize(s)).story.act).toBe(2);
    // The team in Milan must get out of Europe: the helicopter can't reach the cell, so overland.
    dismissEvent(s);
    const m = s.missions[0]!;
    expect(m.stranded).toBe(true);
    let out;
    for (let i = 0; i < 40 && !out; i++) {
      const e = s.events[0];
      if (e?.kind === "arrival") decide(s, m.id, m.decision!.options[0]!.id);
      else if (e?.kind === "story") out = e;
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

  it("strikes anyway if no team ever leaves", () => {
    const s = quiet();
    playTo(s, FALL_DAY + FALL_DEADLINE_DAYS + 1);
    expect(s.story.act).toBe(2);
    expect(s.agents).toHaveLength(CELL_AGENTS);
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
});
