// The tactical test ground (docs/WEB_PORT.md 3.11, T2): a generated map,
// four agents at the landing zone, the bloodline's people somewhere ahead.
// Two actions a turn: click a tile to move (blue: one action, gold: a dash),
// click a seen enemy to shoot it; overwatch, hunker down, reload, evacuate.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BattleView, type UnitSpec } from "../../../render/BattleView";
import { idx, levelName, skinAt, tileAt, TILE_INFO, type Pt3, type Setting } from "../../../tactical/map";
import { generateMap, type SiteSize } from "../../../tactical/mapgen";
import { coverAround, coverAgainst, WEAPONS } from "../../../tactical/rules";
import {
  agents, commandEvacuate, commandHunker, commandMove, commandOverwatch, commandReload, commandShoot, endTurn, isIndoors,
  moveActions, newSkirmish, oddsAgainst, onLandingZone, onMap, pathTo, reach, seenByAgents, unitAt, unitById, visibleFoes,
  type Battle, type BattleEvent, type Unit,
} from "../../../tactical/battle";
import { SITE_KINDS } from "../../../sim/missions";
import { ActionButton } from "../../components/ActionButton";
import { Icon, type IconName } from "../../components/Icon";
import { useStore } from "../../store";

const SIZES: SiteSize[] = ["nest", "den", "haven"];
const newSeed = () => Math.floor(Math.random() * 1e6);

/** The lines of a shot's tooltip: the chance, then why. */
function oddsTip(b: Battle, u: Unit, t: Unit): string[] {
  const o = oddsAgainst(b, u, t);
  return [
    `${o.chance}% to hit · ${o.crit}% critical`,
    ...o.why.map((w) => `${w.label} ${w.value > 0 && w.label !== "Aim" ? "+" : ""}${w.value}`),
    o.flanked ? "Flanked: no cover from here" : "",
    `${WEAPONS[u.weapon].name}: ${WEAPONS[u.weapon].damage[0]}–${WEAPONS[u.weapon].damage[1]} damage`,
  ].filter(Boolean);
}

export function SkirmishScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const view = useRef<BattleView | null>(null);
  const quit = useStore((s) => s.quitToMenu);
  const [setting, setSetting] = useState<Setting>("urban");
  const [size, setSize] = useState<SiteSize>("den");
  const [seed, setSeed] = useState(newSeed);
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState<Pt3 | null>(null);
  const [selected, setSelected] = useState<string | null>("a0");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  const map = useMemo(() => {
    const k = SITE_KINDS[size];
    return generateMap({ setting, size, seed, thralls: k.thralls, vampires: k.vampires, civilians: 2 });
  }, [setting, size, seed]);
  const battle = useMemo(() => newSkirmish(map, seed), [map, seed]);
  const b = battle;
  const sel = selected ? unitById(b, selected) : undefined;
  const me = sel && sel.side === "agent" && onMap(sel) ? sel : undefined;
  const myTurn = b.side === "agent" && !b.result && !busy;
  const foes = me ? visibleFoes(b, me).filter((f) => f.side === "enemy") : [];
  const r = useMemo(() => (me && myTurn ? reach(b, me) : null), [b, me, myTurn, me?.x, me?.y, me?.z, me?.ap]);

  // ----- Keeping the view in step -----

  const specs = useCallback((): UnitSpec[] => {
    const targets = new Set(foes.map((f) => f.id));
    return b.units.map((u) => ({
      id: u.id, x: u.x, y: u.y, z: u.z, facing: u.facing, hp: u.hp, maxHp: u.maxHp,
      side: u.kind === "civilian" ? "civilian" : u.kind,
      dead: !u.alive, gone: u.evacuated, overwatch: u.overwatch, hunkered: u.hunkered,
      selected: u.id === me?.id && myTurn, targeted: myTurn && targets.has(u.id),
      visible: u.side === "agent" || !u.alive || seenByAgents(b, u),
    }));
  }, [b, foes, me, myTurn]);

  useEffect(() => {
    const v = new BattleView(ref.current!);
    view.current = v;
    v.onHover = setHover;
    return () => {
      v.dispose();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current!;
    v.setMap(map);
    setLevel(v.getLevel());
    setSelected("a0");
    setBanner("Turn 1");
  }, [map, battle]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(t);
  }, [banner]);

  // Units, range and level follow the state (not during playback).
  useEffect(() => {
    const v = view.current;
    if (!v || busy) return;
    v.setLevel(level);
    v.setUnits(specs());
    if (r && me) {
      const tiles: { x: number; y: number; z: number; dash: boolean }[] = [];
      for (const [i, c] of r.cost) {
        if (!c) continue;
        const n = moveActions(me, c);
        if (!n) continue;
        const z = Math.floor(i / (map.w * map.h)), y = Math.floor(i / map.w) % map.h, x = i % map.w;
        if (unitAt(b, { x, y, z })) continue;
        tiles.push({ x, y, z, dash: n === 2 });
      }
      v.setMoveRange(tiles);
    } else v.setMoveRange([]);
  });

  // The path preview, and the cover at its end.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (!hover || !r || !me || busy || unitAt(b, hover)) return v.setPath(null);
    const c = r.cost.get(idx(map, hover.x, hover.y, hover.z));
    const n = c === undefined ? 0 : moveActions(me, c);
    if (!n) return v.setPath(null);
    v.setPath([{ x: me.x, y: me.y, z: me.z }, ...(pathTo(b, r, hover) ?? [])], n === 2, coverAround(map, hover));
  }, [hover, r, me, busy, b, map]);

  // ----- Acting -----

  const select = useCallback((u: Unit | undefined) => {
    if (!u) return;
    setSelected(u.id);
    view.current?.focus(u);
    // Inside a building: cut away to its floor. Outside: the whole map.
    setLevel(isIndoors(b, u) ? u.z : map.levels - 1);
  }, [b, map]);

  const nextAgent = useCallback((after?: string) => {
    const ready = agents(b).filter((a) => a.ap > 0);
    if (!ready.length) return null;
    const i = ready.findIndex((a) => a.id === after);
    return ready[(i + 1) % ready.length]!;
  }, [b]);

  const run = useCallback(async (events: BattleEvent[]) => {
    const v = view.current!;
    setBusy(true);
    v.setMoveRange([]);
    v.setPath(null);
    let ended = false;
    for (const e of events) {
      if (e.kind === "turn") {
        setBanner(e.side === "enemy" ? "Enemy activity" : `Turn ${e.turn}`);
        if (e.side === "agent") v.setUnits(specs());
      }
      if (e.kind === "end") ended = true;
      await v.play([e]);
    }
    setBusy(false);
    bump();
    return ended;
  }, [specs]);

  const act = useCallback(async (res: BattleEvent[] | string) => {
    if (typeof res === "string") return useStore.getState().notify(res, "bad");
    const ended = await run(res);
    if (ended || b.result) return;
    // Next agent with actions left; when none, the enemy's turn.
    const cur = me && me.ap > 0 ? me : nextAgent(me?.id);
    if (cur) return select(cur);
    const turn = endTurn(b);
    await run(turn);
    if (!b.result) select(agents(b)[0]);
  }, [b, me, nextAgent, run, select]);

  const doEndTurn = useCallback(async () => {
    if (!myTurn) return;
    await run(endTurn(b));
    if (!b.result) select(agents(b)[0]);
  }, [b, myTurn, run, select]);

  // Clicks on the map: an agent selects; a seen enemy is shot; a tile in range is walked to.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.onPick = (p) => {
      if (!myTurn) return;
      const who = unitAt(b, p);
      if (who?.side === "agent") return select(who);
      if (who && me && foes.includes(who)) return void act(commandShoot(b, me, who));
      if (!who && me) return void act(commandMove(b, me, p));
    };
  });

  const commands: { id: string; icon: IconName; label: string; key: string; blocker: string | null; tip: string[]; run: () => void }[] = me ? [
    {
      id: "overwatch", icon: "overwatch", label: "Overwatch", key: "2",
      blocker: me.ap < 1 ? "No actions left" : WEAPONS[me.weapon].clip && me.ammo <= 0 ? "Out of ammunition" : null,
      tip: ["Ends the turn. Fires at the first enemy that moves in sight (−15 aim, no critical)."],
      run: () => void act(commandOverwatch(b, me)),
    },
    {
      id: "hunker", icon: "hunker", label: "Hunker down", key: "3",
      blocker: me.ap < 1 ? "No actions left" : null,
      tip: ["Ends the turn. Cover counts for another −20 against shots, and no critical hits, until our next turn."],
      run: () => void act(commandHunker(b, me)),
    },
    {
      id: "reload", icon: "reload", label: "Reload", key: "4",
      blocker: me.ap < 1 ? "No actions left" : me.ammo >= WEAPONS[me.weapon].clip ? "Fully loaded" : null,
      tip: ["One action.", `${me.ammo} of ${WEAPONS[me.weapon].clip} rounds left.`],
      run: () => void act(commandReload(b, me)),
    },
    {
      id: "evacuate", icon: "evacuate", label: "Evacuate", key: "5",
      blocker: !onLandingZone(b, me) ? "Only from the landing zone" : me.ap < 1 ? "No actions left" : null,
      tip: ["One action. This agent leaves the battle. If everyone left alive leaves, the mission is abandoned."],
      run: () => void act(commandEvacuate(b, me)),
    },
  ] : [];

  // Keys: Tab next agent, 1–5 actions (1: shoot the best target), Enter ends the turn, R / F levels, N new map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return quit();
      if (e.key === "n" || e.key === "N") return setSeed(newSeed());
      if (e.key === "PageUp" || e.key === "r" || e.key === "R") return setLevel((z) => Math.min(map.levels - 1, z + 1));
      if (e.key === "PageDown" || e.key === "f" || e.key === "F") return setLevel((z) => Math.max(0, z - 1));
      if (!myTurn) return;
      if (e.key === "Tab") {
        e.preventDefault();
        return select(nextAgent(me?.id) ?? undefined);
      }
      if (e.key === "Enter") return void doEndTurn();
      if (e.key === "1" && me && foes.length) {
        const best = [...foes].sort((x, y) => oddsAgainst(b, me, y).chance - oddsAgainst(b, me, x).chance)[0]!;
        return void act(commandShoot(b, me, best));
      }
      const c = commands.find((x) => x.key === e.key);
      if (c && !c.blocker) c.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Dev builds: a handle for browser tests.
  if (import.meta.env.DEV) (window as unknown as { __skirmish?: unknown }).__skirmish = { b, bump, select };

  const t = hover ? tileAt(map, hover.x, hover.y, hover.z) : null;
  const who = hover ? unitAt(b, hover) : undefined;
  const whoSeen = who && (who.side === "agent" || seenByAgents(b, who));
  const lost = b.units.filter((u) => u.side === "agent" && !u.alive).length;
  const killed = b.units.filter((u) => u.side === "enemy" && !u.alive).length;

  return (
    <div className="screen skirmish">
      <div className="battle-layer" ref={ref} />
      <header className="battle-top panel">
        <span className="battle-title">Skirmish</span>
        <div className="seg">
          {(["urban", "rural"] as const).map((s) => (
            <button key={s} className={`mini${setting === s ? " primary" : ""}`} onClick={() => setSetting(s)}>{s === "urban" ? "Town" : "Farm"}</button>
          ))}
        </div>
        <div className="seg">
          {SIZES.map((s) => (
            <button key={s} className={`mini${size === s ? " primary" : ""}`} onClick={() => setSize(s)} data-tip={`${SITE_KINDS[s].thralls} thralls, ${SITE_KINDS[s].vampires} vampires`}>{SITE_KINDS[s].name}</button>
          ))}
        </div>
        <button className="mini" onClick={() => setSeed(newSeed())} data-tip="A new map and a new battle (N)">New battle</button>
        <span className="td-dim small">Turn {b.turn} · {b.side === "agent" ? "our move" : "enemy activity"}</span>
        <span className="battle-spacer" />
        <button className="mini" onClick={quit} data-tip="Back to the main menu (Esc)">Close ✕</button>
      </header>

      <div className="battle-levels panel">
        <button className="mini" onClick={() => setLevel((z) => Math.min(map.levels - 1, z + 1))} disabled={level >= map.levels - 1} data-tip="Show the level above (R or Page Up)">▲</button>
        <span className="battle-level">{level === map.levels - 1 ? "All levels" : levelName(map, level)}</span>
        <button className="mini" onClick={() => setLevel((z) => Math.max(0, z - 1))} disabled={level <= 0} data-tip="Cut away to the level below (F or Page Down)">▼</button>
      </div>

      <div className="battle-info panel small">
        {hover && t !== null ? (
          <>
            <div>{levelName(map, hover.z)} · {hover.x}, {hover.y}</div>
            <div className="td-dim">{TILE_INFO[t].name}{skinAt(map, hover.x, hover.y, hover.z) !== "none" ? ` (${skinAt(map, hover.x, hover.y, hover.z)})` : ""}{TILE_INFO[t].cover ? ` · ${TILE_INFO[t].cover === 2 ? "full" : "half"} cover` : ""}</div>
            {who && whoSeen && <div>{who.name} · {who.hp}/{who.maxHp} · {WEAPONS[who.weapon].name}{me && foes.includes(who) ? ` · ${oddsAgainst(b, me, who).chance}% to hit${coverAgainst(map, who, me).flanked ? ", flanked" : ""}` : ""}</div>}
          </>
        ) : (
          <div className="td-dim">Click a tile to move, an enemy to shoot · right-drag to turn · WASD to pan · Q / E rotate · Tab next agent · Enter end turn</div>
        )}
      </div>

      <footer className="battle-bottom">
        <div className="battle-squad">
          {b.units.filter((u) => u.side === "agent").map((u) => (
            <button key={u.id} className={`squad-card panel${u.id === me?.id ? " on" : ""}${!u.alive ? " dead" : ""}${u.evacuated ? " gone" : ""}`} onClick={() => myTurn && onMap(u) && select(u)}>
              <span className="squad-name">{u.name}</span>
              <span className="squad-hp">{Array.from({ length: u.maxHp }, (_, i) => <i key={i} className={i < u.hp ? "on" : ""} />)}</span>
              <span className="squad-meta">
                <Icon name={u.weapon} size={14} /> {u.ammo}/{WEAPONS[u.weapon].clip}
                <span className="squad-ap">{[0, 1].map((i) => <i key={i} className={i < u.ap ? "on" : ""} />)}</span>
                {u.overwatch && <span className="tag">OW</span>}
                {u.hunkered && <span className="tag">HD</span>}
                {!u.alive && <span className="tag bad">KIA</span>}
                {u.evacuated && <span className="tag">Out</span>}
              </span>
            </button>
          ))}
        </div>
        {me && myTurn && (
          <div className="battle-actions panel">
            <div className="battle-targets">
              {foes.length ? foes.map((f) => (
                <button key={f.id} className="target-chip" data-tip={oddsTip(b, me, f).join("\n")} onClick={() => void act(commandShoot(b, me, f))}
                  onMouseEnter={() => view.current?.focus(f)}>
                  <Icon name={f.kind === "vampire" ? "claws" : "shoot"} size={14} /> {f.name} <b>{oddsAgainst(b, me, f).chance}%</b>
                </button>
              )) : <span className="td-dim small">No enemy in sight</span>}
            </div>
            <div className="battle-buttons">
              {commands.map((c) => <ActionButton key={c.id} mini icon={c.icon} label={c.label} tip={[...c.tip, `Key: ${c.key}`]} blocker={c.blocker} onClick={c.run} />)}
              <ActionButton mini primary icon="end-turn" label="End turn" tip={["The enemy moves. Key: Enter"]} onClick={() => void doEndTurn()} />
            </div>
          </div>
        )}
      </footer>

      {banner && <div className="battle-banner">{banner}</div>}
      {b.result && !busy && (
        <div className="battle-result panel">
          <h2>{b.result === "won" ? "The site is clean" : b.result === "lost" ? "The team is lost" : "Withdrawn"}</h2>
          <p className="small">{killed} enemies killed · {lost} agent{lost === 1 ? "" : "s"} lost · {b.turn} turns</p>
          <button className="mini primary" onClick={() => setSeed(newSeed())}>New battle</button>
        </div>
      )}
    </div>
  );
}
