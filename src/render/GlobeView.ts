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
import { RegionMap, RegionStates } from "./RegionMap";
import { geoModel, hasGeoModel, rotorsOf, type GeoModelKind } from "./geoModels";

type GlobeMode = "menu" | "geoscape";

interface MarkerSpec {
  id: string;
  pos: LatLon;
  kind: "base" | "sigint" | "fuel" | "lead" | "site" | "lair" | "asset";
  /** Under construction: dimmed, no pulse. */
  pending?: boolean;
  /** HUMINT assets: which kind, for its glyph. */
  asset?: "access" | "pr" | "ratline" | "informant";
}

/** A ratline: an escape route over the ground, from an asset to where it leads. */
interface RouteSpec {
  id: string;
  from: LatLon;
  to: LatLon;
}

/** A team in the air (or on the ground at its target, when from == to). */
interface FlightSpec {
  id: string;
  from: LatLon;
  to: LatLon;
  /** Game times (ms) of wheels-up and arrival. */
  start: number;
  end: number;
  returning: boolean;
  /** Drawn as this model while in the air (a dot when none, or on the ground). */
  model?: GeoModelKind;
}

const MARKER_COLORS: Record<MarkerSpec["kind"], number> = {
  base: 0xe8c987,
  sigint: 0x7fc4d8,
  fuel: 0xf0a050,
  lead: 0xd8404a,
  site: 0xff2a3a,
  lair: 0xc23cff,
  asset: 0x8fd39a,
};

const ROUTE_COLOR = 0x8fd39a;

const FLIGHT_COLOR = 0xfff1d0;

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
  readonly position: THREE.Vector3;
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly phase = Math.random();
  private readonly speed: number;
  private readonly core: THREE.Mesh;
  /** Installations with a model (SIGINT stations) stand it on the ground in place of the disc. */
  private model: THREE.Object3D | null = null;

  constructor(readonly spec: MarkerSpec) {
    const color = MARKER_COLORS[spec.kind];
    this.speed = spec.kind === "lead" ? 1.1 : spec.kind === "site" ? 1.5 : spec.kind === "lair" ? 0.45 : spec.kind === "asset" ? 0.25 : 0.6;
    const core = new THREE.Mesh(
      // Leads are diamonds, sites triangles, lairs pentagons, installations discs.
      // Assets are small and green: access a square, PR a hexagon, a ratline a triangle, an informant a diamond.
      spec.kind === "lead" ? new THREE.CircleGeometry(0.0085, 4)
        : spec.kind === "site" ? new THREE.CircleGeometry(0.0095, 3)
        : spec.kind === "lair" ? new THREE.CircleGeometry(0.012, 5)
        : spec.kind === "fuel" ? new THREE.CircleGeometry(0.0065, 4, Math.PI / 4)
        : spec.kind === "asset" ? new THREE.CircleGeometry(0.0055, spec.asset === "pr" ? 6 : spec.asset === "ratline" ? 3 : 4, spec.asset === "access" ? Math.PI / 4 : Math.PI / 2)
        : new THREE.CircleGeometry(0.0065, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }),
    );
    core.material.color.multiplyScalar(2.2); // above the bloom threshold
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.0115, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    if (spec.pending) {
      core.material.color.multiplyScalar(0.25);
      this.ring.visible = false;
    }
    if (spec.kind === "asset") this.ring.scale.setScalar(0.6);
    this.core = core;
    this.group.add(core, this.ring);
    const p = latLonToVector3(spec.pos, 1.002);
    this.position = p;
    this.group.position.copy(p);
    this.group.lookAt(p.clone().multiplyScalar(2));
  }

  update(t: number) {
    if (!this.model && hasGeoModel(this.spec.kind)) {
      this.model = geoModel(this.spec.kind, this.spec.pending);
      if (this.model) {
        this.model.rotation.x = Math.PI / 2; // its up (+Y) along the group's +Z, away from the globe
        this.group.add(this.model);
        this.core.visible = false;
      }
    }
    const k = (t * this.speed + this.phase) % 1;
    this.ring.scale.setScalar((this.spec.kind === "asset" ? 0.6 : 1) * (1 + k * 2.4));
    this.ring.material.opacity = (1 - k) * 0.85;
  }

  dispose() {
    if (this.model) this.group.remove(this.model); // shares its geometry with every copy
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Flights: a great-circle arc lifted off the surface, and a bright head that
// moves along it with the game clock, or the aircraft's model, nose along the
// arc and belly to the ground.
// ---------------------------------------------------------------------------
class Flight {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  private readonly head: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly a: THREE.Vector3;
  private readonly b: THREE.Vector3;
  private readonly angle: number;
  private readonly lift: number;
  private model: THREE.Object3D | null = null;
  private readonly ahead = new THREE.Vector3();
  /** Rotors (helicopters): how fast they turn, 0..1, winding up and down. */
  private rotors: { node: THREE.Object3D; speed: number }[] = [];
  private spin = 0;
  private lastGameTime = NaN;
  private lastT = NaN;
  private movedAt = -Infinity;

  constructor(readonly spec: FlightSpec) {
    this.a = latLonToVector3(spec.from, 1).normalize();
    this.b = latLonToVector3(spec.to, 1).normalize();
    this.angle = this.a.angleTo(this.b);
    this.lift = Math.min(0.05, this.angle * 0.12);
    if (this.angle > 1e-4) {
      const pts = Array.from({ length: 65 }, (_, i) => this.at(i / 64, new THREE.Vector3()));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        geo,
        new THREE.LineDashedMaterial({ color: new THREE.Color(FLIGHT_COLOR).multiplyScalar(0.9), dashSize: 0.01, gapSize: 0.006, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      line.computeLineDistances();
      this.group.add(line);
    }
    this.head = new THREE.Mesh(
      new THREE.CircleGeometry(0.0055, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(FLIGHT_COLOR).multiplyScalar(2.4), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.halo = new THREE.Mesh(
      new THREE.RingGeometry(0.008, 0.0105, 32),
      new THREE.MeshBasicMaterial({ color: FLIGHT_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.group.add(this.head, this.halo);
  }

  /** Point on the arc, 0..1. */
  private at(t: number, out: THREE.Vector3) {
    if (this.angle < 1e-4) return out.copy(this.a).multiplyScalar(1.004);
    const s = Math.sin(this.angle);
    out.copy(this.a).multiplyScalar(Math.sin((1 - t) * this.angle) / s).addScaledVector(this.b, Math.sin(t * this.angle) / s);
    return out.normalize().multiplyScalar(1.004 + this.lift * Math.sin(Math.PI * t));
  }

  update(gameTime: number, t: number) {
    const span = this.spec.end - this.spec.start;
    const k = span > 0 ? THREE.MathUtils.clamp((gameTime - this.spec.start) / span, 0, 1) : 1;
    this.at(k, this.position);
    if (this.spec.model && this.angle > 1e-4 && !this.model) {
      this.model = geoModel(this.spec.model);
      if (this.model) {
        this.group.add(this.model);
        this.rotors = rotorsOf(this.model);
      }
    }
    if (this.model) {
      this.head.visible = this.halo.visible = false;
      // Nose along the arc: the direction to a point a little further on (from
      // a little behind, at the end), aimed from where the model is drawn.
      const dk = k < 0.999 ? 0.001 : -0.001;
      this.at(k + dk, this.ahead).sub(this.position).multiplyScalar(Math.sign(dk));
      this.model.up.copy(this.position).normalize();
      this.model.position.copy(this.position).addScaledVector(this.model.up, 0.004); // clear of the ground at take-off
      this.model.lookAt(this.ahead.add(this.model.position));
      // Rotors turn while it flies and the clock runs (paused, or waiting
      // to take off, they wind down).
      const dt = Number.isNaN(this.lastT) ? 0 : THREE.MathUtils.clamp(t - this.lastT, 0, 0.1);
      if (gameTime !== this.lastGameTime) this.movedAt = t;
      this.lastT = t;
      this.lastGameTime = gameTime;
      const flying = k > 0 && k < 1 && t - this.movedAt < 0.3;
      this.spin += ((flying ? 1 : 0) - this.spin) * Math.min(1, dt * 1.2);
      for (const r of this.rotors) r.node.rotateY(r.speed * this.spin * dt);
      return;
    }
    for (const m of [this.head, this.halo]) {
      m.position.copy(this.position);
      m.lookAt(this.position.clone().multiplyScalar(2));
    }
    const pulse = (t * 1.6) % 1;
    this.halo.scale.setScalar(1 + pulse * 1.5);
    this.halo.material.opacity = (1 - pulse) * 0.8;
  }

  dispose() {
    if (this.model) this.group.remove(this.model); // shares its geometry with every copy
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------

export class GlobeView {
  /** Left click on the globe: the point and its region index (0 = sea). */
  onPick: ((p: LatLon, region: number) => void) | null = null;
  /** The region under the pointer changed (0 = none). */
  onHover: ((region: number) => void) | null = null;
  /** A marker was clicked (its MarkerSpec id). Takes precedence over onPick. */
  onMarkerPick: ((id: string) => void) | null = null;
  regionMap: RegionMap | null = null;

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
  private readonly flights = new Map<string, Flight>();
  private readonly flightRoot = new THREE.Group();
  private readonly ringRoot = new THREE.Group();
  private readonly routeRoot = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private gameTime = Date.now();
  private frame = 0;
  private mode: GlobeMode = "menu";
  private hidden = false;
  private viewShift = 0.22; // fraction of width the globe is pushed right (menu)
  private targetShift = 0.22;
  private flyTarget: THREE.Vector3 | null = null;
  private downAt: { x: number; y: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private pointerDirty = false;
  private hoverIndex = 0;
  /** Placing a new installation: clicks go to the globe, not to markers. */
  private placing = false;
  private overlayTarget = 0;
  private readonly regionStates = new RegionStates();
  private readonly regionUniforms = {
    uRegionMap: { value: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat) as THREE.Texture },
    uRegionState: { value: this.regionStates.texture as THREE.Texture },
    uOverlay: { value: 0 },
    uSelected: { value: 0 },
    uHover: { value: 0 },
    uSupportView: { value: 0 },
  };

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
      Object.assign(shader.uniforms, this.regionUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform vec3 uSunDirView;
           uniform sampler2D uRegionMap;
           uniform sampler2D uRegionState;
           uniform float uOverlay, uSelected, uHover, uSupportView;
           float regionAt(vec2 uv) { return floor(texture2D(uRegionMap, uv).r * 255.0 + 0.5); }
           vec4 regionState(float id) { return texture2D(uRegionState, vec2((id + 0.5) / 256.0, 0.5)); }`,
        )
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
           totalEmissiveRadiance *= night * night;
           #ifdef USE_MAP
           if (uOverlay > 0.001) {
             // Region overlay: 1-pixel borders (offsets in screen space via fwidth),
             // SIGINT coverage, selection, hover and the optional support map.
             vec2 ruv = vMapUv;
             vec2 px = min(fwidth(ruv), vec2(0.002)) * 0.85;
             float id = regionAt(ruv);
             float a = regionAt(ruv + vec2(px.x, 0.0)), b = regionAt(ruv - vec2(px.x, 0.0));
             float c = regionAt(ruv + vec2(0.0, px.y)), d = regionAt(ruv - vec2(0.0, px.y));
             float edge = (a != id || b != id || c != id || d != id) ? 1.0 : 0.0;
             bool coast = id == 0.0 || a == 0.0 || b == 0.0 || c == 0.0 || d == 0.0;
             vec4 st = regionState(id);
             float lit = 1.0 - night * 0.6; // overlays read a little softer on the dark side
             vec3 o = vec3(0.0);
             if (id > 0.0) {
               float support = st.b * 255.0 / 25.0 - 5.0; // -5..+5
               // Support map: untinted at 0, deepening green toward +5 and red toward -5.
               float k = clamp(abs(support) / 5.0, 0.0, 1.0);
               vec3 supCol = support >= 0.0 ? vec3(0.15, 1.0, 0.3) : vec3(1.0, 0.08, 0.1);
               o += uSupportView * supCol * 0.32 * smoothstep(0.05, 1.0, k);
               o += st.r * vec3(0.2, 0.6, 0.8) * 0.06;                       // SIGINT (fainter for neighbours)
               if (id == uHover) o += vec3(0.85, 0.75, 0.55) * 0.07;
               if (id == uSelected) o += vec3(0.95, 0.75, 0.4) * 0.12;
             }
             vec3 border = coast ? vec3(0.75, 0.62, 0.38) * 0.22 : vec3(0.9, 0.72, 0.42) * 0.42;
             if (st.r > 0.5 && !coast) border = vec3(0.35, 0.8, 1.0) * 0.6;
             else if (st.r > 0.1 && !coast) border = mix(border, vec3(0.35, 0.8, 1.0) * 0.45, 0.6); // faint, from next door
             if (id == uSelected && id > 0.0) border = vec3(1.0, 0.82, 0.5) * 1.1;
             o += edge * border;
             totalEmissiveRadiance += o * uOverlay * lit;
           }
           #endif`,
        );
    };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), material);
    this.scene.add(this.earth);

    const outer = new THREE.Mesh(new THREE.SphereGeometry(1.08, 96, 48), this.atmosphereOuter);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 48), this.atmosphereInner);
    this.scene.add(outer, inner, this.markerRoot, this.ringRoot, this.routeRoot, this.flightRoot);

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
    this.controls.minDistance = 3;
    this.controls.maxDistance = 5;
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

    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerleave", this.onPointerLeave);

    RegionMap.load(asset("regions.png"))
      .then((map) => {
        this.regionMap = map;
        this.regionUniforms.uRegionMap.value = map.texture;
      })
      .catch((e) => console.error("Could not load the region map", e));

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
    this.overlayTarget = mode === "geoscape" ? 1 : 0;
    this.ringRoot.visible = mode === "geoscape";
    this.routeRoot.visible = mode === "geoscape";
    this.flightRoot.visible = mode === "geoscape";
  }

  /** Per-region display state: SIGINT coverage, installations, support. */
  setRegionStates(states: { index: number; coverage: number; installed: boolean; support: number }[]) {
    this.regionStates.clear();
    for (const r of states) this.regionStates.set(r.index, r.coverage, r.installed, r.support);
  }

  setSelectedRegion(index: number) {
    this.regionUniforms.uSelected.value = index;
  }

  setSupportView(on: boolean) {
    this.regionUniforms.uSupportView.value = on ? 1 : 0;
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

  setPlacing(on: boolean) {
    this.placing = on;
    this.renderer.domElement.style.cursor = on ? "crosshair" : "";
  }

  setBloom(enabled: boolean) {
    this.bloom.enabled = enabled;
  }

  setMarkers(specs: MarkerSpec[]) {
    // A marker's look depends on its spec, so a changed spec is a new marker.
    const keyOf = (s: MarkerSpec) => `${s.id}|${s.kind}|${s.pending ? 1 : 0}`;
    const keep = new Set(specs.map(keyOf));
    for (const [key, m] of this.markers)
      if (!keep.has(key)) {
        this.markerRoot.remove(m.group);
        m.dispose();
        this.markers.delete(key);
      }
    for (const s of specs) {
      const key = keyOf(s);
      if (this.markers.has(key)) continue;
      const m = new Marker(s);
      this.markers.set(key, m);
      this.markerRoot.add(m.group);
    }
  }

  setFlights(specs: FlightSpec[]) {
    const keyOf = (f: FlightSpec) => `${f.id}|${f.start}|${f.end}|${f.returning ? 1 : 0}`;
    const keep = new Set(specs.map(keyOf));
    for (const [key, f] of this.flights)
      if (!keep.has(key)) {
        this.flightRoot.remove(f.group);
        f.dispose();
        this.flights.delete(key);
      }
    for (const spec of specs) {
      const key = keyOf(spec);
      if (this.flights.has(key)) continue;
      const f = new Flight(spec);
      this.flights.set(key, f);
      this.flightRoot.add(f.group);
    }
  }

  /** What the rings and the routes were last drawn from: redrawn only when it changes. */
  private ringKey = "[]";
  private routeKey = "[]";

  /** Reach circles around bases: one per aircraft type present. */
  setRings(rings: { id: string; center: LatLon; radiusNm: number; color: number; dashed: boolean; strong: boolean }[]) {
    const key = JSON.stringify(rings);
    if (key === this.ringKey) return;
    this.ringKey = key;
    for (const child of [...this.ringRoot.children]) {
      const line = child as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.ringRoot.remove(line);
    }
    for (const r of rings) {
      const n = latLonToVector3(r.center, 1).normalize();
      const u = new THREE.Vector3(0, 1, 0).cross(n);
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      u.normalize();
      const v = new THREE.Vector3().crossVectors(n, u);
      const theta = r.radiusNm / 3440.065;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        const phi = (i / 160) * Math.PI * 2;
        pts.push(
          n.clone().multiplyScalar(Math.cos(theta))
            .addScaledVector(u, Math.sin(theta) * Math.cos(phi))
            .addScaledVector(v, Math.sin(theta) * Math.sin(phi))
            .multiplyScalar(1.0025),
        );
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const color = new THREE.Color(r.color).multiplyScalar(r.strong ? 1.6 : 0.9);
      const mat = r.dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.012, gapSize: 0.008, transparent: true, opacity: r.strong ? 0.9 : 0.45, depthWrite: false })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: r.strong ? 0.9 : 0.45, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      if (r.dashed) line.computeLineDistances();
      this.ringRoot.add(line);
    }
  }

  /** Ratlines: dashed routes hugging the ground (flights arc above it). */
  setRoutes(routes: RouteSpec[]) {
    const key = JSON.stringify(routes);
    if (key === this.routeKey) return;
    this.routeKey = key;
    for (const child of [...this.routeRoot.children]) {
      const line = child as THREE.Line;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.routeRoot.remove(line);
    }
    for (const r of routes) {
      const a = latLonToVector3(r.from, 1).normalize();
      const b = latLonToVector3(r.to, 1).normalize();
      const angle = a.angleTo(b);
      if (angle < 1e-4) continue;
      const s = Math.sin(angle);
      const pts = Array.from({ length: 97 }, (_, i) => {
        const t = i / 96;
        return a.clone().multiplyScalar(Math.sin((1 - t) * angle) / s).addScaledVector(b, Math.sin(t * angle) / s).normalize().multiplyScalar(1.0028);
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: new THREE.Color(ROUTE_COLOR).multiplyScalar(1.3), dashSize: 0.004, gapSize: 0.005, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      line.computeLineDistances();
      this.routeRoot.add(line);
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
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    this.regionMap?.texture.dispose();
    this.regionStates.texture.dispose();
    this.controls.dispose();
    for (const m of this.markers.values()) m.dispose();
    for (const f of this.flights.values()) f.dispose();
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

  /** Stop drawing while another view (the battlescape) has the screen. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.renderer.domElement.style.visibility = hidden ? "hidden" : "";
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.hidden) return;
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
    const u = this.regionUniforms.uOverlay;
    u.value += (this.overlayTarget - u.value) * Math.min(1, dt * 3);
    if (this.pointerDirty) {
      this.pointerDirty = false;
      this.updateHover();
    }
    for (const m of this.markers.values()) m.update(t);
    for (const f of this.flights.values()) f.update(this.gameTime, t);
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
    const marker = this.placing ? null : this.markerAt(e.clientX, e.clientY);
    if (marker) {
      this.onMarkerPick?.(marker);
      return;
    }
    const p = this.pickAt(e.clientX, e.clientY);
    if (p) this.onPick?.(p, this.regionMap?.indexAt(p) ?? 0);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
    this.pointerDirty = true;
  };

  private onPointerLeave = () => {
    this.pointer = null;
    this.pointerDirty = true;
  };

  /** Hover is resolved once per frame, not per mouse event. */
  private updateHover() {
    let index = 0;
    if (this.pointer && this.mode === "geoscape" && this.regionMap) {
      const p = this.pickAt(this.pointer.x, this.pointer.y);
      if (p) index = this.regionMap.indexAt(p);
    }
    if (index !== this.hoverIndex) {
      this.hoverIndex = index;
      this.regionUniforms.uHover.value = index;
      this.onHover?.(index);
    }
  }

  private readonly raycaster = new THREE.Raycaster();

  /** The visible marker or team nearest the pointer, within a few pixels; teams, then leads and sites, win ties. */
  private markerAt(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const camDir = this.camera.position.clone().normalize();
    let best: string | null = null;
    let bestD = 16;
    const consider = (pos: THREE.Vector3, id: string, bias: number) => {
      if (pos.clone().normalize().dot(camDir) < 0.15) return; // far side
      const p = pos.clone().project(this.camera);
      const x = rect.left + ((p.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - p.y) / 2) * rect.height;
      const d = Math.hypot(x - clientX, y - clientY) - bias;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    };
    for (const m of this.markers.values()) consider(m.position, m.spec.id, m.spec.kind === "lead" || m.spec.kind === "site" || m.spec.kind === "lair" ? 3 : 0);
    for (const f of this.flights.values()) consider(f.position, f.spec.id, 4);
    return best;
  }

  private pickAt(clientX: number, clientY: number): LatLon | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    return hit ? vector3ToLatLon(hit.point) : null;
  }
}
