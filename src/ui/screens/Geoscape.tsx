import { useEffect, useMemo, useState } from "react";
import { difficulty } from "../../data/difficulty";
import { ACT_NAMES } from "../../sim/campaign/story";
import { objectives } from "../../sim/campaign/objectives";
import { ObjectivesText } from "../components/Objectives";
import { TimeControl } from "../components/TimeControl";
import { Meter } from "../components/Panel";
import { money } from "../format";
import { actionFor, bindingsOf, keyLabel, TAB_KEYS, type BindingId } from "../keys";
import { globe } from "../globe";
import { useGame, useStore } from "../store";
import { CONTROL_TABS, controlAttention, isControlTab } from "../control";
import { OVERLAYS, overlayDef, type MapOverlay } from "../overlays";
import { ControlScreen } from "./geoscape/ControlScreen";
import { EventModal } from "./geoscape/EventModal";
import { PauseMenu } from "./geoscape/PauseMenu";
import { RegionPanel } from "./geoscape/RegionPanel";
import { BaseScreen } from "./geoscape/BaseScreen";
import { DispatchScreen } from "./geoscape/DispatchScreen";
import { BuildDialog, OrderBanner, PlacementBanner } from "./geoscape/BuildDialog";
import { FocusPanel, LeadsPanel } from "./geoscape/FocusPanels";
import { UnderWayPanel } from "./geoscape/UnderWay";
import { FloatingLog } from "../components/FloatingLog";
import { formatDate } from "../../sim/core/time";
import { HoverLabel } from "./geoscape/SidePanels";

export function Geoscape() {
  const g = useGame();
  const { focus, overlay, dispatch, buildDraft, stepSpeed, togglePause, advance, mapOverlay, setMapOverlay, openControl } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const blocked = g.events.length > 0 || !!g.gameOver;

  // Game clock: advance with real time while running.
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

  // Open on the home base.
  useEffect(() => {
    const home = useStore.getState().game?.installations.find((i) => i.kind === "base");
    const t = setTimeout(() => home && globe()?.flyTo(home.pos, 2.8), 300);
    return () => clearTimeout(t);
  }, []);

  // Keys (ui/keys.ts, rebound in the main menu's Settings). Esc is fixed: it closes what's open.
  const savedKeys = useStore((s) => s.settings.keys);
  const keys = useMemo(() => bindingsOf(savedKeys), [savedKeys]);
  const keyOf = (id: BindingId) => keyLabel(keys[id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") {
        const st = useStore.getState();
        if (st.placing || st.buildDraft) return st.cancelPlacing();
        if (st.ordering) return st.cancelOrder();
        if (st.dispatch) return st.closeDispatch();
        if (st.overlay) return st.closeOverlay();
        if (st.focus && !menuOpen) return st.focusOn(null);
        useStore.setState({ paused: true });
        setMenuOpen((o) => !o);
        return;
      }
      const st = useStore.getState();
      // An event on screen has the keyboard (Space or Enter presses its button).
      if (menuOpen || st.dispatch || st.buildDraft || st.game?.events.length) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const id = actionFor(keys, e.code, "geo");
      if (!id) return;
      // 1–7: Control's tabs, from the globe or inside it; the open tab's own number closes it.
      const tab = TAB_KEYS.indexOf(id);
      if (tab >= 0) {
        const t = CONTROL_TABS[tab]!.id;
        return st.overlay?.kind === t ? st.closeOverlay() : openControl(t);
      }
      if (st.overlay) return;
      if (id === "geoPause") { e.preventDefault(); togglePause(); }
      else if (id === "geoFaster") stepSpeed(1);
      else if (id === "geoSlower") stepSpeed(-1);
      else if (id === "geoOverlay") {
        const at = OVERLAYS.findIndex((o) => o.id === st.mapOverlay);
        setMapOverlay(OVERLAYS[(at + 1) % OVERLAYS.length]!.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, stepSpeed, setMapOverlay, openControl, menuOpen, keys]);

  const showing = (k: string) => overlay?.kind === k;
  const attention = controlAttention(g);
  const shown = overlayDef(mapOverlay);
  const secrecy = Math.round(g.secrecy);
  const secrecyTone = g.openWar ? "bad" : secrecy >= 60 ? "good" : secrecy >= 30 ? "warn" : "bad";

  return (
    <div className="screen geoscape">
      <header className="hud-block hud-top">
        <div className="stat">
          <span className="stat-label">Funds</span>
          <span className={`stat-value${g.funds < 0 ? " tone-bad-text" : ""}`}>{money(g.funds)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{g.openWar ? "Open war" : "Secrecy"}</span>
          {!g.openWar && <Meter value={g.secrecy} tone={secrecyTone} />}
          {!g.openWar && <span className={`stat-value tone-${secrecyTone}-text`}>{secrecy}</span>}
        </div>
        <button className={`hud-control${overlay && isControlTab(overlay.kind) ? " on" : ""}`} onClick={() => openControl()}
          title={`Bases, operations, research, intelligence, covert, the dark web and the ledger (${CONTROL_TABS.map((t) => keyLabel(keys[t.key])).join(", ")})`}>
          Control
          {attention > 0 && <span className="hud-control-count" title={`${attention} tab${attention === 1 ? "" : "s"} want attention`}>{attention}</span>}
        </button>
        <label className="hud-overlay" title={`Map overlay: colours the regions (${keyOf("geoOverlay")} for the next)`}>
          <span className="stat-label">Overlay</span>
          <select className="mm-select" value={mapOverlay} onChange={(e) => setMapOverlay(e.target.value as MapOverlay)}>
            {OVERLAYS.map((o) => <option key={o.id} value={o.id} title={o.tip}>{o.label}</option>)}
          </select>
        </label>
        <button className="mini hud-menu" onClick={() => { useStore.setState({ paused: true }); setMenuOpen(true); }} title="Save, load, settings, quit to the main menu (Esc)">
          ☰ Menu
        </button>
      </header>

      {shown.key.length > 0 && (
        <div className="hud-legend" aria-label={`${shown.label} overlay`}>
          <span className="hud-legend-title" title={shown.tip}>{shown.label}</span>
          {shown.key.map((k) => (
            <span key={k.text} className="hud-legend-item">
              <i style={{ background: `rgb(${k.color.map((c) => Math.round(c * 255)).join(",")})` }} />{k.text}
            </span>
          ))}
        </div>
      )}

      <div className="hud-objectives">
        <ObjectivesText title={ACT_NAMES[g.story.act]} conditions={difficulty(g.difficulty).name} lines={objectives(g)} />
      </div>

      <aside className="hud-side">
        {focus ? <FocusPanel /> : <RegionPanel />}
        <LeadsPanel />
      </aside>

      <TimeControl blocked={blocked} />

      <UnderWayPanel />

      <div className="hud-log">
        <FloatingLog lines={g.log.map((l) => ({ head: formatDate(l.time), text: l.text, tone: l.tone }))} />
      </div>

      <HoverLabel />

      <PlacementBanner />

      <OrderBanner />
      {showing("base") && !g.events.length && <BaseScreen />}
      {overlay && isControlTab(overlay.kind) && !g.events.length && <ControlScreen tab={overlay.kind} />}
      {buildDraft && !g.events.length && <BuildDialog key={`${buildDraft.pos.lat},${buildDraft.pos.lon}`} />}
      {dispatch && !g.events.length && <DispatchScreen />}
      <EventModal />
      {menuOpen && <PauseMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
