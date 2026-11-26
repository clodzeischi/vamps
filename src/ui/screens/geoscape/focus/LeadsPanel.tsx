// The list of open leads.
import { timeLeft } from "../../../format";
import { siteTitle } from "../../../../sim/missions/dispatch";
import { Panel } from "../../../components/Panel";
import { globe } from "../../../globe";
import { useGame, useStore } from "../../../store";

/** Everything live in the field: teams, vampire sites, leads. */
export function LeadsPanel() {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const focus = useStore((s) => s.focus);
  // Cover-ups under way are listed under "Under way"; offers wait here.
  const offers = g.coverUps.filter((c) => !c.startedAt);
  if (!g.leads.length && !g.sites.length && !g.missions.length && !offers.length) return null;
  const leads = [...g.leads].sort((a, b) => a.expiresAt - b.expiresAt);
  const day = 24 * 3_600_000;
  const row = (
    id: string,
    kind: "lead" | "site" | "mission" | "coverup",
    pos: { lat: number; lon: number },
    dot: string,
    title: string,
    note: string,
    urgent: boolean,
  ) => (
    <li key={id}>
      <button
        className={`list-row${focus?.id === id ? " selected" : ""}`}
        onClick={() => {
          globe()?.flyTo(pos, 2.0);
          focusOn({ kind, id });
        }}
      >
        <span className={`dot ${dot}`} />
        <span className="grow">{title}</span>
        <span className={`row-note${urgent ? " bad" : ""}`}>{note}</span>
      </button>
    </li>
  );
  return (
    <Panel title="In the field">
      <ul className="list">
        {g.missions.map((m) =>
          row(
            m.id,
            "mission",
            m.phase === "returning" ? m.from : m.pos,
            "dot-team",
            m.city,
            m.phase === "outbound"
              ? timeLeft(m.arriveAt - g.time)
              : m.phase === "on-site"
                ? m.option
                  ? "at work"
                  : m.haul
                    ? "loading"
                    : m.waiting
                      ? "holding"
                      : "orders?"
                : "home " + timeLeft(m.returnAt - g.time),
            m.phase === "on-site" && !m.option && !m.waiting && !m.haul,
          ),
        )}
        {g.sites.map((x) =>
          row(
            x.id,
            "site",
            x.pos,
            "dot-site",
            siteTitle(x),
            x.kind === "lair"
              ? x.missionId
                ? "team sent"
                : "lair"
              : timeLeft(x.expiresAt - g.time),
            x.kind !== "lair" && x.expiresAt - g.time < 2 * day,
          ),
        )}
        {offers.map((c) =>
          row(
            c.id,
            "coverup",
            c.pos,
            "dot-coverup",
            c.title,
            `offer, ${timeLeft(c.expiresAt - g.time)}`,
            c.expiresAt - g.time < day,
          ),
        )}
        {leads.map((l) =>
          row(
            l.id,
            "lead",
            l.pos,
            "dot-lead",
            l.title,
            l.missionId ? "team sent" : timeLeft(l.expiresAt - g.time),
            !l.missionId && l.expiresAt - g.time < day,
          ),
        )}
      </ul>
    </Panel>
  );
}
