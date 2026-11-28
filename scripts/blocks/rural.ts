// The rural blocks' drafts (docs/design/block-design.md): `npm run draft -- rural`.
// Coordinates: x east, y south; the south row is the front, on the lane.
// Each family's first block, then its variants (variantOf).
import { Draft, meta as m, type Drafts, type S } from "./kit";
import type { BlockMeta } from "../../src/tactical/map/blocks";

const rural = (
  id: string,
  name: string,
  type: BlockMeta["type"],
  entrances: S[],
  targets: BlockMeta["targets"],
  notes: string,
  variantOf?: string,
) => m(id, name, ["rural"], type, entrances, targets, notes, variantOf);

const hedgeRow = (a: Draft, z: number, y: number, x0: number, x1: number, gaps: number[]) =>
  a.row(z, "high:hedge", y, x0, x1, gaps);
const hedgeCol = (a: Draft, z: number, x: number, y0: number, y1: number, gaps: number[]) =>
  a.col(z, "high:hedge", x, y0, y1, gaps);

// ---------------------------------------------------------------------------
// Farmhouse

/** The through-hall farmhouse; brick with an attached garage (mirrored) for the variant. */
function farmhouse(v: "a" | "b") {
  const garage = v === "b";
  const a = new Draft(
    garage
      ? rural(
          "farmhouse-b",
          "Farmhouse with garage",
          "structure",
          ["s", "n"],
          ["nest", "rescue"],
          "Brick farmhouse, the through-hall plan the other way round, with an attached garage: the car nosed out behind the roller door, the door through to the utility room. No drive to the yard: round by the side.",
          "farmhouse",
        )
      : rural(
          "farmhouse",
          "Farmhouse",
          "structure",
          ["s", "n"],
          ["nest", "rescue"],
          "Stone farmhouse. Ground: hall (stairs, front and back doors), living room, kitchen, dining room, utility with a side door, WC off the hall, pantry off the dining room. Upstairs: three bedrooms, bathroom, box room. Pickup on the drive, yard behind.",
        ),
    16,
    16,
    0,
    3,
    "grass",
  );
  const wall = garage ? "brick" : "stone";
  const W = `wood/${wall}/plaster`,
    K = `tile/${wall}/plaster`,
    P = `stone/${wall}/plaster`;
  // Ground floor.
  a.room(0, 1, 8, 4, 11, W) // living room
    .room(0, 5, 4, 6, 11, W) // hall
    .room(0, 1, 4, 4, 7, K) // kitchen
    .room(0, 7, 8, 10, 11, W) // dining room
    .room(0, 7, 4, 10, 5, K) // utility
    .room(0, 7, 6, 8, 7, K) // WC
    .room(0, 9, 6, 10, 7, P); // pantry
  a.flight(0, 6, 5, "n");
  a.edge(0, "s", "door", [5, 11]).edge(0, "n", "door", [5, 4]);
  a.edge(0, "e", "door", [4, 10], [4, 6]).edge(0, "w", "door", [7, 10], [7, 4], [7, 7]);
  a.edge(0, "n", "door", [9, 8]).edge(0, "e", "door", [10, 5]);
  a.edge(0, "s", "window", [2, 11], [3, 11], [8, 11], [9, 11]);
  a.edge(0, "w", "window", [1, 10], [1, 5]).edge(0, "n", "window", [3, 4], [8, 4]);
  if (!garage) a.edge(0, "e", "window", [10, 9], [10, 10]);
  // Kitchen: fridge and units along the west wall, the sink under the window, a table.
  a.piece("kitchen_fridge", 1, 4, 0, "e")
    .piece("kitchen_counter", 1, 5, 0, "e")
    .piece("kitchen_stove", 1, 6, 0, "e")
    .piece("kitchen_counter", 1, 7, 0, "e")
    .piece("kitchen_sink", 3, 4, 0, "s")
    .piece("kitchen_counter", 4, 4, 0, "s");
  a.ob(0, "low:table", [3, 6]);
  // Living room: sofa facing the TV, chairs, books.
  a.piece("sofa", 1, 9, 0, "e")
    .piece("tv", 4, 8, 0, "w")
    .piece("wingback_chair", 1, 8, 0, "e")
    .piece("bookcase", 3, 8, 0, "s")
    .piece("rocking_chair", 1, 11, 0, "e");
  // Dining room.
  a.ob(0, "low:table", [8, 9], [9, 9]);
  a.piece("bookcase", 10, 8, 0, "w");
  // Utility, WC, pantry.
  a.piece("washing_machine", 8, 4, 0, "s").piece("kitchen_sink", 9, 4, 0, "s");
  a.piece("tool_rack", 10, 4, 0, "w");
  a.piece("toilet_clean", 8, 7, 0, "w").piece("basin", 8, 6, 0, "w");
  a.piece("shelf_wall", 10, 6, 0, "w").piece("shelf_wall", 10, 7, 0, "w");
  // Upstairs.
  a.room(1, 5, 4, 6, 11, W) // landing
    .room(1, 1, 8, 4, 11, W) // main bedroom
    .room(1, 1, 4, 4, 7, W) // children's room
    .room(1, 7, 4, 8, 6, K) // bathroom
    .room(1, 9, 4, 10, 6, W) // box room
    .room(1, 7, 7, 10, 11, W); // spare bedroom
  a.edge(1, "e", "door", [4, 10], [4, 6]).edge(1, "w", "door", [7, 4], [7, 8]);
  a.edge(1, "s", "door", [9, 6]);
  a.edge(1, "s", "window", [2, 11], [3, 11], [8, 11], [9, 11]);
  a.edge(1, "n", "window", [2, 4]).edge(1, "w", "window", [1, 6], [1, 10]);
  a.edge(1, "e", "window", [10, 9]);
  a.piece("bed", 1, 9, 1, "e").piece("wardrobe", 4, 8, 1, "w").piece("wardrobe", 4, 11, 1, "w");
  a.piece("bed_single", 1, 4, 1, "s")
    .piece("bed_single", 3, 4, 1, "s")
    .piece("wardrobe", 1, 7, 1, "e");
  a.piece("bath", 8, 4, 1, "w").piece("basin", 8, 5, 1, "w").piece("toilet_clean", 8, 6, 1, "w");
  a.ob(1, "low:crate", [10, 4]).ob(1, "high:crate", [10, 5]);
  a.piece("bed", 9, 9, 1, "w").piece("wardrobe", 10, 7, 1, "s");
  a.fl(2, 1, 4, 10, 11, "roof");
  if (garage) {
    // The garage, through the utility room's side door; the car nosed out, the way to the door clear.
    a.room(0, 11, 4, 14, 11, "concrete/brick/plaster");
    a.edge(0, "s", "garage", [12, 11], [13, 11]).edge(0, "e", "window", [14, 8], [14, 9]);
    a.car("car", 12, 6, 0, "y", 1, "concrete");
    a.piece("workbench", 14, 4, 0, "w").piece("tool_rack", 11, 4, 0, "s");
    a.piece("tyre_stack", 11, 10, 0, "n").piece("bicycle", 11, 7, 0, "e");
    a.fl(1, 11, 4, 14, 11, "roof");
    hedgeRow(a, 0, 15, 0, 15, [5, 12, 13]);
    hedgeRow(a, 0, 0, 0, 15, [5, 12]);
    a.fl(0, 5, 12, 5, 15, "dirt").fl(0, 12, 12, 13, 15, "dirt").fl(0, 1, 1, 14, 3, "dirt");
    a.fl(0, 5, 0, 5, 0, "dirt").fl(0, 12, 0, 12, 0, "dirt");
    a.piece("mailbox_post", 6, 14, 0, "s");
    a.ob(0, "high:tree", [1, 13], [9, 13], [15, 13]);
    a.ceiling(12, 9, 0).lamp(12, 12, 0, "n");
  } else {
    // Outside: hedge and gate on the lane, the path, the drive to the yard, the yard.
    hedgeRow(a, 0, 15, 0, 15, [5, 11, 12]);
    hedgeRow(a, 0, 0, 0, 15, [5, 11, 12]);
    a.fl(0, 5, 12, 5, 15, "dirt")
      .fl(0, 11, 0, 12, 15, "dirt")
      .fl(0, 1, 1, 14, 3, "dirt")
      .fl(0, 5, 0, 5, 0, "dirt");
    a.car("suv", 11, 7, 0, "y", -1);
    a.piece("mailbox_post", 6, 14, 0, "s");
    a.ob(0, "high:tree", [1, 13], [9, 13], [14, 5], [14, 11]);
  }
  a.piece("rotary_clothesline", 2, 2, 0, "s")
    .piece("woodpile", 9, 3, 0, "n")
    .piece("wheelbarrow", 7, 2, 0, "s")
    .piece("doghouse", 14, 2, 0, "w")
    .piece("chicken_coop", 1, 1, 0, "s")
    .piece("veg_bed", 8, 1, 0, "s")
    .piece("veg_bed", 9, 1, 0, "s");
  a.lamp(5, 12, 0, "n").lamp(5, 3, 0, "s");
  if (!garage) a.lamp(11, 5, 0, "w");
  a.node("vampire", [3, 9, 1], [8, 9, 1])
    .node("thrall", [2, 6, 0], [2, 10, 0], [8, 2, 0], [6, 9, 1])
    .node("prisoner", [9, 7, 0])
    .node("patrol", [3, 13, 0], [8, 14, 0]);
  if (garage) a.mirror();
  return a.done();
}

/** A farmhouse entered by the kitchen, the stairs in a hall behind it. */
function farmhouseC() {
  const a = new Draft(
    rural(
      "farmhouse-c",
      "Farmhouse, kitchen at the front",
      "structure",
      ["s", "n"],
      ["nest", "rescue"],
      "Plastered farmhouse entered by the kitchen, as farmhouses are. Ground: the big kitchen and the living room at the front, behind them the boot room (back door), the stair hall, a WC and the farm office. Upstairs: two bedrooms, the bathroom and a box room off the landing. Picket fence on the lane, the car on the drive.",
      "farmhouse",
    ),
    16,
    16,
    0,
    3,
    "grass",
  );
  const W = "wood/plaster/plaster",
    K = "tile/plaster/plaster";
  a.room(0, 2, 6, 6, 10, K) // kitchen
    .room(0, 7, 6, 11, 10, W) // living room
    .room(0, 2, 3, 4, 5, K) // boot room
    .room(0, 5, 3, 8, 5, W) // stair hall
    .room(0, 9, 3, 9, 5, K) // WC
    .room(0, 10, 3, 11, 5, W); // office
  a.flight(0, 6, 4, "w");
  a.edge(0, "s", "door", [4, 10], [3, 5], [5, 5], [8, 5], [10, 5]);
  a.edge(0, "e", "door", [6, 8]).edge(0, "n", "door", [3, 3]).edge(0, "w", "door", [9, 4]);
  a.edge(0, "s", "window", [3, 10], [5, 10], [8, 10], [10, 10]);
  a.edge(0, "w", "window", [2, 8], [2, 4]).edge(0, "e", "window", [11, 7], [11, 9], [11, 4]);
  // Kitchen: the range and units down the west wall, the sink under its window, a big table.
  a.piece("kitchen_fridge", 2, 6, 0, "e")
    .piece("kitchen_counter", 2, 7, 0, "e")
    .piece("kitchen_sink", 2, 8, 0, "e")
    .piece("kitchen_stove", 2, 9, 0, "e")
    .piece("kitchen_counter", 6, 10, 0, "w")
    .piece("bookcase", 6, 6, 0, "s");
  a.ob(0, "low:table", [4, 8], [5, 8]);
  // Living room.
  a.piece("sofa", 9, 10, 0, "n").piece("tv", 9, 7, 0, "s");
  a.piece("wingback_chair", 7, 7, 0, "e").piece("bookcase", 11, 6, 0, "s");
  a.piece("rocking_chair", 7, 10, 0, "n");
  // Boot room, WC, office.
  a.piece("washing_machine", 2, 3, 0, "s").piece("tool_rack", 4, 3, 0, "s");
  a.piece("toilet_clean", 9, 3, 0, "s").piece("basin", 9, 5, 0, "n");
  a.piece("desk_set_papers", 11, 3, 0, "s").piece("filing_cabinet", 10, 3, 0, "s");
  // Upstairs.
  a.room(1, 5, 3, 8, 5, W) // landing
    .room(1, 2, 3, 4, 5, K) // bathroom
    .room(1, 2, 6, 6, 10, W) // main bedroom
    .room(1, 7, 6, 11, 10, W) // second bedroom
    .room(1, 9, 3, 11, 5, W); // box room
  a.edge(1, "e", "door", [4, 4]).edge(1, "s", "door", [5, 5], [8, 5]).edge(1, "w", "door", [9, 4]);
  a.edge(1, "s", "window", [3, 10], [5, 10], [8, 10], [10, 10]);
  a.edge(1, "w", "window", [2, 8]).edge(1, "e", "window", [11, 8]);
  a.edge(1, "n", "window", [3, 3], [10, 3]);
  a.piece("bath", 2, 3, 1, "s").piece("toilet_clean", 4, 3, 1, "s").piece("basin", 2, 5, 1, "e");
  a.piece("bed", 2, 7, 1, "e").piece("wardrobe", 6, 6, 1, "s").piece("wardrobe", 2, 10, 1, "n");
  a.piece("bed_single", 10, 6, 1, "w").piece("bed_single", 10, 8, 1, "w");
  a.piece("wardrobe", 7, 10, 1, "n").piece("chair", 7, 7, 1, "e");
  a.ob(1, "low:crate", [11, 3], [11, 5]).ob(1, "high:crate", [10, 3]);
  a.fl(2, 2, 3, 11, 10, "roof");
  // Outside: a picket fence on the lane (gate to the kitchen door, a gap for the drive), the yard behind.
  for (const x of [0, 2, 5, 7, 9]) a.piece("picket_fence", x, 15, 0, "s");
  a.piece("picket_gate", 11, 15, 0, "s").piece("picket_fence", 14, 15, 0, "s");
  a.fl(0, 4, 11, 4, 15, "dirt").fl(0, 12, 4, 13, 15, "dirt").fl(0, 1, 0, 14, 2, "dirt");
  a.car("car", 12, 7, 0, "y", -1);
  hedgeRow(a, 0, 0, 0, 15, [3, 12, 13]);
  a.ob(0, "high:tree", [14, 3], [0, 12], [8, 13]);
  a.piece("mailbox_post", 3, 14, 0, "s");
  a.piece("rotary_clothesline", 6, 1, 0, "s")
    .piece("chicken_coop", 9, 1, 0, "s")
    .piece("woodpile", 1, 2, 0, "e")
    .piece("wheelbarrow", 14, 1, 0, "w");
  a.lamp(4, 11, 0, "n").lamp(3, 2, 0, "s");
  a.node("vampire", [3, 9, 1], [9, 9, 1])
    .node("thrall", [4, 7, 0], [9, 8, 0], [3, 1, 0], [5, 3, 1])
    .node("prisoner", [10, 4, 0])
    .node("patrol", [8, 12, 0], [1, 13, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Cottage

function cottage(v: "a" | "c") {
  const c = v === "c";
  const a = new Draft(
    c
      ? rural(
          "cottage-c",
          "Cottage, plastered",
          "structure",
          ["s", "n"],
          ["nest"],
          "The cottage the other way round, plastered, behind a picket fence; hens and vegetables out the back instead of the shed.",
          "cottage",
        )
      : rural(
          "cottage",
          "Cottage",
          "structure",
          ["s", "n"],
          ["nest"],
          "Brick cottage, one storey: living room open to a galley kitchen, bedroom and bathroom off the living room, a back porch through the kitchen. Front garden, back garden with a shed.",
        ),
    8,
    16,
    0,
    2,
    "grass",
  );
  const wall = c ? "plaster" : "brick";
  const W = `wood/${wall}/plaster`,
    K = `tile/${wall}/plaster`;
  a.room(0, 1, 8, 4, 11, W) // living room
    .room(0, 5, 8, 6, 11, K) // kitchen
    .room(0, 1, 5, 3, 7, W) // bedroom
    .room(0, 4, 5, 5, 7, K) // bathroom
    .room(0, 6, 5, 6, 7, K); // back porch
  a.edge(0, "e", "open", [4, 10], [4, 11]);
  a.edge(0, "s", "door", [2, 11], [3, 7], [4, 7], [6, 7]).edge(0, "n", "door", [6, 5]);
  a.edge(0, "s", "window", [3, 11]).edge(0, "w", "window", [1, 9]);
  a.edge(0, "e", "window", [6, 9], [6, 10]).edge(0, "n", "window", [2, 5]);
  a.piece("sofa", 1, 10, 0, "n").piece("tv", 1, 8, 0, "s").piece("wingback_chair", 4, 9, 0, "w");
  a.piece("kitchen_fridge", 5, 8, 0, "s")
    .piece("kitchen_sink", 6, 9, 0, "w")
    .piece("kitchen_stove", 6, 10, 0, "w")
    .piece("kitchen_counter", 6, 11, 0, "w");
  a.piece("bed", 1, 5, 0, "e").piece("wardrobe", 3, 5, 0, "s");
  a.piece("toilet_clean", 4, 5, 0, "s").piece("bath", 5, 5, 0, "s").piece("basin", 5, 7, 0, "w");
  a.piece("tool_rack", 6, 6, 0, "w");
  a.fl(1, 1, 5, 6, 11, "roof");
  if (c) {
    for (const x of [0, 3, 5]) a.piece("picket_fence", x, 15, 0, "s");
    a.piece("picket_gate", 7, 15, 0, "s");
  } else hedgeRow(a, 0, 15, 0, 7, [2]);
  hedgeRow(a, 0, 0, 0, 7, [4]);
  a.fl(0, 2, 12, 2, 15, "dirt").fl(0, 4, 0, 6, 4, "dirt").fl(0, 6, 4, 6, 4, "dirt");
  a.piece("mailbox_post", 3, 14, 0, "s");
  a.ob(0, "high:tree", [6, 13], [1, 3]);
  if (c)
    a.piece("chicken_coop", 1, 1, 0, "e")
      .piece("rotary_clothesline", 3, 2, 0, "s")
      .piece("veg_bed", 6, 1, 0, "w")
      .piece("veg_bed", 6, 2, 0, "w")
      .piece("veg_bed", 1, 2, 0, "e")
      .piece("woodpile", 5, 4, 0, "n");
  else
    a.piece("garden_shed", 1, 1, 0, "e")
      .piece("rotary_clothesline", 3, 2, 0, "s")
      .piece("veg_bed", 6, 1, 0, "w")
      .piece("veg_bed", 6, 2, 0, "w")
      .piece("woodpile", 5, 4, 0, "n");
  a.lamp(2, 12, 0, "n").lamp(6, 4, 0, "s");
  a.node("vampire", [2, 7, 0]).node("thrall", [3, 9, 0], [5, 10, 0], [3, 3, 0]);
  if (c) a.mirror();
  return a.done();
}

/** A cottage with a back lobby: the kitchen-diner on the lane, the bathroom by the back door. */
function cottageB() {
  const a = new Draft(
    rural(
      "cottage-b",
      "Cottage, back lobby",
      "structure",
      ["s", "n"],
      ["nest"],
      "Stone cottage: the front door into the kitchen-diner, the living room beside it, the bedroom off the living room; a back lobby behind the kitchen with the back door (on the side), the bathroom and a store.",
      "cottage",
    ),
    8,
    16,
    0,
    2,
    "grass",
  );
  const W = "wood/stone/plaster",
    K = "tile/stone/plaster";
  a.room(0, 1, 8, 3, 11, K) // kitchen-diner
    .room(0, 4, 8, 6, 11, W) // living room
    .room(0, 4, 4, 6, 7, W) // bedroom
    .room(0, 1, 7, 3, 7, K) // back lobby
    .room(0, 1, 4, 2, 6, K) // bathroom
    .room(0, 3, 4, 3, 6, W); // store
  a.edge(0, "s", "door", [2, 11], [2, 7], [5, 7], [1, 6], [3, 6]);
  a.edge(0, "e", "door", [3, 9]).edge(0, "w", "door", [1, 7]);
  a.edge(0, "w", "window", [1, 9], [1, 10]).edge(0, "s", "window", [5, 11]);
  a.edge(0, "e", "window", [6, 9], [6, 10], [6, 5], [6, 6]).edge(0, "n", "window", [5, 4]);
  a.piece("kitchen_fridge", 1, 8, 0, "e")
    .piece("kitchen_sink", 1, 9, 0, "e")
    .piece("kitchen_stove", 1, 10, 0, "e")
    .piece("kitchen_counter", 3, 8, 0, "s");
  a.ob(0, "low:table", [3, 10]);
  a.piece("sofa", 6, 10, 0, "w").piece("tv", 4, 10, 0, "e").piece("wingback_chair", 6, 8, 0, "s");
  a.piece("bed", 5, 4, 0, "s").piece("wardrobe", 4, 4, 0, "s");
  a.piece("toilet_clean", 1, 4, 0, "s").piece("bath", 2, 4, 0, "s").piece("basin", 2, 6, 0, "w");
  a.piece("shelf_wall", 3, 4, 0, "s");
  a.fl(1, 1, 4, 6, 11, "roof");
  hedgeRow(a, 0, 15, 0, 7, [2]);
  hedgeRow(a, 0, 0, 0, 7, [0]);
  a.fl(0, 2, 12, 2, 15, "dirt").fl(0, 0, 0, 0, 14, "dirt");
  a.piece("mailbox_post", 3, 14, 0, "s");
  a.ob(0, "high:tree", [6, 13], [6, 1]);
  a.piece("rotary_clothesline", 3, 1, 0, "s")
    .piece("chicken_coop", 1, 1, 0, "e")
    .piece("veg_bed", 4, 2, 0, "n")
    .piece("veg_bed", 5, 2, 0, "n")
    .piece("woodpile", 0, 6, 0, "n");
  a.lamp(2, 12, 0, "n").lamp(0, 7, 0, "e");
  a.node("vampire", [4, 6, 0]).node("thrall", [2, 9, 0], [5, 9, 0], [3, 2, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Barn over a cellar

function barn(v: "a" | "b") {
  const metal = v === "b";
  const a = new Draft(
    metal
      ? rural(
          "barn-b",
          "Barn, metal-clad",
          "structure",
          ["s", "n"],
          ["nest", "den", "haven"],
          "The drive-through barn the other way round and clad in metal sheet, its cellar in concrete: stalls and tack room east, the hay store and the loft stair west.",
          "barn",
        )
      : rural(
          "barn",
          "Barn",
          "structure",
          ["s", "n"],
          ["nest", "den", "haven"],
          "Timber barn, drive-through (roller doors front and back, the aisle kept clear). West: three stalls behind rails, the tack room with the hatch down to the cellar. East: the hay store and the stair to the hayloft, whose windows overlook the yard. The cellar: where they sleep.",
        ),
    16,
    16,
    1,
    3,
    "grass",
  );
  const BARN = metal ? "concrete/metal/metal" : "concrete/wood/wood",
    TACK = metal ? "wood/metal/wood" : "wood/wood/wood",
    LOFT = metal ? "wood/metal/metal" : "wood/wood/wood",
    CELLAR = metal ? "concrete/concrete/concrete" : "stone/stone/stone";
  const z = 1;
  a.fl(z, 0, 12, 15, 14, "dirt").fl(z, 6, 15, 9, 15, "dirt").fl(z, 0, 0, 15, 1, "dirt");
  a.room(z, 1, 2, 14, 11, BARN).room(z, 1, 2, 3, 4, TACK);
  // Stalls: rails between them and along their fronts, a way into each.
  a.edge(z, "s", "rail", [1, 6], [2, 6], [3, 6], [1, 8], [2, 8], [3, 8]);
  a.edge(z, "e", "rail", [3, 5], [3, 7], [3, 9]);
  for (const y of [5, 7, 9])
    a.piece("hay_feeder", 1, y, z, "e").piece("water_trough", 1, y + 1, z, "e");
  // Tack room and the cellar hatch.
  a.flight(0, 1, 3, "n");
  a.edge(z, "e", "door", [3, 3]);
  a.piece("tool_rack", 2, 2, z, "s").piece("saddle_rack", 3, 2, z, "s");
  a.piece("workbench", 3, 4, z, "n");
  // The aisle: roller doors front and back; feed and the wagon to the side.
  a.edge(z, "s", "garage", [7, 11], [8, 11]).edge(z, "n", "garage", [7, 2], [8, 2]);
  a.piece("pallet_sacks", 5, 3, z, "e").piece("pallet_sacks", 5, 4, z, "e");
  a.piece("hay_wagon", 5, 8, z, "e");
  // Hay store and the stair up.
  for (const [x, y] of [
    [11, 3],
    [12, 3],
    [13, 3],
    [11, 4],
    [12, 4],
  ] as [number, number][])
    a.piece("hay_round", x, y, z, y === 3 && x < 13 ? "n" : "s");
  a.piece("hay_stack", 11, 7, z, "s").piece("hay_stack", 12, 7, z, "s");
  a.piece("hay_stack", 13, 9, z, "s");
  a.piece("hay_stack", 11, 10, z, "s").piece("hay_round", 10, 10, z, "s");
  a.flight(z, 14, 5, "n");
  a.edge(z, "e", "door", [14, 9]).edge(z, "e", "window", [14, 10]).edge(z, "w", "window", [1, 6]);
  a.ceiling(7, 6, z).ceiling(11, 8, z).lamp(7, 12, z, "n").lamp(15, 9, z, "w");
  // The hayloft.
  a.room(2, 1, 2, 14, 11, LOFT);
  a.piece("hay_round", 2, 3, 2, "s").piece("hay_round", 2, 10, 2, "s");
  a.piece("hay_round", 12, 10, 2, "s");
  a.piece("hay_round", 13, 10, 2, "s");
  const loftBales: [number, number][] = metal
    ? [
        [4, 4],
        [5, 4],
        [3, 7],
        [8, 9],
        [10, 5],
        [7, 6],
      ]
    : [
        [3, 4],
        [4, 4],
        [3, 8],
        [9, 9],
        [10, 4],
        [7, 7],
      ];
  for (const [x, y] of loftBales) a.piece("hay_stack", x, y, 2, "s");
  a.edge(2, "s", "window", [6, 11], [9, 11]).edge(2, "n", "window", [5, 2], [10, 2]);
  a.fl(3, 1, 2, 14, 11, "roof");
  // The cellar.
  a.room(0, 1, 2, 8, 8, CELLAR);
  if (metal) {
    a.piece("coffin_modern", 4, 3, 0, "s").piece("coffin_modern", 4, 7, 0, "n");
    a.piece("blood_fridge", 8, 3, 0, "w").piece("feeding_chair", 7, 5, 0, "w");
    a.ob(0, "low:crate", [8, 8], [7, 8]);
  } else {
    a.piece("coffin_antique", 4, 3, 0, "s").piece("coffin_antique", 7, 3, 0, "s");
    a.piece("candle_stand", 6, 3, 0, "s").piece("candle_stand", 3, 3, 0, "s");
    a.piece("blood_fridge", 8, 7, 0, "w").piece("feeding_chair", 5, 6, 0, "s");
    a.ob(0, "low:crate", [1, 8], [2, 8]);
  }
  a.ceiling(5, 5, 0);
  // The yard.
  hedgeRow(a, z, 15, 0, 15, [6, 7, 8, 9]);
  if (metal) {
    a.car("suv", 1, 12, z, "x", -1);
    a.piece("tyre_stack", 14, 13, z, "w").piece("fuel_tank_farm", 14, 14, z, "e");
    a.piece("chemical_drums", 13, 12, z, "s");
  } else {
    a.car("suv", 11, 12, z, "x", 1);
    a.piece("water_trough", 2, 13, z, "n").piece("fuel_tank_farm", 14, 14, z, "e");
    a.ob(z, "low:crate", [1, 14]);
  }
  a.piece("hay_round", 1, 0, z, "s").piece("hay_round", 2, 0, z, "s");
  a.piece("rubble_pile", 13, 0, z, "s");
  a.node("vampire", [2, 5, 0], [6, 5, 0])
    .node("elder", [4, 6, 0])
    .node("thrall", [8, 6, z], [12, 8, z], [5, 6, 2], [9, 13, z]);
  if (metal) a.mirror();
  return a.done();
}

/** A smaller barn with an open-sided lean-to along it: machinery under the lean-to, stalls and hay in the barn. */
function barnC() {
  const a = new Draft(
    rural(
      "barn-c",
      "Barn with lean-to",
      "structure",
      ["s", "n"],
      ["nest", "den", "haven"],
      "Timber barn with one roller door on the yard and a door at the back; three stalls west, hay and the loft stair east; a lean-to along the east wall, open to the side and the yard, for the pickup and the implements (a door through). Tack room with the cellar hatch; the cellar has a store and the sleeping chamber.",
      "barn",
    ),
    16,
    16,
    1,
    3,
    "grass",
  );
  const z = 1;
  const BARN = "concrete/wood/wood";
  a.fl(z, 0, 12, 15, 14, "dirt").fl(z, 4, 15, 7, 15, "dirt").fl(z, 0, 0, 15, 1, "dirt");
  a.room(z, 1, 2, 10, 11, BARN).room(z, 1, 2, 3, 4, "wood/wood/wood");
  // The lean-to: open to the east, its roof a storey up.
  a.room(z, 11, 2, 14, 11, "concrete/wood/metal");
  for (let y = 2; y <= 11; y++) a.edge(z, "e", "open", [14, y]);
  // Open at the yard end too: the pickup drives out the way it faces.
  for (let x = 11; x <= 14; x++) a.edge(z, "s", "open", [x, 11]);
  a.edge(z, "e", "door", [10, 8]);
  a.car("suv", 12, 3, z, "y", 1, "concrete");
  a.piece("cultivator", 12, 9, z, "s").piece("tyre_stack", 14, 11, z, "n");
  a.piece("hay_wagon", 12, 8, z, "e");
  // Stalls.
  a.edge(z, "s", "rail", [1, 6], [2, 6], [3, 6], [1, 8], [2, 8], [3, 8]);
  a.edge(z, "e", "rail", [3, 5], [3, 7], [3, 9]);
  for (const y of [5, 7, 9])
    a.piece("water_trough", 1, y, z, "e").piece("hay_feeder", 1, y + 1, z, "e");
  // Tack room, the cellar hatch.
  a.flight(0, 1, 3, "n");
  a.edge(z, "e", "door", [3, 3]);
  a.piece("tool_rack", 2, 2, z, "s").piece("saddle_rack", 3, 2, z, "s");
  // The aisle and its doors.
  a.edge(z, "s", "garage", [5, 11], [6, 11]).edge(z, "n", "door", [5, 2]);
  // Hay, and the stair to the loft along the east wall.
  a.piece("hay_round", 8, 2, z, "s").piece("hay_round", 9, 2, z, "s");
  a.piece("hay_stack", 8, 6, z, "w").piece("hay_stack", 8, 9, z, "n");
  a.flight(z, 10, 4, "n");
  a.edge(z, "w", "window", [1, 10]);
  a.ceiling(5, 6, z).ceiling(12, 7, z).lamp(5, 12, z, "n");
  a.fl(2, 11, 2, 14, 11, "roof");
  // The loft.
  a.room(2, 1, 2, 10, 11, "wood/wood/wood");
  a.piece("hay_round", 2, 3, 2, "s")
    .piece("hay_round", 3, 3, 2, "s")
    .piece("hay_round", 2, 10, 2, "n");
  for (const [x, y] of [
    [5, 5],
    [6, 8],
    [8, 7],
    [3, 7],
  ] as [number, number][])
    a.piece("hay_stack", x, y, 2, "s");
  a.edge(2, "s", "window", [3, 11], [8, 11]).edge(2, "e", "window", [10, 7]);
  a.fl(3, 1, 2, 10, 11, "roof");
  // The cellar: a store, and through it the chamber.
  a.room(0, 1, 2, 4, 8, "stone/stone/stone").room(0, 5, 2, 8, 8, "stone/stone/stone");
  a.edge(0, "e", "door", [4, 6]);
  a.ob(0, "low:crate", [2, 8], [3, 8]).ob(0, "high:crate", [4, 2]);
  a.piece("shelf_wall", 4, 4, 0, "w");
  a.piece("coffin_antique", 6, 3, 0, "s").piece("coffin_antique", 6, 7, 0, "n");
  a.piece("candle_stand", 8, 4, 0, "w").piece("blood_fridge", 8, 5, 0, "w");
  a.ceiling(2, 5, 0).ceiling(7, 5, 0);
  // The yard.
  hedgeRow(a, z, 15, 0, 15, [4, 5, 6, 7]);
  a.piece("water_trough", 9, 13, z, "n").piece("fuel_tank_farm", 14, 13, z, "w");
  a.piece("hay_round", 13, 0, z, "s").piece("rubble_pile", 2, 0, z, "s");
  a.node("vampire", [6, 5, 0], [7, 4, 0])
    .node("elder", [5, 6, 0])
    .node("thrall", [4, 8, z], [13, 7, z], [5, 7, 2], [10, 13, z]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Paddock

function paddock() {
  const a = new Draft(
    rural(
      "paddock",
      "Paddock",
      "open",
      ["s", "n"],
      [],
      "A rail-fenced paddock (gaps at the gates, a broken rail on each side), a stable of three loose boxes, an open-fronted field shelter.",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  const ST = "dirt/wood/wood";
  a.room(0, 9, 1, 10, 3, ST).room(0, 11, 1, 12, 3, ST).room(0, 13, 1, 14, 3, ST);
  a.edge(0, "s", "door", [9, 3], [11, 3], [13, 3]);
  for (const x of [9, 11, 13])
    a.piece("hay_feeder", x, 1, 0, "s").piece("water_trough", x + 1, 1, 0, "s");
  a.room(0, 1, 1, 4, 3, ST);
  a.edge(0, "s", "open", [1, 3], [2, 3], [3, 3], [4, 3]);
  a.piece("hay_round", 1, 1, 0, "s").piece("hay_feeder", 3, 1, 0, "s");
  a.fl(1, 1, 1, 4, 3, "roof").fl(1, 9, 1, 14, 3, "roof");
  a.fl(0, 0, 4, 15, 4, "dirt").fl(0, 7, 13, 8, 15, "dirt");
  // The fence: north and south rails with a gap for the gate, west and east with a broken rail.
  for (const x of [1, 3, 5, 9, 11, 13])
    a.piece("rail_fence", x, 5, 0, "s").piece("rail_fence", x, 13, 0, "s");
  for (const y of [6, 8, 10])
    a.piece("rail_fence", 1, y, 0, "e").piece("rail_fence", 14, y, 0, "w");
  a.piece("water_trough", 4, 9, 0, "s").piece("hay_feeder", 10, 8, 0, "s");
  a.piece("hay_round", 6, 7, 0, "s");
  a.ob(0, "high:tree", [12, 11], [0, 14], [15, 7]);
  hedgeRow(a, 0, 15, 0, 15, [7, 8]);
  a.lamp(11, 4, 0, "n");
  a.node("thrall", [10, 2, 0], [3, 2, 0]).node("patrol", [5, 10, 0], [10, 11, 0]);
  return a.done();
}

/** The stable along the west side opening onto a yard, the paddock east with a shelter in its corner. */
function paddockB() {
  const a = new Draft(
    rural(
      "paddock-b",
      "Stable yard",
      "open",
      ["s", "n"],
      [],
      "Three loose boxes down the west side opening onto a dirt yard, the track from the lane through it; the paddock east of the yard, its gate onto the yard and another to the lane, a field shelter in its far corner, a broken rail on the east side.",
      "paddock",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  const ST = "dirt/wood/wood";
  for (const y of [2, 4, 6]) {
    a.room(0, 1, y, 3, y + 1, ST);
    a.edge(0, "e", "door", [3, y + 1]);
    a.piece("hay_feeder", 1, y, 0, "e").piece("water_trough", 1, y + 1, 0, "e");
  }
  a.fl(1, 1, 2, 3, 7, "roof");
  a.fl(0, 4, 1, 5, 15, "dirt");
  // The paddock (x 7–14, y 2–12): fences face out, gates as gaps.
  for (const x of [7, 9, 11, 13]) a.piece("rail_fence", x, 2, 0, "n");
  for (const x of [7, 9, 13]) a.piece("rail_fence", x, 12, 0, "s");
  for (const y of [3, 5, 9]) a.piece("rail_fence", 7, y, 0, "w");
  a.ob(0, "", [7, 11]);
  for (const y of [3, 5, 7, 9]) a.piece("rail_fence", 14, y, 0, "e");
  // The field shelter in the far corner, open to the south.
  a.room(0, 11, 3, 13, 4, ST);
  a.edge(0, "s", "open", [11, 4], [12, 4], [13, 4]);
  a.piece("hay_feeder", 12, 3, 0, "s");
  a.fl(1, 11, 3, 13, 4, "roof");
  a.piece("water_trough", 9, 7, 0, "s").piece("hay_round", 10, 9, 0, "s");
  a.ob(0, "high:tree", [12, 9], [0, 13], [15, 14]);
  a.piece("rubble_pile", 1, 10, 0, "e").piece("wheelbarrow", 2, 9, 0, "e");
  a.piece("saddle_rack", 1, 12, 0, "e");
  hedgeRow(a, 0, 15, 0, 15, [4, 5, 11, 12]);
  a.lamp(4, 4, 0, "w");
  a.node("thrall", [2, 4, 0], [5, 6, 0]).node("patrol", [10, 6, 0], [12, 11, 0]);
  return a.done();
}

/** Two paddocks either side of a track, a shelter in each. */
function paddockC() {
  const a = new Draft(
    rural(
      "paddock-c",
      "Two paddocks",
      "open",
      ["s", "n"],
      [],
      "A track from the lane to the back, a rail-fenced paddock either side of it (each with its gate onto the track, a gate to the back, a field shelter, water, hay).",
      "paddock",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  const ST = "dirt/wood/wood";
  a.fl(0, 7, 0, 8, 15, "dirt");
  // West paddock (x 1–6, y 3–12), east paddock (x 9–14).
  for (const x of [1, 5]) a.piece("rail_fence", x, 3, 0, "n").piece("rail_fence", x, 12, 0, "s");
  a.piece("rail_fence", 3, 12, 0, "s");
  for (const x of [11, 13]) a.piece("rail_fence", x, 3, 0, "n");
  for (const x of [9, 13]) a.piece("rail_fence", x, 12, 0, "s");
  for (const y of [4, 6, 8, 10])
    a.piece("rail_fence", 1, y, 0, "w").piece("rail_fence", 14, y, 0, "e");
  for (const y of [4, 8, 10]) a.piece("rail_fence", 6, y, 0, "e").piece("rail_fence", 9, y, 0, "w");
  // The shelters, open to the south.
  a.room(0, 2, 4, 4, 5, ST).room(0, 11, 4, 13, 5, ST);
  a.edge(0, "s", "open", [2, 5], [3, 5], [4, 5], [11, 5], [12, 5], [13, 5]);
  a.piece("hay_feeder", 3, 4, 0, "s").piece("hay_round", 13, 4, 0, "s");
  a.fl(1, 2, 4, 4, 5, "roof").fl(1, 11, 4, 13, 5, "roof");
  a.piece("water_trough", 3, 9, 0, "s").piece("water_trough", 12, 9, 0, "s");
  a.piece("hay_feeder", 10, 7, 0, "s").piece("hay_round", 2, 10, 0, "s");
  a.ob(0, "high:tree", [13, 10], [0, 1], [15, 13]);
  hedgeRow(a, 0, 0, 0, 15, [7, 8]);
  hedgeRow(a, 0, 15, 0, 15, [7, 8]);
  a.node("patrol", [7, 5, 0], [8, 12, 0]).node("thrall", [3, 6, 0], [12, 6, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Machine shed

function machineShed(v: "a" | "b") {
  const b = v === "b";
  const a = new Draft(
    b
      ? rural(
          "machine-shed-b",
          "Machine shed, workshop west",
          "structure",
          ["s"],
          [],
          "The open-fronted shed the other way round: the workshop at the west end, the pickup nosed out in the middle bay, implements and drums along the back.",
          "machine-shed",
        )
      : rural(
          "machine-shed",
          "Machine shed",
          "structure",
          ["s"],
          [],
          "Steel portal shed, open to the yard: the pickup nosed out, the tractor, implements and tyres; an enclosed workshop at the east end with a door to the shed and one to the yard. Diesel and gas outside.",
        ),
    16,
    8,
    0,
    2,
    "dirt",
  );
  a.room(0, 1, 1, 10, 4, "concrete/metal/metal").room(0, 11, 1, 14, 4, "concrete/metal/plaster");
  for (let x = 1; x <= 10; x++) a.edge(0, "s", "open", [x, 4]);
  a.edge(0, "w", "door", [11, 2]).edge(0, "s", "door", [12, 4]).edge(0, "s", "window", [13, 4]);
  if (b) {
    a.car("suv", 6, 1, 0, "y", 1, "concrete");
    a.piece("cultivator", 2, 2, 0, "s").piece("cultivator", 3, 1, 0, "s");
    a.piece("tyre_stack", 1, 3, 0, "e").piece("gas_cylinders", 9, 1, 0, "s");
    a.piece("chemical_drums", 10, 1, 0, "s");
  } else {
    a.car("suv", 2, 1, 0, "y", 1, "concrete");
    a.piece("cultivator", 5, 2, 0, "s").piece("cultivator", 8, 1, 0, "s");
    a.piece("tyre_stack", 10, 1, 0, "s").piece("gas_cylinders", 9, 1, 0, "s");
    a.piece("chemical_drums", 1, 1, 0, "s");
  }
  a.piece("workbench", 14, 1, 0, "w").piece("tool_chest", 11, 4, 0, "n");
  a.piece("drill_press", 14, 3, 0, "w");
  a.piece("tool_rack", 12, 1, 0, "s");
  a.fl(1, 1, 1, 14, 4, "roof");
  a.piece("fuel_tank_farm", 1, 6, 0, "e").piece("propane_tank", 13, 6, 0, "s");
  hedgeRow(a, 0, 7, 0, 15, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  a.ceiling(6, 2, 0).ceiling(12, 2, 0).lamp(12, 5, 0, "n");
  a.node("thrall", b ? [4, 3, 0] : [7, 3, 0], [12, 3, 0]);
  if (b) a.mirror();
  return a.done();
}

/** A closed implement shed: two roller doors, a door between them. */
function machineShedC() {
  const a = new Draft(
    rural(
      "machine-shed-c",
      "Implement shed",
      "structure",
      ["s"],
      [],
      "A closed steel shed: two roller doors on the yard (the pickup behind one, the car behind the other, each nosed out with the way clear) and a door between; the workbench and tools down the west wall, drums and gas along the back.",
      "machine-shed",
    ),
    16,
    8,
    0,
    2,
    "dirt",
  );
  a.room(0, 1, 1, 14, 5, "concrete/metal/metal");
  a.edge(0, "s", "garage", [3, 5], [4, 5], [10, 5], [11, 5]).edge(0, "s", "door", [7, 5]);
  a.car("suv", 3, 1, 0, "y", 1, "concrete").car("car", 10, 2, 0, "y", 1, "concrete");
  a.piece("workbench", 1, 2, 0, "e").piece("tool_chest", 1, 3, 0, "e");
  a.piece("tool_rack", 6, 1, 0, "s").piece("gas_cylinders", 8, 1, 0, "s");
  a.piece("chemical_drums", 12, 1, 0, "s").piece("tyre_stack", 14, 2, 0, "w");
  a.piece("cultivator", 7, 3, 0, "s");
  a.fl(1, 1, 1, 14, 5, "roof");
  a.row(0, "high:hedge", 7, 0, 1).row(0, "high:hedge", 7, 13, 15);
  a.piece("fuel_tank_farm", 14, 6, 0, "w");
  a.ceiling(7, 3, 0).ceiling(3, 3, 0).lamp(7, 6, 0, "n");
  a.node("thrall", [7, 2, 0], [12, 5, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Grain yard

function grainYard() {
  const a = new Draft(
    rural(
      "grain-yard",
      "Grain yard",
      "open",
      ["s"],
      [],
      "A concrete pad: three grain bins and a silo in a row, a box truck loading beside them, pallets of sacks, diesel and gas; the farm office by the gate.",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  a.fl(0, 1, 1, 14, 12, "concrete").fl(0, 5, 13, 10, 15, "dirt");
  for (const x of [2, 5, 8]) a.piece("grain_bin", x, 2, 0, "s");
  a.piece("silo", 12, 2, 0, "s");
  a.car("truck", 4, 6, 0, "x", 1, "concrete");
  a.piece("pallet_sacks", 2, 6, 0, "e").piece("pallet_sacks", 2, 7, 0, "e");
  a.piece("pallet_boxes", 1, 10, 0, "s");
  a.piece("ibc_tank", 4, 10, 0, "s").piece("tyre_stack", 7, 11, 0, "s");
  a.piece("propane_tank", 12, 6, 0, "s").piece("fuel_tank_farm", 14, 7, 0, "w");
  a.room(0, 10, 9, 13, 11, "concrete/brick/plaster");
  a.edge(0, "s", "door", [11, 11])
    .edge(0, "s", "window", [12, 11])
    .edge(0, "e", "window", [13, 10]);
  a.piece("desk_set_papers", 10, 9, 0, "e").piece("filing_cabinet", 13, 9, 0, "s");
  a.piece("chair", 12, 9, 0, "s");
  a.fl(1, 10, 9, 13, 11, "roof");
  hedgeRow(a, 0, 15, 0, 15, [5, 6, 7, 8, 9, 10]);
  hedgeCol(a, 0, 0, 0, 14, [6, 7]);
  hedgeCol(a, 0, 15, 0, 14, [6, 7, 8]);
  a.ob(0, "high:tree", [15, 12]);
  a.lamp(7, 9, 0).lamp(11, 12, 0, "n");
  a.node("thrall", [11, 10, 0], [7, 4, 0], [10, 6, 0]);
  return a.done();
}

/** Bins in an L, the truck nosed toward the gate, the office at the back. */
function grainYardB() {
  const a = new Draft(
    rural(
      "grain-yard-b",
      "Grain yard, bins in an L",
      "open",
      ["s"],
      [],
      "Grain bins in an L in the back corner, the silo near the lane, the box truck standing nose to the gate; the office in the far corner, pallets and tanks between.",
      "grain-yard",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  a.fl(0, 1, 1, 14, 12, "concrete").fl(0, 8, 13, 11, 15, "dirt");
  a.piece("grain_bin", 2, 2, 0, "s")
    .piece("grain_bin", 5, 2, 0, "s")
    .piece("grain_bin", 2, 5, 0, "e");
  a.piece("silo", 13, 10, 0, "w");
  a.car("truck", 9, 3, 0, "y", 1, "concrete");
  a.room(0, 11, 1, 14, 3, "concrete/brick/plaster");
  a.edge(0, "s", "door", [12, 3]).edge(0, "s", "window", [13, 3]).edge(0, "e", "window", [14, 2]);
  a.piece("desk_set_papers", 11, 1, 0, "s").piece("filing_cabinet", 14, 1, 0, "s");
  a.piece("chair", 13, 1, 0, "s");
  a.fl(1, 11, 1, 14, 3, "roof");
  a.piece("pallet_sacks", 5, 6, 0, "s").piece("pallet_sacks", 6, 6, 0, "s");
  a.piece("pallet_boxes", 2, 10, 0, "n").piece("ibc_tank", 6, 9, 0, "s");
  a.piece("propane_tank", 4, 11, 0, "n").piece("fuel_tank_farm", 12, 7, 0, "w");
  a.piece("tyre_stack", 1, 12, 0, "e");
  hedgeRow(a, 0, 15, 0, 15, [8, 9, 10, 11]);
  hedgeCol(a, 0, 0, 0, 14, [8, 9]);
  hedgeCol(a, 0, 15, 0, 14, [5, 6]);
  a.ob(0, "high:tree", [0, 15], [15, 15]);
  a.lamp(7, 9, 0).lamp(12, 4, 0, "n");
  a.node("thrall", [12, 2, 0], [4, 8, 0], [10, 10, 0]);
  return a.done();
}

/** The silos by the lane, the bins down the east side, the office by the gate. */
function grainYardC() {
  const a = new Draft(
    rural(
      "grain-yard-c",
      "Grain yard, silos by the lane",
      "open",
      ["s"],
      [],
      "Two silos standing by the lane (seen from far off), three bins down the east side, the office at the back west; the tractor and wagon in the middle of the pad, rows of sacked pallets for cover.",
      "grain-yard",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  a.fl(0, 1, 1, 14, 12, "concrete").fl(0, 7, 13, 10, 15, "dirt");
  a.piece("silo", 2, 10, 0, "s").piece("silo", 4, 10, 0, "n");
  for (const y of [2, 5, 8]) a.piece("grain_bin", 12, y, 0, "w");
  a.room(0, 1, 1, 4, 3, "concrete/brick/plaster");
  a.edge(0, "s", "door", [3, 3]).edge(0, "s", "window", [2, 3]).edge(0, "e", "window", [4, 2]);
  a.piece("desk_set_papers", 1, 1, 0, "e").piece("filing_cabinet", 4, 1, 0, "s");
  a.piece("chair", 2, 2, 0, "s");
  a.fl(1, 1, 1, 4, 3, "roof");
  a.piece("tractor", 8, 7, 0, "s").piece("hay_wagon", 7, 4, 0, "e");
  for (const x of [5, 6, 10]) a.piece("pallet_sacks", x, 5, 0, "s");
  a.piece("pallet_sacks", 9, 10, 0, "n").piece("pallet_boxes", 10, 10, 0, "n");
  a.piece("ibc_tank", 1, 6, 0, "e").piece("fuel_tank_farm", 14, 12, 0, "w");
  hedgeRow(a, 0, 15, 0, 15, [7, 8, 9, 10]);
  hedgeCol(a, 0, 15, 0, 14, [11]);
  hedgeCol(a, 0, 0, 1, 14, [7, 8]);
  a.ob(0, "high:tree", [0, 0], [15, 0]);
  a.lamp(9, 12, 0).lamp(3, 4, 0, "n");
  a.node("thrall", [2, 2, 0], [9, 6, 0], [11, 11, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Hay barn

function hayBarn() {
  const a = new Draft(
    rural(
      "hay-barn",
      "Hay barn",
      "structure",
      ["s"],
      [],
      "An open-fronted hay barn: round bales along the back, square bales in stacks with aisles between; the wagon outside.",
    ),
    8,
    8,
    0,
    2,
    "grass",
  );
  a.room(0, 1, 1, 6, 5, "dirt/wood/wood");
  for (let x = 1; x <= 6; x++) a.edge(0, "s", "open", [x, 5]);
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [3, 1],
    [5, 1],
    [6, 1],
  ] as [number, number][])
    a.piece("hay_round", x, y, 0, "s");
  a.piece("hay_stack", 2, 3, 0, "s")
    .piece("hay_stack", 5, 3, 0, "s")
    .piece("hay_stack", 3, 4, 0, "s");
  a.fl(1, 1, 1, 6, 5, "roof");
  a.fl(0, 0, 6, 7, 7, "dirt");
  a.piece("hay_wagon", 5, 6, 0, "s");
  a.ob(0, "high:hedge", [0, 7], [7, 7]);
  a.ceiling(4, 2, 0);
  a.node("thrall", [4, 2, 0]);
  return a.done();
}

function hayBarnB() {
  const a = new Draft(
    rural(
      "hay-barn-b",
      "Hay barn, open side",
      "structure",
      ["s", "e"],
      [],
      "A hay barn open on the front and the east side: round bales against the west wall, stacks along the back, the wagon parked inside.",
      "hay-barn",
    ),
    8,
    8,
    0,
    2,
    "grass",
  );
  a.room(0, 1, 1, 6, 5, "dirt/wood/wood");
  for (let x = 1; x <= 6; x++) a.edge(0, "s", "open", [x, 5]);
  for (let y = 1; y <= 5; y++) a.edge(0, "e", "open", [6, y]);
  for (const y of [1, 2, 3]) a.piece("hay_round", 1, y, 0, "e");
  a.piece("hay_stack", 3, 1, 0, "s")
    .piece("hay_stack", 4, 1, 0, "s")
    .piece("hay_stack", 6, 1, 0, "w");
  a.piece("hay_wagon", 4, 3, 0, "s");
  a.fl(1, 1, 1, 6, 5, "roof");
  a.fl(0, 0, 6, 7, 7, "dirt").fl(0, 7, 0, 7, 5, "dirt");
  a.piece("wheelbarrow", 7, 3, 0, "w");
  a.ob(0, "high:hedge", [0, 7], [1, 7]);
  a.ceiling(3, 3, 0);
  a.node("thrall", [2, 4, 0]);
  return a.done();
}

function hayBarnC() {
  const a = new Draft(
    rural(
      "hay-barn-c",
      "Hay barn, half full",
      "structure",
      ["s"],
      [],
      "Half the winter's hay left: round bales along the back west, a stack by the wall, the wagon backed in on the east side; the tractor waiting outside.",
      "hay-barn",
    ),
    8,
    8,
    0,
    2,
    "grass",
  );
  a.room(0, 1, 1, 6, 5, "dirt/wood/wood");
  for (let x = 1; x <= 6; x++) a.edge(0, "s", "open", [x, 5]);
  for (const x of [1, 2, 3, 4]) a.piece("hay_round", x, 1, 0, "s");
  a.piece("hay_stack", 1, 3, 0, "e").piece("hay_stack", 3, 3, 0, "s");
  a.piece("hay_wagon", 6, 3, 0, "w");
  a.fl(1, 1, 1, 6, 5, "roof");
  a.fl(0, 0, 6, 7, 7, "dirt");
  a.piece("tractor", 1, 6, 0, "s");
  a.ob(0, "high:hedge", [7, 7], [7, 6]);
  a.ceiling(4, 2, 0);
  a.node("thrall", [5, 2, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Chapel over a crypt

function chapel(v: "a" | "b") {
  const b = v === "b";
  const a = new Draft(
    b
      ? rural(
          "chapel-b",
          "Chapel, brick",
          "structure",
          ["s"],
          ["den", "haven"],
          "The chapel in brick, the vestry on the other side; the graveyard with its yews in other places.",
          "chapel",
        )
      : rural(
          "chapel",
          "Chapel",
          "structure",
          ["s"],
          ["den", "haven"],
          "Stone chapel: the nave with pews either side of the aisle, the altar under the east window, the vestry beside it with the stair down to the crypt (chest tombs, coffins). The graveyard round it.",
        ),
    16,
    16,
    1,
    2,
    "grass",
  );
  const z = 1;
  const wall = b ? "brick" : "stone";
  a.room(z, 5, 3, 10, 11, `stone/${wall}/plaster`).room(z, 11, 3, 12, 5, `wood/${wall}/plaster`);
  a.edge(z, "s", "door", [7, 11], [12, 5]).edge(z, "e", "door", [10, 3]);
  a.edge(z, "w", "window", [5, 5], [5, 7], [5, 9]).edge(z, "e", "window", [10, 7], [10, 9]);
  a.edge(z, "s", "window", [6, 11], [9, 11]).edge(z, "n", "window", [7, 3], [8, 3]);
  a.piece("altar", 7, 4, z, "s").piece("lectern", 6, 5, z, "e");
  a.piece("candle_stand", 9, 4, z, "s");
  for (const y of [6, 8, 10]) a.piece("pew", 5, y, z, "n").piece("pew", 9, y, z, "n");
  a.flight(0, 11, 4, "n");
  a.piece("wardrobe", 12, 3, z, "w").piece("candle_stand", 12, 4, z, "s");
  a.fl(2, 5, 3, 12, 11, "roof");
  a.room(0, 5, 3, 12, 9, "stone/stone/stone");
  a.piece("grave_tomb", 6, 4, 0, "s").piece("grave_tomb", 8, 4, 0, "s");
  a.piece("grave_tomb", 6, 7, 0, "s").piece("grave_tomb", 8, 7, 0, "s");
  a.piece("coffin_antique", 9, 9, 0, "n").piece("coffin_antique", 5, 9, 0, "n");
  a.piece("candle_stand", 10, 4, 0, "s").piece("candle_stand", 12, 8, 0, "w");
  a.ceiling(8, 6, 0).ceiling(7, 7, z).lamp(7, 12, z, "n");
  // The graveyard.
  for (const y of [2, 4, 6, 8, 10, 12]) {
    a.piece(y % 4 ? "gravestone" : "gravestone_cross", 1, y, z, "s");
    a.piece(y % 4 ? "gravestone_cross" : "gravestone", 3, y, z, "s");
    if (y >= 8) a.piece(y % 4 ? "gravestone" : "gravestone_cross", 13, y, z, "s");
    a.piece("gravestone", 14, y, z, "s");
  }
  a.piece("grave_tomb", 2, 7, z, "s").piece("grave_tomb", 13, 4, z, "s");
  a.ob(
    z,
    "high:tree",
    ...((b
      ? [
          [2, 1],
          [14, 14],
          [4, 14],
        ]
      : [
          [4, 1],
          [12, 14],
          [2, 14],
        ]) as [number, number][]),
  );
  a.piece("bench", b ? 11 : 4, 13, z, "n");
  a.fl(z, 7, 12, 8, 15, "dirt").fl(z, 12, 6, 12, 7, "dirt");
  hedgeRow(a, z, 15, 0, 15, [7, 8]);
  a.node("vampire", [7, 5, 0], [10, 6, 0])
    .node("elder", [7, 8, 0])
    .node("thrall", [7, 7, z], [11, 3, z], [2, 9, z], [12, 13, z]);
  if (b) a.mirror();
  return a.done();
}

/** The chapel side-on to the lane: the nave east–west, the door in its long side. */
function chapelC() {
  const a = new Draft(
    rural(
      "chapel-c",
      "Chapel, side-on",
      "structure",
      ["s", "n"],
      ["den", "haven"],
      "A stone chapel side-on to the lane: the door in the south wall, the nave running east to the altar under the east windows, pews in blocks either side of the aisle; the vestry on the north side with the stair down to the crypt and a door out the back. Graves front and back.",
      "chapel",
    ),
    16,
    16,
    1,
    2,
    "grass",
  );
  const z = 1;
  a.room(z, 3, 5, 12, 9, "stone/stone/plaster").room(z, 9, 2, 11, 4, "wood/stone/plaster");
  a.edge(z, "s", "door", [6, 9], [10, 4]).edge(z, "n", "door", [11, 2]);
  a.edge(z, "s", "window", [4, 9], [8, 9], [11, 9]).edge(z, "n", "window", [4, 5], [6, 5]);
  a.edge(z, "e", "window", [12, 6], [12, 7]).edge(z, "w", "window", [3, 7]);
  for (const x of [5, 7, 9]) a.piece("pew", x, 5, z, "e").piece("pew", x, 8, z, "e");
  a.piece("altar", 12, 6, z, "w").piece("lectern", 10, 9, z, "n");
  a.piece("candle_stand", 12, 5, z, "w").piece("candle_stand", 12, 8, z, "w");
  a.flight(0, 9, 3, "n");
  a.piece("wardrobe", 11, 3, z, "w").piece("candle_stand", 11, 4, z, "w");
  a.fl(2, 3, 5, 12, 9, "roof").fl(2, 9, 2, 11, 4, "roof");
  // The crypt.
  a.room(0, 4, 3, 11, 9, "stone/stone/stone");
  for (const [x, y] of [
    [5, 4],
    [7, 4],
    [5, 7],
    [7, 7],
  ] as [number, number][])
    a.piece("grave_tomb", x, y, 0, "s");
  a.piece("coffin_antique", 11, 6, 0, "w").piece("candle_stand", 4, 9, 0, "n");
  a.ceiling(7, 6, 0).ceiling(7, 7, z).lamp(6, 10, z, "n");
  // Graves front and back, yews.
  for (const x of [1, 3, 9, 11, 13]) {
    a.piece(x % 4 === 1 ? "gravestone_cross" : "gravestone", x, 11, z, "s");
    a.piece(x % 4 === 1 ? "gravestone" : "gravestone_cross", x, 13, z, "s");
  }
  for (const x of [1, 3, 5]) a.piece("gravestone", x, 2, z, "s");
  for (const y of [3, 5, 7]) a.piece("gravestone_cross", 14, y, z, "w");
  a.piece("grave_tomb", 13, 1, z, "s");
  a.ob(z, "high:tree", [1, 7], [14, 13], [0, 0]);
  a.piece("bench", 4, 10, z, "e");
  a.fl(z, 6, 10, 7, 15, "dirt");
  hedgeRow(a, z, 15, 0, 15, [6, 7]);
  a.node("vampire", [6, 5, 0], [9, 8, 0])
    .node("elder", [8, 6, 0])
    .node("thrall", [6, 7, z], [10, 3, z], [2, 12, z], [12, 12, z]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Fields

function cornfield() {
  const a = new Draft(
    rural(
      "cornfield",
      "Cornfield",
      "open",
      ["s", "n", "e", "w"],
      [],
      "Corn to the west of the track, wheat to the east (both seen through, no cover); hedgerows on three sides with gaps, a rail fence on the lane; bales and the tractor at the headland, a scarecrow.",
    ),
    16,
    16,
    0,
    1,
    "grass",
  );
  a.fl(0, 7, 0, 8, 15, "dirt").fl(0, 1, 1, 6, 13, "dirt").fl(0, 9, 2, 14, 12, "dirt");
  hedgeRow(a, 0, 0, 0, 15, [7, 8]);
  hedgeCol(a, 0, 0, 1, 15, [7, 8]);
  hedgeCol(a, 0, 15, 1, 15, [7, 8]);
  a.ob(0, "high:tree", [15, 3], [0, 11]);
  for (const x of [1, 3, 11, 13]) a.piece("rail_fence", x, 15, 0, "s");
  for (let y = 1; y <= 13; y++)
    for (let x = 1; x <= 6; x++) if (!(x === 3 && y === 7)) a.piece("crop_corn", x, y, 0, "s");
  for (let y = 2; y <= 12; y++) for (let x = 9; x <= 14; x++) a.piece("crop_wheat", x, y, 0, "s");
  a.piece("scarecrow", 3, 7, 0, "s");
  a.piece("hay_stack", 3, 14, 0, "n").piece("hay_stack", 4, 14, 0, "n");
  a.piece("hay_stack", 10, 14, 0, "n");
  a.piece("hay_round", 12, 1, 0, "s").piece("hay_round", 13, 1, 0, "s");
  a.piece("hay_round", 2, 14, 0, "n");
  a.piece("tractor", 11, 13, 0, "w").piece("cultivator", 13, 13, 0, "s");
  a.node("patrol", [7, 4, 0], [8, 12, 0]);
  return a.done();
}

/** Wheat north, corn south, a track across between them and one in from the lane. */
function cornfieldB() {
  const a = new Draft(
    rural(
      "cornfield-b",
      "Fields, track across",
      "open",
      ["s", "e", "w"],
      [],
      "Wheat on the north half, corn on the south, a track across between them (out through the hedgerows east and west) and one in from the lane; a stubble strip with round bales by the lane track, the tractor at the corner, a scarecrow in the wheat.",
      "cornfield",
    ),
    16,
    16,
    0,
    1,
    "grass",
  );
  a.fl(0, 0, 7, 15, 8, "dirt").fl(0, 12, 9, 13, 15, "dirt").fl(0, 1, 1, 14, 6, "dirt");
  a.fl(0, 1, 9, 11, 13, "dirt").fl(0, 14, 9, 14, 13, "dirt");
  hedgeRow(a, 0, 0, 0, 15, []);
  hedgeCol(a, 0, 0, 1, 15, [7, 8]);
  hedgeCol(a, 0, 15, 1, 15, [7, 8]);
  for (const x of [1, 3, 5, 7, 9]) a.piece("rail_fence", x, 15, 0, "s");
  a.ob(0, "high:tree", [0, 3], [15, 12]);
  for (let y = 1; y <= 6; y++)
    for (let x = 1; x <= 14; x++) if (!(x === 5 && y === 4)) a.piece("crop_wheat", x, y, 0, "s");
  for (let y = 9; y <= 13; y++) for (let x = 1; x <= 10; x++) a.piece("crop_corn", x, y, 0, "s");
  a.piece("scarecrow", 5, 4, 0, "s");
  a.piece("hay_round", 14, 10, 0, "w").piece("hay_round", 14, 12, 0, "w");
  a.piece("tractor", 2, 14, 0, "n").piece("hay_stack", 11, 14, 0, "n");
  a.node("patrol", [3, 7, 0], [12, 12, 0]);
  return a.done();
}

/** A harvested field: stubble and rows of bales waiting to be carted. */
function cornfieldC() {
  const a = new Draft(
    rural(
      "cornfield-c",
      "Harvested field",
      "open",
      ["s", "n"],
      [],
      "Stubble after the harvest, square bales lying in loose rows across it (low cover all the way, with gaps), a few round bales; the tractor and wagon out in the middle carting them. Hedgerows round, gaps front and back.",
      "cornfield",
    ),
    16,
    16,
    0,
    1,
    "grass",
  );
  a.fl(0, 1, 1, 14, 14, "dirt").fl(0, 7, 15, 8, 15, "dirt").fl(0, 7, 0, 8, 0, "dirt");
  hedgeRow(a, 0, 0, 0, 15, [7, 8]);
  hedgeRow(a, 0, 15, 0, 15, [7, 8]);
  hedgeCol(a, 0, 0, 1, 14, [10]);
  hedgeCol(a, 0, 15, 1, 14, [4]);
  const rows: [number, number[]][] = [
    [3, [2, 4, 5, 9, 11, 13]],
    [6, [1, 3, 6, 12, 14]],
    [9, [2, 5, 10, 13]],
    [12, [3, 4, 9, 11, 12]],
  ];
  for (const [y, xs] of rows) for (const x of xs) a.piece("hay_stack", x, y, 0, "n");
  a.piece("hay_round", 6, 4, 0, "s").piece("hay_round", 13, 10, 0, "s");
  a.piece("tractor", 9, 7, 0, "s").piece("hay_wagon", 7, 7, 0, "e");
  a.ob(0, "high:tree", [0, 4], [15, 11]);
  a.node("patrol", [7, 10, 0], [10, 4, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Woods

/** Trees scattered by a hash (never in lines, no two trunks touching), undergrowth between, clear where asked. */
function scatter(
  a: Draft,
  clear: (x: number, y: number) => boolean,
  ox: number,
  oy: number,
  trees = 30,
  scrub = 7,
) {
  const hash = (x: number, y: number) => ((x * 2654435761) ^ (y * 40503) ^ (x * y * 97)) >>> 0;
  const placed = new Set<number>();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (clear(x, y)) continue;
      const near =
        [-1, 0, 1].some((dx) => placed.has((y - 1) * 16 + x + dx)) || placed.has(y * 16 + x - 1);
      const h = hash(x + ox, y + oy) % 100;
      if (h < trees && !near) {
        placed.add(y * 16 + x);
        a.ob(0, "high:tree", [x, y]);
      } else if (h >= trees && h < trees + scrub) a.ob(0, "high:hedge", [x, y]);
    }
}

function copse() {
  const a = new Draft(
    rural(
      "copse",
      "Copse",
      "open",
      ["s", "e", "w", "n"],
      [],
      "Trees scattered (never in lines, no two trunks touching) with undergrowth between; a track in from the lane to a woodcutter's clearing: the woodpile, logs, a shed.",
    ),
    16,
    16,
    0,
    1,
    "grass",
  );
  a.fl(0, 7, 10, 8, 15, "dirt").fl(0, 5, 6, 10, 9, "dirt").fl(0, 11, 7, 15, 8, "dirt");
  scatter(
    a,
    (x, y) =>
      (x >= 4 && x <= 11 && y >= 5 && y <= 10) ||
      (x >= 6 && x <= 9 && y >= 10) ||
      (x >= 11 && y >= 6 && y <= 9),
    3,
    5,
  );
  a.piece("woodpile", 5, 6, 0, "s").piece("woodpile", 6, 6, 0, "s");
  a.piece("woodpile", 9, 8, 0, "n").piece("woodpile", 10, 8, 0, "n");
  a.piece("garden_shed", 10, 6, 0, "s").piece("wheelbarrow", 7, 7, 0, "s");
  a.node("patrol", [7, 9, 0], [12, 8, 0]);
  return a.done();
}

/** The track in from the lane turning west, the woodcutter's clearing at the back. */
function copseB() {
  const a = new Draft(
    rural(
      "copse-b",
      "Copse, clearing at the back",
      "open",
      ["s", "e", "w", "n"],
      [],
      "The same kind of wood, its track coming in from the lane on the east side and turning west across it; the woodcutter's clearing at the back west with the shed and the woodpiles.",
      "copse",
    ),
    16,
    16,
    0,
    1,
    "grass",
  );
  a.fl(0, 10, 9, 11, 15, "dirt").fl(0, 0, 7, 11, 8, "dirt").fl(0, 2, 2, 6, 6, "dirt");
  scatter(
    a,
    (x, y) =>
      (x >= 9 && x <= 12 && y >= 7) ||
      (y >= 6 && y <= 9 && x <= 12) ||
      (x >= 1 && x <= 7 && y >= 1 && y <= 7),
    7,
    11,
  );
  a.piece("woodpile", 3, 2, 0, "s").piece("woodpile", 4, 2, 0, "s");
  a.piece("garden_shed", 2, 5, 0, "e").piece("wheelbarrow", 5, 5, 0, "s");
  a.piece("woodpile", 6, 4, 0, "w");
  a.node("patrol", [4, 7, 0], [11, 12, 0]);
  return a.done();
}

/** Squatters in the woods: a camp in a clearing off the track. */
function copseC() {
  const a = new Draft(
    rural(
      "copse-c",
      "Camp in the woods",
      "open",
      ["s", "e", "w", "n"],
      [],
      "Thicker wood, a track in from the lane to a clearing where someone's been living rough: a burning barrel and its firewood, a dumped armchair, rubbish, a shed used as a hut, tyres.",
      "copse",
    ),
    16,
    16,
    0,
    1,
    "grass",
  );
  a.fl(0, 8, 11, 9, 15, "dirt").fl(0, 6, 6, 10, 10, "dirt");
  scatter(
    a,
    (x, y) => (x >= 5 && x <= 11 && y >= 5 && y <= 11) || (x >= 8 && x <= 9 && y >= 11),
    11,
    2,
    32,
    9,
  );
  a.piece("burning_barrel", 8, 8, 0, "s");
  a.piece("woodpile", 6, 6, 0, "s").piece("armchair_dumped", 7, 10, 0, "n");
  a.piece("trash_pile", 10, 6, 0, "w").piece("trash_bags", 6, 9, 0, "e");
  a.piece("garden_shed", 10, 9, 0, "w").piece("tyre_stack", 10, 7, 0, "w");
  a.node("thrall", [8, 7, 0], [9, 9, 0]).node("patrol", [8, 13, 0]);
  return a.done();
}

export const DRAFTS: Drafts = {
  farmhouse: () => farmhouse("a"),
  "farmhouse-b": () => farmhouse("b"),
  "farmhouse-c": farmhouseC,
  cottage: () => cottage("a"),
  "cottage-b": cottageB,
  "cottage-c": () => cottage("c"),
  barn: () => barn("a"),
  "barn-b": () => barn("b"),
  "barn-c": barnC,
  paddock,
  "paddock-b": paddockB,
  "paddock-c": paddockC,
  "machine-shed": () => machineShed("a"),
  "machine-shed-b": () => machineShed("b"),
  "machine-shed-c": machineShedC,
  "grain-yard": grainYard,
  "grain-yard-b": grainYardB,
  "grain-yard-c": grainYardC,
  "hay-barn": hayBarn,
  "hay-barn-b": hayBarnB,
  "hay-barn-c": hayBarnC,
  chapel: () => chapel("a"),
  "chapel-b": () => chapel("b"),
  "chapel-c": chapelC,
  cornfield,
  "cornfield-b": cornfieldB,
  "cornfield-c": cornfieldC,
  copse,
  "copse-b": copseB,
  "copse-c": copseC,
};
