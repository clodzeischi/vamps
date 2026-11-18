// The battlescape renderer (docs/WEB_PORT.md 3.11): crude on purpose. Every
// tile is drawn from boxes (one instanced mesh for everything solid, one for
// glass); walls are thin boxes on the edges between tiles; units are boxes
// with a smaller box for the weapon. The camera orbits the map; levels above
// the one being looked at are cut away. Move ranges are two glowing outlines
// (blue: time left to attack; yellow: as far as the TU go), and the path is a
// glowing ribbon with its corners rounded (Chaikin).
//
// Controls: right-drag rotates, middle-drag or WASD pans, wheel zooms, Q / E
// turn 45°, the hovered tile is outlined at the current level.
import * as THREE from "three";
import { HEALTH_ENEMY, healthColor } from "./health";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { E, SKINS, skinAt, T, tileAt, type BattleMap, type Pt3, type Skin } from "../tactical/map";
import { chaikin, chaikinLoop, type V3 } from "../tactical/path";

/** World height of one level; a tile is 1 × 1. */
export const LEVEL_H = 1.5;
const SLAB = 0.08;
/** How thick a wall on a tile edge is drawn. */
const WALL_T = 0.12;
const BLUE = 0x4aa8ff, YELLOW = 0xffc23a;

/**
 * Glow: a ribbon brightest along its middle line and fading out to its
 * sides, added onto whatever is behind it, unlit (it glows in the dark).
 * `flow` sends pulses along it (the path).
 */
function glowMaterial(colour: number, flow = false, ghost = false) {
  return new THREE.ShaderMaterial({
    uniforms: { colour: { value: new THREE.Color(colour) }, time: { value: 0 }, flow: { value: flow ? 1 : 0 }, strength: { value: ghost ? 0.3 : 1 } },
    vertexShader: `
      attribute float side;
      attribute float along;
      varying float vSide;
      varying float vAlong;
      void main() {
        vSide = side;
        vAlong = along;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 colour;
      uniform float time;
      uniform float flow;
      uniform float strength;
      varying float vSide;
      varying float vAlong;
      void main() {
        float d = abs(vSide);
        float core = exp(-d * d * 36.0);
        float halo = exp(-d * d * 3.5) * 0.55;
        float pulse = mix(1.0, 0.6 + 0.4 * sin(vAlong * 5.0 - time * 7.0), flow);
        vec3 c = colour * (halo + core * 0.9) + vec3(core * 0.55);
        gl_FragColor = vec4(c * pulse * strength, (halo + core) * pulse * strength);
      }`,
    transparent: true,
    depthWrite: false,
    // The ghost copy shows through walls, faintly, where the line runs behind them.
    depthTest: !ghost,
    blending: THREE.AdditiveBlending,
  });
}

/** A flat ribbon along a polyline on the floor (closed: a loop). Vertices carry their side (−1 to 1) and distance along. */
function ribbon(pts: THREE.Vector3[], width: number, closed: boolean): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [], side: number[] = [], along: number[] = [], index: number[] = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!, b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    let tx = b.x - a.x, tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    if (i > 0) dist += p.distanceTo(pts[i - 1]!);
    const w = width / 2;
    pos.push(p.x - tz * w, p.y, p.z + tx * w, p.x + tz * w, p.y, p.z - tx * w);
    side.push(-1, 1);
    along.push(dist, dist);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    index.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(index);
  return g;
}

/** One unit edge of an outline: from (x, y), one step (dx, dy), the region on its right (y down). */
interface Step { x: number; y: number; dx: number; dy: number }

/**
 * The outline of a set of tiles on one level: closed loops of unit edges
 * along the tile sides, the tiles on their inside (to the right, y down).
 * Each loop is walked keeping to the region, so tiles touching only at a
 * corner make separate loops.
 */
function outlines(tiles: Set<string>): Step[][] {
  const has = (x: number, y: number) => tiles.has(`${x},${y}`);
  const out = new Map<string, Step[]>();
  const add = (x: number, y: number, dx: number, dy: number) => {
    const k = `${x},${y}`;
    (out.get(k) ?? out.set(k, []).get(k)!).push({ x, y, dx, dy });
  };
  for (const key of tiles) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (!has(x, y - 1)) add(x, y, 1, 0);
    if (!has(x + 1, y)) add(x + 1, y, 0, 1);
    if (!has(x, y + 1)) add(x + 1, y + 1, -1, 0);
    if (!has(x - 1, y)) add(x, y + 1, 0, -1);
  }
  const loops: Step[][] = [];
  for (const [, list] of out)
    while (list.length) {
      const first = list.pop()!;
      const loop: Step[] = [first];
      let cur = first;
      for (let guard = 0; guard < 100000; guard++) {
        const nx = cur.x + cur.dx, ny = cur.y + cur.dy;
        if (nx === first.x && ny === first.y) break;
        const next = out.get(`${nx},${ny}`);
        if (!next?.length) break;
        // At a corner shared by two loops: turn toward the region first.
        const turn = (e: Step) => cur.dx * e.dy - cur.dy * e.dx;
        next.sort((p, q) => turn(p) - turn(q));
        cur = next.pop()!;
        loop.push(cur);
      }
      loops.push(loop);
    }
  return loops;
}

/** The inside of a unit edge (to its right, y down). */
const inward = (e: Step) => ({ x: -e.dy, y: e.dx });

/** The inset corner between two edges meeting at the end of `a`: where their lines, each pulled in by `d`, cross. */
function insetCorner(a: Step, b: Step, d: number): { x: number; y: number } | null {
  if (a.dx === b.dx && a.dy === b.dy) return null; // straight on: no corner
  const na = inward(a), nb = inward(b);
  return { x: a.x + a.dx + (na.x + nb.x) * d, y: a.y + a.dy + (na.y + nb.y) * d };
}

/** A closed outline as its inset corner points. */
function insetLoop(loop: Step[], d: number): V3[] {
  const pts: V3[] = [];
  loop.forEach((e, i) => {
    const c = insetCorner(e, loop[(i + 1) % loop.length]!, d);
    if (c) pts.push({ x: c.x, y: c.y, z: 0 });
  });
  return pts;
}

/**
 * The yellow line only where it isn't the blue one: a yellow loop cut into
 * runs of edges whose tile inside isn't blue. Each run's ends sit on the
 * blue line, inset the same, so the yellow carries straight on from it.
 */
function yellowRuns(loop: Step[], blue: Set<string>, d: number): { pts: V3[]; closed: boolean }[] {
  const n = loop.length;
  // The tile inside each edge.
  const shared = loop.map((e) => {
    const t = e.dx === 1 ? [e.x, e.y] : e.dy === 1 ? [e.x - 1, e.y] : e.dx === -1 ? [e.x - 1, e.y - 1] : [e.x, e.y - 1];
    return blue.has(`${t[0]},${t[1]}`);
  });
  if (shared.every((x) => !x)) return [{ pts: insetLoop(loop, d), closed: true }];
  const runs: { pts: V3[]; closed: boolean }[] = [];
  const start = shared.findIndex((x) => x);
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (shared[i] || !shared[(i - 1 + n) % n]) continue;
    // A run begins at edge i, after a shared edge.
    const prev = loop[(i - 1 + n) % n]!;
    const run: Step[] = [];
    for (let j = i; !shared[j % n] && run.length < n; j++) run.push(loop[j % n]!);
    const next = loop[(i + run.length) % n]!;
    const first = run[0]!, last = run.at(-1)!;
    const np = inward(prev), nf = inward(first), nn = inward(next), nl = inward(last);
    // Where it leaves the blue: the blue line's corner if the yellow goes straight on, else where the two inset lines cross.
    const head = prev.dx === first.dx && prev.dy === first.dy
      ? { x: first.x + (np.x - prev.dx) * d, y: first.y + (np.y - prev.dy) * d }
      : { x: first.x + (np.x + nf.x) * d, y: first.y + (np.y + nf.y) * d };
    const end = { x: last.x + last.dx, y: last.y + last.dy };
    const tail = last.dx === next.dx && last.dy === next.dy
      ? { x: end.x + (nn.x + next.dx) * d, y: end.y + (nn.y + next.dy) * d }
      : { x: end.x + (nl.x + nn.x) * d, y: end.y + (nl.y + nn.y) * d };
    const pts: V3[] = [{ ...head, z: 0 }];
    for (let j = 0; j < run.length - 1; j++) {
      const c = insetCorner(run[j]!, run[j + 1]!, d);
      if (c) pts.push({ ...c, z: 0 });
    }
    pts.push({ ...tail, z: 0 });
    runs.push({ pts, closed: false });
  }
  return runs;
}

const PALETTE: Record<Skin, number> = {
  none: 0x777777, grass: 0x3d5a34, road: 0x34363b, pavement: 0x6b6a66, indoor: 0x7a6650, dirt: 0x6a5338,
  wood: 0x8a6a44, stone: 0x777a80, roof: 0x4c4642, brick: 0x8a4a3a, plaster: 0xb8ae98, car: 0x5a6f8a,
  crate: 0x9a7a4a, tree: 0x2f5a2a, hedge: 0x335f30, hay: 0xc9a55a, fence: 0x8a7550, bin: 0x3f4a40,
  table: 0x6a4a30, bench: 0x6a5036, planks: 0x7a5a3a, parapet: 0x6a625a, tarmac: 0x2c2d31,
  grave: 0x8a8a86, rock: 0x5a564e, sarcophagus: 0x7a7266, pillar: 0x8a8478, altar: 0x5a1e22, rubble: 0x6e665a, crypt: 0x3e3a36,
};
const CAR_COLOURS = [0x5a6f8a, 0x8a2f2f, 0xc8c4b8, 0x2f3a46, 0x6a7a52, 0x9a8a5a];

export interface UnitSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  side: "agent" | "thrall" | "vampire" | "civilian" | "helicopter" | "hostage";
  /** Radians; 0 faces +x. */
  facing?: number;
  selected?: boolean;
  /** Marked as a target the selected unit can shoot. */
  targeted?: boolean;
  hp?: number;
  maxHp?: number;
  dead?: boolean;
  /** Left the map (evacuated). */
  gone?: boolean;
  /** False: the player can't see it. */
  visible?: boolean;
  overwatch?: boolean;
  hunkered?: boolean;
  /** Vampires: turns left in torpor (drawn lying down). */
  torpor?: number;
  /** Agents: carrying a crate. */
  carrying?: boolean;
  /** Agents down: turns left bleeding, or stabilized. */
  bleeding?: number;
  stable?: boolean;
  dominated?: boolean;
}

/** The battle events the view plays (tactical/battle.ts BattleEvent, structurally). */
export type BattleEventLike =
  | { kind: "move"; unit: string; path: Pt3[]; seen: boolean }
  | { kind: "shot"; unit: string; target: string; hit: boolean; crit: boolean; damage: number; reaction: boolean; melee: boolean; seen: boolean }
  | { kind: "death"; unit: string; text?: string }
  | { kind: "torpor"; unit: string; seen: boolean }
  | { kind: "burn"; unit: string; damage: number; why: "fire" | "sun"; seen: boolean }
  | { kind: "throw"; unit: string; at: Pt3; tiles: Pt3[] }
  | { kind: "status"; unit: string; text: string; seen: boolean }
  | { kind: "turn" }
  | { kind: "end" };

interface UnitView {
  group: THREE.Group;
  body: THREE.Group;
  ring: THREE.Mesh;
  mark: THREE.Mesh;
  label: THREE.Sprite;
  spec: UnitSpec;
  labelKey: string;
}

const SIDE_COLOURS: Record<UnitSpec["side"], number> = { agent: 0x8fb4e0, thrall: 0xc0784a, vampire: 0xc8243a, civilian: 0xc8c0a8, helicopter: 0x3a4a3e, hostage: 0xe8d890 };

/** One box to draw: centre, size, colour. */
interface Box { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number }

export class BattleView {
  onHover?: (p: Pt3 | null) => void;
  onPick?: (p: Pt3) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly world = new THREE.Group();
  private readonly unitGroup = new THREE.Group();
  private readonly hover: THREE.LineSegments;
  private readonly lz: THREE.Mesh;
  private readonly boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly solidMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
  private readonly glassMat = new THREE.MeshStandardMaterial({ color: 0x9cc4e0, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false });
  private readonly moon: THREE.DirectionalLight;
  private readonly sky = new THREE.HemisphereLight(0x9aa8c8, 0x3a3028, 1.5);
  private readonly fireGroup = new THREE.Group();
  private readonly lootGroup = new THREE.Group();
  private readonly crateMat = new THREE.MeshStandardMaterial({ color: 0xc9a040, roughness: 0.5, emissive: 0x6a4a10, emissiveIntensity: 0.4 });
  private readonly rotors: THREE.Object3D[] = [];
  private readonly lampGroup = new THREE.Group();
  private readonly fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly poolMat = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  private readonly poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7 });
  private night = true;
  private readonly units = new Map<string, UnitView>();
  private readonly anims: ((dt: number) => boolean)[] = [];
  private readonly quadGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  private readonly rangeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false });
  private readonly blueGlow = glowMaterial(BLUE);
  private readonly yellowGlow = glowMaterial(YELLOW);
  private readonly bluePath = glowMaterial(BLUE, true);
  private readonly yellowPath = glowMaterial(YELLOW, true);
  private readonly endMarkMat = { blue: glowMaterial(BLUE), yellow: glowMaterial(YELLOW) };
  private readonly ghosts = new Map<THREE.ShaderMaterial, THREE.ShaderMaterial>(
    [this.blueGlow, this.yellowGlow, this.bluePath, this.yellowPath].map((m) => [m, glowMaterial(m.uniforms.colour!.value.getHex(), m.uniforms.flow!.value > 0, true)]),
  );

  /** A glowing ribbon, plus its faint ghost that shows through walls. */
  private glow(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, order: number): THREE.Group {
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
  private readonly halfShieldMat = new THREE.MeshBasicMaterial({ color: 0x5aa0e8, transparent: true, opacity: 0.75 });
  private readonly fullShieldMat = new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.9 });
  private range: THREE.InstancedMesh | null = null;
  private readonly rangeLines = new THREE.Group();
  private pathLine: THREE.Object3D | null = null;
  private shields: THREE.Mesh[] = [];
  private focusTo: THREE.Vector3 | null = null;
  private map: BattleMap | null = null;
  private level = 0;
  private frame = 0;
  private keys = new Set<string>();
  /** Camera keys, as KeyboardEvent.code (ui/keys.ts); the UI sets them. */
  cameraKeys = { forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD", rotateLeft: "KeyQ", rotateRight: "KeyE" };
  private turn = 0;
  private hovered: Pt3 | null = null;
  private down: { x: number; y: number } | null = null;
  private last = performance.now();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0c0e14);
    this.scene.fog = new THREE.Fog(0x0c0e14, 45, 110);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 70;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

    // Night, but readable: a cool sky, a moon that casts shadows, warm bounce.
    this.scene.add(this.sky);
    const moon = (this.moon = new THREE.DirectionalLight(0xc8d4f0, 1.6));
    moon.position.set(-30, 50, 20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -40;
    moon.shadow.camera.right = 40;
    moon.shadow.camera.top = 40;
    moon.shadow.camera.bottom = -40;
    moon.shadow.bias = -0.0008;
    this.scene.add(moon, moon.target);
    this.scene.add(this.world, this.unitGroup, this.fireGroup, this.lampGroup, this.lootGroup, this.rangeLines);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.05, 1));
    this.hover = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xe8c987 }));
    this.hover.visible = false;
    this.scene.add(this.hover);
    this.lz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x8fd39a, transparent: true, opacity: 0.22, depthWrite: false }));
    this.lz.rotation.x = -Math.PI / 2;
    this.scene.add(this.lz);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ----- Public API -----

  setMap(m: BattleMap) {
    this.map = m;
    this.level = m.levels - 1;
    this.placeLamps(m);
    this.setFire([]);
    this.setLoot([]);
    this.setUnits([]);
    this.setMoveRange([]);
    this.setPath(null);
    this.rebuild();
    // Look at the landing zone from the south-west, at a comfortable height.
    const c = m.lz[4] ?? m.lz[0]!;
    // Between the landing zone and the middle of the map, far enough back to see most of it.
    const target = this.tileCentre(c.x, c.y, m.ground).lerp(this.tileCentre(m.w / 2, m.h / 2, m.ground), 0.4);
    this.controls.target.copy(target);
    const back = new THREE.Vector3(m.w / 2 - c.x, 0, m.h / 2 - c.y).normalize().multiplyScalar(-1);
    if (!Number.isFinite(back.x)) back.set(-1, 0, 1).normalize();
    this.camera.position.copy(target).add(back.multiplyScalar(m.w * 0.55)).add(new THREE.Vector3(0, m.w * 0.75, 0));
    this.moon.target.position.set(m.w / 2, 0, m.h / 2);
    this.moon.position.set(m.w / 2 - 30, 50, m.h / 2 + 20);
    this.lz.visible = true;
    this.lz.scale.set(3, 3, 1);
    this.lz.position.set(c.x + 0.5, m.ground * LEVEL_H + SLAB + 0.01, c.y + 0.5);
  }

  /** Show levels up to and including `z` (the cutaway). */
  setLevel(z: number) {
    if (!this.map) return;
    const next = Math.max(0, Math.min(this.map.levels - 1, z));
    if (next === this.level) return;
    this.level = next;
    this.rebuild();
    this.lz.visible = next >= this.map.ground;
    for (const v of this.units.values()) v.group.visible = v.spec.visible !== false && v.spec.z <= next && !v.spec.gone;
    this.showLamps();
    this.hover.visible = false;
    this.hovered = null;
  }

  getLevel() {
    return this.level;
  }

  /** Bring the units in line with the battle (positions, health, who's seen). Call after any playback. */
  setUnits(units: UnitSpec[]) {
    const keep = new Set(units.map((u) => u.id));
    for (const [id, v] of this.units)
      if (!keep.has(id)) {
        const rotor = v.group.getObjectByName("rotor");
        if (rotor) this.rotors.splice(this.rotors.indexOf(rotor), 1);
        this.unitGroup.remove(v.group);
        this.disposeTree(v.group);
        this.units.delete(id);
      }
    for (const u of units) {
      let v = this.units.get(u.id);
      if (!v) {
        v = this.makeUnit(u);
        this.units.set(u.id, v);
        this.unitGroup.add(v.group);
      }
      v.spec = u;
      this.placeUnit(v.group, u, u.facing ?? 0);
      v.group.visible = u.visible !== false && u.z <= this.level && !u.gone;
      v.ring.visible = !!u.selected;
      v.mark.visible = !!u.targeted;
      const lying = u.side !== "helicopter" && (u.dead || (u.torpor ?? 0) > 0 || (u.bleeding ?? 0) > 0 || !!u.stable);
      v.body.rotation.z = lying ? Math.PI / 2 : 0;
      v.body.position.y = lying ? 0.25 : 0;
      const crate = v.body.getObjectByName("crate");
      if (crate) crate.visible = !!u.carrying;
      // A wrecked helicopter: dark, and sunk on its skids.
      if (u.side === "helicopter") v.body.rotation.x = u.dead ? 0.25 : 0;
      this.updateLabel(v, u);
    }
  }

  private makeUnit(u: UnitSpec) {
    if (u.side === "helicopter") return this.makeHelicopter(u);
    const group = new THREE.Group();
    const body = new THREE.Group();
    const colour = SIDE_COLOURS[u.side];
    const tall = u.side === "vampire" ? 1.05 : 0.95;
    const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, emissive: colour, emissiveIntensity: u.side === "vampire" ? 0.25 : 0.08 });
    const torso = new THREE.Mesh(this.boxGeo, mat);
    torso.scale.set(0.46, tall, 0.34);
    torso.position.y = tall / 2;
    const head = new THREE.Mesh(this.boxGeo, mat);
    head.scale.set(0.26, 0.26, 0.26);
    head.position.y = tall + 0.15;
    body.add(torso, head);
    // A crate on the back, shown when carrying.
    const crate = new THREE.Mesh(this.boxGeo, this.crateMat);
    crate.scale.set(0.3, 0.3, 0.3);
    crate.position.set(-0.3, tall * 0.6, 0);
    crate.name = "crate";
    body.add(crate);
    if (u.side !== "civilian" && u.side !== "hostage") {
      // The weapon: a smaller box held out in front (claws for a vampire: two short ones).
      const gun = new THREE.MeshStandardMaterial({ color: u.side === "vampire" ? 0xe8e0d0 : 0x1c1c1e, roughness: 0.4, metalness: 0.4 });
      if (u.side === "vampire") {
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(this.boxGeo, gun);
          claw.scale.set(0.24, 0.06, 0.06);
          claw.position.set(0.3, tall * 0.55, side * 0.2);
          body.add(claw);
        }
      } else {
        const w = new THREE.Mesh(this.boxGeo, gun);
        w.scale.set(u.side === "agent" ? 0.55 : 0.4, 0.08, 0.08);
        w.position.set(0.32, tall * 0.62, 0.2);
        body.add(w);
      }
    }
    body.traverse((o) => (o.castShadow = true));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xe8c987, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 4), new THREE.MeshBasicMaterial({ color: 0xff4a4a, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.03;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    label.position.y = tall + 0.65;
    label.renderOrder = 10;
    group.add(body, ring, mark, label);
    return { group, body, ring, mark, label, spec: u, labelKey: "" };
  }

  /** The helicopter: a fuselage, a tail boom, skids and a rotor (it turns). */
  private makeHelicopter(u: UnitSpec) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: SIDE_COLOURS.helicopter, roughness: 0.5, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6 });
    const add = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(this.boxGeo, m);
      b.scale.set(sx, sy, sz);
      b.position.set(x, y, z);
      b.castShadow = true;
      body.add(b);
      return b;
    };
    add(hull, 1.6, 0.8, 0.9, 0, 0.6, 0);
    add(dark, 0.5, 0.45, 0.8, 0.65, 0.65, 0); // the canopy
    add(hull, 1.4, 0.18, 0.18, -1.3, 0.75, 0); // tail boom
    add(hull, 0.12, 0.45, 0.06, -1.95, 0.95, 0); // fin
    add(dark, 1.6, 0.06, 0.06, 0, 0.12, 0.42);
    add(dark, 1.6, 0.06, 0.06, 0, 0.12, -0.42);
    const rotor = add(dark, 3.4, 0.03, 0.14, 0, 1.12, 0);
    rotor.name = "rotor";
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xe8c987, side: THREE.DoubleSide }));
    ring.visible = false;
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 4), new THREE.MeshBasicMaterial({ color: 0xff4a4a, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.03;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    label.position.y = 1.7;
    label.renderOrder = 10;
    group.add(body, ring, mark, label);
    this.rotors.push(rotor);
    return { group, body, ring, mark, label, spec: u, labelKey: "" };
  }

  /** Loot crates lying on the map. */
  setLoot(items: Pt3[]) {
    for (const c of [...this.lootGroup.children]) this.lootGroup.remove(c);
    for (const p of items) {
      if (p.z > this.level) continue;
      const c = new THREE.Mesh(this.boxGeo, this.crateMat);
      c.scale.set(0.4, 0.32, 0.4);
      c.position.set(p.x + 0.5, p.z * LEVEL_H + SLAB + 0.16, p.y + 0.5);
      c.castShadow = true;
      this.lootGroup.add(c);
    }
  }

  private placeUnit(g: THREE.Object3D, p: { x: number; y: number; z: number }, facing: number) {
    g.position.set(p.x + 0.5, p.z * LEVEL_H + SLAB, p.y + 0.5);
    g.rotation.y = -facing;
  }

  /** A health bar over the head, and OW / HD when on overwatch or hunkered. */
  private updateLabel(v: UnitView, u: UnitSpec) {
    const key = `${u.hp}/${u.maxHp}/${u.overwatch}/${u.hunkered}/${u.dead}/${u.torpor}/${u.dominated}/${u.bleeding}/${u.stable}`;
    v.label.visible = !u.dead && u.hp !== undefined && u.side !== "civilian";
    const lyingDown = (u.torpor ?? 0) > 0 || (u.bleeding ?? 0) > 0 || !!u.stable;
    v.label.position.y = lyingDown ? 0.9 : (u.side === "vampire" ? 1.05 : 0.95) + 0.65;
    v.label.rotation.y = 0;
    if (key === v.labelKey || !v.label.visible) return;
    v.labelKey = key;
    const hp = u.hp ?? 0, max = u.maxHp ?? 0;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const x = c.getContext("2d")!;
    const tags = [u.overwatch ? "OW" : "", u.hunkered ? "HD" : "", u.dominated ? "DOM" : ""].filter(Boolean).join(" ");
    if (lyingDown) {
      // A body in torpor (how long until it rises), or one of ours down.
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 64;
      const x = c.getContext("2d")!;
      x.font = "bold 26px ui-monospace, Menlo, monospace";
      x.textAlign = "center";
      x.fillStyle = "rgba(0,0,0,0.65)";
      x.fillRect(28, 14, 200, 36);
      x.fillStyle = u.side === "agent" ? (u.stable ? "#8fd39a" : "#ffb04a") : "#ff8a6a";
      x.fillText(u.side === "agent" ? (u.stable ? "STABLE" : `BLEEDING · ${u.bleeding}`) : `TORPOR · ${u.torpor}`, 128, 41);
      this.setLabel(v, c);
      return;
    }
    // One bar, like the squad cards': ours coloured by damage, enemies always red.
    const w = 150;
    const x0 = (256 - w - (tags ? 46 : 0)) / 2;
    const friendly = u.side === "agent" || u.side === "helicopter" || u.side === "hostage";
    x.fillStyle = "rgba(0,0,0,0.7)";
    x.fillRect(x0 - 3, 23, w + 6, 20);
    x.fillStyle = "#2a2a2a";
    x.fillRect(x0, 26, w, 14);
    x.fillStyle = friendly ? healthColor(hp, max) : HEALTH_ENEMY;
    x.fillRect(x0, 26, Math.round((w * Math.max(0, hp)) / Math.max(1, max)), 14);
    if (tags) {
      x.font = "bold 22px ui-monospace, Menlo, monospace";
      x.fillStyle = "#e8c987";
      x.fillText(tags, x0 + w + 8, 41);
    }
    this.setLabel(v, c);
  }

  private setLabel(v: UnitView, c: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = v.label.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
    v.label.scale.set(1.6, 0.4, 1);
  }

  // ----- Light, fire -----

  /** Night: moonlight, lamps lit. Day: sun and sky. */
  setDaylight(night: boolean) {
    this.night = night;
    this.sky.color.setHex(night ? 0x9aa8c8 : 0xcfe0ff);
    this.sky.groundColor.setHex(night ? 0x3a3028 : 0x6a5a48);
    this.sky.intensity = night ? 1.5 : 1.9;
    this.moon.color.setHex(night ? 0xc8d4f0 : 0xfff2dc);
    this.moon.intensity = night ? 1.6 : 2.6;
    const bg = night ? 0x0c0e14 : 0x6f8aa8;
    (this.scene.background as THREE.Color).setHex(bg);
    this.scene.fog!.color.setHex(bg);
    this.showLamps();
  }

  /** Lamp posts, and at night a pool of light round each. */
  private placeLamps(m: BattleMap) {
    for (const c of [...this.lampGroup.children]) {
      this.lampGroup.remove(c);
      if (c instanceof THREE.Mesh && c.geometry !== this.boxGeo) c.geometry.dispose();
    }
    const pool = new THREE.CircleGeometry(4, 24).rotateX(-Math.PI / 2);
    for (const l of m.lights) {
      const base = l.z * LEVEL_H + SLAB;
      // Underground, a brazier on a short stand; above ground, a lamp post.
      const h = l.z < m.ground ? 0.7 : 2.2;
      const pole = new THREE.Mesh(this.boxGeo, this.poleMat);
      pole.scale.set(l.z < m.ground ? 0.16 : 0.08, h, l.z < m.ground ? 0.16 : 0.08);
      pole.position.set(l.x + 0.5, base + h / 2, l.y + 0.5);
      const lamp = new THREE.Mesh(this.boxGeo, l.z < m.ground ? this.fireMat : this.lampMat);
      lamp.scale.set(l.z < m.ground ? 0.34 : 0.22, l.z < m.ground ? 0.22 : 0.14, l.z < m.ground ? 0.34 : 0.22);
      lamp.position.set(l.x + 0.5, base + h + 0.08, l.y + 0.5);
      const glow = new THREE.Mesh(pool, this.poolMat);
      glow.position.set(l.x + 0.5, base + 0.015, l.y + 0.5);
      glow.userData.pool = true;
      glow.userData.under = l.z < m.ground;
      glow.renderOrder = 1;
      for (const o of [pole, lamp, glow]) o.userData.z = l.z;
      this.lampGroup.add(pole, lamp, glow);
    }
    this.showLamps();
  }

  /** Lamps on levels shown; their pools only at night. */
  private showLamps() {
    for (const c of this.lampGroup.children) c.visible = c.userData.z <= this.level && (!c.userData.pool || this.night || !!c.userData.under);
  }

  /** Burning tiles (index → turns left). */
  setFire(tiles: Pt3[]) {
    for (const c of [...this.fireGroup.children]) this.fireGroup.remove(c);
    for (const p of tiles) {
      if (p.z > this.level) continue;
      const f = new THREE.Mesh(this.boxGeo, this.fireMat);
      f.scale.set(0.9, 0.5, 0.9);
      f.position.set(p.x + 0.5, p.z * LEVEL_H + SLAB + 0.25, p.y + 0.5);
      f.userData.phase = Math.random() * 6;
      this.fireGroup.add(f);
    }
  }

  private disposeTree(o: THREE.Object3D) {
    o.traverse((n) => {
      if (n instanceof THREE.Mesh || n instanceof THREE.Sprite) {
        const m = n.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        m.dispose();
        if (n instanceof THREE.Mesh && n.geometry !== this.boxGeo) n.geometry.dispose();
      }
    });
  }

  // ----- Overlays -----

  /**
   * Where a selected unit can go: a glowing yellow outline round everywhere
   * its TU reach, and a blue one round where it still has time to attack
   * (tiles with `dash` set are yellow only). With a `tint`, the tiles are
   * filled instead (an incendiary's blast).
   */
  setMoveRange(tiles: { x: number; y: number; z: number; dash: boolean }[], tint?: number) {
    if (this.range) {
      this.scene.remove(this.range);
      this.range.dispose();
      this.range = null;
    }
    for (const c of [...this.rangeLines.children]) {
      this.rangeLines.remove(c);
      (c.children[0] as THREE.Mesh).geometry.dispose();
    }
    const shown = tiles.filter((t) => t.z <= this.level);
    if (!shown.length) return;
    if (tint === undefined) return this.drawOutlines(shown);
    const mesh = new THREE.InstancedMesh(this.quadGeo, this.rangeMat, shown.length);
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    shown.forEach((t, i) => {
      mtx.makeTranslation(t.x + 0.5, t.z * LEVEL_H + SLAB + 0.012, t.y + 0.5);
      mesh.setMatrixAt(i, mtx);
      mesh.setColorAt(i, col.setHex(tint));
    });
    mesh.renderOrder = 2;
    this.range = mesh;
    this.scene.add(mesh);
  }

  /**
   * The outlines, level by level: blue round where there's time to attack,
   * yellow only where the reach goes beyond it. Traced round the tiles,
   * pulled a little inside them (clear of walls), corners slightly rounded.
   */
  private drawOutlines(tiles: { x: number; y: number; z: number; dash: boolean }[]) {
    const INSET = 0.22, ROUND = 0.1;
    const levels = new Map<number, { all: Set<string>; blue: Set<string> }>();
    for (const t of tiles) {
      const l = levels.get(t.z) ?? levels.set(t.z, { all: new Set(), blue: new Set() }).get(t.z)!;
      l.all.add(`${t.x},${t.y}`);
      if (!t.dash) l.blue.add(`${t.x},${t.y}`);
    }
    const toWorld = (pts: V3[], y: number) => pts.map((p) => new THREE.Vector3(p.x, y, p.y));
    for (const [z, l] of levels) {
      const y = z * LEVEL_H + SLAB + 0.025;
      for (const loop of outlines(l.blue)) {
        const pts = chaikinLoop(insetLoop(loop, INSET), 2, ROUND);
        if (pts.length > 2) this.rangeLines.add(this.glow(ribbon(toWorld(pts, y), 0.34, true), this.blueGlow, 4));
      }
      for (const loop of outlines(l.all))
        for (const run of yellowRuns(loop, l.blue, INSET)) {
          const pts = run.closed ? chaikinLoop(run.pts, 2, ROUND) : chaikin(run.pts, 2, ROUND);
          if (pts.length >= 2) this.rangeLines.add(this.glow(ribbon(toWorld(pts, y), 0.34, run.closed), this.yellowGlow, 4));
        }
    }
  }

  /** The path a move would take (its straight legs; drawn with the corners rounded), and the cover waiting at its end (index: +x, −x, +y, −y). */
  setPath(path: Pt3[] | null, dash = false, cover: number[] = []) {
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.pathLine = null;
    }
    for (const s of this.shields) this.scene.remove(s);
    this.shields = [];
    if (!path || path.length < 2) return;
    const lift = SLAB + 0.05;
    const world: V3[] = path.map((p) => ({ x: p.x + 0.5, y: p.z * LEVEL_H + lift, z: p.y + 0.5 }));
    const pts = chaikin(world, 4, 0.45).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const group = new THREE.Group();
    const line = this.glow(ribbon(pts, 0.3, false), dash ? this.yellowPath : this.bluePath, 6);
    // A glowing ring where it ends.
    const end = path.at(-1)!;
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < 32; k++) ring.push(new THREE.Vector3(end.x + 0.5 + Math.cos((k / 32) * Math.PI * 2) * 0.34, end.z * LEVEL_H + lift, end.y + 0.5 + Math.sin((k / 32) * Math.PI * 2) * 0.34));
    const mark = new THREE.Mesh(ribbon(ring, 0.16, true), dash ? this.endMarkMat.yellow : this.endMarkMat.blue);
    mark.renderOrder = 5;
    group.add(line, mark);
    this.pathLine = group;
    this.scene.add(group);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    cover.forEach((c, i) => {
      if (!c) return;
      const [dx, dy] = dirs[i]!;
      const s = new THREE.Mesh(this.boxGeo, c === 2 ? this.fullShieldMat : this.halfShieldMat);
      const h = c === 2 ? 0.7 : 0.4;
      s.scale.set(dx ? 0.06 : 0.6, h, dy ? 0.06 : 0.6);
      s.position.set(end.x + 0.5 + dx * 0.42, end.z * LEVEL_H + SLAB + h / 2, end.y + 0.5 + dy * 0.42);
      s.renderOrder = 3;
      this.shields.push(s);
      this.scene.add(s);
    });
  }

  /** Smoothly centre the camera on a tile. */
  focus(p: Pt3) {
    this.focusTo = new THREE.Vector3(p.x + 0.5, p.z * LEVEL_H, p.y + 0.5);
  }

  // ----- Playback -----

  /** Plays a list of battle events in order; resolves when done. Unseen ones are skipped. */
  async play(events: BattleEventLike[]) {
    for (const e of events) {
      if (e.kind === "move" && e.seen) await this.animateMove(e.unit, e.path);
      else if (e.kind === "shot" && e.seen) await this.animateShot(e);
      else if (e.kind === "death") await this.animateDeath(e.unit, e.text);
      else if (e.kind === "torpor" && e.seen) await this.animateDeath(e.unit, this.units.get(e.unit)?.spec.side === "agent" ? undefined : "Torpor");
      else if (e.kind === "burn" && e.seen) {
        const v = this.units.get(e.unit);
        if (v) this.popup(v.group.position, `${e.why === "sun" ? "Sun" : "Fire"} −${e.damage}`, "#ffa040");
        await this.wait(450);
      } else if (e.kind === "throw") await this.animateThrow(e.unit, e.at, e.tiles);
      else if (e.kind === "status" && e.seen) {
        const v = this.units.get(e.unit);
        if (v && v.group.visible) this.popup(v.group.position, e.text, "#e8c987");
        await this.wait(350);
      }
    }
  }

  private wait(ms: number) {
    return new Promise<void>((res) => setTimeout(res, ms));
  }

  private animate(step: (dt: number) => boolean) {
    return new Promise<void>((res) => this.anims.push((dt) => {
      const done = step(dt);
      if (done) res();
      return done;
    }));
  }

  /** Walks a unit along its path: the straight legs with their corners rounded (Chaikin), at a steady pace. */
  private animateMove(id: string, path: Pt3[]) {
    const v = this.units.get(id);
    if (!v || !path.length) return Promise.resolve();
    v.group.visible = true;
    const from = { x: v.group.position.x - 0.5, y: v.group.position.z - 0.5, z: Math.round((v.group.position.y - SLAB) / LEVEL_H) };
    // In tile units, levels by their world height, so a stair climb takes its time.
    const legs: V3[] = [from, ...path].map((p) => ({ x: p.x, y: p.y, z: p.z * LEVEL_H }));
    const pts = chaikin(legs, 4, 0.45);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y, pts[i]!.z - pts[i - 1]!.z));
    const total = cum.at(-1)!;
    let d = 0, seg = 0;
    const speed = 7; // tiles a second
    this.focus(path.at(-1)!);
    return this.animate((dt) => {
      d = Math.min(total, d + dt * speed);
      while (seg < pts.length - 2 && cum[seg + 1]! < d) seg++;
      const a = pts[seg]!, b = pts[seg + 1] ?? a;
      const span = cum[seg + 1]! - cum[seg]! || 1;
      const f = Math.min(1, Math.max(0, (d - cum[seg]!) / span));
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z + (b.z - a.z) * f) / LEVEL_H };
      const facing = b.x !== a.x || b.y !== a.y ? Math.atan2(b.y - a.y, b.x - a.x) : -v.group.rotation.y;
      this.placeUnit(v.group, p, facing);
      v.group.visible = Math.ceil(p.z - 0.01) <= this.level;
      return d >= total;
    });
  }

  private async animateShot(e: Extract<BattleEventLike, { kind: "shot" }>) {
    const s = this.units.get(e.unit), t = this.units.get(e.target);
    if (!s || !t) return;
    s.group.visible = s.group.visible || true;
    const a = s.group.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    const b = t.group.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    s.group.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    if (!e.hit) b.add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.2) * 0.8, (Math.random() - 0.5) * 1.6));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: e.melee ? 0xffffff : e.reaction ? 0xffb050 : 0xfff0c0, transparent: true }));
    this.scene.add(line);
    let life = 0.35;
    await this.animate((dt) => {
      life -= dt;
      (line.material as THREE.LineBasicMaterial).opacity = Math.max(0, life / 0.35);
      return life <= 0;
    });
    this.scene.remove(line);
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
    const text = !e.hit ? "Miss" : e.crit ? `Critical −${e.damage}` : `−${e.damage}`;
    this.popup(t.group.position, text, !e.hit ? "#c8c0a8" : e.crit ? "#ffd04a" : "#ff6a5a");
    await this.wait(450);
  }

  private async animateDeath(id: string, text?: string) {
    const v = this.units.get(id);
    if (!v) return;
    if (text && v.group.visible) this.popup(v.group.position, text, text === "Torpor" ? "#ff8a6a" : "#e8c987");
    if (text !== "Torpor") v.label.visible = false;
    if (v.body.rotation.z > 1) return void (await this.wait(500)); // already lying: finished where it fell
    if (v.spec.side === "helicopter") {
      this.setFire([...this.fireGroup.children.map((c) => ({ x: Math.floor(c.position.x), y: Math.floor(c.position.z), z: Math.round((c.position.y - SLAB - 0.25) / LEVEL_H) })), { x: v.spec.x, y: v.spec.y, z: v.spec.z }]);
      v.body.rotation.x = 0.25;
      return void (await this.wait(700));
    }
    let t = 0;
    await this.animate((dt) => {
      t = Math.min(1, t + dt * 3);
      v.body.rotation.z = (t * Math.PI) / 2;
      v.body.position.y = t * 0.25;
      return t >= 1;
    });
    await this.wait(200);
  }

  /** An incendiary: an arc from the thrower, then the ground goes up. */
  private async animateThrow(id: string, at: Pt3, tiles: Pt3[]) {
    const v = this.units.get(id);
    const to = new THREE.Vector3(at.x + 0.5, at.z * LEVEL_H + SLAB + 0.2, at.y + 0.5);
    const from = v ? v.group.position.clone().add(new THREE.Vector3(0, 1, 0)) : to.clone();
    const ball = new THREE.Mesh(this.boxGeo, this.lampMat);
    ball.scale.setScalar(0.15);
    this.scene.add(ball);
    let t = 0;
    await this.animate((dt) => {
      t = Math.min(1, t + dt * 1.6);
      ball.position.lerpVectors(from, to, t);
      ball.position.y += Math.sin(t * Math.PI) * 2.5;
      return t >= 1;
    });
    this.scene.remove(ball);
    const current = this.fireGroup.children.map((c) => ({ x: Math.floor(c.position.x), y: Math.floor(c.position.z), z: Math.round((c.position.y - SLAB - 0.25) / LEVEL_H) }));
    this.setFire([...current, ...tiles]);
    await this.wait(400);
  }

  /** Floating words over a unit: rise, then fade. */
  private popup(at: THREE.Vector3, text: string, colour: string) {
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
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.2, 0.6, 1);
    sprite.position.copy(at).add(new THREE.Vector3(0, 1.9, 0));
    sprite.renderOrder = 11;
    this.scene.add(sprite);
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      sprite.position.y += dt * 0.5;
      (sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - Math.max(0, t - 0.8) / 0.6);
      if (t < 1.4) return false;
      this.scene.remove(sprite);
      tex.dispose();
      sprite.material.dispose();
      return true;
    });
  }

  /** Turn the camera 45° about its target (+1 clockwise). */
  turnCamera(dir: number) {
    this.turn += (dir * Math.PI) / 4;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    this.controls.dispose();
    this.clearWorld();
    this.setUnits([]);
    this.boxGeo.dispose();
    this.solidMat.dispose();
    this.glassMat.dispose();
    this.setMoveRange([]);
    this.setPath(null);
    for (const m of this.ghosts.values()) m.dispose();
    for (const m of [this.rangeMat, this.blueGlow, this.yellowGlow, this.bluePath, this.yellowPath, this.endMarkMat.blue, this.endMarkMat.yellow, this.halfShieldMat, this.fullShieldMat]) m.dispose();
    this.quadGeo.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ----- Building the scene -----

  private tileCentre(x: number, y: number, z: number) {
    return new THREE.Vector3(x + 0.5, z * LEVEL_H, y + 0.5);
  }

  private clearWorld() {
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
    }
  }

  private rebuild() {
    const m = this.map;
    if (!m) return;
    this.clearWorld();
    const solid: Box[] = [];
    const glass: Box[] = [];
    const H = LEVEL_H;
    let carIndex = 0;
    for (let z = 0; z <= this.level; z++) {
      const base = z * H;
      const top = z === this.level; // walls on the cut level are drawn short, to see in
      const wallH = top && z < m.levels - 1 && this.level < m.levels - 1 ? H * 0.55 : H;
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const t = tileAt(m, x, y, z);
          if (t === T.VOID) continue;
          const skin = skinAt(m, x, y, z);
          const cx = x + 0.5, cy = y + 0.5;
          const below = tileAt(m, x, y, z - 1);
          const floorSkin = t === T.FLOOR || t === T.DOOR || t === T.STAIRS ? skin : this.floorUnder(m, x, y, z);
          // The floor slab (none over a stairwell, so the stairs come up through it).
          if (below !== T.STAIRS) solid.push({ x: cx, y: base + SLAB / 2, z: cy, sx: 0.98, sy: SLAB, sz: 0.98, c: PALETTE[floorSkin] });
          switch (t) {
            case T.WALL:
              // Full walls stop just under the next floor's slab (no z-fighting with the roof).
              solid.push({ x: cx, y: base + SLAB + (wallH === H ? H - SLAB : wallH) / 2, z: cy, sx: 1, sy: wallH === H ? H - SLAB : wallH, sz: 1, c: PALETTE[skin] });
              break;
            case T.WINDOW: {
              const wall = PALETTE[this.wallNear(m, x, y, z)];
              const sill = 0.45;
              solid.push({ x: cx, y: base + SLAB + sill / 2, z: cy, sx: 1, sy: sill, sz: 1, c: wall });
              if (wallH === H) {
                const lintel = 0.2;
                solid.push({ x: cx, y: base + H - lintel / 2, z: cy, sx: 1, sy: lintel, sz: 1, c: wall });
                glass.push({ x: cx, y: base + SLAB + sill + (H - SLAB - sill - lintel) / 2, z: cy, sx: 0.98, sy: H - SLAB - sill - lintel, sz: 0.98, c: 0 });
              }
              break;
            }
            case T.DOOR:
              if (wallH === H) solid.push({ x: cx, y: base + H - 0.1, z: cy, sx: 1, sy: 0.2, sz: 1, c: PALETTE[this.wallNear(m, x, y, z)] });
              break;
            case T.LOW: {
              if (skin === "car") {
                // A car is two tiles: drawn once, from its first tile.
                const car = (dx: number, dy: number) => tileAt(m, x + dx, y + dy, z) === T.LOW && skinAt(m, x + dx, y + dy, z) === "car";
                if (car(0, -1) || (!car(0, 1) && car(-1, 0))) break;
                const along = car(0, 1) ? { x: 0, y: 1 } : car(1, 0) ? { x: 1, y: 0 } : { x: 0, y: 0 };
                const mx = cx + along.x / 2, my = cy + along.y / 2;
                const lx = 0.86 + along.x, ly = 0.86 + along.y;
                const c = CAR_COLOURS[(x * 7 + y * 13 + carIndex++) % CAR_COLOURS.length]!;
                solid.push({ x: mx, y: base + SLAB + 0.3, z: my, sx: lx, sy: 0.6, sz: ly, c });
                solid.push({ x: mx, y: base + SLAB + 0.78, z: my, sx: lx * (along.x ? 0.55 : 0.8), sy: 0.36, sz: ly * (along.y ? 0.55 : 0.8), c: 0x22262c });
                break;
              }
              const c = PALETTE[skin];
              const h = skin === "fence" ? 0.5 : skin === "parapet" ? 0.45 : skin === "bench" ? 0.35 : skin === "grave" ? 0.6 : skin === "rubble" ? 0.35 : 0.5;
              const s = skin === "fence" || skin === "parapet" || skin === "altar" ? 1 : skin === "grave" ? 0.5 : skin === "sarcophagus" ? 0.85 : 0.8;
              solid.push({ x: cx, y: base + SLAB + h / 2, z: cy, sx: s, sy: h, sz: s, c });
              break;
            }
            case T.HIGH:
              if (skin === "tree") {
                solid.push({ x: cx, y: base + SLAB + 0.6, z: cy, sx: 0.22, sy: 1.2, sz: 0.22, c: 0x4a3626 });
                solid.push({ x: cx, y: base + SLAB + 1.7, z: cy, sx: 1.05, sy: 1.1, sz: 1.05, c: PALETTE.tree });
              } else solid.push({ x: cx, y: base + SLAB + 0.8, z: cy, sx: 0.85, sy: 1.6, sz: 0.85, c: PALETTE[skin] });
              break;
            case T.STAIRS: {
              // Four steps climbing toward whichever way leads to open floor above.
              const dir = this.stairDir(m, x, y, z);
              for (let i = 0; i < 4; i++) {
                const h = ((i + 1) / 4) * H;
                const off = -0.375 + i * 0.25;
                solid.push({ x: cx + dir.x * off, y: base + SLAB + h / 2, z: cy + dir.y * off, sx: dir.x ? 0.25 : 0.9, sy: h, sz: dir.y ? 0.25 : 0.9, c: PALETTE.wood });
              }
              break;
            }
          }
        }
      this.edgeBoxes(m, z, base, wallH, solid, glass);
    }
    this.world.add(this.instanced(solid, this.solidMat, true), this.instanced(glass, this.glassMat, false));
  }

  /** Walls, windows and doorways on the edges between tiles: thin boxes along the grid lines. */
  private edgeBoxes(m: BattleMap, z: number, base: number, wallH: number, solid: Box[], glass: Box[]) {
    const H = LEVEL_H;
    const full = wallH === H;
    const wallTop = full ? H - SLAB : wallH;
    const put = (kind: number, skin: Skin, cx: number, cy: number, along: "x" | "y") => {
      const c = PALETTE[skin === "none" ? "plaster" : skin];
      const box = (y0: number, h: number, colour: number, into: Box[], thin = WALL_T) => into.push({
        x: cx, y: base + SLAB + y0 + h / 2, z: cy,
        sx: along === "x" ? 1 + WALL_T : thin, sy: h, sz: along === "y" ? 1 + WALL_T : thin, c: colour,
      });
      if (kind === E.WALL) box(0, wallTop, c, solid);
      else if (kind === E.WINDOW) {
        const sill = 0.45, lintel = 0.2;
        box(0, sill, c, solid);
        if (full) {
          box(H - SLAB - lintel, lintel, c, solid);
          box(sill, H - SLAB - sill - lintel, 0, glass, WALL_T * 0.4);
        }
      } else if (kind === E.DOOR && full) box(H - SLAB - 0.2, 0.2, c, solid);
    };
    // West edges: x from 0 to w, between tile x − 1 and x.
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x <= m.w; x++) {
        const i = (z * m.h + y) * (m.w + 1) + x;
        const k = m.ew[i]!;
        if (k !== E.NONE) put(k, SKINS[m.ewSkin[i]!]!, x, y + 0.5, "y");
      }
    // North edges: y from 0 to h, between tile y − 1 and y.
    for (let y = 0; y <= m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = (z * (m.h + 1) + y) * m.w + x;
        const k = m.ns[i]!;
        if (k !== E.NONE) put(k, SKINS[m.nsSkin[i]!]!, x + 0.5, y, "x");
      }
  }

  private instanced(boxes: Box[], mat: THREE.Material, colours: boolean) {
    const mesh = new THREE.InstancedMesh(this.boxGeo, mat, Math.max(1, boxes.length));
    mesh.count = boxes.length;
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    boxes.forEach((b, i) => {
      mtx.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, mtx);
      if (colours) mesh.setColorAt(i, col.setHex(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = colours;
    mesh.receiveShadow = colours;
    return mesh;
  }

  private floorUnder(m: BattleMap, x: number, y: number, z: number): Skin {
    // A prop's floor: borrow a walkable neighbour's.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const t = tileAt(m, x + dx, y + dy, z);
      if (t === T.FLOOR || t === T.DOOR) return skinAt(m, x + dx, y + dy, z);
    }
    return m.setting === "urban" ? "pavement" : "grass";
  }

  private wallNear(m: BattleMap, x: number, y: number, z: number): Skin {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (tileAt(m, x + dx, y + dy, z) === T.WALL) return skinAt(m, x + dx, y + dy, z);
    return "brick";
  }

  private stairDir(m: BattleMap, x: number, y: number, z: number) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const up = tileAt(m, x + dx, y + dy, z + 1);
      const here = tileAt(m, x - dx, y - dy, z);
      if ((up === T.FLOOR || up === T.STAIRS) && (here === T.FLOOR || here === T.DOOR)) return { x: dx, y: dy };
    }
    return { x: 1, y: 0 };
  }

  // ----- Input -----

  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  /** The tile under the cursor: on the cut level, else the first level down with something there. */
  private pickTile(e: PointerEvent): Pt3 | null {
    const m = this.map;
    if (!m) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    for (let z = this.level; z >= 0; z--) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(z * LEVEL_H + SLAB));
      if (!this.ray.ray.intersectPlane(plane, hit)) continue;
      const x = Math.floor(hit.x), y = Math.floor(hit.z);
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      if (tileAt(m, x, y, z) !== T.VOID) return { x, y, z };
    }
    return null;
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pickTile(e);
    const same = p && this.hovered && p.x === this.hovered.x && p.y === this.hovered.y && p.z === this.hovered.z;
    if (same || (!p && !this.hovered)) return;
    this.hovered = p;
    this.hover.visible = !!p;
    if (p) this.hover.position.set(p.x + 0.5, p.z * LEVEL_H + SLAB + 0.03, p.y + 0.5);
    this.onHover?.(p);
  };

  private onDown = (e: PointerEvent) => {
    if (e.button === 0) this.down = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent) => {
    if (e.button !== 0 || !this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 5) return;
    const p = this.pickTile(e);
    if (p) this.onPick?.(p);
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const c = this.cameraKeys;
    const pan = { [c.forward]: "w", [c.back]: "s", [c.left]: "a", [c.right]: "d" }[e.code];
    if (pan) this.keys.add(pan);
    if (e.code === c.rotateLeft) this.turnCamera(-1);
    if (e.code === c.rotateRight) this.turnCamera(1);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const c = this.cameraKeys;
    const pan = { [c.forward]: "w", [c.back]: "s", [c.left]: "a", [c.right]: "d" }[e.code];
    if (pan) this.keys.delete(pan);
  };

  // ----- Loop -----

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // WASD pans on the ground, relative to where the camera faces.
    if (this.keys.size) {
      const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const v = new THREE.Vector3();
      if (this.keys.has("w")) v.add(fwd);
      if (this.keys.has("s")) v.sub(fwd);
      if (this.keys.has("d")) v.add(right);
      if (this.keys.has("a")) v.sub(right);
      v.multiplyScalar(dt * 18);
      this.controls.target.add(v);
      this.camera.position.add(v);
    }
    // Q / E: ease the camera round its target.
    if (Math.abs(this.turn) > 1e-3) {
      const step = this.turn * Math.min(1, dt * 8);
      this.turn -= step;
      const off = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      this.camera.position.copy(this.controls.target).add(off);
    }
    if (this.focusTo) {
      const d = this.focusTo.clone().sub(this.controls.target);
      const step = d.clone().multiplyScalar(Math.min(1, dt * 5));
      this.controls.target.add(step);
      this.camera.position.add(step);
      if (d.length() < 0.02) this.focusTo = null;
    }
    for (let i = this.anims.length - 1; i >= 0; i--) if (this.anims[i]!(dt)) this.anims.splice(i, 1);
    for (const m of [this.bluePath, this.yellowPath, this.ghosts.get(this.bluePath)!, this.ghosts.get(this.yellowPath)!]) m.uniforms.time!.value = now / 1000;
    for (const r of this.rotors) if (r.parent?.parent?.visible !== false && r.parent && (r.parent as THREE.Object3D).rotation.x === 0) r.rotation.y += dt * 9;
    if (this.fireGroup.children.length) {
      const t = now / 1000;
      for (const f of this.fireGroup.children) f.scale.y = 0.4 + 0.25 * Math.abs(Math.sin(t * 7 + f.userData.phase));
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}

