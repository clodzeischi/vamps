// Per-browser preferences. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and defaults always work.
export interface Settings {
  bloom: boolean;
  /** 0..1; 0 is off. Scales every sound. */
  masterVolume: number;
  /** 0..1; 0 is off. */
  musicVolume: number;
  /** 0..1; 0 is off. Clicks and dispatch cues. */
  sfxVolume: number;
  /** Main menu style prototype (2026-11-16): which of the three looks to show. */
  menuStyle: MenuStyle;
}

export const MENU_STYLES = ["reliquary", "terminal", "dossier"] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

const KEY = "vamps.settings.v1";
const DEFAULTS: Settings = { bloom: true, masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.7, menuStyle: "reliquary" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s: Settings = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
    return MENU_STYLES.includes(s.menuStyle) ? s : { ...s, menuStyle: DEFAULTS.menuStyle };
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
