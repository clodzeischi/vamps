import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TRACKS } from "../../audio/music";
import { BLOODLINES } from "../../data/bloodlines";
import { DIFFICULTIES, type DifficultyId } from "../../data/difficulty";
import { SITE_KINDS } from "../../sim/missions/common";
import { traitsOf } from "../../tactical/traits";
import { ImportButton, SaveSlots } from "../components/SaveSlots";
import { VolumeSettings } from "../components/VolumeSettings";
import {
  BATTLE_GROUPS,
  bindingsOf,
  GEO_GROUPS,
  keyLabel,
  rebind,
  RESERVED,
  resetScope,
  scopeChanged,
  type BindingGroup,
  type BindingId,
  type BindingScope,
} from "../keys";
import { MOONLIGHT, type SkirmishSetup } from "../settings";
import { nightSight } from "../../tactical/rules";
import { useStore } from "../store";
import { Emblem } from "../components/Emblem";
import "./mainMenu.css";

// The title screen: one compact console with tabs along the top (mainMenu.css).

const TABS = [
  { id: "new", label: "New" },
  { id: "load", label: "Load" },
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.defaultPrevented
      )
        return;
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
      <div className="panel mm-console">
        <header className="mm-head">
          <Emblem size={84} className="mm-emblem" />
          <div className="mm-kicker">Ordo Potestatis Vera</div>
          <h1 className="mm-title">VAMPS</h1>
          <p className="mm-tagline">Global secret war against the forces of darkness.</p>
        </header>

        <div className="mm-tabs" role="tablist" aria-label="Main menu">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
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

        <section
          className="mm-body"
          role="tabpanel"
          id="mm-panel"
          aria-labelledby={`mm-tab-${tab}`}
          key={tab}
        >
          {tab === "new" && <NewTab />}
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

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
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

function NewTab() {
  const startNew = useStore((s) => s.startNew);
  const [pick, setPick] = useState<DifficultyId>("inquisitor");

  return (
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
  );
}

function LoadTab() {
  return (
    <Section title="Saved campaigns" aside={<ImportButton className="mm-btn mm-btn-small" />}>
      <div className="mm-slots">
        <SaveSlots mode="load" />
      </div>
      <p className="mm-note">
        Saves live in this browser. Export one from the pause menu to carry it to another computer,
        then import it here.
      </p>
    </Section>
  );
}

/** A drop-down of the skirmish setup. `off`: it doesn't apply to the rest of the setup (kept in its place, so nothing jumps about). */
function Choice<T extends string | boolean>({
  label,
  value,
  options,
  onPick,
  off = false,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; tip?: string }[];
  onPick: (v: T) => void;
  off?: boolean;
}) {
  const at = options.findIndex((o) => o.id === value);
  return (
    <label className="mm-choice" data-tip={off ? undefined : options[at]?.tip}>
      <span className="mm-choice-label">{label}</span>
      <select
        className="mm-select"
        value={off ? "" : at}
        disabled={off}
        onChange={(e) => onPick(options[Number(e.target.value)]!.id)}
      >
        {off ? (
          <option value="">—</option>
        ) : (
          options.map((o, i) => (
            <option key={i} value={i}>
              {o.label}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

function SkirmishTab() {
  const setup = useStore((s) => s.settings.skirmish);
  const updateSettings = useStore((s) => s.updateSettings);
  const set = (patch: Partial<SkirmishSetup>) =>
    updateSettings({ skirmish: { ...setup, ...patch } });
  return (
    <Section title="Skirmish · tactical test">
      <p className="mm-prose">Configure a custom combat scenario.</p>
      <div className="mm-choices">
        <Choice
          label="Mode"
          value={!!setup.mayhem}
          onPick={(v) => set({ mayhem: v })}
          options={[
            { id: false, label: "Normal" },
            {
              id: true,
              label: "Balls to the walls",
              tip: "All-out war: machine guns, a sniper rifle and rocket launchers for six operatives; thralls as well armed; vampires with guns, three times the health and much faster; everyone awake, the town already burning",
            },
          ]}
        />
        <Choice
          label="Kit"
          off={!!setup.mayhem}
          value={setup.kit}
          onPick={(v) => set({ kit: v })}
          options={[
            {
              id: "plainclothes",
              label: "Plainclothes",
              tip: "Pistols, no armour, no incendiaries. Starts concealed, unless the helicopter gives us away",
            },
            {
              id: "tactical",
              label: "Tactical",
              tip: "Rifles and a shotgun, armour, an incendiary each. Seen at once",
            },
          ]}
        />
        <Choice
          label="Ground"
          value={setup.setting}
          onPick={(v) => set({ setting: v })}
          options={[
            { id: "urban", label: "Town" },
            { id: "rural", label: "Farm" },
            {
              id: "apartments",
              label: "Apartments",
              tip: "A tall block, floor on floor; a helicopter drops the team on the roof",
            },
            {
              id: "industrial",
              label: "Industrial",
              tip: "A warehouse yard, the blood bank below",
            },
          ]}
        />
        <Choice
          label="Landmark"
          off={setup.setting !== "urban"}
          value={setup.landmark}
          onPick={(v) => set({ landmark: v })}
          options={[
            { id: "none", label: "None" },
            { id: "hospital", label: "Hospital", tip: "The vampires hold the hospital" },
            { id: "store", label: "Supermarket", tip: "The vampires hold the supermarket" },
          ]}
        />
        <Choice
          label="Time"
          value={setup.night}
          onPick={(v) => set({ night: v })}
          options={[
            {
              id: true,
              label: "Night",
              tip: "Vampires see in the dark; we see 7 to 11 tiles by the moon, or 16 to anything lit",
            },
            {
              id: false,
              label: "Day",
              tip: "Vampires keep indoors (the sun burns them); torpor lasts longer",
            },
          ]}
        />
        <Choice
          label="Moon"
          off={!setup.night}
          value={setup.moon}
          onPick={(v) => set({ moon: v })}
          options={(["new", "half", "full"] as const).map((id) => ({
            id,
            label: { new: "New", half: "Half", full: "Full" }[id],
            tip: `We see ${nightSight(MOONLIGHT[id])} tiles in the dark`,
          }))}
        />
        <Choice
          label="Weather"
          value={setup.winter ? "snow" : setup.rain ? "rain" : "clear"}
          onPick={(v) => set({ winter: v === "snow", rain: v === "rain" })}
          options={[
            { id: "clear", label: "Clear" },
            { id: "rain", label: "Rain", tip: "A drizzle; the streets wet, puddles in the road" },
            { id: "snow", label: "Snow", tip: "Snow on the ground" },
          ]}
        />
        <Choice
          label="Arrival"
          value={setup.arrival}
          onPick={(v) => set({ arrival: v })}
          options={[
            {
              id: "helicopter",
              label: "Helicopter",
              tip: "Drops the team and leaves; everyone hears it. Comes back after a win and lifts every crate",
            },
            { id: "jet", label: "Jet", tip: "Lands at an airfield; we arrive by road, quietly" },
          ]}
        />
        <Choice
          label="Site"
          value={setup.size}
          onPick={(v) => set({ size: v })}
          options={(["nest", "den", "haven", "lair"] as const).map((s) => ({
            id: s,
            label: SITE_KINDS[s].name,
            tip: `${SITE_KINDS[s].thralls} thralls, ${SITE_KINDS[s].vampires} vampires`,
          }))}
        />
        <Choice
          label="Bloodline"
          value={setup.bloodline}
          onPick={(v) => set({ bloodline: v })}
          options={BLOODLINES.map((x) => ({ id: x.id, label: x.short, tip: traitsOf(x.id).note }))}
        />
        <Choice
          label="Rescue"
          value={setup.hostage}
          onPick={(v) => set({ hostage: v })}
          options={[
            { id: false, label: "None" },
            {
              id: true,
              label: "A prisoner",
              tip: "Someone is held near the vampires: free them (stand next to them), and get them out alive",
            },
          ]}
        />
      </div>
      <div className="mm-actions">
        <button
          className="mm-btn mm-btn-primary"
          onClick={() => useStore.getState().openSkirmish()}
        >
          Deploy
        </button>
      </div>
    </Section>
  );
}

/** One screen's keys: click one, then press the new key (Esc cancels). Taking a key in use on the same screen swaps the two. */
function KeyBindings({
  title,
  groups,
  scope,
  note,
}: {
  title: string;
  groups: BindingGroup[];
  scope: BindingScope;
  note: string;
}) {
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
    <Section
      title={title}
      aside={
        <button
          className="mm-btn mm-btn-small"
          disabled={!scopeChanged(keys, scope)}
          onClick={() => updateSettings({ keys: resetScope(keys, scope) })}
        >
          Defaults
        </button>
      }
    >
      <p className="mm-note">{note}</p>
      <div className="mm-keys">
        {groups.map((g) => (
          <div key={g.title} className="mm-key-group">
            <h3 className="mm-key-group-title">{g.title}</h3>
            {g.items.map((it) => (
              <div key={it.id} className="mm-key-row" data-tip={it.note}>
                <span className="mm-key-label">{it.label}</span>
                <button
                  className={`mm-key${listening === it.id ? " listening" : ""}`}
                  onClick={() => setListening(listening === it.id ? null : it.id)}
                >
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
          <input
            type="checkbox"
            checked={settings.bloom}
            onChange={(e) => updateSettings({ bloom: e.target.checked })}
          />
          <span>Bloom (glow on city lights and markers)</span>
        </label>
      </Section>
      <KeyBindings
        title="Geoscape keys"
        groups={GEO_GROUPS}
        scope="geo"
        note="Click a key, then press the new one (Esc cancels; Esc itself always closes what's open). Drag to turn the globe, wheel to zoom."
      />
      <KeyBindings
        title="Battlescape keys"
        groups={BATTLE_GROUPS}
        scope="battle"
        note="Mouse: left click selects an operative or attacks, right click moves; right-drag pans, middle-drag turns and tilts the camera, the wheel changes level. The same key can do one thing on the globe and another in battle."
      />
    </div>
  );
}

function CreditsTab() {
  return (
    <Section title="Credits">
      <div className="mm-credits">
        <p className="mm-prose">A game of the secret war, in the tradition of the 1994 X-COM.</p>
        <p className="mm-prose dim">
          Earth textures: Solar System Scope (CC BY 4.0). Borders and cities: Natural Earth (public
          domain). Icons:{" "}
          <a href="https://game-icons.net" target="_blank" rel="noreferrer">
            game-icons.net
          </a>{" "}
          by Lorc, Delapouite and contributors (
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
            CC BY 3.0
          </a>
          ). Sound effects:{" "}
          <a
            href="https://opengameart.org/content/zippo-click-sound"
            target="_blank"
            rel="noreferrer"
          >
            Zippo Click Sound
          </a>{" "}
          by dawith and the{" "}
          <a
            href="https://opengameart.org/content/atmospheric-interaction-sound-pack"
            target="_blank"
            rel="noreferrer"
          >
            Krank sound pack
          </a>{" "}
          by legoluft (CC0); Helicopter Sound 8D by dragon-studio,{" "}
          <a
            href="https://pixabay.com/sound-effects/birds-chirping-ambiance-26052/"
            target="_blank"
            rel="noreferrer"
          >
            Birds Chirping Ambiance
          </a>{" "}
          by freesound_community,{" "}
          <a
            href="https://pixabay.com/sound-effects/abstract-crickets-395138/"
            target="_blank"
            rel="noreferrer"
          >
            Abstract Crickets
          </a>{" "}
          by blender_abstract,{" "}
          <a
            href="https://pixabay.com/sound-effects/light-rain-ambient-114354/"
            target="_blank"
            rel="noreferrer"
          >
            Light Rain Ambient
          </a>{" "}
          by soundsforyou,{" "}
          <a
            href="https://pixabay.com/sound-effects/street-ambience-traffic-410714/"
            target="_blank"
            rel="noreferrer"
          >
            Street Ambience Traffic
          </a>{" "}
          by yuk1to,{" "}
          <a
            href="https://pixabay.com/sound-effects/wind-sounds-429228/"
            target="_blank"
            rel="noreferrer"
          >
            Wind Sounds
          </a>{" "}
          by dragon-studio; gunfire: Pistol Shot and Shotgun Blast by universfield, Silenced Sniper
          Rifle and Pistol Cock by freesound_community, M249 Sound Effects by sovetsky_rastov72, Gun
          Shoot by u_2n07b18i8q; explosions: Epic Cinematic Explosion by universfield, Explosion FX
          by soundreality, Rocket Launch by freesound_community, Bang by dragon-studio, Knife
          Killing Sound by randomahhaccount (Pixabay Content License); sounds (c) by Michel
          Baradari,{" "}
          <a href="https://apollo-music.de" target="_blank" rel="noreferrer">
            apollo-music.de
          </a>{" "}
          (
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
            CC BY 3.0
          </a>
          ). Built with Three.js and React.
        </p>
        <p className="mm-prose dim">
          Music:{" "}
          {Object.values(TRACKS).map((t, i) => (
            <span key={t.file}>
              {i > 0 && "; "}
              <a href={t.url} target="_blank" rel="noreferrer">
                {t.title}
              </a>{" "}
              by {t.author} ({t.license})
            </span>
          ))}
          . The Cynic Project:{" "}
          <a href="https://cynicmusic.com" target="_blank" rel="noreferrer">
            cynicmusic.com
          </a>
          ,{" "}
          <a href="https://pixelsphere.org" target="_blank" rel="noreferrer">
            pixelsphere.org
          </a>
          . Matthew Pablo:{" "}
          <a href="http://www.matthewpablo.com" target="_blank" rel="noreferrer">
            matthewpablo.com
          </a>
          .
        </p>
      </div>
    </Section>
  );
}
