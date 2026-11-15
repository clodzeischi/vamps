// From a campaign mission to a battle and back (docs/WEB_PORT.md 3.11, T4).
//
// The battle uses the mission's own agents (their stats and wounds), the
// kit they flew out with, what research has given them, the site they hit
// (its size and numbers), its bloodline, the local hour (night or day), and
// how they came: a helicopter lands on the map and is heard; a jet or a
// hired flight means arriving by road, and a quiet team starts concealed.
// The same mission always gets the same map.
import { KIT } from "../data/kit";
import { missionAgents, SITE_KINDS, type TacticalOutcome } from "../sim/missions";
import { combatMods } from "../sim/research";
import type { GameState, Mission } from "../sim/state";
import { DAY, HOUR } from "../sim/time";
import { loadout, newSkirmish, type Battle, type SquadMember } from "./battle";
import { generateMap, type SiteSize } from "./mapgen";

/** A string's hash, for seeding a mission's map. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The local hour at a longitude. */
export function localHour(time: number, lon: number): number {
  const utc = (time % DAY) / HOUR;
  return (((utc + lon / 15) % 24) + 24) % 24;
}

export const isNight = (time: number, lon: number) => {
  const h = localHour(time, lon);
  return h < 6 || h >= 19;
};

/** The battle a mission's pending fight becomes. */
export function battleForMission(s: GameState, m: Mission): { battle: Battle; title: string; night: boolean } {
  const pending = m.battle!;
  const seed = hash(`${m.id}:${pending.rng}`);
  const size: SiteSize = pending.site === "nest" || !pending.site ? "nest" : pending.site === "den" ? "den" : "haven";
  const urban = seed % 10 < 7;
  const map = generateMap({
    setting: urban ? "urban" : "rural", size, seed, thralls: pending.thralls, vampires: pending.vampires, civilians: urban ? 2 : 0,
    basement: pending.site ? pending.site !== "nest" || seed % 2 === 0 : false,
  });
  const mods = combatMods(s, m.kit);
  const kit = KIT[m.kit];
  const people = missionAgents(s, m);
  const weapons = loadout(m.kit, people.length);
  const squad: SquadMember[] = people.map((a, i) => {
    const maxHp = 3 + Math.round(a.stats.vitality / 10);
    return {
      id: a.id,
      name: `${a.sister ? "Sr." : "Br."} ${a.name}`,
      aim: 40 + Math.round(a.stats.combat / 2),
      maxHp,
      hp: Math.max(1, Math.round((maxHp * a.hp) / a.stats.vitality)),
      faith: a.stats.faith,
      tradecraft: a.stats.tradecraft,
      insight: a.stats.insight,
      weapon: weapons[i]!,
      armour: Math.round((kit.armour + (mods.armour ?? 0)) * 2.5),
      incendiaries: m.kit === "tactical" ? 1 : 0,
    };
  });
  const craft = s.aircraft.find((x) => x.id === m.aircraftId);
  const night = isNight(s.time, m.pos.lon);
  const battle = newSkirmish(map, seed, {
    bloodline: m.bloodline,
    night,
    kit: m.kit,
    arrival: craft?.kind === "helicopter" ? "helicopter" : "jet",
    squad,
    mods: { vampireDamage: mods.vampireDamage ?? 1, vampireAim: Math.round((mods.vampireHit ?? 0) * 100) },
  });
  const title = pending.site ? `${SITE_KINDS[pending.site].name}, ${m.city}` : m.title;
  return { battle, title, night };
}

/** What a finished battle hands back to the mission. */
export function battleOutcome(b: Battle): TacticalOutcome {
  const ours = b.units.filter((u) => u.side === "agent");
  const health: Record<string, number> = {};
  for (const a of ours) if (a.alive) health[a.id] = a.hp / a.maxHp;
  return {
    won: b.result === "won",
    turns: b.turn,
    dead: ours.filter((a) => !a.alive).map((a) => a.id),
    health,
    thrallsKilled: b.units.filter((u) => u.kind === "thrall" && !u.alive).length,
    vampiresKilled: b.units.filter((u) => u.kind === "vampire" && !u.alive).length,
    captured: b.units.filter((u) => u.captured).length,
  };
}
