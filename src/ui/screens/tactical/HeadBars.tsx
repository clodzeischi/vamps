// The bar over each unit's head: health, and for a seen enemy the chance to hit, growing into its card on hover.
import { WEAPONS } from "../../../tactical/rules";
import { HEALTH_ENEMY, healthColor } from "../../../render/health";
import { aimPoint } from "../../../tactical/ballistics";
import {
  oddsAgainst,
  seenByAgents,
  modesOf,
  leanFor,
  aimFrom,
  type Battle,
  type ShotMode,
  type Unit,
} from "../../../tactical/battle";
import { atRisk } from "../../../tactical/commands";
import { Icon } from "../../components/Icon";
import { cepAt, metres } from "./shotTip";
import { HpFill } from "./bars";

/** What one bar over a head shows: copied out of the battle, so it holds still during playback. */
export interface HeadInfo {
  id: string;
  name: string;
  kind: string;
  enemy: boolean;
  hp: number;
  maxHp: number;
  /** Turns until it rises, for a vampire in torpor. */
  torpor?: number;
  /** Instead of the bar, for a body lying down: torpor, bleeding, stable. */
  lying?: { text: string; tone: "good" | "warn" | "bad" };
  tags: string[];
  weapon?: { icon: Unit["weapon"]; name: string; damage: [number, number] };
  /** The selected agent's shot at this enemy, when it can take one: the cone there in each mode (CEP radius, metres), the crit, notes. */
  odds?: {
    modes: { mode: ShotMode; cep: number }[];
    crit: number;
    notes: string[];
    melee: boolean;
    by: string;
  };
  /** Why there's no shot for a seen enemy. */
  noShot?: string;
}

const KIND_NAMES: Record<Unit["kind"], string> = {
  vampire: "Vampire",
  thrall: "Thrall",
  agent: "Operative",
  civilian: "Civilian",
  hostage: "Prisoner",
};

/** The bars to draw: every unit the team sees, not civilians, the dead or those gone. */
export function headInfos(b: Battle, me: Unit | undefined, foes: Unit[]): HeadInfo[] {
  const out: HeadInfo[] = [];
  for (const u of b.units) {
    if (u.kind === "civilian" || !u.alive || u.evacuated || u.captured) continue;
    if (u.side !== "agent" && !seenByAgents(b, u, u)) continue;
    const enemy = u.side === "enemy";
    const w = WEAPONS[u.weapon];
    const h: HeadInfo = {
      id: u.id,
      name: u.name,
      kind: KIND_NAMES[u.kind],
      enemy,
      hp: u.hp,
      maxHp: u.maxHp,
      tags: [
        u.side === "enemy" && u.overwatch ? "REACT" : "",
        u.side === "agent" && u.sneak ? "SNEAK" : "",
        u.dominated ? "DOM" : "",
      ].filter(Boolean),
      weapon: u.kind === "hostage" ? undefined : { icon: u.weapon, name: w.name, damage: w.damage },
    };
    if (u.torpor) {
      h.lying = { text: `Torpor · ${u.torpor}`, tone: "bad" };
      h.torpor = u.torpor;
    } else if (u.bleeding > 0) h.lying = { text: `Bleeding · ${u.bleeding}`, tone: "warn" };
    else if (u.stable) h.lying = { text: "Stable", tone: "good" };
    if (enemy && me && foes.includes(u)) {
      // In the fire mode chosen (a click shoots in it); the card lists every mode the weapon has.
      const melee = !!WEAPONS[me.weapon].melee;
      const cur = oddsAgainst(b, me, u, me, false, me.mode);
      const from = aimFrom(b, me, u);
      const at = aimPoint(b.map, u, u.kind, from);
      const risk = melee ? [] : atRisk(b, me, u);
      h.odds = {
        crit: cur.crit,
        melee,
        by: me.name,
        modes: melee
          ? []
          : modesOf(me).map((mode) => ({ mode, cep: cepAt(b, me, at, from, mode).radius })),
        notes: [
          cur.flanked ? "Flanked" : "",
          leanFor(b, me, u) ? "Leaning out" : "",
          risk.length ? `${risk.map((v) => v.name).join(", ")} in the line of fire` : "",
        ].filter(Boolean),
      };
    } else if (enemy && me && !u.torpor) h.noShot = `${me.name} has no line of fire`;
    out.push(h);
  }
  return out;
}

/**
 * The bar over one unit's head (placed by BattleView every frame). Small: the
 * health bar, and for an enemy the chance to hit it. Hovering an enemy grows
 * it into its card: name, health, weapon, the chances and why.
 */
export function HeadBar({ h, open }: { h: HeadInfo; open: boolean }) {
  const pct = h.maxHp > 0 ? (100 * Math.max(0, h.hp)) / h.maxHp : 0;
  return (
    <div className="head" data-unit={h.id}>
      <div className={`head-box${open ? " open" : ""}${h.enemy ? " enemy" : ""}`}>
        <div className="head-more">
          <div className="head-more-inner">
            <div className="head-title">
              <span className="head-name">{h.name}</span>
              {h.name !== h.kind && <span className="head-kind">{h.kind}</span>}
            </div>
            {h.lying ? (
              <div className="head-line">
                {h.torpor
                  ? `In torpor: rises in ${h.torpor} turn${h.torpor === 1 ? "" : "s"}. Finish it, burn it, or take it alive.`
                  : h.lying.text}
              </div>
            ) : (
              <div className="head-line head-hp">
                <span>Vitality</span>
                <b>
                  {Math.max(0, h.hp)}/{h.maxHp}
                </b>
              </div>
            )}
            {h.weapon && (
              <div className="head-line">
                <Icon name={h.weapon.icon} size={14} /> {h.weapon.name} · {h.weapon.damage[0]}–
                {h.weapon.damage[1]} damage
              </div>
            )}
            {h.odds ? (
              <div className="head-odds">
                <div className="head-chances">
                  {h.odds.melee ? (
                    <span>Within reach of a blow</span>
                  ) : (
                    h.odds.modes.map((m) => (
                      <span key={m.mode} data-tip="Half the rounds land within this of the aim">
                        <b>±{metres(m.cep)}</b> {m.mode === "burst" ? "burst (each)" : m.mode}
                      </span>
                    ))
                  )}
                  <span className="head-crit">{h.odds.crit}% crit</span>
                </div>
                {h.odds.notes.length > 0 && (
                  <div className="head-why">
                    {h.odds.by}: {h.odds.notes.join(" · ")}
                  </div>
                )}
              </div>
            ) : h.noShot ? (
              <div className="head-line dim">{h.noShot}</div>
            ) : null}
          </div>
        </div>
        <div className="head-row">
          {h.lying ? (
            <span className={`head-lying ${h.lying.tone}`}>{h.lying.text}</span>
          ) : (
            <span className="head-track hp-track">
              <HpFill pct={pct} color={h.enemy ? HEALTH_ENEMY : healthColor(h.hp, h.maxHp)} />
            </span>
          )}
          {h.tags.length > 0 && (
            <span className="head-side">
              {h.tags.map((t) => (
                <span key={t} className="head-tag">
                  {t}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
