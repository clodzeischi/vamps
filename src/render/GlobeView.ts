// The geoscape globe: a PBR Earth lit by the real sun position for the game
// clock, with city lights on the night side, an atmosphere, stars, bloom and
// animated markers. Pure Three.js; React only owns the container element.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { subsolarPoint, type LatLon } from "../sim/time";
import { latLonToVector3, vector3ToLatLon } from "./geo";

export type GlobeMode = "menu" | "geoscape";

export interface MarkerSpec {
  id: string;
  pos: LatLon;
  kind: "base" | "sigint" | "lead";
}

const MARKER_COLORS: Record<MarkerSpec["kind"], number> = {
  base: 0xe8c987,
  sigint: 0x7fc4d8,
  lead: 0xd8404a,
};

const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;

// ---------------------------------------------------------------------------
// Atmosphere. Shared colour: blue by day, warm at the terminator, dark at night.
// ---------------------------------------------------------------------------
const ATMOSPHERE_COLOR = /* glsl */ `
  vec3 atmosphereColor(vec3 n, vec3 sunDir) {
    float sun = dot(n, sunDir);
    float day = smoothstep(-0.3, 0.4, sun);
    float dusk = smoothstep(-0.28, 0.0, sun) * (1.0 - smoothstep(0.0, 0.3, sun));
    vec3 col = mix(vec3(0.015, 0.02, 0.05), vec3(0.3, 0.55, 1.0), day);
    return mix(col, vec3(1.0, 0.42, 0.22), dusk * 0.5) * (0.08 + day);
  }`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/**
 * The halo around the limb, drawn on the back faces of a larger shell. Its
 * brightness depends on how close the view ray passes to the planet, so it
 * hugs the limb and fades to nothing at the shell's edge.
 */
function haloMaterial(shellRadius: number) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uShell: { value: shellRadius } },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uShell;
      varying vec3 vWorldPos;
      ${ATMOSPHERE_COLOR}
      void main() {
        vec3 dir = normalize(vWorldPos - cameraPosition);
        float closest = length(cross(cameraPosition, dir));       // ray's nearest approach to the centre
        float h = clamp((closest - 1.0) / (uShell - 1.0), 0.0, 1.0); // 0 at the limb, 1 at the shell edge
        float glow = pow(1.0 - h, 3.0);
        vec3 limbPoint = normalize(cameraPosition + dir * dot(-cameraPosition, dir));
        gl_FragColor = vec4(atmosphereColor(limbPoint, uSunDir) * glow * 2.2, 1.0);
      }`,
  });
}

/** Haze over the disc itself, strongest toward the limb (Fresnel). */
function hazeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      ${ATMOSPHERE_COLOR}
      void main() {
        vec3 n = normalize(vWorldPos);
        vec3 v = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.5);
        gl_FragColor = vec4(atmosphereColor(n, uSunDir) * fres * 1.4, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------
// Markers: a bright core plus an expanding pulse ring, sitting on the surface.
// ---------------------------------------------------------------------------
class Marker {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly phase = Math.random();

  constructor(readonly spec: MarkerSpec) {
    const color = MARKER_COLORS[spec.kind];
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.0065, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }),
    );
    core.material.color.multiplyScalar(2.2); // above the bloom threshold
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.0115, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.group.add(core, this.ring);
    const p = latLonToVector3(spec.pos, 1.002);
    this.group.position.copy(p);
    this.group.lookAt(p.clone().multiplyScalar(2));
  }

  update(t: number) {
    const k = (t * 0.6 + this.phase) % 1;
    this.ring.scale.setScalar(1 + k * 2.4);
    this.ring.material.opacity = (1 - k) * 0.85;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------

export class GlobeView {
  onPick: ((p: LatLon) => void) | null = null;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly earth: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly sun = new THREE.DirectionalLight(0xfff4e6, 3.2);
  private readonly sunDir = new THREE.Vector3(1, 0, 0);
  private readonly sunDirView = { value: new THREE.Vector3(1, 0, 0) };
  private readonly atmosphereOuter = haloMaterial(1.08);
  private readonly atmosphereInner = hazeMaterial();
  private readonly markers = new Map<string, Marker>();
  private readonly markerRoot = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private gameTime = Date.now();
  private frame = 0;
  private mode: GlobeMode = "menu";
  private viewShift = 0.22; // fraction of width the globe is pushed right (menu)
  private targetShift = 0.22;
  private flyTarget: THREE.Vector3 | null = null;
  private downAt: { x: number; y: number } | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = "globe-canvas";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x020204);
    this.camera.position.set(0, 0.9, 4.6);

    // ----- Earth -----
    const loader = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const tex = (file: string, srgb: boolean) => {
      const t = loader.load(asset(`earth/${file}`));
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = maxAniso;
      return t;
    };
    const material = new THREE.MeshStandardMaterial({
      map: tex("earth_daymap.jpg", true),
      normalMap: tex("earth_normal_map.jpg", false),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: tex("earth_specular_map.png", false),
      roughness: 1,
      metalness: 0,
      emissiveMap: tex("earth_nightmap.jpg", true),
      emissive: new THREE.Color(0xffc98a),
      emissiveIntensity: 2.4,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDirView = this.sunDirView;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uSunDirView;")
        // The "specular" map is white over water: water is glossy, land is matte.
        .replace(
          "#include <roughnessmap_fragment>",
          `float roughnessFactor = roughness;
           #ifdef USE_ROUGHNESSMAP
             float waterMask = texture2D(roughnessMap, vRoughnessMapUv).g;
             roughnessFactor = mix(0.9, 0.55, waterMask);
           #endif`,
        )
        // City lights only on the night side, fading through twilight.
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           float sunDot = dot(normalize(vNormal), uSunDirView);
           float night = smoothstep(0.12, -0.22, sunDot);
           totalEmissiveRadiance *= night * night;`,
        );
    };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), material);
    this.scene.add(this.earth);

    const outer = new THREE.Mesh(new THREE.SphereGeometry(1.08, 96, 48), this.atmosphereOuter);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 48), this.atmosphereInner);
    this.scene.add(outer, inner, this.markerRoot);

    // ----- Light -----
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0x223355, 0x050308, 0.08));

    // ----- Stars -----
    this.scene.add(this.makeStars());

    // ----- Controls -----
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.45;
    this.controls.maxDistance = 7;
    this.controls.zoomSpeed = 0.7;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener("start", () => (this.flyTarget = null));

    // ----- Post -----
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ----- Input & sizing -----
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.setMode("menu");
    this.setTime(Date.now());
    this.loop();
  }

  // ----- Public API -----

  setMode(mode: GlobeMode) {
    this.mode = mode;
    this.targetShift = mode === "menu" ? 0.22 : 0.0;
    this.controls.autoRotate = mode === "menu";
    this.controls.enabled = mode === "geoscape";
  }

  /** Lights the globe for the given game time (UTC ms). Ignored on the menu. */
  setTime(ms: number) {
    this.gameTime = ms;
  }

  private updateSun() {
    if (this.mode === "menu") {
      // Title screen: light from behind and to the left of the camera so the
      // terminator crosses the disc and city lights show on the right.
      const fwd = this.camera.position.clone().normalize();
      const right = new THREE.Vector3().crossVectors(this.camera.up, fwd).normalize();
      const up = new THREE.Vector3().crossVectors(fwd, right);
      this.sunDir.copy(fwd.multiplyScalar(0.35)).addScaledVector(right, -1).addScaledVector(up, 0.3).normalize();
    } else {
      latLonToVector3(subsolarPoint(this.gameTime), 1, this.sunDir).normalize();
    }
    this.sun.position.copy(this.sunDir).multiplyScalar(10);
    this.atmosphereOuter.uniforms.uSunDir!.value.copy(this.sunDir);
    this.atmosphereInner.uniforms.uSunDir!.value.copy(this.sunDir);
  }

  setBloom(enabled: boolean) {
    this.bloom.enabled = enabled;
  }

  setMarkers(specs: MarkerSpec[]) {
    const keep = new Set(specs.map((s) => s.id));
    for (const [id, m] of this.markers)
      if (!keep.has(id)) {
        this.markerRoot.remove(m.group);
        m.dispose();
        this.markers.delete(id);
      }
    for (const s of specs) {
      if (this.markers.has(s.id)) continue;
      const m = new Marker(s);
      this.markers.set(s.id, m);
      this.markerRoot.add(m.group);
    }
  }

  /** Smoothly turns the camera to look down on a location. */
  flyTo(p: LatLon, distance?: number) {
    const d = distance ?? this.camera.position.length();
    this.flyTarget = latLonToVector3(p, THREE.MathUtils.clamp(d, this.controls.minDistance, this.controls.maxDistance));
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    for (const m of this.markers.values()) m.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const mat = o.material as THREE.Material & Record<string, unknown>;
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ----- Internals -----

  private makeStars() {
    const n = 5000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 40);
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(0.55 + Math.random() * 0.12, 0.35, 0.45 + Math.random() * 0.5);
      if (Math.random() < 0.15) c.setHSL(0.08, 0.6, 0.7);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.18, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }),
    );
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyViewShift();
  }

  private applyViewShift() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    // A view offset moves the globe sideways on screen without moving the camera.
    this.camera.setViewOffset(w, h, -w * this.viewShift, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();

    if (Math.abs(this.viewShift - this.targetShift) > 1e-4) {
      this.viewShift += (this.targetShift - this.viewShift) * Math.min(1, dt * 2.5);
      this.applyViewShift();
    }
    if (this.mode === "menu") {
      // Drift in to a comfortable distance for the title screen.
      const want = 3.4;
      const len = this.camera.position.length();
      this.camera.position.multiplyScalar(1 + (want - len) / len * Math.min(1, dt * 0.8));
    }
    if (this.flyTarget) {
      // Slerp the camera direction and lerp its distance toward the target.
      const cur = this.camera.position;
      const dir = cur.clone().normalize().lerp(this.flyTarget.clone().normalize(), Math.min(1, dt * 3)).normalize();
      const len = THREE.MathUtils.lerp(cur.length(), this.flyTarget.length(), Math.min(1, dt * 3));
      cur.copy(dir.multiplyScalar(len));
      if (cur.distanceTo(this.flyTarget) < 0.002) this.flyTarget = null;
    }
    // Slower rotation when zoomed in.
    this.controls.rotateSpeed = THREE.MathUtils.clamp((this.camera.position.length() - 1) * 0.35, 0.08, 0.9);
    this.controls.update();
    this.updateSun();

    this.sunDirView.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse);
    for (const m of this.markers.values()) m.update(t);
    this.composer.render(dt);
  };

  private onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.downAt || this.mode !== "geoscape") return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > 4 || e.button !== 0) return; // that was a drag
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.earth, false)[0];
    if (hit) this.onPick?.(vector3ToLatLon(hit.point));
  };
}
