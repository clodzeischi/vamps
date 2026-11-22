import { describe, expect, it } from "vitest";
import { blockJson, canMeet, compile, DEFAULT_LINKS, edgeIndex, fromFile, newBlock, stamp, toFile, turnLinks, turnSide, wallBetween, type BlockData, type BlockMeta } from "./blocks";
import { BLOCKS } from "../data/blockBank";
import { E, edgeAt, edgeSkinAt, emptyMap, setEdge, skinAt, T, tileAt } from "./map";

const meta: BlockMeta = { id: "test", name: "Test", terrains: ["light"], type: "structure", links: DEFAULT_LINKS(), targets: ["nest"] };

/**
 * A small house on a basement: two rooms of floorboards (x 2–6, y 2–5), the
 * east one tiled (x 5–6), brick outside, plaster within; a door south, a
 * window east, a sofa and a lamp.
 */
function sample(): BlockData {
  const b = newBlock(meta, 10, 10, 1, 3);
  const L = b.lv[1]!;
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 6; x++) L.floor[y * 10 + x] = x <= 4 ? "indoor/brick/plaster" : "tile/brick/plaster";
  b.lv[0]!.floor[3 * 10 + 3] = "concrete";
  const door = edgeIndex(10, 3, 5, 0, 1), win = edgeIndex(10, 6, 3, 1, 0);
  L[door.list][door.i] = "door";
  L[win.list][win.i] = "window";
  L.obj[4 * 10 + 4] = "low:crate";
  b.furniture.push({ x: 2, y: 3, z: 1, w: 1, h: 2, kind: "sofa", dx: 1, dy: 0 });
  b.lights.push({ x: 3, y: 5, z: 1, wall: [0, 1] });
  b.nodes.push({ x: 3, y: 4, z: 1, role: "vampire" });
  return b;
}

describe("blocks", () => {
  it("walls a floor round, exterior outside, interior between unlike floors, none within", () => {
    const m = compile(sample());
    expect(edgeAt(m, 3, 2, 1, 0, -1)).toBe(E.WALL);
    expect(edgeSkinAt(m, 3, 2, 1, 0, -1)).toBe("brick");
    expect(edgeAt(m, 4, 3, 1, 1, 0)).toBe(E.WALL); // floorboards against tiles
    expect(edgeSkinAt(m, 4, 3, 1, 1, 0)).toBe("plaster");
    expect(edgeAt(m, 2, 3, 1, 1, 0)).toBe(E.NONE); // within a room
    expect(edgeAt(m, 3, 5, 1, 0, 1)).toBe(E.DOOR);
    expect(edgeSkinAt(m, 3, 5, 1, 0, 1)).toBe("brick"); // the door takes the wall it's in
    expect(edgeAt(m, 6, 3, 1, 1, 0)).toBe(E.WINDOW);
    expect(tileAt(m, 4, 4, 1)).toBe(T.LOW);
    expect(tileAt(m, 2, 4, 1)).toBe(T.LOW);
    expect(skinAt(m, 2, 4, 1)).toBe("sofa");
    // A crate inside doesn't open the walls round it (walls come from the floor under it).
    expect(edgeAt(m, 4, 4, 1, 1, 0)).toBe(E.WALL);
    // Unwalled ground: nothing between pavement and nothing.
    expect(edgeAt(m, 0, 0, 1, -1, 0)).toBe(E.NONE);
  });

  it("works out the wall between two floors", () => {
    expect(wallBetween("wood/brick/plaster", "wood/brick/plaster").e).toBe(E.NONE);
    expect(wallBetween("wood/brick/plaster", "pavement")).toEqual({ e: E.WALL, skin: "brick" });
    expect(wallBetween("", "tile/stone/clinic")).toEqual({ e: E.WALL, skin: "stone" });
    expect(wallBetween("pavement", "grass").e).toBe(E.NONE);
  });

  it("round-trips through its file, a row to a line", () => {
    const b = sample(), text = blockJson(b);
    const again = fromFile(JSON.parse(text));
    expect(again).toEqual({ ...b, notes: "", wallSet: [] });
    expect(text).toContain('"terrains": ["light"]');
    expect(toFile(b).floors[1]!.floor[3]).toHaveLength(10);
  });

  it("loads every block in the bank (src/data/blocks), each filed under its id", () => {
    for (const [file, b] of BLOCKS) expect(file).toBe(b.id);
  });

  it("refuses files of the wrong shape", () => {
    expect(() => fromFile({ ...toFile(sample()), w: 12 })).toThrow();
    expect(() => fromFile({ ...toFile(sample()), id: "../x" })).toThrow();
    expect(() => fromFile({ ...toFile(sample()), format: 1 })).toThrow();
  });

  it("stamps a block turned, walls and furniture turning with it", () => {
    const b = sample();
    for (const r of [0, 1, 2, 3] as const) {
      const m = emptyMap(30, 30, 5, 2, "urban", 0);
      const nodes = stamp(m, b, 5, 7, r);
      const P = (x: number, y: number) => (r === 0 ? [5 + x, 7 + y] : r === 1 ? [5 + 9 - y, 7 + x] : r === 2 ? [5 + 9 - x, 7 + 9 - y] : [5 + y, 7 + 9 - x]) as [number, number];
      const D = (dx: number, dy: number) => (r === 0 ? [dx, dy] : r === 1 ? [-dy, dx] : r === 2 ? [-dx, -dy] : [dy, -dx]) as [number, number];
      const [wx, wy] = P(3, 2), [ndx, ndy] = D(0, -1);
      expect(edgeAt(m, wx, wy, 2, ndx, ndy)).toBe(E.WALL);
      const [ox, oy] = P(6, 3), [edx, edy] = D(1, 0);
      expect(edgeAt(m, ox, oy, 2, edx, edy)).toBe(E.WINDOW);
      const [cx, cy] = P(3, 3);
      expect(skinAt(m, cx, cy, 1)).toBe("concrete");
      const f = m.furniture[0]!;
      const [fx, fy] = P(2, 3), [gx, gy] = P(2, 4);
      expect(tileAt(m, fx, fy, 2)).toBe(T.LOW);
      expect(fx >= f.x && fx < f.x + f.w && gy >= f.y && gy < f.y + f.h && gx >= f.x && fy >= f.y).toBe(true);
      expect([f.dx, f.dy]).toEqual(D(1, 0));
      expect(m.lights[0]!.wall).toEqual(D(0, 1));
      expect([nodes[0]!.x, nodes[0]!.y, nodes[0]!.z]).toEqual([...P(3, 4), 2]);
    }
  });

  it("keeps a neighbour's wall on a shared rim where the block has none", () => {
    const m = emptyMap(20, 10, 3, 0, "urban", 0);
    setEdge(m, 9, 4, 0, 1, 0, E.WALL, "brick");
    stamp(m, newBlock(meta), 10, 0);
    expect(edgeAt(m, 9, 4, 0, 1, 0)).toBe(E.WALL);
  });

  it("lets two blocks meet only where both allow the other", () => {
    const shop = { type: "structure" as const, links: { n: ["structure" as const], e: ["structure" as const, "open" as const], s: ["corridor" as const], w: ["structure" as const, "open" as const] } };
    const road = { type: "corridor" as const, links: { n: ["structure" as const, "open" as const], e: ["corridor" as const], s: ["structure" as const, "open" as const], w: ["corridor" as const] } };
    expect(canMeet(shop, "s", road)).toBe(true); // the shop's front on the road's north side
    expect(canMeet(road, "n", shop)).toBe(true);
    expect(canMeet(shop, "n", road)).toBe(false); // its back wants another building: an alley
    expect(canMeet(road, "e", shop)).toBe(false); // the road runs on east
    // Turned a quarter (clockwise), the shop's front faces west.
    expect(turnLinks(shop.links, 1).w).toEqual(["corridor"]);
    expect(turnLinks(shop.links, 1).n).toEqual(["structure", "open"]);
  });

  it("turns a front", () => {
    expect(turnSide("s", 1)).toBe("w");
    expect(turnSide("s", 2)).toBe("n");
    expect(turnSide("e", 3)).toBe("n");
  });
});
