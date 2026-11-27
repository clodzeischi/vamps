// Above the action panel: a hint for what a click does now (throwing, force
// fire, patching), and a chip for each thing the selected agent can act on
// from where they stand: someone to patch, a body to finish or take, a
// bleeding agent, a door, a prisoner, an enemy to shoot.
import { WEAPONS } from "../../../tactical/rules";
import type { Pt3 } from "../../../tactical/map/map";
import {
  atRisk,
  biopsyBlocker,
  biopsyPlan,
  commandBiopsy,
  kitUses,
  samplable,
  commandCapture,
  commandFinish,
  commandFree,
  commandHeal,
  commandShoot,
  commandStabilize,
  forceBlocker,
  healBlocker,
  healPlan,
  patchable,
  shotCost,
  throwBlocker,
} from "../../../tactical/commands";
import { commandOpenDoor, type doorsInReach } from "../../../tactical/doors";
import {
  modesOf,
  TU_COST,
  type Battle,
  type BattleEvent,
  type Unit,
} from "../../../tactical/battle";
import type { ItemId } from "../../../data/equipment";
import { stowedOf } from "../../../sim/people/inventory";
import { Icon } from "../../components/Icon";
import { MODE_NAME, shotTip } from "./shotTip";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a click does while an item is held ready, or Ctrl is down. */
export function ActionHints({
  b,
  me,
  hover,
  activeItem,
  force,
}: {
  b: Battle;
  me: Unit;
  hover: Pt3 | null;
  activeItem: ItemId | undefined;
  force: boolean;
}) {
  if (activeItem === "incendiary") {
    const what = hover ? (throwBlocker(b, me, hover) ?? "Click to throw") : "Click where to throw";
    return (
      <div className="warn-text small battle-throw-hint">{what} · right click: the weapon</div>
    );
  }
  if (activeItem === "medkit") {
    return (
      <div className="warn-text small battle-throw-hint">
        Click the operative to patch (this one, or one next to them) · right click: the weapon
      </div>
    );
  }
  if (force && !activeItem && !WEAPONS[me.weapon].melee) {
    return (
      <div className="warn-text small battle-throw-hint">
        Force fire ({MODE_NAME[me.mode].toLowerCase()}): {forceHint(b, me, hover)} · let go of Ctrl
        to stop
      </div>
    );
  }
  return null;
}

function forceHint(b: Battle, me: Unit, hover: Pt3 | null): string {
  if (!hover) return "click a spot";
  const why = forceBlocker(b, me, hover, me.mode);
  if (why) return why;
  const risk = atRisk(b, me, hover);
  if (risk.length) return `in the line of fire: ${risk.map((u) => u.name).join(", ")}`;
  return "click to fire at it";
}

interface ChipProps {
  b: Battle;
  me: Unit;
  activeItem: ItemId | undefined;
  foes: Unit[];
  bodies: Unit[];
  bleeder: Unit | undefined;
  prisoner: Unit | undefined;
  doors: ReturnType<typeof doorsInReach>;
  act: (result: BattleEvent[] | string) => void;
  /** Hovering an enemy's chip points the camera at it. */
  focus: (u: Unit) => void;
}

export function TargetChips(p: ChipProps) {
  const { b, me, act } = p;
  const healing = p.activeItem === "medkit";
  const healCost = healPlan(me)?.cost ?? TU_COST.heal;
  const kits = stowedOf(me.gear, (x) => x === "biopsy-kit");
  const samples = kits.length ? samplable(b, me) : [];
  const biopsy = biopsyPlan(me);
  const left = kits.reduce((n, k) => n + kitUses(k), 0);
  return (
    <div className="battle-targets">
      {healing &&
        patchable(b, me).map((t) => {
          const why = healBlocker(b, me, t);
          return (
            <button
              key={`patch-${t.id}`}
              className={`target-chip finish${why ? " short" : ""}`}
              data-tip={`${healCost} TU: up to ${Math.min(10, t.maxHp - t.hp)} health back.${why ? `\n${why}` : ""}`}
              onClick={() => act(commandHeal(b, me, t))}
            >
              <Icon name="medkit" size={14} /> Patch {t === me ? "self" : t.name}{" "}
              <span className="tu-cost">{healCost} TU</span>
            </button>
          );
        })}
      {p.bodies.map((f) => (
        <button
          key={f.id}
          className="target-chip finish"
          data-tip={`${TU_COST.finish} TU, and quiet: an injection of the haemolytic agent turns its blood to gel. It rises in ${plural(f.torpor, "turn")} otherwise.`}
          onClick={() => act(commandFinish(b, me, f))}
        >
          <Icon name="destroy" size={14} /> Finish the vampire
        </button>
      ))}
      {p.bleeder && (
        <button
          className="target-chip finish"
          data-tip={`${TU_COST.stabilize} TU: a field dressing. ${p.bleeder.name} stays down, but stops bleeding (${plural(p.bleeder.bleeding, "turn")} left otherwise). The down come home if we win; left behind, they're lost.`}
          onClick={() => act(commandStabilize(b, me, p.bleeder!))}
        >
          <Icon name="field-medicine" size={14} /> Stabilize {p.bleeder.name}
        </button>
      )}
      {p.doors.map((d) => (
        <button
          key={`door-${d.x},${d.y},${d.z},${d.dx}`}
          className={`target-chip finish${me.tu < TU_COST.door ? " short" : ""}`}
          data-tip={`${TU_COST.door} TU: open it, and see in (and be seen). It stays open. Walking through a closed door opens it too, for the same.`}
          onClick={() => act(commandOpenDoor(b, me, d))}
        >
          <Icon name="door" size={14} /> Open the door{" "}
          <span className="tu-cost">{TU_COST.door} TU</span>
        </button>
      ))}
      {p.prisoner && (
        <button
          className="target-chip finish"
          data-tip={`${TU_COST.free} TU: cut them loose. From next turn they move with the team; get them to the landing zone, or keep them alive to the end.`}
          onClick={() => act(commandFree(b, me, p.prisoner!))}
        >
          <Icon name="release" size={14} /> Free the prisoner
        </button>
      )}
      {p.bodies.map((f) => (
        <button
          key={`take-${f.id}`}
          className="target-chip finish"
          data-tip={`${TU_COST.capture} TU: bind it, hood it, carry it to the aircraft. A captive for containment, if a base has a free cell (otherwise it's burned before the team leaves).`}
          onClick={() => act(commandCapture(b, me, f))}
        >
          <Icon name="capture" size={14} /> Take it alive
        </button>
      ))}
      {samples.map((f) => {
        const why = biopsyBlocker(b, me, f);
        return (
          <button
            key={`sample-${f.id}`}
            className={`target-chip finish${why ? " short" : ""}`}
            data-tip={`${biopsy?.cost ?? TU_COST.biopsy} TU: a needle and a bone drill, the tissue into a cold vial and the vial into the pack. A sample for the laboratories (${plural(left, "sample")} left in the kit).${why ? `\n${why}` : ""}`}
            onClick={() => act(commandBiopsy(b, me, f))}
          >
            <Icon name="biopsy-kit" size={14} /> Take a sample
            <span className="tu-cost">{biopsy?.cost ?? TU_COST.biopsy} TU</span>
          </button>
        );
      })}
      {!p.activeItem && p.foes.map((f) => <ShootChip key={f.id} {...p} foe={f} />)}
    </div>
  );
}

function ShootChip({ b, me, act, focus, foe }: ChipProps & { foe: Unit }) {
  const cost = shotCost(me, me.mode);
  const showMode = modesOf(me).length > 1 && me.mode !== "snap";
  return (
    <span className="target-group" onMouseEnter={() => focus(foe)}>
      <button
        className={`target-chip${me.tu < cost ? " short" : ""}`}
        data-tip={shotTip(b, me, foe, me.mode).join("\n")}
        onClick={() => act(commandShoot(b, me, foe, me.mode))}
      >
        <Icon name={foe.kind === "vampire" ? "claws" : "shoot"} size={14} /> {foe.name}
        {showMode ? ` · ${MODE_NAME[me.mode].toLowerCase()}` : ""}
        <span className="tu-cost">{cost} TU</span>
      </button>
    </span>
  );
}
