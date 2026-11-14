// UI store. The campaign (GameState) is mutated in place by sim/ functions;
// `rev` is bumped after every change so subscribed components re-render.
import { create } from "zustand";
import type { DifficultyId } from "../data/difficulty";
import type { InstallationKind } from "../data/installations";
import { regionByIndex } from "../data/regions";
import { saveToSlot, type SlotId } from "../save/storage";
import { newCampaign } from "../sim/campaign";
import { advance as advanceSim, dismissEvent as dismissSim } from "../sim/clock";
import { build as buildSim } from "../sim/commands";
import { decide as decideSim, dispatch as dispatchSim, type DispatchPlan } from "../sim/missions";
import { regionById } from "../data/regions";
import type { GameState } from "../sim/state";
import type { LatLon } from "../sim/time";
import { loadSettings, saveSettings, type Settings } from "./settings";

export type ScreenId = "menu" | "geoscape";

export const SPEEDS = [
  { label: "1 min/s", gameSecondsPerSecond: 60 },
  { label: "10 min/s", gameSecondsPerSecond: 600 },
  { label: "1 hr/s", gameSecondsPerSecond: 3600 },
  { label: "6 hr/s", gameSecondsPerSecond: 6 * 3600 },
  { label: "1 day/s", gameSecondsPerSecond: 24 * 3600 },
] as const;

export interface Selection {
  pos: LatLon;
  regionId: string | null;
}

/** A specific thing on the globe the side panel is showing. */
export type Focus = { kind: "lead" | "installation" | "site" | "mission"; id: string };

/** Which kind of thing an id belongs to, if it still exists. */
export function focusFor(g: GameState, id: string): Focus | null {
  if (g.leads.some((l) => l.id === id)) return { kind: "lead", id };
  if (g.sites.some((x) => x.id === id)) return { kind: "site", id };
  if (g.missions.some((m) => m.id === id)) return { kind: "mission", id };
  if (g.installations.some((i) => i.id === id)) return { kind: "installation", id };
  return null;
}

function focusPos(g: GameState, f: Focus): { pos: LatLon; regionId: string } | null {
  switch (f.kind) {
    case "lead": return g.leads.find((l) => l.id === f.id) ?? null;
    case "site": return g.sites.find((x) => x.id === f.id) ?? null;
    case "installation": return g.installations.find((i) => i.id === f.id) ?? null;
    case "mission": {
      const m = g.missions.find((x) => x.id === f.id);
      return m ? { pos: m.pos, regionId: m.regionId } : null;
    }
  }
}
export type BaseTab = "agents" | "recruit" | "aircraft" | "facilities";

interface Store {
  screen: ScreenId;
  game: GameState | null;
  rev: number;
  speed: number;
  paused: boolean;
  selection: Selection | null;
  focus: Focus | null;
  baseScreen: { baseId: string; tab: BaseTab } | null;
  /** The team builder, open for a lead or site. */
  dispatch: DispatchPlan["target"] | null;
  hoverRegion: string | null;
  supportView: boolean;
  settings: Settings;
  toast: { text: string; tone: "good" | "bad"; id: number } | null;

  startNew(d: DifficultyId): void;
  loadGame(g: GameState): void;
  quitToMenu(): void;
  setSpeed(i: number): void;
  togglePause(): void;
  advance(realSeconds: number): void;
  select(pos: LatLon, regionIndex: number): void;
  selectRegion(regionId: string, pos: LatLon): void;
  hover(regionIndex: number): void;
  dismissEvent(): void;
  focusOn(f: Focus | null): void;
  openBase(baseId: string, tab?: BaseTab): void;
  closeBase(): void;
  openDispatch(target: DispatchPlan["target"]): void;
  closeDispatch(): void;
  /** Sends a team; returns whether it went. */
  sendTeam(plan: DispatchPlan): boolean;
  /** Orders for a team waiting on the ground. */
  decide(missionId: string, optionId: string): void;
  /** Runs a sim command; shows its error, or `ok` on success. */
  command(fn: (g: GameState) => string | null, ok?: string): boolean;
  build(kind: InstallationKind): void;
  save(slot: SlotId): void;
  toggleSupportView(): void;
  notify(text: string, tone?: "good" | "bad"): void;
  updateSettings(patch: Partial<Settings>): void;
}

export const useStore = create<Store>((set, get) => {
  const touch = () => set({ rev: get().rev + 1 });

  return {
    screen: "menu",
    game: null,
    rev: 0,
    speed: 1,
    paused: true,
    selection: null,
    focus: null,
    baseScreen: null,
    dispatch: null,
    hoverRegion: null,
    supportView: false,
    settings: loadSettings(),
    toast: null,

    startNew(d) {
      const seed = (Math.random() * 2 ** 31) | 0;
      get().loadGame(newCampaign(d, seed));
    },
    loadGame(game) {
      set({ game, screen: "geoscape", paused: true, speed: 1, selection: null, focus: null, baseScreen: null, dispatch: null, hoverRegion: null, rev: get().rev + 1 });
    },
    quitToMenu() {
      const { game } = get();
      if (game && !game.gameOver) saveToSlot(game, "auto");
      set({ screen: "menu", paused: true, selection: null, focus: null, baseScreen: null, dispatch: null, hoverRegion: null });
    },
    setSpeed(i) {
      set({ speed: Math.max(0, Math.min(SPEEDS.length - 1, i)), paused: false });
    },
    togglePause() {
      set({ paused: !get().paused });
    },
    advance(realSeconds) {
      const { game, paused, speed } = get();
      if (!game || paused || game.events.length || game.gameOver) return;
      const monthBefore = game.monthIndex;
      const done = advanceSim(game, realSeconds * SPEEDS[speed]!.gameSecondsPerSecond * 1000);
      if (game.monthIndex !== monthBefore) saveToSlot(game, "auto");
      if (done > 0 || game.events.length) touch();
    },
    select(pos, regionIndex) {
      set({ selection: { pos, regionId: regionByIndex(regionIndex)?.id ?? null }, focus: null });
    },
    focusOn(focus) {
      const g = get().game;
      if (!g || !focus) return set({ focus: null });
      const thing = focusPos(g, focus);
      if (!thing) return set({ focus: null });
      set({ focus, selection: { pos: thing.pos, regionId: regionById(thing.regionId) ? thing.regionId : null } });
    },
    openBase(baseId, tab = "agents") {
      set({ baseScreen: { baseId, tab }, paused: true });
    },
    closeBase() {
      set({ baseScreen: null });
    },
    openDispatch(target) {
      set({ dispatch: target, paused: true });
    },
    closeDispatch() {
      set({ dispatch: null });
    },
    sendTeam(plan) {
      const g = get().game;
      if (!g) return false;
      const err = dispatchSim(g, plan);
      if (err) {
        get().notify(err, "bad");
        return false;
      }
      const m = g.missions.at(-1)!;
      get().notify(`${g.aircraft.find((a) => a.id === m.aircraftId)?.name} is on its way to ${m.city}.`, "good");
      set({ dispatch: null, focus: { kind: "mission", id: m.id } });
      touch();
      return true;
    },
    decide(missionId, optionId) {
      const g = get().game;
      if (!g) return;
      const err = decideSim(g, missionId, optionId);
      if (err) get().notify(err, "bad");
      touch();
    },
    command(fn, ok) {
      const g = get().game;
      if (!g) return false;
      const err = fn(g);
      if (err) get().notify(err, "bad");
      else if (ok) get().notify(ok, "good");
      touch();
      return !err;
    },
    selectRegion(regionId, pos) {
      set({ selection: { pos, regionId } });
    },
    hover(regionIndex) {
      set({ hoverRegion: regionByIndex(regionIndex)?.id ?? null });
    },
    dismissEvent() {
      const { game } = get();
      if (!game) return;
      dismissSim(game);
      touch();
    },
    build(kind) {
      const { game, selection } = get();
      if (!game || !selection?.regionId) return;
      const err = buildSim(game, kind, selection.regionId, selection.pos);
      if (err) get().notify(err, "bad");
      else get().notify(`Construction started: ${game.installations.at(-1)!.name}`, "good");
      touch();
    },
    save(slot) {
      const { game } = get();
      if (!game) return;
      const err = saveToSlot(game, slot);
      get().notify(err ?? (slot === "auto" ? "Autosaved." : `Saved to slot ${slot}.`), err ? "bad" : "good");
    },
    toggleSupportView() {
      set({ supportView: !get().supportView });
    },
    notify(text, tone = "good") {
      const id = Date.now();
      set({ toast: { text, tone, id } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 3500);
    },
    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      saveSettings(settings);
      set({ settings });
    },
  };
});

/** Re-render on every game change and return the (mutable) game state. */
export function useGame(): GameState {
  useStore((s) => s.rev);
  return useStore.getState().game!;
}
