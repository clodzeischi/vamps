// What each bloodline brings to a fight (docs/WEB_PORT.md 2 and 3.11). Small
// numbers: a line should feel different, not be a different game.
export interface BloodlineTraits {
  /** Thralls added to the site's count. */
  extraThralls: number;
  /** Added to every thrall's health. */
  thrallHp: number;
  /** Turns sooner a vampire rises from torpor. */
  riseSooner: number;
  /** Added to a vampire's will (domination). */
  will: number;
  /** Multiplies sun damage. */
  sun: number;
  /** Its vampires go out by day (and take the sun's lesser bite). */
  sunproof: boolean;
  /** Its people can't be seen beyond a few tiles until they strike. */
  hidden: boolean;
  /** One line for the player: what to expect. */
  note: string;
}

const BASE: BloodlineTraits = { extraThralls: 0, thrallHp: 0, riseSooner: 0, will: 0, sun: 1, sunproof: false, hidden: false, note: "" };

export const TRAITS: Record<string, BloodlineTraits> = {
  ashgrove: { ...BASE, extraThralls: 2, note: "House Ashgrove: more thralls than anyone." },
  huaca: { ...BASE, riseSooner: 1, note: "The Huaca Line: they rise from torpor a turn sooner." },
  carcassonne: { ...BASE, will: 15, note: "The Carcassonne Perfecti: their domination is the strongest." },
  sahel: { ...BASE, thrallHp: 12, note: "The Sahel Brood: hardy thralls." },
  jade: { ...BASE, hidden: true, note: "The Jade Court: unseen until close, or until they strike." },
  nullarbor: { ...BASE, sun: 0.5, sunproof: true, note: "The Nullarbor Kin: they go out by day, and the sun bites them less." },
};

export const traitsOf = (bloodline: string): BloodlineTraits => TRAITS[bloodline] ?? BASE;
