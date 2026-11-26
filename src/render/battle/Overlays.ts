// What the player is shown on the map: the move range (blue: time for a shot; yellow: the TU run out), the path and the cover at its end, aim lines, the CEP circle, the landing zone.
import * as THREE from "three";
import { type Pt3 } from "../../tactical/map/map";
import { chaikin, chaikinLoop, type V3 } from "../../tactical/map/path";
import { LEVEL_H, SLAB, TILE, wc } from "./scale";
import {
  glowMaterial,
  RED,
  BLUE,
  YELLOW,
  outlines,
  insetLoop,
  ribbon,
  yellowRuns,
} from "./overlayShapes";
import { BattleView, type M3 } from "./BattleView";

/** What the player is shown on the map: the move range (blue: time for a shot; yellow: the TU run out), the path and the cover at its end, aim lines, the CEP circle, the landing zone. */
export class Overlays {
  constructor(readonly view: BattleView) {}

  /** The aim lines (setAimLines): red glow ribbons with pulses running to the target, seen through walls. */
  readonly aimGroup = new THREE.Group();
  readonly aimMat = Object.assign(glowMaterial(RED, true), { depthTest: false });

  /** The CEP rings (setCep): over the walls, so a target behind cover still shows its circle. */
  readonly cepGroup = new THREE.Group();

  readonly cepMat = {
    enemy: {
      solid: new THREE.MeshBasicMaterial({
        color: 0xff5040,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      faint: new THREE.MeshBasicMaterial({
        color: 0xff5040,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    },
    force: {
      solid: new THREE.MeshBasicMaterial({
        color: 0xffb030,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      faint: new THREE.MeshBasicMaterial({
        color: 0xffb030,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    },
  };

  readonly quadGeo = new THREE.PlaneGeometry(0.94 * TILE, 0.94 * TILE).rotateX(-Math.PI / 2);

  readonly rangeMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  readonly blueGlow = glowMaterial(BLUE);
  readonly yellowGlow = glowMaterial(YELLOW);
  readonly bluePath = glowMaterial(BLUE, true);
  readonly yellowPath = glowMaterial(YELLOW, true);
  readonly endMarkMat = { blue: glowMaterial(BLUE), yellow: glowMaterial(YELLOW) };

  readonly ghosts = new Map<THREE.ShaderMaterial, THREE.ShaderMaterial>(
    [this.blueGlow, this.yellowGlow, this.bluePath, this.yellowPath].map((m) => [
      m,
      glowMaterial(m.uniforms.colour!.value.getHex(), m.uniforms.flow!.value > 0, true),
    ]),
  );

  readonly halfShieldMat = new THREE.MeshBasicMaterial({
    color: 0x5aa0e8,
    transparent: true,
    opacity: 0.75,
  });

  readonly fullShieldMat = new THREE.MeshBasicMaterial({
    color: 0x9ad0ff,
    transparent: true,
    opacity: 0.9,
  });

  range: THREE.InstancedMesh | null = null;
  readonly rangeLines = new THREE.Group();
  pathLine: THREE.Object3D | null = null;
  shields: THREE.Mesh[] = [];

  /** A glowing ribbon, plus its faint ghost that shows through walls. */
  glow(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, order: number): THREE.Group {
    const g = new THREE.Group();
    const main = new THREE.Mesh(geo, mat);
    main.renderOrder = order;
    g.add(main);
    const ghostMat = this.ghosts.get(mat);
    if (ghostMat) {
      const ghost = new THREE.Mesh(geo, ghostMat);
      ghost.renderOrder = order - 1;
      g.add(ghost);
    }
    return g;
  }

  /** Shows or hides the landing zone's marker (the block editor has none). */
  showLandingZone(on: boolean) {
    this.view.lzShown = on;
    this.view.lz.visible = on;
  }

  /**
   * Where a selected unit can go: a glowing yellow outline round everywhere
   * its TU reach, and a blue one round where it still has time to attack
   * (tiles with `dash` set are yellow only). With a `tint`, the tiles are
   * filled instead (an incendiary's blast).
   */
  setMoveRange(tiles: { x: number; y: number; z: number; dash: boolean }[], tint?: number) {
    if (this.range) {
      this.view.scene.remove(this.range);
      this.range.dispose();
      this.range = null;
    }
    for (const c of [...this.rangeLines.children]) {
      this.rangeLines.remove(c);
      (c.children[0] as THREE.Mesh).geometry.dispose();
    }
    const shown = tiles.filter((t) => t.z <= this.view.level);
    if (!shown.length) return;
    if (tint === undefined) return this.drawOutlines(shown);
    const mesh = new THREE.InstancedMesh(this.quadGeo, this.rangeMat, shown.length);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    shown.forEach((t, i) => {
      mtx.makeTranslation(wc(t.x), t.z * LEVEL_H + SLAB + 0.012, wc(t.y));
      mesh.setMatrixAt(i, mtx);
      mesh.setColorAt(i, col.setHex(tint));
    });
    mesh.renderOrder = 2;
    this.range = mesh;
    this.view.scene.add(mesh);
  }

  /**
   * The outlines, level by level: blue round where there's time to attack,
   * yellow only where the reach goes beyond it. Traced round the tiles,
   * pulled a little inside them (clear of walls), corners slightly rounded.
   */
  drawOutlines(tiles: { x: number; y: number; z: number; dash: boolean }[]) {
    const INSET = 0.22,
      ROUND = 0.1;
    const levels = new Map<number, { all: Set<string>; blue: Set<string> }>();
    for (const t of tiles) {
      const l = levels.get(t.z) ?? levels.set(t.z, { all: new Set(), blue: new Set() }).get(t.z)!;
      l.all.add(`${t.x},${t.y}`);
      if (!t.dash) l.blue.add(`${t.x},${t.y}`);
    }
    const toWorld = (pts: V3[], y: number) =>
      pts.map((p) => new THREE.Vector3(p.x * TILE, y, p.y * TILE));
    for (const [z, l] of levels) {
      const y = z * LEVEL_H + SLAB + 0.025;
      for (const loop of outlines(l.blue)) {
        const pts = chaikinLoop(insetLoop(loop, INSET), 2, ROUND);
        if (pts.length > 2)
          this.rangeLines.add(this.glow(ribbon(toWorld(pts, y), 0.5, true), this.blueGlow, 4));
      }
      for (const loop of outlines(l.all))
        for (const run of yellowRuns(loop, l.blue, INSET)) {
          const pts = run.closed ? chaikinLoop(run.pts, 2, ROUND) : chaikin(run.pts, 2, ROUND);
          if (pts.length >= 2)
            this.rangeLines.add(
              this.glow(ribbon(toWorld(pts, y), 0.5, run.closed), this.yellowGlow, 4),
            );
        }
    }
  }

  /** The path a move would take (its straight legs; drawn with the corners rounded), and the cover waiting at its end (index: +x, −x, +y, −y). */
  setPath(path: Pt3[] | null, dash = false, cover: number[] = []) {
    if (this.pathLine) {
      this.view.scene.remove(this.pathLine);
      this.pathLine.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.pathLine = null;
    }
    for (const s of this.shields) this.view.scene.remove(s);
    this.shields = [];
    if (!path || path.length < 2) return;
    const lift = SLAB + 0.05;
    const world: V3[] = path.map((p) => ({ x: wc(p.x), y: p.z * LEVEL_H + lift, z: wc(p.y) }));
    const pts = chaikin(world, 4, 0.45).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const group = new THREE.Group();
    const line = this.glow(ribbon(pts, 0.45, false), dash ? this.yellowPath : this.bluePath, 6);
    // A glowing ring where it ends.
    const end = path.at(-1)!;
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < 32; k++)
      ring.push(
        new THREE.Vector3(
          wc(end.x) + Math.cos((k / 32) * Math.PI * 2) * 0.5,
          end.z * LEVEL_H + lift,
          wc(end.y) + Math.sin((k / 32) * Math.PI * 2) * 0.5,
        ),
      );
    const mark = new THREE.Mesh(
      ribbon(ring, 0.24, true),
      dash ? this.endMarkMat.yellow : this.endMarkMat.blue,
    );
    mark.renderOrder = 5;
    group.add(line, mark);
    this.pathLine = group;
    this.view.scene.add(group);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    cover.forEach((c, i) => {
      if (!c) return;
      const [dx, dy] = dirs[i]!;
      const s = new THREE.Mesh(this.view.boxGeo, c === 2 ? this.fullShieldMat : this.halfShieldMat);
      const h = c === 2 ? 1.05 : 0.6;
      s.scale.set(dx ? 0.08 : 0.9, h, dy ? 0.08 : 0.9);
      s.position.set(
        wc(end.x) + dx * 0.42 * TILE,
        end.z * LEVEL_H + SLAB + h / 2,
        wc(end.y) + dy * 0.42 * TILE,
      );
      s.renderOrder = 3;
      this.shields.push(s);
      this.view.scene.add(s);
    });
  }

  /**
   * Aim lines: from a tile the player is about to move to, a red glow to each
   * enemy that could be attacked from there, pulses running toward it like
   * the path's. A target seen only by leaning out of full cover gets its
   * line from that side: out to the lean, then on. Null or none clears them.
   */
  setAimLines(from: Pt3 | null, targets: { at: Pt3; lean?: Pt3 }[] = []) {
    for (const o of this.aimGroup.children) (o as THREE.Mesh).geometry.dispose();
    this.aimGroup.clear();
    if (!from) return;
    const chest = (p: Pt3) => new THREE.Vector3(wc(p.x), p.z * LEVEL_H + SLAB + 1.3, wc(p.y));
    const a = chest(from);
    for (const t of targets) {
      const b = chest(t.at);
      // Leaning: out most of the way to the lean tile first, the corner rounded.
      const pts = t.lean ? chaikin([a, a.clone().lerp(chest(t.lean), 0.65), b], 3, 0.3) : [a, b];
      const line = new THREE.Mesh(
        ribbon(
          pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
          0.7,
          false,
        ),
        this.aimMat,
      );
      line.renderOrder = 9;
      this.aimGroup.add(line);
    }
  }

  /**
   * The CEP of a shot about to be fired: a ring round the aim point that half
   * the rounds would land within, and a faint one twice as wide (nearly all
   * of them). The cone is across the line of fire, but the rings are turned
   * to face the camera every frame, so they read as circles from above. Red
   * over an enemy; amber for force fire at a spot. Null clears it.
   */
  setCep(c: { at: M3; radius: number; from: M3; force?: boolean } | null) {
    for (const o of [...this.cepGroup.children]) {
      this.cepGroup.remove(o);
      (o as THREE.Mesh).geometry.dispose();
    }
    if (!c) return;
    const r = Math.max(0.05, c.radius);
    const mat = c.force ? this.cepMat.force : this.cepMat.enemy;
    const ring = (radius: number, width: number, faint: boolean) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.01, radius - width), radius + width, 64),
        faint ? mat.faint : mat.solid,
      );
      m.renderOrder = 10;
      return m;
    };
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), mat.solid);
    dot.renderOrder = 10;
    for (const m of [ring(r, 0.045, false), ring(2 * r, 0.03, true), dot]) {
      m.position.set(c.at.x, c.at.y, c.at.z);
      m.quaternion.copy(this.view.camera.quaternion);
      this.cepGroup.add(m);
    }
  }

  /** Each frame: the glowing ribbons' pulses move on. */
  update(now: number) {
    const ribbons = [
      this.bluePath,
      this.yellowPath,
      this.ghosts.get(this.bluePath)!,
      this.ghosts.get(this.yellowPath)!,
      this.aimMat,
    ];
    for (const m of ribbons) m.uniforms.time!.value = now / 1000;
  }

  /** The CEP circles always face the camera. */
  faceCamera() {
    for (const c of this.cepGroup.children) c.quaternion.copy(this.view.camera.quaternion);
  }

  dispose() {
    this.setMoveRange([]);
    this.setPath(null);
    this.setAimLines(null);
    this.setCep(null);
    for (const m of this.ghosts.values()) m.dispose();
    for (const m of [
      this.rangeMat,
      this.blueGlow,
      this.yellowGlow,
      this.bluePath,
      this.yellowPath,
      this.endMarkMat.blue,
      this.endMarkMat.yellow,
      this.halfShieldMat,
      this.fullShieldMat,
      this.aimMat,
    ])
      m.dispose();
    for (const m of Object.values(this.cepMat)) {
      m.solid.dispose();
      m.faint.dispose();
    }
    this.quadGeo.dispose();
  }
}
