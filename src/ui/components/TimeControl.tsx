import { formatClock, formatDate, moonPhase, weekday } from "../../sim/time";
import { bindingsOf, keyLabel } from "../keys";
import { SPEEDS, useGame, useStore } from "../store";

// A half dial on the right edge of the screen. Angles are clockwise from
// the top; the centre sits on the edge.
const W = 154, X = W, Y = 156;
const at = (r: number, deg: number): [number, number] => [X + r * Math.sin((deg * Math.PI) / 180), Y - r * Math.cos((deg * Math.PI) / 180)];
/** A band between two radii, from one angle to another (under half a turn). */
function band(inner: number, outer: number, from: number, to: number): string {
  const p = (r: number, a: number) => at(r, a).map((v) => v.toFixed(2)).join(" ");
  return `M${p(outer, from)}A${outer} ${outer} 0 0 1 ${p(outer, to)}L${p(inner, to)}A${inner} ${inner} 0 0 0 ${p(inner, from)}Z`;
}
const FASTER = band(109, 147, 299, 358), PAUSE = band(109, 147, 242, 298), SLOWER = band(109, 147, 182, 241);
const PIPS = SPEEDS.map((_, i) => band(98, 103, 225 + i * 22.5 + 1.2, 225 + (i + 1) * 22.5 - 1.2));
const PLUS = at(128, 328), MINUS = at(128, 212);
const TEXT_X = X - 51;

/** The moon's lit part, as seen from the north. */
function moonPath(phase: number, x: number, y: number, r: number): string {
  const k = Math.cos(2 * Math.PI * phase), waxing = phase < 0.5;
  return `M${x} ${y - r}A${r} ${r} 0 0 ${waxing ? 1 : 0} ${x} ${y + r}A${Math.abs(k) * r} ${r} 0 0 ${k > 0 === waxing ? 0 : 1} ${x} ${y - r}Z`;
}

function DialButton({ d, label, tip, className = "", disabled = false, onClick, children }: {
  d: string; label: string; tip: string; className?: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <g className={`dial-btn ${className}`} role="button" aria-label={label} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} data-tip={tip}
      onClick={() => !disabled && onClick()} onKeyDown={(e) => { if (e.key === "Enter" && !disabled) onClick(); }}>
      <path className="dial-key" d={d} />
      {children}
    </g>
  );
}

/** The geoscape's clock: date, time and moon, play or pause, and the interval with + and −. */
export function TimeControl({ blocked }: { blocked: boolean }) {
  const { time } = useGame();
  const { speed, paused, togglePause, stepSpeed } = useStore();
  const keys = bindingsOf(useStore((s) => s.settings.keys));
  const interval = SPEEDS[speed]!;
  const moon = moonPhase(time);
  return (
    <div className={`hud-time${blocked ? " blocked" : ""}${paused ? " paused" : ""}`} role="group" aria-label="Time">
      <svg width={W} height={Y * 2}>
        <defs>
          <linearGradient id="dial-plaque" x2="0" y2="1"><stop stopColor="#3f3b4c" /><stop offset="1" stopColor="#2a2633" /></linearGradient>
          <linearGradient id="dial-hover" x2="0" y2="1"><stop stopColor="#5a546d" /><stop offset="1" stopColor="#3b3649" /></linearGradient>
          <linearGradient id="dial-blood" x2="0" y2="1"><stop stopColor="#d0444c" /><stop offset=".5" stopColor="#a3242c" /><stop offset="1" stopColor="#6e141a" /></linearGradient>
        </defs>
        <path className="dial-face" d={`M${X} ${Y - 152}A152 152 0 0 0 ${X} ${Y + 152}Z`} />
        <DialButton d={FASTER} label="Faster" tip={`Faster (${keyLabel(keys.geoFaster)})`} disabled={speed === SPEEDS.length - 1} onClick={() => stepSpeed(1)}>
          <path className="dial-glyph" d={`M${PLUS[0] - 7} ${PLUS[1]}h14m-7-7v14`} />
        </DialButton>
        <DialButton d={PAUSE} label={paused ? "Play" : "Pause"} tip={`${paused ? "Play" : "Pause"} (${keyLabel(keys.geoPause)})`} className={paused ? "stopped" : ""} onClick={togglePause}>
          <path className="dial-glyph solid" transform={`translate(${X - 128 - 9.6} ${Y - 9.6}) scale(1.2)`} d={paused ? "M4 1 15 8 4 15Z" : "M3 1h4v14H3ZM9 1h4v14H9Z"} />
        </DialButton>
        <DialButton d={SLOWER} label="Slower" tip={`Slower (${keyLabel(keys.geoSlower)})`} disabled={speed === 0} onClick={() => stepSpeed(-1)}>
          <path className="dial-glyph" d={`M${MINUS[0] - 7} ${MINUS[1]}h14`} />
        </DialButton>
        {PIPS.map((d, i) => <path key={i} className={`dial-pip${i <= speed ? " on" : ""}`} d={d} />)}
        <g data-tip={`${moon.name}\n${Math.round(moon.lit * 100)}% lit`}>
          <circle className="moon-dark" cx={TEXT_X} cy={Y - 52} r={16} />
          <path className="moon-lit" d={moonPath(moon.phase, TEXT_X, Y - 52, 16)} />
        </g>
        <g data-tip={`${weekday(time)}, ${formatDate(time)}\n${formatClock(time)}`}>
          <text className="dial-clock" x={TEXT_X} y={Y + 2}>{formatClock(time).replace(" UTC", "")}</text>
          <text className="dial-date" x={TEXT_X} y={Y + 21}>{formatDate(time)}</text>
        </g>
        <text className="time-value" x={TEXT_X} y={Y + 51} data-tip={`${interval.long} of game time a second`}>{interval.label}</text>
      </svg>
    </div>
  );
}
