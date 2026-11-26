// The base view, in the manner of the old XCOM base screen: a base is made of
// facilities, and each facility holds things. Region › Base › Facility › thing.
// The left column is the base's facilities; the right shows the one chosen,
// and inside it a single agent or aircraft.
import { CloseX } from "../../../components/CloseX";
import { regionById } from "../../../../data/regions";
import { facilityCount } from "../../../../sim/people/personnel";
import { basesOf, agentById, craftById, installationById } from "../../../../sim/core/state";
import { money } from "../../../format";
import { globe } from "../../../globe";
import { agentName } from "../../../status";
import { useGame, useStore, type BaseView } from "../../../store";
import { Armoury } from "../../../components/Gear";
import { Workshop } from "../ResearchScreen";
import { tiles, VIEW_NAMES, TileNav } from "./TileNav";
import { PersonnelTabs, Personnel, Hiring } from "./Personnel";
import { Overview } from "./Overview";
import { Hangars } from "./Hangars";
import { Containment } from "./Containment";
import { Stores } from "./Stores";
import { Construction } from "./Construction";

export function BaseScreen() {
  const g = useGame();
  const screen = useStore((s) => (s.overlay?.kind === "base" ? s.overlay : null));
  const openBase = useStore((s) => s.openBase);
  const close = useStore((s) => s.closeOverlay);
  if (!screen) return null;
  const base = installationById(g, screen.baseId);
  if (!base) return null;
  const bases = basesOf(g);
  const at = bases.indexOf(base);
  const step = (d: number) =>
    openBase(bases[(at + d + bases.length) % bases.length]!.id, screen.view);
  // A view this base doesn't have (containment with no cells) falls back to the overview.
  const view: BaseView =
    tiles(g, base).some((t) => t.view === screen.view) || screen.view === "hiring"
      ? screen.view
      : "overview";
  const item = screen.item;
  const thing = item && (agentById(g, item) ?? craftById(g, item));
  const parent: BaseView | null = view === "hiring" ? "personnel" : null;

  return (
    <div className="base-view">
      <header className="base-view-head">
        <nav className="crumbs">
          <button
            className="crumb"
            onClick={() => {
              close();
              globe()?.flyTo(base.pos, 2.4);
              useStore.getState().selectRegion(base.regionId, base.pos);
            }}
          >
            {regionById(base.regionId)?.name}
          </button>
          <span className="crumb-sep">›</span>
          <button className="crumb" onClick={() => openBase(base.id, "overview")}>
            {base.name}
          </button>
          {view !== "overview" && (
            <>
              {parent && (
                <>
                  <span className="crumb-sep">›</span>
                  <button className="crumb" onClick={() => openBase(base.id, parent)}>
                    {VIEW_NAMES[parent]}
                  </button>
                </>
              )}
              <span className="crumb-sep">›</span>
              <button className="crumb" onClick={() => openBase(base.id, view)}>
                {VIEW_NAMES[view]}
              </button>
            </>
          )}
          {thing && (
            <>
              <span className="crumb-sep">›</span>
              <span className="crumb current">
                {"female" in thing ? agentName(thing) : thing.name}
              </span>
            </>
          )}
        </nav>
        <div className="base-switch">
          {bases.length > 1 && (
            <button className="mini" onClick={() => step(-1)} title="Previous base">
              ◀
            </button>
          )}
          <span className="base-switch-name">
            {base.name}
            {bases.length > 1 ? ` · ${at + 1} of ${bases.length}` : ""}
          </span>
          {bases.length > 1 && (
            <button className="mini" onClick={() => step(1)} title="Next base">
              ▶
            </button>
          )}
        </div>
        <span className="base-funds">
          Funds <b>{money(g.funds)}</b>
        </span>
        <CloseX onClick={close} />
      </header>
      <div className="base-view-body">
        <TileNav base={base} view={view} />
        <section className="base-view-main panel">
          <h2 className="facility-title">{view === "hiring" ? "Personnel" : VIEW_NAMES[view]}</h2>
          {(view === "personnel" || view === "hiring") && <PersonnelTabs base={base} view={view} />}
          {view === "overview" && <Overview base={base} />}
          {view === "personnel" && <Personnel base={base} />}
          {view === "hiring" && <Hiring base={base} />}
          {view === "hangars" && <Hangars base={base} item={item} />}
          {view === "workshops" &&
            (facilityCount(base, "workshop") ? (
              <Workshop base={base} item={item} />
            ) : (
              <p className="small dim">This base has no workshop yet. Build one in Construction.</p>
            ))}
          {view === "containment" && <Containment base={base} />}
          {view === "stores" && <Stores base={base} />}
          {view === "armoury" && <Armoury base={base} item={item} />}
          {view === "construction" && <Construction base={base} />}
        </section>
      </div>
    </div>
  );
}
