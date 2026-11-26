import type { InstallationKind } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import { isReady } from "../../../sim/core/state";
import { globe } from "../../globe";
import { overlayDef } from "../../overlays";
import { useGame, useStore } from "../../store";
import { BuildButton, placementNote } from "./BuildDialog";

const GROUPS: { kind: InstallationKind; title: string }[] = [
  { kind: "base", title: "Bases" },
  { kind: "sigint", title: "SIGINT stations" },
  { kind: "fuel", title: "Refuelling stations" },
];

/** Control's Bases tab: every installation, bases first, then SIGINT, then refuelling.
 *  Picking one closes Control, flies the globe there and selects it; a base can also
 *  be opened straight away. Building starts here too. */
export function BasesSection() {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const close = useStore((s) => s.closeOverlay);
  const openBase = useStore((s) => s.openBase);
  const pick = (id: string) => {
    const i = useStore.getState().game?.installations.find((x) => x.id === id);
    if (!i) return;
    close();
    globe()?.flyTo(i.pos, 2.1);
    focusOn({ kind: "installation", id });
  };
  return (
    <div className="control-section bases-section">
      <div className="bases-grid">
        {GROUPS.map((gr) => {
          const items = g.installations.filter((i) => i.kind === gr.kind);
          return (
            <section key={gr.kind} className="panel bases-col">
              <header className="bases-col-head">
                <h2 className="facility-title">
                  {gr.title} <span className="tab-count">{items.length}</span>
                </h2>
                <BuildButton kind={gr.kind} />
              </header>
              {!items.length && <p className="small dim">None yet.</p>}
              <ul className="list bases-list">
                {items.map((i) => (
                  <li key={i.id} className="bases-row">
                    <button
                      data-id={i.id}
                      className="list-row"
                      onClick={() => pick(i.id)}
                      data-tip="Fly there"
                    >
                      <span className={`dot dot-${i.kind}${isReady(g, i) ? "" : " dot-pending"}`} />
                      <span className="grow">{i.name}</span>
                      <span className="row-note td-dim">{regionById(i.regionId)?.name}</span>
                      {i.evictionWarned && <span className="row-note bad">eviction</span>}
                      {!isReady(g, i) && <span className="row-note">building</span>}
                    </button>
                    {i.kind === "base" && isReady(g, i) && (
                      <button className="mini" onClick={() => openBase(i.id)}>
                        Open
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function HoverLabel() {
  const g = useGame();
  const hover = useStore((s) => s.hoverRegion);
  const placing = useStore((s) => s.placing);
  const shown = useStore((s) => s.mapOverlay);
  if (!hover) return null;
  const r = regionById(hover)!;
  const support = Math.round(g.regions[hover]?.support ?? 0);
  const note = placing ? placementNote(g, placing, hover) : null;
  return (
    <div className="hover-label">
      <span className="hover-name">{r.name}</span>
      <span className="hover-meta">
        support {support > 0 ? "+" : ""}
        {support}
      </span>
      {shown !== "none" && shown !== "support" && (
        <span className="hover-meta">{overlayDef(shown).read(g, hover).text}</span>
      )}
      {note && <span className={`hover-meta ${note.ok ? "good" : "bad"}`}>{note.text}</span>}
    </div>
  );
}
