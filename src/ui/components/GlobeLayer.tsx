import { useEffect, useRef } from "react";
import { AIRCRAFT } from "../../data/aircraft";
import { REGIONS, regionById } from "../../data/regions";
import { GlobeView } from "../../render/GlobeView";
import { coveredRegions, sigintRates } from "../../sim/commands";
import { missionLeg } from "../../sim/missions";
import { ratlineEnd } from "../../sim/humint";
import { isReady } from "../../sim/state";
import { setGlobe } from "../globe";
import { focusFor, useStore } from "../store";

/** Full-screen globe behind every screen; follows the store. */
export function GlobeLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new GlobeView(ref.current!);
    setGlobe(view);
    view.onPick = (p, index) => {
      const st = useStore.getState();
      if (st.ordering) return st.notify("Choose a base, a lead or a site.", "bad");
      st.select(p, index);
    };
    view.onHover = (index) => useStore.getState().hover(index);
    view.onMarkerPick = (id) => {
      const st = useStore.getState();
      if (st.ordering) return void st.orderTo(id);
      const f = st.game ? focusFor(st.game, id) : null;
      if (f) return st.focusOn(f);
      // An asset: show its region (where the HUMINT section lists it).
      const a = st.game?.assets.find((x) => x.id === id);
      if (a) {
        st.focusOn(null);
        st.selectRegion(a.regionId, a.pos);
      }
    };

    let lastRev = -1;
    let lastFocus = "";
    const sync = (s: ReturnType<typeof useStore.getState>) => {
      const inGame = s.screen === "geoscape" && !!s.game;
      view.setHidden(s.screen === "skirmish" || s.screen === "battle");
      view.setMode(inGame ? "geoscape" : "menu");
      view.setBloom(s.settings.bloom);
      view.setSupportView(inGame && s.supportView);
      view.setPlacing(inGame && !!s.placing);
      view.setSelectedRegion(s.selection?.regionId ? regionById(s.selection.regionId)!.index : 0);
      if (!inGame) {
        view.setMarkers([]);
        view.setRings([]);
        view.setRoutes([]);
        view.setFlights([]);
        view.setRegionStates([]);
        lastRev = -1;
        return;
      }
      const g = s.game!;
      view.setTime(g.time);
      const draft = s.buildDraft;
      const focusKey = `${s.focus ? s.focus.id : ""}|${draft ? `${draft.pos.lat},${draft.pos.lon}` : ""}`;
      if (s.rev === lastRev && focusKey === lastFocus) return;
      lastRev = s.rev;
      lastFocus = focusKey;
      view.setMarkers([
        ...g.installations.map((i) => ({ id: i.id, pos: i.pos, kind: i.kind, pending: !isReady(g, i) })),
        ...g.leads.map((l) => ({ id: l.id, pos: l.pos, kind: "lead" as const })),
        ...g.sites.map((x) => ({ id: x.id, pos: x.pos, kind: x.kind === "lair" ? ("lair" as const) : ("site" as const) })),
        ...g.assets.map((a) => ({ id: a.id, pos: a.pos, kind: "asset" as const, asset: a.kind })),
        // Where the player is about to build.
        ...(draft ? [{ id: "draft", pos: draft.pos, kind: draft.kind }] : []),
      ]);
      view.setFlights([
        ...g.missions.map((m) => {
          const leg = missionLeg(m, g.time);
          return { id: m.id, from: leg.from, to: leg.to, start: leg.start, end: leg.end, returning: m.phase === "returning" };
        }),
        // Teams flying to join a mission: picking one shows the aircraft.
        ...g.missions.flatMap((m) => (m.wings ?? []).filter((w) => !w.landed).map((w) => {
          const leg = w.legs?.find((l) => l.end > g.time) ?? { from: w.from, to: m.pos, start: w.departAt, end: w.arriveAt };
          return { id: w.aircraftId, from: leg.from, to: leg.to, start: leg.start, end: leg.end, returning: false };
        })),
        // Ferry flights between bases: picking one shows the aircraft.
        ...g.aircraft.flatMap((a) => {
          const from = a.ferry && g.installations.find((i) => i.id === a.ferry!.fromBaseId);
          const to = g.installations.find((i) => i.id === a.baseId);
          return a.ferry && from && to ? [{ id: a.id, from: from.pos, to: to.pos, start: a.ferry.departAt, end: a.ferry.arriveAt, returning: false }] : [];
        }),
      ]);
      // Reach rings: helicopter (solid) and jet (dashed) for each ready base.
      const rings = [];
      for (const b of g.installations) {
        if (b.kind !== "base" || !isReady(g, b)) continue;
        const kinds = new Set(g.aircraft.filter((a) => a.baseId === b.id).map((a) => a.kind));
        for (const k of kinds)
          rings.push({ id: `${b.id}-${k}`, center: b.pos, radiusNm: AIRCRAFT[k].reachNm, color: k === "jet" ? 0xb8c4d6 : 0xe8c987, dashed: k === "jet", strong: s.focus?.id === b.id });
      }
      // Refuelling stations: how far a helicopter can go on from there (the jet reaches most places anyway).
      if (g.aircraft.some((a) => a.kind === "helicopter"))
        for (const f of g.installations)
          if (f.kind === "fuel" && isReady(g, f))
            rings.push({ id: `${f.id}-heli`, center: f.pos, radiusNm: AIRCRAFT.helicopter.reachNm, color: 0xf0a050, dashed: true, strong: s.focus?.id === f.id });
      view.setRings(rings);
      // Ratlines run from the asset to our nearest base.
      view.setRoutes(
        g.assets.filter((a) => a.kind === "ratline").flatMap((a) => {
          const end = ratlineEnd(g, a);
          return end ? [{ id: a.id, from: a.pos, to: end.pos }] : [];
        }),
      );
      const covered = coveredRegions(g);
      const heard = sigintRates(g);
      const installed = new Set(g.installations.map((i) => i.regionId));
      view.setRegionStates(
        REGIONS.map((r) => ({
          index: r.index,
          coverage: covered.has(r.id) ? 1 : heard.has(r.id) ? 0.45 : 0,
          installed: installed.has(r.id),
          support: g.regions[r.id]?.support ?? 0,
        })),
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
