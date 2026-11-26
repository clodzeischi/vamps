// UI store. The campaign (GameState) is mutated in place by sim/ functions;
// `rev` is bumped after every change so subscribed components re-render.
import type { ControlTab } from "./control";
import type { MapOverlay } from "./overlays";
import { craftById, installationById, leadById, missionById, siteById } from "../sim/state";
import { redirectFerry } from "../sim/transfers";
import { create } from "zustand";
import type { Battle } from "../tactical/battle";
import { battleForMission, battleOutcome } from "../tactical/campaign";
import { packBattle, unpackBattle } from "../tactical/save";
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
import type { ItemId } from "../data/equipment";
import type { Order } from "../sim/market";
import type { LatLon } from "../sim/time";
import { loadSettings, saveSettings, type Settings } from "./settings";

type ScreenId = "menu" | "geoscape" | "skirmish" | "battle";

/** Most of one item a cart holds. */
export const CART_MAX = 99;
const emptyCart = (): Order => ({ items: {}, info: [] });

/** While the clock runs, how often the screens catch up with it (real ms). */
const REFRESH_MS = 100;
let refreshedAt = 0;

/** The clock's intervals: game time that passes in a real second. */
export const SPEEDS = [
  { label: "10MIN", long: "10 minutes", gameSecondsPerSecond: 600 },
  { label: "1H", long: "1 hour", gameSecondsPerSecond: 3600 },
  { label: "6H", long: "6 hours", gameSecondsPerSecond: 6 * 3600 },
  { label: "1D", long: "1 day", gameSecondsPerSecond: 24 * 3600 },
] as const;

interface Selection {
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
    case "lead": return leadById(g, f.id) ?? null;
    case "site": return siteById(g, f.id) ?? null;
    case "installation": return installationById(g, f.id) ?? null;
    case "coverup": return g.coverUps.find((c) => c.id === f.id) ?? null;
    case "mission": {
      const m = missionById(g, f.id);
      return m ? { pos: m.pos, regionId: m.regionId } : null;
    }
    case "aircraft": {
      const a = craftById(g, f.id);
      const m = a && g.missions.find((x) => x.aircraftId === a.id || x.escorts?.includes(a.id));
      if (m) return { pos: m.pos, regionId: m.regionId };
      const b = a && installationById(g, a.baseId);
      return b ? { pos: b.pos, regionId: b.regionId } : null;
    }
  }
}
/** Back to the globe from a base screen (any other screen stays). */
const leaveBase = (o: Overlay | null) => (o?.kind === "base" ? null : o);

/** A new installation placed on the globe, waiting for a name and confirmation. */
interface BuildDraft {
  kind: InstallationKind;
  regionId: string;
  pos: LatLon;
  name: string;
}

/** Where in a base the player is: its overview, or one facility (and maybe one thing in it). */
export type BaseView = "overview" | "personnel" | "hiring" | "hangars" | "labs" | "workshops" | "containment" | "stores" | "armoury" | "construction";

/** A full screen over the globe; one at a time. A base opens at a facility (and maybe one thing in it). */
type Overlay =
  | { kind: "base"; baseId: string; view: BaseView; item?: string }
  | { kind: ControlTab };
export type OverlayKind = Overlay["kind"];

interface Store {
  screen: ScreenId;
  /** The main menu tab to show (quitting a skirmish lands on Skirmish). */
  menuTab: "new" | "load" | "skirmish" | "settings" | "credits";
  /** A new seed every time a skirmish starts (its setup is settings.skirmish). */
  skirmishSeed: number;
  game: GameState | null;
  rev: number;
  speed: number;
  paused: boolean;
  selection: Selection | null;
  focus: Focus | null;
  /** The screen open over the globe: a base, the operations dashboard (every agent, aircraft and job),
   *  research, intelligence, covert actions, the dark web or the books. */
  overlay: Overlay | null;
  /** Control's tab last open: the Control button opens on it. */
  lastControl: ControlTab;
  /** Research and engineering: the tab, and the project shown. */
  researchTab: "research" | "engineering";
  researchItem: string | null;
  /** The intelligence screen's tab: the section (analysts, Find, Fix, leads) or the houses (the climb, lairs, the fallen sigils). */
  bloodlinesTab: "section" | "houses";
  /** The dark web's tab, and the cart (kept while the screen is closed; not saved). */
  marketTab: "buy" | "sell";
  cart: Order;
  /** The Order's books (Details, from Funds and Secrecy): which tab opens first. */
  detailsTab: "funds" | "support" | "secrecy";
  /** The team builder, open for a lead or site. */
  dispatch: DispatchPlan["target"] | null;
  hoverRegion: string | null;
  /** Choosing where to build: the next globe click places it. */
  placing: InstallationKind | null;
  /** The message log, expanded; and the game time it was last read up to. */
  buildDraft: BuildDraft | null;
  /** The map overlay colouring the regions (ui/overlays.ts). */
  mapOverlay: MapOverlay;
  settings: Settings;
  toast: { text: string; tone: "good" | "bad"; id: number } | null;

  startNew(d: DifficultyId): void;
  loadGame(g: GameState): void;
  quitToMenu(): void;
  /** To the main menu without saving: the screen crashed, and the campaign may be why. */
  abandon(): void;
  /** Picks an interval and starts the clock. */
  setSpeed(i: number): void;
  /** The next interval up or down; a paused clock stays paused. */
  stepSpeed(by: 1 | -1): void;
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
  /** Closes whichever screen is open over the globe. */
  closeOverlay(): void;
  openResearch(tab?: "research" | "engineering", item?: string): void;
  showResearchItem(id: string | null): void;
  openBloodlines(tab?: "section" | "houses"): void;
  /** Opens the dark web; with a base, on the Buy tab shipping there. */
  openMarket(shipTo?: string): void;
  setMarketTab(tab: "buy" | "sell"): void;
  /** Sets how many of an item are in the cart (0 takes it out). */
  setCartItem(item: ItemId, n: number): void;
  /** Puts research data in the cart, or takes it out. */
  toggleCartInfo(id: string): void;
  setCartBase(baseId: string): void;
  clearCart(): void;
  openDetails(tab?: "funds" | "support" | "secrecy"): void;
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
  startPlacing(kind: InstallationKind): void;
  cancelPlacing(): void;
  confirmBuild(name: string): void;
  save(slot: SlotId): void;
  setMapOverlay(id: MapOverlay): void;
  /** Opens Control on a tab (or the last one used). */
  openControl(tab?: ControlTab): void;
  notify(text: string, tone?: "good" | "bad"): void;
  updateSettings(patch: Partial<Settings>): void;
  /** The tactical test ground. */
  openSkirmish(): void;
  /** A mission's battle under the player's command (tactical/campaign.ts). */
  battle: { missionId: string; battle: Battle; title: string; /** Told apart from an earlier load of the same battle. */ key: number } | null;
  /** Take command of a mission's fight: the one under way if the save has it, else a new one. */
  commandBattle(missionId: string): void;
  /** Saves the battle under way into the campaign, and the campaign to the autosave slot. */
  saveBattle(): string | null;
  autoResolve(missionId: string): void;
  /** The battle is over: back to the geoscape, and the mission carries on. */
  endBattle(): void;
}

/** Counts the battles opened, so loading one again starts its screen afresh. */
let battleKey = 0;

export const useStore = create<Store>((set, get) => {
  const touch = () => set({ rev: get().rev + 1 });

  return {
    screen: "menu",
    menuTab: "new",
    skirmishSeed: 0,
    game: null,
    rev: 0,
    speed: 0,
    paused: true,
    selection: null,
    focus: null,
    overlay: null,
    lastControl: "installations",
    researchTab: "research",
    researchItem: null,
    bloodlinesTab: "section",
    marketTab: "buy",
    cart: emptyCart(),
    detailsTab: "funds",
    dispatch: null,
    hoverRegion: null,
    placing: null,
    ordering: null,
    dispatchCraft: null,
    ferryTo: null,
    buildDraft: null,
    mapOverlay: "none",
    settings: loadSettings(),
    toast: null,

    startNew(d) {
      const seed = (Math.random() * 2 ** 31) | 0;
      get().loadGame(newCampaign(d, seed));
    },
    loadGame(game) {
      set({ game, battle: null, screen: "geoscape", paused: true, speed: 0, selection: null, focus: null, overlay: null, cart: emptyCart(), dispatch: null, hoverRegion: null, placing: null, buildDraft: null, ordering: null, ferryTo: null, dispatchCraft: null, rev: get().rev + 1 });
      // A save made mid-battle goes straight back into the battle.
      const fighting = game.missions.find((m) => m.battle?.live);
      if (fighting) get().commandBattle(fighting.id);
    },
    openSkirmish() {
      set({ screen: "skirmish", paused: true, skirmishSeed: Math.floor(Math.random() * 1e6) });
    },
    battle: null,
    commandBattle(missionId) {
      const g = get().game;
      const m = g?.missions.find((x) => x.id === missionId);
      if (!g || !m?.battle) return;
      let resumed: { battle: Battle; title: string } | null = null;
      if (m.battle.live) {
        try {
          resumed = { battle: unpackBattle(m.battle.live.battle), title: m.battle.live.title };
        } catch {
          delete m.battle.live;
        }
      }
      const { battle, title } = resumed ?? battleForMission(g, m);
      set({ battle: { missionId, battle, title, key: (battleKey += 1) }, screen: "battle", paused: true, focus: null, selection: null });
      if (!resumed) get().saveBattle();
    },
    saveBattle() {
      const { game, battle } = get();
      const m = battle && game?.missions.find((x) => x.id === battle.missionId);
      if (!game || !battle || !m?.battle) return null;
      m.battle.live = { title: battle.title, battle: packBattle(battle.battle) };
      return saveToSlot(game, "auto");
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
        // The autosave mustn't keep the battle that's just been settled.
        else if (!game.gameOver) saveToSlot(game, "auto");
      }
      set({ battle: null, screen: game ? "geoscape" : "menu", paused: true, rev: get().rev + 1 });
    },
    quitToMenu() {
      // A battle under way is saved with the campaign; loading it goes back in.
      if (get().screen === "battle") {
        get().saveBattle();
        set({ battle: null });
      }
      const { game } = get();
      if (game && !game.gameOver) saveToSlot(game, "auto");
      set({ menuTab: get().screen === "skirmish" ? "skirmish" : "new", screen: "menu", paused: true, selection: null, focus: null, overlay: null,  dispatch: null, hoverRegion: null, placing: null, buildDraft: null, ordering: null, ferryTo: null, dispatchCraft: null });
    },
    abandon() {
      set({ game: null, battle: null, menuTab: "new", screen: "menu", paused: true, selection: null, focus: null, overlay: null, dispatch: null, hoverRegion: null, placing: null, buildDraft: null, ordering: null, ferryTo: null, dispatchCraft: null });
    },
    stepSpeed(by) {
      set({ speed: Math.max(0, Math.min(SPEEDS.length - 1, get().speed + by)) });
    },
    setSpeed(i) {
      set({ speed: Math.max(0, Math.min(SPEEDS.length - 1, i)), paused: false });
    },
    togglePause() {
      set({ paused: !get().paused, rev: get().rev + 1 });
    },
    advance(realSeconds) {
      const { game, paused, speed } = get();
      if (!game || paused || game.events.length || game.gameOver) return;
      const monthBefore = game.monthIndex;
      const done = advanceSim(game, realSeconds * SPEEDS[speed]!.gameSecondsPerSecond * 1000);
      if (game.monthIndex !== monthBefore) saveToSlot(game, "auto");
      // The globe follows the clock every frame (Geoscape); the screens re-render at most every REFRESH_MS, or at once on an event.
      const now = performance.now();
      if (game.events.length || game.gameOver || (done > 0 && now - refreshedAt >= REFRESH_MS)) {
        refreshedAt = now;
        touch();
      }
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
      set({ overlay: { kind: "base", baseId, view, ...(item ? { item } : {}) }, paused: true });
    },
    openOperations() {
      set({ overlay: { kind: "operations" }, lastControl: "operations", paused: true });
    },
    closeOverlay() {
      set({ overlay: null });
    },
    showResearchItem(id) {
      set({ researchItem: id });
    },
    openResearch(tab, item) {
      set({ researchTab: tab ?? get().researchTab, researchItem: item ?? (tab && tab !== get().researchTab ? null : get().researchItem), overlay: { kind: "research" }, lastControl: "research", paused: true });
    },
    openBloodlines(tab) {
      set({ bloodlinesTab: tab ?? get().bloodlinesTab, overlay: { kind: "bloodlines" }, lastControl: "bloodlines", paused: true });
    },
    openMarket(shipTo) {
      set({
        overlay: { kind: "market" }, lastControl: "market", paused: true,
        ...(typeof shipTo === "string" ? { marketTab: "buy" as const, cart: { ...get().cart, baseId: shipTo } } : {}),
      });
    },
    setMarketTab(tab) {
      set({ marketTab: tab });
    },
    setCartItem(item, n) {
      const items = { ...get().cart.items };
      if (n > 0) items[item] = Math.min(CART_MAX, Math.floor(n));
      else delete items[item];
      set({ cart: { ...get().cart, items } });
    },
    toggleCartInfo(id) {
      const info = get().cart.info;
      set({ cart: { ...get().cart, info: info.includes(id) ? info.filter((x) => x !== id) : [...info, id] } });
    },
    setCartBase(baseId) {
      set({ cart: { ...get().cart, baseId } });
    },
    clearCart() {
      set({ cart: { ...emptyCart(), baseId: get().cart.baseId } });
    },
    openDetails(tab) {
      set({ detailsTab: tab ?? get().detailsTab, overlay: { kind: "details" }, lastControl: "details", paused: true });
    },
    openDispatch(target, aircraftId) {
      set({ dispatch: target, dispatchCraft: aircraftId ?? null, paused: true, ordering: null });
    },
    startOrder(aircraftId) {
      set({ ordering: aircraftId, placing: null, buildDraft: null, overlay: leaveBase(get().overlay), paused: true });
    },
    cancelOrder() {
      set({ ordering: null });
    },
    orderTo(markerId) {
      const { game, ordering } = get();
      if (!game || !ordering) return false;
      const f = focusFor(game, markerId);
      const craft = craftById(game, ordering);
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
    startPlacing(kind) {
      set({ placing: kind, buildDraft: null, paused: true, dispatch: null, overlay: null });
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
      get().saveBattle(); // a battle under way goes with it
      const err = saveToSlot(game, slot);
      get().notify(err ?? (slot === "auto" ? "Autosaved." : `Saved to slot ${slot}.`), err ? "bad" : "good");
    },
    openControl(tab) {
      const t = tab ?? get().lastControl;
      set({ overlay: { kind: t }, lastControl: t, paused: true });
    },
    setMapOverlay(id) {
      set({ mapOverlay: id });
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
