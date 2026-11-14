import { useEffect, useState } from "react";
import { difficulty } from "../../data/difficulty";
import { formatLatLon } from "../../render/geo";
import { formatClock, formatDate, weekday } from "../../sim/time";
import { globe } from "../globe";
import { Meter, Panel } from "../components/Panel";
import { SPEEDS, useStore } from "../store";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function Geoscape() {
  const campaign = useStore((s) => s.campaign)!;
  const { speed, paused, selection, setSpeed, togglePause, quitToMenu, advance } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  // Game clock: advance with real time while not paused.
  useEffect(() => {
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      advance(Math.min(0.25, (now - last) / 1000));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance]);

  // Open on the home base.
  useEffect(() => {
    const t = setTimeout(() => globe()?.flyTo(campaign.installations[0]!.pos, 2.6), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); togglePause(); }
      else if (e.key >= "1" && e.key <= String(SPEEDS.length)) setSpeed(Number(e.key) - 1);
      else if (e.key === "Escape") {
        useStore.setState({ paused: true });
        setMenuOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, setSpeed]);

  const secrecyTone = campaign.secrecy >= 60 ? "good" : campaign.secrecy >= 30 ? "warn" : "bad";

  return (
    <div className="screen geoscape">
      <header className="hud-top">
        <div className="hud-block hud-date">
          <div className="hud-emblem">OPV</div>
          <div>
            <div className="hud-date-main">{formatDate(campaign.time)}</div>
            <div className="hud-date-sub">{weekday(campaign.time)} · {formatClock(campaign.time)}</div>
          </div>
        </div>

        <div className="hud-block hud-time">
          <button className={`time-btn pause${paused ? " on" : ""}`} onClick={togglePause} title="Pause (Space)">
            {paused ? "▶" : "❚❚"}
          </button>
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`time-btn${!paused && speed === i ? " on" : ""}`} onClick={() => setSpeed(i)} title={`Key ${i + 1}`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="hud-block hud-stats">
          <div className="stat">
            <span className="stat-label">Funds</span>
            <span className="stat-value">{money(campaign.funds)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Secrecy</span>
            <Meter value={campaign.secrecy} tone={secrecyTone} />
            <span className={`stat-value tone-${secrecyTone}-text`}>{campaign.secrecy}</span>
          </div>
        </div>
      </header>

      <aside className="hud-side">
        <Panel title="Installations">
          <ul className="list">
            {campaign.installations.map((i) => (
              <li key={i.id}>
                <button className="list-row" onClick={() => globe()?.flyTo(i.pos, 2.2)}>
                  <span className={`dot dot-${i.kind}`} />
                  <span>{i.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Selection">
          {selection ? (
            <p className="mono">{formatLatLon(selection)}</p>
          ) : (
            <p className="prose dim">Click the globe to inspect a location.</p>
          )}
        </Panel>
        <Panel title="Campaign">
          <p className="prose dim">{difficulty(campaign.difficulty).name} · leads, regions and SIGINT arrive in the next steps.</p>
        </Panel>
      </aside>

      <footer className="hud-hints">
        Drag to rotate · wheel to zoom · Space pause · 1–5 speed · Esc menu
      </footer>

      {menuOpen && (
        <div className="modal-backdrop" onClick={() => setMenuOpen(false)}>
          <Panel title="Paused" className="modal">
            <div className="modal-actions" onClick={(e) => e.stopPropagation()}>
              <button className="menu-button" onClick={() => setMenuOpen(false)}>
                <span className="menu-button-label">Resume</span>
              </button>
              <button className="menu-button" onClick={quitToMenu}>
                <span className="menu-button-label">Quit to Main Menu</span>
              </button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
