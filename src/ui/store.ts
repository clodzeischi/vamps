// UI store. The campaign (GameState) is mutated in place by sim/ functions;
// `rev` is bumped after every change so subscribed components re-render.
import { redirectFerry } from "../sim/transfers";
import { create } from "zustand";
import type { Battle } from "../tactical/battle";
import { battleForMission, battleOutcome } from "../tactical/campaign";
import type { DifficultyId } from "../data/difficulty";
import type { InstallationKind } from "../data/installations";
import { regionByIndex } from "../data/regions";
import { saveToSlot, type SlotId } from "../save/storage";
import { newCampaign } from "../sim/campaign";
import { advance as advanceSim, dismissEvent as dismissSim } from "../sim/clock";
import { build as buildSim, buildBlocker, suggestName } from "../sim/commands";
import { autoResolveBattle, missionCraftName, decide as decideSim, dispatch as dispatchSim, finishBattle, tactical, type DispatchPlan } from "../sim/missions";

// In the game, fights wait for the player (tests and the batch simulator auto-resolve).
tactical.on = true;
import { regionById } from "../data/regions";
import type { GameState } from "../sim/state";
import type { LatLon } from "../sim/time";
import { loadSettings, saveSettings, type Settings } from "./settings";

export type ScreenId = "menu" | "geoscape" | "skirmish" | "battle";

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
export type Focus = { kind: "lead" | "installation" | "site" | "mission" | "coverup" | "aircraft"; id: string };

/** Which kind of thing an id belongs to, if it still exists. */
export function focusFor(g: GameState, id: string): Focus | null {
  if (g.leads.some((l) => l.id === id)) return { kind: "lead", id };
  if (g.sites.some((x) => x.id === id)) return { kind: "site", id };
  if (g.missions.some((m) => m.id === id)) return { kind: "mission", id };
  if (g.installations.some((i) => i.id === id)) return { kind: "installation", id };
  if (g.coverUps.some((c) => c.id === id)) return { kind: "coverup", id };
  if (g.aircraft.some((a) => a.id === id)) return { kind: "aircraft", id };
  return null;
}

function focusPos(g: GameState, f: Focus): { pos: LatLon; regionId: string } | null {
  switch (f.kind) {
    case "lead": return g.leads.find((l) => l.id === f.id) ?? null;
    case "site": return g.sites.find((x) => x.id === f.id) ?? null;
    case "installation": return g.installations.find((i) => i.id === f.id) ?? null;
    case "coverup": return g.coverUps.find((c) => c.id === f.id) ?? null;
    case "mission": {
      const m = g.missions.find((x) => x.id === f.id);
      return m ? { pos: m.pos, regionId: m.regionId } : null;
    }
    case "aircraft": {
      const a = g.aircraft.find((x) => x.id === f.id);
      const m = a && g.missions.find((x) => x.aircraftId === a.id || x.escorts?.includes(a.id));
      if (m) return { pos: m.pos, regionId: m.regionId };
      const b = a && g.installations.find((i) => i.id === a.baseId);
      return b ? { pos: b.pos, regionId: b.regionId } : null;
    }
  }
}
/** A new installation placed on the globe, waiting for a name and confirmation. */
export interface BuildDraft {
  kind: InstallationKind;
  regionId: string;
  pos: LatLon;
  name: string;
}

/** Where in a base the player is: its overview, or one facility (and maybe one thing in it). */
export type BaseView = "overview" | "personnel" | "hiring" | "hangars" | "labs" | "workshops" | "containment" | "stores" | "armoury" | "construction";

interface Store {
  screen: ScreenId;
  game: GameState | null;
  rev: number;
  speed: number;
  paused: boolean;
  selection: Selection | null;
  focus: Focus | null;
  baseScreen: { baseId: string; view: BaseView; item?: string } | null;
  /** The operations dashboard: every agent, aircraft and job, by status. */
  operationsOpen: boolean;
  /** The research and engineering screen, its tab, and the project shown. */
  researchOpen: boolean;
  researchTab: "research" | "engineering";
  researchItem: string | null;
  /** The bloodlines screen: intel, lairs, the fallen sigils. */
  bloodlinesOpen: boolean;
  covertOpen: boolean;
  /** The black market. */
  marketOpen: boolean;
  /** The Order's books (Details, from Funds and Secrecy): which tab opens first. */
  detailsOpen: boolean;
  detailsTab: "funds" | "support" | "secrecy";
  /** The team builder, open for a lead or site. */
  dispatch: DispatchPlan["target"] | null;
  hoverRegion: string | null;
  /** Choosing where to build: the next globe click places it. */
  placing: InstallationKind | null;
  /** The message log, expanded; and the game time it was last read up to. */
  logOpen: boolean;
  logSeenAt: number;
  buildDraft: BuildDraft | null;
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
  /** Opens a base at a facility, and optionally one agent or aircraft in it. */
  openBase(baseId: string, view?: BaseView, item?: string): void;
  openOperations(): void;
  closeOperations(): void;
  closeBase(): void;
  openResearch(tab?: "research" | "engineering", item?: string): void;
  showResearchItem(id: string | null): void;
  closeResearch(): void;
  openBloodlines(): void;
  closeBloodlines(): void;
  openCovert(): void;
  closeCovert(): void;
  openMarket(): void;
  closeMarket(): void;
  openDetails(tab?: "funds" | "support" | "secrecy"): void;
  closeDetails(): void;
  /** Plans a mission; `aircraftId` (from an aircraft's "Fly to") is chosen first. */
  openDispatch(target: DispatchPlan["target"], aircraftId?: string): void;
  closeDispatch(): void;
  /** Phoenix Point style orders: an aircraft waiting for the player to click its destination on the globe. */
  ordering: string | null;
  /** The aircraft the dispatch screen should start with. */
  dispatchCraft: string | null;
  /** A base picked as an aircraft's destination, for its transfer panel. */
  ferryTo: { aircraftId: string; baseId: string } | null;
  startOrder(aircraftId: string): void;
  cancelOrder(): void;
  /** A marker clicked while ordering: a base (ferry), a lead or site (mission). Returns whether it was taken. */
  orderTo(markerId: string): boolean;
  /** Sends a team; returns whether it went. */
  sendTeam(plan: DispatchPlan): boolean;
  /** Orders for a team waiting on the ground. */
  decide(missionId: string, optionId: string): void;
  /** Runs a sim command; shows its error, or `ok` on success. */
  command(fn: (g: GameState) => string | null, ok?: string): boolean;
  setLogOpen(open: boolean): void;
  startPlacing(kind: InstallationKind): void;
  cancelPlacing(): void;
  confirmBuild(name: string): void;
  save(slot: SlotId): void;
  toggleSupportView(): void;
  notify(text: string, tone?: "good" | "bad"): void;
  updateSettings(patch: Partial<Settings>): void;
  /** The tactical test ground. */
  openSkirmish(): void;
  /** A mission's battle under the player's command (tactical/campaign.ts). */
  battle: { missionId: string; battle: Battle; title: string } | null;
  commandBattle(missionId: string): void;
  autoResolve(missionId: string): void;
  /** The battle is over: back to the geoscape, and the mission carries on. */
  endBattle(): void;
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
    operationsOpen: false,
    researchOpen: false,
    researchTab: "research",
    researchItem: null,
    bloodlinesOpen: false,
    covertOpen: false,
    marketOpen: false,
    detailsOpen: false,
    detailsTab: "funds",
    dispatch: null,
    hoverRegion: null,
    placing: null,
    ordering: null,
    dispatchCraft: null,
    ferryTo: null,
    buildDraft: null,
    logOpen: false,
    logSeenAt: 0,
    supportView: false,
    settings: loadSettings(),
    toast: null,

    startNew(d) {
      const seed = (Math.random() * 2 ** 31) | 0;
      get().loadGame(newCampaign(d, seed));
    },
    loadGame(game) {
      set({ logOpen: false, logSeenAt: game.time, game, screen: "geoscape", paused: true, speed: 1, selection: null, focus: null, baseScreen: null, operationsOpen: false, researchOpen: false, bloodlinesOpen: false, covertOpen: false, marketOpen: false, detailsOpen: false, dispatch: null, hoverRegion: null, placing: null, buildDraft: null, ordering: null, ferryTo: null, dispatchCraft: null, rev: get().rev + 1 });
    },
    openSkirmish() {
      set({ screen: "skirmish", paused: true });
    },
    battle: null,
    commandBattle(missionId) {
      const g = get().game;
      const m = g?.missions.find((x) => x.id === missionId);
      if (!g || !m?.battle) return;
      const { battle, title } = battleForMission(g, m);
      set({ battle: { missionId, battle, title }, screen: "battle", paused: true, focus: null, selection: null });
    },
    autoResolve(missionId) {
      const g = get().game;
      if (!g) return;
      const err = autoResolveBattle(g, missionId);
      if (err) get().notify(err, "bad");
      touch();
    },
    endBattle() {
      const { game, battle } = get();
      if (game && battle) {
        const err = finishBattle(game, battle.missionId, battleOutcome(battle.battle));
        if (err) get().notify(err, "bad");
      }
      set({ battle: null, screen: game ? "geoscape" : "menu", paused: true, rev: get().rev + 1 });
    },
    quitToMenu() {
      if (get().screen === "battle") set({ battle: null });
      const { game } = get();
      if (game && !game.gameOver) saveToSlot(game, "auto");
      set({ screen: "menu", paused: true, selection: null, focus: null, baseScreen: null, operationsOpen: false, researchOpen: false, bloodlinesOpen: false, covertOpen: false, marketOpen: false, detailsOpen: false, dispatch: null, hoverRegion: null, placing: null, buildDraft: null, ordering: null, ferryTo: null, dispatchCraft: null });
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
      const { game, placing } = get();
      if (game && placing) {
        const regionId = regionByIndex(regionIndex)?.id ?? null;
        if (!regionId) return get().notify("Open water: there's nowhere to build there.", "bad");
        const why = buildBlocker(game, placing, regionId);
        if (why) return get().notify(why, "bad");
        set({
          placing: null,
          buildDraft: { kind: placing, regionId, pos, name: suggestName(game, placing, regionId, pos) },
          selection: { pos, regionId },
          focus: null,
        });
        return;
      }
      set({ selection: { pos, regionId: regionByIndex(regionIndex)?.id ?? null }, focus: null });
    },
    focusOn(focus) {
      const g = get().game;
      if (!g || !focus) return set({ focus: null });
      const thing = focusPos(g, focus);
      if (!thing) return set({ focus: null });
      set({ focus, selection: { pos: thing.pos, regionId: regionById(thing.regionId) ? thing.regionId : null } });
    },
    openBase(baseId, view = "overview", item) {
      set({ baseScreen: { baseId, view, ...(item ? { item } : {}) }, operationsOpen: false, researchOpen: false, bloodlinesOpen: false, covertOpen: false, marketOpen: false, detailsOpen: false, paused: true });
    },
    openOperations() {
      set({ operationsOpen: true, baseScreen: null, researchOpen: false, bloodlinesOpen: false, covertOpen: false, marketOpen: false, detailsOpen: false, paused: true });
    },
    closeOperations() {
      set({ operationsOpen: false });
    },
    closeBase() {
      set({ baseScreen: null });
    },
    showResearchItem(id) {
      set({ researchItem: id });
    },
    openResearch(tab, item) {
      set({ researchTab: tab ?? get().researchTab, researchItem: item ?? (tab && tab !== get().researchTab ? null : get().researchItem), researchOpen: true, bloodlinesOpen: false, covertOpen: false, marketOpen: false, detailsOpen: false, baseScreen: null, operationsOpen: false, paused: true });
    },
    openBloodlines() {
      set({ bloodlinesOpen: true, researchOpen: false, covertOpen: false, marketOpen: false, detailsOpen: false, baseScreen: null, operationsOpen: false, paused: true });
    },
    closeBloodlines() {
      set({ bloodlinesOpen: false });
    },
    openCovert() {
      set({ covertOpen: true, researchOpen: false, bloodlinesOpen: false, marketOpen: false, detailsOpen: false, baseScreen: null, operationsOpen: false, paused: true });
    },
    closeCovert() {
      set({ covertOpen: false });
    },
    openMarket() {
      set({ marketOpen: true, detailsOpen: false, covertOpen: false, researchOpen: false, bloodlinesOpen: false, baseScreen: null, operationsOpen: false, paused: true });
    },
    closeMarket() {
      set({ marketOpen: false });
    },
    openDetails(tab) {
      set({ detailsOpen: true, detailsTab: tab ?? get().detailsTab, marketOpen: false, covertOpen: false, researchOpen: false, bloodlinesOpen: false, baseScreen: null, operationsOpen: false, paused: true });
    },
    closeDetails() {
      set({ detailsOpen: false });
    },
    closeResearch() {
      set({ researchOpen: false });
    },
    openDispatch(target, aircraftId) {
      set({ dispatch: target, dispatchCraft: aircraftId ?? null, paused: true, ordering: null });
    },
    startOrder(aircraftId) {
      set({ ordering: aircraftId, placing: null, buildDraft: null, baseScreen: null, paused: true });
    },
    cancelOrder() {
      set({ ordering: null });
    },
    orderTo(markerId) {
      const { game, ordering } = get();
      if (!game || !ordering) return false;
      const f = focusFor(game, markerId);
      const craft = game.aircraft.find((a) => a.id === ordering);
      if (craft?.ferry) {
        // In the air on a transfer: only a change of course to another base.
        if (!game.installations.some((i) => i.id === markerId && i.kind === "base")) { get().notify("In the air: choose a base to divert to.", "bad"); return false; }
        set({ ordering: null });
        get().command((s) => redirectFerry(s, ordering, markerId), "Course changed.");
        return true;
      }
      if (f?.kind === "lead" || f?.kind === "site") {
        get().openDispatch({ kind: f.kind, id: f.id }, ordering);
        return true;
      }
      const base = game.installations.find((i) => i.id === markerId && i.kind === "base");
      if (base) {
        set({ ordering: null, ferryTo: { aircraftId: ordering, baseId: base.id } });
        get().focusOn({ kind: "aircraft", id: ordering });
        return true;
      }
      get().notify("Choose a base, a lead or a site.", "bad");
      return false;
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
      get().notify(`${missionCraftName(g, m)} is on its way to ${m.city}.`, "good");
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
    setLogOpen(open) {
      // Closing marks everything read; while open, new messages stay highlighted.
      set({ logOpen: open, ...(open ? {} : { logSeenAt: get().game?.time ?? 0 }) });
    },
    startPlacing(kind) {
      set({ placing: kind, buildDraft: null, paused: true, dispatch: null, baseScreen: null });
    },
    cancelPlacing() {
      set({ placing: null, buildDraft: null });
    },
    confirmBuild(name) {
      const { game, buildDraft } = get();
      if (!game || !buildDraft) return;
      const err = buildSim(game, buildDraft.kind, buildDraft.regionId, buildDraft.pos, name);
      if (err) return get().notify(err, "bad");
      const inst = game.installations.at(-1)!;
      get().notify(`Construction started: ${inst.name}`, "good");
      set({ buildDraft: null, focus: { kind: "installation", id: inst.id } });
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

// Dev builds: a handle for browser tests (drive the campaign without clicking through it).
if (import.meta.env.DEV) (window as unknown as { __vamps?: unknown }).__vamps = { useStore, advanceSim, dispatchSim, decideSim };
