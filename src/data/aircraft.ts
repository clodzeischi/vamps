// Leased aircraft. Reach is the radius a team can be sent from its base.
export type AircraftKind = "helicopter" | "jet";

export interface AircraftDef {
  kind: AircraftKind;
  name: string;
  callsign: string;
  seats: number;
  speedKn: number;
  reachNm: number;
  lease: number;
  /** Added to a team's secrecy cost when it flies (jets need an airfield and draw attention). */
  noise: number;
  /** Fuel, crew and landing fees per nautical mile flown. */
  costPerNm: number;
  description: string;
}

export const AIRCRAFT: Record<AircraftKind, AircraftDef> = {
  helicopter: {
    kind: "helicopter", name: "Helicopter", callsign: "CHERUB", seats: 8, speedKn: 150, reachNm: 450,
    lease: 120_000, noise: 0.5, costPerNm: 60,
    description: "Short reach, slow, but it can set a team down anywhere, quietly.",
  },
  jet: {
    kind: "jet", name: "Business jet", callsign: "SERAPH", seats: 12, speedKn: 450, reachNm: 2600,
    lease: 350_000, noise: 1.5, costPerNm: 90,
    description: "Crosses a continent in hours. Needs an airfield, and airfields keep records.",
  },
};

/** A business jet hired for one trip: reaches anywhere, takes one agent, no
 *  hangar or lease. For leads and sites out of every aircraft's reach. */
export const CHARTER = {
  id: "charter",
  name: "Chartered jet",
  seats: 1,
  speedKn: 430,
  /** Booking the flight and clearing the passenger: longer than our own crews. */
  prepHours: 4,
  /** Booking fee, plus per nautical mile there and back. */
  fee: 50_000,
  costPerNm: 70,
  /** A passenger in street clothes is just a passenger; a concealed weapon is a risk. */
  noise: 0.5,
  description: "Reaches anywhere, for one agent. No tactical kit through a charter terminal.",
} as const;
