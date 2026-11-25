// A battle (docs/design/tactical.md): units on a map, time units (TU) a turn,
// the player's side then the enemy's. An agent's TU come from Combat; a step
// costs TU, and so does every action, a share of the unit's whole allowance
// for weapons (a snap shot, an aimed shot, a blow) or a fixed few for the
// rest. Every command returns the events it caused
// (moves, shots, deaths) for the view to play back; the state is already
// final when it returns.
//
// Vampires are not soldiers with more HP: bullets and blades only put them
// into torpor, from which they rise in a couple of turns unless an agent
// finishes them (the haemolytic agent: their blood turns to gel) or fire or the sun reaches
// them. Some dominate: their will against an agent's Faith. They climb, and
// see in the dark. Quiet teams start concealed.
import { VITALITY_RANGE } from "../data/agents";
import { APTITUDE_ROLL } from "../data/aptitudes";
import { rng, type Rng } from "../sim/rng";
import { breakable, E, edgeAt, edgeFree, edgeSkinAt, idx, inBounds, indoors, isLit, neighbours, setEdge, shutBetween, T, tileAt, walkable, type BattleMap, type Pt3 } from "./map";
import { cellsAlong, flat, walkLine } from "./path";
import {
  adjacent, canSee, coverAgainst, distance, FLANK_CRIT, lineOfSight, sightPoint, DARK_SIGHT, nightSight, SIGHT, VAMPIRE_SIGHT, WEAPONS,
  type Crossing, type ShotOdds, type WeaponId,
} from "./rules";
import { enemyTurn } from "./ai";
import {
  aimPoint, deviate, estimate, figureHeight, muzzle, normals, pointAim, spread, trace,
  type Figure, type M3, type ShotMode,
} from "./ballistics";
import { FIGURE, LEVEL_H, TILE } from "./geometry";
import { traitsOf, type BloodlineTraits } from "./traits";
import { ELDERS } from "../data/people";
import { ITEMS, MEDKIT_HEAL, type ItemId } from "../data/equipment";
import {
  canPut, cloneGear, CONTAINERS, emptyGear, itemAt, moveWithin, packGear, putIn, samePlace, stowAnywhere, stowedOf, takeOut,
  type Gear, type Place, type Stowed,
} from "../sim/inventory";

type UnitKind = "agent" | "thrall" | "vampire" | "civilian" | "hostage";
export type Side = "agent" | "enemy" | "neutral";

export interface Unit extends Pt3 {
  id: string;
  kind: UnitKind;
  side: Side;
  name: string;
  hp: number;
  maxHp: number;
  aim: number;
  /** Agents: nerve against domination. */
  faith: number;
  /** Agents: how close an enemy must come to spot them while concealed. */
  tradecraft: number;
  /** Agents: a sharper eye for a weak spot (crits). */
  insight: number;
  /** Vampires: the force of their domination (0: they can't). */
  will: number;
  /** Time units a turn (agents: 40 + Combat / 2). */
  maxTu: number;
  /** Taken off every hit (not fire). */
  armour: number;
  /** The weapon in hand (from `gear.weapon`; a knife or claws without one). */
  weapon: WeaponId;
  /** Rounds in the weapon in hand. */
  ammo: number;
  /** What the unit wears and carries (sim/inventory.ts); thralls carry their gun. */
  gear: Gear;
  /** Agents: the fire mode chosen for the weapon in hand. */
  mode: ShotMode;
  /** Time units left this turn. */
  tu: number;
  /** Holding TU for reaction fire (agents: set when the turn ends with TU and rounds left). */
  overwatch: boolean;
  /** Agents: moving quietly (slower, harder to spot while concealed). */
  sneak: boolean;
  alive: boolean;
  evacuated: boolean;
  /** Vampires: turns until it rises from torpor (0: up and about). */
  torpor: number;
  /** Agents: under a vampire's will; loses its next turn. */
  dominated: boolean;
  /** Vampires: has tried domination this battle. */
  dominatedOnce: boolean;
  /** Jade Court: can't be seen beyond a few tiles until it strikes. */
  hidden: boolean;
  /** Vampires: taken in torpor, bound and carried off the map (a captive). */
  captured: boolean;
  /** A lair's eldest. */
  elder: boolean;
  /** Agents: down at 0 HP, turns left before bleeding out (0: not bleeding). */
  bleeding: number;
  /** Agents: down, but stabilized: out of the fight, and will live if the team wins or carries on. */
  stable: boolean;
  /** Agents: carrying a crate of what the bloodline kept (loot). */
  carrying: boolean;
  /** Enemies: has it noticed the team? */
  alerted: boolean;
  /** Enemies that start together and wake together. */
  pod: number;
  /** Radians; 0 faces +x. */
  facing: number;
}

export type BattleResult = "won" | "lost" | "aborted";

/** A unit a shot hit: the damage it took (after armour), and whether it was a critical. */
interface ShotHit {
  unit: string;
  damage: number;
  crit: boolean;
}

export type BattleEvent =
  /** `path`: the points walked through, in straight legs (the view rounds the corners). */
  | { kind: "move"; unit: string; path: Pt3[]; seen: boolean }
  /**
   * A shot (or a blow): fired from `from` at `aim` (metres), each round's
   * flight ending at one of `rays`; what it hit, and the damage done. `target`:
   * the unit aimed at (none for a shot forced at a spot). `burst`: one
   * round of a burst (the rounds follow one another, with what each did
   * between them).
   */
  | { kind: "shot"; unit: string; weapon: WeaponId; target?: string; from: M3; aim: M3; rays: M3[]; hits: ShotHit[]; reaction: boolean; melee: boolean; seen: boolean; lean?: Pt3; burst?: boolean }
  | { kind: "throw"; unit: string; at: Pt3; tiles: Pt3[]; lean?: Pt3 }
  /** A closed door opened (it stays open). */
  | { kind: "door"; unit: string; at: Crossing; seen: boolean }
  /** A rocket going off at `at`: the tiles the blast reached (its hurt is in the shot's hits). */
  | { kind: "blast"; unit: string; at: Pt3; tiles: Pt3[]; seen: boolean }
  /** Panes shattered (by a shot or a fire, from `from`, tiles): a glass wall now open, a window now a bare sill. */
  | { kind: "glass"; panes: Crossing[]; from: Pt3 }
  | { kind: "burn"; unit: string; damage: number; why: "fire" | "sun"; seen: boolean }
  | { kind: "torpor"; unit: string; seen: boolean }
  | { kind: "death"; unit: string; text?: string }
  /** `cue`: a sound the view plays with it. */
  | { kind: "status"; unit: string; text: string; seen: boolean; cue?: "reload" }
  | { kind: "turn"; side: Side; turn: number }
  | { kind: "end"; result: BattleResult };

export interface Battle {
  map: BattleMap;
  units: Unit[];
  turn: number;
  side: "agent" | "enemy";
  rng: number;
  result: BattleResult | null;
  night: boolean;
  /** The lit share of the moon, 0 (new) to 1 (full). */
  moon: number;
  /** The team hasn't been seen yet. */
  concealed: boolean;
  bloodline: string;
  /** Burning tiles: index → turns left. */
  fire: Record<number, number>;
  /** Research: damage to vampires (UV rounds), and how much worse they hit (pheromone blockers). */
  mods: { vampireDamage: number; vampireAim: number };
  /** What the bloodline kept here: crates to carry out. */
  loot: Loot[];
  /** A helicopter dropped the team and left; it comes back for a win, and lifts every crate. */
  airlift: boolean;
  /** Items lying on the ground: dropped, or fallen with whoever carried them. */
  floor: FloorItem[];
  nextItem: number;
}

interface FloorItem extends Pt3 {
  id: string;
  item: ItemId;
  /** A gun's rounds (undefined: a full clip). */
  ammo?: number;
  /** Ours: an agent's (recovered with a win). */
  ours: boolean;
}

interface Loot extends Pt3 {
  id: string;
  /** The agent carrying it, if any. */
  by: string | null;
}

/** An agent brought from the campaign (tactical/campaign.ts), in place of a skirmish's random one. */
export interface SquadMember {
  id: string;
  name: string;
  aim: number;
  hp: number;
  maxHp: number;
  faith: number;
  tradecraft: number;
  insight: number;
  /** What they carry in (the kit's share of their loadout). */
  gear: Gear;
  armour: number;
  /** Time units a turn (from Combat). */
  tu: number;
}

export interface SkirmishOptions {
  bloodline: string;
  night: boolean;
  /** The lit share of the moon (a half moon if left out). */
  moon?: number;
  kit: "civilian" | "plainclothes" | "tactical";
  arrival: "helicopter" | "jet";
  /** The campaign's agents (else four random ones). */
  squad?: SquadMember[];
  mods?: Battle["mods"];
  /** Crates of loot in the hideout. */
  loot?: number;
  /** A rescue: someone held near the vampires, to free and get out. */
  hostage?: boolean;
  /** "Balls to the walls" (skirmish only): all-out war. See MAYHEM. */
  mayhem?: boolean;
}

/**
 * All-out war, a skirmish for the fun of it: six agents with machine guns,
 * a sniper rifle, a semi-auto shotgun and rocket launchers, extra
 * incendiaries; thralls as heavily armed; vampires with guns, far more
 * health and far more time; everyone awake from the start. The town is
 * already burning: fires about the streets, cars alight, most glass gone.
 */
export const MAYHEM = {
  squad: ["m249", "m240b", "rpg", "m110", "shotgun-semi", "rpg"] as WeaponId[],
  thralls: ["m249", "m240b", "rpg", "shotgun-semi", "m110", "rifle"] as WeaponId[],
  vampires: ["m240b", "m249", "rpg", "shotgun-semi"] as WeaponId[],
  incendiaries: 2,
  thrallHp: 1.5,
  vampireHp: 3,
  vampireTu: 1.75,
  /** Share of open ground set burning, of cars alight, of glass broken. */
  fires: 0.04,
  cars: 0.6,
  glass: 0.75,
  /** Fires keep burning (turns). */
  burns: 99,
};

export const DEFAULT_OPTIONS: SkirmishOptions = { bloodline: "carcassonne", night: true, kit: "tactical", arrival: "helicopter" };

/** Turns a vampire lies in torpor (one less for the Huaca Line). */
export const TORPOR_TURNS = { night: 2, day: 3 };
/** Health a vampire rises with. */
const RISE_HEALTH = 0.4;
/** A vampire's will, before its line's bonus. */
const VAMPIRE_WILL = 55;
/** Incendiary: range in tiles, burn damage (a vampire takes double), turns the ground burns. */
export const INCENDIARY = { range: 10, damage: [12, 18] as const, turns: 2 };
/** Sun damage to a vampire caught outdoors by day, at the start of its turn. */
const SUN_DAMAGE = 18;
/** A vampire (claws in rules.ts). Tuned against the auto-combat (tactical/calibrate.test.ts). */
export const VAMPIRE = { hp: 48, aim: 65 };

/** A lair's eldest: tougher, surer, stronger-willed, and it dominates every turn it can't claw. */
const ELDER = { hp: 120, aim: 85, will: 20, armour: 6 };

/** Jade Court: seen only within this many tiles until it strikes. */
const HIDDEN_RANGE = 5;

// ---------------------------------------------------------------------------
// Time units

/** A step to the next tile (diagonals and straight runs: by the distance walked). */
export const TU_PER_TILE = 4;
/** An agent's time units: the same formula as aim, from Combat. */
export const agentTu = (combat: number) => 40 + Math.round(combat / 2);
/** An agent's aim, from Combat: 62–77 for a recruit. */
export const agentAim = (combat: number) => 50 + Math.round(combat / 2);
/** Thralls, vampires (fast), the eldest, civilians, a prisoner. */
export const ENEMY_TU = { thrall: 50, vampire: 72, elder: 80, civilian: 40, hostage: 48 };
/** Weapon actions cost a share of the unit's whole allowance (as in X-COM). */
const TU_SHARE = { snap: 0.35, aimed: 0.6, burst: 0.5, melee: 0.35, throw: 0.35 };
/** Everything else costs a fixed few. */
export const TU_COST = { reload: 15, finish: 15, capture: 20, stabilize: 15, free: 10, evacuate: 8, heal: 15, door: 4 };
/**
 * The inventory on the battlescape: moving an item costs what it takes to
 * get it out of where it is plus what it takes to put it where it goes
 * (in the same container: just the shuffle). Using or loading something
 * from the backpack costs the rummage on top.
 */
export const INV_TU = { hand: 2, pocket: 3, pack: 6, floor: 6, shuffle: 2 };
export const RUMMAGE_TU = 6;

export type { ShotMode };
type ActionKind = ShotMode | "melee" | "throw";

/** What an action costs this unit. */
export const tuCost = (u: Pick<Unit, "maxTu">, k: ActionKind) => Math.ceil(u.maxTu * TU_SHARE[k]);
/** The cheapest attack this unit has: a snap shot, or a blow with a blade, claws or fists. */
export const attackCost = (u: Pick<Unit, "maxTu" | "weapon">) => tuCost(u, WEAPONS[u.weapon].melee ? "melee" : "snap");
/** The fire modes the weapon in hand has: a blow; or snap and aimed, and burst if it fires them; a machine gun bursts only. */
export const modesOf = (u: Pick<Unit, "weapon">): ShotMode[] => {
  const w = WEAPONS[u.weapon];
  return w.melee ? ["snap"] : w.burstOnly ? ["burst"] : w.burst ? ["snap", "aimed", "burst"] : ["snap", "aimed"];
};
/** The mode a shot is fired in: the one asked for if the weapon has it, else its first. */
export const fireMode = (u: Pick<Unit, "weapon">, mode: ShotMode): ShotMode => (modesOf(u).includes(mode) ? mode : modesOf(u)[0]!);
/** Done for the turn: out of time, or holding it for reaction fire. */
export const ready = (u: Unit) => u.tu > 0 && !u.overwatch;
/** Sneaking: each step costs this much more; an enemy must be this much closer to spot the agent while concealed. */
export const SNEAK = { move: 1.5, detect: 0.5 };
/** Whether a unit can react to movement with the TU it has: a gun with rounds in it, and the time for a snap shot. */
const canReact = (u: Unit) => {
  const w = WEAPONS[u.weapon];
  return !w.melee && (!w.clip || u.ammo > 0) && u.tu >= attackCost(u);
};

// ---------------------------------------------------------------------------
// Setting up

const AGENT_NAMES = ["Br. Tomasz", "Sr. Ines", "Fr. Malik", "Sr. Kateri", "Br. Anselm", "Sr. Miriam", "Fr. Diego", "Br. Kofi"];

/** Groups spawns standing near each other into pods. */
function pods(points: Pt3[]): number[] {
  const out = points.map(() => -1);
  let next = 0;
  points.forEach((_, i) => {
    if (out[i]! >= 0) return;
    out[i] = next;
    const stack = [i];
    while (stack.length) {
      const j = stack.pop()!;
      points.forEach((q, k) => {
        if (out[k]! < 0 && distance(points[j]!, q) <= 6) {
          out[k] = next;
          stack.push(k);
        }
      });
    }
    next++;
  });
  return out;
}

/** A skirmish: four agents at the landing zone against the map's spawns. */
export function newSkirmish(map: BattleMap, seed: number, opts: SkirmishOptions = DEFAULT_OPTIONS): Battle {
  const r = rng({ rng: seed ^ 0x5bd1e995 });
  const tr = traitsOf(opts.bloodline);
  const units: Unit[] = [];
  const mods = opts.mods ?? { vampireDamage: 1, vampireAim: 0 };
  const stat = (k: "combat" | "tradecraft" | "insight" | "faith" | "vitality") => r.int(...(k === "vitality" ? VITALITY_RANGE : APTITUDE_ROLL));
  const squad: SquadMember[] = opts.squad ?? (opts.mayhem ? MAYHEM.squad : loadout(opts.kit)).map((weapon, i) => {
    const kit = kitGear(opts.mayhem ? "tactical" : opts.kit, weapon, opts.mayhem ? MAYHEM.incendiaries : 0);
    const vitality = stat("vitality");
    // An agent's HP is their Vitality.
    const hp = vitality;
    const combat = stat("combat");
    return {
      id: `a${i}`, name: AGENT_NAMES[(seed + i) % AGENT_NAMES.length]!, aim: agentAim(combat), hp, maxHp: hp,
      faith: stat("faith"), tradecraft: stat("tradecraft"), insight: stat("insight"), gear: kit,
      armour: kitArmour(kit), tu: agentTu(combat),
    };
  });
  // A helicopter drops the team where the map says it can (a block's roof, a works yard), when that isn't the street.
  if (opts.arrival === "helicopter" && map.airLz?.length) map.lz = map.airLz;
  // The team lines up on the landing zone, centre first (a big team spills round it).
  const spots = [4, 0, 2, 6, 8, 1, 3, 5, 7].map((i) => map.lz[i]!).filter(Boolean);
  squad.forEach((a, i) => {
    const p = spots[i] ?? nearFree(map, spots[0]!, units);
    const { tu, gear, ...rest } = a;
    const g = cloneGear(gear);
    const weapon = handWeapon(g);
    units.push(unit({ ...rest, gear: g, weapon, kind: "agent", side: "agent", ...p, maxTu: tu, alerted: true }));
  });
  const enemyUnits = map.spawns.filter((s) => s.side !== "civilian");
  const pod = pods(enemyUnits);
  enemyUnits.forEach((s, i) => {
    const vampire = s.side === "vampire";
    const elder = vampire && !!s.elder;
    const weapon: WeaponId = opts.mayhem ? r.pick(vampire ? MAYHEM.vampires : MAYHEM.thralls) : vampire ? "claws" : r.pick<WeaponId>(["pistol", "pistol", "rifle", "shotgun"]);
    const hp = Math.round((elder ? ELDER.hp : vampire ? VAMPIRE.hp : r.int(24, 30) + tr.thrallHp) * (opts.mayhem ? (vampire ? MAYHEM.vampireHp : MAYHEM.thrallHp) : 1));
    const tu = elder ? ENEMY_TU.elder : vampire ? ENEMY_TU.vampire : ENEMY_TU.thrall;
    units.push(unit({
      id: `e${i}`, kind: vampire ? "vampire" : "thrall", side: "enemy",
      name: elder ? (ELDERS[opts.bloodline]?.short ?? "The Eldest") : vampire ? "Vampire" : "Thrall",
      x: s.x, y: s.y, z: s.z, hp, maxHp: hp,
      aim: (elder ? ELDER.aim : vampire ? VAMPIRE.aim : 55) - (vampire ? mods.vampireAim : 0),
      will: vampire ? VAMPIRE_WILL + tr.will + (elder ? ELDER.will : 0) : 0, maxTu: Math.round(tu * (opts.mayhem && vampire ? MAYHEM.vampireTu : 1)), armour: elder ? ELDER.armour : 0, weapon, pod: pod[i]!,
      alerted: !!opts.mayhem,
      facing: r.real(0, Math.PI * 2), hidden: tr.hidden, elder,
      // A thrall's gun is a real one: it can be picked up when they fall (and a spare magazine, now and then).
      gear: vampire && !opts.mayhem ? emptyGear() : thrallGear(weapon, r.chance(0.5)),
    }));
  });
  // The prisoner, held near the vampires; the loot, in the rooms round them.
  const lair = enemyUnits.filter((s) => s.side === "vampire")[0] ?? enemyUnits[0];
  const taken = (p: Pt3) => units.some((u) => u.x === p.x && u.y === p.y && u.z === p.z) || map.spawns.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);
  const near = (n: number): Pt3[] => {
    const out: Pt3[] = [];
    if (!lair) return out;
    for (let d = 1; d <= 6 && out.length < n; d++)
      for (let dy = -d; dy <= d && out.length < n; dy++)
        for (let dx = -d; dx <= d && out.length < n; dx++) {
          const p = { x: lair.x + dx, y: lair.y + dy, z: lair.z };
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d || tileAt(map, p.x, p.y, p.z) !== T.FLOOR || taken(p) || out.some((q) => q.x === p.x && q.y === p.y)) continue;
          if (r.chance(0.5)) out.push(p);
        }
    return out;
  };
  if (opts.hostage) {
    const p = near(1)[0];
    if (p) units.push(unit({ id: "h0", kind: "hostage", side: "neutral", name: "The prisoner", ...p, hp: 18, maxHp: 18, aim: 30, maxTu: ENEMY_TU.hostage, armour: 0, weapon: "knife" }));
  }
  const loot: Loot[] = near(opts.loot ?? 0).map((p, i) => ({ id: `l${i}`, ...p, by: null }));
  map.spawns.filter((s) => s.side === "civilian").forEach((s, i) => {
    units.push(unit({ id: `c${i}`, kind: "civilian", side: "neutral", name: "Civilian", x: s.x, y: s.y, z: s.z, hp: 18, maxHp: 18, aim: 0, maxTu: ENEMY_TU.civilian, armour: 0, weapon: "pistol", ammo: 0 }));
  });
  const fire = opts.mayhem ? warZone(map, r, units) : {};
  return {
    map, units, turn: 1, side: "agent", rng: r.int(1, 2 ** 31), result: null, night: opts.night, moon: opts.moon ?? 0.5, bloodline: opts.bloodline, fire, mods, loot, airlift: opts.arrival === "helicopter", floor: [], nextItem: 0,
    // A helicopter overhead or a squad in tactical kit gives the game away at once.
    concealed: opts.kit !== "tactical" && opts.arrival === "jet",
  };
}

/**
 * The town already burning (MAYHEM): most glass broken, cars alight, fires
 * about the open ground, clear of where anyone stands and of the landing
 * zone. Returns the fire (tile → turns).
 */
function warZone(map: BattleMap, r: Rng, units: Unit[]): Record<number, number> {
  for (let z = 0; z < map.levels; z++)
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++)
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          const e = edgeAt(map, x, y, z, dx, dy);
          if (breakable(e) && r.chance(MAYHEM.glass)) setEdge(map, x, y, z, dx, dy, e === E.WINDOW ? E.SILL : E.NONE, edgeSkinAt(map, x, y, z, dx, dy));
        }
  const fire: Record<number, number> = {};
  const clear = (x: number, y: number, z: number) =>
    units.every((u) => Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) > 1 || u.z !== z) && map.lz.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 3 || p.z !== z);
  const set = (x: number, y: number, z: number) => (fire[idx(map, x, y, z)] = MAYHEM.burns);
  for (const v of map.vehicles ?? [])
    if (r.chance(MAYHEM.cars) && clear(v.x, v.y, map.ground)) {
      for (let dy = 0; dy < v.h; dy++) for (let dx = 0; dx < v.w; dx++) set(v.x + dx, v.y + dy, map.ground);
      v.wrecked = true;
    }
  const z = map.ground;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (walkable(map, x, y, z) && !indoors(map, { x, y, z }) && clear(x, y, z) && r.chance(MAYHEM.fires)) set(x, y, z);
  return fire;
}

/** Vehicles that fire reaches burn out (the look: their tiles' cover stays). */
export function wreckVehicles(map: BattleMap, tiles: readonly Pt3[]) {
  for (const v of map.vehicles ?? [])
    if (!v.wrecked && tiles.some((q) => q.z === v.z && q.x >= v.x && q.y >= v.y && q.x < v.x + v.w && q.y < v.y + v.h)) v.wrecked = true;
}

/** What each kit carries into a fight (data/kit.ts): knives, pistols, or rifles with a shotgun. */
export function loadout(kit: SkirmishOptions["kit"], n = 4): WeaponId[] {
  const set: WeaponId[] = kit === "tactical" ? ["rifle", "rifle", "shotgun", "rifle"] : kit === "plainclothes" ? ["pistol"] : ["knife"];
  return Array.from({ length: n }, (_, i) => set[i % set.length]!);
}

/** A skirmish agent's loadout for a kit and a weapon: magazines, armour, and with tactical kit a helmet, an incendiary and a trauma kit. */
export function kitGear(kit: SkirmishOptions["kit"], weapon: WeaponId, extraIncendiaries = 0): Gear {
  const item = (Object.keys(ITEMS) as ItemId[]).find((x) => x !== "knife" && ITEMS[x].weapon === weapon);
  const mag = item ? ITEMS[item].mag : undefined;
  const items: ItemId[] = [...(item ? [item] : []), ...(mag ? [mag, mag, mag] : [])];
  if (kit === "tactical") items.push("tactical-vest", "helmet", "incendiary", "medkit", ...Array<ItemId>(extraIncendiaries).fill("incendiary"));
  if (kit === "plainclothes") items.push("soft-vest", "medkit");
  return packGear(items).gear;
}

/** The armour value on the battlescape for a loadout's vest and helmet (plus research plates in a vest). */
export function kitArmour(g: Gear, plates = 0): number {
  const vest = g.armour ? ITEMS[g.armour].armour ?? 0 : 0;
  const helmet = g.helmet ? ITEMS[g.helmet].armour ?? 0 : 0;
  return Math.round((vest + (vest > 0 ? plates : 0) + helmet) * 15);
}

/** A thrall's gear: its gun, and perhaps a spare magazine. */
function thrallGear(weapon: WeaponId, spare: boolean): Gear {
  const item = (Object.keys(ITEMS) as ItemId[]).find((x) => x !== "knife" && ITEMS[x].weapon === weapon);
  if (!item) return emptyGear();
  const g: Gear = { weapon: item, stowed: [] };
  const mag = ITEMS[item].mag;
  if (spare && mag) stowAnywhere(g, mag);
  return g;
}

/** What a loadout puts in the hand on the battlescape. */
const handWeapon = (g: Gear): WeaponId => (g.weapon ? ITEMS[g.weapon].weapon ?? "knife" : "knife");

/** A free walkable tile near `p` (for a squad bigger than the landing zone). */
function nearFree(map: BattleMap, p: Pt3, units: Unit[]): Pt3 {
  for (let d = 1; d < 8; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        const q = { x: p.x + dx, y: p.y + dy, z: p.z };
        if (walkable(map, q.x, q.y, q.z) && !units.some((u) => u.x === q.x && u.y === q.y && u.z === q.z)) return q;
      }
  return p;
}

type UnitInit = Partial<Unit> & Pick<Unit, "id" | "kind" | "side" | "name" | "x" | "y" | "z" | "hp" | "maxHp" | "aim" | "maxTu" | "armour" | "weapon">;

function unit(u: UnitInit): Unit {
  const out: Unit = {
    ammo: WEAPONS[u.weapon].clip, tu: u.maxTu, overwatch: false, sneak: false, alive: true, evacuated: false, alerted: false, pod: -1, facing: 0,
    gear: emptyGear(), mode: "snap",
    faith: 50, tradecraft: 0, insight: 0, will: 0, torpor: 0, dominated: false, dominatedOnce: false, hidden: false, captured: false, carrying: false, elder: false, bleeding: 0, stable: false, ...u,
  };
  out.mode = fireMode(out, out.mode);
  return out;
}

// ---------------------------------------------------------------------------
// Queries

export const battleRng = (b: Battle): Rng => rng(b);
export const traits = (b: Battle): BloodlineTraits => traitsOf(b.bloodline);
export const unitById = (b: Battle, id: string) => b.units.find((u) => u.id === id);
/** On the map: alive (or in torpor) and not evacuated. */
export const onMap = (u: Unit) => u.alive && !u.evacuated && !u.captured;
/** Down: an agent bleeding out or stabilized on the ground. */
export const isDown = (u: Unit) => u.bleeding > 0 || u.stable;
/** On the map and able to act. */
export const active = (u: Unit) => onMap(u) && u.torpor === 0 && !isDown(u);
/** Our people on the map: the agents, and a prisoner once freed. */
export const agents = (b: Battle) => b.units.filter((u) => u.side === "agent" && active(u));
/** Every enemy still to deal with, including vampires in torpor. */
export const enemies = (b: Battle) => b.units.filter((u) => u.side === "enemy" && onMap(u));
export const unitAt = (b: Battle, p: Pt3) => b.units.find((u) => onMap(u) && u.x === p.x && u.y === p.y && u.z === p.z);
export const hostile = (a: Unit, c: Unit) => a.side !== "neutral" && c.side !== "neutral" && a.side !== c.side;
const tileIndex = (b: Battle, p: Pt3) => idx(b.map, p.x, p.y, p.z);
export const burning = (b: Battle, p: Pt3) => (b.fire[tileIndex(b, p)] ?? 0) > 0;

/** How far `viewer` sees toward `p`: at night humans see only what's lit from afar, and by the moon; vampires see in the dark. */
function sightRange(b: Battle, viewer: Pt3 & { kind: UnitKind }, p: Pt3): number {
  // Below ground it's always night.
  if (!b.night && p.z >= b.map.ground) return SIGHT;
  if (viewer.kind === "vampire") return VAMPIRE_SIGHT;
  return isLit(b.map, p) || burning(b, p) ? SIGHT : p.z >= b.map.ground ? nightSight(b.moon) : DARK_SIGHT;
}

/** Whether `viewer` sees `p` (and the unit there, if it's hiding). */
export function sees(b: Battle, viewer: Pt3 & { kind: UnitKind }, p: Pt3, target?: Unit): boolean {
  if (target?.hidden && distance(viewer, p) > HIDDEN_RANGE) return false;
  return canSee(b.map, viewer, p, sightRange(b, viewer, p));
}

/** What the player is shown: anything an agent sees. */
export function seenByAgents(b: Battle, p: Pt3, target?: Unit): boolean {
  return agents(b).some((a) => sees(b, a, p, target));
}

/** Units of the other side this unit can see and shoot (not bodies in torpor). */
export const visibleFoes = (b: Battle, u: Unit, from: Pt3 = u) =>
  b.units.filter((o) => active(o) && hostile(u, o) && sees(b, { ...from, kind: u.kind }, o, o));

/** Bodies in torpor next to this unit, to finish. */
export const bodiesInReach = (b: Battle, u: Unit) =>
  b.units.filter((o) => onMap(o) && o.torpor > 0 && adjacent(b.map, u, o));

/**
 * Where `u`, standing at `from`, shoots `t` from: there, or leaning out round
 * the end of its full cover (rules.ts leans) when only that sees `t`.
 * Blows don't lean.
 */
export function aimFrom(b: Battle, u: Unit, t: Pt3, from: Pt3 = u): Pt3 {
  const at = (!WEAPONS[u.weapon].melee && sightPoint(b.map, from, t)) || from;
  return { x: at.x, y: at.y, z: at.z };
}

/** The lean tile, if `u` at `from` would have to lean out to shoot or throw at `t`. */
export function leanFor(b: Battle, u: Unit, t: Pt3, from: Pt3 = u): Pt3 | undefined {
  const at = aimFrom(b, u, t, from);
  return at.x !== from.x || at.y !== from.y ? at : undefined;
}

/** Could `u`, standing at `from`, attack `t` (seen) with what's in hand: a blow next to it, a shot within sight range. */
export function inReach(b: Battle, u: Unit, t: Unit, from: Pt3 = u): boolean {
  return WEAPONS[u.weapon].melee ? adjacent(b.map, from, t) : distance(aimFrom(b, u, t, from), t) <= SIGHT;
}

/** The cone of `u`'s shot (σ, radians): its weapon, its skill, the mode, reaction fire, from concealment. */
export const coneOf = (b: Battle, u: Unit, mode: ShotMode = "snap", reaction = false) =>
  spread(u, mode, reaction, u.side === "agent" && b.concealed);

/** Crit chance a unit's own (agents: Insight). */
const critBonus = (u: Unit) => (u.side === "agent" ? Math.max(0, Math.round((u.insight - 30) / 5)) : 0);

/** A blow's chance to land (melee isn't ballistic): the attacker's aim, 5–95. */
const blowChance = (u: Unit) => Math.max(5, Math.min(95, Math.round(u.aim)));

/**
 * The AI's measure of a shot by `u` (standing at `from`) at `t`: roughly the
 * share of rounds that would land (ballistics.ts estimate, in percent), and
 * the crit. Never shown to the player.
 */
export function oddsAgainst(b: Battle, u: Unit, t: Unit, from: Pt3 = u, reaction = false, mode: ShotMode = "snap"): ShotOdds {
  const w = WEAPONS[u.weapon];
  const at = aimFrom(b, u, t, from);
  const c = coverAgainst(b.map, t, at);
  const crit = Math.min(100, w.crit + critBonus(u) + (c.flanked ? FLANK_CRIT : 0));
  if (w.melee) {
    const inRange = adjacent(b.map, from, t);
    return { chance: inRange ? blowChance(u) : 0, crit, flanked: false, inRange };
  }
  const p = estimate(b.map, coneOf(b, u, mode, reaction), u.weapon, at, t, t.kind);
  return { chance: Math.round(p * 100), crit, flanked: c.flanked, inRange: distance(at, t) <= SIGHT };
}

/** While concealed, how close an enemy must be to spot this agent (Tradecraft shrinks it). */
export const detectRadius = (a: Unit) => {
  const r = Math.max(2, Math.min(6, Math.round(8 - a.tradecraft / 10)));
  return a.sneak ? Math.max(1, Math.round(r * SNEAK.detect)) : r;
};

/** Does this enemy notice this agent? */
export function detects(b: Battle, e: Unit, a: Unit): boolean {
  if (!active(e) || !sees(b, e, a)) return false;
  return !b.concealed || distance(e, a) <= detectRadius(a);
}

// ---------------------------------------------------------------------------
// Movement

export interface Reach {
  /** TU to reach each tile index. */
  cost: Map<number, number>;
  /** Where the straight leg into each tile starts (any-angle: not always a neighbour). */
  prev: Map<number, number>;
}

/**
 * A step between neighbours, in tiles: 1 straight, 1.5 diagonal; 2 up or down
 * a stair tile, 3 a climb; a flight of stairs (foot to head, 3 or more tiles
 * apart) its length and one more.
 */
const stepCost = (a: Pt3, b: Pt3) => {
  if (a.z === b.z) return a.x !== b.x && a.y !== b.y ? 1.5 : 1;
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  return d === 0 ? 2 : d >= 3 ? d + 1 : 3;
};

/** May this unit step onto this tile? Enemies keep out of fire; vampires keep out of the sun. */
function allowed(b: Battle, u: Unit, p: Pt3): boolean {
  if (u.side === "enemy" && burning(b, p)) return false;
  if (u.kind === "vampire" && !b.night && !traits(b).sunproof && !indoors(b.map, p)) return false;
  return true;
}

/**
 * Where a unit can walk within `budget` TU: Theta*, a Dijkstra flood whose
 * legs run straight from a tile's parent wherever the walk is clear, so
 * costs are the distance really walked, not a zigzag across tile centres.
 * Every other unit on the map blocks its tile, friend or foe; vampires climb. `anyAngle` off
 * gives the plain grid flood (cheaper, for the AI's long-range plans).
 */
export function reach(b: Battle, u: Unit, budget = u.tu, anyAngle = true): Reach {
  const m = b.map;
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const start = idx(m, u.x, u.y, u.z);
  cost.set(start, 0);
  const blocked = new Set<number>();
  for (const o of b.units) if (onMap(o) && o !== u) blocked.add(idx(m, o.x, o.y, o.z));
  const climb = u.kind === "vampire";
  const tile = TU_PER_TILE * (u.sneak ? SNEAK.move : 1);
  // May a straight walk pass over a tile? Asked many times of each, so remembered (0: not asked yet, 1: no, 2: yes).
  const asked = new Uint8Array(m.w * m.h * m.levels);
  const clear = Array.from({ length: m.levels }, (_, z) => (x: number, y: number) => {
    if (!inBounds(m, x, y, z)) return false;
    const i = idx(m, x, y, z);
    return (asked[i] ||= walkable(m, x, y, z) && !blocked.has(i) && allowed(b, u, { x, y, z }) ? 2 : 1) === 2;
  });
  const open = new Heap();
  open.push(0, start);
  while (open.size) {
    const [c, i] = open.pop();
    if (c > (cost.get(i) ?? Infinity)) continue;
    const p = fromIdx(m, i);
    const pi = prev.get(i);
    const par = pi === undefined ? null : fromIdx(m, pi);
    for (const n of neighbours(m, p, climb)) {
      const j = idx(m, n.x, n.y, n.z);
      if (blocked.has(j) || !allowed(b, u, n)) continue;
      // Straight from the parent, if the walk is clear and on one level; else via this tile.
      let from = i, nc = c + stepCost(p, n) * tile + (shutBetween(m, p, n) ? TU_COST.door : 0);
      const known = (cost.get(j) ?? Infinity) - 1e-9;
      if (anyAngle && par && par.z === p.z && n.z === p.z) {
        const via = cost.get(pi!)! + flat(par, n) * tile;
        // (The walk itself is the dear part: only looked at when it would matter.)
        if (via <= nc && via <= budget + 1e-6 && via < known && walkLine(m, par, n, clear[n.z]!)) (from = pi!), (nc = via);
      }
      if (nc > budget + 1e-6 || nc >= known) continue;
      cost.set(j, nc);
      prev.set(j, from);
      open.push(nc, j);
    }
  }
  return { cost, prev };
}

/** A binary min-heap of (cost, tile index), for Dijkstra on the bigger maps. */
class Heap {
  private readonly k: number[] = [];
  private readonly v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const { k, v } = this;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const { k, v } = this;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        let mk = lk;
        if (l < k.length && k[l]! < mk) (m = l), (mk = k[l]!);
        if (r < k.length && k[r]! < mk) m = r;
        if (m === i) break;
        k[i] = k[m]!;
        v[i] = v[m]!;
        i = m;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

export function fromIdx(m: BattleMap, i: number): Pt3 {
  const x = i % m.w;
  const y = Math.floor(i / m.w) % m.h;
  const z = Math.floor(i / (m.w * m.h));
  return { x, y, z };
}

/** The way to a tile: the corner points of its straight legs (not the start), or null if out of reach. */
export function pathTo(b: Battle, r: Reach, to: Pt3): Pt3[] | null {
  const m = b.map;
  let i = idx(m, to.x, to.y, to.z);
  if (!r.cost.has(i)) return null;
  const out: Pt3[] = [];
  while (r.prev.has(i)) {
    out.unshift(fromIdx(m, i));
    i = r.prev.get(i)!;
  }
  return out;
}

/** TU a reached tile costs (rounded up: what a move there takes), or undefined out of reach. */
export const tuTo = (b: Battle, r: Reach, p: Pt3): number | undefined => {
  const c = r.cost.get(idx(b.map, p.x, p.y, p.z));
  return c === undefined ? undefined : Math.ceil(c - 1e-6);
};

/** Every tile a walk along these legs enters, in order, each marked if it's a corner of the path. */
function tilesAlong(from: Pt3, path: Pt3[]): { p: Pt3; corner: boolean }[] {
  const out: { p: Pt3; corner: boolean }[] = [];
  let prev = from;
  for (const q of path) {
    const cells = cellsAlong(prev, q);
    cells.forEach((c, k) => out.push({ p: c, corner: k === cells.length - 1 }));
    prev = q;
  }
  return out;
}

/** The TU a path costs from `from` (straight legs by distance; stairs and climbs by their step). */
function pathCost(from: Pt3, path: Pt3[]): number {
  let c = 0, prev = from;
  for (const p of path) {
    c += (p.z === prev.z ? flat(prev, p) : stepCost(prev, p)) * TU_PER_TILE;
    prev = p;
  }
  return c;
}

/** Can a unit end a move here (walkable, nobody standing or lying there)? */
export const canStand = (b: Battle, p: Pt3) => inBounds(b.map, p.x, p.y, p.z) && walkable(b.map, p.x, p.y, p.z) && !unitAt(b, p);

const face = (u: Unit, to: Pt3) => {
  if (to.x !== u.x || to.y !== u.y) u.facing = Math.atan2(to.y - u.y, to.x - u.x);
};

/**
 * Walks a unit along a path (straight legs), tile by tile. Reaction fire comes
 * at it as it comes into view, while the watcher has the TU for a snap shot
 * (once per watcher per move); a hit can stop it dead. Enemies who spot an
 * agent wake up. An agent who sees an enemy the team hadn't seen stops on
 * that tile; given `charged` (the TU the whole move was paid), the TU of the
 * rest of the way come back.
 */
export function walk(b: Battle, u: Unit, path: Pt3[], charged?: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  const start: Pt3 = { x: u.x, y: u.y, z: u.z };
  const walked: Pt3[] = [];
  const known = u.side === "agent" ? new Set(enemies(b).filter((e) => active(e) && seenByAgents(b, e, e)).map((e) => e.id)) : null;
  let seg: Pt3[] = [];
  const seen = (p: Pt3) => u.side === "agent" || seenByAgents(b, p, u);
  let segSeen = seen(u);
  const flush = () => {
    if (seg.length) events.push({ kind: "move", unit: u.id, path: seg, seen: segSeen });
    seg = [];
    segSeen = seen(u);
  };
  const fired = new Set<string>();
  let at: Pt3 = start, shown: Pt3 = start, doors = 0;
  const same = (a: Pt3, c: Pt3) => a.x === c.x && a.y === c.y && a.z === c.z;
  for (const { p, corner } of tilesAlong(u, path)) {
    // A closed door on the way: walk up to it, open it, go on.
    if (shutBetween(b.map, at, p)) {
      const last = seg.at(-1) ?? shown;
      if (!same(last, at)) seg.push({ ...at }), walked.push({ ...at });
      shown = seg.at(-1) ?? shown;
      flush();
      events.push(...openDoor(b, u, { ...at, dx: p.x - at.x, dy: p.y - at.y }));
      doors++;
    }
    at = p;
    face(u, p);
    u.x = p.x;
    u.y = p.y;
    u.z = p.z;
    if (corner) seg.push({ ...p }), walked.push({ ...p });
    if (seen(p)) segSeen = true;
    // Reaction fire from the other side.
    for (const w of b.units) {
      if (fired.has(w.id) || !active(w) || !w.overwatch || !hostile(w, u) || !sees(b, w, u, u)) continue;
      if (WEAPONS[w.weapon].clip && w.ammo <= 0) continue;
      if (!corner) seg.push({ ...p });
      shown = p;
      flush();
      fired.add(w.id);
      w.tu -= attackCost(w);
      if (w.tu < attackCost(w)) w.overwatch = false;
      events.push(...attack(b, w, u, true));
      if (!active(u)) return events;
    }
    if (u.side === "agent") events.push(...wakeWhoSpots(b, u));
    // An agent with free hands picks up a crate on the way.
    if (u.kind === "agent" && !u.carrying) {
      const crate = b.loot.find((l) => !l.by && l.x === p.x && l.y === p.y && l.z === p.z);
      if (crate) {
        if (!corner) seg.push({ ...p });
        shown = p;
        flush();
        crate.by = u.id;
        u.carrying = true;
        events.push({ kind: "status", unit: u.id, text: "Picked up a crate", seen: true });
      }
    }
    // Contact: an enemy comes into the team's view. Stop here.
    const spotted = known && enemies(b).find((e) => active(e) && !known.has(e.id) && seenByAgents(b, e, e));
    if (spotted && (p.x !== path.at(-1)!.x || p.y !== path.at(-1)!.y || p.z !== path.at(-1)!.z)) {
      const moves = events.filter((e): e is Extract<BattleEvent, { kind: "move" }> => e.kind === "move");
      const last = seg.at(-1) ?? moves.at(-1)?.path.at(-1);
      if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z) seg.push({ ...p });
      walked.push({ ...p });
      flush();
      if (charged !== undefined) {
        const used = Math.ceil(pathCost(start, walked) * (u.sneak ? SNEAK.move : 1) + doors * TU_COST.door - 1e-6);
        u.tu += Math.max(0, charged - used);
      }
      events.push({ kind: "status", unit: u.id, text: "Contact", seen: true });
      return events;
    }
  }
  flush();
  return events;
}

/** Enemies who spot this agent notice it (breaking concealment), and so does the rest of their pod. */
function wakeWhoSpots(b: Battle, a: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) {
    if (e.alerted || !detects(b, e, a)) continue;
    events.push(...reveal(b, a), ...alertPod(b, e.pod));
  }
  return events;
}

/** The team is seen: concealment is over. */
export function reveal(b: Battle, by?: Unit): BattleEvent[] {
  if (!b.concealed) return [];
  b.concealed = false;
  return [{ kind: "status", unit: by?.id ?? agents(b)[0]?.id ?? "", text: "Spotted!", seen: true }];
}

export function alertPod(b: Battle, pod: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b))
    if (!e.alerted && e.pod === pod) {
      e.alerted = true;
      events.push({ kind: "status", unit: e.id, text: "Alerted", seen: seenByAgents(b, e, e) });
    }
  return events;
}

/** Gunfire and fire wake every pod within earshot. */
function noise(b: Battle, at: Pt3): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) if (!e.alerted && distance(e, at) <= 12) events.push(...alertPod(b, e.pod));
  return events;
}

// ---------------------------------------------------------------------------
// Harm

/** Turns an agent bleeds before dying, unless stabilized. */
const BLEED_TURNS = 3;
/** Damage past 0 that kills outright (as does a critical hit). */
const OVERKILL = 18;

/** Bullets and claws take a unit to 0: an agent goes down (or dies, to a crit or a heavy blow); others die; a vampire falls into torpor. */
function downed(b: Battle, t: Unit, crit = false, overkill = 0): BattleEvent[] {
  t.overwatch = false;
  if (t.kind === "agent" && !crit && overkill < OVERKILL) {
    t.bleeding = BLEED_TURNS;
    t.tu = 0;
    dropLoot(b, t);
    return [{ kind: "torpor", unit: t.id, seen: true }, { kind: "status", unit: t.id, text: "Down, bleeding", seen: true }];
  }
  if (t.kind === "vampire") {
    t.torpor = Math.max(1, (b.night ? TORPOR_TURNS.night : TORPOR_TURNS.day) - traits(b).riseSooner);
    t.tu = 0;
    return [{ kind: "torpor", unit: t.id, seen: t.side === "agent" || seenByAgents(b, t) }];
  }
  t.alive = false;
  dropLoot(b, t);
  return [{ kind: "death", unit: t.id }];
}

/** A carrier falls: the crate lies where they fell; and if they're dead, what they carried (not what they wear). */
function dropLoot(b: Battle, u: Unit) {
  if (u.carrying) {
    u.carrying = false;
    for (const l of b.loot) if (l.by === u.id) Object.assign(l, { by: null, x: u.x, y: u.y, z: u.z });
  }
  if (u.alive) return;
  const ours = u.side === "agent";
  if (u.gear.weapon) dropItem(b, u, u.gear.weapon, u.ammo, ours);
  for (const x of u.gear.stowed) dropItem(b, u, x.item, x.ammo, ours);
  u.gear = { ...(u.gear.armour ? { armour: u.gear.armour } : {}), ...(u.gear.helmet ? { helmet: u.gear.helmet } : {}), stowed: [] };
  u.weapon = u.kind === "vampire" ? "claws" : "knife";
}

function dropItem(b: Battle, at: Pt3, item: ItemId, ammo: number | undefined, ours: boolean) {
  const w = ITEMS[item].weapon;
  const full = w ? WEAPONS[w].clip : 0;
  b.floor.push({ id: `i${b.nextItem++}`, item, x: at.x, y: at.y, z: at.z, ours, ...(ammo !== undefined && ammo < full ? { ammo } : {}) });
}

/** Fire or sun: no armour, double to a vampire, and it finishes one for good. */
function burn(b: Battle, t: Unit, why: "fire" | "sun"): BattleEvent[] {
  const r = battleRng(b);
  const vampire = t.kind === "vampire";
  const seen = t.side === "agent" || seenByAgents(b, t);
  if (t.torpor > 0) {
    t.alive = false;
    return [{ kind: "death", unit: t.id, text: why === "fire" ? "Burned" : "Ash" }];
  }
  let damage = why === "sun" ? Math.max(1, Math.round(SUN_DAMAGE * traits(b).sun)) : r.int(...INCENDIARY.damage) * (vampire ? 2 : 1);
  damage = Math.min(damage, t.hp);
  t.hp -= damage;
  const events: BattleEvent[] = [{ kind: "burn", unit: t.id, damage, why, seen }];
  if (t.hp <= 0) {
    t.alive = false;
    dropLoot(b, t);
    events.push({ kind: "death", unit: t.id, text: vampire ? "Ash" : undefined });
  }
  return events;
}

/** The figures a round can hit: everyone on the map standing (bodies lying down are passed over). */
function figures(b: Battle): Figure[] {
  const out: Figure[] = [];
  for (const u of b.units) {
    if (!onMap(u) || u.torpor > 0 || isDown(u)) continue;
    out.push({ id: u.id, x: u.x, y: u.y, z: u.z, h: figureHeight(b.map, u, u.kind), r: FIGURE.radius });
  }
  return out;
}

/** Damage to a unit hit (a crit adds half; armour comes off), and what follows if it drops. */
function wound(b: Battle, s: Unit, t: Unit, raw: number, crit: boolean): { hit: ShotHit; events: BattleEvent[] } {
  let damage = crit ? Math.ceil(raw * 1.5) : raw;
  if (t.kind === "vampire" && s.side === "agent") damage = Math.round(damage * b.mods.vampireDamage);
  damage = Math.max(1, damage - t.armour);
  const overkill = Math.max(0, damage - t.hp);
  damage = Math.min(t.hp, damage);
  t.hp -= damage;
  return { hit: { unit: t.id, damage, crit }, events: t.hp <= 0 ? downed(b, t, crit, overkill) : [] };
}

/**
 * One round (or a shotgun's load) from `s` at a point: each pellet leaves
 * the muzzle in a random direction in the cone and hits whatever it meets
 * first (ballistics.ts). Glass and windows on the way break. Damage goes to
 * whoever was hit, friend or foe; a crit is rolled once a unit hit (more if
 * it was flanked from where the shot came). The caller has paid the TU.
 */
function fire(b: Battle, s: Unit, aim: M3, aimTile: Pt3, target: Unit | null, reaction: boolean, mode: ShotMode): BattleEvent[] {
  const r = battleRng(b);
  const w = WEAPONS[s.weapon];
  const origin = target ? aimFrom(b, s, target) : aimFrom(b, s, aimTile);
  const from = muzzle(origin, s.kind);
  const sigma = coneOf(b, s, mode, reaction);
  face(s, aimTile);
  if (w.clip) s.ammo = Math.max(0, s.ammo - 1);
  const figs = figures(b);
  const pellets = w.pellets ?? 1;
  const pelletSigma = ((w.pelletSpread ?? 0) * Math.PI) / 180;
  // The shot's own error, then each pellet's scatter about it.
  const [ea, eu] = normals(() => r.next());
  const rays: M3[] = [];
  const panes: Crossing[] = [];
  const raw = new Map<string, number>();
  let landed: Pt3 | null = null;
  for (let k = 0; k < pellets; k++) {
    const [pa, pu] = pellets > 1 ? normals(() => r.next()) : [0, 0];
    const dir = deviate(from, aim, sigma * ea + pelletSigma * pa, sigma * eu + pelletSigma * pu);
    const impact = trace(b.map, from, dir, figs, s.id);
    rays.push(impact.at);
    panes.push(...impact.panes);
    // A rocket goes off where it stops (on whoever it struck); its hurt is the blast's.
    if (w.blast) landed = impact.unit ? { ...unitById(b, impact.unit)! } : landing(b, impact.at, dir);
    else if (impact.unit) raw.set(impact.unit, (raw.get(impact.unit) ?? 0) + r.int(w.damage[0], w.damage[1]) / pellets);
  }
  const blastTilesHit = landed && w.blast ? blastArea(b, landed, w.blast.radius) : [];
  for (const { q, d } of blastTilesHit) {
    const v = unitAt(b, q);
    // In full at the centre, two-thirds a tile out, a third at the edge.
    if (v && active(v)) raw.set(v.id, Math.max(raw.get(v.id) ?? 0, r.int(w.damage[0], w.damage[1]) * [1, 0.65, 0.35][Math.min(2, d)]!));
  }
  const hits: ShotHit[] = [];
  const after: BattleEvent[] = [];
  for (const [id, dmg] of raw) {
    const t = unitById(b, id)!;
    const flanked = coverAgainst(b.map, t, origin).flanked;
    const crit = r.next() * 100 < w.crit + critBonus(s) + (flanked ? FLANK_CRIT : 0) && !reaction;
    const res = wound(b, s, t, Math.max(1, Math.round(dmg)), crit);
    hits.push(res.hit);
    after.push(...res.events);
  }
  const struck = hits.map((h) => unitById(b, h.unit)!);
  const seen = s.side === "agent" || struck.some((t) => t.side === "agent") || seenByAgents(b, s, s);
  s.hidden = false; // striking gives a Jade killer away
  const lean = origin.x !== s.x || origin.y !== s.y ? origin : undefined;
  const blasted: BattleEvent[] = [];
  if (landed) {
    const tiles = blastTilesHit.map((x) => x.q);
    // The ground it reached burns for a turn; the glass round it goes.
    for (const q of tiles) b.fire[tileIndex(b, q)] = Math.max(b.fire[tileIndex(b, q)] ?? 0, 1);
    wreckVehicles(b.map, tiles);
    blasted.push({ kind: "blast", unit: s.id, at: landed, tiles, seen: seen || tiles.some((q) => seenByAgents(b, q)) }, ...shatter(b, glassAround(b, tiles), landed), ...noise(b, landed));
  }
  const events: BattleEvent[] = [
    { kind: "shot", unit: s.id, weapon: s.weapon, target: target?.id, from, aim, rays, hits, reaction, melee: false, seen, lean, ...(mode === "burst" ? { burst: true } : {}) },
    ...shatter(b, dedupe(panes), origin),
    ...blasted,
    ...after,
  ];
  // A suppressed shot that drops what it hit is unheard: no one is the wiser.
  const silent = !!w.suppressed && struck.length > 0 && struck.every((t) => !active(t));
  if (s.side === "agent" && !silent) events.push(...reveal(b, s));
  // Being shot at wakes the target's pod (and anyone hit); gunfire wakes those near.
  for (const t of new Set([target, ...struck])) if (t && t.side === "enemy" && !silent) events.push(...alertPod(b, t.pod));
  if (!w.suppressed) events.push(...noise(b, s));
  events.push(...checkEnd(b));
  return events;
}

/**
 * The tile a round stopped in (`at`, metres, along `dir`): stepped back a
 * little, so a wall's face gives the tile before it. Null if it flew off the
 * map (a rocket that does goes off somewhere else).
 */
function landing(b: Battle, at: M3, dir: M3): Pt3 | null {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const p = { x: at.x - (dir.x / len) * 0.3, y: at.y - (dir.y / len) * 0.3, z: at.z - (dir.z / len) * 0.3 };
  const q = { x: Math.floor(p.x / TILE), y: Math.floor(p.z / TILE), z: Math.max(0, Math.floor(p.y / LEVEL_H)) };
  return q.x >= 0 && q.y >= 0 && q.x < b.map.w && q.y < b.map.h && q.z < b.map.levels ? q : null;
}

/** The tiles a blast at `p` reaches, out to `radius` (rings: d 0, 1, 2…), on its level, not through walls. */
export function blastArea(b: Battle, p: Pt3, radius: number): { q: Pt3; d: number }[] {
  const out: { q: Pt3; d: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z };
      if (q.x < 0 || q.y < 0 || q.x >= b.map.w || q.y >= b.map.h) continue;
      const t = tileAt(b.map, q.x, q.y, q.z);
      if (t !== T.VOID && t !== T.WALL && lineOfSight(b.map, p, q)) out.push({ q, d: Math.max(Math.abs(dx), Math.abs(dy)) });
    }
  return out;
}

/** Each pane once. */
function dedupe(panes: Crossing[]): Crossing[] {
  const out = new Map<string, Crossing>();
  for (const c of panes.map(canonical)) out.set(`${c.x},${c.y},${c.z},${c.dx},${c.dy}`, c);
  return [...out.values()];
}

/**
 * One attack on a unit: a blow (rolled on the attacker's aim; it's next to
 * it), or a round fired at what shows of it. The caller has paid its TU.
 */
export function attack(b: Battle, s: Unit, t: Unit, reaction = false, mode: ShotMode = "snap"): BattleEvent[] {
  const w = WEAPONS[s.weapon];
  if (!w.melee) return fire(b, s, aimPoint(b.map, t, t.kind, aimFrom(b, s, t)), t, t, reaction, mode);
  const r = battleRng(b);
  face(s, t);
  const hitRoll = r.next() * 100 < blowChance(s);
  const crit = hitRoll && r.next() * 100 < oddsAgainst(b, s, t, s, reaction).crit && !reaction;
  const hits: ShotHit[] = [];
  const after: BattleEvent[] = [];
  if (hitRoll) {
    const res = wound(b, s, t, r.int(w.damage[0], w.damage[1]), crit);
    hits.push(res.hit);
    after.push(...res.events);
  }
  const seen = s.side === "agent" || t.side === "agent" || seenByAgents(b, s, s);
  s.hidden = false;
  const from = muzzle(s, s.kind), aim = aimPoint(b.map, t, t.kind, s);
  const events: BattleEvent[] = [{ kind: "shot", unit: s.id, weapon: s.weapon, target: t.id, from, aim, rays: [aim], hits, reaction, melee: true, seen }, ...after];
  if (s.side === "agent") events.push(...reveal(b, s));
  if (t.side === "enemy") events.push(...alertPod(b, t.pod));
  events.push(...checkEnd(b));
  return events;
}

// ---------------------------------------------------------------------------
// Doors and glass

/** The same edge, named from its west or north tile (dx, dy ≥ 0). */
const canonical = (c: Crossing): Crossing =>
  c.dx < 0 || c.dy < 0 ? { x: c.x + c.dx, y: c.y + c.dy, z: c.z, dx: Math.abs(c.dx), dy: Math.abs(c.dy) } : { x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy };

/** Opens a closed door for good (no one shuts it again). The team sees it open if an agent sees either side. */
function openDoor(b: Battle, u: Unit, c: Crossing): BattleEvent[] {
  setEdge(b.map, c.x, c.y, c.z, c.dx, c.dy, E.DOOR, edgeSkinAt(b.map, c.x, c.y, c.z, c.dx, c.dy));
  const far = { x: c.x + c.dx, y: c.y + c.dy, z: c.z };
  const seen = u.side === "agent" || seenByAgents(b, c) || seenByAgents(b, far);
  return [{ kind: "door", unit: u.id, at: canonical(c), seen }];
}

/**
 * Closed doors this unit can open where it stands: one on an edge of its
 * own tile, or, posted up beside a doorway against the wall, one on the
 * next tile along the wall (on the same side).
 */
export function doorsInReach(b: Battle, u: Pt3): Crossing[] {
  const m = b.map;
  const out = new Map<string, Crossing>();
  for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = { x: u.x + ox, y: u.y + oy, z: u.z };
    if ((ox || oy) && (!walkable(m, t.x, t.y, t.z) || !edgeFree(m, u.x, u.y, u.z, ox, oy))) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (dx * ox + dy * oy !== 0) continue; // beside it: the door faces across the way stepped
      if (edgeAt(m, t.x, t.y, t.z, dx, dy) !== E.SHUT) continue;
      const c = canonical({ ...t, dx, dy });
      out.set(`${c.x},${c.y},${c.z},${c.dx},${c.dy}`, c);
    }
  }
  return [...out.values()];
}

export function commandOpenDoor(b: Battle, u: Unit, c: Crossing): BattleEvent[] | CommandError {
  if (b.result) return "The battle is over";
  const tired = holding(u) ?? short(u, TU_COST.door);
  if (tired) return tired;
  const k = canonical(c);
  if (!doorsInReach(b, u).some((d) => d.x === k.x && d.y === k.y && d.z === k.z && d.dx === k.dx && d.dy === k.dy)) return "No closed door within reach";
  u.tu -= TU_COST.door;
  face(u, { x: k.x + k.dx / 2, y: k.y + k.dy / 2, z: k.z });
  const events = openDoor(b, u, k);
  if (u.side === "agent") events.push(...wakeWhoSpots(b, u));
  return events;
}

/**
 * Shatters panes (a shot through them, a fire against them), struck from
 * `from`: a glass wall leaves an open frame, a window its sill.
 */
function shatter(b: Battle, panes: Crossing[], from: Pt3): BattleEvent[] {
  if (!panes.length) return [];
  for (const c of panes) {
    const window = edgeAt(b.map, c.x, c.y, c.z, c.dx, c.dy) === E.WINDOW;
    setEdge(b.map, c.x, c.y, c.z, c.dx, c.dy, window ? E.SILL : E.NONE, edgeSkinAt(b.map, c.x, c.y, c.z, c.dx, c.dy));
  }
  return [{ kind: "glass", panes: panes.map(canonical), from: { x: from.x, y: from.y, z: from.z } }];
}

/** The panes (glass walls, windows) on the sides of these tiles. */
function glassAround(b: Battle, tiles: Pt3[]): Crossing[] {
  const out = new Map<string, Crossing>();
  for (const q of tiles)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      if (breakable(edgeAt(b.map, q.x, q.y, q.z, dx, dy))) {
        const c = canonical({ ...q, dx, dy });
        out.set(`${c.x},${c.y},${c.z},${c.dx},${c.dy}`, c);
      }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Commands (the player's, and the AI's)

type CommandError = string;

/** Not enough time: the message for a command this unit can't afford. */
const short = (u: Unit, need: number) => (u.tu >= need ? null : `Needs ${need} TU (${u.tu} left)`);
/** Holding: a unit on overwatch or hunkered down has finished its turn. */
const holding = (u: Unit) => (u.overwatch ? "Holding for reaction fire" : null);

export function commandMove(b: Battle, u: Unit, to: Pt3): BattleEvent[] | CommandError {
  if (b.result) return "The battle is over";
  const hold = holding(u);
  if (hold) return hold;
  if (!canStand(b, to)) return "Can't stand there";
  const r = reach(b, u);
  const cost = tuTo(b, r, to);
  if (cost === undefined || cost > u.tu) return "Out of reach";
  const path = pathTo(b, r, to)!;
  u.tu -= cost;
  return walk(b, u, path, cost);
}

/** What a shot (or a blow, for a blade or claws) costs this unit. */
export const shotCost = (u: Unit, mode: ShotMode = "snap") => (WEAPONS[u.weapon].melee ? tuCost(u, "melee") : tuCost(u, fireMode(u, mode)));

export function commandShoot(b: Battle, u: Unit, t: Unit, mode: ShotMode = "snap"): BattleEvent[] | CommandError {
  if (b.result) return "The battle is over";
  const hold = holding(u);
  if (hold) return hold;
  if (t.torpor > 0) return "It's down: finish it before it rises";
  if (WEAPONS[u.weapon].clip && u.ammo <= 0) return "Out of ammunition: reload";
  mode = fireMode(u, mode);
  const need = shotCost(u, mode);
  const tired = short(u, need);
  if (tired) return tired;
  if (!sees(b, u, t, t)) return "Can't see it";
  if (!inReach(b, u, t)) return WEAPONS[u.weapon].melee ? "Not within reach" : "Out of range";
  u.tu -= need;
  if (mode !== "burst" || !WEAPONS[u.weapon].burst) return attack(b, u, t, false, mode === "burst" ? "snap" : mode);
  // A burst: so many rounds (or what's left in the clip), each its own flight, until the target drops.
  const events: BattleEvent[] = [];
  for (let i = 0; i < WEAPONS[u.weapon].burst && u.ammo > 0 && active(t) && !b.result; i++) events.push(...attack(b, u, t, false, "burst"));
  return events;
}

/**
 * Ours and bystanders near the line of fire from `u` to a spot: within
 * about a tile of the line, from the muzzle to a little past the aim, on
 * the shooter's or the target's level. For a warning before firing.
 */
export function atRisk(b: Battle, u: Unit, p: Pt3): Unit[] {
  const o = aimFrom(b, u, p);
  const dx = p.x - o.x, dy = p.y - o.y, len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [];
  return b.units.filter((v) => {
    if (v === u || !active(v) || hostile(u, v) || (v.z !== o.z && v.z !== p.z)) return false;
    if (v.x === p.x && v.y === p.y && v.z === p.z) return false;
    const t = ((v.x - o.x) * dx + (v.y - o.y) * dy) / len2;
    if (t <= 0 || t > 1.3) return false;
    const off = Math.abs((v.x - o.x) * dy - (v.y - o.y) * dx) / Math.sqrt(len2);
    return off < 0.9;
  });
}

/** How far a shot may be forced at a spot (tiles). */
const FORCE_RANGE = SIGHT;

/** Why `u` can't force a shot at the spot `p` (null: it can). */
export function forceBlocker(b: Battle, u: Unit, p: Pt3, mode: ShotMode = "snap"): string | null {
  if (b.result) return "The battle is over";
  const hold = holding(u);
  if (hold) return hold;
  if (WEAPONS[u.weapon].melee) return "Nothing to fire";
  if (WEAPONS[u.weapon].clip && u.ammo <= 0) return "Out of ammunition: reload";
  const tired = short(u, shotCost(u, mode));
  if (tired) return tired;
  if (p.x === u.x && p.y === u.y && p.z === u.z) return "Not at your own feet";
  if (distance(u, p) > FORCE_RANGE) return "Out of range";
  return null;
}

/**
 * Force fire: a shot at a spot, not a unit (glass to break, the doorway
 * behind an enemy, a corner a vampire will come round). It aims at chest
 * height over that tile, or at whoever stands there; the rounds fly as any
 * other's and hit what they meet. It needn't be seen.
 */
export function commandShootAt(b: Battle, u: Unit, p: Pt3, mode: ShotMode = "snap"): BattleEvent[] | CommandError {
  const blocker = forceBlocker(b, u, p, mode);
  if (blocker) return blocker;
  mode = fireMode(u, mode);
  u.tu -= shotCost(u, mode);
  const there = unitAt(b, p);
  const aim = (q: Unit | undefined) => (q && active(q) ? aimPoint(b.map, q, q.kind, aimFrom(b, u, q)) : pointAim(p));
  const rounds = mode === "burst" && WEAPONS[u.weapon].burst ? WEAPONS[u.weapon].burst : 1;
  const events: BattleEvent[] = [];
  for (let i = 0; i < rounds && (i === 0 || u.ammo > 0) && !b.result; i++)
    events.push(...fire(b, u, aim(there), p, null, false, rounds > 1 ? "burst" : mode));
  return events;
}

/** The haemolytic agent: a vampire in torpor next to the agent is finished. Quiet. */
export function commandFinish(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  const tired = holding(u) ?? short(u, TU_COST.finish);
  if (tired) return tired;
  if (t.torpor <= 0) return "Not in torpor";
  if (!bodiesInReach(b, u).includes(t)) return "Get next to it first";
  u.tu -= TU_COST.finish;
  t.alive = false;
  face(u, t);
  return [{ kind: "death", unit: t.id, text: "Finished" }, ...checkEnd(b)];
}

/** The prisoner, next to this agent and still bound. */
export const prisonerInReach = (b: Battle, u: Unit) =>
  b.units.find((o) => o.kind === "hostage" && o.side === "neutral" && onMap(o) && adjacent(b.map, u, o));

/** Cut the prisoner loose: from the next turn they move with the team, and must get out alive. */
export function commandFree(b: Battle, u: Unit, h: Unit): BattleEvent[] | CommandError {
  const tired = holding(u) ?? short(u, TU_COST.free);
  if (tired) return tired;
  if (prisonerInReach(b, u) !== h) return "Get next to them first";
  u.tu -= TU_COST.free;
  h.side = "agent";
  h.tu = 0;
  h.alerted = true;
  return [{ kind: "status", unit: h.id, text: "Freed", seen: true }];
}

/** A downed agent next to this one, bleeding. */
export const bleederInReach = (b: Battle, u: Unit) =>
  b.units.find((o) => o.kind === "agent" && o.alive && o.bleeding > 0 && adjacent(b.map, u, o));

/** Field dressing: the bleeding stops. Still down, but alive. */
export function commandStabilize(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  const tired = holding(u) ?? short(u, TU_COST.stabilize);
  if (tired) return tired;
  if (bleederInReach(b, u) !== t) return "Get next to them first";
  u.tu -= TU_COST.stabilize;
  t.bleeding = 0;
  t.stable = true;
  return [{ kind: "status", unit: t.id, text: "Stabilized", seen: true }];
}

/** Bind a vampire in torpor and carry it off: a captive, if a base has a cell for it. */
export function commandCapture(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  const tired = holding(u) ?? short(u, TU_COST.capture);
  if (tired) return tired;
  if (t.torpor <= 0) return "Not in torpor";
  if (!bodiesInReach(b, u).includes(t)) return "Get next to it first";
  u.tu -= TU_COST.capture;
  t.captured = true;
  face(u, t);
  return [{ kind: "status", unit: t.id, text: "Taken alive", seen: true }, ...checkEnd(b)];
}

/** The tiles an incendiary at `p` sets alight: it and the eight round it, where there's ground to burn. */
export function blastTiles(b: Battle, p: Pt3): Pt3[] {
  const out: Pt3[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z };
      const t = tileAt(b.map, q.x, q.y, q.z);
      if (t !== T.VOID && t !== T.WALL && lineOfSight(b.map, p, q)) out.push(q);
    }
  return out;
}

/** The incendiary it would throw (pockets first), and what the throw costs. */
function throwPlan(u: Unit, from?: Stowed): { grenade: Stowed; cost: number } | null {
  const g = from && from.item === "incendiary" && u.gear.stowed.includes(from) ? from : stowedOf(u.gear, (x) => x === "incendiary")[0];
  return g ? { grenade: g, cost: tuCost(u, "throw") + (g.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function throwBlocker(b: Battle, u: Unit, p: Pt3, from?: Stowed): string | null {
  const plan = throwPlan(u, from);
  if (!plan) return "No incendiaries left";
  const tired = holding(u) ?? short(u, plan.cost);
  if (tired) return tired;
  if (tileAt(b.map, p.x, p.y, p.z) === T.VOID || tileAt(b.map, p.x, p.y, p.z) === T.WALL) return "Nothing to burn there";
  if (distance(u, p) > INCENDIARY.range) return "Too far to throw";
  if (!sightPoint(b.map, u, p)) return "No clear throw";
  return null;
}

export function commandIncendiary(b: Battle, u: Unit, p: Pt3, from?: Stowed): BattleEvent[] | CommandError {
  const blocker = throwBlocker(b, u, p, from);
  if (blocker) return blocker;
  const plan = throwPlan(u, from)!;
  u.tu -= plan.cost;
  u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.grenade);
  face(u, p);
  const tiles = blastTiles(b, p);
  for (const q of tiles) b.fire[tileIndex(b, q)] = INCENDIARY.turns;
  wreckVehicles(b.map, tiles);
  const events: BattleEvent[] = [{ kind: "throw", unit: u.id, at: p, tiles, lean: leanFor(b, u, p) }, ...shatter(b, glassAround(b, tiles), p)];
  for (const q of tiles) {
    const v = unitAt(b, q);
    if (v) events.push(...burn(b, v, "fire"));
  }
  events.push(...reveal(b, u), ...noise(b, p));
  for (const v of tiles.map((q) => unitAt(b, q))) if (v?.side === "enemy") events.push(...alertPod(b, v.pod));
  events.push(...checkEnd(b));
  return events;
}

/**
 * The end of our turn: every agent with a gun, rounds in it and time for a
 * snap shot holds what's left for reaction fire at whatever moves in sight
 * (−15 aim, no criticals), as often as the TU last.
 */
export function holdForReactions(b: Battle) {
  for (const a of agents(b)) a.overwatch = canReact(a);
}

/** Sneaking on or off: slower steps, and harder to spot while the team is concealed. Free. */
export function setSneak(u: Unit, on: boolean) {
  u.sneak = on;
}

/** The magazine this unit would load (pockets first), and what reloading costs with it. */
export function reloadPlan(u: Unit): { mag: Stowed; cost: number } | null {
  const mag = u.gear.weapon ? ITEMS[u.gear.weapon].mag : undefined;
  const s = mag ? stowedOf(u.gear, (x) => x === mag)[0] : undefined;
  return s ? { mag: s, cost: TU_COST.reload + (s.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function reloadBlocker(u: Unit): string | null {
  const w = WEAPONS[u.weapon];
  if (!w.clip) return "Nothing to reload";
  if (u.ammo >= w.clip) return "Fully loaded";
  const plan = reloadPlan(u);
  if (!plan) return `No ${ITEMS[ITEMS[u.gear.weapon!]?.mag ?? "mag-pistol"].name.toLowerCase()} left`;
  return holding(u) ?? short(u, plan.cost);
}

/** A fresh magazine from a pocket (or the backpack, slower): the old one, and its rounds, are dropped. */
export function commandReload(b: Battle, u: Unit): BattleEvent[] | CommandError {
  const w = WEAPONS[u.weapon];
  const why = reloadBlocker(u);
  if (why) return why;
  const plan = reloadPlan(u)!;
  u.tu -= plan.cost;
  u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.mag);
  u.ammo = w.clip;
  return [{ kind: "status", unit: u.id, text: "Reloaded", seen: u.side === "agent" || seenByAgents(b, u, u), cue: "reload" }];
}

// ---------------------------------------------------------------------------
// The inventory (sim/inventory.ts) on the battlescape

/** A place an item can be: in the inventory, or a floor item (by id). */
export type InvRef = Place | { floor: string };
const isFloor = (r: InvRef): r is { floor: string } => "floor" in r;

/** Items within reach on the ground: this tile and the eight round it, with nothing in the way. */
export const floorNear = (b: Battle, u: Pt3) =>
  b.floor.filter((f) => f.z === u.z && Math.max(Math.abs(f.x - u.x), Math.abs(f.y - u.y)) <= 1 && ((f.x === u.x && f.y === u.y) || lineOfSight(b.map, u, f)));

const refTu = (r: InvRef) => (isFloor(r) ? INV_TU.floor : "slot" in r ? INV_TU.hand : r.in === "pack" ? INV_TU.pack : INV_TU.pocket);
/** What moving an item costs: out of one place and into another; a shuffle within one container. */
export function inventoryCost(from: InvRef, to: InvRef): number {
  if (!isFloor(from) && !isFloor(to) && !("slot" in from) && !("slot" in to) && from.in === to.in) return INV_TU.shuffle;
  if (isFloor(from) && isFloor(to)) return 0;
  return refTu(from) + refTu(to);
}

/** The item at a reference: in the inventory, or on the ground near by. */
function itemAtRef(b: Battle, u: Unit, r: InvRef): { item: ItemId; ammo?: number } | null {
  if (isFloor(r)) {
    const f = floorNear(b, u).find((x) => x.id === r.floor);
    return f ? { item: f.item, ammo: f.ammo } : null;
  }
  if ("slot" in r && r.slot === "weapon" && u.gear.weapon) return { item: u.gear.weapon, ammo: u.ammo };
  return itemAt(u.gear, r);
}

/** The worn slots that can't change mid-fight. */
const lockedSlot = (r: InvRef) => !isFloor(r) && "slot" in r && r.slot !== "weapon";

/** Why an item can't move from one place to another now (null: it can). */
export function inventoryBlocker(b: Battle, u: Unit, from: InvRef, to: InvRef): string | null {
  if (b.result) return "The battle is over";
  if (b.side !== "agent" || u.side !== "agent" || !active(u)) return "Not now";
  const got = itemAtRef(b, u, from);
  if (!got) return "Nothing there";
  if (lockedSlot(from) || lockedSlot(to)) return "Armour stays on in a fight";
  const hold = holding(u);
  if (hold) return hold;
  const tired = short(u, inventoryCost(from, to));
  if (tired) return tired;
  if (isFloor(to)) return null;
  if (isFloor(from)) {
    if (canPut(u.gear, got.item, to)) return null;
    if ("slot" in to && to.slot === "weapon" && ITEMS[got.item].slot === "weapon") return null; // the one in hand goes down
    return "slot" in to ? "That doesn't go there" : "It doesn't fit there";
  }
  const trial = cloneGear(u.gear);
  return moveWithin(trial, from, to);
}

/** Moves an item, paying its time. The weapon in hand's rounds go with it; the hand takes up what's put there. */
export function commandInventory(b: Battle, u: Unit, from: InvRef, to: InvRef): string | null {
  const why = inventoryBlocker(b, u, from, to);
  if (why) return why;
  if (!isFloor(from) && !isFloor(to) && samePlace(from, to)) return null;
  u.tu -= inventoryCost(from, to);
  if (u.gear.weapon) u.gear.ammo = u.ammo;
  if (isFloor(to) && isFloor(from)) return null;
  if (isFloor(from) && !isFloor(to)) {
    const f = b.floor.find((x) => x.id === from.floor)!;
    if ("slot" in to && u.gear[to.slot]) {
      const old = takeOut(u.gear, to)!;
      dropItem(b, u, old.item, old.ammo, true);
    }
    putIn(u.gear, f.item, to, f.ammo);
    b.floor = b.floor.filter((x) => x !== f);
  } else if (isFloor(to) && !isFloor(from)) {
    const out = takeOut(u.gear, from)!;
    dropItem(b, u, out.item, out.ammo, true);
  } else if (!isFloor(from) && !isFloor(to)) moveWithin(u.gear, from, to);
  syncHand(u);
  return null;
}

/** After the hand changes: the weapon, its rounds, and a fire mode it has. */
function syncHand(u: Unit) {
  u.weapon = handWeapon(u.gear);
  const w = WEAPONS[u.weapon];
  u.ammo = u.gear.weapon ? Math.min(w.clip, u.gear.ammo ?? w.clip) : w.clip;
  if (u.gear.weapon) u.gear.ammo = u.ammo;
  u.mode = fireMode(u, u.mode);
}

/** Sets the fire mode for the weapon in hand. */
export function setMode(u: Unit, mode: ShotMode): string | null {
  if (!modesOf(u).includes(mode)) return `The ${WEAPONS[u.weapon].name.toLowerCase()} doesn't fire that way`;
  u.mode = mode;
  return null;
}

/** Who a trauma kit can patch: the agent, or one next to them, hurt and on their feet. */
export const patchable = (b: Battle, u: Unit) =>
  b.units.filter((o) => o.kind === "agent" && active(o) && o.hp < o.maxHp && (o === u || adjacent(b.map, u, o)));

/** The trauma kit it would open (pockets first), and the cost. */
export function healPlan(u: Unit, from?: Stowed): { kit: Stowed; cost: number } | null {
  const k = from && from.item === "medkit" && u.gear.stowed.includes(from) ? from : stowedOf(u.gear, (x) => x === "medkit")[0];
  return k ? { kit: k, cost: TU_COST.heal + (k.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function healBlocker(b: Battle, u: Unit, t: Unit, from?: Stowed): string | null {
  const plan = healPlan(u, from);
  if (!plan) return "No trauma kit";
  const tired = holding(u) ?? short(u, plan.cost);
  if (tired) return tired;
  if (!patchable(b, u).includes(t)) return t.hp >= t.maxHp ? "Not hurt" : "Get next to them first";
  return null;
}

/** A trauma kit: tourniquet, dressings; some health back. Used up. */
export function commandHeal(b: Battle, u: Unit, t: Unit, from?: Stowed): BattleEvent[] | CommandError {
  const why = healBlocker(b, u, t, from);
  if (why) return why;
  const plan = healPlan(u, from)!;
  u.tu -= plan.cost;
  u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.kit);
  const got = Math.min(MEDKIT_HEAL, t.maxHp - t.hp);
  t.hp += got;
  if (t !== u) face(u, t);
  return [{ kind: "status", unit: t.id, text: `Patched up (+${got})`, seen: true }];
}

export { CONTAINERS };

export const onLandingZone = (b: Battle, p: Pt3) => b.map.lz.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);

export function commandEvacuate(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (!onLandingZone(b, u)) return "Get to the landing zone first";
  const tired = short(u, TU_COST.evacuate);
  if (tired) return tired;
  u.tu = 0;
  u.evacuated = true;
  return [{ kind: "status", unit: u.id, text: "Evacuated", seen: true }, ...checkEnd(b)];
}

/** Won when every enemy is gone (a body in torpor still counts); lost when every agent is; aborted when the survivors have all left. */
function checkEnd(b: Battle): BattleEvent[] {
  if (b.result) return [];
  const live = b.units.filter((u) => u.kind === "agent" && u.alive && !isDown(u));
  if (!enemies(b).length) b.result = "won";
  else if (!live.length) b.result = "lost";
  else if (live.every((u) => u.evacuated)) b.result = "aborted";
  return b.result ? [{ kind: "end", result: b.result }] : [];
}

/** The start of a side's turn: fire burns whoever stands in it; the sun finds vampires outdoors; torpor wears off. */
function startOfTurn(b: Battle, side: "agent" | "enemy"): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const u of b.units.filter((x) => x.side === side && onMap(x))) {
    if (burning(b, u)) events.push(...burn(b, u, "fire"));
    if (!onMap(u)) continue;
    if (u.kind === "vampire" && !b.night && !indoors(b.map, u)) events.push(...burn(b, u, "sun"));
    if (!onMap(u)) continue;
    if (u.bleeding > 0 && --u.bleeding === 0) {
      u.alive = false;
      dropLoot(b, u);
      events.push({ kind: "death", unit: u.id, text: "Bled out" });
      continue;
    }
    if (u.torpor > 0 && --u.torpor === 0) {
      u.hp = Math.max(1, Math.ceil(u.maxHp * RISE_HEALTH));
      u.alerted = true;
      events.push({ kind: "status", unit: u.id, text: "Rises!", seen: seenByAgents(b, u) });
    }
  }
  if (side === "agent")
    for (const [i, n] of Object.entries(b.fire)) {
      if (n <= 1) delete b.fire[+i];
      else b.fire[+i] = n - 1;
    }
  events.push(...checkEnd(b));
  return events;
}

/** The player is done: the enemy moves, then a new turn begins. */
export function endTurn(b: Battle): BattleEvent[] {
  if (b.result) return [];
  const events: BattleEvent[] = [];
  holdForReactions(b);
  b.side = "enemy";
  events.push({ kind: "turn", side: "enemy", turn: b.turn });
  for (const e of enemies(b)) {
    e.tu = e.torpor ? 0 : e.maxTu;
    e.overwatch = false;
  }
  events.push(...startOfTurn(b, "enemy"));
  if (!b.result) events.push(...enemyTurn(b));
  if (b.result) return events;
  b.side = "agent";
  b.turn++;
  events.push({ kind: "turn", side: "agent", turn: b.turn });
  for (const a of agents(b)) {
    a.tu = a.maxTu;
    a.overwatch = false;
  }
  events.push(...startOfTurn(b, "agent"));
  // A dominated agent stands slack-jawed through this turn.
  for (const a of agents(b))
    if (a.dominated) {
      a.dominated = false;
      a.tu = 0;
      events.push({ kind: "status", unit: a.id, text: "Dominated: loses the turn", seen: true });
    }
  return events;
}
