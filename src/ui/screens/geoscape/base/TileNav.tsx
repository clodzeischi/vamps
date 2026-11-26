// The tiles down the side of a base: one per view, with a one-line summary.
import { tipLines } from "../../../components/Tooltip";
import { FACILITIES } from "../../../../data/installations";
import { regionById } from "../../../../data/regions";
import { GOOD_IDS, stockOf } from "../../../../sim/economy/market";
import {
  agentsAt,
  aircraftAt,
  facilityCount,
  hangarsOf,
  occupantsAt,
  quartersOf,
  staffAt,
  staffRoom,
} from "../../../../sim/people/personnel";
import { projectsAt } from "../../../../sim/base/research";
import { isReady, type GameState, type Installation } from "../../../../sim/core/state";
import { Icon, type IconName } from "../../../components/Icon";
import { agentStatus, aircraftStatus } from "../../../status";
import { useGame, useStore, type BaseView } from "../../../store";
import { timeLeft } from "../../../format";

export const VIEW_NAMES: Record<BaseView, string> = {
  overview: "Overview",
  personnel: "Personnel",
  hiring: "Hiring",
  hangars: "Hangars",
  workshops: "Workshops",
  containment: "Containment",
  stores: "Stores",
  armoury: "Armoury",
  construction: "Construction",
};

// ---------------------------------------------------------------------------
// The facility tiles
// ---------------------------------------------------------------------------

interface Tile {
  view: BaseView;
  icon: IconName;
  name: string;
  /** "6 / 12 beds". */
  count: string;
  /** 0..1 capacity used; null when it isn't a capacity. */
  fill: number | null;
  note: string;
  built: boolean;
}

export function tiles(g: GameState, base: Installation): Tile[] {
  const agents = agentsAt(g, base.id);
  const st = agents.map((a) => agentStatus(g, a));
  const ready = st.filter((x) => x.kind === "ready").length;
  const hurt = st.filter((x) => x.kind === "wounded").length;
  const craft = aircraftAt(g, base.id);
  const flying = craft.filter((c) => aircraftStatus(g, c).kind === "field").length;
  const shops = facilityCount(base, "workshop"),
    cont = facilityCount(base, "containment");
  const sci = staffAt(g, base, "scientist"),
    eng = staffAt(g, base, "engineer"),
    ana = staffAt(g, base, "analyst");
  const cells = cont * FACILITIES.containment.holds!;
  const held = base.captives?.length ?? 0;
  const engineering = projectsAt(g, base.id, "engineering").length;
  const goods = GOOD_IDS.filter((id) => id !== "tissue").reduce((t, id) => t + stockOf(g, id), 0);
  const pending = base.upgrades?.length ?? 0;
  const parts = (xs: (string | false)[]) => xs.filter(Boolean).join(" · ");
  const out: (Tile | false)[] = [
    {
      view: "overview",
      icon: "overview",
      name: "Overview",
      count: regionById(base.regionId)?.name ?? "",
      fill: null,
      note: isReady(g, base)
        ? "operational"
        : `under construction, ${timeLeft(base.readyAt - g.time)}`,
      built: true,
    },
    {
      view: "personnel",
      icon: "recruit",
      name: "Personnel",
      count: `${occupantsAt(g, base.id)} / ${quartersOf(base)} beds`,
      fill: occupantsAt(g, base.id) / quartersOf(base),
      note: parts([
        `${agents.length} operatives, ${sci + eng + ana} staff`,
        `${ready} ready`,
        hurt > 0 && `${hurt} wounded`,
      ]),
      built: true,
    },
    {
      view: "hangars",
      icon: "hangars",
      name: "Hangars",
      count: `${craft.length} / ${hangarsOf(base)} bays`,
      fill: craft.length / hangarsOf(base),
      note: parts([`${craft.length - flying} in`, flying > 0 && `${flying} flying`]),
      built: true,
    },
    {
      view: "workshops",
      icon: "workshops",
      name: "Workshops",
      count: shops ? `${eng} / ${staffRoom(base, "engineer")} engineers` : "none",
      fill: shops ? eng / staffRoom(base, "engineer") : null,
      note: shops ? `${engineering} project${engineering === 1 ? "" : "s"}` : "not built",
      built: shops > 0,
    },
    // Containment only once a cell is built (user, 2026-11-16).
    cells > 0 && {
      view: "containment",
      icon: "containment",
      name: "Containment",
      count: `${held} / ${cells} cells`,
      fill: held / cells,
      note: held ? "occupied" : "empty",
      built: true,
    },
    {
      view: "armoury",
      icon: "armoury",
      name: "Armoury",
      count: `${Object.values(base.armoury ?? {}).reduce((t, n) => t + (n ?? 0), 0)} items`,
      fill: null,
      note: "weapons, armour, kit",
      built: true,
    },
    {
      view: "stores",
      icon: "stores",
      name: "Stores",
      count: `${base.remains ?? 0} remains`,
      fill: null,
      note:
        parts([
          goods > 0 && `${goods} goods`,
          g.market.artifacts.length > 0 && `${g.market.artifacts.length} artifacts`,
        ]) || "cold storage, goods",
      built: true,
    },
    {
      view: "construction",
      icon: "construction",
      name: "Construction",
      count: pending ? `${pending} under way` : "nothing under way",
      fill: null,
      note: "build and clear rooms, hangars",
      built: true,
    },
  ];
  return out.filter((t): t is Tile => !!t);
}

export function TileNav({ base, view }: { base: Installation; view: BaseView }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const current = view === "hiring" ? "personnel" : view;
  return (
    <nav className="facility-nav">
      {tiles(g, base).map((t) => (
        <button
          key={t.view}
          className={`facility-tile${current === t.view ? " on" : ""}${t.built ? "" : " unbuilt"}`}
          onClick={() => openBase(base.id, t.view)}
          data-tip={tipLines(t.count, t.note)}
        >
          <span className="facility-name">
            <Icon name={t.icon} />
            {t.name}
          </span>
          {t.fill !== null && (
            <span className="progress">
              <span style={{ width: `${Math.round(Math.min(1, t.fill) * 100)}%` }} />
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
