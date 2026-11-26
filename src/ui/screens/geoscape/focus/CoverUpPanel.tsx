// A cover-up in focus: who to send and how it's going.
import { useState } from "react";
import { APTITUDES } from "../../../../data/aptitudes";
import { traitValue } from "../../../status";
import { regionById } from "../../../../data/regions";
import {
  coverUpAgents,
  coverUpBlocker,
  coverUpReward,
  covertLabel,
  declineCoverUp,
  startCoverUp,
} from "../../../../sim/campaign/coverups";
import { type CoverUp, agentName } from "../../../../sim/core/state";
import { Panel } from "../../../components/Panel";
import { money, timeLeft } from "../../../format";
import { useGame, useStore } from "../../../store";
import { ActionButton } from "../../../components/ActionButton";

/** An offer to review (pick agents, authorise or decline), or one under way.
 *  The text is the only hint at who to send: agents are in roster order, with
 *  their whole stat line, and no odds are shown (sim/intel/judged.ts). */
export function CoverUpPanel({ c }: { c: CoverUp }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const focusOn = useStore((s) => s.focusOn);
  const free = coverUpAgents(g);
  const [picked, setPicked] = useState<string[]>([]);
  const team = g.agents.filter((a) => (c.startedAt ? c.agentIds : picked).includes(a.id));
  const region = regionById(c.regionId)?.name;
  const asset = c.assetId ? g.assets.find((a) => a.id === c.assetId) : undefined;

  if (c.startedAt)
    return (
      <Panel title={`${covertLabel(c)} under way`}>
        <h3 className="lead-title">{c.title}</h3>
        <div className="kv">
          <span>Region</span>
          <span>{region}</span>
        </div>
        <div className="kv">
          <span>Done in</span>
          <span>{timeLeft(c.doneAt - g.time)}</span>
        </div>
        {c.agents > 0 && (
          <div className="kv kv-block">
            <span>Operatives</span>
            <span>{team.map((a) => `${agentName(a)}`).join(", ")}</span>
          </div>
        )}
        <div className="kv">
          <span>If it works</span>
          <span>{coverUpReward(c)}</span>
        </div>
      </Panel>
    );

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length < c.agents
          ? [...p, id]
          : c.agents === 1
            ? [id]
            : p,
    );
  const blocker = coverUpBlocker(g, c, picked);
  return (
    <Panel title={covertLabel(c)} className="lead-panel">
      <h3 className="lead-title">{c.title}</h3>
      <p className="prose lead-text">{c.text}</p>
      <div className="kv">
        <span>Region</span>
        <span>{region}</span>
      </div>
      <div className="kv">
        <span>Cost</span>
        <span>{money(c.cost)}</span>
      </div>
      <div className="kv">
        <span>Takes</span>
        <span>
          {c.days} day{c.days === 1 ? "" : "s"}
        </span>
      </div>
      {asset && (
        <div className="kv">
          <span>Through</span>
          <span>
            {asset.name}, {asset.role}
          </span>
        </div>
      )}
      <div className="kv">
        <span>If it works</span>
        <span className="good">{coverUpReward(c)}</span>
      </div>
      <div className={`kv ${c.expiresAt - g.time < 86_400_000 ? "bad" : ""}`}>
        <span>Offer lapses in</span>
        <span>{timeLeft(c.expiresAt - g.time)}</span>
      </div>
      {c.agents > 0 ? (
        <section className="coverup-agents">
          <h4 className="section-title">
            Send {c.agents === 1 ? "one operative" : `${c.agents} operatives`}{" "}
            <span className="tab-count">
              {picked.length} / {c.agents}
            </span>
          </h4>
          <div className="pick-list compact-picks">
            {free.length === 0 && (
              <p className="small dim">Every operative is in the field or wounded.</p>
            )}
            {free.map((a) => {
              const on = picked.includes(a.id);
              return (
                <button
                  key={a.id}
                  className={`pick${on ? " on" : ""}`}
                  onClick={() => toggle(a.id)}
                >
                  <span className="pick-box">{on ? "✓" : ""}</span>
                  <span className="pick-name">{agentName(a)}</span>
                  <span className="pick-stats">
                    {APTITUDES.operator.map((x) => (
                      <span key={x.id} title={x.name}>
                        <i>{x.short}</i>
                        {traitValue(a, x.id)}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="small dim">Money and the Church's contacts only; no operatives needed.</p>
      )}
      <p className="small dim">
        {c.kind === "call" || c.kind === "disinfo"
          ? `If it goes badly, we could lose ${asset?.name ?? "the agent"}, or more.${c.kind === "call" ? " Ignored, the agent may be lost anyway." : ""}`
          : c.agents > 0
            ? "Read it carefully, and send the right person. If it goes badly, the money is wasted, or worse."
            : "If it goes badly, the money is wasted, or worse."}
      </p>
      <div className="build-actions">
        <ActionButton
          primary
          icon="start"
          label="Authorise"
          blocker={blocker}
          tip={[`${money(c.cost)} now · ${c.days} day${c.days === 1 ? "" : "s"}`]}
          onClick={() =>
            command((game) => startCoverUp(game, c.id, picked), `${covertLabel(c)} authorised.`)
          }
        />
        <button
          className="action"
          onClick={() => {
            command((game) => (declineCoverUp(game, c.id), null));
            focusOn(null);
          }}
        >
          <span className="action-title">Decline</span>
        </button>
      </div>
    </Panel>
  );
}
