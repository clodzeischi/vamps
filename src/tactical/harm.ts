// Harm: wounds, torpor, bleeding, fire, blasts, and the shots and blows that cause them.
import { T, tileAt, type Pt3 } from "./map/map";
import { coverAgainst, FLANK_CRIT, lineOfSight, WEAPONS, type Crossing } from "./rules";
import {
  aimPoint,
  deviate,
  figureHeight,
  muzzle,
  normals,
  trace,
  type Figure,
  type M3,
  type RayEnd,
  type ShotMode,
} from "./ballistics";
import { FIGURE, LEVEL_H, TILE } from "./map/geometry";
import { ITEMS, type ItemId } from "../data/equipment";
import { RESEARCH_EFFECTS } from "../data/research";
import {
  type Battle,
  type Unit,
  type BattleEvent,
  TORPOR_TURNS,
  traits,
  seenByAgents,
  battleRng,
  SUN_DAMAGE,
  INCENDIARY,
  onMap,
  isDown,
  type ShotHit,
  aimFrom,
  coneOf,
  unitById,
  unitAt,
  active,
  critBonus,
  tileIndex,
  blowChance,
  oddsAgainst,
  SILVER,
  HAEMOLYTIC,
  COATED,
  weak,
  notice,
  asleep,
  unstoppable,
  UV_ON_BAND,
  LANTERN_BURN,
} from "./battle";
import { silverRemarkable } from "../data/strains";
import { face, noise, reveal, alertPod } from "./movement";
import { wreckVehicles } from "./setup";
import { shatter, glassAround, canonical, doorsAround, smash } from "./doors";
import { checkEnd } from "./turns";

/** Turns an agent bleeds before dying, unless stabilized. */
const BLEED_TURNS = 3;
/** Damage past 0 that kills outright (as does a critical hit). */
const OVERKILL = 18;
/** Turns a cold-torpor house sleeps longer. */
const COLD_TORPOR = 2;
/** Fire on a thin-skinned house. */
const THIN_SKIN = 1.5;

/** Bullets and claws take a unit to 0: an agent goes down (or dies, to a crit or a heavy blow); others die; a vampire falls into torpor. */
export function downed(b: Battle, t: Unit, crit = false, overkill = 0): BattleEvent[] {
  t.overwatch = false;
  if (t.kind === "agent" && !crit && overkill < OVERKILL) {
    t.bleeding = BLEED_TURNS;
    t.tu = 0;
    dropLoot(b, t);
    return [
      { kind: "torpor", unit: t.id, seen: true },
      { kind: "status", unit: t.id, text: "Down, bleeding", seen: true },
    ];
  }
  if (t.kind === "vampire") {
    const cold = weak(b, "cold-torpor") ? COLD_TORPOR : 0;
    t.torpor = unstoppable(t)
      ? 1
      : Math.max(
          1,
          (b.night ? TORPOR_TURNS.night : TORPOR_TURNS.day) - traits(b).riseSooner + cold,
        );
    t.tu = 0;
    return [
      { kind: "torpor", unit: t.id, seen: t.side === "agent" || seenByAgents(b, t) },
      ...(cold ? notice(b, "cold-torpor", t, "Deep torpor") : []),
    ];
  }
  t.alive = false;
  dropLoot(b, t);
  return [{ kind: "death", unit: t.id }];
}

/** A carrier falls: the crate lies where they fell; and if they're dead, what they carried (not what they wear). */
export function dropLoot(b: Battle, u: Unit) {
  if (u.carrying) {
    u.carrying = false;
    for (const l of b.loot)
      if (l.by === u.id) Object.assign(l, { by: null, x: u.x, y: u.y, z: u.z });
  }
  if (u.alive) return;
  const ours = u.side === "agent";
  if (u.gear.weapon) dropItem(b, u, u.gear.weapon, u.ammo, ours);
  for (const x of u.gear.stowed) dropItem(b, u, x.item, x.ammo, ours);
  u.gear = {
    ...(u.gear.armour ? { armour: u.gear.armour } : {}),
    ...(u.gear.helmet ? { helmet: u.gear.helmet } : {}),
    stowed: [],
  };
  u.weapon = u.kind === "vampire" ? "claws" : "knife";
}

export function dropItem(
  b: Battle,
  at: Pt3,
  item: ItemId,
  ammo: number | undefined,
  ours: boolean,
) {
  const w = ITEMS[item].weapon;
  const full = w ? WEAPONS[w].clip : 0;
  b.floor.push({
    id: `i${b.nextItem++}`,
    item,
    x: at.x,
    y: at.y,
    z: at.z,
    ours,
    ...(ammo !== undefined && ammo < full ? { ammo } : {}),
  });
}

/** Fire or sun: no armour, double to a vampire, and it finishes one for good. */
export function burn(b: Battle, t: Unit, why: "fire" | "sun"): BattleEvent[] {
  const r = battleRng(b);
  const vampire = t.kind === "vampire";
  const seen = t.side === "agent" || seenByAgents(b, t);
  if (t.torpor > 0) {
    // Agnes, unsilenced: the fire doesn't hold her.
    if (unstoppable(t))
      return [{ kind: "status", unit: t.id, text: "The fire won't take her", seen }];
    t.alive = false;
    t.burnt = true;
    return [{ kind: "death", unit: t.id, text: why === "fire" ? "Burned" : "Ash" }];
  }
  const straw = why === "fire" && vampire && weak(b, "thin-skin");
  let damage =
    why === "sun"
      ? Math.max(1, Math.round(SUN_DAMAGE * traits(b).sun))
      : Math.round(r.int(...INCENDIARY.damage) * (vampire ? 2 : 1) * (straw ? THIN_SKIN : 1));
  damage = Math.min(damage, t.hp);
  t.hp -= damage;
  const events: BattleEvent[] = [{ kind: "burn", unit: t.id, damage, why, seen }];
  if (straw) events.push(...notice(b, "thin-skin", t, "Burns like straw"));
  if (t.hp <= 0 && unstoppable(t)) events.push(...downed(b, t));
  else if (t.hp <= 0) {
    t.alive = false;
    if (vampire) t.burnt = true;
    dropLoot(b, t);
    events.push({ kind: "death", unit: t.id, text: vampire ? "Ash" : undefined });
  }
  return events;
}

/** Ultraviolet on a vampire (people are left alone): no armour, and what it drops is ash. A body in
 *  torpor burns away. Agnes, unsilenced, only goes down. */
export function uvBurn(b: Battle, t: Unit, damage: number): BattleEvent[] {
  if (t.kind !== "vampire" || !t.alive) return [];
  const seen = seenByAgents(b, t);
  if (t.torpor > 0) {
    if (unstoppable(t)) return [];
    t.alive = false;
    t.burnt = true;
    return [{ kind: "death", unit: t.id, text: "Ash" }];
  }
  damage = Math.min(Math.round(damage), t.hp);
  t.hp -= damage;
  const events: BattleEvent[] = [{ kind: "burn", unit: t.id, damage, why: "uv", seen }];
  if (t.hp <= 0) {
    if (unstoppable(t)) events.push(...downed(b, t));
    else {
      t.alive = false;
      t.burnt = true;
      dropLoot(b, t);
      events.push({ kind: "death", unit: t.id, text: "Ash" });
    }
  }
  return events;
}

/** The figures a round can hit: everyone on the map standing (bodies lying down are passed over). */
function figures(b: Battle): Figure[] {
  const out: Figure[] = [];
  for (const u of b.units) {
    if (!onMap(u) || u.torpor > 0 || isDown(u)) continue;
    out.push({
      id: u.id,
      x: u.x,
      y: u.y,
      z: u.z,
      h: figureHeight(b.map, u, u.kind),
      r: FIGURE.radius,
    });
  }
  return out;
}

/** Damage to a unit hit (a crit adds half; armour comes off), and what follows if it drops. */
export function wound(
  b: Battle,
  s: Unit,
  t: Unit,
  raw: number,
  crit: boolean,
): { hit: ShotHit; events: BattleEvent[] } {
  let damage = crit ? Math.ceil(raw * 1.5) : raw;
  if (asleep(b, t)) t.alerted = true; // a hit wakes even a sleeper
  // Ultraviolet: vampires burn (half as much again on their band), people take little or nothing.
  const uv = WEAPONS[s.weapon].uv;
  if (uv) {
    if (t.kind === "vampire") {
      const before = t.hp;
      const events = uvBurn(b, t, damage * (b.strain?.band === uv.band ? UV_ON_BAND : 1));
      return { hit: { unit: t.id, damage: before - Math.max(0, t.hp), crit }, events };
    }
    const hurt = Math.min(t.hp, uv.human);
    t.hp -= hurt;
    return {
      hit: { unit: t.id, damage: hurt, crit: false },
      events: t.hp <= 0 ? downed(b, t) : [],
    };
  }
  if (t.kind === "vampire" && s.side === "agent")
    damage = Math.round(damage * b.mods.vampireDamage);
  const vest = t.gear?.armour ? ITEMS[t.gear.armour].claws : undefined;
  if (vest !== undefined && s.kind === "vampire" && WEAPONS[s.weapon].melee)
    damage = Math.round(damage * vest);
  // The rounds in the gun (silver, haemolytic, coated), or a coated blade.
  const round = WEAPONS[s.weapon].coated ? "coated" : WEAPONS[s.weapon].clip ? s.round : undefined;
  const vampire = t.kind === "vampire";
  const house = b.strain?.silver ?? 1;
  // A silencer of its own house (the Montségur silencer, for Agnes): its armour goes, and it stays down.
  const silenced =
    round === "silencer" &&
    vampire &&
    !t.silenced &&
    s.silences === (t.agnes ? "agnes" : b.bloodline);
  if (silenced) {
    t.silenced = true;
    t.doomed = true;
    t.armour = 0;
  }
  if (round === "silver")
    damage = Math.round(damage * (vampire ? SILVER.vampire * house : SILVER.human));
  else if (round === "haemolytic") damage = Math.round(damage * HAEMOLYTIC.damage);
  else if (round === "coated" && vampire) damage = Math.round(damage * COATED);
  damage = Math.max(1, damage - t.armour);
  const overkill = Math.max(0, damage - t.hp);
  damage = Math.min(t.hp, damage);
  t.hp -= damage;
  // Magnesium: whoever it hits stands in fire for a turn.
  if (round === "magnesium") {
    const i = tileIndex(b, t);
    b.fire[i] = Math.max(b.fire[i] ?? 0, 1);
  }
  const seen: BattleEvent[] = silenced
    ? [{ kind: "status", unit: t.id, text: "Silenced", seen: seenByAgents(b, t, t) }]
    : [];
  if (round === "silver" && vampire && silverRemarkable(house))
    seen.push(
      ...notice(b, "silver", t, house > 1 ? "The silver burns it" : "The silver barely marks it"),
    );
  // Chelation: the haem stripped from its blood, it goes feral for a while.
  if (vampire && round === "chelation" && t.hp > 0 && !t.feral) {
    t.feralTurns = RESEARCH_EFFECTS.chelation;
    t.will = 0;
    seen.push({ kind: "status", unit: t.id, text: "Goes feral", seen: seenByAgents(b, t, t) });
  }
  if (vampire && (round === "haemolytic" || round === "coated")) {
    if (t.hp <= 0)
      t.doomed = true; // dropped: it won't rise
    else if (round === "haemolytic") {
      const clot = weak(b, "slow-clotting");
      t.slowed = Math.max(t.slowed ?? 0, clot ? HAEMOLYTIC.slowClotting : HAEMOLYTIC.slow);
      if (clot) seen.push(...notice(b, "slow-clotting", t, "It bleeds like the living"));
    }
  }
  // The Lantern suit lights when struck: the vampire that clawed burns.
  const lit =
    s.kind === "vampire" &&
    WEAPONS[s.weapon].melee &&
    t.gear?.armour &&
    ITEMS[t.gear.armour].lantern
      ? uvBurn(b, s, LANTERN_BURN)
      : [];
  return {
    hit: { unit: t.id, damage, crit },
    events: [...seen, ...(t.hp <= 0 ? downed(b, t, crit, overkill) : []), ...lit],
  };
}

/**
 * One round (or a shotgun's load) from `s` at a point: each pellet leaves
 * the muzzle in a random direction in the cone and hits whatever it meets
 * first (ballistics.ts). Glass and windows on the way break. Damage goes to
 * whoever was hit, friend or foe; a crit is rolled once a unit hit (more if
 * it was flanked from where the shot came). The caller has paid the TU.
 */
export function fire(
  b: Battle,
  s: Unit,
  aim: M3,
  aimTile: Pt3,
  target: Unit | null,
  reaction: boolean,
  mode: ShotMode,
): BattleEvent[] {
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
  const ends: RayEnd[] = [];
  const panes: Crossing[] = [];
  /** Closed doors a shotgun's pellets struck: blown in. */
  const breached: Crossing[] = [];
  const raw = new Map<string, number>();
  let landed: Pt3 | null = null;
  for (let k = 0; k < pellets; k++) {
    const [pa, pu] = pellets > 1 ? normals(() => r.next()) : [0, 0];
    const dir = deviate(from, aim, sigma * ea + pelletSigma * pa, sigma * eu + pelletSigma * pu);
    const impact = trace(b.map, from, dir, figs, s.id);
    rays.push(impact.at);
    ends.push({ struck: impact.struck, n: impact.n });
    panes.push(...impact.panes);
    if (impact.door && pellets > 1) breached.push(impact.door);
    // A rocket goes off where it stops (on whoever it struck); its hurt is the blast's.
    if (w.blast)
      landed = impact.unit ? { ...unitById(b, impact.unit)! } : landing(b, impact.at, dir);
    else if (impact.unit)
      raw.set(impact.unit, (raw.get(impact.unit) ?? 0) + r.int(w.damage[0], w.damage[1]));
  }
  const blastTilesHit = landed && w.blast ? blastArea(b, landed, w.blast.radius) : [];
  for (const { q, d } of blastTilesHit) {
    const v = unitAt(b, q);
    // In full at the centre, two-thirds a tile out, a third at the edge.
    if (v && active(v))
      raw.set(
        v.id,
        Math.max(
          raw.get(v.id) ?? 0,
          r.int(w.damage[0], w.damage[1]) * [1, 0.65, 0.35][Math.min(2, d)]!,
        ),
      );
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
  const seen =
    s.side === "agent" || struck.some((t) => t.side === "agent") || seenByAgents(b, s, s);
  s.hidden = false; // striking gives a Jade killer away
  const lean = origin.x !== s.x || origin.y !== s.y ? origin : undefined;
  const blasted: BattleEvent[] = [];
  if (landed) {
    const tiles = blastTilesHit.map((x) => x.q);
    // The ground it reached burns for a turn; the glass round it goes.
    for (const q of tiles) b.fire[tileIndex(b, q)] = Math.max(b.fire[tileIndex(b, q)] ?? 0, 1);
    wreckVehicles(b.map, tiles);
    blasted.push(
      {
        kind: "blast",
        unit: s.id,
        at: landed,
        tiles,
        seen: seen || tiles.some((q) => seenByAgents(b, q)),
      },
      ...shatter(b, glassAround(b, tiles), landed),
      ...smash(b, doorsAround(b, tiles), landed),
      ...noise(b, landed),
    );
  }
  const events: BattleEvent[] = [
    {
      kind: "shot",
      unit: s.id,
      weapon: s.weapon,
      target: target?.id,
      from,
      aim,
      rays,
      ends,
      hits,
      reaction,
      melee: false,
      seen,
      lean,
      ...(mode === "burst" ? { burst: true } : {}),
    },
    ...shatter(b, dedupe(panes), origin),
    ...smash(b, dedupe(breached), origin),
    ...blasted,
    ...after,
  ];
  // A suppressed shot that drops what it hit is unheard: no one is the wiser.
  const silent = !!w.suppressed && struck.length > 0 && struck.every((t) => !active(t));
  if (s.side === "agent" && !silent) events.push(...reveal(b, s));
  // Being shot at wakes the target's pod (and anyone hit); gunfire wakes those near.
  for (const t of new Set([target, ...struck]))
    if (t && t.side === "enemy" && !silent) events.push(...alertPod(b, t.pod));
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
  const p = {
    x: at.x - (dir.x / len) * 0.3,
    y: at.y - (dir.y / len) * 0.3,
    z: at.z - (dir.z / len) * 0.3,
  };
  const q = {
    x: Math.floor(p.x / TILE),
    y: Math.floor(p.z / TILE),
    z: Math.max(0, Math.floor(p.y / LEVEL_H)),
  };
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
      if (t !== T.VOID && t !== T.WALL && lineOfSight(b.map, p, q))
        out.push({ q, d: Math.max(Math.abs(dx), Math.abs(dy)) });
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
/**
 * A burst at `t`: all the weapon's rounds (or what's left in the clip), each
 * its own flight; once the target drops, the rest go on at where it stood
 * (a machine gun's burst runs its length).
 */
export function burst(b: Battle, s: Unit, t: Unit): BattleEvent[] {
  const w = WEAPONS[s.weapon];
  const at = aimPoint(b.map, t, t.kind, aimFrom(b, s, t));
  const tile = { x: t.x, y: t.y, z: t.z };
  const events: BattleEvent[] = [];
  for (let i = 0; i < w.burst && (!w.clip || s.ammo > 0); i++)
    events.push(
      ...(active(t) ? attack(b, s, t, false, "burst") : fire(b, s, at, tile, null, false, "burst")),
    );
  // A battle won (or lost) mid-burst ends once the burst has: the rounds play as one.
  return [...events.filter((e) => e.kind !== "end"), ...events.filter((e) => e.kind === "end")];
}

export function attack(
  b: Battle,
  s: Unit,
  t: Unit,
  reaction = false,
  mode: ShotMode = "snap",
): BattleEvent[] {
  const w = WEAPONS[s.weapon];
  if (!w.melee)
    return fire(b, s, aimPoint(b.map, t, t.kind, aimFrom(b, s, t)), t, t, reaction, mode);
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
  const from = muzzle(s, s.kind),
    aim = aimPoint(b.map, t, t.kind, s);
  const events: BattleEvent[] = [
    {
      kind: "shot",
      unit: s.id,
      weapon: s.weapon,
      target: t.id,
      from,
      aim,
      rays: [aim],
      hits,
      reaction,
      melee: true,
      seen,
    },
    ...after,
  ];
  if (s.side === "agent") events.push(...reveal(b, s));
  if (t.side === "enemy") events.push(...alertPod(b, t.pod));
  events.push(...checkEnd(b));
  return events;
}
