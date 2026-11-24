// The battlescape (docs/design/tactical.md): a skirmish set up in the main
// menu, or a campaign mission's battle. Mouse after Wasteland 3: left click
// selects an agent or acts on a unit (a seen enemy: a shot in the fire mode
// chosen; a body: finish it), right click moves (blue line: time left for a
// shot; yellow: the TU run out); the wheel steps the level. HUD after
// Paradise Cracked: the action panel bottom left around the active item
// (the weapon, or a grenade or trauma kit held ready from the backpack
// strip), with fire modes, reload, sneak and the inventory. Squad cards top
// left: small (name, HP, TU), the selected one grown. Over each unit's head
// a bar; a seen enemy's shows the chance to hit and grows into its card.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bloodlineById } from "../../../data/bloodlines";
import { BattleView, type UnitSpec } from "../../../render/BattleView";
import { idx, levelName, type Pt3 } from "../../../tactical/map";
import { generateMap } from "../../../tactical/mapgen";
import { coverAround, WEAPONS } from "../../../tactical/rules";
import { traitsOf } from "../../../tactical/traits";
import { lootShare } from "../../../tactical/campaign";
import { HEALTH_ENEMY, healthColor } from "../../../render/health";
import { aimPoint, cepRadius, muzzle, pointAim } from "../../../tactical/ballistics";
import { logLine, type BattleLogEntry } from "../../../tactical/log";
import {
  active, agents, blastTiles, bleederInReach, bodiesInReach, commandCapture, commandEvacuate, commandFree, commandStabilize, craft, prisonerInReach, commandFinish, commandIncendiary, commandMove, commandReload,
  commandShoot, detectRadius, endTurn, enemies, fromIdx, INCENDIARY, newSkirmish, oddsAgainst, onLandingZone, onMap, pathTo, reach,
  seenByAgents, throwBlocker, unitAt, unitById, visibleFoes, attackCost, ready, shotCost, TU_COST, TU_PER_TILE,
  commandHeal, commandInventory, floorNear, healBlocker, healPlan, inventoryBlocker, inventoryCost, modesOf, patchable,
  reloadBlocker, reloadPlan, setMode, setSneak, INV_TU, SNEAK, inReach, leanFor, doorsInReach, commandOpenDoor, aimFrom, atRisk, coneOf, commandShootAt, forceBlocker,
  type Battle, type BattleEvent, type InvRef, type ShotMode, type Unit,
} from "../../../tactical/battle";
import { ITEMS } from "../../../data/equipment";
import { countOf } from "../../../sim/inventory";
import type { ItemId } from "../../../data/equipment";
import { COVER_HALF } from "../../../tactical/map";
import { Inventory, StatSheet, type Ref } from "../../components/Inventory";
import { VolumeSettings } from "../../components/VolumeSettings";
import { SITE_KINDS } from "../../../sim/missions";
import { useLoaded } from "../../components/LoadingScreen";
import { music } from "../../../audio/music";
import { ActionButton } from "../../components/ActionButton";
import { Icon, type IconName } from "../../components/Icon";
import { actionFor, AGENT_KEYS, bindingsOf, keyLabel, type BindingId } from "../../keys";
import { useStore } from "../../store";

const MODE_NAME: Record<ShotMode, string> = { snap: "Snap shot", aimed: "Aimed shot", burst: "Burst" };

/** The cone of `u`'s shot at a spot: its CEP radius there (metres), and the distance. */
function cepAt(b: Battle, u: Unit, at: { x: number; y: number; z: number }, from: Pt3, mode: ShotMode) {
  const m = muzzle(from, u.kind);
  const dist = Math.hypot(at.x - m.x, at.y - m.y, at.z - m.z);
  return { radius: cepRadius(coneOf(b, u, mode), dist), dist, from: m };
}

/** "0.4 m" */
const metres = (x: number) => `${x < 1 ? x.toFixed(2) : x.toFixed(1)} m`;

/** The lines of a shot's tooltip: the cost, the cone there (no hit chance: shots are ballistic), who's in the way. */
function shotTip(b: Battle, u: Unit, t: Unit, mode: ShotMode = "snap"): string[] {
  const w = WEAPONS[u.weapon];
  const o = oddsAgainst(b, u, t, u, false, mode);
  const from = aimFrom(b, u, t);
  const c = cepAt(b, u, aimPoint(b.map, t, t.kind, from), from, mode);
  const risk = w.melee ? [] : atRisk(b, u, t);
  return [
    `${w.melee ? "A blow" : MODE_NAME[mode]}: ${shotCost(u, mode)} TU of ${u.tu}${mode === "burst" ? ` · ${w.burst} rounds` : ""}`,
    w.melee ? "" : `Cone at ${metres(c.dist)}: half the rounds within ${metres(c.radius)} of the aim`,
    w.pellets ? `${w.pellets} pellets, spreading: anyone near the target can be hit` : "",
    leanFor(b, u, t) ? "Leaning out of cover to fire" : "",
    o.flanked ? "Flanked: no cover from here" : "",
    `${o.crit}% critical on a hit`,
    `${w.name}: ${w.damage[0]}–${w.damage[1]} damage`,
    risk.length ? `In the line of fire: ${risk.map((v) => v.name).join(", ")}` : "",
    t.kind === "vampire" ? "Bullets only put a vampire into torpor: finish it, or burn it." : "",
  ].filter(Boolean);
}

/** A campaign mission's battle (tactical/campaign.ts), played here instead of a skirmish. */
export interface CampaignBattleProps {
  battle: Battle;
  title: string;
  onDone: () => void;
  /** Saves the battle as it stands (with the campaign): after every command, before its playback. */
  onSave: () => void;
  /** Saves it and goes back to the main menu; loading the save comes back here. */
  onQuit: () => void;
}

export function SkirmishScreen({ campaign }: { campaign?: CampaignBattleProps } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const view = useRef<BattleView | null>(null);
  const loaded = useLoaded();
  const quit = useStore((s) => s.quitToMenu);
  const setup = useStore((s) => s.settings.skirmish);
  const seed = useStore((s) => s.skirmishSeed);
  const savedKeys = useStore((s) => s.settings.keys);
  const keys = useMemo(() => bindingsOf(savedKeys), [savedKeys]);
  const keyOf = (id: BindingId) => keyLabel(keys[id]);
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState<Pt3 | null>(null);
  /** Ctrl held: force fire (the next click shoots at the spot, not a unit). */
  const [force, setForce] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Control" && setForce(e.type === "keydown");
    const off = () => setForce(false);
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("keyup", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  const [selected, setSelected] = useState<string | null>("a0");
  const [busy, setBusy] = useState(false);
  /**
   * Each agent's active item (Paradise Cracked style): an item from a pocket or
   * the backpack in place of the weapon, to use where it is. It stays while
   * the agent has another of the kind; after the last, the weapon is back.
   */
  const [activeItems, setActiveItems] = useState<Record<string, ItemId | undefined>>({});
  const [invOpen, setInvOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [log, setLog] = useState<BattleLogEntry[]>([]);
  // During playback the battle is already at the end of what's played: the
  // damage each unit has still to take on screen, so its health drops as each
  // hit lands rather than all at once afterwards.
  const [owed, setOwed] = useState<Record<string, number>>({});
  /** The turn and side the events being played back belong to. */
  const stamp = useRef<{ turn: number; side: BattleLogEntry["side"] }>({ turn: 1, side: "agent" });
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  // Built once, from the setup the menu left: changing it mid-battle isn't possible.
  const skirmish = useMemo(() => {
    if (campaign) return null;
    const { setting, size, bloodline, night, kit, arrival, hostage, winter, rain, landmark, mayhem } = setup;
    const k = SITE_KINDS[size];
    const where = size === "lair" ? (bloodline === "carcassonne" ? "montsegur" : "lair") : setting;
    const m = generateMap({
      setting: where, size, seed, thralls: k.thralls + traitsOf(bloodline).extraThralls, vampires: k.vampires, civilians: size === "lair" ? 0 : 2,
      winter, rain, landmark: where === "urban" && landmark !== "none" ? landmark : undefined,
    });
    return newSkirmish(m, seed, { bloodline, night, kit, arrival, loot: 3, hostage, mayhem });
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
  const doors = me ? doorsInReach(b, me) : [];
  const activeItem = me ? activeOf(me, activeItems[me.id]) : undefined;
  const throwing = activeItem === "incendiary";
  const healing = activeItem === "medkit";
  const setActive = (item: ItemId | undefined) => me && setActiveItems((x) => ({ ...x, [me.id]: item }));
  const r = useMemo(() => (me && myTurn && !activeItem && ready(me) ? reach(b, me) : null), [b, me, myTurn, activeItem, me?.x, me?.y, me?.z, me?.tu, me?.overwatch, me?.sneak]);

  // ----- Keeping the view in step -----

  const specs = useCallback((): UnitSpec[] => {
    const targets = new Set(foes.map((f) => f.id));
    return b.units.map((u) => ({
      id: u.id, name: u.name, x: u.x, y: u.y, z: u.z, facing: u.facing, hp: u.hp, maxHp: u.maxHp,
      side: u.kind, carrying: u.carrying, bleeding: u.bleeding, stable: u.stable,
      dead: !u.alive, gone: u.evacuated || u.captured, overwatch: u.overwatch, torpor: u.torpor, dominated: u.dominated,
      // Next to low cover, people crouch (the look only).
      crouched: (u.kind === "agent" || u.kind === "thrall") && coverAround(map, u).some((c) => c === COVER_HALF),
      selected: u.id === me?.id && myTurn, targeted: myTurn && targets.has(u.id),
      visible: u.side === "agent" || !u.alive || seenByAgents(b, u, u),
    }));
  }, [b, foes, me, myTurn, map]);

  useEffect(() => {
    const v = new BattleView(ref.current!);
    v.ambient = true;
    view.current = v;
    v.onHover = setHover;
    v.setHeadLayer(headsRef.current);
    v.onLevelStep = (dir) => setLevel((z) => Math.max(0, Math.min(v.getMapLevels() - 1, z + dir)));
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
    // The first agent who can act (a battle loaded from a save may be well under way).
    const first = agents(battle).find(ready) ?? agents(battle)[0];
    setSelected(first?.id ?? null);
    if (first) v.focus(first);
    setActiveItems({});
    setBanner(battle.concealed ? "Concealed" : `Turn ${battle.turn}`);
    setLog([]);
    stamp.current = { turn: battle.turn, side: battle.side };
    // After this commit's other effects have put the units in.
    let live = true;
    const t = setTimeout(() => void v.whenDrawn().then(() => live && loaded()));
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [map, battle]);

  useEffect(() => view.current?.setDaylight(battle.night), [battle]);

  // Combat music from the moment any enemy is alerted (the team spotted, or a
  // pod woken by noise), the boss track once an elder is; either for the rest
  // of the battle. Every render: it's cheap.
  useEffect(() => {
    const alerted = battle.units.filter((u) => u.side === "enemy" && u.alerted);
    music.setBattleMood(alerted.some((u) => u.elder) ? "boss" : alerted.length ? "combat" : "stealth");
  });
  useEffect(() => () => music.setBattleMood("stealth"), []);

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
    v.setFloor(b.floor.map((f) => ({ x: f.x, y: f.y, z: f.z, weapon: ITEMS[f.item].slot === "weapon" })));
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
    const clear = () => (v.setPath(null), v.setAimLines(null));
    if (!hover || !r || !me || busy || force || unitAt(b, hover)) return clear();
    const c = r.cost.get(idx(map, hover.x, hover.y, hover.z));
    if (c === undefined) return clear();
    v.setPath([{ x: me.x, y: me.y, z: me.z }, ...(pathTo(b, r, hover) ?? [])], c > me.tu - attackCost(me) + 1e-6, coverAround(map, hover));
    // Aim lines: every enemy the team sees that could be attacked from there,
    // leaning out of full cover round its end where only that sees it.
    const targets = visibleFoes(b, me, hover)
      .filter((f) => f.side === "enemy" && seenByAgents(b, f, f) && inReach(b, me, f, hover))
      .map((f) => ({ at: { x: f.x, y: f.y, z: f.z }, lean: leanFor(b, me, f, hover) }));
    v.setAimLines(hover, targets);
  }, [hover, r, me, busy, b, map, force]);

  // The CEP: round an enemy hovered (where a click shoots), or, holding Ctrl, round the spot a forced shot would aim at.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const gun = me && !WEAPONS[me.weapon].melee && !activeItem;
    if (!hover || !me || !gun || busy || !myTurn) return void v.setCep(null);
    const there = unitAt(b, hover);
    const foe = there && foes.includes(there) ? there : undefined;
    if (!force && !foe) return void v.setCep(null);
    const from = aimFrom(b, me, hover);
    const at = there && active(there) ? aimPoint(map, there, there.kind, from) : pointAim(hover);
    const c = cepAt(b, me, at, from, me.mode);
    v.setCep({ at, radius: c.radius, from: c.from, force });
  });

  // ----- Acting -----

  /** Moves the camera to a unit, and the view to its level. */
  const lookAt = useCallback((u: Unit) => {
    view.current?.focus(u);
    setLevel(u.z);
  }, []);

  // The level shown changes by itself only with the actor in focus (user,
  // 2026-11-19): on selecting an agent, when the selected agent's own move
  // takes it to another floor, and on the enemy's turn to each enemy seen
  // acting (run). Not after a shot or a throw. The wheel or the level keys
  // look elsewhere until then.
  useEffect(() => {
    if (me) setLevel(me.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.z]);

  const select = useCallback((u: Unit | undefined, look = true) => {
    if (!u) return;
    setSelected(u.id);
    setStripOpen(false);
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
    // The rules are already final when a command returns: save now, so closing
    // the tab mid-playback keeps what was done.
    campaign?.onSave();
    const v = view.current!;
    setBusy(true);
    v.setMoveRange([]);
    v.setPath(null);
    let ended = false;
    const harm = (e: BattleEvent) => (e.kind === "shot" ? e.hits.map((h) => ({ id: h.unit, n: h.damage })) : e.kind === "burn" ? [{ id: e.unit, n: e.damage }] : []);
    const due: Record<string, number> = {};
    for (const e of events) for (const h of harm(e)) due[h.id] = (due[h.id] ?? 0) + h.n;
    setOwed({ ...due });
    // On the enemy's turn the camera and the level shown go to each enemy the
    // team sees as it starts to act (a change of actor), not between its actions.
    let actor: string | null = null;
    for (const e of events) {
      if (stamp.current.side === "enemy" && ((e.kind === "move" || e.kind === "shot") && e.seen || e.kind === "throw") && e.unit !== actor) {
        const at = v.unitShownAt(e.unit);
        if (at && (e.kind !== "throw" || at.seen)) {
          actor = e.unit;
          const z = e.kind === "move" ? Math.max(at.z, e.path.at(-1)!.z) : at.z;
          v.focus(at);
          v.setLevel(z);
          setLevel(z);
        }
      }
      if (e.kind === "turn") {
        stamp.current = { turn: e.turn, side: e.side };
        setBanner(e.side === "enemy" ? "Enemy activity" : `Turn ${e.turn}`);
        if (e.side === "agent") v.setUnits(specs());
      }
      if (e.kind === "status" && e.text === "Spotted!") setBanner("Spotted!");
      if (e.kind === "end") ended = true;
      const line = logLine(b, e);
      if (line) setLog((l) => [...l, { ...stamp.current, ...line }]);
      await v.play([e]);
      const hs = harm(e);
      if (hs.length) {
        for (const h of hs) due[h.id] = (due[h.id] ?? 0) - h.n;
        setOwed({ ...due });
      }
    }
    setOwed({});
    setBusy(false);
    bump();
    return ended;
  }, [specs, b, campaign]);

  const act = useCallback(async (res: BattleEvent[] | string) => {
    if (typeof res === "string") return useStore.getState().notify(res, "bad");
    setStripOpen(false);
    const ended = await run(res);
    if (ended || b.result) return;
    // Next agent with actions left; when none, the enemy's turn.
    // Not when the agent can't do anything useful any more (less than a step left).
    const cur = me && ready(me) && me.tu >= TU_PER_TILE ? me : nextAgent(me?.id);
    // The same agent again: the camera and the level stay where they are.
    if (cur) return select(cur, cur.id !== me?.id);
    const turn = endTurn(b);
    await run(turn);
    if (!b.result) select(agents(b).find(ready) ?? agents(b)[0]);
  }, [b, me, nextAgent, run, select]);

  const doEndTurn = useCallback(async () => {
    if (!myTurn) return;
    await run(endTurn(b));
    if (!b.result) select(agents(b).find(ready) ?? agents(b)[0]);
  }, [b, myTurn, run, select]);

  // Clicks on the map (Wasteland 3 style). Left: an agent selects; a seen enemy
  // is shot; a body, a prisoner or a bleeding agent next to us is seen to. With
  // an item active: a grenade is thrown where clicked; a trauma kit patches the
  // agent clicked. Right: walk there (with an item active: back to the weapon).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.onPick = (p) => {
      if (!myTurn) return;
      if (force && me && !activeItem && !WEAPONS[me.weapon].melee) return void act(commandShootAt(b, me, p, me.mode));
      if (throwing && me) return void act(commandIncendiary(b, me, p));
      const who = unitAt(b, p);
      if (healing && me && who && patchable(b, me).includes(who)) return void act(commandHeal(b, me, who));
      if (who && canCommand(who)) return select(who);
      if (who && me && who === prisoner) return void act(commandFree(b, me, who));
      if (who && me && who === bleeder) return void act(commandStabilize(b, me, who));
      if (who && me && bodies.includes(who)) return void act(commandFinish(b, me, who));
      if (who && me && foes.includes(who)) return void act(commandShoot(b, me, who, me.mode));
    };
    v.onCommand = (p) => {
      if (!myTurn) return;
      if (activeItem) return setActive(undefined);
      if (me && !unitAt(b, p)) void act(commandMove(b, me, p));
    };
  });

  const need = (n: number) => (me && me.tu < n ? `Needs ${n} TU (${me.tu} left)` : null);
  type Command = { id: string; icon: IconName; label: string; badge?: string; key?: BindingId; on?: boolean; blocker: string | null; tip: string[]; run: () => void };
  /** Usable things carried, by kind: for the backpack strip. */
  const usable = me ? usableKinds(me) : [];
  // The action panel, bottom left (Paradise Cracked): the weapon console (fire modes, reload; square brass keys) …
  const weaponCmds: Command[] = me ? [
    ...(activeItem ? [] : modesOf(me).filter(() => modesOf(me).length > 1).map((mode): Command => ({
      id: `mode-${mode}`, icon: mode as IconName, label: mode === "snap" ? "Snap" : mode === "aimed" ? "Aimed" : "Burst", key: me.mode === mode ? "fireMode" : undefined,
      on: me.mode === mode,
      blocker: null,
      tip: [
        `Fire mode: ${MODE_NAME[mode].toLowerCase()}, ${shotCost(me, mode)} TU.`,
        mode === "snap" ? "Quick, from the hip." : mode === "aimed" ? "Steadier: a cone about half as wide." : `${WEAPONS[me.weapon].burst} rounds at one target, each in a wider cone, until it drops.`,
        "Clicking an enemy shoots in this mode; Ctrl-click fires at a spot.",
      ],
      run: () => { setMode(me, mode); bump(); },
    }))),
    {
      id: "reload", icon: "reload", label: "Reload", key: "reload",
      blocker: reloadBlocker(me),
      tip: [
        `${reloadPlan(me)?.cost ?? TU_COST.reload} TU${reloadPlan(me)?.mag.in === "pack" ? " (from the backpack)" : ""}. The magazine in the gun is dropped.`,
        `${me.ammo} of ${WEAPONS[me.weapon].clip} rounds left. Magazines carried: ${me.gear.weapon && ITEMS[me.gear.weapon].mag ? countOf(me.gear, ITEMS[me.gear.weapon].mag!) : 0}.`,
      ],
      run: () => void act(commandReload(b, me)),
    },
  ] : [];
  // The agent's own: sneak, the backpack, the inventory (round steel buttons).
  const agentCmds: Command[] = me ? [
    {
      id: "sneak", icon: "status-covert", label: "Sneak", key: "sneak", on: me.sneak,
      blocker: null,
      tip: [
        me.sneak ? "Sneaking: on." : "Sneaking: off.",
        `Each step costs ${SNEAK.move}× the time; while the team is concealed, an enemy must come twice as close to spot this agent (now within ${detectRadius(me)} tiles).`,
        "Stack up on a door before a breach, by day, while they sleep inside.",
      ],
      run: () => { setSneak(me, !me.sneak); bump(); },
    },
    {
      id: "backpack", icon: "use-item", label: "Backpack", key: "useItem", on: stripOpen,
      badge: usable.length ? `${usable.reduce((t, x) => t + x.n, 0)}` : undefined,
      blocker: usable.length ? null : "Nothing to use in the pockets or the backpack",
      tip: ["Grenades and trauma kits carried: pick one to hold it ready in place of the weapon, then click where to throw it, or who to patch. It stays ready while there's another; after the last, the weapon is back. Right click or Esc: the weapon now."],
      run: () => setStripOpen((x) => !x),
    },
    {
      id: "inventory", icon: "inventory", label: "Inventory", key: "inventory",
      blocker: null,
      tip: ["The agent's sheet: stats, hand, pockets, backpack, and what lies on the ground near by. Moving things costs TU: a pocket is quick, the backpack and the ground slower."],
      run: () => setInvOpen(true),
    },
  ] : [];
  const evacuate: Command | null = me ? {
    id: "evacuate", icon: "evacuate", label: "Evacuate", key: "evacuate",
    blocker: !onLandingZone(b, me) ? "Only from the landing zone" : need(TU_COST.evacuate),
    tip: [`${TU_COST.evacuate} TU. This agent leaves the battle. If everyone left alive leaves, the mission is abandoned.`],
    run: () => void act(commandEvacuate(b, me)),
  } : null;
  const commands: Command[] = [...weaponCmds, ...agentCmds, ...(evacuate ? [evacuate] : [])];

  // Keys (ui/keys.ts, rebound in the main menu): number keys pick agents; the rest are actions and levels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (invOpen) return; // the inventory window has the keyboard (Esc closes it)
      if (e.key === "Escape") return stripOpen ? setStripOpen(false) : activeItem ? setActive(undefined) : undefined;
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
        return void act(commandShoot(b, me, best, me.mode));
      }
      if (id === "incendiary" && me) return setActive(activeItem === "incendiary" || !countOf(me.gear, "incendiary") ? undefined : "incendiary");
      if (id === "fireMode" && me && !activeItem) {
        const ms = modesOf(me);
        setMode(me, ms[(ms.indexOf(me.mode) + 1) % ms.length]!);
        return bump();
      }
      const c = commands.find((x) => x.key === id && id !== "fireMode");
      if (c && !c.blocker) c.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Dev builds: a handle for browser tests.
  if (import.meta.env.DEV) (window as unknown as { __skirmish?: unknown }).__skirmish = { b, bump, select, throwAt: (p: Pt3) => me && act(commandIncendiary(b, me, p)), setActive };

  const hovered = hover ? unitAt(b, hover) : undefined;
  const hoverUnit = hovered && (hovered.side === "agent" || seenByAgents(b, hovered, hovered)) ? hovered : undefined;
  // The bars over heads. While events play back, they keep what they showed
  // before (the battle has already moved on): health drops when the view gets there.
  const headsLive = useRef<HeadInfo[]>([]);
  /** Health as the screen should show it: the unit's own, plus any damage still to play. */
  const shownHp = (id: string, frozen: number) => {
    const u = unitById(b, id);
    return u ? Math.min(u.maxHp, u.hp + (owed[id] ?? 0)) : frozen;
  };
  if (!busy) headsLive.current = headInfos(b, myTurn ? me : undefined, foes);
  const openHead = !busy && hoverUnit?.side === "enemy" ? hoverUnit.id : null;
  const lost = b.units.filter((u) => u.side === "agent" && !u.alive).length;
  const killed = b.units.filter((u) => u.side === "enemy" && !u.alive).length;
  const taken = b.units.filter((u) => u.captured).length;
  const hostage = b.units.find((u) => u.kind === "hostage");
  const line = bloodlineById(battle.bloodline)!;

  return (
    <div className="screen skirmish">
      <div className="battle-layer" ref={ref} />
      <div className="battle-heads" ref={headsRef}>
        {headsLive.current.map((h) => <HeadBar key={h.id} h={busy ? { ...h, hp: shownHp(h.id, h.hp) } : h} open={h.id === openHead} />)}
      </div>
      <div className="battle-squad">
        {squad.map((u, i) => <SquadCard key={u.id} u={u} hp={shownHp(u.id, u.hp)} on={u.id === me?.id} num={i < AGENT_KEYS.length ? keyOf(AGENT_KEYS[i]!) : ""} onClick={() => pick(u)} />)}
      </div>

      <Objectives b={b} title={campaign?.title ?? "Skirmish"} lineName={line.name} />

      <div className="battle-corner">
        <div className="battle-corner-buttons">
          <button className={`mini${soundOpen ? " on" : ""}`} onClick={() => setSoundOpen((o) => !o)} aria-expanded={soundOpen} data-tip="Volume: master, music, effects and ambience">Sound</button>
          {!campaign && <button className="mini battle-quit" onClick={quit} data-tip="Back to the main menu. This battle is lost; set up another there.">Quit ✕</button>}
          {campaign && !b.result && (
            <button className="mini battle-quit" onClick={campaign.onQuit} disabled={busy} data-tip="The battle is saved with the campaign after every action. Back to the main menu; loading the save comes straight back to this turn.">
              Save &amp; quit
            </button>
          )}
        </div>
        {soundOpen && (
          <div className="panel battle-sound">
            <VolumeSettings />
          </div>
        )}
      </div>

      <div className="battle-levels panel">
        <button className="mini" onClick={() => setLevel((z) => Math.min(map.levels - 1, z + 1))} disabled={level >= map.levels - 1} data-tip={`Show the level above (${keyOf("levelUp")}, or the wheel)`}>▲</button>
        <span className="battle-level">{level === map.levels - 1 ? "All levels" : levelName(map, level)}</span>
        <button className="mini" onClick={() => setLevel((z) => Math.max(0, z - 1))} disabled={level <= 0} data-tip={`Cut away to the level below (${keyOf("levelDown")}, or the wheel)`}>▼</button>
      </div>

      <footer className="battle-bottom">
        <div className="battle-column">
        <FloatingLog log={log} />
        {me && myTurn && (
          <div className="battle-actions">
            {throwing && <div className="warn-text small battle-throw-hint">{hover ? throwBlocker(b, me, hover) ?? "Click to throw" : "Click where to throw"} · right click: the weapon</div>}
            {force && !activeItem && !WEAPONS[me.weapon].melee && (() => {
              const why = hover ? forceBlocker(b, me, hover, me.mode) : null;
              const risk = hover && !why ? atRisk(b, me, hover) : [];
              return (
                <div className="warn-text small battle-throw-hint">
                  Force fire ({MODE_NAME[me.mode].toLowerCase()}): {!hover ? "click a spot" : why ?? (risk.length ? `in the line of fire: ${risk.map((u) => u.name).join(", ")}` : "click to fire at it")} · let go of Ctrl to stop
                </div>
              );
            })()}
            {healing && <div className="warn-text small battle-throw-hint">Click the agent to patch (this one, or one next to them) · right click: the weapon</div>}
            <div className="battle-targets">
              {healing && patchable(b, me).map((t) => {
                const why = healBlocker(b, me, t);
                return (
                  <button key={`patch-${t.id}`} className={`target-chip finish${why ? " short" : ""}`} data-tip={`${healPlan(me)?.cost ?? TU_COST.heal} TU: up to ${Math.min(10, t.maxHp - t.hp)} health back.${why ? `\n${why}` : ""}`} onClick={() => void act(commandHeal(b, me, t))}>
                    <Icon name="medkit" size={14} /> Patch {t === me ? "self" : t.name} <span className="tu-cost">{healPlan(me)?.cost ?? TU_COST.heal} TU</span>
                  </button>
                );
              })}
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
              {doors.map((d) => (
                <button key={`door-${d.x},${d.y},${d.z},${d.dx}`} className={`target-chip finish${me.tu < TU_COST.door ? " short" : ""}`} data-tip={`${TU_COST.door} TU: open it, and see in (and be seen). It stays open. Walking through a closed door opens it too, for the same.`} onClick={() => void act(commandOpenDoor(b, me, d))}>
                  <Icon name="door" size={14} /> Open the door <span className="tu-cost">{TU_COST.door} TU</span>
                </button>
              ))}
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
              {!activeItem && foes.map((f) => (
                <span key={f.id} className="target-group" onMouseEnter={() => view.current?.focus(f)}>
                  <button className={`target-chip${me.tu < shotCost(me, me.mode) ? " short" : ""}`} data-tip={shotTip(b, me, f, me.mode).join("\n")} onClick={() => void act(commandShoot(b, me, f, me.mode))}>
                    <Icon name={f.kind === "vampire" ? "claws" : "shoot"} size={14} /> {f.name}{modesOf(me).length > 1 && me.mode !== "snap" ? ` · ${MODE_NAME[me.mode].toLowerCase()}` : ""}
                    <span className="tu-cost">{shotCost(me, me.mode)} TU</span>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        </div>
      </footer>

      {me && myTurn && (
        <div className="battle-panel">
          {stripOpen && (
            <div className="battle-strip panel">
              <button className={`strip-item${!activeItem ? " on" : ""}`} onClick={() => { setActive(undefined); setStripOpen(false); }} data-tip="Back to the weapon in hand">
                <Icon name={me.gear.weapon ?? "knife"} size={22} /><span>{me.gear.weapon ? ITEMS[me.gear.weapon].name : "Knife"}</span>
              </button>
              {usable.map((x) => (
                <button key={x.item} className={`strip-item${activeItem === x.item ? " on" : ""}`} onClick={() => { setActive(x.item); setStripOpen(false); }}
                  data-tip={[
                    `${ITEMS[x.item].name}: ${x.n} carried (${x.pockets} in pockets, ${x.n - x.pockets} in the backpack). Pockets first; from the backpack +${INV_TU.pack} TU.`,
                    x.item === "incendiary"
                      ? `Click where to throw, up to ${INCENDIARY.range} tiles: a 3 × 3 fire, ${INCENDIARY.damage[0]}–${INCENDIARY.damage[1]} burns, double to a vampire, for ${INCENDIARY.turns} turns. A vampire in torpor burns to ash.`
                      : `Click the agent to patch, this one or one next to them: up to 10 health back.`,
                  ].join("\n")}>
                  <Icon name={x.item} size={22} /><span>{ITEMS[x.item].name}</span><b>×{x.n}</b>
                </button>
              ))}
            </div>
          )}
          <div className="battle-panel-body panel">
            <div className="pc-agent">
              {agentCmds.map((c) => <ActionButton key={c.id} tile iconOnly className={`pc-round${c.on ? " on" : ""}`} icon={c.icon} label={c.label} badge={c.badge} hotkey={c.key ? keyOf(c.key) : undefined} tip={c.tip} blocker={c.blocker} onClick={c.run} />)}
            </div>
            <div className="pc-weapon">
              <ActiveWell me={me} item={activeItem} />
              <div className="pc-tray">
                {weaponCmds.map((c) => <ActionButton key={c.id} tile iconOnly className={`pc-key${c.id === "reload" ? " pc-reload" : ""}`} icon={c.icon} label={c.label} hotkey={c.key ? keyOf(c.key) : undefined} tip={c.tip} blocker={c.blocker} onClick={c.run} primary={c.on} />)}
              </div>
            </div>
          </div>
        </div>
      )}
      {myTurn && (
        <div className="battle-end-turn panel">
          {evacuate && <ActionButton tile icon={evacuate.icon} label={evacuate.label} hotkey={keyOf("evacuate")} tip={evacuate.tip} blocker={evacuate.blocker} onClick={evacuate.run} />}
          <ActionButton tile primary icon="end-turn" label="End turn" hotkey={keyOf("endTurn")}
            tip={["The enemy moves.", "Agents with remaining TU and ammo will react to enemy movement."]} onClick={() => void doEndTurn()} />
        </div>
      )}

      {invOpen && me && myTurn && <BattleInventory b={b} me={me} squad={squad.filter(canCommand)} onSelect={(u) => select(u)} onChange={bump} onClose={() => setInvOpen(false)} />}
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

/** The agent's active item, if they still carry one of it (else the weapon: undefined). */
function activeOf(u: Unit, item: ItemId | undefined): ItemId | undefined {
  return item && countOf(u.gear, item) > 0 ? item : undefined;
}

/** What can be used from the pockets and the backpack, by kind. */
function usableKinds(u: Unit): { item: ItemId; n: number; pockets: number }[] {
  const out: { item: ItemId; n: number; pockets: number }[] = [];
  for (const x of u.gear.stowed) {
    if (!ITEMS[x.item].use) continue;
    let k = out.find((o) => o.item === x.item);
    if (!k) out.push((k = { item: x.item, n: 0, pockets: 0 }));
    k.n++;
    if (x.in !== "pack") k.pockets++;
  }
  return out;
}

/**
 * A squad card. Small for everyone but the selected agent: the name, and HP
 * and TU as numbers. The selected agent's grows: the weapon and its rounds,
 * HP and TU as bars.
 */
function SquadCard({ u, hp, on, num, onClick }: { u: Unit; hp: number; on: boolean; num: string; onClick: () => void }) {
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
    <button className={`squad-card panel${on ? " on" : ""}${!u.alive ? " dead" : ""}${u.evacuated ? " gone" : ""}`} onClick={onClick}>
      <span className="squad-num">{num}</span>
      {on ? (
        <span className="squad-body">
          <span className="squad-head">
            <span className="squad-name">{u.name}</span>
            <span className="squad-weapon">
              <Icon name={u.weapon} size={14} />{WEAPONS[u.weapon].clip ? <span className="squad-ammo">{u.ammo}/{WEAPONS[u.weapon].clip}</span> : null}
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
            <span style={{ color: u.alive ? healthColor(hp, u.maxHp) : undefined }}>HP {Math.max(0, hp)}</span>
            <span>TU {Math.max(0, u.tu)}</span>
          </span>
        </span>
      )}
    </button>
  );
}

/** The active item, large (Paradise Cracked style): the weapon in hand and its rounds, or the item held ready and how many are left. */
function ActiveWell({ me, item }: { me: Unit; item: ItemId | undefined }) {
  const w = WEAPONS[me.weapon];
  const shown = item ?? me.gear.weapon;
  return (
    <div className={`battle-well${item ? " item" : ""}`}>
      <Icon name={shown ?? "knife"} size={40} />
      <div className="battle-well-text">
        <span className="battle-well-name">{shown ? ITEMS[shown].name : "Combat knife"}</span>
        <span className="battle-well-sub">
          {item ? `×${countOf(me.gear, item)} ready` : w.clip ? `${me.ammo}/${w.clip} rounds` : w.melee ? "A blow" : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * The inventory window on the battlescape: the agent's sheet (stats) beside
 * the inventory, the ground near by below. Every move costs time. ◀ ▶ steps
 * through the squad, to hand things over by the floor.
 */
function BattleInventory({ b, me, squad, onSelect, onChange, onClose }: { b: Battle; me: Unit; squad: Unit[]; onSelect: (u: Unit) => void; onChange: () => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" || e.code === "KeyI") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const toInv = (r: Ref): InvRef | null => ("armoury" in r ? null : r);
  const i = Math.max(0, squad.indexOf(me));
  const blocker = (from: Ref, to: Ref) => {
    const f = toInv(from), t = toInv(to);
    return f && t ? inventoryBlocker(b, me, f, t) : "Not here";
  };
  const cost = (from: Ref, to: Ref) => {
    const f = toInv(from), t = toInv(to);
    return f && t ? inventoryCost(f, t) : 0;
  };
  const onMove = (from: Ref, to: Ref) => {
    const f = toInv(from), t = toInv(to);
    if (!f || !t) return;
    const why = commandInventory(b, me, f, t);
    if (why) useStore.getState().notify(why, "bad");
    onChange();
  };
  return (
    <div className="inv-backdrop" onClick={onClose}>
      <section className="panel inv-window" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h3 className="detail-title">
            <button className="mini" disabled={squad.length < 2} onClick={() => onSelect(squad[(i - 1 + squad.length) % squad.length]!)} data-tip="Previous agent">◀</button>{" "}
            {me.name}{" "}
            <button className="mini" disabled={squad.length < 2} onClick={() => onSelect(squad[(i + 1) % squad.length]!)} data-tip="Next agent">▶</button>
          </h3>
          <button className="mini" onClick={onClose} data-tip="Close (Esc)">✕</button>
        </div>
        <Inventory gear={me.gear} handAmmo={me.ammo} locked={["armour", "helmet"]} blocker={blocker} cost={cost} onMove={onMove}
          sheet={<StatSheet rows={[
            ["Health", `${me.hp}/${me.maxHp}`], ["Time units", `${me.tu}/${me.maxTu}`], ["Aim", `${me.aim}`], ["Armour", `${me.armour}`],
            ["Faith", `${me.faith}`], ["Tradecraft", `${me.tradecraft}`], ["Insight", `${me.insight}`], ["Spotted within", `${detectRadius(me)} tiles`],
          ]} />}
          ground={floorNear(b, me).map((f) => ({ id: f.id, item: f.item, ammo: f.ammo }))}
          header={<>
            <TuBar u={me} />
            <span>Out of or into a pocket {INV_TU.pocket} TU · the backpack, the ground {INV_TU.pack} · the hand {INV_TU.hand}; within one container {INV_TU.shuffle}. Armour stays on in a fight.</span>
          </>} />
      </section>
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
 * The battle's messages, as plain text over the action bar, like the
 * objectives: the last three; "All messages" opens them in place, about five
 * lines tall and scrolling, by turn.
 */
function FloatingLog({ log }: { log: BattleLogEntry[] }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, log.length]);
  if (!log.length) return null;
  const entries = open ? log : log.slice(-3);
  const first = log.length - entries.length;
  let last = "";
  return (
    <div className={`battle-log-text${open ? " open" : ""}`}>
      {log.length > 3 && (
        <button className="battle-log-toggle" onClick={() => setOpen(!open)}>
          {open ? "▾ Fewer" : `▴ All messages (${log.length})`}
        </button>
      )}
      <div ref={listRef} className="battle-log-lines">
        {entries.map((l, i) => {
          const head = `Turn ${l.turn} · ${l.side === "agent" ? "our move" : "enemy activity"}`;
          const header = open && head !== last;
          last = head;
          return (
            <div key={first + i} className="battle-log-line">
              {header && <div className="battle-log-turn">{head}</div>}
              <span className={`tone-${l.tone}`}>{l.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The inside of a health bar: the fill, and behind it a white ghost that lags it down (CSS). */
function HpFill({ pct, color }: { pct: number; color: string }) {
  return (
    <>
      <i className="hp-ghost" style={{ width: `${pct}%` }} />
      <i className="hp-fill" style={{ width: `${pct}%`, background: color }} />
    </>
  );
}

/** Health as a number and a bar, coloured by damage (or always red for an enemy). */
function HpBar({ hp, max, enemy }: { hp: number; max: number; enemy?: boolean }) {
  const pct = max > 0 ? (100 * Math.max(0, hp)) / max : 0;
  return (
    <span className="unit-bar">
      <span className="unit-bar-label">HP</span>
      <span className="unit-bar-num">{Math.max(0, hp)}/{max}</span>
      <span className="unit-bar-track hp-track"><HpFill pct={pct} color={enemy ? HEALTH_ENEMY : healthColor(hp, max)} /></span>
    </span>
  );
}

/**
 * An agent's time units as a number and a bar: blue while there's time to
 * move and still attack, gold for the attack's reserve, dark for what's spent.
 */
function TuBar({ u }: { u: Unit }) {
  const left = Math.max(0, u.tu);
  const reserve = Math.min(left, attackCost(u));
  const pct = (n: number) => `${(100 * n) / Math.max(1, u.maxTu)}%`;
  return (
    <span className="unit-bar">
      <span className="unit-bar-label">TU</span>
      <span className="unit-bar-num">{left}/{u.maxTu}</span>
      <span className="unit-bar-track">
        <i className="move" style={{ width: pct(left - reserve) }} />
        <i className="keep" style={{ width: pct(reserve) }} />
      </span>
    </span>
  );
}

/** What one bar over a head shows: copied out of the battle, so it holds still during playback. */
interface HeadInfo {
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
  odds?: { modes: { mode: ShotMode; cep: number }[]; crit: number; notes: string[]; melee: boolean; by: string };
  /** Why there's no shot for a seen enemy. */
  noShot?: string;
}

const KIND_NAMES: Record<Unit["kind"], string> = { vampire: "Vampire", thrall: "Thrall", agent: "Agent", civilian: "Civilian", hostage: "Prisoner", helicopter: "Aircraft" };

/** The bars to draw: every unit the team sees, not civilians, the dead or those gone. */
function headInfos(b: Battle, me: Unit | undefined, foes: Unit[]): HeadInfo[] {
  const out: HeadInfo[] = [];
  for (const u of b.units) {
    if (u.kind === "civilian" || !u.alive || u.evacuated || u.captured) continue;
    if (u.side !== "agent" && !seenByAgents(b, u, u)) continue;
    const enemy = u.side === "enemy";
    const w = WEAPONS[u.weapon];
    const h: HeadInfo = {
      id: u.id, name: u.name, kind: KIND_NAMES[u.kind], enemy, hp: u.hp, maxHp: u.maxHp,
      tags: [u.side === "enemy" && u.overwatch ? "REACT" : "", u.side === "agent" && u.sneak ? "SNEAK" : "", u.dominated ? "DOM" : ""].filter(Boolean),
      weapon: u.kind === "helicopter" || u.kind === "hostage" ? undefined : { icon: u.weapon, name: w.name, damage: w.damage },
    };
    if (u.torpor) { h.lying = { text: `Torpor · ${u.torpor}`, tone: "bad" }; h.torpor = u.torpor; }
    else if (u.bleeding > 0) h.lying = { text: `Bleeding · ${u.bleeding}`, tone: "warn" };
    else if (u.stable) h.lying = { text: "Stable", tone: "good" };
    if (enemy && me && foes.includes(u)) {
      // In the fire mode chosen (a click shoots in it); the card lists every mode the weapon has.
      const melee = !!WEAPONS[me.weapon].melee;
      const cur = oddsAgainst(b, me, u, me, false, me.mode);
      const from = aimFrom(b, me, u);
      const at = aimPoint(b.map, u, u.kind, from);
      const risk = melee ? [] : atRisk(b, me, u);
      h.odds = {
        crit: cur.crit, melee, by: me.name,
        modes: melee ? [] : modesOf(me).map((mode) => ({ mode, cep: cepAt(b, me, at, from, mode).radius })),
        notes: [cur.flanked ? "Flanked" : "", leanFor(b, me, u) ? "Leaning out" : "", risk.length ? `${risk.map((v) => v.name).join(", ")} in the line of fire` : ""].filter(Boolean),
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
function HeadBar({ h, open }: { h: HeadInfo; open: boolean }) {
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
            {h.lying ? <div className="head-line">{h.torpor ? `In torpor: rises in ${h.torpor} turn${h.torpor === 1 ? "" : "s"}. Finish it, burn it, or take it alive.` : h.lying.text}</div> : (
              <div className="head-line head-hp"><span>Vitality</span><b>{Math.max(0, h.hp)}/{h.maxHp}</b></div>
            )}
            {h.weapon && <div className="head-line"><Icon name={h.weapon.icon} size={14} /> {h.weapon.name} · {h.weapon.damage[0]}–{h.weapon.damage[1]} damage</div>}
            {h.odds ? (
              <div className="head-odds">
                <div className="head-chances">
                  {h.odds.melee ? <span>Within reach of a blow</span> : h.odds.modes.map((m) => <span key={m.mode} data-tip="Half the rounds land within this of the aim"><b>±{metres(m.cep)}</b> {m.mode === "burst" ? "burst (each)" : m.mode}</span>)}
                  <span className="head-crit">{h.odds.crit}% crit</span>
                </div>
                {(h.odds.notes.length > 0) && <div className="head-why">{h.odds.by}: {h.odds.notes.join(" · ")}</div>}
              </div>
            ) : h.noShot ? <div className="head-line dim">{h.noShot}</div> : null}
          </div>
        </div>
        <div className="head-row">
          {h.lying ? <span className={`head-lying ${h.lying.tone}`}>{h.lying.text}</span> : (
            <span className="head-track hp-track"><HpFill pct={pct} color={h.enemy ? HEALTH_ENEMY : healthColor(h.hp, h.maxHp)} /></span>
          )}
          {h.tags.length > 0 && (
            <span className="head-side">
              {h.tags.map((t) => <span key={t} className="head-tag">{t}</span>)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
