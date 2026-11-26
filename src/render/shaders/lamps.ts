// Lamp light: reads the baked light volume (render/battle/lightVolume.ts) at each
// surface, nudged off it along its normal so a wall's face reads the light on
// its own side, and adds it as diffuse light.
import * as THREE from "three";
import type { BattleMap } from "../../tactical/map/map";
import { LEVEL_H, TILE } from "../battle/scale";
import { shaded, type Feature } from "./patch";

/** Shared by every lit material: the volume, its size in metres, and on or off. */
const uniforms = {
  lightVol: { value: null as THREE.Data3DTexture | null },
  lvSize: { value: new THREE.Vector3(1, 1, 1) },
  lvOn: { value: 0 },
};

export function setVolume(tex: THREE.Data3DTexture | null, m: BattleMap | null) {
  uniforms.lightVol.value = tex;
  uniforms.lvOn.value = tex ? 1 : 0;
  if (m) uniforms.lvSize.value.set(m.w * TILE, m.levels * LEVEL_H, m.h * TILE);
}

export const LAMPS: Feature = {
  name: "lamps",
  uniforms,
  decl: /* glsl */ `
uniform highp sampler3D lightVol;
uniform vec3 lvSize;
uniform float lvOn;
`,
  light: /* glsl */ `
if ( lvOn > 0.5 ) {
  vec3 lvq = ( vWPos + normalize( vWN ) * 0.22 ) / lvSize;
  reflectedLight.directDiffuse += texture( lightVol, vec3( lvq.x, lvq.z, lvq.y ) ).rgb * material.diffuseColor;
}`,
};

/** A standard material lit by the lamps (and nothing else patched in). */
export const litByLamps = <M extends THREE.MeshStandardMaterial>(mat: M): M => shaded(mat, LAMPS);
