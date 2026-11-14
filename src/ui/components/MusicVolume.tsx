import { useStore } from "../store";

export function MusicVolume() {
  const volume = useStore((s) => s.settings.musicVolume);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <label className="setting setting-range">
      <span>Music</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)}
        onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) / 100 })} />
      <span className="setting-value">{volume ? `${Math.round(volume * 100)}%` : "Off"}</span>
    </label>
  );
}
