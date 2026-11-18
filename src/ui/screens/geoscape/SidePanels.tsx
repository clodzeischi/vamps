import { useEffect, useRef } from "react";
import type { InstallationKind } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import { isReady } from "../../../sim/state";
import { globe } from "../../globe";
import { actionFor, bindingsOf } from "../../keys";
import { useGame, useStore } from "../../store";
import { BuildButtons, placementNote } from "./BuildDialog";

const GROUPS: { kind: InstallationKind; title: string }[] = [
  { kind: "base", title: "Bases" },
  { kind: "sigint", title: "SIGINT stations" },
  { kind: "fuel", title: "Refuelling stations" },
];

/** The Installations list above the dock: bases first, then SIGINT, then refuelling.
 *  Picking one (click, wheel or arrow keys) selects it and flies the globe there;
 *  the panel on the right then holds what can be done with it. */
export function InstallationsList({ onClose }: { onClose: () => void }) {
  const g = useGame();
  const focus = useStore((s) => s.focus);
  const focusOn = useStore((s) => s.focusOn);
  const listRef = useRef<HTMLDivElement>(null);
  const order = GROUPS.flatMap((gr) => g.installations.filter((i) => i.kind === gr.kind));
  const selected = focus?.kind === "installation" ? focus.id : null;

  const pick = (id: string) => {
    const i = useStore.getState().game?.installations.find((x) => x.id === id);
    if (!i) return;
    globe()?.flyTo(i.pos, 2.1);
    focusOn({ kind: "installation", id });
    listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  };
  // Stepping through the list: the wheel and the arrow keys move the selection one row.
  const step = useRef<(dir: number) => void>(() => {});
  step.current = (dir: number) => {
    if (!order.length) return;
    const at = order.findIndex((i) => i.id === selected);
    const next = at < 0 ? (dir > 0 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, at + dir));
    pick(order[next]!.id);
  };
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 40) return;
      step.current(Math.sign(acc));
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const id = actionFor(bindingsOf(useStore.getState().settings.keys), e.code, "geo");
      if (id === "geoNextInstallation") { e.preventDefault(); step.current(1); }
      else if (id === "geoPrevInstallation") { e.preventDefault(); step.current(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="hud-block dock-pop installations-pop" role="dialog" aria-label="Installations">
      <div className="dock-pop-head">
        <span className="section-title">Installations <span className="tab-count">{g.installations.length}</span></span>
        <button className="mini" onClick={onClose} title="Close (Esc)">✕</button>
      </div>
      <div className="installations-list" ref={listRef}>
        {GROUPS.map((gr) => {
          const items = g.installations.filter((i) => i.kind === gr.kind);
          if (!items.length) return null;
          return (
            <section key={gr.kind}>
              <h4 className="installations-group">{gr.title} <span className="tab-count">{items.length}</span></h4>
              <ul className="list">
                {items.map((i) => (
                  <li key={i.id}>
                    <button data-id={i.id} className={`list-row${selected === i.id ? " selected" : ""}`} onClick={() => pick(i.id)}>
                      <span className={`dot dot-${i.kind}${isReady(g, i) ? "" : " dot-pending"}`} />
                      <span className="grow">{i.name}</span>
                      <span className="row-note td-dim">{regionById(i.regionId)?.name}</span>
                      {i.evictionWarned && <span className="row-note bad">eviction</span>}
                      {!isReady(g, i) && <span className="row-note">building</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="small dim installations-hint">Scroll or use ↑ ↓ to step through them; the globe follows.</p>
      <BuildButtons />
    </div>
  );
}

export function HoverLabel() {
  const g = useGame();
  const hover = useStore((s) => s.hoverRegion);
  const placing = useStore((s) => s.placing);
  if (!hover) return null;
  const r = regionById(hover)!;
  const support = Math.round(g.regions[hover]?.support ?? 0);
  const note = placing ? placementNote(g, placing, hover) : null;
  return (
    <div className="hover-label">
      <span className="hover-name">{r.name}</span>
      <span className="hover-meta">support {support > 0 ? "+" : ""}{support}</span>
      {note && <span className={`hover-meta ${note.ok ? "good" : "bad"}`}>{note.text}</span>}
    </div>
  );
}
