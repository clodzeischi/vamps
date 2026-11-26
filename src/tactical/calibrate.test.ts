// Balance (docs/design/tactical.md): tactical battles played by the bot,
// against the auto-combat's odds for the same team and threat. Run with
//   CALIBRATE=1 npx vitest run src/tactical/calibrate.test.ts
import { describe, expect, it } from "vitest";
import type { Agent } from "../sim/core/state";
import { winChance } from "../sim/missions/combat";
import type { KitId } from "../data/kit";
import { agentAim, agentTu, newSkirmish, type SquadMember } from "./battle";
import { playOut } from "./bot";
import { generateMap, type SiteSize } from "./map/mapgen";
import { kitArmour, kitGear, loadout } from "./battle";

/** A recruit-grade team: stats in the middle of the recruit ranges. */
function team(n: number, kit: KitId, combat = 40): { sim: Agent[]; squad: SquadMember[] } {
  const stats = { combat, tradecraft: 40, insight: 40, faith: 55, vitality: 40 };
  const weapons = loadout(kit === "civilian" ? "civilian" : kit, n);
  // The same kit for the auto-combat (per-agent gear, sim/people/equipment.ts).
  const gears = weapons.map((w) => kitGear(kit, w));
  const sim = Array.from(
    { length: n },
    (_, i) =>
      ({
        id: `a${i}`,
        role: "operator",
        name: `A${i}`,
        female: false,
        aptitudes: {
          combat: stats.combat,
          tradecraft: stats.tradecraft,
          insight: stats.insight,
          faith: stats.faith,
        },
        vitality: stats.vitality,
        hp: stats.vitality,
        gear: gears[i]!,
      }) as unknown as Agent,
  );
  const squad = sim.map((a, i) => ({
    id: a.id,
    name: a.name,
    aim: agentAim(stats.combat),
    hp: stats.vitality,
    maxHp: stats.vitality,
    faith: stats.faith,
    tradecraft: stats.tradecraft,
    insight: stats.insight,
    gear: gears[i]!,
    armour: kitArmour(gears[i]!),
    tu: agentTu(stats.combat),
  }));
  return { sim, squad };
}

export interface Scenario {
  label: string;
  size: SiteSize;
  thralls: number;
  vampires: number;
  agents: number;
  kit: KitId;
  night: boolean;
  advantage: number;
}

export const SCENARIOS: Scenario[] = [
  {
    label: "nest, night",
    size: "nest",
    thralls: 3,
    vampires: 1,
    agents: 4,
    kit: "tactical",
    night: true,
    advantage: 0.05,
  },
  {
    label: "den, midday",
    size: "den",
    thralls: 4,
    vampires: 1,
    agents: 4,
    kit: "tactical",
    night: false,
    advantage: 0.15,
  },
  {
    label: "den, night",
    size: "den",
    thralls: 4,
    vampires: 2,
    agents: 4,
    kit: "tactical",
    night: true,
    advantage: 0.05,
  },
  {
    label: "haven, night",
    size: "haven",
    thralls: 5,
    vampires: 3,
    agents: 6,
    kit: "tactical",
    night: true,
    advantage: 0.05,
  },
  {
    label: "brawl, plainclothes",
    size: "nest",
    thralls: 2,
    vampires: 1,
    agents: 2,
    kit: "plainclothes",
    night: true,
    advantage: 0,
  },
  {
    label: "lair, 8 agents",
    size: "lair",
    thralls: 14,
    vampires: 6,
    agents: 8,
    kit: "tactical",
    night: true,
    advantage: 0.05,
  },
];

export function measure(sc: Scenario, games: number) {
  const { sim, squad } = team(sc.agents, sc.kit);
  let won = 0,
    lost = 0,
    dead = 0;
  for (let seed = 1; seed <= games; seed++) {
    const map = generateMap({
      setting: sc.size === "lair" ? "lair" : seed % 3 ? "urban" : "rural",
      size: sc.size,
      seed: seed * 7 + 1,
      thralls: sc.thralls,
      vampires: sc.vampires,
    });
    const b = newSkirmish(map, seed, {
      bloodline: "sahel",
      night: sc.night,
      moon: Number(
        (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
          .MOON ?? 0.5,
      ),
      kit: sc.kit === "civilian" ? "civilian" : sc.kit,
      arrival: "helicopter",
      squad: squad.map((s) => ({ ...s })),
    });
    const res = playOut(b, sc.size === "lair" ? 60 : 40);
    if (res === "won") won++;
    else lost++;
    dead += b.units.filter((u) => u.kind === "agent" && !u.alive).length;
  }
  const auto = winChance(
    sim,
    sc.kit,
    { thralls: sc.thralls, vampires: sc.vampires },
    sc.advantage,
    7,
  );
  return { tactical: won / games, auto, deadPerGame: dead / games };
}

describe.skipIf(
  !(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CALIBRATE,
)("calibration", () => {
  it("tactical (bot) vs auto-combat", () => {
    const rows = SCENARIOS.map((sc) => ({ sc, ...measure(sc, sc.size === "lair" ? 10 : 40) }));
    for (const r of rows)
      console.log(
        `${r.sc.label.padEnd(22)} tactical ${(r.tactical * 100).toFixed(0).padStart(3)}%  auto ${(r.auto * 100).toFixed(0).padStart(3)}%  dead/game ${r.deadPerGame.toFixed(2)}`,
      );
    expect(rows.length).toBe(SCENARIOS.length);
  }, 600_000);
});
