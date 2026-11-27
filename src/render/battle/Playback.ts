// Playing battle events back: walking, shooting (tracers, muzzle flash, sound), blows, deaths, throws, shattering glass, the numbers that pop up.
import * as THREE from "three";
import { sfx, type SoundId } from "../../audio/sfx";
import { E, type Pt3 } from "../../tactical/map/map";
import { chaikin, type V3 } from "../../tactical/map/path";
import { WEAPONS } from "../../tactical/rules";
import { LEVEL_H, SILL, SLAB, TILE, wc, WINDOW_LINTEL } from "./scale";
import { UNSEEN_GAIN, GUN_SOUND, BLOW_SOUND } from "./sounds";
import { BattleView, type BattleEventLike, type Edge, type UnitView, LYING_Y } from "./BattleView";

/** Playing battle events back: walking, shooting (tracers, muzzle flash, sound), blows, deaths, throws, shattering glass, the numbers that pop up. */
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
        // A burst's rounds come one after another, with what each did between them: fire them all, then play that.
        const rounds = [e];
        const between: BattleEventLike[] = [];
        if (e.burst)
          for (let j = i + 1; j < events.length; j++) {
            const n = events[j]!;
            if (
              n.kind === "shot"
                ? !(n.burst && n.unit === e.unit)
                : n.kind === "move" || n.kind === "throw" || n.kind === "turn" || n.kind === "end"
            )
              break;
            if (n.kind === "shot") rounds.push(n);
            else between.push(n);
            i = j;
          }
        if (e.seen) await this.animateShots(rounds);
        else await this.hearShots(rounds);
        await this.play(between);
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
            `${e.why === "sun" ? "Sun" : "Fire"} −${e.damage}`,
            "#ffa040",
          );
        await this.wait(450);
      } else if (e.kind === "throw")
        await this.animateThrow(e.unit, e.at, e.tiles, e.lean, e.item === "uv-flare");
      else if (e.kind === "door") {
        this.view.geometry.showEdges([e.at], E.DOOR);
        if (e.seen) await this.wait(250);
      } else if (e.kind === "blast") {
        // The rocket goes off: the bang, and the ground round it alight.
        const at = new THREE.Vector3(wc(e.at.x), e.at.z * LEVEL_H + SLAB + 0.5, wc(e.at.y));
        this.soundAt("explosion-rocket", at, {
          gain: e.seen ? 1.4 : 1.4 * UNSEEN_GAIN,
          rate: 1 + (Math.random() - 0.5) * 0.06,
        });
        this.view.figures.setFire([...this.view.figures.fireTiles(), ...e.tiles]);
        this.view.figures.redrawWrecks(e.tiles);
        for (const h of this.blastHits) {
          const v = this.view.units.get(h.unit);
          if (v) this.popup(v.group.position, `−${h.damage}`, "#ff6a5a");
        }
        this.blastHits = [];
        if (e.seen) await this.wait(450);
      } else if (e.kind === "glass") {
        const windows = e.panes.map((c) => this.view.geometry.shownEdge(c) === E.WINDOW);
        e.panes.forEach((c, i) => this.shards(c, e.from, windows[i]!));
        this.view.geometry.showEdges(
          e.panes.filter((_, i) => windows[i]),
          E.SILL,
        );
        this.view.geometry.showEdges(
          e.panes.filter((_, i) => !windows[i]),
          E.NONE,
        );
      } else if (e.kind === "status" && e.seen) {
        if (e.cue === "reload") this.soundAt("reload", this.view.units.get(e.unit)?.group.position);
        const v = this.view.units.get(e.unit);
        if (v && v.group.visible) this.popup(v.group.position, e.text, "#e8c987");
        await this.wait(350);
      }
    }
  }

  /**
   * Glass bursting out of a shattered pane, struck from `from` (tiles; a
   * shooter's tile, a fire's centre): the bits fly on the way the blow went,
   * through and out the far side, fanning a little, and fall, skitter along
   * the floor and fade. A window's glass only fills the frame above its sill.
   */
  shards(c: Edge, from: Pt3, window: boolean) {
    const at = new THREE.Vector3(
      (c.x + 0.5 + c.dx / 2) * TILE,
      c.z * LEVEL_H + SLAB,
      (c.y + 0.5 + c.dy / 2) * TILE,
    );
    // The way the blow went: from the source to the pane, flattened; straight through if they're level with it.
    const src = new THREE.Vector3(wc(from.x), 0, wc(from.y));
    const dir = new THREE.Vector3(at.x - src.x, 0, at.z - src.z);
    const normal = new THREE.Vector3(c.dx, 0, c.dy);
    if (dir.dot(normal) < 0) normal.negate();
    dir.lengthSq() < 0.01 ? dir.copy(normal) : dir.normalize();
    // Never along the pane: lean it out through the far side.
    dir.addScaledVector(normal, 0.6).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const lo = window ? SILL : 0.1,
      hi = LEVEL_H - SLAB - (window ? WINDOW_LINTEL : 0.1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8ecff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const n = window ? 16 : 22;
    const bits = Array.from({ length: n }, () => {
      const b = new THREE.Mesh(this.view.boxGeo, mat);
      const big = 0.05 + Math.random() * 0.12;
      b.scale.set(big, 0.015, big * (0.5 + Math.random()));
      const along = (Math.random() - 0.5) * (TILE - 0.2);
      b.position.set(
        at.x + (c.dy ? along : 0),
        at.y + lo + Math.random() * (hi - lo),
        at.z + (c.dx ? along : 0),
      );
      const speed = 2.2 + Math.random() * 3.2;
      b.userData.v = dir
        .clone()
        .multiplyScalar(speed)
        .addScaledVector(side, (Math.random() - 0.5) * 2.2)
        .setY(0.3 + Math.random() * 1.6);
      b.userData.spin = new THREE.Vector3(
        Math.random() * 14 - 7,
        Math.random() * 14 - 7,
        Math.random() * 14 - 7,
      );
      b.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.view.scene.add(b);
      return b;
    });
    let life = 1.3;
    void this.animate((dt) => {
      life -= dt;
      for (const b of bits) {
        const v = b.userData.v as THREE.Vector3;
        v.y -= 9.8 * dt;
        b.position.addScaledVector(v, dt);
        // On the floor: a skid that dies away, lying flat.
        if (b.position.y < at.y + 0.01) {
          b.position.y = at.y + 0.01;
          v.set(v.x * 0.82, 0, v.z * 0.82);
          b.userData.spin.multiplyScalar(0.5);
          b.rotation.x *= 0.8;
          b.rotation.z *= 0.8;
        }
        const w = b.userData.spin as THREE.Vector3;
        b.rotation.x += w.x * dt;
        b.rotation.y += w.y * dt;
        b.rotation.z += w.z * dt;
      }
      mat.opacity = Math.max(0, Math.min(0.85, life * 1.2));
      if (life > 0) return false;
      for (const b of bits) this.view.scene.remove(b);
      mat.dispose();
      return true;
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
  async hearShots(rounds: Extract<BattleEventLike, { kind: "shot" }>[]) {
    const s = this.view.units.get(rounds[0]!.unit);
    const at = s ? s.group.position.clone() : undefined;
    const took = this.gunfire(rounds, at, UNSEEN_GAIN);
    if (took) await this.wait(Math.min(900, took * 1000 + 250));
  }

  /** One shot, or a burst's rounds: lean out once, the tracers at the gun's rate of fire, then what each did. */
  async animateShots(rounds: Extract<BattleEventLike, { kind: "shot" }>[]) {
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
      let flown = 0;
      await this.animate((dt) => {
        flown = Math.min(len, flown + dt * 45);
        const at = a.clone().lerp(end, len ? flown / len : 1);
        rocket.position.copy(at);
        trail.geometry.setFromPoints([
          a.clone().lerp(end, Math.max(0, flown - 3) / (len || 1)),
          at,
        ]);
        return flown >= len;
      });
      this.view.scene.remove(rocket, trail);
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
      // What it did shows when it goes off (the blast event next).
      this.blastHits = e.hits;
      await back();
      return;
    }
    const FADE = 0.35;
    const live: { lines: THREE.Line[]; life: number }[] = [];
    let t = 0,
      next = 0;
    const shown = new Set<number>();
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
      for (const [k, g] of live.entries()) {
        g.life -= dt;
        for (const l of g.lines)
          (l.material as THREE.LineBasicMaterial).opacity = Math.max(0, g.life / FADE);
        // A single shot's hits show once its tracer has faded (as before); a burst's as each round lands.
        if (!shown.has(k) && (rounds.length > 1 ? g.life < FADE - 0.05 : g.life <= 0))
          (shown.add(k), popups(rounds[k]!));
      }
      return next >= rounds.length && live.every((g) => g.life <= 0);
    });
    for (const g of live)
      for (const l of g.lines) {
        this.view.scene.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    await Promise.all([this.wait(450), back()]);
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
    // The body hits the ground (heard further off when out of sight).
    this.soundAt("thud", v.group.position, {
      gain: v.group.visible ? 1 : UNSEEN_GAIN,
      rate: 1 + (Math.random() - 0.5) * 0.1,
    });
    await this.wait(200);
  }

  /** An incendiary: an arc from the thrower, then the ground goes up. */
  async animateThrow(id: string, at: Pt3, tiles: Pt3[], lean?: Pt3, flare = false) {
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
    if (flare) {
      // A UV flare: no bang, a violet glow where it lands.
      this.view.figures.setUv([...this.view.figures.uvLit(), ...tiles]);
      await Promise.all([this.wait(300), back()]);
      return;
    }
    // It goes off: the bang heard wherever the camera is, a little further than gunfire carries.
    this.soundAt("explosion-grenade", to, { gain: 1.3, rate: 1 + (Math.random() - 0.5) * 0.06 });
    this.view.figures.setFire([...this.view.figures.fireTiles(), ...tiles]);
    this.view.figures.redrawWrecks(tiles);
    await Promise.all([this.wait(400), back()]);
  }

  /** Floating words over a unit: rise, then fade. */
  popup(at: THREE.Vector3, text: string, colour: string) {
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
