import { useEffect, useState } from "react";
import { difficulty } from "../../data/difficulty";
import { ACT_NAMES } from "../../sim/story";
import { formatClock, formatDate, weekday } from "../../sim/time";
import { Meter } from "../components/Panel";
import { Icon } from "../components/Icon";
import { money } from "../format";
import { globe } from "../globe";
import { SPEEDS, useGame, useStore } from "../store";
import { EventModal } from "./geoscape/EventModal";
import { PauseMenu } from "./geoscape/PauseMenu";
import { RegionPanel } from "./geoscape/RegionPanel";
import { BaseScreen } from "./geoscape/BaseScreen";
import { DispatchScreen } from "./geoscape/DispatchScreen";
import { ResearchScreen } from "./geoscape/ResearchScreen";
import { BloodlinesScreen } from "./geoscape/BloodlinesScreen";
import { CovertScreen } from "./geoscape/CovertScreen";
import { MarketScreen } from "./geoscape/MarketScreen";
import { OperationsScreen } from "./geoscape/OperationsScreen";
import { BuildDialog, OrderBanner, PlacementBanner } from "./geoscape/BuildDialog";
import { FocusPanel, LeadsPanel } from "./geoscape/FocusPanels";
import { MessageLog, UnderWayPanel } from "./geoscape/LeftPanels";
import { FinancePanel, HoverLabel, InstallationsPanel } from "./geoscape/SidePanels";

export function Geoscape() {
  const g = useGame();
  const { speed, paused, supportView, focus, baseScreen, operationsOpen, openOperations, openBase, researchOpen, bloodlinesOpen, covertOpen, marketOpen, dispatch, buildDraft, setSpeed, togglePause, advance, toggleSupportView, openResearch, openBloodlines, openCovert, openMarket } = useStore();
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
        if (st.ordering) return st.cancelOrder();
        if (st.dispatch) return st.closeDispatch();
        if (st.baseScreen) return st.closeBase();
        if (st.operationsOpen) return st.closeOperations();
        if (st.researchOpen) return st.closeResearch();
        if (st.bloodlinesOpen) return st.closeBloodlines();
        if (st.covertOpen) return st.closeCovert();
        if (st.marketOpen) return st.closeMarket();
        if (st.focus && !menuOpen) return st.focusOn(null);
        useStore.setState({ paused: true });
        setMenuOpen((o) => !o);
        return;
      }
      const st = useStore.getState();
      if (menuOpen || st.baseScreen || st.operationsOpen || st.researchOpen || st.bloodlinesOpen || st.covertOpen || st.marketOpen || st.dispatch || st.buildDraft) return;
      if (e.key === " ") { e.preventDefault(); togglePause(); }
      else if (e.key >= "1" && e.key <= String(SPEEDS.length)) setSpeed(Number(e.key) - 1);
      else if (e.key === "m") toggleSupportView();
      else if (e.key === "o") openOperations();
      else if (e.key === "h") { const home = st.game?.installations.find((i) => i.kind === "base"); if (home) openBase(home.id); }
      else if (e.key === "r") openResearch();
      else if (e.key === "b") openBloodlines();
      else if (e.key === "c") openCovert();
      else if (e.key === "k") openMarket();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, setSpeed, toggleSupportView, openResearch, openBloodlines, openCovert, openMarket, openOperations, openBase, menuOpen]);

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

      <aside className="hud-left">
        <UnderWayPanel />
        <MessageLog />
      </aside>

      <HoverLabel />
      <div className="hud-campaign" title={ACT_NAMES[g.story.act]}>{difficulty(g.difficulty).name} · Act {["I", "II", "III"][g.story.act - 1]}</div>
      <nav className="hud-block hud-dock">
        <button className={`nav-btn${baseScreen ? " on" : ""}`} onClick={() => { const home = g.installations.find((i) => i.kind === "base"); if (home) openBase(home.id); }} title="Your bases: quarters, hangars, labs, cells (H)">
          <Icon name="bases" />Bases<kbd>H</kbd>
        </button>
        <button className={`nav-btn${operationsOpen ? " on" : ""}`} onClick={openOperations} title="Every agent, aircraft and job, by status (O)">
          <Icon name="operations" />Operations<kbd>O</kbd>
        </button>
        <span className="time-sep" />
        <button className={`time-btn${researchOpen ? " on" : ""}`} onClick={() => openResearch()} title="Research & engineering (R)">
          <Icon name="research" />Research<kbd>R</kbd>
        </button>
        <button className={`time-btn${bloodlinesOpen ? " on" : ""}`} onClick={openBloodlines} title="The bloodlines (B)">
          <Icon name="bloodlines" />Bloodlines<kbd>B</kbd>
        </button>
        <button className={`time-btn${covertOpen ? " on" : ""}`} onClick={openCovert} title="Covert actions (C)">
          <Icon name="covert" />Covert<kbd>C</kbd>
        </button>
        <button className={`time-btn${marketOpen ? " on" : ""}`} onClick={openMarket} title="The black market (K)">
          <Icon name="market" />Market<kbd>K</kbd>
        </button>
        <span className="time-sep" />
        <button className={`time-btn${supportView ? " on" : ""}`} onClick={toggleSupportView} title="Support map (M)">
          <Icon name="map" />Support map<kbd>M</kbd>
        </button>
      </nav>

      <PlacementBanner />

      <OrderBanner />
      {baseScreen && <BaseScreen />}
      {operationsOpen && !g.events.length && <OperationsScreen />}
      {researchOpen && !g.events.length && <ResearchScreen />}
      {bloodlinesOpen && !g.events.length && <BloodlinesScreen />}
      {covertOpen && !g.events.length && <CovertScreen />}
      {marketOpen && !g.events.length && <MarketScreen />}
      {buildDraft && !g.events.length && <BuildDialog key={`${buildDraft.pos.lat},${buildDraft.pos.lon}`} />}
      {dispatch && !g.events.length && <DispatchScreen />}
      <EventModal />
      {menuOpen && <PauseMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
