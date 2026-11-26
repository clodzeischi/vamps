import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../../save/format";
import { BLOODLINES } from "../../data/bloodlines";
import { newCampaign } from "../campaign/campaign";
import { advance, dismissEvent } from "../core/clock";
import {
  addClues, afterStrike, assaultBase, CLUES_PER_DEN, DENS, densFound, knowledgeOf, NESTS_PER_DEN, newNetworks, revealFromLead, revealSite, runner,
} from "./networks";
import { rng } from "../core/rng";
import type { GameState } from "../core/state";
import { DAY } from "../core/time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(BLOODLINES.map((b) => [b.id, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15; // Padua stands
  s.events = [];
  return s;
};
const net = (s: GameState, id: string) => s.networks[id]!;
const kind = (s: GameState, id: string, k: string) => net(s, id).sites.filter((x) => x.kind === k);

describe("the houses' networks", () => {
  it("each house is a lair, three dens and 2-4 nests under each, all in its homelands, the same for the same seed", () => {
    const s = quiet();
    for (const b of BLOODLINES) {
      const n = net(s, b.id);
      expect(kind(s, b.id, "lair")).toHaveLength(1);
      expect(kind(s, b.id, "den")).toHaveLength(DENS);
      for (const d of kind(s, b.id, "den")) {
        const nests = n.sites.filter((x) => x.parentId === d.id);
        expect(nests.length).toBeGreaterThanOrEqual(NESTS_PER_DEN[0]);
        expect(nests.length).toBeLessThanOrEqual(NESTS_PER_DEN[1]);
      }
      for (const x of n.sites) expect(b.homeRegions).toContain(x.regionId);
      expect(n.sites.every((x) => !x.known && !x.raided)).toBe(true);
    }
    expect(kind(s, "carcassonne", "lair")[0]!.city).toBe("Montségur");
    expect(JSON.stringify(newNetworks(1))).toBe(JSON.stringify(s.networks));
    expect(JSON.stringify(newNetworks(2))).not.toBe(JSON.stringify(s.networks));
  });

  it("operations are run from the house's sites, and a lead that leads somewhere shows the nest behind it", () => {
    const s = newCampaign("inquisitor", 4);
    s.story.fallAt = 8.64e15;
    const end = s.time + 20 * DAY;
    while (s.time < end) {
      if (s.events.length) { dismissEvent(s); continue; }
      advance(s, end - s.time);
    }
    const run = s.operations.filter((o) => o.siteId); // the story's scripted ones have no site of their own
    expect(run.length).toBeGreaterThan(3);
    for (const op of run) {
      const site = net(s, op.bloodline).sites.find((x) => x.id === op.siteId)!;
      expect(site.kind).not.toBe("lair");
      expect(BLOODLINES.find((b) => b.id === op.bloodline)!.homeRegions).toContain(op.regionId); // near its site, always in the homelands
    }
    const op = run.find((o) => net(s, o.bloodline).sites.find((x) => x.id === o.siteId)!.kind === "nest")!;
    const ns = net(s, op.bloodline).sites.find((x) => x.id === op.siteId)!;
    const found = revealFromLead(s, op.bloodline, op.siteId, op);
    expect(found.site!.netId).toBe(ns.id);
    expect(found.site!.city).toBe(ns.city);
    expect(ns.known).toBe(true);
    expect(revealFromLead(s, op.bloodline, op.siteId, op).text).toMatch(/already know/);
  });

  it("climbs: a burned nest is a den clue, two clues find a den, two dens burned find the lair", () => {
    const s = quiet();
    const nests = kind(s, "huaca", "nest");
    const first = revealSite(s, nests[0]!, "huaca");
    expect(afterStrike(s, first, "success")).toEqual([`Den clue on the Huaca (1 of ${CLUES_PER_DEN})`]);
    expect(nests[0]!.raided).toBe(true);
    expect(knowledgeOf(s, "huaca")).toBe(20);
    expect(s.events).toHaveLength(0);
    addClues(s, "huaca", 1); // a snatch
    expect(densFound(net(s, "huaca"))).toBe(1);
    const denEvent = s.events.find((e) => e.kind === "site")!;
    expect(denEvent.title).toMatch(/A den of the Huaca Line/);
    // The den the clues point to is the one over the nest we burned.
    const den = net(s, "huaca").sites.find((x) => x.kind === "den" && x.known)!;
    expect(den.id).toBe(nests[0]!.parentId);
    const denSite = s.sites.find((x) => x.netId === den.id)!;
    expect(denSite.expiresAt).toBeGreaterThan(s.time + 1000 * DAY); // a den stays until it is hit
    afterStrike(s, denSite, "success");
    expect(s.bloodlines.huaca!.lairId).toBeNull();
    const other = kind(s, "huaca", "den").find((x) => !x.raided)!;
    afterStrike(s, revealSite(s, other, "huaca"), "success");
    expect(s.bloodlines.huaca!.lairId).toBe("lair-huaca");
    expect(s.events.at(-1)!.title).toMatch(/The lair of The Huaca Line/);
    expect(knowledgeOf(s, "huaca")).toBe(100);
  });

  it("a failed raid moves the site: a nest is lost from sight, a den costs a clue; a lair holds", () => {
    const s = quiet();
    const nest = kind(s, "jade", "nest")[0]!;
    afterStrike(s, revealSite(s, nest, "jade"), "fail");
    expect(nest.known).toBe(false);
    expect(nest.raided).toBe(false);
    addClues(s, "jade", CLUES_PER_DEN);
    const den = kind(s, "jade", "den").find((x) => x.known)!;
    const was = den.city + den.pos.lat;
    expect(afterStrike(s, s.sites.find((x) => x.netId === den.id)!, "fail")).toEqual(["The den has moved: one den clue lost"]);
    expect(den.known).toBe(false);
    expect(den.city + den.pos.lat).not.toBe(was);
    expect(net(s, "jade").clues).toBe(CLUES_PER_DEN - 1);
    addClues(s, "jade", 1);
    expect(densFound(net(s, "jade"))).toBe(1); // found again, wherever it went
  });

  it("raiding one of Agnes's dens in Act I, won or lost, brings her down on Padua", () => {
    for (const result of ["success", "fail"] as const) {
      const s = quiet();
      const den = kind(s, "carcassonne", "den")[0]!;
      afterStrike(s, revealSite(s, den, "carcassonne"), result);
      expect(s.story.fallAt).toBe(s.time);
    }
    const s = quiet();
    afterStrike(s, revealSite(s, kind(s, "carcassonne", "nest")[0]!, "carcassonne"), "success");
    expect(s.story.fallAt).toBe(8.64e15); // a nest doesn't
  });

  it("a house with its lair found assaults a base in reach: held, it regroups; lost, the base is lost and its people get out", () => {
    // Held: a strong team at home.
    const s = quiet();
    for (const a of s.agents) Object.assign(a.aptitudes, { combat: 95, faith: 95, vitality: 120 }), (a.hp = 120);
    s.agents.push(...["b", "c"].flatMap((t) => s.agents.map((a) => ({ ...a, id: a.id + t, stats: { ...a.aptitudes } }))));
    const padua = s.installations.find((i) => i.id === "ob-padua")!;
    assaultBase(s, "carcassonne", padua);
    expect(s.events.at(-1)!.title).toBe("Base Padua held");
    expect(s.installations).toContain(padua);
    expect(net(s, "carcassonne").nextAssaultAt).toBeGreaterThan(s.time);
    // Lost: nobody home, and a second base to fall back on.
    const t = quiet();
    t.installations.push({ id: "ob-x", kind: "base", name: "Base Boston", regionId: "us_northeast", pos: { lat: 42.36, lon: -71.06 }, readyAt: t.time, evictionWarned: false });
    for (const a of t.agents) a.arriveAt = 9e15; // all away
    const ids = t.agents.map((a) => a.id);
    assaultBase(t, "carcassonne", t.installations.find((i) => i.id === "ob-padua")!);
    expect(t.events.at(-1)!.title).toBe("Base Padua has fallen");
    expect(t.installations.some((i) => i.id === "ob-padua")).toBe(false);
    expect(t.agents.map((a) => a.id)).toEqual(ids);
    expect(t.agents.every((a) => a.baseId === "ob-x")).toBe(true);
    expect(t.aircraft.some((a) => a.baseId === "ob-padua")).toBe(false);
  });

  it("strikes only once the lair is found, and not in the days right after", () => {
    const s = quiet();
    s.story.act = 3; // Agnes's lair may be found
    const end = s.time + 40 * DAY;
    while (s.time < end) { if (s.events.length) { dismissEvent(s); continue; } advance(s, end - s.time); }
    expect(s.installations.some((i) => i.id === "ob-padua")).toBe(true); // no lair, no assault
    for (const d of kind(s, "carcassonne", "den").slice(0, 2)) d.raided = true;
    advance(s, DAY);
    expect(s.bloodlines.carcassonne!.lairId).not.toBeNull();
    expect(net(s, "carcassonne").nextAssaultAt).toBeGreaterThan(s.time + 3 * DAY);
  });

  it("the nest a source points to is in their region when one is there; a runner is never a burned site", () => {
    const s = quiet();
    const r = rng(s);
    for (const x of kind(s, "sahel", "nest")) x.raided = true;
    for (let i = 0; i < 20; i++) expect(runner(s, "sahel", r)!.kind).toBe("den");
    for (const x of kind(s, "sahel", "den")) x.raided = true;
    expect(runner(s, "sahel", r)!.kind).toBe("lair");
  });

  it("survive a save and load", () => {
    const s = quiet();
    afterStrike(s, revealSite(s, kind(s, "huaca", "nest")[0]!, "huaca"), "success");
    const back = deserialize(serialize(s));
    expect(back.networks.huaca!.clues).toBe(1);
    expect(back.networks.huaca!.sites.filter((x) => x.raided)).toHaveLength(1);
  });
});
