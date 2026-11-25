// Map overlays: one at a time, each colouring the regions by one measure
// (docs/design/ui.md). Icons stay as they are: only the regions are tinted.
import { REGIONS } from "../data/regions";
import { activityShade } from "../sim/activity";
import { coveredRegions, sigintRates } from "../sim/commands";
import { isHostile } from "../sim/economy";
import { hasAsset, humintRates } from "../sim/humint";
import { mediaLevel } from "../sim/media";
import { europeClosed, isEurope } from "../sim/story";
import type { GameState } from "../sim/state";

export type MapOverlay = "none" | "support" | "sigint" | "humint" | "access" | "io" | "activity";

type Rgb = [number, number, number];
export interface Tint { color: Rgb; k: number }
export interface Reading { tint: Tint | null; text: string }

const GREEN: Rgb = [0.15, 1, 0.3], RED: Rgb = [1, 0.08, 0.1], BLUE: Rgb = [0.3, 0.75, 1], HOLO: Rgb = [0.35, 1, 0.55];
const AMBER: Rgb = [1, 0.7, 0.2], VIOLET: Rgb = [0.75, 0.4, 1], BLOOD: Rgb = [1, 0.22, 0.08];

export interface OverlayDef {
  id: MapOverlay;
  label: string;
  tip: string;
  /** The colour key: swatch and words. */
  key: { color: Rgb; text: string }[];
  read(g: GameState, regionId: string): Reading;
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export const OVERLAYS: OverlayDef[] = [
  { id: "none", label: "None", tip: "No overlay", key: [], read: () => ({ tint: null, text: "" }) },
  {
    id: "support", label: "Support", tip: "Each region's support for the Church, −5 to +5",
    key: [{ color: GREEN, text: "backs us" }, { color: RED, text: "backs them" }],
    read(g, id) {
      const v = g.regions[id]?.support ?? 0, k = Math.min(1, Math.abs(v) / 5);
      return { tint: k > 0.01 ? { color: v >= 0 ? GREEN : RED, k } : null, text: `support ${signed(Math.round(v))}` };
    },
  },
  {
    id: "sigint", label: "SIGINT coverage", tip: "Where our stations and SIGINT centres listen: strong at home, faint next door",
    key: [{ color: BLUE, text: "a station here" }, { color: [0.15, 0.37, 0.5], text: "heard from next door" }],
    read(g, id) {
      if (coveredRegions(g).has(id)) return { tint: { color: BLUE, k: 1 }, text: "SIGINT: a station here" };
      if ((sigintRates(g).get(id) ?? 0) > 0) return { tint: { color: BLUE, k: 0.35 }, text: "SIGINT: faint, from next door" };
      return { tint: null, text: "no SIGINT" };
    },
  },
  {
    id: "humint", label: "HUMINT coverage", tip: "What our agents hear: informants, and access agents where we can't go",
    key: [{ color: HOLO, text: "agents reporting" }],
    read(g, id) {
      const rate = humintRates(g).get(id) ?? 0, n = g.assets.filter((a) => a.regionId === id).length;
      return { tint: rate > 0 ? { color: HOLO, k: Math.min(1, 0.35 + rate * 2) } : null, text: rate > 0 ? `HUMINT: ${n} agent${n === 1 ? "" : "s"} reporting` : n ? `${n} agent${n === 1 ? "" : "s"}, none reporting` : "no HUMINT" };
    },
  },
  {
    id: "access", label: "Access", tip: "Where teams can operate: hostile and closed regions need an access agent",
    key: [{ color: RED, text: "closed to us" }, { color: AMBER, text: "open through an access agent" }],
    read(g, id) {
      const closed = (europeClosed(g) && isEurope(id)) || isHostile(g.regions[id]?.support ?? 0);
      if (!closed) return { tint: null, text: "open to us" };
      return hasAsset(g, id, "access") ? { tint: { color: AMBER, k: 0.8 }, text: "open through an access agent" } : { tint: { color: RED, k: 0.9 }, text: "closed to us" };
    },
  },
  {
    id: "io", label: "IO", tip: "Information operations: our PR campaigns and influence agents",
    key: [{ color: VIOLET, text: "campaigns and influence agents" }],
    read(g, id) {
      const level = g.media[id], agents = g.assets.filter((a) => a.regionId === id && a.kind === "pr").length;
      const k = Math.min(1, (level ? 0.25 + level * 0.25 : 0) + agents * 0.35);
      const parts = [level ? `${mediaLevel(level).name.toLowerCase()} campaign` : "", agents ? `${agents} influence agent${agents === 1 ? "" : "s"}` : ""].filter(Boolean);
      return { tint: k ? { color: VIOLET, k } : null, text: parts.length ? `IO: ${parts.join(", ")}` : "no IO" };
    },
  },
  {
    id: "activity", label: "Vampire activity", tip: "Our assessment: leads (true or false), sites found and their media campaigns, fading over a month or two",
    key: [{ color: BLOOD, text: "seen lately (our assessment)" }],
    read(g, id) {
      const k = activityShade(g, id);
      return { tint: k > 0.02 ? { color: BLOOD, k } : null, text: k > 0.6 ? "activity: heavy" : k > 0.25 ? "activity: some" : k > 0.02 ? "activity: a little" : "no activity seen" };
    },
  },
];

export const overlayDef = (id: MapOverlay) => OVERLAYS.find((o) => o.id === id) ?? OVERLAYS[0]!;

/** Every region's tint for the globe. */
export const regionTints = (g: GameState, id: MapOverlay) => {
  const def = overlayDef(id);
  return REGIONS.map((r) => ({ index: r.index, tint: id === "none" ? null : def.read(g, r.id).tint }));
};
