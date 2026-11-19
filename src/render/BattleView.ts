// The battlescape renderer (docs/WEB_PORT.md 3.11): crude on purpose. Every
// tile is drawn from boxes (one instanced mesh per material, one for
// glass); walls are thin boxes on the edges between tiles; units are boxes
// with a smaller box for the weapon. The camera orbits the map; levels above
// the one being looked at are cut away. Move ranges are two glowing outlines
// (blue: time left to attack; yellow: as far as the TU go), and the path is a
// glowing ribbon with its corners rounded (Chaikin).
//
// Controls (Wasteland 3 style, user 2026-11-17): left click picks (select,
// attack), right click commands (move), right-drag or WASD pans, middle-drag
// turns and tilts, Q / E turn 45°. The wheel steps the level up and down, a
// notch at a time (onLevelStep; the UI owns the level) and the camera's base plane follows
// the level shown. Zoom is fixed. No hovered-tile outline: the move
// projection the UI draws shows where a click goes. A seen enemy on a level cut away shows as a red pin with an
// up arrow over its spot on the level shown; clicking the pin picks the enemy.
// A seen enemy off the screen gets a red arrow on the screen's edge, pointing
// to it; clicking the arrow moves the camera there. The health bars over
// units' heads are HTML the UI draws (a layer it hands over, setHeadLayer);
// this places them over each unit every frame.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { E, LIGHT_RADIUS, SKINS, skinAt, T, tileAt, type BattleMap, type Pt3, type Skin, type Vehicle } from "../tactical/map";
import { chaikin, chaikinLoop, type V3 } from "../tactical/path";
import { addLight, emptyVolume, volumeTexture, type PointLight, type Volume } from "./lightVolume";
import { litByLamps, setVolume } from "./shaders/lamps";
import { makeMaterial, MATERIALS, surfaceFor, type MaterialKey } from "./shaders/materials";
import { roadMap, setRoadMap } from "./shaders/road";
import { DOOR_LINTEL, HIGH, KERB, LAMP_H, LEVEL_H, lowProp, SILL, SLAB, TILE, TREE, WALL_T, wc, WINDOW_LINTEL } from "./scale";
import { cornerGeometry, kerbPlan, roadTop, runBox, type KerbPlan } from "./kerbs";
import { vehicleBoxes } from "./vehicles";

// World units are metres (render/scale.ts). Lamps light the map through a
// baked light volume (render/lightVolume.ts): their light is worked out once,
// with shadows, and every surface and unit reads it.
/** Figures: torso height (the head sits on top: 1.78 m for an agent, 1.89 for a vampire). */
const TORSO = { human: 1.51, vampire: 1.62 };
/** Lamp light: warm street lamps, braziers and fire (linear colours). */
const LAMP_LIGHT = { street: new THREE.Color(1.0, 0.78, 0.5), brazier: new THREE.Color(1.0, 0.5, 0.18), fire: new THREE.Color(1.0, 0.45, 0.12) };
/** How high a body lying down is lifted (half the torso's width). */
const LYING_Y = 0.28;
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
        float pulse = mix(1.0, 0.6 + 0.4 * sin(vAlong * 3.3 - time * 7.0), flow);
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
  grave: 0x8a8a86, rock: 0x5a564e, sarcophagus: 0x7a7266, pillar: 0x8a8478, altar: 0x5a1e22, rubble: 0x6e665a, crypt: 0x3e3a36, truck: 0x5a6f8a,
};
/** A material that glows faintly in its own colour (units and loot, so they read at night). */
function glowing<M extends THREE.MeshStandardMaterial>(mat: M, colour: number, intensity: number): M {
  mat.emissive.setHex(colour);
  mat.emissiveIntensity = intensity;
  return mat;
}

const SKIN_INDEX = Object.fromEntries(SKINS.map((k, i) => [k, i])) as Record<Skin, number>;
/** Kerbstones: grey granite. */
const KERB_STONE = 0x8c8b86;

export interface UnitSpec {
  id: string;
  /** For the edge arrow's tooltip. */
  name?: string;
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
  /** Next to low cover: drawn crouched (the look only; it changes no rule). */
  crouched?: boolean;
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
  /** Where the bar over the head goes (an empty point, moved for a unit lying down). */
  head: THREE.Object3D;
  /** Hidden by playback (a death or torpor) until the next setUnits. */
  headHidden: boolean;
  spec: UnitSpec;
  /** The pin shown when it's a seen enemy above the level shown (enemies only). */
  above?: THREE.Sprite;
  /** The arrow on the screen's edge when it's a seen enemy off the screen. */
  edge?: HTMLElement;
}

/** The pin for an enemy above the level shown: red, with a white up arrow. */
function abovePinTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  // A map pin: a disc with a point at the bottom.
  x.beginPath();
  x.arc(64, 52, 40, Math.PI * 0.8, Math.PI * 2.2);
  x.lineTo(64, 122);
  x.closePath();
  x.fillStyle = "#d8282e";
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = "#1a0306";
  x.stroke();
  // The arrow.
  x.beginPath();
  x.moveTo(64, 22);
  x.lineTo(90, 52);
  x.lineTo(74, 52);
  x.lineTo(74, 78);
  x.lineTo(54, 78);
  x.lineTo(54, 52);
  x.lineTo(38, 52);
  x.closePath();
  x.fillStyle = "#fff4ec";
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SIDE_COLOURS: Record<UnitSpec["side"], number> = { agent: 0x8fb4e0, thrall: 0xc0784a, vampire: 0xc8243a, civilian: 0xc8c0a8, helicopter: 0x3a4a3e, hostage: 0xe8d890 };

/** One box to draw: centre, size, colour. */
interface Box { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number }

export class BattleView {
  onHover?: (p: Pt3 | null) => void;
  onPick?: (p: Pt3) => void;
  /** A right click (not a drag) on a tile: the command, i.e. move there. */
  onCommand?: (p: Pt3) => void;
  /** The wheel: +1 a level up, −1 down. */
  onLevelStep?: (dir: number) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  /** Holds the edge arrows, over the canvas. */
  private readonly edgeLayer = document.createElement("div");
  /** The hit chances along the aim lines (setAimLines), over the canvas. */
  private readonly aimLayer = document.createElement("div");
  private readonly aimGroup = new THREE.Group();
  private aimLabels: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  private readonly aimMat = new THREE.MeshBasicMaterial({ color: 0xd65050, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false });
  private readonly aimGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
  /** The UI's bars over units' heads: children with data-unit, placed every frame. */
  private headLayer: HTMLElement | null = null;
  private readonly world = new THREE.Group();
  private readonly unitGroup = new THREE.Group();
  private readonly lz: THREE.Mesh;
  private readonly boxGeo = new THREE.BoxGeometry(1, 1, 1);
  /** The scenery's materials (render/shaders/materials.ts), made as the map needs them. */
  private readonly mats = new Map<MaterialKey, THREE.MeshStandardMaterial>();
  private mat(key: MaterialKey) {
    return this.mats.get(key) ?? this.mats.set(key, makeMaterial(key)).get(key)!;
  }
  private roadTex: THREE.DataTexture | null = null;
  /** Ground tiles under a vehicle (index y·w + x), and the town's kerbs. */
  private vehicleTile = new Map<number, Vehicle>();
  private kerb: KerbPlan | null = null;
  /** Materials for one-off meshes (the kerb corners), coloured: key → material. */
  private solidMats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly glassMat = litByLamps(new THREE.MeshStandardMaterial({ color: 0x9cc4e0, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }));
  /** The baked lamp light: the lamps' share (redone when day or night changes), and the texture with fire added. */
  private lampLight: Volume | null = null;
  private lightTex: THREE.Data3DTexture | null = null;
  private lightDirty = false;
  /** Every burning tile, on any level (lights the map even where it isn't drawn). */
  private fires: Pt3[] = [];
  private readonly moon: THREE.DirectionalLight;
  private readonly sky = new THREE.HemisphereLight(0x9aa8c8, 0x3a3028, 0.9);
  private readonly fireGroup = new THREE.Group();
  private readonly lootGroup = new THREE.Group();
  /** Items on the ground (placeholder boxes, a few per tile). */
  private readonly floorGroup = new THREE.Group();
  private readonly itemMats = {
    weapon: glowing(makeMaterial("gunMetal", 0x8a8070), 0x2a2418, 0.5),
    other: glowing(makeMaterial("canvas", 0x6f8a5c), 0x1c2a14, 0.5),
  };
  private readonly aboveGroup = new THREE.Group();
  private readonly aboveMat = new THREE.SpriteMaterial({ map: abovePinTexture(), transparent: true, depthTest: false, depthWrite: false });
  private readonly crateMat = glowing(makeMaterial("modelWood", 0xc9a040), 0x6a4a10, 0.4);
  private readonly rotors: THREE.Object3D[] = [];
  private readonly lampGroup = new THREE.Group();
  private readonly fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  private readonly poleMat = makeMaterial("streetMetal", 0x2a2a2e);
  private night = true;
  private readonly units = new Map<string, UnitView>();
  private readonly anims: ((dt: number) => boolean)[] = [];
  private readonly quadGeo = new THREE.PlaneGeometry(0.94 * TILE, 0.94 * TILE).rotateX(-Math.PI / 2);
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
  /** The height the camera's base plane eases to: the floor of the level shown. */
  private baseY = 0;
  private wheelAcc = 0;
  private wheelAt = 0;
  private wheelStepAt = 0;
  private map: BattleMap | null = null;
  private level = 0;
  private frame = 0;
  private keys = new Set<string>();
  /** Camera keys, as KeyboardEvent.code (ui/keys.ts); the UI sets them. */
  cameraKeys = { forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD", rotateLeft: "KeyQ", rotateRight: "KeyE" };
  private turn = 0;
  private hovered: Pt3 | null = null;
  private down: { x: number; y: number; button: number } | null = null;
  private last = performance.now();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);
    this.edgeLayer.className = "battle-edges";
    container.appendChild(this.edgeLayer);
    this.aimLayer.className = "battle-aims";
    container.appendChild(this.aimLayer);

    this.scene.background = new THREE.Color(0x0c0e14);
    this.scene.fog = new THREE.Fog(0x0c0e14, 68, 165);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 105;
    this.controls.enableZoom = false; // the wheel changes level instead
    // Taking the camera by hand cancels a glide to a unit.
    this.controls.addEventListener("start", () => (this.focusTo = null));
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

    // Night, but readable: a cool sky, a moon that casts shadows, warm bounce.
    this.scene.add(this.sky);
    const moon = (this.moon = new THREE.DirectionalLight(0xc8d4f0, 0.8));
    moon.position.set(-45, 75, 30);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -60;
    moon.shadow.camera.right = 60;
    moon.shadow.camera.top = 60;
    moon.shadow.camera.bottom = -60;
    moon.shadow.camera.far = 250;
    moon.shadow.bias = -0.0008;
    this.scene.add(moon, moon.target);
    this.scene.add(this.world, this.unitGroup, this.fireGroup, this.lampGroup, this.lootGroup, this.floorGroup, this.rangeLines, this.aboveGroup, this.aimGroup);

    this.lz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x8fd39a, transparent: true, opacity: 0.22, depthWrite: false }));
    this.lz.rotation.x = -Math.PI / 2;
    this.scene.add(this.lz);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
    // Dev only: the view, for browser checks (lighting, camera).
    if (import.meta.env.DEV) (window as unknown as { battleView?: BattleView }).battleView = this;
  }

  // ----- Public API -----

  setMap(m: BattleMap) {
    this.map = m;
    this.level = m.levels - 1;
    this.lampLight = null;
    this.lightDirty = true;
    this.vehicleTile.clear();
    for (const v of m.vehicles ?? [])
      for (let dy = 0; dy < v.h; dy++) for (let dx = 0; dx < v.w; dx++) this.vehicleTile.set((v.y + dy) * m.w + v.x + dx, v);
    this.kerb = kerbPlan(m, (x, y) => this.vehicleTile.get(y * m.w + x)?.under ?? null);
    this.roadTex?.dispose();
    this.roadTex = roadMap(m, (x, y) => {
      // A rounded corner's tiles: asphalt without markings, under the curve.
      if (this.kerb!.cut[y * m.w + x]) return "plain";
      const k = this.floorSkin(m, x, y, m.ground);
      return k === "road" ? "road" : k === "tarmac" ? "plain" : null;
    });
    setRoadMap(this.roadTex);
    this.placeLamps(m);
    this.setFire([]);
    this.setLoot([]);
    this.setFloor([]);
    this.setUnits([]);
    this.setMoveRange([]);
    this.setPath(null);
    this.setAimLines(null);
    this.rebuild();
    // Look at the landing zone from the south-west, at a comfortable height.
    const c = m.lz[4] ?? m.lz[0]!;
    // Between the landing zone and the middle of the map, far enough back to see most of it.
    const target = this.tileCentre(c.x, c.y, m.ground).lerp(this.tileCentre(m.w / 2, m.h / 2, m.ground), 0.4);
    this.controls.target.copy(target);
    this.baseY = target.y;
    const back = new THREE.Vector3(m.w / 2 - c.x, 0, m.h / 2 - c.y).normalize().multiplyScalar(-1);
    if (!Number.isFinite(back.x)) back.set(-1, 0, 1).normalize();
    const span = m.w * TILE;
    this.camera.position.copy(target).add(back.multiplyScalar(span * 0.55)).add(new THREE.Vector3(0, span * 0.75, 0));
    this.moon.target.position.set(span / 2, 0, (m.h * TILE) / 2);
    this.moon.position.set(span / 2 - 45, 75, (m.h * TILE) / 2 + 30);
    this.lz.visible = true;
    this.lz.scale.set(3 * TILE, 3 * TILE, 1);
    this.lz.position.set(wc(c.x), m.ground * LEVEL_H + SLAB + 0.01, wc(c.y));
  }

  /** How far below the floor's usual height a spot is: a town road (the kerb), else 0. */
  private drop(p: { x: number; y: number; z: number }) {
    const m = this.map;
    if (!m || !this.kerb || Math.round(p.z) !== m.ground || Math.abs(p.z - m.ground) > 0.01) return 0;
    const x = Math.round(p.x), y = Math.round(p.y);
    return x >= 0 && y >= 0 && x < m.w && y < m.h && this.kerb.low[y * m.w + x] ? KERB : 0;
  }

  /** Show levels up to and including `z` (the cutaway). */
  setLevel(z: number) {
    if (!this.map) return;
    const next = Math.max(0, Math.min(this.map.levels - 1, z));
    if (next === this.level) return;
    this.level = next;
    this.baseY = next * LEVEL_H;
    this.rebuild();
    this.lz.visible = next >= this.map.ground;
    for (const v of this.units.values()) {
      v.group.visible = v.spec.visible !== false && v.spec.z <= next && !v.spec.gone;
      this.placeAbove(v, v.spec);
    }
    this.showLamps();
    this.hovered = null;
  }

  getLevel() {
    return this.level;
  }

  /**
   * Resolves once everything in the scene now has its shaders compiled
   * (in parallel where the browser can) and a few frames are drawn, the
   * lamp light baked among them: for the loading screen.
   */
  async whenDrawn() {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Not fatal: the first frame compiles whatever is left.
    }
    for (let i = 0; i < 3; i++) await new Promise((res) => requestAnimationFrame(res));
  }

  /** How many levels the map has (1 if none is loaded). */
  getMapLevels() {
    return this.map?.levels ?? 1;
  }

  /** Bring the units in line with the battle (positions, health, who's seen). Call after any playback. */
  setUnits(units: UnitSpec[]) {
    const keep = new Set(units.map((u) => u.id));
    for (const [id, v] of this.units)
      if (!keep.has(id)) {
        if (v.above) this.aboveGroup.remove(v.above);
        v.edge?.remove();
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
      v.body.position.y = lying ? LYING_Y : 0;
      v.body.scale.y = !lying && u.crouched ? 0.66 : 1;
      const crate = v.body.getObjectByName("crate");
      if (crate) crate.visible = !!u.carrying;
      // A wrecked helicopter: dark, and sunk on its skids.
      if (u.side === "helicopter") v.body.rotation.x = u.dead ? 0.25 : 0;
      // Lying down (torpor, or one of ours down): the label sits low.
      const lyingDown = (u.torpor ?? 0) > 0 || (u.bleeding ?? 0) > 0 || !!u.stable;
      if (u.side !== "helicopter") v.head.position.y = lyingDown ? 1.1 : (u.side === "vampire" ? TORSO.vampire : TORSO.human) * (u.crouched ? 0.66 : 1) + 0.6;
      v.headHidden = !!u.dead;
      this.placeAbove(v, u);
    }
  }

  /**
   * An enemy the team sees on a level cut away: a pin over its spot on the
   * level shown, so it isn't missed. `p` may be mid-move (z fractional).
   */
  private placeAbove(v: UnitView, p: { x: number; y: number; z: number }) {
    const u = v.spec;
    const show = (u.side === "thrall" || u.side === "vampire") && u.visible !== false && !u.dead && !u.gone && Math.ceil(p.z - 0.01) > this.level;
    if (!show) {
      if (v.above) v.above.visible = false;
      return;
    }
    if (!v.above) {
      v.above = new THREE.Sprite(this.aboveMat);
      v.above.scale.set(1.5, 1.5, 1);
      v.above.renderOrder = 11;
      v.above.userData.unit = u.id;
      this.aboveGroup.add(v.above);
    }
    v.above.visible = true;
    v.above.position.set(wc(p.x), this.level * LEVEL_H + SLAB + 2.2, wc(p.y));
  }

  private makeUnit(u: UnitSpec) {
    if (u.side === "helicopter") return this.makeHelicopter(u);
    const group = new THREE.Group();
    const body = new THREE.Group();
    const colour = SIDE_COLOURS[u.side];
    const tall = u.side === "vampire" ? TORSO.vampire : TORSO.human;
    // Clothes: canvas kit for agents, velvet for vampires, wool for everyone else; a plain head.
    const cloth: MaterialKey = u.side === "agent" ? "canvas" : u.side === "vampire" ? "velvet" : "wool";
    const mat = glowing(makeMaterial(cloth, colour), colour, u.side === "vampire" ? 0.25 : 0.08);
    const headMat = glowing(litByLamps(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 })), colour, u.side === "vampire" ? 0.25 : 0.08);
    const torso = new THREE.Mesh(this.boxGeo, mat);
    torso.scale.set(0.55, tall, 0.36);
    torso.position.y = tall / 2;
    const skull = new THREE.Mesh(this.boxGeo, headMat);
    skull.scale.set(0.25, 0.25, 0.25);
    skull.position.y = tall + 0.145;
    body.add(torso, skull);
    // A crate on the back, shown when carrying.
    const crate = new THREE.Mesh(this.boxGeo, this.crateMat);
    crate.scale.set(0.45, 0.45, 0.45);
    crate.position.set(-0.42, tall * 0.6, 0);
    crate.name = "crate";
    body.add(crate);
    if (u.side !== "civilian" && u.side !== "hostage") {
      // The weapon: a smaller box held out in front (claws for a vampire: two short ones).
      const gun = u.side === "vampire" ? litByLamps(new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.4 })) : makeMaterial("gunMetal", MATERIALS.gunMetal.colour);
      if (u.side === "vampire") {
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(this.boxGeo, gun);
          claw.scale.set(0.34, 0.08, 0.08);
          claw.position.set(0.4, tall * 0.55, side * 0.26);
          body.add(claw);
        }
      } else {
        const w = new THREE.Mesh(this.boxGeo, gun);
        w.scale.set(u.side === "agent" ? 0.8 : 0.6, 0.1, 0.1);
        w.position.set(0.45, tall * 0.62, 0.26);
        body.add(w);
      }
    }
    body.traverse((o) => (o.castShadow = true));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.63, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0xe8c987, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 4), new THREE.MeshBasicMaterial({ color: 0xff4a4a, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.03;
    const head = new THREE.Object3D();
    head.position.y = tall + 0.6;
    group.add(body, ring, mark, head);
    return { group, body, ring, mark, head, headHidden: false, spec: u };
  }

  /** The helicopter: a fuselage, a tail boom, skids and a rotor (it turns). */
  private makeHelicopter(u: UnitSpec) {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const hull = makeMaterial("vehicle", SIDE_COLOURS.helicopter);
    const dark = makeMaterial("gunMetal", 0x2a2d30);
    const add = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(this.boxGeo, m);
      b.scale.set(sx * TILE, sy * TILE, sz * TILE);
      b.position.set(x * TILE, y * TILE, z * TILE);
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.63, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0xe8c987, side: THREE.DoubleSide }));
    ring.visible = false;
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 4), new THREE.MeshBasicMaterial({ color: 0xff4a4a, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.03;
    const head = new THREE.Object3D();
    head.position.y = 2.25;
    group.add(body, ring, mark, head);
    this.rotors.push(rotor);
    return { group, body, ring, mark, head, headHidden: false, spec: u };
  }

  /** Loot crates lying on the map. */
  setLoot(items: Pt3[]) {
    for (const c of [...this.lootGroup.children]) this.lootGroup.remove(c);
    for (const p of items) {
      if (p.z > this.level) continue;
      const c = new THREE.Mesh(this.boxGeo, this.crateMat);
      c.scale.set(0.6, 0.48, 0.6);
      c.position.set(wc(p.x), p.z * LEVEL_H + SLAB + 0.24, wc(p.y));
      c.castShadow = true;
      this.lootGroup.add(c);
    }
  }

  /** Items lying on the ground: a small box each, long ones for weapons, a little stack where several lie. */
  setFloor(items: (Pt3 & { weapon: boolean })[]) {
    for (const c of [...this.floorGroup.children]) this.floorGroup.remove(c);
    const per = new Map<string, number>();
    for (const p of items) {
      if (p.z > this.level) continue;
      const k = `${p.x},${p.y},${p.z}`;
      const n = per.get(k) ?? 0;
      per.set(k, n + 1);
      if (n >= 4) continue;
      const c = new THREE.Mesh(this.boxGeo, p.weapon ? this.itemMats.weapon : this.itemMats.other);
      if (p.weapon) c.scale.set(0.8, 0.1, 0.2);
      else c.scale.set(0.27, 0.15, 0.27);
      c.position.set((p.x + 0.3 + (n % 2) * 0.4) * TILE, p.z * LEVEL_H + SLAB + 0.075 + Math.floor(n / 2) * 0.15, (p.y + 0.3 + (n % 2) * 0.4) * TILE);
      c.rotation.y = n * 0.9;
      c.castShadow = true;
      this.floorGroup.add(c);
    }
  }

  private placeUnit(g: THREE.Object3D, p: { x: number; y: number; z: number }, facing: number) {
    g.position.set(wc(p.x), p.z * LEVEL_H + SLAB - this.drop(p), wc(p.y));
    g.rotation.y = -facing;
  }

  // ----- Light, fire -----

  /** Night: moonlight, lamps lit. Day: sun and sky. */
  setDaylight(night: boolean) {
    if (night !== this.night) (this.lampLight = null), (this.lightDirty = true);
    this.night = night;
    this.sky.color.setHex(night ? 0x9aa8c8 : 0xcfe0ff);
    this.sky.groundColor.setHex(night ? 0x3a3028 : 0x6a5a48);
    this.sky.intensity = night ? 0.9 : 1.9;
    this.moon.color.setHex(night ? 0xc8d4f0 : 0xfff2dc);
    this.moon.intensity = night ? 0.8 : 2.6;
    const bg = night ? 0x0c0e14 : 0x6f8aa8;
    (this.scene.background as THREE.Color).setHex(bg);
    this.scene.fog!.color.setHex(bg);
    this.showLamps();
  }

  /** Lamp posts above ground, braziers below (their light is baked: lampLights). */
  private placeLamps(m: BattleMap) {
    for (const c of [...this.lampGroup.children]) this.lampGroup.remove(c);
    for (const l of m.lights) {
      const base = l.z * LEVEL_H + SLAB;
      // Underground, a brazier on a short stand; above ground, a lamp post.
      const under = l.z < m.ground;
      const h = under ? LAMP_H.brazier : LAMP_H.street;
      const pole = new THREE.Mesh(this.boxGeo, this.poleMat);
      pole.scale.set(under ? 0.24 : 0.12, h, under ? 0.24 : 0.12);
      pole.position.set(wc(l.x), base + h / 2, wc(l.y));
      const lamp = new THREE.Mesh(this.boxGeo, under ? this.fireMat : this.lampMat);
      lamp.scale.set(under ? 0.5 : 0.34, under ? 0.32 : 0.2, under ? 0.5 : 0.34);
      lamp.position.set(wc(l.x), base + h + 0.12, wc(l.y));
      for (const o of [pole, lamp]) o.userData.z = l.z;
      this.lampGroup.add(pole, lamp);
    }
    this.showLamps();
  }

  /** Lamps on levels shown. */
  private showLamps() {
    for (const c of this.lampGroup.children) c.visible = c.userData.z <= this.level;
  }

  /**
   * The lights that bake into the light volume: braziers always, street
   * lamps at night. Lit ground (the rules' LIGHT_RADIUS) is where the light
   * is strong; it fades out a tile beyond.
   */
  private lampLights(m: BattleMap): PointLight[] {
    const range = (LIGHT_RADIUS + 1) * TILE;
    return m.lights
      .filter((l) => l.z < m.ground || this.night)
      .map((l) => {
        const under = l.z < m.ground;
        return {
          x: wc(l.x), y: l.z * LEVEL_H + SLAB + (under ? LAMP_H.brazier + 0.16 : LAMP_H.street), z: wc(l.y),
          colour: under ? LAMP_LIGHT.brazier : LAMP_LIGHT.street, power: under ? 9 : 16, range,
        };
      });
  }

  /** Bakes what changed (the lamps once a map or the time of day; fire every time it changes) and uploads it. */
  private bakeLight() {
    this.lightDirty = false;
    const m = this.map;
    if (!m) return;
    if (!this.lampLight) {
      this.lampLight = emptyVolume(m);
      for (const L of this.lampLights(m)) addLight(m, this.lampLight, L);
    }
    let v = this.lampLight;
    if (this.fires.length) {
      v = { ...v, rgb: v.rgb.slice() };
      for (const f of this.fires)
        addLight(m, v, { x: wc(f.x), y: f.z * LEVEL_H + SLAB + 0.5, z: wc(f.y), colour: LAMP_LIGHT.fire, power: 5, range: 2.5 * TILE });
    }
    const same = this.lightTex && this.lightTex.image.width === v.nx && this.lightTex.image.height === v.nz && this.lightTex.image.depth === v.ny;
    if (!same) this.lightTex?.dispose();
    this.lightTex = volumeTexture(v, same ? this.lightTex! : undefined);
    setVolume(this.lightTex, m);
  }

  /** Burning tiles (index → turns left). */
  setFire(tiles: Pt3[]) {
    const key = (ts: Pt3[]) => ts.map((p) => `${p.x},${p.y},${p.z}`).sort().join(";");
    if (key(tiles) !== key(this.fires)) this.lightDirty = true;
    this.fires = tiles.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    for (const c of [...this.fireGroup.children]) this.fireGroup.remove(c);
    for (const p of tiles) {
      if (p.z > this.level) continue;
      const f = new THREE.Mesh(this.boxGeo, this.fireMat);
      f.scale.set(0.9 * TILE, 0.75, 0.9 * TILE);
      f.position.set(wc(p.x), p.z * LEVEL_H + SLAB + 0.4, wc(p.y));
      f.userData.phase = Math.random() * 6;
      this.fireGroup.add(f);
    }
  }

  /** The tiles burning now (as setFire was last given them). */
  private fireTiles(): Pt3[] {
    return this.fires;
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
      mtx.makeTranslation(wc(t.x), t.z * LEVEL_H + SLAB + 0.012, wc(t.y));
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
    const toWorld = (pts: V3[], y: number) => pts.map((p) => new THREE.Vector3(p.x * TILE, y, p.y * TILE));
    for (const [z, l] of levels) {
      const y = z * LEVEL_H + SLAB + 0.025;
      for (const loop of outlines(l.blue)) {
        const pts = chaikinLoop(insetLoop(loop, INSET), 2, ROUND);
        if (pts.length > 2) this.rangeLines.add(this.glow(ribbon(toWorld(pts, y), 0.5, true), this.blueGlow, 4));
      }
      for (const loop of outlines(l.all))
        for (const run of yellowRuns(loop, l.blue, INSET)) {
          const pts = run.closed ? chaikinLoop(run.pts, 2, ROUND) : chaikin(run.pts, 2, ROUND);
          if (pts.length >= 2) this.rangeLines.add(this.glow(ribbon(toWorld(pts, y), 0.5, run.closed), this.yellowGlow, 4));
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
    const world: V3[] = path.map((p) => ({ x: wc(p.x), y: p.z * LEVEL_H + lift, z: wc(p.y) }));
    const pts = chaikin(world, 4, 0.45).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const group = new THREE.Group();
    const line = this.glow(ribbon(pts, 0.45, false), dash ? this.yellowPath : this.bluePath, 6);
    // A glowing ring where it ends.
    const end = path.at(-1)!;
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < 32; k++) ring.push(new THREE.Vector3(wc(end.x) + Math.cos((k / 32) * Math.PI * 2) * 0.5, end.z * LEVEL_H + lift, wc(end.y) + Math.sin((k / 32) * Math.PI * 2) * 0.5));
    const mark = new THREE.Mesh(ribbon(ring, 0.24, true), dash ? this.endMarkMat.yellow : this.endMarkMat.blue);
    mark.renderOrder = 5;
    group.add(line, mark);
    this.pathLine = group;
    this.scene.add(group);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    cover.forEach((c, i) => {
      if (!c) return;
      const [dx, dy] = dirs[i]!;
      const s = new THREE.Mesh(this.boxGeo, c === 2 ? this.fullShieldMat : this.halfShieldMat);
      const h = c === 2 ? 1.05 : 0.6;
      s.scale.set(dx ? 0.08 : 0.9, h, dy ? 0.08 : 0.9);
      s.position.set(wc(end.x) + dx * 0.42 * TILE, end.z * LEVEL_H + SLAB + h / 2, wc(end.y) + dy * 0.42 * TILE);
      s.renderOrder = 3;
      this.shields.push(s);
      this.scene.add(s);
    });
  }

  /**
   * Aim lines (Wasteland 3): from a tile the player is about to move to, a
   * red line to each enemy that could be shot from there, with the chance
   * to hit at its middle. Null or no targets clears them.
   */
  setAimLines(from: Pt3 | null, targets: { at: Pt3; chance: number }[] = []) {
    this.aimGroup.clear();
    for (const l of this.aimLabels) l.el.remove();
    this.aimLabels = [];
    if (!from || !targets.length) return;
    const chest = (p: Pt3) => new THREE.Vector3(wc(p.x), p.z * LEVEL_H + SLAB + 1.3, wc(p.y));
    const a = chest(from);
    for (const t of targets) {
      const b = chest(t.at);
      const len = a.distanceTo(b);
      const rod = new THREE.Mesh(this.aimGeo, this.aimMat);
      rod.scale.set(1, len, 1);
      rod.position.copy(a).add(b).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      rod.renderOrder = 9;
      this.aimGroup.add(rod);
      const el = document.createElement("div");
      el.className = "battle-aim";
      el.textContent = `${t.chance}%`;
      this.aimLayer.appendChild(el);
      this.aimLabels.push({ el, at: a.clone().lerp(b, 0.5) });
    }
  }

  private placeAimLabels() {
    if (!this.aimLabels.length) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const p = new THREE.Vector3();
    for (const { el, at } of this.aimLabels) {
      const behind = at.clone().applyMatrix4(this.camera.matrixWorldInverse).z > 0;
      p.copy(at).project(this.camera);
      el.style.visibility = behind ? "hidden" : "";
      el.style.transform = `translate(${((p.x + 1) * w / 2).toFixed(1)}px, ${((1 - p.y) * h / 2).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  /** Where a unit is drawn now (tiles; mid-move, rounded) and whether the team sees it, or null. */
  unitShownAt(id: string): (Pt3 & { seen: boolean }) | null {
    const v = this.units.get(id);
    if (!v || v.spec.gone) return null;
    const p = v.group.position;
    return { x: Math.round(p.x / TILE - 0.5), y: Math.round(p.z / TILE - 0.5), z: Math.max(0, Math.round((p.y - SLAB) / LEVEL_H)), seen: v.spec.visible !== false };
  }

  /** Smoothly centre the camera on a tile (across; its height follows the level shown). */
  focus(p: Pt3) {
    this.focusTo = new THREE.Vector3(wc(p.x), 0, wc(p.y));
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
    const from = { x: v.group.position.x / TILE - 0.5, y: v.group.position.z / TILE - 0.5, z: Math.round((v.group.position.y - SLAB) / LEVEL_H) };
    // In metres, so a stair climb takes its time.
    const legs: V3[] = [from, ...path].map((p) => ({ x: p.x * TILE, y: p.y * TILE, z: p.z * LEVEL_H }));
    const pts = chaikin(legs, 4, 0.45);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y, pts[i]!.z - pts[i - 1]!.z));
    const total = cum.at(-1)!;
    let d = 0, seg = 0;
    const speed = 7 * TILE; // metres a second (7 tiles)
    this.focus(path.at(-1)!);
    return this.animate((dt) => {
      d = Math.min(total, d + dt * speed);
      while (seg < pts.length - 2 && cum[seg + 1]! < d) seg++;
      const a = pts[seg]!, b = pts[seg + 1] ?? a;
      const span = cum[seg + 1]! - cum[seg]! || 1;
      const f = Math.min(1, Math.max(0, (d - cum[seg]!) / span));
      const p = { x: (a.x + (b.x - a.x) * f) / TILE, y: (a.y + (b.y - a.y) * f) / TILE, z: (a.z + (b.z - a.z) * f) / LEVEL_H };
      const facing = b.x !== a.x || b.y !== a.y ? Math.atan2(b.y - a.y, b.x - a.x) : -v.group.rotation.y;
      this.placeUnit(v.group, p, facing);
      v.group.visible = Math.ceil(p.z - 0.01) <= this.level;
      this.placeAbove(v, p);
      return d >= total;
    });
  }

  private async animateShot(e: Extract<BattleEventLike, { kind: "shot" }>) {
    const s = this.units.get(e.unit), t = this.units.get(e.target);
    if (!s || !t) return;
    s.group.visible = s.group.visible || true;
    const a = s.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const b = t.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    s.group.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    if (!e.hit) b.add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.2) * 1.2, (Math.random() - 0.5) * 2.4));
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
    v.headHidden = true;
    if (v.body.rotation.z > 1) return void (await this.wait(500)); // already lying: finished where it fell
    if (v.spec.side === "helicopter") {
      this.setFire([...this.fireTiles(), { x: v.spec.x, y: v.spec.y, z: v.spec.z }]);
      v.body.rotation.x = 0.25;
      return void (await this.wait(700));
    }
    let t = 0;
    await this.animate((dt) => {
      t = Math.min(1, t + dt * 3);
      v.body.rotation.z = (t * Math.PI) / 2;
      v.body.position.y = t * LYING_Y;
      return t >= 1;
    });
    await this.wait(200);
  }

  /** An incendiary: an arc from the thrower, then the ground goes up. */
  private async animateThrow(id: string, at: Pt3, tiles: Pt3[]) {
    const v = this.units.get(id);
    const to = new THREE.Vector3(wc(at.x), at.z * LEVEL_H + SLAB + 0.3, wc(at.y));
    const from = v ? v.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : to.clone();
    const ball = new THREE.Mesh(this.boxGeo, this.lampMat);
    ball.scale.setScalar(0.2);
    this.scene.add(ball);
    let t = 0;
    await this.animate((dt) => {
      t = Math.min(1, t + dt * 1.6);
      ball.position.lerpVectors(from, to, t);
      ball.position.y += Math.sin(t * Math.PI) * 3.75;
      return t >= 1;
    });
    this.scene.remove(ball);
    this.setFire([...this.fireTiles(), ...tiles]);
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
    sprite.scale.set(4.8, 0.9, 1);
    sprite.position.copy(at).add(new THREE.Vector3(0, 2.6, 0));
    sprite.renderOrder = 11;
    this.scene.add(sprite);
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      sprite.position.y += dt * 0.75;
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
    this.lightTex?.dispose();
    setVolume(null, null);
    this.roadTex?.dispose();
    setRoadMap(null);
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.glassMat.dispose();
    this.setMoveRange([]);
    this.setPath(null);
    this.setAimLines(null);
    for (const m of this.ghosts.values()) m.dispose();
    for (const m of [this.rangeMat, this.blueGlow, this.yellowGlow, this.bluePath, this.yellowPath, this.endMarkMat.blue, this.endMarkMat.yellow, this.halfShieldMat, this.fullShieldMat]) m.dispose();
    this.aboveMat.map?.dispose();
    this.aboveMat.dispose();
    this.quadGeo.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.edgeLayer.remove();
    this.aimLayer.remove();
    this.aimGeo.dispose();
    this.aimMat.dispose();
  }

  // ----- Building the scene -----

  private tileCentre(x: number, y: number, z: number) {
    return new THREE.Vector3(wc(x), z * LEVEL_H, wc(y));
  }

  private clearWorld() {
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
      else if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
  }

  /** A one-off mesh (not instanced) in a catalogue material of its own colour. */
  private solid(geo: THREE.BufferGeometry, key: MaterialKey, colour: number) {
    const id = `${key}:${colour}`;
    const mat = this.solidMats.get(id) ?? this.solidMats.set(id, makeMaterial(key, colour)).get(id)!;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  private rebuild() {
    const m = this.map;
    if (!m) return;
    this.clearWorld();
    const glass: Box[] = [];
    // Boxes by material (render/shaders/materials.ts): one instanced mesh each.
    const buckets = new Map<MaterialKey, Box[]>();
    const to = (key: MaterialKey) => buckets.get(key) ?? buckets.set(key, []).get(key)!;
    const floorOf = (skin: Skin) => to(surfaceFor(skin, "floor"));
    const wallOf = (skin: Skin) => to(surfaceFor(skin, "wall"));
    const propOf = (skin: Skin) => to(surfaceFor(skin, "prop"));
    const H = LEVEL_H;
    for (let z = 0; z <= this.level; z++) {
      const base = z * H;
      const top = z === this.level; // walls on the cut level are drawn short, to see in
      const wallH = top && z < m.levels - 1 && this.level < m.levels - 1 ? H * 0.55 : H;
      // Each tile's floor colour (−1: no slab), and its tile-wide prop (fence, parapet), merged into big boxes below.
      const floor = new Int32Array(m.w * m.h).fill(-1);
      const wide = new Int32Array(m.w * m.h).fill(-1);
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const t = tileAt(m, x, y, z);
          if (t === T.VOID) continue;
          const skin = skinAt(m, x, y, z);
          const cx = wc(x), cy = wc(y);
          const below = tileAt(m, x, y, z - 1);
          // The floor slab (none over a stairwell, so the stairs come up through it).
          if (below !== T.STAIRS) floor[y * m.w + x] = SKIN_INDEX[this.floorSkin(m, x, y, z)];
          switch (t) {
            case T.WALL:
              // Full walls stop just under the next floor's slab (no z-fighting with the roof).
              wallOf(skin).push({ x: cx, y: base + SLAB + (wallH === H ? H - SLAB : wallH) / 2, z: cy, sx: TILE, sy: wallH === H ? H - SLAB : wallH, sz: TILE, c: PALETTE[skin] });
              break;
            case T.WINDOW: {
              const near = this.wallNear(m, x, y, z), wall = PALETTE[near];
              const sill = SILL;
              wallOf(near).push({ x: cx, y: base + SLAB + sill / 2, z: cy, sx: TILE, sy: sill, sz: TILE, c: wall });
              if (wallH === H) {
                const lintel = WINDOW_LINTEL;
                wallOf(near).push({ x: cx, y: base + H - lintel / 2, z: cy, sx: TILE, sy: lintel, sz: TILE, c: wall });
                glass.push({ x: cx, y: base + SLAB + sill + (H - SLAB - sill - lintel) / 2, z: cy, sx: TILE - 0.03, sy: H - SLAB - sill - lintel, sz: TILE - 0.03, c: 0 });
              }
              break;
            }
            case T.DOOR:
              if (wallH === H) wallOf(this.wallNear(m, x, y, z)).push({ x: cx, y: base + H - DOOR_LINTEL / 2, z: cy, sx: TILE, sy: DOOR_LINTEL, sz: TILE, c: PALETTE[this.wallNear(m, x, y, z)] });
              break;
            case T.LOW: {
              if (skin === "car") break; // vehicles are drawn whole, below
              const c = PALETTE[skin];
              const { h, s } = lowProp(skin);
              if (s >= TILE) {
                wide[y * m.w + x] = SKIN_INDEX[skin];
                break;
              }
              propOf(skin).push({ x: cx, y: base + SLAB + h / 2, z: cy, sx: s, sy: h, sz: s, c });
              break;
            }
            case T.HIGH:
              if (skin === "truck") break;
              if (skin === "tree") {
                to("bark").push({ x: cx, y: base + SLAB + TREE.trunkH / 2, z: cy, sx: TREE.trunk, sy: TREE.trunkH, sz: TREE.trunk, c: 0x4a3626 });
                const ch = TREE.canopyY1 - TREE.canopyY0;
                propOf("tree").push({ x: cx, y: base + SLAB + TREE.canopyY0 + ch / 2, z: cy, sx: TREE.canopy, sy: ch, sz: TREE.canopy, c: PALETTE.tree });
              } else propOf(skin).push({ x: cx, y: base + SLAB + HIGH.h / 2, z: cy, sx: HIGH.s, sy: HIGH.h, sz: HIGH.s, c: PALETTE[skin] });
              break;
            case T.STAIRS: {
              // Four steps climbing toward whichever way leads to open floor above.
              const dir = this.stairDir(m, x, y, z);
              for (let i = 0; i < 4; i++) {
                const h = ((i + 1) / 4) * H;
                const off = (-0.375 + i * 0.25) * TILE;
                propOf("wood").push({ x: cx + dir.x * off, y: base + SLAB + h / 2, z: cy + dir.y * off, sx: (dir.x ? 0.25 : 0.9) * TILE, sy: h, sz: (dir.y ? 0.25 : 0.9) * TILE, c: PALETTE.wood });
              }
              break;
            }
          }
        }
      this.merge(m, floor, (x0, y0, w, h, k) => {
        const skin = SKINS[k]!;
        // Town roads sit a kerb's height down.
        const drop = z === m.ground && skin === "road" && m.setting === "urban" ? KERB : 0;
        floorOf(skin).push({ x: (x0 + w / 2) * TILE, y: base + SLAB / 2 - drop, z: (y0 + h / 2) * TILE, sx: w * TILE, sy: SLAB, sz: h * TILE, c: PALETTE[skin] });
      });
      if (z === m.ground && this.kerb) {
        for (const k of this.kerb.runs) to("coping").push({ ...runBox(k, base), c: KERB_STONE });
        for (const c of this.kerb.corners) {
          const g = cornerGeometry(c, base);
          this.world.add(this.solid(g.pavement, "pavement", PALETTE.pavement), this.solid(g.kerb, "coping", KERB_STONE));
        }
      }
      for (const v of m.vehicles ?? []) {
        if (v.z !== z) continue;
        const floorY = this.kerb?.low[v.y * m.w + v.x] && z === m.ground ? roadTop(base) : base + SLAB;
        for (const b of vehicleBoxes(v, floorY)) to(b.key).push(b);
      }
      this.merge(m, wide, (x0, y0, w, h, k) => {
        const skin = SKINS[k]!, ph = lowProp(skin).h;
        propOf(skin).push({ x: (x0 + w / 2) * TILE, y: base + SLAB + ph / 2, z: (y0 + h / 2) * TILE, sx: w * TILE, sy: ph, sz: h * TILE, c: PALETTE[skin] });
      });
      this.edgeBoxes(m, z, base, wallH, wallOf, glass);
    }
    for (const [key, boxes] of buckets) this.world.add(this.instanced(boxes, this.mat(key), true));
    this.world.add(this.instanced(glass, this.glassMat, false));
  }

  /**
   * Tiles of one kind (−1: none) as few rectangles as it takes (greedy), so a
   * floor or a fence is one surface with no seams between its tiles.
   */
  private merge(m: BattleMap, floor: Int32Array, emit: (x: number, y: number, w: number, h: number, key: number) => void) {
    const done = new Uint8Array(floor.length);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x, c = floor[i]!;
        if (c < 0 || done[i]) continue;
        let w = 1;
        while (x + w < m.w && floor[i + w] === c && !done[i + w]) w++;
        let h = 1;
        grow: while (y + h < m.h) {
          for (let k = 0; k < w; k++) {
            const j = (y + h) * m.w + x + k;
            if (floor[j] !== c || done[j]) break grow;
          }
          h++;
        }
        for (let dy = 0; dy < h; dy++) done.fill(1, (y + dy) * m.w + x, (y + dy) * m.w + x + w);
        emit(x, y, w, h, c);
      }
  }

  /** Walls, windows and doorways on the edges between tiles: thin boxes along the grid lines. */
  private edgeBoxes(m: BattleMap, z: number, base: number, wallH: number, into: (skin: Skin) => Box[], glass: Box[]) {
    const H = LEVEL_H;
    const full = wallH === H;
    const wallTop = full ? H - SLAB : wallH;
    const colour = (skin: Skin) => PALETTE[skin === "none" ? "plaster" : skin];
    /** A box on a grid line: centred at (cx, cy), `len` metres along it. */
    const box = (cx: number, cy: number, along: "x" | "y", len: number, y0: number, h: number, c: number, into: Box[], thin = WALL_T) => into.push({
      x: cx, y: base + SLAB + y0 + h / 2, z: cy,
      sx: along === "x" ? len : thin, sy: h, sz: along === "y" ? len : thin, c,
    });
    /** A window or doorway: one tile long, flush with the walls either side. */
    const opening = (kind: number, skin: Skin, cx: number, cy: number, along: "x" | "y") => {
      const c = colour(skin), solid = into(skin);
      if (kind === E.WINDOW) {
        box(cx, cy, along, TILE, 0, SILL, c, solid);
        if (full) {
          box(cx, cy, along, TILE, H - SLAB - WINDOW_LINTEL, WINDOW_LINTEL, c, solid);
          box(cx, cy, along, TILE, SILL, H - SLAB - SILL - WINDOW_LINTEL, 0, glass, WALL_T * 0.4);
        }
      } else if (kind === E.DOOR && full) box(cx, cy, along, TILE, H - SLAB - DOOR_LINTEL, DOOR_LINTEL, c, solid);
    };
    /**
     * One grid line: plain walls in runs of one skin become one box each
     * (half a wall's thickness past each end, to close the corners);
     * openings are drawn tile by tile.
     */
    const line = (n: number, edge: (k: number) => { kind: number; skin: Skin }, at: (k: number) => [number, number], along: "x" | "y") => {
      for (let k = 0; k < n; ) {
        const e = edge(k);
        if (e.kind !== E.WALL) {
          if (e.kind !== E.NONE) opening(e.kind, e.skin, ...at(k), along);
          k++;
          continue;
        }
        let j = k + 1;
        while (j < n && edge(j).kind === E.WALL && edge(j).skin === e.skin) j++;
        const [ax, ay] = at(k), [bx, by] = at(j - 1);
        box((ax + bx) / 2, (ay + by) / 2, along, (j - k) * TILE + WALL_T, 0, wallTop, colour(e.skin), into(e.skin));
        k = j;
      }
    };
    // West edges, down each grid line x (between tile x − 1 and x).
    for (let x = 0; x <= m.w; x++) {
      const i = (y: number) => (z * m.h + y) * (m.w + 1) + x;
      line(m.h, (y) => ({ kind: m.ew[i(y)]!, skin: SKINS[m.ewSkin[i(y)]!]! }), (y) => [x * TILE, wc(y)], "y");
    }
    // North edges, along each grid line y (between tile y − 1 and y).
    for (let y = 0; y <= m.h; y++) {
      const i = (x: number) => (z * (m.h + 1) + y) * m.w + x;
      line(m.w, (x) => ({ kind: m.ns[i(x)]!, skin: SKINS[m.nsSkin[i(x)]!]! }), (x) => [wc(x), y * TILE], "x");
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

  /** What a tile's floor is made of (a prop's: borrowed from a neighbour). */
  private floorSkin(m: BattleMap, x: number, y: number, z: number): Skin {
    if (z === m.ground) {
      const v = this.vehicleTile.get(y * m.w + x);
      if (v) return v.under;
      if (this.kerb?.cut[y * m.w + x]) return "road";
    }
    const t = tileAt(m, x, y, z);
    return t === T.FLOOR || t === T.DOOR || t === T.STAIRS ? skinAt(m, x, y, z) : this.floorUnder(m, x, y, z);
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
    // A pin for an enemy above picks that enemy, where it really is.
    const pins = this.aboveGroup.children.filter((o) => o.visible);
    const pin = pins.length ? this.ray.intersectObjects(pins, false)[0] : undefined;
    const pinned = pin && this.units.get(pin.object.userData.unit as string)?.spec;
    if (pinned) return { x: pinned.x, y: pinned.y, z: pinned.z };
    const hit = new THREE.Vector3();
    for (let z = this.level; z >= 0; z--) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(z * LEVEL_H + SLAB));
      if (!this.ray.ray.intersectPlane(plane, hit)) continue;
      const x = Math.floor(hit.x / TILE), y = Math.floor(hit.z / TILE);
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
    this.onHover?.(p);
  };

  private onDown = (e: PointerEvent) => {
    if (e.button === 0 || e.button === 2) this.down = { x: e.clientX, y: e.clientY, button: e.button };
  };

  /** A click is a press and release that barely moved; a right-drag pans instead. */
  private onUp = (e: PointerEvent) => {
    const d = this.down;
    if (!d || e.button !== d.button) return;
    this.down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const p = this.pickTile(e);
    if (!p) return;
    if (e.button === 0) this.onPick?.(p);
    else this.onCommand?.(p);
  };

  /**
   * One level a notch. A mouse notch steps at once, however small its delta
   * (macOS sends a slow notch as a few pixels). A trackpad's stream of small
   * deltas steps on its first event, then once per ~120 px with a pause
   * between steps, so a swipe or its inertia doesn't race through the levels.
   */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (Math.abs(dy) < 0.5 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const now = performance.now();
    const fresh = now - this.wheelAt > 180; // a new gesture or a new notch after a pause
    this.wheelAt = now;
    if (fresh || Math.sign(dy) !== Math.sign(this.wheelAcc)) this.wheelAcc = 0;
    this.wheelAcc += dy;
    const big = Math.abs(dy) >= 50; // a mouse wheel notch, even spun fast
    if (!fresh && !(big && now - this.wheelStepAt > 70) && (Math.abs(this.wheelAcc) < 120 || now - this.wheelStepAt < 220)) return;
    this.onLevelStep?.(dy < 0 ? 1 : -1);
    this.wheelAcc = 0;
    this.wheelStepAt = now;
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

  /**
   * Seen enemies off the screen: an arrow on the edge (inset a little), on the
   * line from the screen's centre towards the enemy, pointing at it.
   */
  private placeEdges() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const inset = 30;
    const p = new THREE.Vector3();
    for (const v of this.units.values()) {
      const u = v.spec;
      const enemy = (u.side === "thrall" || u.side === "vampire") && u.visible !== false && !u.dead && !u.gone;
      if (!enemy) {
        if (v.edge) v.edge.hidden = true;
        continue;
      }
      p.copy(v.group.position).add(new THREE.Vector3(0, 1.0, 0));
      const behind = p.clone().applyMatrix4(this.camera.matrixWorldInverse).z > 0;
      p.project(this.camera);
      let dx = p.x, dy = -p.y;
      if (behind) { dx = -dx; dy = -dy; }
      if (!behind && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        if (v.edge) v.edge.hidden = true;
        continue;
      }
      if (!v.edge) {
        const el = document.createElement("button");
        el.className = `battle-edge${u.side === "vampire" ? " vampire" : ""}`;
        el.addEventListener("click", () => this.focus(v.spec));
        this.edgeLayer.appendChild(el);
        v.edge = el;
      }
      v.edge.hidden = false;
      v.edge.dataset.tip = `${u.name ?? (u.side === "vampire" ? "Vampire" : "Thrall")}, off screen. Click to look.`;
      // From the centre, in pixels, out to the inset rectangle.
      const sx = dx * (w / 2), sy = dy * (h / 2);
      const hx = w / 2 - inset, hy = h / 2 - inset;
      const t = Math.min(hx / Math.max(1e-6, Math.abs(sx)), hy / Math.max(1e-6, Math.abs(sy)));
      const x = w / 2 + sx * t, y = h / 2 + sy * t;
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
  private placeHeads() {
    const layer = this.headLayer;
    if (!layer) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const p = new THREE.Vector3();
    for (const el of layer.children as HTMLCollectionOf<HTMLElement>) {
      const v = this.units.get(el.dataset.unit ?? "");
      const pinned = !!v?.above?.visible;
      let show = !!v && !v.headHidden && !v.spec.gone && (v.group.visible || pinned);
      if (show) {
        if (pinned) p.copy(v!.above!.position).add(new THREE.Vector3(0, 0.8, 0));
        else v!.head.getWorldPosition(p);
        const behind = p.clone().applyMatrix4(this.camera.matrixWorldInverse).z > 0;
        p.project(this.camera);
        show = !behind && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.1;
      }
      if (!show) {
        if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "";
      el.style.transform = `translate(${((p.x + 1) * w / 2).toFixed(1)}px, ${((1 - p.y) * h / 2).toFixed(1)}px)`;
    }
  }

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
      this.focusTo = null;
      const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const v = new THREE.Vector3();
      if (this.keys.has("w")) v.add(fwd);
      if (this.keys.has("s")) v.sub(fwd);
      if (this.keys.has("d")) v.add(right);
      if (this.keys.has("a")) v.sub(right);
      v.multiplyScalar(dt * 27);
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
    // The base plane eases to the level shown.
    const dy = this.baseY - this.controls.target.y;
    if (Math.abs(dy) > 1e-3) {
      const step = dy * Math.min(1, dt * 8);
      this.controls.target.y += step;
      this.camera.position.y += step;
    }
    if (this.focusTo) {
      const d = this.focusTo.clone().setY(this.controls.target.y).sub(this.controls.target);
      const step = d.clone().multiplyScalar(Math.min(1, dt * 5));
      this.controls.target.add(step);
      this.camera.position.add(step);
      if (d.length() < 0.03) this.focusTo = null;
    }
    for (let i = this.anims.length - 1; i >= 0; i--) if (this.anims[i]!(dt)) this.anims.splice(i, 1);
    for (const m of [this.bluePath, this.yellowPath, this.ghosts.get(this.bluePath)!, this.ghosts.get(this.yellowPath)!]) m.uniforms.time!.value = now / 1000;
    for (const r of this.rotors) if (r.parent?.parent?.visible !== false && r.parent && (r.parent as THREE.Object3D).rotation.x === 0) r.rotation.y += dt * 9;
    if (this.fireGroup.children.length) {
      const t = now / 1000;
      for (const f of this.fireGroup.children) f.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 7 + f.userData.phase));
    }
    if (this.lightDirty) this.bakeLight();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.placeEdges();
    this.placeHeads();
    this.placeAimLabels();
  };
}

