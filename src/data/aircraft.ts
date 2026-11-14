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
