// The battlescape renderer (docs/design/tactical.md): crude on purpose. Every
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
//
// The work is done by layers, each owning its own meshes: LevelLayer (the
// map's geometry), Atmosphere (light and weather), UnitLayer (units and what
// lies about), Overlays (move range, path, aim), Playback (events animated)
// and CameraControl (camera and input). BattleView holds what they share (the
// renderer, scene, camera, map and level shown), runs the frame loop, and is
// what the UI talks to.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { type BattleMap, type Pt3, type Vehicle } from "../../tactical/map/map";
import { type WeaponId } from "../../tactical/rules";
import { type Volume } from "./lightVolume";
import { rainMap, setRainMap } from "../shaders/rain";
import { setSnowMap, snowMap } from "../shaders/snow";
import { roadMap, setRoadMap } from "../shaders/road";
import { KERB, LEVEL_H, SLAB, TILE, wc } from "./scale";
import { kerbPlan, type KerbPlan } from "./kerbs";
import { vehicleModel } from "./vehicles";
import { hasModel, loadModels, loadProps } from "./props";
import { pieceParts } from "../../tactical/map/pieces";
import { LevelLayer } from "./LevelLayer";
import { Atmosphere } from "./Atmosphere";
import { UnitLayer, type FloorItem } from "./UnitLayer";
import { Overlays } from "./Overlays";
import { Playback } from "./Playback";
import { CameraControl } from "./CameraControl";

/** How high a body lying down is lifted (half the torso's width). */
export const LYING_Y = 0.28;

export interface UnitSpec {
  id: string;
  /** For the edge arrow's tooltip. */
  name?: string;
  x: number;
  y: number;
  z: number;
  side: "agent" | "thrall" | "vampire" | "civilian" | "hostage";
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
  /** The item model in hand (public/assets/items/models/<name>.glb): a weapon, or a knife. */
  held?: string;
}

export interface Edge extends Pt3 {
  dx: number;
  dy: number;
}
/** A point in metres (the rules' ballistics frame is the view's: x east, y up, z south). */
export interface M3 {
  x: number;
  y: number;
  z: number;
}

/** The battle events the view plays (tactical/battle.ts BattleEvent, structurally). */
export type BattleEventLike =
  | { kind: "move"; unit: string; path: Pt3[]; seen: boolean }
  | {
      kind: "shot";
      unit: string;
      weapon: WeaponId;
      target?: string;
      from: M3;
      aim: M3;
      rays: M3[];
      hits: { unit: string; damage: number; crit: boolean }[];
      reaction: boolean;
      melee: boolean;
      seen: boolean;
      lean?: Pt3;
      burst?: boolean;
    }
  | { kind: "death"; unit: string; text?: string }
  | { kind: "torpor"; unit: string; seen: boolean }
  | { kind: "burn"; unit: string; damage: number; why: "fire" | "sun"; seen: boolean }
  | {
      kind: "throw";
      unit: string;
      at: Pt3;
      tiles: Pt3[];
      lean?: Pt3;
      item?: "uv-flare" | "flashbang" | "strobe";
    }
  | { kind: "status"; unit: string; text: string; seen: boolean; cue?: "reload" }
  /** An edge from tile (x, y) one step (dx, dy ≥ 0): a door opened, glass shattered. */
  | { kind: "door"; unit: string; at: Edge; seen: boolean }
  | { kind: "glass"; panes: Edge[]; from: Pt3 }
  | { kind: "blast"; unit: string; at: Pt3; tiles: Pt3[]; seen: boolean }
  | { kind: "turn" }
  | { kind: "end" };

export interface UnitView {
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
  /** The item model in hand, and its name. */
  held?: THREE.Object3D;
  heldName?: string;
}

export class BattleView {
  onHover?: (p: Pt3 | null) => void;

  onPick?: (p: Pt3) => void;

  /** A right click (not a drag) on a tile: the command, i.e. move there. */
  onCommand?: (p: Pt3) => void;

  /** The wheel: +1 a level up, −1 down. */
  onLevelStep?: (dir: number) => void;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly resizeObserver: ResizeObserver;
  readonly lz: THREE.Mesh;
  readonly boxGeo = new THREE.BoxGeometry(1, 1, 1);
  roadTex: THREE.DataTexture | null = null;
  snowTex: THREE.DataTexture | null = null;
  rainTex: THREE.DataTexture | null = null;

  /** Ground tiles under a vehicle (index y·w + x), and the town's kerbs. */
  vehicleTile = new Map<number, Vehicle>();

  /** The camera has been placed for a map (setMap's keepView leaves it then). */
  viewSet = false;

  /** The landing zone's marker is wanted (the block editor hides it). */
  lzShown = true;

  /** Tiles (by level) under a piece of furniture: drawn whole, not tile by tile. */
  furnitureTile = new Set<number>();
  kerb: KerbPlan | null = null;

  /** The baked lamp light: the lamps' share (redone when day or night changes), and the texture with fire added. */
  lampLight: Volume | null = null;
  lightDirty = false;

  /** Every burning tile, on any level (lights the map even where it isn't drawn). */
  fires: Pt3[] = [];
  /** Every tile a UV flare lights, on any level. */
  uvTiles: Pt3[] = [];
  readonly moon: THREE.DirectionalLight;
  readonly aboveGroup = new THREE.Group();

  /** Plays the setting's wildlife (off in the block editor's preview). */
  ambient = false;

  readonly fireMat = new THREE.MeshBasicMaterial({
    color: 0xff7a20,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  readonly lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });

  /** UV-lit ground: a faint violet wash. */
  readonly uvMat = new THREE.MeshBasicMaterial({
    color: 0x8a4dff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  night = true;
  readonly units = new Map<string, UnitView>();

  /** The height the camera's base plane eases to: the floor of the level shown. */
  baseY = 0;
  map: BattleMap | null = null;
  level = 0;
  frame = 0;

  /** Camera keys, as KeyboardEvent.code (ui/keys.ts); the UI sets them. */
  cameraKeys = {
    forward: "KeyW",
    back: "KeyS",
    left: "KeyA",
    right: "KeyD",
    rotateLeft: "KeyQ",
    rotateRight: "KeyE",
  };

  hovered: Pt3 | null = null;
  last = performance.now();
  disposed = false;

  /**
   * The edges as drawn: the map's as they were when it was set, changed as
   * the playback reaches each door opened or pane shattered (the rules have
   * already changed the map itself).
   */
  shownEw = new Uint8Array(0);
  shownNs = new Uint8Array(0);

  /** Every frame: move the camera, play animations, then draw. */
  loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.update(dt);
    this.playback.update(dt);
    this.overlays.update(now);
    this.figures.update(now);
    this.atmosphere.update(dt, now);
    this.controls.update();
    this.overlays.faceCamera();
    if (this.atmosphere.mirror) this.atmosphere.reflect(now / 1000);
    this.renderer.render(this.scene, this.camera);
    this.figures.placeEdges();
    this.figures.placeHeads();
  };

  /** The map's walls, floors, props and signs. */
  readonly geometry = new LevelLayer(this);
  /** Day and night, lamps, rain and snow. */
  readonly atmosphere = new Atmosphere(this);
  /** Units, their head bars, and what lies about. */
  readonly figures = new UnitLayer(this);
  /** Move range, path, aim lines, CEP. */
  readonly overlays = new Overlays(this);
  /** Battle events played back as animation and sound. */
  readonly playback = new Playback(this);
  /** The camera, and the mouse and keys that move it. */
  readonly input = new CameraControl(this);

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // redrawn when something that casts one moves (shadowsMoved)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);
    this.figures.edgeLayer.className = "battle-edges";
    container.appendChild(this.figures.edgeLayer);

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
    this.controls.addEventListener("start", () => (this.input.focusTo = null));
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };

    // Night, but readable: a cool sky, a moon that casts shadows, warm bounce.
    this.scene.add(this.atmosphere.sky);
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
    this.scene.add(
      this.geometry.world,
      this.figures.unitGroup,
      this.figures.fireGroup,
      this.figures.uvGroup,
      this.atmosphere.lampGroup,
      this.figures.lootGroup,
      this.figures.floorGroup,
      this.overlays.rangeLines,
      this.aboveGroup,
      this.overlays.aimGroup,
      this.overlays.cepGroup,
    );

    this.lz = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x8fd39a,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    this.lz.rotation.x = -Math.PI / 2;
    this.scene.add(this.lz);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.input.onMove);
    el.addEventListener("pointerdown", this.input.onDown);
    el.addEventListener("pointerup", this.input.onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("wheel", this.input.onWheel, { passive: false });
    window.addEventListener("keydown", this.input.onKey);
    window.addEventListener("keyup", this.input.onKeyUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
    // Dev only: the view, for browser checks (lighting, camera).
    if (import.meta.env.DEV) (window as unknown as { battleView?: BattleView }).battleView = this;
    // The prop kit loads once; until it's in, the level is drawn in boxes.
    void loadProps().then(() => {
      if (this.disposed || !this.map) return;
      this.atmosphere.placeLamps(this.map);
      this.geometry.rebuild();
    });
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
      for (let dy = 0; dy < v.h; dy++)
        for (let dx = 0; dx < v.w; dx++) this.vehicleTile.set((v.y + dy) * m.w + v.x + dx, v);
    this.furnitureTile.clear();
    for (const f of m.furniture ?? [])
      for (let dy = 0; dy < f.h; dy++)
        for (let dx = 0; dx < f.w; dx++)
          this.furnitureTile.add((f.z * m.h + f.y + dy) * m.w + f.x + dx);
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
        if (!this.disposed && this.map === m) this.geometry.rebuild();
      });
    // What lies under a vehicle, or a prop standing in a car park or a road (not raised on a kerb of its own).
    const under = (x: number, y: number) =>
      this.vehicleTile.get(y * m.w + x)?.under ?? this.geometry.lotUnder(m, x, y);
    this.kerb = kerbPlan(m, under);
    this.roadTex?.dispose();
    const bays = new Map(
      (m.bayLines ?? []).map((b) => [
        b.y * m.w + b.x,
        b.alongX ? ("bayX" as const) : ("bayZ" as const),
      ]),
    );
    this.roadTex = roadMap(m, (x, y) => {
      // A rounded corner's tiles: asphalt without markings, under the curve.
      if (this.kerb!.cut[y * m.w + x]) return "plain";
      const k = this.geometry.floorSkin(m, x, y, m.ground);
      return k === "road" ? "road" : k === "tarmac" ? (bays.get(y * m.w + x) ?? "plain") : null;
    });
    setRoadMap(this.roadTex);
    this.snowTex?.dispose();
    this.snowTex = m.winter ? snowMap(m, under) : null;
    setSnowMap(this.snowTex);
    this.atmosphere.makeSnowfall(m);
    this.rainTex?.dispose();
    this.rainTex = m.rain ? rainMap(m, under) : null;
    setRainMap(this.rainTex);
    this.atmosphere.makeRain(m);
    this.atmosphere.setDaylight(this.night);
    this.atmosphere.placeLamps(m);
    this.figures.setFire([]);
    this.figures.setUv([]);
    this.figures.setLoot([]);
    this.figures.setFloor([]);
    this.figures.setUnits([]);
    this.overlays.setMoveRange([]);
    this.overlays.setPath(null);
    this.overlays.setAimLines(null);
    this.geometry.rebuild();
    if (keepView && this.viewSet) return;
    this.viewSet = true;
    // Look at the landing zone from the south-west, at a comfortable height.
    const c = m.lz[4] ?? m.lz[0]!;
    // Between the landing zone and the middle of the map, far enough back to see most of it.
    const target = this.geometry
      .tileCentre(c.x, c.y, c.z)
      .lerp(this.geometry.tileCentre(m.w / 2, m.h / 2, c.z), 0.4);
    this.controls.target.copy(target);
    this.baseY = target.y;
    const back = new THREE.Vector3(m.w / 2 - c.x, 0, m.h / 2 - c.y).normalize().multiplyScalar(-1);
    if (!Number.isFinite(back.x)) back.set(-1, 0, 1).normalize();
    const span = m.w * TILE;
    // (A small map, a block in the editor: from as far as a battle's, so it all shows.)
    const view = Math.max(span, 45);
    // 20% closer in than it first was.
    this.camera.position
      .copy(target)
      .add(back.multiplyScalar(view * 0.55 * 0.8))
      .add(new THREE.Vector3(0, view * 0.75 * 0.8, 0));
    this.moon.target.position.set(span / 2, 0, (m.h * TILE) / 2);
    this.atmosphere.shadowsMoved();
    this.moon.position.set(span / 2 - 45, 75, (m.h * TILE) / 2 + 30);
    this.lz.visible = this.lzShown;
    this.lz.scale.set(3 * TILE, 3 * TILE, 1);
    this.lz.position.set(wc(c.x), c.z * LEVEL_H + SLAB + 0.01, wc(c.y));
  }

  /** How far below the floor's usual height a spot is: a town road (the kerb), else 0. */
  drop(p: { x: number; y: number; z: number }) {
    const m = this.map;
    if (!m || !this.kerb || Math.round(p.z) !== m.ground || Math.abs(p.z - m.ground) > 0.01)
      return 0;
    const x = Math.round(p.x),
      y = Math.round(p.y);
    return x >= 0 && y >= 0 && x < m.w && y < m.h && this.kerb.low[y * m.w + x] ? KERB : 0;
  }

  /** Show levels up to and including `z` (the cutaway). */
  setLevel(z: number) {
    if (!this.map) return;
    const next = Math.max(0, Math.min(this.map.levels - 1, z));
    if (next === this.level) return;
    this.level = next;
    this.baseY = next * LEVEL_H;
    this.geometry.rebuild();
    this.lz.visible = this.lzShown && next >= this.map.ground;
    for (const v of this.units.values()) {
      v.group.visible = v.spec.visible !== false && v.spec.z <= next && !v.spec.gone;
      this.figures.placeAbove(v, v.spec);
    }
    this.atmosphere.showLamps();
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

  disposeTree(o: THREE.Object3D) {
    o.traverse((n) => {
      if (n.userData.shared) return; // a shared model (an item's), freed with its cache
      if (n instanceof THREE.Mesh || n instanceof THREE.Sprite) {
        const m = n.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        m.dispose();
        if (n instanceof THREE.Mesh && n.geometry !== this.boxGeo) n.geometry.dispose();
      }
    });
  }

  dispose() {
    this.disposed = true;
    this.ambient = false;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.controls.dispose();
    this.geometry.dispose();
    this.figures.dispose();
    this.atmosphere.dispose();
    this.overlays.dispose();
    this.boxGeo.dispose();
    this.roadTex?.dispose();
    setRoadMap(null);
    this.renderer.dispose();
    // Give the context back now: the browser keeps only 16, and drops the oldest (the globe's).
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.atmosphere.sizeMirror();
  }

  // ----- What the UI calls, handed to the layers -----

  /** Smoothly centre the camera on a tile (across; its height follows the level shown). */
  focus(p: Pt3) {
    return this.input.focus(p);
  }

  /** Plays a list of battle events in order; resolves when done. Unseen ones are skipped. */
  play(events: BattleEventLike[]) {
    return this.playback.play(events);
  }

  /**
   * Aim lines: from a tile the player is about to move to, a red glow to each
   * enemy that could be attacked from there, pulses running toward it like
   * the path's. A target seen only by leaning out of full cover gets its
   * line from that side: out to the lean, then on. Null or none clears them.
   */
  setAimLines(from: Pt3 | null, targets: { at: Pt3; lean?: Pt3 }[] = []) {
    return this.overlays.setAimLines(from, targets);
  }

  /**
   * The CEP of a shot about to be fired: a ring round the aim point that half
   * the rounds would land within, and a faint one twice as wide (nearly all
   * of them). The cone is across the line of fire, but the rings are turned
   * to face the camera every frame, so they read as circles from above. Red
   * over an enemy; amber for force fire at a spot. Null clears it.
   */
  setCep(c: { at: M3; radius: number; from: M3; force?: boolean } | null) {
    return this.overlays.setCep(c);
  }

  /** Night: moonlight (`moon`, the lit share: darker at new moon, brighter at full), lamps lit. Day: sun and sky. Winter: overcast, the snow lighting it from below. */
  setDaylight(night: boolean, moon?: number) {
    return this.atmosphere.setDaylight(night, moon);
  }

  /** Burning tiles (index → turns left). */
  setFire(tiles: Pt3[]) {
    return this.figures.setFire(tiles);
  }

  /** Tiles a UV flare lights. */
  setUv(tiles: Pt3[]) {
    return this.figures.setUv(tiles);
  }

  /** Items lying on the ground: a small box each, long ones for weapons, a little stack where several lie. */
  setFloor(items: FloorItem[]) {
    return this.figures.setFloor(items);
  }

  /** Hands over the layer of head bars (see placeHeads); null to stop placing them. */
  setHeadLayer(el: HTMLElement | null) {
    return this.figures.setHeadLayer(el);
  }

  /** Loot crates lying on the map. */
  setLoot(items: Pt3[]) {
    return this.figures.setLoot(items);
  }

  /**
   * Where a selected unit can go: a glowing yellow outline round everywhere
   * its TU reach, and a blue one round where it still has time to attack
   * (tiles with `dash` set are yellow only). With a `tint`, the tiles are
   * filled instead (an incendiary's blast).
   */
  setMoveRange(tiles: { x: number; y: number; z: number; dash: boolean }[], tint?: number) {
    return this.overlays.setMoveRange(tiles, tint);
  }

  /** The path a move would take (its straight legs; drawn with the corners rounded), and the cover waiting at its end (index: +x, −x, +y, −y). */
  setPath(path: Pt3[] | null, dash = false, cover: number[] = []) {
    return this.overlays.setPath(path, dash, cover);
  }

  /** Bring the units in line with the battle (positions, health, who's seen). Call after any playback. */
  setUnits(units: UnitSpec[]) {
    return this.figures.setUnits(units);
  }

  /** Where a unit is drawn now (tiles; mid-move, rounded) and whether the team sees it, or null. */
  unitShownAt(id: string): (Pt3 & { seen: boolean }) | null {
    return this.figures.unitShownAt(id);
  }

  /** Shows or hides the landing zone's marker (the block editor has none). */
  showLandingZone(on: boolean) {
    return this.overlays.showLandingZone(on);
  }
}
