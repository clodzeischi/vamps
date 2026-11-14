// The region map (public/assets/regions.png, built by scripts/build-regions.mjs):
// an equirectangular image whose pixel value is a region index (0 = sea).
// Kept on the CPU for picking and uploaded once as a single-channel texture.
import * as THREE from "three";
import type { LatLon } from "../sim/time";

export class RegionMap {
  private constructor(
    readonly width: number,
    readonly height: number,
    private readonly data: Uint8Array, // row 0 = north
    readonly texture: THREE.DataTexture,
  ) {}

  static async load(url: string): Promise<RegionMap> {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    const flipped = new Uint8Array(w * h); // texture row 0 = south (v = 0)
    for (let y = 0; y < h; y++) {
      const src = y * w, dst = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) {
        const v = rgba[(src + x) * 4]!;
        data[src + x] = v;
        flipped[dst + x] = v;
      }
    }
    const tex = new THREE.DataTexture(flipped, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return new RegionMap(w, h, data, tex);
  }

  /** Region index at a point (0 = sea / no region). */
  indexAt(p: LatLon): number {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(((p.lon + 180) / 360) * this.width)));
    const y = Math.min(this.height - 1, Math.max(0, Math.floor(((90 - p.lat) / 180) * this.height)));
    return this.data[y * this.width + x]!;
  }
}

/** Per-region display state for the globe shader: one RGBA texel per region index. */
export class RegionStates {
  readonly data = new Uint8Array(256 * 4);
  readonly texture = new THREE.DataTexture(this.data, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);

  constructor() {
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  /** R = SIGINT coverage, G = has an installation, B = support (-5..+5 mapped to 0..250). */
  set(index: number, covered: boolean, installed: boolean, support: number) {
    const o = index * 4;
    this.data[o] = covered ? 255 : 0;
    this.data[o + 1] = installed ? 255 : 0;
    this.data[o + 2] = Math.round((Math.max(-5, Math.min(5, support)) + 5) * 25);
    this.data[o + 3] = 255;
    this.texture.needsUpdate = true;
  }

  clear() {
    this.data.fill(0);
    this.texture.needsUpdate = true;
  }
}
