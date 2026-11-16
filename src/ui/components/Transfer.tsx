// Moving people and cargo between bases (docs/WEB_PORT.md 3.7c): the
// transfer panel (a ferry flight, or the airline) and what's aboard an
// aircraft, for the segmented load bar.
import { useState } from "react";
import { STAFF } from "../../data/installations";
import { missionOf } from "../../sim/missions";
import { questioning } from "../../sim/research";
import { isReady, type Aircraft, type GameState, type Installation } from "../../sim/state";
import { AIRLINE_FEE, airlineBlocker, airlineDays, capacityOf, carriesRemains, ferry, ferryBlocker, ferryHours, LOAD, movablePeople, sendByAirline } from "../../sim/transfers";
import { money } from "../format";
import { agentName } from "../status";
import { useGame, useStore } from "../store";
import { ActionButton } from "./ActionButton";
import { LoadBar, type LoadItem } from "./LoadBar";

/** Everything aboard an aircraft away from its hangar, for the load bar. */
export function aboardItems(g: GameState, c: Aircraft): LoadItem[] {
  const m = missionOf(g, c.id);
  const ids = m?.agentIds ?? c.ferry?.people ?? [];
  const people = ids.map((id): LoadItem | null => {
    const a = g.agents.find((x) => x.id === id);
    if (a) return { id, load: LOAD.person, label: agentName(a), kind: "operative" };
    const p = g.staff.find((x) => x.id === id);
    return p ? { id, load: LOAD.person, label: p.name, kind: p.role } : null;
  }).filter((x): x is LoadItem => !!x);
  const cap = (c.cargo?.captives ?? []).map((x): LoadItem => ({ id: x.id, load: LOAD.captive, label: `Captive ${x.kind}`, kind: "bio" }));
  const bodies = Array.from({ length: c.cargo?.remains ?? 0 }, (_, k): LoadItem => ({ id: `r${k}`, load: LOAD.remains, label: "Vampire remains", kind: "bio" }));
  return [...people, ...cap, ...bodies];
}

/** Who goes where: aboard this aircraft (a ferry flight) or, without one, by airline. */
export function TransferPanel({ base, aircraft }: { base: Installation; aircraft?: Aircraft }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const others = g.installations.filter((i) => i.kind === "base" && i.id !== base.id && isReady(g, i));
  // A base picked on the globe (an aircraft's "Fly to") comes first.
  const [to, setTo] = useState(() => {
    const picked = useStore.getState().ferryTo;
    return picked && picked.aircraftId === aircraft?.id && others.some((b) => b.id === picked.baseId) ? picked.baseId : others[0]?.id ?? "";
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [remains, setRemains] = useState(0);
  const [caps, setCaps] = useState<string[]>([]);
  if (!others.length) return <p className="small dim">No other base to send anyone to.</p>;
  const captives = (base.captives ?? []).filter((x) => !questioning(g, x.id));
  const capIds = caps.filter((id) => captives.some((x) => x.id === id));
  const bodies = Math.min(remains, base.remains ?? 0);
  const pick = { remains: bodies, captives: capIds };
  const people = movablePeople(g, base.id);
  const ids = picked.filter((id) => people.some((x) => x.p.id === id));
  const toggle = (id: string) => setPicked(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const items: LoadItem[] = [
    ...people.filter((x) => ids.includes(x.p.id)).map((x): LoadItem => ({
      id: x.p.id, load: LOAD.person, label: x.kind === "agent" ? agentName(x.p) : x.p.name, kind: x.kind === "agent" ? "operative" : x.p.role,
    })),
    ...captives.filter((x) => capIds.includes(x.id)).map((x): LoadItem => ({ id: x.id, load: LOAD.captive, label: `Captive ${x.kind}`, kind: "bio" })),
    ...Array.from({ length: bodies }, (_, k): LoadItem => ({ id: `remains-${k}`, load: LOAD.remains, label: "Vampire remains", kind: "bio" })),
  ];
  const target = others.find((b) => b.id === to);
  const hours = aircraft && ferryHours(g, aircraft.id, to);
  const why = aircraft ? ferryBlocker(g, aircraft.id, to, ids, pick) : airlineBlocker(g, base.id, to, ids);
  return (
    <div className="transfer">
      <div className="kv"><span>To</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      {aircraft && <LoadBar items={items} capacity={capacityOf(aircraft.kind)} />}
      <div className="people-pick">
        {people.map((x) => (
          <label key={x.p.id} style={{ display: "contents" }}>
            <input type="checkbox" checked={ids.includes(x.p.id)} onChange={() => toggle(x.p.id)} />
            <span>{x.kind === "agent" ? agentName(x.p) : x.p.name}</span>
            <span className="td-dim">{x.kind === "agent" ? "Operative" : STAFF[x.p.role].name}</span>
          </label>
        ))}
      </div>
      {aircraft && ((base.remains ?? 0) > 0 || captives.length > 0) && (
        <div className="people-pick">
          {(base.remains ?? 0) > 0 && (
            <>
              <span />
              <span>Vampire remains ({base.remains} in cold storage){!carriesRemains(aircraft.kind) ? " — helicopter only" : ""}</span>
              <span className="stepper">
                <button className="mini" disabled={bodies <= 0} onClick={() => setRemains(bodies - 1)}>−</button>
                <span>{bodies}</span>
                <button className="mini" disabled={bodies >= (base.remains ?? 0) || !carriesRemains(aircraft.kind)} onClick={() => setRemains(bodies + 1)}>+</button>
              </span>
            </>
          )}
          {captives.map((x) => (
            <label key={x.id} style={{ display: "contents" }}>
              <input type="checkbox" checked={capIds.includes(x.id)} onChange={() => setCaps(capIds.includes(x.id) ? capIds.filter((y) => y !== x.id) : [...capIds, x.id])} />
              <span>Captive {x.kind}, taken in {x.city}</span>
              <span className="td-dim">needs a cell</span>
            </label>
          ))}
        </div>
      )}
      {aircraft ? (
        <ActionButton icon={aircraft.kind} label={`Fly to ${target?.name ?? "…"}`} blocker={why}
          tip={[hours ? `About ${Math.ceil(hours)} hours` : null, ids.length ? `${ids.length} aboard; their beds move with them` : "Empty: just the aircraft", "It stays at the new base."]}
          onClick={() => { command((s) => ferry(s, aircraft.id, to, ids, pick), `${aircraft.name} takes off.`); setPicked([]); setRemains(0); setCaps([]); }} />
      ) : (
        <ActionButton icon="bases" label={`Send by airline to ${target?.name ?? "…"}`} blocker={why}
          tip={[`${money(AIRLINE_FEE)} a head · ${airlineDays(g, base.id, to)} day${airlineDays(g, base.id, to) === 1 ? "" : "s"}`, "Unarmed. Their beds move with them."]}
          onClick={() => { command((s) => sendByAirline(s, base.id, to, ids), "On their way."); setPicked([]); }} />
      )}
    </div>
  );
}

