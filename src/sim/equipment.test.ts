import { describe, expect, it } from "vitest";
import { FOUNDING_ARMOURY, MEDKIT_HEAL } from "../data/equipment";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { winChance } from "./combat";
import { buyBlocker, buyItem, carried, equip, gearOf, issueBest, stockAt, useMedkits } from "./equipment";
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
    for (const a of s.agents) expect(gearOf(a)).toEqual({ weapon: "pistol", armour: "soft-vest", utility: [] });
    expect(b.armoury).toEqual(FOUNDING_ARMOURY);
  });

  it("equips from the armoury and puts back what was there", () => {
    const { s, b, a } = setup();
    expect(equip(s, a.id, "weapon", "rifle")).toBeNull();
    expect(gearOf(a).weapon).toBe("rifle");
    expect(stockAt(b, "rifle")).toBe(FOUNDING_ARMOURY.rifle! - 1);
    expect(stockAt(b, "pistol")).toBe(1); // the pistol went back
    expect(equip(s, a.id, "weapon", "smg")).toMatch(/None/);
    expect(equip(s, a.id, "utility", "incendiary", 0)).toBeNull();
    expect(equip(s, a.id, "utility", "medkit", 1)).toBeNull();
    expect(gearOf(a).utility).toEqual(["incendiary", "medkit"]);
    expect(equip(s, a.id, "utility", null, 0)).toBeNull();
    expect(gearOf(a).utility).toEqual(["medkit"]);
    expect(equip(s, a.id, "armour", "rifle")).toMatch(/doesn't go/);
  });

  it("takes along only what the kit allows; a knife when the weapon stays home", () => {
    const { s, a } = setup();
    equip(s, a.id, "weapon", "rifle");
    equip(s, a.id, "utility", "incendiary", 0);
    expect(carried(a, "tactical")).toMatchObject({ weapon: "rifle", armour: "soft-vest", utility: ["incendiary"], leftBehind: [] });
    expect(carried(a, "plainclothes")).toMatchObject({ weapon: "knife", armour: "soft-vest", utility: [], leftBehind: ["rifle", "incendiary"] });
    expect(carried(a, "civilian")).toMatchObject({ weapon: "knife", armour: null });
  });

  it("issues the best the armoury has for a kit", () => {
    const { s, a } = setup();
    expect(issueBest(s, a.id, "tactical")).toBeNull();
    expect(gearOf(a)).toMatchObject({ weapon: "rifle", armour: "tactical-vest" });
    expect(gearOf(a).utility).toEqual(["incendiary", "medkit"]);
    const b2 = s.agents[1]!;
    issueBest(s, b2.id, "plainclothes");
    expect(gearOf(b2)).toMatchObject({ weapon: "pistol", armour: "soft-vest", utility: ["medkit"] }); // nothing better that hides
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
    expect(gearOf(team[0]!).utility).toContain("incendiary");
    fight(rng({ rng: 5 }), team, "tactical", threat, 0);
    expect(team.every((a) => !gearOf(a).utility.includes("incendiary"))).toBe(true);
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
    expect(back.installations.find((i) => i.kind === "base")!.armoury).toEqual(FOUNDING_ARMOURY);
  });
});
