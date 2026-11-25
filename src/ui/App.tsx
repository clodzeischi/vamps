import { lazy, useEffect } from "react";
import { music } from "../audio/music";
import { installClickSound, sfx } from "../audio/sfx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GlobeLayer } from "./components/GlobeLayer";
import { LoadingScreen } from "./components/LoadingScreen";
import { Toast } from "./components/Toast";
import { TooltipLayer } from "./components/Tooltip";
import { Geoscape } from "./screens/Geoscape";
import { MainMenu } from "./screens/MainMenu";
import { useStore } from "./store";

/** The battlescape is loaded when first needed, behind the loading screen. */
const loadBattlescape = () => import("./screens/tactical/SkirmishScreen");
const SkirmishScreen = lazy(() => loadBattlescape().then((m) => ({ default: m.SkirmishScreen })));

/** A mission's battle, under the player's command. */
function CampaignBattle() {
  const b = useStore((s) => s.battle);
  const end = useStore((s) => s.endBattle);
  const save = useStore((s) => s.saveBattle);
  // Closing or reloading the tab: save what's on the board (changes since the last command: a fire mode, the inventory).
  useEffect(() => {
    const onHide = () => void save();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [save]);
  if (!b) return null;
  return (
    <LoadingScreen key={`battle-${b.key}`} title={b.title} sub="Deploying the team…">
      <SkirmishScreen campaign={{ battle: b.battle, title: b.title, onDone: end, onSave: () => void save() }} />
    </LoadingScreen>
  );
}

export function App() {
  const screen = useStore((s) => s.screen);
  const master = useStore((s) => s.settings.masterVolume);
  const musicVolume = useStore((s) => s.settings.musicVolume);
  const sfxVolume = useStore((s) => s.settings.sfxVolume);
  const ambientVolume = useStore((s) => s.settings.ambientVolume);
  useEffect(() => music.setVolume(master * musicVolume), [master, musicVolume]);
  useEffect(() => sfx.setVolume(master * sfxVolume), [master, sfxVolume]);
  useEffect(() => sfx.setAmbientVolume(master * ambientVolume), [master, ambientVolume]);
  useEffect(installClickSound, []);
  // No browser menu on a right click, except in text fields (paste).
  useEffect(() => {
    const off = (e: MouseEvent) => {
      if (!(e.target instanceof Element && e.target.closest("input[type=text], input:not([type]), textarea"))) e.preventDefault();
    };
    window.addEventListener("contextmenu", off);
    return () => window.removeEventListener("contextmenu", off);
  }, []);
  // Fetched early, once the menu is up: a tab left open across a deploy still has its battlescape.
  useEffect(() => {
    const t = setTimeout(() => void loadBattlescape().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => music.setScene(screen === "menu" ? "menu" : screen === "skirmish" || screen === "battle" ? "tactical" : "geoscape"), [screen]);
  return (
    <>
      <ErrorBoundary>
      <GlobeLayer />
      <div className="vignette" />
      {screen === "menu" ? <MainMenu key="menu" /> : screen === "skirmish" ? (
        <LoadingScreen key="skirmish" title="Skirmish" sub="Deploying the team…">
          <SkirmishScreen />
        </LoadingScreen>
      ) : screen === "battle" ? <CampaignBattle /> : <Geoscape key="geoscape" />}
      </ErrorBoundary>
      <Toast />
      <TooltipLayer />
    </>
  );
}
