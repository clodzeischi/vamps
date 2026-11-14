// UI-facing store. The campaign object here is a placeholder until the
// sim/ core (state, saves, AI) lands in step 3 of docs/WEB_PORT.md.
import { create } from "zustand";
import { difficulty, type DifficultyId } from "../data/difficulty";
import { PADUA } from "../data/places";
import { CAMPAIGN_START, type LatLon } from "../sim/time";
import { loadSettings, saveSettings, type Settings } from "./settings";

export type ScreenId = "menu" | "geoscape";

export interface Installation {
  id: string;
  kind: "base" | "sigint";
  name: string;
  pos: LatLon;
}

export interface Campaign {
  difficulty: DifficultyId;
  time: number; // UTC ms
  funds: number;
  secrecy: number; // 0..100
  installations: Installation[];
}

export const SPEEDS = [
  { label: "1 min/s", gameSecondsPerSecond: 60 },
  { label: "10 min/s", gameSecondsPerSecond: 600 },
  { label: "1 hr/s", gameSecondsPerSecond: 3600 },
  { label: "6 hr/s", gameSecondsPerSecond: 6 * 3600 },
  { label: "1 day/s", gameSecondsPerSecond: 24 * 3600 },
] as const;

interface Store {
  screen: ScreenId;
  campaign: Campaign | null;
  speed: number;
  paused: boolean;
  selection: LatLon | null;
  settings: Settings;

  newCampaign(d: DifficultyId): void;
  quitToMenu(): void;
  setSpeed(i: number): void;
  togglePause(): void;
  advance(realSeconds: number): void;
  select(p: LatLon | null): void;
  updateSettings(patch: Partial<Settings>): void;
}

export const useStore = create<Store>((set, get) => ({
  screen: "menu",
  campaign: null,
  speed: 1,
  paused: true,
  selection: null,
  settings: loadSettings(),

  newCampaign(d) {
    set({
      screen: "geoscape",
      paused: true,
      speed: 1,
      selection: null,
      campaign: {
        difficulty: d,
        time: CAMPAIGN_START,
        funds: difficulty(d).startFunds,
        secrecy: 80,
        installations: [{ id: "ob-padua", kind: "base", name: "Operational Base Padua", pos: PADUA }],
      },
    });
  },
  quitToMenu() {
    set({ screen: "menu", paused: true, selection: null });
  },
  setSpeed(i) {
    set({ speed: Math.max(0, Math.min(SPEEDS.length - 1, i)), paused: false });
  },
  togglePause() {
    set({ paused: !get().paused });
  },
  advance(realSeconds) {
    const { campaign, paused, speed } = get();
    if (!campaign || paused) return;
    const ms = realSeconds * SPEEDS[speed]!.gameSecondsPerSecond * 1000;
    set({ campaign: { ...campaign, time: campaign.time + ms } });
  },
  select(p) {
    set({ selection: p });
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    set({ settings });
  },
}));
