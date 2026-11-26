// Health and time-unit bars, for the squad cards and the bars over heads.
import { HEALTH_ENEMY, healthColor } from "../../../render/health";
import { attackCost, type Unit } from "../../../tactical/battle";

/** The inside of a health bar: the fill, and behind it a white ghost that lags it down (CSS). */
export function HpFill({ pct, color }: { pct: number; color: string }) {
  return (
    <>
      <i className="hp-ghost" style={{ width: `${pct}%` }} />
      <i className="hp-fill" style={{ width: `${pct}%`, background: color }} />
    </>
  );
}

/** Health as a number and a bar, coloured by damage (or always red for an enemy). */
export function HpBar({ hp, max, enemy }: { hp: number; max: number; enemy?: boolean }) {
  const pct = max > 0 ? (100 * Math.max(0, hp)) / max : 0;
  return (
    <span className="unit-bar">
      <span className="unit-bar-label">HP</span>
      <span className="unit-bar-num">
        {Math.max(0, hp)}/{max}
      </span>
      <span className="unit-bar-track hp-track">
        <HpFill pct={pct} color={enemy ? HEALTH_ENEMY : healthColor(hp, max)} />
      </span>
    </span>
  );
}

/**
 * An agent's time units as a number and a bar: blue while there's time to
 * move and still attack, gold for the attack's reserve, dark for what's spent.
 */
export function TuBar({ u }: { u: Unit }) {
  const left = Math.max(0, u.tu);
  const reserve = Math.min(left, attackCost(u));
  const pct = (n: number) => `${(100 * n) / Math.max(1, u.maxTu)}%`;
  return (
    <span className="unit-bar">
      <span className="unit-bar-label">TU</span>
      <span className="unit-bar-num">
        {left}/{u.maxTu}
      </span>
      <span className="unit-bar-track">
        <i className="move" style={{ width: pct(left - reserve) }} />
        <i className="keep" style={{ width: pct(reserve) }} />
      </span>
    </span>
  );
}
