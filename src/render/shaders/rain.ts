// Rain, for wet maps: laid over every scenery material and the prop kit.
//
// Where the sky is open comes from rainMap(), one texel per ground tile, as
// for snow: red is the level of the topmost thing over the tile; green how
// much of its ground stands in puddles (roads and car parks most, lawns
// hardly); blue how much darker it gets wet (porous stone and earth more
// than paint). Faces open to the sky go darker and glossier, floors more
// than walls; indoors stays dry.
//
// Puddles sit in broad hollows of a noise field. They are flat (the relief
// under them drowns), nearly black, mirror-smooth, ringed by raindrops, and
// they reflect: BattleView renders the scene mirrored in the street's plane
// each frame (a three Reflector) and hands the texture over with
// setRainReflection(); a puddle on the ground level samples it at its own
// point, rippled. Puddles up on a roof only catch the sky.
import * as THREE from "three";
import { T, tileAt, skinAt, type BattleMap, type Skin } from "../../tactical/map/map";
import type { Feature } from "./patch";

/** How much of a tile's ground stands in puddles (0–1). */
const PUDDLES: Partial<Record<Skin, number>> = {
  road: 0.3,
  tarmac: 0.34,
  pavement: 0.17,
  dirt: 0.32,
  roof: 0.24,
  stone: 0.15,
  grass: 0.05,
  wood: 0.08,
  planks: 0.08,
  rubble: 0.2,
};
/** How much darker it gets wet (0–1). */
const SOAK: Partial<Record<Skin, number>> = {
  road: 0.75,
  tarmac: 0.75,
  pavement: 0.85,
  dirt: 0.9,
  roof: 0.6,
  stone: 0.85,
  grass: 0.45,
  brick: 0.85,
  plaster: 0.7,
  metal: 0.3,
  car: 0.2,
  truck: 0.2,
};

/** The rain map for a map. `under(x, y)` is the ground's surface under a vehicle. */
export function rainMap(
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
      data[i + 1] = Math.round((PUDDLES[skin] ?? 0) * 255);
      data[i + 2] = Math.round((SOAK[skin] ?? 0.7) * 255);
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, m.w, m.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1);
empty.needsUpdate = true;
const uniforms = {
  rnMap: { value: empty as THREE.Texture },
  rnOn: { value: 0 },
  rnTime: { value: 0 },
  rnRefl: { value: empty as THREE.Texture },
  rnReflOn: { value: 0 },
  rnTexMat: { value: new THREE.Matrix4() },
  rnPlaneY: { value: 0 },
  rnSky: { value: new THREE.Color(0x8a939e) },
};

/** Hands the shader the current map's rain map (null: dry). */
export function setRainMap(tex: THREE.Texture | null) {
  uniforms.rnMap.value = tex ?? empty;
  uniforms.rnOn.value = tex ? 1 : 0;
}

/**
 * The street mirrored: the reflection's texture and the matrix from a world
 * point to its place on it, and the plane's height (null: no reflections, as
 * while the reflection itself is drawn).
 */
export function setRainReflection(
  tex: THREE.Texture | null,
  worldToTex?: THREE.Matrix4,
  planeY?: number,
) {
  uniforms.rnRefl.value = tex ?? empty;
  uniforms.rnReflOn.value = tex ? 1 : 0;
  if (worldToTex) uniforms.rnTexMat.value.copy(worldToTex);
  if (planeY !== undefined) uniforms.rnPlaneY.value = planeY;
}

/** The clock for the raindrops' rings, and the sky colour a roof's puddle catches (linear). */
export function setRainFrame(t: number, sky?: THREE.Color) {
  uniforms.rnTime.value = t;
  if (sky) uniforms.rnSky.value.copy(sky);
}

export const RAIN: Feature = {
  name: "rain",
  uniforms,
  decl: /* glsl */ `
uniform sampler2D rnMap;
uniform float rnOn;
uniform float rnTime;
uniform sampler2D rnRefl;
uniform float rnReflOn;
uniform mat4 rnTexMat;
uniform float rnPlaneY;
uniform vec3 rnSky;

// Raindrop rings on still water: a drop per cell, at its own time, its ring spreading and fading.
float rnRings( vec2 p, float t ) {
  vec2 c = floor( p );
  vec2 f = fract( p );
  float h = 0.0;
  for ( int j = -1; j <= 0; j++ )
    for ( int i = -1; i <= 0; i++ ) {
      vec2 g = vec2( float( i ), float( j ) ) + step( 0.5, f );
      vec2 id = c + g;
      vec2 o = sHash2( id ) * 0.6 + 0.2;
      float ph = fract( t * ( 0.6 + 0.5 * sHash( id + 7.1 ) ) + sHash( id + 3.7 ) );
      float d = length( g + o - f );
      float r = ph * 0.9;
      h += sin( clamp( ( d - r ) * 28.0, -3.1416, 3.1416 ) ) * smoothstep( 0.12, 0.0, abs( d - r ) ) * ( 1.0 - ph ) * ( 1.0 - ph );
    }
  return h;
}
`,
  color: /* glsl */ `
float rnWet = 0.0;
float rnPud = 0.0;
float rnRip = 0.0;
float rnSheen = 0.0;
if ( rnOn > 0.5 ) {
  vec2 rnP = vWPos.xz;
  ivec2 rnTc = clamp( ivec2( floor( rnP / S_TILE ) ), ivec2( 0 ), textureSize( rnMap, 0 ) - 1 );
  vec4 rnInfo = texelFetch( rnMap, rnTc, 0 );
  float rnTop = floor( rnInfo.r * 255.0 + 0.5 ) * S_LEVEL;
  float rnOpen = step( rnTop - 0.3, vWPos.y );
  float rnUp = smoothstep( 0.5, 0.9, vWN.y );
  // Walls wet less than floors, and streaked where the water runs down.
  float rnStreak = 0.75 + 0.25 * sNoise( vec2( dot( vWPos.xz, vec2( 0.7, 0.7 ) ) * 6.0, vWPos.y * 0.6 ) );
  rnWet = rnOpen * mix( 0.6 * rnStreak, 1.0, rnUp );
  diffuseColor.rgb *= 1.0 - 0.3 * rnWet * rnInfo.b;
  // A wet floor shines at a slant: a thin film over it.
  rnSheen = rnOpen * rnUp * 0.3;
  // Puddles in broad hollows, on the floor (a roof, the street), never on a prop's top.
  if ( rnOpen > 0.5 && rnUp > 0.5 && sGroundY < 0.25 && rnInfo.g > 0.0 ) {
    // fbm sits near 0.5: stretched so its highs (the hollows) reach the threshold.
    float rnN = clamp( ( sFbm( rnP * 0.3 + 11.0, 4 ) - 0.5 ) * 2.4 + 0.5, 0.0, 1.0 ) * 0.88 + sNoise( rnP * 2.1 ) * 0.12;
    float rnA = rnInfo.g;
    rnPud = smoothstep( 1.0 - rnA - 0.025, 1.0 - rnA + 0.025, rnN ) * rnUp;
    // A darker wet rim round each puddle.
    diffuseColor.rgb *= 1.0 - 0.25 * smoothstep( 1.0 - rnA - 0.09, 1.0 - rnA, rnN ) * ( 1.0 - rnPud );
  }
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.35, rnPud );
  // Water lies flat: the relief under it drowns.
  sH = mix( sH, 0.0, rnPud );
}
`,
  normal: /* glsl */ `
if ( rnOn > 0.5 ) {
  roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.45, rnWet );
  roughnessFactor = mix( roughnessFactor, 0.03, rnPud );
  metalnessFactor = mix( metalnessFactor, 0.0, rnPud );
  // Rings from the drizzle (worked out everywhere: the slope needs neighbouring pixels).
  rnRip = rnRings( vWPos.xz * 2.2, rnTime ) + rnRings( vWPos.xz * 3.1 + 5.3, rnTime * 1.3 + 0.4 );
  normal = sPerturb( -vViewPosition, normal, rnRip * 0.0025 * rnPud );
}
`,
  light: /* glsl */ `
if ( rnPud > 0.01 || rnSheen > 0.01 ) {
  vec3 rnV = normalize( vViewPosition );
  float rnF = 0.04 + 0.96 * pow( 1.0 - clamp( dot( rnV, normal ), 0.0, 1.0 ), 5.0 );
  vec3 rnC = rnSky * 0.35;
  if ( rnReflOn > 0.5 && abs( vWPos.y - rnPlaneY ) < 0.35 ) {
    vec4 rnQ = rnTexMat * vec4( vWPos.x, rnPlaneY, vWPos.z, 1.0 );
    // Ripples bend it a little.
    vec2 rnUv = rnQ.xy / rnQ.w + vec2( 0.7, 1.0 ) * rnRip * 0.004;
    rnC = textureLod( rnRefl, clamp( rnUv, 0.001, 0.999 ), 0.0 ).rgb;
  }
  reflectedLight.indirectSpecular += rnC * ( mix( 0.35, 1.0, rnF ) * rnPud + rnF * rnSheen * ( 1.0 - rnPud ) );
}
`,
};
