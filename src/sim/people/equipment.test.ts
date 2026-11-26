import { describe, expect, it } from "vitest";
import { FOUNDING_ARMOURY, MEDKIT_HEAL } from "../../data/equipment";
import { newCampaign } from "../campaign/campaign";
import { winChance } from "../missions/combat";
import { hourlyTransfers } from "../base/transfers";
import { placeOrder, SHIPPING_HOURS } from "../economy/market";
import { HOUR } from "../core/time";
import {
  allGear,
  standardIssue,
  bringHome,
  carried,
  equip,
  fromArmoury,
  gearOf,
  issueBest,
  moveGear,
  returnGear,
  stockAt,
  toArmoury,
  useMedkits,
} from "./equipment";
import { cloneGear, countOf, stowedAt } from "./inventory";
import { dismiss } from "./personnel";
import { rng } from "../core/rng";
import { fight } from "../missions/combat";

/** A campaign with everyone on standard issue (both loadouts) and the founding armoury untouched. */
const setup = () => {
  const s = newCampaign("inquisitor", 9);
  const b = s.installations.find((i) => i.kind === "base")!;
  for (const a of s.agents) {
    a.gear = standardIssue();
    a.lowViz = standardIssue();
  }
  b.armoury = { ...FOUNDING_ARMOURY };
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

  it("takes along the kit's loadout, only what the kit allows; a knife when the weapon stays home", () => {
    const { s, a } = setup();
    equip(s, a.id, "weapon", "rifle");
    fromArmoury(s, a.id, "incendiary");
    expect(carried(a, "tactical")).toMatchObject({
      weapon: "rifle",
      armour: "soft-vest",
      leftBehind: [],
    });
    expect(carried(a, "tactical").stowed.map((x) => x.item)).toContain("incendiary");
    expect(carried(a, "plainclothes")).toMatchObject({
      weapon: "pistol",
      armour: "soft-vest",
      leftBehind: [],
    });
    expect(carried(a, "civilian")).toMatchObject({ weapon: "knife", armour: null });
    expect(carried(a, "civilian").leftBehind).toContain("pistol");
  });

  it("issues the best the armoury has for a kit", () => {
    const { s, a } = setup();
    expect(issueBest(s, a.id, "tactical")).toBeNull();
    expect(gearOf(a)).toMatchObject({ weapon: "rifle", armour: "tactical-vest", helmet: "helmet" });
    for (const x of ["incendiary", "medkit"] as const) expect(countOf(gearOf(a), x)).toBe(1);
    expect(countOf(gearOf(a), "mag-rifle")).toBe(2);
    const b2 = s.agents[1]!;
    issueBest(s, b2.id, "plainclothes"); // into the low-viz loadout
    expect(gearOf(b2, "lowViz")).toMatchObject({ weapon: "pistol", armour: "soft-vest" }); // nothing better that hides
    expect(gearOf(b2, "lowViz").helmet).toBeUndefined();
    expect(countOf(gearOf(b2, "lowViz"), "medkit")).toBe(1);
    expect(countOf(gearOf(b2), "medkit")).toBe(0);
  });

  it("buys for a base, and a released agent's kit comes back", () => {
    const { s, b, a } = setup();
    s.funds = 10_000;
    expect(placeOrder(s, { items: { rifle: 4 }, info: [], baseId: b.id })).toMatch(/funds/);
    expect(placeOrder(s, { items: { smg: 2 }, info: [], baseId: b.id })).toBeNull();
    expect(stockAt(b, "smg")).toBe(0); // on its way
    s.time += SHIPPING_HOURS * HOUR;
    hourlyTransfers(s);
    expect(stockAt(b, "smg")).toBe(2);
    equip(s, a.id, "weapon", "smg");
    expect(dismiss(s, a.id)).toBeNull();
    expect(stockAt(b, "smg")).toBe(2);
    expect(stockAt(b, "soft-vest")).toBe(2); // one from each loadout
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
    const hurt = team.find((a) => a.hp > 0 && a.hp < a.vitality);
    if (hurt) {
      const hp = hurt.hp;
      expect(useMedkits(s, team, "tactical")).toBeGreaterThan(0);
      expect(hurt.hp).toBeGreaterThan(hp);
      expect(hurt.hp - hp).toBeLessThanOrEqual(MEDKIT_HEAL * 4);
    }
  });

  it("rearranges kit, swapping what's in the hand", () => {
    const { s, a } = setup();
    fromArmoury(s, a.id, "rifle", { in: "pack", x: 0, y: 0 });
    expect(moveGear(s, a.id, { in: "pack", x: 1, y: 3 }, { slot: "weapon" })).toBeNull();
    expect(gearOf(a).weapon).toBe("rifle");
    expect(stowedAt(gearOf(a), "pack", 0, 0)?.item).toBe("pistol"); // the pistol went where the rifle was
    expect(moveGear(s, a.id, { in: "pocket0", x: 0, y: 0 }, { slot: "armour" })).toMatch(
      /doesn't go/,
    );
  });

  it("brings home what was carried out, and what the kit left behind", () => {
    const { s, a } = setup();
    equip(s, a.id, "weapon", "rifle");
    fromArmoury(s, a.id, "incendiary");
    // Tactical in civilian clothes: everything but a knife stays home. In the fight they picked up a pistol.
    a.gear = cloneGear(gearOf(a, "lowViz"));
    const fought = carried(a, "civilian").gear;
    fought.weapon = "pistol";
    bringHome(s, a, "civilian", fought);
    expect(gearOf(a, "lowViz").weapon).toBe("pistol");
    expect(countOf(gearOf(a, "lowViz"), "pistol")).toBe(2); // theirs went back in the backpack
    expect(countOf(gearOf(a, "lowViz"), "mag-pistol")).toBe(2);
  });
});

describe("two loadouts each: Low viz and Full tactical", () => {
  it("the team's kit picks the loadout; low viz takes plainclothes things only", () => {
    const { s, b, a } = setup();
    const founders = newCampaign("inquisitor", 9).agents; // the founding armoury kits the founders out
    expect(
      founders.every(
        (x) => gearOf(x).weapon === "rifle" && gearOf(x, "lowViz").weapon === "pistol",
      ),
    ).toBe(true);
    equip(s, a.id, "weapon", "rifle");
    fromArmoury(s, a.id, "medkit");
    expect(carried(a, "tactical").weapon).toBe("rifle");
    expect(carried(a, "plainclothes").weapon).toBe("pistol");
    expect(carried(a, "civilian").weapon).toBe("knife");
    expect(fromArmoury(s, a.id, "rifle", { slot: "weapon" }, "lowViz")).toMatch(/low viz/i);
    expect(fromArmoury(s, a.id, "medkit", undefined, "lowViz")).toBeNull();
    expect(carried(a, "plainclothes").stowed.some((x) => x.item === "medkit")).toBe(true);
    expect(carried(a, "tactical").stowed.filter((x) => x.item === "medkit")).toHaveLength(1);
    // Released: both loadouts go back to the armoury.
    const before = stockAt(b, "pistol");
    const pistols = allGear(a).filter((x) => x === "pistol").length;
    returnGear(s, a);
    expect(stockAt(b, "pistol")).toBe(before + pistols);
  });

  it("uses up and brings home in the loadout that went", () => {
    const { s, a } = setup();
    fromArmoury(s, a.id, "medkit", undefined, "lowViz");
    fromArmoury(s, a.id, "medkit");
    a.hp = 10;
    useMedkits(s, [a], "plainclothes");
    expect(countOf(gearOf(a, "lowViz"), "medkit")).toBe(0);
    expect(countOf(gearOf(a), "medkit")).toBe(1);
    // A carbine picked up in a plainclothes fight goes to the armoury, not into low viz; a magazine stays.
    const fought = {
      ...gearOf(a, "lowViz"),
      stowed: [
        ...gearOf(a, "lowViz").stowed,
        { item: "mag-rifle" as const, in: "pack" as const, x: 0, y: 0 },
        { item: "rifle" as const, in: "pack" as const, x: 2, y: 0 },
      ],
    };
    const rifles = stockAt(
      s.installations.find((i) => i.kind === "base")!,
      "rifle",
    );
    bringHome(s, a, "plainclothes", fought);
    expect(countOf(gearOf(a, "lowViz"), "mag-rifle")).toBe(1);
    expect(countOf(gearOf(a, "lowViz"), "rifle")).toBe(0);
    expect(
      stockAt(
        s.installations.find((i) => i.kind === "base")!,
        "rifle",
      ),
    ).toBe(rifles + 1);
  });
});
