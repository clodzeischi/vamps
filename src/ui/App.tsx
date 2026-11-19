import { useEffect } from "react";
import { music } from "../audio/music";
import { installClickSound, sfx } from "../audio/sfx";
import { GlobeLayer } from "./components/GlobeLayer";
import { LoadingScreen } from "./components/LoadingScreen";
import { Toast } from "./components/Toast";
import { TooltipLayer } from "./components/Tooltip";
import { Geoscape } from "./screens/Geoscape";
import { MainMenu } from "./screens/MainMenu";
import { SkirmishScreen } from "./screens/tactical/SkirmishScreen";
import { useStore } from "./store";

/** A mission's battle, under the player's command. */
function CampaignBattle() {
  const b = useStore((s) => s.battle);
  const end = useStore((s) => s.endBattle);
  if (!b) return null;
  return (
    <LoadingScreen key={`battle-${b.missionId}`} title={b.title} sub="Deploying the team…">
      <SkirmishScreen campaign={{ battle: b.battle, title: b.title, onDone: end }} />
    </LoadingScreen>
  );
}

export function App() {
  const screen = useStore((s) => s.screen);
  const master = useStore((s) => s.settings.masterVolume);
  const musicVolume = useStore((s) => s.settings.musicVolume);
  const sfxVolume = useStore((s) => s.settings.sfxVolume);
  useEffect(() => music.setVolume(master * musicVolume), [master, musicVolume]);
  useEffect(() => sfx.setVolume(master * sfxVolume), [master, sfxVolume]);
  useEffect(installClickSound, []);
  useEffect(() => music.setScene(screen === "menu" ? "menu" : screen === "skirmish" || screen === "battle" ? "tactical" : "geoscape"), [screen]);
  return (
    <>
      <GlobeLayer />
      <div className="vignette" />
      {screen === "menu" ? <MainMenu key="menu" /> : screen === "skirmish" ? (
        <LoadingScreen key="skirmish" title="Skirmish" sub="Deploying the team…">
          <SkirmishScreen />
        </LoadingScreen>
      ) : screen === "battle" ? <CampaignBattle /> : <Geoscape key="geoscape" />}
      <Toast />
      <TooltipLayer />
    </>
  );
}
