// Playing battle events back: walking, shooting (tracers, muzzle flash, what each round struck, sound), blows, deaths, throws, blasts, glass and doors breaking, the numbers that pop up. The sparks, blood and smoke are the effects layer's (effects.ts).
import * as THREE from "three";
import { sfx, type SoundId } from "../../audio/sfx";
import { doorStyleAt, E, type Pt3 } from "../../tactical/map/map";
import { chaikin, type V3 } from "../../tactical/map/path";
import { WEAPONS } from "../../tactical/rules";
import { DOOR_LINTEL, LEVEL_H, SILL, SLAB, TILE, wc, WINDOW_LINTEL } from "./scale";
import { UNSEEN_GAIN, GUN_SOUND, BLOW_SOUND } from "./sounds";
import { BattleView, type BattleEventLike, type Edge, type UnitView, LYING_Y } from "./BattleView";

/** Playing battle events back: walking, shooting (tracers, muzzle flash, what each round struck, sound), blows, deaths, throws, blasts, glass and doors breaking, the numbers that pop up. */
export class Playback {
  constructor(readonly view: BattleView) {}

  readonly anims: ((dt: number) => boolean)[] = [];

  readonly tmpV = new THREE.Vector3();

  /** A rocket's hits, shown when its blast plays. */
  blastHits: { unit: string; damage: number }[] = [];

  /** Plays a list of battle events in order; resolves when done. Unseen ones are skipped. */
  async play(events: BattleEventLike[]) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (e.kind === "shot") {
        // Each round with what it did (panes and doors broken, a blast, hurt, deaths: the events
        // after it, up to the next round of a burst or the next thing done), played as it lands.
        const rounds = [e];
        const did: BattleEventLike[][] = [[]];
        for (let j = i + 1; j < events.length; j++) {
          const n = events[j]!;
          if (n.kind === "shot") {
            if (!(e.burst && n.burst && n.unit === e.unit)) break;
            rounds.push(n);
            did.push([]);
          } else if (
            n.kind === "move" ||
            n.kind === "throw" ||
            n.kind === "door" ||
            n.kind === "turn" ||
            n.kind === "end"
          )
            break;
          else did.at(-1)!.push(n);
          i = j;
        }
        if (e.seen) await this.animateShots(rounds, did);
        else await this.hearShots(rounds, did);
        continue;
      }
      if (e.kind === "move" && e.seen) await this.animateMove(e.unit, e.path);
      else if (e.kind === "death") await this.animateDeath(e.unit, e.text);
      else if (e.kind === "torpor" && e.seen)
        await this.animateDeath(
          e.unit,
          this.view.units.get(e.unit)?.spec.side === "agent" ? undefined : "Torpor",
        );
      else if (e.kind === "burn" && e.seen) {
        const v = this.view.units.get(e.unit);
        if (v)
          this.popup(
            v.group.position,
            `${e.why === "sun" ? "Sun" : e.why === "uv" ? "UV" : "Fire"} −${e.damage}`,
            "#ffa040",
          );
        await this.wait(450);
      } else if (e.kind === "throw") await this.animateThrow(e.unit, e.at, e.tiles, e.lean, e.item);
      else if (e.kind === "door") {
        this.view.geometry.showEdges([e.at, ...(e.more ?? [])], E.DOOR);
        if (e.seen) await this.wait(250);
      } else if (e.kind === "blast") {
        // The rocket goes off: the bang, and the ground round it alight.
        const at = new THREE.Vector3(wc(e.at.x), e.at.z * LEVEL_H + SLAB + 0.5, wc(e.at.y));
        this.soundAt("explosion-rocket", at, {
          gain: e.seen ? 1.4 : 1.4 * UNSEEN_GAIN,
          rate: 1 + (Math.random() - 0.5) * 0.06,
        });
        this.view.fx.explosion(at, Math.max(1.5, Math.sqrt(e.tiles.length / Math.PI)), true);
        if (!e.seen) this.view.fx.shakeAmp *= 0.4;
        this.view.figures.setFire([...this.view.figures.fireTiles(), ...e.tiles]);
        this.view.figures.redrawWrecks(e.tiles);
        for (const h of this.blastHits) {
          const v = this.view.units.get(h.unit);
          if (v) this.popup(v.group.position, `−${h.damage}`, "#ff6a5a");
        }
        this.blastHits = [];
        if (e.seen) await this.wait(450);
      } else if (e.kind === "glass") {
        // A window leaves its sill, a glass door an empty doorway, a glass wall nothing.
        const was = e.panes.map((c) => this.view.geometry.shownEdge(c));
        e.panes.forEach((c, i) => this.shards(c, e.from, was[i] === E.WINDOW));
        // One crash for them all: a window's small pane, or a big sheet (a glass door, a glass wall).
        const first = e.panes[0];
        if (first)
          this.soundAt(
            was.every((k) => k === E.WINDOW) ? "glass-small" : "glass-large",
            new THREE.Vector3(wc(first.x), first.z * LEVEL_H + SLAB + 1.2, wc(first.y)),
            { rate: 1 + (Math.random() - 0.5) * 0.1 },
          );
        for (const [from, to] of [
          [E.WINDOW, E.SILL],
          [E.SHUT, E.DOOR],
          [E.DOOR, E.DOOR],
          [E.GLASS, E.NONE],
        ] as const)
          this.view.geometry.showEdges(
            e.panes.filter((_, i) => was[i] === from),
            to,
          );
      } else if (e.kind === "smash") {
        for (const c of e.doors) this.splinters(c, e.from);
        // A wooden door splintering; a garage's steel door, a heavy bang.
        const first = e.doors[0];
        const m = this.view.map;
        if (first) {
          const steel =
            !!m && doorStyleAt(m, first.x, first.y, first.z, first.dx, first.dy) === "garage";
          this.soundAt(
            steel ? "thud" : "door-smash",
            new THREE.Vector3(wc(first.x), first.z * LEVEL_H + SLAB + 1, wc(first.y)),
            steel
              ? { gain: 1.3, rate: 0.8 + (Math.random() - 0.5) * 0.1 }
              : { rate: 1 + (Math.random() - 0.5) * 0.1 },
          );
        }
        this.view.geometry.showEdges(e.doors, E.DOOR);
      } else if (e.kind === "status" && e.seen) {
        if (e.cue === "reload") this.soundAt("reload", this.view.units.get(e.unit)?.group.position);
        const v = this.view.units.get(e.unit);
        if (v && v.group.visible) this.popup(v.group.position, e.text, "#e8c987");
        await this.wait(350);
      }
    }
  }

  /** The way a blow went through an edge, from `from` (tiles): flattened, and leaning out through the far side. */
  through(c: Edge, from: Pt3) {
    const at = new THREE.Vector3((c.x + 0.5 + c.dx / 2) * TILE, 0, (c.y + 0.5 + c.dy / 2) * TILE);
    const dir = new THREE.Vector3(at.x - wc(from.x), 0, at.z - wc(from.y));
    const normal = new THREE.Vector3(c.dx, 0, c.dy);
    if (dir.dot(normal) < 0) normal.negate();
    dir.lengthSq() < 0.01 ? dir.copy(normal) : dir.normalize();
    // Never along the pane: lean it out through the far side.
    dir.addScaledVector(normal, 0.6).normalize();
    // Along the edge, its width less the frame.
    const along = new THREE.Vector3(c.dx ? 0 : TILE - 0.2, 0, c.dx ? TILE - 0.2 : 0);
    return { at, dir, along };
  }

  /**
   * Glass bursting out of a shattered pane, struck from `from` (tiles; a
   * shooter's tile, a fire's centre): the effects layer's shatter, over the
   * height the glass filled (a window's only above its sill).
   */
  shards(c: Edge, from: Pt3, window: boolean) {
    const { at, dir, along } = this.through(c, from);
    const floor = c.z * LEVEL_H + SLAB;
    const lo = at.clone().setY(floor + (window ? SILL : 0.1));
    const hi = at.clone().setY(floor + LEVEL_H - SLAB - (window ? WINDOW_LINTEL : 0.1));
    this.view.fx.shatter(lo, hi, along, dir);
  }

  /** A door blown in from `from`: splinters (a garage's steel: sparks and scraps). */
  splinters(c: Edge, from: Pt3) {
    const { at, dir, along } = this.through(c, from);
    const m = this.view.map;
    const steel = !!m && doorStyleAt(m, c.x, c.y, c.z, c.dx, c.dy) === "garage";
    at.y = c.z * LEVEL_H + SLAB;
    this.view.fx.splinter(at, along, dir, LEVEL_H - SLAB - DOOR_LINTEL, steel);
  }

  /**
   * What a round did where it ended: blood from whoever it struck (a blow's
   * from whoever was struck), or the surface's sparks, dust and chips; a gun's
   * flash at the muzzle as it fires.
   */
  strike(r: Extract<BattleEventLike, { kind: "shot" }>, a: THREE.Vector3) {
    const fx = this.view.fx;
    const dirTo = (p: { x: number; y: number; z: number }) =>
      new THREE.Vector3(p.x - a.x, p.y - a.y, p.z - a.z).normalize();
    const bleeder = (id: string) => this.view.units.get(id)?.spec.side === "vampire";
    if (r.melee) {
      const h = r.hits[0],
        v = h && this.view.units.get(h.unit);
      if (!v) return;
      const at = v.group.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      fx.blood(at, dirTo(at), bleeder(h.unit), h.crit);
      return;
    }
    fx.muzzle(a, dirTo(r.aim), !!WEAPONS[r.weapon].suppressed);
    r.rays.forEach((ray, k) => {
      const end = r.ends?.[k];
      if (!end?.struck) return;
      const at = new THREE.Vector3(ray.x, ray.y, ray.z);
      const dir = dirTo(ray);
      if (end.struck !== "unit") {
        fx.impact(at, new THREE.Vector3(end.n.x, end.n.y, end.n.z), dir, end.struck);
        return;
      }
      // Whoever was hit nearest where the round ended.
      let best: { h: (typeof r.hits)[number]; d: number } | null = null;
      for (const h of r.hits) {
        const v = this.view.units.get(h.unit);
        if (!v) continue;
        const p = v.group.position;
        const d = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
        if (!best || d < best.d) best = { h, d };
      }
      if (best) fx.blood(at, dir, bleeder(best.h.unit), best.h.crit);
    });
  }

  wait(ms: number) {
    return new Promise<void>((res) => setTimeout(res, ms));
  }

  animate(step: (dt: number) => boolean) {
    return new Promise<void>((res) =>
      this.anims.push((dt) => {
        const done = step(dt);
        if (done) res();
        return done;
      }),
    );
  }

  /** Walks a unit along its path: the straight legs with their corners rounded (Chaikin), at a steady pace. */
  animateMove(id: string, path: Pt3[]) {
    const v = this.view.units.get(id);
    if (!v || !path.length) return Promise.resolve();
    v.group.visible = true;
    const from = {
      x: v.group.position.x / TILE - 0.5,
      y: v.group.position.z / TILE - 0.5,
      z: Math.round((v.group.position.y - SLAB) / LEVEL_H),
    };
    // In metres, so a stair climb takes its time.
    // A flight (foot to head, 3 or more tiles apart): flat to its bottom step, up it, flat off the top.
    const way: V3[] = [];
    let last: V3 = from;
    for (const p of path) {
      const dx = p.x - last.x,
        dy = p.y - last.y,
        d = Math.max(Math.abs(dx), Math.abs(dy));
      if (p.z !== last.z && d >= 3) {
        const ux = Math.sign(dx),
          uy = Math.sign(dy);
        way.push(
          { x: last.x + ux * 0.5, y: last.y + uy * 0.5, z: last.z },
          { x: p.x - ux * 0.5, y: p.y - uy * 0.5, z: p.z },
        );
      }
      way.push(p);
      last = p;
    }
    const legs: V3[] = [from, ...way].map((p) => ({
      x: p.x * TILE,
      y: p.y * TILE,
      z: p.z * LEVEL_H,
    }));
    const pts = chaikin(legs, 4, 0.45);
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(
        cum[i - 1]! +
          Math.hypot(
            pts[i]!.x - pts[i - 1]!.x,
            pts[i]!.y - pts[i - 1]!.y,
            pts[i]!.z - pts[i - 1]!.z,
          ),
      );
    const total = cum.at(-1)!;
    let d = 0,
      seg = 0;
    const speed = 7 * TILE; // metres a second (7 tiles)
    this.view.input.focus(path.at(-1)!);
    return this.animate((dt) => {
      d = Math.min(total, d + dt * speed);
      while (seg < pts.length - 2 && cum[seg + 1]! < d) seg++;
      const a = pts[seg]!,
        b = pts[seg + 1] ?? a;
      const span = cum[seg + 1]! - cum[seg]! || 1;
      const f = Math.min(1, Math.max(0, (d - cum[seg]!) / span));
      const p = {
        x: (a.x + (b.x - a.x) * f) / TILE,
        y: (a.y + (b.y - a.y) * f) / TILE,
        z: (a.z + (b.z - a.z) * f) / LEVEL_H,
      };
      const facing =
        b.x !== a.x || b.y !== a.y ? Math.atan2(b.y - a.y, b.x - a.x) : -v.group.rotation.y;
      this.view.figures.placeUnit(v.group, p, facing);
      v.group.visible = Math.ceil(p.z - 0.01) <= this.view.level;
      this.view.figures.placeAbove(v, p);
      return d >= total;
    });
  }

  /**
   * A shot: the shooter (leaning out first if it must) turns to the aim, and a
   * tracer streaks from the muzzle to where each round really ended (a
   * shotgun: a spray of them). Who was hit gets the damage over their head;
   * a target nobody hit, "Miss".
   */
  /** Where a sound comes from, as heard from the camera: louder close in (full within 22 m), and left or right. */
  soundAt(
    id: SoundId,
    at: THREE.Vector3 | undefined,
    o: { gain?: number; rate?: number; delay?: number } = {},
  ) {
    if (!at) return;
    const to = this.tmpV.subVectors(at, this.view.camera.position);
    const d = Math.max(1, to.length());
    const right = new THREE.Vector3().setFromMatrixColumn(this.view.camera.matrixWorld, 0);
    sfx.playAt(id, {
      ...o,
      gain: (o.gain ?? 1) * Math.min(1, 22 / d),
      pan: 0.8 * to.normalize().dot(right),
    });
  }

  /** The sound of rounds fired (one, or a burst's), starting `delay` seconds from now. Returns how long they take. */
  gunfire(
    rounds: Extract<BattleEventLike, { kind: "shot" }>[],
    at: THREE.Vector3 | undefined,
    gain = 1,
  ): number {
    const w = rounds[0]!.weapon,
      gun = GUN_SOUND[w];
    if (rounds[0]!.melee) return this.blow(rounds[0]!, at, gain);
    if (!gun) return 0;
    const pitch = () => 1 + (Math.random() - 0.5) * 0.08;
    // A machine gun's full burst is its own recording; a burst cut short, or any other gun, a round at a time.
    if (gun.burst && rounds.length === WEAPONS[w].burst && rounds.length > 1) {
      this.soundAt(gun.burst, at, { gain, rate: pitch() });
      return Math.max(sfx.duration(gun.burst) * 0.5, gun.every * rounds.length);
    }
    rounds.forEach((_, k) =>
      this.soundAt(gun.shot, at, { gain, rate: pitch(), delay: k * gun.every }),
    );
    return gun.every * rounds.length;
  }

  /** A blow's sound: where it lands if it lands, a swish from the striker if not. Returns how long it takes. */
  blow(
    e: Extract<BattleEventLike, { kind: "shot" }>,
    at: THREE.Vector3 | undefined,
    gain: number,
  ): number {
    const sounds = BLOW_SOUND[e.weapon];
    if (!sounds) return 0;
    const pitch = 1 + (Math.random() - 0.5) * 0.1;
    const struck = e.hits.length ? this.view.units.get(e.hits[0]!.unit)?.group.position : undefined;
    if (struck) {
      const id = sounds[Math.floor(Math.random() * sounds.length)]!;
      this.soundAt(id, struck, { gain, rate: pitch });
      return sfx.duration(id);
    }
    this.soundAt("swish", at, { gain, rate: pitch * (e.weapon === "claws" ? 0.8 : 1) });
    return sfx.duration("swish");
  }

  /** Shots fired out of sight: heard, not seen. */
  async hearShots(rounds: Extract<BattleEventLike, { kind: "shot" }>[], did: BattleEventLike[][]) {
    const s = this.view.units.get(rounds[0]!.unit);
    const at = s ? s.group.position.clone() : undefined;
    const took = this.gunfire(rounds, at, UNSEEN_GAIN);
    await Promise.all([
      took ? this.wait(Math.min(900, took * 1000 + 250)) : Promise.resolve(),
      ...did.map((d) => this.landed(d)),
    ]);
  }

  /**
   * What a round did, all at once as it lands: glass bursting, a door blown
   * in, the blast, the damage, a body falling. Resolves when the last is done.
   */
  landed(did: BattleEventLike[]): Promise<void> {
    return Promise.all(did.map((d) => this.play([d]))).then(() => undefined);
  }

  /** One shot, or a burst's rounds: lean out once, the tracers at the gun's rate of fire, then what each did. */
  async animateShots(
    rounds: Extract<BattleEventLike, { kind: "shot" }>[],
    did: BattleEventLike[][],
  ) {
    const e = rounds[0]!;
    const s = this.view.units.get(e.unit);
    if (!s) return;
    s.group.visible = s.group.visible || true;
    const back = await this.leanOut(s, e.lean);
    // The muzzle where the figure now is (leaning or not), at the rules' height.
    const a = new THREE.Vector3(s.group.position.x, e.from.y, s.group.position.z);
    s.group.rotation.y = -Math.atan2(e.aim.z - a.z, e.aim.x - a.x);
    const every = rounds.length > 1 ? (GUN_SOUND[e.weapon]?.every ?? 0.1) : 0;
    this.gunfire(rounds, a);
    if (WEAPONS[e.weapon].blast) {
      // A rocket: a slow round you can watch, trailing a short flame.
      const end = new THREE.Vector3(e.rays[0]!.x, e.rays[0]!.y, e.rays[0]!.z);
      const rocket = new THREE.Mesh(this.view.boxGeo, this.view.lampMat);
      rocket.scale.set(0.12, 0.12, 0.12);
      this.view.scene.add(rocket);
      const trail = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, a]),
        new THREE.LineBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.8 }),
      );
      this.view.scene.add(trail);
      const len = a.distanceTo(end);
      let flown = 0,
        shed = 0;
      this.view.fx.muzzle(a, end.clone().sub(a).normalize(), false);
      await this.animate((dt) => {
        flown = Math.min(len, flown + dt * 45);
        const at = a.clone().lerp(end, len ? flown / len : 1);
        rocket.position.copy(at);
        // Smoke left hanging along its flight, a puff every 0.6 m.
        for (; shed < flown; shed += 0.6)
          this.view.fx.trail(a.clone().lerp(end, shed / (len || 1)));
        trail.geometry.setFromPoints([
          a.clone().lerp(end, Math.max(0, flown - 3) / (len || 1)),
          at,
        ]);
        return flown >= len;
      });
      this.view.scene.remove(rocket, trail);
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
      // What it did shows when it goes off (the blast, first of what it did).
      this.blastHits = e.hits;
      await Promise.all([this.landed(did[0] ?? []), back()]);
      return;
    }
    const FADE = 0.35;
    const live: { lines: THREE.Line[]; life: number }[] = [];
    let t = 0,
      next = 0;
    const landing: Promise<void>[] = [];
    const popups = (r: (typeof rounds)[number]) => {
      for (const h of r.hits) {
        const v = this.view.units.get(h.unit);
        if (v)
          this.popup(
            v.group.position,
            h.crit ? `Critical −${h.damage}` : `−${h.damage}`,
            h.crit ? "#ffd04a" : "#ff6a5a",
          );
      }
      const tg = r.target ? this.view.units.get(r.target) : undefined;
      if (tg && !r.hits.some((h) => h.unit === r.target))
        this.popup(tg.group.position, "Miss", "#c8c0a8");
    };
    await this.animate((dt) => {
      t += dt;
      // Each round's tracers when its time comes.
      while (next < rounds.length && t >= next * every) {
        const r = rounds[next]!;
        // The round is there at once: its hits, and what it broke and did.
        this.strike(r, a);
        popups(r);
        landing.push(this.landed(did[next] ?? []));
        const colour = r.melee ? 0xffffff : r.reaction ? 0xffb050 : 0xfff0c0;
        const lines = r.rays.map((ray) => {
          const l = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([a, new THREE.Vector3(ray.x, ray.y, ray.z)]),
            new THREE.LineBasicMaterial({ color: colour, transparent: true }),
          );
          this.view.scene.add(l);
          return l;
        });
        live.push({ lines, life: FADE });
        next++;
      }
      for (const g of live) {
        g.life -= dt;
        for (const l of g.lines)
          (l.material as THREE.LineBasicMaterial).opacity = Math.max(0, g.life / FADE);
      }
      return next >= rounds.length && live.every((g) => g.life <= 0);
    });
    for (const g of live)
      for (const l of g.lines) {
        this.view.scene.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    await Promise.all([this.wait(450), back(), ...landing]);
  }

  /**
   * Leaning out of cover to shoot or throw: the figure slides most of the way
   * toward the lean tile. Returns the step back in, to await after.
   */
  async leanOut(v: UnitView, lean?: Pt3): Promise<() => Promise<void>> {
    if (!lean) return () => Promise.resolve();
    const home = v.group.position.clone();
    const out = new THREE.Vector3(wc(lean.x), home.y, wc(lean.y)).lerp(home, 0.45);
    const slide = (a: THREE.Vector3, b: THREE.Vector3) => {
      let t = 0;
      return this.animate((dt) => {
        t = Math.min(1, t + dt * 6);
        v.group.position.lerpVectors(a, b, t * t * (3 - 2 * t));
        return t >= 1;
      });
    };
    await slide(home, out);
    return async () => {
      await this.wait(250);
      await slide(out, home);
    };
  }

  async animateDeath(id: string, text?: string) {
    const v = this.view.units.get(id);
    if (!v) return;
    if (text && v.group.visible)
      this.popup(v.group.position, text, text === "Torpor" ? "#ff8a6a" : "#e8c987");
    v.headHidden = true;
    if (v.body.rotation.z > 1) return void (await this.wait(500)); // already lying: finished where it fell
    let t = 0;
    await this.animate((dt) => {
      t = Math.min(1, t + dt * 3);
      v.body.rotation.z = (t * Math.PI) / 2;
      v.body.position.y = t * LYING_Y;
      return t >= 1;
    });
    this.view.figures.bleed(v);
    // The body hits the ground (heard further off when out of sight).
    this.soundAt("thud", v.group.position, {
      gain: v.group.visible ? 1 : UNSEEN_GAIN,
      rate: 1 + (Math.random() - 0.5) * 0.1,
    });
    await this.wait(200);
  }

  /** An incendiary: an arc from the thrower, then the ground goes up. */
  async animateThrow(
    id: string,
    at: Pt3,
    tiles: Pt3[],
    lean?: Pt3,
    item?: "uv-flare" | "flashbang" | "strobe" | "sparkle",
  ) {
    const v = this.view.units.get(id);
    const back = v ? await this.leanOut(v, lean) : () => Promise.resolve();
    const to = new THREE.Vector3(wc(at.x), at.z * LEVEL_H + SLAB + 0.3, wc(at.y));
    const from = v ? v.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : to.clone();
    const ball = new THREE.Mesh(this.view.boxGeo, this.view.lampMat);
    ball.scale.setScalar(0.2);
    this.view.scene.add(ball);
    let t = 0;
    await this.animate((dt) => {
      t = Math.min(1, t + dt * 1.6);
      ball.position.lerpVectors(from, to, t);
      ball.position.y += Math.sin(t * Math.PI) * 3.75;
      return t >= 1;
    });
    this.view.scene.remove(ball);
    if (item === "uv-flare") {
      // A UV flare: no bang, a violet glow where it lands.
      this.view.fx.flash(to, 0x9a5aff, 3);
      this.view.figures.setUv([...this.view.figures.uvLit(), ...tiles]);
      await Promise.all([this.wait(300), back()]);
      return;
    }
    if (item === "flashbang" || item === "strobe" || item === "sparkle") {
      // A flashbang's bang, a strobe's silent flicker: words where it went off, nothing left behind.
      if (item === "flashbang") {
        this.soundAt("explosion-grenade", to, { gain: 1.1, rate: 1.25 });
        this.view.fx.flash(to, 0xffffff, 7);
        this.view.fx.shake(0.15);
      } else if (item === "strobe") this.view.fx.flash(to, 0xf0f4ff, 3.5, 6);
      else this.view.fx.flash(to, 0xb07aff, 2.5, 3);
      this.popup(
        to.clone().add(new THREE.Vector3(0, 1, 0)),
        item === "flashbang" ? "BANG" : item === "sparkle" ? "UV" : "FLASH",
        "#f4f0d8",
      );
      await Promise.all([this.wait(400), back()]);
      return;
    }
    // It goes off: the bang heard wherever the camera is, a little further than gunfire carries.
    this.soundAt("explosion-grenade", to, { gain: 1.3, rate: 1 + (Math.random() - 0.5) * 0.06 });
    this.view.fx.explosion(to, 1.3, false);
    this.view.figures.setFire([...this.view.figures.fireTiles(), ...tiles]);
    this.view.figures.redrawWrecks(tiles);
    await Promise.all([this.wait(400), back()]);
  }

  /** When the last popup over each spot started (ms), so words over one spot follow one another. */
  readonly popped = new Map<string, number>();

  /** Floating words over a unit: rise, then fade. Over a spot that has words starting, a moment after them. */
  popup(at: THREE.Vector3, text: string, colour: string) {
    const key = `${Math.round(at.x)},${Math.round(at.y)},${Math.round(at.z)}`;
    const now = performance.now();
    const start = Math.max(now, (this.popped.get(key) ?? -Infinity) + 380);
    this.popped.set(key, start);
    if (start > now) {
      const where = at.clone();
      void this.wait(start - now).then(() => this.show(where, text, colour));
      return;
    }
    this.show(at, text, colour);
  }

  show(at: THREE.Vector3, text: string, colour: string) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 96;
    const x = c.getContext("2d")!;
    x.font = "bold 54px ui-monospace, Menlo, monospace";
    x.textAlign = "center";
    x.lineWidth = 8;
    x.strokeStyle = "rgba(0,0,0,0.85)";
    x.strokeText(text, 256, 66);
    x.fillStyle = colour;
    x.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
    );
    sprite.scale.set(4.8, 0.9, 1);
    sprite.position.copy(at).add(new THREE.Vector3(0, 2.6, 0));
    sprite.renderOrder = 11;
    this.view.scene.add(sprite);
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      sprite.position.y += dt * 0.75;
      (sprite.material as THREE.SpriteMaterial).opacity = Math.max(
        0,
        1 - Math.max(0, t - 0.8) / 0.6,
      );
      if (t < 1.4) return false;
      this.view.scene.remove(sprite);
      tex.dispose();
      sprite.material.dispose();
      return true;
    });
  }

  /** Each frame: run the animations under way (an animation returns true when it's done). */
  update(dt: number) {
    if (this.anims.length) this.view.atmosphere.shadowsMoved();
    for (let i = this.anims.length - 1; i >= 0; i--)
      if (this.anims[i]!(dt)) this.anims.splice(i, 1);
  }
}
