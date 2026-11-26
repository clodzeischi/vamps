import { afterEach, describe, expect, it } from "vitest";
import { newCampaign } from "../campaign/campaign";
import { advance, dismissEvent } from "../core/clock";
import { autoResolveBattle, finishBattle } from "./battles";
import { decide } from "./arrival";
import { dispatch, type DispatchPlan } from "./dispatch";
import { hourlyMissions } from "./missions";
import { SITE_KINDS } from "./common";
import { tactical } from "./plays";
import type { GameState, Site } from "../core/state";
import { DAY } from "../core/time";
import { battleForMission } from "../../tactical/campaign";
import { agents, enemies } from "../../tactical/battle";
import { commandMove } from "../../tactical/commands";
import { endTurn } from "../../tactical/turns";
import { reach, fromIdx } from "../../tactical/movement";
import { packBattle, unpackBattle } from "../../tactical/save";
import { deserialize, serialize } from "../../save/format";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(
    ["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]),
  );
  s.coverUps = [];
  s.story.fallAt = 8.64e15;
  s.events = [];
  return s;
};

function until(s: GameState, kind: string, days = 5) {
  const end = s.time + days * DAY;
  while (s.time < end) {
    if (s.events[0]?.kind === kind) return s.events[0];
    if (s.events.length) {
      dismissEvent(s);
      continue;
    }
    advance(s, end - s.time);
  }
  return s.events[0]?.kind === kind ? s.events[0] : undefined;
}

/** A den near Padua, and the team flying out to burn it. */
function strikeOnDen(seed = 2) {
  const s = quiet(seed);
  const site: Site = {
    id: "site-t",
    bloodline: "carcassonne",
    kind: "den",
    regionId: "italy",
    city: "Verona",
    pos: { lat: 45.44, lon: 10.99 },
    revealedAt: s.time,
    expiresAt: s.time + 20 * DAY,
    thralls: SITE_KINDS.den.thralls,
    vampires: SITE_KINDS.den.vampires,
    missionId: null,
    netId: "net-t",
  };
  s.sites.push(site);
  const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
  const plan: DispatchPlan = {
    target: { kind: "site", id: site.id },
    baseId: "ob-padua",
    aircraftId: heli.id,
    agentIds: s.agents.slice(0, 4).map((a) => a.id),
    kit: "tactical",
  };
  expect(dispatch(s, plan)).toBeNull();
  until(s, "arrival");
  return s;
}

afterEach(() => {
  tactical.on = false;
});

describe("tactical battles in the campaign", () => {
  it("a strike stops at the fight; auto-resolving it gives exactly what the auto-combat would have", () => {
    const plain = strikeOnDen();
    decide(plain, plain.missions[0]!.id, "midday");
    const a = until(plain, "debrief", 3)!;

    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    const e = until(s, "battle", 3)!;
    expect(e.title).toMatch(/Contact/);
    const m = s.missions[0]!;
    expect(m.battle).toBeDefined();
    expect(m.phase).toBe("on-site");
    expect(autoResolveBattle(s, m.id)).toBeNull();
    const b = until(s, "debrief", 1)!;
    expect(b.title).toBe(a.title);
    expect(b.body).toBe(a.body);
    expect(m.battle).toBeUndefined();
  });

  it("holding a fight for the player changes nothing else in the campaign (the probe runs on a copy)", () => {
    tactical.on = true;
    const s = strikeOnDen();
    const m = s.missions[0]!;
    decide(s, m.id, "midday");
    m.workUntil = s.time; // the wait is over: the play runs on this tick
    const look = () => ({
      rng: s.rng,
      funds: s.funds,
      secrecy: s.secrecy,
      heat: s.heat,
      sites: JSON.stringify(s.sites),
      agents: JSON.stringify(s.agents),
      networks: JSON.stringify(s.networks),
    });
    const before = look();
    hourlyMissions(s);
    expect(m.battle).toBeDefined();
    expect(look()).toEqual(before);
    expect(m.battle!.rng).toBe(before.rng);
  });

  it("a battle built from the mission: our agents, the site's numbers, the bloodline", () => {
    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    until(s, "battle", 3);
    const m = s.missions[0]!;
    const { battle } = battleForMission(s, m);
    expect(
      agents(battle)
        .map((u) => u.id)
        .sort(),
    ).toEqual([...m.agentIds].sort());
    expect(enemies(battle).filter((u) => u.kind === "vampire")).toHaveLength(m.battle!.vampires);
    expect(battle.bloodline).toBe("carcassonne");
    // Tactical kit, by helicopter: no concealment.
    expect(battle.concealed).toBe(false);
    // The same mission always gets the same map.
    expect(Array.from(battleForMission(s, m).battle.map.tiles)).toEqual(
      Array.from(battle.map.tiles),
    );
  });

  it("a battle won by hand: the strike succeeds, wounds stay, the dead are mourned, a vampire taken alive goes to a cell", () => {
    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    until(s, "battle", 3);
    const m = s.missions[0]!;
    const [first, second] = m.agentIds;
    for (const a of s.agents) a.gear!.stowed = a.gear!.stowed.filter((x) => x.item !== "medkit"); // no field dressings: the wound stays
    expect(
      finishBattle(s, m.id, {
        won: true,
        turns: 9,
        dead: [first!],
        health: { [second!]: 0.5 },
        thrallsKilled: 4,
        vampiresKilled: 1,
        captured: 1,
        lootShare: 1,
        hostage: null,
      }),
    ).toBeNull();
    const d = until(s, "debrief", 1)!;
    expect(d.title).toMatch(/Success/);
    expect(d.casualties!.dead).toHaveLength(1);
    expect(s.agents.some((a) => a.id === first)).toBe(false);
    const hurt = s.agents.find((a) => a.id === second)!;
    expect(hurt.hp).toBeLessThan(hurt.vitality);
    expect(d.body).toMatch(/alive|cell/);
  });

  it("a battle lost by hand fails the strike", () => {
    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    until(s, "battle", 3);
    const m = s.missions[0]!;
    finishBattle(s, m.id, {
      won: false,
      turns: 6,
      dead: [],
      health: {},
      thrallsKilled: 1,
      vampiresKilled: 0,
      captured: 0,
      lootShare: 0,
      hostage: null,
    });
    expect(until(s, "debrief", 1)!.title).toMatch(/Failure/);
  });

  it("loot left behind isn't seized", () => {
    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    until(s, "battle", 3);
    const m = s.missions[0]!;
    const funds = s.funds;
    finishBattle(s, m.id, {
      won: true,
      turns: 8,
      dead: [],
      health: {},
      thrallsKilled: 4,
      vampiresKilled: 1,
      captured: 0,
      lootShare: 0,
      hostage: null,
    });
    const d = until(s, "debrief", 1)!;
    expect(d.effects).toMatch(/left behind/);
    expect(s.funds).toBeLessThanOrEqual(funds);
  });

  it("a mission's battle carries how they came, the site's loot, and (in a rescue) the prisoner", () => {
    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    until(s, "battle", 3);
    const m = s.missions[0]!;
    const { battle } = battleForMission(s, m);
    expect(battle.airlift).toBe(true);
    expect(battle.loot.length).toBeGreaterThan(0);
    m.battle!.hostage = true;
    expect(battleForMission(s, m).battle.units.some((u) => u.kind === "hostage")).toBe(true);
  });
  it("a battle under way is saved with the campaign and comes back as it was; a damaged one is dropped", () => {
    tactical.on = true;
    const s = strikeOnDen();
    decide(s, s.missions[0]!.id, "midday");
    until(s, "battle", 3);
    const m = s.missions[0]!;
    const { battle, title } = battleForMission(s, m);
    // Play a little: a move, the enemy's turn.
    const a = agents(battle)[0]!;
    const r = reach(battle, a);
    const far = [...r.cost.entries()].sort((x, y) => y[1] - x[1])[0]![0];
    expect(Array.isArray(commandMove(battle, a, fromIdx(battle.map, far)))).toBe(true);
    endTurn(battle);
    m.battle!.live = { title, battle: packBattle(battle) };
    const text = serialize(s);
    expect(text.length).toBeLessThan(2_000_000);
    const back = deserialize(text).missions[0]!.battle!.live!;
    expect(back.title).toBe(title);
    const again = unpackBattle(back.battle);
    expect(Array.from(again.map.ew)).toEqual(Array.from(battle.map.ew));
    expect(again.units).toEqual(battle.units);
    // It plays on exactly as the original would.
    endTurn(battle);
    endTurn(again);
    expect(JSON.stringify(packBattle(again))).toBe(JSON.stringify(packBattle(battle)));
    // A damaged battle doesn't stop the campaign loading: the fight starts over from its Contact event.
    const bad = JSON.parse(text);
    bad.state.missions[0].battle.live.battle.map.tiles = "nonsense";
    const loaded = deserialize(JSON.stringify(bad));
    expect(loaded.missions[0]!.battle).toBeDefined();
    expect(loaded.missions[0]!.battle!.live).toBeUndefined();
    expect(loaded.events.some((e) => e.kind === "battle")).toBe(true);
  });
});
