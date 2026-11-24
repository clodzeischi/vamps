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
import { sfx, type Loop, type SoundId } from "../audio/sfx";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DECOR_AT, E, edgeOpen, furnitureAnchor, furnitureCover, furnitureSize, furnitureSkin, indoors, isTown, LIGHT_RADIUS, SKINS, skinAt, T, tileAt, type BattleMap, type Flight, type Furniture, type Pt3, type Sign, type Skin, type Vehicle } from "../tactical/map";
import { chaikin, chaikinLoop, type V3 } from "../tactical/path";
import { WEAPONS, type WeaponId } from "../tactical/rules";
import { addLight, emptyVolume, volumeTexture, type PointLight, type Volume } from "./lightVolume";
import { litByLamps, setVolume } from "./shaders/lamps";
import { makeMaterial, MATERIALS, surfaceFor, type MaterialKey } from "./shaders/materials";
import { rainMap, setRainFrame, setRainMap, setRainReflection } from "./shaders/rain";
import { setSnowMap, snowMap } from "./shaders/snow";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { roadMap, setRoadMap } from "./shaders/road";
import { DOOR_LINTEL, HIGH, HIGH_PROP, KERB, LAMP_H, LEVEL_H, lowProp, SILL, SLAB, TILE, TREE, WALL_T, wc, WINDOW_LINTEL } from "./scale";
import { cornerGeometry, kerbPlan, roadTop, runBox, type KerbPlan } from "./kerbs";
import { vehicleBoxes, vehicleModel, vehiclePaint } from "./vehicles";
import { cornerTurn, facing, hasModel, loadModels, loadProps, place, PropBatch, propMesh, propsReady, type PropName } from "./props";
import { pieceParts } from "../tactical/pieces";

// World units are metres (render/scale.ts). Lamps light the map through a
// baked light volume (render/lightVolume.ts): their light is worked out once,
// with shadows, and every surface and unit reads it.
/** Figures: torso height (the head sits on top: 1.78 m for an agent, 1.89 for a vampire). */
const TORSO = { human: 1.51, vampire: 1.62 };
/** Lamp light: warm street lamps, braziers and fire (linear colours). */
const LAMP_LIGHT = { street: new THREE.Color(1.0, 0.78, 0.5), ceiling: new THREE.Color(0.85, 0.92, 1.0), brazier: new THREE.Color(1.0, 0.5, 0.18), fire: new THREE.Color(1.0, 0.45, 0.12) };
/** How high a body lying down is lifted (half the torso's width). */
const LYING_Y = 0.28;
/** Doors: painted wood. */
const DOOR_COLOUR = 0x5a3a26;
/** A door leaf's hinge: the inner face of the door frame's jamb, from the doorway's centre (the door_frame model). */
const DOOR_HINGE = 0.7;
/** A deterministic scramble of a tile's coordinates, for choosing among looks. */
const hash = (a: number, b: number, c: number) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;
/** How far a street lamp's head reaches out from its post (the street_lamp model). */
/** Drizzle: how fast it falls (m/s), each streak's length, and the wind's lean. */
const RAIN_SPEED = 7.5, RAIN_STREAK = 0.32, RAIN_SLANT = { x: 0.12, z: 0.05 };
const STREET_LAMP_REACH = 1.0;
const BLUE = 0x4aa8ff, YELLOW = 0xffc23a, RED = 0xff4a3a;

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
  bed: 0xc8ccd0, shelf: 0x9aa0a6, counter: 0x5a4a3c, fridge: 0xd8dcde, pump: 0xc83a2c, rack: 0x3c5c8a,
  tile: 0xb8bcb8, concrete: 0x8a8a86, metal: 0x6e7a80, clinic: 0xd4d8d4, sofa: 0x4a5a3c, tv: 0x2a2624,
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

interface Edge extends Pt3 { dx: number; dy: number }
/** A point in metres (the rules' ballistics frame is the view's: x east, y up, z south). */
interface M3 { x: number; y: number; z: number }

/**
 * Each gun's sound: a round (`shot`), a machine gun's whole burst (`burst`,
 * played once when the burst runs its full length), and the time between
 * rounds of a burst (seconds; the burst recordings' own rate of fire).
 * The SMG fires pistol rounds. The M110's round is the M249 recording's single shot.
 */
const GUN_SOUND: Partial<Record<WeaponId, { shot: SoundId; burst?: SoundId; every: number }>> = {
  pistol: { shot: "shot-pistol", every: 0.1 },
  "pistol-sd": { shot: "shot-pistol-sd", every: 0.1 },
  smg: { shot: "shot-pistol", every: 0.075 },
  rifle: { shot: "shot-rifle", every: 0.11 },
  "rifle-sd": { shot: "shot-rifle-sd", every: 0.11 },
  shotgun: { shot: "shot-shotgun-pump", every: 1 },
  "shotgun-semi": { shot: "shot-shotgun-semi", every: 0.3 },
  // Machine guns fire single rounds only in reaction; the M249 borrows the M240B's round.
  m249: { shot: "shot-m240b", burst: "burst-m249", every: 0.088 },
  m240b: { shot: "shot-m240b", burst: "burst-m240b", every: 0.097 },
  m110: { shot: "shot-m110", every: 0.3 },
  rpg: { shot: "rocket-launch", every: 1 },
};
/** Blows that land: a knife's stab (one of several at random) or claws tearing; a miss swishes (lower for claws). A body falling thuds (animateDeath). */
const BLOW_SOUND: Partial<Record<WeaponId, SoundId[]>> = { knife: ["knife-1", "knife-2", "knife-3", "knife-4"], claws: ["claws"] };
/** Gunfire out of sight: heard, further off. */
const UNSEEN_GAIN = 0.35;

/** The battle events the view plays (tactical/battle.ts BattleEvent, structurally). */
export type BattleEventLike =
  | { kind: "move"; unit: string; path: Pt3[]; seen: boolean }
  | { kind: "shot"; unit: string; weapon: WeaponId; target?: string; from: M3; aim: M3; rays: M3[]; hits: { unit: string; damage: number; crit: boolean }[]; reaction: boolean; melee: boolean; seen: boolean; lean?: Pt3; burst?: boolean }
  | { kind: "death"; unit: string; text?: string }
  | { kind: "torpor"; unit: string; seen: boolean }
  | { kind: "burn"; unit: string; damage: number; why: "fire" | "sun"; seen: boolean }
  | { kind: "throw"; unit: string; at: Pt3; tiles: Pt3[]; lean?: Pt3 }
  | { kind: "status"; unit: string; text: string; seen: boolean; cue?: "reload" }
  /** An edge from tile (x, y) one step (dx, dy ≥ 0): a door opened, glass shattered. */
  | { kind: "door"; unit: string; at: Edge; seen: boolean }
  | { kind: "glass"; panes: Edge[]; from: Pt3 }
  | { kind: "blast"; unit: string; at: Pt3; tiles: Pt3[]; seen: boolean }
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
/** An upright box; `rx`/`rz` tilt it about x or z (radians), e.g. a handrail along a flight. */
interface Box { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number; rx?: number; rz?: number }

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
  /** The aim lines (setAimLines): red glow ribbons with pulses running to the target, seen through walls. */
  private readonly aimGroup = new THREE.Group();
  private readonly aimMat = Object.assign(glowMaterial(RED, true), { depthTest: false });
  /** The CEP rings (setCep): over the walls, so a target behind cover still shows its circle. */
  private readonly cepGroup = new THREE.Group();
  private readonly cepMat = {
    enemy: {
      solid: new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      faint: new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    },
    force: {
      solid: new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      faint: new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    },
  };
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
  private snowTex: THREE.DataTexture | null = null;
  private rainTex: THREE.DataTexture | null = null;
  /** Drizzle on a wet map (null: dry): streaks falling. */
  private rainfall: THREE.LineSegments | null = null;
  /** The street mirrored in its puddles (a rain map's; never in the scene, rendered by hand before each frame). */
  private mirror: Reflector | null = null;
  private readonly mirrorMat = new THREE.Matrix4();
  /** Falling snow on a winter map (null: none). */
  private snowfall: THREE.Points | null = null;
  /** Ground tiles under a vehicle (index y·w + x), and the town's kerbs. */
  private vehicleTile = new Map<number, Vehicle>();
  /** The camera has been placed for a map (setMap's keepView leaves it then). */
  private viewSet = false;
  /** The landing zone's marker is wanted (the block editor hides it). */
  private lzShown = true;
  /** Tiles (by level) under a piece of furniture: drawn whole, not tile by tile. */
  private furnitureTile = new Set<number>();
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
  /** The rotor's sound, while one turns: louder as the camera comes in. */
  private rotorSound: Loop | null = null;
  /** Plays the setting's wildlife (off in the block editor's preview). */
  ambient = false;
  /** The ambience playing, by layer (wildlife, traffic, weather). */
  private ambience = new Map<string, { id: SoundId; gain: number; loop: Loop }>();
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
    this.scene.add(this.world, this.unitGroup, this.fireGroup, this.lampGroup, this.lootGroup, this.floorGroup, this.rangeLines, this.aboveGroup, this.aimGroup, this.cepGroup);

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
    // The prop kit loads once; until it's in, the level is drawn in boxes.
    void loadProps().then(() => {
      if (this.disposed || !this.map) return;
      this.placeLamps(this.map);
      this.rebuild();
    });
  }

  private disposed = false;

  // ----- Public API -----

  /** Shows or hides the landing zone's marker (the block editor has none). */
  showLandingZone(on: boolean) {
    this.lzShown = on;
    this.lz.visible = on;
  }

  /** Shows a map. `keepView`: leave the camera where it is (an editor redrawing the same map). */
  setMap(m: BattleMap, keepView = false) {
    this.map = m;
    this.shownEw = m.ew.slice();
    this.shownNs = m.ns.slice();
    this.level = m.levels - 1;
    this.lampLight = null;
    this.lightDirty = true;
    this.vehicleTile.clear();
    for (const v of m.vehicles ?? [])
      for (let dy = 0; dy < v.h; dy++) for (let dx = 0; dx < v.w; dx++) this.vehicleTile.set((v.y + dy) * m.w + v.x + dx, v);
    this.furnitureTile.clear();
    for (const f of m.furniture ?? [])
      for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) this.furnitureTile.add(((f.z * m.h) + f.y + dy) * m.w + f.x + dx);
    // Pieces' models load the first time a map uses them; the level is redrawn when they're in.
    // (A vehicle's wreck too: it may burn out mid-battle.)
    const want = [
      ...(m.furniture ?? []).flatMap((f) => pieceParts(f.kind).map(([name]) => name)),
      ...(m.vehicles ?? []).flatMap((v) => {
        const model = vehicleModel({ ...v, wrecked: false });
        return model ? [model, `${model}_wreck`] : [];
      }),
    ].filter((n) => !hasModel(n));
    if (want.length)
      void loadModels(want).then(() => {
        if (!this.disposed && this.map === m) this.rebuild();
      });
    // What lies under a vehicle, or a prop standing in a car park or a road (not raised on a kerb of its own).
    const under = (x: number, y: number) => this.vehicleTile.get(y * m.w + x)?.under ?? this.lotUnder(m, x, y);
    this.kerb = kerbPlan(m, under);
    this.roadTex?.dispose();
    const bays = new Map((m.bayLines ?? []).map((b) => [b.y * m.w + b.x, b.alongX ? "bayX" as const : "bayZ" as const]));
    this.roadTex = roadMap(m, (x, y) => {
      // A rounded corner's tiles: asphalt without markings, under the curve.
      if (this.kerb!.cut[y * m.w + x]) return "plain";
      const k = this.floorSkin(m, x, y, m.ground);
      return k === "road" ? "road" : k === "tarmac" ? bays.get(y * m.w + x) ?? "plain" : null;
    });
    setRoadMap(this.roadTex);
    this.snowTex?.dispose();
    this.snowTex = m.winter ? snowMap(m, under) : null;
    setSnowMap(this.snowTex);
    this.makeSnowfall(m);
    this.rainTex?.dispose();
    this.rainTex = m.rain ? rainMap(m, under) : null;
    setRainMap(this.rainTex);
    this.makeRain(m);
    this.setDaylight(this.night);
    this.placeLamps(m);
    this.setFire([]);
    this.setLoot([]);
    this.setFloor([]);
    this.setUnits([]);
    this.setMoveRange([]);
    this.setPath(null);
    this.setAimLines(null);
    this.rebuild();
    if (keepView && this.viewSet) return;
    this.viewSet = true;
    // Look at the landing zone from the south-west, at a comfortable height.
    const c = m.lz[4] ?? m.lz[0]!;
    // Between the landing zone and the middle of the map, far enough back to see most of it.
    const target = this.tileCentre(c.x, c.y, c.z).lerp(this.tileCentre(m.w / 2, m.h / 2, c.z), 0.4);
    this.controls.target.copy(target);
    this.baseY = target.y;
    const back = new THREE.Vector3(m.w / 2 - c.x, 0, m.h / 2 - c.y).normalize().multiplyScalar(-1);
    if (!Number.isFinite(back.x)) back.set(-1, 0, 1).normalize();
    const span = m.w * TILE;
    // (A small map, a block in the editor: from as far as a battle's, so it all shows.)
    const view = Math.max(span, 45);
    // 20% closer in than it first was.
    this.camera.position.copy(target).add(back.multiplyScalar(view * 0.55 * 0.8)).add(new THREE.Vector3(0, view * 0.75 * 0.8, 0));
    this.moon.target.position.set(span / 2, 0, (m.h * TILE) / 2);
    this.moon.position.set(span / 2 - 45, 75, (m.h * TILE) / 2 + 30);
    this.lz.visible = this.lzShown;
    this.lz.scale.set(3 * TILE, 3 * TILE, 1);
    this.lz.position.set(wc(c.x), c.z * LEVEL_H + SLAB + 0.01, wc(c.y));
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
    this.lz.visible = this.lzShown && next >= this.map.ground;
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

  /** Night: moonlight, lamps lit. Day: sun and sky. Winter: overcast, the snow lighting it from below. */
  setDaylight(night: boolean) {
    if (night !== this.night) (this.lampLight = null), (this.lightDirty = true);
    this.night = night;
    const winter = !!this.map?.winter, rain = !!this.map?.rain;
    this.setAmbience();
    this.sky.color.setHex(night ? 0x9aa8c8 : winter ? 0xdfe6f0 : rain ? 0xbcc4cc : 0xcfe0ff);
    this.sky.groundColor.setHex(night ? (winter ? 0x4a5060 : 0x3a3028) : winter ? 0x9aa0a8 : rain ? 0x4e5256 : 0x6a5a48);
    this.sky.intensity = night ? (rain ? 0.75 : 0.9) : winter ? 2.2 : rain ? 1.9 : 1.9;
    this.moon.color.setHex(night ? 0xc8d4f0 : winter ? 0xf0f2f8 : rain ? 0xe4e8ee : 0xfff2dc);
    this.moon.intensity = night ? (rain ? 0.45 : 0.8) : winter ? 1.5 : rain ? 1.0 : 2.6;
    const bg = night ? (winter ? 0x14171e : rain ? 0x101317 : 0x0c0e14) : winter ? 0x9aa3ae : rain ? 0x7a828c : 0x6f8aa8;
    (this.scene.background as THREE.Color).setHex(bg);
    setRainFrame(0, new THREE.Color(bg).multiplyScalar(night ? 1.6 : 1));
    this.scene.fog!.color.setHex(bg);
    this.showLamps();
  }

  /** Lamp posts above ground, braziers below (their light is baked: lampLights). */
  private placeLamps(m: BattleMap) {
    for (const c of [...this.lampGroup.children]) this.lampGroup.remove(c);
    for (const l of m.lights) {
      const base = l.z * LEVEL_H + SLAB;
      if (l.ceiling) {
        // A fitting: a flat panel under the ceiling (or a canopy), no post.
        const panel = new THREE.Mesh(this.boxGeo, this.lampMat);
        panel.scale.set(0.9, 0.06, 0.3);
        panel.position.set(wc(l.x), base + (l.h ?? LEVEL_H - SLAB - 0.08), wc(l.y));
        panel.userData.z = l.z;
        this.lampGroup.add(panel);
        continue;
      }
      if (l.wall) {
        // Over a door: a bracket lantern on the wall face above the doorway.
        const model = propMesh("wall_lamp");
        if (model) {
          const [dx, dy] = l.wall;
          model.position.set(wc(l.x) + (dx * TILE) / 2, l.z * LEVEL_H + SLAB, wc(l.y) + (dy * TILE) / 2);
          model.rotation.y = facing(-dx, -dy);
          model.userData.z = l.z;
          this.lampGroup.add(model);
          continue;
        }
        const p = this.wallLamp(l);
        const lamp = new THREE.Mesh(this.boxGeo, this.lampMat);
        lamp.scale.set(l.wall[0] ? 0.16 : 0.3, 0.22, l.wall[1] ? 0.16 : 0.3);
        lamp.position.copy(p);
        const arm = new THREE.Mesh(this.boxGeo, this.poleMat);
        arm.scale.set(l.wall[0] ? 0.2 : 0.06, 0.06, l.wall[1] ? 0.2 : 0.06);
        arm.position.set(p.x + l.wall[0] * 0.1, p.y + 0.14, p.z + l.wall[1] * 0.1);
        for (const o of [lamp, arm]) o.userData.z = l.z;
        this.lampGroup.add(lamp, arm);
        continue;
      }
      // Underground, a brazier on a short stand; above ground, a lamp post.
      const under = l.z < m.ground;
      const model = under ? null : propMesh("street_lamp");
      if (model) {
        // The post on the tile, its head reaching out over the road.
        const d = this.lampReach(m, l);
        model.position.set(wc(l.x), base, wc(l.y));
        model.rotation.y = facing(d.x, d.y);
        model.userData.z = l.z;
        this.lampGroup.add(model);
        continue;
      }
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

  /**
   * Which way a street lamp's head reaches (a unit step on the grid): over a
   * road beside it if there is one, else over open ground.
   */
  private lampReach(m: BattleMap, l: Pt3): { x: number; y: number } {
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const open = (dx: number, dy: number) => tileAt(m, l.x + dx, l.y + dy, l.z) === T.FLOOR;
    const road = dirs.find(([dx, dy]) => open(dx, dy) && ["road", "tarmac"].includes(this.floorSkin(m, l.x + dx, l.y + dy, l.z)));
    const [x, y] = road ?? dirs.find(([dx, dy]) => open(dx, dy)) ?? dirs[0];
    return { x, y };
  }

  /** Where a wall lamp hangs: on the wall face toward its tile, above the doorway. */
  private wallLamp(l: { x: number; y: number; z: number; wall?: readonly [number, number] }) {
    const [dx, dy] = l.wall!;
    const d = TILE / 2 - WALL_T / 2 - 0.1;
    return new THREE.Vector3(wc(l.x) + dx * d, l.z * LEVEL_H + SLAB + LEVEL_H - SLAB - DOOR_LINTEL + 0.2, wc(l.y) + dy * d);
  }

  /** Lamps on levels shown. */
  private showLamps() {
    for (const c of this.lampGroup.children) c.visible = c.userData.z <= this.level;
  }

  /**
   * The lights that bake into the light volume: braziers and ceiling
   * fittings (shops, offices, corridors are lit by day too) always, street
   * lamps at night. Lit ground (the rules' LIGHT_RADIUS) is where the light
   * is strong; it fades out a tile beyond.
   */
  private lampLights(m: BattleMap): PointLight[] {
    const range = (LIGHT_RADIUS + 1) * TILE;
    return m.lights
      .filter((l) => l.ceiling || l.z < m.ground || this.night)
      .map((l) => {
        const under = l.z < m.ground && !l.ceiling;
        if (l.ceiling)
          return { x: wc(l.x), y: l.z * LEVEL_H + SLAB + (l.h ?? LEVEL_H - SLAB - 0.08) - 0.12, z: wc(l.y), colour: LAMP_LIGHT.ceiling, power: 11, range };
        if (l.wall) {
          // Just out from the wall, under the lamp (off the wall's own face, so the bake sees past it).
          const p = this.wallLamp(l);
          return { x: p.x - l.wall[0] * 0.15, y: p.y - 0.2, z: p.z - l.wall[1] * 0.15, colour: LAMP_LIGHT.street, power: 10, range };
        }
        // A street lamp's head is a metre out from its post (render/props.ts, street_lamp).
        const d = under ? { x: 0, y: 0 } : this.lampReach(m, l);
        return {
          x: wc(l.x) + d.x * STREET_LAMP_REACH, y: l.z * LEVEL_H + SLAB + (under ? LAMP_H.brazier + 0.16 : LAMP_H.street), z: wc(l.y) + d.y * STREET_LAMP_REACH,
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

  /** Redraws the level if fire on these tiles has burnt out a vehicle (the rules mark it wrecked). */
  private redrawWrecks(tiles: readonly Pt3[]) {
    const hit = (this.map?.vehicles ?? []).some((v) => v.wrecked && tiles.some((q) => q.z === v.z && q.x >= v.x && q.y >= v.y && q.x < v.x + v.w && q.y < v.y + v.h));
    if (hit) this.rebuild();
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
      const line = new THREE.Mesh(ribbon(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)), 0.7, false), this.aimMat);
      line.renderOrder = 9;
      this.aimGroup.add(line);
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
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (e.kind === "shot") {
        // A burst's rounds come one after another, with what each did between them: fire them all, then play that.
        const rounds = [e];
        const between: BattleEventLike[] = [];
        if (e.burst)
          for (let j = i + 1; j < events.length; j++) {
            const n = events[j]!;
            if (n.kind === "shot" ? !(n.burst && n.unit === e.unit) : n.kind === "move" || n.kind === "throw" || n.kind === "turn" || n.kind === "end") break;
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
      else if (e.kind === "torpor" && e.seen) await this.animateDeath(e.unit, this.units.get(e.unit)?.spec.side === "agent" ? undefined : "Torpor");
      else if (e.kind === "burn" && e.seen) {
        const v = this.units.get(e.unit);
        if (v) this.popup(v.group.position, `${e.why === "sun" ? "Sun" : "Fire"} −${e.damage}`, "#ffa040");
        await this.wait(450);
      } else if (e.kind === "throw") await this.animateThrow(e.unit, e.at, e.tiles, e.lean);
      else if (e.kind === "door") {
        this.showEdges([e.at], E.DOOR);
        if (e.seen) await this.wait(250);
      } else if (e.kind === "blast") {
        // The rocket goes off: the bang, and the ground round it alight.
        const at = new THREE.Vector3(wc(e.at.x), e.at.z * LEVEL_H + SLAB + 0.5, wc(e.at.y));
        this.soundAt("explosion-rocket", at, { gain: e.seen ? 1.4 : 1.4 * UNSEEN_GAIN, rate: 1 + (Math.random() - 0.5) * 0.06 });
        this.setFire([...this.fireTiles(), ...e.tiles]);
        this.redrawWrecks(e.tiles);
        for (const h of this.blastHits) {
          const v = this.units.get(h.unit);
          if (v) this.popup(v.group.position, `−${h.damage}`, "#ff6a5a");
        }
        this.blastHits = [];
        if (e.seen) await this.wait(450);
      } else if (e.kind === "glass") {
        const windows = e.panes.map((c) => this.shownEdge(c) === E.WINDOW);
        e.panes.forEach((c, i) => this.shards(c, e.from, windows[i]!));
        this.showEdges(e.panes.filter((_, i) => windows[i]), E.SILL);
        this.showEdges(e.panes.filter((_, i) => !windows[i]), E.NONE);
      } else if (e.kind === "status" && e.seen) {
        if (e.cue === "reload") this.soundAt("reload", this.units.get(e.unit)?.group.position);
        const v = this.units.get(e.unit);
        if (v && v.group.visible) this.popup(v.group.position, e.text, "#e8c987");
        await this.wait(350);
      }
    }
  }

  /**
   * The edges as drawn: the map's as they were when it was set, changed as
   * the playback reaches each door opened or pane shattered (the rules have
   * already changed the map itself).
   */
  private shownEw = new Uint8Array(0);
  private shownNs = new Uint8Array(0);

  /** Index of an edge (dx, dy ≥ 0) in shownEw or shownNs. */
  private edgeIndex(c: Edge) {
    const m = this.map!;
    return c.dx ? (c.z * m.h + c.y) * (m.w + 1) + c.x + 1 : (c.z * (m.h + 1) + c.y + 1) * m.w + c.x;
  }

  private shownEdge(c: Edge) {
    return (c.dx ? this.shownEw : this.shownNs)[this.edgeIndex(c)]!;
  }

  private showEdges(edges: Edge[], kind: number) {
    if (!this.map || !edges.length) return;
    for (const c of edges) (c.dx ? this.shownEw : this.shownNs)[this.edgeIndex(c)] = kind;
    this.rebuild();
  }

  /**
   * Glass bursting out of a shattered pane, struck from `from` (tiles; a
   * shooter's tile, a fire's centre): the bits fly on the way the blow went,
   * through and out the far side, fanning a little, and fall, skitter along
   * the floor and fade. A window's glass only fills the frame above its sill.
   */
  private shards(c: Edge, from: Pt3, window: boolean) {
    const at = new THREE.Vector3((c.x + 0.5 + c.dx / 2) * TILE, c.z * LEVEL_H + SLAB, (c.y + 0.5 + c.dy / 2) * TILE);
    // The way the blow went: from the source to the pane, flattened; straight through if they're level with it.
    const src = new THREE.Vector3(wc(from.x), 0, wc(from.y));
    const dir = new THREE.Vector3(at.x - src.x, 0, at.z - src.z);
    const normal = new THREE.Vector3(c.dx, 0, c.dy);
    if (dir.dot(normal) < 0) normal.negate();
    dir.lengthSq() < 0.01 ? dir.copy(normal) : dir.normalize();
    // Never along the pane: lean it out through the far side.
    dir.addScaledVector(normal, 0.6).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const lo = window ? SILL : 0.1, hi = LEVEL_H - SLAB - (window ? WINDOW_LINTEL : 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.85, depthWrite: false });
    const n = window ? 16 : 22;
    const bits = Array.from({ length: n }, () => {
      const b = new THREE.Mesh(this.boxGeo, mat);
      const big = 0.05 + Math.random() * 0.12;
      b.scale.set(big, 0.015, big * (0.5 + Math.random()));
      const along = (Math.random() - 0.5) * (TILE - 0.2);
      b.position.set(at.x + (c.dy ? along : 0), at.y + lo + Math.random() * (hi - lo), at.z + (c.dx ? along : 0));
      const speed = 2.2 + Math.random() * 3.2;
      b.userData.v = dir.clone().multiplyScalar(speed).addScaledVector(side, (Math.random() - 0.5) * 2.2).setY(0.3 + Math.random() * 1.6);
      b.userData.spin = new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
      b.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.scene.add(b);
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
      for (const b of bits) this.scene.remove(b);
      mat.dispose();
      return true;
    });
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
    // A flight (foot to head, 3 or more tiles apart): flat to its bottom step, up it, flat off the top.
    const way: V3[] = [];
    let last: V3 = from;
    for (const p of path) {
      const dx = p.x - last.x, dy = p.y - last.y, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (p.z !== last.z && d >= 3) {
        const ux = Math.sign(dx), uy = Math.sign(dy);
        way.push({ x: last.x + ux * 0.5, y: last.y + uy * 0.5, z: last.z }, { x: p.x - ux * 0.5, y: p.y - uy * 0.5, z: p.z });
      }
      way.push(p);
      last = p;
    }
    const legs: V3[] = [from, ...way].map((p) => ({ x: p.x * TILE, y: p.y * TILE, z: p.z * LEVEL_H }));
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

  /**
   * A shot: the shooter (leaning out first if it must) turns to the aim, and a
   * tracer streaks from the muzzle to where each round really ended (a
   * shotgun: a spray of them). Who was hit gets the damage over their head;
   * a target nobody hit, "Miss".
   */
  /** Where a sound comes from, as heard from the camera: louder close in (full within 22 m), and left or right. */
  private soundAt(id: SoundId, at: THREE.Vector3 | undefined, o: { gain?: number; rate?: number; delay?: number } = {}) {
    if (!at) return;
    const to = this.tmpV.subVectors(at, this.camera.position);
    const d = Math.max(1, to.length());
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    sfx.playAt(id, { ...o, gain: (o.gain ?? 1) * Math.min(1, 22 / d), pan: 0.8 * to.normalize().dot(right) });
  }

  /** The sound of rounds fired (one, or a burst's), starting `delay` seconds from now. Returns how long they take. */
  private gunfire(rounds: Extract<BattleEventLike, { kind: "shot" }>[], at: THREE.Vector3 | undefined, gain = 1): number {
    const w = rounds[0]!.weapon, gun = GUN_SOUND[w];
    if (rounds[0]!.melee) return this.blow(rounds[0]!, at, gain);
    if (!gun) return 0;
    const pitch = () => 1 + (Math.random() - 0.5) * 0.08;
    // A machine gun's full burst is its own recording; a burst cut short, or any other gun, a round at a time.
    if (gun.burst && rounds.length === WEAPONS[w].burst && rounds.length > 1) {
      this.soundAt(gun.burst, at, { gain, rate: pitch() });
      return Math.max(sfx.duration(gun.burst) * 0.5, gun.every * rounds.length);
    }
    rounds.forEach((_, k) => this.soundAt(gun.shot, at, { gain, rate: pitch(), delay: k * gun.every }));
    return gun.every * rounds.length;
  }

  /** A blow's sound: where it lands if it lands, a swish from the striker if not. Returns how long it takes. */
  private blow(e: Extract<BattleEventLike, { kind: "shot" }>, at: THREE.Vector3 | undefined, gain: number): number {
    const sounds = BLOW_SOUND[e.weapon];
    if (!sounds) return 0;
    const pitch = 1 + (Math.random() - 0.5) * 0.1;
    const struck = e.hits.length ? this.units.get(e.hits[0]!.unit)?.group.position : undefined;
    if (struck) {
      const id = sounds[Math.floor(Math.random() * sounds.length)]!;
      this.soundAt(id, struck, { gain, rate: pitch });
      return sfx.duration(id);
    }
    this.soundAt("swish", at, { gain, rate: pitch * (e.weapon === "claws" ? 0.8 : 1) });
    return sfx.duration("swish");
  }

  /** Shots fired out of sight: heard, not seen. */
  private async hearShots(rounds: Extract<BattleEventLike, { kind: "shot" }>[]) {
    const s = this.units.get(rounds[0]!.unit);
    const at = s ? s.group.position.clone() : undefined;
    const took = this.gunfire(rounds, at, UNSEEN_GAIN);
    if (took) await this.wait(Math.min(900, took * 1000 + 250));
  }

  /** One shot, or a burst's rounds: lean out once, the tracers at the gun's rate of fire, then what each did. */
  private async animateShots(rounds: Extract<BattleEventLike, { kind: "shot" }>[]) {
    const e = rounds[0]!;
    const s = this.units.get(e.unit);
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
      const rocket = new THREE.Mesh(this.boxGeo, this.lampMat);
      rocket.scale.set(0.12, 0.12, 0.12);
      this.scene.add(rocket);
      const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, a]), new THREE.LineBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.8 }));
      this.scene.add(trail);
      const len = a.distanceTo(end);
      let flown = 0;
      await this.animate((dt) => {
        flown = Math.min(len, flown + dt * 45);
        const at = a.clone().lerp(end, len ? flown / len : 1);
        rocket.position.copy(at);
        trail.geometry.setFromPoints([a.clone().lerp(end, Math.max(0, flown - 3) / (len || 1)), at]);
        return flown >= len;
      });
      this.scene.remove(rocket, trail);
      trail.geometry.dispose();
      (trail.material as THREE.Material).dispose();
      // What it did shows when it goes off (the blast event next).
      this.blastHits = e.hits;
      await back();
      return;
    }
    const FADE = 0.35;
    const live: { lines: THREE.Line[]; life: number }[] = [];
    let t = 0, next = 0;
    const shown = new Set<number>();
    const popups = (r: (typeof rounds)[number]) => {
      for (const h of r.hits) {
        const v = this.units.get(h.unit);
        if (v) this.popup(v.group.position, h.crit ? `Critical −${h.damage}` : `−${h.damage}`, h.crit ? "#ffd04a" : "#ff6a5a");
      }
      const tg = r.target ? this.units.get(r.target) : undefined;
      if (tg && !r.hits.some((h) => h.unit === r.target)) this.popup(tg.group.position, "Miss", "#c8c0a8");
    };
    await this.animate((dt) => {
      t += dt;
      // Each round's tracers when its time comes.
      while (next < rounds.length && t >= next * every) {
        const r = rounds[next]!;
        const colour = r.melee ? 0xffffff : r.reaction ? 0xffb050 : 0xfff0c0;
        const lines = r.rays.map((ray) => {
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, new THREE.Vector3(ray.x, ray.y, ray.z)]), new THREE.LineBasicMaterial({ color: colour, transparent: true }));
          this.scene.add(l);
          return l;
        });
        live.push({ lines, life: FADE });
        next++;
      }
      for (const [k, g] of live.entries()) {
        g.life -= dt;
        for (const l of g.lines) (l.material as THREE.LineBasicMaterial).opacity = Math.max(0, g.life / FADE);
        // A single shot's hits show once its tracer has faded (as before); a burst's as each round lands.
        if (!shown.has(k) && (rounds.length > 1 ? g.life < FADE - 0.05 : g.life <= 0)) shown.add(k), popups(rounds[k]!);
      }
      return next >= rounds.length && live.every((g) => g.life <= 0);
    });
    for (const g of live)
      for (const l of g.lines) {
        this.scene.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    await Promise.all([this.wait(450), back()]);
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
      const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, radius - width), radius + width, 64), faint ? mat.faint : mat.solid);
      m.renderOrder = 10;
      return m;
    };
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), mat.solid);
    dot.renderOrder = 10;
    for (const m of [ring(r, 0.045, false), ring(2 * r, 0.03, true), dot]) {
      m.position.set(c.at.x, c.at.y, c.at.z);
      m.quaternion.copy(this.camera.quaternion);
      this.cepGroup.add(m);
    }
  }

  /**
   * Leaning out of cover to shoot or throw: the figure slides most of the way
   * toward the lean tile. Returns the step back in, to await after.
   */
  private async leanOut(v: UnitView, lean?: Pt3): Promise<() => Promise<void>> {
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
    // The body hits the ground (heard further off when out of sight).
    this.soundAt("thud", v.group.position, { gain: v.group.visible ? 1 : UNSEEN_GAIN, rate: 1 + (Math.random() - 0.5) * 0.1 });
    await this.wait(200);
  }

  /** An incendiary: an arc from the thrower, then the ground goes up. */
  private async animateThrow(id: string, at: Pt3, tiles: Pt3[], lean?: Pt3) {
    const v = this.units.get(id);
    const back = v ? await this.leanOut(v, lean) : () => Promise.resolve();
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
    // It goes off: the bang heard wherever the camera is, a little further than gunfire carries.
    this.soundAt("explosion-grenade", to, { gain: 1.3, rate: 1 + (Math.random() - 0.5) * 0.06 });
    this.setFire([...this.fireTiles(), ...tiles]);
    this.redrawWrecks(tiles);
    await Promise.all([this.wait(400), back()]);
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
    this.disposed = true;
    this.rotorAudio(Infinity);
    this.ambient = false;
    this.setAmbience();
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
    this.rainTex?.dispose();
    setRainMap(null);
    if (this.map) this.makeRain({ ...this.map, rain: false });
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
    this.aimMat.dispose();
    this.setCep(null);
    for (const m of Object.values(this.cepMat)) (m.solid.dispose(), m.faint.dispose());
  }

  // ----- Building the scene -----

  private tileCentre(x: number, y: number, z: number) {
    return new THREE.Vector3(wc(x), z * LEVEL_H, wc(y));
  }

  private clearWorld() {
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
      else if (c instanceof THREE.Mesh && c.geometry !== this.signGeo) c.geometry.dispose();
    }
  }

  /** A one-off mesh (not instanced) in a catalogue material of its own colour. */
  /**
   * Shop and warehouse fittings: shelving with goods on its shelves, pallet
   * racking with boxes, a fridge with a dark glass door, a fuel pump.
   */
  private highProp(skin: Skin, x: number, z: number, y0: number, propOf: (k: Skin) => Box[], to: (k: MaterialKey) => Box[]) {
    const { h, s } = HIGH_PROP[skin]!;
    const box = (k: MaterialKey, y: number, sy: number, sx: number, sz: number, c: number) => to(k).push({ x, y: y0 + y + sy / 2, z, sx, sy, sz, c });
    if (skin === "shelf" || skin === "rack") {
      // Open shelving: corner uprights, boards, and goods on every board in a colour per board and tile.
      const shelves = skin === "rack" ? 3 : 4, post = 0.07, frame = PALETTE[skin];
      for (const ox of [-1, 1]) for (const oz of [-1, 1]) propOf(skin).push({ x: x + ox * (s / 2 - post / 2), y: y0 + h / 2, z: z + oz * (s / 2 - post / 2), sx: post, sy: h, sz: post, c: frame });
      const goods = skin === "rack" ? [0xb89a6a, 0xa88a5a, 0xc8b08a, 0x8a9aa8] : [0xd84a3a, 0x3a8ad8, 0xe8c84a, 0x4ab86a, 0xe88a3a, 0xd8d8d0];
      const step = (h - 0.1) / shelves;
      for (let i = 0; i <= shelves; i++) box("streetMetal", 0.08 + i * step - 0.03, 0.04, s, s, frame);
      for (let i = 0; i < shelves; i++) {
        const c = goods[Math.abs(Math.round(x * 7 + z * 13 + i * 5)) % goods.length]!;
        box(skin === "rack" ? "crate" : "plain", 0.1 + i * step, step * (0.55 + 0.25 * (((x * 3 + z * 5 + i) % 3) / 2)), s * 0.86, s * 0.8, c);
      }
    } else if (skin === "fridge") {
      propOf(skin).push({ x, y: y0 + h / 2, z, sx: s, sy: h, sz: s, c: PALETTE.fridge });
      box("carGlass", 0.2, h - 0.45, s * 1.02, s * 0.7, 0x2a3a44);
    } else if (skin === "pump") {
      box("plain", 0, 0.2, s * 1.6, s * 1.6, 0x8a8a86);
      propOf(skin).push({ x, y: y0 + 0.2 + (h - 0.2) / 2, z, sx: s, sy: h - 0.2, sz: s * 1.3, c: PALETTE.pump });
      box("plain", h - 0.5, 0.35, s * 1.04, s * 1.34, 0xe8e8e0);
    }
  }

  /** Sign faces by text and colours (kept across rebuilds). */
  private signMats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly signGeo = new THREE.PlaneGeometry(1, 1);

  /** A lit shop sign on a wall's outer face, above the doors. */
  private signMesh(sg: Sign, base: number): THREE.Mesh {
    const key = `${sg.text}|${sg.bg}|${sg.fg}|${sg.w}`;
    let mat = this.signMats.get(key);
    if (!mat) {
      const cv = document.createElement("canvas");
      cv.width = 128 * sg.w;
      cv.height = 96;
      const g = cv.getContext("2d")!;
      g.fillStyle = sg.bg;
      g.fillRect(0, 0, cv.width, cv.height);
      g.strokeStyle = sg.fg;
      g.lineWidth = 4;
      g.strokeRect(6, 6, cv.width - 12, cv.height - 12);
      g.fillStyle = sg.fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      let size = 58;
      g.font = `bold ${size}px "Arial Black", Arial, sans-serif`;
      while (g.measureText(sg.text).width > cv.width - 40 && size > 20) g.font = `bold ${(size -= 4)}px "Arial Black", Arial, sans-serif`;
      g.fillText(sg.text, cv.width / 2, cv.height / 2 + 3);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.4 });
      this.signMats.set(key, mat);
    }
    const mesh = new THREE.Mesh(this.signGeo, mat);
    const out = WALL_T / 2 + 0.03;
    mesh.position.set(wc(sg.x) + sg.dx * (TILE / 2 + out), base + LEVEL_H - 0.42, wc(sg.y) + sg.dy * (TILE / 2 + out));
    mesh.rotation.y = Math.atan2(sg.dx, sg.dy);
    mesh.scale.set(sg.w * TILE * 0.92, 0.62, 1);
    return mesh;
  }

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
    // The prop kit's models (render/props.ts), once it has loaded.
    const kit = propsReady() ? new PropBatch() : null;
    const H = LEVEL_H;
    for (let z = 0; z <= this.level; z++) {
      const base = z * H;
      // Walls stand their full storey on every level shown, the one looked at too (XCOM): the levels above are cut away.
      const wallH = H;
      // Each tile's floor colour (−1: no slab), and its tile-wide prop (fence, parapet), merged into big boxes below.
      const floor = new Int32Array(m.w * m.h).fill(-1);
      const wide = new Int32Array(m.w * m.h).fill(-1);
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const t = tileAt(m, x, y, z);
          if (t === T.VOID) continue;
          const skin = skinAt(m, x, y, z);
          const cx = wc(x), cy = wc(y);
          // What a prop stands on: the floor, or the road's height in a car park or on the road.
          const top = z === m.ground && this.kerb?.low[y * m.w + x] ? roadTop(base) : base + SLAB;
          const below = tileAt(m, x, y, z - 1);
          // The floor slab (none over a stairwell, so the stairs come up through it).
          // (A lot's corner rounded with the kerb: drawn by the corner's pieces instead.)
          if (below !== T.STAIRS && !(z === m.ground && this.kerb?.lotCut[y * m.w + x])) floor[y * m.w + x] = SKIN_INDEX[this.floorSkin(m, x, y, z)];
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
              if (this.furnitureTile.has((z * m.h + y) * m.w + x)) break; // and furniture
              if (kit && this.tileProp(kit, m, skin, x, y, z, top)) break;
              if (skin === "bed") {
                // A metal frame, a white mattress, a blanket over the foot half.
                to("streetMetal").push({ x: cx, y: top + 0.2, z: cy, sx: 0.9 * TILE, sy: 0.4, sz: 0.85 * TILE, c: 0x8a9098 });
                to("plain").push({ x: cx, y: top + 0.48, z: cy, sx: 0.86 * TILE, sy: 0.16, sz: 0.8 * TILE, c: 0xeef0f2 });
                to("plain").push({ x: cx + 0.2 * TILE, y: top + 0.5, z: cy, sx: 0.48 * TILE, sy: 0.17, sz: 0.82 * TILE, c: 0x5a7aa8 });
                break;
              }
              const c = PALETTE[skin];
              const { h, s } = lowProp(skin);
              if (s >= TILE) {
                wide[y * m.w + x] = SKIN_INDEX[skin];
                break;
              }
              propOf(skin).push({ x: cx, y: top + h / 2, z: cy, sx: s, sy: h, sz: s, c });
              break;
            }
            case T.HIGH:
              if (skin === "truck") break;
              if (this.furnitureTile.has((z * m.h + y) * m.w + x)) break; // furniture draws itself
              if (skin === "tree") {
                to("bark").push({ x: cx, y: top + TREE.trunkH / 2, z: cy, sx: TREE.trunk, sy: TREE.trunkH, sz: TREE.trunk, c: 0x4a3626 });
                const ch = TREE.canopyY1 - TREE.canopyY0;
                propOf("tree").push({ x: cx, y: top + TREE.canopyY0 + ch / 2, z: cy, sx: TREE.canopy, sy: ch, sz: TREE.canopy, c: PALETTE.tree });
              } else if (HIGH_PROP[skin]) this.highProp(skin, cx, cy, top, propOf, to);
              else propOf(skin).push({ x: cx, y: top + HIGH.h / 2, z: cy, sx: HIGH.s, sy: HIGH.h, sz: HIGH.s, c: PALETTE[skin] });
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
        // Town roads and car parks sit a kerb's height down.
        const drop = z === m.ground && (skin === "road" || skin === "tarmac") && isTown(m.setting) ? KERB : 0;
        floorOf(skin).push({ x: (x0 + w / 2) * TILE, y: base + SLAB / 2 - drop, z: (y0 + h / 2) * TILE, sx: w * TILE, sy: SLAB, sz: h * TILE, c: PALETTE[skin] });
      });
      if (z === m.ground && this.kerb) {
        for (const k of this.kerb.runs) to("coping").push({ ...runBox(k, base), c: KERB_STONE });
        for (const c of this.kerb.corners) {
          const g = cornerGeometry(c, base);
          this.world.add(this.solid(g.pavement, "pavement", PALETTE.pavement), this.solid(g.kerb, "coping", KERB_STONE));
          if (g.lot && c.lot) this.world.add(this.solid(g.lot, surfaceFor(c.lot, "floor"), PALETTE[c.lot]));
        }
      }
      for (const v of m.vehicles ?? []) {
        if (v.z !== z) continue;
        const floorY = this.kerb?.low[v.y * m.w + v.x] && z === m.ground ? roadTop(base) : base + SLAB;
        // The model (its front along its length, the way it faces), or until that's in, boxes.
        const model = vehicleModel(v);
        if (kit && model && hasModel(model)) {
          const along = v.w > v.h;
          kit.add(model, place((v.x + v.w / 2) * TILE, floorY, (v.y + v.h / 2) * TILE, facing(along ? v.front : 0, along ? 0 : v.front)), v.wrecked ? undefined : vehiclePaint(v));
        } else for (const b of vehicleBoxes(v, floorY)) to(b.key).push(b);
      }
      for (const f of m.furniture ?? []) if (f.z === z) this.furniture(f, z === m.ground && this.kerb?.low[f.y * m.w + f.x] ? roadTop(base) : base + SLAB, kit, to);
      for (const f of m.flights ?? []) if (f.z === z) this.flight(f, base + SLAB, propOf);
      // Street dressing: on a corner (a sign, a bollard) or a tile (a manhole), on the floor there.
      if (kit)
        for (const d of m.decor ?? []) {
          if (d.z !== z) continue;
          const tx = Math.min(m.w - 1, Math.floor(d.x)), ty = Math.min(m.h - 1, Math.floor(d.y));
          const low = z === m.ground && this.kerb?.low[ty * m.w + tx] && DECOR_AT[d.kind] === "tile";
          kit.add(d.kind, place(d.x * TILE, low ? roadTop(base) : base + SLAB, d.y * TILE, facing(d.dx, d.dy)));
        }
      // Forecourt canopies: shown with the level above (a roof, like the rest).
      for (const c of m.canopies ?? []) {
        if (c.z !== z - 1) continue;
        const cb = c.z * H + SLAB, x0 = c.x0 * TILE, x1 = (c.x1 + 1) * TILE, z0 = c.y0 * TILE, z1 = (c.y1 + 1) * TILE;
        to("plain").push({ x: (x0 + x1) / 2, y: cb + c.h + 0.25, z: (z0 + z1) / 2, sx: x1 - x0, sy: 0.5, sz: z1 - z0, c: 0xe8e8e4 });
        to("plain").push({ x: (x0 + x1) / 2, y: cb + c.h + 0.32, z: (z0 + z1) / 2, sx: x1 - x0 + 0.04, sy: 0.22, sz: z1 - z0 + 0.04, c: 0xc83a2c });
        for (const px of [x0 + 0.5, x1 - 0.5]) for (const pz of [z0 + 0.5, z1 - 0.5]) to("streetMetal").push({ x: px, y: cb + c.h / 2, z: pz, sx: 0.3, sy: c.h, sz: 0.3, c: 0xd8d8d4 });
      }
      for (const sg of m.signs ?? []) if (sg.z === z) this.world.add(this.signMesh(sg, base));
      this.merge(m, wide, (x0, y0, w, h, k) => {
        const skin = SKINS[k]!, ph = lowProp(skin).h;
        propOf(skin).push({ x: (x0 + w / 2) * TILE, y: base + SLAB + ph / 2, z: (y0 + h / 2) * TILE, sx: w * TILE, sy: ph, sz: h * TILE, c: PALETTE[skin] });
      });
      this.edgeBoxes(m, z, base, wallH, wallOf, glass, kit);
      if (kit) this.dressLevel(m, z, base, kit);
    }
    for (const [key, boxes] of buckets) this.world.add(this.instanced(boxes, this.mat(key), true));
    const kitMeshes = kit?.meshes() ?? [];
    if (kitMeshes.length) this.world.add(...kitMeshes); // (add() with nothing complains)
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
  private edgeBoxes(m: BattleMap, z: number, base: number, wallH: number, into: (skin: Skin) => Box[], glass: Box[], kit: PropBatch | null) {
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
      const framed = kit && full && m.setting !== "lair" && m.setting !== "montsegur";
      if (framed && (kind === E.SILL || kind === E.WINDOW)) {
        // The frame stays when the glass goes; blinds in some lived-in rooms.
        const { rot, inside } = this.edgeFront(m, cx, cy, along, z);
        const at = place(cx, base + SLAB, cy, rot);
        kit.add(skin === "metal" || skin === "clinic" || m.setting === "industrial" ? "window_modern" : "window_casement", at);
        if (inside && hash(Math.round(cx * 2), Math.round(cy * 2), z) % 5 < 2) kit.add("window_blinds", at);
      }
      if (kind === E.SILL) {
        // A broken window: the sill and the wall over it, the glass gone.
        box(cx, cy, along, TILE, 0, SILL, c, solid);
        if (full) box(cx, cy, along, TILE, H - SLAB - WINDOW_LINTEL, WINDOW_LINTEL, c, solid);
      } else if (kind === E.WINDOW) {
        box(cx, cy, along, TILE, 0, SILL, c, solid);
        if (full) {
          box(cx, cy, along, TILE, H - SLAB - WINDOW_LINTEL, WINDOW_LINTEL, c, solid);
          box(cx, cy, along, TILE, SILL, H - SLAB - SILL - WINDOW_LINTEL, 0, glass, WALL_T * 0.4);
        }
      } else if (kind === E.RAIL) {
        // A railing: a top rail at sill height, a mid rail, posts at each end.
        const metal = into("metal"), mc = PALETTE.metal;
        box(cx, cy, along, TILE, SILL - 0.05, 0.05, mc, metal, 0.06);
        box(cx, cy, along, TILE, SILL / 2, 0.03, mc, metal, 0.04);
        for (const e of [-1, 1]) {
          const px = along === "x" ? cx + e * (TILE / 2 - 0.03) : cx, py = along === "y" ? cy + e * (TILE / 2 - 0.03) : cy;
          box(px, py, along, 0.06, 0, SILL, mc, metal, 0.06);
        }
      } else if (kind === E.GLASS) {
        // Floor-to-ceiling: a metal rail top and bottom, the pane between.
        const frame = into("metal"), fc = PALETTE.metal, rail = 0.08;
        box(cx, cy, along, TILE, 0, rail, fc, frame, WALL_T * 0.7);
        box(cx, cy, along, TILE, wallTop - rail, rail, fc, frame, WALL_T * 0.7);
        box(cx, cy, along, TILE, rail, wallTop - 2 * rail, 0, glass, WALL_T * 0.3);
      } else if (kind === E.DOOR || kind === E.SHUT) {
        if (full) box(cx, cy, along, TILE, H - SLAB - DOOR_LINTEL, DOOR_LINTEL, c, solid);
        // A building's door (not a bare gap in a lair): the leaf in the frame, or swung open indoors.
        if (m.setting === "lair" || m.setting === "montsegur") return;
        const leafH = H - SLAB - DOOR_LINTEL, wood = into("wood"), dc = DOOR_COLOUR;
        if (framed) {
          // A frame and two leaves, shut in the frame or swung back into the room.
          const { rot } = this.edgeFront(m, cx, cy, along, z);
          const at = place(cx, base + SLAB, cy, rot);
          kit.add("door_frame", at);
          const leaf: PropName = skin === "metal" || skin === "clinic" || m.setting === "industrial" ? "door_steel" : "door_wood";
          const open = kind === E.DOOR, hinge = DOOR_HINGE - (open ? 0.025 : 0), back = open ? -WALL_T / 2 : 0;
          kit.add(leaf, at.clone().multiply(place(-hinge, 0, back, open ? Math.PI / 2 : 0)));
          kit.add(leaf, at.clone().multiply(place(hinge, 0, back, open ? Math.PI / 2 : Math.PI)));
          return;
        }
        if (kind === E.SHUT) return void box(cx, cy, along, TILE - 0.04, 0, leafH, dc, wood, WALL_T * 0.45);
        // Open: hinged at one end of the frame, standing out on the indoor side.
        const [ax, ay] = along === "y" ? [Math.round(cx / TILE) - 1, Math.floor(cy / TILE)] : [Math.floor(cx / TILE), Math.round(cy / TILE) - 1];
        const [bx, by] = along === "y" ? [ax + 1, ay] : [ax, ay + 1];
        const side = indoors(m, { x: bx, y: by, z }) || !indoors(m, { x: ax, y: ay, z }) ? 1 : -1;
        const len = TILE - 0.12, hinge = -TILE / 2 + 0.05;
        if (along === "y") into("wood").push({ x: cx + side * (len / 2 + WALL_T / 2), y: base + SLAB + leafH / 2, z: cy + hinge, sx: len, sy: leafH, sz: 0.06, c: dc });
        else into("wood").push({ x: cx + hinge, y: base + SLAB + leafH / 2, z: cy + side * (len / 2 + WALL_T / 2), sx: 0.06, sy: leafH, sz: len, c: dc });
      }
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
      line(m.h, (y) => ({ kind: this.shownEw[i(y)]!, skin: SKINS[m.ewSkin[i(y)]!]! }), (y) => [x * TILE, wc(y)], "y");
    }
    // North edges, along each grid line y (between tile y − 1 and y).
    for (let y = 0; y <= m.h; y++) {
      const i = (x: number) => (z * (m.h + 1) + y) * m.w + x;
      line(m.w, (x) => ({ kind: this.shownNs[i(x)]!, skin: SKINS[m.nsSkin[i(x)]!]! }), (x) => [wc(x), y * TILE], "x");
    }
  }

  /** A tile in a building: on the map, not empty, under a roof or a floor. */
  private inside(m: BattleMap, x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && x < m.w && y < m.h && tileAt(m, x, y, z) !== T.VOID && indoors(m, { x, y, z });
  }

  /**
   * An edge piece's turn: its front (the street side) away from the room, as
   * a door swings into the room; and whether there is a room either side.
   */
  private edgeFront(m: BattleMap, cx: number, cy: number, along: "x" | "y", z: number) {
    const [ax, ay] = along === "y" ? [Math.round(cx / TILE) - 1, Math.floor(cy / TILE)] : [Math.floor(cx / TILE), Math.round(cy / TILE) - 1];
    const [bx, by] = along === "y" ? [ax + 1, ay] : [ax, ay + 1];
    const ia = this.inside(m, ax, ay, z), ib = this.inside(m, bx, by, z);
    const side = ib || !ia ? 1 : -1;
    const [nx, nz] = along === "y" ? [1, 0] : [0, 1];
    return { rot: facing(-side * nx, -side * nz), inside: ia || ib };
  }

  /**
   * A flight of stairs: solid steps from its foot up to the next floor
   * (concrete outdoors, wood indoors), 4 to a tile; outdoors, a metal
   * handrail along each side.
   */
  private flight(f: Flight, floorY: number, propOf: (skin: Skin) => Box[]) {
    const skin: Skin = f.kind === "outdoor" ? "concrete" : "wood";
    const along = f.dx ? f.w : f.h, across = (f.dx ? f.h : f.w) * TILE;
    const n = along * 4, tread = (along * TILE) / n, rise = LEVEL_H / n;
    // The flight's middle line, from its bottom edge toward its top.
    const cx = (f.x + f.w / 2) * TILE, cz = (f.y + f.h / 2) * TILE;
    const bx = cx - (f.dx * along * TILE) / 2, bz = cz - (f.dy * along * TILE) / 2;
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * rise, d = (i + 0.5) * tread;
      propOf(skin).push({
        x: bx + f.dx * d, y: floorY + h / 2, z: bz + f.dy * d,
        sx: f.dx ? tread : across, sy: h, sz: f.dy ? tread : across, c: PALETTE[skin],
      });
    }
    if (f.kind !== "outdoor") return;
    // Handrails: a post at each end of each side, one rail between them sloped with the flight.
    const railH = 0.9, run = along * TILE - 0.2, slope = Math.atan2(LEVEL_H, along * TILE), len = Math.hypot(run, run * Math.tan(slope));
    for (const side of [-1, 1]) {
      const ox = f.dy * side * (across / 2 - 0.06), oz = -f.dx * side * (across / 2 - 0.06);
      // Each post stands on the floor at its end and reaches up to the rail.
      for (const [d, h] of [[0.1, 0], [along * TILE - 0.1, LEVEL_H]] as const) {
        const top = railH + (LEVEL_H * d) / (along * TILE), sy = top - h;
        propOf("metal").push({ x: bx + f.dx * d + ox, y: floorY + h + sy / 2, z: bz + f.dy * d + oz, sx: 0.05, sy, sz: 0.05, c: PALETTE.metal });
      }
      // Rising toward +x is a turn about z by +slope; toward +z (y on the map), about x by -slope.
      const d = (along * TILE) / 2;
      propOf("metal").push({
        x: bx + f.dx * d + ox, y: floorY + LEVEL_H / 2 + railH, z: bz + f.dy * d + oz,
        sx: f.dx ? len : 0.05, sy: 0.05, sz: f.dy ? len : 0.05, c: PALETTE.metal,
        rz: f.dx ? f.dx * slope : 0, rx: f.dy ? -f.dy * slope : 0,
      });
    }
  }

  /** A piece of furniture over its footprint: the model, or (before the kit is in) a box. */
  private furniture(f: Furniture, floorY: number, kit: PropBatch | null, to: (k: MaterialKey) => Box[]) {
    const cx = (f.x + f.w / 2) * TILE, cz = (f.y + f.h / 2) * TILE;
    const parts = f.kind === "tv" ? ([["tv_stand", 0, 0, 0, 0]] as const) : pieceParts(f.kind);
    if (kit && parts.every(([name]) => hasModel(name))) {
      // A piece on a wall stands on the edge behind its footprint, its front away from the wall.
      const back = furnitureAnchor(f.kind) === "back" ? (furnitureSize(f.kind)[1] * TILE) / 2 : 0;
      const at = place(cx - f.dx * back, floorY, cz - f.dy * back, facing(f.dx, f.dy));
      for (const [name, x, y, z, turn] of parts) kit.add(name, x || y || z || turn ? at.clone().multiply(place(x, y, z, turn)) : at);
      return;
    }
    // Until its model is in: a box the size of the cover it gives (dressing: nothing).
    const cover = furnitureCover(f.kind), skin = furnitureSkin(f.kind);
    if (cover === "none") return;
    const h = cover === "high" ? HIGH_PROP[skin]?.h ?? HIGH.h : lowProp(skin).h;
    to(surfaceFor(skin, "prop")).push({ x: cx, y: floorY + h / 2, z: cz, sx: f.w * TILE * 0.9, sy: h, sz: f.h * TILE * 0.9, c: PALETTE[skin] });
  }

  /** The ways off a tile someone could stand: onto bare floor (or stairs) with nothing on the edge between. In a per-tile order. */
  private openSides(m: BattleMap, x: number, y: number, z: number): { x: number; y: number }[] {
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const k = hash(x, y, z) % 4, out: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = dirs[(k + i) % 4]!;
      const t = tileAt(m, x + dx, y + dy, z);
      if ((t === T.FLOOR || t === T.STAIRS) && edgeOpen(m, x, y, z, dx, dy)) out.push({ x: dx, y: dy });
    }
    return out;
  }

  /** The way a prop faces: onto open floor, its back to a wall where it can (else south). */
  private openSide(m: BattleMap, x: number, y: number, z: number): { x: number; y: number } {
    const open = this.openSides(m, x, y, z);
    const backed = open.find((d) => !open.some((o) => o.x === -d.x && o.y === -d.y));
    return backed ?? open[0] ?? { x: 0, y: 1 };
  }

  /**
   * A low prop drawn as a model in place of its box: crates, bins (a
   * dumpster), park benches, tables (a desk with a computer and a chair on
   * office floors, a table and two chairs elsewhere). False: draw the box.
   */
  private tileProp(kit: PropBatch, m: BattleMap, skin: Skin, x: number, y: number, z: number, floorY: number): boolean {
    const cx = wc(x), cz = wc(y), h = hash(x, y, z);
    const open = () => this.openSide(m, x, y, z);
    switch (skin) {
      case "crate":
        // Squared to the grid, give or take a few degrees.
        kit.add("crate", place(cx, floorY, cz, ((h % 4) * Math.PI) / 2 + (((h >> 4) % 7) - 3) * 0.04, 1.06));
        return true;
      case "bin": {
        const d = open();
        kit.add("dumpster", place(cx, floorY, cz, facing(d.x, d.y), 0.86));
        return true;
      }
      case "bench": {
        if (indoors(m, { x, y, z })) return false; // pews
        const d = open();
        kit.add("bench", place(cx, floorY, cz, facing(d.x, d.y)));
        return true;
      }
      case "table": {
        // Faced onto open floor, its back to a wall if it has one: chairs only where someone could get to them.
        const open = this.openSides(m, x, y, z);
        const d = this.openSide(m, x, y, z), at = place(cx, floorY, cz, facing(d.x, d.y));
        const backOpen = open.some((o) => o.x === -d.x && o.y === -d.y);
        const jitter = (((h >> 6) % 9) - 4) * 0.06;
        if (["tile", "concrete"].includes(this.floorSkin(m, x, y, z))) {
          kit.add("desk", at);
          kit.add("desk_computer", at.clone().multiply(place(-0.2, 0.75, 0.05, 0)));
          if (open.length) kit.add("office_chair", at.clone().multiply(place(-0.15, 0, 0.45, Math.PI + jitter * 2)));
        } else {
          kit.add("table", at);
          if (!open.length) return true;
          if (backOpen) {
            kit.add("chair", at.clone().multiply(place(-0.3, 0, 0.45, Math.PI + jitter)));
            kit.add("chair", at.clone().multiply(place(0.3, 0, -0.45, -jitter)));
          } else for (const sx of [-0.33, 0.33]) kit.add("chair", at.clone().multiply(place(sx, 0, 0.45, Math.PI + jitter * (sx < 0 ? 1 : -1))));
        }
        return true;
      }
    }
    return false;
  }

  /**
   * A level's dressing, which the rules don't see: outside walls in brick,
   * plaster or stone get a plinth at the foot, a band course at each floor,
   * a cornice at the top, with corner pieces, quoins on brick corners and
   * now and then a downpipe or an air-conditioning unit; town roads get
   * manholes and drains.
   */
  private dressLevel(m: BattleMap, z: number, base: number, kit: PropBatch) {
    if (m.setting === "lair" || m.setting === "montsegur") return;
    const H = LEVEL_H;
    const styled = (k: Skin) => k === "brick" || k === "plaster" || k === "clinic" || k === "stone" || k === "none";
    /** An outside wall's edge: its trim, or null. `ew`: a west edge (along z) at grid x; else a north edge at grid y. */
    const edge = (ew: boolean, gx: number, gy: number) => {
      if (ew ? gx < 0 || gx > m.w || gy < 0 || gy >= m.h : gx < 0 || gx >= m.w || gy < 0 || gy > m.h) return null;
      const at = (lz: number) => (ew ? (lz * m.h + gy) * (m.w + 1) + gx : (lz * (m.h + 1) + gy) * m.w + gx);
      const shown = ew ? this.shownEw : this.shownNs;
      const kind = shown[at(z)]!;
      const skin = SKINS[(ew ? m.ewSkin : m.nsSkin)[at(z)]!]!;
      if (kind === E.NONE || kind === E.GLASS || !styled(skin)) return null;
      const [ax, ay, bx, by] = ew ? [gx - 1, gy, gx, gy] : [gx, gy - 1, gx, gy];
      const ia = this.inside(m, ax, ay, z), ib = this.inside(m, bx, by, z);
      if (ia === ib) return null;
      const above = z + 1 < m.levels ? shown[at(z + 1)]! : E.NONE;
      const [rx, ry] = ia ? [ax, ay] : [bx, by];
      // Over the room: a roof (cap its slab) or open sky (cap the wall).
      const roofed = z + 1 < m.levels && tileAt(m, rx, ry, z + 1) !== T.VOID;
      const out = ia ? 1 : -1; // toward the street along the edge's normal
      return {
        skin, kind, rot: ew ? facing(out, 0) : facing(0, out),
        x: ew ? gx * TILE : wc(gx), z: ew ? wc(gy) : gy * TILE,
        plinth: z === m.ground && kind !== E.DOOR && kind !== E.SHUT,
        band: above !== E.NONE && above !== E.GLASS,
        cornice: above === E.NONE,
        corniceY: base + H + (roofed ? SLAB : 0),
      };
    };
    type Trim = NonNullable<ReturnType<typeof edge>>;
    const dress = (t: Trim) => {
      if (t.plinth) kit.add("plinth", place(t.x, base + SLAB, t.z, t.rot));
      if (t.band) kit.add("band_course", place(t.x, base + SLAB / 2, t.z, t.rot));
      if (t.cornice) kit.add("cornice", place(t.x, t.corniceY, t.z, t.rot));
      // An air-conditioner on one plain wall in a dozen, above the street.
      if (t.kind === E.WALL && t.skin !== "stone" && z > m.ground - 1 && hash(Math.round(t.x * 2), Math.round(t.z * 2), z + 7) % 12 === 0)
        kit.add("ac_unit", place(t.x, base + SLAB, t.z, t.rot));
    };
    for (let gy = 0; gy < m.h; gy++) for (let gx = 0; gx <= m.w; gx++) { const t = edge(true, gx, gy); if (t) dress(t); }
    for (let gy = 0; gy <= m.h; gy++) for (let gx = 0; gx < m.w; gx++) { const t = edge(false, gx, gy); if (t) dress(t); }
    // Outside corners: the one tile of four round a grid point that's in the building.
    for (let vy = 0; vy <= m.h; vy++)
      for (let vx = 0; vx <= m.w; vx++) {
        const rooms = [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]].filter(([x, y]) => this.inside(m, x!, y!, z));
        if (rooms.length !== 1) continue;
        const [tx, ty] = rooms[0]! as [number, number];
        const a = edge(true, vx, ty), b = edge(false, tx, vy);
        if (!a || !b) continue;
        const bx = tx === vx ? 1 : -1, bz = ty === vy ? 1 : -1;
        const x = vx * TILE, zz = vy * TILE, rot = cornerTurn(bx, bz);
        if (a.plinth && b.plinth) kit.add("plinth_corner", place(x, base + SLAB, zz, rot));
        if (a.band && b.band) kit.add("band_corner", place(x, base + SLAB / 2, zz, rot));
        if (a.cornice && b.cornice) kit.add("cornice_corner", place(x, Math.max(a.corniceY, b.corniceY), zz, rot));
        if (a.skin === "brick" && b.skin === "brick") kit.add("quoins", place(x, base, zz, rot));
        // A downpipe down one corner in three, a little way along one of its walls.
        const hv = hash(vx, vy, 11);
        if (hv % 3 === 0 && a.skin !== "stone") {
          if (hv & 8) kit.add("downpipe", place(x, base, zz + bz * 0.3, a.rot));
          else kit.add("downpipe", place(x + bx * 0.3, base, zz, b.rot));
        }
      }
    // Town roads: a manhole now and then, a drain by the kerb.
    if (z !== m.ground || !this.kerb) return;
    const road = roadTop(base);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!this.kerb.low[y * m.w + x] || this.kerb.cut[y * m.w + x] || this.vehicleTile.has(y * m.w + x)) continue;
        if (this.floorSkin(m, x, y, z) !== "road") continue;
        const h = hash(x, y, 5);
        if (h % 41 === 0) {
          kit.add("manhole", place(wc(x), road, wc(y), (h >> 8) % 6));
          continue;
        }
        if (h % 7 !== 0) continue;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || this.kerb.low[ny * m.w + nx]) continue;
          // Against the kerb, its long side along it.
          kit.add("drain_grate", place(wc(x) + dx * (TILE / 2 - 0.3), road, wc(y) + dy * (TILE / 2 - 0.3), facing(dx, dy)));
          break;
        }
      }
  }

  private instanced(boxes: Box[], mat: THREE.Material, colours: boolean) {
    const mesh = new THREE.InstancedMesh(this.boxGeo, mat, Math.max(1, boxes.length));
    mesh.count = boxes.length;
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    boxes.forEach((b, i) => {
      if (b.rx || b.rz) mtx.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(b.rx ?? 0, 0, b.rz ?? 0)), sc.set(b.sx, b.sy, b.sz));
      else mtx.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z);
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

  /** A street-level prop with only tarmac or road to walk beside it stands on that, else null (it keeps its own floor). */
  private lotUnder(m: BattleMap, x: number, y: number): Skin | null {
    const t = tileAt(m, x, y, m.ground);
    if (t !== T.LOW && t !== T.HIGH) return null;
    let found: Skin | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = tileAt(m, x + dx, y + dy, m.ground);
      if (n !== T.FLOOR && n !== T.DOOR) continue;
      const k = skinAt(m, x + dx, y + dy, m.ground);
      if (k !== "tarmac" && k !== "road") return null;
      found ??= k;
    }
    return found;
  }

  private floorUnder(m: BattleMap, x: number, y: number, z: number): Skin {
    // A prop's floor: borrow a walkable neighbour's.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const t = tileAt(m, x + dx, y + dy, z);
      if (t === T.FLOOR || t === T.DOOR) return skinAt(m, x + dx, y + dy, z);
    }
    if (indoors(m, { x, y, z })) return "indoor"; // hemmed in by furniture
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

  // ----- Snowfall -----

  /** Flakes over the whole map, falling and drifting; none outside winter. */
  private makeSnowfall(m: BattleMap) {
    if (this.snowfall) {
      this.scene.remove(this.snowfall);
      this.snowfall.geometry.dispose();
      (this.snowfall.material as THREE.Material).dispose();
      this.snowfall = null;
    }
    if (!m.winter) return;
    const n = Math.round(m.w * m.h * 2.5), top = m.levels * LEVEL_H + 8;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([Math.random() * m.w * TILE, Math.random() * top, Math.random() * m.h * TILE], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xf4f6fa, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false });
    this.snowfall = new THREE.Points(geo, mat);
    this.snowfall.frustumCulled = false;
    this.snowfall.userData = { top, phase: Float32Array.from({ length: n }, () => Math.random() * 6.28) };
    this.scene.add(this.snowfall);
  }

  private fallSnow(dt: number, t: number) {
    const f = this.snowfall!, m = this.map!;
    const a = f.geometry.getAttribute("position") as THREE.BufferAttribute, p = a.array as Float32Array;
    const { top, phase } = f.userData as { top: number; phase: Float32Array };
    const base = m.ground * LEVEL_H;
    for (let i = 0; i < p.length; i += 3) {
      const ph = phase[i / 3]!;
      p[i] = p[i]! + Math.sin(t * 0.7 + ph) * dt * 0.35 + dt * 0.25;
      p[i + 1] = p[i + 1]! - dt * (0.9 + 0.25 * Math.sin(ph * 3));
      p[i + 2] = p[i + 2]! + Math.cos(t * 0.5 + ph) * dt * 0.3;
      if (p[i + 1]! < base) {
        p[i + 1] = top;
        p[i] = Math.random() * m.w * TILE;
        p[i + 2] = Math.random() * m.h * TILE;
      }
    }
    a.needsUpdate = true;
  }

  // ----- Rain -----

  /** Drizzle over the whole map and the street's mirror for the puddles; none when dry. */
  private makeRain(m: BattleMap) {
    if (this.rainfall) {
      this.scene.remove(this.rainfall);
      this.rainfall.geometry.dispose();
      (this.rainfall.material as THREE.Material).dispose();
      this.rainfall = null;
    }
    if (this.mirror) {
      this.mirror.dispose();
      this.mirror = null;
      setRainReflection(null);
    }
    if (!m.rain) return;
    const n = Math.round(m.w * m.h * 1.6), top = m.levels * LEVEL_H + 8;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * m.w * TILE, y = Math.random() * top, z = Math.random() * m.h * TILE;
      pos.set([x, y, z, x + RAIN_SLANT.x * RAIN_STREAK, y + RAIN_STREAK, z + RAIN_SLANT.z * RAIN_STREAK], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xb4bec8, transparent: true, opacity: 0.32, depthWrite: false });
    this.rainfall = new THREE.LineSegments(geo, mat);
    this.rainfall.frustumCulled = false;
    this.rainfall.userData = { top };
    this.scene.add(this.rainfall);
    // The mirror: a plane over the whole map at the street's height (a town's road, a kerb down; else the ground).
    const w = m.w * TILE, h = m.h * TILE;
    this.mirror = new Reflector(new THREE.PlaneGeometry(w, h), { clipBias: 0.003, multisample: 0, textureWidth: 512, textureHeight: 512 });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.set(w / 2, m.ground * LEVEL_H + SLAB - (isTown(m.setting) ? KERB : 0), h / 2);
    this.mirror.updateMatrixWorld(true);
    this.sizeMirror();
  }

  /** The mirror at half the screen's resolution. */
  private sizeMirror() {
    if (!this.mirror) return;
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.mirror.getRenderTarget().setSize(Math.max(64, Math.round(v.x / 2)), Math.max(64, Math.round(v.y / 2)));
  }

  /** Renders the street mirrored, then hands it to the puddles (which mustn't sample it while it's drawn). */
  private reflect(t: number) {
    const mr = this.mirror!;
    setRainReflection(null);
    this.camera.updateMatrixWorld();
    this.rainfall!.visible = false; // streaks in the puddles read as noise
    mr.onBeforeRender(this.renderer, this.scene, this.camera, mr.geometry, mr.material as THREE.Material, null as unknown as THREE.Group);
    this.rainfall!.visible = true;
    const texMat = (mr.material as THREE.ShaderMaterial).uniforms.textureMatrix!.value as THREE.Matrix4;
    // Its matrix takes the plane's own coordinates: from the world, through the plane's inverse.
    this.mirrorMat.copy(texMat).multiply(new THREE.Matrix4().copy(mr.matrixWorld).invert());
    setRainReflection(mr.getRenderTarget().texture, this.mirrorMat, mr.position.y);
    setRainFrame(t);
  }

  private fallRain(dt: number) {
    const f = this.rainfall!, m = this.map!;
    const a = f.geometry.getAttribute("position") as THREE.BufferAttribute, p = a.array as Float32Array;
    const { top } = f.userData as { top: number };
    const base = m.ground * LEVEL_H;
    const dy = -RAIN_SPEED * dt, dx = RAIN_SLANT.x * RAIN_SPEED * dt, dz = RAIN_SLANT.z * RAIN_SPEED * dt;
    for (let i = 0; i < p.length; i += 6) {
      let y = p[i + 1]! + dy, x = p[i]! - dx, z = p[i + 2]! - dz;
      if (y < base) {
        y = top;
        x = Math.random() * m.w * TILE;
        z = Math.random() * m.h * TILE;
      }
      p[i] = x;
      p[i + 1] = y;
      p[i + 2] = z;
      p[i + 3] = x + RAIN_SLANT.x * RAIN_STREAK;
      p[i + 4] = y + RAIN_STREAK;
      p[i + 5] = z + RAIN_SLANT.z * RAIN_STREAK;
    }
    a.needsUpdate = true;
  }

  // ----- Loop -----

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.sizeMirror();
  }

  private readonly tmpV = new THREE.Vector3();
  /** A rocket's hits, shown when its blast plays. */
  private blastHits: { unit: string; damage: number }[] = [];

  /** A turning rotor `distance` metres from the camera (Infinity: none): full at 20 m or closer, falling off past it. */
  private rotorAudio(distance: number) {
    if (!Number.isFinite(distance)) {
      this.rotorSound?.stop();
      this.rotorSound = null;
      return;
    }
    this.rotorSound ??= sfx.loop("helicopter", 0);
    this.rotorSound.setGain(Math.min(1, 20 / Math.max(1, distance)));
  }

  /**
   * The ambience, in layers that come and go on their own: wildlife in town
   * streets and the country (birds by day, crickets at night, none in winter,
   * quiet in the rain); traffic in the city (faint behind the wildlife in
   * town streets, lower at night); rain wherever it falls, wind over the
   * country in winter. Not under ground.
   */
  private setAmbience() {
    const m = this.map;
    const want = new Map<string, { id: SoundId; gain: number }>();
    if (m && this.ambient && m.setting !== "lair" && m.setting !== "montsegur") {
      const wild = m.setting === "urban" || m.setting === "rural";
      if (wild && !m.rain && (!this.night || !m.winter)) want.set("wildlife", { id: this.night ? "crickets" : "birds", gain: 1 });
      if (m.setting !== "rural") want.set("traffic", { id: "traffic", gain: (m.setting === "urban" ? 0.4 : 1) * (this.night ? 0.6 : 1) });
      if (m.rain) want.set("weather", { id: "rain", gain: 1 });
      else if (m.winter && m.setting === "rural") want.set("weather", { id: "wind", gain: 1 });
    }
    for (const [layer, now] of this.ambience) {
      const next = want.get(layer);
      if (next?.id === now.id) {
        if (next.gain !== now.gain) now.loop.setGain((now.gain = next.gain));
        continue;
      }
      now.loop.stop();
      this.ambience.delete(layer);
    }
    // A loop fades in from silence.
    for (const [layer, w] of want) if (!this.ambience.has(layer)) this.ambience.set(layer, { ...w, loop: sfx.loop(w.id, w.gain) });
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
    for (const m of [this.bluePath, this.yellowPath, this.ghosts.get(this.bluePath)!, this.ghosts.get(this.yellowPath)!, this.aimMat]) m.uniforms.time!.value = now / 1000;
    let nearest = Infinity;
    for (const r of this.rotors)
      if (r.parent?.parent?.visible !== false && r.parent && (r.parent as THREE.Object3D).rotation.x === 0) {
        r.rotation.y += dt * 9;
        nearest = Math.min(nearest, r.getWorldPosition(this.tmpV).distanceTo(this.camera.position));
      }
    this.rotorAudio(nearest);
    if (this.fireGroup.children.length) {
      const t = now / 1000;
      for (const f of this.fireGroup.children) f.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 7 + f.userData.phase));
    }
    if (this.snowfall && this.map) this.fallSnow(dt, now / 1000);
    if (this.rainfall && this.map) this.fallRain(dt);
    if (this.lightDirty) this.bakeLight();
    this.controls.update();
    for (const c of this.cepGroup.children) c.quaternion.copy(this.camera.quaternion);
    if (this.mirror) this.reflect(now / 1000);
    this.renderer.render(this.scene, this.camera);
    this.placeEdges();
    this.placeHeads();
  };
}

