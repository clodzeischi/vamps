// Per-agent equipment (docs/design/base.md, inventory: docs/design/inventory.md): what each agent carries.
// The team's kit (civilian, plainclothes, tactical) still sets noise and
// concealment; it also decides which of an agent's items go along: a
// civilian carries only civilian items, plainclothes adds what can be
// hidden, tactical takes everything. Bought for a base's armoury; carried
// by the agent; lost with them.
import type { KitId } from "./kit";
import type { WeaponId } from "../tactical/rules";

export type ItemId =
  | "knife" | "pistol" | "pistol-sd" | "smg" | "shotgun" | "shotgun-semi" | "rifle" | "rifle-sd" | "m249" | "m240b" | "m110" | "rpg"
  | "soft-vest" | "tactical-vest" | "helmet"
  | "incendiary" | "medkit"
  | "mag-pistol" | "mag-smg" | "mag-rifle" | "shells" | "box-m249" | "belt-m240b" | "mag-m110" | "rocket";
/** Where an item can be worn: in the hand, as armour, as a helmet. Anything else is only carried (pockets, backpack). */
export type Slot = "weapon" | "armour" | "helmet" | "carried";

export interface ItemDef {
  id: ItemId;
  name: string;
  slot: Slot;
  /** Cells it takes in a pocket or the backpack: width, height (long things stand upright). */
  size: [number, number];
  /** The quietest kit it goes with: civilian items go everywhere, tactical ones only with tactical kit. */
  kit: KitId;
  cost: number;
  /** Auto-combat damage, 1 = the old plainclothes pistol-and-vest team. */
  firepower?: number;
  /** Share of incoming damage stopped. */
  armour?: number;
  /** What it is on the battlescape. */
  weapon?: WeaponId;
  /** Weapons: the magazine that reloads it. */
  mag?: ItemId;
  /** What it does when used from a pocket or the backpack. */
  use?: "throw" | "heal";
  /** Used up when used (incendiaries thrown, medkits opened, magazines loaded). */
  consumable?: boolean;
  /** May travel by courier between bases (no weapons). */
  courier?: boolean;
  /** Research or engineering that makes it available. */
  requires?: string;
  description: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  knife: { id: "knife", name: "Combat knife", slot: "weapon", size: [1, 2], kit: "civilian", cost: 0, firepower: 0.55, weapon: "knife", description: "Always to hand. The weapon of last resort, and the only one a civilian carries." },
  pistol: { id: "pistol", name: "Pistol", slot: "weapon", size: [1, 2], kit: "plainclothes", cost: 1_500, firepower: 0.9, weapon: "pistol", mag: "mag-pistol", description: "A compact 9 mm under a jacket. Standard issue. Fits a pocket." },
  "pistol-sd": { id: "pistol-sd", name: "Suppressed pistol", slot: "weapon", size: [1, 3], kit: "plainclothes", cost: 3_000, firepower: 0.85, weapon: "pistol-sd", mag: "mag-pistol", description: "A pistol with a can on the muzzle: nobody near hears it, and a target that drops doesn't give the team away. Too long for a pocket." },
  smg: { id: "smg", name: "Compact SMG", slot: "weapon", size: [1, 3], kit: "plainclothes", cost: 4_000, firepower: 1.1, weapon: "smg", mag: "mag-smg", description: "Folds under a coat. More bullets, less reach; fires bursts." },
  shotgun: { id: "shotgun", name: "Mossberg pump shotgun", slot: "weapon", size: [2, 4], kit: "tactical", cost: 2_000, firepower: 1.3, weapon: "shotgun", mag: "shells", description: "Close and brutal: what you want in a cellar. Three shells, racked by hand." },
  "shotgun-semi": { id: "shotgun-semi", name: "Semi-auto shotgun", slot: "weapon", size: [2, 4], kit: "tactical", cost: 3_500, firepower: 1.4, weapon: "shotgun-semi", mag: "shells", description: "Gas-operated: six shells as fast as you pull the trigger, a little less punch than the pump." },
  rifle: { id: "rifle", name: "Carbine", slot: "weapon", size: [2, 4], kit: "tactical", cost: 5_000, firepower: 1.3, weapon: "rifle", mag: "mag-rifle", description: "Reach and accuracy; fires bursts. Nobody mistakes it for anything else." },
  m249: { id: "m249", name: "M249 light machine gun", slot: "weapon", size: [2, 5], kit: "tactical", cost: 9_000, firepower: 1.6, weapon: "m249", mag: "box-m249", description: "Squad automatic weapon: fires six-round bursts from a box of 30. Loud, heavy, and it keeps their heads down." },
  m240b: { id: "m240b", name: "M240B machine gun", slot: "weapon", size: [2, 5], kit: "tactical", cost: 12_000, firepower: 1.7, weapon: "m240b", mag: "belt-m240b", description: "A full-power 7.62 machine gun: seven-round bursts, hits harder than anything else we carry, scatters wider." },
  rpg: { id: "rpg", name: "Rocket launcher", slot: "weapon", size: [2, 5], kit: "tactical", cost: 15_000, firepower: 1.8, weapon: "rpg", mag: "rocket", description: "One rocket at a time: it goes off where it lands, hurting everyone within two tiles the blast reaches, shattering glass and setting the ground alight. Mind your own people." },
  m110: { id: "m110", name: "M110 sniper rifle", slot: "weapon", size: [2, 5], kit: "tactical", cost: 11_000, firepower: 1.4, weapon: "m110", mag: "mag-m110", description: "Semi-automatic 7.62 with a long barrel and a scope: the tightest shot we have, and the hardest-hitting single round. Ten in the magazine." },
  "rifle-sd": { id: "rifle-sd", name: "Suppressed carbine", slot: "weapon", size: [2, 5], kit: "tactical", cost: 8_000, firepower: 1.25, weapon: "rifle-sd", mag: "mag-rifle", description: "A carbine with a suppressor: quiet, a little weaker, and long. Still fits the backpack." },
  "soft-vest": { id: "soft-vest", name: "Soft vest", slot: "armour", size: [2, 3], kit: "plainclothes", cost: 1_000, armour: 0.15, description: "Under a shirt. Stops a knife, slows a bullet. Standard issue." },
  "tactical-vest": { id: "tactical-vest", name: "Plate carrier", slot: "armour", size: [2, 3], kit: "tactical", cost: 6_000, armour: 0.4, description: "Plates front and back, pouches, a collar against teeth." },
  helmet: { id: "helmet", name: "Ballistic helmet", slot: "helmet", size: [2, 2], kit: "tactical", cost: 1_500, armour: 0.1, description: "Aramid shell. Takes a little off every hit." },
  incendiary: { id: "incendiary", name: "Incendiary grenade", slot: "carried", size: [1, 1], kit: "tactical", cost: 800, use: "throw", consumable: true, description: "Thermite: a 3 × 3 fire that burns a vampire twice as hard. Used up when thrown." },
  medkit: { id: "medkit", name: "Trauma kit", slot: "carried", size: [2, 1], kit: "plainclothes", cost: 600, use: "heal", consumable: true, courier: true, description: "Tourniquets and dressings: in a fight, patches the agent or one next to them (10 health); one left after a fight patches the worst wound. Used up." },
  "mag-pistol": { id: "mag-pistol", name: "Pistol magazine", slot: "carried", size: [1, 1], kit: "plainclothes", cost: 60, consumable: true, courier: true, description: "Reloads a pistol, suppressed or not. Used up." },
  "mag-smg": { id: "mag-smg", name: "SMG magazine", slot: "carried", size: [1, 1], kit: "plainclothes", cost: 80, consumable: true, courier: true, description: "Reloads the compact SMG. Used up." },
  "mag-rifle": { id: "mag-rifle", name: "Carbine magazine", slot: "carried", size: [1, 2], kit: "plainclothes", cost: 100, consumable: true, courier: true, description: "Reloads a carbine, suppressed or not. Used up." },
  rocket: { id: "rocket", name: "Rocket", slot: "carried", size: [1, 3], kit: "tactical", cost: 800, consumable: true, courier: true, description: "One rocket: reloads the rocket launcher. Used up." },
  "mag-m110": { id: "mag-m110", name: "M110 magazine", slot: "carried", size: [1, 2], kit: "tactical", cost: 150, consumable: true, courier: true, description: "Ten rounds of 7.62 match: reloads the M110. Used up." },
  "box-m249": { id: "box-m249", name: "M249 ammunition box", slot: "carried", size: [2, 2], kit: "tactical", cost: 300, consumable: true, courier: true, description: "A box of 30 linked rounds: reloads the M249. Used up." },
  "belt-m240b": { id: "belt-m240b", name: "M240B belt", slot: "carried", size: [2, 2], kit: "tactical", cost: 400, consumable: true, courier: true, description: "A belt of 28 rounds of 7.62: reloads the M240B. Used up." },
  shells: { id: "shells", name: "Shotgun shells", slot: "carried", size: [1, 1], kit: "plainclothes", cost: 40, consumable: true, courier: true, description: "A box of shells: reloads either shotgun. Used up." },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItemId = (x: unknown): x is ItemId => typeof x === "string" && x in ITEMS;

/** What a medkit patches after a fight. */
export const MEDKIT_HEAL = 10;
/** Cargo load per item (a crate of four is one seat). */
export const ITEM_LOAD = 0.25;

const KIT_ORDER: KitId[] = ["civilian", "plainclothes", "tactical"];
/** Whether an item goes along with a kit. */
export const allowedWith = (item: ItemId, kit: KitId) => KIT_ORDER.indexOf(ITEMS[item].kit) <= KIT_ORDER.indexOf(kit);

/** What a new agent is issued (free): a pistol, two magazines, a soft vest. */
export const STANDARD_ISSUE = { weapon: "pistol" as ItemId, armour: "soft-vest" as ItemId, carried: ["mag-pistol", "mag-pistol"] as ItemId[] };
/** Padua's armoury at the start: a full helicopter team in tactical kit. */
export const FOUNDING_ARMOURY: Partial<Record<ItemId, number>> = {
  rifle: 6, shotgun: 2, "tactical-vest": 8, helmet: 8, incendiary: 8, medkit: 4, "mag-rifle": 18, shells: 6, "mag-pistol": 8,
};
