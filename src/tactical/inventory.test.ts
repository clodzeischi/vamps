import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map/map";
import {
  agents,
  commandHeal,
  commandIncendiary,
  commandInventory,
  commandReload,
  commandShoot,
  DEFAULT_OPTIONS,
  enemies,
  floorNear,
  INV_TU,
  inventoryBlocker,
  modesOf,
  holdForReactions,
  setSneak,
  reach,
  tuTo,
  detectRadius,
  SNEAK,
  newSkirmish,
  reloadBlocker,
  RUMMAGE_TU,
  setMode,
  shotCost,
  tuCost,
  TU_COST,
  type Battle,
  type Unit,
} from "./battle";
import { WEAPONS } from "./rules";
import { countOf, findSpot, fits, moveWithin, packGear, stowedAt } from "../sim/people/inventory";

function field(): BattleMap {
  const m = emptyMap(16, 16, 1, 0, "urban", 1);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = [{ x: 0, y: 0, z: 0 }];
  return m;
}
const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

/** One tactical agent at (2, 2), a thrall where asked. */
function duel(enemyAt: Pt3 = P(8, 2)): Battle {
  const m = field();
  m.spawns = [{ ...enemyAt, side: "thrall" }];
  m.lz = Array.from({ length: 9 }, () => P(2, 2));
  const b = newSkirmish(m, 3, { ...DEFAULT_OPTIONS, night: false, arrival: "jet" });
  b.units = b.units.filter((u, i) => u.side !== "agent" || i === 0);
  Object.assign(b.units[0]!, P(2, 2), { maxTu: 100, tu: 100, aim: 200 });
  return b;
}

/** Shoots until it hits (95% each): concealment as it was before each try. */
function hitIt(b: Battle, a: Unit, e: Unit) {
  const concealed = b.concealed;
  for (let i = 1; e.alive && i < 20; i++) {
    b.rng = i * 7919;
    b.concealed = concealed;
    a.tu = 100;
    commandShoot(b, a, e, "aimed");
  }
  expect(e.alive).toBe(false);
}

describe("the inventory grid", () => {
  it("items take width × height cells; long ones don't fit a pocket", () => {
    const { gear } = packGear([]);
    expect(fits(gear, "pistol", "pocket0", 0, 0)).toBe(true);
    expect(fits(gear, "pistol-sd", "pocket0", 0, 0)).toBe(false); // 1 × 3 in a 2 × 2
    expect(fits(gear, "rifle-sd", "pack", 0, 0)).toBe(true); // 2 × 5 in the 4 × 5 backpack
    expect(fits(gear, "rifle-sd", "pack", 0, 1)).toBe(false);
    expect(fits(gear, "rifle", "pack", 3, 0)).toBe(false); // over the edge
  });

  it("packs a loadout: worn items worn, long things in the backpack, small ones in the pockets", () => {
    const { gear, left } = packGear([
      "rifle",
      "rifle-sd",
      "tactical-vest",
      "helmet",
      "mag-rifle",
      "incendiary",
      "medkit",
    ]);
    expect(left).toEqual([]);
    expect(gear).toMatchObject({ armour: "tactical-vest", helmet: "helmet" });
    expect(gear.weapon).toBe("rifle-sd"); // the biggest goes first, into the hand
    expect(gear.stowed.find((x) => x.item === "rifle")?.in).toBe("pack");
    expect(gear.stowed.find((x) => x.item === "incendiary")?.in).toMatch(/pocket/);
  });

  it("swaps into the hand: what was there goes where the new one came from", () => {
    const { gear } = packGear(["pistol"]);
    gear.stowed.push({ item: "smg", in: "pack", x: 0, y: 0 });
    expect(moveWithin(gear, { in: "pack", x: 0, y: 2 }, { slot: "weapon" })).toBeNull();
    expect(gear.weapon).toBe("smg");
    expect(stowedAt(gear, "pack", 0, 0)?.item).toBe("pistol");
    // Nowhere for a 2 × 4 where a 1 × 2 was.
    const g2 = packGear(["rifle"]).gear;
    g2.stowed = [{ item: "pistol", in: "pocket0", x: 0, y: 0 }];
    expect(moveWithin(g2, { in: "pocket0", x: 0, y: 0 }, { slot: "weapon" })).toMatch(/No room/);
    expect(findSpot(g2, "rifle-sd")).toEqual({ in: "pack", x: 0, y: 0 });
  });
});

describe("the inventory on the battlescape", () => {
  it("costs time to get things out and put them away, more from the backpack and the ground", () => {
    const b = duel();
    const a = agents(b)[0]!;
    const mag = a.gear.stowed.find((x) => x.item === "mag-rifle")!;
    expect(mag.in).toMatch(/pocket/);
    const pack = findSpot(a.gear, "mag-rifle", ["pack"])!;
    expect(commandInventory(b, a, { in: mag.in, x: mag.x, y: mag.y }, pack)).toBeNull();
    expect(a.tu).toBe(100 - INV_TU.pocket - INV_TU.pack);
    // Armour stays on.
    expect(inventoryBlocker(b, a, { slot: "armour" }, pack)).toMatch(/Armour/);
    // Dropped, then picked up again.
    expect(commandInventory(b, a, pack, { floor: "" })).toBeNull();
    expect(b.floor).toHaveLength(1);
    expect(floorNear(b, a)).toHaveLength(1);
    expect(commandInventory(b, a, { floor: b.floor[0]!.id }, pack)).toBeNull();
    expect(b.floor).toHaveLength(0);
  });

  it("reloads from a magazine carried (slower from the backpack), and not without one", () => {
    const b = duel();
    const a = agents(b)[0]!;
    a.ammo = 0;
    const mags = () => countOf(a.gear, "mag-rifle");
    const had = mags();
    expect(commandReload(b, a)).not.toBeTypeOf("string");
    expect(a.ammo).toBe(WEAPONS.rifle.clip);
    expect(mags()).toBe(had - 1);
    expect(a.tu).toBe(100 - TU_COST.reload);
    // Only a magazine in the backpack: the rummage costs more.
    a.gear.stowed = a.gear.stowed.filter((x) => x.item !== "mag-rifle");
    a.gear.stowed.push({ item: "mag-rifle", in: "pack", x: 3, y: 0 });
    a.ammo = 0;
    a.tu = 100;
    commandReload(b, a);
    expect(a.tu).toBe(100 - TU_COST.reload - RUMMAGE_TU);
    a.ammo = 0;
    expect(reloadBlocker(a)).toMatch(/No carbine magazine/);
  });

  it("fires bursts with a rifle: several rounds, each less likely, for its own cost", () => {
    const b = duel();
    const a = agents(b)[0]!;
    expect(modesOf(a)).toEqual(["snap", "aimed", "burst"]);
    expect(setMode(a, "burst")).toBeNull();
    const e = enemies(b)[0]!;
    Object.assign(e, { hp: 500, maxHp: 500 });
    const ammo = a.ammo;
    const res = commandShoot(b, a, e, "burst");
    expect(res).not.toBeTypeOf("string");
    expect((res as { kind: string }[]).filter((x) => x.kind === "shot")).toHaveLength(
      WEAPONS.rifle.burst,
    );
    expect(a.ammo).toBe(ammo - WEAPONS.rifle.burst);
    expect(a.tu).toBe(100 - shotCost(a, "burst"));
    // Each round says it's one of a burst, and from what (the view plays them as one, with the gun's sound).
    for (const x of res as { kind: string; burst?: boolean; weapon?: string }[])
      if (x.kind === "shot") expect([x.burst, x.weapon]).toEqual([true, "rifle"]);
    // A machine gun: a longer burst from a bigger box.
    Object.assign(a, { weapon: "m249", ammo: WEAPONS.m249.clip, tu: 100 });
    a.gear.weapon = "m249";
    // It fires bursts only: a snap shot asked of it is a burst.
    expect(modesOf(a)).toEqual(["burst"]);
    expect(setMode(a, "snap")).not.toBeNull();
    const mg = commandShoot(b, a, e, "snap") as { kind: string }[];
    expect(mg.filter((x) => x.kind === "shot")).toHaveLength(WEAPONS.m249.burst);
    expect(a.ammo).toBe(WEAPONS.m249.clip - WEAPONS.m249.burst);
    expect(a.tu).toBe(100 - shotCost(a, "burst"));
    // A shotgun has no burst.
    a.gear.weapon = "shotgun";
    a.weapon = "shotgun";
    expect(modesOf(a)).not.toContain("burst");
  });

  it("a suppressed kill keeps the team concealed; a loud one doesn't", () => {
    for (const weapon of ["rifle-sd", "rifle"] as const) {
      const b = duel();
      b.concealed = true;
      const a = agents(b)[0]!;
      Object.assign(a, { weapon, ammo: 8 });
      const e = enemies(b)[0]!;
      Object.assign(e, { hp: 1, maxHp: 1 });
      hitIt(b, a, e);
      expect(b.concealed).toBe(weapon === "rifle-sd");
    }
  });

  it("a fallen thrall drops its gun, to pick up and use", () => {
    const b = duel(P(3, 2));
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    const gun = e.gear.weapon!;
    Object.assign(e, { hp: 1, maxHp: 1 });
    hitIt(b, a, e);
    b.result = null; // as if others were left to fight
    const f = floorNear(b, a).find((x) => x.item === gun)!;
    expect(f).toBeTruthy();
    expect(f.ours).toBe(false);
    // Into the hand: the carbine there goes down on the ground in its place.
    expect(commandInventory(b, a, { floor: f.id }, { slot: "weapon" })).toBeNull();
    expect(a.gear.weapon).toBe(gun);
    expect(b.floor.some((x) => x.item === "rifle" && x.ours)).toBe(true);
  });

  it("throws an incendiary from a pocket, or slower from the backpack", () => {
    const b = duel();
    const a = agents(b)[0]!;
    const g = a.gear.stowed.find((x) => x.item === "incendiary")!;
    a.gear.stowed = a.gear.stowed.filter((x) => x !== g);
    a.gear.stowed.push({ item: "incendiary", in: "pack", x: 3, y: 4 });
    commandIncendiary(b, a, P(8, 8));
    expect(a.tu).toBe(100 - tuCost(a, "throw") - RUMMAGE_TU);
    expect(countOf(a.gear, "incendiary")).toBe(0);
  });

  it("a trauma kit patches the agent or one next to them", () => {
    const b = duel();
    const a = agents(b)[0]!;
    a.hp = a.maxHp - 20;
    const res = commandHeal(b, a, a);
    expect(res).not.toBeTypeOf("string");
    expect(a.hp).toBe(a.maxHp - 10);
    expect(countOf(a.gear, "medkit")).toBe(0);
    expect(commandHeal(b, a, a)).toMatch(/No trauma kit/);
  });
});

describe("sneaking and reaction fire", () => {
  it("sneaking costs half again per step and halves how close an enemy must come", () => {
    const b = duel(P(15, 15));
    const a = agents(b)[0]!;
    a.tradecraft = 40; // spotted within 4
    const walk = tuTo(b, reach(b, a), P(2, 6))!;
    expect(detectRadius(a)).toBe(4);
    setSneak(a, true);
    expect(tuTo(b, reach(b, a), P(2, 6))).toBe(walk * SNEAK.move);
    expect(detectRadius(a)).toBe(2);
  });

  it("at the end of the turn, agents with time and rounds hold them for reaction fire; not without rounds", () => {
    const b = duel();
    const a = agents(b)[0]!;
    holdForReactions(b);
    expect(a.overwatch).toBe(true);
    a.overwatch = false;
    a.ammo = 0;
    holdForReactions(b);
    expect(a.overwatch).toBe(false);
    a.ammo = 8;
    a.tu = 1;
    holdForReactions(b);
    expect(a.overwatch).toBe(false);
  });
});
