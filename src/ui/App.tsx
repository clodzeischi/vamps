import { useEffect } from "react";
import { music } from "../audio/music";
import { GlobeLayer } from "./components/GlobeLayer";
import { Toast } from "./components/Toast";
import { Geoscape } from "./screens/Geoscape";
import { MainMenu } from "./screens/MainMenu";
import { useStore } from "./store";

export function App() {
  const screen = useStore((s) => s.screen);
  const volume = useStore((s) => s.settings.musicVolume);
  useEffect(() => music.setVolume(volume), [volume]);
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
