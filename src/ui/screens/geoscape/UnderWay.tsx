// Everything under way, with progress (bottom right, under the time dial).
import { FACILITIES, INSTALLATIONS } from "../../../data/installations";
import { projectById } from "../../../data/research";
import { regionById } from "../../../data/regions";
import { mediaCost, mediaLevel } from "../../../sim/campaign/media";
import { missionCraftName } from "../../../sim/missions/missions";
import { covertLabel } from "../../../sim/campaign/coverups";
import { runDays, stalled } from "../../../sim/base/research";
import { isReady, isWounded, type GameState, type MediaLevel, isDeployed, agentName, installationById } from "../../../sim/core/state";
import { DAY, formatDate } from "../../../sim/core/time";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore, type BaseView, type Focus } from "../../store";
import { timeLeft } from "./FocusPanels";

export interface Item {
  key: string;
  dot: string;
  title: string;
  note: string;
  /** 0..1, or null when there's nothing to measure (healing, media). */
  progress: number | null;
  /** When it's done (for sorting); Infinity for ongoing things. */
  end: number;
  onClick?: () => void;
}

const frac = (now: number, start: number, end: number) => (end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1);

export function underWay(g: GameState, focusOn: (f: Focus) => void, openBase: (id: string, view?: BaseView, item?: string) => void): Item[] {
  const items: Item[] = [];
  const fly = (pos: { lat: number; lon: number }, f: Focus) => () => {
    globe()?.flyTo(pos, 2.0);
    focusOn(f);
  };

  for (const i of g.installations) {
    if (!isReady(g, i)) {
      const start = i.readyAt - INSTALLATIONS[i.kind].buildDays * DAY;
      items.push({
        key: i.id, dot: `dot-${i.kind} dot-pending`, title: i.name, note: `construction, ${timeLeft(i.readyAt - g.time)}`,
        progress: frac(g.time, start, i.readyAt), end: i.readyAt, onClick: fly(i.pos, { kind: "installation", id: i.id }),
      });
    }
    (i.upgrades ?? []).forEach((u, n) => {
      const f = FACILITIES[u.kind];
      const days = f.days;
      const label = u.kind === "quarters" ? "Quarters" : f.article.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase());
      items.push({
        key: `${i.id}-up-${n}`, dot: "dot-base dot-pending", title: `${label}, ${i.name}`,
        note: timeLeft(u.readyAt - g.time), progress: frac(g.time, u.readyAt - days * DAY, u.readyAt), end: u.readyAt,
        onClick: () => openBase(i.id, "construction"),
      });
    });
  }

  for (const m of g.missions) {
    const air = missionCraftName(g, m);
    const f: Focus = { kind: "mission", id: m.id };
    if (m.phase === "outbound")
      items.push({ key: m.id, dot: "dot-team", title: `${air} to ${m.city}`, note: `lands in ${timeLeft(m.arriveAt - g.time)}`, progress: frac(g.time, m.departAt, m.arriveAt), end: m.arriveAt, onClick: fly(m.pos, f) });
    else if (m.phase === "on-site")
      items.push({
        key: m.id, dot: "dot-team", title: `Team in ${m.city}`,
        note: m.option ? `at work, ${timeLeft(m.workUntil - g.time)}` : m.haul ? "loading the haul" : m.waiting ? "holding for the others" : "waiting for orders",
        progress: m.option ? frac(g.time, m.arriveAt, m.workUntil) : null, end: m.option ? m.workUntil : g.time, onClick: fly(m.pos, f),
      });
    else
      items.push({ key: m.id, dot: "dot-team", title: `${air} home from ${m.city}`, note: timeLeft(m.returnAt - g.time), progress: frac(g.time, m.returnStart, m.returnAt), end: m.returnAt, onClick: fly(m.from, f) });
  }

  // Teams flying to join a mission.
  for (const m of g.missions)
    for (const w of m.wings ?? []) {
      if (w.landed) continue;
      items.push({ key: w.id, dot: "dot-team", title: `${missionCraftName(g, w)} to join in ${m.city}`, note: `lands in ${timeLeft(w.arriveAt - g.time)}`, progress: frac(g.time, w.departAt, w.arriveAt), end: w.arriveAt, onClick: fly(m.pos, { kind: "mission", id: m.id }) });
    }
  // Transfer flights between bases, and people travelling by airline.
  for (const c of g.aircraft) {
    if (!c.ferry) continue;
    const to = installationById(g, c.baseId);
    items.push({ key: `ferry-${c.id}`, dot: "dot-team", title: `${c.name} to ${to?.name ?? "?"}`, note: `lands in ${timeLeft(c.ferry.arriveAt - g.time)}`, progress: frac(g.time, c.ferry.departAt, c.ferry.arriveAt), end: c.ferry.arriveAt, onClick: fly(to?.pos ?? { lat: 0, lon: 0 }, { kind: "aircraft", id: c.id }) });
  }
  const aboard = new Set(g.aircraft.flatMap((c) => c.ferry?.people ?? []));
  const byAirline = new Map<string, { n: number; at: number }>();
  for (const x of [...g.agents, ...g.staff]) {
    if (!x.arriveAt || aboard.has(x.id)) continue;
    const e = byAirline.get(x.baseId) ?? { n: 0, at: 0 };
    byAirline.set(x.baseId, { n: e.n + 1, at: Math.max(e.at, x.arriveAt) });
  }
  for (const x of g.shipments ?? []) {
    const to = installationById(g, x.toBaseId);
    const n = Object.values(x.items).reduce((t: number, k) => t + (k ?? 0), 0);
    items.push({ key: x.id, dot: "dot-team", title: `Courier: ${n} items to ${to?.name ?? "?"}`, note: `arrives in ${timeLeft(x.arriveAt - g.time)}`, progress: null, end: x.arriveAt, onClick: () => to && openBase(to.id, "armoury") });
  }
  for (const [baseId, e] of byAirline) {
    const to = installationById(g, baseId);
    items.push({ key: `airline-${baseId}`, dot: "dot-team", title: `${e.n} by airline to ${to?.name ?? "?"}`, note: `arrive in ${timeLeft(e.at - g.time)}`, progress: null, end: e.at, onClick: () => to && openBase(to.id, "personnel") });
  }

  // Research and engineering: progress in staff-days, time at current staffing.
  for (const a of g.projects) {
    const p = projectById(a.projectId);
    if (!p) continue;
    const left = runDays(g, a);
    const where = installationById(g, a.baseId)?.name ?? "";
    items.push({
      key: a.id, dot: "dot-research", title: p.name,
      note: `${where}, ${stalled(a) ? "waiting for a free hangar" : a.short ? "no money for the materials" : Number.isFinite(left) ? `${left} day${left === 1 ? "" : "s"} left` : p.kind === "engineering" ? "no engineers" : "nobody on it"}`,
      progress: a.progress / p.points, end: Number.isFinite(left) ? g.time + left * 86_400_000 : Infinity,
      onClick: () => (p.kind === "research" ? useStore.getState().openResearch(p.id) : useStore.getState().openBase(a.baseId, "workshops", p.id)),
    });
  }

  for (const c of g.coverUps)
    if (c.startedAt)
      items.push({
        key: c.id, dot: "dot-coverup on", title: c.title, note: `${covertLabel(c).toLowerCase()}, ${timeLeft(c.doneAt - g.time)}`,
        progress: frac(g.time, c.startedAt, c.doneAt), end: c.doneAt, onClick: fly(c.pos, { kind: "coverup", id: c.id }),
      });

  for (const a of g.agents)
    if (isWounded(g, a) && !isDeployed(g, a))
      items.push({
        key: a.id, dot: "dot-wounded", title: `${agentName(a)}`, note: `recovering, fit ${formatDate(a.woundedUntil)}`,
        progress: null, end: a.woundedUntil, onClick: () => openBase(a.baseId, "personnel", a.id),
      });

  for (const [id, l] of Object.entries(g.media)) {
    const region = regionById(id);
    items.push({
      key: `media-${id}`, dot: "dot-media", title: `${mediaLevel(l as MediaLevel).name} media campaign, ${region?.name}`,
      note: `${money(mediaCost(id, l as MediaLevel))}/mo, ongoing`, progress: null, end: Infinity,
      onClick: () => {
        if (!region) return;
        globe()?.flyTo(region.label, 2.4);
        useStore.getState().selectRegion(id, region.label);
        useStore.getState().focusOn(null);
      },
    });
  }
  return items.sort((a, b) => a.end - b.end);
}

export function UnderWayPanel() {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const openBase = useStore((s) => s.openBase);
  const items = underWay(g, focusOn, openBase);
  return (
    <Panel title="Under way" className="underway">
      {items.length === 0 ? (
        <p className="small dim">Nothing under way.</p>
      ) : (
        <ul className="list underway-list">
          {items.map((it) => (
            <li key={it.key}>
              <button className="list-row underway-row" onClick={it.onClick}>
                <span className={`dot ${it.dot}`} />
                <span className="underway-body">
                  <span className="underway-title">{it.title}</span>
                  <span className="underway-note">{it.note}</span>
                  {it.progress !== null && (
                    <span className="progress"><span style={{ width: `${Math.round(it.progress * 100)}%` }} /></span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
