import { openCase } from "./intel";
import { setRooms } from "../base/building";
import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../../save/format";
import { newCampaign } from "../campaign/campaign";
import { advance, dismissEvent } from "../core/clock";
import { detectionChance, sigintRates } from "../core/commands";
import { monthlyIncome } from "../economy/economy";
import {
  accessBlocker,
  ASSET_KINDS,
  assetFee,
  dailyHumint,
  humintRates,
  INFORMANT_RATE,
  recruitAsset,
  turnBlocker,
  turnThrall,
  type AssetKind,
} from "./humint";
import { abortCoverUp, hourlyCoverUps, startCoverUp } from "../campaign/coverups";
import { holdCaptive } from "../base/research";
import { decide } from "../missions/arrival";
import { dispatch, dispatchBlocker, type DispatchPlan } from "../missions/dispatch";
import { theFall } from "../campaign/story";
import { surfaceLead } from "./operations";
import type { GameState, LeadKind, Agent } from "../core/state";
import { DAY } from "../core/time";

const MILAN = { lat: 45.46, lon: 9.19 };
const QUIET = Object.fromEntries(
  ["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]),
);

/** A quiet campaign with one source lead near Padua, which could become an asset of `asset`. */
function withSource(kind: LeadKind = "source", asset: AssetKind = "informant", seed = 1) {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = { ...QUIET };
  s.story.fallAt = 8.64e15;
  s.coverUps = [];
  s.operations.push({
    id: "op-t",
    bloodline: "carcassonne",
    kind: "recruitment",
    regionId: "italy",
    pos: MILAN,
    city: "Milan",
    startedAt: s.time,
    endsAt: s.time + 9 * DAY,
    leadId: "lead-t",
  });
  s.leads.push({
    id: "lead-t",
    opId: "op-t",
    kind,
    regionId: "italy",
    pos: MILAN,
    city: "Milan",
    appearedAt: s.time,
    expiresAt: s.time + 4 * DAY,
    intel: 0.7,
    title: "Test, Milan",
    text: "",
    missionId: null,
    via: "volunteer",
    caseId: openCase(s, true, 0.6).id,
    who: ASSET_KINDS[asset].roles[0],
    asset,
  });
  return s;
}

const plan = (s: GameState, n: number, kit: DispatchPlan["kit"]): DispatchPlan => ({
  target: { kind: "lead", id: "lead-t" },
  baseId: "ob-padua",
  aircraftId: s.aircraft.find((a) => a.kind === "helicopter")!.id,
  agentIds: s.agents.slice(0, n).map((a) => a.id),
  kit,
});

/** Flies the team out and gives the order on arrival; returns the debrief. */
function meet(s: GameState, n: number, kit: DispatchPlan["kit"], order: string) {
  expect(dispatch(s, plan(s, n, kit))).toBeNull();
  for (let i = 0; i < 200; i++) {
    const e = s.events[0];
    if (e?.kind === "arrival") decide(s, e.refId!, order);
    else if (e?.kind === "debrief") return e;
    else if (e) dismissEvent(s);
    else advance(s, DAY);
  }
  throw new Error("no debrief");
}

describe("HUMINT", () => {
  it("volunteers come forward where no station listens, and they are sources", () => {
    const s = newCampaign("inquisitor", 3);
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    s.story.fallAt = 8.64e15;
    const seen: string[] = [];
    const end = s.time + 120 * DAY;
    while (s.time < end) {
      const e = s.events[0];
      if (e?.kind === "lead" && e.heading === "A volunteer") seen.push(e.refId!);
      if (s.events.length) dismissEvent(s);
      else advance(s, end - s.time);
    }
    expect(seen.length).toBeGreaterThan(2);
    for (const l of s.leads.filter((x) => x.via === "volunteer")) {
      expect(["source", "double"]).toContain(l.kind);
      expect(l.asset).toBeTruthy();
    }
  });

  it("recruits a source as an asset with a fee, paid every month", () => {
    let recruited = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = withSource("source", "access", seed);
      for (const a of s.agents) a.aptitudes.tradecraft = 90;
      meet(s, 2, "plainclothes", "recruit");
      if (!s.assets.length) continue;
      recruited++;
      const a = s.assets[0]!;
      expect(a.kind).toBe("access");
      expect(a.regionId).toBe("italy");
      expect(a.monthly).toBe(assetFee(s, "access", "italy"));
      expect(monthlyIncome(s).humint).toBe(a.monthly);
      expect(deserialize(serialize(s)).assets).toHaveLength(1);
    }
    expect(recruited).toBeGreaterThan(8);
  });

  it("a double takes the unarmed agent; an armed team fights its way out", () => {
    const s = withSource("double");
    const n = s.agents.length;
    const e = meet(s, 2, "civilian", "recruit");
    expect(e.title).toMatch(/Failure/);
    expect(s.agents).toHaveLength(n - 1);
    expect(s.assets).toHaveLength(0);

    const t = withSource("double", "informant", 2);
    for (const a of t.agents) a.aptitudes.combat = 90;
    const n2 = t.agents.length;
    const e2 = meet(t, 4, "plainclothes", "recruit");
    expect(e2.body).toMatch(/came armed/);
    expect(t.agents.length).toBeGreaterThanOrEqual(n2 - 4);
  });

  it("an informant hears like a weaker station, sharing one detection rate", () => {
    const s = newCampaign("inquisitor", 1);
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    recruitAsset(s, "informant", "nurse", "brazil", "São Paulo", { lat: -23.5, lon: -46.6 });
    expect(humintRates(s).get("brazil")).toBe(INFORMANT_RATE);
    expect(humintRates(s).has("andes_south")).toBe(false); // own region only
    expect(sigintRates(s).has("brazil")).toBe(false);
    expect(detectionChance(INFORMANT_RATE)).toBeLessThan(detectionChance(0.5));
  });

  it("access opens hostile regions, and Europe while the Vatican is hostage", () => {
    const s = withSource();
    s.regions.brazil!.support = -4;
    expect(accessBlocker(s, "brazil")).toMatch(/hostile/);
    recruitAsset(s, "access", "customs officer", "brazil", "Santos", { lat: -23.9, lon: -46.3 });
    expect(accessBlocker(s, "brazil")).toBeNull();

    theFall(s);
    s.events = [];
    expect(accessBlocker(s, "italy")).toMatch(/Europe is closed/);
    const cell = s.installations.find((i) => i.kind === "base")!;
    s.aircraft.push({ id: "air-j", kind: "jet", name: "SERAPH-9", baseId: cell.id });
    s.agents.push(...[0, 1].map((i) => ({ ...s.agents[0]!, id: `agent-x${i}`, baseId: cell.id })));
    const p: DispatchPlan = {
      target: { kind: "lead", id: "lead-t" },
      baseId: cell.id,
      aircraftId: "air-j",
      agentIds: ["agent-x0"],
      kit: "plainclothes",
    };
    expect(dispatchBlocker(s, p)).toMatch(/Europe is closed/);
    recruitAsset(s, "access", "customs officer", "italy", "Milan", MILAN);
    expect(dispatchBlocker(s, p) ?? "").not.toMatch(/closed/);
  });
});

describe("HUMINT actions", () => {
  const withAsset = (seed = 1) => {
    const s = withSource("source", "informant", seed);
    s.leads = [];
    s.operations = [];
    const a = recruitAsset(s, "informant", "night-shift nurse", "italy", "Milan", MILAN);
    return { s, a };
  };
  /** Days of dailyHumint until an offer of `kind` through the asset appears. */
  const awaitOffer = (s: GameState, kind: "call" | "disinfo") => {
    for (let d = 0; d < 400; d++) {
      s.time += DAY;
      s.coverUps = s.coverUps.filter((x) => x.kind === kind || x.startedAt); // offers of the other kind lapse
      dailyHumint(s);
      const c = s.coverUps.find((x) => x.kind === kind);
      if (c) return c;
    }
    throw new Error(`no ${kind}`);
  };

  it("assets call; a good operator keeps them; a poor one leaves them shaken on a routine job, burned (or the network) on a hard one", () => {
    const setAll = (op: Agent, v: number) => {
      for (const k of ["combat", "tradecraft", "insight", "faith"] as const) op.aptitudes[k] = v;
    };
    let kept = 0,
      burned = 0,
      blown = 0,
      shaken = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { s, a } = withAsset(seed);
      recruitAsset(s, "pr", "editor", "italy", "Rome", { lat: 41.9, lon: 12.5 });
      const c = awaitOffer(s, "call");
      expect([a.id, s.assets[1]!.id]).toContain(c.assetId); // either asset may call
      expect(c.tier).toBeDefined();
      expect(Object.values(c.weights).some((w) => w! > 0)).toBe(true);
      const good = seed % 3 === 0;
      const hard = seed % 3 === 1;
      c.tier = hard ? "hard" : "routine";
      const op = s.agents[0]!;
      setAll(op, good ? 95 : 5);
      expect(startCoverUp(s, c.id, [op.id])).toBeNull();
      s.events = [];
      s.time = c.doneAt;
      hourlyCoverUps(s);
      const left = s.assets.length;
      const title = s.events.find((e) => e.kind === "coverup-result")?.title ?? "";
      if (good) expect(left).toBeGreaterThanOrEqual(1);
      if (!good && !hard) {
        expect(left).toBe(2); // routine: never burned
        if (title.startsWith("Shaken")) shaken++;
      }
      if (hard) {
        if (left === 2) kept++;
        else if (left === 1) burned++;
        else blown++;
      }
    }
    expect(shaken).toBeGreaterThan(10);
    expect(burned + blown).toBeGreaterThan(10);
    expect(blown).toBeGreaterThan(0);
    expect(kept).toBeLessThan(8);
  });

  it("an ignored call sometimes costs the asset; calling one off costs secrecy and no roll", () => {
    let lost = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { s } = withAsset(seed);
      const c = awaitOffer(s, "call");
      s.time = c.expiresAt;
      hourlyCoverUps(s);
      if (!s.assets.length) lost++;
    }
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThan(20);

    const { s } = withAsset(3);
    const c = awaitOffer(s, "call");
    startCoverUp(s, c.id, [s.agents[0]!.id]);
    const before = s.secrecy;
    expect(abortCoverUp(s, c.id)).toBeNull();
    expect(s.secrecy).toBeLessThan(before);
    expect(s.assets).toHaveLength(1);
  });

  it("disinformation: a false trail quiets the bloodline and traps its sites; it survives a save", () => {
    let trapped = false;
    for (let seed = 1; seed <= 20 && !trapped; seed++) {
      const { s } = withAsset(seed);
      s.nextOperation.carcassonne = s.time;
      s.sites.push({
        id: "site-t",
        bloodline: "carcassonne",
        kind: "nest",
        regionId: "italy",
        city: "Milan",
        pos: MILAN,
        revealedAt: s.time,
        expiresAt: s.time + 3 * DAY,
        thralls: 3,
        vampires: 1,
        missionId: null,
        netId: "net-t",
      });
      let c = awaitOffer(s, "disinfo");
      for (let i = 0; i < 50 && c.effect !== "false-trail"; i++) {
        s.coverUps = [];
        c = awaitOffer(s, "disinfo");
      }
      if (c.effect !== "false-trail") continue;
      expect(deserialize(serialize(s)).coverUps.some((x) => x.kind === "disinfo")).toBe(true);
      const op = s.agents[0]!;
      op.aptitudes.tradecraft = 95;
      startCoverUp(s, c.id, [op.id]);
      s.time = c.doneAt;
      hourlyCoverUps(s);
      if (!s.events.some((e) => e.title.startsWith("It worked"))) continue;
      expect(s.nextOperation.carcassonne).toBeGreaterThan(s.time + 9 * DAY);
      expect(s.sites.find((x) => x.id === "site-t")?.trapped).toBe(true);
      trapped = true;
    }
    expect(trapped).toBe(true);
  });

  it("a thrall can be turned into an informant inside its bloodline", () => {
    let turned = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = withSource("source", "informant", seed);
      const base = s.installations.find((i) => i.kind === "base")!;
      setRooms(base, "containment", 1);
      holdCaptive(s, base, "thrall", "huaca", "Lima", "andean_north");
      const id = base.captives![0]!.id;
      for (const a of s.agents) a.aptitudes.tradecraft = 90;
      expect(turnBlocker(s, id)).toBeNull();
      expect(turnThrall(s, id)).toBeNull();
      expect(base.captives).toHaveLength(0);
      const a = s.assets[0];
      if (!a) continue;
      turned++;
      expect(a.kind).toBe("informant");
      expect(a.regionId).toBe("andean_north");
      expect(a.bloodline).toBe("huaca");
      const clues = s.networks.huaca!.clues;
      for (let d = 0; d < 300; d++) dailyHumint(s);
      expect(s.networks.huaca!.clues).toBeGreaterThan(clues + 2); // now and then, a den clue
    }
    expect(turned).toBeGreaterThan(6);
  });

  it("spotting a double is Insight", () => {
    let walked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = withSource("double", "informant", seed);
      for (const a of s.agents) {
        a.aptitudes.insight = 95;
        a.aptitudes.tradecraft = 5;
      }
      const n = s.agents.length;
      const e = meet(s, 2, "civilian", "watch");
      if (/walked away/.test(e.body)) {
        walked++;
        expect(s.agents).toHaveLength(n);
      }
    }
    expect(walked).toBeGreaterThan(10);
  });
});

describe("who's who stays consistent", () => {
  it("a source lead's story, its stated role and the asset it becomes agree", () => {
    const s = newCampaign("inquisitor", 11);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const via = (["sigint", "humint", "volunteer"] as const)[i % 3]!;
      const op = {
        id: `op-c${i}`,
        bloodline: "carcassonne",
        kind: "recruitment" as const,
        regionId: "italy",
        pos: MILAN,
        city: "Milan",
        startedAt: s.time,
        endsAt: s.time + DAY,
        leadId: null,
      };
      s.operations.push(op);
      s.leads = [];
      surfaceLead(s, op, via);
      const l = s.leads[0]!;
      s.events = [];
      if (l.kind !== "source" && l.kind !== "double") continue;
      seen.add(l.title.split(",")[0]!);
      expect(l.who).toBeTruthy();
      expect(ASSET_KINDS[l.asset!].roles.includes(l.who!) || l.who === "police detective").toBe(
        true,
      );
      expect(l.text).toContain(`The source is ${/^[aeiou]/.test(l.who!) ? "an" : "a"} ${l.who}.`);
      expect(l.text).not.toMatch(/\ba [aeiou]/i);
      if (/detective/.test(l.text))
        expect([l.who, l.whoFemale]).toEqual(["police detective", false]);
      if (/^A nurse/.test(l.text))
        expect([l.who, l.whoFemale]).toEqual(["night-shift nurse", true]);
      if (/went to their parish priest/.test(l.text))
        expect(l.who).not.toMatch(/priest|prioress|bishop/);
    }
    expect(seen.has("A detective")).toBe(true);
  });

  it("disinformation runs through an asset placed for it, and clergy get no lay hints", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = newCampaign("inquisitor", seed);
      s.story.fallAt = 8.64e15;
      s.coverUps = [];
      s.regions.italy!.support = -3; // eroded: counter-stories are on offer
      for (const k of ["ratline", "pr", "informant", "access"] as AssetKind[])
        recruitAsset(
          s,
          k,
          k === "ratline" ? "parish priest near the border" : ASSET_KINDS[k].roles[0]!,
          "italy",
          "Milan",
          MILAN,
        );
      for (let d = 0; d < 300 && s.coverUps.length < 6; d++) {
        dailyHumint(s);
        s.events = [];
      }
      for (const c of s.coverUps) {
        const a = s.assets.find((x) => x.id === c.assetId)!;
        if (c.effect === "counter-story") expect(a.kind).toBe("pr");
        if (c.effect === "false-trail") expect(["informant", "access"]).toContain(a.kind);
        if (a.kind === "ratline")
          expect(c.text).not.toMatch(/Mass again|new car|confession for the first time|daughter/);
      }
    }
  });
});
