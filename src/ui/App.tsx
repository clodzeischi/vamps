import { GlobeLayer } from "./components/GlobeLayer";
import { Toast } from "./components/Toast";
import { Geoscape } from "./screens/Geoscape";
import { MainMenu } from "./screens/MainMenu";
import { useStore } from "./store";

export function App() {
  const screen = useStore((s) => s.screen);
  return (
    <>
      <GlobeLayer />
      <div className="vignette" />
      {screen === "menu" ? <MainMenu key="menu" /> : <Geoscape key="geoscape" />}
      <Toast />
    </>
  );
}
