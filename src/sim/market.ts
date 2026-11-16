// The black market (docs/WEB_PORT.md 3.5b): what the war brings back, sold
// quietly. Vampire tissue to pharmaceutical labs, the bloodlines' hoarded
// history to private collectors, and what our workshops make once the
// research is done. Every good has a demand meter: each sale pays the price
// times demand and knocks demand down; it recovers by itself day by day. A
// player who sells a little of everything, steadily, earns far more than one
// who floods one market.
import { BLOODLINES } from "../data/bloodlines";
import { difficulty } from "../data/difficulty";
import { regionById } from "../data/regions";
import { changeSupport, creditRegion, PLEDGE } from "./economy";
import { rng } from "./rng";
import { changeSecrecy } from "./secrecy";
import { addLog, isReady, type Artifact, type GameState, type GoodId, type SiteKind } from "./state";

export interface GoodDef {
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
}

/** Demand regained per day (all markets). At 1%/day a market with drop 0.15 takes two units a month at full price. */
export const DEMAND_RECOVERY = 0.01;
/** Demand never falls below this: there is always someone, at a price. */
export const DEMAND_FLOOR = 0.1;

export const GOODS: Record<GoodId, GoodDef> = {
  tissue: {
    id: "tissue", name: "Vampire tissue", unit: "set of remains", buyer: "a pharmaceutical lab that asks no questions",
    price: 60_000, drop: 0.15, secrecy: 0.4,
  },
  plasma: {
    id: "plasma", name: "Synthetic plasma", unit: "batch", buyer: "pharmaceutical companies (trauma and transfusion)",
    price: 200_000, drop: 0.2, secrecy: 0, requires: "haematology",
  },
  blockers: {
    id: "blockers", name: "Pheromone blockers", unit: "batch", buyer: "police and private security, sold as an anti-sedation spray",
    price: 150_000, drop: 0.15, secrecy: 0, requires: "pheromones",
  },
  sterilisers: {
    id: "sterilisers", name: "UV sterilisers", unit: "consignment", buyer: "hospital groups (surface and air sterilisation)",
    price: 120_000, drop: 0.15, secrecy: 0, requires: "uv-weaponry",
  },
  inserts: {
    id: "inserts", name: "Ceramic inserts", unit: "consignment", buyer: "police forces and security contractors",
    price: 80_000, drop: 0.1, secrecy: 0, requires: "composite-armour",
  },
};
export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
export const isGoodId = (x: unknown): x is GoodId => typeof x === "string" && x in GOODS;

/** What the labs know decides what tissue is worth: raw curiosity, then a body we understand, then blood we can use. */
export const TISSUE_PRICES: [string | null, number][] = [
  ["haematology", 280_000],
  ["vampire-physiology", 160_000],
  [null, 60_000],
];

/** Collectors: one market for every artifact. */
export const ARTIFACT_DROP = 0.2;
export const ARTIFACT_SECRECY = 0.5;
/** Returning an artifact to where it was taken from: support there. */
export const RETURN_SUPPORT = 0.5;

/** Chance a won strike recovers an artifact, and what it's worth. A lair always gives up its treasure. */
export const ARTIFACT_FINDS: Record<SiteKind, { chance: number; value: [number, number] } | null> = {
  nest: null,
  den: { chance: 0.3, value: [120_000, 250_000] },
  haven: { chance: 0.6, value: [250_000, 500_000] },
  lair: { chance: 1, value: [250_000, 500_000] },
};
export const TREASURE_VALUE: [number, number] = [1_000_000, 1_600_000];

/** Eight hundred years of keeping things. The first of each list is the line's treasure, found in its lair. */
export const ARTIFACTS: Record<string, string[]> = {
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
export function basePrice(s: GameState, id: GoodId): number {
  if (id !== "tissue") return GOODS[id].price;
  return TISSUE_PRICES.find(([r]) => r === null || s.research.done.includes(r))![1];
}

const round = (n: number) => Math.round(n / 1_000) * 1_000;

/** What a unit fetches at full demand, on this difficulty. */
export const fullPrice = (s: GameState, id: GoodId) => round(basePrice(s, id) * priceScale(s));
/** What the next unit fetches. */
export const offerFor = (s: GameState, id: GoodId) => round(basePrice(s, id) * demandOf(s, id) * priceScale(s));
export const artifactOffer = (s: GameState, a: Artifact) => round(a.value * demandOf(s, "artifacts") * priceScale(s));

/** Units on hand. Tissue is the remains in cold storage at our bases. */
export function stockOf(s: GameState, id: GoodId): number {
  if (id === "tissue") return s.installations.reduce((t, b) => t + (isReady(s, b) ? b.remains ?? 0 : 0), 0);
  return s.market.stock[id] ?? 0;
}

/** A good we can sell (or make) at all. */
export const goodKnown = (s: GameState, id: GoodId) => !GOODS[id].requires || s.research.done.includes(GOODS[id].requires!) || s.engineering.done.includes(GOODS[id].requires!);

export function sellBlocker(s: GameState, id: GoodId): string | null {
  if (stockOf(s, id) <= 0) return id === "tissue" ? "No vampire remains in cold storage." : "Nothing in stock.";
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
    const b = s.installations.filter((x) => isReady(s, x) && (x.remains ?? 0) > 0).sort((a, c) => (c.remains ?? 0) - (a.remains ?? 0))[0]!;
    b.remains = (b.remains ?? 0) - 1;
  } else s.market.stock[id] = (s.market.stock[id] ?? 0) - 1;
  s.market.demand[id] = Math.max(DEMAND_FLOOR, demandOf(s, id) - g.drop);
  s.funds += paid;
  s.market.earned += paid;
  addLog(s, `Sold a ${g.unit} of ${g.name.toLowerCase()} for $${paid.toLocaleString("en-US")}.`, "good");
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
  addLog(s, `Sold to a private collector for $${paid.toLocaleString("en-US")}: ${shortName(a)}.`, "good");
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
export function findArtifact(s: GameState, bloodline: string, kind: SiteKind, regionId: string, city: string): Artifact[] {
  const find = ARTIFACT_FINDS[kind];
  if (!find) return [];
  const r = rng(s);
  const names = ARTIFACTS[bloodline] ?? ARTIFACTS[BLOODLINES[0]!.id]!;
  const held = new Set([...s.market.artifacts.map((x) => x.name), ...s.market.found]);
  const out: Artifact[] = [];
  const add = (name: string, value: number, treasure: boolean) => {
    const a: Artifact = { id: `art-${s.nextId++}`, name, bloodline, regionId, city, value: round(value), takenAt: s.time, treasure };
    s.market.artifacts.push(a);
    s.market.found.push(name);
    out.push(a);
  };
  if (kind === "lair") add(names[0]!, r.real(...TREASURE_VALUE), true);
  const left = names.slice(1).filter((n) => !held.has(n));
  if (left.length && r.chance(find.chance)) add(r.pick(left), r.real(...find.value), false);
  return out;
}

/** Daily: demand recovers. */
export function dailyMarket(s: GameState) {
  for (const k of Object.keys(s.market.demand) as (GoodId | "artifacts")[])
    s.market.demand[k] = Math.min(1, (s.market.demand[k] ?? 1) + DEMAND_RECOVERY);
}

export const newMarket = (): GameState["market"] => ({ stock: {}, demand: {}, artifacts: [], found: [], earned: 0 });
