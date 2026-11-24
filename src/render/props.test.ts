import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { splitPaint } from "./props";

describe("vehicle paint", () => {
  it("splits off the faces on the paint swatch, the rest kept", () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1], 3));
    // The first triangle on the paint swatch (u 4.5/8, v 3.5/8), the second on another.
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0.5625, 0.4375, 0.5625, 0.4375, 0.5625, 0.4375, 0.1875, 0.3125, 0.1875, 0.3125, 0.1875, 0.3125], 2));
    const [rest, paint] = splitPaint(g);
    expect(paint.getAttribute("position").count).toBe(3);
    expect(rest.getAttribute("position").count).toBe(3);
    expect(paint.getAttribute("position").getZ(0)).toBe(0);
    expect(rest.getAttribute("position").getZ(0)).toBe(1);
  });
});
