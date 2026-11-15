// The left column: everything under way (with progress), and the message log.
import { useEffect, useRef } from "react";
import { BASE_CAPACITY, INSTALLATIONS } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import { mediaCost, mediaLevel } from "../../../sim/media";
import { craftName } from "../../../sim/missions";
import { isReady, isWounded, type GameState, type MediaLevel } from "../../../sim/state";
import { DAY, formatClock, formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore, type Focus } from "../../store";
import { timeLeft } from "./FocusPanels";

interface Item {
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

function underWay(g: GameState, focusOn: (f: Focus) => void, openBase: (id: string, tab?: "agents" | "facilities") => void): Item[] {
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
      const days = u.kind === "hangar" ? BASE_CAPACITY.hangarDays : BASE_CAPACITY.quartersDays;
      items.push({
        key: `${i.id}-up-${n}`, dot: "dot-base dot-pending", title: `${u.kind === "hangar" ? "Hangar" : "Quarters"}, ${i.name}`,
        note: timeLeft(u.readyAt - g.time), progress: frac(g.time, u.readyAt - days * DAY, u.readyAt), end: u.readyAt,
        onClick: () => openBase(i.id, "facilities"),
      });
    });
  }

  for (const m of g.missions) {
    const air = craftName(g, m.aircraftId);
    const f: Focus = { kind: "mission", id: m.id };
    if (m.phase === "outbound")
      items.push({ key: m.id, dot: "dot-team", title: `${air} to ${m.city}`, note: `lands in ${timeLeft(m.arriveAt - g.time)}`, progress: frac(g.time, m.departAt, m.arriveAt), end: m.arriveAt, onClick: fly(m.pos, f) });
    else if (m.phase === "on-site")
      items.push({
        key: m.id, dot: "dot-team", title: `Team in ${m.city}`,
        note: m.option ? `at work, ${timeLeft(m.workUntil - g.time)}` : "waiting for orders",
        progress: m.option ? frac(g.time, m.arriveAt, m.workUntil) : null, end: m.option ? m.workUntil : g.time, onClick: fly(m.pos, f),
      });
    else
      items.push({ key: m.id, dot: "dot-team", title: `${air} home from ${m.city}`, note: timeLeft(m.returnAt - g.time), progress: frac(g.time, m.returnStart, m.returnAt), end: m.returnAt, onClick: fly(m.from, f) });
  }

  for (const c of g.coverUps)
    if (c.startedAt)
      items.push({
        key: c.id, dot: "dot-coverup on", title: c.title, note: `cover-up, ${timeLeft(c.doneAt - g.time)}`,
        progress: frac(g.time, c.startedAt, c.doneAt), end: c.doneAt, onClick: fly(c.pos, { kind: "coverup", id: c.id }),
      });

  for (const a of g.agents)
    if (isWounded(g, a) && !a.deployed)
      items.push({
        key: a.id, dot: "dot-wounded", title: `${a.sister ? "Sr." : "Br."} ${a.name}`, note: `recovering, fit ${formatDate(a.woundedUntil)}`,
        progress: null, end: a.woundedUntil, onClick: () => openBase(a.baseId, "agents"),
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

/** The last few messages; click to see them all. */
export function MessageLog() {
  const g = useGame();
  const open = useStore((s) => s.logOpen);
  const seenAt = useStore((s) => s.logSeenAt);
  const setLogOpen = useStore((s) => s.setLogOpen);
  const listRef = useRef<HTMLOListElement>(null);
  const unread = g.log.filter((l) => l.time > seenAt).length;

  // Newest at the bottom, like a chat: keep the view pinned there as messages arrive.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, g.log.length]);

  const entries = open ? g.log : g.log.slice(-3);
  let lastDay = "";
  return (
    <section className={`panel message-log${open ? " open" : ""}`}>
      <button className="log-head" onClick={() => setLogOpen(!open)} title={open ? "Collapse" : "Show all messages"}>
        <span className="panel-title">Messages</span>
        {!open && unread > 0 && <span className="log-unread">{unread} new</span>}
        <span className="log-toggle">{open ? "Collapse" : `Show all (${g.log.length})`}</span>
      </button>
      <ol ref={listRef} className="log-list" onClick={() => !open && setLogOpen(true)}>
        {entries.length === 0 && <li className="small dim">No messages yet.</li>}
        {entries.map((l, i) => {
          const day = formatDate(l.time);
          const header = open && day !== lastDay;
          lastDay = day;
          return (
            <li key={`${l.time}-${i}`} className={`log-entry tone-${l.tone}${l.time > seenAt ? " unread" : ""}`}>
              {header && <div className="log-day">{day}</div>}
              <span className="log-time">{open ? formatClock(l.time).replace(" UTC", "") : day.split(" ").slice(0, 2).join(" ")}</span>
              <span className="log-text">{l.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
