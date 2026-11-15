// Interface sounds: the click on buttons and one cue per kind of dispatch.
// Web Audio, so a click plays at once and sounds can overlap. Files are short,
// trimmed and loudness-matched MP3s in public/assets/sfx/ (credits: README.md).
import type { EventKind } from "../sim/state";

export const SOUNDS = {
  click: "click.mp3",
  complete: "complete.mp3",
  vampire: "vampire.mp3",
  coverup: "coverup.mp3",
  monthly: "monthly.mp3",
  lead: "lead.mp3",
} as const;
export type SoundId = keyof typeof SOUNDS;

/** Which cue each dispatch plays. Eviction and open war use the vampire cue as the alarm. */
const EVENT_SOUNDS: Record<EventKind, SoundId | null> = {
  lead: "lead",
  battle: "vampire",
  coverup: "coverup",
  monthly: "monthly",
  vampire: "vampire",
  "eviction-warning": "vampire",
  evicted: "vampire",
  "open-war": "vampire",
  story: "vampire",
  construction: "complete",
  arrival: "complete",
  debrief: "complete",
  "coverup-result": "complete",
  research: "complete",
  debt: "vampire",
  sigil: "complete",
  site: "lead",
  info: "complete",
  "game-over": null,
};

/** The click is a quiet tick under everything else. */
const GAIN: Partial<Record<SoundId, number>> = { click: 0.6 };

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundId, AudioBuffer>();
  private loading = false;
  private volume = 0.5;

  constructor() {
    // Browsers only allow audio after a gesture: create the context on the first one.
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      this.init();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  play(id: SoundId) {
    if (this.volume === 0 || !this.ctx) return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume * (GAIN[id] ?? 1);
    src.buffer = buf;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  playEvent(kind: EventKind) {
    const id = EVENT_SOUNDS[kind];
    if (id) this.play(id);
  }

  private init() {
    if (this.loading) return;
    this.loading = true;
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no Web Audio: stay silent
    }
    const ctx = this.ctx;
    for (const [id, file] of Object.entries(SOUNDS) as [SoundId, string][])
      fetch(`${import.meta.env.BASE_URL}assets/sfx/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => this.buffers.set(id, buf))
        .catch(() => {
          /* missing or undecodable: that sound stays silent */
        });
  }
}

export const sfx = new SoundPlayer();

/** Clicks on anything clickable, app-wide. Disabled buttons stay silent. */
export function installClickSound() {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.("button, a[href], [role=button], input[type=checkbox], select");
    if (el && !(el as HTMLButtonElement).disabled) sfx.play("click");
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
