// Item models for the battle view: the low-detail models in
// public/assets/items/models/ (built by scripts/build-items.py --low;
// docs/design/item-art.md), held in units' hands and lying on the ground.
// Only their geometry is used, drawn with the props' palette material.
//
// Model space (glTF): metres, +Y up. Held items: the origin at the firing
// hand, the muzzle toward +Z, the left side toward +X. Carried items stand on
// their base, its middle at the origin.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadProps, propMaterial } from "./props";

const geometries = new Map<string, THREE.BufferGeometry>();
const fetching = new Map<string, Promise<void>>();
const gltf = new GLTFLoader();

function fetchItem(name: string): Promise<void> {
  let p = fetching.get(name);
  if (!p) {
    p = gltf.loadAsync(`${import.meta.env.BASE_URL}assets/items/models/${name}.glb`).then((g) => {
      let geo: THREE.BufferGeometry | null = null;
      g.scene.traverse((o) => {
        if (o instanceof THREE.Mesh && !geo) geo = (o.geometry as THREE.BufferGeometry).clone();
      });
      if (geo) {
        (geo as THREE.BufferGeometry).computeBoundingBox();
        geometries.set(name, geo);
      }
    });
    p.catch((err) => console.warn(`item model ${name}:`, err));
    fetching.set(name, p);
  }
  return p;
}

/** Has this model been asked for (in, on its way, or failed)? */
export const itemRequested = (name: string) => fetching.has(name);

/** Fetches these item models (and the palette); resolves when they're in, or failed. */
export function loadItems(names: Iterable<string>): Promise<void> {
  const missing = [...new Set(names)].filter((n) => !geometries.has(n));
  return Promise.allSettled([loadProps(), ...missing.map(fetchItem)]).then(() => undefined);
}

/**
 * A mesh of the item model, or null while it (or the palette) is still loading.
 * Its geometry and material are shared: marked so disposeTree leaves them.
 */
export function itemMesh(name: string): THREE.Mesh | null {
  const geo = geometries.get(name);
  const mat = propMaterial();
  if (!geo || !mat) return null;
  const m = new THREE.Mesh(geo, mat);
  m.userData.shared = true;
  m.castShadow = true;
  return m;
}
