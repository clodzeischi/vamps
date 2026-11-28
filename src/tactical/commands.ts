// Commands, the player's and the AI's: each checks what blocks it, then returns the events it caused for the view to play back.
import { T, tileAt, type Pt3 } from "./map/map";
import { adjacent, distance, lineOfSight, sightPoint, weaponReach, WEAPONS } from "./rules";
import { aimPoint, pointAim, type ShotMode } from "./ballistics";
import {
  ITEMS,
  MEDKIT_HEAL,
  SAMPLE_HOUSES,
  sampleId,
  type ItemId,
  type SampleHouse,
} from "../data/equipment";
import { stowAnywhere, stowedOf, type Stowed } from "../sim/people/inventory";
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
  UV_FLARE,
  SPARKLE,
  battleRng,
  TRACKER,
  ISR,
  finishCost,
  unstoppable,
  FLASHBANG,
  STROBE,
  weak,
  notice,
  enemies,
  tileIndex,
  leanFor,
  agents,
  canReact,
  seenByAgents,
} from "./battle";
import { canStand, reach, tuTo, pathTo, walk, face, reveal, noise, alertPod } from "./movement";
import { attack, burst, fire, burn, dropItem, uvBurn } from "./harm";
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
  return burst(b, u, t);
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
  if (distance(u, p) > weaponReach(u.weapon)) return "Out of range";
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
  for (let i = 0; i < rounds && (i === 0 || u.ammo > 0); i++)
    events.push(...fire(b, u, aim(there), p, null, false, rounds > 1 ? "burst" : mode));
  return events;
}

/** The haemolytic agent: a vampire in torpor next to the agent is finished. Quiet. */
export function commandFinish(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  const tired = holding(u) ?? short(u, finishCost(b));
  if (tired) return tired;
  if (t.torpor <= 0) return "Not in torpor";
  if (unstoppable(t)) return "Her blood won't take it";
  if (!bodiesInReach(b, u).includes(t)) return "Get next to it first";
  u.tu -= finishCost(b);
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
  if (unstoppable(t)) return "Her blood won't take it";
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

/** What can be thrown from the pockets and the backpack. */
export type Throwable = "incendiary" | "uv-flare" | "flashbang" | "strobe" | "sparkle";
const THROW_WORDS: Record<Throwable, string> = {
  incendiary: "No incendiaries left",
  "uv-flare": "No UV flares left",
  flashbang: "No flashbangs left",
  strobe: "No strobes left",
  sparkle: "No Sparkles left",
};

/** The grenade it would throw (the one given, or the first of its kind, pockets first), and the cost. */
function throwPlan(
  u: Unit,
  what: Throwable | Stowed = "incendiary",
): { grenade: Stowed; cost: number } | null {
  const g =
    typeof what === "object"
      ? u.gear.stowed.includes(what)
        ? what
        : undefined
      : stowedOf(u.gear, (x) => x === what)[0];
  return g ? { grenade: g, cost: tuCost(u, "throw") + (g.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function throwBlocker(
  b: Battle,
  u: Unit,
  p: Pt3,
  what: Throwable | Stowed = "incendiary",
): string | null {
  const plan = throwPlan(u, what);
  if (!plan) return THROW_WORDS[typeof what === "object" ? (what.item as Throwable) : what];
  const tired = holding(u) ?? short(u, plan.cost);
  if (tired) return tired;
  const t = tileAt(b.map, p.x, p.y, p.z);
  if (t === T.VOID || t === T.WALL)
    return plan.grenade.item === "incendiary" ? "Nothing to burn there" : "Nowhere to land";
  if (distance(u, p) > INCENDIARY.range) return "Too far to throw";
  if (!sightPoint(b.map, u, p)) return "No clear throw";
  return null;
}

/** The tiles a UV flare lights: within its radius, open, and in sight of where it lands. */
export function flareTiles(b: Battle, p: Pt3, r = UV_FLARE.radius): Pt3[] {
  const out: Pt3[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z };
      const t = tileAt(b.map, q.x, q.y, q.z);
      if (dx * dx + dy * dy > r * r + 1) continue;
      if (t !== T.VOID && t !== T.WALL && lineOfSight(b.map, p, q)) out.push(q);
    }
  return out;
}

/** Throws a grenade: an incendiary sets fire to the tiles round where it lands; a UV flare lights them for good. */
export function commandThrow(
  b: Battle,
  u: Unit,
  p: Pt3,
  what: Throwable | Stowed = "incendiary",
): BattleEvent[] | CommandError {
  const blocker = throwBlocker(b, u, p, what);
  if (blocker) return blocker;
  const plan = throwPlan(u, what)!;
  u.tu -= plan.cost;
  u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.grenade);
  face(u, p);
  if (plan.grenade.item === "uv-flare") {
    const tiles = flareTiles(b, p);
    for (const q of tiles) (b.uv ??= {})[tileIndex(b, q)] = 1;
    return [
      { kind: "throw", unit: u.id, at: p, tiles, lean: leanFor(b, u, p), item: "uv-flare" },
      ...reveal(b, u),
    ];
  }
  if (plan.grenade.item === "flashbang") return flashbang(b, u, p);
  if (plan.grenade.item === "strobe") return strobe(b, u, p);
  if (plan.grenade.item === "sparkle") return sparkle(b, u, p);
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

/** A flashbang: thralls round it lose a turn, an acoustic house's vampires two. Loud. */
function flashbang(b: Battle, u: Unit, p: Pt3): BattleEvent[] {
  const tiles = flareTiles(b, p, FLASHBANG.radius);
  const events: BattleEvent[] = [
    { kind: "throw", unit: u.id, at: p, tiles, lean: leanFor(b, u, p), item: "flashbang" },
  ];
  for (const q of tiles) {
    const v = unitAt(b, q);
    if (!v || v.side !== "enemy" || v.torpor > 0) continue;
    if (v.kind === "thrall") v.stunned = Math.max(v.stunned ?? 0, FLASHBANG.stun);
    else if (v.kind === "vampire" && weak(b, "acoustic")) {
      v.stunned = Math.max(v.stunned ?? 0, FLASHBANG.acoustic);
      events.push(...notice(b, "acoustic", v, "Reels from the bang"));
    } else continue;
    events.push({ kind: "status", unit: v.id, text: "Stunned", seen: seenByAgents(b, v) });
  }
  events.push(...reveal(b, u), ...noise(b, p));
  return events;
}

/** A strobe: vampires within range that see it lose half their next turn; a photic house's seize. Silent. */
function strobe(b: Battle, u: Unit, p: Pt3): BattleEvent[] {
  const events: BattleEvent[] = [
    { kind: "throw", unit: u.id, at: p, tiles: [], lean: leanFor(b, u, p), item: "strobe" },
  ];
  for (const v of enemies(b)) {
    if (v.kind !== "vampire" || v.torpor > 0 || !onMap(v)) continue;
    if (distance(v, p) > STROBE.range || !lineOfSight(b.map, p, v)) continue;
    if (weak(b, "photic")) {
      v.stunned = Math.max(v.stunned ?? 0, STROBE.photic);
      events.push(...notice(b, "photic", v, "Seizes in the strobe"));
    } else v.slowed = Math.max(v.slowed ?? 0, STROBE.slow);
    events.push({
      kind: "status",
      unit: v.id,
      text: weak(b, "photic") ? "Stunned" : "Dazzled",
      seen: seenByAgents(b, v),
    });
  }
  events.push(...reveal(b, u));
  return events;
}

/** The Sparkle: a pulsed-xenon flash. Vampires round it burn (for good), bodies in torpor turn to ash;
 *  people don't feel it. Silent. */
function sparkle(b: Battle, u: Unit, p: Pt3): BattleEvent[] {
  const tiles = flareTiles(b, p, SPARKLE.radius);
  const events: BattleEvent[] = [
    { kind: "throw", unit: u.id, at: p, tiles, lean: leanFor(b, u, p), item: "sparkle" },
  ];
  const r = battleRng(b);
  for (const q of tiles) {
    const v = unitAt(b, q) ?? b.units.find((o) => o.torpor > 0 && o.alive && same(o, q));
    if (v?.kind === "vampire") events.push(...uvBurn(b, v, r.int(...SPARKLE.damage)));
  }
  events.push(...reveal(b, u), ...checkEnd(b));
  return events;
}
const same = (a: Pt3, q: Pt3) => a.x === q.x && a.y === q.y && a.z === q.z;

/** A device used where the agent stands: a motion tracker's sweep, an ISR drone's launch. */
export type Device = "motion-tracker" | "isr-drone";
const DEVICE_TU: Record<Device, number> = { "motion-tracker": TRACKER.tu, "isr-drone": ISR.tu };

function devicePlan(u: Unit, item: Device): { at: Stowed; cost: number } | null {
  const at = stowedOf(u.gear, (x) => x === item)[0];
  return at ? { at, cost: DEVICE_TU[item] + (at.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function deviceBlocker(u: Unit, item: Device): string | null {
  const plan = devicePlan(u, item);
  if (!plan) return item === "isr-drone" ? "No drone" : "No motion tracker";
  return holding(u) ?? short(u, plan.cost);
}

/** A motion tracker shows every enemy moving within range, through walls, until they have moved again;
 *  an ISR drone goes up over the agent and watches the open ground round it for a few turns. */
export function commandDevice(b: Battle, u: Unit, item: Device): BattleEvent[] | CommandError {
  const why = deviceBlocker(u, item);
  if (why) return why;
  const plan = devicePlan(u, item)!;
  u.tu -= plan.cost;
  if (item === "isr-drone") {
    u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.at);
    (b.drones ??= []).push({ x: u.x, y: u.y, z: u.z, until: b.turn + ISR.turns - 1 });
    return [{ kind: "status", unit: u.id, text: "Drone up", seen: true }];
  }
  let n = 0;
  for (const e of enemies(b))
    if (active(e) && distance(e, u) <= TRACKER.range) {
      (b.tracked ??= {})[e.id] = b.turn;
      n++;
    }
  return [
    {
      kind: "status",
      unit: u.id,
      text: n ? `Tracker: ${n} moving` : "Tracker: nothing",
      seen: true,
    },
  ];
}

/** An incendiary (the grenade given, or the first, pockets first). */
export const commandIncendiary = (b: Battle, u: Unit, p: Pt3, from?: Stowed) =>
  commandThrow(b, u, p, from ?? "incendiary");

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
  // Its own magazine, or one that fits it (silver rounds), pockets first.
  const s = mag ? stowedOf(u.gear, (x) => x === mag || ITEMS[x].fits === mag)[0] : undefined;
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
  u.round = ITEMS[plan.mag.item].round;
  u.silences = ITEMS[plan.mag.item].silences;
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

/** The trauma kit it would open (the one given, or the first of that kind, or any, pockets first), and the cost. */
export function healPlan(u: Unit, what?: Stowed | ItemId): { kit: Stowed; cost: number } | null {
  const isKit = (x: ItemId) => ITEMS[x].use === "heal";
  const k =
    typeof what === "object"
      ? u.gear.stowed.includes(what) && isKit(what.item)
        ? what
        : undefined
      : stowedOf(u.gear, (x) => (what ? x === what : isKit(x)))[0];
  return k ? { kit: k, cost: TU_COST.heal + (k.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function healBlocker(b: Battle, u: Unit, t: Unit, what?: Stowed | ItemId): string | null {
  const plan = healPlan(u, what);
  if (!plan) return "No trauma kit";
  const tired = holding(u) ?? short(u, plan.cost);
  if (tired) return tired;
  if (!patchable(b, u).includes(t)) return t.hp >= t.maxHp ? "Not hurt" : "Get next to them first";
  return null;
}

/** What a trauma kit gives back. */
export const healOf = (item: ItemId) => ITEMS[item].heals ?? MEDKIT_HEAL;

/** A trauma kit: tourniquet, dressings; some health back. Used up (an advanced one after its second use). */
export function commandHeal(
  b: Battle,
  u: Unit,
  t: Unit,
  what?: Stowed | ItemId,
): BattleEvent[] | CommandError {
  const why = healBlocker(b, u, t, what);
  if (why) return why;
  const plan = healPlan(u, what)!;
  u.tu -= plan.cost;
  const left = (plan.kit.ammo ?? ITEMS[plan.kit.item].uses ?? 1) - 1;
  if (left > 0) plan.kit.ammo = left;
  else u.gear.stowed = u.gear.stowed.filter((x) => x !== plan.kit);
  const got = Math.min(healOf(plan.kit.item), t.maxHp - t.hp);
  t.hp += got;
  // Haem serum: more each turn after.
  const regen = ITEMS[plan.kit.item].regen;
  if (regen) t.regen = { ...regen };
  if (t !== u) face(u, t);
  return [{ kind: "status", unit: t.id, text: `Patched up (+${got})`, seen: true }];
}

/** Vampire bodies next to this agent a sample can be taken from: in torpor, or destroyed and not burnt. */
export const samplable = (b: Battle, u: Unit) =>
  b.units.filter(
    (o) =>
      o.kind === "vampire" &&
      !o.sampled &&
      !o.captured &&
      !o.evacuated &&
      (o.alive ? o.torpor > 0 : !o.burnt) &&
      adjacent(b.map, u, o),
  );

/** Samples left in a biopsy kit (a full kit's are refilled at home). */
export const kitUses = (s: Stowed) => s.ammo ?? ITEMS["biopsy-kit"].uses ?? 0;

/** The biopsy kit it would open (pockets first, one with samples left), and the cost. */
export function biopsyPlan(u: Unit): { kit: Stowed; cost: number } | null {
  const k = stowedOf(u.gear, (x) => x === "biopsy-kit").find((s) => kitUses(s) > 0);
  return k ? { kit: k, cost: TU_COST.biopsy + (k.in === "pack" ? RUMMAGE_TU : 0) } : null;
}

export function biopsyBlocker(b: Battle, u: Unit, t: Unit): string | null {
  if (t.kind !== "vampire") return "Only a vampire";
  if (t.burnt) return "Burnt: nothing left to sample";
  if (t.sampled) return "Already sampled";
  const plan = biopsyPlan(u);
  if (!plan)
    return stowedOf(u.gear, (x) => x === "biopsy-kit").length
      ? "The biopsy kit is empty"
      : "No biopsy kit";
  const tired = holding(u) ?? short(u, plan.cost);
  if (tired) return tired;
  if (!samplable(b, u).includes(t)) return "Get next to it first";
  return null;
}

/** A biopsy: a tissue sample of the vampire's house and kind into the pack (or at the agent's feet). */
export function commandBiopsy(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  const why = biopsyBlocker(b, u, t);
  if (why) return why;
  const plan = biopsyPlan(u)!;
  u.tu -= plan.cost;
  plan.kit.ammo = kitUses(plan.kit) - 1;
  t.sampled = true;
  face(u, t);
  if (b.bloodline in SAMPLE_HOUSES) {
    const item = sampleId(
      t.elder ? "elder" : t.feral ? "feral" : "vampire",
      b.bloodline as SampleHouse,
    );
    if (!stowAnywhere(u.gear, item, undefined, false)) dropItem(b, u, item, undefined, true);
  }
  return [{ kind: "status", unit: u.id, text: "Sample taken", seen: true }];
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
