// Snow, for winter maps: laid over every scenery material, on faces that
// look up at the open sky.
//
// Where the sky is open comes from snowMap(): one texel per ground tile. Red
// is the level of the topmost thing over the tile (its roof, or the ground
// itself). Green is how much snow its ground holds: lawns full, pavements
// cleared a little, roads slushy. A face gets snow when it faces up and lies
// at or above that top level, so floors indoors, basements and the walls
// under a roof stay clear; roofs, parapets, car roofs and tree crowns are
// covered.
//
// Snow fills in the surface's relief (sH eases to a soft drift), and it is
// matte.
import * as THREE from "three";
import { T, tileAt, skinAt, type BattleMap, type Skin } from "../../tactical/map/map";
import type { Feature } from "./patch";

/** How much of a tile's ground keeps its snow (0–1), by what it's paved with. */
const COVER: Partial<Record<Skin, number>> = {
  grass: 1,
  dirt: 0.95,
  hedge: 1,
  tree: 1,
  fence: 1,
  hay: 1,
  grave: 1,
  rock: 0.9,
  rubble: 0.9,
  pavement: 0.5,
  stone: 0.6,
  roof: 0.95,
  parapet: 0.95,
  tarmac: 0.45,
  road: 0.28,
  car: 0.85,
  truck: 0.85,
  bench: 0.9,
  bin: 0.9,
  crate: 0.9,
  wood: 0.8,
  planks: 0.8,
};

/** The snow map for a map (null: no snow). `under(x, y)` is the ground's surface under a vehicle. */
export function snowMap(
  m: BattleMap,
  under: (x: number, y: number) => Skin | null,
): THREE.DataTexture {
  const data = new Uint8Array(m.w * m.h * 4);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      let top = m.ground;
      for (let z = m.levels - 1; z >= 0; z--)
        if (tileAt(m, x, y, z) !== T.VOID) {
          top = z;
          break;
        }
      const skin = top === m.ground ? (under(x, y) ?? skinAt(m, x, y, top)) : skinAt(m, x, y, top);
      const i = (y * m.w + x) * 4;
      data[i] = top;
      data[i + 1] = Math.round((COVER[skin] ?? 0.8) * 255);
      // Blue: a road's slush is grey with dirt.
      data[i + 2] = skin === "road" || skin === "tarmac" ? 255 : 0;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, m.w, m.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1);
empty.needsUpdate = true;
const uniforms = { snMap: { value: empty as THREE.Texture }, snOn: { value: 0 } };

/** Hands the shader the current map's snow map (null: no snow). */
export function setSnowMap(tex: THREE.Texture | null) {
  uniforms.snMap.value = tex ?? empty;
  uniforms.snOn.value = tex ? 1 : 0;
}

export const SNOW: Feature = {
  name: "snow",
  uniforms,
  decl: /* glsl */ `
uniform sampler2D snMap;
uniform float snOn;
`,
  color: /* glsl */ `
float snCover = 0.0;
if ( snOn > 0.5 ) {
  vec2 snP = vWPos.xz;
  ivec2 snTc = clamp( ivec2( floor( snP / S_TILE ) ), ivec2( 0 ), textureSize( snMap, 0 ) - 1 );
  vec4 snInfo = texelFetch( snMap, snTc, 0 );
  float snTop = floor( snInfo.r * 255.0 + 0.5 ) * S_LEVEL;
  // Open sky: at or above the topmost floor over the tile (a sunken road a little under it).
  float snOpen = step( snTop - 0.3, vWPos.y );
  float snUp = smoothstep( 0.55, 0.9, vWN.y );
  // A floor holds the tile's share; anything standing on it (a crown, a roof, a lid) holds nearly all.
  float snAmount = sGroundY > 0.25 && sGroundY < 2.2 ? 0.88 : snInfo.g;
  // Broad drifts with a little grain at their edges; on a road, broad smears of slush, never pure white.
  bool snRoad = snInfo.b > 0.5;
  float snN = sFbm( snP * ( snRoad ? 0.22 : 0.35 ), 4 ) * 0.88 + sNoise( snP * 2.6 ) * 0.12;
  float snEdge = snRoad ? 0.2 : 0.08;
  snCover = snOpen * snUp * smoothstep( 1.0 - snAmount - snEdge, 1.0 - snAmount + snEdge, snN );
  if ( snRoad && sGroundY < 0.25 ) snCover *= 0.75;
  vec3 snCol = snRoad && sGroundY < 0.25 ? vec3( 0.46, 0.48, 0.5 ) : vec3( 0.86, 0.88, 0.93 );
  snCol *= 0.95 + 0.07 * sNoise( snP * 7.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, snCol, snCover );
  // Snow fills the relief: a soft drift instead.
  sH = mix( sH, sFbm( snP * 2.2, 2 ) * 0.006, snCover );
}
`,
  normal: /* glsl */ `
roughnessFactor = mix( roughnessFactor, 0.8, snCover );
metalnessFactor = mix( metalnessFactor, 0.0, snCover );
`,
};
