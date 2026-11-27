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
import { sfx } from "../../../audio/sfx";
import { BattleView } from "../../../render/battle/BattleView";
import { idx, type Pt3 } from "../../../tactical/map/map";
import { coverAround, WEAPONS } from "../../../tactical/rules";
import { aimPoint, pointAim } from "../../../tactical/ballistics";
import { logLine, type BattleLogEntry } from "../../../tactical/log";
import {
  active,
  agents,
  bodiesInReach,
  oddsAgainst,
  onMap,
  seenByAgents,
  unitAt,
  unitById,
  visibleFoes,
  attackCost,
  ready,
  TU_PER_TILE,
  modesOf,
  inReach,
  leanFor,
  aimFrom,
  type Battle,
  type BattleEvent,
  type Unit,
  FLASHBANG,
  STROBE,
} from "../../../tactical/battle";
import {
  blastTiles,
  bleederInReach,
  commandFree,
  commandStabilize,
  prisonerInReach,
  commandFinish,
  commandIncendiary,
  commandThrow,
  flareTiles,
  type Throwable,
  commandMove,
  commandShoot,
  throwBlocker,
  commandHeal,
  patchable,
  commandShootAt,
} from "../../../tactical/commands";
import { endTurn } from "../../../tactical/turns";
import { fromIdx, pathTo, reach } from "../../../tactical/movement";
import { setMode } from "../../../tactical/inventory";
import { doorsInReach } from "../../../tactical/doors";
import { ITEMS } from "../../../data/equipment";
import { countOf } from "../../../sim/people/inventory";
import type { ItemId } from "../../../data/equipment";
import { FloatingLog } from "../../components/FloatingLog";
import { PauseMenu } from "../geoscape/PauseMenu";
import { useLoaded } from "../../components/LoadingScreen";
import { music } from "../../../audio/music";
import { ActionButton } from "../../components/ActionButton";
import { actionFor, AGENT_KEYS, bindingsOf, keyLabel, type BindingId } from "../../keys";
import { HANDLES } from "../../handles";
import { useStore } from "../../store";
import { activeOf, usableKinds } from "./activeItem";
import { cepAt } from "./shotTip";
import { type HeadInfo, headInfos, HeadBar } from "./HeadBars";
import { SquadCard } from "./SquadCard";
import { Objectives } from "./BattleObjectives";
import { BattleInventory } from "./BattleInventory";

import { harmOf, skirmishFromSetup, squadOf, unitSpecs } from "./battleSetup";
import {
  agentCommands,
  evacuateCommand,
  weaponCommands,
  type CommandContext,
} from "./actionCommands";
import { ActionPanel } from "./ActionPanel";
import { ActionHints, TargetChips } from "./TargetChips";
import { LevelPicker, ResultCard } from "./BattleHud";

/** A campaign mission's battle (tactical/campaign.ts), played here instead of a skirmish. */
interface CampaignBattleProps {
  battle: Battle;
  title: string;
  onDone: () => void;
  /** Saves the battle as it stands (with the campaign): after every command, before its playback. */
  onSave: () => void;
}

/** True while Ctrl is held: force fire (the next click shoots at the spot, not a unit). */
function useCtrlHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Control" && setHeld(e.type === "keydown");
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return held;
}

/** The agent the camera starts on: the first who can act (a loaded battle may be well under way). */
const firstReady = (b: Battle) => agents(b).find(ready) ?? agents(b)[0];

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
  const force = useCtrlHeld();

  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState<Pt3 | null>(null);
  const [selected, setSelected] = useState<string | null>("a0");
  /** Events are playing back: no input until they're done. */
  const [busy, setBusy] = useState(false);
  /**
   * Each agent's active item (Paradise Cracked style): an item from a pocket or
   * the backpack in place of the weapon, to use where it is. It stays while
   * the agent has another of the kind; after the last, the weapon is back.
   */
  const [activeItems, setActiveItems] = useState<Record<string, ItemId | undefined>>({});
  const [invOpen, setInvOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [log, setLog] = useState<BattleLogEntry[]>([]);
  // During playback the battle is already at the end of what's played: the
  // damage each unit has still to take on screen, so its health drops as each
  // hit lands rather than all at once afterwards.
  const [owed, setOwed] = useState<Record<string, number>>({});
  /** The turn and side the events being played back belong to. */
  const stamp = useRef<{ turn: number; side: BattleLogEntry["side"] }>({ turn: 1, side: "agent" });
  // The battle changes in place; `rev` says when.
  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  // Built once, from the setup the menu left: changing it mid-battle isn't possible.
  const skirmish = useMemo(
    () => (campaign ? null : skirmishFromSetup(setup, seed)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign, seed],
  );
  const b = campaign?.battle ?? skirmish!;
  const map = b.map;

  // ----- The selected agent and what's around them -----

  const sel = selected ? unitById(b, selected) : undefined;
  const me = sel && sel.side === "agent" && active(sel) ? sel : undefined;
  const myTurn = b.side === "agent" && !b.result && !busy;
  const foes = me ? visibleFoes(b, me).filter((f) => f.side === "enemy") : [];
  const bodies = me ? bodiesInReach(b, me) : [];
  const prisoner = me ? prisonerInReach(b, me) : undefined;
  const bleeder = me ? bleederInReach(b, me) : undefined;
  const doors = me ? doorsInReach(b, me) : [];
  const activeItem = me ? activeOf(me, activeItems[me.id]) : undefined;
  const throwing = !!activeItem && ITEMS[activeItem].use === "throw";
  const healing = !!activeItem && ITEMS[activeItem].use === "heal";
  const hasGun = !!me && !WEAPONS[me.weapon].melee && !activeItem;
  const setActive = (item: ItemId | undefined) =>
    me && setActiveItems((x) => ({ ...x, [me.id]: item }));
  /** Where the selected agent can walk, and at what cost. */
  const r = useMemo(
    () => (me && myTurn && !activeItem && ready(me) ? reach(b, me) : null),
    [b, me, myTurn, activeItem, me?.x, me?.y, me?.z, me?.tu, me?.overwatch, me?.sneak],
  );
  const squad = squadOf(b);
  const canCommand = (u: Unit) => u.side === "agent" && onMap(u) && u.bleeding === 0 && !u.stable;

  // ----- Keeping the view in step -----

  const specs = useCallback(() => unitSpecs(b, me, foes, myTurn), [b, foes, me, myTurn]);

  useEffect(() => {
    const v = new BattleView(ref.current!);
    v.ambient = true;
    view.current = v;
    v.onHover = setHover;
    v.setHeadLayer(headsRef.current);
    v.onLevelStep = (dir) => setLevel((z) => Math.max(0, Math.min(v.getMapLevels() - 1, z + dir)));
    v.cameraKeys = {
      forward: keys.panForward,
      back: keys.panBack,
      left: keys.panLeft,
      right: keys.panRight,
      rotateLeft: keys.rotateLeft,
      rotateRight: keys.rotateRight,
    };
    return () => {
      v.dispose();
      view.current = null;
    };
  }, []);

  // A new battle: the map, the first agent, a clean log.
  useEffect(() => {
    const v = view.current!;
    v.setMap(map);
    setLevel(v.getLevel());
    const first = firstReady(b);
    setSelected(first?.id ?? null);
    if (first) v.focus(first);
    setActiveItems({});
    setBanner(b.concealed ? "Concealed" : `Turn ${b.turn}`);
    setLog([]);
    stamp.current = { turn: b.turn, side: b.side };
    // After this commit's other effects have put the units in.
    let live = true;
    let hush = () => {};
    const t = setTimeout(
      () =>
        void v.whenDrawn().then(() => {
          if (!live) return;
          loaded();
          // Dropped by helicopter: it's heard flying off as the battle begins (not once anyone has acted).
          const untouched = agents(b).every((u) => u.tu === u.maxTu);
          if (b.airlift && b.turn === 1 && untouched) hush = sfx.play("helicopter");
        }),
    );
    return () => {
      live = false;
      hush();
      clearTimeout(t);
    };
  }, [map, b]);

  useEffect(() => view.current?.setDaylight(b.night, b.moon), [b]);

  // Combat music from the moment any enemy is alerted (the team spotted, or a
  // pod woken by noise), the boss track once an elder is; either for the rest
  // of the battle. Every render: it's cheap.
  useEffect(() => {
    const alerted = b.units.filter((u) => u.side === "enemy" && u.alerted);
    if (alerted.some((u) => u.elder)) music.setBattleMood("boss");
    else music.setBattleMood(alerted.length ? "combat" : "stealth");
  });
  useEffect(() => () => music.setBattleMood("stealth"), []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(t);
  }, [banner]);

  // Units, fire, what lies about and the level follow the state (not during
  // playback, and not on every hover).
  useEffect(() => {
    const v = view.current;
    if (!v || busy) return;
    v.setLevel(level);
    v.setUnits(specs());
    v.setFire(Object.keys(b.fire).map((i) => fromIdx(map, +i)));
    v.setUv(Object.keys(b.uv ?? {}).map((i) => fromIdx(map, +i)));
    v.setLoot(b.loot.filter((l) => !l.by));
    v.setFloor(
      b.floor.map((f) => ({
        x: f.x,
        y: f.y,
        z: f.z,
        model: ITEMS[f.item].model ?? f.item,
        weapon: ITEMS[f.item].slot === "weapon",
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, map, busy, level, rev, me, myTurn]);

  // Where the agent can go; with a grenade in hand, the blast where the cursor is.
  const aimed = throwing ? hover : null;
  useEffect(() => {
    const v = view.current;
    if (!v || busy) return;
    if (throwing && me && aimed && !throwBlocker(b, me, aimed, activeItem as Throwable)) {
      // What it reaches: a UV flare's or a flashbang's ring, an incendiary's fire, a strobe's sight.
      const area =
        activeItem === "uv-flare"
          ? flareTiles(b, aimed)
          : activeItem === "flashbang"
            ? flareTiles(b, aimed, FLASHBANG.radius)
            : activeItem === "strobe"
              ? flareTiles(b, aimed, STROBE.range)
              : blastTiles(b, aimed);
      const colour =
        activeItem === "uv-flare" ? 0x8a4dff : activeItem === "incendiary" ? 0xff6a30 : 0xf4f0d8;
      v.setMoveRange(
        area.map((p) => ({ ...p, dash: false })),
        colour,
      );
    } else if (r && me) {
      // Yellow: everywhere the TU reach. Blue: where there's still time for an attack.
      const keep = me.tu - attackCost(me);
      const tiles = [...r.cost].map(([i, c]) => ({ ...fromIdx(map, i), dash: c > keep + 1e-6 }));
      v.setMoveRange(tiles);
    } else v.setMoveRange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, map, busy, level, rev, me, r, throwing, aimed]);

  // The path preview, and the cover at its end.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const clear = () => {
      v.setPath(null);
      v.setAimLines(null);
    };
    if (!hover || !r || !me || busy || force || unitAt(b, hover)) return clear();
    const cost = r.cost.get(idx(map, hover.x, hover.y, hover.z));
    if (cost === undefined) return clear();
    const dashing = cost > me.tu - attackCost(me) + 1e-6;
    v.setPath(
      [{ x: me.x, y: me.y, z: me.z }, ...(pathTo(b, r, hover) ?? [])],
      dashing,
      coverAround(map, hover),
    );
    // Aim lines: every enemy the team sees that could be attacked from there,
    // leaning out of full cover round its end where only that sees it.
    const targets = visibleFoes(b, me, hover)
      .filter((f) => f.side === "enemy" && seenByAgents(b, f, f) && inReach(b, me, f, hover))
      .map((f) => ({ at: { x: f.x, y: f.y, z: f.z }, lean: leanFor(b, me, f, hover) }));
    v.setAimLines(hover, targets);
  }, [hover, r, me, busy, b, map, force]);

  // The CEP: round an enemy hovered (where a click shoots), or, holding Ctrl,
  // round the spot a forced shot would aim at.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (!hover || !me || !hasGun || busy || !myTurn) return void v.setCep(null);
    const there = unitAt(b, hover);
    const foe = there && foes.includes(there) ? there : undefined;
    if (!force && !foe) return void v.setCep(null);
    const from = aimFrom(b, me, hover);
    const at = there && active(there) ? aimPoint(map, there, there.kind, from) : pointAim(hover);
    const cep = cepAt(b, me, at, from, me.mode);
    v.setCep({ at, radius: cep.radius, from: cep.from, force });
  });

  // ----- Choosing who acts -----

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

  const select = useCallback(
    (u: Unit | undefined, look = true) => {
      if (!u) return;
      setSelected(u.id);
      setStripOpen(false);
      if (look) lookAt(u);
    },
    [lookAt],
  );

  /** A number key or a card: the first press selects; pressed again, the camera goes to them. */
  const pick = useCallback(
    (u: Unit | undefined) => {
      if (!u || !myTurn || !canCommand(u)) return;
      if (me?.id === u.id) lookAt(u);
      else select(u, false);
    },
    [myTurn, me, lookAt, select],
  );

  const nextAgent = useCallback(
    (after?: string) => {
      const able = agents(b).filter(ready);
      if (!able.length) return null;
      const i = able.findIndex((a) => a.id === after);
      return able[(i + 1) % able.length]!;
    },
    [b],
  );

  // ----- Playing events back -----

  /** On the enemy's turn the camera and the level shown go to each enemy the
   *  team sees as it starts to act (a change of actor), not between its actions. */
  const followEnemy = (e: BattleEvent, actor: string | null): string | null => {
    if (stamp.current.side !== "enemy") return actor;
    const seenActing = ((e.kind === "move" || e.kind === "shot") && e.seen) || e.kind === "throw";
    if (!seenActing || e.unit === actor) return actor;
    const at = view.current!.unitShownAt(e.unit);
    if (!at || (e.kind === "throw" && !at.seen)) return actor;
    const z = e.kind === "move" ? Math.max(at.z, e.path.at(-1)!.z) : at.z;
    view.current!.focus(at);
    view.current!.setLevel(z);
    setLevel(z);
    return e.unit;
  };

  /** Plays events back in the view, one by one; true if the battle ended. */
  const run = useCallback(
    async (events: BattleEvent[]) => {
      // The rules are already final when a command returns: save now, so closing
      // the tab mid-playback keeps what was done.
      campaign?.onSave();
      const v = view.current!;
      setBusy(true);
      v.setMoveRange([]);
      v.setPath(null);
      let ended = false;
      const due: Record<string, number> = {};
      for (const e of events) for (const h of harmOf(e)) due[h.id] = (due[h.id] ?? 0) + h.n;
      setOwed({ ...due });
      let actor: string | null = null;
      for (const e of events) {
        actor = followEnemy(e, actor);
        if (e.kind === "turn") {
          stamp.current = { turn: e.turn, side: e.side };
          setBanner(e.side === "enemy" ? "Enemy activity" : `Turn ${e.turn}`);
          if (e.side === "agent") v.setUnits(specs());
        }
        if (e.kind === "status" && e.text === "Spotted!") setBanner("Spotted!");
        if (e.kind === "end") ended = true;
        const line = logLine(b, e);
        if (line) setLog((l) => [...l, { ...stamp.current, ...line }]);
        // A failed animation is skipped: the rules are already past it, and the units are put right at the end.
        try {
          await v.play([e]);
        } catch (err) {
          console.error("playback", e.kind, err);
        }
        const hits = harmOf(e);
        if (hits.length) {
          for (const h of hits) due[h.id] = (due[h.id] ?? 0) - h.n;
          setOwed({ ...due });
        }
      }
      setOwed({});
      setBusy(false);
      bump();
      return ended;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [specs, b, campaign],
  );

  /** Plays a command's events, then moves on: the same agent while they can still
   *  do something useful, else the next with actions left, else the enemy's turn. */
  const act = useCallback(
    async (res: BattleEvent[] | string) => {
      if (typeof res === "string") return useStore.getState().notify(res, "bad");
      setStripOpen(false);
      const ended = await run(res);
      if (ended || b.result) return;
      const keepGoing = me && ready(me) && me.tu >= TU_PER_TILE;
      const cur = keepGoing ? me : nextAgent(me?.id);
      // The same agent again: the camera and the level stay where they are.
      if (cur) return select(cur, cur.id !== me?.id);
      await run(endTurn(b));
      if (!b.result) select(firstReady(b));
    },
    [b, me, nextAgent, run, select],
  );

  const doEndTurn = useCallback(async () => {
    if (!myTurn) return;
    await run(endTurn(b));
    if (!b.result) select(firstReady(b));
  }, [b, myTurn, run, select]);

  // ----- Input -----

  // Clicks on the map (Wasteland 3 style). Left: an agent selects; a seen enemy
  // is shot; a body, a prisoner or a bleeding agent next to us is seen to. With
  // an item active: a grenade is thrown where clicked; a trauma kit patches the
  // agent clicked. Right: walk there (with an item active: back to the weapon).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.onPick = (p) => {
      if (!myTurn) return;
      if (force && me && hasGun) return void act(commandShootAt(b, me, p, me.mode));
      if (throwing && me) return void act(commandThrow(b, me, p, activeItem as Throwable));
      const who = unitAt(b, p);
      if (!who) return;
      if (healing && me && patchable(b, me).includes(who))
        return void act(commandHeal(b, me, who, activeItem));
      if (canCommand(who)) return select(who);
      if (!me) return;
      if (who === prisoner) return void act(commandFree(b, me, who));
      if (who === bleeder) return void act(commandStabilize(b, me, who));
      if (bodies.includes(who)) return void act(commandFinish(b, me, who));
      if (foes.includes(who)) return void act(commandShoot(b, me, who, me.mode));
    };
    v.onCommand = (p) => {
      if (!myTurn) return;
      if (activeItem) return setActive(undefined);
      if (me && !unitAt(b, p)) void act(commandMove(b, me, p));
    };
  });

  const usable = me ? usableKinds(me) : [];
  const ctx: CommandContext | null = me
    ? {
        b,
        me,
        activeItem,
        usableCount: usable.reduce((t, x) => t + x.n, 0),
        stripOpen,
        act: (res) => void act(res),
        bump,
        toggleStrip: () => setStripOpen((x) => !x),
        openInventory: () => setInvOpen(true),
      }
    : null;
  const weaponCmds = ctx ? weaponCommands(ctx) : [];
  const agentCmds = ctx ? agentCommands(ctx) : [];
  const evacuate = ctx ? evacuateCommand(ctx) : null;
  const commands = [...weaponCmds, ...agentCmds, ...(evacuate ? [evacuate] : [])];

  /** Esc closes what's open, innermost first; with nothing open, it opens the menu. */
  const escape = () => {
    if (menuOpen) setMenuOpen(false);
    else if (stripOpen) setStripOpen(false);
    else if (activeItem) setActive(undefined);
    else setMenuOpen(true);
  };

  /** The enemy in sight with the best chance to hit. */
  const bestTarget = (me: Unit) =>
    [...foes].sort((x, y) => oddsAgainst(b, me, y).chance - oddsAgainst(b, me, x).chance)[0];

  // Keys (ui/keys.ts, rebound in the main menu): number keys pick agents; the rest are actions and levels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (invOpen && me && myTurn) return; // the inventory window has the keyboard (Esc closes it)
      if (e.key === "Escape") return escape();
      if (menuOpen) return;
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
      if (!me) return;
      if (id === "shoot" && foes.length)
        return void act(commandShoot(b, me, bestTarget(me)!, me.mode));
      if (id === "incendiary") {
        const off = activeItem === "incendiary" || !countOf(me.gear, "incendiary");
        return setActive(off ? undefined : "incendiary");
      }
      if (id === "fireMode" && !activeItem) {
        const modes = modesOf(me);
        setMode(me, modes[(modes.indexOf(me.mode) + 1) % modes.length]!);
        return bump();
      }
      const c = commands.find((x) => x.key === id && id !== "fireMode");
      if (c && !c.blocker) c.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A handle for browser tests.
  if (HANDLES)
    (window as unknown as { __skirmish?: unknown }).__skirmish = {
      b,
      bump,
      select,
      throwAt: (p: Pt3) => me && act(commandIncendiary(b, me, p)),
      setActive,
    };

  // ----- The bars over heads -----

  const hovered = hover ? unitAt(b, hover) : undefined;
  const hoverSeen = hovered && (hovered.side === "agent" || seenByAgents(b, hovered, hovered));
  const hoverUnit = hoverSeen ? hovered : undefined;
  // While events play back, the bars keep what they showed before (the battle
  // has already moved on): health drops when the view gets there.
  const headsLive = useRef<HeadInfo[]>([]);
  /** Health as the screen should show it: the unit's own, plus any damage still to play. */
  const shownHp = (id: string, frozen: number) => {
    const u = unitById(b, id);
    return u ? Math.min(u.maxHp, u.hp + (owed[id] ?? 0)) : frozen;
  };
  if (!busy) headsLive.current = headInfos(b, myTurn ? me : undefined, foes);
  const openHead = !busy && hoverUnit?.side === "enemy" ? hoverUnit.id : null;
  const line = bloodlineById(b.bloodline)!;

  return (
    <div className="screen skirmish">
      <div className="battle-layer" ref={ref} />
      <div className="battle-heads" ref={headsRef}>
        {headsLive.current.map((h) => (
          <HeadBar
            key={h.id}
            h={busy ? { ...h, hp: shownHp(h.id, h.hp) } : h}
            open={h.id === openHead}
          />
        ))}
      </div>
      <div className="battle-squad">
        {squad.map((u, i) => (
          <SquadCard
            key={u.id}
            u={u}
            hp={shownHp(u.id, u.hp)}
            on={u.id === me?.id}
            num={i < AGENT_KEYS.length ? keyOf(AGENT_KEYS[i]!) : ""}
            onClick={() => pick(u)}
          />
        ))}
      </div>

      <Objectives b={b} title={campaign?.title ?? "Skirmish"} lineName={line.name} />

      <div className="battle-corner">
        <button
          className="mini"
          onClick={() => setMenuOpen(true)}
          data-tip={`${campaign ? "Save, load" : "Load"}, sound, quit to the main menu (Esc)`}
        >
          ☰ Menu
        </button>
      </div>

      <LevelPicker
        map={map}
        level={level}
        setLevel={setLevel}
        upKey={keyOf("levelUp")}
        downKey={keyOf("levelDown")}
      />

      <footer className="battle-bottom">
        <div className="battle-column">
          <FloatingLog
            lines={log.map((l) => ({
              head: `Turn ${l.turn} · ${l.side === "agent" ? "our move" : "enemy activity"}`,
              text: l.text,
              tone: l.tone,
            }))}
          />
          {me && myTurn && (
            <div className="battle-actions">
              <ActionHints b={b} me={me} hover={hover} activeItem={activeItem} force={force} />
              <TargetChips
                b={b}
                me={me}
                activeItem={activeItem}
                foes={foes}
                bodies={bodies}
                bleeder={bleeder}
                prisoner={prisoner}
                doors={doors}
                act={(res) => void act(res)}
                focus={(u) => view.current?.focus(u)}
              />
            </div>
          )}
        </div>
      </footer>

      {me && myTurn && (
        <ActionPanel
          me={me}
          activeItem={activeItem}
          usable={usable}
          stripOpen={stripOpen}
          agentCmds={agentCmds}
          weaponCmds={weaponCmds}
          keyOf={keyOf}
          choose={(item) => {
            setActive(item);
            setStripOpen(false);
          }}
        />
      )}
      {myTurn && (
        <div className="battle-end-turn panel">
          {evacuate && (
            <ActionButton
              tile
              icon={evacuate.icon}
              label={evacuate.label}
              hotkey={keyOf("evacuate")}
              tip={evacuate.tip}
              blocker={evacuate.blocker}
              onClick={evacuate.run}
            />
          )}
          <ActionButton
            tile
            primary
            icon="end-turn"
            label="End turn"
            hotkey={keyOf("endTurn")}
            tip={[
              "The enemy moves.",
              "Operatives with remaining TU and ammo will react to enemy movement.",
            ]}
            onClick={() => void doEndTurn()}
          />
        </div>
      )}

      {invOpen && me && myTurn && (
        <BattleInventory
          b={b}
          me={me}
          squad={squad.filter(canCommand)}
          onSelect={(u) => select(u)}
          onChange={bump}
          onClose={() => setInvOpen(false)}
        />
      )}
      {banner && <div className="battle-banner">{banner}</div>}
      {b.result && !busy && (
        <ResultCard
          b={b}
          doneLabel={campaign ? "Debrief" : "To the menu"}
          onDone={campaign ? campaign.onDone : quit}
        />
      )}
      {menuOpen && (
        <PauseMenu
          title="Menu"
          saving={!!campaign}
          wait={!!campaign && busy}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
