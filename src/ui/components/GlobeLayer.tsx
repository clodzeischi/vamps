import { useEffect, useRef } from "react";
import { REGIONS, regionById } from "../../data/regions";
import { GlobeView } from "../../render/GlobeView";
import { coveredRegions } from "../../sim/commands";
import { isReady } from "../../sim/state";
import { setGlobe } from "../globe";
import { useStore } from "../store";

/** Full-screen globe behind every screen; follows the store. */
export function GlobeLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new GlobeView(ref.current!);
    setGlobe(view);
    view.onPick = (p, index) => useStore.getState().select(p, index);
    view.onHover = (index) => useStore.getState().hover(index);

    let lastRev = -1;
    const sync = (s: ReturnType<typeof useStore.getState>) => {
      const inGame = s.screen === "geoscape" && !!s.game;
      view.setMode(inGame ? "geoscape" : "menu");
      view.setBloom(s.settings.bloom);
      view.setSupportView(inGame && s.supportView);
      view.setSelectedRegion(s.selection?.regionId ? regionById(s.selection.regionId)!.index : 0);
      if (!inGame) {
        view.setMarkers([]);
        view.setRegionStates([]);
        lastRev = -1;
        return;
      }
      const g = s.game!;
      view.setTime(g.time);
      if (s.rev === lastRev) return;
      lastRev = s.rev;
      view.setMarkers(g.installations.map((i) => ({ id: i.id, pos: i.pos, kind: i.kind, pending: !isReady(g, i) })));
      const covered = coveredRegions(g);
      const installed = new Set(g.installations.map((i) => i.regionId));
      view.setRegionStates(
        REGIONS.map((r) => ({ index: r.index, covered: covered.has(r.id), installed: installed.has(r.id), support: g.regions[r.id]?.support ?? 0 })),
      );
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
