import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { buildBlocker } from "./commands";
import { destroyBloodline } from "./bloodlines";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { monthlyIncome } from "./economy";
import { changeSecrecy } from "./secrecy";
import { FALL_DAY, FALL_WARNING_DAYS, HOSTAGE_STIPEND, isEurope, RETURN_STIPEND, stipendShare, theFall } from "./story";
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
  it("telegraphs the fall a week ahead, then Padua falls and a church cell takes the survivors", () => {
    const s = quiet();
    const warn = playTo(s, FALL_DAY, "story")!;
    expect(warn.title).toMatch(/stirs/);
    expect(s.time).toBeGreaterThanOrEqual(s.startTime + (FALL_DAY - FALL_WARNING_DAYS) * DAY);
    expect(s.story.act).toBe(1);
    const agents = s.agents.length;
    dismissEvent(s);
    const fall = playTo(s, FALL_DAY + 1, "story")!;
    expect(fall.title).toMatch(/fallen/);
    expect(s.story.act).toBe(2);
    expect(s.installations.some((i) => i.id === "ob-padua")).toBe(false);
    expect(s.installations.filter((i) => isEurope(i.regionId))).toHaveLength(0); // Europe's station went dark too
    const cell = s.installations.find((i) => i.kind === "base")!;
    expect(cell.name).toMatch(/^Cell /);
    expect(s.installations.some((i) => i.kind === "sigint" && i.regionId === cell.regionId)).toBe(true); // with a listening post
    expect(s.aircraft.every((a) => a.baseId === cell.id)).toBe(true);
    expect(s.agents.every((a) => a.baseId === cell.id)).toBe(true);
    expect(s.agents.length + s.fallen.length).toBe(agents + 2); // two rookies wait at the cell
    expect(s.gameOver).toBeNull();
    // Hostage rules: a trickle of a stipend, Europe closed.
    expect(stipendShare(s)).toBe(HOSTAGE_STIPEND[0]);
    expect(buildBlocker(s, "sigint", "iberia")).toMatch(/Europe is closed/);
    // It survives a save.
    expect(deserialize(serialize(s)).story.act).toBe(2);
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
