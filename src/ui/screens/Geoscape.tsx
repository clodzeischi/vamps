import { useEffect, useMemo, useState } from "react";
import { difficulty } from "../../data/difficulty";
import { ACT_NAMES } from "../../sim/campaign/story";
import { objectives } from "../../sim/campaign/objectives";
import { ObjectivesText } from "../components/Objectives";
import { TimeControl } from "../components/TimeControl";
import { Meter } from "../components/Panel";
import { money } from "../format";
import { actionFor, bindingsOf, keyLabel, TAB_KEYS } from "../keys";
import { globe } from "../globe";
import { useGame, useStore } from "../store";
import { CONTROL_TABS, controlAttention, isControlTab } from "../control";
import { OVERLAYS, overlayDef, type MapOverlay } from "../overlays";
import { ControlScreen } from "./geoscape/ControlScreen";
import { EventModal } from "./geoscape/EventModal";
import { PauseMenu } from "./geoscape/PauseMenu";
import { RegionPanel } from "./geoscape/RegionPanel";
import { BaseScreen } from "./geoscape/base/BaseScreen";
import { DispatchScreen } from "./geoscape/DispatchScreen";
import { BuildDialog, OrderBanner, PlacementBanner } from "./geoscape/BuildDialog";
import { FocusPanel } from "./geoscape/focus/FocusPanel";
import { LeadsPanel } from "./geoscape/focus/LeadsPanel";
import { UnderWayPanel } from "./geoscape/UnderWay";
import { FloatingLog } from "../components/FloatingLog";
import { formatDate } from "../../sim/core/time";
import { HoverLabel } from "./geoscape/SidePanels";

export function Geoscape() {
  const g = useGame();
  const { focus, overlay, dispatch, buildDraft, advance } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = () => {
    useStore.setState({ paused: true });
    setMenuOpen(true);
  };
  const blocked = g.events.length > 0 || !!g.gameOver;
  useGameClock(advance);
  useOpenOnHomeBase();
  useGeoscapeKeys(menuOpen, setMenuOpen);
  // Screens over the globe wait while an event is up.
  const free = !g.events.length;

  return (
    <div className="screen geoscape">
      <TopBar openMenu={openMenu} />
      <OverlayLegend />
      <div className="hud-objectives">
        <ObjectivesText
          title={ACT_NAMES[g.story.act]}
          conditions={difficulty(g.difficulty).name}
          lines={objectives(g)}
        />
      </div>
      <aside className="hud-side">
        {focus ? <FocusPanel /> : <RegionPanel />}
        <LeadsPanel />
      </aside>
      <TimeControl blocked={blocked} />
      <UnderWayPanel />
      <div className="hud-log">
        <FloatingLog
          lines={g.log.map((l) => ({ head: formatDate(l.time), text: l.text, tone: l.tone }))}
        />
      </div>
      <HoverLabel />
      <PlacementBanner />
      <OrderBanner />
      {overlay?.kind === "base" && free && <BaseScreen />}
      {overlay && isControlTab(overlay.kind) && free && <ControlScreen tab={overlay.kind} />}
      {buildDraft && free && <BuildDialog key={`${buildDraft.pos.lat},${buildDraft.pos.lon}`} />}
      {dispatch && free && <DispatchScreen />}
      <EventModal />
      {menuOpen && <PauseMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

/** The game clock: advances with real time while running, and turns the globe's day and night. */
function useGameClock(advance: (seconds: number) => void) {
  useEffect(() => {
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      advance(Math.min(0.25, (now - last) / 1000));
      last = now;
      const game = useStore.getState().game;
      if (game) globe()?.setTime(game.time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance]);
}

/** The globe opens on the home base. */
function useOpenOnHomeBase() {
  useEffect(() => {
    const home = useStore.getState().game?.installations.find((i) => i.kind === "base");
    const t = setTimeout(() => home && globe()?.flyTo(home.pos, 2.8), 300);
    return () => clearTimeout(t);
  }, []);
}

/** The geoscape's key bindings, as the main menu's Settings set them. */
function useBindings() {
  const savedKeys = useStore((s) => s.settings.keys);
  return useMemo(() => bindingsOf(savedKeys), [savedKeys]);
}

/** Esc closes what's open, innermost first; with nothing open, it opens the menu. */
function escape(menuOpen: boolean, setMenuOpen: (f: (open: boolean) => boolean) => void) {
  const st = useStore.getState();
  if (st.placing || st.buildDraft) return st.cancelPlacing();
  if (st.ordering) return st.cancelOrder();
  if (st.dispatch) return st.closeDispatch();
  if (st.overlay) return st.closeOverlay();
  if (st.focus && !menuOpen) return st.focusOn(null);
  useStore.setState({ paused: true });
  setMenuOpen((open) => !open);
}

/**
 * Keys (ui/keys.ts, rebound in the main menu's Settings). Esc is fixed: it
 * closes what's open. 1–7 open Control's tabs, from the globe or inside it
 * (the open tab's own number closes it); the rest work on the globe only.
 */
function useGeoscapeKeys(menuOpen: boolean, setMenuOpen: (f: (open: boolean) => boolean) => void) {
  const keys = useBindings();
  const { togglePause, stepSpeed, setMapOverlay, openControl } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") return escape(menuOpen, setMenuOpen);
      const st = useStore.getState();
      // An event on screen has the keyboard (Space or Enter presses its button).
      if (menuOpen || st.dispatch || st.buildDraft || st.game?.events.length) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const id = actionFor(keys, e.code, "geo");
      if (!id) return;
      const tab = TAB_KEYS.indexOf(id);
      if (tab >= 0) {
        const t = CONTROL_TABS[tab]!.id;
        return st.overlay?.kind === t ? st.closeOverlay() : openControl(t);
      }
      if (st.overlay) return;
      if (id === "geoPause") {
        e.preventDefault();
        togglePause();
      } else if (id === "geoFaster") stepSpeed(1);
      else if (id === "geoSlower") stepSpeed(-1);
      else if (id === "geoOverlay") {
        const at = OVERLAYS.findIndex((o) => o.id === st.mapOverlay);
        setMapOverlay(OVERLAYS[(at + 1) % OVERLAYS.length]!.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, stepSpeed, setMapOverlay, openControl, menuOpen, setMenuOpen, keys]);
}

const secrecyTone = (secrecy: number) => (secrecy >= 60 ? "good" : secrecy >= 30 ? "warn" : "bad");

/** The bar along the top: funds, secrecy, Control, the map overlay, the menu. */
function TopBar({ openMenu }: { openMenu: () => void }) {
  const g = useGame();
  const { overlay, mapOverlay, setMapOverlay, openControl } = useStore();
  const keys = useBindings();
  const attention = controlAttention(g);
  const secrecy = Math.round(g.secrecy);
  const tone = g.openWar ? "bad" : secrecyTone(secrecy);
  const tabKeys = CONTROL_TABS.map((t) => keyLabel(keys[t.key])).join(", ");
  return (
    <header className="hud-block hud-top">
      <div className="stat">
        <span className="stat-label">Funds</span>
        <span className={`stat-value${g.funds < 0 ? " tone-bad-text" : ""}`}>{money(g.funds)}</span>
      </div>
      <div className="stat">
        <span className="stat-label">{g.openWar ? "Open war" : "Secrecy"}</span>
        {!g.openWar && <Meter value={g.secrecy} tone={tone} />}
        {!g.openWar && <span className={`stat-value tone-${tone}-text`}>{secrecy}</span>}
      </div>
      <button
        className={`hud-control${overlay && isControlTab(overlay.kind) ? " on" : ""}`}
        onClick={() => openControl()}
        title={`Bases, operations, research, intelligence, covert, the dark web and the ledger (${tabKeys})`}
      >
        Control
        {attention > 0 && (
          <span
            className="hud-control-count"
            title={`${attention} tab${attention === 1 ? "" : "s"} want attention`}
          >
            {attention}
          </span>
        )}
      </button>
      <label
        className="hud-overlay"
        title={`Map overlay: colours the regions (${keyLabel(keys.geoOverlay)} for the next)`}
      >
        <span className="stat-label">Overlay</span>
        <select
          className="mm-select"
          value={mapOverlay}
          onChange={(e) => setMapOverlay(e.target.value as MapOverlay)}
        >
          {OVERLAYS.map((o) => (
            <option key={o.id} value={o.id} title={o.tip}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="mini hud-menu"
        onClick={openMenu}
        title="Save, load, settings, quit to the main menu (Esc)"
      >
        ☰ Menu
      </button>
    </header>
  );
}

/** The key to the map overlay's colours, when it has one. */
function OverlayLegend() {
  const shown = overlayDef(useStore((s) => s.mapOverlay));
  if (!shown.key.length) return null;
  return (
    <div className="hud-legend" aria-label={`${shown.label} overlay`}>
      <span className="hud-legend-title" title={shown.tip}>
        {shown.label}
      </span>
      {shown.key.map((k) => (
        <span key={k.text} className="hud-legend-item">
          <i style={{ background: `rgb(${k.color.map((c) => Math.round(c * 255)).join(",")})` }} />
          {k.text}
        </span>
      ))}
    </div>
  );
}
