// The battlescape prop kit: low-poly models from public/assets/props/ (built
// by scripts/build-props.py; docs/design/tooling.md, "Props"). Every prop
// shares one material: a palette of flat swatches for colour, roughness and
// metalness, and glow, each face's UVs on one swatch. The models are only
// looks: the rules still see tiles and edges.
//
// Model space (glTF): metres, +Y up, the front (the street, for a piece on an
// outside wall) toward +Z. Edge pieces run along X, centred on the tile
// edge; corner pieces have the building toward +X and -Z.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LAMPS } from "./shaders/lamps";
import { shaded } from "./shaders/patch";
import { RAIN } from "./shaders/rain";
import { SNOW } from "./shaders/snow";

export const PROP_NAMES = [
  "window_casement", "window_modern", "window_blinds", "door_frame", "door_wood", "door_steel",
  "plinth", "plinth_corner", "band_course", "band_corner", "cornice", "cornice_corner", "quoins",
  "downpipe", "gutter", "awning", "ac_unit", "wall_lamp",
  "street_lamp", "bollard", "bench", "litter_bin", "dumpster", "jersey_barrier", "utility_pole",
  "utility_cabinet", "manhole", "drain_grate", "planter", "crate", "pallet", "oil_drum", "cardboard_boxes",
  "desk", "desk_computer", "office_chair", "chair", "table", "filing_cabinet", "shelving", "wardrobe",
  "bed", "sofa", "tv_stand", "server_rack", "locker",
  "concrete_barrier", "railing_low", "stop_sign",
] as const;
export type PropName = (typeof PROP_NAMES)[number];

const geometries = new Map<PropName, THREE.BufferGeometry>();
let material: THREE.MeshStandardMaterial | null = null;
let loading: Promise<void> | null = null;

/** A palette texture: one flat colour per swatch, so no filtering or mipmaps (they'd bleed neighbours in). */
function swatches(tex: THREE.Texture, colour: boolean) {
  tex.flipY = false; // glTF's UV convention
  tex.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Loads the kit once (all props and the palette); resolves when every prop is in. */
export function loadProps(): Promise<void> {
  if (loading) return loading;
  const base = `${import.meta.env.BASE_URL}assets/props/`;
  const tl = new THREE.TextureLoader();
  const tex = (name: string, colour: boolean) => tl.loadAsync(base + name).then((t) => swatches(t, colour));
  const gl = new GLTFLoader();
  loading = Promise.all([
    tex("palette.png", true), tex("palette_mr.png", false), tex("palette_em.png", true),
    ...PROP_NAMES.map((n) =>
      gl.loadAsync(`${base}${n}.glb`).then((g) => {
        let geo: THREE.BufferGeometry | null = null;
        g.scene.traverse((o) => {
          if (o instanceof THREE.Mesh && !geo) geo = (o.geometry as THREE.BufferGeometry).clone();
        });
        if (geo) geometries.set(n, geo);
      }),
    ),
  ]).then(([map, mr, em]) => {
    // Lit like the rest of the scenery: snow on what faces the sky, the lamps' baked light.
    material = shaded(new THREE.MeshStandardMaterial({
      map, roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: 1,
      emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1,
    }), SNOW, RAIN, LAMPS);
  });
  loading.catch((err) => console.warn("battlescape props:", err));
  return loading;
}

export const propsReady = () => material !== null && geometries.size === PROP_NAMES.length;

/**
 * Props gathered while a level is built, then drawn as one instanced mesh
 * per kind.
 */
export class PropBatch {
  private readonly at = new Map<PropName, THREE.Matrix4[]>();

  add(name: PropName, m: THREE.Matrix4) {
    (this.at.get(name) ?? this.at.set(name, []).get(name)!).push(m.clone());
  }

  meshes(): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const [name, ms] of this.at) {
      const geo = geometries.get(name);
      if (!geo || !material || !ms.length) continue;
      const mesh = new THREE.InstancedMesh(geo, material, ms.length);
      ms.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.props = true; // shared geometry: dispose the instances only
      out.push(mesh);
    }
    return out;
  }
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Placed at (x, y, z), turned `rot` about the vertical (0: front toward +Z), optionally scaled. */
export function place(x: number, y: number, z: number, rot = 0, scale: number | THREE.Vector3 = 1): THREE.Matrix4 {
  const s = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : scale;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(_up, rot), s);
}

/** The turn that points a model's front (+Z) along (dx, dz). */
export const facing = (dx: number, dz: number) => Math.atan2(dx, dz);

/** The turn for a corner piece whose building lies toward (bx, bz) (each ±1). */
export const cornerTurn = (bx: number, bz: number) => (bx > 0 ? (bz < 0 ? 0 : -Math.PI / 2) : bz < 0 ? Math.PI / 2 : Math.PI);

/** One prop as its own mesh (lamps, which the lamp group shows and hides by level), or null before the kit is in. */
export function propMesh(name: PropName): THREE.Mesh | null {
  const geo = geometries.get(name);
  if (!geo || !material) return null;
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
