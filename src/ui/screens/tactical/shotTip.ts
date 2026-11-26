// The tooltip on a shot: the odds, the spread (CEP) at the target, who else is in the line of fire.
import { type Pt3 } from "../../../tactical/map/map";
import { WEAPONS } from "../../../tactical/rules";
import { aimPoint, cepRadius, muzzle } from "../../../tactical/ballistics";
import {
  oddsAgainst,
  leanFor,
  aimFrom,
  coneOf,
  type Battle,
  type ShotMode,
  type Unit,
} from "../../../tactical/battle";
import { shotCost, atRisk } from "../../../tactical/commands";

export const MODE_NAME: Record<ShotMode, string> = {
  snap: "Snap shot",
  aimed: "Aimed shot",
  burst: "Burst",
};

/** The cone of `u`'s shot at a spot: its CEP radius there (metres), and the distance. */
export function cepAt(
  b: Battle,
  u: Unit,
  at: { x: number; y: number; z: number },
  from: Pt3,
  mode: ShotMode,
) {
  const m = muzzle(from, u.kind);
  const dist = Math.hypot(at.x - m.x, at.y - m.y, at.z - m.z);
  return { radius: cepRadius(coneOf(b, u, mode), dist), dist, from: m };
}

/** "0.4 m" */
export const metres = (x: number) => `${x < 1 ? x.toFixed(2) : x.toFixed(1)} m`;

/** The lines of a shot's tooltip: the cost, the cone there (no hit chance: shots are ballistic), who's in the way. */
export function shotTip(b: Battle, u: Unit, t: Unit, mode: ShotMode = "snap"): string[] {
  const w = WEAPONS[u.weapon];
  const o = oddsAgainst(b, u, t, u, false, mode);
  const from = aimFrom(b, u, t);
  const c = cepAt(b, u, aimPoint(b.map, t, t.kind, from), from, mode);
  const risk = w.melee ? [] : atRisk(b, u, t);
  return [
    `${w.melee ? "A blow" : MODE_NAME[mode]}: ${shotCost(u, mode)} TU of ${u.tu}${mode === "burst" ? ` · ${w.burst} rounds` : ""}`,
    w.melee
      ? ""
      : `Cone at ${metres(c.dist)}: half the rounds within ${metres(c.radius)} of the aim`,
    w.pellets ? `${w.pellets} pellets, spreading: anyone near the target can be hit` : "",
    leanFor(b, u, t) ? "Leaning out of cover to fire" : "",
    o.flanked ? "Flanked: no cover from here" : "",
    `${o.crit}% critical on a hit`,
    `${w.name}: ${w.damage[0]}–${w.damage[1]} damage`,
    risk.length ? `In the line of fire: ${risk.map((v) => v.name).join(", ")}` : "",
    t.kind === "vampire" ? "Bullets only put a vampire into torpor: finish it, or burn it." : "",
  ].filter(Boolean);
}
