import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TRACKS } from "../../audio/music";
import { DIFFICULTIES, type DifficultyId } from "../../data/difficulty";
import { latestSlot, loadFromSlot } from "../../save/storage";
import { ImportButton, SaveSlots } from "../components/SaveSlots";
import { VolumeSettings } from "../components/VolumeSettings";
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
  const [tab, setTab] = useState<TabId>("campaign");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Number keys 1-5 jump to a tab, as in the old X-COM screens.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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

function SkirmishTab() {
  return (
    <Section title="Skirmish · tactical test">
      <p className="mm-prose">A single fight on the battlescape, outside the campaign: a town or a farm, a nest, a den or a haven, and a squad of the Order against the thralls.</p>
      <div className="mm-actions">
        <button className="mm-btn mm-btn-primary" onClick={() => useStore.getState().openSkirmish()}>
          To the battlescape
        </button>
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
