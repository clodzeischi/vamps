import { describe, expect, it } from "vitest";
import { blockJson, compile, fromFile, newBlock, stamp, type BlockMeta } from "./blocks";
import { emptyMap, furnitureSize, skinAt, T, tileAt } from "./map";
import { PIECES, pieceParts } from "./pieces";

const meta: BlockMeta = { id: "test", name: "Test", terrains: ["light"], type: "structure", entrances: ["s"], targets: ["nest"] };
/** The models built (scripts/build-props.py), by name. */
const BUILT = new Set(Object.keys(import.meta.glob("/public/assets/props/*.glb")).map((p) => p.replace(/^.*\/(.*)\.glb$/, "$1")));

describe("pieces", () => {
  it("each has its models built", () => {
    for (const k of Object.keys(PIECES)) for (const [name] of pieceParts(k)) expect(BUILT.has(name), name).toBe(true);
    const used = new Set(Object.keys(PIECES).flatMap((k) => pieceParts(k).map(([n]) => n)));
    expect(used.size).toBeGreaterThan(180);
    expect(BUILT.size).toBeGreaterThanOrEqual(used.size);
  });

  it("give their tiles the cover they're listed with: high, low, or none (the floor left walkable)", () => {
    const b = newBlock(meta, 10, 10, 0, 2);
    b.furniture.push({ x: 1, y: 1, z: 0, w: 1, h: 1, kind: "drinks_fridge", dx: 0, dy: 1 });
    b.furniture.push({ x: 3, y: 1, z: 0, w: 2, h: 1, kind: "checkout_counter", dx: 0, dy: 1 });
    b.furniture.push({ x: 6, y: 1, z: 0, w: 1, h: 1, kind: "ground_cracks", dx: 0, dy: 1 });
    b.furniture.push({ x: 1, y: 5, z: 0, w: 4, h: 2, kind: "shipping_container", dx: 1, dy: 0 });
    const m = compile(b);
    expect(tileAt(m, 1, 1, 0)).toBe(T.HIGH);
    expect(skinAt(m, 1, 1, 0)).toBe("fridge");
    expect([tileAt(m, 3, 1, 0), tileAt(m, 4, 1, 0)]).toEqual([T.LOW, T.LOW]);
    expect(tileAt(m, 6, 1, 0)).toBe(T.FLOOR);
    for (let y = 5; y < 7; y++) for (let x = 1; x < 5; x++) expect(tileAt(m, x, y, 0)).toBe(T.HIGH);
    expect(m.furniture.map((f) => f.kind)).toEqual(["drinks_fridge", "checkout_counter", "ground_cracks", "shipping_container"]);
  });

  it("survive a save and load, and turn with their block", () => {
    const b = newBlock(meta, 10, 10, 0, 2);
    b.furniture.push({ x: 2, y: 0, z: 0, w: 2, h: 1, kind: "front_porch", dx: 0, dy: -1 });
    expect(fromFile(JSON.parse(blockJson(b))).furniture).toEqual(b.furniture);
    const m = emptyMap(10, 10, 2, 0, "urban", 1);
    stamp(m, b, 0, 0, 1);
    const f = m.furniture[0]!;
    // A quarter turn: 2 × 1 becomes 1 × 2, the front turned with it.
    expect([f.w, f.h]).toEqual([1, 2]);
    expect(Math.abs(f.dx) + Math.abs(f.dy)).toBe(1);
    expect(f.dx).not.toBe(0);
  });

  it("are listed with sizes a block can hold and a group for the menu", () => {
    for (const [k, d] of Object.entries(PIECES)) {
      expect(furnitureSize(k)).toEqual(d.size);
      expect(d.size[0] >= 1 && d.size[0] <= 4 && d.size[1] >= 1 && d.size[1] <= 2, k).toBe(true);
      expect(d.group.length).toBeGreaterThan(0);
    }
  });
});
