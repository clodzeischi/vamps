import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TRACKS } from "../../audio/music";
import { BLOODLINES } from "../../data/bloodlines";
import { DIFFICULTIES, type DifficultyId } from "../../data/difficulty";
import { SITE_KINDS } from "../../sim/missions";
import { traitsOf } from "../../tactical/traits";
import { latestSlot, loadFromSlot } from "../../save/storage";
import { ImportButton, SaveSlots } from "../components/SaveSlots";
import { VolumeSettings } from "../components/VolumeSettings";
import { BATTLE_GROUPS, bindingsOf, GEO_GROUPS, keyLabel, rebind, RESERVED, resetScope, scopeChanged, type BindingGroup, type BindingId, type BindingScope } from "../keys";
import type { SkirmishSetup } from "../settings";
import { useStore } from "../store";
import "./mainMenu.css";

// The title screen: one compact console with tabs along the top (mainMenu.css).

const TABS = [
  { id: "campaign", label: "Campaign" },
  { id: "load", label: "Archive" },
  { id: "skirmish", label: "Skirmish" },
  { id: "settings", label: "Settings" },
  { id: "credits", label: "Credits" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function MainMenu() {
  const [tab, setTab] = useState<TabId>(() => useStore.getState().menuTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Number keys 1-5 jump to a tab, as in the old X-COM screens.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.defaultPrevented) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) setTab(TABS[i]!.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + TABS.length) % TABS.length;
    setTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="screen mm">
      <div className="mm-console">
        <i className="mm-rivet mm-rivet-tl" /><i className="mm-rivet mm-rivet-tr" />
        <i className="mm-rivet mm-rivet-bl" /><i className="mm-rivet mm-rivet-br" />

        <header className="mm-head">
          <div className="mm-kicker">Ordo Potestatis Vera</div>
          <h1 className="mm-title">VAMPS</h1>
          <p className="mm-tagline">Global secret war against the forces of darkness.</p>
        </header>

        <div className="mm-tabs" role="tablist" aria-label="Main menu">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[i] = el; }}
              role="tab"
              id={`mm-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="mm-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className={`mm-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <span className="mm-tab-key">{i + 1}</span>
              <span className="mm-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <section className="mm-body" role="tabpanel" id="mm-panel" aria-labelledby={`mm-tab-${tab}`} key={tab}>
          {tab === "campaign" && <CampaignTab />}
          {tab === "load" && <LoadTab />}
          {tab === "skirmish" && <SkirmishTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "credits" && <CreditsTab />}
        </section>

        <footer className="mm-foot">
          <span>v0.1 · iteration 1 in progress</span>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mm-section">
      <div className="mm-section-head">
        <h2 className="mm-section-title">{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  );
}

function CampaignTab() {
  const startNew = useStore((s) => s.startNew);
  const loadGame = useStore((s) => s.loadGame);
  const notify = useStore((s) => s.notify);
  const [pick, setPick] = useState<DifficultyId>("inquisitor");
  const latest = latestSlot();

  return (
    <div className="mm-campaign">
      <Section title="Continue">
        <div className="mm-continue">
          <div className="mm-continue-info">
            {latest ? (
              <>
                <span className="mm-continue-label">{latest.label}</span>
                <span className="mm-continue-date">saved {new Date(latest.savedAt).toLocaleString()}</span>
              </>
            ) : (
              <span className="mm-continue-label dim">No campaign in this browser yet.</span>
            )}
          </div>
          <button
            className="mm-btn mm-btn-primary"
            disabled={!latest}
            onClick={() => {
              if (!latest) return;
              try {
                loadGame(loadFromSlot(latest.slot));
              } catch (e) {
                notify((e as Error).message, "bad");
              }
            }}
          >
            Continue
          </button>
        </div>
      </Section>

      <Section title="New campaign · choose your burden">
        <div className="mm-difficulties" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              role="radio"
              aria-checked={pick === d.id}
              className={`mm-difficulty${pick === d.id ? " active" : ""}`}
              onClick={() => setPick(d.id)}
              onDoubleClick={() => startNew(d.id)}
            >
              <span className="mm-check" aria-hidden />
              <span className="mm-difficulty-name">{d.name}</span>
              <span className="mm-difficulty-blurb">{d.blurb}</span>
            </button>
          ))}
        </div>
        <div className="mm-actions">
          <button className="mm-btn mm-btn-primary" onClick={() => startNew(pick)}>
            Begin the war
          </button>
        </div>
      </Section>
    </div>
  );
}

function LoadTab() {
  return (
    <Section title="Saved campaigns" aside={<ImportButton className="mm-btn mm-btn-small" />}>
      <div className="mm-slots">
        <SaveSlots mode="load" />
      </div>
      <p className="mm-note">Saves live in this browser. Export one from the pause menu to carry it to another computer, then import it here.</p>
    </Section>
  );
}

/** One row of choices: chips, one of them pressed. */
function Choice<T extends string | boolean>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string; tip?: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="mm-choice" role="radiogroup" aria-label={label}>
      <span className="mm-choice-label">{label}</span>
      <span className="mm-chips">
        {options.map((o) => (
          <button key={String(o.id)} role="radio" aria-checked={value === o.id} className={`mm-chip${value === o.id ? " active" : ""}`} data-tip={o.tip} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

function SkirmishTab() {
  const setup = useStore((s) => s.settings.skirmish);
  const updateSettings = useStore((s) => s.updateSettings);
  const set = (patch: Partial<SkirmishSetup>) => updateSettings({ skirmish: { ...setup, ...patch } });
  return (
    <Section title="Skirmish · tactical test">
      <p className="mm-prose">Configure a custom combat scenario.</p>
      <div className="mm-choices">
        <Choice label="Ground" value={setup.setting} onPick={(v) => set({ setting: v })} options={[
          { id: "urban", label: "Town" },
          { id: "rural", label: "Farm" },
          { id: "apartments", label: "Apartments", tip: "A tall block, floor on floor; a helicopter sets down on the roof" },
          { id: "industrial", label: "Industrial", tip: "A warehouse yard, the blood bank below" },
        ]} />
        {setup.setting === "urban" && (
          <Choice label="Landmark" value={setup.landmark} onPick={(v) => set({ landmark: v })} options={[
            { id: "none", label: "None" },
            { id: "hospital", label: "Hospital", tip: "The vampires hold the hospital" },
            { id: "store", label: "Supermarket", tip: "The vampires hold the supermarket" },
          ]} />
        )}
        <Choice label="Season" value={setup.winter} onPick={(v) => set({ winter: v })} options={[
          { id: false, label: "Summer" },
          { id: true, label: "Winter", tip: "Snow on the ground" },
        ]} />
        <Choice label="Site" value={setup.size} onPick={(v) => set({ size: v })}
          options={(["nest", "den", "haven", "lair"] as const).map((s) => ({ id: s, label: SITE_KINDS[s].name, tip: `${SITE_KINDS[s].thralls} thralls, ${SITE_KINDS[s].vampires} vampires` }))} />
        <Choice label="Bloodline" value={setup.bloodline} onPick={(v) => set({ bloodline: v })}
          options={BLOODLINES.map((x) => ({ id: x.id, label: x.short, tip: `${x.name}: ${traitsOf(x.id).note}` }))} />
        <Choice label="Time" value={setup.night} onPick={(v) => set({ night: v })} options={[
          { id: true, label: "Night", tip: "Vampires see in the dark; we see 9 tiles, or 16 to anything lit" },
          { id: false, label: "Day", tip: "Vampires keep indoors (the sun burns them); torpor lasts longer" },
        ]} />
        <Choice label="Kit" value={setup.kit} onPick={(v) => set({ kit: v })} options={[
          { id: "plainclothes", label: "Plainclothes", tip: "Pistols, no armour, no incendiaries. Starts concealed, unless the helicopter gives us away" },
          { id: "tactical", label: "Tactical", tip: "Rifles and a shotgun, armour, an incendiary each. Seen at once" },
        ]} />
        <Choice label="Arrival" value={setup.arrival} onPick={(v) => set({ arrival: v })} options={[
          { id: "helicopter", label: "Helicopter", tip: "Lands on the map: everyone hears it" },
          { id: "jet", label: "Jet", tip: "Lands at an airfield; we arrive by road, quietly" },
        ]} />
        <Choice label="Rescue" value={setup.hostage} onPick={(v) => set({ hostage: v })} options={[
          { id: false, label: "None" },
          { id: true, label: "A prisoner", tip: "Someone is held near the vampires: free them (stand next to them), and get them out alive" },
        ]} />
      </div>
      <div className="mm-actions">
        <button className="mm-btn mm-btn-primary" onClick={() => useStore.getState().openSkirmish()}>
          Deploy
        </button>
      </div>
    </Section>
  );
}

/** One screen's keys: click one, then press the new key (Esc cancels). Taking a key in use on the same screen swaps the two. */
function KeyBindings({ title, groups, scope, note }: { title: string; groups: BindingGroup[]; scope: BindingScope; note: string }) {
  const saved = useStore((s) => s.settings.keys);
  const updateSettings = useStore((s) => s.updateSettings);
  const keys = bindingsOf(saved);
  const [listening, setListening] = useState<BindingId | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") return setListening(null);
      if (RESERVED.has(e.code)) return;
      updateSettings({ keys: rebind(keys, listening, e.code) });
      setListening(null);
    };
    // Capture, so the menu's number keys don't also change the tab.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, keys, updateSettings]);

  return (
    <Section title={title} aside={<button className="mm-btn mm-btn-small" disabled={!scopeChanged(keys, scope)} onClick={() => updateSettings({ keys: resetScope(keys, scope) })}>Defaults</button>}>
      <p className="mm-note">{note}</p>
      <div className="mm-keys">
        {groups.map((g) => (
          <div key={g.title} className="mm-key-group">
            <h3 className="mm-key-group-title">{g.title}</h3>
            {g.items.map((it) => (
              <div key={it.id} className="mm-key-row" data-tip={it.note}>
                <span className="mm-key-label">{it.label}</span>
                <button className={`mm-key${listening === it.id ? " listening" : ""}`} onClick={() => setListening(listening === it.id ? null : it.id)}>
                  {listening === it.id ? "Press a key…" : keyLabel(keys[it.id])}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

function SettingsTab() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <div className="mm-settings">
      <Section title="Sound">
        <VolumeSettings />
      </Section>
      <Section title="Graphics">
        <label className="setting">
          <input type="checkbox" checked={settings.bloom} onChange={(e) => updateSettings({ bloom: e.target.checked })} />
          <span>Bloom (glow on city lights and markers)</span>
        </label>
      </Section>
      <KeyBindings title="Geoscape keys" groups={GEO_GROUPS} scope="geo" note="Click a key, then press the new one (Esc cancels; Esc itself always closes what's open). Drag to turn the globe, wheel to zoom." />
      <KeyBindings title="Battlescape keys" groups={BATTLE_GROUPS} scope="battle" note="Mouse: left click selects an agent or attacks, right click moves; right-drag pans, middle-drag turns and tilts the camera, the wheel changes level. The same key can do one thing on the globe and another in battle." />
    </div>
  );
}

function CreditsTab() {
  return (
    <Section title="Credits">
      <div className="mm-credits">
        <p className="mm-prose">A game of the secret war, in the tradition of the 1994 X-COM.</p>
        <p className="mm-prose dim">Earth textures: Solar System Scope (CC BY 4.0). Borders and cities: Natural Earth (public domain). Icons: <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a> by Lorc, Delapouite and contributors (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>). Sound effects: <a href="https://opengameart.org/content/zippo-click-sound" target="_blank" rel="noreferrer">Zippo Click Sound</a> by dawith and the <a href="https://opengameart.org/content/atmospheric-interaction-sound-pack" target="_blank" rel="noreferrer">Krank sound pack</a> by legoluft (CC0). Built with Three.js and React.</p>
        <p className="mm-prose dim">
          Music:{" "}
          {Object.values(TRACKS).map((t, i) => (
            <span key={t.file}>
              {i > 0 && "; "}
              <a href={t.url} target="_blank" rel="noreferrer">{t.title}</a> by {t.author} ({t.license})
            </span>
          ))}
          . The Cynic Project: <a href="https://cynicmusic.com" target="_blank" rel="noreferrer">cynicmusic.com</a>, <a href="https://pixelsphere.org" target="_blank" rel="noreferrer">pixelsphere.org</a>.
        </p>
      </div>
    </Section>
  );
}
