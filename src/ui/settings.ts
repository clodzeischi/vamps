// Per-browser preferences. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and defaults always work.
export interface Settings {
  bloom: boolean;
  /** 0..1; 0 is off. */
  musicVolume: number;
}

const KEY = "vamps.settings.v1";
const DEFAULTS: Settings = { bloom: true, musicVolume: 0.5 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
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
