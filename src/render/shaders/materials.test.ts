import { describe, expect, it } from "vitest";
import { SKINS } from "../../tactical/map";
import { MATERIALS, surfaceFor, type MaterialKey } from "./materials";

describe("material catalogue", () => {
  it("every skin has a material as a floor, a wall and a prop", () => {
    for (const skin of SKINS)
      for (const part of ["floor", "wall", "prop"] as const) expect(MATERIALS[surfaceFor(skin, part)]).toBeDefined();
  });

  it("feature names are unique (they key the compiled shader programs)", () => {
    const names = (Object.keys(MATERIALS) as MaterialKey[]).map((k) => MATERIALS[k].feature?.name).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
  });
});
