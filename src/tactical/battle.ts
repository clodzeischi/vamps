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
//
// This file holds the battle's state, its types and constants, time units and
// the queries everything else asks (who sees whom, the odds of a shot). The
// rest is beside it: setup.ts, movement.ts, harm.ts, doors.ts, commands.ts,
// inventory.ts and turns.ts.
import { rng, type Rng } from "../sim/core/rng";
import { idx, indoors, isLit, type BattleMap, type Pt3 } from "./map/map";
import {
  adjacent,
  canSee,
  coverAgainst,
  distance,
  FLANK_CRIT,
  sightPoint,
  DARK_SIGHT,
  nightSight,
  SIGHT,
  VAMPIRE_SIGHT,
  WEAPONS,
  type Crossing,
  type ShotOdds,
  type WeaponId,
} from "./rules";
import { estimate, spread, type M3, type RayEnd, type ShotMode } from "./ballistics";
import { traitsOf, type BloodlineTraits } from "./traits";
import type { Band, WeaknessId } from "../data/strains";
import { ITEMS, type Round } from "../data/equipment";
import type { Suspicion } from "../sim/core/state";
import { type ItemId } from "../data/equipment";
import { CONTAINERS, type Gear } from "../sim/people/inventory";

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
  /** What the unit wears and carries (sim/people/inventory.ts); thralls carry their gun. */
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
  /** Vampires: burned to ash (fire, sun, UV): nothing left to sample. */
  burnt?: boolean;
  /** Vampires: a tissue sample has been taken from it. */
  sampled?: boolean;
  /** Agents: the special rounds in the gun in hand (silver, haemolytic, coated), if any. */
  round?: Round;
  /** Turns it loses whole (a flashbang, a strobe on a photic house). */
  stunned?: number;
  /** Share of its next turn's TU lost (a haemolytic hit, a strobe). */
  slowed?: number;
  /** Vampires: dropped by a haemolytic or coated hit: dies when its torpor ends instead of rising. */
  doomed?: boolean;
  /** Agents: the house the silencer bolt loaded was built against ("agnes": the Montségur silencer). */
  silences?: string;
  /** Vampires: hit by a silencer of its own: no armour, no healing, and once down it never rises. */
  silenced?: boolean;
  /** Vampires: feral (a starving house's): melee, quicker, no domination. */
  feral?: boolean;
  /** Vampires: turns it stays feral after a chelation bolt. */
  feralTurns?: number;
  /** Haem serum: health back at the start of each of its next turns. */
  regen?: { per: number; turns: number };
  /** Agnes herself, at Montségur: she heals and rises at once until a Montségur silencer finds her. */
  agnes?: boolean;
  /** Agents: down at 0 HP, turns left before bleeding out (0: not bleeding). */
  bleeding: number;
  /** Agents: down, but stabilized: out of the fight, and will live if the team wins or carries on. */
  stable: boolean;
  /** Agents: carrying a crate of what the bloodline kept (loot). */
  carrying: boolean;
  /** Enemies: has it noticed the team? */
  alerted: boolean;
  /** A rescue's guard: the tile it never strays more than a step from (beside the prisoner). */
  post?: Pt3;
  /** Enemies that start together and wake together. */
  pod: number;
  /** Radians; 0 faces +x. */
  facing: number;
}

export type BattleResult = "won" | "lost" | "aborted";

/** A unit a shot hit: the damage it took (after armour), and whether it was a critical. */
export interface ShotHit {
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
  | {
      kind: "shot";
      unit: string;
      weapon: WeaponId;
      target?: string;
      from: M3;
      aim: M3;
      rays: M3[];
      /** What each ray struck (a gun's shots; a blow has none). */
      ends?: RayEnd[];
      hits: ShotHit[];
      reaction: boolean;
      melee: boolean;
      seen: boolean;
      lean?: Pt3;
      burst?: boolean;
    }
  | {
      kind: "throw";
      unit: string;
      at: Pt3;
      tiles: Pt3[];
      lean?: Pt3;
      item?: "uv-flare" | "flashbang" | "strobe" | "sparkle";
    }
  /** A closed door opened (it stays open). */
  /** `more`: the other edges of a door two tiles wide, opened with it. */
  | { kind: "door"; unit: string; at: Crossing; more?: Crossing[]; seen: boolean }
  /** A rocket going off at `at`: the tiles the blast reached (its hurt is in the shot's hits). */
  | { kind: "blast"; unit: string; at: Pt3; tiles: Pt3[]; seen: boolean }
  /** Panes shattered (by a shot or a fire, from `from`, tiles): a glass wall now open, a window now a bare sill. */
  | { kind: "glass"; panes: Crossing[]; from: Pt3 }
  /** Doors broken (a blast, a shotgun): open doorways, the doors gone. */
  | { kind: "smash"; doors: Crossing[]; from: Pt3 }
  | { kind: "burn"; unit: string; damage: number; why: "fire" | "sun" | "uv"; seen: boolean }
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
  /** Tiles a UV flare lights for the rest of the fight (index → 1): vampires won't enter them. */
  uv?: Record<number, 1>;
  /** Research: damage to vampires (UV rounds), how much worse they hit (pheromone blockers), and the mind. */
  mods: {
    vampireDamage: number;
    vampireAim: number;
    /** Domination neurology: taken off every vampire's will. */
    will?: number;
    /** Discernment of spirits: a dominated operative loses half a turn, not a whole one. */
    discern?: boolean;
    /** Pheromone blockers carried: a one-compound house's domination fails. */
    blockers?: boolean;
    /** Torpor metabolism: TU off finishing a body. */
    finishLess?: number;
  };
  /** The house's strain (data/strains.ts): silver and the weaknesses that play out here. */
  strain?: BattleStrain;
  /** What the team has seen of it at work, for the Bloodlines screen. */
  noticed?: Suspicion[];
  /** A motion tracker's sweep: unit id → the turn through which it is shown. */
  tracked?: Record<string, number>;
  /** ISR drones overhead: where, and the turn through which they watch. */
  drones?: (Pt3 & { until: number })[];
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

export interface Loot extends Pt3 {
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
  /** The house's strain (the campaign's roll; a skirmish has none). */
  strain?: BattleStrain;
  /** Agnes's lair: its eldest is Agnes. */
  agnes?: boolean;
  /** The share of its vampires (not the elder) that come feral (sim/campaign/feeding.ts). */
  feral?: number;
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

export const DEFAULT_OPTIONS: SkirmishOptions = {
  bloodline: "carcassonne",
  night: true,
  kit: "tactical",
  arrival: "helicopter",
};

/** Turns a vampire lies in torpor (one less for the Huaca Line). */
export const TORPOR_TURNS = { night: 2, day: 3 };
/** Health a vampire rises with. */
export const RISE_HEALTH = 0.4;
/** A vampire's will, before its line's bonus. */
export const VAMPIRE_WILL = 55;
/** Incendiary: range in tiles, burn damage (a vampire takes double), turns the ground burns. */
export const INCENDIARY = { range: 10, damage: [12, 18] as const, turns: 2 };
/** A UV flare: thrown as far as an incendiary; it lights the tiles within `radius` it can see. */
export const UV_FLARE = { range: 10, radius: 2 };
/** A flashbang: thralls within `radius` that see it lose a turn (an acoustic house's vampires two). */
export const FLASHBANG = { radius: 2, stun: 1, acoustic: 2 };
/** A strobe: vampires within `range` that see it lose half their next turn (a photic house's, a whole one). */
export const STROBE = { range: 5, slow: 0.5, photic: 1 };
/** A haemolytic hit: the share of a vampire's next turn lost (a slow-clotting house's, more). */
export const HAEMOLYTIC = { damage: 0.9, slow: 0.2, slowClotting: 0.3 };
/** A coated round or blade against a vampire. */
export const COATED = 2;
/** A feral vampire: TU over a refined one's. */
export const FERAL_TU = 4;
/** Feral, by birth (a starving house) or for now (a chelation bolt). */
export const isFeral = (u: Unit) => !!u.feral || (u.feralTurns ?? 0) > 0;

/** Night optics, and a thermal sight on a vampire: how far they see. */
export const OPTICS_SIGHT = 14;
/** A motion tracker's sweep. */
export const TRACKER = { range: 12, tu: 10 };
/** An ISR drone: what it watches, for how long. */
export const ISR = { range: 15, turns: 3, tu: 15 };

/** UV gear tuned to the house's band. */
export const UV_ON_BAND = 1.6;
/** The Sparkle: ultraviolet within `radius`, to vampires (broadband: no band bonus). */
export const SPARKLE = { radius: 2, damage: [20, 30] as const };
/** The Lantern suit: burn to a vampire that claws the wearer. */
export const LANTERN_BURN = 10;

/** Agnes, unsilenced: she heals this much a turn and rises after a single turn of torpor. */
export const AGNES_HEAL = 15;
/** Agnes as long as no Montségur silencer has found her: nothing keeps her down. */
export const unstoppable = (u: Unit) => !!u.agnes && !u.silenced;

/** TU to finish a body in torpor (less with Torpor metabolism). */
export const finishCost = (b: Battle) => TU_COST.finish - (b.mods.finishLess ?? 0);

/** The start of a unit's turn: a stun takes the turn, a slowing part of it. */
export function daze(b: Battle, u: Unit): BattleEvent[] {
  if (u.stunned) {
    u.stunned--;
    u.tu = 0;
    return [
      {
        kind: "status",
        unit: u.id,
        text: "Stunned",
        seen: u.side === "agent" || seenByAgents(b, u),
      },
    ];
  }
  if (u.slowed) {
    u.tu = Math.round(u.tu * (1 - u.slowed));
    u.slowed = 0;
  }
  return [];
}
/** Sun damage to a vampire caught outdoors by day, at the start of its turn. */
export const SUN_DAMAGE = 18;
/** A vampire (claws in rules.ts). Tuned against the auto-combat (tactical/calibrate.test.ts). */
export const VAMPIRE = { hp: 48, aim: 65 };

/** A lair's eldest: tougher, surer, stronger-willed, and it dominates every turn it can't claw. */
export const ELDER = { hp: 120, aim: 85, will: 20, armour: 6 };

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
export const TU_COST = {
  reload: 15,
  finish: 15,
  capture: 20,
  stabilize: 15,
  free: 10,
  evacuate: 8,
  heal: 15,
  biopsy: 12,
  door: 4,
};

/** Silver frangible rounds (docs/design/research.md, "Silver"): to humans, and to vampires. */
export { SILVER } from "../data/strains";

/** What a house's strain brings to a fight. */
export interface BattleStrain {
  /** Multiplies silver's damage to its vampires. */
  silver: number;
  /** The light its skin absorbs: UV gear tuned to it does UV_ON_BAND. */
  band?: Band;
  weaknesses: WeaknessId[];
}

/** The house here has this weakness. */
export const weak = (b: Battle, w: WeaknessId) => !!b.strain?.weaknesses.includes(w);

/** The team has seen a weakness (or silver) at work: once a fight, as a status over the unit. */
export function notice(b: Battle, what: Suspicion, u: Unit, text: string): BattleEvent[] {
  if (!(u.side === "agent" || seenByAgents(b, u))) return [];
  const first = !(b.noticed ?? []).includes(what);
  if (first) (b.noticed ??= []).push(what);
  return first ? [{ kind: "status", unit: u.id, text, seen: true }] : [];
}

/** Turns a circadian-locked house sleeps through by day. */
export const SLEEP_TURNS = 2;
/** A vampire of a circadian-locked house, by day, early on: it sleeps through gunfire (a hit wakes it). */
export const asleep = (b: Battle, u: Unit) =>
  u.kind === "vampire" && !u.alerted && !b.night && b.turn <= SLEEP_TURNS && weak(b, "circadian");
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
export const attackCost = (u: Pick<Unit, "maxTu" | "weapon">) =>
  tuCost(u, WEAPONS[u.weapon].melee ? "melee" : "snap");
/** The fire modes the weapon in hand has: a blow; or snap and aimed, and burst if it fires them; a machine gun bursts only. */
export const modesOf = (u: Pick<Unit, "weapon">): ShotMode[] => {
  const w = WEAPONS[u.weapon];
  return w.melee
    ? ["snap"]
    : w.burstOnly
      ? ["burst"]
      : w.burst
        ? ["snap", "aimed", "burst"]
        : ["snap", "aimed"];
};
/** The mode a shot is fired in: the one asked for if the weapon has it, else its first. */
export const fireMode = (u: Pick<Unit, "weapon">, mode: ShotMode): ShotMode =>
  modesOf(u).includes(mode) ? mode : modesOf(u)[0]!;
/** Done for the turn: out of time, or holding it for reaction fire. */
export const ready = (u: Unit) => u.tu > 0 && !u.overwatch;
/** Sneaking: each step costs this much more; an enemy must be this much closer to spot the agent while concealed. */
export const SNEAK = { move: 1.5, detect: 0.5 };
/** Whether a unit can react to movement with the TU it has: a gun with rounds in it, and the time for a snap shot. */
export const canReact = (u: Unit) => {
  const w = WEAPONS[u.weapon];
  return !w.melee && (!w.clip || u.ammo > 0) && u.tu >= attackCost(u);
};

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
export const unitAt = (b: Battle, p: Pt3) =>
  b.units.find((u) => onMap(u) && u.x === p.x && u.y === p.y && u.z === p.z);
export const hostile = (a: Unit, c: Unit) =>
  a.side !== "neutral" && c.side !== "neutral" && a.side !== c.side;
export const tileIndex = (b: Battle, p: Pt3) => idx(b.map, p.x, p.y, p.z);
export const burning = (b: Battle, p: Pt3) => (b.fire[tileIndex(b, p)] ?? 0) > 0;

/** Who looks: a unit, or one at another point (with what it wears on its head). */
type Viewer = Pt3 & { kind: UnitKind; gear?: Gear };
const opticsOf = (v: Viewer) => (v.gear?.helmet ? ITEMS[v.gear.helmet].optics : undefined);

/** How far `viewer` sees toward `p`: at night humans see only what's lit from afar, and by the moon
 *  (or with night optics); vampires see in the dark. */
function sightRange(b: Battle, viewer: Viewer, p: Pt3): number {
  // Below ground it's always night.
  if (!b.night && p.z >= b.map.ground) return SIGHT;
  if (viewer.kind === "vampire") return VAMPIRE_SIGHT;
  const dark = p.z >= b.map.ground ? nightSight(b.moon) : DARK_SIGHT;
  const night = opticsOf(viewer) === "night" ? Math.max(dark, OPTICS_SIGHT) : dark;
  return isLit(b.map, p) || burning(b, p) ? SIGHT : night;
}

/** Whether `viewer` sees `p` (and the unit there, if it's hiding). A thermal sight finds a vampire (it
 *  runs cold) at OPTICS_SIGHT, day or night, hiding or not. */
export function sees(b: Battle, viewer: Viewer, p: Pt3, target?: Unit): boolean {
  const thermal = opticsOf(viewer) === "thermal" && target?.kind === "vampire";
  if (target?.hidden && distance(viewer, p) > (thermal ? OPTICS_SIGHT : HIDDEN_RANGE)) return false;
  const range = sightRange(b, viewer, p);
  return canSee(b.map, viewer, p, thermal ? Math.max(range, OPTICS_SIGHT) : range);
}

/** What the player is shown: anything an agent sees, and what a motion tracker or a drone shows. */
export function seenByAgents(b: Battle, p: Pt3, target?: Unit): boolean {
  if (target && (b.tracked?.[target.id] ?? -1) >= b.turn) return true;
  if (
    target &&
    b.drones?.some(
      (d) => d.until >= b.turn && distance(d, target) <= ISR.range && !indoors(b.map, target),
    )
  )
    return true;
  return agents(b).some((a) => sees(b, a, p, target));
}

/** Units of the other side this unit can see and shoot (not bodies in torpor). */
export const visibleFoes = (b: Battle, u: Unit, from: Pt3 = u) =>
  b.units.filter(
    (o) => active(o) && hostile(u, o) && sees(b, { ...from, kind: u.kind, gear: u.gear }, o, o),
  );

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
  return WEAPONS[u.weapon].melee
    ? adjacent(b.map, from, t)
    : distance(aimFrom(b, u, t, from), t) <= (WEAPONS[u.weapon].range ?? SIGHT);
}

/** The cone of `u`'s shot (σ, radians): its weapon, its skill, the mode, reaction fire, from concealment. */
export const coneOf = (b: Battle, u: Unit, mode: ShotMode = "snap", reaction = false) =>
  spread(u, mode, reaction, u.side === "agent" && b.concealed);

/** Crit chance a unit's own (agents: Insight). */
export const critBonus = (u: Unit) =>
  u.side === "agent" ? Math.max(0, Math.round((u.insight - 30) / 5)) : 0;

/** A blow's chance to land (melee isn't ballistic): the attacker's aim, 5–95. */
export const blowChance = (u: Unit) => Math.max(5, Math.min(95, Math.round(u.aim)));

/**
 * The AI's measure of a shot by `u` (standing at `from`) at `t`: roughly the
 * share of rounds that would land (ballistics.ts estimate, in percent), and
 * the crit. Never shown to the player.
 */
export function oddsAgainst(
  b: Battle,
  u: Unit,
  t: Unit,
  from: Pt3 = u,
  reaction = false,
  mode: ShotMode = "snap",
): ShotOdds {
  const w = WEAPONS[u.weapon];
  const at = aimFrom(b, u, t, from);
  const c = coverAgainst(b.map, t, at);
  const crit = Math.min(100, w.crit + critBonus(u) + (c.flanked ? FLANK_CRIT : 0));
  if (w.melee) {
    const inRange = adjacent(b.map, from, t);
    return { chance: inRange ? blowChance(u) : 0, crit, flanked: false, inRange };
  }
  const p = estimate(b.map, coneOf(b, u, mode, reaction), u.weapon, at, t, t.kind);
  return {
    chance: Math.round(p * 100),
    crit,
    flanked: c.flanked,
    inRange: distance(at, t) <= SIGHT,
  };
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

export { CONTAINERS };
