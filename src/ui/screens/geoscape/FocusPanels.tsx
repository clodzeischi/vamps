import { REFUEL_HOURS } from "../../../sim/routes";
import { distanceNm } from "../../../sim/geo";
import { ELDERS } from "../../../data/people";
import { useState } from "react";
import { AIRCRAFT } from "../../../data/aircraft";
import { STATS } from "../../../data/agents";
import { BLOODLINES } from "../../../data/bloodlines";
import { INSTALLATIONS } from "../../../data/installations";
import { KIT } from "../../../data/kit";
import { regionById, neighboursOf } from "../../../data/regions";
import { MAX_NAME_LENGTH, nameBlocker, renameInstallation } from "../../../sim/commands";
import { ASSET_KINDS } from "../../../sim/humint";
import { coverUpAgents, coverUpBlocker, coverUpReward, covertLabel, declineCoverUp, startCoverUp } from "../../../sim/coverups";
import { joinable, missionCraftName, missionAgents, missionOf, SITE_KINDS, siteTitle, startMission } from "../../../sim/missions";
import { capacityOf, carriesRemains } from "../../../sim/transfers";
import { LoadBar } from "../../components/LoadBar";
import { aboardItems, TransferPanel } from "../../components/Transfer";
import { aircraftStatus } from "../../status";
import { LEAD_KIND_NAMES } from "../../../sim/operations";
import { aircraftAt, basesInReach, hangarsOf, occupantsAt, quartersOf, staffAt } from "../../../sim/personnel";
import { isReady, shownLeadKind, type Aircraft, type CoverUp, type Lead, type Mission, type Site } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { globe } from "../../globe";
import { money } from "../../format";
import { useGame, useStore } from "../../store";
import { ActionButton } from "../../components/ActionButton";

export function timeLeft(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  return h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${h} h` : `${Math.max(1, Math.round(ms / 60_000))} min`;
}

const intelWord = (q: number) => (q >= 0.75 ? "solid" : q >= 0.5 ? "fair" : "thin");

/** "Dispatch a team" for a lead or site, or what the team on it is doing. */
function DispatchButton({ target, missionId, inReach }: { target: { kind: "lead" | "site"; id: string }; missionId: string | null; inReach: boolean }) {
  const g = useGame();
  const anyBase = g.installations.some((i) => i.kind === "base" && isReady(g, i));
  const openDispatch = useStore((s) => s.openDispatch);
  const focusOn = useStore((s) => s.focusOn);
  const m = missionId ? g.missions.find((x) => x.id === missionId) : null;
  if (m)
    return (
      <>
        <ActionButton icon="status-field" label={`Team ${phaseWord(g, m)}`} tip={[`${missionCraftName(g, m)}, ${m.agentIds.length} aboard`]} onClick={() => focusOn({ kind: "mission", id: m.id })} />
        {joinable(m) && (
          <ActionButton icon="helicopter" label="Send another team" tip={["From any base in reach, on our own aircraft, in the same kit.", "It lands beside the team; start the mission when you choose."]} onClick={() => openDispatch(target)} />
        )}
      </>
    );
  return (
    <ActionButton primary icon={inReach ? "helicopter" : "jet"} blocker={!inReach && !anyBase ? "No base to send anyone from." : null}
      label={target.kind === "site" ? (target.id.startsWith("lair-") ? "Plan the assault" : "Plan a strike") : inReach ? "Dispatch a team" : "Send an agent by charter"}
      tip={[inReach ? "Choose the team, its kit and its aircraft" : "Out of our aircraft's reach: a chartered jet can take two agents (armed), an airline one (unarmed)"]}
      onClick={() => openDispatch(target)} />
  );
}

export function phaseWord(g: { time: number }, m: Mission) {
  if (m.phase === "outbound") return g.time < m.departAt ? "boarding" : `en route, ${timeLeft(m.arriveAt - g.time)} out`;
  if (m.phase === "on-site") return m.option ? `at work, ${timeLeft(m.workUntil - g.time)} left` : m.waiting ? "on the ground, holding for the others" : "on the ground, waiting for orders";
  return `flying home, ${timeLeft(m.returnAt - g.time)}`;
}

export function LeadPanel({ lead }: { lead: Lead }) {
  const g = useGame();
  const reach = basesInReach(g, lead.pos);
  const urgent = lead.expiresAt - g.time < 24 * 3_600_000;
  return (
    <Panel title={LEAD_KIND_NAMES[shownLeadKind(lead)]} className="lead-panel">
      <h3 className="lead-title">{lead.title}</h3>
      <p className="prose lead-text">{lead.text}</p>
      <div className="kv"><span>Region</span><span>{regionById(lead.regionId)?.name}</span></div>
      <div className="kv"><span>From</span><span>{lead.via === "volunteer" ? "a volunteer (doubles more likely)" : lead.via === "informant" ? "one of our informants" : "SIGINT"}</span></div>
      {lead.asset && <div className="kv"><span>Could become</span><span>{ASSET_KINDS[lead.asset].name} asset ({lead.who})</span></div>}
      <div className="kv"><span>Intel</span><span className="intel"><span className="intel-bar"><span style={{ width: `${lead.intel * 100}%` }} /></span>{intelWord(lead.intel)}</span></div>
      <div className={`kv ${urgent ? "bad" : ""}`}><span>Goes cold in</span><span>{timeLeft(lead.expiresAt - g.time)}</span></div>
      <div className="kv kv-block">
        <span>In reach of</span>
        <span>{reach.length ? reach.map((r) => `${r.base.name.replace("Operational Base ", "")} (${Math.round(r.distance)} nm)`).join(", ") : <em className="bad">no aircraft; charter only</em>}</span>
      </div>
      <DispatchButton target={{ kind: "lead", id: lead.id }} missionId={lead.missionId ?? null} inReach={reach.length > 0} />
    </Panel>
  );
}

const bloodline = (id: string) => BLOODLINES.find((b) => b.id === id);

export function SitePanel({ site }: { site: Site }) {
  const g = useGame();
  const reach = basesInReach(g, site.pos);
  const kind = SITE_KINDS[site.kind];
  return (
    <Panel title={site.kind === "lair" ? "Bloodline lair" : `Vampire ${kind.name.toLowerCase()}`} className="lead-panel site-panel">
      <h3 className="lead-title">{siteTitle(site)}</h3>
      <p className="prose lead-text">{kind.description}</p>
      <div className="kv"><span>Bloodline</span><span>{bloodline(site.bloodline)?.name}</span></div>
      <div className="kv"><span>Expected</span><span>{site.thralls} thralls, {site.vampires === 1 ? "one of them" : `${site.vampires} of them`}</span></div>
      {site.kind === "lair" && ELDERS[site.bloodline] && <div className="kv"><span>Sleeps here</span><span>{ELDERS[site.bloodline]!.name}</span></div>}
      {site.kind === "lair" ? (
        <div className="kv"><span>It moves</span><span>never; it is waiting</span></div>
      ) : (
        <div className={`kv ${site.expiresAt - g.time < 2 * 86_400_000 ? "bad" : ""}`}><span>They move in</span><span>about {timeLeft(site.expiresAt - g.time)}</span></div>
      )}
      <div className="kv kv-block">
        <span>In reach of</span>
        <span>{reach.length ? reach.map((r) => `${r.base.name.replace("Operational Base ", "")} (${Math.round(r.distance)} nm)`).join(", ") : <em className="bad">no aircraft; charter only</em>}</span>
      </div>
      <DispatchButton target={{ kind: "site", id: site.id }} missionId={site.missionId} inReach={reach.length > 0} />
    </Panel>
  );
}

export function MissionPanel({ m }: { m: Mission }) {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === m.baseId);
  const target = m.target.kind === "lead" ? g.leads.find((l) => l.id === m.target.id) : g.sites.find((x) => x.id === m.target.id);
  return (
    <Panel title="Team in the field">
      <h3 className="lead-title">{m.title}</h3>
      <div className="kv"><span>Status</span><span>{phaseWord(g, m)}</span></div>
      <div className="kv"><span>Aircraft</span><span>{missionCraftName(g, m)} from {base?.name.replace("Operational Base ", "")}</span></div>
      <div className="kv"><span>Kit</span><span>{KIT[m.kit].name}</span></div>
      <div className="kv kv-block"><span>{m.wings?.some((w) => w.landed) ? "On the ground" : "Team"}</span><span>{missionAgents(g, m).map((a) => `${a.sister ? "Sr." : "Br."} ${a.name}`).join(", ") || "none"}</span></div>
      {(m.wings ?? []).filter((w) => !w.landed).map((w) => (
        <div key={w.id} className="kv small">
          <span>{missionCraftName(g, w)} from {g.installations.find((i) => i.id === w.baseId)?.name ?? "?"}</span>
          <span>{w.agentIds.length} aboard, lands in {timeLeft(w.arriveAt - g.time)}</span>
        </div>
      ))}
      {m.phase === "on-site" && m.waiting && (
        <ActionButton primary icon="status-field" label="Start mission" tip={[`With the ${missionAgents(g, m).length} on the ground now.`, "Teams still in the air turn back."]}
          onClick={() => command((s) => startMission(s, m.id))} />
      )}
      {target && m.phase !== "returning" && (
        <button className="action" onClick={() => {
          globe()?.flyTo(target.pos, 2.0);
          focusOn({ kind: m.target.kind, id: target.id });
        }}>
          <span className="action-title">Show the target</span>
        </button>
      )}
    </Panel>
  );
}

/** The installation's name, with a pencil to rename it in place. */
function InstallationName({ id, name }: { id: string; name: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const [editing, setEditing] = useState<string | null>(null);
  if (editing === null)
    return (
      <h3 className="lead-title name-row">
        <span>{name}</span>
        <button className="mini" title="Rename" onClick={() => setEditing(name)}>Rename</button>
      </h3>
    );
  const blocker = editing.trim() === name ? null : nameBlocker(g, editing, id);
  const save = () => {
    if (blocker) return;
    if (editing.trim() !== name) command((game) => renameInstallation(game, id, editing), `Renamed ${editing.trim()}.`);
    setEditing(null);
  };
  return (
    <div className="field">
      <input className="text-input" value={editing} maxLength={MAX_NAME_LENGTH} autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setEditing(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { e.stopPropagation(); setEditing(null); }
        }} />
      <div className="name-actions">
        {blocker && <span className="action-blocker grow">{blocker}</span>}
        <button className="mini" onClick={() => setEditing(null)}>Cancel</button>
        <button className="mini" disabled={!!blocker} onClick={save}>Save</button>
      </div>
    </div>
  );
}

export function InstallationPanel({ id }: { id: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const focusOn = useStore((s) => s.focusOn);
  const inst = g.installations.find((i) => i.id === id);
  if (!inst) return null;
  const region = regionById(inst.regionId);
  const ready = isReady(g, inst);
  if (inst.kind === "fuel") {
    const through = g.missions.filter((m) => m.legs?.some((l) => distanceNm(l.to, inst.pos) < 1 || distanceNm(l.from, inst.pos) < 1)).length;
    return (
      <Panel title={INSTALLATIONS.fuel.name}>
        <InstallationName key={inst.id} id={inst.id} name={inst.name} />
        <div className="kv"><span>Region</span><span>{region?.name}</span></div>
        <div className="kv"><span>Status</span><span>{ready ? "Open" : `Ready ${formatDate(inst.readyAt)}`}</span></div>
        <div className="kv"><span>Refuelling stop</span><span>{REFUEL_HOURS} hours</span></div>
        <div className="kv"><span>Flights routed through it</span><span>{through}</span></div>
        <p className="small dim">A helicopter can fly on {AIRCRAFT.helicopter.reachNm} nm from here, a jet {AIRCRAFT.jet.reachNm.toLocaleString("en-US")} nm. Flights route through it on their own when it's the quickest way.</p>
      </Panel>
    );
  }
  if (inst.kind === "sigint") {
    const leads = g.leads.filter((l) => l.regionId === inst.regionId).length;
    return (
      <Panel title={INSTALLATIONS.sigint.name}>
        <InstallationName key={inst.id} id={inst.id} name={inst.name} />
        <div className="kv"><span>Covers</span><span>{region?.name}</span></div>
        <div className="kv kv-block"><span>Hears faintly</span><span className="small">{neighboursOf(inst.regionId).map((n) => regionById(n)?.name).join(", ") || "nothing"}</span></div>
        <div className="kv"><span>Status</span><span>{ready ? "Online" : `Ready ${formatDate(inst.readyAt)}`}</span></div>
        <div className="kv"><span>Active leads</span><span>{leads}</span></div>
      </Panel>
    );
  }
  const aircraft = aircraftAt(g, inst.id);
  return (
    <Panel title={INSTALLATIONS.base.name}>
      <InstallationName key={inst.id} id={inst.id} name={inst.name} />
      {!ready ? (
        <div className="kv"><span>Status</span><span>Ready {formatDate(inst.readyAt)}</span></div>
      ) : (
        <>
          <div className="kv"><span>Beds</span><span>{occupantsAt(g, inst.id)} / {quartersOf(inst)}</span></div>
          <div className="kv"><span>Aircraft</span><span>{aircraft.length} / {hangarsOf(inst)}</span></div>
          {aircraft.map((a) => (
            <button key={a.id} className="kv small row-button" onClick={() => focusOn({ kind: "aircraft", id: a.id })} title="Show the aircraft and give it orders">
              <span>{a.name}</span><span>{AIRCRAFT[a.kind].name}{a.deployed ? ", away" : `, reach ${AIRCRAFT[a.kind].reachNm} nm`}</span>
            </button>
          ))}
          <div className="kv"><span>Scientists · engineers</span><span>{staffAt(g, inst, "scientist")} · {staffAt(g, inst, "engineer")}</span></div>
          {(inst.captives?.length ?? 0) > 0 && <div className="kv"><span>Captives held</span><span>{inst.captives!.length}</span></div>}
          <div className="build-actions">
            <ActionButton primary icon="bases" label="Manage base" tip={["Quarters, hangars, laboratories, workshops, cells, stores"]} onClick={() => openBase(inst.id)} />
          </div>
        </>
      )}
    </Panel>
  );
}

/** The stats a judged event can turn on (vitality never does). */
const JUDGED_STATS = STATS.filter((x) => x.id !== "vitality");

/** An offer to review (pick agents, authorise or decline), or one under way.
 *  The text is the only hint at who to send: agents are in roster order, with
 *  their whole stat line, and no odds are shown (sim/judged.ts). */
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
        <div className="kv"><span>Region</span><span>{region}</span></div>
        <div className="kv"><span>Done in</span><span>{timeLeft(c.doneAt - g.time)}</span></div>
        {c.agents > 0 && <div className="kv kv-block"><span>Agents</span><span>{team.map((a) => `${a.sister ? "Sr." : "Br."} ${a.name}`).join(", ")}</span></div>}
        <div className="kv"><span>If it works</span><span>{coverUpReward(c)}</span></div>
      </Panel>
    );

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < c.agents ? [...p, id] : c.agents === 1 ? [id] : p));
  const blocker = coverUpBlocker(g, c, picked);
  return (
    <Panel title={covertLabel(c)} className="lead-panel">
      <h3 className="lead-title">{c.title}</h3>
      <p className="prose lead-text">{c.text}</p>
      <div className="kv"><span>Region</span><span>{region}</span></div>
      <div className="kv"><span>Cost</span><span>{money(c.cost)}</span></div>
      <div className="kv"><span>Takes</span><span>{c.days} day{c.days === 1 ? "" : "s"}</span></div>
      {asset && <div className="kv"><span>Through</span><span>{asset.name}, {asset.role}</span></div>}
      <div className="kv"><span>If it works</span><span className="good">{coverUpReward(c)}</span></div>
      <div className={`kv ${c.expiresAt - g.time < 86_400_000 ? "bad" : ""}`}><span>Offer lapses in</span><span>{timeLeft(c.expiresAt - g.time)}</span></div>
      {c.agents > 0 ? (
        <section className="coverup-agents">
          <h4 className="section-title">Send {c.agents === 1 ? "one agent" : `${c.agents} agents`} <span className="tab-count">{picked.length} / {c.agents}</span></h4>
          <div className="pick-list compact-picks">
            {free.length === 0 && <p className="small dim">Every agent is in the field or wounded.</p>}
            {free.map((a) => {
              const on = picked.includes(a.id);
              return (
                <button key={a.id} className={`pick${on ? " on" : ""}`} onClick={() => toggle(a.id)}>
                  <span className="pick-box">{on ? "✓" : ""}</span>
                  <span className="pick-name">{a.sister ? "Sr." : "Br."} {a.name}</span>
                  <span className="pick-stats">{JUDGED_STATS.map((x) => <span key={x.id} title={x.name}><i>{x.short}</i>{a.stats[x.id]}</span>)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="small dim">Money and the Church's contacts only; no agents needed.</p>
      )}
      <p className="small dim">
        {c.kind === "call" || c.kind === "disinfo"
          ? `If it goes badly, we could lose ${asset?.name ?? "the asset"}, or more.${c.kind === "call" ? " Ignored, the asset may be lost anyway." : ""}`
          : c.agents > 0 ? "Read it carefully, and send the right person. If it goes badly, the money is wasted, or worse." : "If it goes badly, the money is wasted, or worse."}
      </p>
      <div className="build-actions">
        <ActionButton primary icon="start" label="Authorise" blocker={blocker} tip={[`${money(c.cost)} now · ${c.days} day${c.days === 1 ? "" : "s"}`]}
          onClick={() => command((game) => startCoverUp(game, c.id, picked), `${covertLabel(c)} authorised.`)} />
        <button className="action" onClick={() => { command((game) => (declineCoverUp(game, c.id), null)); focusOn(null); }}>
          <span className="action-title">Decline</span>
        </button>
      </div>
    </Panel>
  );
}

/** One of our aircraft: where it is, what it carries, and its orders (Phoenix Point style). */
export function AircraftPanel({ c }: { c: Aircraft }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const focusOn = useStore((s) => s.focusOn);
  const d = AIRCRAFT[c.kind];
  const st = aircraftStatus(g, c);
  const base = g.installations.find((i) => i.id === c.baseId);
  const m = missionOf(g, c.id);
  const startOrder = useStore((s) => s.startOrder);
  const ferryTo = useStore((s) => s.ferryTo);
  return (
    <Panel title={d.name}>
      <h3 className="detail-title">{c.name}</h3>
      <div className="kv"><span>{st.label}</span><span className="td-dim">{st.note}</span></div>
      <div className="kv"><span>{c.ferry ? "Bound for" : "Home"}</span><span>{base?.name ?? "—"}</span></div>
      {c.deployed ? <LoadBar items={aboardItems(g, c)} capacity={capacityOf(c.kind)} /> : <div className="kv small"><span>Capacity</span><span>{capacityOf(c.kind)}</span></div>}
      <div className="kv small"><span>Speed</span><span>{d.speedKn} kn</span></div>
      <div className="kv small"><span>Reach</span><span>{d.reachNm.toLocaleString("en-US")} nm{carriesRemains(c.kind) ? ", lifts bodies" : ""}</span></div>
      {m && <ActionButton icon="status-field" label="Show the team" tip={[m.title]} onClick={() => focusOn({ kind: "mission", id: m.id })} />}
      {!c.deployed && base && (
        <>
          <h4 className="section-title">Orders</h4>
          <ActionButton primary icon={c.kind} label="Fly to…" tip={["Then click a destination on the globe:", "a base, to transfer there with people and cargo", "a lead or a site, to plan a mission with this aircraft"]} onClick={() => startOrder(c.id)} />
          <h4 className="section-title">Fly to another base</h4>
          <TransferPanel key={ferryTo?.aircraftId === c.id ? ferryTo.baseId : "none"} base={base} aircraft={c} />
          <ActionButton icon="bases" label="Open in the hangar" onClick={() => openBase(base.id, "hangars", c.id)} />
        </>
      )}
    </Panel>
  );
}

export function FocusPanel() {
  const g = useGame();
  const focus = useStore((s) => s.focus);
  if (!focus) return null;
  if (focus.kind === "lead") {
    const lead = g.leads.find((l) => l.id === focus.id);
    if (!lead)
      return (
        <Panel title="Lead">
          <p className="prose dim">This lead has gone cold.</p>
        </Panel>
      );
    return <LeadPanel lead={lead} />;
  }
  if (focus.kind === "site") {
    const site = g.sites.find((x) => x.id === focus.id);
    return site ? <SitePanel site={site} /> : <Panel title="Site"><p className="prose dim">They have moved on.</p></Panel>;
  }
  if (focus.kind === "coverup") {
    const c = g.coverUps.find((x) => x.id === focus.id);
    return c ? <CoverUpPanel key={c.id} c={c} /> : <Panel title="Cover-up"><p className="prose dim">That's over now.</p></Panel>;
  }
  if (focus.kind === "mission") {
    const m = g.missions.find((x) => x.id === focus.id);
    return m ? <MissionPanel m={m} /> : <Panel title="Team"><p className="prose dim">The team is home.</p></Panel>;
  }
  if (focus.kind === "aircraft") {
    const a = g.aircraft.find((x) => x.id === focus.id);
    return a ? <AircraftPanel key={a.id} c={a} /> : <Panel title="Aircraft"><p className="prose dim">That aircraft is gone.</p></Panel>;
  }
  return <InstallationPanel id={focus.id} />;
}

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
  const row = (id: string, kind: "lead" | "site" | "mission" | "coverup", pos: { lat: number; lon: number }, dot: string, title: string, note: string, urgent: boolean) => (
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
        {g.missions.map((m) => row(m.id, "mission", m.phase === "returning" ? m.from : m.pos, "dot-team", m.city,
          m.phase === "outbound" ? timeLeft(m.arriveAt - g.time) : m.phase === "on-site" ? (m.option ? "at work" : m.waiting ? "holding" : "orders?") : "home " + timeLeft(m.returnAt - g.time),
          m.phase === "on-site" && !m.option && !m.waiting))}
        {g.sites.map((x) => row(x.id, "site", x.pos, "dot-site", siteTitle(x), x.kind === "lair" ? (x.missionId ? "team sent" : "lair") : timeLeft(x.expiresAt - g.time), x.kind !== "lair" && x.expiresAt - g.time < 2 * day))}
        {offers.map((c) => row(c.id, "coverup", c.pos, "dot-coverup", c.title, `offer, ${timeLeft(c.expiresAt - g.time)}`, c.expiresAt - g.time < day))}
        {leads.map((l) => row(l.id, "lead", l.pos, "dot-lead", l.title, l.missionId ? "team sent" : timeLeft(l.expiresAt - g.time), !l.missionId && l.expiresAt - g.time < day))}
      </ul>
    </Panel>
  );
}

/** Whether the focus panel should replace the region panel. */
export function useHasFocus() {
  const focus = useStore((s) => s.focus);
  return !!focus;
}

