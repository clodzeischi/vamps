// The light urban blocks' drafts (docs/design/block-design.md): `npm run draft -- light`.
// The greener side of town: family houses, a bungalow, a semi-detached pair, a parade of
// shops, a petrol station, a park, a square, allotments, a backstreet garage over a den,
// a doctor's surgery over a cold store. Coordinates: x east, y south; the south row is
// the pavement on the street.
import { Draft, meta as m, type Drafts, type S } from "./kit";
import type { BlockMeta } from "../../src/tactical/map/blocks";

const light = (
  id: string,
  name: string,
  type: BlockMeta["type"],
  entrances: S[],
  targets: BlockMeta["targets"],
  notes: string,
  variantOf?: string,
) => m(id, name, ["light"], type, entrances, targets, notes, variantOf);

const hedgeRow = (a: Draft, y: number, x0: number, x1: number, gaps: number[] = []) =>
  a.row(0, "high:hedge", y, x0, x1, gaps);
/**
 * A fence of two-tile pieces (picket, chain-link, privacy) from `from` to `to` (an even
 * run) along row `line` (facing n or s) or column `line` (facing e or w). One-tile
 * "low:fence" props draw as plain boxes: fences are pieces.
 */
const fence = (
  a: Draft,
  z: number,
  kind: string,
  face: S,
  line: number,
  from: number,
  to: number,
) => {
  if ((to - from + 1) % 2) throw new Error(`${kind} ${from}..${to}: an odd run`);
  for (let i = from; i < to; i += 2)
    a.piece(
      kind,
      face === "n" || face === "s" ? i : line,
      face === "n" || face === "s" ? line : i,
      z,
      face,
    );
  return a;
};
/** Picket fence pieces (two tiles each) along row y from x, facing the street. */
const pickets = (a: Draft, z: number, y: number, ...xs: number[]) => {
  for (const x of xs) a.piece("picket_fence", x, y, z, "s");
  return a;
};

// ---------------------------------------------------------------------------
// Family house

function house() {
  const a = new Draft(
    light(
      "house",
      "Family house",
      "structure",
      ["s", "n"],
      ["nest", "rescue"],
      "Two-storey brick house on a deep lot. Ground: hall with the stairs, living room at the front, kitchen-diner across the back (back door to the garden, side door to the drive). Upstairs: main bedroom at the front, a child's room, the bathroom. Car on the drive, lawn and hedge at the front; patio, trampoline and shed behind, a gate in the back fence.",
    ),
    8,
    16,
    0,
    3,
    "grass",
  );
  const W = "wood/brick/plaster",
    K = "tile/brick/plaster";
  a.fl(0, 0, 15, 7, 15, "pavement")
    .fl(0, 6, 3, 7, 14, "concrete") // the drive, through to the garden
    .fl(0, 4, 11, 4, 14, "pavement") // the path
    .fl(0, 0, 3, 3, 3, "stone"); // the patio
  // Ground floor.
  a.room(0, 0, 7, 3, 10, W) // living room
    .room(0, 4, 7, 5, 10, W) // hall
    .room(0, 0, 4, 5, 6, K); // kitchen-diner
  a.flight(0, 5, 8, "n");
  a.edge(0, "s", "door", [4, 10]).edge(0, "w", "door", [4, 10]).edge(0, "n", "door", [4, 7]);
  a.edge(0, "n", "door", [5, 4]).edge(0, "e", "door", [5, 6]);
  a.edge(0, "s", "window", [1, 10], [2, 10]).edge(0, "w", "window", [0, 8], [0, 9], [0, 5]);
  a.edge(0, "n", "window", [2, 4], [3, 4]);
  a.piece("kitchen_fridge", 0, 4, 0, "s")
    .piece("kitchen_counter", 1, 4, 0, "s")
    .piece("kitchen_sink", 2, 4, 0, "s")
    .piece("kitchen_stove", 3, 4, 0, "s")
    .piece("kitchen_counter", 4, 4, 0, "s");
  a.ob(0, "low:table", [2, 6], [3, 6]);
  a.piece("sofa", 0, 8, 0, "e").piece("tv", 3, 8, 0, "w");
  a.piece("bookcase", 0, 7, 0, "e");
  // Upstairs.
  a.room(1, 0, 8, 3, 10, W) // main bedroom
    .room(1, 0, 4, 2, 7, W) // child's room
    .room(1, 3, 4, 5, 6, K) // bathroom
    .room(1, 3, 7, 5, 7, W) // landing
    .more(1, 4, 8, 5, 10, W);
  a.edge(1, "e", "door", [3, 9], [2, 7]).edge(1, "s", "door", [4, 6]);
  a.edge(1, "s", "window", [1, 10], [2, 10]).edge(1, "n", "window", [1, 4], [4, 4]);
  a.edge(1, "w", "window", [0, 6]);
  a.piece("bed", 0, 8, 1, "e").piece("wardrobe", 3, 10, 1, "w");
  a.piece("bed_single", 0, 4, 1, "s").piece("wardrobe", 2, 4, 1, "s").piece("chair", 1, 7, 1, "n");
  a.piece("toilet_clean", 3, 4, 1, "s").piece("bath", 5, 4, 1, "s").piece("basin", 5, 6, 1, "w");
  a.fl(2, 0, 4, 5, 10, "roof");
  // Front: lawn, hedge, the gate on the path, the car on the drive.
  hedgeRow(a, 14, 0, 5, [4]);
  a.piece("mailbox_post", 5, 13, 0, "w");
  a.ob(0, "high:tree", [1, 12]);
  a.car("car", 6, 11, 0, "y", 1, "concrete");
  // Back: the fence with a gate, patio, trampoline, shed.
  fence(a, 0, "privacy_fence", "n", 0, 0, 5);
  a.piece("patio_set", 1, 3, 0, "n").piece("bbq_grill", 3, 3, 0, "n");
  a.piece("trampoline", 2, 1, 0, "s").piece("garden_shed", 0, 1, 0, "e");
  a.piece("rotary_clothesline", 5, 1, 0, "s");
  a.lamp(4, 11, 0, "n").lamp(5, 3, 0, "s");
  a.node("vampire", [2, 9, 1], [1, 6, 1])
    .node("thrall", [2, 8, 0], [4, 5, 0], [6, 9, 0])
    .node("prisoner", [3, 5, 1])
    .node("patrol", [2, 12, 0], [6, 1, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Bungalow

function bungalow() {
  const a = new Draft(
    light(
      "bungalow",
      "Bungalow with garage",
      "structure",
      ["s", "n"],
      ["nest", "rescue"],
      "Single-storey plastered bungalow with an attached garage. A corridor hall from the front door to the back door; living room and kitchen at the front, two bedrooms and the bathroom behind; a back lobby from the kitchen to the garage. Picket fence on the street, the drive to the roller door; patio, shed and vegetables behind.",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  const W = "wood/plaster/plaster",
    K = "tile/plaster/plaster";
  a.fl(0, 0, 15, 15, 15, "pavement")
    .fl(0, 5, 12, 5, 14, "pavement")
    .fl(0, 12, 12, 13, 14, "concrete")
    .fl(0, 3, 2, 7, 3, "stone");
  a.room(0, 1, 4, 4, 7, W) // bedroom
    .room(0, 1, 8, 4, 11, W) // living room
    .room(0, 5, 4, 6, 11, W) // hall
    .room(0, 7, 4, 10, 6, W) // second bedroom
    .room(0, 7, 7, 9, 8, K) // bathroom
    .room(0, 10, 7, 10, 8, K) // back lobby
    .room(0, 7, 9, 10, 11, K) // kitchen
    .room(0, 11, 4, 14, 11, "concrete/plaster/plaster"); // garage
  a.edge(0, "s", "door", [5, 11]).edge(0, "n", "door", [5, 4]);
  a.edge(0, "e", "door", [4, 6], [4, 8], [10, 7]);
  a.edge(0, "w", "door", [7, 5], [7, 7], [7, 10]).edge(0, "s", "door", [10, 8]);
  a.edge(0, "s", "garage", [12, 11], [13, 11]);
  a.edge(0, "s", "window", [2, 11], [3, 11], [8, 11], [9, 11]);
  a.edge(0, "n", "window", [2, 4], [3, 4], [8, 4], [9, 4]);
  a.edge(0, "w", "window", [1, 5], [1, 9]).edge(0, "e", "window", [14, 6]);
  // Living room, bedrooms.
  a.piece("sofa", 1, 9, 0, "e").piece("tv", 4, 9, 0, "w");
  a.piece("bed", 1, 5, 0, "e").piece("wardrobe", 4, 4, 0, "s");
  a.piece("bed", 9, 4, 0, "s").piece("wardrobe", 10, 6, 0, "w");
  // Bathroom, kitchen.
  a.piece("bath", 9, 7, 0, "w").piece("toilet_clean", 9, 8, 0, "w").piece("basin", 7, 8, 0, "e");
  a.piece("washing_machine", 7, 11, 0, "n")
    .piece("kitchen_sink", 8, 11, 0, "n")
    .piece("kitchen_stove", 9, 11, 0, "n")
    .piece("kitchen_fridge", 10, 11, 0, "n");
  a.ob(0, "low:table", [8, 9], [9, 9]);
  // Garage: the car nosed out, the bench at the back.
  a.car("car", 12, 5, 0, "y", 1, "concrete");
  a.piece("workbench", 14, 4, 0, "s").piece("tool_rack", 11, 4, 0, "s");
  a.piece("bicycle", 11, 9, 0, "e").piece("tyre_stack", 14, 10, 0, "w");
  a.fl(1, 1, 4, 14, 11, "roof");
  // Front: the fence, gaps for the path and the drive.
  pickets(a, 0, 14, 0, 2, 6, 8, 10).piece("picket_fence", 14, 14, 0, "s");
  a.ob(0, "high:tree", [1, 12], [9, 13]);
  a.piece("mailbox_post", 4, 13, 0, "s");
  // Back: hedge with a gap, patio, shed, vegetables.
  hedgeRow(a, 0, 0, 15, [8]);
  a.piece("patio_set", 3, 2, 0, "s")
    .piece("sun_lounger", 6, 2, 0, "s")
    .piece("bbq_grill", 7, 3, 0, "w");
  a.piece("rotary_clothesline", 10, 2, 0, "s").piece("garden_shed", 14, 1, 0, "w");
  a.piece("veg_bed", 11, 1, 0, "s").piece("veg_bed", 12, 1, 0, "s");
  a.ob(0, "high:tree", [1, 1]);
  a.lamp(5, 12, 0, "n").lamp(5, 3, 0, "s").lamp(12, 12, 0, "n").ceiling(12, 9, 0);
  a.node("vampire", [3, 6, 0], [8, 5, 0])
    .node("thrall", [3, 10, 0], [12, 9, 0], [8, 10, 0])
    .node("prisoner", [8, 8, 0])
    .node("patrol", [8, 13, 0], [9, 2, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Semi-detached pair

function duplex() {
  const a = new Draft(
    light(
      "duplex",
      "Semi-detached pair",
      "structure",
      ["s", "n"],
      ["nest", "rescue"],
      "Two houses sharing a party wall, each the other's mirror: hall and stairs by the drive, living room on the party wall, kitchen across the back with a side door to the drive. Upstairs a main bedroom, a single room and the bathroom. Each with its own drive, hedge and back garden; a fence between the gardens.",
    ),
    16,
    16,
    0,
    3,
    "grass",
  );
  const W = "wood/brick/plaster",
    K = "tile/brick/plaster";
  // The left house; pair() makes the right.
  a.fl(0, 0, 1, 1, 14, "concrete").fl(0, 3, 11, 3, 14, "pavement");
  a.room(0, 4, 7, 7, 10, W) // living room
    .room(0, 2, 7, 3, 10, W) // hall
    .room(0, 2, 4, 7, 6, K); // kitchen
  a.flight(0, 2, 8, "n");
  a.edge(0, "s", "door", [3, 10]).edge(0, "e", "door", [3, 8]).edge(0, "n", "door", [3, 7], [6, 4]);
  a.edge(0, "w", "door", [2, 5]);
  a.edge(0, "s", "window", [5, 10], [6, 10]).edge(0, "n", "window", [4, 4], [5, 4]);
  a.piece("kitchen_counter", 2, 4, 0, "s")
    .piece("kitchen_stove", 3, 4, 0, "s")
    .piece("kitchen_sink", 4, 4, 0, "s")
    .piece("kitchen_counter", 5, 4, 0, "s")
    .piece("kitchen_fridge", 7, 4, 0, "s");
  a.ob(0, "low:table", [4, 6], [5, 6]);
  a.piece("sofa", 4, 9, 0, "e").piece("tv", 7, 9, 0, "w");
  a.piece("bookcase", 4, 7, 0, "s").piece("wingback_chair", 7, 7, 0, "w");
  a.room(1, 2, 7, 4, 7, W) // landing
    .more(1, 2, 8, 3, 10, W)
    .room(1, 4, 8, 7, 10, W) // main bedroom
    .room(1, 5, 4, 7, 7, W) // single room
    .room(1, 2, 4, 4, 6, K); // bathroom
  a.edge(1, "e", "door", [3, 9], [4, 7]).edge(1, "n", "door", [3, 7]);
  a.edge(1, "s", "window", [5, 10], [6, 10]).edge(1, "n", "window", [3, 4], [6, 4]);
  a.piece("bed", 6, 8, 1, "w").piece("wardrobe", 4, 10, 1, "n");
  a.piece("bed_single", 6, 4, 1, "w").piece("wardrobe", 5, 6, 1, "e");
  a.piece("bath", 2, 4, 1, "e").piece("toilet_clean", 4, 4, 1, "s").piece("basin", 2, 6, 1, "e");
  a.fl(2, 2, 4, 7, 10, "roof");
  hedgeRow(a, 14, 2, 7, [3]);
  hedgeRow(a, 0, 0, 7, [1]);
  a.lamp(3, 11, 0, "n").lamp(1, 5, 0, "e");
  a.node("vampire", [5, 9, 1]).node("thrall", [4, 5, 0]);
  a.pair();
  // Two homes, not twins: a car on one drive, a van on the other; their own gardens.
  a.car("car", 0, 11, 0, "y", 1, "concrete").car("suv", 14, 10, 0, "y", -1, "concrete");
  a.piece("privacy_fence", 8, 1, 0, "e").ob(0, "high:hedge", [8, 3]);
  a.piece("rotary_clothesline", 3, 1, 0, "s").piece("patio_set", 5, 2, 0, "n");
  a.piece("garden_shed", 7, 1, 0, "w");
  a.piece("trampoline", 11, 1, 0, "s").piece("bbq_grill", 13, 3, 0, "n");
  a.ob(0, "high:tree", [6, 12], [12, 12]).piece("bicycle", 10, 12, 0, "s");
  a.node("prisoner", [3, 5, 1], [12, 5, 1]).node("patrol", [8, 13, 0], [4, 1, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Parade of shops

function parade() {
  const a = new Draft(
    light(
      "parade",
      "Parade of shops",
      "structure",
      ["s", "n"],
      ["nest"],
      "A terrace of three shops with flats over them: a mini mart, a café and a laundrette, glass on the street, back doors on the service lane behind. Between the mart and the café, the flats' own door and stairs; a flat either side of the landing. Bins on the lane.",
    ),
    16,
    8,
    0,
    3,
    "tarmac",
  );
  const T = "tile/brick/plaster",
    W = "wood/brick/plaster";
  a.fl(0, 0, 7, 15, 7, "pavement");
  a.room(0, 0, 2, 5, 6, T) // mini mart
    .room(0, 6, 2, 7, 6, T) // the flats' lobby
    .room(0, 8, 2, 11, 6, W) // café
    .room(0, 12, 2, 15, 6, T); // laundrette
  a.flight(0, 7, 3, "n");
  // Mart: fridges at the back, shelves and gondolas, the till by the door.
  a.edge(0, "s", "door", [1, 6]).edge(0, "s", "glass", [2, 6], [3, 6], [4, 6]);
  a.edge(0, "n", "door", [0, 2]);
  a.piece("drinks_fridge", 2, 2, 0, "s")
    .piece("drinks_fridge", 3, 2, 0, "s")
    .piece("drinks_fridge", 4, 2, 0, "s")
    .piece("shelf_wall", 5, 2, 0, "s");
  a.piece("shelf_wall", 0, 4, 0, "e").piece("shelf_wall", 0, 5, 0, "e");
  a.piece("shelf_gondola", 2, 4, 0, "e").piece("shelf_gondola", 2, 5, 0, "e");
  a.piece("checkout_counter", 4, 4, 0, "w");
  a.sign(2, 6, 0, "s", 4, "MINI MART", "#2a6a3a", "#f0f0e0");
  // Lobby.
  a.edge(0, "s", "door", [6, 6]).edge(0, "n", "door", [6, 2]);
  // Café: the kitchen line at the back, the counter, tables by the window.
  a.edge(0, "s", "door", [10, 6]).edge(0, "s", "glass", [8, 6], [9, 6], [11, 6]);
  a.edge(0, "n", "door", [11, 2]);
  a.piece("kitchen_counter", 8, 2, 0, "s")
    .piece("kitchen_stove", 9, 2, 0, "s")
    .piece("kitchen_fridge", 10, 2, 0, "s");
  a.piece("coffee_counter", 9, 4, 0, "s");
  a.piece("cafe_table", 8, 5, 0, "s").piece("cafe_table", 11, 5, 0, "s");
  a.sign(9, 6, 0, "s", 3, "CAFE", "#5a3a20", "#f0e0c0");
  // Laundrette: machines down one wall, seats along the other.
  a.edge(0, "s", "door", [13, 6]).edge(0, "s", "glass", [12, 6], [14, 6], [15, 6]);
  a.edge(0, "n", "door", [12, 2]);
  for (const y of [2, 3, 4, 5]) a.piece("washing_machine", 15, y, 0, "w");
  a.piece("waiting_chairs", 12, 4, 0, "e");
  a.sign(14, 6, 0, "s", 3, "LAUNDRETTE", "#1a3a6a", "#e0f0ff");
  // Upstairs: the landing, a flat either side.
  a.room(1, 6, 2, 7, 6, W) // landing
    .room(1, 0, 4, 5, 6, W) // left flat: living room and kitchen
    .room(1, 0, 2, 3, 3, W) // its bedroom
    .room(1, 4, 2, 5, 3, T) // its shower room
    .room(1, 8, 2, 12, 6, W) // right flat: living room and kitchen
    .room(1, 13, 2, 15, 4, W) // its bedroom
    .room(1, 13, 5, 15, 6, T); // its bathroom
  a.edge(1, "w", "door", [6, 5]).edge(1, "e", "door", [7, 5], [12, 3], [12, 5]);
  a.edge(1, "n", "door", [0, 4], [5, 4]);
  a.edge(1, "s", "window", [2, 6], [4, 6], [9, 6], [11, 6], [14, 6]);
  a.edge(1, "n", "window", [1, 2], [10, 2], [14, 2]);
  a.piece("kitchen_counter", 0, 5, 1, "e").piece("kitchen_fridge", 0, 6, 1, "e");
  a.piece("kitchen_sink", 4, 6, 1, "n").piece("kitchen_stove", 5, 6, 1, "n");
  a.piece("sofa", 2, 4, 1, "s").piece("tv", 2, 6, 1, "n");
  a.piece("bed", 2, 2, 1, "w").piece("wardrobe", 0, 2, 1, "s");
  a.piece("toilet_clean", 4, 2, 1, "e").piece("shower", 4, 3, 1, "e");
  a.piece("kitchen_fridge", 8, 2, 1, "s")
    .piece("kitchen_counter", 9, 2, 1, "s")
    .piece("kitchen_sink", 10, 2, 1, "s")
    .piece("kitchen_stove", 11, 2, 1, "s")
    .piece("kitchen_counter", 12, 2, 1, "s");
  a.piece("tv", 9, 4, 1, "s").piece("sofa", 9, 6, 1, "n").ob(1, "low:table", [11, 4]);
  a.piece("bed", 14, 2, 1, "w").piece("wardrobe", 15, 4, 1, "w");
  a.piece("toilet_clean", 15, 5, 1, "w").piece("bath", 15, 6, 1, "w").piece("basin", 13, 6, 1, "n");
  a.fl(2, 0, 2, 15, 6, "roof");
  // The lane: bins against the back fence.
  a.piece("wheelie_bins", 2, 0, 0, "s").piece("wheelie_bins", 3, 0, 0, "s");
  a.piece("dumpster_overflow", 9, 0, 0, "s").piece("trash_bags", 14, 0, 0, "s");
  a.piece("a_frame_sign", 11, 7, 0, "s");
  a.ceiling(3, 3, 0).ceiling(9, 5, 0).ceiling(13, 4, 0);
  a.lamp(6, 7, 0, "n").lamp(6, 1, 0, "s");
  a.node("vampire", [1, 5, 1], [13, 3, 1])
    .node("thrall", [3, 3, 0], [10, 3, 0], [7, 6, 0])
    .node("patrol", [8, 1, 0], [4, 7, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Petrol station

function petrol() {
  const a = new Draft(
    light(
      "petrol",
      "Petrol station",
      "structure",
      ["s"],
      ["nest"],
      "Forecourt under a canopy, two pumps, a car filling up; the kiosk shop behind it (glass front, fridges, shelves, the till), a store room, a customer WC and the office behind the shop. A delivery lorry down the side, bins and the gas cage at the back. Grass verges and hedges on the sides; the price sign by the road.",
    ),
    16,
    16,
    0,
    2,
    "tarmac",
  );
  const T = "tile/brick/plaster";
  a.fl(0, 0, 15, 15, 15, "pavement").fl(0, 0, 0, 0, 14, "grass").fl(0, 15, 0, 15, 14, "grass");
  a.col(0, "high:hedge", 0, 0, 7).col(0, "high:hedge", 15, 0, 7);
  a.ob(0, "high:tree", [0, 10], [15, 11]);
  a.room(0, 4, 4, 11, 7, T) // shop
    .room(0, 4, 2, 7, 3, "concrete/brick/plaster") // store
    .room(0, 8, 2, 9, 3, T) // WC
    .room(0, 10, 2, 11, 3, "wood/brick/plaster"); // office
  a.edge(0, "s", "slide", [7, 7], [8, 7]).edge(0, "s", "glass", [5, 7], [6, 7], [9, 7], [10, 7]);
  a.edge(0, "n", "door", [5, 4], [8, 4], [10, 4], [7, 2]);
  a.edge(0, "e", "window", [11, 5]);
  a.piece("drinks_fridge", 4, 4, 0, "e")
    .piece("drinks_fridge", 4, 5, 0, "e")
    .piece("drinks_fridge", 4, 6, 0, "e");
  a.piece("shelf_wall", 6, 4, 0, "s")
    .piece("shelf_wall", 7, 4, 0, "s")
    .piece("shelf_wall", 9, 4, 0, "s");
  a.piece("shelf_gondola", 6, 6, 0, "s").piece("shelf_gondola", 7, 6, 0, "s");
  a.piece("checkout_counter", 10, 5, 0, "w").piece("ice_chest", 9, 8, 0, "s");
  a.piece("shelf_wall", 4, 2, 0, "s")
    .piece("pallet_boxes", 5, 2, 0, "s")
    .ob(0, "low:crate", [6, 2]);
  a.piece("toilet_clean", 9, 2, 0, "w").piece("basin", 9, 3, 0, "w");
  a.piece("desk_set_computer", 11, 2, 0, "w").piece("filing_cabinet", 11, 3, 0, "w");
  a.sign(7, 7, 0, "s", 4, "FUEL & FOOD", "#d8a020", "#2a1a10");
  a.fl(1, 4, 2, 11, 7, "roof");
  // The forecourt.
  a.canopy(0, 3, 9, 12, 13, 3.4);
  a.piece("fuel_pump", 5, 11, 0, "s").piece("fuel_pump", 10, 11, 0, "s");
  a.car("car", 6, 10, 0, "y", 1, "tarmac");
  a.piece("price_sign", 0, 13, 0, "s");
  a.car("truck", 13, 2, 0, "y", 1, "tarmac");
  // The back.
  a.piece("propane_cage", 4, 0, 0, "s");
  a.piece("wheelie_bins", 9, 0, 0, "s").piece("wheelie_bins", 10, 0, 0, "s");
  a.ceiling(5, 10, 0).ceiling(10, 12, 0).ceiling(7, 5, 0);
  a.lamp(7, 8, 0, "n").lamp(7, 1, 0, "s").lamp(14, 13, 0);
  a.node("vampire", [10, 2, 0])
    .node("thrall", [9, 6, 0], [11, 5, 0], [12, 8, 0])
    .node("patrol", [2, 10, 0], [13, 13, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Park

function park() {
  const a = new Draft(
    light(
      "park",
      "Park",
      "open",
      ["s", "n", "e", "w"],
      [],
      "A walled garden of a park: hedges round it, paths crossing at a little plaza with a sculpture, a fenced playground, picnic tables, a brick toilet block, benches along the paths, trees on the lawns.",
    ),
    16,
    16,
    0,
    2,
    "grass",
  );
  a.fl(0, 0, 15, 15, 15, "pavement")
    .fl(0, 7, 0, 8, 14, "pavement")
    .fl(0, 0, 7, 15, 8, "pavement")
    .fl(0, 6, 6, 9, 9, "pavement")
    .fl(0, 1, 1, 5, 5, "dirt");
  hedgeRow(a, 0, 0, 15, [7, 8]);
  a.col(0, "high:hedge", 0, 1, 14, [7, 8]).col(0, "high:hedge", 15, 1, 14, [7, 8]);
  fence(a, 0, "picket_fence", "s", 14, 1, 6);
  fence(a, 0, "picket_fence", "s", 14, 9, 14);
  // The plaza: an old tree, benches round it.
  a.ob(0, "high:tree", [7, 7]);
  a.piece("bench", 9, 9, 0, "w").piece("bench", 9, 6, 0, "w").piece("bench", 6, 9, 0, "n");
  // The playground, fenced, a gate toward the plaza and one toward the toilets.
  fence(a, 0, "picket_fence", "s", 6, 1, 4).piece("picket_gate", 6, 6, 0, "s");
  fence(a, 0, "picket_fence", "e", 6, 1, 2);
  fence(a, 0, "picket_fence", "e", 6, 4, 5);
  a.piece("swing_set", 1, 1, 0, "s").piece("sandbox", 4, 2, 0, "s");
  a.piece("bench", 1, 5, 0, "e");
  // The toilet block.
  a.room(0, 11, 1, 12, 3, "tile/brick/plaster").room(0, 13, 1, 14, 3, "tile/brick/plaster");
  a.edge(0, "s", "door", [11, 3], [14, 3]);
  a.piece("toilet_grimy", 11, 1, 0, "s").piece("basin", 12, 1, 0, "s");
  a.piece("basin", 13, 1, 0, "s").piece("toilet_grimy", 14, 1, 0, "s");
  a.fl(1, 11, 1, 14, 3, "roof");
  // Lawns.
  a.piece("picnic_table", 2, 10, 0, "s").piece("picnic_table", 4, 12, 0, "s");
  a.piece("bench", 9, 3, 0, "w").piece("bench", 3, 9, 0, "n").piece("bench", 12, 6, 0, "s");
  a.piece("bench", 6, 12, 0, "e").piece("bench", 9, 12, 0, "w");
  a.ob(0, "high:tree", [9, 1], [10, 5], [1, 12], [5, 10], [12, 10], [14, 12], [10, 13], [3, 3]);
  a.lamp(9, 5, 0).lamp(6, 10, 0).lamp(12, 9, 0);
  a.node("patrol", [7, 3, 0], [12, 8, 0], [3, 8, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Town square

function square() {
  const a = new Draft(
    light(
      "square",
      "Town square",
      "open",
      ["s", "e", "w"],
      [],
      "A paved square: a memorial in the middle with benches round it, a café kiosk along the back with tables out front, trees in two rows, lawn beds with a tree each at the front corners, hedge planters to hide behind, the bus shelter on the street.",
    ),
    16,
    16,
    0,
    2,
    "pavement",
  );
  a.fl(0, 1, 10, 4, 13, "grass").fl(0, 11, 10, 14, 13, "grass");
  // The café kiosk.
  a.room(0, 5, 0, 10, 2, "tile/brick/plaster");
  a.edge(0, "s", "slide", [7, 2], [8, 2]).edge(0, "s", "glass", [6, 2], [9, 2]);
  a.edge(0, "e", "door", [10, 1]);
  a.piece("kitchen_fridge", 5, 0, 0, "s").piece("kitchen_sink", 10, 0, 0, "s");
  a.piece("coffee_counter", 6, 1, 0, "s").piece("kitchen_counter", 9, 1, 0, "s");
  a.sign(7, 2, 0, "s", 4, "CAFE", "#5a3a20", "#f0e0c0");
  a.fl(1, 5, 0, 10, 2, "roof");
  a.piece("cafe_table", 5, 4, 0, "s").piece("cafe_table", 7, 4, 0, "s");
  a.piece("cafe_table", 10, 4, 0, "s").piece("a_frame_sign", 11, 3, 0, "s");
  // The memorial.
  a.piece("sculpture", 7, 8, 0, "s");
  a.piece("bench", 5, 8, 0, "e").piece("bench", 10, 8, 0, "w").piece("bench", 7, 10, 0, "n");
  // Trees, planters, beds.
  a.ob(0, "high:tree", [1, 5], [4, 5], [11, 5], [14, 5], [2, 11], [13, 12]);
  a.ob(0, "high:hedge", [3, 8], [3, 9], [12, 7], [12, 8]);
  a.piece("bus_shelter", 2, 14, 0, "s").piece("fire_hydrant", 14, 14, 0, "s");
  a.piece("news_rack", 12, 14, 0, "s");
  a.lamp(4, 2, 0).lamp(11, 2, 0).lamp(5, 13, 0).lamp(10, 13, 0);
  a.node("patrol", [7, 5, 0], [2, 8, 0], [13, 9, 0]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Allotments

function allotment() {
  const a = new Draft(
    light(
      "allotment",
      "Allotments",
      "open",
      ["s"],
      [],
      "Four plots inside a fence, a grass path between them: raised beds, pumpkins, corn, a scarecrow, a shed, a compost heap, a bench.",
    ),
    8,
    8,
    0,
    2,
    "grass",
  );
  a.fl(0, 0, 7, 7, 7, "pavement")
    .fl(0, 1, 1, 2, 2, "dirt")
    .fl(0, 4, 1, 5, 2, "dirt")
    .fl(0, 1, 4, 2, 5, "dirt")
    .fl(0, 4, 4, 6, 5, "dirt");
  fence(a, 0, "chainlink_fence", "s", 6, 0, 1);
  fence(a, 0, "chainlink_fence", "s", 6, 4, 7);
  fence(a, 0, "chainlink_fence", "w", 0, 0, 5);
  fence(a, 0, "chainlink_fence", "e", 7, 0, 5);
  fence(a, 0, "chainlink_fence", "n", 0, 1, 6);
  a.piece("pumpkin_patch", 1, 1, 0, "s").piece("pumpkin_patch", 2, 1, 0, "s");
  a.piece("veg_bed", 1, 2, 0, "s").piece("veg_bed", 2, 2, 0, "s");
  a.piece("veg_bed", 4, 1, 0, "s");
  a.piece("garden_shed", 6, 1, 0, "w");
  a.piece("veg_bed", 1, 4, 0, "s")
    .piece("crop_corn", 2, 4, 0, "s")
    .piece("crop_corn", 2, 5, 0, "s");
  a.piece("wheelbarrow", 4, 4, 0, "s").piece("scarecrow", 5, 4, 0, "s");
  a.piece("veg_bed", 6, 4, 0, "n").piece("woodpile", 6, 5, 0, "w");
  a.piece("bench", 4, 3, 0, "n");
  return a.done();
}

// ---------------------------------------------------------------------------
// Backstreet garage over a den

function workshop() {
  const a = new Draft(
    light(
      "workshop",
      "Backstreet garage",
      "structure",
      ["s"],
      ["nest", "den", "haven"],
      "A car repair garage: two bays behind roller doors, a car and an SUV on them, racks and benches; the office on the street, the parts store behind it with the stair down. A yard of tyres and a car for scrap. Below, the den: coffins, candles, the blood fridge; a boiler room where they keep someone.",
    ),
    16,
    16,
    1,
    2,
    "tarmac",
  );
  const C = "concrete/brick/plaster";
  a.fl(1, 0, 15, 15, 15, "pavement");
  // Ground floor (level 1).
  a.room(1, 1, 2, 7, 11, C) // workshop
    .room(1, 8, 2, 10, 7, C) // parts store
    .room(1, 8, 8, 10, 11, "tile/brick/plaster"); // office
  a.edge(1, "s", "garage", [2, 11], [3, 11], [5, 11], [6, 11]);
  a.edge(1, "w", "door", [8, 5], [8, 9]).edge(1, "s", "door", [9, 7], [9, 11]);
  a.edge(1, "e", "door", [10, 3]);
  a.edge(1, "e", "window", [10, 9], [10, 10]).edge(1, "w", "window", [1, 5], [1, 8]);
  a.edge(1, "n", "window", [4, 2]);
  a.car("car", 2, 5, 1, "y", 1, "concrete").car("suv", 5, 4, 1, "y", 1, "concrete");
  a.piece("pallet_racking", 2, 2, 1, "s").piece("pallet_racking_mixed", 3, 2, 1, "s");
  a.piece("pallet_racking", 5, 2, 1, "s").piece("gas_cylinders", 7, 2, 1, "s");
  a.piece("workbench", 1, 4, 1, "e").piece("tool_chest", 1, 9, 1, "e");
  a.piece("tyre_stack", 7, 10, 1, "w");
  a.flight(0, 9, 3, "n");
  a.piece("pallet_racking", 10, 5, 1, "w")
    .piece("pallet_racking", 10, 6, 1, "w")
    .piece("pallet_racking_mixed", 10, 7, 1, "w");
  a.piece("shelf_wall", 8, 6, 1, "e").piece("tyre_stack", 8, 7, 1, "e");
  a.piece("filing_cabinet", 8, 8, 1, "s").piece("desk_set_computer", 10, 8, 1, "s");
  a.piece("waiting_chairs", 10, 10, 1, "w");
  a.sign(4, 11, 1, "s", 4, "AUTO REPAIRS", "#1a2a4a", "#f0d020");
  a.fl(2, 1, 2, 10, 11, "roof");
  // The yard, fenced.
  fence(a, 1, "chainlink_fence", "n", 0, 0, 9);
  fence(a, 1, "chainlink_barbed", "n", 0, 10, 15);
  fence(a, 1, "chainlink_barbed", "e", 15, 1, 8);
  fence(a, 1, "chainlink_torn", "e", 15, 9, 10);
  fence(a, 1, "chainlink_barbed", "e", 15, 11, 14);
  a.piece("tyre_stack", 12, 2, 1, "n").piece("tyre_stack", 13, 2, 1, "n");
  a.piece("ibc_tank", 14, 1, 1, "w").piece("trash_pile", 14, 9, 1, "w");
  a.car("car", 12, 4, 1, "y", -1, "tarmac");
  // The den below (level 0).
  const B = "concrete/concrete/concrete";
  a.room(0, 8, 2, 10, 6, B) // stair hall
    .room(0, 1, 2, 7, 11, "concrete/concrete/plaster") // the den
    .room(0, 8, 7, 10, 11, B); // boiler room
  a.edge(0, "w", "door", [8, 4]).edge(0, "n", "door", [9, 7]);
  a.piece("coffin_antique", 1, 3, 0, "e").piece("coffin_antique", 1, 7, 0, "e");
  a.piece("coffin_modern", 6, 10, 0, "n");
  a.piece("blood_fridge", 7, 2, 0, "s");
  a.piece("candle_stand", 3, 2, 0, "s").piece("candle_stand", 5, 2, 0, "s");
  a.piece("persian_rug", 3, 5, 0, "s").piece("feeding_chair", 4, 8, 0, "n");
  a.piece("basement_boiler", 10, 11, 0, "w").piece("shelf_wall", 8, 11, 0, "n");
  a.ceiling(4, 5, 0).ceiling(9, 9, 0).ceiling(4, 8, 1).ceiling(9, 4, 1);
  a.lamp(9, 12, 1, "n").lamp(11, 3, 1, "w");
  a.node("elder", [4, 4, 0])
    .node("vampire", [3, 6, 0], [5, 9, 0])
    .node("thrall", [9, 9, 1], [4, 9, 1], [12, 9, 1])
    .node("prisoner", [9, 9, 0])
    .node("patrol", [13, 13, 1], [0, 6, 1]);
  return a.done();
}

// ---------------------------------------------------------------------------
// Doctor's surgery over a cold store

function surgery() {
  const a = new Draft(
    light(
      "surgery",
      "Doctor's surgery",
      "structure",
      ["s"],
      ["nest", "rescue", "haven"],
      "A single-storey medical centre: glass doors into the waiting room (reception, rows of chairs), two consulting rooms on one side, the treatment room and the practice office on the other, a WC and the staff room at the back. Stairs from the waiting room to the basement: the records room, and a cold store kept for blood. Parking either side of the path.",
    ),
    16,
    16,
    1,
    2,
    "grass",
  );
  const C = "tile/brick/clinic";
  a.fl(1, 0, 15, 15, 15, "pavement")
    .fl(1, 5, 11, 10, 14, "pavement")
    .fl(1, 0, 11, 4, 14, "tarmac")
    .fl(1, 11, 11, 15, 14, "tarmac");
  a.room(1, 2, 7, 4, 10, C) // consulting room 1
    .room(1, 2, 3, 4, 6, C) // consulting room 2
    .room(1, 5, 5, 10, 10, C) // waiting room
    .more(1, 9, 3, 10, 4, C) // the stair alcove
    .room(1, 5, 3, 6, 4, C) // WC
    .room(1, 7, 3, 8, 4, C) // staff room
    .room(1, 11, 3, 13, 6, C) // office
    .room(1, 11, 7, 13, 10, C); // treatment room
  a.flight(0, 10, 3, "s");
  a.edge(1, "s", "slide", [7, 10], [8, 10]).edge(1, "s", "glass", [6, 10], [9, 10]);
  a.edge(1, "e", "door", [4, 10], [4, 5]).edge(1, "w", "door", [11, 8], [11, 6]);
  a.edge(1, "s", "door", [5, 4], [7, 4]).edge(1, "n", "door", [8, 3]);
  a.edge(1, "w", "window", [2, 8], [2, 9], [2, 4]).edge(1, "s", "window", [3, 10], [12, 10]);
  a.edge(1, "n", "window", [3, 3], [12, 3]).edge(1, "e", "window", [13, 8], [13, 4]);
  a.piece("clinic_reception", 5, 7, 1, "e");
  a.piece("waiting_chairs", 7, 7, 1, "n").piece("waiting_chairs", 7, 8, 1, "s");
  a.piece("exam_table", 2, 8, 1, "e").piece("desk_set_computer", 4, 7, 1, "s");
  a.piece("medicine_cabinet", 2, 10, 1, "e").piece("privacy_screen", 2, 7, 1, "e");
  a.piece("exam_table", 2, 4, 1, "e").piece("desk_set_laptop", 4, 3, 1, "s");
  a.piece("medicine_cabinet", 2, 6, 1, "e");
  a.piece("exam_table", 13, 8, 1, "w").piece("medicine_cabinet", 13, 10, 1, "w");
  a.piece("basin", 13, 7, 1, "w").piece("iv_stand", 13, 9, 1, "w");
  a.piece("desk_set_computer", 13, 4, 1, "w").piece("filing_cabinet", 11, 3, 1, "s");
  a.piece("bookcase", 13, 6, 1, "w");
  a.piece("toilet_clean", 6, 3, 1, "w").piece("basin", 6, 4, 1, "w");
  a.piece("kitchen_counter", 7, 3, 1, "s").piece("kitchen_fridge", 8, 4, 1, "w");
  a.sign(7, 10, 1, "s", 4, "MEDICAL CENTRE", "#e8f0f0", "#1a5a8a");
  a.fl(2, 2, 3, 13, 10, "roof");
  // Outside.
  a.car("car", 1, 11, 1, "y", -1, "tarmac").car("car", 13, 11, 1, "y", -1, "tarmac");
  a.piece("wheelie_bins", 12, 1, 1, "s").piece("bench", 4, 1, 1, "s");
  a.ob(1, "high:tree", [1, 2], [14, 7], [1, 6]);
  // The basement (level 0): stair hall, records, the cold store.
  const B = "concrete/concrete/concrete";
  a.room(0, 9, 2, 10, 6, B).room(0, 5, 2, 8, 6, B).room(0, 11, 2, 13, 6, B);
  a.edge(0, "w", "door", [9, 5]).edge(0, "e", "door", [10, 5]);
  a.piece("filing_cabinet", 5, 2, 0, "e")
    .piece("filing_cabinet", 5, 3, 0, "e")
    .piece("filing_cabinet", 5, 4, 0, "e");
  a.piece("filing_cabinet", 7, 2, 0, "s").piece("shelf_wall", 8, 2, 0, "s");
  a.piece("chair", 6, 6, 0, "n");
  a.piece("blood_fridge", 13, 2, 0, "w").piece("blood_fridge", 13, 3, 0, "w");
  a.piece("coffin_modern", 12, 6, 0, "n").piece("feeding_chair", 11, 2, 0, "s");
  a.ceiling(7, 4, 0).ceiling(12, 4, 0).ceiling(7, 6, 1).ceiling(12, 8, 1);
  a.lamp(7, 11, 1, "n").lamp(8, 2, 1, "s");
  a.node("elder", [12, 4, 0])
    .node("vampire", [11, 4, 0])
    .node("thrall", [6, 6, 1], [9, 9, 1], [12, 5, 1])
    .node("prisoner", [6, 5, 0])
    .node("patrol", [3, 12, 1], [10, 1, 1]);
  return a.done();
}

export const DRAFTS: Drafts = {
  house,
  bungalow,
  duplex,
  parade,
  petrol,
  park,
  square,
  allotment,
  workshop,
  surgery,
};
