// Per-browser preferences. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and defaults always work.
import type { SiteSize } from "../tactical/mapgen";
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
  kit: "plainclothes" | "tactical";
  arrival: "helicopter" | "jet";
  hostage: boolean;
  /** "Balls to the walls": all-out war (tactical/battle.ts MAYHEM). Missing in older settings: off. */
  mayhem?: boolean;
}

const DEFAULT_SKIRMISH: SkirmishSetup = { setting: "urban", landmark: "none", winter: false, rain: false, size: "den", bloodline: "carcassonne", night: true, kit: "tactical", arrival: "helicopter", hostage: false };

export interface Settings {
  bloom: boolean;
  /** 0..1; 0 is off. Scales every sound. */
  masterVolume: number;
  /** 0..1; 0 is off. */
  musicVolume: number;
  /** 0..1; 0 is off. Clicks, dispatch cues, gunfire and blows. */
  sfxVolume: number;
  /** 0..1; 0 is off. The battlescape's loops: rain, wind, traffic, wildlife, the helicopter's rotor. */
  ambientVolume: number;
  /** Battlescape keys the player changed (the rest are the defaults, ui/keys.ts). */
  keys: Partial<KeyBindings>;
  /** The last skirmish set up, so the menu remembers it. */
  skirmish: SkirmishSetup;
}

const KEY = "vamps.settings.v1";
const DEFAULTS: Settings = { bloom: true, masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.7, ambientVolume: 0.5, keys: {}, skirmish: DEFAULT_SKIRMISH };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...s, keys: { ...s.keys }, skirmish: { ...DEFAULT_SKIRMISH, ...s.skirmish } };
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
