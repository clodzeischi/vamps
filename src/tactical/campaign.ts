// From a campaign mission to a battle and back (docs/design/tactical.md).
//
// The battle uses the mission's own agents (their stats and wounds), the
// kit they flew out with, what research has given them, the site they hit
// (its size and numbers), its bloodline, the local hour (night or day), and
// how they came: a helicopter drops them on the map and is heard; a jet or a
// hired flight means arriving by road, and a quiet team starts concealed.
// The same mission always gets the same map.
import { carried } from "../sim/people/equipment";
import { agentName, craftById } from "../sim/core/state";
import { missionAgents, SITE_KINDS } from "../sim/missions/common";
import { type TacticalOutcome } from "../sim/missions/plays";
import { missionCraft } from "../sim/missions/dispatch";
import { combatMods, researched } from "../sim/base/research";
import { RESEARCH_EFFECTS } from "../data/research";
import { AGNES } from "../data/bloodlines";
import { feedingOf, feralShare } from "../sim/campaign/feeding";
import type { GameState, Mission } from "../sim/core/state";
import { isNight, moonPhase } from "../sim/core/time";
import { agentAim, agentTu, isDown, type Battle, type SquadMember } from "./battle";
import { kitArmour, newSkirmish } from "./setup";
import type { Setting } from "./map/map";
import { generateMap, type SiteSize } from "./map/mapgen";

/** A string's hash, for seeding a mission's map. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Snow on the ground: in winter (December to February north of the equator,
 * June to August south of it, a month either side far from it), likelier
 * the farther from the equator; none within 35° of it.
 */
function snowy(time: number, lat: number, seed: number): boolean {
  const month = new Date(time).getUTCMonth();
  const north = lat >= 0,
    a = Math.abs(lat);
  const deep = north ? [11, 0, 1].includes(month) : [5, 6, 7].includes(month);
  const edge = north ? [10, 2].includes(month) : [4, 8].includes(month);
  const chance = deep ? Math.min(1, (a - 35) / 20) : edge && a > 48 ? (a - 48) / 20 : 0;
  return chance > 0 && ((seed >>> 8) % 100) / 100 < chance;
}

/**
 * Rain (a drizzle, wet streets): about one battle in four where there's no
 * snow, a little likelier far from the tropics' dry belts. The look only.
 */
function rainy(lat: number, seed: number): boolean {
  const a = Math.abs(lat);
  const chance = a < 12 ? 0.3 : a < 32 ? 0.15 : 0.28;
  return ((seed >>> 16) % 100) / 100 < chance;
}

/** The battle a mission's pending fight becomes. */
export function battleForMission(
  s: GameState,
  m: Mission,
): { battle: Battle; title: string; night: boolean } {
  const pending = m.battle!;
  const seed = hash(`${m.id}:${pending.rng}`);
  const size: SiteSize =
    pending.site === "nest" || !pending.site
      ? "nest"
      : pending.site === "den"
        ? "den"
        : pending.site === "lair"
          ? "lair"
          : "haven";
  // Where: a rescue is mostly from a hospital or a supermarket in town; otherwise
  // mostly town or country, now and then an apartment block or a works yard.
  const roll = seed % 20;
  const landmark: "hospital" | "store" | undefined =
    pending.hostage && roll < 14 ? (roll % 2 ? "hospital" : "store") : undefined;
  const setting: Setting =
    size === "lair"
      ? m.bloodline === "carcassonne"
        ? "montsegur"
        : "lair"
      : landmark
        ? "urban"
        : roll < 11
          ? "urban"
          : roll < 13
            ? "apartments"
            : roll < 15
              ? "industrial"
              : "rural";
  const map = generateMap({
    setting,
    size,
    seed,
    thralls: pending.thralls,
    vampires: pending.vampires,
    civilians: setting === "urban" || setting === "apartments" ? 2 : 0,
    basement: pending.site ? pending.site !== "nest" || seed % 2 === 0 : false,
    landmark,
    // A rescue is an extraction: the long map, in at one end, the prisoner at the other.
    layout: pending.hostage && size !== "lair" ? "long" : "square",
    winter: size !== "lair" && snowy(s.time, m.pos.lat, seed),
    rain: size !== "lair" && rainy(m.pos.lat, seed),
  });
  const mods = combatMods(s, m.kit, m.bloodline);
  const people = missionAgents(s, m);
  const squad: SquadMember[] = people.map((a) => {
    const { gear } = carried(a, m.kit);
    // HP is Vitality; a wounded agent goes in with what they have left.
    const maxHp = a.vitality;
    return {
      id: a.id,
      name: `${agentName(a)}`,
      aim: agentAim(a.aptitudes.combat),
      maxHp,
      hp: Math.max(1, Math.min(maxHp, Math.round(a.hp))),
      faith: a.aptitudes.faith,
      tradecraft: a.aptitudes.tradecraft,
      insight: a.aptitudes.insight,
      gear,
      armour: kitArmour(gear),
      tu: agentTu(a.aptitudes.combat),
    };
  });
  const craft =
    missionCraft(s, m).find((x) => x.kind === "helicopter") ?? craftById(s, m.aircraftId);
  const night = isNight(s.time, m.pos.lon);
  const strain = s.bloodlines[m.bloodline]?.strain;
  const battle = newSkirmish(map, seed, {
    bloodline: m.bloodline,
    night,
    moon: moonPhase(s.time).lit,
    kit: m.kit,
    arrival: craft?.kind === "helicopter" ? "helicopter" : "jet",
    squad,
    loot: pending.site ? LOOT_CRATES[pending.site] : 0,
    hostage: !!pending.hostage,
    mods: {
      vampireDamage: mods.vampireDamage ?? 1,
      vampireAim: Math.round((mods.vampireHit ?? 0) * 100),
      ...(researched(s, "domination-neurology") ? { will: RESEARCH_EFFECTS.will } : {}),
      ...(researched(s, "discernment") ? { discern: true } : {}),
      ...(researched(s, "pheromones") ? { blockers: true } : {}),
      ...(researched(s, "torpor-metabolism") ? { finishLess: RESEARCH_EFFECTS.finishLess } : {}),
    },
    ...(strain
      ? { strain: { silver: strain.silver, band: strain.band, weaknesses: [...strain.weaknesses] } }
      : {}),
    ...(size === "lair" && m.bloodline === AGNES ? { agnes: true } : {}),
    feral: feralShare(feedingOf(s, m.bloodline)),
  });
  const title = pending.site ? `${SITE_KINDS[pending.site].name}, ${m.city}` : m.title;
  return { battle, title, night };
}

/** Crates of what a site kept, by site. */
const LOOT_CRATES = { nest: 2, den: 3, haven: 4, lair: 5 } as const;

/**
 * The share of the loot that comes home: all of it if the site is taken
 * and a helicopter comes back for the team; otherwise the crates in the
 * hands of agents who are alive at the win, or who got out (evacuated).
 */
export function lootShare(b: Battle): number {
  if (!b.loot.length) return 0;
  if (b.result === "won" && b.airlift) return 1;
  const out = b.loot.filter((l) => {
    const u = l.by ? b.units.find((x) => x.id === l.by) : undefined;
    return u && u.alive && (u.evacuated || b.result === "won");
  }).length;
  return out / b.loot.length;
}

/** A rescue: alive at the win (nobody's left to hold them), or freed and got out. */
export function hostageFate(b: Battle): "saved" | "lost" | null {
  const h = b.units.find((u) => u.kind === "hostage");
  if (!h) return null;
  return h.alive && (b.result === "won" || (h.side === "agent" && h.evacuated)) ? "saved" : "lost";
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
    lootShare: b.loot.length ? lootShare(b) : null,
    hostage: hostageFate(b),
    gear: Object.fromEntries(
      ours
        .filter((a) => !lost(a))
        .map((a) => [a.id, { ...a.gear, stowed: a.gear.stowed.map((x) => ({ ...x })) }]),
    ),
    // With a win, the team picks up its own kit from the ground (what fell with the dead, what was dropped).
    recovered:
      b.result === "won"
        ? [
            ...b.floor.filter((f) => f.ours).map((f) => f.item),
            ...(b.drones ?? []).map(() => "isr-drone" as const),
          ]
        : [],
    noticed: [...(b.noticed ?? [])],
  };
}
