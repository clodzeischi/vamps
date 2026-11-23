// Background music: one playlist per screen, crossfaded. Browsers block audio
// until the player interacts with the page, so playback starts on the first
// click or key press. Track credits: README.md and the Credits screen.
export type MusicScene = "menu" | "geoscape" | "tactical";
/** How a battle stands, for its music: unseen, fighting, or fighting an elder. */
export type BattleMood = "stealth" | "combat" | "boss";
type Playlist = MusicScene | "combat" | "boss";

// Files are named by role (menu, geo1, geo2...) so it's clear where each plays.
export const TRACKS = {
  menu: { file: "menu.mp3", title: "Crystal Cave (song18)", author: "The Cynic Project", license: "CC0", url: "https://opengameart.org/content/crystal-cave-song18" },
  geo1: { file: "geo1.mp3", title: "Sirens in Darkness", author: "The Cynic Project", license: "CC0", url: "https://opengameart.org/content/sirens-in-darkness" },
  geo2: { file: "geo2.mp3", title: "Another August", author: "The Cynic Project", license: "CC0", url: "https://opengameart.org/content/another-august" },
  stealth1: { file: "stealth1.mp3", title: "Background space track (My Very Own Dead Ship)", author: "yd", license: "CC0", url: "https://opengameart.org/content/background-space-track" },
  stealth2: { file: "stealth2.mp3", title: "Creepy Forest (F)", author: "Augmentality (Brandon Morris)", license: "CC0", url: "https://opengameart.org/content/creepy-forest-f" },
  battle1: { file: "battle1.mp3", title: "Imminent Threat", author: "Matthew Pablo", license: "CC-BY 3.0", url: "https://opengameart.org/content/imminent-threat-collection" },
  battle2: { file: "battle2.mp3", title: "Dramatic Action", author: "HorrorPen", license: "CC-BY 3.0", url: "https://opengameart.org/content/dramatic-action" },
  boss1: { file: "boss1.mp3", title: "Epic Boss Battle", author: "Juhani Junkala", license: "CC0", url: "https://opengameart.org/content/epic-boss-battle" },
} as const;
type TrackId = keyof typeof TRACKS;

const PLAYLISTS: Record<Playlist, TrackId[]> = {
  menu: ["menu"],
  geoscape: ["geo1", "geo2"],
  // Battles (Skirmish and missions) until the enemy is alerted...
  tactical: ["stealth1", "stealth2"],
  // ...then combat for the rest of the battle...
  combat: ["battle1", "battle2"],
  // ...or, once an elder is alerted, the boss track (on a loop).
  boss: ["boss1"],
};

const FADE_SECONDS = 2.5;

/**
 * A slider's 0..1 as an element's volume. Hearing is roughly logarithmic, so a
 * linear volume sounds nearly full down to half the slider; squaring it makes
 * each step sound like a step. (sfx.ts uses the same curve.)
 */
export const loudness = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return c * c;
};
const src = (id: TrackId) => `${import.meta.env.BASE_URL}assets/music/${TRACKS[id].file}`;

class MusicPlayer {
  private current: { el: HTMLAudioElement; track: TrackId } | null = null;
  private fading: HTMLAudioElement[] = [];
  private scene: MusicScene | null = null;
  private mood: BattleMood = "stealth";
  private playlist: Playlist | null = null;
  private index = 0;
  private volume = 0.5;
  private unlocked = false;
  private frame = 0;
  private last = 0;

  constructor() {
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (this.playlist && !this.current) this.start();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  /** Takes effect at once on the track playing (it used to wait for the next fade). */
  setVolume(v: number) {
    this.volume = loudness(v);
    if (this.volume === 0) return this.stop();
    if (!this.current) {
      if (this.playlist) this.start();
      return;
    }
    // A fade-in under way simply ends at the new level.
    this.current.el.volume = this.volume;
  }

  setScene(scene: MusicScene) {
    this.scene = scene;
    this.switch();
  }

  /** In a battle: what the tactical scene plays (see BattleMood). */
  setBattleMood(mood: BattleMood) {
    this.mood = mood;
    this.switch();
  }

  /** Starts the scene's playlist from the top, if it changed. */
  private switch() {
    const list: Playlist | null = this.scene === "tactical" && this.mood !== "stealth" ? this.mood : this.scene;
    if (list === this.playlist) return;
    this.playlist = list;
    this.index = 0;
    this.start();
  }

  /** Crossfades to the scene's next track. */
  private start() {
    if (!this.playlist || !this.unlocked || this.volume === 0) return;
    const list = PLAYLISTS[this.playlist];
    const track = list[this.index % list.length]!;
    if (this.current) this.fading.push(this.current.el);
    const el = new Audio(src(track));
    el.preload = "auto";
    el.volume = 0;
    // A one-track playlist loops; otherwise move on to the next track.
    el.loop = list.length === 1;
    el.addEventListener("ended", () => {
      if (this.current?.el !== el) return;
      this.index++;
      this.start();
    });
    el.play().catch(() => {
      /* blocked or failed to load: stay silent rather than throw */
    });
    this.current = { el, track };
    this.tick();
  }

  private stop() {
    if (this.current) this.fading.push(this.current.el);
    this.current = null;
    this.tick();
  }

  /** Fades the current track in and old ones out. */
  private tick() {
    cancelAnimationFrame(this.frame);
    this.last = performance.now();
    const step = (now: number) => {
      // rAF timestamps can precede performance.now() at the start: never step backwards.
      const dv = Math.max(0, now - this.last) / 1000 / FADE_SECONDS;
      this.last = now;
      let busy = false;
      if (this.current) {
        const el = this.current.el;
        el.volume = Math.max(0, Math.min(this.volume, el.volume + dv * this.volume));
        if (el.volume < this.volume) busy = true;
        else el.volume = this.volume; // volume slider moved down
      }
      this.fading = this.fading.filter((el) => {
        el.volume = Math.max(0, el.volume - dv * Math.max(this.volume, 0.2));
        if (el.volume > 0) return true;
        el.pause();
        el.removeAttribute("src");
        el.load();
        return false;
      });
      if (busy || this.fading.length) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}

export const music = new MusicPlayer();
