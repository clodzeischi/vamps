import { describe, expect, it } from "vitest";
import { blockJson, blockMap, checkBlock, newBlock, stamp, toBlock, turnSide, type BlockMeta } from "./blocks";
import { BLOCKS } from "../data/blockBank";
import { E, edgeAt, emptyMap, setEdge, setTile, skinAt, T, tileAt } from "./map";

const meta: BlockMeta = { id: "test", name: "Test", terrains: ["light"], kind: "building", fronts: ["s"], targets: ["nest"] };

/** A small house: a room with a wall on its north side, a window east, a door south, a sofa and a lamp. */
function sample() {
  const b = newBlock(meta, 12, 12, 1, 3);
  const m = blockMap(b);
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 6; x++) setTile(m, x, y, 1, T.FLOOR, "indoor");
  setTile(m, 3, 3, 0, T.FLOOR, "concrete");
  for (let x = 2; x <= 6; x++) setEdge(m, x, 2, 1, 0, -1, E.WALL, "brick");
  setEdge(m, 6, 3, 1, 1, 0, E.WINDOW, "brick");
  setEdge(m, 4, 5, 1, 0, 1, E.DOOR, "brick");
  setTile(m, 2, 3, 1, T.LOW, "sofa");
  setTile(m, 2, 4, 1, T.LOW, "sofa");
  m.furniture.push({ x: 2, y: 3, z: 1, w: 1, h: 2, kind: "sofa", dx: 1, dy: 0 });
  m.lights.push({ x: 4, y: 5, z: 1, wall: [0, 1] });
  return toBlock(m, meta, [{ x: 5, y: 4, z: 1, role: "vampire" }]);
}

describe("blocks", () => {
  it("round-trips a block through its map", () => {
    const b = sample();
    const again = toBlock(blockMap(b), meta, b.nodes);
    expect(again).toEqual(b);
    expect(checkBlock(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(b.floors[1]!.tiles[3]).toBe(b.floors[1]!.tiles[3]!.slice(0, 12));
  });

  it("writes a file that reads back the same, a row to a line", () => {
    const b = sample(), text = blockJson(b);
    expect(JSON.parse(text)).toEqual(b);
    expect(text).toContain('"terrains": ["light"]');
    expect(text).toContain(`\n        "${b.floors[1]!.tiles[3]}",\n`);
  });

  it("loads every block in the bank (src/data/blocks), each filed under its id", () => {
    for (const [file, b] of BLOCKS) expect(file).toBe(b.id);
  });

  it("refuses blocks of the wrong shape", () => {
    expect(() => checkBlock({ ...sample(), w: 10 })).toThrow();
    expect(() => checkBlock({ ...sample(), id: "../x" })).toThrow();
  });

  it("stamps a block turned, walls and furniture turning with it", () => {
    const b = sample();
    for (const r of [0, 1, 2, 3] as const) {
      const m = emptyMap(30, 30, 5, 2, "urban", 0);
      const nodes = stamp(m, b, 5, 7, r);
      // Turned clockwise as drawn: block (x, y) lands at these map tiles.
      const P = (x: number, y: number) => (r === 0 ? [5 + x, 7 + y] : r === 1 ? [5 + 11 - y, 7 + x] : r === 2 ? [5 + 11 - x, 7 + 11 - y] : [5 + y, 7 + 11 - x]) as [number, number];
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
      expect([nodes[0]!.x, nodes[0]!.y, nodes[0]!.z]).toEqual([...P(5, 4), 2]);
    }
  });

  it("keeps a neighbour's wall on a shared rim where the block has none", () => {
    const m = emptyMap(24, 12, 3, 0, "urban", 0);
    setEdge(m, 11, 4, 0, 1, 0, E.WALL, "brick");
    stamp(m, newBlock(meta), 12, 0);
    expect(edgeAt(m, 11, 4, 0, 1, 0)).toBe(E.WALL);
  });

  it("turns a front", () => {
    expect(turnSide("s", 1)).toBe("w");
    expect(turnSide("s", 2)).toBe("n");
    expect(turnSide("e", 3)).toBe("n");
  });
});
