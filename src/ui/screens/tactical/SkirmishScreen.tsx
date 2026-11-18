// The tactical test ground (docs/WEB_PORT.md 3.11, T2–T3): a generated map,
// four agents at the landing zone, a bloodline's people somewhere ahead.
// The skirmish is set up in the main menu (settings.skirmish) and can't be
// changed here: to change it, quit and start another.
// Time units a turn: click a tile to move (inside the blue line there's time
// left for a shot; inside the yellow, the TU run out), click a seen enemy for
// a snap shot (or take an aimed one); overwatch, hunker down, reload, an
// incendiary, finish a vampire in torpor, evacuate.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLOODLINES } from "../../../data/bloodlines";
import { BattleView, type UnitSpec } from "../../../render/BattleView";
import { idx, levelName, type Pt3 } from "../../../tactical/map";
import { generateMap } from "../../../tactical/mapgen";
import { coverAround, WEAPONS } from "../../../tactical/rules";
import { traitsOf } from "../../../tactical/traits";
import { lootShare } from "../../../tactical/campaign";
import {
  active, agents, blastTiles, bleederInReach, bodiesInReach, commandCapture, commandEvacuate, commandFree, commandStabilize, craft, prisonerInReach, commandFinish, commandHunker, commandIncendiary, commandMove, commandOverwatch, commandReload,
  commandShoot, detectRadius, endTurn, enemies, fromIdx, INCENDIARY, isIndoors, newSkirmish, oddsAgainst, onLandingZone, onMap, pathTo, reach,
  seenByAgents, throwBlocker, unitAt, unitById, visibleFoes, attackCost, ready, shotCost, tuCost, TU_COST, TU_PER_TILE,
  type Battle, type BattleEvent, type ShotMode, type Unit,
} from "../../../tactical/battle";
import { SITE_KINDS } from "../../../sim/missions";
import { ActionButton } from "../../components/ActionButton";
import { Icon, type IconName } from "../../components/Icon";
import { actionFor, AGENT_KEYS, bindingsOf, keyLabel, type BindingId } from "../../keys";
import { useStore } from "../../store";

/** The lines of a shot's tooltip: the chance, then why. */
function oddsTip(b: Battle, u: Unit, t: Unit, mode: ShotMode = "snap"): string[] {
  const o = oddsAgainst(b, u, t, u, false, mode);
  const melee = WEAPONS[u.weapon].melee;
  return [
    `${melee ? "A blow" : mode === "aimed" ? "Aimed shot" : "Snap shot"}: ${shotCost(u, mode)} TU of ${u.tu}`,
    `${o.chance}% to hit · ${o.crit}% critical`,
    ...o.why.map((w) => `${w.label} ${w.value > 0 && w.label !== "Aim" ? "+" : ""}${w.value}`),
    o.flanked ? "Flanked: no cover from here" : "",
    `${WEAPONS[u.weapon].name}: ${WEAPONS[u.weapon].damage[0]}–${WEAPONS[u.weapon].damage[1]} damage`,
    t.kind === "vampire" ? "Bullets only put a vampire into torpor: finish it, or burn it." : "",
  ].filter(Boolean);
}

/** A campaign mission's battle (tactical/campaign.ts), played here instead of a skirmish. */
export interface CampaignBattleProps {
  battle: Battle;
  title: string;
  onDone: () => void;
}

export function SkirmishScreen({ campaign }: { campaign?: CampaignBattleProps } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useRef<BattleView | null>(null);
  const quit = useStore((s) => s.quitToMenu);
  const setup = useStore((s) => s.settings.skirmish);
  const seed = useStore((s) => s.skirmishSeed);
  const savedKeys = useStore((s) => s.settings.keys);
  const keys = useMemo(() => bindingsOf(savedKeys), [savedKeys]);
  const keyOf = (id: BindingId) => keyLabel(keys[id]);
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState<Pt3 | null>(null);
  const [selected, setSelected] = useState<string | null>("a0");
  const [busy, setBusy] = useState(false);
  const [throwing, setThrowing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  // Built once, from the setup the menu left: changing it mid-battle isn't possible.
  const skirmish = useMemo(() => {
    if (campaign) return null;
    const { setting, size, bloodline, night, kit, arrival, hostage } = setup;
    const k = SITE_KINDS[size];
    const where = size === "lair" ? (bloodline === "carcassonne" ? "montsegur" : "lair") : setting;
    const m = generateMap({ setting: where, size, seed, thralls: k.thralls + traitsOf(bloodline).extraThralls, vampires: k.vampires, civilians: size === "lair" ? 0 : 2 });
    return newSkirmish(m, seed, { bloodline, night, kit, arrival, loot: 3, hostage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, seed]);
  const battle = campaign?.battle ?? skirmish!;
  const map = battle.map;
  const b = battle;
  const sel = selected ? unitById(b, selected) : undefined;
  const me = sel && sel.side === "agent" && sel.kind !== "helicopter" && active(sel) ? sel : undefined;
  const myTurn = b.side === "agent" && !b.result && !busy;
  const foes = me ? visibleFoes(b, me).filter((f) => f.side === "enemy") : [];
  const bodies = me ? bodiesInReach(b, me) : [];
  const prisoner = me ? prisonerInReach(b, me) : undefined;
  const bleeder = me ? bleederInReach(b, me) : undefined;
  const r = useMemo(() => (me && myTurn && !throwing && ready(me) ? reach(b, me) : null), [b, me, myTurn, throwing, me?.x, me?.y, me?.z, me?.tu, me?.overwatch, me?.hunkered]);

  // ----- Keeping the view in step -----

  const specs = useCallback((): UnitSpec[] => {
    const targets = new Set(foes.map((f) => f.id));
    return b.units.map((u) => ({
      id: u.id, x: u.x, y: u.y, z: u.z, facing: u.facing, hp: u.hp, maxHp: u.maxHp,
      side: u.kind, carrying: u.carrying, bleeding: u.bleeding, stable: u.stable,
      dead: !u.alive, gone: u.evacuated || u.captured, overwatch: u.overwatch, hunkered: u.hunkered, torpor: u.torpor, dominated: u.dominated,
      selected: u.id === me?.id && myTurn, targeted: myTurn && targets.has(u.id),
      visible: u.side === "agent" || !u.alive || seenByAgents(b, u, u),
    }));
  }, [b, foes, me, myTurn]);

  useEffect(() => {
    const v = new BattleView(ref.current!);
    view.current = v;
    v.onHover = setHover;
    v.cameraKeys = { forward: keys.panForward, back: keys.panBack, left: keys.panLeft, right: keys.panRight, rotateLeft: keys.rotateLeft, rotateRight: keys.rotateRight };
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
    setThrowing(false);
    setBanner(battle.concealed ? "Concealed" : "Turn 1");
  }, [map, battle]);

  useEffect(() => view.current?.setDaylight(battle.night), [battle]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(t);
  }, [banner]);

  // Units, fire, range and level follow the state (not during playback).
  useEffect(() => {
    const v = view.current;
    if (!v || busy) return;
    v.setLevel(level);
    v.setUnits(specs());
    v.setFire(Object.keys(b.fire).map((i) => fromIdx(map, +i)));
    v.setLoot(b.loot.filter((l) => !l.by));
    if (throwing && me && hover && !throwBlocker(b, me, hover)) v.setMoveRange(blastTiles(b, hover).map((p) => ({ ...p, dash: false })), 0xff6a30);
    else if (r && me) {
      // Yellow: everywhere the TU reach. Blue: where there's still time for an attack.
      const keep = me.tu - attackCost(me);
      const tiles: { x: number; y: number; z: number; dash: boolean }[] = [];
      for (const [i, c] of r.cost) tiles.push({ ...fromIdx(map, i), dash: c > keep + 1e-6 });
      v.setMoveRange(tiles);
    } else v.setMoveRange([]);
  });

  // The path preview, and the cover at its end.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (!hover || !r || !me || busy || unitAt(b, hover)) return v.setPath(null);
    const c = r.cost.get(idx(map, hover.x, hover.y, hover.z));
    if (c === undefined) return v.setPath(null);
    v.setPath([{ x: me.x, y: me.y, z: me.z }, ...(pathTo(b, r, hover) ?? [])], c > me.tu - attackCost(me) + 1e-6, coverAround(map, hover));
  }, [hover, r, me, busy, b, map]);

  // ----- Acting -----

  /** Moves the camera to a unit: inside a building, cut away to its floor; outside, the whole map. */
  const lookAt = useCallback((u: Unit) => {
    view.current?.focus(u);
    setLevel(isIndoors(b, u) ? u.z : map.levels - 1);
  }, [b, map]);

  const select = useCallback((u: Unit | undefined, look = true) => {
    if (!u) return;
    setSelected(u.id);
    setThrowing(false);
    if (look) lookAt(u);
  }, [lookAt]);

  // The squad column, numbered: the agents, then a freed prisoner.
  const squad = b.units.filter((u) => u.kind === "agent" || (u.kind === "hostage" && u.side === "agent"));
  const canCommand = (u: Unit) => u.side === "agent" && u.kind !== "helicopter" && onMap(u) && u.bleeding === 0 && !u.stable;
  /** A number key or a card: the first press selects; pressed again, the camera goes to them. */
  const pick = useCallback((u: Unit | undefined) => {
    if (!u || !myTurn || !canCommand(u)) return;
    if (me?.id === u.id) lookAt(u);
    else select(u, false);
  }, [myTurn, me, lookAt, select]);

  const nextAgent = useCallback((after?: string) => {
    const able = agents(b).filter(ready);
    if (!able.length) return null;
    const i = able.findIndex((a) => a.id === after);
    return able[(i + 1) % able.length]!;
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
      if (e.kind === "status" && e.text === "Spotted!") setBanner("Spotted!");
      if (e.kind === "end") ended = true;
      await v.play([e]);
    }
    setBusy(false);
    bump();
    return ended;
  }, [specs]);

  const act = useCallback(async (res: BattleEvent[] | string) => {
    if (typeof res === "string") return useStore.getState().notify(res, "bad");
    setThrowing(false);
    const ended = await run(res);
    if (ended || b.result) return;
    // Next agent with actions left; when none, the enemy's turn.
    // Not when the agent can't do anything useful any more (less than a step left).
    const cur = me && ready(me) && me.tu >= TU_PER_TILE ? me : nextAgent(me?.id);
    if (cur) return select(cur);
    const turn = endTurn(b);
    await run(turn);
    if (!b.result) select(agents(b).find(ready) ?? agents(b)[0]);
  }, [b, me, nextAgent, run, select]);

  const doEndTurn = useCallback(async () => {
    if (!myTurn) return;
    await run(endTurn(b));
    if (!b.result) select(agents(b).find(ready) ?? agents(b)[0]);
  }, [b, myTurn, run, select]);

  // Clicks on the map: an agent selects; a seen enemy is shot; a tile in range is walked to (or burned).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.onPick = (p) => {
      if (!myTurn) return;
      if (throwing && me) return void act(commandIncendiary(b, me, p));
      const who = unitAt(b, p);
      if (who && canCommand(who)) return select(who);
      if (who && me && who === prisoner) return void act(commandFree(b, me, who));
      if (who && me && who === bleeder) return void act(commandStabilize(b, me, who));
      if (who && me && bodies.includes(who)) return void act(commandFinish(b, me, who));
      if (who && me && foes.includes(who)) return void act(commandShoot(b, me, who));
      if (!who && me) return void act(commandMove(b, me, p));
    };
  });

  const need = (n: number) => (me && me.tu < n ? `Needs ${n} TU (${me.tu} left)` : null);
  const holdingUp = me?.overwatch ? "On overwatch" : me?.hunkered ? "Hunkered down" : null;
  const commands: { id: string; icon: IconName; label: string; key: BindingId; blocker: string | null; tip: string[]; run: () => void }[] = me ? [
    {
      id: "overwatch", icon: "overwatch", label: "Overwatch", key: "overwatch",
      blocker: holdingUp ?? need(attackCost(me)) ?? (WEAPONS[me.weapon].clip && me.ammo <= 0 ? "Out of ammunition" : null),
      tip: [`Ends the turn, holding the ${me.tu} TU left: a snap shot (${attackCost(me)} TU) at an enemy that moves in sight, as often as the TU last (−15 aim, no critical).`],
      run: () => void act(commandOverwatch(b, me)),
    },
    {
      id: "hunker", icon: "hunker", label: "Hunker down", key: "hunker",
      blocker: holdingUp ?? need(attackCost(me)),
      tip: [`Ends the turn (needs ${attackCost(me)} TU). Cover counts for another −20 against shots, and no critical hits, until our next turn.`],
      run: () => void act(commandHunker(b, me)),
    },
    {
      id: "reload", icon: "reload", label: "Reload", key: "reload",
      blocker: holdingUp ?? (me.ammo >= WEAPONS[me.weapon].clip ? "Fully loaded" : need(TU_COST.reload)),
      tip: [`${TU_COST.reload} TU.`, `${me.ammo} of ${WEAPONS[me.weapon].clip} rounds left.`],
      run: () => void act(commandReload(b, me)),
    },
    {
      id: "incendiary", icon: "destroy", label: throwing ? "Cancel throw" : `Incendiary (${me.incendiaries})`, key: "incendiary",
      blocker: throwing ? null : me.incendiaries <= 0 ? "None left" : holdingUp ?? need(tuCost(me, "throw")),
      tip: [
        `${tuCost(me, "throw")} TU. Sets the ground alight, three tiles across, up to ${INCENDIARY.range} tiles away; then click where.`,
        `${INCENDIARY.damage[0]}–${INCENDIARY.damage[1]} burns to anyone in it, double to a vampire, for ${INCENDIARY.turns} turns. A vampire in torpor burns to ash.`,
      ],
      run: () => setThrowing((x) => !x),
    },
    {
      id: "evacuate", icon: "evacuate", label: "Evacuate", key: "evacuate",
      blocker: !onLandingZone(b, me) ? "Only from the landing zone" : need(TU_COST.evacuate),
      tip: [`${TU_COST.evacuate} TU. This agent leaves the battle. If everyone left alive leaves, the mission is abandoned.`],
      run: () => void act(commandEvacuate(b, me)),
    },
  ] : [];

  // Keys (ui/keys.ts, rebound in the main menu): number keys pick agents; the rest are actions and levels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return throwing ? setThrowing(false) : undefined;
      const id = actionFor(keys, e.code);
      if (!id) return;
      if (id === "nextAgent" || id === "endTurn") e.preventDefault();
      if (id === "levelUp") return setLevel((z) => Math.min(map.levels - 1, z + 1));
      if (id === "levelDown") return setLevel((z) => Math.max(0, z - 1));
      if (!myTurn) return;
      const slot = AGENT_KEYS.indexOf(id);
      if (slot >= 0) return pick(squad[slot]);
      if (id === "nextAgent") return select(nextAgent(me?.id) ?? undefined);
      if (id === "endTurn") return void doEndTurn();
      if (id === "shoot" && me && foes.length) {
        const best = [...foes].sort((x, y) => oddsAgainst(b, me, y).chance - oddsAgainst(b, me, x).chance)[0]!;
        return void act(commandShoot(b, me, best, e.shiftKey ? "aimed" : "snap"));
      }
      const c = commands.find((x) => x.key === id);
      if (c && !c.blocker) c.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Dev builds: a handle for browser tests.
  if (import.meta.env.DEV) (window as unknown as { __skirmish?: unknown }).__skirmish = { b, bump, select, throwAt: (p: Pt3) => me && act(commandIncendiary(b, me, p)) };

  const lost = b.units.filter((u) => u.side === "agent" && !u.alive).length;
  const killed = b.units.filter((u) => u.side === "enemy" && !u.alive).length;
  const taken = b.units.filter((u) => u.captured).length;
  const hostage = b.units.find((u) => u.kind === "hostage");
  const line = BLOODLINES.find((x) => x.id === battle.bloodline)!;

  return (
    <div className="screen skirmish">
      <div className="battle-layer" ref={ref} />
      <div className="battle-squad">
        {squad.map((u, i) => (
          <button key={u.id} className={`squad-card panel${u.id === me?.id ? " on" : ""}${!u.alive ? " dead" : ""}${u.evacuated ? " gone" : ""}`} onClick={() => pick(u)}
            data-tip={`${u.tu} of ${u.maxTu} TU (a tile costs ${TU_PER_TILE}; blue: time to move and still attack, gold: the attack's reserve) · Aim ${u.aim} · Faith ${u.faith} · Tradecraft ${u.tradecraft} (spotted within ${detectRadius(u)} tiles while concealed) · Insight ${u.insight}${i < AGENT_KEYS.length ? `\nKey: ${keyOf(AGENT_KEYS[i]!)} selects; again, the camera goes to them` : ""}`}>
            <span className="squad-num">{i < AGENT_KEYS.length ? keyOf(AGENT_KEYS[i]!) : ""}</span>
            <span className="squad-body">
              <span className="squad-head">
                <span className="squad-name">{u.name}</span>
                <span className="squad-hp">{Array.from({ length: u.maxHp }, (_, j) => <i key={j} className={j < u.hp ? "on" : ""} />)}</span>
              </span>
              <span className="squad-meta">
                <Icon name={u.weapon} size={14} /> {u.ammo}/{WEAPONS[u.weapon].clip}
                <TuBar u={u} />
                {u.overwatch && <span className="tag">OW</span>}
                {u.hunkered && <span className="tag">HD</span>}
                {u.dominated && <span className="tag bad">DOM</span>}
                {!u.alive && <span className="tag bad">KIA</span>}
                {u.alive && u.bleeding > 0 && <span className="tag bad" data-tip="Down and bleeding: an agent next to them can stabilize them">Bleeding {u.bleeding}</span>}
                {u.alive && u.stable && <span className="tag">Down</span>}
                {u.evacuated && <span className="tag">Out</span>}
                {u.carrying && <span className="tag" data-tip="Carrying a crate: get it out (alive at the end, or evacuated)">Crate</span>}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Objectives b={b} title={campaign?.title ?? "Skirmish"} lineName={line.name} />

      {!campaign && <button className="mini battle-quit" onClick={quit} data-tip="Back to the main menu. This battle is lost; set up another there.">Quit ✕</button>}

      <div className="battle-levels panel">
        <button className="mini" onClick={() => setLevel((z) => Math.min(map.levels - 1, z + 1))} disabled={level >= map.levels - 1} data-tip={`Show the level above (${keyOf("levelUp")})`}>▲</button>
        <span className="battle-level">{level === map.levels - 1 ? "All levels" : levelName(map, level)}</span>
        <button className="mini" onClick={() => setLevel((z) => Math.max(0, z - 1))} disabled={level <= 0} data-tip={`Cut away to the level below (${keyOf("levelDown")})`}>▼</button>
      </div>

      <footer className="battle-bottom">
        {me && myTurn && (
          <div className="battle-actions panel">
            {throwing && <div className="warn-text small">{hover ? throwBlocker(b, me, hover) ?? "Click to throw" : "Click where to throw"}</div>}
            <div className="battle-targets">
              {bodies.map((f) => (
                <button key={f.id} className="target-chip finish" data-tip={`${TU_COST.finish} TU, and quiet: an injection of the haemolytic agent turns its blood to gel. It rises in ${f.torpor} turn${f.torpor === 1 ? "" : "s"} otherwise.`} onClick={() => void act(commandFinish(b, me, f))}>
                  <Icon name="destroy" size={14} /> Finish the vampire
                </button>
              ))}
              {bleeder && (
                <button className="target-chip finish" data-tip={`${TU_COST.stabilize} TU: a field dressing. ${bleeder.name} stays down, but stops bleeding (${bleeder.bleeding} turn${bleeder.bleeding === 1 ? "" : "s"} left otherwise). The down come home if we win; left behind, they're lost.`} onClick={() => void act(commandStabilize(b, me, bleeder))}>
                  <Icon name="field-medicine" size={14} /> Stabilize {bleeder.name}
                </button>
              )}
              {prisoner && (
                <button className="target-chip finish" data-tip={`${TU_COST.free} TU: cut them loose. From next turn they move with the team; get them to the landing zone, or keep them alive to the end.`} onClick={() => void act(commandFree(b, me, prisoner))}>
                  <Icon name="release" size={14} /> Free the prisoner
                </button>
              )}
              {bodies.map((f) => (
                <button key={`take-${f.id}`} className="target-chip finish" data-tip={`${TU_COST.capture} TU: bind it, hood it, carry it to the aircraft. A captive for containment, if a base has a free cell (otherwise it's burned before the team leaves).`} onClick={() => void act(commandCapture(b, me, f))}>
                  <Icon name="capture" size={14} /> Take it alive
                </button>
              ))}
              {foes.length ? foes.map((f) => {
                const melee = WEAPONS[me.weapon].melee;
                const modes: ShotMode[] = melee ? ["snap"] : ["snap", "aimed"];
                return (
                  <span key={f.id} className="target-group" onMouseEnter={() => view.current?.focus(f)}>
                    {modes.map((mode) => (
                      <button key={mode} className={`target-chip${me.tu < shotCost(me, mode) ? " short" : ""}`} data-tip={oddsTip(b, me, f, mode).join("\n")} onClick={() => void act(commandShoot(b, me, f, mode))}>
                        <Icon name={f.kind === "vampire" ? "claws" : "shoot"} size={14} /> {mode === "snap" ? f.name : "Aimed"} <b>{oddsAgainst(b, me, f, me, false, mode).chance}%</b>
                        <span className="tu-cost">{shotCost(me, mode)} TU</span>
                      </button>
                    ))}
                  </span>
                );
              }) : !bodies.length && !prisoner && !bleeder && <span className="td-dim small">No enemy in sight</span>}
            </div>
            <div className="battle-buttons">
              {commands.map((c) => <ActionButton key={c.id} mini icon={c.icon} label={c.label} tip={[...c.tip, `Key: ${keyOf(c.key)}`]} blocker={c.blocker} onClick={c.run} />)}
              <ActionButton mini primary icon="end-turn" label="End turn" tip={[`The enemy moves. Key: ${keyOf("endTurn")}`]} onClick={() => void doEndTurn()} />
            </div>
          </div>
        )}
      </footer>

      {banner && <div className="battle-banner">{banner}</div>}
      {b.result && !busy && (
        <div className="battle-result panel">
          <h2>{b.result === "won" ? "The site is clean" : b.result === "lost" ? "The team is lost" : "Withdrawn"}</h2>
          <p className="small">{killed} enemies destroyed{taken ? ` · ${taken} taken alive` : ""} · {lost} agent{lost === 1 ? "" : "s"} lost · {b.turn} turns</p>
          {hostage && <p className="small">{hostage.alive && (b.result === "won" || hostage.evacuated) && hostage.side === "agent" ? "The prisoner is safe." : "We could not save the prisoner."}</p>}
          {b.loot.length > 0 && <p className="small">Crates recovered: {Math.round(lootShare(b) * b.loot.length)} of {b.loot.length}{craft(b) && b.result === "won" ? " (the helicopter lifts the lot)" : ""}</p>}
          {campaign ? (
            <button className="mini primary" onClick={campaign.onDone}>Debrief</button>
          ) : (
            <button className="mini primary" onClick={quit}>To the menu</button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What the team is here to do, as plain text on the left of the screen: the
 * battle's name and conditions, then each objective, ticked off or failed as
 * it goes.
 */
function Objectives({ b, title, lineName }: { b: Battle; title: string; lineName: string }) {
  const killed = b.units.filter((u) => u.side === "enemy" && !u.alive).length;
  const heli = b.units.find((u) => u.kind === "helicopter");
  const hostage = b.units.find((u) => u.kind === "hostage");
  const torpor = b.units.filter((u) => u.side === "enemy" && u.alive && u.torpor && seenByAgents(b, u, u)).length;
  const carried = b.loot.filter((l) => l.by).length;
  type Line = { text: string; state?: "done" | "failed"; tip?: string; optional?: boolean };
  const lines: Line[] = [
    { text: `Destroy every thrall and vampire${killed ? ` (${killed} down)` : ""}`, state: !enemies(b).length ? "done" : undefined, tip: "A vampire in torpor still counts: finish it, burn it, or take it alive." },
  ];
  if (torpor) lines.push({ text: `Finish the vampire${torpor > 1 ? "s" : ""} in torpor before ${torpor > 1 ? "they rise" : "it rises"}` });
  if (hostage) {
    const freed = hostage.side === "agent";
    lines.push({
      text: !hostage.alive ? "The prisoner is dead" : hostage.evacuated ? "The prisoner is out" : freed ? "Get the prisoner out alive" : "Find and free the prisoner",
      state: !hostage.alive ? "failed" : hostage.evacuated ? "done" : undefined,
      tip: "Stand next to them to cut them loose; then get them to the landing zone, or keep them alive to the end.",
    });
  }
  if (b.loot.length) lines.push({ text: `Recover the crates: ${carried} of ${b.loot.length} carried`, state: carried === b.loot.length ? "done" : undefined, optional: true, tip: "Walk over one to pick it up; one per agent. A helicopter lifts everything still on the map at the end; otherwise only what the team carries out counts." });
  if (heli) lines.push({ text: heli.alive ? `Keep the helicopter flying (${heli.hp}/${heli.maxHp})` : "The helicopter is destroyed", state: heli.alive ? undefined : "failed", optional: true, tip: "It waits beside the landing zone. If it's destroyed, the aircraft is lost, and the team carries out only what it can." });
  lines.push({ text: "Or withdraw: everyone evacuates from the landing zone", optional: true });

  return (
    <div className="battle-objectives">
      <div className="obj-title">{title}</div>
      <div className="obj-conditions">
        {lineName} · {b.night ? "Night" : "Day"} · Turn {b.turn} · {b.side === "agent" ? "our move" : "enemy activity"}
        {b.concealed && <span className="concealed" data-tip="Unseen. Enemies notice an agent only this close (Tradecraft): the first shot gets +15 aim. Shooting or throwing gives us away; finishing a body doesn't."> · Concealed</span>}
      </div>
      <ul className="obj-list">
        {lines.map((l) => (
          <li key={l.text} className={`${l.state ?? ""}${l.optional ? " optional" : ""}`} data-tip={l.tip}>
            <span className="obj-mark">{l.state === "done" ? "✓" : l.state === "failed" ? "✗" : "◆"}</span>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * An agent's time units as a row of pips, one per tile of walking (4 TU):
 * blue while there's time to move and still attack, gold for the attack's
 * reserve, dark for what's spent.
 */
function TuBar({ u }: { u: Unit }) {
  const pips = Math.ceil(u.maxTu / TU_PER_TILE);
  const left = u.tu / TU_PER_TILE;
  const reserve = Math.min(left, attackCost(u) / TU_PER_TILE);
  return (
    <span className="squad-tu">
      {Array.from({ length: pips }, (_, i) => <i key={i} className={i < left - reserve - 1e-6 ? "move" : i < left - 1e-6 ? "keep" : ""} />)}
      <span className="tu-num">{u.tu}</span>
    </span>
  );
}
