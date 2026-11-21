// Geoscape models: small glTF aircraft and installations drawn as holograms
// over the globe (docs/design/ui.md, "Geoscape models"). One rule for all of
// them, set in Blender (scripts/export-geo-model.py): 1 metre = GEO_SCALE
// globe units, the origin is where the model sits (an aircraft's centre, an
// installation's ground), nose +Z and up +Y once exported, and the
// material's name picks the hologram's palette.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Hired flights by their id, our own aircraft by their kind, installations by theirs. */
const KINDS = ["commercial", "charter", "jet", "helicopter", "sigint", "base", "asset"] as const;
export type GeoModelKind = (typeof KINDS)[number];

/** Globe units per Blender metre: an airliner modelled 50 m across shows 0.05 (about 25 px). */
const GEO_SCALE = 0.001;

/**
 * Hologram palettes by material name: body and rim colour. Gold for aircraft,
 * blue for SIGINT, pale brass for bases and green for HUMINT assets (their
 * markers' colours).
 */
const PALETTES: Record<string, { body: THREE.Color; rim: THREE.Color }> = {
  "Holo Gold": { body: new THREE.Color(1.0, 0.56, 0.1).multiplyScalar(0.8), rim: new THREE.Color(1.0, 0.76, 0.32).multiplyScalar(1.7) },
  // Installations are dimmer: their big faces overlap, and additive colour soon burns to white.
  "Holo Blue": { body: new THREE.Color(0.08, 0.32, 1.0).multiplyScalar(0.45), rim: new THREE.Color(0.3, 0.7, 1.0).multiplyScalar(1.0) },
  // Paler and whiter than the aircraft's gold, so a jet leaving a base stands out.
  "Holo Brass": { body: new THREE.Color(1.0, 0.7, 0.35).multiplyScalar(0.2), rim: new THREE.Color(1.0, 0.88, 0.65).multiplyScalar(0.9) },
  "Holo Green": { body: new THREE.Color(0.2, 0.85, 0.4).multiplyScalar(0.3), rim: new THREE.Color(0.6, 1.0, 0.7).multiplyScalar(1.0) },
};

/**
 * The hologram: additive, brightest where the surface turns away from the
 * eye (the silhouette's edge), and above the bloom threshold there so the
 * outline glows. Dimmed (a quarter) for installations still being built.
 */
export function holoMaterial(palette = "Holo Gold", dim = false): THREE.ShaderMaterial {
  const p = PALETTES[palette] ?? PALETTES["Holo Gold"]!;
  const k = dim ? 0.25 : 1;
  return new THREE.ShaderMaterial({
    uniforms: {
      uBody: { value: p.body.clone().multiplyScalar(k) },
      uRim: { value: p.rim.clone().multiplyScalar(k) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBody;
      uniform vec3 uRim;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float facing = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(facing, 1.5);
        gl_FragColor = vec4(mix(uBody, uRim, rim), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

const materials = new Map<string, THREE.ShaderMaterial>();
function material(palette: string, dim: boolean) {
  const key = `${palette}${dim ? "|dim" : ""}`;
  let m = materials.get(key);
  if (!m) materials.set(key, (m = holoMaterial(palette, dim)));
  return m;
}

/**
 * Rotors: nodes named "*_rotor" spin about their own Y (the hub's axis) at
 * full speed, radians per real second. Slower than life, so a few-pixel
 * rotor reads as turning rather than flickering.
 */
const ROTOR_SPEED: Record<string, number> = { main_rotor: 14, tail_rotor: 32 };

export function rotorsOf(model: THREE.Object3D): { node: THREE.Object3D; speed: number }[] {
  const out: { node: THREE.Object3D; speed: number }[] = [];
  model.traverse((o) => {
    if (o.name.endsWith("_rotor")) out.push({ node: o, speed: ROTOR_SPEED[o.name] ?? 14 });
  });
  return out;
}

/** Models built so far; anything else is drawn as a dot. */
export const hasGeoModel = (kind: string): kind is GeoModelKind => (KINDS as readonly string[]).includes(kind);

const loaded = new Map<GeoModelKind, THREE.Object3D>();
const pending = new Set<GeoModelKind>();

/** Each mesh gets the shader for its material's name (kept in userData for the dim copies). */
function holo(o: THREE.Object3D, dim: boolean) {
  o.traverse((m) => {
    if (!(m instanceof THREE.Mesh)) return;
    m.userData.palette ??= (m.material as THREE.Material).name;
    m.material = material(m.userData.palette, dim);
  });
}

function load(kind: GeoModelKind) {
  if (pending.has(kind)) return;
  pending.add(kind);
  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}assets/models/${kind}.glb`,
    (gltf) => {
      const root = gltf.scene;
      holo(root, false);
      root.scale.setScalar(GEO_SCALE);
      root.userData.shared = true; // geometry and material shared by every copy
      loaded.set(kind, root);
    },
    undefined,
    (err) => console.warn(`geoscape model ${kind}:`, err),
  );
}

/**
 * A copy of the model, placed and oriented by its parent (origin where it
 * sits, nose +Z, up +Y), or null while it loads (the caller asks again next
 * frame). Dim: an installation still being built.
 */
export function geoModel(kind: GeoModelKind, dim = false): THREE.Object3D | null {
  const m = loaded.get(kind);
  if (!m) {
    load(kind);
    return null;
  }
  const copy = m.clone();
  if (dim) holo(copy, true);
  return copy;
}
