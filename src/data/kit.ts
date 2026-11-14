// Kit profiles: what a team wears and carries. Louder kit wins fights and
// costs secrecy; quiet kit opens doors and loses gunfights.
import type { StatId } from "./agents";

export type KitId = "civilian" | "plainclothes" | "tactical";

export interface KitDef {
  id: KitId;
  name: string;
  description: string;
  /** Secrecy cost of deploying: base, plus this per agent beyond the first. */
  noiseBase: number;
  noisePerAgent: number;
  /** Damage dealt in a fight (1 = a pistol each). */
  firepower: number;
  /** Share of incoming damage stopped. */
  armour: number;
  /** Added to the team's skill checks. */
  bonus: Partial<Record<StatId, number>>;
}

export const KIT: Record<KitId, KitDef> = {
  civilian: {
    id: "civilian", name: "Civilian clothes", noiseBase: 0, noisePerAgent: 0.15, firepower: 0.55, armour: 0,
    bonus: { tradecraft: 10, insight: 8 },
    description: "Nobody looks twice. A knife, a crucifix, perhaps a pistol. Doors open; gunfights go badly.",
  },
  plainclothes: {
    id: "plainclothes", name: "Plainclothes, armed", noiseBase: 0.3, noisePerAgent: 0.3, firepower: 0.9, armour: 0.15,
    bonus: {},
    description: "Concealed sidearms, soft vests, a bag of tricks in the car. Passes for police, mostly.",
  },
  tactical: {
    id: "tactical", name: "Tactical", noiseBase: 1.5, noisePerAgent: 0.6, firepower: 1.3, armour: 0.4,
    bonus: { tradecraft: -20, insight: -10 },
    description: "Rifles, plate, incendiaries, UV. Wins fights. Nobody mistakes it for anything else.",
  },
};

export const KIT_IDS = Object.keys(KIT) as KitId[];
export const isKitId = (k: unknown): k is KitId => typeof k === "string" && k in KIT;
