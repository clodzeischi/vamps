// Setting up a battle: the squad and its kit, enemy pods, the war zone, units placed on the map.
import { VITALITY_RANGE } from "../data/agents";
import { APTITUDE_ROLL } from "../data/aptitudes";
import { rng, type Rng } from "../sim/core/rng";
import {
  breakable,
  E,
  edgeAt,
  edgeSkinAt,
  idx,
  indoors,
  setEdge,
  T,
  tileAt,
  walkable,
  type BattleMap,
  type Pt3,
} from "./map/map";
import { distance, WEAPONS, type WeaponId } from "./rules";
import { traitsOf } from "./traits";
import { ELDERS } from "../data/people";
import { ITEMS, type ItemId } from "../data/equipment";
import { cloneGear, emptyGear, packGear, stowAnywhere, type Gear } from "../sim/people/inventory";
import {
  type SkirmishOptions,
  DEFAULT_OPTIONS,
  type Battle,
  type Unit,
  type SquadMember,
  MAYHEM,
  agentAim,
  agentTu,
  ELDER,
  VAMPIRE,
  ENEMY_TU,
  VAMPIRE_WILL,
  type Loot,
  fireMode,
} from "./battle";

const AGENT_NAMES = [
  "Br. Tomasz",
  "Sr. Ines",
  "Fr. Malik",
  "Sr. Kateri",
  "Br. Anselm",
  "Sr. Miriam",
  "Fr. Diego",
  "Br. Kofi",
];

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
export function newSkirmish(
  map: BattleMap,
  seed: number,
  opts: SkirmishOptions = DEFAULT_OPTIONS,
): Battle {
  const r = rng({ rng: seed ^ 0x5bd1e995 });
  const tr = traitsOf(opts.bloodline);
  const units: Unit[] = [];
  const mods = opts.mods ?? { vampireDamage: 1, vampireAim: 0 };
  const stat = (k: "combat" | "tradecraft" | "insight" | "faith" | "vitality") =>
    r.int(...(k === "vitality" ? VITALITY_RANGE : APTITUDE_ROLL));
  const squad: SquadMember[] =
    opts.squad ??
    (opts.mayhem ? MAYHEM.squad : loadout(opts.kit)).map((weapon, i) => {
      const kit = kitGear(
        opts.mayhem ? "tactical" : opts.kit,
        weapon,
        opts.mayhem ? MAYHEM.incendiaries : 0,
      );
      const vitality = stat("vitality");
      // An agent's HP is their Vitality.
      const hp = vitality;
      const combat = stat("combat");
      return {
        id: `a${i}`,
        name: AGENT_NAMES[(seed + i) % AGENT_NAMES.length]!,
        aim: agentAim(combat),
        hp,
        maxHp: hp,
        faith: stat("faith"),
        tradecraft: stat("tradecraft"),
        insight: stat("insight"),
        gear: kit,
        armour: kitArmour(kit),
        tu: agentTu(combat),
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
    units.push(
      unit({
        ...rest,
        gear: g,
        weapon,
        kind: "agent",
        side: "agent",
        ...p,
        maxTu: tu,
        alerted: true,
      }),
    );
  });
  const enemyUnits = map.spawns.filter((s) => s.side !== "civilian");
  const pod = pods(enemyUnits);
  enemyUnits.forEach((s, i) => {
    const vampire = s.side === "vampire";
    const elder = vampire && !!s.elder;
    const weapon: WeaponId = opts.mayhem
      ? r.pick(vampire ? MAYHEM.vampires : MAYHEM.thralls)
      : vampire
        ? "claws"
        : r.pick<WeaponId>(["pistol", "pistol", "rifle", "shotgun"]);
    const hp = Math.round(
      (elder ? ELDER.hp : vampire ? VAMPIRE.hp : r.int(24, 30) + tr.thrallHp) *
        (opts.mayhem ? (vampire ? MAYHEM.vampireHp : MAYHEM.thrallHp) : 1),
    );
    const tu = elder ? ENEMY_TU.elder : vampire ? ENEMY_TU.vampire : ENEMY_TU.thrall;
    units.push(
      unit({
        id: `e${i}`,
        kind: vampire ? "vampire" : "thrall",
        side: "enemy",
        name: elder
          ? (ELDERS[opts.bloodline]?.short ?? "The Eldest")
          : vampire
            ? "Vampire"
            : "Thrall",
        x: s.x,
        y: s.y,
        z: s.z,
        hp,
        maxHp: hp,
        aim: (elder ? ELDER.aim : vampire ? VAMPIRE.aim : 55) - (vampire ? mods.vampireAim : 0),
        will: vampire ? VAMPIRE_WILL + tr.will + (elder ? ELDER.will : 0) : 0,
        maxTu: Math.round(tu * (opts.mayhem && vampire ? MAYHEM.vampireTu : 1)),
        armour: elder ? ELDER.armour : 0,
        weapon,
        pod: pod[i]!,
        alerted: !!opts.mayhem,
        facing: r.real(0, Math.PI * 2),
        hidden: tr.hidden,
        elder,
        // A thrall's gun is a real one: it can be picked up when they fall (and a spare magazine, now and then).
        gear: vampire && !opts.mayhem ? emptyGear() : thrallGear(weapon, r.chance(0.5)),
      }),
    );
  });
  // The prisoner, held near the vampires; the loot, in the rooms round them.
  const lair = enemyUnits.filter((s) => s.side === "vampire")[0] ?? enemyUnits[0];
  const taken = (p: Pt3) =>
    units.some((u) => u.x === p.x && u.y === p.y && u.z === p.z) ||
    map.spawns.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);
  const near = (n: number): Pt3[] => {
    const out: Pt3[] = [];
    if (!lair) return out;
    for (let d = 1; d <= 6 && out.length < n; d++)
      for (let dy = -d; dy <= d && out.length < n; dy++)
        for (let dx = -d; dx <= d && out.length < n; dx++) {
          const p = { x: lair.x + dx, y: lair.y + dy, z: lair.z };
          if (
            Math.max(Math.abs(dx), Math.abs(dy)) !== d ||
            tileAt(map, p.x, p.y, p.z) !== T.FLOOR ||
            taken(p) ||
            out.some((q) => q.x === p.x && q.y === p.y)
          )
            continue;
          if (r.chance(0.5)) out.push(p);
        }
    return out;
  };
  if (opts.hostage) {
    const p = near(1)[0];
    if (p)
      units.push(
        unit({
          id: "h0",
          kind: "hostage",
          side: "neutral",
          name: "The prisoner",
          ...p,
          hp: 18,
          maxHp: 18,
          aim: 30,
          maxTu: ENEMY_TU.hostage,
          armour: 0,
          weapon: "knife",
        }),
      );
  }
  const loot: Loot[] = near(opts.loot ?? 0).map((p, i) => ({ id: `l${i}`, ...p, by: null }));
  map.spawns
    .filter((s) => s.side === "civilian")
    .forEach((s, i) => {
      units.push(
        unit({
          id: `c${i}`,
          kind: "civilian",
          side: "neutral",
          name: "Civilian",
          x: s.x,
          y: s.y,
          z: s.z,
          hp: 18,
          maxHp: 18,
          aim: 0,
          maxTu: ENEMY_TU.civilian,
          armour: 0,
          weapon: "pistol",
          ammo: 0,
        }),
      );
    });
  const fire = opts.mayhem ? warZone(map, r, units) : {};
  return {
    map,
    units,
    turn: 1,
    side: "agent",
    rng: r.int(1, 2 ** 31),
    result: null,
    night: opts.night,
    moon: opts.moon ?? 0.5,
    bloodline: opts.bloodline,
    fire,
    mods,
    loot,
    airlift: opts.arrival === "helicopter",
    floor: [],
    nextItem: 0,
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
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const e = edgeAt(map, x, y, z, dx, dy);
          if (breakable(e) && r.chance(MAYHEM.glass))
            setEdge(
              map,
              x,
              y,
              z,
              dx,
              dy,
              e === E.WINDOW ? E.SILL : E.NONE,
              edgeSkinAt(map, x, y, z, dx, dy),
            );
        }
  const fire: Record<number, number> = {};
  const clear = (x: number, y: number, z: number) =>
    units.every((u) => Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) > 1 || u.z !== z) &&
    map.lz.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 3 || p.z !== z);
  const set = (x: number, y: number, z: number) => (fire[idx(map, x, y, z)] = MAYHEM.burns);
  for (const v of map.vehicles ?? [])
    if (r.chance(MAYHEM.cars) && clear(v.x, v.y, map.ground)) {
      for (let dy = 0; dy < v.h; dy++)
        for (let dx = 0; dx < v.w; dx++) set(v.x + dx, v.y + dy, map.ground);
      v.wrecked = true;
    }
  const z = map.ground;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++)
      if (
        walkable(map, x, y, z) &&
        !indoors(map, { x, y, z }) &&
        clear(x, y, z) &&
        r.chance(MAYHEM.fires)
      )
        set(x, y, z);
  return fire;
}

/** Vehicles that fire reaches burn out (the look: their tiles' cover stays). */
export function wreckVehicles(map: BattleMap, tiles: readonly Pt3[]) {
  for (const v of map.vehicles ?? [])
    if (
      !v.wrecked &&
      tiles.some(
        (q) => q.z === v.z && q.x >= v.x && q.y >= v.y && q.x < v.x + v.w && q.y < v.y + v.h,
      )
    )
      v.wrecked = true;
}

/** What each kit carries into a fight (data/kit.ts): knives, pistols, or rifles with a shotgun. */
export function loadout(kit: SkirmishOptions["kit"], n = 4): WeaponId[] {
  const set: WeaponId[] =
    kit === "tactical"
      ? ["rifle", "rifle", "shotgun", "rifle"]
      : kit === "plainclothes"
        ? ["pistol"]
        : ["knife"];
  return Array.from({ length: n }, (_, i) => set[i % set.length]!);
}

/** A skirmish agent's loadout for a kit and a weapon: magazines, armour, and with tactical kit a helmet, an incendiary and a trauma kit. */
export function kitGear(
  kit: SkirmishOptions["kit"],
  weapon: WeaponId,
  extraIncendiaries = 0,
): Gear {
  const item = (Object.keys(ITEMS) as ItemId[]).find(
    (x) => x !== "knife" && ITEMS[x].weapon === weapon,
  );
  const mag = item ? ITEMS[item].mag : undefined;
  const items: ItemId[] = [...(item ? [item] : []), ...(mag ? [mag, mag, mag] : [])];
  if (kit === "tactical")
    items.push(
      "tactical-vest",
      "helmet",
      "incendiary",
      "medkit",
      ...Array<ItemId>(extraIncendiaries).fill("incendiary"),
    );
  if (kit === "plainclothes") items.push("soft-vest", "medkit");
  return packGear(items).gear;
}

/** The armour value on the battlescape for a loadout's vest and helmet (plus research plates in a vest). */
export function kitArmour(g: Gear, plates = 0): number {
  const vest = g.armour ? (ITEMS[g.armour].armour ?? 0) : 0;
  const helmet = g.helmet ? (ITEMS[g.helmet].armour ?? 0) : 0;
  return Math.round((vest + (vest > 0 ? plates : 0) + helmet) * 15);
}

/** A thrall's gear: its gun, and perhaps a spare magazine. */
function thrallGear(weapon: WeaponId, spare: boolean): Gear {
  const item = (Object.keys(ITEMS) as ItemId[]).find(
    (x) => x !== "knife" && ITEMS[x].weapon === weapon,
  );
  if (!item) return emptyGear();
  const g: Gear = { weapon: item, stowed: [] };
  const mag = ITEMS[item].mag;
  if (spare && mag) stowAnywhere(g, mag);
  return g;
}

/** What a loadout puts in the hand on the battlescape. */
export const handWeapon = (g: Gear): WeaponId =>
  g.weapon ? (ITEMS[g.weapon].weapon ?? "knife") : "knife";

/** A free walkable tile near `p` (for a squad bigger than the landing zone). */
function nearFree(map: BattleMap, p: Pt3, units: Unit[]): Pt3 {
  for (let d = 1; d < 8; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        const q = { x: p.x + dx, y: p.y + dy, z: p.z };
        if (
          walkable(map, q.x, q.y, q.z) &&
          !units.some((u) => u.x === q.x && u.y === q.y && u.z === q.z)
        )
          return q;
      }
  return p;
}

type UnitInit = Partial<Unit> &
  Pick<
    Unit,
    | "id"
    | "kind"
    | "side"
    | "name"
    | "x"
    | "y"
    | "z"
    | "hp"
    | "maxHp"
    | "aim"
    | "maxTu"
    | "armour"
    | "weapon"
  >;

export function unit(u: UnitInit): Unit {
  const out: Unit = {
    ammo: WEAPONS[u.weapon].clip,
    tu: u.maxTu,
    overwatch: false,
    sneak: false,
    alive: true,
    evacuated: false,
    alerted: false,
    pod: -1,
    facing: 0,
    gear: emptyGear(),
    mode: "snap",
    faith: 50,
    tradecraft: 0,
    insight: 0,
    will: 0,
    torpor: 0,
    dominated: false,
    dominatedOnce: false,
    hidden: false,
    captured: false,
    carrying: false,
    elder: false,
    bleeding: 0,
    stable: false,
    ...u,
  };
  out.mode = fireMode(out, out.mode);
  return out;
}
