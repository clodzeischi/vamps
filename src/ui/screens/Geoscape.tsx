import { useEffect, useState } from "react";
import { difficulty } from "../../data/difficulty";
import { formatClock, formatDate, weekday } from "../../sim/time";
import { Meter } from "../components/Panel";
import { money } from "../format";
import { globe } from "../globe";
import { SPEEDS, useGame, useStore } from "../store";
import { EventModal } from "./geoscape/EventModal";
import { PauseMenu } from "./geoscape/PauseMenu";
import { RegionPanel } from "./geoscape/RegionPanel";
import { BaseScreen } from "./geoscape/BaseScreen";
import { DispatchScreen } from "./geoscape/DispatchScreen";
import { BuildDialog, PlacementBanner } from "./geoscape/BuildDialog";
import { FocusPanel, LeadsPanel } from "./geoscape/FocusPanels";
import { FinancePanel, HoverLabel, InstallationsPanel } from "./geoscape/SidePanels";

export function Geoscape() {
  const g = useGame();
  const { speed, paused, supportView, focus, baseScreen, dispatch, buildDraft, setSpeed, togglePause, advance, toggleSupportView } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const blocked = g.events.length > 0 || !!g.gameOver;

  // Game clock: advance with real time while running.
  useEffect(() => {
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      advance(Math.min(0.25, (now - last) / 1000));
      last = now;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") {
        const st = useStore.getState();
        if (st.placing || st.buildDraft) return st.cancelPlacing();
        if (st.dispatch) return st.closeDispatch();
        if (st.baseScreen) return st.closeBase();
        if (st.focus && !menuOpen) return st.focusOn(null);
        useStore.setState({ paused: true });
        setMenuOpen((o) => !o);
        return;
      }
      const st = useStore.getState();
      if (menuOpen || st.baseScreen || st.dispatch || st.buildDraft) return;
      if (e.key === " ") { e.preventDefault(); togglePause(); }
      else if (e.key >= "1" && e.key <= String(SPEEDS.length)) setSpeed(Number(e.key) - 1);
      else if (e.key === "m") toggleSupportView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, setSpeed, toggleSupportView, menuOpen]);

  const secrecy = Math.round(g.secrecy);
  const secrecyTone = g.openWar ? "bad" : secrecy >= 60 ? "good" : secrecy >= 30 ? "warn" : "bad";

  return (
    <div className="screen geoscape">
      <header className="hud-top">
        <div className="hud-block hud-date">
          <div className="hud-emblem">OPV</div>
          <div>
            <div className="hud-date-main">{formatDate(g.time)}</div>
            <div className="hud-date-sub">{weekday(g.time)} · {formatClock(g.time)}</div>
          </div>
        </div>

        <div className={`hud-block hud-time${blocked ? " blocked" : ""}`}>
          <button className={`time-btn pause${paused ? " on" : ""}`} onClick={togglePause} title="Pause (Space)">
            {paused ? "▶" : "❚❚"}
          </button>
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`time-btn${!paused && speed === i ? " on" : ""}`} onClick={() => setSpeed(i)} title={`Key ${i + 1}`}>
              {s.label}
            </button>
          ))}
          <span className="time-sep" />
          <button className={`time-btn${supportView ? " on" : ""}`} onClick={toggleSupportView} title="Support map (M)">
            Support map
          </button>
        </div>

        <div className="hud-block hud-stats">
          <div className="stat">
            <span className="stat-label">Funds</span>
            <span className={`stat-value${g.funds < 0 ? " tone-bad-text" : ""}`}>{money(g.funds)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{g.openWar ? "Open war" : "Secrecy"}</span>
            {!g.openWar && <Meter value={g.secrecy} tone={secrecyTone} />}
            {!g.openWar && <span className={`stat-value tone-${secrecyTone}-text`}>{secrecy}</span>}
          </div>
        </div>
      </header>

      <aside className="hud-side">
        {focus ? <FocusPanel /> : <RegionPanel />}
        <LeadsPanel />
        <InstallationsPanel />
        <FinancePanel />
      </aside>

      <HoverLabel />
      <div className="hud-campaign">{difficulty(g.difficulty).name}</div>
      <footer className="hud-hints">
        Drag to rotate · wheel to zoom · click a region · Space pause · 1–5 speed · M support map · Esc menu
      </footer>

      <PlacementBanner />
      {baseScreen && <BaseScreen />}
      {buildDraft && !g.events.length && <BuildDialog key={`${buildDraft.pos.lat},${buildDraft.pos.lon}`} />}
      {dispatch && !g.events.length && <DispatchScreen />}
      <EventModal />
      {menuOpen && <PauseMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
