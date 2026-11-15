import type { KitId } from "./kit";

// The Order's aircraft. Helicopters are bought outright; jets are leased.
// Reach is the radius a team can be sent from its base.
//
// On the tactical layer (step 6) the difference matters: a helicopter waits on
// the landing zone, where the enemy can destroy it, but it lifts out every
// body and all the loot at the end. A jet waits safely at an airfield, but the
// team must destroy the vampires' bodies and carry out what loot it can to an
// extraction zone. Until then, missions are auto-resolved: a helicopter can
// be lost when a fight goes badly; loot doesn't exist yet.
export type AircraftKind = "helicopter" | "jet";

export interface AircraftDef {
  kind: AircraftKind;
  name: string;
  callsign: string;
  seats: number;
  speedKn: number;
  reachNm: number;
  /** Bought outright (helicopters) or leased by the month (jets). */
  ownership: "owned" | "leased";
  /** Purchase price, for owned aircraft. */
  price: number;
  /** A month's lease, or for owned aircraft, crew and maintenance. */
  monthly: number;
  /** Share of the price back on selling an owned aircraft. */
  resale: number;
  /** Added to a team's secrecy cost when it flies (jets need an airfield and draw attention). */
  noise: number;
  /** Fuel, crew and landing fees per nautical mile flown. */
  costPerNm: number;
  description: string;
}

export const AIRCRAFT: Record<AircraftKind, AircraftDef> = {
  helicopter: {
    kind: "helicopter", name: "Helicopter", callsign: "CHERUB", seats: 8, speedKn: 150, reachNm: 450,
    ownership: "owned", price: 900_000, monthly: 35_000, resale: 0.5, noise: 0.5, costPerNm: 60,
    description: "Short reach, slow, but it sets a team down anywhere, quietly. Waits on the landing zone, where it can be lost.",
  },
  jet: {
    kind: "jet", name: "Business jet", callsign: "SERAPH", seats: 12, speedKn: 450, reachNm: 2600,
    ownership: "leased", price: 0, monthly: 350_000, resale: 0, noise: 1.5, costPerNm: 90,
    description: "Crosses a continent in hours. Waits at an airfield, out of harm's way, and airfields keep records.",
  },
};

/** A flight hired for one trip: reaches anywhere, from any base, with no hangar
 *  or lease. Our own aircraft stay home. */
export interface HiredFlight {
  id: "charter" | "commercial";
  name: string;
  seats: number;
  speedKn: number;
  /** Booking, clearing the passengers (and for an airline, connections): longer than our own crews. */
  prepHours: number;
  /** Booking fee, plus per nautical mile there and back. */
  fee: number;
  costPerNm: number;
  /** A passenger in street clothes is just a passenger; a concealed weapon is a risk. */
  noise: number;
  /** What gets through the terminal. */
  kits: readonly KitId[];
  /** Short, for the dispatch screen's aircraft list. */
  sub: string;
  description: string;
}

/** A business jet: two agents, and private terminals don't search bags, so they can go armed
 *  (plainclothes): their best chance of getting out if it goes wrong. */
export const CHARTER: HiredFlight = {
  id: "charter",
  name: "Chartered jet",
  seats: 2,
  speedKn: 430,
  prepHours: 4,
  fee: 25_000,
  costPerNm: 35,
  noise: 0.5,
  kits: ["civilian", "plainclothes"],
  sub: "hired, 2 seats, armed allowed",
  description: "Reaches anywhere, for two agents. A private terminal doesn't search bags: they can go armed, which is their best chance if it goes wrong. No tactical kit.",
};

/** An airline ticket: a tenth of a charter, one agent, airport security (unarmed, civilian clothes). */
export const COMMERCIAL: HiredFlight = {
  id: "commercial",
  name: "Commercial flight",
  seats: 1,
  speedKn: 380,
  prepHours: 8,
  fee: 2_500,
  costPerNm: 3.5,
  noise: 0.2,
  kits: ["civilian"],
  sub: "airline ticket, 1 seat, unarmed",
  description: "Reaches anywhere, for one agent, at a tenth of a charter. Airport security means civilian clothes and no weapon: if it goes wrong, they have nothing.",
};

export const HIRED_FLIGHTS = [CHARTER, COMMERCIAL] as const;
export const hiredFlight = (id: string): HiredFlight | undefined => HIRED_FLIGHTS.find((f) => f.id === id);
