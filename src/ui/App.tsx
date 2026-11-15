import { useEffect } from "react";
import { music } from "../audio/music";
import { installClickSound, sfx } from "../audio/sfx";
import { GlobeLayer } from "./components/GlobeLayer";
import { Toast } from "./components/Toast";
import { Geoscape } from "./screens/Geoscape";
import { MainMenu } from "./screens/MainMenu";
import { useStore } from "./store";

export function App() {
  const screen = useStore((s) => s.screen);
  const master = useStore((s) => s.settings.masterVolume);
  const musicVolume = useStore((s) => s.settings.musicVolume);
  const sfxVolume = useStore((s) => s.settings.sfxVolume);
  useEffect(() => music.setVolume(master * musicVolume), [master, musicVolume]);
  useEffect(() => sfx.setVolume(master * sfxVolume), [master, sfxVolume]);
  useEffect(installClickSound, []);
  useEffect(() => music.setScene(screen === "menu" ? "menu" : "geoscape"), [screen]);
  return (
    <>
      <GlobeLayer />
      <div className="vignette" />
      {screen === "menu" ? <MainMenu key="menu" /> : <Geoscape key="geoscape" />}
      <Toast />
    </>
  );
}
