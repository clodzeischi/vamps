// The block editor's tools. Each is one entry in TOOLS: what it points at (a
// tile or an edge), the options it shows, and what a click or a drag does.
// To add a tool, write one and add it to the list; its options' menus can
// come from the game's own lists (skins, furniture kinds, node roles), so
// anything new there shows up here by itself.
import { E, FURNITURE_SIZE, furnitureSkin, SKINS, T, setEdge, setTile, skinAt, tileAt, edgeAt, edgeSkinAt, type BattleMap, type EdgeKind, type Furniture, type FurnitureKind, type Skin } from "../tactical/map";
import { NODE_ROLES, type BlockNode, type NodeRole } from "../tactical/blocks";
import { SKIN_COLOUR } from "../gallery/draw";

/** What the editor hands a tool. */
export interface Editor {
  map: BattleMap;
  nodes: BlockNode[];
  /** The level being edited. */
  z: number;
  /** The tools' options, by "tool.option". */
  opt: Record<string, string>;
}

/** Where the pointer is: a tile, and the edge of it nearest the pointer. */
export interface Pick {
  x: number;
  y: number;
  /** The nearest side of the tile (always set: a tool that wants edges uses it). */
  dx: number;
  dy: number;
}

export interface Choice { value: string; label: string; colour?: string; group?: string }
export interface OptionSpec { id: string; label: string; choices: Choice[] }

/** A footprint drawn under the pointer before a click (furniture). */
export interface Ghost { x: number; y: number; w: number; h: number; dx: number; dy: number; ok: boolean }

export interface Tool {
  id: string;
  name: string;
  /** Its shortcut (a key's `code`). */
  key: string;
  help: string;
  /** Points at a tile or an edge (it may depend on its options). */
  target(ed: Editor): "tile" | "edge";
  options(ed: Editor): OptionSpec[];
  /** A click, or the pointer moving onto a new tile or edge while held. `first`: the click itself. */
  apply(ed: Editor, p: Pick, erase: boolean, first: boolean): void;
  /** Shift and drag: a rectangle of tiles (fill floors, wall a room round). */
  rect?(ed: Editor, x0: number, y0: number, x1: number, y1: number, erase: boolean): void;
  /** Alt-click: take the skin or kind under the pointer. */
  sample?(ed: Editor, p: Pick): void;
  ghost?(ed: Editor, p: Pick): Ghost | null;
  /** A key while it's the tool (T turns furniture). True if it used it. */
  onKey?(ed: Editor, code: string): boolean;
}

const opt = (ed: Editor, tool: string, id: string, fallback: string) => ed.opt[`${tool}.${id}`] ?? fallback;

/** Skins as a menu: the usual ones for the job first, then every other skin (so new skins appear). */
function skins(common: Skin[]): Choice[] {
  const rest = SKINS.filter((s) => !common.includes(s));
  return [
    ...common.map((s) => ({ value: s, label: s, colour: SKIN_COLOUR[s], group: "Usual" })),
    ...rest.map((s) => ({ value: s, label: s, colour: SKIN_COLOUR[s], group: "All skins" })),
  ];
}

const FLOOR_SKINS: Skin[] = ["indoor", "tile", "concrete", "wood", "pavement", "road", "tarmac", "grass", "dirt", "stone", "roof", "crypt"];
const WALL_SKINS: Skin[] = ["brick", "plaster", "clinic", "metal", "stone", "planks", "rock"];
const PROP_SKINS: Skin[] = ["crate", "table", "bench", "counter", "shelf", "fridge", "bin", "rack", "hedge", "fence", "parapet", "tree", "pump", "hay", "grave", "pillar", "altar", "sarcophagus", "rubble", "rock"];

const DIRS: [string, number, number][] = [["n", 0, -1], ["e", 1, 0], ["s", 0, 1], ["w", -1, 0]];
const dirOf = (v: string) => DIRS.find((d) => d[0] === v) ?? DIRS[2]!;

// ---------------------------------------------------------------------------
// Shared helpers

/** The commonest floor skin round a tile (what a prop or furniture stood on). */
function floorNear(m: BattleMap, x: number, y: number, z: number): Skin {
  const n = new Map<Skin, number>();
  for (const [, dx, dy] of DIRS) {
    const t = tileAt(m, x + dx, y + dy, z);
    if (t === T.FLOOR || t === T.DOOR) n.set(skinAt(m, x + dx, y + dy, z), (n.get(skinAt(m, x + dx, y + dy, z)) ?? 0) + 1);
  }
  let best: Skin = "indoor";
  let c = 0;
  for (const [k, v] of n) if (v > c) (best = k), (c = v);
  return best;
}

const covers = (f: Furniture, x: number, y: number, z: number) => f.z === z && x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h;

/** Takes away any furniture over a tile, its other tiles back to floor. */
export function dropFurnitureAt(m: BattleMap, x: number, y: number, z: number, except?: { x: number; y: number }) {
  m.furniture = m.furniture.filter((f) => {
    if (!covers(f, x, y, z)) return true;
    for (let j = f.y; j < f.y + f.h; j++)
      for (let i = f.x; i < f.x + f.w; i++) if (!(except && i === except.x && j === except.y) && tileAt(m, i, j, z) === T.LOW) setTile(m, i, j, z, T.FLOOR, floorNear(m, i, j, z));
    return false;
  });
}

/** A piece's footprint from its corner, facing (dx, dy): its length across the way it faces. */
export function footprint(kind: FurnitureKind, x: number, y: number, z: number, dx: number, dy: number): Furniture {
  const [len, depth] = FURNITURE_SIZE[kind];
  return dy ? { x, y, z, w: len, h: depth, kind, dx, dy } : { x, y, z, w: depth, h: len, kind, dx, dy };
}

// ---------------------------------------------------------------------------
// The tools

const floor: Tool = {
  id: "floor", name: "Floor", key: "Digit1",
  help: "Paint floor. Right: erase to nothing. Shift-drag: fill a rectangle. Alt-click: pick up a floor.",
  target: () => "tile",
  options: () => [{ id: "skin", label: "Floor", choices: skins(FLOOR_SKINS) }],
  apply(ed, p, erase) {
    dropFurnitureAt(ed.map, p.x, p.y, ed.z);
    setTile(ed.map, p.x, p.y, ed.z, erase ? T.VOID : T.FLOOR, erase ? "none" : (opt(ed, "floor", "skin", "indoor") as Skin));
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.apply(ed, { x, y, dx: 0, dy: 0 }, erase, false);
  },
  sample(ed, p) {
    const t = tileAt(ed.map, p.x, p.y, ed.z);
    if (t === T.FLOOR || t === T.DOOR || t === T.STAIRS) ed.opt["floor.skin"] = skinAt(ed.map, p.x, p.y, ed.z);
  },
};

const EDGE_KINDS: Choice[] = [
  { value: String(E.WALL), label: "Wall" }, { value: String(E.WINDOW), label: "Window" },
  { value: String(E.DOOR), label: "Door" }, { value: String(E.GLASS), label: "Glass" },
];

const walls: Tool = {
  id: "walls", name: "Walls", key: "Digit2",
  help: "Walls, windows, doors and glass on the edges between tiles. Drag along a line. Right: clear. Shift-drag: wall a room round. Alt-click: pick up an edge.",
  target: () => "edge",
  options: () => [
    { id: "kind", label: "Edge", choices: EDGE_KINDS },
    { id: "skin", label: "Wall", choices: skins(WALL_SKINS) },
  ],
  apply(ed, p, erase) {
    const kind = Number(opt(ed, "walls", "kind", String(E.WALL))) as EdgeKind;
    setEdge(ed.map, p.x, p.y, ed.z, p.dx, p.dy, erase ? E.NONE : kind, erase ? "none" : (opt(ed, "walls", "skin", "brick") as Skin));
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let x = x0; x <= x1; x++) this.apply(ed, { x, y: y0, dx: 0, dy: -1 }, erase, false), this.apply(ed, { x, y: y1, dx: 0, dy: 1 }, erase, false);
    for (let y = y0; y <= y1; y++) this.apply(ed, { x: x0, y, dx: -1, dy: 0 }, erase, false), this.apply(ed, { x: x1, y, dx: 1, dy: 0 }, erase, false);
  },
  sample(ed, p) {
    const e = edgeAt(ed.map, p.x, p.y, ed.z, p.dx, p.dy);
    if (e === E.NONE) return;
    ed.opt["walls.kind"] = String(e === E.SHUT ? E.DOOR : e === E.SILL ? E.WINDOW : e);
    ed.opt["walls.skin"] = edgeSkinAt(ed.map, p.x, p.y, ed.z, p.dx, p.dy);
  },
};

const props: Tool = {
  id: "props", name: "Props", key: "Digit3",
  help: "A prop on a tile: low (half cover) or high (full cover). Right: take it away. Alt-click: pick up a prop.",
  target: () => "tile",
  options: () => [
    { id: "height", label: "Cover", choices: [{ value: "low", label: "Low (half)" }, { value: "high", label: "High (full)" }] },
    { id: "skin", label: "Prop", choices: skins(PROP_SKINS) },
  ],
  apply(ed, p, erase) {
    const m = ed.map, t = tileAt(m, p.x, p.y, ed.z);
    if (erase) {
      if (t === T.LOW || t === T.HIGH) {
        dropFurnitureAt(m, p.x, p.y, ed.z, p);
        setTile(m, p.x, p.y, ed.z, T.FLOOR, floorNear(m, p.x, p.y, ed.z));
      }
      return;
    }
    if (t === T.VOID) return;
    dropFurnitureAt(m, p.x, p.y, ed.z);
    setTile(m, p.x, p.y, ed.z, opt(ed, "props", "height", "low") === "high" ? T.HIGH : T.LOW, opt(ed, "props", "skin", "crate") as Skin);
  },
  sample(ed, p) {
    const t = tileAt(ed.map, p.x, p.y, ed.z);
    if (t !== T.LOW && t !== T.HIGH) return;
    ed.opt["props.skin"] = skinAt(ed.map, p.x, p.y, ed.z);
    ed.opt["props.height"] = t === T.HIGH ? "high" : "low";
  },
};

const furniture: Tool = {
  id: "furniture", name: "Furniture", key: "Digit4",
  help: "Furniture over several tiles, from the corner under the pointer. T turns it. Right: take it away.",
  target: () => "tile",
  options: () => [
    { id: "kind", label: "Piece", choices: (Object.keys(FURNITURE_SIZE) as FurnitureKind[]).map((k) => ({ value: k, label: `${k} (${FURNITURE_SIZE[k].join(" × ")})` })) },
    { id: "facing", label: "Faces", choices: DIRS.map(([v]) => ({ value: v, label: { n: "North ↑", e: "East →", s: "South ↓", w: "West ←" }[v]! })) },
  ],
  ghost(ed, p) {
    const [, dx, dy] = dirOf(opt(ed, "furniture", "facing", "s"));
    const f = footprint(opt(ed, "furniture", "kind", "sofa") as FurnitureKind, p.x, p.y, ed.z, dx, dy);
    let ok = true;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (tileAt(ed.map, x, y, ed.z) !== T.FLOOR) ok = false;
    return { ...f, ok };
  },
  apply(ed, p, erase, first) {
    if (!first) return;
    if (erase) return dropFurnitureAt(ed.map, p.x, p.y, ed.z);
    const g = this.ghost!(ed, p)!;
    if (!g.ok) return;
    const kind = opt(ed, "furniture", "kind", "sofa") as FurnitureKind;
    for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) setTile(ed.map, x, y, ed.z, T.LOW, furnitureSkin(kind));
    ed.map.furniture.push({ x: g.x, y: g.y, z: ed.z, w: g.w, h: g.h, kind, dx: g.dx, dy: g.dy });
  },
  onKey(ed, code) {
    if (code !== "KeyT") return false;
    const order = ["n", "e", "s", "w"];
    ed.opt["furniture.facing"] = order[(order.indexOf(opt(ed, "furniture", "facing", "s")) + 1) % 4]!;
    return true;
  },
};

const stairs: Tool = {
  id: "stairs", name: "Stairs", key: "Digit5",
  help: "Stairs up to the same tile on the level above (which must be floor). Click again to take them away.",
  target: () => "tile",
  options: () => [],
  apply(ed, p, erase, first) {
    if (!first) return;
    const t = tileAt(ed.map, p.x, p.y, ed.z);
    if (t === T.VOID) return;
    if (erase || t === T.STAIRS) setTile(ed.map, p.x, p.y, ed.z, T.FLOOR, floorNear(ed.map, p.x, p.y, ed.z));
    else {
      dropFurnitureAt(ed.map, p.x, p.y, ed.z);
      setTile(ed.map, p.x, p.y, ed.z, T.STAIRS, "wood");
    }
  },
};

const lamps: Tool = {
  id: "lamps", name: "Lamps", key: "Digit6",
  help: "Lamps: a street lamp or brazier on a tile, a ceiling fitting, or a lamp on a wall (over a door). Click again to take it away.",
  target: (ed) => (opt(ed, "lamps", "kind", "ceiling") === "wall" ? "edge" : "tile"),
  options: () => [{ id: "kind", label: "Lamp", choices: [{ value: "ceiling", label: "Ceiling" }, { value: "wall", label: "On a wall" }, { value: "post", label: "Street lamp" }] }],
  apply(ed, p, erase, first) {
    if (!first) return;
    const kind = opt(ed, "lamps", "kind", "ceiling");
    const here = ed.map.lights.findIndex((l) => l.x === p.x && l.y === p.y && l.z === ed.z && (kind !== "wall" || (l.wall?.[0] === p.dx && l.wall?.[1] === p.dy)));
    if (here >= 0) return void ed.map.lights.splice(here, 1);
    if (erase) return;
    ed.map.lights.push(kind === "ceiling" ? { x: p.x, y: p.y, z: ed.z, ceiling: true } : kind === "wall" ? { x: p.x, y: p.y, z: ed.z, wall: [p.dx, p.dy] } : { x: p.x, y: p.y, z: ed.z });
  },
};

export const ROLE_COLOUR: Record<string, string> = {
  vampire: "#b060ff", elder: "#ffd700", thrall: "#e05040", patrol: "#ff9a40", civilian: "#e8e8e8", prisoner: "#40c8ff",
  loot: "#c8a040", landing: "#5fe0a0", extraction: "#5fe0a0", parking: "#8a9aaa",
};

const nodes: Tool = {
  id: "nodes", name: "Nodes", key: "Digit7",
  help: "Points with a role: where vampires rest, thralls stand, civilians are, the prisoner is held, loot lies, the team lands or leaves. Click again or right-click to take one away.",
  target: () => "tile",
  options: () => [{ id: "role", label: "Role", choices: NODE_ROLES.map((r) => ({ value: r, label: r, colour: ROLE_COLOUR[r] })) }],
  apply(ed, p, erase, first) {
    if (!first) return;
    const role = opt(ed, "nodes", "role", "vampire") as NodeRole;
    const at = ed.nodes.findIndex((n) => n.x === p.x && n.y === p.y && n.z === ed.z && (erase || n.role === role));
    if (at >= 0) return void ed.nodes.splice(at, 1);
    if (!erase) ed.nodes.push({ x: p.x, y: p.y, z: ed.z, role });
  },
};

/** Every tool, in toolbar order. */
export const TOOLS: Tool[] = [floor, walls, props, furniture, stairs, lamps, nodes];
