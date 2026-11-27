// Construction: the base building floor by floor, building, moving and demolishing rooms.
import { SYNERGY, FACILITIES, givesOf } from "../../../../data/installations";
import {
  facilityCount,
  hangarsOf,
  upgradeBase,
  upgradeBlocker,
  demolishBlocker,
  demolishRoom,
} from "../../../../sim/people/personnel";
import {
  FLOOR_NAMES,
  floorsOf,
  isEntrance,
  isRoomKind,
  pendingRoomAt,
  ROOM_KINDS,
  roomAt,
  roomBonuses,
  SLOT_XY,
  type Place,
  type RoomKind,
} from "../../../../sim/base/building";
import { type Installation } from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { ActionButton } from "../../../components/ActionButton";
import { money } from "../../../format";
import { useGame, useStore } from "../../../store";
import { timeLeft } from "../../../format";
import { useState } from "react";
import { ExpandButton } from "./shared";

const ROOM_SHORT: Record<RoomKind, string> = {
  quarters: "Quarters",
  lab: "Lab",
  workshop: "Workshop",
  fusion: "Fusion",
  containment: "Cells",
  sigint: "SIGINT",
  storage: "Storage",
  bsl4: "BSL-4",
  chapel: "Chapel",
  tradecraft: "Tradecraft",
  combat: "Battle",
};

/** The base building, floors stacked top to bottom (the street at the bottom of each plan),
 *  and the hangars beside it. The one place anything at a base is built. */
export function Construction({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const [sel, setSel] = useState<Place | null>(null);
  const bonuses = roomBonuses(base);
  const pending = base.upgrades ?? [];
  const room = sel && roomAt(base, sel);
  const under = sel && pendingRoomAt(base, sel);
  const tile = (floor: number, x: number, y: number) => {
    if (x === 1 && y === 1)
      return (
        <div key="core" className="room core" title="Lift and stairs">
          Core
        </div>
      );
    const slot = SLOT_XY.findIndex(([sx, sy]) => sx === x && sy === y);
    const p = { floor, slot };
    const r = roomAt(base, p),
      u = pendingRoomAt(base, p),
      bonus = bonuses.get(`${floor}:${slot}`) ?? 0;
    const chosen = sel?.floor === floor && sel.slot === slot;
    if (isEntrance(base, p))
      return (
        <div key={slot} className="room entrance" title="Lobby and security checkpoint">
          Entrance
        </div>
      );
    return (
      <button
        key={slot}
        className={`room ${r ? `built ${r.kind}` : u ? "pending" : "office"}${chosen ? " chosen" : ""}`}
        onClick={() => setSel(chosen ? null : p)}
      >
        <span>
          {r ? ROOM_SHORT[r.kind] : u && isRoomKind(u.kind) ? ROOM_SHORT[u.kind] : "Office"}
        </span>
        {r && bonus > 0 && <span className="bonus">+{Math.round(bonus * 100)}%</span>}
        {!r && u && <span className="bonus">{timeLeft(u.readyAt - g.time)}</span>}
      </button>
    );
  };
  return (
    <>
      <p className="small dim">
        Rooms of a kind next to each other (vertically or horizontally) give a bonus of{" "}
        {Math.round(SYNERGY.pair * 100)}% for two, and {Math.round(SYNERGY.line * 100)}% for three
        (with some exceptions).
      </p>
      <div className="construction">
        <div className="floors stacked">
          {[...floorsOf(base)].reverse().map((floor) => (
            <div key={floor} className="floor">
              <div className="floor-name small dim">{FLOOR_NAMES[floor]}</div>
              <div className="floor-grid">
                {[2, 1, 0].flatMap((y) => [0, 1, 2].map((x) => tile(floor, x, y)))}
              </div>
            </div>
          ))}
          <div className="small dim floor-front">The street is at the bottom of each plan.</div>
        </div>
        <div className="construction-side">
          {sel && room && (
            <div className="room-panel">
              <div className="kv">
                <span>
                  {FACILITIES[room.kind].name}
                  {room.kind === "sigint" ? `, level ${facilityCount(base, "sigint")}` : ""}
                </span>
                <span>
                  {Math.round((bonuses.get(`${sel.floor}:${sel.slot}`) ?? 0) * 100)}% synergy
                </span>
              </div>
              {room.kind === "sigint" && facilityCount(base, "sigint") < FACILITIES.sigint.max && (
                <ExpandButton base={base} kind="sigint" />
              )}
              <ActionButton
                icon="build"
                label="Clear to office space"
                blocker={demolishBlocker(g, base.id, sel)}
                tip={["Nothing is refunded."]}
                onClick={() => {
                  command((s) => demolishRoom(s, base.id, sel), "Cleared back to office space.");
                  setSel(null);
                }}
              />
            </div>
          )}
          {sel && !room && under && (
            <div className="room-panel kv">
              <span>Building {FACILITIES[under.kind].article}</span>
              <span>ready {formatDate(under.readyAt)}</span>
            </div>
          )}
          {sel && !room && !under && (
            <div className="room-panel build-actions">
              <div className="small dim">{FLOOR_NAMES[sel.floor]}: build here</div>
              {ROOM_KINDS.map((k) => {
                const f = FACILITIES[k];
                // A room research gives stays out of the list until it's researched.
                if (f.research?.atLevel === 0 && !g.research.done.includes(f.research.id))
                  return null;
                return (
                  <ActionButton
                    key={k}
                    icon="build"
                    label={`Build ${f.article}`}
                    blocker={upgradeBlocker(g, base.id, k, sel)}
                    tip={[`${money(f.cost)} · ${f.days} days`, givesOf(f)]}
                    onClick={() => {
                      command(
                        (s) => upgradeBase(s, base.id, k, sel),
                        `Work begins on ${f.article}.`,
                      );
                      setSel(null);
                    }}
                  />
                );
              })}
            </div>
          )}
          {!sel && (
            <p className="small dim">Choose an office to build in it, or a room to see it.</p>
          )}
          <h4 className="section-title">Beside the building</h4>
          <div className="kv">
            <span>Hangars</span>
            <span>
              {hangarsOf(base)} of {FACILITIES.hangar.max}, one aircraft each
            </span>
          </div>
          <ExpandButton base={base} kind="hangar" />
          {pending.length > 0 && <h4 className="section-title">Under way</h4>}
          {pending.map((u, i) => (
            <div key={i} className="kv">
              <span>
                Building {FACILITIES[u.kind].article}
                {u.floor !== undefined ? `, ${FLOOR_NAMES[u.floor]!.toLowerCase()}` : ""}
              </span>
              <span>
                ready {formatDate(u.readyAt)} ({timeLeft(u.readyAt - g.time)})
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
