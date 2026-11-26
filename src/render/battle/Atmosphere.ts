// Light and weather: day or night and the moon, street lamps and the baked light volume, rain with its reflections, snow, and the ambient sound.
import * as THREE from "three";
import { sfx, type Loop, type SoundId } from "../../audio/sfx";
import { isTown, LIGHT_RADIUS, T, tileAt, type BattleMap, type Pt3 } from "../../tactical/map/map";
import { addLight, emptyVolume, volumeTexture, type PointLight } from "./lightVolume";
import { setVolume } from "../shaders/lamps";
import { setRainMap } from "../shaders/rain";
import { makeMaterial } from "../shaders/materials";
import { setRainFrame, setRainReflection } from "../shaders/rain";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { DOOR_LINTEL, KERB, LAMP_H, LEVEL_H, SLAB, TILE, WALL_T, wc } from "./scale";
import { facing, propMesh } from "./props";
import { BattleView } from "./BattleView";

/** Lamp light: warm street lamps, braziers and fire (linear colours). */
const LAMP_LIGHT = {
  street: new THREE.Color(1.0, 0.78, 0.5),
  ceiling: new THREE.Color(0.85, 0.92, 1.0),
  brazier: new THREE.Color(1.0, 0.5, 0.18),
  fire: new THREE.Color(1.0, 0.45, 0.12),
};
/** Drizzle: how fast it falls (m/s), each streak's length, and the wind's lean. */
const RAIN_SPEED = 7.5,
  RAIN_STREAK = 0.32,
  RAIN_SLANT = { x: 0.12, z: 0.05 };
/** How far a street lamp's head reaches out from its post (the street_lamp model). */
const STREET_LAMP_REACH = 1.0;

/** Light and weather: day or night and the moon, street lamps and the baked light volume, rain with its reflections, snow, and the ambient sound. */
export class Atmosphere {
  constructor(readonly view: BattleView) {}

  /** Drizzle on a wet map (null: dry): streaks falling. */
  rainfall: THREE.LineSegments | null = null;

  /** The street mirrored in its puddles (a rain map's; never in the scene, rendered by hand before each frame). */
  mirror: Reflector | null = null;
  readonly mirrorMat = new THREE.Matrix4();

  /** Falling snow on a winter map (null: none). */
  snowfall: THREE.Points | null = null;
  lightTex: THREE.Data3DTexture | null = null;
  readonly sky = new THREE.HemisphereLight(0x9aa8c8, 0x3a3028, 0.9);

  /** The ambience playing, by layer (wildlife, traffic, weather). */
  ambience = new Map<string, { id: SoundId; gain: number; loop: Loop }>();
  readonly lampGroup = new THREE.Group();
  readonly poleMat = makeMaterial("streetMetal", 0x2a2a2e);

  /** The lit share of the moon. */
  moonlit = 0.5;


  /** Night: moonlight (`moon`, the lit share: darker at new moon, brighter at full), lamps lit. Day: sun and sky. Winter: overcast, the snow lighting it from below. */
  setDaylight(night: boolean, moon = this.moonlit) {
    if (night !== this.view.night) ((this.view.lampLight = null), (this.view.lightDirty = true));
    this.view.night = night;
    this.moonlit = moon;
    // A half moon is the middle; nothing of it reaches a lair.
    const moonlight = this.view.map?.setting === "lair" ? 0.5 : moon;
    const winter = !!this.view.map?.winter,
      rain = !!this.view.map?.rain;
    this.setAmbience();
    this.sky.color.setHex(night ? 0x9aa8c8 : winter ? 0xdfe6f0 : rain ? 0xbcc4cc : 0xcfe0ff);
    this.sky.groundColor.setHex(
      night ? (winter ? 0x4a5060 : 0x3a3028) : winter ? 0x9aa0a8 : rain ? 0x4e5256 : 0x6a5a48,
    );
    this.sky.intensity = night
      ? (rain ? 0.75 : 0.9) * (0.82 + 0.36 * moonlight)
      : winter
        ? 2.2
        : rain
          ? 1.9
          : 1.9;
    this.view.moon.color.setHex(night ? 0xc8d4f0 : winter ? 0xf0f2f8 : rain ? 0xe4e8ee : 0xfff2dc);
    this.view.moon.intensity = night
      ? (rain ? 0.45 : 0.8) * (0.5 + 1.0 * moonlight)
      : winter
        ? 1.5
        : rain
          ? 1.0
          : 2.6;
    const bg = night
      ? winter
        ? 0x14171e
        : rain
          ? 0x101317
          : 0x0c0e14
      : winter
        ? 0x9aa3ae
        : rain
          ? 0x7a828c
          : 0x6f8aa8;
    (this.view.scene.background as THREE.Color).setHex(bg);
    if (night) (this.view.scene.background as THREE.Color).multiplyScalar(0.6 + 0.8 * moonlight);
    setRainFrame(
      0,
      (this.view.scene.background as THREE.Color).clone().multiplyScalar(night ? 1.6 : 1),
    );
    this.view.scene.fog!.color.copy(this.view.scene.background as THREE.Color);
    this.showLamps();
  }

  /** Lamp posts above ground, braziers below (their light is baked: lampLights). */
  placeLamps(m: BattleMap) {
    this.shadowsMoved();
    for (const c of [...this.lampGroup.children]) this.lampGroup.remove(c);
    for (const l of m.lights) {
      const base = l.z * LEVEL_H + SLAB;
      if (l.ceiling) {
        // A fitting: a flat panel under the ceiling (or a canopy), no post.
        const panel = new THREE.Mesh(this.view.boxGeo, this.view.lampMat);
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
          model.position.set(
            wc(l.x) + (dx * TILE) / 2,
            l.z * LEVEL_H + SLAB,
            wc(l.y) + (dy * TILE) / 2,
          );
          model.rotation.y = facing(-dx, -dy);
          model.userData.z = l.z;
          this.lampGroup.add(model);
          continue;
        }
        const p = this.wallLamp(l);
        const lamp = new THREE.Mesh(this.view.boxGeo, this.view.lampMat);
        lamp.scale.set(l.wall[0] ? 0.16 : 0.3, 0.22, l.wall[1] ? 0.16 : 0.3);
        lamp.position.copy(p);
        const arm = new THREE.Mesh(this.view.boxGeo, this.poleMat);
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
      const pole = new THREE.Mesh(this.view.boxGeo, this.poleMat);
      pole.scale.set(under ? 0.24 : 0.12, h, under ? 0.24 : 0.12);
      pole.position.set(wc(l.x), base + h / 2, wc(l.y));
      const lamp = new THREE.Mesh(this.view.boxGeo, under ? this.view.fireMat : this.view.lampMat);
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
  lampReach(m: BattleMap, l: Pt3): { x: number; y: number } {
    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const;
    const open = (dx: number, dy: number) => tileAt(m, l.x + dx, l.y + dy, l.z) === T.FLOOR;
    const road = dirs.find(
      ([dx, dy]) =>
        open(dx, dy) &&
        ["road", "tarmac"].includes(this.view.geometry.floorSkin(m, l.x + dx, l.y + dy, l.z)),
    );
    const [x, y] = road ?? dirs.find(([dx, dy]) => open(dx, dy)) ?? dirs[0];
    return { x, y };
  }

  /** Where a wall lamp hangs: on the wall face toward its tile, above the doorway. */
  wallLamp(l: { x: number; y: number; z: number; wall?: readonly [number, number] }) {
    const [dx, dy] = l.wall!;
    const d = TILE / 2 - WALL_T / 2 - 0.1;
    return new THREE.Vector3(
      wc(l.x) + dx * d,
      l.z * LEVEL_H + SLAB + LEVEL_H - SLAB - DOOR_LINTEL + 0.2,
      wc(l.y) + dy * d,
    );
  }

  /** Lamps on levels shown. */
  showLamps() {
    this.shadowsMoved();
    for (const c of this.lampGroup.children) c.visible = c.userData.z <= this.view.level;
  }

  /**
   * The lights that bake into the light volume: braziers and ceiling
   * fittings (shops, offices, corridors are lit by day too) always, street
   * lamps at night. Lit ground (the rules' LIGHT_RADIUS) is where the light
   * is strong; it fades out a tile beyond.
   */
  lampLights(m: BattleMap): PointLight[] {
    const range = (LIGHT_RADIUS + 1) * TILE;
    return m.lights
      .filter((l) => l.ceiling || l.z < m.ground || this.view.night)
      .map((l) => {
        const under = l.z < m.ground && !l.ceiling;
        if (l.ceiling)
          return {
            x: wc(l.x),
            y: l.z * LEVEL_H + SLAB + (l.h ?? LEVEL_H - SLAB - 0.08) - 0.12,
            z: wc(l.y),
            colour: LAMP_LIGHT.ceiling,
            power: 11,
            range,
          };
        if (l.wall) {
          // Just out from the wall, under the lamp (off the wall's own face, so the bake sees past it).
          const p = this.wallLamp(l);
          return {
            x: p.x - l.wall[0] * 0.15,
            y: p.y - 0.2,
            z: p.z - l.wall[1] * 0.15,
            colour: LAMP_LIGHT.street,
            power: 10,
            range,
          };
        }
        // A street lamp's head is a metre out from its post (render/battle/props.ts, street_lamp).
        const d = under ? { x: 0, y: 0 } : this.lampReach(m, l);
        return {
          x: wc(l.x) + d.x * STREET_LAMP_REACH,
          y: l.z * LEVEL_H + SLAB + (under ? LAMP_H.brazier + 0.16 : LAMP_H.street),
          z: wc(l.y) + d.y * STREET_LAMP_REACH,
          colour: under ? LAMP_LIGHT.brazier : LAMP_LIGHT.street,
          power: under ? 9 : 16,
          range,
        };
      });
  }

  /** Bakes what changed (the lamps once a map or the time of day; fire every time it changes) and uploads it. */
  bakeLight() {
    this.view.lightDirty = false;
    const m = this.view.map;
    if (!m) return;
    if (!this.view.lampLight) {
      this.view.lampLight = emptyVolume(m);
      for (const L of this.lampLights(m)) addLight(m, this.view.lampLight, L);
    }
    let v = this.view.lampLight;
    if (this.view.fires.length) {
      v = { ...v, rgb: v.rgb.slice() };
      for (const f of this.view.fires)
        addLight(m, v, {
          x: wc(f.x),
          y: f.z * LEVEL_H + SLAB + 0.5,
          z: wc(f.y),
          colour: LAMP_LIGHT.fire,
          power: 5,
          range: 2.5 * TILE,
        });
    }
    const same =
      this.lightTex &&
      this.lightTex.image.width === v.nx &&
      this.lightTex.image.height === v.nz &&
      this.lightTex.image.depth === v.ny;
    if (!same) this.lightTex?.dispose();
    this.lightTex = volumeTexture(v, same ? this.lightTex! : undefined);
    setVolume(this.lightTex, m);
  }

  // ----- Snowfall -----

  /** Flakes over the whole map, falling and drifting; none outside winter. */
  makeSnowfall(m: BattleMap) {
    if (this.snowfall) {
      this.view.scene.remove(this.snowfall);
      this.snowfall.geometry.dispose();
      (this.snowfall.material as THREE.Material).dispose();
      this.snowfall = null;
    }
    if (!m.winter) return;
    const n = Math.round(m.w * m.h * 2.5),
      top = m.levels * LEVEL_H + 8;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++)
      pos.set([Math.random() * m.w * TILE, Math.random() * top, Math.random() * m.h * TILE], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xf4f6fa,
      size: 0.09,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.snowfall = new THREE.Points(geo, mat);
    this.snowfall.frustumCulled = false;
    this.snowfall.userData = {
      top,
      phase: Float32Array.from({ length: n }, () => Math.random() * 6.28),
    };
    this.view.scene.add(this.snowfall);
  }

  fallSnow(dt: number, t: number) {
    const f = this.snowfall!,
      m = this.view.map!;
    const a = f.geometry.getAttribute("position") as THREE.BufferAttribute,
      p = a.array as Float32Array;
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
  makeRain(m: BattleMap) {
    if (this.rainfall) {
      this.view.scene.remove(this.rainfall);
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
    const n = Math.round(m.w * m.h * 1.6),
      top = m.levels * LEVEL_H + 8;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * m.w * TILE,
        y = Math.random() * top,
        z = Math.random() * m.h * TILE;
      pos.set(
        [x, y, z, x + RAIN_SLANT.x * RAIN_STREAK, y + RAIN_STREAK, z + RAIN_SLANT.z * RAIN_STREAK],
        i * 6,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xb4bec8,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.rainfall = new THREE.LineSegments(geo, mat);
    this.rainfall.frustumCulled = false;
    this.rainfall.userData = { top };
    this.view.scene.add(this.rainfall);
    // The mirror: a plane over the whole map at the street's height (a town's road, a kerb down; else the ground).
    const w = m.w * TILE,
      h = m.h * TILE;
    this.mirror = new Reflector(new THREE.PlaneGeometry(w, h), {
      clipBias: 0.003,
      multisample: 0,
      textureWidth: 512,
      textureHeight: 512,
    });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.set(
      w / 2,
      m.ground * LEVEL_H + SLAB - (isTown(m.setting) ? KERB : 0),
      h / 2,
    );
    this.mirror.updateMatrixWorld(true);
    this.sizeMirror();
  }

  /** The mirror at half the screen's resolution. */
  sizeMirror() {
    if (!this.mirror) return;
    const v = this.view.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.mirror
      .getRenderTarget()
      .setSize(Math.max(64, Math.round(v.x / 2)), Math.max(64, Math.round(v.y / 2)));
  }

  /** Renders the street mirrored, then hands it to the puddles (which mustn't sample it while it's drawn). */
  reflect(t: number) {
    const mr = this.mirror!;
    setRainReflection(null);
    this.view.camera.updateMatrixWorld();
    this.rainfall!.visible = false; // streaks in the puddles read as noise
    mr.onBeforeRender(
      this.view.renderer,
      this.view.scene,
      this.view.camera,
      mr.geometry,
      mr.material as THREE.Material,
      null as unknown as THREE.Group,
    );
    this.rainfall!.visible = true;
    const texMat = (mr.material as THREE.ShaderMaterial).uniforms.textureMatrix!
      .value as THREE.Matrix4;
    // Its matrix takes the plane's own coordinates: from the world, through the plane's inverse.
    this.mirrorMat.copy(texMat).multiply(new THREE.Matrix4().copy(mr.matrixWorld).invert());
    setRainReflection(mr.getRenderTarget().texture, this.mirrorMat, mr.position.y);
    setRainFrame(t);
  }

  fallRain(dt: number) {
    const f = this.rainfall!,
      m = this.view.map!;
    const a = f.geometry.getAttribute("position") as THREE.BufferAttribute,
      p = a.array as Float32Array;
    const { top } = f.userData as { top: number };
    const base = m.ground * LEVEL_H;
    const dy = -RAIN_SPEED * dt,
      dx = RAIN_SLANT.x * RAIN_SPEED * dt,
      dz = RAIN_SLANT.z * RAIN_SPEED * dt;
    for (let i = 0; i < p.length; i += 6) {
      let y = p[i + 1]! + dy,
        x = p[i]! - dx,
        z = p[i + 2]! - dz;
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

  /** Something that casts a shadow came, went or moved: redraw them with the next frame. */
  shadowsMoved() {
    this.view.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * The ambience, in layers that come and go on their own: wildlife in town
   * streets and the country (birds by day, crickets at night, none in winter,
   * quiet in the rain); traffic in the city (faint behind the wildlife in
   * town streets, lower at night); rain wherever it falls, wind over the
   * country in winter. Not under ground.
   */
  setAmbience() {
    const m = this.view.map;
    const want = new Map<string, { id: SoundId; gain: number }>();
    if (m && this.view.ambient && m.setting !== "lair" && m.setting !== "montsegur") {
      const wild = m.setting === "urban" || m.setting === "rural";
      if (wild && !m.rain && (!this.view.night || !m.winter))
        want.set("wildlife", { id: this.view.night ? "crickets" : "birds", gain: 1 });
      if (m.setting !== "rural")
        want.set("traffic", {
          id: "traffic",
          gain: (m.setting === "urban" ? 0.4 : 1) * (this.view.night ? 0.6 : 1),
        });
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
    for (const [layer, w] of want)
      if (!this.ambience.has(layer))
        this.ambience.set(layer, { ...w, loop: sfx.loop(w.id, w.gain) });
  }

  /** Each frame: snow and rain fall; the light volume is rebaked when something changed it. */
  update(dt: number, now: number) {
    if (this.snowfall && this.view.map) this.fallSnow(dt, now / 1000);
    if (this.rainfall && this.view.map) this.fallRain(dt);
    if (this.view.lightDirty) this.bakeLight();
  }

  dispose() {
    this.setAmbience();
    this.lightTex?.dispose();
    setVolume(null, null);
    this.view.rainTex?.dispose();
    setRainMap(null);
    if (this.view.map) this.makeRain({ ...this.view.map, rain: false });
  }
}
