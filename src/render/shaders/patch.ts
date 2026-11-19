// Shader features patched into three's standard material (onBeforeCompile).
// Three keeps its lighting, shadows, fog and tone mapping; a feature only adds
// what's new, at three fixed points of the fragment shader:
//
//   color   after <color_fragment>       may change `diffuseColor` (and roughnessFactor
//                                        later); may declare main-scope variables that
//                                        its `normal` step reads
//   normal  after <normal_fragment_maps> may change `normal` (view space)
//   light   after <lights_fragment_end>  may add to `reflectedLight`
//
// Every patched material gets the world position and normal of each fragment
// (vWPos, vWN) and the shared GLSL library (noise.ts). Features run in the
// order given. A feature's chunks are wrapped in nothing: name your locals
// with the feature's prefix (rd, bk, lv…) so they don't collide.
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
}

const VERT_DECL = "varying vec3 vWPos;\nvarying vec3 vWN;\n";
const VERT_BODY = `
{
  vec4 wp = vec4( transformed, 1.0 );
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3( instanceMatrix ) * wn;
  #endif
  vWPos = ( modelMatrix * wp ).xyz;
  vWN = normalize( mat3( modelMatrix ) * wn );
}`;

/** The material, with these features patched in. Returns it, for chaining. */
export function shaded<M extends THREE.MeshStandardMaterial>(mat: M, ...features: Feature[]): M {
  const key = features.map((f) => f.name).join("+");
  mat.onBeforeCompile = (shader) => {
    for (const f of features) if (f.uniforms) Object.assign(shader.uniforms, f.uniforms);
    const join = (k: "decl" | "color" | "normal" | "light") => features.map((f) => f[k] ?? "").join("\n");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + VERT_DECL)
      .replace("#include <fog_vertex>", "#include <fog_vertex>\n" + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + VERT_DECL + GLSL_LIB + join("decl"))
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + join("color"))
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + join("normal"))
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + join("light"));
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
