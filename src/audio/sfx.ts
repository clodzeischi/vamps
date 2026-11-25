// Interface sounds: the click on buttons and one cue per kind of dispatch;
// and the helicopter that drops a team; loops for the battlescape (wildlife, rain, wind, traffic). Web Audio, so a
// click plays at once and sounds can overlap. Files are short, trimmed and
// loudness-matched MP3s in public/assets/sfx/; a loop is a WAV, because an
// MP3's encoder padding leaves a gap each time round (credits: README.md).
import type { EventKind } from "../sim/state";
import { loudness } from "./music";

const SOUNDS = {
  click: "click.mp3",
  complete: "complete.mp3",
  vampire: "vampire.mp3",
  coverup: "coverup.mp3",
  monthly: "monthly.mp3",
  lead: "lead.mp3",
  // The helicopter flying off as a battle begins.
  helicopter: "helicopter.mp3",
  birds: "birds.wav",
  crickets: "crickets.wav",
  rain: "rain.wav",
  traffic: "traffic.wav",
  wind: "wind.wav",
  // Gunfire: one round each, or a machine gun's burst (cut, mono, matched in loudness).
  "shot-pistol": "shot-pistol.mp3",
  "shot-pistol-sd": "shot-pistol-sd.mp3",
  "shot-rifle": "shot-rifle.mp3",
  "shot-rifle-sd": "shot-rifle-sd.mp3",
  "shot-shotgun-pump": "shot-shotgun-pump.mp3",
  "shot-shotgun-semi": "shot-shotgun-semi.mp3",
  "shot-m110": "shot-m110.mp3",
  "shot-m240b": "shot-m240b.mp3",
  "burst-m249": "burst-m249.mp3",
  "burst-m240b": "burst-m240b.mp3",
  reload: "reload.mp3",
  // Explosions: a grenade (the incendiary going off), a rocket; a rocket launcher firing.
  "explosion-grenade": "explosion-grenade.mp3",
  "explosion-rocket": "explosion-rocket.mp3",
  "rocket-launch": "rocket-launch.mp3",
  // A grenade that bursts rather than blows up: the UV and smoke grenades (not built yet).
  bang: "bang.mp3",
  // Blows: four knife stabs (one at random), claws tearing, a swish for a miss.
  "knife-1": "knife-1.mp3",
  "knife-2": "knife-2.mp3",
  "knife-3": "knife-3.mp3",
  "knife-4": "knife-4.mp3",
  claws: "claws.mp3",
  swish: "swish.mp3",
  // A body hitting the ground.
  thud: "thud.mp3",
} as const;
export type SoundId = keyof typeof SOUNDS;
/** Loops are large WAVs: fetched when first asked for, not with the interface sounds. */
const LOOPS: ReadonlySet<SoundId> = new Set(["birds", "crickets", "rain", "traffic", "wind"]);

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
  haul: null,
  "coverup-result": "complete",
  research: "complete",
  debt: "vampire",
  sigil: "complete",
  site: "lead",
  info: "complete",
  "game-over": null,
};

/**
 * The click is a quiet tick under everything else; the
 * ambience sits under the battle. The ambience files are matched in RMS but
 * rain, whose crackle peaks capped it, is 4.6 dB down: made up here. Wind,
 * a wide roar, sits lower than the rest.
 */
const GAIN: Partial<Record<SoundId, number>> = { click: 0.6, helicopter: 0.55, birds: 0.35, crickets: 0.35, traffic: 0.35, rain: 0.35 * 1.7, wind: 0.25,
  // Suppressed: matched in the file, played well under a bare muzzle.
  "shot-pistol-sd": 0.4, "shot-rifle-sd": 0.4, reload: 0.6,
  // Blows are close-up sounds: under a gunshot.
  "knife-1": 0.7, "knife-2": 0.7, "knife-3": 0.7, "knife-4": 0.7, claws: 0.8, swish: 0.5, thud: 0.8,
};

/** A sound playing round and round until stopped; `setGain` (0..1) on top of the ambience volume, eased. */
export interface Loop {
  setGain(g: number): void;
  stop(): void;
}

interface Voice {
  id: SoundId;
  gain: number;
  src: AudioBufferSourceNode | null;
  node: GainNode | null;
  stopped: boolean;
}

class SoundPlayer {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundId, AudioBuffer>();
  private loading = false;
  private volume = 0.5;
  /** The loops' own volume (ambience: rain, wind, traffic, wildlife). */
  private ambient = 0.25;
  private loops = new Set<Voice>();
  private fetched = new Set<SoundId>();

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
    this.volume = loudness(v);
  }

  /** Ambience: the loops, on their own slider. */
  setAmbientVolume(v: number) {
    this.ambient = loudness(v);
    for (const l of this.loops) this.level(l);
  }

  /**
   * Starts a sound looping (it waits for the file, and for the first click
   * if audio isn't allowed yet). Stop it when what makes it is gone.
   */
  loop(id: SoundId, gain = 1): Loop {
    const v: Voice = { id, gain, src: null, node: null, stopped: false };
    this.loops.add(v);
    this.startLoop(v);
    return {
      setGain: (g) => {
        if (Math.abs(g - v.gain) < 0.005) return;
        v.gain = g;
        this.level(v);
      },
      stop: () => {
        v.stopped = true;
        this.loops.delete(v);
        if (v.node && this.ctx) v.node.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
        v.src?.stop((this.ctx?.currentTime ?? 0) + 0.5);
      },
    };
  }

  private startLoop(v: Voice) {
    if (v.stopped || v.src || !this.ctx) return; // init() calls this again once audio is allowed
    const buf = this.buffers.get(v.id);
    if (!buf) return void this.fetch(v.id); // started once it's in
    const src = this.ctx.createBufferSource();
    const node = this.ctx.createGain();
    node.gain.value = 0;
    src.buffer = buf;
    src.loop = true;
    src.connect(node).connect(this.ctx.destination);
    // Each loop starts somewhere in the file, so two at once don't beat together.
    src.start(0, Math.random() * buf.duration);
    v.src = src;
    v.node = node;
    this.level(v);
  }

  private level(v: Voice) {
    if (!v.node || !this.ctx) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    v.node.gain.setTargetAtTime(this.ambient * (GAIN[v.id] ?? 1) * v.gain, this.ctx.currentTime, 0.1);
  }

  /** Plays a sound once; the function returned fades it out early. */
  play(id: SoundId): () => void {
    const none = () => {};
    if (this.volume === 0 || !this.ctx) return none;
    const buf = this.buffers.get(id);
    if (!buf) return none;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume * (GAIN[id] ?? 1);
    src.buffer = buf;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    const ctx = this.ctx;
    return () => {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      src.stop(ctx.currentTime + 1);
    };
  }

  /**
   * A sound in the world: `gain` (0..1, distance and the like) on top of the
   * effects volume, `pan` from -1 (left) to 1 (right), `rate` its speed and
   * pitch (1 as recorded), `delay` seconds from now.
   */
  playAt(id: SoundId, o: { gain?: number; pan?: number; rate?: number; delay?: number } = {}) {
    if (this.volume === 0 || !this.ctx) return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume * (GAIN[id] ?? 1) * (o.gain ?? 1);
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    let out: AudioNode = gain;
    if (o.pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      gain.connect(p);
      out = p;
    }
    src.connect(gain);
    out.connect(this.ctx.destination);
    src.start(this.ctx.currentTime + (o.delay ?? 0));
  }

  /** How long a sound runs (seconds; 0 while it isn't loaded). */
  duration(id: SoundId) {
    return this.buffers.get(id)?.duration ?? 0;
  }

  playEvent(kind: EventKind) {
    const id = EVENT_SOUNDS[kind];
    if (id) this.play(id);
  }

  private fetch(id: SoundId) {
    const ctx = this.ctx;
    if (!ctx || this.fetched.has(id)) return;
    this.fetched.add(id);
    fetch(`${import.meta.env.BASE_URL}assets/sfx/${SOUNDS[id]}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(id, buf);
        for (const l of this.loops) if (l.id === id) this.startLoop(l);
      })
      .catch(() => {
        /* missing or undecodable: that sound stays silent */
      });
  }

  private init() {
    if (this.loading) return;
    this.loading = true;
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no Web Audio: stay silent
    }
    for (const id of Object.keys(SOUNDS) as SoundId[]) if (!LOOPS.has(id)) this.fetch(id);
    for (const l of this.loops) this.startLoop(l);
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
