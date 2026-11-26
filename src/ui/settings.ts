// Per-browser preferences. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and defaults always work.
import { BLOODLINES } from "../data/bloodlines";
import type { SiteSize } from "../tactical/map/mapgen";
import type { KeyBindings } from "./keys";

/** The skirmish set up in the main menu; fixed once the battle starts. */
export interface SkirmishSetup {
  setting: "urban" | "rural" | "apartments" | "industrial";
  /** A town's recognisable building, where the vampires are (and any prisoner). */
  landmark: "none" | "hospital" | "store";
  winter: boolean;
  /** Drizzle and puddles (never with winter). */
  rain: boolean;
  size: SiteSize;
  bloodline: string;
  night: boolean;
  /** At night. */
  moon: "new" | "half" | "full";
  kit: "plainclothes" | "tactical";
  arrival: "helicopter" | "jet";
  hostage: boolean;
  /** "Balls to the walls": all-out war (tactical/battle.ts MAYHEM). Missing in older settings: off. */
  mayhem?: boolean;
}

/** The lit share of each moon. */
export const MOONLIGHT = { new: 0, half: 0.5, full: 1 };

const DEFAULT_SKIRMISH: SkirmishSetup = { setting: "urban", landmark: "none", winter: false, rain: false, size: "den", bloodline: "carcassonne", night: true, moon: "half", kit: "tactical", arrival: "helicopter", hostage: false };

export interface Settings {
  bloom: boolean;
  /** 0..1; 0 is off. Scales every sound. */
  masterVolume: number;
  /** 0..1; 0 is off. */
  musicVolume: number;
  /** 0..1; 0 is off. Clicks, dispatch cues, gunfire and blows. */
  sfxVolume: number;
  /** 0..1; 0 is off. The battlescape's loops: rain, wind, traffic, wildlife. */
  ambientVolume: number;
  /** Battlescape keys the player changed (the rest are the defaults, ui/keys.ts). */
  keys: Partial<KeyBindings>;
  /** The last skirmish set up, so the menu remembers it. */
  skirmish: SkirmishSetup;
}

const KEY = "vamps.settings.v1";
const DEFAULTS: Settings = { bloom: true, masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.7, ambientVolume: 0.5, keys: {}, skirmish: DEFAULT_SKIRMISH };

/** The choices still on offer; anything else (an older version's) goes back to the default. */
const CHOICES = {
  setting: ["urban", "rural", "apartments", "industrial"], landmark: ["none", "hospital", "store"], size: ["nest", "den", "haven", "lair"],
  bloodline: BLOODLINES.map((b) => b.id), kit: ["plainclothes", "tactical"], arrival: ["helicopter", "jet"], moon: ["new", "half", "full"],
} as const;
function skirmishFrom(x: Partial<SkirmishSetup> | null | undefined): SkirmishSetup {
  const out: SkirmishSetup = { ...DEFAULT_SKIRMISH, ...x };
  for (const k of Object.keys(CHOICES) as (keyof typeof CHOICES)[]) if (!(CHOICES[k] as readonly string[]).includes(out[k])) Object.assign(out, { [k]: DEFAULT_SKIRMISH[k] });
  for (const k of ["winter", "rain", "night", "hostage"] as const) out[k] = !!out[k];
  return out;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<Settings>;
    const volume = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
    return {
      ...DEFAULTS,
      bloom: s.bloom !== false,
      masterVolume: volume(s.masterVolume, DEFAULTS.masterVolume), musicVolume: volume(s.musicVolume, DEFAULTS.musicVolume),
      sfxVolume: volume(s.sfxVolume, DEFAULTS.sfxVolume), ambientVolume: volume(s.ambientVolume, DEFAULTS.ambientVolume),
      keys: { ...s.keys }, skirmish: skirmishFrom(s.skirmish),
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* not persisted; fine */
  }
}
