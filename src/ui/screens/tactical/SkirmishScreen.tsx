// T1 of the tactical layer (docs/WEB_PORT.md 3.11): browse generated maps.
// Pick a setting and a site size, roll a seed, look around; the units are
// placed where a battle would start. No rules yet.
import { useEffect, useMemo, useRef, useState } from "react";
import { BattleView, type UnitSpec } from "../../../render/BattleView";
import { levelName, TILE_INFO, skinAt, tileAt, type Pt3, type Setting } from "../../../tactical/map";
import { generateMap, type SiteSize } from "../../../tactical/mapgen";
import { SITE_KINDS } from "../../../sim/missions";
import { useStore } from "../../store";

const SIZES: SiteSize[] = ["nest", "den", "haven"];

export function SkirmishScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const view = useRef<BattleView | null>(null);
  const quit = useStore((s) => s.quitToMenu);
  const [setting, setSetting] = useState<Setting>("urban");
  const [size, setSize] = useState<SiteSize>("den");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState<Pt3 | null>(null);

  const map = useMemo(() => {
    const k = SITE_KINDS[size];
    return generateMap({ setting, size, seed, thralls: k.thralls, vampires: k.vampires, civilians: 2 });
  }, [setting, size, seed]);

  const units = useMemo<UnitSpec[]>(() => [
    ...map.lz.slice(0, 4).map((p, i) => ({ id: `a${i}`, ...p, side: "agent" as const, facing: 0, selected: i === 0 })),
    ...map.spawns.map((s, i) => ({ id: `e${i}`, x: s.x, y: s.y, z: s.z, side: s.side, facing: (i * 1.3) % (Math.PI * 2) })),
  ], [map]);

  useEffect(() => {
    const v = new BattleView(ref.current!);
    view.current = v;
    v.onHover = setHover;
    return () => {
      v.dispose();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current!;
    v.setMap(map);
    setLevel(v.getLevel());
  }, [map]);

  useEffect(() => {
    view.current?.setLevel(level);
    view.current?.setUnits(units);
  }, [level, units]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") quit();
      if (e.key === "n" || e.key === "N") setSeed(Math.floor(Math.random() * 1e6));
      if (e.key === "PageUp" || e.key === "r" || e.key === "R") setLevel((z) => Math.min(map.levels - 1, z + 1));
      if (e.key === "PageDown" || e.key === "f" || e.key === "F") setLevel((z) => Math.max(0, z - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, quit]);

  const t = hover ? tileAt(map, hover.x, hover.y, hover.z) : null;
  const who = hover ? units.find((u) => u.x === hover.x && u.y === hover.y && u.z === hover.z) : undefined;
  return (
    <div className="screen skirmish">
      <div className="battle-layer" ref={ref} />
      <header className="battle-top panel">
        <span className="battle-title">Skirmish</span>
        <div className="seg">
          {(["urban", "rural"] as const).map((s) => (
            <button key={s} className={`mini${setting === s ? " primary" : ""}`} onClick={() => setSetting(s)}>{s === "urban" ? "Town" : "Farm"}</button>
          ))}
        </div>
        <div className="seg">
          {SIZES.map((s) => (
            <button key={s} className={`mini${size === s ? " primary" : ""}`} onClick={() => setSize(s)} data-tip={`${SITE_KINDS[s].thralls} thralls, ${SITE_KINDS[s].vampires} vampires`}>{SITE_KINDS[s].name}</button>
          ))}
        </div>
        <button className="mini" onClick={() => setSeed(Math.floor(Math.random() * 1e6))} data-tip="Generate another map (N)">New map</button>
        <span className="td-dim small">seed {seed} · {map.w}×{map.h}</span>
        <span className="battle-spacer" />
        <button className="mini" onClick={quit} data-tip="Back to the main menu (Esc)">Close ✕</button>
      </header>
      <div className="battle-levels panel">
        <button className="mini" onClick={() => setLevel((z) => Math.min(map.levels - 1, z + 1))} disabled={level >= map.levels - 1} data-tip="Show the level above (R or Page Up)">▲</button>
        <span className="battle-level">{level === map.levels - 1 ? "All levels" : levelName(map, level)}</span>
        <button className="mini" onClick={() => setLevel((z) => Math.max(0, z - 1))} disabled={level <= 0} data-tip="Cut away to the level below (F or Page Down)">▼</button>
      </div>
      <div className="battle-info panel small">
        {hover && t !== null ? (
          <>
            <div>{levelName(map, hover.z)} · {hover.x}, {hover.y}</div>
            <div className="td-dim">{TILE_INFO[t].name}{skinAt(map, hover.x, hover.y, hover.z) !== "none" ? ` (${skinAt(map, hover.x, hover.y, hover.z)})` : ""}{TILE_INFO[t].cover ? ` · ${TILE_INFO[t].cover === 2 ? "full" : "half"} cover` : ""}</div>
            {who && <div>{who.side === "agent" ? "Agent" : who.side === "thrall" ? "Thrall" : who.side === "vampire" ? "Vampire" : "Civilian"}</div>}
          </>
        ) : (
          <div className="td-dim">Right-drag to turn · middle-drag or WASD to pan · wheel to zoom · Q / E to rotate</div>
        )}
      </div>
    </div>
  );
}
