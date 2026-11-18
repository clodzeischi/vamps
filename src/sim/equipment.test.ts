import { describe, expect, it } from "vitest";
import { FOUNDING_ARMOURY, MEDKIT_HEAL } from "../data/equipment";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { winChance } from "./combat";
import { bringHome, buyBlocker, buyItem, carried, equip, fromArmoury, gearOf, issueBest, moveGear, stockAt, toArmoury, useMedkits } from "./equipment";
import { countOf, stowedAt } from "./inventory";
import { dismissAgent } from "./personnel";
import { rng } from "./rng";
import { fight } from "./combat";

const setup = () => {
  const s = newCampaign("inquisitor", 9);
  const b = s.installations.find((i) => i.kind === "base")!;
  return { s, b, a: s.agents[0]! };
};

describe("per-agent equipment", () => {
  it("starts everyone on standard issue, and Padua with the founding armoury", () => {
    const { s, b } = setup();
    for (const a of s.agents) {
      expect(gearOf(a)).toMatchObject({ weapon: "pistol", armour: "soft-vest" });
      expect(countOf(gearOf(a), "mag-pistol")).toBe(2);
    }
    expect(b.armoury).toEqual(FOUNDING_ARMOURY);
  });

  it("equips from the armoury and puts back what was there", () => {
    const { s, b, a } = setup();
    expect(equip(s, a.id, "weapon", "rifle")).toBeNull();
    expect(gearOf(a).weapon).toBe("rifle");
    expect(stockAt(b, "rifle")).toBe(FOUNDING_ARMOURY.rifle! - 1);
    expect(stockAt(b, "pistol")).toBe(1); // the pistol went back
    expect(equip(s, a.id, "weapon", "smg")).toMatch(/None/);
    expect(fromArmoury(s, a.id, "incendiary", { in: "pocket1", x: 0, y: 0 })).toBeNull();
    expect(fromArmoury(s, a.id, "medkit", { in: "pocket1", x: 0, y: 0 })).toMatch(/fit/); // the grenade's there
    expect(fromArmoury(s, a.id, "medkit", { in: "pocket1", x: 0, y: 1 })).toBeNull();
    expect(stowedAt(gearOf(a), "pocket1", 1, 1)?.item).toBe("medkit");
    expect(toArmoury(s, a.id, { in: "pocket1", x: 0, y: 0 })).toBeNull();
    expect(countOf(gearOf(a), "incendiary")).toBe(0);
    expect(equip(s, a.id, "armour", "rifle")).toMatch(/doesn't go/);
  });

  it("takes along only what the kit allows; a knife when the weapon stays home", () => {
    const { s, a } = setup();
    equip(s, a.id, "weapon", "rifle");
    fromArmoury(s, a.id, "incendiary");
    expect(carried(a, "tactical")).toMatchObject({ weapon: "rifle", armour: "soft-vest", leftBehind: [] });
    expect(carried(a, "tactical").stowed.map((x) => x.item)).toContain("incendiary");
    expect(carried(a, "plainclothes")).toMatchObject({ weapon: "knife", armour: "soft-vest", leftBehind: ["rifle", "incendiary"] });
    expect(carried(a, "civilian")).toMatchObject({ weapon: "knife", armour: null });
  });

  it("issues the best the armoury has for a kit", () => {
    const { s, a } = setup();
    expect(issueBest(s, a.id, "tactical")).toBeNull();
    expect(gearOf(a)).toMatchObject({ weapon: "rifle", armour: "tactical-vest", helmet: "helmet" });
    for (const x of ["incendiary", "medkit"] as const) expect(countOf(gearOf(a), x)).toBe(1);
    expect(countOf(gearOf(a), "mag-rifle")).toBe(2);
    const b2 = s.agents[1]!;
    issueBest(s, b2.id, "plainclothes");
    expect(gearOf(b2)).toMatchObject({ weapon: "pistol", armour: "soft-vest" }); // nothing better that hides
    expect(gearOf(b2).helmet).toBeUndefined();
    expect(countOf(gearOf(b2), "medkit")).toBe(1);
  });

  it("buys for a base, and a released agent's kit comes back", () => {
    const { s, b, a } = setup();
    s.funds = 10_000;
    expect(buyBlocker(s, b.id, "rifle", 4)).toMatch(/funds/);
    expect(buyItem(s, b.id, "smg", 2)).toBeNull();
    expect(stockAt(b, "smg")).toBe(2);
    equip(s, a.id, "weapon", "smg");
    expect(dismissAgent(s, a.id)).toBeNull();
    expect(stockAt(b, "smg")).toBe(2);
    expect(stockAt(b, "soft-vest")).toBe(1);
  });

  it("fights better kitted, burns incendiaries, and patches wounds with medkits", () => {
    const { s } = setup();
    const team = s.agents.slice(0, 4);
    const threat = { thralls: 4, vampires: 2 };
    const before = winChance(team, "tactical", threat, 0, 3);
    for (const a of team) issueBest(s, a.id, "tactical");
    expect(winChance(team, "tactical", threat, 0, 3)).toBeGreaterThan(before);
    // The estimate never touches the real kit; a real fight uses the incendiaries up.
    expect(countOf(gearOf(team[0]!), "incendiary")).toBe(1);
    fight(rng({ rng: 5 }), team, "tactical", threat, 0);
    expect(team.every((a) => countOf(gearOf(a), "incendiary") === 0)).toBe(true);
    const hurt = team.find((a) => a.hp > 0 && a.hp < a.stats.vitality);
    if (hurt) {
      const hp = hurt.hp;
      expect(useMedkits(s, team, "tactical")).toBeGreaterThan(0);
      expect(hurt.hp).toBeGreaterThan(hp);
      expect(hurt.hp - hp).toBeLessThanOrEqual(MEDKIT_HEAL * 4);
    }
  });

  it("upgrades a version 6 save: standard issue for all, the founding armoury at Padua", () => {
    const { s } = setup();
    const v6 = JSON.parse(serialize(s));
    v6.version = 6;
    for (const a of v6.state.agents) delete a.gear;
    delete v6.state.installations.find((i: { kind: string }) => i.kind === "base").armoury;
    const back = deserialize(JSON.stringify(v6));
    expect(back.agents.every((a) => gearOf(a).weapon === "pistol")).toBe(true);
    // Version 7 -> 8 adds two magazines a gun.
    expect(back.installations.find((i) => i.kind === "base")!.armoury).toMatchObject({ rifle: 6, "mag-rifle": FOUNDING_ARMOURY["mag-rifle"]! + 12 });
  });

  it("upgrades a version 7 save: utility items into pockets, magazines for the guns", () => {
    const { s } = setup();
    const v7 = JSON.parse(serialize(s));
    v7.version = 7;
    v7.state.agents[0].gear = { weapon: "rifle", armour: "tactical-vest", utility: ["incendiary", "medkit"] };
    const back = deserialize(JSON.stringify(v7));
    const g = gearOf(back.agents[0]!);
    expect(g).toMatchObject({ weapon: "rifle", armour: "tactical-vest" });
    expect(g.stowed.map((x) => x.item).sort()).toEqual(["incendiary", "mag-rifle", "mag-rifle", "medkit"]);
  });

  it("rearranges kit, swapping what's in the hand", () => {
    const { s, a } = setup();
    fromArmoury(s, a.id, "rifle", { in: "pack", x: 0, y: 0 });
    expect(moveGear(s, a.id, { in: "pack", x: 1, y: 3 }, { slot: "weapon" })).toBeNull();
    expect(gearOf(a).weapon).toBe("rifle");
    expect(stowedAt(gearOf(a), "pack", 0, 0)?.item).toBe("pistol"); // the pistol went where the rifle was
    expect(moveGear(s, a.id, { in: "pocket0", x: 0, y: 0 }, { slot: "armour" })).toMatch(/doesn't go/);
  });

  it("brings home what was carried out, and what the kit left behind", () => {
    const { s, a } = setup();
    equip(s, a.id, "weapon", "rifle");
    // Plainclothes: the rifle stays home. In the fight they picked up a pistol and used a magazine.
    const fought = carried(a, "plainclothes").gear;
    fought.weapon = "pistol";
    fought.stowed = fought.stowed.slice(1);
    bringHome(s, a, "plainclothes", fought);
    expect(gearOf(a).weapon).toBe("pistol");
    expect(countOf(gearOf(a), "rifle")).toBe(1); // in the backpack now
    expect(countOf(gearOf(a), "mag-pistol")).toBe(1);
  });
});
