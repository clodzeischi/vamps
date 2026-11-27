// The dark web (docs/design/economy.md): what the war brings back, sold
// quietly. Vampire tissue to pharmaceutical labs, the bloodlines' hoarded
// history to private collectors, what our workshops make, our spare kit and
// our research. Every good has a demand meter: each sale pays the price
// times demand and knocks demand down; it recovers by itself day by day. A
// player who sells a little of everything, steadily, earns far more than one
// who floods one market. Buying is a cart: equipment shipped to a base in 40
// hours, information at once, and a crypto tumbler's 20% on top.
import { countRooms } from "../base/building";
import { BLOODLINES } from "../../data/bloodlines";
import { difficulty } from "../../data/difficulty";
import { regionById } from "../../data/regions";
import { changeSupport, creditRegion, PLEDGE } from "./economy";
import { rng } from "../core/rng";
import { changeSecrecy } from "../campaign/secrecy";
import { ITEM_IDS, ITEMS, type ItemId } from "../../data/equipment";
import { AIRCRAFT, type AircraftKind } from "../../data/aircraft";
import { freeBays } from "../people/personnel";
import { PROJECTS, projectById } from "../../data/research";
import { addStock, stockAt } from "../people/equipment";
import { learnTopic, prereqsMet, researched } from "../base/research";
import { itemCount } from "../base/transfers";
import { DAY, HOUR } from "../core/time";
import {
  addLog,
  isReady,
  type Artifact,
  type GameState,
  type GoodId,
  type SiteKind,
  installationById,
} from "../core/state";

interface GoodDef {
  id: GoodId;
  name: string;
  /** One unit, for "sold 2 ___". */
  unit: string;
  buyer: string;
  /** Full price at full demand (before difficulty). */
  price: number;
  /** Demand lost per unit sold. */
  drop: number;
  /** Secrecy each sale costs: anything that came out of a vampire leaves a trail. */
  secrecy: number;
  /** Research needed before anyone will buy it (products: before we can make it). */
  requires?: string;
  /** It moves the hunt forward (remains, blood, captives): it can be sold, never bought. Whatever advances the story has to be taken. */
  story?: boolean;
}

/** Demand regained per day (all markets). At 1%/day a market with drop 0.15 takes two units a month at full price. */
export const DEMAND_RECOVERY = 0.01;
/** Demand never falls below this: there is always someone, at a price. */
const DEMAND_FLOOR = 0.1;

export const GOODS: Record<GoodId, GoodDef> = {
  tissue: {
    id: "tissue",
    name: "Vampire tissue",
    unit: "set of remains",
    buyer: "a pharmaceutical lab that asks no questions",
    price: 60_000,
    drop: 0.15,
    secrecy: 0.4,
    story: true,
  },
  plasma: {
    id: "plasma",
    name: "Synthetic plasma",
    unit: "batch",
    buyer: "pharmaceutical companies (trauma and transfusion)",
    price: 200_000,
    drop: 0.2,
    secrecy: 0,
    requires: "haematology",
  },
  blockers: {
    id: "blockers",
    name: "Pheromone blockers",
    unit: "batch",
    buyer: "police and private security, sold as an anti-sedation spray",
    price: 150_000,
    drop: 0.15,
    secrecy: 0,
    requires: "pheromones",
  },
  sterilisers: {
    id: "sterilisers",
    name: "UV sterilisers",
    unit: "consignment",
    buyer: "hospital groups (surface and air sterilisation)",
    price: 120_000,
    drop: 0.15,
    secrecy: 0,
    requires: "uv-weaponry",
  },
  inserts: {
    id: "inserts",
    name: "Ceramic inserts",
    unit: "consignment",
    buyer: "police forces and security contractors",
    price: 80_000,
    drop: 0.1,
    secrecy: 0,
    requires: "composite-armour",
  },
};
export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
export const isGoodId = (x: unknown): x is GoodId => typeof x === "string" && x in GOODS;

/** What the labs know decides what tissue is worth: raw curiosity, then a body we understand, then blood we can use. */
const TISSUE_PRICES: [string | null, number][] = [
  ["haematology", 280_000],
  ["vampire-physiology", 160_000],
  [null, 60_000],
];

/** Collectors: one market for every artifact. */
const ARTIFACT_DROP = 0.2;
export const ARTIFACT_SECRECY = 0.5;
/** Returning an artifact to where it was taken from: support there. */
export const RETURN_SUPPORT = 0.5;

/** Chance a won strike recovers an artifact, and what it's worth. A lair always gives up its treasure. */
const ARTIFACT_FINDS: Record<SiteKind, { chance: number; value: [number, number] } | null> = {
  nest: null,
  den: { chance: 0.3, value: [120_000, 250_000] },
  haven: { chance: 0.6, value: [250_000, 500_000] },
  lair: { chance: 1, value: [250_000, 500_000] },
};
const TREASURE_VALUE: [number, number] = [1_000_000, 1_600_000];

/** Eight hundred years of keeping things. The first of each list is the line's treasure, found in its lair. */
const ARTIFACTS: Record<string, string[]> = {
  ashgrove: [
    "The Ashgrove charter: a land grant signed in 1664, with a second, older signature in brown ink",
    "A Dutch trading company ledger from New Amsterdam, bound in calfskin",
    "A page of the Salem examinations, 1692, with one accuser's name cut out",
    "A Spanish mission bell from Alta California",
    "A Gilded Age jeweller's case of mourning brooches, each with a lock of hair",
    "Letters from a Confederate field surgeon, never posted",
  ],
  huaca: [
    "The Sun mask of the Huaca: hammered gold, older than the Inca",
    "A Moche gold ear spool",
    "A Chimú featherwork tabard",
    "A silver monstrance from the mint at Potosí",
    "An Inca quipu, its knots intact",
    "A carved retablo from a Jesuit mission",
  ],
  carcassonne: [
    "The Book of the Perfect: a Cathar ritual in Occitan, annotated in Agnes's hand",
    "A Templar seal matrix",
    "A reliquary missing from Saint-Sernin since 1572",
    "A troubadour's songbook with its music",
    "A purse of gold florins from a Florentine bank",
    "A copy of an inquisitor's register from Pamiers, 1320, with names struck out",
  ],
  sahel: [
    "The Brood's astrolabe: brass and silver, from Toledo by way of Timbuktu",
    "A folio from a Timbuktu library",
    "An Ethiopian processional cross",
    "A Fatimid rock-crystal ewer",
    "A Mamluk Qur'an box, inlaid with silver",
    "A set of Akan gold weights",
  ],
  jade: [
    "The Jade Court's seal: an imperial seal of the Ming, carved from one stone",
    "A Tang funerary horse in three-colour glaze",
    "A Song celadon bowl",
    "A Heian-period lacquer writing box",
    "A Goryeo celadon vase",
    "A Mughal jade wine cup",
  ],
  nullarbor: [
    "The Nullarbor chart: a Dutch map of the southern coast, older than any record of it",
    "Carved pearl shell from Broome",
    "Silver coins from a Dutch wreck off the Abrolhos",
    "A gold kris from Majapahit",
    "A tin of gold nuggets from the first rushes",
    "A galleon's astrolabe from Manila",
  ],
};

// ---------------------------------------------------------------------------

const priceScale = (s: GameState) => difficulty(s.difficulty).marketPrices;

export const demandOf = (s: GameState, k: GoodId | "artifacts") => s.market.demand[k] ?? 1;

/** Full price of a good now (before demand). */
function basePrice(s: GameState, id: GoodId): number {
  if (id !== "tissue")
    return GOODS[id].price * (leaked(s, GOODS[id].requires) ? LEAKED_GOOD_PRICE : 1);
  return TISSUE_PRICES.find(([r]) => r === null || s.research.done.includes(r))![1];
}

const round = (n: number) => Math.round(n / 1_000) * 1_000;
/** Research of ours that is out now (not science everyone always had). */
const leaked = (s: GameState, id?: string) =>
  !!id && !!s.market.sold?.[id] && s.market.sold[id]!.publicAt <= s.time;

/** What a unit fetches at full demand, on this difficulty. */
export const fullPrice = (s: GameState, id: GoodId) => round(basePrice(s, id) * priceScale(s));
/** What the next unit fetches. */
export const offerFor = (s: GameState, id: GoodId) =>
  round(basePrice(s, id) * demandOf(s, id) * priceScale(s));
export const artifactOffer = (s: GameState, a: Artifact) =>
  round(a.value * demandOf(s, "artifacts") * priceScale(s));

/** Units on hand. Tissue is the remains in cold storage at our bases. */
export function stockOf(s: GameState, id: GoodId): number {
  if (id === "tissue")
    return s.installations.reduce((t, b) => t + (isReady(s, b) ? (b.remains ?? 0) : 0), 0);
  return s.market.stock[id] ?? 0;
}

/** A good we can sell (or make) at all. */
export const goodKnown = (s: GameState, id: GoodId) =>
  !GOODS[id].requires ||
  s.research.done.includes(GOODS[id].requires!) ||
  s.engineering.done.includes(GOODS[id].requires!);

export function sellBlocker(s: GameState, id: GoodId): string | null {
  if (stockOf(s, id) <= 0)
    return id === "tissue" ? "No vampire remains in cold storage." : "Nothing in stock.";
  if (s.story.exposed) return "Nobody will deal with the Order now.";
  return null;
}

/** Sells one unit. */
export function sellGood(s: GameState, id: GoodId): string | null {
  const why = sellBlocker(s, id);
  if (why) return why;
  const g = GOODS[id];
  const paid = offerFor(s, id);
  if (id === "tissue") {
    const b = s.installations
      .filter((x) => isReady(s, x) && (x.remains ?? 0) > 0)
      .sort((a, c) => (c.remains ?? 0) - (a.remains ?? 0))[0]!;
    b.remains = (b.remains ?? 0) - 1;
  } else s.market.stock[id] = (s.market.stock[id] ?? 0) - 1;
  s.market.demand[id] = Math.max(DEMAND_FLOOR, demandOf(s, id) - g.drop);
  s.funds += paid;
  s.market.earned += paid;
  addLog(
    s,
    `Sold a ${g.unit} of ${g.name.toLowerCase()} for $${paid.toLocaleString("en-US")}.`,
    "good",
  );
  if (g.secrecy) changeSecrecy(s, -g.secrecy, `${g.name.toLowerCase()} on the market`);
  return null;
}

export function sellArtifact(s: GameState, artifactId: string): string | null {
  const a = s.market.artifacts.find((x) => x.id === artifactId);
  if (!a) return "No such piece.";
  if (s.story.exposed) return "Nobody will deal with the Order now.";
  const paid = artifactOffer(s, a);
  s.market.artifacts = s.market.artifacts.filter((x) => x !== a);
  s.market.demand.artifacts = Math.max(DEMAND_FLOOR, demandOf(s, "artifacts") - ARTIFACT_DROP);
  s.funds += paid;
  s.market.earned += paid;
  addLog(
    s,
    `Sold to a private collector for $${paid.toLocaleString("en-US")}: ${shortName(a)}.`,
    "good",
  );
  changeSecrecy(s, -ARTIFACT_SECRECY, "a stolen piece surfaces at auction");
  return null;
}

/** Hands a piece back to the church or museum it came from: support where it was taken, and goodwill. */
export function returnArtifact(s: GameState, artifactId: string): string | null {
  const a = s.market.artifacts.find((x) => x.id === artifactId);
  if (!a) return "No such piece.";
  s.market.artifacts = s.market.artifacts.filter((x) => x !== a);
  changeSupport(s, a.regionId, RETURN_SUPPORT);
  creditRegion(s, a.regionId, PLEDGE.returned);
  addLog(s, `Returned, quietly, in ${regionById(a.regionId)?.name}: ${shortName(a)}.`, "good");
  return null;
}

export const shortName = (a: Artifact) => a.name.split(":")[0]!;

/** A won strike may turn up something old. Returns it (already in the vault) or null. */
export function findArtifact(
  s: GameState,
  bloodline: string,
  kind: SiteKind,
  regionId: string,
  city: string,
): Artifact[] {
  const find = ARTIFACT_FINDS[kind];
  if (!find) return [];
  const r = rng(s);
  const names = ARTIFACTS[bloodline] ?? ARTIFACTS[BLOODLINES[0]!.id]!;
  const held = new Set([...s.market.artifacts.map((x) => x.name), ...s.market.found]);
  const out: Artifact[] = [];
  const add = (name: string, value: number, treasure: boolean) => {
    const a: Artifact = {
      id: `art-${s.nextId++}`,
      name,
      bloodline,
      regionId,
      city,
      value: round(value),
      takenAt: s.time,
      treasure,
    };
    s.market.artifacts.push(a);
    s.market.found.push(name);
    out.push(a);
  };
  if (kind === "lair") add(names[0]!, r.real(...TREASURE_VALUE), true);
  const left = names.slice(1).filter((n) => !held.has(n));
  if (left.length && r.chance(find.chance)) add(r.pick(left), r.real(...find.value), false);
  return out;
}

// ---------------------------------------------------------------------------
// Research (user, 2026-11-23): public science is bought as information; what
// only we know can be sold once, and goes public some weeks later. Then
// others make its products too, and anything that needs it turns up for sale.
// ---------------------------------------------------------------------------

/** What a point of research is worth, bought or sold (before difficulty). */
export const RESEARCH_PRICE_PER_POINT = 1_500;
/** Days from selling research to its being out in the world. */
export const LEAK_DAYS: [number, number] = [30, 60];
/** A good whose research is public: others make it too, and it fetches this share. */
export const LEAKED_GOOD_PRICE = 0.5;

/** Research for sale or sold: list price, either way. */
export const researchPrice = (s: GameState, id: string) =>
  round((projectById(id)?.points ?? 0) * RESEARCH_PRICE_PER_POINT * priceScale(s));

/** Out in the world: science everyone has, or ours once it has leaked. */
export function topicPublic(s: GameState, id: string): boolean {
  if (projectById(id)?.trade && "public" in projectById(id)!.trade!) return true;
  const sold = s.market.sold?.[id];
  return !!sold && sold.publicAt <= s.time;
}

/** Public topics we don't know yet and could follow (their prerequisites are done). */
export const infoForSale = (s: GameState) =>
  PROJECTS.filter(
    (p) => p.trade && "public" in p.trade && !researched(s, p.id) && prereqsMet(s, p),
  );

/** Research of ours that someone would pay for: done, ours alone, not yet sold. */
export const researchToSell = (s: GameState) =>
  PROJECTS.filter((p) => p.trade && "buyer" in p.trade && researched(s, p.id));

export function sellResearchBlocker(s: GameState, id: string): string | null {
  const p = projectById(id);
  if (!p?.trade || "public" in p.trade) return "Common knowledge: nobody pays for it.";
  if (!researched(s, id)) return "We don't know it yet.";
  if (s.market.sold?.[id]) return "Sold already. Nobody pays twice for the same data.";
  if (s.story.exposed) return "Nobody will deal with the Order now.";
  return null;
}

/** Sells a topic's data. It stays ours to use; in a month or two it is public. */
export function sellResearch(s: GameState, id: string): string | null {
  const why = sellResearchBlocker(s, id);
  if (why) return why;
  const p = projectById(id)!;
  const trade = p.trade as { buyer: string; secrecy: number };
  const paid = researchPrice(s, id);
  (s.market.sold ??= {})[id] = {
    soldAt: s.time,
    publicAt: s.time + Math.round(rng(s).real(...LEAK_DAYS)) * DAY,
  };
  s.funds += paid;
  s.market.earned += paid;
  addLog(
    s,
    `Sold our ${p.name.toLowerCase()} data to ${trade.buyer.split(",")[0]} for $${paid.toLocaleString("en-US")}.`,
    "good",
  );
  if (trade.secrecy) changeSecrecy(s, -trade.secrecy, "our research sold on");
  return null;
}

/** Goods and items that need a topic, for the news that it's out. */
const madeFrom = (id: string) => [
  ...GOOD_IDS.filter((g) => GOODS[g].requires === id).map((g) => GOODS[g].name.toLowerCase()),
  ...ITEM_IDS.filter((x) => ITEMS[x].requires === id).map((x) => ITEMS[x].name.toLowerCase()),
];

// ---------------------------------------------------------------------------
// The cart (user, 2026-11-23): items and information at one price whichever
// way they go, a 20% tumbler fee on every order so buying and selling back
// never pays, and every parcel 40 hours on the way.
// ---------------------------------------------------------------------------

/** Laundering the payment through a crypto tumbler: this share on top of every order. */
export const TUMBLER_FEE = 0.2;
/** Every parcel, wherever it goes. */
export const SHIPPING_HOURS = 40;

export interface Order {
  /** Equipment, shipped to `baseId`. */
  items: Partial<Record<ItemId, number>>;
  /** Aircraft, flown in to `baseId`'s free hangars. */
  aircraft?: Partial<Record<AircraftKind, number>>;
  /** Research topics (public science), known at once. */
  info: string[];
  baseId?: string;
}

/** Equipment the dark web sells: anything that needs no research, or research that is out in the world.
 *  Never what only we could have made. */
export function itemOnSale(s: GameState, item: ItemId): boolean {
  const d = ITEMS[item];
  if (!d.cost) return false;
  return !d.requires || topicPublic(s, d.requires);
}

/** Equipment at list price, whichever way it goes. */
export const itemPrice = (item: ItemId) => ITEMS[item].cost;

const aircraftLines = (o: Order) =>
  (Object.entries(o.aircraft ?? {}) as [AircraftKind, number][]).filter(([, n]) => n > 0);
/** How many aircraft an order flies in. */
export const aircraftCount = (o: Order) => aircraftLines(o).reduce((t, [, n]) => t + n, 0);

export function orderTotal(
  s: GameState,
  o: Order,
): { subtotal: number; fee: number; total: number } {
  const subtotal =
    (Object.entries(o.items) as [ItemId, number][]).reduce(
      (t, [x, n]) => t + itemPrice(x) * (n ?? 0),
      0,
    ) +
    aircraftLines(o).reduce((t, [k, n]) => t + AIRCRAFT[k].price * n, 0) +
    o.info.reduce((t, id) => t + researchPrice(s, id), 0);
  const fee = Math.round(subtotal * TUMBLER_FEE);
  return { subtotal, fee, total: subtotal + fee };
}

const parcelCount = (o: Order) => itemCount(o.items);

export function orderBlocker(s: GameState, o: Order): string | null {
  if (s.story.exposed) return "Nobody will deal with the Order now.";
  const lines = Object.entries(o.items) as [ItemId, number][];
  if (!lines.some(([, n]) => n > 0) && !o.info.length && !aircraftCount(o))
    return "The cart is empty.";
  for (const [k, n] of Object.entries(o.aircraft ?? {}))
    if (!(k in AIRCRAFT) || !Number.isInteger(n) || (n ?? 0) < 0)
      return "Something in the cart isn't right.";
  for (const [x, n] of lines) {
    if (!(x in ITEMS) || !Number.isInteger(n) || n < 0) return "Something in the cart isn't right.";
    if (n > 0 && !itemOnSale(s, x)) return `Nobody sells ${ITEMS[x].name.toLowerCase()}s.`;
  }
  if (new Set(o.info).size !== o.info.length) return "The same data twice.";
  const offered = new Set(infoForSale(s).map((p) => p.id));
  for (const id of o.info)
    if (!offered.has(id)) return `Nobody sells ${projectById(id)?.name.toLowerCase() ?? "that"}.`;
  if (parcelCount(o) > 0) {
    const to = s.installations.find((b) => b.id === o.baseId && b.kind === "base" && isReady(s, b));
    if (!to) return "Choose where it ships.";
    if (!countRooms(to, "storage")) return `${to.name} has no storage to take it.`;
  }
  if (aircraftCount(o) > 0) {
    const to = s.installations.find((b) => b.id === o.baseId && b.kind === "base" && isReady(s, b));
    if (!to) return "Choose where it flies in.";
    const free = freeBays(s, to.id);
    if (aircraftCount(o) > free)
      return free
        ? `${to.name} has room for ${free} more aircraft.`
        : `${to.name} has no free hangar.`;
  }
  if (s.funds < orderTotal(s, o).total) return "Not enough funds.";
  return null;
}

/** Pays for a cart: information now, equipment in a parcel to the base. */
export function placeOrder(s: GameState, o: Order): string | null {
  const why = orderBlocker(s, o);
  if (why) return why;
  s.funds -= orderTotal(s, o).total;
  for (const id of o.info) learnTopic(s, id);
  if (o.info.length)
    addLog(
      s,
      `Bought on the dark web: ${o.info.map((id) => projectById(id)!.name).join(", ")}. Our people know it now.`,
      "good",
    );
  const items: Partial<Record<ItemId, number>> = {};
  for (const [x, n] of Object.entries(o.items) as [ItemId, number][]) if (n > 0) items[x] = n;
  const aircraft = Object.fromEntries(aircraftLines(o)) as Order["aircraft"];
  if (aircraftCount(o)) {
    const to = installationById(s, o.baseId)!;
    (s.shipments ??= []).push({
      id: `ship-${s.nextId++}`,
      toBaseId: to.id,
      arriveAt: s.time + SHIPPING_HOURS * HOUR,
      items: {},
      aircraft,
      darkWeb: true,
    });
    addLog(
      s,
      `Bought on the dark web: ${aircraftLines(o)
        .map(([k, n]) => `${n} ${AIRCRAFT[k].name.toLowerCase()}${n === 1 ? "" : "s"}`)
        .join(", ")} for ${to.name}, flown in within ${SHIPPING_HOURS} hours.`,
    );
  }
  if (itemCount(items)) {
    const to = installationById(s, o.baseId)!;
    (s.shipments ??= []).push({
      id: `ship-${s.nextId++}`,
      toBaseId: to.id,
      arriveAt: s.time + SHIPPING_HOURS * HOUR,
      items,
      darkWeb: true,
    });
    addLog(
      s,
      `Ordered on the dark web: ${itemCount(items)} item${itemCount(items) === 1 ? "" : "s"} for ${to.name}, ${SHIPPING_HOURS} hours away.`,
    );
  }
  return null;
}

/** Items bought and still on the way to a base. */
export const onOrder = (s: GameState, baseId: string, item: ItemId) =>
  (s.shipments ?? [])
    .filter((x) => x.darkWeb && x.toBaseId === baseId)
    .reduce((t, x) => t + (x.items[item] ?? 0), 0);

export function sellItemBlocker(s: GameState, baseId: string, item: ItemId): string | null {
  const b = s.installations.find((x) => x.id === baseId && isReady(s, x));
  if (!b) return "No operational base there.";
  if (!ITEMS[item].cost) return "Nobody pays for that.";
  if (stockAt(b, item) <= 0) return "None in the armoury.";
  if (s.story.exposed) return "Nobody will deal with the Order now.";
  return null;
}

/** Sells items out of a base's armoury (not what agents carry), at list price. */
export function sellItem(s: GameState, baseId: string, item: ItemId, n = 1): string | null {
  const b = installationById(s, baseId)!;
  for (let i = 0; i < n; i++) {
    const why = sellItemBlocker(s, baseId, item);
    if (why) return i ? null : why;
    addStock(b, item, -1);
    s.funds += itemPrice(item);
    s.market.earned += itemPrice(item);
  }
  addLog(
    s,
    `Sold ${n === 1 ? "a" : n} ${ITEMS[item].name.toLowerCase()}${n === 1 ? "" : "s"} from ${b.name} for $${(itemPrice(item) * n).toLocaleString("en-US")}.`,
    "good",
  );
  return null;
}

/** Daily: demand recovers; research we sold comes out. */
export function dailyMarket(s: GameState) {
  for (const k of Object.keys(s.market.demand) as (GoodId | "artifacts")[])
    s.market.demand[k] = Math.min(1, (s.market.demand[k] ?? 1) + DEMAND_RECOVERY);
  for (const [id, x] of Object.entries(s.market.sold ?? {})) {
    if (x.out || x.publicAt > s.time) continue;
    x.out = true;
    const made = madeFrom(id);
    addLog(
      s,
      `Our ${projectById(id)?.name.toLowerCase() ?? id} data is out in the world.${made.length ? ` Others make ${made.join(" and ")} now, and the dark web sells it.` : ""}`,
      "bad",
    );
  }
}

export const newMarket = (): GameState["market"] => ({
  stock: {},
  demand: {},
  artifacts: [],
  found: [],
  earned: 0,
});
