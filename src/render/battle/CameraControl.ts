// The camera and input: focusing on a unit, panning and turning with the keys, the wheel stepping through levels, and the tile under the mouse.
import * as THREE from "three";
import { T, tileAt, type Pt3 } from "../../tactical/map/map";
import { LEVEL_H, SLAB, TILE, wc } from "./scale";
import { BattleView } from "./BattleView";

/** The camera and input: focusing on a unit, panning and turning with the keys, the wheel stepping through levels, and the tile under the mouse. */
export class CameraControl {
  constructor(readonly view: BattleView) {}

  focusTo: THREE.Vector3 | null = null;
  wheelAcc = 0;
  wheelAt = 0;
  wheelStepAt = 0;
  keys = new Set<string>();
  turn = 0;
  down: { x: number; y: number; button: number } | null = null;

  readonly ray = new THREE.Raycaster();
  readonly ndc = new THREE.Vector2();

  /** Smoothly centre the camera on a tile (across; its height follows the level shown). */
  focus(p: Pt3) {
    this.focusTo = new THREE.Vector3(wc(p.x), 0, wc(p.y));
  }

  /** Turn the camera 45° about its target (+1 clockwise). */
  turnCamera(dir: number) {
    this.turn += (dir * Math.PI) / 4;
  }

  /** The tile under the cursor: on the cut level, else the first level down with something there. */
  pickTile(e: PointerEvent): Pt3 | null {
    const m = this.view.map;
    if (!m) return null;
    const rect = this.view.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.view.camera);
    // A pin for an enemy above picks that enemy, where it really is.
    const pins = this.view.aboveGroup.children.filter((o) => o.visible);
    const pin = pins.length ? this.ray.intersectObjects(pins, false)[0] : undefined;
    const pinned = pin && this.view.units.get(pin.object.userData.unit as string)?.spec;
    if (pinned) return { x: pinned.x, y: pinned.y, z: pinned.z };
    const hit = new THREE.Vector3();
    for (let z = this.view.level; z >= 0; z--) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(z * LEVEL_H + SLAB));
      if (!this.ray.ray.intersectPlane(plane, hit)) continue;
      const x = Math.floor(hit.x / TILE),
        y = Math.floor(hit.z / TILE);
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      if (tileAt(m, x, y, z) !== T.VOID) return { x, y, z };
    }
    return null;
  }

  onMove = (e: PointerEvent) => {
    const p = this.pickTile(e);
    const same =
      p &&
      this.view.hovered &&
      p.x === this.view.hovered.x &&
      p.y === this.view.hovered.y &&
      p.z === this.view.hovered.z;
    if (same || (!p && !this.view.hovered)) return;
    this.view.hovered = p;
    this.view.onHover?.(p);
  };

  onDown = (e: PointerEvent) => {
    if (e.button === 0 || e.button === 2)
      this.down = { x: e.clientX, y: e.clientY, button: e.button };
  };

  /** A click is a press and release that barely moved; a right-drag pans instead. */
  onUp = (e: PointerEvent) => {
    const d = this.down;
    if (!d || e.button !== d.button) return;
    this.down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const p = this.pickTile(e);
    if (!p) return;
    if (e.button === 0) this.view.onPick?.(p);
    else this.view.onCommand?.(p);
  };

  /**
   * One level a notch. A mouse notch steps at once, however small its delta
   * (macOS sends a slow notch as a few pixels). A trackpad's stream of small
   * deltas steps on its first event, then once per ~120 px with a pause
   * between steps, so a swipe or its inertia doesn't race through the levels.
   */
  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (Math.abs(dy) < 0.5 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const now = performance.now();
    const fresh = now - this.wheelAt > 180; // a new gesture or a new notch after a pause
    this.wheelAt = now;
    if (fresh || Math.sign(dy) !== Math.sign(this.wheelAcc)) this.wheelAcc = 0;
    this.wheelAcc += dy;
    const big = Math.abs(dy) >= 50; // a mouse wheel notch, even spun fast
    if (
      !fresh &&
      !(big && now - this.wheelStepAt > 70) &&
      (Math.abs(this.wheelAcc) < 120 || now - this.wheelStepAt < 220)
    )
      return;
    this.view.onLevelStep?.(dy < 0 ? 1 : -1);
    this.wheelAcc = 0;
    this.wheelStepAt = now;
  };

  onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const c = this.view.cameraKeys;
    const pan = { [c.forward]: "w", [c.back]: "s", [c.left]: "a", [c.right]: "d" }[e.code];
    if (pan) this.keys.add(pan);
    if (e.code === c.rotateLeft) this.turnCamera(-1);
    if (e.code === c.rotateRight) this.turnCamera(1);
  };

  onKeyUp = (e: KeyboardEvent) => {
    const c = this.view.cameraKeys;
    const pan = { [c.forward]: "w", [c.back]: "s", [c.left]: "a", [c.right]: "d" }[e.code];
    if (pan) this.keys.delete(pan);
  };

  /** Each frame: WASD pans, Q/E turn, the base plane eases to the level shown, a glide to a unit goes on. */
  update(dt: number) {
    const { camera, controls } = this.view;
    // WASD pans on the ground, relative to where the camera faces.
    if (this.keys.size) {
      this.focusTo = null;
      const fwd = new THREE.Vector3()
        .subVectors(controls.target, camera.position)
        .setY(0)
        .normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const v = new THREE.Vector3();
      if (this.keys.has("w")) v.add(fwd);
      if (this.keys.has("s")) v.sub(fwd);
      if (this.keys.has("d")) v.add(right);
      if (this.keys.has("a")) v.sub(right);
      v.multiplyScalar(dt * 27);
      controls.target.add(v);
      camera.position.add(v);
    }
    // Q / E: ease the camera round its target.
    if (Math.abs(this.turn) > 1e-3) {
      const step = this.turn * Math.min(1, dt * 8);
      this.turn -= step;
      const off = camera.position
        .clone()
        .sub(controls.target)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      camera.position.copy(controls.target).add(off);
    }
    // The base plane eases to the level shown.
    const dy = this.view.baseY - controls.target.y;
    if (Math.abs(dy) > 1e-3) {
      const step = dy * Math.min(1, dt * 8);
      controls.target.y += step;
      camera.position.y += step;
    }
    if (this.focusTo) {
      const d = this.focusTo.clone().setY(controls.target.y).sub(controls.target);
      const step = d.clone().multiplyScalar(Math.min(1, dt * 5));
      controls.target.add(step);
      camera.position.add(step);
      if (d.length() < 0.03) this.focusTo = null;
    }
  }

  dispose() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
