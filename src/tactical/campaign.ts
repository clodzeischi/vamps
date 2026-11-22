// From a campaign mission to a battle and back (docs/WEB_PORT.md 3.11, T4).
//
// The battle uses the mission's own agents (their stats and wounds), the
// kit they flew out with, what research has given them, the site they hit
// (its size and numbers), its bloodline, the local hour (night or day), and
// how they came: a helicopter lands on the map and is heard; a jet or a
// hired flight means arriving by road, and a quiet team starts concealed.
// The same mission always gets the same map.
import { carried } from "../sim/equipment";
import { missionAgents, SITE_KINDS, type TacticalOutcome, missionCraft } from "../sim/missions";
import { combatMods } from "../sim/research";
import type { GameState, Mission } from "../sim/state";
import { DAY, HOUR } from "../sim/time";
import { agentAim, agentTu, craft, isDown, kitArmour, newSkirmish, type Battle, type SquadMember } from "./battle";
import type { Setting } from "./map";
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

/**
 * Snow on the ground: in winter (December to February north of the equator,
 * June to August south of it, a month either side far from it), likelier
 * the farther from the equator; none within 35° of it.
 */
export function snowy(time: number, lat: number, seed: number): boolean {
  const month = new Date(time).getUTCMonth();
  const north = lat >= 0, a = Math.abs(lat);
  const deep = north ? [11, 0, 1].includes(month) : [5, 6, 7].includes(month);
  const edge = north ? [10, 2].includes(month) : [4, 8].includes(month);
  const chance = deep ? Math.min(1, (a - 35) / 20) : edge && a > 48 ? (a - 48) / 20 : 0;
  return chance > 0 && ((seed >>> 8) % 100) / 100 < chance;
}

/**
 * Rain (a drizzle, wet streets): about one battle in four where there's no
 * snow, a little likelier far from the tropics' dry belts. The look only.
 */
export function rainy(lat: number, seed: number): boolean {
  const a = Math.abs(lat);
  const chance = a < 12 ? 0.3 : a < 32 ? 0.15 : 0.28;
  return ((seed >>> 16) % 100) / 100 < chance;
}

/** The battle a mission's pending fight becomes. */
export function battleForMission(s: GameState, m: Mission): { battle: Battle; title: string; night: boolean } {
  const pending = m.battle!;
  const seed = hash(`${m.id}:${pending.rng}`);
  const size: SiteSize = pending.site === "nest" || !pending.site ? "nest" : pending.site === "den" ? "den" : pending.site === "lair" ? "lair" : "haven";
  // Where: a rescue is mostly from a hospital or a supermarket in town; otherwise
  // mostly town or country, now and then an apartment block or a works yard.
  const roll = seed % 20;
  const landmark: "hospital" | "store" | undefined = pending.hostage && roll < 14 ? (roll % 2 ? "hospital" : "store") : undefined;
  const setting: Setting = size === "lair" ? (m.bloodline === "carcassonne" ? "montsegur" : "lair")
    : landmark ? "urban" : roll < 11 ? "urban" : roll < 13 ? "apartments" : roll < 15 ? "industrial" : "rural";
  const map = generateMap({
    setting, size, seed, thralls: pending.thralls, vampires: pending.vampires, civilians: setting === "urban" || setting === "apartments" ? 2 : 0,
    basement: pending.site ? pending.site !== "nest" || seed % 2 === 0 : false,
    landmark, winter: size !== "lair" && snowy(s.time, m.pos.lat, seed), rain: size !== "lair" && rainy(m.pos.lat, seed),
  });
  const mods = combatMods(s, m.kit);
  const people = missionAgents(s, m);
  const squad: SquadMember[] = people.map((a) => {
    const { gear } = carried(a, m.kit);
    // HP is Vitality; a wounded agent goes in with what they have left.
    const maxHp = a.stats.vitality;
    return {
      id: a.id,
      name: `${a.sister ? "Sr." : "Br."} ${a.name}`,
      aim: agentAim(a.stats.combat),
      maxHp,
      hp: Math.max(1, Math.min(maxHp, Math.round(a.hp))),
      faith: a.stats.faith,
      tradecraft: a.stats.tradecraft,
      insight: a.stats.insight,
      gear,
      armour: kitArmour(gear, mods.armour ?? 0),
      tu: agentTu(a.stats.combat),
    };
  });
  const craft = missionCraft(s, m).find((x) => x.kind === "helicopter") ?? s.aircraft.find((x) => x.id === m.aircraftId);
  const night = isNight(s.time, m.pos.lon);
  const battle = newSkirmish(map, seed, {
    bloodline: m.bloodline,
    night,
    kit: m.kit,
    arrival: craft?.kind === "helicopter" ? "helicopter" : "jet",
    squad,
    loot: pending.site ? LOOT_CRATES[pending.site] : 0,
    hostage: !!pending.hostage,
    mods: { vampireDamage: mods.vampireDamage ?? 1, vampireAim: Math.round((mods.vampireHit ?? 0) * 100) },
  });
  const title = pending.site ? `${SITE_KINDS[pending.site].name}, ${m.city}` : m.title;
  return { battle, title, night };
}

/** Crates of what a site kept, by site. */
export const LOOT_CRATES = { nest: 2, den: 3, haven: 4, lair: 5 } as const;

/**
 * The share of the loot that comes home: all of it if the helicopter is
 * still on its pad when the site is taken; otherwise the crates in the
 * hands of agents who are alive at the win, or who got out (evacuated).
 */
export function lootShare(b: Battle): number {
  if (!b.loot.length) return 0;
  if (b.result === "won" && craft(b)) return 1;
  const out = b.loot.filter((l) => {
    const u = l.by ? b.units.find((x) => x.id === l.by) : undefined;
    return u && u.alive && (u.evacuated || b.result === "won");
  }).length;
  return out / b.loot.length;
}

/** A rescue: freed and alive at the win, or got out. */
function hostageFate(b: Battle): "saved" | "lost" | null {
  const h = b.units.find((u) => u.kind === "hostage");
  if (!h) return null;
  return h.alive && h.side === "agent" && (h.evacuated || b.result === "won") ? "saved" : "lost";
}

/** What a finished battle hands back to the mission. */
export function battleOutcome(b: Battle): TacticalOutcome {
  const ours = b.units.filter((u) => u.kind === "agent");
  // The down come home with a win, badly hurt; left on the field otherwise, they are lost.
  const lost = (a: (typeof ours)[number]) => !a.alive || (isDown(a) && b.result !== "won");
  const health: Record<string, number> = {};
  for (const a of ours) if (!lost(a)) health[a.id] = isDown(a) ? 0.1 : a.hp / a.maxHp;
  return {
    won: b.result === "won",
    turns: b.turn,
    dead: ours.filter(lost).map((a) => a.id),
    health,
    thrallsKilled: b.units.filter((u) => u.kind === "thrall" && !u.alive).length,
    vampiresKilled: b.units.filter((u) => u.kind === "vampire" && !u.alive).length,
    captured: b.units.filter((u) => u.captured).length,
    craftLost: b.units.some((u) => u.kind === "helicopter" && !u.alive),
    lootShare: b.loot.length ? lootShare(b) : null,
    hostage: hostageFate(b),
    gear: Object.fromEntries(ours.filter((a) => !lost(a)).map((a) => [a.id, { ...a.gear, stowed: a.gear.stowed.map((x) => ({ ...x })) }])),
    // With a win, the team picks up its own kit from the ground (what fell with the dead, what was dropped).
    recovered: b.result === "won" ? b.floor.filter((f) => f.ours).map((f) => f.item) : [],
  };
}
