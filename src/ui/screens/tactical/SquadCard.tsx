// A squad card, top left: name, HP and TU; the selected agent's grown.
import { WEAPONS } from "../../../tactical/rules";
import { healthColor } from "../../../render/battle/health";
import { type Unit } from "../../../tactical/battle";
import { Icon } from "../../components/Icon";
import { HpBar, TuBar } from "./bars";

/**
 * A squad card. Small for everyone but the selected agent: the name, and HP
 * and TU as numbers. The selected agent's grows: the weapon and its rounds,
 * HP and TU as bars.
 */
export function SquadCard({
  u,
  hp,
  on,
  num,
  onClick,
}: {
  u: Unit;
  hp: number;
  on: boolean;
  num: string;
  onClick: () => void;
}) {
  const tags = (
    <span className="squad-meta">
      {u.overwatch && <span className="tag">React</span>}
      {u.sneak && <span className="tag">Sneak</span>}
      {u.dominated && <span className="tag bad">DOM</span>}
      {!u.alive && <span className="tag bad">KIA</span>}
      {u.alive && u.bleeding > 0 && <span className="tag bad">Bleeding {u.bleeding}</span>}
      {u.alive && u.stable && <span className="tag">Down</span>}
      {u.evacuated && <span className="tag">Out</span>}
      {u.carrying && <span className="tag">Crate</span>}
    </span>
  );
  return (
    <button
      className={`squad-card panel${on ? " on" : ""}${!u.alive ? " dead" : ""}${u.evacuated ? " gone" : ""}`}
      onClick={onClick}
    >
      <span className="squad-num">{num}</span>
      {on ? (
        <span className="squad-body">
          <span className="squad-head">
            <span className="squad-name">{u.name}</span>
            <span className="squad-weapon">
              <Icon name={u.weapon} size={14} />
              {WEAPONS[u.weapon].clip ? (
                <span className="squad-ammo">
                  {u.ammo}/{WEAPONS[u.weapon].clip}
                </span>
              ) : null}
            </span>
          </span>
          <HpBar hp={hp} max={u.maxHp} />
          <TuBar u={u} />
          {tags}
        </span>
      ) : (
        <span className="squad-body squad-small">
          <span className="squad-name">{u.name}</span>
          <span className="squad-nums">
            <span style={{ color: u.alive ? healthColor(hp, u.maxHp) : undefined }}>
              HP {Math.max(0, hp)}
            </span>
            <span>TU {Math.max(0, u.tu)}</span>
          </span>
        </span>
      )}
    </button>
  );
}
