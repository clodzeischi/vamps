import { useEffect, useRef } from "react";
import { GlobeView } from "../../render/GlobeView";
import { setGlobe } from "../globe";
import { useStore } from "../store";

/** Full-screen globe behind every screen; follows the store. */
export function GlobeLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new GlobeView(ref.current!);
    setGlobe(view);
    view.onPick = (p) => useStore.getState().select(p);

    const sync = (s: ReturnType<typeof useStore.getState>) => {
      view.setMode(s.screen === "geoscape" ? "geoscape" : "menu");
      view.setBloom(s.settings.bloom);
      if (s.screen === "geoscape" && s.campaign) {
        view.setTime(s.campaign.time);
        view.setMarkers(s.campaign.installations.map((i) => ({ id: i.id, pos: i.pos, kind: i.kind })));
      } else {
        view.setTime(Date.now());
        view.setMarkers([]);
      }
    };
    sync(useStore.getState());
    const unsubscribe = useStore.subscribe(sync);
    return () => {
      unsubscribe();
      setGlobe(null);
      view.dispose();
    };
  }, []);

  return <div ref={ref} className="globe-layer" />;
}
