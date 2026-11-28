import { describe, expect, it } from "vitest";
import {
  blockJson,
  compile,
  edgeIndex,
  fromFile,
  newBlock,
  stamp,
  toFile,
  turnSide,
  wallBetween,
  type BlockData,
  type BlockMeta,
} from "./blocks";
import { BLOCKS } from "../../data/blockBank";
import { blockIssues } from "../../editor/checks";
import {
  E,
  edgeAt,
  edgeSkinAt,
  emptyMap,
  flightEnds,
  neighbours,
  setEdge,
  skinAt,
  T,
  tileAt,
} from "./map";

const meta: BlockMeta = {
  id: "test",
  name: "Test",
  terrains: ["light"],
  type: "structure",
  entrances: ["s"],
  targets: ["nest"],
};

/**
 * A small house on a basement: two rooms of floorboards (x 2–6, y 2–5), the
 * east one tiled (x 5–6), brick outside, plaster within; a door south, a
 * window east, a sofa and a lamp.
 */
function sample(): BlockData {
  const b = newBlock(meta, 8, 8, 1, 3);
  const L = b.lv[1]!;
  for (let y = 2; y <= 5; y++)
    for (let x = 2; x <= 6; x++)
      L.floor[y * 8 + x] = x <= 4 ? "indoor/brick/plaster" : "tile/brick/plaster";
  b.lv[0]!.floor[3 * 8 + 3] = "concrete";
  const door = edgeIndex(8, 3, 5, 0, 1),
    win = edgeIndex(8, 6, 3, 1, 0);
  L[door.list][door.i] = "door";
  L[win.list][win.i] = "window";
  L.obj[4 * 8 + 4] = "low:crate";
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
    const b = sample(),
      text = blockJson(b);
    const again = fromFile(JSON.parse(text));
    expect(again).toEqual({ ...b, notes: "", wallSet: [] });
    expect(text).toContain('"terrains": ["light"]');
    expect(toFile(b).floors[1]!.floor[3]).toHaveLength(8);
  });

  it("loads every block in the bank (src/data/blocks), each filed under its id", () => {
    for (const [file, b] of BLOCKS) expect(file).toBe(b.id);
  });

  it("every drawn block passes the editor's checks", () => {
    const issues = BLOCKS.flatMap(([, b]) =>
      blockIssues(compile(b), b, b.nodes).map((i) => `${b.id}: ${i.text} ${i.x},${i.y},${i.z}`),
    );
    expect(issues).toEqual([]);
  });

  it("lays stairs as a piece: no standing on them, open air over them, one step up that turns with the block", () => {
    const b = newBlock(meta, 8, 8, 0, 2);
    b.lv[1]!.floor.fill("indoor");
    b.flights.push({ x: 4, y: 4, z: 0, w: 2, h: 2, kind: "outdoor", dx: 0, dy: -1 });
    const m = compile(b);
    expect(tileAt(m, 4, 5, 0)).toBe(T.FLIGHT);
    expect(tileAt(m, 5, 4, 1)).toBe(T.VOID);
    expect(neighbours(m, { x: 4, y: 6, z: 0 })).toContainEqual({ x: 4, y: 3, z: 1 });
    expect(fromFile(JSON.parse(blockJson(b))).flights).toEqual(b.flights);
    for (const r of [0, 1, 2, 3] as const) {
      const out = emptyMap(8, 8, 2, 0, "urban", 0);
      stamp(out, b, 0, 0, r);
      const f = out.flights![0]!;
      for (const { foot, head } of flightEnds(f))
        expect(neighbours(out, foot)).toContainEqual(head);
    }
  });

  it("parks a car of a colour of its own on each map, and puts a stop sign on a corner that turns with the block", () => {
    const b = newBlock({ ...meta, terrains: ["industrial"] }, 16, 16, 0, 1);
    b.vehicles.push({
      x: 1,
      y: 1,
      z: 0,
      w: 2,
      h: 3,
      kind: "car",
      front: 1,
      under: "tarmac",
      paint: -1,
    });
    b.vehicles.push({
      x: 4,
      y: 1,
      z: 0,
      w: 6,
      h: 2,
      kind: "truck",
      front: -1,
      under: "tarmac",
      paint: 3,
    });
    b.decor.push({ kind: "stop_sign", x: 4, y: 6, z: 0, dx: 0, dy: 1 });
    b.furniture.push({ x: 4, y: 8, z: 0, w: 2, h: 1, kind: "concrete_barrier", dx: 0, dy: 1 });
    const m = compile(b, 1);
    expect([tileAt(m, 2, 3, 0), skinAt(m, 2, 3, 0)]).toEqual([T.LOW, "car"]);
    expect([tileAt(m, 9, 2, 0), skinAt(m, 9, 2, 0)]).toEqual([T.HIGH, "truck"]);
    expect(tileAt(m, 5, 8, 0)).toBe(T.LOW);
    // The sign blocks nothing: the four tiles round it stay floor.
    for (const [x, y] of [
      [3, 5],
      [4, 5],
      [3, 6],
      [4, 6],
    ] as const)
      expect(tileAt(m, x, y, 0)).toBe(T.FLOOR);
    expect(m.vehicles[1]!.paint).toBe(3);
    const paints = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => compile(b, seed).vehicles[0]!.paint % 9),
    );
    expect(paints.size).toBeGreaterThan(1);
    expect(compile(b, 1).vehicles[0]!.paint).toBe(m.vehicles[0]!.paint);
    expect(fromFile(JSON.parse(blockJson(b))).decor).toEqual(b.decor);
    for (const r of [0, 1, 2, 3] as const) {
      const out = emptyMap(30, 30, 1, 0, "industrial", 7);
      stamp(out, b, 5, 5, r);
      const want = r === 0 ? [9, 11] : r === 1 ? [15, 9] : r === 2 ? [17, 15] : [11, 17];
      expect([out.decor![0]!.x, out.decor![0]!.y]).toEqual(want);
      const v = out.vehicles[0]!;
      for (let y = v.y; y < v.y + v.h; y++)
        for (let x = v.x; x < v.x + v.w; x++) expect(skinAt(out, x, y, 0)).toBe("car");
    }
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
      const P = (x: number, y: number) =>
        (r === 0
          ? [5 + x, 7 + y]
          : r === 1
            ? [5 + 7 - y, 7 + x]
            : r === 2
              ? [5 + 7 - x, 7 + 7 - y]
              : [5 + y, 7 + 7 - x]) as [number, number];
      const D = (dx: number, dy: number) =>
        (r === 0 ? [dx, dy] : r === 1 ? [-dy, dx] : r === 2 ? [-dx, -dy] : [dy, -dx]) as [
          number,
          number,
        ];
      const [wx, wy] = P(3, 2),
        [ndx, ndy] = D(0, -1);
      expect(edgeAt(m, wx, wy, 2, ndx, ndy)).toBe(E.WALL);
      const [ox, oy] = P(6, 3),
        [edx, edy] = D(1, 0);
      expect(edgeAt(m, ox, oy, 2, edx, edy)).toBe(E.WINDOW);
      const [cx, cy] = P(3, 3);
      expect(skinAt(m, cx, cy, 1)).toBe("concrete");
      const f = m.furniture[0]!;
      const [fx, fy] = P(2, 3),
        [gx, gy] = P(2, 4);
      expect(tileAt(m, fx, fy, 2)).toBe(T.LOW);
      expect(
        fx >= f.x && fx < f.x + f.w && gy >= f.y && gy < f.y + f.h && gx >= f.x && fy >= f.y,
      ).toBe(true);
      expect([f.dx, f.dy]).toEqual(D(1, 0));
      expect(m.lights[0]!.wall).toEqual(D(0, 1));
      expect([nodes[0]!.x, nodes[0]!.y, nodes[0]!.z]).toEqual([...P(3, 4), 2]);
    }
  });

  it("keeps a neighbour's wall on a shared rim where the block has none", () => {
    const m = emptyMap(16, 8, 3, 0, "urban", 0);
    setEdge(m, 7, 4, 0, 1, 0, E.WALL, "brick");
    stamp(m, newBlock(meta), 8, 0);
    expect(edgeAt(m, 7, 4, 0, 1, 0)).toBe(E.WALL);
  });

  it("turns a front", () => {
    expect(turnSide("s", 1)).toBe("w");
    expect(turnSide("s", 2)).toBe("n");
    expect(turnSide("e", 3)).toBe("n");
  });
});
