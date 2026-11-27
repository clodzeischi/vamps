// One of our installations in focus: renaming it, what it holds, what it does.
import { REFUEL_HOURS } from "../../../../sim/missions/routes";
import { distanceNm } from "../../../../sim/core/geo";
import { useState } from "react";
import { AIRCRAFT, reachOf } from "../../../../data/aircraft";
import { INSTALLATIONS } from "../../../../data/installations";
import { regionById, neighboursOf } from "../../../../data/regions";
import { MAX_NAME_LENGTH, nameBlocker, renameInstallation } from "../../../../sim/core/commands";
import { agentStatus, aircraftStatus } from "../../../status";
import {
  agentsAt,
  aircraftAt,
  hangarsOf,
  occupantsAt,
  quartersOf,
  staffAt,
} from "../../../../sim/people/personnel";
import { Icon } from "../../../components/Icon";
import { isReady, installationById } from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { Panel } from "../../../components/Panel";
import { useGame, useStore } from "../../../store";
import { ActionButton } from "../../../components/ActionButton";

/** The installation's name, with a pencil to rename it in place. */
function InstallationName({ id, name }: { id: string; name: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const [editing, setEditing] = useState<string | null>(null);
  if (editing === null)
    return (
      <h3 className="lead-title name-row">
        <span>{name}</span>
        <button className="mini" title="Rename" onClick={() => setEditing(name)}>
          Rename
        </button>
      </h3>
    );
  const blocker = editing.trim() === name ? null : nameBlocker(g, editing, id);
  const save = () => {
    if (blocker) return;
    if (editing.trim() !== name)
      command((game) => renameInstallation(game, id, editing), `Renamed ${editing.trim()}.`);
    setEditing(null);
  };
  return (
    <div className="field">
      <input
        className="text-input"
        value={editing}
        maxLength={MAX_NAME_LENGTH}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setEditing(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditing(null);
          }
        }}
      />
      <div className="name-actions">
        {blocker && <span className="action-blocker grow">{blocker}</span>}
        <button className="mini" onClick={() => setEditing(null)}>
          Cancel
        </button>
        <button className="mini" disabled={!!blocker} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

export function InstallationPanel({ id }: { id: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const focusOn = useStore((s) => s.focusOn);
  const inst = installationById(g, id);
  if (!inst) return null;
  const region = regionById(inst.regionId);
  const ready = isReady(g, inst);
  if (inst.kind === "fuel") {
    const through = g.missions.filter((m) =>
      m.legs?.some((l) => distanceNm(l.to, inst.pos) < 1 || distanceNm(l.from, inst.pos) < 1),
    ).length;
    return (
      <Panel title={INSTALLATIONS.fuel.name}>
        <InstallationName key={inst.id} id={inst.id} name={inst.name} />
        <div className="kv">
          <span>Region</span>
          <span>{region?.name}</span>
        </div>
        <div className="kv">
          <span>Status</span>
          <span>{ready ? "Open" : `Ready ${formatDate(inst.readyAt)}`}</span>
        </div>
        <div className="kv">
          <span>Refuelling stop</span>
          <span>{REFUEL_HOURS} hours</span>
        </div>
        <div className="kv">
          <span>Flights routed through it</span>
          <span>{through}</span>
        </div>
        <p className="small dim">
          A helicopter can fly on {AIRCRAFT.helicopter.reachNm} nm from here, a jet{" "}
          {AIRCRAFT.jet.reachNm.toLocaleString("en-US")} nm. Flights route through it on their own
          when it's the quickest way.
        </p>
      </Panel>
    );
  }
  if (inst.kind === "sigint") {
    const leads = g.leads.filter((l) => l.regionId === inst.regionId).length;
    return (
      <Panel title={INSTALLATIONS.sigint.name}>
        <InstallationName key={inst.id} id={inst.id} name={inst.name} />
        <div className="kv">
          <span>Covers</span>
          <span>{region?.name}</span>
        </div>
        <div className="kv kv-block">
          <span>Hears faintly</span>
          <span className="small">
            {neighboursOf(inst.regionId)
              .map((n) => regionById(n)?.name)
              .join(", ") || "nothing"}
          </span>
        </div>
        <div className="kv">
          <span>Status</span>
          <span>{ready ? "Online" : `Ready ${formatDate(inst.readyAt)}`}</span>
        </div>
        <div className="kv">
          <span>Active leads</span>
          <span>{leads}</span>
        </div>
      </Panel>
    );
  }
  const aircraft = aircraftAt(g, inst.id);
  const agents = agentsAt(g, inst.id);
  return (
    <Panel title={INSTALLATIONS.base.name}>
      <InstallationName key={inst.id} id={inst.id} name={inst.name} />
      {!ready ? (
        <div className="kv">
          <span>Status</span>
          <span>Ready {formatDate(inst.readyAt)}</span>
        </div>
      ) : (
        <>
          <div className="kv" title="Beds taken, of all the beds in its quarters">
            <span>Beds</span>
            <span>
              {occupantsAt(g, inst.id)} / {quartersOf(inst)}
            </span>
          </div>
          <div className="kv" title="Ready, of the operatives stationed here">
            <span>Operatives</span>
            <span>
              {agents.filter((a) => agentStatus(g, a).kind === "ready").length} / {agents.length}
            </span>
          </div>
          <div className="kv">
            <span>Scientists</span>
            <span>{staffAt(g, inst, "scientist")}</span>
          </div>
          <div className="kv">
            <span>Engineers</span>
            <span>{staffAt(g, inst, "engineer")}</span>
          </div>
          <div className="kv" title="Aircraft, of its hangar bays">
            <span>Aircraft</span>
            <span>
              {aircraft.length} / {hangarsOf(inst)}
            </span>
          </div>
          {aircraft.length > 0 && (
            <div className="craft-buttons">
              {aircraft.map((a) => {
                const st = aircraftStatus(g, a);
                return (
                  <button
                    key={a.id}
                    className="mini craft-button"
                    onClick={() => focusOn({ kind: "aircraft", id: a.id })}
                    title={`${AIRCRAFT[a.kind].name}, reach ${reachOf(a).toLocaleString("en-US")} nm. ${st.label}. Show it and give it orders.`}
                  >
                    <Icon name={AIRCRAFT[a.kind].rotary ? "helicopter" : "jet"} size={16} />
                    <span className="grow">{a.name}</span>
                    <span className="craft-state">
                      {st.kind === "ready" ? "in hangar" : "away"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {(inst.captives?.length ?? 0) > 0 && (
            <div className="kv">
              <span>Captives held</span>
              <span>{inst.captives!.length}</span>
            </div>
          )}
          <div className="build-actions">
            <ActionButton
              primary
              icon="bases"
              label="Manage base"
              tip={["Quarters, hangars, laboratories, workshops, cells, stores"]}
              onClick={() => openBase(inst.id)}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
