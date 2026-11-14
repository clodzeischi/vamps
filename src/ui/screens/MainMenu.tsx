import { useState } from "react";
import { DIFFICULTIES } from "../../data/difficulty";
import { latestSlot, loadFromSlot } from "../../save/storage";
import { Panel } from "../components/Panel";
import { ImportButton, SaveSlots } from "../components/SaveSlots";
import { useStore } from "../store";

type Sub = "none" | "new" | "load" | "settings" | "credits";

export function MainMenu() {
  const [sub, setSub] = useState<Sub>("none");
  const startNew = useStore((s) => s.startNew);
  const loadGame = useStore((s) => s.loadGame);
  const notify = useStore((s) => s.notify);
  const latest = latestSlot();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const toggle = (s: Sub) => setSub((cur) => (cur === s ? "none" : s));

  return (
    <div className="screen main-menu">
      <header className="title-block">
        <div className="title-kicker">Ordo Potestatis Vera</div>
        <h1 className="title">VAMPS</h1>
        <div className="title-rule" />
        <p className="title-tagline">Since Montségur, the Church has kept one fire burning.</p>
      </header>

      <nav className="menu-list">
        <MenuButton label="New Campaign" active={sub === "new"} onClick={() => toggle("new")} />
        <MenuButton
          label="Continue"
          disabled={!latest}
          note={latest ? latest.label : "no saves yet"}
          showNote
          onClick={() => {
            if (!latest) return;
            try {
              loadGame(loadFromSlot(latest.slot));
            } catch (e) {
              notify((e as Error).message, "bad");
            }
          }}
        />
        <MenuButton label="Load Campaign" active={sub === "load"} onClick={() => toggle("load")} />
        <ImportButton />
        <MenuButton label="Settings" active={sub === "settings"} onClick={() => toggle("settings")} />
        <MenuButton label="Credits" active={sub === "credits"} onClick={() => toggle("credits")} />
      </nav>

      {sub === "new" && (
        <Panel title="Choose your burden" className="menu-sub">
          <div className="difficulty-list">
            {DIFFICULTIES.map((d) => (
              <button key={d.id} className="difficulty" onClick={() => startNew(d.id)}>
                <span className="difficulty-name">{d.name}</span>
                <span className="difficulty-blurb">{d.blurb}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}
      {sub === "load" && (
        <Panel title="Load campaign" className="menu-sub">
          <SaveSlots mode="load" />
        </Panel>
      )}
      {sub === "settings" && (
        <Panel title="Settings" className="menu-sub">
          <label className="setting">
            <input type="checkbox" checked={settings.bloom} onChange={(e) => updateSettings({ bloom: e.target.checked })} />
            <span>Bloom (glow on city lights and markers)</span>
          </label>
        </Panel>
      )}
      {sub === "credits" && (
        <Panel title="Credits" className="menu-sub">
          <p className="prose">A game of the secret war, in the tradition of the 1994 X-COM.</p>
          <p className="prose dim">Earth textures: Solar System Scope (CC BY 4.0). Borders and cities: Natural Earth (public domain). Built with Three.js and React.</p>
        </Panel>
      )}

      <footer className="menu-footer">v0.1 · iteration 1 in progress</footer>
    </div>
  );
}

function MenuButton(props: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; note?: string; showNote?: boolean }) {
  return (
    <button
      className={`menu-button${props.active ? " active" : ""}${props.showNote ? " with-note" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.note}
    >
      <span className="menu-button-label">{props.label}</span>
      {(props.disabled || props.showNote) && props.note && <span className="menu-button-note">{props.note}</span>}
    </button>
  );
}
