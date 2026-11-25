import { useEffect, useMemo, useState } from "react";
import { difficulty } from "../../data/difficulty";
import { ACT_NAMES } from "../../sim/story";
import { objectives } from "../../sim/objectives";
import { ObjectivesText } from "../components/Objectives";
import { TimeControl } from "../components/TimeControl";
import { Meter } from "../components/Panel";
import { Icon, type IconName } from "../components/Icon";
import { money } from "../format";
import { actionFor, bindingsOf, keyLabel, SPEED_KEYS, type BindingId } from "../keys";
import { globe } from "../globe";
import { SPEEDS, useGame, useStore, type OverlayKind } from "../store";
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
import { HoverLabel, InstallationsList } from "./geoscape/SidePanels";
import { DetailsScreen } from "./geoscape/DetailsScreen";

export function Geoscape() {
  const g = useGame();
  const { supportView, focus, overlay, openOperations, openBase, openDetails, dispatch, buildDraft, setSpeed, stepSpeed, togglePause, advance, toggleSupportView, openResearch, openBloodlines, openCovert, openMarket } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [installationsOpen, setInstallationsOpen] = useState(false);
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
        if (installationsOpen) return setInstallationsOpen(false);
        if (st.focus && !menuOpen) return st.focusOn(null);
        useStore.setState({ paused: true });
        setMenuOpen((o) => !o);
        return;
      }
      const st = useStore.getState();
      // An event on screen has the keyboard (Space or Enter presses its button).
      if (menuOpen || st.overlay || st.dispatch || st.buildDraft || st.game?.events.length) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const id = actionFor(keys, e.code, "geo");
      if (!id) return;
      const speed = SPEED_KEYS.indexOf(id);
      if (id === "geoPause") { e.preventDefault(); togglePause(); }
      else if (speed >= 0 && speed < SPEEDS.length) setSpeed(speed);
      else if (id === "geoFaster") stepSpeed(1);
      else if (id === "geoSlower") stepSpeed(-1);
      else if (id === "geoSupportMap") toggleSupportView();
      else if (id === "geoOperations") openOperations();
      else if (id === "geoHomeBase") { const home = st.game?.installations.find((i) => i.kind === "base"); if (home) openBase(home.id); }
      else if (id === "geoResearch") openResearch();
      else if (id === "geoBloodlines") openBloodlines();
      else if (id === "geoCovert") openCovert();
      else if (id === "geoMarket") openMarket();
      else if (id === "geoInstallations") setInstallationsOpen((o) => !o);
      else if (id === "geoDetails") openDetails();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, setSpeed, stepSpeed, toggleSupportView, openResearch, openBloodlines, openCovert, openMarket, openOperations, openBase, openDetails, menuOpen, installationsOpen, keys]);

  const anyScreen = !!(overlay || dispatch);
  const showing = (k: OverlayKind) => overlay?.kind === k;
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
        <div className="pill" role="group" aria-label="Funds, support and secrecy">
          <button className={showing("details") ? "on" : ""} onClick={() => openDetails()} title={`Funds, support and secrecy in detail, against last month (${keyOf("geoDetails")})`}>
            Details
          </button>
          <button className={supportView ? "on" : ""} aria-pressed={supportView} onClick={toggleSupportView} title={`Support map: each region's support, on the globe (${keyOf("geoSupportMap")})`}>
            Support
          </button>
        </div>
        <button className="mini hud-menu" onClick={() => { useStore.setState({ paused: true }); setMenuOpen(true); }} title="Save, load, settings, quit to the main menu (Esc)">
          ☰ Menu
        </button>
      </header>

      <div className="hud-right">
        <ObjectivesText title={ACT_NAMES[g.story.act]} conditions={difficulty(g.difficulty).name} lines={objectives(g)} />
        <aside className="hud-side">
          {focus ? <FocusPanel /> : <RegionPanel />}
          <LeadsPanel />
        </aside>
      </div>

      <TimeControl blocked={blocked} />

      <aside className="hud-left">
        <UnderWayPanel />
        <MessageLog />
      </aside>

      <HoverLabel />
      <nav className="hud-block hud-dock">
        {installationsOpen && !anyScreen && <InstallationsList onClose={() => setInstallationsOpen(false)} />}
        <DockButton icon="bases" label="Installations" k={keyOf("geoInstallations")} on={installationsOpen && !anyScreen} tip="Bases, SIGINT and refuelling stations: pick one to fly there and act on it"
          onClick={() => setInstallationsOpen((o) => !o)} />
        <DockButton icon="operations" label="Operations" k={keyOf("geoOperations")} on={showing("operations")} tip="Every agent, aircraft and job, by status" onClick={openOperations} />
        <span className="time-sep" />
        <DockButton icon="research" label="Research" k={keyOf("geoResearch")} on={showing("research")} tip="Research and engineering" onClick={() => openResearch()} />
        <DockButton icon="bloodlines" label="Intelligence" k={keyOf("geoBloodlines")} on={showing("bloodlines")} tip="The intelligence section, and the houses we hunt" onClick={() => openBloodlines()} />
        <DockButton icon="covert" label="Covert" k={keyOf("geoCovert")} on={showing("covert")} tip="Covert actions" onClick={openCovert} />
        <DockButton icon="market" label="Dark web" k={keyOf("geoMarket")} on={showing("market")} tip="The dark web: buy equipment and information, sell what the war brings back" onClick={() => openMarket()} />
      </nav>

      <PlacementBanner />

      <OrderBanner />
      {showing("base") && !g.events.length && <BaseScreen />}
      {showing("operations") && !g.events.length && <OperationsScreen />}
      {showing("research") && !g.events.length && <ResearchScreen />}
      {showing("bloodlines") && !g.events.length && <BloodlinesScreen />}
      {showing("covert") && !g.events.length && <CovertScreen />}
      {showing("market") && !g.events.length && <MarketScreen />}
      {showing("details") && !g.events.length && <DetailsScreen />}
      {buildDraft && !g.events.length && <BuildDialog key={`${buildDraft.pos.lat},${buildDraft.pos.lon}`} />}
      {dispatch && !g.events.length && <DispatchScreen />}
      <EventModal />
      {menuOpen && <PauseMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

/** A dock button: the icon, its name under it, and its key in the corner. */
function DockButton({ icon, label, k, on, tip, onClick }: { icon: IconName; label: string; k: string; on: boolean; tip: string; onClick: () => void }) {
  return (
    <button className={`nav-btn dock-btn${on ? " on" : ""}`} onClick={onClick} title={`${tip} (${k})`}>
      <Icon name={icon} size={22} />
      <span className="dock-label">{label}</span>
      <kbd>{k}</kbd>
    </button>
  );
}
