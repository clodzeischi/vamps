// Geoscape models: small glTF aircraft drawn as golden holograms over the
// globe (docs/design/ui.md, "Geoscape models"). Models are authored in metres
// in Blender and exported by scripts/export-geo-model.py (nose +Z, +Y up);
// here each kind is re-centred and fitted to its own size on the globe, since
// at true scale an airliner would be a few thousandths of a pixel.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Hired flights by their id, our own aircraft by their kind. */
export type GeoModelKind = "commercial" | "charter" | "jet" | "helicopter";

/** Longest side on the globe (radius 1). Smaller, and an airliner's thin wings shrink to a cross. */
const SIZE: Record<GeoModelKind, number> = { commercial: 0.05, charter: 0.04, jet: 0.05, helicopter: 0.035 };
const FILE: Record<GeoModelKind, string> = { commercial: "commercial_jet.glb", charter: "charter_jet.glb", jet: "leased_jet.glb", helicopter: "helicopter.glb" };

/**
 * The hologram: gold, additive, brightest where the surface turns away from
 * the eye (the silhouette's edge), and above the bloom threshold there so
 * the outline glows. Matches the "Holo Gold" material in the .blend files.
 */
export function holoMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBody: { value: new THREE.Color(1.0, 0.56, 0.1).multiplyScalar(0.8) },
      uRim: { value: new THREE.Color(1.0, 0.76, 0.32).multiplyScalar(1.7) },
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

/** Models built so far; anything else flies as a dot. */
export const hasGeoModel = (kind: string): kind is GeoModelKind => kind in FILE;

const loaded = new Map<GeoModelKind, THREE.Object3D>();
const pending = new Set<GeoModelKind>();
let material: THREE.ShaderMaterial | null = null;

function load(kind: GeoModelKind) {
  if (pending.has(kind)) return;
  pending.add(kind);
  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}assets/models/${FILE[kind]}`,
    (gltf) => {
      material ??= holoMaterial();
      const root = gltf.scene;
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = material!;
      });
      // Centre on the bounding box and fit the longest side.
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const k = SIZE[kind] / Math.max(size.x, size.y, size.z);
      root.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-k);
      root.scale.setScalar(k);
      const fitted = new THREE.Group();
      fitted.add(root);
      fitted.userData.shared = true; // geometry and material shared by every copy
      loaded.set(kind, fitted);
    },
    undefined,
    (err) => console.warn(`geoscape model ${kind}:`, err),
  );
}

/**
 * A copy of the model, oriented by its parent (nose +Z, up +Y), or null
 * while it loads (the caller asks again next frame).
 */
export function geoModel(kind: GeoModelKind): THREE.Object3D | null {
  const m = loaded.get(kind);
  if (!m) {
    load(kind);
    return null;
  }
  return m.clone();
}
