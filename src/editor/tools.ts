// The block editor's tools. Each is one entry in TOOLS: what it points at (a
// tile or an edge), the options it shows, and what a click or a drag does.
// Tools edit the block as authored (tactical/map/blocks.ts: floors with their
// wall skins, things on them, exceptions on edges); the walls follow.
// To add a tool, write one and add it to the list; its menus can come from
// the game's own lists (skins, furniture kinds, node roles, edge
// exceptions), so anything new there shows up here by itself.
import {
  DECOR_AT,
  FLIGHT_SIZE,
  flightAt,
  FURNITURE_SIZE,
  furnitureAnchor,
  furnitureSize,
  furnitureCover,
  furnitureSkin,
  SKINS,
  T,
  tileAt,
  VEHICLE_LENGTH,
  vehicleSkin,
  type BattleMap,
  type DecorKind,
  type FlightKind,
  type Furniture,
  type FurnitureKind,
  type Skin,
  type VehicleKind,
} from "../tactical/map/map";
import { PIECES, pieceLabel } from "../tactical/map/pieces";
import {
  edgeIndex,
  floorCell,
  NODE_ROLES,
  type BlockData,
  type NodeRole,
} from "../tactical/map/blocks";
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

/** Where the pointer is: a tile, the side of it nearest the pointer, and the nearest grid corner (cx, cy). */
export interface Pick {
  x: number;
  y: number;
  dx: number;
  dy: number;
  cx: number;
  cy: number;
}

export interface Choice {
  value: string;
  label: string;
  colour?: string;
  group?: string;
}
export interface OptionSpec {
  id: string;
  label: string;
  choices: Choice[];
}

/** A footprint drawn under the pointer before a click (furniture); `point`: a piece on a grid corner instead. */
interface Ghost {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  ok: boolean;
  point?: boolean;
}

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

const opt = (ed: Editor, tool: string, id: string, fallback: string) =>
  ed.opt[`${tool}.${id}`] ?? fallback;
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

const FLOOR_SKINS: Skin[] = [
  "indoor",
  "tile",
  "concrete",
  "wood",
  "pavement",
  "road",
  "tarmac",
  "grass",
  "dirt",
  "stone",
  "roof",
  "crypt",
];
const WALL_SKINS: Skin[] = ["brick", "plaster", "clinic", "metal", "stone", "planks", "rock"];

const DIRS: [string, number, number][] = [
  ["n", 0, -1],
  ["e", 1, 0],
  ["s", 0, 1],
  ["w", -1, 0],
];
const dirOf = (v: string) => DIRS.find((d) => d[0] === v) ?? DIRS[2]!;

/** Takes away any vehicle over a tile on this level. */
function dropVehicleAt(ed: Editor, x: number, y: number) {
  ed.data.vehicles = ed.data.vehicles.filter(
    (v) => !(v.z === ed.z && x >= v.x && y >= v.y && x < v.x + v.w && y < v.y + v.h),
  );
}

/** Takes away any furniture over a tile. */
function dropFurnitureAt(ed: Editor, x: number, y: number) {
  ed.data.furniture = ed.data.furniture.filter(
    (f) => !(f.z === ed.z && x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h),
  );
}

/** A piece's footprint from its corner, facing (dx, dy): its length across the way it faces. */
export function footprint(
  kind: FurnitureKind,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
): Furniture {
  const [len, depth] = furnitureSize(kind);
  return dy
    ? { x, y, z, w: len, h: depth, kind, dx, dy }
    : { x, y, z, w: depth, h: len, kind, dx, dy };
}

// ---------------------------------------------------------------------------
// The tools

/** The floor string the floor tool paints: "skin" or "skin/exterior/interior". */
function floorBrush(ed: Editor): string {
  const skin = opt(ed, "floor", "skin", "indoor");
  return opt(ed, "floor", "walls", "walls") === "none"
    ? skin
    : `${skin}/${opt(ed, "floor", "ext", "brick")}/${opt(ed, "floor", "int", "plaster")}`;
}

const floor: Tool = {
  id: "floor",
  name: "Floor",
  key: "Digit1",
  help: "Paint floor. With walls on, every edge where it meets a different floor gets a wall: the exterior skin against open ground or nothing, the interior skin against another room. Right: erase. Shift-drag: fill a rectangle. Alt-click: pick up a floor and its walls.",
  target: () => "tile",
  options: (ed) => [
    { id: "skin", label: "Floor", choices: skins(FLOOR_SKINS) },
    {
      id: "walls",
      label: "Walls",
      choices: [
        { value: "walls", label: "Walls round it" },
        { value: "none", label: "No walls" },
      ],
    },
    ...(opt(ed, "floor", "walls", "walls") === "none"
      ? []
      : [
          { id: "ext", label: "Exterior walls", choices: skins(WALL_SKINS) },
          { id: "int", label: "Interior walls", choices: skins(WALL_SKINS) },
        ]),
  ],
  apply(ed, p, erase) {
    const L = level(ed),
      i = tileI(ed, p);
    if (erase) {
      L.floor[i] = "";
      L.obj[i] = "";
      dropFurnitureAt(ed, p.x, p.y);
      dropVehicleAt(ed, p.x, p.y);
    } else L.floor[i] = floorBrush(ed);
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        this.apply(ed, { x, y, dx: 0, dy: 0, cx: x, cy: y }, erase, false);
  },
  sample(ed, p) {
    const c = floorCell(level(ed).floor[tileI(ed, p)]!);
    if (!c) return;
    ed.opt["floor.skin"] = c.skin;
    ed.opt["floor.walls"] = c.walls ? "walls" : "none";
    if (c.walls) ((ed.opt["floor.ext"] = c.walls.ext), (ed.opt["floor.int"] = c.walls.int));
  },
};

const EDGE_CHOICES: Choice[] = [
  { value: "door", label: "Door" },
  { value: "garage", label: "Roller door" },
  { value: "slide", label: "Sliding door" },
  { value: "window", label: "Window" },
  { value: "glass", label: "Glass" },
  { value: "rail", label: "Railing" },
  { value: "open", label: "No wall" },
  { value: "wall", label: "Wall" },
];

const openings: Tool = {
  id: "openings",
  name: "Doors & windows",
  key: "Digit3",
  help: "Exceptions on the walls the floors give: a door (roller and sliding doors pair off two tiles wide), a window, floor-to-ceiling glass, a railing (half cover along a raised edge), no wall (an opening), or a wall where none would be (between two rooms of the same floor). They take the wall's skin. Drag along a line. Right: back to what the floors give. Shift-drag: round a rectangle. Alt-click: pick one up.",
  target: () => "edge",
  options: () => [{ id: "kind", label: "Put", choices: EDGE_CHOICES }],
  apply(ed, p, erase) {
    const e = edgeIndex(ed.data.w, p.x, p.y, p.dx, p.dy);
    level(ed)[e.list][e.i] = erase ? "" : opt(ed, "openings", "kind", "door");
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let x = x0; x <= x1; x++)
      (this.apply(ed, { x, y: y0, dx: 0, dy: -1, cx: 0, cy: 0 }, erase, false),
        this.apply(ed, { x, y: y1, dx: 0, dy: 1, cx: 0, cy: 0 }, erase, false));
    for (let y = y0; y <= y1; y++)
      (this.apply(ed, { x: x0, y, dx: -1, dy: 0, cx: 0, cy: 0 }, erase, false),
        this.apply(ed, { x: x1, y, dx: 1, dy: 0, cx: 0, cy: 0 }, erase, false));
  },
  sample(ed, p) {
    const e = edgeIndex(ed.data.w, p.x, p.y, p.dx, p.dy),
      v = level(ed)[e.list][e.i];
    if (v) ed.opt["openings.kind"] = v;
  },
};

const markings: Tool = {
  id: "markings",
  name: "Markings",
  key: "Digit2",
  help: "Paint on the ground (street level only): parking-bay dividers, a line through the middle of each tile you drag over, running the way you choose (T turns it). Right: rub it out. Shift-drag: a rectangle. Alt-click: pick one up.",
  target: () => "tile",
  options: () => [
    { id: "mark", label: "Mark", choices: [{ value: "bay", label: "Bay divider" }] },
    {
      id: "run",
      label: "Runs",
      choices: [
        { value: "ns", label: "North–south ↕" },
        { value: "ew", label: "East–west ↔" },
      ],
    },
  ],
  apply(ed, p, erase) {
    if (ed.z !== ed.data.below) return;
    const ls = ed.data.bayLines.filter((l) => l.x !== p.x || l.y !== p.y);
    if (!erase && level(ed).floor[tileI(ed, p)])
      ls.push({ x: p.x, y: p.y, alongX: opt(ed, "markings", "run", "ns") === "ew" });
    ed.data.bayLines = ls;
  },
  rect(ed, x0, y0, x1, y1, erase) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        this.apply(ed, { x, y, dx: 0, dy: 0, cx: x, cy: y }, erase, false);
  },
  sample(ed, p) {
    const l = ed.data.bayLines.find((q) => q.x === p.x && q.y === p.y);
    if (l) ed.opt["markings.run"] = l.alongX ? "ew" : "ns";
  },
  onKey(ed, code) {
    if (code !== "KeyT") return false;
    ed.opt["markings.run"] = opt(ed, "markings", "run", "ns") === "ew" ? "ns" : "ew";
    return true;
  },
};

/**
 * The props menu, by the cover a piece gives. Values: "s:skin" (one tile,
 * saved as "low:skin" or "high:skin"), "f:kind" (furniture over several
 * tiles), "v:kind" (a vehicle), "d:kind" (dressing, no cover).
 */
type Cover = "high" | "low" | "none";
const COVERS: { value: Cover; label: string }[] = [
  { value: "high", label: "High cover" },
  { value: "low", label: "Low cover" },
  { value: "none", label: "No cover" },
];
const HIGH_SKINS: Skin[] = ["tree", "pillar", "shelf", "rack", "fridge", "pump", "rock"];
const LOW_SKINS: Skin[] = [
  "crate",
  "bin",
  "bench",
  "table",
  "counter",
  "fence",
  "hedge",
  "parapet",
  "hay",
  "rubble",
  "grave",
  "altar",
  "sarcophagus",
];
const SKIN_LABEL: Partial<Record<Skin, string>> = {
  bin: "dumpster",
  tv: "TV stand",
  pump: "fuel pump",
  rack: "pallet rack",
};
const VEHICLES: { kind: VehicleKind; label: string }[] = [
  { kind: "car", label: "Car (any colour)" },
  { kind: "suv", label: "SUV" },
  { kind: "truck", label: "Truck" },
  { kind: "ambulance", label: "Van (ambulance)" },
  { kind: "container", label: "Container" },
];
const DECOR_LABEL: Record<DecorKind, string> = {
  stop_sign: "Stop sign (on a corner)",
  bollard: "Bollard (on a corner)",
  manhole: "Manhole",
  drain_grate: "Drain grate",
};
const furnLabel = (k: FurnitureKind) =>
  (
    ({
      tv: "TV stand",
      concrete_barrier: "Concrete barrier",
      railing_low: "Low railing",
      sofa: "Sofa",
      bed: "Bed",
    }) as Partial<Record<FurnitureKind, string>>
  )[k] ?? pieceLabel(k);

function propChoices(cover: Cover): Choice[] {
  const size = (w: number, h: number) => ` ${w}×${h}`;
  const vehicles = VEHICLES.filter(
    (v) => (vehicleSkin(v.kind) === "truck" ? "high" : "low") === cover,
  ).map((v) => ({
    value: `v:${v.kind}`,
    label: v.label + size(2, VEHICLE_LENGTH[v.kind]),
    colour: SKIN_COLOUR[vehicleSkin(v.kind)],
    group: "Vehicles",
  }));
  // The prop kit's pieces with this cover, by group (tactical/map/pieces.ts).
  const pieces = Object.entries(PIECES)
    .filter(([, d]) => d.cover === cover)
    .map(([k, d]) => ({
      value: `f:${k}`,
      label: furnLabel(k) + (d.size[0] * d.size[1] > 1 ? size(...d.size) : ""),
      colour: SKIN_COLOUR[d.skin],
      group: d.group,
    }));
  if (cover === "none")
    return [
      ...(Object.keys(DECOR_LABEL) as DecorKind[]).map((k) => ({
        value: `d:${k}`,
        label: DECOR_LABEL[k],
        colour: "#c8c8c8",
        group: "Street dressing",
      })),
      ...pieces,
    ];
  const skins = (cover === "high" ? HIGH_SKINS : LOW_SKINS).map((x) => ({
    value: `s:${x}`,
    label: SKIN_LABEL[x] ?? x,
    colour: SKIN_COLOUR[x],
    group: "One tile (boxes)",
  }));
  const furniture =
    cover === "low"
      ? (Object.keys(FURNITURE_SIZE) as FurnitureKind[])
          .filter((k) => !PIECES[k])
          .map((k) => ({
            value: `f:${k}`,
            label: furnLabel(k) + size(...furnitureSize(k)),
            colour: SKIN_COLOUR[furnitureSkin(k)],
            group: "Furniture",
          }))
      : [];
  return [...skins, ...furniture, ...pieces, ...vehicles];
}
const coverOf = (ed: Editor) => opt(ed, "props", "cover", "low") as Cover;
/** The piece chosen, if it's in the menu for the cover chosen (else that menu's first). */
function pieceOf(ed: Editor): string {
  const list = propChoices(coverOf(ed)),
    v = opt(ed, "props", "piece", "");
  return list.some((c) => c.value === v) ? v : list[0]!.value;
}
const FACINGS: Choice[] = DIRS.map(([v]) => ({
  value: v,
  label: { n: "North ↑", e: "East →", s: "South ↓", w: "West ←" }[v]!,
}));

/** A vehicle's footprint from its corner, its front toward (dx, dy). */
function vehicleAt(kind: VehicleKind, x: number, y: number, dx: number, dy: number) {
  const len = VEHICLE_LENGTH[kind];
  return dy
    ? { x, y, w: 2, h: len, front: dy as 1 | -1 }
    : { x, y, w: len, h: 2, front: dx as 1 | -1 };
}

/** Where a piece of dressing would go for the pointer: a grid corner, or the tile's middle. */
const decorSpot = (kind: DecorKind, p: Pick) =>
  DECOR_AT[kind] === "corner" ? { x: p.cx, y: p.cy } : { x: p.x + 0.5, y: p.y + 0.5 };

const props: Tool = {
  id: "props",
  name: "Props",
  key: "Digit4",
  help: 'Props by the cover they give: high, low, or none (dressing). The prop kit\'s pieces are grouped by where they belong (shop, kitchen, farm, lair…); one marked "on a wall" goes on the tile in front of the wall, facing away from it (it may hang over open air: a fire escape). One-tile boxes paint as you drag; a piece (furniture, a barrier, a vehicle) goes down from the corner under the pointer, and T turns it. A car takes a colour of its own on each map. A stop sign or a bollard stands on the grid corner nearest the pointer, so it blocks no tile. Right: take it away. Alt-click: pick one up.',
  target: () => "tile",
  options: (ed) => [
    { id: "cover", label: "Cover", choices: COVERS },
    { id: "piece", label: "Prop", choices: propChoices(coverOf(ed)) },
    ...(pieceOf(ed).startsWith("s:") || pieceOf(ed) === "d:manhole" || pieceOf(ed) === "d:bollard"
      ? []
      : [{ id: "facing", label: "Faces", choices: FACINGS }]),
  ],
  ghost(ed, p) {
    const piece = pieceOf(ed),
      kind = piece.slice(2);
    const [, dx, dy] = dirOf(opt(ed, "props", "facing", "s"));
    const L = level(ed),
      W = ed.data.w,
      H = ed.data.h;
    if (piece.startsWith("d:")) {
      const at = decorSpot(kind as DecorKind, p);
      if (DECOR_AT[kind as DecorKind] === "corner") {
        const ok = [
          [at.x - 1, at.y - 1],
          [at.x, at.y - 1],
          [at.x - 1, at.y],
          [at.x, at.y],
        ].some(([x, y]) => x! >= 0 && y! >= 0 && x! < W && y! < H && !!L.floor[y! * W + x!]);
        return { x: at.x, y: at.y, w: 0, h: 0, dx, dy, ok, point: true };
      }
      return { x: p.x, y: p.y, w: 1, h: 1, dx, dy, ok: !!L.floor[tileI(ed, p)] };
    }
    const f = piece.startsWith("f:")
      ? footprint(kind as FurnitureKind, p.x, p.y, ed.z, dx, dy)
      : piece.startsWith("v:")
        ? { ...vehicleAt(kind as VehicleKind, p.x, p.y, dx, dy), dx, dy }
        : { x: p.x, y: p.y, w: 1, h: 1, dx: 0, dy: 0 };
    let ok = f.x + f.w <= W && f.y + f.h <= H;
    // A piece on a wall with no cover (a fire escape, a satellite dish) may hang over open air.
    const overAir =
      piece.startsWith("f:") && furnitureAnchor(kind) === "back" && furnitureCover(kind) === "none";
    for (let y = f.y; y < f.y + f.h && ok; y++)
      for (let x = f.x; x < f.x + f.w; x++)
        if (
          (!L.floor[y * W + x] && !overAir) ||
          ed.data.flights.some(
            (q) => q.z === ed.z && x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.h,
          )
        )
          ok = false;
    return { x: f.x, y: f.y, w: f.w, h: f.h, dx: f.dx, dy: f.dy, ok };
  },
  apply(ed, p, erase, first) {
    const L = level(ed),
      piece = pieceOf(ed),
      kind = piece.slice(2);
    if (erase) {
      dropFurnitureAt(ed, p.x, p.y);
      dropVehicleAt(ed, p.x, p.y);
      L.obj[tileI(ed, p)] = "";
      // Dressing on this tile, or on the corner nearest the pointer.
      ed.data.decor = ed.data.decor.filter(
        (d) =>
          d.z !== ed.z ||
          !((d.x === p.x + 0.5 && d.y === p.y + 0.5) || (d.x === p.cx && d.y === p.cy)),
      );
      return;
    }
    // Pieces go down on the click; one-tile props paint as the pointer drags.
    if (!piece.startsWith("s:") && !first) return;
    const g = this.ghost!(ed, p)!;
    if (!g.ok) return;
    if (piece.startsWith("d:")) {
      const at = decorSpot(kind as DecorKind, p);
      ed.data.decor = ed.data.decor.filter((d) => d.z !== ed.z || d.x !== at.x || d.y !== at.y);
      ed.data.decor.push({
        kind: kind as DecorKind,
        x: at.x,
        y: at.y,
        z: ed.z,
        dx: g.dx,
        dy: g.dy,
      });
      return;
    }
    // What was there goes: furniture or a vehicle over any of its tiles, props under it.
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) {
        dropFurnitureAt(ed, x, y);
        dropVehicleAt(ed, x, y);
        L.obj[y * ed.data.w + x] = "";
      }
    if (piece.startsWith("f:"))
      ed.data.furniture.push({
        x: g.x,
        y: g.y,
        z: ed.z,
        w: g.w,
        h: g.h,
        kind: kind as FurnitureKind,
        dx: g.dx,
        dy: g.dy,
      });
    else if (piece.startsWith("v:")) {
      const v = vehicleAt(kind as VehicleKind, g.x, g.y, g.dx, g.dy);
      // Paint −1: a colour of its own on each map (blocks.ts, compile).
      ed.data.vehicles.push({
        ...v,
        z: ed.z,
        kind: kind as VehicleKind,
        under: "tarmac",
        paint: -1,
      });
    } else L.obj[tileI(ed, p)] = `${coverOf(ed)}:${kind}`;
  },
  sample(ed, p) {
    const at = (q: { x: number; y: number; w: number; h: number; z: number }) =>
      q.z === ed.z && p.x >= q.x && p.y >= q.y && p.x < q.x + q.w && p.y < q.y + q.h;
    const face = (dx: number, dy: number) =>
      DIRS.find((d) => d[1] === dx && d[2] === dy)?.[0] ?? "s";
    const set = (cover: Cover, piece: string) => (
      (ed.opt["props.cover"] = cover),
      (ed.opt["props.piece"] = piece)
    );
    const v = ed.data.vehicles.find(at);
    if (v) {
      set(vehicleSkin(v.kind) === "truck" ? "high" : "low", `v:${v.kind}`);
      ed.opt["props.facing"] = v.w > v.h ? face(v.front, 0) : face(0, v.front);
      return;
    }
    const f = ed.data.furniture.find(at);
    if (f) {
      set(furnitureCover(f.kind), `f:${f.kind}`);
      ed.opt["props.facing"] = face(f.dx, f.dy);
      return;
    }
    const d = ed.data.decor.find(
      (q) =>
        q.z === ed.z &&
        ((q.x === p.x + 0.5 && q.y === p.y + 0.5) || (q.x === p.cx && q.y === p.cy)),
    );
    if (d) {
      set("none", `d:${d.kind}`);
      ed.opt["props.facing"] = face(d.dx, d.dy);
      return;
    }
    const o = level(ed).obj[tileI(ed, p)]!;
    if (!o.includes(":")) return;
    const [h, x] = o.split(":");
    set(h === "high" ? "high" : "low", `s:${x}`);
  },
  onKey(ed, code) {
    if (code !== "KeyT" || pieceOf(ed).startsWith("s:")) return false;
    const order = ["n", "e", "s", "w"];
    ed.opt["props.facing"] = order[(order.indexOf(opt(ed, "props", "facing", "s")) + 1) % 4]!;
    return true;
  },
};

/** Takes away any flight over a tile on this level. */
function dropFlightAt(ed: Editor, x: number, y: number) {
  ed.data.flights = ed.data.flights.filter(
    (f) => !(f.z === ed.z && x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h),
  );
}

const stairs: Tool = {
  id: "stairs",
  name: "Stairs",
  key: "Digit5",
  help: "A flight up to the level above, from the corner under the pointer: outdoor 2 wide, indoor 1 wide, both 2 long. Nobody stands on it; it's one step from the tile at its foot to the tile past its head (which needs a floor). T turns it. Right: take it away.",
  target: () => "tile",
  options: () => [
    {
      id: "kind",
      label: "Stairs",
      choices: (Object.keys(FLIGHT_SIZE) as FlightKind[]).map((k) => ({
        value: k,
        label: `${k === "outdoor" ? "Outdoor" : "Indoor"} ${FLIGHT_SIZE[k].join("×")}`,
      })),
    },
    {
      id: "up",
      label: "Up toward",
      choices: DIRS.map(([v]) => ({
        value: v,
        label: { n: "North ↑", e: "East →", s: "South ↓", w: "West ←" }[v]!,
      })),
    },
  ],
  ghost(ed, p) {
    const [, dx, dy] = dirOf(opt(ed, "stairs", "up", "n"));
    const f = flightAt(opt(ed, "stairs", "kind", "indoor") as FlightKind, p.x, p.y, ed.z, dx, dy);
    const L = level(ed);
    let ok = ed.z + 1 < ed.data.lv.length && f.x + f.w <= ed.data.w && f.y + f.h <= ed.data.h;
    for (let y = f.y; y < f.y + f.h && ok; y++)
      for (let x = f.x; x < f.x + f.w; x++) if (!L.floor[y * ed.data.w + x]) ok = false;
    return { x: f.x, y: f.y, w: f.w, h: f.h, dx, dy, ok };
  },
  apply(ed, p, erase, first) {
    if (!first) return;
    if (erase) return dropFlightAt(ed, p.x, p.y);
    const g = this.ghost!(ed, p)!;
    if (!g.ok) return;
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) {
        dropFlightAt(ed, x, y);
        dropFurnitureAt(ed, x, y);
        dropVehicleAt(ed, x, y);
        level(ed).obj[y * ed.data.w + x] = "";
      }
    ed.data.flights.push({
      x: g.x,
      y: g.y,
      z: ed.z,
      w: g.w,
      h: g.h,
      kind: opt(ed, "stairs", "kind", "indoor") as FlightKind,
      dx: g.dx,
      dy: g.dy,
    });
  },
  sample(ed, p) {
    const f = ed.data.flights.find(
      (q) => q.z === ed.z && p.x >= q.x && p.y >= q.y && p.x < q.x + q.w && p.y < q.y + q.h,
    );
    if (!f) return;
    ed.opt["stairs.kind"] = f.kind;
    ed.opt["stairs.up"] = DIRS.find((d) => d[1] === f.dx && d[2] === f.dy)?.[0] ?? "n";
  },
  onKey(ed, code) {
    if (code !== "KeyT") return false;
    const order = ["n", "e", "s", "w"];
    ed.opt["stairs.up"] = order[(order.indexOf(opt(ed, "stairs", "up", "n")) + 1) % 4]!;
    return true;
  },
};

const lamps: Tool = {
  id: "lamps",
  name: "Lamps",
  key: "Digit6",
  help: "Lamps: a ceiling fitting, a lamp on a wall (over a door), or a street lamp. Click again to take it away.",
  target: (ed) => (opt(ed, "lamps", "kind", "ceiling") === "wall" ? "edge" : "tile"),
  options: () => [
    {
      id: "kind",
      label: "Lamp",
      choices: [
        { value: "ceiling", label: "Ceiling" },
        { value: "wall", label: "On a wall" },
        { value: "post", label: "Street lamp" },
      ],
    },
  ],
  apply(ed, p, erase, first) {
    if (!first) return;
    const kind = opt(ed, "lamps", "kind", "ceiling"),
      ls = ed.data.lights;
    const here = ls.findIndex(
      (l) =>
        l.x === p.x &&
        l.y === p.y &&
        l.z === ed.z &&
        (kind !== "wall" || (l.wall?.[0] === p.dx && l.wall?.[1] === p.dy)),
    );
    if (here >= 0) return void ls.splice(here, 1);
    if (erase) return;
    ls.push(
      kind === "ceiling"
        ? { x: p.x, y: p.y, z: ed.z, ceiling: true }
        : kind === "wall"
          ? { x: p.x, y: p.y, z: ed.z, wall: [p.dx, p.dy] }
          : { x: p.x, y: p.y, z: ed.z },
    );
  },
};

export const ROLE_COLOUR: Record<string, string> = {
  vampire: "#b060ff",
  elder: "#ffd700",
  thrall: "#e05040",
  patrol: "#ff9a40",
  civilian: "#e8e8e8",
  prisoner: "#40c8ff",
  loot: "#c8a040",
  landing: "#5fe0a0",
  extraction: "#5fe0a0",
  parking: "#8a9aaa",
};

const nodes: Tool = {
  id: "nodes",
  name: "Nodes",
  key: "Digit7",
  help: "Points with a role: where vampires rest, thralls stand, civilians are, the prisoner is held, loot lies, the team lands or leaves. Click again or right-click to take one away.",
  target: () => "tile",
  options: () => [
    {
      id: "role",
      label: "Role",
      choices: NODE_ROLES.map((r) => ({ value: r, label: r, colour: ROLE_COLOUR[r] })),
    },
  ],
  apply(ed, p, erase, first) {
    if (!first) return;
    const role = opt(ed, "nodes", "role", "vampire") as NodeRole,
      ns = ed.data.nodes;
    const at = ns.findIndex(
      (n) => n.x === p.x && n.y === p.y && n.z === ed.z && (erase || n.role === role),
    );
    if (at >= 0) return void ns.splice(at, 1);
    if (!erase && tileAt(ed.map, p.x, p.y, ed.z) !== T.VOID)
      ns.push({ x: p.x, y: p.y, z: ed.z, role });
  },
};

/** Every tool, in toolbar order. */
export const TOOLS: Tool[] = [floor, markings, openings, props, stairs, lamps, nodes];
