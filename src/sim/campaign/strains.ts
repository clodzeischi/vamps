// What we know of each house's strain (docs/design/research.md, "The houses'
// weaknesses"). The strain is real from the start; knowing it comes three
// ways: its History's rumours (one of three true), what battles show
// (suspected), and its Strain topic (confirmed).
import { bloodlineById } from "../../data/bloodlines";
import {
  silverRemarkable,
  WEAKNESSES,
  type Band,
  type Strain,
  type WeaknessId,
} from "../../data/strains";
import { researched } from "../base/research";
import { addLog, type GameState, type Suspicion } from "../core/state";

export const strainOf = (s: GameState, house: string): Strain | undefined =>
  s.bloodlines[house]?.strain;

export interface StrainView {
  /** Its Strain is sequenced: everything below is fact. */
  confirmed: boolean;
  band: Band | null;
  /** Silver's multiplier when confirmed; otherwise what we've seen of it, if anything. */
  silver: number | null;
  silverSeen: "burns" | "barely" | null;
  /** Weaknesses confirmed, or suspected from battle. */
  weaknesses: { id: WeaknessId; known: "confirmed" | "suspected" }[];
  /** Its History's three rumours (one true), once read. */
  rumours: WeaknessId[] | null;
}

export function strainView(s: GameState, house: string): StrainView {
  const st = s.bloodlines[house];
  const strain = st?.strain;
  const confirmed = !!strain && researched(s, `strain-${house}`);
  const suspected = st?.suspected ?? [];
  const seen = !!strain && suspected.includes("silver") && silverRemarkable(strain.silver);
  return {
    confirmed,
    band: confirmed ? strain!.band : null,
    silver: confirmed ? strain!.silver : null,
    silverSeen: seen ? (strain!.silver > 1 ? "burns" : "barely") : null,
    weaknesses: !strain
      ? []
      : confirmed
        ? strain.weaknesses.map((id) => ({ id, known: "confirmed" as const }))
        : strain.weaknesses
            .filter((w) => suspected.includes(w))
            .map((id) => ({ id, known: "suspected" as const })),
    rumours: strain && researched(s, `history-${house}`) ? [...strain.rumours] : null,
  };
}

const SEEN_WORDS: Record<Suspicion, string> = {
  silver: "silver does something unusual to them",
  "cold-torpor": "their torpor runs long",
  circadian: "by day they sleep through gunfire",
  "thin-skin": "fire takes them like straw",
  photic: "a strobe stuns them",
  acoustic: "a flashbang stuns them",
  "one-compound": "the blockers break their domination",
  "slow-clotting": "they bleed like the living",
};

/** A battle showed a weakness (or silver) at work: the Bloodlines screen marks it suspected. */
export function suspect(s: GameState, house: string, what: Suspicion) {
  const st = s.bloodlines[house];
  if (!st || (st.suspected ?? []).includes(what)) return;
  (st.suspected ??= []).push(what);
  if (researched(s, `strain-${house}`)) return; // already known for certain
  const b = bloodlineById(house);
  const name = what === "silver" ? "Silver" : WEAKNESSES[what].name;
  addLog(s, `${b?.name ?? house}: ${SEEN_WORDS[what]}. ${name} is suspected.`, "good");
}
