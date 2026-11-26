// The units and what lies about: figures, the pins and bars over their heads, arrows to enemies off the screen, loot crates, dropped items, fire on the ground.
import * as THREE from "three";
import { type Pt3 } from "../../tactical/map/map";
import { litByLamps } from "../shaders/lamps";
import { makeMaterial, MATERIALS, type MaterialKey } from "../shaders/materials";
import { LEVEL_H, SLAB, TILE, wc } from "./scale";
import { abovePinTexture } from "./overlayShapes";
import { glowing, SIDE_COLOURS } from "./palette";
import { BattleView, type UnitSpec, LYING_Y, type UnitView } from "./BattleView";

// World units are metres (render/battle/scale.ts). Lamps light the map through a
// baked light volume (render/battle/lightVolume.ts): their light is worked out once,
// with shadows, and every surface and unit reads it.
/** Figures: torso height (the head sits on top: 1.78 m for an agent, 1.89 for a vampire). */
const TORSO = { human: 1.51, vampire: 1.62 };

/** The units and what lies about: figures, the pins and bars over their heads, arrows to enemies off the screen, loot crates, dropped items, fire on the ground. */
export class UnitLayer {
  constructor(readonly view: BattleView) {}

  /** Holds the edge arrows, over the canvas. */
  readonly edgeLayer = document.createElement("div");

  /** The UI's bars over units' heads: children with data-unit, placed every frame. */
  headLayer: HTMLElement | null = null;
  readonly unitGroup = new THREE.Group();
  readonly fireGroup = new THREE.Group();
  readonly lootGroup = new THREE.Group();

  /** Items on the ground (placeholder boxes, a few per tile). */
  readonly floorGroup = new THREE.Group();

  readonly itemMats = {
    weapon: glowing(makeMaterial("gunMetal", 0x8a8070), 0x2a2418, 0.5),
    other: glowing(makeMaterial("canvas", 0x6f8a5c), 0x1c2a14, 0.5),
  };

  readonly aboveMat = new THREE.SpriteMaterial({
    map: abovePinTexture(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  readonly crateMat = glowing(makeMaterial("modelWood", 0xc9a040), 0x6a4a10, 0.4);

  /** Bring the units in line with the battle (positions, health, who's seen). Call after any playback. */
  setUnits(units: UnitSpec[]) {
    this.view.atmosphere.shadowsMoved();
    const keep = new Set(units.map((u) => u.id));
    for (const [id, v] of this.view.units)
      if (!keep.has(id)) {
        if (v.above) this.view.aboveGroup.remove(v.above);
        v.edge?.remove();
        this.unitGroup.remove(v.group);
        this.view.disposeTree(v.group);
        this.view.units.delete(id);
      }
    for (const u of units) {
      let v = this.view.units.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.view.units.set(u.id, v);
        this.unitGroup.add(v.group);
      }
      v.spec = u;
      this.placeUnit(v.group, u, u.facing ?? 0);
      v.group.visible = u.visible !== false && u.z <= this.view.level && !u.gone;
      v.ring.visible = !!u.selected;
      v.mark.visible = !!u.targeted;
      const lying = u.dead || (u.torpor ?? 0) > 0 || (u.bleeding ?? 0) > 0 || !!u.stable;
      v.body.rotation.z = lying ? Math.PI / 2 : 0;
      v.body.position.y = lying ? LYING_Y : 0;
      v.body.scale.y = !lying && u.crouched ? 0.66 : 1;
      const crate = v.body.getObjectByName("crate");
      if (crate) crate.visible = !!u.carrying;
      // Lying down (torpor, or one of ours down): the label sits low.
      const lyingDown = (u.torpor ?? 0) > 0 || (u.bleeding ?? 0) > 0 || !!u.stable;
      v.head.position.y = lyingDown
        ? 1.1
        : (u.side === "vampire" ? TORSO.vampire : TORSO.human) * (u.crouched ? 0.66 : 1) + 0.6;
      v.headHidden = !!u.dead;
      this.placeAbove(v, u);
    }
  }

  /**
   * An enemy the team sees on a level cut away: a pin over its spot on the
   * level shown, so it isn't missed. `p` may be mid-move (z fractional).
   */
  placeAbove(v: UnitView, p: { x: number; y: number; z: number }) {
    const u = v.spec;
    const show =
      (u.side === "thrall" || u.side === "vampire") &&
      u.visible !== false &&
      !u.dead &&
      !u.gone &&
      Math.ceil(p.z - 0.01) > this.view.level;
    if (!show) {
      if (v.above) v.above.visible = false;
      return;
    }
    if (!v.above) {
      v.above = new THREE.Sprite(this.aboveMat);
      v.above.scale.set(1.5, 1.5, 1);
      v.above.renderOrder = 11;
      v.above.userData.unit = u.id;
      this.view.aboveGroup.add(v.above);
    }
    v.above.visible = true;
    v.above.position.set(wc(p.x), this.view.level * LEVEL_H + SLAB + 2.2, wc(p.y));
  }

  makeUnit(u: UnitSpec) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const colour = SIDE_COLOURS[u.side];
    const tall = u.side === "vampire" ? TORSO.vampire : TORSO.human;
    // Clothes: canvas kit for agents, velvet for vampires, wool for everyone else; a plain head.
    const cloth: MaterialKey =
      u.side === "agent" ? "canvas" : u.side === "vampire" ? "velvet" : "wool";
    const mat = glowing(makeMaterial(cloth, colour), colour, u.side === "vampire" ? 0.25 : 0.08);
    const headMat = glowing(
      litByLamps(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 })),
      colour,
      u.side === "vampire" ? 0.25 : 0.08,
    );
    const torso = new THREE.Mesh(this.view.boxGeo, mat);
    torso.scale.set(0.55, tall, 0.36);
    torso.position.y = tall / 2;
    const skull = new THREE.Mesh(this.view.boxGeo, headMat);
    skull.scale.set(0.25, 0.25, 0.25);
    skull.position.y = tall + 0.145;
    body.add(torso, skull);
    // A crate on the back, shown when carrying.
    const crate = new THREE.Mesh(this.view.boxGeo, this.crateMat);
    crate.scale.set(0.45, 0.45, 0.45);
    crate.position.set(-0.42, tall * 0.6, 0);
    crate.name = "crate";
    body.add(crate);
    if (u.side !== "civilian" && u.side !== "hostage") {
      // The weapon: a smaller box held out in front (claws for a vampire: two short ones).
      const gun =
        u.side === "vampire"
          ? litByLamps(new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.4 }))
          : makeMaterial("gunMetal", MATERIALS.gunMetal.colour);
      if (u.side === "vampire") {
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(this.view.boxGeo, gun);
          claw.scale.set(0.34, 0.08, 0.08);
          claw.position.set(0.4, tall * 0.55, side * 0.26);
          body.add(claw);
        }
      } else {
        const w = new THREE.Mesh(this.view.boxGeo, gun);
        w.scale.set(u.side === "agent" ? 0.8 : 0.6, 0.1, 0.1);
        w.position.set(0.45, tall * 0.62, 0.26);
        body.add(w);
      }
    }
    body.traverse((o) => (o.castShadow = true));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.63, 0.75, 24),
      new THREE.MeshBasicMaterial({ color: 0xe8c987, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.78, 4),
      new THREE.MeshBasicMaterial({ color: 0xff4a4a, side: THREE.DoubleSide }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.03;
    const head = new THREE.Object3D();
    head.position.y = tall + 0.6;
    group.add(body, ring, mark, head);
    return { group, body, ring, mark, head, headHidden: false, spec: u };
  }

  /** Loot crates lying on the map. */
  setLoot(items: Pt3[]) {
    this.view.atmosphere.shadowsMoved();
    for (const c of [...this.lootGroup.children]) this.lootGroup.remove(c);
    for (const p of items) {
      if (p.z > this.view.level) continue;
      const c = new THREE.Mesh(this.view.boxGeo, this.crateMat);
      c.scale.set(0.6, 0.48, 0.6);
      c.position.set(wc(p.x), p.z * LEVEL_H + SLAB + 0.24, wc(p.y));
      c.castShadow = true;
      this.lootGroup.add(c);
    }
  }

  /** Items lying on the ground: a small box each, long ones for weapons, a little stack where several lie. */
  setFloor(items: (Pt3 & { weapon: boolean })[]) {
    this.view.atmosphere.shadowsMoved();
    for (const c of [...this.floorGroup.children]) this.floorGroup.remove(c);
    const per = new Map<string, number>();
    for (const p of items) {
      if (p.z > this.view.level) continue;
      const k = `${p.x},${p.y},${p.z}`;
      const n = per.get(k) ?? 0;
      per.set(k, n + 1);
      if (n >= 4) continue;
      const c = new THREE.Mesh(
        this.view.boxGeo,
        p.weapon ? this.itemMats.weapon : this.itemMats.other,
      );
      if (p.weapon) c.scale.set(0.8, 0.1, 0.2);
      else c.scale.set(0.27, 0.15, 0.27);
      c.position.set(
        (p.x + 0.3 + (n % 2) * 0.4) * TILE,
        p.z * LEVEL_H + SLAB + 0.075 + Math.floor(n / 2) * 0.15,
        (p.y + 0.3 + (n % 2) * 0.4) * TILE,
      );
      c.rotation.y = n * 0.9;
      c.castShadow = true;
      this.floorGroup.add(c);
    }
  }

  placeUnit(g: THREE.Object3D, p: { x: number; y: number; z: number }, facing: number) {
    g.position.set(wc(p.x), p.z * LEVEL_H + SLAB - this.view.drop(p), wc(p.y));
    g.rotation.y = -facing;
  }

  /** Burning tiles (index → turns left). */
  setFire(tiles: Pt3[]) {
    const key = (ts: Pt3[]) =>
      ts
        .map((p) => `${p.x},${p.y},${p.z}`)
        .sort()
        .join(";");
    if (key(tiles) !== key(this.view.fires)) this.view.lightDirty = true;
    this.view.fires = tiles.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    for (const c of [...this.fireGroup.children]) this.fireGroup.remove(c);
    for (const p of tiles) {
      if (p.z > this.view.level) continue;
      const f = new THREE.Mesh(this.view.boxGeo, this.view.fireMat);
      f.scale.set(0.9 * TILE, 0.75, 0.9 * TILE);
      f.position.set(wc(p.x), p.z * LEVEL_H + SLAB + 0.4, wc(p.y));
      f.userData.phase = Math.random() * 6;
      this.fireGroup.add(f);
    }
  }

  /** Redraws the level if fire on these tiles has burnt out a vehicle (the rules mark it wrecked). */
  redrawWrecks(tiles: readonly Pt3[]) {
    const hit = (this.view.map?.vehicles ?? []).some(
      (v) =>
        v.wrecked &&
        tiles.some(
          (q) => q.z === v.z && q.x >= v.x && q.y >= v.y && q.x < v.x + v.w && q.y < v.y + v.h,
        ),
    );
    if (hit) this.view.geometry.rebuild();
  }

  /** The tiles burning now (as setFire was last given them). */
  fireTiles(): Pt3[] {
    return this.view.fires;
  }

  /** Where a unit is drawn now (tiles; mid-move, rounded) and whether the team sees it, or null. */
  unitShownAt(id: string): (Pt3 & { seen: boolean }) | null {
    const v = this.view.units.get(id);
    if (!v || v.spec.gone) return null;
    const p = v.group.position;
    return {
      x: Math.round(p.x / TILE - 0.5),
      y: Math.round(p.z / TILE - 0.5),
      z: Math.max(0, Math.round((p.y - SLAB) / LEVEL_H)),
      seen: v.spec.visible !== false,
    };
  }

  /**
   * Seen enemies off the screen: an arrow on the edge (inset a little), on the
   * line from the screen's centre towards the enemy, pointing at it.
   */
  placeEdges() {
    const w = this.view.container.clientWidth,
      h = this.view.container.clientHeight;
    if (!w || !h) return;
    const inset = 30;
    const p = new THREE.Vector3();
    for (const v of this.view.units.values()) {
      const u = v.spec;
      const enemy =
        (u.side === "thrall" || u.side === "vampire") && u.visible !== false && !u.dead && !u.gone;
      if (!enemy) {
        if (v.edge) v.edge.hidden = true;
        continue;
      }
      p.copy(v.group.position).add(new THREE.Vector3(0, 1.0, 0));
      const behind = p.clone().applyMatrix4(this.view.camera.matrixWorldInverse).z > 0;
      p.project(this.view.camera);
      let dx = p.x,
        dy = -p.y;
      if (behind) {
        dx = -dx;
        dy = -dy;
      }
      if (!behind && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        if (v.edge) v.edge.hidden = true;
        continue;
      }
      if (!v.edge) {
        const el = document.createElement("button");
        el.className = `battle-edge${u.side === "vampire" ? " vampire" : ""}`;
        el.addEventListener("click", () => this.view.input.focus(v.spec));
        this.edgeLayer.appendChild(el);
        v.edge = el;
      }
      v.edge.hidden = false;
      v.edge.dataset.tip = `${u.name ?? (u.side === "vampire" ? "Vampire" : "Thrall")}, off screen. Click to look.`;
      // From the centre, in pixels, out to the inset rectangle.
      const sx = dx * (w / 2),
        sy = dy * (h / 2);
      const hx = w / 2 - inset,
        hy = h / 2 - inset;
      const t = Math.min(hx / Math.max(1e-6, Math.abs(sx)), hy / Math.max(1e-6, Math.abs(sy)));
      const x = w / 2 + sx * t,
        y = h / 2 + sy * t;
      v.edge.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${Math.atan2(sy, sx).toFixed(3)}rad)`;
    }
  }

  /** Hands over the layer of head bars (see placeHeads); null to stop placing them. */
  setHeadLayer(el: HTMLElement | null) {
    this.headLayer = el;
  }

  /**
   * The UI's bars over units' heads: each child of the head layer with a
   * data-unit is moved to its unit's head on the screen (or, for an enemy
   * on a level cut away, over its pin), and hidden when the unit is.
   */
  placeHeads() {
    const layer = this.headLayer;
    if (!layer) return;
    const w = this.view.container.clientWidth,
      h = this.view.container.clientHeight;
    const p = new THREE.Vector3();
    for (const el of layer.children as HTMLCollectionOf<HTMLElement>) {
      const v = this.view.units.get(el.dataset.unit ?? "");
      const pinned = !!v?.above?.visible;
      let show = !!v && !v.headHidden && !v.spec.gone && (v.group.visible || pinned);
      if (show) {
        if (pinned) p.copy(v!.above!.position).add(new THREE.Vector3(0, 0.8, 0));
        else v!.head.getWorldPosition(p);
        const behind = p.clone().applyMatrix4(this.view.camera.matrixWorldInverse).z > 0;
        p.project(this.view.camera);
        show = !behind && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.1;
      }
      if (!show) {
        if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "";
      el.style.transform = `translate(${(((p.x + 1) * w) / 2).toFixed(1)}px, ${(((1 - p.y) * h) / 2).toFixed(1)}px)`;
    }
  }

  /** Each frame: the flames flicker. */
  update(now: number) {
    const t = now / 1000;
    for (const f of this.fireGroup.children)
      f.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 7 + f.userData.phase));
  }

  dispose() {
    this.setUnits([]);
    this.aboveMat.map?.dispose();
    this.aboveMat.dispose();
    this.edgeLayer.remove();
  }
}
