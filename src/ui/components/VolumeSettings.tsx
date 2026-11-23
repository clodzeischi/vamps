import type { Settings } from "../settings";
import { useStore } from "../store";

type VolumeKey = "masterVolume" | "musicVolume" | "sfxVolume" | "ambientVolume";

function Slider({ label, setting }: { label: string; setting: VolumeKey }) {
  const volume = useStore((s) => s.settings[setting]);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <label className="setting setting-range">
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)}
        onChange={(e) => updateSettings({ [setting]: Number(e.target.value) / 100 } as Partial<Settings>)} />
      <span className="setting-value">{volume ? `${Math.round(volume * 100)}%` : "Off"}</span>
    </label>
  );
}

/** Master, music, sound-effect and ambience volume. */
export function VolumeSettings() {
  return (
    <div className="setting-group">
      <Slider label="Master volume" setting="masterVolume" />
      <Slider label="Music" setting="musicVolume" />
      <Slider label="Sound effects" setting="sfxVolume" />
      <Slider label="Ambience" setting="ambientVolume" />
    </div>
  );
}
