// Per-agent equipment (docs/design/base.md, inventory: docs/design/inventory.md): what each agent carries.
// The team's kit (civilian, plainclothes, tactical) still sets noise and
// concealment; it also decides which of an agent's items go along: a
// civilian carries only civilian items, plainclothes adds what can be
// hidden, tactical takes everything. Bought on the dark web for a base's armoury; carried
// by the agent; lost with them.
import type { KitId } from "./kit";
import type { WeaponId } from "../tactical/rules";

export type ItemId =
  | "knife"
  | "pistol"
  | "pistol-sd"
  | "smg"
  | "shotgun"
  | "shotgun-semi"
  | "rifle"
  | "rifle-sd"
  | "m249"
  | "m240b"
  | "m110"
  | "rpg"
  | "soft-vest"
  | "tactical-vest"
  | "helmet"
  | "incendiary"
  | "medkit"
  | "mag-pistol"
  | "mag-smg"
  | "mag-rifle"
  | "shells"
  | "box-m249"
  | "belt-m240b"
  | "mag-m110"
  | "rocket"
  | "mag-pistol-silver"
  | "mag-smg-silver"
  | "mag-rifle-silver"
  | "biopsy-kit"
  | "uhmwpe-vest"
  | "stf-vest"
  | "heavy-plate"
  | "trauma-kit-adv"
  | "uv-flare"
  | "mag-pistol-haemolytic"
  | "mag-smg-haemolytic"
  | "mag-rifle-haemolytic"
  | "crossbow"
  | "bolt-haemolytic"
  | "bolt-coated"
  | "coated-knife"
  | "flashbang"
  | "strobe"
  | "haem-serum"
  | "magnesium-shells"
  | "sparkle"
  | "lumen-365"
  | "lumen-405"
  | "lamp-battery"
  | "excimer-lance"
  | "lance-capacitor"
  | "lantern-suit"
  | "night-optics"
  | "thermal-sight"
  | "motion-tracker"
  | "isr-drone"
  | SilencerId
  | "montsegur-silencer"
  | SampleId;

/** Special rounds (docs/design/research.md, "Weapons and ammunition"): what a magazine or bolt loads. */
export type Round = "silver" | "haemolytic" | "coated" | "silencer" | "magnesium";
/** A silencer bolt, one for each house (Antisense silencing). */
export type SilencerId = `silencer-${SampleHouse}`;

/** The houses a tissue sample can come from, and how a sample names them. */
export const SAMPLE_HOUSES = {
  ashgrove: "Ashgrove",
  huaca: "Huaca",
  carcassonne: "Perfecti",
  sahel: "Sahel",
  jade: "Jade",
  nullarbor: "Nullarbor",
} as const;
export type SampleHouse = keyof typeof SAMPLE_HOUSES;
/** A sample's kind follows the enemy it came from (docs/design/research.md, "Tissue samples"). */
export type SampleKind = "vampire" | "feral" | "elder";
export type SampleId = `sample-${SampleKind}-${SampleHouse}`;
export const sampleId = (kind: SampleKind, house: SampleHouse): SampleId =>
  `sample-${kind}-${house}`;
/** A sample's kind and house, or null if the item isn't one. */
export function sampleOf(item: string): { kind: SampleKind; house: SampleHouse } | null {
  const m = /^sample-(vampire|feral|elder)-(\w+)$/.exec(item);
  return m && m[2]! in SAMPLE_HOUSES
    ? { kind: m[1] as SampleKind, house: m[2] as SampleHouse }
    : null;
}
/** Where an item can be worn: in the hand, as armour, as a helmet. Anything else is only carried (pockets, backpack). */
export type Slot = "weapon" | "armour" | "helmet" | "carried";

interface ItemDef {
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
  use?: "throw" | "heal" | "device";
  /** Used up when used (incendiaries thrown, medkits opened, magazines loaded). */
  consumable?: boolean;
  /** May travel by courier between bases (no weapons). */
  courier?: boolean;
  /** Research or engineering that makes it available. */
  requires?: string;
  /** The battle view's model (public/assets/items/models/<model>.glb) when it's shared, not the item's own. */
  model?: string;
  /** The inventory icon (public/assets/items/icons/<icon>.webp) when it's shared, not the item's own. */
  icon?: string;
  /** A magazine that loads whatever takes this one (silver rounds in an ordinary magazine's gun). */
  fits?: ItemId;
  /** Special rounds it loads (a magazine or bolt), or a crossbow's own bolt (docs/design/research.md). */
  round?: Round;
  /** Uses in one kit (the Biopsy kit's samples, an advanced trauma kit's); refilled at home. */
  uses?: number;
  /** A trauma kit: health it gives back (else MEDKIT_HEAL). */
  heals?: number;
  /** Armour: the share of a claw strike's damage that gets through (the UHMWPE vest). */
  claws?: number;
  /** Haem serum: health back each turn after the first, for so many turns. */
  regen?: { per: number; turns: number };
  /** Head-mounted optics (the helmet slot): night optics or a thermal sight. */
  optics?: "night" | "thermal";
  /** The Lantern suit: a vampire that claws the wearer is burned. */
  lantern?: boolean;
  /** A silencer bolt: the house it was built against ("agnes": the Montségur silencer, for her alone). */
  silences?: string;
  description: string;
}

const SAMPLE_WORDS: Record<SampleKind, string> = {
  vampire: "a vampire",
  feral: "a feral vampire",
  elder: "an elder",
};
/** Tissue samples, one item for each house and kind: loot, carried home for the laboratories. */
const SAMPLE_ITEMS = Object.fromEntries(
  (Object.keys(SAMPLE_HOUSES) as SampleHouse[]).flatMap((house) =>
    (["vampire", "feral", "elder"] as const).map((kind) => {
      const id = sampleId(kind, house);
      const def: ItemDef = {
        id,
        model: "tissue-sample",
        icon: "tissue-sample",
        name: `Tissue sample (${SAMPLE_HOUSES[house]}, ${kind})`,
        slot: "carried",
        size: [1, 1],
        kit: "civilian",
        cost: 0,
        courier: true,
        description: `Tissue from ${SAMPLE_WORDS[kind]} of ${SAMPLE_HOUSES[house] === "Perfecti" ? "the Perfecti" : `the ${SAMPLE_HOUSES[house]} house`}, cold in its canister: for a laboratory.`,
      };
      return [id, def];
    }),
  ),
) as Record<SampleId, ItemDef>;

/** Silencer bolts, one for each house: its vampires never rise and lose their armour. */
const SILENCER_ITEMS = Object.fromEntries(
  (Object.keys(SAMPLE_HOUSES) as SampleHouse[]).map((house) => {
    const id: SilencerId = `silencer-${house}`;
    const def: ItemDef = {
      id,
      model: "bolt-silencer",
      icon: "bolt-silencer",
      name: `Silencer bolt (${SAMPLE_HOUSES[house]})`,
      slot: "carried",
      size: [1, 1],
      kit: "plainclothes",
      cost: 4_000,
      fits: "bolt-haemolytic",
      round: "silencer",
      silences: house,
      consumable: true,
      courier: true,
      requires: "antisense",
      description: `A crossbow bolt carrying antisense strands built against ${SAMPLE_HOUSES[house] === "Perfecti" ? "the Perfecti" : `the ${SAMPLE_HOUSES[house]} house`}: one of its vampires hit loses its armour and, once down, never rises. Does nothing more than a bolt to anyone else, or to Agnes. Used up.`,
    };
    return [id, def];
  }),
) as Record<SilencerId, ItemDef>;

export const ITEMS: Record<ItemId, ItemDef> = {
  knife: {
    id: "knife",
    name: "Combat knife",
    slot: "weapon",
    size: [1, 2],
    kit: "civilian",
    cost: 0,
    firepower: 0.55,
    weapon: "knife",
    description: "Always to hand. The weapon of last resort, and the only one a civilian carries.",
  },
  pistol: {
    id: "pistol",
    name: "Glock 19",
    slot: "weapon",
    size: [1, 2],
    kit: "plainclothes",
    cost: 1_500,
    firepower: 0.9,
    weapon: "pistol",
    mag: "mag-pistol",
    description: "9 mm pistol. Standard issue: under a jacket, fits a pocket.",
  },
  "pistol-sd": {
    id: "pistol-sd",
    name: "Glock 19, suppressed",
    slot: "weapon",
    size: [1, 3],
    kit: "plainclothes",
    cost: 3_000,
    firepower: 0.85,
    weapon: "pistol-sd",
    mag: "mag-pistol",
    description:
      "9 mm, the Glock with a can on the muzzle: nobody near hears it, and a target that drops doesn't give the team away. Too long for a pocket.",
  },
  smg: {
    id: "smg",
    name: "Sig Sauer MPX",
    slot: "weapon",
    size: [1, 3],
    kit: "plainclothes",
    cost: 4_000,
    firepower: 1.1,
    weapon: "smg",
    mag: "mag-smg",
    description:
      "9 mm submachine gun on its own magazine. Folds under a coat. More bullets, less reach; fires bursts.",
  },
  shotgun: {
    id: "shotgun",
    name: "Mossberg 590",
    slot: "weapon",
    size: [2, 4],
    kit: "tactical",
    cost: 2_000,
    firepower: 1.3,
    weapon: "shotgun",
    mag: "shells",
    description:
      "12-gauge pump: close and brutal, what you want in a cellar. Three shells, racked by hand.",
  },
  "shotgun-semi": {
    id: "shotgun-semi",
    name: "Benelli M4",
    slot: "weapon",
    size: [2, 4],
    kit: "tactical",
    cost: 3_500,
    firepower: 1.4,
    weapon: "shotgun-semi",
    mag: "shells",
    description:
      "12-gauge, gas-operated: six shells as fast as you pull the trigger, a little less punch than the pump.",
  },
  rifle: {
    id: "rifle",
    name: "H&K 416",
    slot: "weapon",
    size: [2, 4],
    kit: "tactical",
    cost: 5_000,
    firepower: 1.3,
    weapon: "rifle",
    mag: "mag-rifle",
    description:
      "5.56 mm carbine. Reach and accuracy; fires bursts. Nobody mistakes it for anything else.",
  },
  m249: {
    id: "m249",
    name: "M249 light machine gun",
    slot: "weapon",
    size: [2, 5],
    kit: "tactical",
    cost: 9_000,
    firepower: 1.6,
    weapon: "m249",
    mag: "box-m249",
    description:
      "5.56 mm squad automatic weapon: fires six-round bursts from a box of 30. Loud, heavy, and it keeps their heads down.",
  },
  m240b: {
    id: "m240b",
    name: "M240B machine gun",
    slot: "weapon",
    size: [2, 5],
    kit: "tactical",
    cost: 12_000,
    firepower: 1.7,
    weapon: "m240b",
    mag: "belt-m240b",
    description:
      "A full-power 7.62 mm machine gun: seven-round bursts, hits harder than anything else we carry, scatters wider.",
  },
  rpg: {
    id: "rpg",
    name: "Carl Gustav M4",
    slot: "weapon",
    size: [2, 5],
    kit: "tactical",
    cost: 15_000,
    firepower: 1.8,
    weapon: "rpg",
    mag: "rocket",
    description:
      "84 mm recoilless rifle, one round at a time: it goes off where it lands, hurting everyone within two tiles the blast reaches, shattering glass and setting the ground alight. Mind your own people.",
  },
  m110: {
    id: "m110",
    name: "M110 sniper rifle",
    slot: "weapon",
    size: [2, 5],
    kit: "tactical",
    cost: 11_000,
    firepower: 1.4,
    weapon: "m110",
    mag: "mag-m110",
    description:
      "Semi-automatic 7.62 mm with a long barrel and a scope: the tightest shot we have, and the hardest-hitting single round. Ten in the magazine.",
  },
  "rifle-sd": {
    id: "rifle-sd",
    name: "H&K 416, suppressed",
    slot: "weapon",
    size: [2, 5],
    kit: "tactical",
    cost: 8_000,
    firepower: 1.25,
    weapon: "rifle-sd",
    mag: "mag-rifle",
    description:
      "5.56 mm, the 416 with a suppressor: quiet, a little weaker, and long. Still fits the backpack.",
  },
  "soft-vest": {
    id: "soft-vest",
    name: "Soft vest",
    slot: "armour",
    size: [2, 3],
    kit: "plainclothes",
    cost: 1_000,
    armour: 0.15,
    description: "Under a shirt. Stops a knife, slows a bullet. Standard issue.",
  },
  "tactical-vest": {
    id: "tactical-vest",
    name: "Plate carrier",
    slot: "armour",
    size: [2, 3],
    kit: "tactical",
    cost: 6_000,
    armour: 0.4,
    description: "Plates front and back, pouches, a collar against teeth.",
  },
  helmet: {
    id: "helmet",
    name: "Ballistic helmet",
    slot: "helmet",
    size: [2, 2],
    kit: "tactical",
    cost: 1_500,
    armour: 0.1,
    description: "Aramid shell. Takes a little off every hit.",
  },
  incendiary: {
    id: "incendiary",
    name: "Incendiary grenade",
    slot: "carried",
    size: [1, 1],
    kit: "tactical",
    cost: 800,
    use: "throw",
    consumable: true,
    description: "Thermite: a 3 × 3 fire that burns a vampire twice as hard. Used up when thrown.",
  },
  medkit: {
    id: "medkit",
    name: "Trauma kit",
    slot: "carried",
    size: [2, 1],
    kit: "plainclothes",
    cost: 600,
    use: "heal",
    consumable: true,
    courier: true,
    description:
      "Tourniquets and dressings: in a fight, patches the operative or one next to them (10 health); one left after a fight patches the worst wound. Used up.",
  },
  "mag-pistol": {
    id: "mag-pistol",
    model: "mag",
    name: "9 mm magazine (Glock 19)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 60,
    consumable: true,
    courier: true,
    description: "9 mm: reloads the Glock 19, suppressed or not. Used up.",
  },
  "mag-smg": {
    id: "mag-smg",
    model: "mag",
    name: "9 mm magazine (MPX)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 80,
    consumable: true,
    courier: true,
    description: "9 mm: reloads the Sig Sauer MPX. Used up.",
  },
  "mag-rifle": {
    id: "mag-rifle",
    model: "mag",
    name: "5.56 mm magazine (H&K 416)",
    slot: "carried",
    size: [1, 2],
    kit: "plainclothes",
    cost: 100,
    consumable: true,
    courier: true,
    description: "5.56 mm: reloads the H&K 416, suppressed or not. Used up.",
  },
  rocket: {
    id: "rocket",
    name: "84 mm round (Carl Gustav)",
    slot: "carried",
    size: [1, 3],
    kit: "tactical",
    cost: 800,
    consumable: true,
    courier: true,
    description: "One 84 mm high-explosive round: reloads the Carl Gustav. Used up.",
  },
  "mag-m110": {
    id: "mag-m110",
    model: "mag",
    name: "7.62 mm magazine (M110)",
    slot: "carried",
    size: [1, 2],
    kit: "tactical",
    cost: 150,
    consumable: true,
    courier: true,
    description: "Ten rounds of 7.62 mm match: reloads the M110. Used up.",
  },
  "box-m249": {
    id: "box-m249",
    name: "5.56 mm box (M249)",
    slot: "carried",
    size: [2, 2],
    kit: "tactical",
    cost: 300,
    consumable: true,
    courier: true,
    description: "A box of 30 linked 5.56 mm rounds: reloads the M249. Used up.",
  },
  "belt-m240b": {
    id: "belt-m240b",
    name: "7.62 mm belt (M240B)",
    slot: "carried",
    size: [2, 2],
    kit: "tactical",
    cost: 400,
    consumable: true,
    courier: true,
    description: "A belt of 28 rounds of 7.62 mm: reloads the M240B. Used up.",
  },
  shells: {
    id: "shells",
    name: "12-gauge shells",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 40,
    consumable: true,
    courier: true,
    description: "A box of 12-gauge shells: reloads the Mossberg or the Benelli. Used up.",
  },
  "mag-pistol-silver": {
    id: "mag-pistol-silver",
    model: "mag",
    icon: "mag-pistol",
    name: "9 mm silver magazine (Glock 19)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 300,
    fits: "mag-pistol",
    round: "silver",
    consumable: true,
    courier: true,
    requires: "vampire-physiology",
    description:
      "9 mm silver frangible: reloads the Glock 19. Hurts vampires more and people less. Used up.",
  },
  "mag-smg-silver": {
    id: "mag-smg-silver",
    model: "mag",
    icon: "mag-smg",
    name: "9 mm silver magazine (MPX)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 400,
    fits: "mag-smg",
    round: "silver",
    consumable: true,
    courier: true,
    requires: "vampire-physiology",
    description:
      "9 mm silver frangible: reloads the Sig Sauer MPX. Hurts vampires more and people less. Used up.",
  },
  "mag-rifle-silver": {
    id: "mag-rifle-silver",
    model: "mag",
    icon: "mag-rifle",
    name: "5.56 mm silver magazine (H&K 416)",
    slot: "carried",
    size: [1, 2],
    kit: "plainclothes",
    cost: 500,
    fits: "mag-rifle",
    round: "silver",
    consumable: true,
    courier: true,
    requires: "vampire-physiology",
    description:
      "5.56 mm silver frangible: reloads the H&K 416. Hurts vampires more and people less. Used up.",
  },
  "uhmwpe-vest": {
    id: "uhmwpe-vest",
    model: "soft-vest-coyote",
    icon: "soft-vest-coyote",
    name: "UHMWPE vest",
    slot: "armour",
    size: [2, 3],
    kit: "plainclothes",
    cost: 3_000,
    armour: 0.2,
    claws: 0.7,
    requires: "bite-weave",
    description: "Under a shirt. A tooth slides off it: claws do 30% less.",
  },
  "stf-vest": {
    id: "stf-vest",
    name: "STF vest",
    slot: "armour",
    size: [2, 3],
    kit: "plainclothes",
    cost: 9_000,
    armour: 0.35,
    requires: "stf",
    description:
      "Aramid soaked in a fluid that locks solid when struck. Near a plate, and still hidden.",
  },
  "heavy-plate": {
    id: "heavy-plate",
    model: "tactical-vest-grey",
    icon: "tactical-vest-grey",
    name: "Heavy plate",
    slot: "armour",
    size: [2, 3],
    kit: "tactical",
    cost: 14_000,
    armour: 0.55,
    requires: "boron-carbide",
    description:
      "Boron carbide over an STF backing: the best we have, and nobody mistakes it for a coat.",
  },
  "trauma-kit-adv": {
    id: "trauma-kit-adv",
    name: "Advanced trauma kit",
    slot: "carried",
    size: [2, 1],
    kit: "plainclothes",
    cost: 1_200,
    use: "heal",
    heals: 20,
    uses: 2,
    consumable: true,
    courier: true,
    requires: "combat-surgery",
    description:
      "Junctional clamps, haemostatic gauze, whole blood: patches the operative or one next to them (20 health), twice. Refilled at home.",
  },
  "uv-flare": {
    id: "uv-flare",
    name: "UV flare",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 600,
    use: "throw",
    consumable: true,
    courier: true,
    requires: "uv-weaponry",
    description:
      "Thrown: a steady ultraviolet glow around where it lands, for the rest of the fight. Vampires won't walk into it. Harmless to people.",
  },
  "mag-pistol-haemolytic": {
    id: "mag-pistol-haemolytic",
    model: "mag",
    icon: "mag-pistol",
    name: "9 mm haemolytic magazine (Glock 19)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 400,
    fits: "mag-pistol",
    round: "haemolytic",
    consumable: true,
    courier: true,
    requires: "haemolytic-chemistry",
    description:
      "9 mm haemolytic frangible: reloads the Glock 19. A little weaker; a vampire hit loses time, and one it drops dies in torpor instead of rising. Used up.",
  },
  "mag-smg-haemolytic": {
    id: "mag-smg-haemolytic",
    model: "mag",
    icon: "mag-smg",
    name: "9 mm haemolytic magazine (MPX)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 450,
    fits: "mag-smg",
    round: "haemolytic",
    consumable: true,
    courier: true,
    requires: "haemolytic-chemistry",
    description:
      "9 mm haemolytic frangible: reloads the Sig Sauer MPX. A little weaker; a vampire hit loses time, and one it drops dies in torpor instead of rising. Used up.",
  },
  "mag-rifle-haemolytic": {
    id: "mag-rifle-haemolytic",
    model: "mag",
    icon: "mag-rifle",
    name: "5.56 mm haemolytic magazine (H&K 416)",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 500,
    fits: "mag-rifle",
    round: "haemolytic",
    consumable: true,
    courier: true,
    requires: "haemolytic-chemistry",
    description:
      "5.56 mm haemolytic frangible: reloads the H&K 416. A little weaker; a vampire hit loses time, and one it drops dies in torpor instead of rising. Used up.",
  },
  crossbow: {
    id: "crossbow",
    name: "Crossbow",
    slot: "weapon",
    size: [1, 4],
    kit: "plainclothes",
    cost: 8_000,
    firepower: 0.7,
    weapon: "crossbow",
    mag: "bolt-haemolytic",
    round: "haemolytic",
    requires: "haemolytic-chemistry",
    description:
      "A compact hunting crossbow with a cocking lever: silent, one bolt at a time. Fires haemolytic or coated bolts.",
  },
  "bolt-haemolytic": {
    id: "bolt-haemolytic",
    name: "Haemolytic bolt",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 500,
    round: "haemolytic",
    consumable: true,
    courier: true,
    requires: "haemolytic-chemistry",
    description:
      "A crossbow bolt with a gelling head: a vampire hit loses time next turn, and one it drops dies in torpor instead of rising. Used up.",
  },
  "bolt-coated": {
    id: "bolt-coated",
    name: "Coated bolt",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 400,
    fits: "bolt-haemolytic",
    round: "coated",
    consumable: true,
    courier: true,
    requires: "metalloporphyrins",
    description:
      "A crossbow bolt coated in tin porphyrin, which stalls their repair: twice the harm to a vampire, and one it drops never rises. Used up.",
  },
  "coated-knife": {
    id: "coated-knife",
    name: "Coated knife",
    slot: "weapon",
    size: [1, 2],
    kit: "plainclothes",
    cost: 1_500,
    firepower: 0.6,
    weapon: "coated-knife",
    requires: "metalloporphyrins",
    description:
      "A fighting knife with a porphyrin-coated blade: silent, twice the harm to a vampire, and one it drops never rises.",
  },
  flashbang: {
    id: "flashbang",
    name: "Flashbang",
    slot: "carried",
    size: [1, 1],
    kit: "tactical",
    cost: 300,
    use: "throw",
    consumable: true,
    courier: true,
    requires: "sensory-physiology",
    description:
      "A stun grenade: thralls near where it goes off lose their next turn. Loud. Used up when thrown.",
  },
  strobe: {
    id: "strobe",
    name: "Strobe",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 500,
    use: "throw",
    consumable: true,
    courier: true,
    requires: "sensory-physiology",
    description:
      "Thrown: a burst of strobing light tuned to their retina. Vampires within 5 tiles that see it lose half their next turn. Silent. Used up.",
  },
  "biopsy-kit": {
    id: "biopsy-kit",
    name: "Biopsy kit",
    slot: "carried",
    size: [2, 1],
    kit: "plainclothes",
    cost: 300,
    uses: 4,
    courier: true,
    requires: "archives-1",
    description:
      "Needles, a bone drill and cold vials: next to a vampire's body (in torpor, or destroyed but not burnt), takes a tissue sample for the laboratories. Four samples, then it's refilled at home.",
  },
  "haem-serum": {
    id: "haem-serum",
    name: "Haem serum",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 1_000,
    use: "heal",
    heals: 25,
    regen: { per: 5, turns: 3 },
    consumable: true,
    courier: true,
    requires: "tissue-regeneration",
    description:
      "An autoinjector of their repair, borrowed: 25 health at once, then 5 a turn for three turns. Used up.",
  },
  "magnesium-shells": {
    id: "magnesium-shells",
    name: "Magnesium shells",
    slot: "carried",
    size: [1, 1],
    kit: "tactical",
    cost: 200,
    fits: "shells",
    round: "magnesium",
    consumable: true,
    courier: true,
    requires: "pyrotechnics",
    description:
      "12-gauge shells loaded with burning magnesium: whoever they hit stands in fire for a turn. Reloads the Mossberg or the Benelli. Used up.",
  },
  sparkle: {
    id: "sparkle",
    name: "Sparkle",
    slot: "carried",
    size: [1, 1],
    kit: "tactical",
    cost: 2_000,
    use: "throw",
    consumable: true,
    courier: true,
    requires: "pulsed-xenon",
    description:
      "A pulsed-xenon flash grenade: a blink of ultraviolet that burns vampires within 2 tiles, finishes them for good, and turns bodies in torpor to ash. People don't feel it. Used up.",
  },
  "lumen-365": {
    id: "lumen-365",
    name: "Lumen lamp (365 nm)",
    slot: "weapon",
    size: [1, 3],
    kit: "tactical",
    cost: 15_000,
    firepower: 0.8,
    weapon: "lumen-365",
    mag: "lamp-battery",
    requires: "led-arrays",
    description:
      "A UVA LED array behind a lens: a 4-tile beam that burns vampires (half as much again if 365 nm is their band), ignores armour, and leaves people unharmed. Four shots a battery.",
  },
  "lumen-405": {
    id: "lumen-405",
    name: "Lumen lamp (405 nm)",
    slot: "weapon",
    size: [1, 3],
    kit: "tactical",
    cost: 15_000,
    firepower: 0.8,
    weapon: "lumen-405",
    mag: "lamp-battery",
    requires: "led-arrays",
    description:
      "A violet LED array behind a lens: a 4-tile beam that burns vampires (half as much again if 405 nm is their band), ignores armour, and leaves people unharmed. Four shots a battery.",
  },
  "lamp-battery": {
    id: "lamp-battery",
    name: "Lamp battery",
    slot: "carried",
    size: [1, 2],
    kit: "tactical",
    cost: 500,
    consumable: true,
    courier: true,
    requires: "led-arrays",
    description: "A lithium pack for a lumen lamp: four shots. Used up.",
  },
  "excimer-lance": {
    id: "excimer-lance",
    name: "Excimer lance",
    slot: "weapon",
    size: [2, 5],
    kit: "tactical",
    cost: 60_000,
    firepower: 1.3,
    weapon: "excimer-lance",
    mag: "lance-capacitor",
    requires: "excimer",
    description:
      "A xenon-chloride laser at 308 nm: a silent beam out to 20 tiles that burns vampires (half as much again if UVB is their band) and barely marks people. Ignores armour. Four shots a capacitor.",
  },
  "lance-capacitor": {
    id: "lance-capacitor",
    name: "Lance capacitor",
    slot: "carried",
    size: [1, 2],
    kit: "tactical",
    cost: 2_000,
    consumable: true,
    courier: true,
    requires: "excimer",
    description: "A charged capacitor bank for the excimer lance: four shots. Used up.",
  },
  "lantern-suit": {
    id: "lantern-suit",
    name: "Lantern suit",
    slot: "armour",
    size: [2, 3],
    kit: "tactical",
    cost: 40_000,
    armour: 0.4,
    lantern: true,
    requires: "lantern-suit",
    description:
      "Armour lined with UV emitters that light when struck: a vampire that claws the wearer is burned, and they learn to go for someone else.",
  },
  "night-optics": {
    id: "night-optics",
    name: "Night optics",
    slot: "helmet",
    size: [2, 2],
    kit: "plainclothes",
    cost: 6_000,
    optics: "night",
    requires: "image-intensification",
    description:
      "A head mount with an image-intensifier tube: sees 14 tiles at night instead of 9. Worn in place of a helmet, so no helmet armour.",
  },
  "thermal-sight": {
    id: "thermal-sight",
    name: "Thermal sight",
    slot: "helmet",
    size: [2, 2],
    kit: "tactical",
    cost: 10_000,
    optics: "thermal",
    requires: "thermoregulation",
    description:
      "A thermal imager on a head mount: they run cold, so vampires show as dark shapes 14 tiles off, day or night, even the Jade Court's. Worn in place of a helmet.",
  },
  "motion-tracker": {
    id: "motion-tracker",
    name: "Motion tracker",
    slot: "carried",
    size: [1, 2],
    kit: "tactical",
    cost: 5_000,
    use: "device",
    courier: true,
    requires: "doppler",
    description:
      "A handheld Doppler radar: a sweep shows everything moving within 12 tiles, through walls, until the enemy has moved again. 10 TU.",
  },
  "isr-drone": {
    id: "isr-drone",
    name: "ISR drone",
    slot: "carried",
    size: [2, 2],
    kit: "tactical",
    cost: 25_000,
    use: "device",
    courier: true,
    requires: "persistent-isr",
    description:
      "A quadcopter with a thermal camera: launched, it hovers overhead and shows anyone in the open within 15 tiles for 3 turns. Recovered with a win. 15 TU.",
  },
  "montsegur-silencer": {
    id: "montsegur-silencer",
    name: "Montségur silencer",
    slot: "carried",
    size: [1, 1],
    kit: "plainclothes",
    cost: 50_000,
    fits: "bolt-haemolytic",
    round: "silencer",
    silences: "agnes",
    consumable: true,
    courier: true,
    requires: "root-strain",
    description:
      "A crossbow bolt built against the root strain, Agnes's own. Hit with it, she stops healing, loses her armour, and once down does not rise.",
  },
  ...SILENCER_ITEMS,
  ...SAMPLE_ITEMS,
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItemId = (x: unknown): x is ItemId => typeof x === "string" && x in ITEMS;

/** What a medkit patches after a fight. */
export const MEDKIT_HEAL = 10;
/** Cargo load per item (a crate of four is one seat). */
export const ITEM_LOAD = 0.25;

const KIT_ORDER: KitId[] = ["civilian", "plainclothes", "tactical"];
/** Whether an item goes along with a kit. */
export const allowedWith = (item: ItemId, kit: KitId) =>
  KIT_ORDER.indexOf(ITEMS[item].kit) <= KIT_ORDER.indexOf(kit);

/** What a new agent is issued (free): a pistol, two magazines, a soft vest. */
export const STANDARD_ISSUE = {
  weapon: "pistol" as ItemId,
  armour: "soft-vest" as ItemId,
  carried: ["mag-pistol", "mag-pistol"] as ItemId[],
};
/** Padua's armoury at the start: a full helicopter team in tactical kit. */
export const FOUNDING_ARMOURY: Partial<Record<ItemId, number>> = {
  rifle: 6,
  shotgun: 2,
  "tactical-vest": 8,
  helmet: 8,
  incendiary: 8,
  medkit: 4,
  "mag-rifle": 18,
  shells: 6,
  "mag-pistol": 8,
};
