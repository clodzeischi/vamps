// A battle in progress, packed for the campaign save (docs/design/tactical.md,
// "Saving a battle"). A battle is plain data but for the map's byte arrays
// (tiles, skins, the edges), which go as base64. The whole map is kept, not
// regenerated from the mission's seed: doors opened and glass broken change
// it, and a later version of the map generator mustn't move the walls out
// from under units standing where they stood. Unpacking checks the shape and
// throws on anything off; the caller drops the battle then (it starts over
// from its Contact event).
import type { Battle, Unit } from "./battle";
import type { BattleMap } from "./map/map";

const ARRAYS = ["tiles", "skin", "ew", "ns", "ewSkin", "nsSkin"] as const;
type ArrayKey = (typeof ARRAYS)[number];

type PackedMap = Omit<BattleMap, ArrayKey> & Record<ArrayKey, string>;
export type PackedBattle = Omit<Battle, "map"> & { map: PackedMap };

/** Bytes to base64, in chunks (a big map would overflow one call's arguments). */
function toBase64(a: Uint8Array): string {
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: unknown, length: number, what: string): Uint8Array {
  if (typeof s !== "string") throw new Error(`battle map: ${what} missing`);
  let bin: string;
  try {
    bin = atob(s);
  } catch {
    throw new Error(`battle map: ${what} unreadable`);
  }
  if (bin.length !== length) throw new Error(`battle map: ${what} is the wrong size`);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A deep copy of the battle as JSON-safe data (the live battle carries on unchanged). */
export function packBattle(b: Battle): PackedBattle {
  const { map, ...rest } = b;
  const packedMap = { ...map } as unknown as PackedMap;
  for (const k of ARRAYS) packedMap[k] = toBase64(map[k]);
  return JSON.parse(JSON.stringify({ ...rest, map: packedMap })) as PackedBattle;
}

const isInt = (x: unknown): x is number => Number.isInteger(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** The battle back from its packed form; throws if it doesn't hold together. */
export function unpackBattle(raw: unknown): Battle {
  const p = JSON.parse(JSON.stringify(raw)) as PackedBattle;
  if (!p || typeof p !== "object" || !p.map || typeof p.map !== "object") throw new Error("battle: no map");
  const pm = p.map;
  const { w, h, levels } = pm;
  if (![w, h, levels, pm.ground].every(isInt) || w < 1 || h < 1 || levels < 1 || w * h * levels > 1_000_000) throw new Error("battle map: bad size");
  const map = { ...pm } as unknown as BattleMap;
  map.tiles = fromBase64(pm.tiles, w * h * levels, "tiles");
  map.skin = fromBase64(pm.skin, w * h * levels, "skins");
  map.ew = fromBase64(pm.ew, (w + 1) * h * levels, "edges");
  map.ewSkin = fromBase64(pm.ewSkin, (w + 1) * h * levels, "edge skins");
  map.ns = fromBase64(pm.ns, w * (h + 1) * levels, "edges");
  map.nsSkin = fromBase64(pm.nsSkin, w * (h + 1) * levels, "edge skins");
  for (const k of ["lz", "spawns", "lights", "vehicles", "furniture", "flights", "decor", "bayLines", "signs", "canopies"] as const) if (!Array.isArray(map[k])) map[k] = [];

  if (!Array.isArray(p.units) || !p.units.length) throw new Error("battle: no units");
  const ids = new Set<string>();
  for (const u of p.units as Unit[]) {
    if (!u || typeof u.id !== "string" || ids.has(u.id)) throw new Error("battle: a unit without a proper id");
    ids.add(u.id);
    if (![u.x, u.y, u.z].every(isInt) || u.x < 0 || u.y < 0 || u.z < 0 || u.x >= w || u.y >= h || u.z >= levels) throw new Error(`battle: ${u.id} is off the map`);
    if (!["agent", "enemy", "neutral"].includes(u.side)) throw new Error(`battle: ${u.id} has no side`);
    if (![u.hp, u.maxHp, u.tu, u.maxTu].every(isNum)) throw new Error(`battle: ${u.id} has bad numbers`);
    if (!u.gear || typeof u.gear !== "object" || !Array.isArray(u.gear.stowed)) throw new Error(`battle: ${u.id} has no gear`);
  }
  if (!isInt(p.turn) || p.turn < 1 || !["agent", "enemy"].includes(p.side) || !isNum(p.rng)) throw new Error("battle: bad turn");
  if (p.result !== null && !["won", "lost", "aborted"].includes(p.result)) throw new Error("battle: bad result");
  if (typeof p.airlift !== "boolean") throw new Error("battle: no way in");
  if (!isNum(p.moon)) throw new Error("battle: no moon");
  if (!p.fire || typeof p.fire !== "object") p.fire = {};
  if (!Array.isArray(p.loot)) p.loot = [];
  if (!Array.isArray(p.floor)) p.floor = [];
  if (!p.mods || !isNum(p.mods.vampireDamage) || !isNum(p.mods.vampireAim)) p.mods = { vampireDamage: 1, vampireAim: 0 };
  if (!isInt(p.nextItem)) p.nextItem = p.floor.length + 1;
  return { ...p, map } as Battle;
}
