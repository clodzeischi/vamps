// Shader features patched into three's standard material (onBeforeCompile).
// Three keeps its lighting, shadows, fog and tone mapping; a feature only adds
// what's new, at three fixed points of the fragment shader:
//
//   color   after <color_fragment>       may change `diffuseColor`; may set `sH`
//   normal  after <normal_fragment_maps> may change `normal` (view space),
//                                        `roughnessFactor`, `metalnessFactor`
//   light   after <lights_fragment_end>  may add to `reflectedLight`
//
// Before the features' colour code, every patched material declares the
// surface it is painting (main scope):
//
//   sP, sN     position (metres) and normal: in the world (static scenery) or
//              in the object (`shadedObject`: the pattern rides on a moving
//              unit or weapon, in metres, scale included)
//   sT, sB     the face's two in-plane axes; sUV the position along them
//   sPx        a pixel's size on the face (metres), for anti-aliasing
//   sGroundY   height above the floor of its storey (world only; 1 in objects)
//   sBase      the colour before any feature (the material's or instance's)
//   sH         relief (metres): a feature with `bump` sets it, and the normal
//              is tilted by its slope after the normal step (a procedural
//              normal map, from screen-space derivatives)
//
// Every feature also sees vWPos and vWN (world). Name a feature's own locals
// with its prefix (rd, bk, wd…) so features don't collide.
//
// The insertion points are three's own chunk names: if a three.js upgrade
// renames one, the shader fails to compile with an error in the console.
import type * as THREE from "three";
import { GLSL_LIB } from "./noise";

export interface Feature {
  /** Unique; part of the program cache key. */
  name: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Fragment declarations: uniforms, functions. */
  decl?: string;
  color?: string;
  normal?: string;
  light?: string;
  /** Tilt the normal by sH's slope, times this. */
  bump?: number;
}

const VARYINGS = "varying vec3 vWPos;\nvarying vec3 vWN;\nvarying vec3 vOPos;\nvarying vec3 vON;\n";
const VERT_BODY = `
{
  vec4 wp = vec4( transformed, 1.0 );
  vec3 wn = objectNormal;
  vec3 os = vec3( 1.0 );
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3( instanceMatrix ) * wn;
    os *= vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
  #endif
  vWPos = ( modelMatrix * wp ).xyz;
  vWN = normalize( mat3( modelMatrix ) * wn );
  // The object's own frame, in metres: its vertex scaled by every scale above it.
  os *= vec3( length( modelMatrix[0].xyz ), length( modelMatrix[1].xyz ), length( modelMatrix[2].xyz ) );
  vOPos = transformed * os;
  vON = objectNormal;
}`;

const prelude = (object: boolean) => `
vec3 sP = ${object ? "vOPos" : "vWPos"};
vec3 sN = normalize( ${object ? "vON" : "vWN"} );
vec3 sT, sB; vec2 sUV;
sFrame( sN, sP, sT, sB, sUV );
float sPx = length( fwidth( sUV ) ) * 0.7 + 1e-5;
float sGroundY = ${object ? "1.0" : "mod( vWPos.y, S_LEVEL ) - 0.1"};
float sH = 0.0;
vec3 sBase = diffuseColor.rgb;
`;

function patch<M extends THREE.MeshStandardMaterial>(mat: M, object: boolean, features: Feature[]): M {
  const key = (object ? "obj:" : "") + features.map((f) => f.name).join("+");
  mat.onBeforeCompile = (shader) => {
    for (const f of features) if (f.uniforms) Object.assign(shader.uniforms, f.uniforms);
    const join = (k: "decl" | "color" | "light") => features.map((f) => f[k] ?? "").join("\n");
    const normal = features
      .map((f) => (f.normal ?? "") + (f.bump ? `\nnormal = sPerturb( -vViewPosition, normal, sH * ${f.bump.toFixed(3)} );` : ""))
      .join("\n");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + VARYINGS)
      .replace("#include <fog_vertex>", "#include <fog_vertex>\n" + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + VARYINGS + GLSL_LIB + join("decl"))
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + prelude(object) + join("color"))
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + normal)
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + join("light"));
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/**
 * Tone: pulls the colour the features painted back toward the base colour,
 * keeping k of the variation (1: all of it). Scenery is kept quiet so units
 * and items read against it; the relief (normals) and the light are untouched.
 */
export const tone = (k: number): Feature => ({
  name: `tone${Math.round(k * 100)}`,
  color: `diffuseColor.rgb = mix( sBase, diffuseColor.rgb, ${k.toFixed(3)} );`,
});

/** Static scenery: patterns fixed in the world (metres). Returns the material, for chaining. */
export const shaded = <M extends THREE.MeshStandardMaterial>(mat: M, ...features: Feature[]): M => patch(mat, false, features);
/** Things that move (units, weapons, models): patterns ride on the object. */
export const shadedObject = <M extends THREE.MeshStandardMaterial>(mat: M, ...features: Feature[]): M => patch(mat, true, features);
