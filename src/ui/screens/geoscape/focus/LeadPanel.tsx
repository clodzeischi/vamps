// A lead in focus: what we know, how sure we are, and sending a team.
import { pct, timeLeft } from "../../../format";
import { regionById } from "../../../../data/regions";
import { ASSET_KINDS } from "../../../../sim/intel/humint";
import {
  caseOf,
  confidence,
  discardLead,
  fixLead,
  MAX_EVIDENCE,
} from "../../../../sim/intel/intel";
import { LEAD_KIND_NAMES } from "../../../../sim/intel/operations";
import { basesInReach, staffAtWork } from "../../../../sim/people/personnel";
import { shownLeadKind, type Lead, LeadVia } from "../../../../sim/core/state";
import { Panel } from "../../../components/Panel";
import { useGame, useStore } from "../../../store";
import { ActionButton } from "../../../components/ActionButton";
import { DispatchButton } from "./shared";

const detailWord = (q: number) => (q >= 0.75 ? "solid" : q >= 0.5 ? "fair" : "thin");
const VIA_WORDS: Record<LeadVia, string> = {
  volunteer: "a volunteer (doubles more likely)",
  humint: "HUMINT: one of our informants",
  osint: "OSINT: open sources",
  sigint: "SIGINT",
} as const;
const DISC_SHORT = { osint: "OSINT", humint: "HUMINT", sigint: "SIGINT" } as const;

export function LeadPanel({ lead }: { lead: Lead }) {
  const g = useGame();
  const reach = basesInReach(g, lead.pos);
  const urgent = lead.expiresAt - g.time < 24 * 3_600_000;
  const command = useStore((s) => s.command);
  const kase = caseOf(g, lead);
  const conf = confidence(g, lead);
  const fixing = g.section?.fixing === lead.id;
  const fixBlocker =
    kase && kase.evidence.length >= MAX_EVIDENCE
      ? "Nothing more to learn without going there."
      : !staffAtWork(g, "analyst").length
        ? "We have no analysts."
        : null;
  return (
    <Panel title={LEAD_KIND_NAMES[shownLeadKind(lead)]} className="lead-panel">
      <h3 className="lead-title">{lead.title}</h3>
      <p className="prose lead-text">{lead.text}</p>
      <div className="kv">
        <span>Region</span>
        <span>{regionById(lead.regionId)?.name}</span>
      </div>
      <div className="kv">
        <span>From</span>
        <span>{VIA_WORDS[lead.via]}</span>
      </div>
      {lead.asset && (
        <div className="kv">
          <span>Could become</span>
          <span>
            {ASSET_KINDS[lead.asset].name} agent ({lead.who})
          </span>
        </div>
      )}
      <div
        className="kv"
        data-tip="The honest chance this is something real, from where it came and the evidence so far. At 80%, one in five is nothing."
      >
        <span>Real?</span>
        <span className="intel">
          <span className={`intel-bar conf${conf >= 0.7 ? " high" : conf < 0.35 ? " low" : ""}`}>
            <span style={{ width: pct(conf) }} />
          </span>
          {pct(conf)}
        </span>
      </div>
      <div
        className="kv"
        data-tip="How much we know of the place and the people, if it's real: better odds and warnings for the team"
      >
        <span>Detail</span>
        <span className="intel">
          <span className="intel-bar">
            <span style={{ width: `${lead.intel * 100}%` }} />
          </span>
          {detailWord(lead.intel)}
        </span>
      </div>
      {kase && kase.evidence.length > 0 && (
        <ul className="evidence">
          {kase.evidence.map((e, i) => (
            <li
              key={i}
              className={e.supports ? "for" : "against"}
              data-tip={`${DISC_SHORT[e.disc]}: ${e.supports ? "makes it likelier" : "makes it less likely"} (×${e.lr.toFixed(2)} the odds)`}
            >
              {e.text.replace(/^\w+: /, "")}
            </li>
          ))}
        </ul>
      )}
      <div className={`kv ${urgent ? "bad" : ""}`}>
        <span>Goes cold in</span>
        <span>{timeLeft(lead.expiresAt - g.time)}</span>
      </div>
      <div className="kv kv-block">
        <span>In reach of</span>
        <span>
          {reach.length ? (
            reach
              .map(
                (r) =>
                  `${r.base.name.replace("Operational Base ", "")} (${Math.round(r.distance)} nm)`,
              )
              .join(", ")
          ) : (
            <em className="bad">no aircraft; charter only</em>
          )}
        </span>
      </div>
      {kase && !lead.missionId && (
        <div className="build-actions two">
          {fixing ? (
            <ActionButton
              icon="findings"
              label="Stop working it"
              tip={["The analysts go back to looking for leads"]}
              onClick={() => command((s) => fixLead(s, null))}
            />
          ) : (
            <ActionButton
              icon="findings"
              label="Work this lead"
              blocker={fixBlocker}
              tip={[
                "The analysts build or break the case: each piece of evidence moves the odds",
                "Watching a real site may tip it off",
              ]}
              onClick={() => command((s) => fixLead(s, lead.id), "The analysts are on it.")}
            />
          )}
          <ActionButton
            icon="close"
            label="Drop it"
            tip={[
              "Judge it false, or not worth it, and drop it. A real lead dropped is a lead ignored.",
            ]}
            onClick={() => command((s) => discardLead(s, lead.id))}
          />
        </div>
      )}
      <DispatchButton
        target={{ kind: "lead", id: lead.id }}
        missionId={lead.missionId ?? null}
        inReach={reach.length > 0}
      />
    </Panel>
  );
}
