// Per-agent equipment (docs/WEB_PORT.md 3.7d): what each agent carries.
// The team's kit (civilian, plainclothes, tactical) still sets noise and
// concealment; it also decides which of an agent's items go along: a
// civilian carries only civilian items, plainclothes adds what can be
// hidden, tactical takes everything. Bought for a base's armoury; carried
// by the agent; lost with them.
import type { KitId } from "./kit";
import type { WeaponId } from "../tactical/rules";

export type ItemId = "knife" | "pistol" | "smg" | "shotgun" | "rifle" | "soft-vest" | "tactical-vest" | "incendiary" | "medkit";
export type Slot = "weapon" | "armour" | "utility";

export interface ItemDef {
  id: ItemId;
  name: string;
  slot: Slot;
  /** The quietest kit it goes with: civilian items go everywhere, tactical ones only with tactical kit. */
  kit: KitId;
  cost: number;
  /** Auto-combat damage, 1 = the old plainclothes pistol-and-vest team. */
  firepower?: number;
  /** Share of incoming damage stopped. */
  armour?: number;
  /** What it is on the battlescape. */
  weapon?: WeaponId;
  /** Used up when used (incendiaries thrown, medkits opened). */
  consumable?: boolean;
  /** May travel by courier between bases (no weapons). */
  courier?: boolean;
  /** Research or engineering that makes it available. */
  requires?: string;
  description: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  knife: { id: "knife", name: "Combat knife", slot: "weapon", kit: "civilian", cost: 0, firepower: 0.55, weapon: "knife", description: "Always to hand. The weapon of last resort, and the only one a civilian carries." },
  pistol: { id: "pistol", name: "Pistol", slot: "weapon", kit: "plainclothes", cost: 1_500, firepower: 0.9, weapon: "pistol", description: "A compact 9 mm under a jacket. Standard issue." },
  smg: { id: "smg", name: "Compact SMG", slot: "weapon", kit: "plainclothes", cost: 4_000, firepower: 1.1, weapon: "smg", description: "Folds under a coat. More bullets, less reach." },
  shotgun: { id: "shotgun", name: "Pump shotgun", slot: "weapon", kit: "tactical", cost: 2_000, firepower: 1.3, weapon: "shotgun", description: "Close and brutal: what you want in a cellar." },
  rifle: { id: "rifle", name: "Carbine", slot: "weapon", kit: "tactical", cost: 5_000, firepower: 1.3, weapon: "rifle", description: "Reach and accuracy. Nobody mistakes it for anything else." },
  "soft-vest": { id: "soft-vest", name: "Soft vest", slot: "armour", kit: "plainclothes", cost: 1_000, armour: 0.15, description: "Under a shirt. Stops a knife, slows a bullet. Standard issue." },
  "tactical-vest": { id: "tactical-vest", name: "Plate carrier", slot: "armour", kit: "tactical", cost: 6_000, armour: 0.4, description: "Plates front and back, pouches, a collar against teeth." },
  incendiary: { id: "incendiary", name: "Incendiary grenade", slot: "utility", kit: "tactical", cost: 800, consumable: true, description: "Thermite: a 3 × 3 fire that burns a vampire twice as hard. Used up when thrown." },
  medkit: { id: "medkit", name: "Trauma kit", slot: "utility", kit: "plainclothes", cost: 600, consumable: true, courier: true, description: "Tourniquets and dressings: after a fight, the worst wound is patched (10 health). Used up." },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItemId = (x: unknown): x is ItemId => typeof x === "string" && x in ITEMS;

/** Utility slots per agent. */
export const UTILITY_SLOTS = 2;
/** What a medkit patches after a fight. */
export const MEDKIT_HEAL = 10;
/** Cargo load per item (a crate of four is one seat). */
export const ITEM_LOAD = 0.25;

const KIT_ORDER: KitId[] = ["civilian", "plainclothes", "tactical"];
/** Whether an item goes along with a kit. */
export const allowedWith = (item: ItemId, kit: KitId) => KIT_ORDER.indexOf(ITEMS[item].kit) <= KIT_ORDER.indexOf(kit);

/** What a new agent is issued (free). */
export const STANDARD_ISSUE = { weapon: "pistol" as ItemId, armour: "soft-vest" as ItemId };
/** Padua's armoury at the start: a full helicopter team in tactical kit. */
export const FOUNDING_ARMOURY: Partial<Record<ItemId, number>> = { rifle: 6, shotgun: 2, "tactical-vest": 8, incendiary: 8, medkit: 4 };
