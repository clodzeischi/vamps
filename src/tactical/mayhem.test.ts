import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map/map";
import {
  agents,
  blastArea,
  commandShoot,
  DEFAULT_OPTIONS,
  endTurn,
  enemies,
  ENEMY_TU,
  MAYHEM,
  newSkirmish,
  VAMPIRE,
  wreckVehicles,
  type Battle,
} from "./battle";
import { generateMap } from "./map/mapgen";
import { WEAPONS } from "./rules";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function field(): BattleMap {
  const m = emptyMap(16, 16, 1, 0, "urban", 1);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = Array.from({ length: 9 }, () => P(2, 2));
  return m;
}

/** A rocketeer at (2, 2) and thralls round (10, 2), all in the open. */
function range(): Battle {
  const m = field();
  m.spawns = [P(10, 2), P(11, 2), P(10, 3), P(12, 2)].map((p) => ({
    ...p,
    side: "thrall" as const,
  }));
  const b = newSkirmish(m, 5, { ...DEFAULT_OPTIONS, night: false, arrival: "jet" });
  b.units = b.units.filter((u, i) => u.side !== "agent" || i === 0);
  Object.assign(b.units[0]!, P(2, 2), { weapon: "rpg", ammo: 1, maxTu: 100, tu: 100, aim: 200 });
  for (const e of enemies(b)) Object.assign(e, { hp: 500, maxHp: 500 });
  return b;
}

describe("rockets", () => {
  it("go off where they land: everyone the blast reaches is hurt, nobody past it", () => {
    // Rockets scatter like any round: try until one lands among the thralls.
    for (let seed = 1; seed < 60; seed++) {
      const b = range();
      b.rng = seed * 7919;
      const res = commandShoot(b, agents(b)[0]!, enemies(b)[0]!, "snap");
      expect(res).not.toBeTypeOf("string");
      const events = res as {
        kind: string;
        at?: Pt3;
        hits?: { unit: string; damage: number }[];
        tiles?: Pt3[];
      }[];
      const shot = events.find((e) => e.kind === "shot")!;
      const blast = events.find((e) => e.kind === "blast");
      expect(agents(b)[0]!.ammo).toBe(0);
      if (!blast) continue; // flew off the map
      // The ground it reached burns.
      for (const q of blast.tiles!)
        expect(b.fire[(q.z * b.map.h + q.y) * b.map.w + q.x]).toBeGreaterThan(0);
      // Hurt: exactly those standing where the blast reached, none for more than the weapon's most.
      const inBlast = (u: Pt3) =>
        blast.tiles!.some((q) => q.x === u.x && q.y === u.y && q.z === u.z);
      expect(shot.hits!.map((h) => h.unit).sort()).toEqual(
        b.units
          .filter((u) => inBlast(u))
          .map((u) => u.id)
          .sort(),
      );
      for (const h of shot.hits!) expect(h.damage).toBeLessThanOrEqual(WEAPONS.rpg.damage[1]);
      if (shot.hits!.length > 1) return; // one rocket, several hurt
    }
    throw new Error("no rocket landed among the thralls in 60 tries");
  });

  it("don't reach through walls", () => {
    const m = field();
    for (let y = 0; y < 16; y++) setTile(m, 6, y, 0, T.WALL, "brick");
    const b = newSkirmish(m, 5, { ...DEFAULT_OPTIONS, night: false, arrival: "jet" });
    const area = blastArea(b, P(5, 5), 2);
    expect(area.some(({ q }) => q.x >= 6)).toBe(false);
    expect(area.find(({ q }) => q.x === 5 && q.y === 5)!.d).toBe(0);
  });
});

describe("vehicles", () => {
  it("burn out where fire reaches them, and only there", () => {
    const m = field();
    m.vehicles = [
      { x: 4, y: 4, z: 0, w: 3, h: 2, kind: "car", front: 1, under: "pavement", paint: 3 },
      { x: 10, y: 4, z: 0, w: 2, h: 4, kind: "suv", front: -1, under: "pavement", paint: 5 },
    ];
    wreckVehicles(m, [P(6, 5), P(8, 8)]);
    expect(m.vehicles.map((v) => !!v.wrecked)).toEqual([true, false]);
  });
});

describe("balls to the walls", () => {
  it("arms both sides heavily, wakes everyone, and starts with the town burning", () => {
    const m = generateMap({
      setting: "urban",
      size: "den",
      seed: 7,
      thralls: 4,
      vampires: 2,
      civilians: 2,
    });
    const b = newSkirmish(m, 7, {
      ...DEFAULT_OPTIONS,
      night: true,
      kit: "plainclothes",
      arrival: "helicopter",
      mayhem: true,
    });
    expect(agents(b).map((a) => a.weapon)).toEqual(MAYHEM.squad);
    for (const e of enemies(b)) {
      expect(e.alerted).toBe(true);
      expect(WEAPONS[e.weapon].melee).toBe(false);
    }
    const vamps = enemies(b).filter((e) => e.kind === "vampire" && !e.elder);
    expect(vamps.length).toBeGreaterThan(0);
    for (const v of vamps) {
      expect(v.maxHp).toBe(VAMPIRE.hp * MAYHEM.vampireHp);
      expect(v.maxTu).toBe(Math.round(ENEMY_TU.vampire * MAYHEM.vampireTu));
    }
    expect(Object.keys(b.fire).length).toBeGreaterThan(5);
    // Every car set alight starts out burnt out.
    for (const v of b.map.vehicles ?? [])
      if (b.fire[(v.z * m.h + v.y) * m.w + v.x]) expect(v.wrecked).toBe(true);
    // Nobody starts in the fire.
    for (const u of b.units) expect(b.fire[(u.z * m.h + u.y) * m.w + u.x]).toBeUndefined();
  });

  it("runs turn after turn on every ground, the enemy firing machine guns and rockets", () => {
    let blasts = 0,
      shots = 0;
    for (const setting of ["urban", "rural", "apartments", "industrial"] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const m = generateMap({
          setting,
          size: "den",
          seed,
          thralls: 5,
          vampires: 2,
          civilians: 2,
        });
        const b = newSkirmish(m, seed, {
          ...DEFAULT_OPTIONS,
          night: seed % 2 === 0,
          arrival: "helicopter",
          mayhem: true,
        });
        for (let t = 0; t < 6 && !b.result; t++) {
          const ev = endTurn(b);
          blasts += ev.filter((e) => e.kind === "blast").length;
          shots += ev.filter((e) => e.kind === "shot").length;
        }
      }
    expect(shots).toBeGreaterThan(0);
    expect(blasts).toBeGreaterThan(0);
  }, 30_000); // 16 battles: ~2.4 s here, past the 5 s default on CI runners
});
