// Pieces: the prop kit's models placed whole, as furniture (docs/design/levels.md,
// "Assets"). Each is a furniture kind: a footprint (length across the way
// it faces, then depth), the cover its tiles give, the skin the rules see
// on them (for a shot's height, lowProp and HIGH in geometry.ts), the
// editor's menu group, and how its model is anchored:
//   centre  on its footprint's middle (furniture; its back, if any, at the
//           far edge from its front);
//   back    on the edge behind its footprint (a piece on a wall: graffiti,
//           a fire escape, a porch): the front looks away from that wall.
// A piece with no cover leaves its tiles as they are (walked over, seen
// through); a "back" piece may hang over open air (a fire escape).
//
// To add one: build the model (scripts/build-props.py), add a row here.
import type { Skin } from "./map";

export type PieceCover = "high" | "low" | "none";
interface PieceDef {
  size: readonly [number, number];
  cover: PieceCover;
  skin: Skin;
  group: string;
  anchor: "centre" | "back";
  /**
   * The models drawn, if not the one named as the piece: [model, x, height,
   * z, turn], offsets in metres in the piece's frame (x along it, z toward
   * its front), turn in radians.
   */
  parts?: readonly (readonly [string, number, number, number, number])[];
  label?: string;
}

type Row = readonly [
  name: string,
  len: number,
  depth: number,
  cover: PieceCover,
  skin: Skin,
  extra?: Partial<PieceDef>,
];
const WALL = { anchor: "back" } as const;

const GROUPS: Record<string, readonly Row[]> = {
  Shop: [
    ["fuel_pump", 1, 1, "high", "pump"],
    ["shelf_gondola", 1, 1, "high", "shelf"],
    ["shelf_wall", 1, 1, "high", "shelf"],
    ["drinks_fridge", 1, 1, "high", "fridge"],
    ["ice_chest", 1, 1, "low", "counter"],
    ["checkout_counter", 2, 1, "low", "counter"],
    ["atm", 1, 1, "high", "fridge", { label: "ATM" }],
    ["news_rack", 1, 1, "low", "crate"],
    ["propane_cage", 1, 1, "high", "rack"],
    ["price_sign", 1, 1, "high", "pillar", { label: "Price sign (pylon)" }],
    ["shopping_trolley", 1, 1, "none", "crate"],
  ],
  "Café and fast food": [
    ["coffee_counter", 2, 1, "low", "counter"],
    ["cafe_table", 1, 1, "low", "table", { label: "Café table" }],
    ["a_frame_sign", 1, 1, "none", "crate", { label: "A-frame sign" }],
    ["fastfood_counter", 2, 1, "low", "counter", { label: "Fast-food counter" }],
    ["booth", 2, 1, "low", "sofa"],
    ["menu_board", 1, 1, "high", "pillar", { label: "Drive-through menu board" }],
  ],
  Office: [
    [
      "desk_set_computer",
      1,
      1,
      "low",
      "table",
      {
        label: "Desk with a computer",
        parts: [
          ["desk", 0, 0, 0, 0],
          ["desk_computer", -0.2, 0.75, 0.05, 0],
          ["office_chair", -0.15, 0, 0.45, Math.PI],
        ],
      },
    ],
    [
      "desk_set_laptop",
      1,
      1,
      "low",
      "table",
      {
        label: "Desk with a laptop",
        parts: [
          ["desk", 0, 0, 0, 0],
          ["desk_laptop", 0, 0.75, 0, 0],
          ["office_chair", -0.15, 0, 0.45, Math.PI],
        ],
      },
    ],
    [
      "desk_set_papers",
      1,
      1,
      "low",
      "table",
      {
        label: "Desk with paperwork",
        parts: [
          ["desk", 0, 0, 0, 0],
          ["desk_papers", 0, 0.75, 0, 0],
          ["office_chair", -0.15, 0, 0.45, Math.PI],
        ],
      },
    ],
  ],
  "Car park and park": [
    [
      "boom_barrier",
      1,
      1,
      "low",
      "crate",
      { label: "Boom barrier (arm over 2 tiles to its left)" },
    ],
    ["pay_station", 1, 1, "low", "crate"],
    ["bench", 1, 1, "low", "bench", { label: "Bench" }],
    ["picnic_table", 1, 1, "low", "table"],
    ["swing_set", 2, 1, "none", "crate"],
  ],
  "Church and graveyard": [
    ["pew", 2, 1, "low", "sofa"],
    ["altar", 2, 1, "low", "altar"],
    ["lectern", 1, 1, "low", "crate"],
    ["candle_stand", 1, 1, "low", "crate"],
    ["gravestone", 1, 1, "low", "grave"],
    ["gravestone_cross", 1, 1, "low", "grave", { label: "Gravestone, cross" }],
    ["grave_tomb", 1, 1, "low", "sarcophagus", { label: "Chest tomb" }],
  ],
  Tenement: [
    [
      "fire_escape",
      2,
      1,
      "none",
      "crate",
      { ...WALL, label: "Fire escape (on a wall, storeys above the first)" },
    ],
    [
      "fire_escape_ladder",
      2,
      1,
      "none",
      "crate",
      { ...WALL, label: "Fire escape, lowest landing (on a wall)" },
    ],
    ["boarded_window", 1, 1, "none", "crate", { ...WALL, label: "Boarded window (on a window)" }],
    ["window_bars", 1, 1, "none", "crate", { ...WALL, label: "Window bars (on a window)" }],
    ["satellite_dish", 1, 1, "none", "crate", { ...WALL, label: "Satellite dish (on a wall)" }],
    [
      "balcony_laundry",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Balcony with washing (on a wall)" },
    ],
    [
      "entrance_stoop",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Entrance stoop (outside a door)" },
    ],
    [
      "entrance_stoop_rundown",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Entrance stoop, run down (outside a door)" },
    ],
    ["mailboxes", 1, 1, "none", "crate", { label: "Mailboxes (against a wall)" }],
  ],
  Home: [
    ["bed_single", 1, 2, "low", "bed", { label: "Single bed (head to the wall behind)" }],
    ["wardrobe", 1, 1, "high", "shelf"],
    ["chair", 1, 1, "none", "crate"],
    ["filing_cabinet", 1, 1, "high", "shelf"],
  ],
  Kitchen: [
    ["kitchen_counter", 1, 1, "low", "counter"],
    ["kitchen_sink", 1, 1, "low", "counter"],
    ["kitchen_stove", 1, 1, "low", "counter", { label: "Kitchen cooker" }],
    ["kitchen_fridge", 1, 1, "high", "fridge", { label: "Fridge-freezer and cupboard" }],
    ["kitchen_counter_cluttered", 1, 1, "low", "counter", { label: "Kitchen counter, run down" }],
    ["washing_machine", 1, 1, "low", "counter"],
  ],
  Bathroom: [
    ["toilet_clean", 1, 1, "low", "crate", { label: "Toilet" }],
    ["toilet_grimy", 1, 1, "low", "crate", { label: "Toilet, grimy" }],
    ["basin", 1, 1, "low", "crate"],
    ["basin_vanity", 1, 1, "low", "counter", { label: "Vanity basin, run down" }],
    ["bath", 1, 1, "low", "bed"],
    ["shower", 1, 1, "high", "fridge"],
  ],
  "Yard and court": [
    ["chainlink_fence", 2, 1, "low", "fence", { label: "Chain-link fence" }],
    ["chainlink_barbed", 2, 1, "low", "fence", { label: "Chain-link fence, barbed" }],
    ["chainlink_torn", 2, 1, "low", "fence", { label: "Chain-link fence, torn" }],
    ["basketball_hoop", 1, 1, "none", "crate"],
    ["bleachers", 2, 1, "low", "bench"],
  ],
  "Street, run down": [
    ["bus_shelter", 2, 1, "low", "fence"],
    ["fire_hydrant", 1, 1, "none", "crate"],
    ["wheelie_bins", 1, 1, "low", "bin"],
    ["street_lamp_broken", 1, 1, "none", "crate", { label: "Street lamp, broken" }],
    ["dumpster_overflow", 1, 1, "low", "bin", { label: "Dumpster, overflowing" }],
  ],
  "Junk and grime": [
    ["burning_barrel", 1, 1, "low", "crate"],
    ["trash_bags", 1, 1, "low", "rubble", { label: "Bin bags" }],
    ["trash_pile", 1, 1, "low", "rubble", { label: "Rubbish heap" }],
    ["tyre_stack", 1, 1, "low", "crate", { label: "Tyres" }],
    ["mattress_dumped", 1, 1, "low", "bed", { label: "Mattress (against a wall)" }],
    ["armchair_dumped", 1, 1, "low", "sofa", { label: "Armchair, dumped" }],
    ["rubble_pile", 1, 1, "low", "rubble"],
    ["ground_cracks", 1, 1, "none", "crate", { label: "Cracks (on the ground)" }],
    ["ground_grime", 1, 1, "none", "crate", { label: "Dirt and litter (on the ground)" }],
    ["graffiti_tag", 1, 1, "none", "crate", { ...WALL, label: "Graffiti (on a wall)" }],
    ["graffiti_scrawl", 1, 1, "none", "crate", { ...WALL, label: "Tags (on a wall)" }],
    ["wall_grime", 1, 1, "none", "crate", { ...WALL, label: "Grime streaks (on a wall)" }],
    ["posters_flyposted", 1, 1, "none", "crate", { ...WALL, label: "Fly-posters (on a wall)" }],
    ["posters_missing", 1, 1, "none", "crate", { ...WALL, label: "MISSING posters (on a wall)" }],
    [
      "billboard_peeling",
      2,
      1,
      "none",
      "crate",
      { ...WALL, label: "Billboard, peeling (on a wall)" },
    ],
    [
      "posters_room",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Poster and calendar (on an inside wall)" },
    ],
  ],
  Warehouse: [
    ["pallet_racking", 1, 1, "high", "rack"],
    ["pallet_racking_mixed", 1, 1, "high", "rack", { label: "Pallet racking, half empty" }],
    ["pallet_boxes", 1, 1, "low", "crate", { label: "Pallet of cartons" }],
    ["pallet_sacks", 1, 1, "low", "crate", { label: "Pallet of sacks" }],
    ["forklift", 2, 1, "high", "rack"],
    ["pallet_jack", 1, 1, "none", "crate"],
    [
      "roller_shutter",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Roller shutter, down (on a doorway)" },
    ],
    [
      "roller_shutter_open",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Roller shutter, up (on a doorway)" },
    ],
    ["loading_dock", 1, 1, "none", "crate", { ...WALL, label: "Loading dock (outside a doorway)" }],
    ["ibc_tank", 1, 1, "low", "crate", { label: "IBC tank" }],
    ["gas_cylinders", 1, 1, "high", "rack"],
    ["workbench", 1, 1, "low", "counter"],
    ["tool_chest", 1, 1, "low", "crate"],
  ],
  Works: [
    ["cnc_machine", 1, 1, "high", "fridge", { label: "CNC machine" }],
    ["drill_press", 1, 1, "low", "crate"],
    ["conveyor", 2, 1, "low", "counter"],
    ["control_panel", 1, 1, "high", "fridge"],
    ["generator", 2, 1, "high", "rack"],
    ["pipe_manifold", 1, 1, "low", "fence", { label: "Pipes and valves" }],
    ["storage_tank", 1, 1, "high", "pillar"],
    ["chemical_drums", 1, 1, "low", "crate"],
  ],
  "Data centre": [
    ["server_row", 2, 1, "high", "rack", { label: "Server racks" }],
    ["cooling_unit", 1, 1, "high", "fridge"],
    ["ops_console", 2, 1, "low", "counter", { label: "Monitoring console" }],
  ],
  "Industrial yard": [
    ["shipping_container", 4, 2, "high", "rack"],
    ["container_open", 4, 2, "high", "rack", { label: "Shipping container, open" }],
    ["guard_booth", 1, 1, "high", "pillar"],
  ],
  "House and garden": [
    ["front_porch", 2, 1, "none", "crate", { ...WALL, label: "Front porch (outside a door)" }],
    ["garage_door", 2, 1, "none", "crate", { ...WALL, label: "Garage door (on a 2-tile opening)" }],
    ["picket_fence", 2, 1, "low", "fence"],
    ["picket_gate", 1, 1, "low", "fence"],
    ["privacy_fence", 2, 1, "high", "fence", { label: "Board fence" }],
    ["mailbox_post", 1, 1, "none", "crate", { label: "Mailbox" }],
    ["garden_shed", 1, 1, "high", "planks"],
    ["basement_boiler", 1, 1, "high", "fridge", { label: "Furnace and water heater" }],
  ],
  Backyard: [
    ["bbq_grill", 1, 1, "low", "crate", { label: "Barbecue" }],
    ["patio_set", 1, 1, "low", "table"],
    ["sun_lounger", 1, 1, "low", "bench"],
    ["trampoline", 2, 2, "none", "crate"],
    ["sandbox", 1, 1, "none", "crate"],
    ["lawnmower", 1, 1, "none", "crate"],
    ["veg_bed", 1, 1, "low", "bench", { label: "Vegetable bed" }],
    ["doghouse", 1, 1, "low", "crate"],
    ["rotary_clothesline", 1, 1, "none", "crate", { label: "Washing line" }],
    ["wheelbarrow", 1, 1, "none", "crate"],
    ["woodpile", 1, 1, "low", "crate"],
    ["bicycle", 1, 1, "none", "crate"],
  ],
  Clinic: [
    ["exam_table", 1, 1, "low", "bed"],
    ["clinic_reception", 2, 1, "low", "counter"],
    ["waiting_chairs", 2, 1, "low", "bench"],
    ["medicine_cabinet", 1, 1, "high", "shelf"],
    ["privacy_screen", 1, 1, "none", "crate"],
    ["wheelchair", 1, 1, "none", "crate"],
    ["hospital_bed", 2, 1, "low", "bed"],
    ["iv_stand", 1, 1, "none", "crate", { label: "Drip stand" }],
  ],
  Farm: [
    ["rail_fence", 2, 1, "low", "fence"],
    ["barbed_fence", 2, 1, "low", "fence"],
    ["farm_gate", 2, 1, "low", "fence"],
    ["hay_round", 1, 1, "high", "hay", { label: "Round bale" }],
    ["hay_stack", 1, 1, "low", "hay", { label: "Square bales" }],
    ["hay_feeder", 1, 1, "low", "hay"],
    ["water_trough", 1, 1, "low", "crate"],
    ["chicken_coop", 1, 1, "low", "crate"],
    [
      "stall_front",
      1,
      1,
      "none",
      "crate",
      { ...WALL, label: "Stall front (on an edge in a barn)" },
    ],
    ["saddle_rack", 1, 1, "low", "crate"],
    ["tool_rack", 1, 1, "none", "crate", { label: "Tool rack (against a wall)" }],
    ["rocking_chair", 1, 1, "none", "crate"],
    ["tractor", 2, 1, "high", "rack"],
    ["hay_wagon", 2, 1, "low", "hay"],
    ["cultivator", 1, 1, "none", "crate"],
    ["fuel_tank_farm", 1, 1, "low", "crate", { label: "Diesel tank" }],
    ["propane_tank", 2, 1, "low", "crate"],
    ["silo", 2, 2, "high", "pillar"],
    ["grain_bin", 2, 2, "high", "pillar"],
    ["windmill", 1, 1, "none", "crate"],
    ["well", 1, 1, "low", "crate"],
    ["cellar_door", 1, 1, "low", "crate", { ...WALL, label: "Cellar doors (outside a wall)" }],
    ["scarecrow", 1, 1, "none", "crate"],
    ["crop_corn", 1, 1, "none", "crate", { label: "Corn" }],
    ["crop_wheat", 1, 1, "none", "crate", { label: "Wheat" }],
    ["pumpkin_patch", 1, 1, "none", "crate"],
  ],
  "Lair, old money": [
    ["four_poster_bed", 2, 2, "low", "bed"],
    ["chesterfield", 2, 1, "low", "sofa"],
    ["wingback_chair", 1, 1, "low", "sofa"],
    ["fireplace_grand", 1, 1, "high", "pillar", { label: "Fireplace" }],
    ["grand_piano", 2, 2, "low", "counter"],
    ["bookcase", 1, 1, "high", "shelf"],
    ["chandelier", 1, 1, "none", "crate"],
    ["dining_long", 2, 1, "low", "table", { label: "Long dining table" }],
    ["portrait_gilt", 1, 1, "none", "crate", { label: "Portrait (against a wall)" }],
    ["suit_of_armour", 1, 1, "low", "crate"],
    ["grandfather_clock", 1, 1, "low", "crate"],
    ["persian_rug", 2, 2, "none", "crate"],
    ["billiard_table", 2, 1, "low", "table"],
    ["coffin_antique", 2, 1, "low", "sarcophagus", { label: "Coffin, antique" }],
  ],
  "Lair, modern": [
    ["platform_bed", 2, 2, "low", "bed"],
    ["sofa_modern", 2, 1, "low", "sofa", { label: "Sofa, low" }],
    ["lounge_chair", 1, 1, "low", "sofa"],
    ["dining_glass", 2, 1, "low", "table", { label: "Glass dining table" }],
    ["kitchen_island", 2, 1, "low", "counter", { label: "Marble kitchen island" }],
    ["media_wall", 2, 1, "none", "crate", { label: "Media wall (against a wall)" }],
    ["sculpture", 1, 1, "low", "crate"],
    ["art_canvas", 1, 1, "none", "crate", { label: "Canvas (against a wall)" }],
    ["wine_wall", 1, 1, "high", "shelf"],
    ["coffin_modern", 2, 1, "low", "sarcophagus", { label: "Coffin pod" }],
  ],
  "Lair, either": [
    ["blood_fridge", 1, 1, "high", "fridge"],
    ["feeding_chair", 1, 1, "low", "crate"],
  ],
};

/** The pieces by kind (the model's name). */
export const PIECES: Record<string, PieceDef> = {};
for (const [group, rows] of Object.entries(GROUPS))
  for (const [name, len, depth, cover, skin, extra] of rows)
    PIECES[name] = { size: [len, depth], cover, skin, group, anchor: "centre", ...extra };

/** A piece's name in the editor: its own label, or its kind in words. */
export const pieceLabel = (kind: string) =>
  PIECES[kind]?.label ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");

/** The models a piece is drawn with. */
export const pieceParts = (
  kind: string,
): readonly (readonly [string, number, number, number, number])[] =>
  PIECES[kind]?.parts ?? [[kind, 0, 0, 0, 0]];
