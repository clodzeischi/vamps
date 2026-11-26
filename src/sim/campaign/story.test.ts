import { openCase } from "../intel/intel";
import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../../save/format";
import { buildBlocker } from "../core/commands";
import { destroyBloodline } from "./bloodlines";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "../core/clock";
import { decide, dispatch } from "../missions/missions";
import { monthlyIncome } from "../economy/economy";
import { changeSecrecy } from "./secrecy";
import { OPENERS, surfaceLead } from "../intel/operations";
import {
  agnesProvoked,
  CELL_AGENTS,
  DISPATCHES,
  FALL_DAYS,
  FALL_DEADLINE_DAYS,
  fallDay,
  HOSTAGE_STIPEND,
  isEurope,
  RETURN_STIPEND,
  stipendShare,
  theFall,
} from "./story";
import { DAY } from "../core/time";
import type { GameState } from "../core/state";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(
    ["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]),
  );
  s.coverUps = [];
  return s;
};

/** Plays on, dismissing everything, until `day` or an event of `kind`. */
function playTo(s: GameState, day: number, kind?: string) {
  const end = s.startTime + day * DAY;
  while (s.time < end && !s.gameOver) {
    if (kind && s.events[0]?.kind === kind) return s.events[0];
    if (s.events.length) {
      dismissEvent(s);
      continue;
    }
    advance(s, end - s.time);
  }
  return kind && s.events[0]?.kind === kind ? s.events[0] : undefined;
}

describe("the story", () => {
  it("a raid on one of Agnes's dens brings the fall at once, struck while the team is home; a bare church cell takes everyone", () => {
    const s = quiet();
    s.story.beats = [
      "briefing",
      "sao-paulo",
      "boston-volunteer",
      "boston-nest",
      "agnes",
      "where-would-we-go",
    ]; // tested below
    // Six at Padua, so four stay home while two are out.
    s.agents.push(
      ...s.agents.slice(0, 2).map((a, i) => ({ ...a, id: `agent-x${i}`, name: `Extra ${i}` })),
    );
    s.events = []; // the opening briefing
    playTo(s, 10);
    expect(s.story.act).toBe(1);
    const pos = { lat: 45.46, lon: 9.19 };
    s.operations.push({
      id: "op-t",
      bloodline: "carcassonne",
      kind: "feeding",
      regionId: "italy",
      pos,
      city: "Milan",
      startedAt: s.time,
      endsAt: s.time + 9 * DAY,
      leadId: "lead-t",
    });
    s.leads.push({
      id: "lead-t",
      opId: "op-t",
      kind: "source",
      regionId: "italy",
      pos,
      city: "Milan",
      appearedAt: s.time,
      expiresAt: s.time + 4 * DAY,
      intel: 0.7,
      title: "Test, Milan",
      text: "",
      missionId: null,
      caseId: openCase(s, true, 0.75).id,
      via: "sigint",
    });
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const team = s.agents.slice(0, 2).map((a) => a.id);
    expect(
      dispatch(s, {
        target: { kind: "lead", id: "lead-t" },
        baseId: "ob-padua",
        aircraftId: heli.id,
        agentIds: team,
        kit: "plainclothes",
      }),
    ).toBeNull();
    const agents = s.agents.length;
    agnesProvoked(s, "huaca"); // only her own dens count
    expect(s.story.fallAt).toBeGreaterThan(s.startTime + 30 * DAY);
    agnesProvoked(s, "carcassonne"); // the raid on her den (sim/intel/networks.ts afterStrike)
    expect(s.story.fallAt).toBe(s.time);
    const fall = playTo(s, 12, "story")!;
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
    playTo(s, 60);
    expect(s.missions).toHaveLength(0);
    expect(s.aircraft).toHaveLength(0); // left behind
    expect(s.agents.filter((a) => team.includes(a.id)).every((a) => a.baseId === cell.id)).toBe(
      true,
    );
  });

  it("with no den of hers raided, Agnes comes on a random day 40 to 50, set by the seed", () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8].map(fallDay);
    for (const d of days) expect(d >= FALL_DAYS[0] && d <= FALL_DAYS[1]).toBe(true);
    expect(new Set(days.map(Math.floor)).size).toBeGreaterThan(2);
    const s = quiet();
    expect(s.story.fallAt).toBe(s.startTime + fallDay(1) * DAY);
    playTo(s, (s.story.fallAt - s.startTime) / DAY - 1);
    expect(s.story.act).toBe(1);
    playTo(s, FALL_DAYS[1] + 1);
    expect(s.story.act).toBe(2);
    expect(s.story.fellAt! - s.story.fallAt).toBeLessThanOrEqual(3_600_000); // the team was home
    expect(s.agents).toHaveLength(4 + CELL_AGENTS); // all four out by the roof, and the cell's rookies
  });

  it("waits while fewer than three operators are home, and strikes the hour they are", () => {
    const s = quiet();
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    s.agents[0]!.arriveAt = s.agents[1]!.arriveAt = 9e15; // two of the four out
    playTo(s, FALL_DAYS[1] + 3);
    expect(s.story.act).toBe(1);
    delete s.agents[0]!.arriveAt;
    playTo(s, (s.time + 3_600_000 - s.startTime) / DAY); // an hour, events dismissed
    expect(s.story.act).toBe(2);
    // And after the deadline it strikes whoever is there.
    const t = quiet(2);
    t.installations = t.installations.filter((i) => i.kind !== "sigint");
    for (const a of t.agents) a.arriveAt = 9e15;
    playTo(t, FALL_DAYS[1] + FALL_DEADLINE_DAYS + 1);
    expect(t.story.act).toBe(2);
  });

  it("keeps a base outside Europe and the team in the field", () => {
    const s = quiet(2);
    s.installations.push({
      id: "ob-x",
      kind: "base",
      name: "Base Cairo",
      regionId: "nile",
      pos: { lat: 30, lon: 31 },
      readyAt: s.time,
      evictionWarned: false,
    });
    const out = s.agents[0]!;
    out.arriveAt = 9e15; // away
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
    s.story.fallAt = 8.64e15;
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
    const order = [
      "OPV's Standing Orders",
      "Sao Paulo",
      "Boston",
      "A den of House Ashgrove",
      "Nobody came to Boston",
      "The name Agnes",
      "Where would we go?",
    ];
    let at = -1;
    for (const o of order) {
      const i = seen.findIndex((x, k) => k > at && x.includes(o));
      expect(i, o).toBeGreaterThan(at);
      at = i;
    }
    expect(boston).toMatch(/none on that side of the ocean/);
    expect(
      s.leads.every((l) => l.via !== "volunteer" || l.kind === "source" || l.kind === "double"),
    ).toBe(true);
  });

  it("the Prefect doesn't ask where we'd go when we already have a base abroad", () => {
    const s = quiet();
    s.story.fallAt = 8.64e15;
    s.installations.push({
      id: "ob-x",
      kind: "base",
      name: "Base Boston",
      regionId: "us_northeast",
      pos: { lat: 42.36, lon: -71.06 },
      readyAt: s.time,
      evictionWarned: false,
    });
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
    s.story.beats = [
      "briefing",
      "sao-paulo",
      "boston-volunteer",
      "boston-nest",
      "agnes",
      "where-would-we-go",
    ];
    const op = {
      id: "op-x",
      bloodline: "ashgrove",
      kind: "recruitment" as const,
      regionId: "us_northeast",
      pos: { lat: 42.36, lon: -71.06 },
      city: "Boston",
      startedAt: s.time,
      endsAt: s.time + 5 * DAY,
      leadId: null,
    };
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
    for (const d of s.networks.huaca!.sites.filter((x) => x.kind === "den").slice(0, 2))
      d.raided = true; // two dens burned
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
