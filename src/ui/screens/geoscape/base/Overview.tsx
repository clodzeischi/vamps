// A base's Overview: what it has, what it's doing, and who leads its research and workshops.
import { FACILITIES } from "../../../../data/installations";
import { projectById } from "../../../../data/research";
import { regionById } from "../../../../data/regions";
import {
  agentsAt,
  aircraftAt,
  baseReachNm,
  facilityCount,
  occupantsAt,
  quartersOf,
  setStaffLead,
  staffAtWork,
  staffLead,
} from "../../../../sim/people/personnel";
import { FLOOR_NAMES } from "../../../../sim/base/building";
import { teamOn, topOfQueue, unitsOf } from "../../../../sim/base/engineering";
import {
  researchBlocked,
  researchQueue,
  researchTeam,
  topOfResearch,
} from "../../../../sim/base/science";
import { aptitude } from "../../../../sim/people/aptitudes";
import { APTITUDES } from "../../../../data/aptitudes";
import { runDays, projectsAt, stalled } from "../../../../sim/base/research";
import { isReady, type Installation, type StaffMember } from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { SupportBar } from "../../../components/SupportBar";
import { agentStatus } from "../../../status";
import { useGame, useStore } from "../../../store";
import { timeLeft } from "../../../format";
import { staffLine } from "./shared";

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

/** The research or engineering projects running at a base, with their progress. */
function ProjectLines({ base, kind }: { base: Installation; kind: "research" | "engineering" }) {
  const g = useGame();
  const eng = kind === "engineering";
  const running = eng ? projectsAt(g, base.id, kind) : researchQueue(g);
  if (!running.length) return <p className="small dim">The queue is empty.</p>;
  const top = eng ? topOfQueue(g, base.id) : topOfResearch(g);
  return (
    <ul className="list">
      {running.map((a, i) => {
        const p = projectById(a.projectId);
        if (!p) return null;
        const left = runDays(g, a);
        const blocked = eng ? null : researchBlocked(g, a);
        const when = blocked
          ? `waiting: ${blocked.replace(/^Needs/, "needs")}`
          : stalled(a)
            ? "waiting for a free hangar"
            : a.short
              ? "stopped: no money for the materials"
              : Number.isFinite(left)
                ? `${left} day${left === 1 ? "" : "s"}${a !== top ? " (queued)" : " left"}`
                : eng
                  ? "no engineers"
                  : "no scientists";
        return (
          <li key={a.id} className="project-line queued">
            <span className="td-name">
              {i + 1}. {p.name}
              {unitsOf(a) > 1 ? ` ×${unitsOf(a)}` : ""}
            </span>
            <span className="td-dim">{when}</span>
            <span className="progress">
              <span style={{ width: `${Math.round((100 * a.progress) / p.points)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The lead engineer at a base: who, a choice of who next, and what the team does on the top job. */
export function LeadEngineer({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = staffAtWork(g, "engineer", base.id);
  const lead = staffLead(g, "engineer", base);
  const top = topOfQueue(g, base.id);
  const p = top && projectById(top.projectId);
  const team = p ? teamOn(g, base, p) : null;
  return (
    <>
      <div className="kv">
        <span title="Their aptitudes, over 50, multiply everyone else's here: above 50 helps, below 50 hurts">
          Lead engineer
        </span>
        <select
          className="lead-select"
          value={lead?.id ?? ""}
          disabled={!people.length}
          onChange={(e) =>
            command((s) => setStaffLead(s, "engineer", e.target.value || null, base.id))
          }
        >
          <option value="">No lead</option>
          {people.map((x) => (
            <option key={x.id} value={x.id}>
              {leadLabel(x)}
            </option>
          ))}
        </select>
      </div>
      {team && p && (
        <div
          className="kv"
          title="Points a day on the job at the top of the queue, and the share of its materials the team uses"
        >
          <span>On {p.name.toLowerCase()}</span>
          <span>
            {team.rate.toFixed(1)} points a day · materials ×{team.waste.toFixed(2)}
          </span>
        </div>
      )}
    </>
  );
}

/** A name and their four aptitudes, for a lead picker. */
const leadLabel = (x: StaffMember) =>
  `${x.name} (${APTITUDES[x.role].map((a) => `${a.short} ${Math.floor(aptitude(x, a.id))}`).join(", ")})`;

/** The lead scientist: one for the Order, whatever the topic. */
export function LeadScientist() {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = staffAtWork(g, "scientist");
  const lead = staffLead(g, "scientist");
  const top = topOfResearch(g);
  const p = top && projectById(top.projectId);
  const team = p ? researchTeam(g, p) : null;
  return (
    <>
      <div className="kv">
        <span title="One for the whole Order, whatever topic is on top: their aptitudes, over 50, multiply every other scientist's. Change them when the topic changes, or don't.">
          Lead scientist
        </span>
        <select
          className="lead-select"
          value={lead?.id ?? ""}
          disabled={!people.length}
          onChange={(e) => command((s) => setStaffLead(s, "scientist", e.target.value || null))}
        >
          <option value="">No lead</option>
          {people.map((x) => (
            <option key={x.id} value={x.id}>
              {leadLabel(x)}
            </option>
          ))}
        </select>
      </div>
      {team && p && (
        <div
          className="kv"
          title="Points a day on the topic at the top of the queue, from every scientist in the Order"
        >
          <span>On {p.name.toLowerCase()}</span>
          <span>
            {team.scientists} scientist{team.scientists === 1 ? "" : "s"} · {team.rate.toFixed(1)}{" "}
            points a day
          </span>
        </div>
      )}
    </>
  );
}

export function Overview({ base }: { base: Installation }) {
  const g = useGame();
  const region = regionById(base.regionId);
  const agents = agentsAt(g, base.id);
  const st = agents.map((a) => agentStatus(g, a));
  const ready = st.filter((x) => x.kind === "ready").length;
  const away = st.filter((x) => x.kind === "field" || x.kind === "covert").length;
  const hurt = st.filter((x) => x.kind === "wounded").length;
  const craft = aircraftAt(g, base.id);
  const cells = facilityCount(base, "containment") * FACILITIES.containment.holds!;
  const pending = base.upgrades ?? [];
  return (
    <>
      <p className="prose dim">
        {base.cell
          ? "A church cell: a few rooms under a parish, holding what's left of the Order's strike teams."
          : "An Operational Base: strike teams and their aircraft, laboratories, workshops and cells. Teams deploy from here, within their aircraft's reach."}
      </p>
      <div className="overview-grid">
        <div>
          <div className="kv">
            <span>Region</span>
            <span>{region?.name}</span>
          </div>
          <div className="kv kv-block">
            <span>Support</span>
            <SupportBar support={g.regions[base.regionId]?.support ?? 0} />
          </div>
          {base.evictionWarned && (
            <div className="kv bad">
              <span>Warning</span>
              <span>the region means to evict us</span>
            </div>
          )}
          <div className="kv">
            <span>Status</span>
            <span>
              {isReady(g, base)
                ? "Operational"
                : `Under construction, ready ${formatDate(base.readyAt)}`}
            </span>
          </div>
          <div className="kv">
            <span>Reach of its aircraft</span>
            <span>{baseReachNm(g, base.id).toLocaleString("en-US")} nm</span>
          </div>
          <div className="kv">
            <span>Beds</span>
            <span>
              {occupantsAt(g, base.id)} of {quartersOf(base)} taken
            </span>
          </div>
        </div>
        <div>
          <div className="kv">
            <span>Operatives</span>
            <span>
              {ready} available · {agents.length} stationed{away ? ` · ${away} away` : ""}
              {hurt ? ` · ${hurt} wounded` : ""}
            </span>
          </div>
          <div className="kv">
            <span>Aircraft</span>
            <span>{craft.map((c) => c.name).join(", ") || "none"}</span>
          </div>
          <div className="kv">
            <span>Scientists</span>
            <span>{staffLine(g, base, "scientist")}</span>
          </div>
          <div className="kv">
            <span>Engineers</span>
            <span>{staffLine(g, base, "engineer")}</span>
          </div>
          <div className="kv">
            <span>Analysts</span>
            <span>{staffLine(g, base, "analyst")}</span>
          </div>
          <div className="kv">
            <span>Captives</span>
            <span>
              {cells ? `${base.captives?.length ?? 0} of ${cells} cells` : "no containment"}
            </span>
          </div>
          <div className="kv">
            <span>Vampire remains</span>
            <span>{base.remains ?? 0}</span>
          </div>
        </div>
      </div>
      <div className="overview-grid">
        <div>
          <h4 className="section-title">Research queue (the Order's)</h4>
          <ProjectLines base={base} kind="research" />
        </div>
        <div>
          <h4 className="section-title">Engineering under way</h4>
          <ProjectLines base={base} kind="engineering" />
        </div>
      </div>
      {pending.length > 0 && (
        <>
          <h4 className="section-title">Construction under way</h4>
          {pending.map((u, i) => (
            <div key={i} className="kv">
              <span>
                {FACILITIES[u.kind].article.replace(/^./, (c) => c.toUpperCase())}
                {u.floor !== undefined ? `, ${FLOOR_NAMES[u.floor]!.toLowerCase()}` : ""}
              </span>
              <span>
                ready {formatDate(u.readyAt)} ({timeLeft(u.readyAt - g.time)})
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
