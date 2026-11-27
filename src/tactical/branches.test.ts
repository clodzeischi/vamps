// Step 5a's weapons on the battlescape (docs/design/research.md, "Weapons and ammunition",
// "Their senses and sleep"): haemolytic and coated rounds, the crossbow, the flashbang and strobe.
import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map/map";
import {
  agents,
  daze,
  DEFAULT_OPTIONS,
  finishCost,
  HAEMOLYTIC,
  STROBE,
  UV_ON_BAND,
  LANTERN_BURN,
  inReach,
  tileIndex,
  sees,
  seenByAgents,
  ISR,
  TU_COST,
  type Battle,
} from "./battle";
import type { WeaknessId } from "../data/strains";
import { downed, wound } from "./harm";
import { commandDevice, commandFinish, commandHeal, commandReload, commandThrow } from "./commands";
import { countOf } from "../sim/people/inventory";
import { newSkirmish } from "./setup";
import { endTurn } from "./turns";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function field(): BattleMap {
  const m = emptyMap(14, 14, 2, 0, "urban", 1);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  return m;
}

/** One agent at (3, 3); a vampire at (8, 3) and a thrall at (8, 5), of a house with these weaknesses. */
function setup(weaknesses: WeaknessId[] = []): Battle {
  const m = field();
  m.spawns = [
    { ...P(8, 3), side: "vampire" },
    { ...P(8, 5), side: "thrall" },
  ];
  m.lz = Array.from({ length: 9 }, () => P(3, 3));
  const b = newSkirmish(m, 5, {
    ...DEFAULT_OPTIONS,
    night: true,
    bloodline: "sahel",
    strain: { silver: 1, weaknesses },
  });
  b.units = b.units.filter((u) => u.side !== "agent" || u.id === "a0");
  Object.assign(b.units[0]!, P(3, 3));
  const v = vamp(b);
  v.hp = v.maxHp = 100;
  v.armour = 0;
  agents(b)[0]!.tu = 80;
  return b;
}
const vamp = (b: Battle) => b.units.find((u) => u.kind === "vampire")!;
const thrall = (b: Battle) => b.units.find((u) => u.kind === "thrall")!;

describe("haemolytic and coated rounds", () => {
  it("a haemolytic hit slows a vampire (more if it clots slowly); one it drops never rises", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.weapon = "pistol";
    a.round = "haemolytic";
    expect(wound(b, a, vamp(b), 20, false).hit.damage).toBe(Math.round(20 * HAEMOLYTIC.damage));
    expect(vamp(b).slowed).toBe(HAEMOLYTIC.slow);
    const c = setup(["slow-clotting"]);
    const ac = agents(c)[0]!;
    ac.weapon = "pistol";
    ac.round = "haemolytic";
    wound(c, ac, vamp(c), 20, false);
    expect(vamp(c).slowed).toBe(HAEMOLYTIC.slowClotting);
    expect(c.noticed).toEqual(["slow-clotting"]);
    // Dropped: in torpor, and when it would rise it dies.
    wound(b, a, vamp(b), 500, false);
    expect(vamp(b).doomed).toBe(true);
    expect(vamp(b).torpor).toBeGreaterThan(0);
    for (let i = 0; i < 6 && vamp(b).alive; i++) endTurn(b);
    expect(vamp(b).alive).toBe(false);
  });

  it("a coated knife does double to a vampire, and it doesn't rise", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.weapon = "coated-knife";
    expect(wound(b, a, vamp(b), 10, false).hit.damage).toBe(20);
    a.weapon = "knife";
    expect(wound(b, a, vamp(b), 10, false).hit.damage).toBe(10);
    a.weapon = "coated-knife";
    wound(b, a, vamp(b), 500, false);
    expect(vamp(b).doomed).toBe(true);
  });

  it("an ordinary torpor ends in rising", () => {
    const b = setup();
    downed(b, vamp(b));
    for (let i = 0; i < 6 && vamp(b).torpor > 0; i++) endTurn(b);
    expect(vamp(b).alive).toBe(true);
  });

  it("the crossbow loads coated bolts as well as its own", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.weapon = "crossbow";
    a.weapon = "crossbow";
    a.ammo = 0;
    a.gear.stowed = [{ item: "bolt-coated", in: "pocket0", x: 0, y: 0 }];
    expect(commandReload(b, a)).not.toBeTypeOf("string");
    expect(a.round).toBe("coated");
    expect(a.ammo).toBe(1);
  });
});

describe("flashbang and strobe", () => {
  it("a flashbang stuns thralls a turn, an acoustic house's vampires two", () => {
    const b = setup(["acoustic"]);
    const a = agents(b)[0]!;
    vamp(b).x = 8;
    vamp(b).y = 4;
    a.gear.stowed = [{ item: "flashbang", in: "pocket0", x: 0, y: 0 }];
    expect(commandThrow(b, a, P(8, 4), "flashbang")).not.toBeTypeOf("string");
    expect(thrall(b).stunned).toBe(1);
    expect(vamp(b).stunned).toBe(2);
    expect(b.noticed).toEqual(["acoustic"]);
    const t = thrall(b);
    t.tu = 50;
    daze(b, t);
    expect(t.tu).toBe(0);
    expect(t.stunned).toBe(0);
  });

  it("a flashbang leaves an ordinary house's vampires be", () => {
    const b = setup();
    const a = agents(b)[0]!;
    vamp(b).y = 4;
    a.gear.stowed = [{ item: "flashbang", in: "pocket0", x: 0, y: 0 }];
    commandThrow(b, a, P(8, 4), "flashbang");
    expect(vamp(b).stunned).toBeUndefined();
  });

  it("a strobe costs vampires in sight half a turn; a photic house's seize", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.stowed = [{ item: "strobe", in: "pocket0", x: 0, y: 0 }];
    expect(commandThrow(b, a, P(7, 3), "strobe")).not.toBeTypeOf("string");
    expect(vamp(b).slowed).toBe(STROBE.slow);
    expect(thrall(b).slowed).toBeUndefined();
    const v = vamp(b);
    v.tu = 60;
    daze(b, v);
    expect(v.tu).toBe(30);
    const c = setup(["photic"]);
    const ac = agents(c)[0]!;
    ac.gear.stowed = [{ item: "strobe", in: "pocket0", x: 0, y: 0 }];
    commandThrow(c, ac, P(7, 3), "strobe");
    expect(vamp(c).stunned).toBe(1);
    expect(c.noticed).toEqual(["photic"]);
  });
});

describe("the mind and the sleep", () => {
  it("Torpor metabolism makes finishing cheaper", () => {
    const b = setup();
    expect(finishCost(b)).toBe(TU_COST.finish);
    b.mods.finishLess = 2;
    expect(finishCost(b)).toBe(TU_COST.finish - 2);
  });

  it("Discernment: a dominated operative keeps half the turn", () => {
    const b = setup();
    const a = agents(b)[0]!;
    b.units = b.units.filter((u) => u.side === "agent"); // nobody to act in between
    b.units.push({ ...vamp(setup()), torpor: 5 }); // keep the fight going
    a.dominated = true;
    b.mods.discern = true;
    endTurn(b);
    expect(a.tu).toBe(Math.floor(a.maxTu / 2));
  });
});

describe("silencer bolts and Agnes", () => {
  it("a silencer of its own house strips a vampire's armour and keeps it down; another house's does nothing", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.weapon = "crossbow";
    a.weapon = "crossbow";
    a.ammo = 0;
    a.gear.stowed = [{ item: "silencer-jade", in: "pocket0", x: 0, y: 0 }];
    commandReload(b, a);
    expect(a.round).toBe("silencer");
    vamp(b).armour = 5;
    wound(b, a, vamp(b), 10, false);
    expect(vamp(b).silenced).toBeUndefined(); // a Sahel vampire
    a.silences = "sahel";
    wound(b, a, vamp(b), 10, false);
    expect(vamp(b)).toMatchObject({ silenced: true, doomed: true, armour: 0 });
  });

  it("Agnes heals and rises at once, and can't be finished, until the Montségur silencer finds her", () => {
    const b = setup();
    const a = agents(b)[0]!;
    const v = vamp(b);
    v.agnes = true;
    a.weapon = "crossbow";
    a.round = "coated";
    wound(b, a, v, 500, false); // down, and a coated hit would keep anyone else down
    expect(v.torpor).toBe(1);
    Object.assign(v, { x: 4, y: 3 });
    expect(commandFinish(b, a, v)).toBe("Her blood won't take it");
    endTurn(b);
    expect(v.alive).toBe(true);
    expect(v.torpor).toBe(0);
    // Silenced: the Perfecti's silencer doesn't touch her; the Montségur silencer does.
    a.round = "silencer";
    a.silences = "carcassonne";
    wound(b, a, v, 1, false);
    expect(v.silenced).toBeUndefined();
    a.silences = "agnes";
    wound(b, a, v, 500, false);
    expect(v.silenced).toBe(true);
    expect(commandFinish(b, a, v)).not.toBeTypeOf("string");
  });
});

describe("light, fire and serum", () => {
  it("a lumen lamp burns a vampire (×1.6 on its band) through armour, and leaves people be", () => {
    const hit = (band?: "uva" | "violet") => {
      const b = setup();
      if (band) b.strain!.band = band;
      const a = agents(b)[0]!;
      a.weapon = "lumen-365";
      vamp(b).armour = 10;
      wound(b, a, vamp(b), 20, false);
      return 100 - vamp(b).hp;
    };
    expect(hit()).toBe(20);
    expect(hit("uva")).toBe(Math.round(20 * UV_ON_BAND));
    expect(hit("violet")).toBe(20);
    const b = setup();
    const a = agents(b)[0]!;
    a.weapon = "lumen-365";
    const t = thrall(b);
    const hp = t.hp;
    wound(b, a, t, 30, false);
    expect(t.hp).toBe(hp);
    // What it drops is ash.
    wound(b, a, vamp(b), 500, false);
    expect(vamp(b)).toMatchObject({ alive: false, burnt: true });
  });

  it("the lamp reaches 4 tiles, the lance 20", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.weapon = "lumen-405";
    expect(inReach(b, a, vamp(b))).toBe(false); // 5 tiles off
    a.weapon = "excimer-lance";
    expect(inReach(b, a, vamp(b))).toBe(true);
  });

  it("the Sparkle burns vampires for good and turns bodies in torpor to ash", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.stowed = [{ item: "sparkle", in: "pocket0", x: 0, y: 0 }];
    vamp(b).hp = 10;
    const t = thrall(b);
    const hp = t.hp;
    expect(commandThrow(b, a, P(8, 4), "sparkle")).not.toBeTypeOf("string");
    expect(vamp(b)).toMatchObject({ alive: false, burnt: true });
    expect(t.hp).toBe(hp);
    const c = setup();
    vamp(c).torpor = 2;
    const ac = agents(c)[0]!;
    ac.gear.stowed = [{ item: "sparkle", in: "pocket0", x: 0, y: 0 }];
    commandThrow(c, ac, P(8, 3), "sparkle");
    expect(vamp(c).alive).toBe(false);
  });

  it("magnesium sets the one hit alight; the Lantern suit burns the vampire that claws it", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.weapon = "shotgun";
    a.round = "magnesium";
    wound(b, a, thrall(b), 5, false);
    expect(b.fire[tileIndex(b, thrall(b))]).toBe(1);
    a.gear.armour = "lantern-suit";
    const v = vamp(b);
    const hp = v.hp;
    wound(b, v, a, 5, false);
    expect(v.hp).toBe(hp - LANTERN_BURN);
  });

  it("haem serum heals 25, then 5 a turn for three turns", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.stowed = [{ item: "haem-serum", in: "pocket0", x: 0, y: 0 }];
    a.maxHp = 100;
    a.hp = 10;
    expect(commandHeal(b, a, a, "haem-serum")).not.toBeTypeOf("string");
    expect(a.hp).toBe(35);
    b.units = b.units.filter((u) => u.side === "agent");
    b.units.push({ ...vamp(setup()), torpor: 9 });
    for (let i = 0; i < 4; i++) endTurn(b);
    expect(a.hp).toBe(50);
    expect(a.regen).toBeUndefined();
  });
});

describe("sensing gear", () => {
  it("night optics see 14 tiles in the dark; a thermal sight finds a hiding vampire", () => {
    const b = setup();
    const a = agents(b)[0]!;
    const v = vamp(b);
    Object.assign(v, { x: 13, y: 3 });
    b.moon = 0;
    const plain = sees(b, a, v, v);
    a.gear.helmet = "night-optics";
    expect(plain).toBe(false);
    expect(sees(b, a, v, v)).toBe(true);
    v.hidden = true;
    expect(sees(b, a, v, v)).toBe(false);
    a.gear.helmet = "thermal-sight";
    expect(sees(b, a, v, v)).toBe(true);
  });

  it("a motion tracker shows enemies within 12 through the turn; a drone watches the open ground", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.stowed = [{ item: "motion-tracker", in: "pocket0", x: 0, y: 0 }];
    b.moon = 0;
    const v = vamp(b);
    Object.assign(v, { x: 13, y: 9 }); // 11.7 tiles off
    expect(seenByAgents(b, v, v)).toBe(false);
    expect(commandDevice(b, a, "motion-tracker")).not.toBeTypeOf("string");
    expect(seenByAgents(b, v, v)).toBe(true);
    expect(countOf(a.gear, "motion-tracker")).toBe(1); // kept
    b.turn++;
    expect(seenByAgents(b, v, v)).toBe(false);
    a.gear.stowed = [{ item: "isr-drone", in: "pocket0", x: 0, y: 0 }];
    a.tu = 80;
    expect(commandDevice(b, a, "isr-drone")).not.toBeTypeOf("string");
    expect(seenByAgents(b, v, v)).toBe(true);
    b.turn += ISR.turns;
    expect(seenByAgents(b, v, v)).toBe(false);
  });
});
