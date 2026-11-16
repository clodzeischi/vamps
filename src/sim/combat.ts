// Team skill and the fast auto-combat used until the tactical layer exists.
//
// A fight is a few rounds of fire. Agents shoot first (with any advantage the
// approach bought them), then thralls and vampires strike back. Faith blunts
// a vampire's attacks; each agent's weapon and armour (sim/equipment.ts, as
// the kit lets them carry it) decide firepower and protection; incendiaries
// are thrown first, at vampires if there are any. An agent who goes
// down may die. Bullets only put a vampire into torpor, but a team that wins
// the field finishes the job with fire.
import type { StatId } from "../data/agents";
import { KIT, type KitId } from "../data/kit";
import { agentArmour, agentFirepower, carried, useUp } from "./equipment";
import { rng, type Rng } from "./rng";
import type { Agent } from "./state";

/** How good a team is at something: its best member counts most. */
export function teamSkill(agents: readonly Agent[], stat: StatId, kit: KitId): number {
  if (!agents.length) return 0;
  const vals = agents.map((a) => a.stats[stat]);
  const best = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const n = agents.length;
  let v = best * 0.6 + avg * 0.4 + (KIT[kit].bonus[stat] ?? 0);
  if (stat === "tradecraft") v -= 4 * Math.max(0, n - 2); // a crowd is hard to hide
  if (stat === "combat") v += 4 * Math.min(4, n - 1); // and easy to fight with
  return v;
}

export interface Threat {
  thralls: number;
  vampires: number;
}

/** What research and engineering add to a fight (sim/research.ts). */
export interface CombatMods {
  /** Added to the kit's armour. */
  armour?: number;
  /** Multiplies damage dealt to vampires. */
  vampireDamage?: number;
  /** Taken off a vampire's chance to hit. */
  vampireHit?: number;
}

export interface FightResult {
  won: boolean;
  rounds: number;
  /** Agent ids. */
  dead: string[];
  wounded: string[];
  thrallsKilled: number;
  vampiresKilled: number;
}

const THRALL = { hp: 22, hit: 0.4, dmg: [6, 13] as const };
const VAMPIRE = { hp: 80, hit: 0.62, dmg: [14, 26] as const };
/** An incendiary's burn in the auto-combat (twice that to a vampire). */
const INCENDIARY_DAMAGE = 18;

/**
 * Resolves a fight. Mutates the agents' hp. `advantage` (−0.3..0.3) is added
 * to the team's hit chance and taken off the enemy's for the first two rounds:
 * surprise, daylight, a good plan.
 */
export function fight(r: Rng, agents: readonly Agent[], kit: KitId, threat: Threat, advantage: number, mods: CombatMods = {}): FightResult {
  // Each agent's own weapon and armour, as the kit lets them carry it (research plates go into any vest).
  const firepower = new Map(agents.map((a) => [a.id, agentFirepower(a, kit)]));
  const armourOf = new Map(agents.map((a) => { const base = agentArmour(a, kit); return [a.id, Math.min(0.8, base + (base > 0 ? mods.armour ?? 0 : 0))]; }));
  const foes = [
    ...Array.from({ length: threat.thralls }, () => ({ hp: THRALL.hp, vampire: false })),
    ...Array.from({ length: threat.vampires }, () => ({ hp: VAMPIRE.hp, vampire: true })),
  ];
  // Incendiaries go first: at the vampires (fire burns them twice as hard), or at whoever is there.
  for (const a of agents) {
    for (const x of carried(a, kit).utility.filter((y) => y === "incendiary")) {
      const live = foes.filter((f) => f.hp > 0);
      if (!live.length) break;
      const target = live.find((f) => f.vampire) ?? r.pick(live);
      target.hp -= INCENDIARY_DAMAGE * (target.vampire ? 2 : 1);
      useUp(a as Agent, x);
    }
  }
  let thrallsKilledEarly = foes.filter((f) => !f.vampire && f.hp <= 0).length;
  let vampiresKilledEarly = foes.filter((f) => f.vampire && f.hp <= 0).length;
  const down = new Set<string>();
  const standing = () => agents.filter((a) => !down.has(a.id));
  let rounds = 0;
  let won = false;
  let thrallsKilled = thrallsKilledEarly;
  let vampiresKilled = vampiresKilledEarly;
  thrallsKilledEarly = vampiresKilledEarly = 0;

  while (rounds < 10) {
    rounds++;
    const adv = rounds <= 2 ? advantage : 0;
    for (const a of standing()) {
      const live = foes.filter((f) => f.hp > 0);
      if (!live.length) break;
      // Thralls stand in front; the team shoots what is closest.
      const target = live.find((f) => !f.vampire && r.chance(0.7)) ?? r.pick(live);
      const hit = Math.min(0.95, Math.max(0.1, 0.3 + a.stats.combat / 180 + adv));
      if (r.chance(hit)) {
        target.hp -= r.int(10, 20) * firepower.get(a.id)! * (target.vampire ? (mods.vampireDamage ?? 1) : 1);
        if (target.hp <= 0) target.vampire ? vampiresKilled++ : thrallsKilled++;
      }
    }
    if (foes.every((f) => f.hp <= 0)) {
      won = true;
      break;
    }
    for (const f of foes) {
      if (f.hp <= 0) continue;
      const targets = standing();
      if (!targets.length) break;
      const t = r.pick(targets);
      const def = f.vampire ? VAMPIRE : THRALL;
      const hit = Math.max(0.1, def.hit - adv - (f.vampire ? t.stats.faith / 300 + (mods.vampireHit ?? 0) : 0));
      if (r.chance(hit)) {
        t.hp -= r.int(def.dmg[0], def.dmg[1]) * (1 - armourOf.get(t.id)!);
        if (t.hp <= 0) down.add(t.id);
      }
    }
    // Break off when half the team is down, or everyone is.
    if (down.size === agents.length || (rounds >= 2 && down.size * 2 >= agents.length && down.size > 0)) break;
  }

  const dead: string[] = [];
  const wounded: string[] = [];
  for (const a of agents) {
    if (down.has(a.id)) {
      // Left behind if the team lost the field; otherwise carried out, maybe in time.
      const dies = !won ? r.chance(0.6) : a.hp <= -12 || r.chance(0.3);
      if (dies) {
        dead.push(a.id);
        continue;
      }
      a.hp = 1;
    }
    if (a.hp < a.stats.vitality * 0.75) wounded.push(a.id);
  }
  return { won, rounds, dead, wounded, thrallsKilled, vampiresKilled };
}

/** Share of fights like this the team wins, by simulation on copies (doesn't touch the game's RNG). */
export function winChance(agents: readonly Agent[], kit: KitId, threat: Threat, advantage: number, seed = 1, mods: CombatMods = {}): number {
  const r = rng({ rng: seed });
  const trials = 60;
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const copies = agents.map((a) => ({ ...a, stats: { ...a.stats }, ...(a.gear ? { gear: { ...a.gear, utility: [...a.gear.utility] } } : {}) }));
    if (fight(r, copies, kit, threat, advantage, mods).won) wins++;
  }
  return wins / trials;
}
