// The block editor's tools. Each is one entry in TOOLS: what it points at (a
// tile or an edge), the options it shows, and what a click or a drag does.
// Tools edit the block as authored (tactical/blocks.ts: floors with their
// wall skins, things on them, exceptions on edges); the walls follow.
// To add a tool, write one and add it to the list; its menus can come from
// the game's own lists (skins, furniture kinds, node roles, edge
// exceptions), so anything new there shows up here by itself.
import { FURNITURE_SIZE, furnitureSkin, SKINS, T, tileAt, type BattleMap, type Furniture, type FurnitureKind, type Skin } from "../tactical/map";
import { edgeIndex, floorCell, NODE_ROLES, type BlockData, type NodeRole } from "../tactical/blocks";
import { SKIN_COLOUR } from "../gallery/draw";

/** What the editor hands a tool. */
export interface Editor {
  /** The block as authored: what tools change. */
  data: BlockData;
  /** The block as compiled (walls worked out): to look at, not to change. */
  map: BattleMap;
  /** The level being edited. */
  z: number;
  /** The tools' options, by "tool.option". */
  opt: Record<string, string>;
}

/** Where the pointer is: a tile, and the side of it nearest the pointer. */
export interface Pick { x: number; y: number; dx: number; dy: number }

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
  /** Shift and drag: a rectangle of tiles (fill floors, the edges round a room). */
  rect?(ed: Editor, x0: number, y0: number, x1: number, y1: number, erase: boolean): void;
  /** Alt-click: take what's under the pointer. */
  sample?(ed: Editor, p: Pick): void;
  ghost?(ed: Editor, p: Pick): Ghost | null;
  /** A key while it's the tool (T turns furniture). True if it used it. */
  onKey?(ed: Editor, code: string): boolean;
}

const opt = (ed: Editor, tool: string, id: string, fallback: string) => ed.opt[`${tool}.${id}`] ?? fallback;
const level = (ed: Editor) => ed.data.lv[ed.z]!;
const tileI = (ed: Editor, p: { x: number; y: number }) => p.y * ed.data.w + p.x;

/** Skins as a menu: the usual ones for the job first, then every other skin (so new skins appear). */
function skins(common: Skin[]): Choice[] {
  const rest = SKINS.filter((s) => !common.includes(s));
  return [
    ...common.map((s) => ({ value: s, label: s, colour: SKIN_COLOUR[s], group: "Usual" })),
    ...rest.map((s) => ({ value: s, label: s, colour: SKIN_COLOUR[s], group: "All skins" })),
  ];
}

const FLOOR_SKINS: Skin[] = ["indoor", "tile", "concrete", "wood", "pavement", "road", "tarmac", "grass", "dirt", "stone", "roof", "crypt"];
export const WALL_SKINS: Skin[] = ["brick", "plaster", "clinic", "metal", "stone", "planks", "rock"];
const PROP_SKINS: Skin[] = ["crate", "table", "bench", "counter", "shelf", "fridge", "bin", "rack", "hedge", "fence", "parapet", "tree", "pump", "hay", "grave", "pillar", "altar", "sarcophagus", "rubble", "rock"];

const DIRS: [string, number, number][] = [["n", 0, -1], ["e", 1, 0], ["s", 0, 1], ["w", -1, 0]];
const dirOf = (v: string) => DIRS.find((d) => d[0] === v) ?? DIRS[2]!;

/** Takes away any furniture over a tile. */
export function dropFurnitureAt(ed: Editor, x: number, y: number) {
  ed.data.furniture = ed.data.furniture.filter((f) => !(f.z === ed.z && x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h));
}

/** A piece's footprint from its corner, facing (dx, dy): its length across the way it faces. */
export function footprint(kind: FurnitureKind, x: number, y: number, z: number, dx: number, dy: number): Furniture {
  const [len, depth] = FURNITURE_SIZE[kind];
  return dy ? { x, y, z, w: len, h: depth, kind, dx, dy } : { x, y, z, w: depth, h: len, kind, dx, dy };
}

// ---------------------------------------------------------------------------
// The tools

/** The floor string the floor tool paints: "skin" or "skin/exterior/interior". */
function floorBrush(ed: Editor): string {
  const skin = opt(ed, "floor", "skin", "indoor");
  return opt(ed, "floor", "walls", "walls") === "none" ? skin : `${skin}/${opt(ed, "floor", "ext", "brick")}/${opt(ed, "floor", "int", "plaster")}`;
}

const floor: Tool = {
  id: "floor", name: "Floor", key: "Digit1",
  help: "Paint floor. With walls on, every edge where it meets a different floor gets a wall: the exterior skin against open ground or nothing, the interior skin against another room. Right: erase. Shift-drag: fill a rectangle. Alt-click: pick up a floor and its walls.",
  target: () => "tile",
  options: (ed) => [
    { id: "skin", label: "Floor", choices: skins(FLOOR_SKINS) },
    { id: "walls", label: "Walls", choices: [{ value: "walls", label: "Walls round it" }, { value: "none", label: "No walls" }] },
    ...(opt(ed, "floor", "walls", "walls") === "none" ? [] : [
      { id: "ext", label: "Exterior walls", choices: skins(WALL_SKINS) },
      { id: "int", label: "Interior walls", choices: skins(WALL_SKINS) },
    ]),
  ],
  apply(ed, p, erase) {
    const L = level(ed), i = tileI(ed, p);
    if (erase) {
      L.floor[i] = "";
      L.obj[i] = "";
      dropFurnitureAt(ed, p.x, p.y);
    } else L.floor[i] = floorBrush(ed);
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.apply(ed, { x, y, dx: 0, dy: 0 }, erase, false);
  },
  sample(ed, p) {
    const c = floorCell(level(ed).floor[tileI(ed, p)]!);
    if (!c) return;
    ed.opt["floor.skin"] = c.skin;
    ed.opt["floor.walls"] = c.walls ? "walls" : "none";
    if (c.walls) (ed.opt["floor.ext"] = c.walls.ext), (ed.opt["floor.int"] = c.walls.int);
  },
};

const EDGE_CHOICES: Choice[] = [
  { value: "door", label: "Door" }, { value: "window", label: "Window" }, { value: "glass", label: "Glass" },
  { value: "open", label: "No wall" }, { value: "wall", label: "Wall" },
];

const openings: Tool = {
  id: "openings", name: "Doors & windows", key: "Digit2",
  help: "Exceptions on the walls the floors give: a door, a window, floor-to-ceiling glass, no wall (an opening), or a wall where none would be (between two rooms of the same floor). They take the wall's skin. Drag along a line. Right: back to what the floors give. Shift-drag: round a rectangle. Alt-click: pick one up.",
  target: () => "edge",
  options: () => [{ id: "kind", label: "Put", choices: EDGE_CHOICES }],
  apply(ed, p, erase) {
    const e = edgeIndex(ed.data.w, p.x, p.y, p.dx, p.dy);
    level(ed)[e.list][e.i] = erase ? "" : opt(ed, "openings", "kind", "door");
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let x = x0; x <= x1; x++) this.apply(ed, { x, y: y0, dx: 0, dy: -1 }, erase, false), this.apply(ed, { x, y: y1, dx: 0, dy: 1 }, erase, false);
    for (let y = y0; y <= y1; y++) this.apply(ed, { x: x0, y, dx: -1, dy: 0 }, erase, false), this.apply(ed, { x: x1, y, dx: 1, dy: 0 }, erase, false);
  },
  sample(ed, p) {
    const e = edgeIndex(ed.data.w, p.x, p.y, p.dx, p.dy), v = level(ed)[e.list][e.i];
    if (v) ed.opt["openings.kind"] = v;
  },
};

/** The props menu: furniture over several tiles, then every skin as a one-tile prop. Values "f:kind" or "s:skin". */
function propChoices(): Choice[] {
  const rest = SKINS.filter((x) => !PROP_SKINS.includes(x));
  return [
    ...(Object.keys(FURNITURE_SIZE) as FurnitureKind[]).map((k) => ({ value: `f:${k}`, label: `${k} ${FURNITURE_SIZE[k].join("×")}`, colour: SKIN_COLOUR[furnitureSkin(k)], group: "Furniture (several tiles)" })),
    ...PROP_SKINS.map((x) => ({ value: `s:${x}`, label: x, colour: SKIN_COLOUR[x], group: "One tile" })),
    ...rest.map((x) => ({ value: `s:${x}`, label: x, colour: SKIN_COLOUR[x], group: "Any skin, one tile" })),
  ];
}
const pieceOf = (ed: Editor) => opt(ed, "props", "piece", "s:crate");

const props: Tool = {
  id: "props", name: "Props", key: "Digit3",
  help: "Props and furniture: one tile (low or high cover), or a piece over several tiles from the corner under the pointer (T turns it). The room's walls stay as they are. Right: take it away. Alt-click: pick one up.",
  target: () => "tile",
  options: (ed) => [
    { id: "piece", label: "Prop", choices: propChoices() },
    pieceOf(ed).startsWith("f:")
      ? { id: "facing", label: "Faces", choices: DIRS.map(([v]) => ({ value: v, label: { n: "North ↑", e: "East →", s: "South ↓", w: "West ←" }[v]! })) }
      : { id: "height", label: "Cover", choices: [{ value: "low", label: "Low (half)" }, { value: "high", label: "High (full)" }] },
  ],
  ghost(ed, p) {
    const piece = pieceOf(ed);
    const [, dx, dy] = dirOf(opt(ed, "props", "facing", "s"));
    const f = piece.startsWith("f:") ? footprint(piece.slice(2) as FurnitureKind, p.x, p.y, ed.z, dx, dy) : { x: p.x, y: p.y, w: 1, h: 1, dx: 0, dy: 0 };
    const L = level(ed);
    let ok = f.x + f.w <= ed.data.w && f.y + f.h <= ed.data.h;
    for (let y = f.y; y < f.y + f.h && ok; y++) for (let x = f.x; x < f.x + f.w; x++) if (!L.floor[y * ed.data.w + x] || L.obj[y * ed.data.w + x] === "stairs") ok = false;
    return { x: f.x, y: f.y, w: f.w, h: f.h, dx: f.dx, dy: f.dy, ok };
  },
  apply(ed, p, erase, first) {
    const L = level(ed), piece = pieceOf(ed);
    if (erase) {
      dropFurnitureAt(ed, p.x, p.y);
      if (L.obj[tileI(ed, p)] !== "stairs") L.obj[tileI(ed, p)] = "";
      return;
    }
    // Furniture goes down on the click; one-tile props paint as the pointer drags.
    if (piece.startsWith("f:") && !first) return;
    const g = this.ghost!(ed, p)!;
    if (!g.ok) return;
    // What was there goes: furniture over any of its tiles, props under it.
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) {
        dropFurnitureAt(ed, x, y);
        L.obj[y * ed.data.w + x] = "";
      }
    if (piece.startsWith("f:")) ed.data.furniture.push({ x: g.x, y: g.y, z: ed.z, w: g.w, h: g.h, kind: piece.slice(2) as FurnitureKind, dx: g.dx, dy: g.dy });
    else L.obj[tileI(ed, p)] = `${opt(ed, "props", "height", "low")}:${piece.slice(2)}`;
  },
  sample(ed, p) {
    const f = ed.data.furniture.find((q) => q.z === ed.z && p.x >= q.x && p.y >= q.y && p.x < q.x + q.w && p.y < q.y + q.h);
    if (f) {
      ed.opt["props.piece"] = `f:${f.kind}`;
      ed.opt["props.facing"] = DIRS.find((d) => d[1] === f.dx && d[2] === f.dy)?.[0] ?? "s";
      return;
    }
    const o = level(ed).obj[tileI(ed, p)]!;
    if (!o.includes(":")) return;
    const [h, x] = o.split(":");
    ed.opt["props.height"] = h!;
    ed.opt["props.piece"] = `s:${x}`;
  },
  onKey(ed, code) {
    if (code !== "KeyT" || !pieceOf(ed).startsWith("f:")) return false;
    const order = ["n", "e", "s", "w"];
    ed.opt["props.facing"] = order[(order.indexOf(opt(ed, "props", "facing", "s")) + 1) % 4]!;
    return true;
  },
};

const stairs: Tool = {
  id: "stairs", name: "Stairs", key: "Digit4",
  help: "Stairs up to the same tile on the level above (which needs a floor). Click again to take them away.",
  target: () => "tile",
  options: () => [],
  apply(ed, p, erase, first) {
    if (!first) return;
    const L = level(ed), i = tileI(ed, p);
    if (!L.floor[i]) return;
    if (erase || L.obj[i] === "stairs") L.obj[i] = "";
    else {
      dropFurnitureAt(ed, p.x, p.y);
      L.obj[i] = "stairs";
    }
  },
};

const lamps: Tool = {
  id: "lamps", name: "Lamps", key: "Digit5",
  help: "Lamps: a ceiling fitting, a lamp on a wall (over a door), or a street lamp. Click again to take it away.",
  target: (ed) => (opt(ed, "lamps", "kind", "ceiling") === "wall" ? "edge" : "tile"),
  options: () => [{ id: "kind", label: "Lamp", choices: [{ value: "ceiling", label: "Ceiling" }, { value: "wall", label: "On a wall" }, { value: "post", label: "Street lamp" }] }],
  apply(ed, p, erase, first) {
    if (!first) return;
    const kind = opt(ed, "lamps", "kind", "ceiling"), ls = ed.data.lights;
    const here = ls.findIndex((l) => l.x === p.x && l.y === p.y && l.z === ed.z && (kind !== "wall" || (l.wall?.[0] === p.dx && l.wall?.[1] === p.dy)));
    if (here >= 0) return void ls.splice(here, 1);
    if (erase) return;
    ls.push(kind === "ceiling" ? { x: p.x, y: p.y, z: ed.z, ceiling: true } : kind === "wall" ? { x: p.x, y: p.y, z: ed.z, wall: [p.dx, p.dy] } : { x: p.x, y: p.y, z: ed.z });
  },
};

export const ROLE_COLOUR: Record<string, string> = {
  vampire: "#b060ff", elder: "#ffd700", thrall: "#e05040", patrol: "#ff9a40", civilian: "#e8e8e8", prisoner: "#40c8ff",
  loot: "#c8a040", landing: "#5fe0a0", extraction: "#5fe0a0", parking: "#8a9aaa",
};

const nodes: Tool = {
  id: "nodes", name: "Nodes", key: "Digit6",
  help: "Points with a role: where vampires rest, thralls stand, civilians are, the prisoner is held, loot lies, the team lands or leaves. Click again or right-click to take one away.",
  target: () => "tile",
  options: () => [{ id: "role", label: "Role", choices: NODE_ROLES.map((r) => ({ value: r, label: r, colour: ROLE_COLOUR[r] })) }],
  apply(ed, p, erase, first) {
    if (!first) return;
    const role = opt(ed, "nodes", "role", "vampire") as NodeRole, ns = ed.data.nodes;
    const at = ns.findIndex((n) => n.x === p.x && n.y === p.y && n.z === ed.z && (erase || n.role === role));
    if (at >= 0) return void ns.splice(at, 1);
    if (!erase && tileAt(ed.map, p.x, p.y, ed.z) !== T.VOID) ns.push({ x: p.x, y: p.y, z: ed.z, role });
  },
};

/** Every tool, in toolbar order. */
export const TOOLS: Tool[] = [floor, openings, props, stairs, lamps, nodes];
