// Commands, the player's and the AI's: each checks what blocks it, then returns the events it caused for the view to play back.
import { T, tileAt, type Pt3 } from "./map/map";
import { adjacent, distance, lineOfSight, sightPoint, SIGHT, WEAPONS } from "./rules";
import { aimPoint, pointAim, type ShotMode } from "./ballistics";
import { ITEMS, MEDKIT_HEAL } from "../data/equipment";
import { stowedOf, type Stowed } from "../sim/people/inventory";
import {
  type Unit,
  type Battle,
  type BattleEvent,
  tuCost,
  fireMode,
  sees,
  inReach,
  active,
  aimFrom,
  hostile,
  unitAt,
  TU_COST,
  bodiesInReach,
  onMap,
  RUMMAGE_TU,
  INCENDIARY,
  tileIndex,
  leanFor,
  agents,
  canReact,
  seenByAgents,
} from "./battle";
import { canStand, reach, tuTo, pathTo, walk, face, reveal, noise, alertPod } from "./movement";
import { attack, fire, burn } from "./harm";
import { checkEnd } from "./turns";
import { wreckVehicles } from "./setup";
import { shatter, glassAround } from "./doors";

export type CommandError = string;

/** Not enough time: the message for a command this unit can't afford. */
export const short = (u: Unit, need: number) =>
  u.tu >= need ? null : `Needs ${need} TU (${u.tu} left)`;
/** Holding: a unit on overwatch or hunkered down has finished its turn. */
export const holding = (u: Unit) => (u.overwatch ? "Holding for reaction fire" : null);

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
export const shotCost = (u: Unit, mode: ShotMode = "snap") =>
  WEAPONS[u.weapon].melee ? tuCost(u, "melee") : tuCost(u, fireMode(u, mode));

export function commandShoot(
  b: Battle,
  u: Unit,
  t: Unit,
  mode: ShotMode = "snap",
): BattleEvent[] | CommandError {
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
  if (mode !== "burst" || !WEAPONS[u.weapon].burst)
    return attack(b, u, t, false, mode === "burst" ? "snap" : mode);
  // A burst: so many rounds (or what's left in the clip), each its own flight, until the target drops.
  const events: BattleEvent[] = [];
  for (let i = 0; i < WEAPONS[u.weapon].burst && u.ammo > 0 && active(t) && !b.result; i++)
    events.push(...attack(b, u, t, false, "burst"));
  return events;
}

/**
 * Ours and bystanders near the line of fire from `u` to a spot: within
 * about a tile of the line, from the muzzle to a little past the aim, on
 * the shooter's or the target's level. For a warning before firing.
 */
export function atRisk(b: Battle, u: Unit, p: Pt3): Unit[] {
  const o = aimFrom(b, u, p);
  const dx = p.x - o.x,
    dy = p.y - o.y,
    len2 = dx * dx + dy * dy;
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
export function commandShootAt(
  b: Battle,
  u: Unit,
  p: Pt3,
  mode: ShotMode = "snap",
): BattleEvent[] | CommandError {
  const blocker = forceBlocker(b, u, p, mode);
  if (blocker) return blocker;
  mode = fireMode(u, mode);
  u.tu -= shotCost(u, mode);
  const there = unitAt(b, p);
  const aim = (q: Unit | undefined) =>
    q && active(q) ? aimPoint(b.map, q, q.kind, aimFrom(b, u, q)) : pointAim(p);
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
  b.units.find(
    (o) => o.kind === "hostage" && o.side === "neutral" && onMap(o) && adjacent(b.map, u, o),
  );

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
  const g =
    from && from.item === "incendiary" && u.gear.stowed.includes(from)
      ? from
      : stowedOf(u.gear, (x) => x === "incendiary")[0];
  return g ? { grenade: g, cost: tuCost(u, "throw") + (g.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function throwBlocker(b: Battle, u: Unit, p: Pt3, from?: Stowed): string | null {
  const plan = throwPlan(u, from);
  if (!plan) return "No incendiaries left";
  const tired = holding(u) ?? short(u, plan.cost);
  if (tired) return tired;
  if (tileAt(b.map, p.x, p.y, p.z) === T.VOID || tileAt(b.map, p.x, p.y, p.z) === T.WALL)
    return "Nothing to burn there";
  if (distance(u, p) > INCENDIARY.range) return "Too far to throw";
  if (!sightPoint(b.map, u, p)) return "No clear throw";
  return null;
}

export function commandIncendiary(
  b: Battle,
  u: Unit,
  p: Pt3,
  from?: Stowed,
): BattleEvent[] | CommandError {
  const blocker = throwBlocker(b, u, p, from);
  if (blocker) return blocker;
  const plan = throwPlan(u, from)!;
  u.tu -= plan.cost;
  u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.grenade);
  face(u, p);
  const tiles = blastTiles(b, p);
  for (const q of tiles) b.fire[tileIndex(b, q)] = INCENDIARY.turns;
  wreckVehicles(b.map, tiles);
  const events: BattleEvent[] = [
    { kind: "throw", unit: u.id, at: p, tiles, lean: leanFor(b, u, p) },
    ...shatter(b, glassAround(b, tiles), p),
  ];
  for (const q of tiles) {
    const v = unitAt(b, q);
    if (v) events.push(...burn(b, v, "fire"));
  }
  events.push(...reveal(b, u), ...noise(b, p));
  for (const v of tiles.map((q) => unitAt(b, q)))
    if (v?.side === "enemy") events.push(...alertPod(b, v.pod));
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
  if (!plan) return `No ${ITEMS[ITEMS[u.gear.weapon!]?.mag ?? "mag-pistol"].name} left`;
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
  return [
    {
      kind: "status",
      unit: u.id,
      text: "Reloaded",
      seen: u.side === "agent" || seenByAgents(b, u, u),
      cue: "reload",
    },
  ];
}

/** Who a trauma kit can patch: the agent, or one next to them, hurt and on their feet. */
export const patchable = (b: Battle, u: Unit) =>
  b.units.filter(
    (o) => o.kind === "agent" && active(o) && o.hp < o.maxHp && (o === u || adjacent(b.map, u, o)),
  );

/** The trauma kit it would open (pockets first), and the cost. */
export function healPlan(u: Unit, from?: Stowed): { kit: Stowed; cost: number } | null {
  const k =
    from && from.item === "medkit" && u.gear.stowed.includes(from)
      ? from
      : stowedOf(u.gear, (x) => x === "medkit")[0];
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
export function commandHeal(
  b: Battle,
  u: Unit,
  t: Unit,
  from?: Stowed,
): BattleEvent[] | CommandError {
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

export const onLandingZone = (b: Battle, p: Pt3) =>
  b.map.lz.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);

export function commandEvacuate(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (!onLandingZone(b, u)) return "Get to the landing zone first";
  const tired = short(u, TU_COST.evacuate);
  if (tired) return tired;
  u.tu = 0;
  u.evacuated = true;
  return [{ kind: "status", unit: u.id, text: "Evacuated", seen: true }, ...checkEnd(b)];
}
