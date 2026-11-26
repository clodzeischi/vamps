// Vehicles as boxes over their whole footprint (two tiles across): a car, an
// SUV (taller, boxier), a truck (a cab and a cargo box), an ambulance (a
// van) and a shipping container. Blocky, like the
// rest of the battlescape; the procedural materials do the detail.
import type { Vehicle } from "../tactical/map/map";
import type { MaterialKey } from "./shaders/materials";
import { TILE, VEHICLE_H } from "./scale";

interface VehicleBox {
  key: MaterialKey;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: number;
}

/** Body colours; a truck's box is pale. */
const PAINT = [
  0x5a6f8a, 0x8a2f2f, 0xc8c4b8, 0x2f3a46, 0x6a7a52, 0x9a8a5a, 0x3a3a3c, 0x7a2a4a, 0xa8a49a,
];
const CARGO = [0xd8d4c8, 0xb8bcc0, 0xc8b890];
const TYRE = 0x1c1c1e,
  GLASS = 0x22262c;
/** Shipping container colours: rust red, blue, green, orange, grey. */
const BOX = [0x8a3a2a, 0x2f5a8a, 0x3a6a4a, 0xc8702a, 0x7a7e82];

/** The boxes for one vehicle standing on `floor` (metres, the surface's height). */
export function vehicleBoxes(v: Vehicle, floor: number): VehicleBox[] {
  const alongX = v.w > v.h;
  const L = Math.max(v.w, v.h) * TILE;
  const cx = (v.x + v.w / 2) * TILE,
    cz = (v.y + v.h / 2) * TILE;
  const out: VehicleBox[] = [];
  /** A box `a` metres along the vehicle from its middle (toward the front), `l` long, `w` wide, from `y0` to `y1` above the floor. */
  const box = (
    key: MaterialKey,
    a: number,
    l: number,
    w: number,
    y0: number,
    y1: number,
    c: number,
    side = 0,
  ) => {
    const d = a * v.front;
    out.push({
      key,
      c,
      x: cx + (alongX ? d : side),
      z: cz + (alongX ? side : d),
      y: floor + (y0 + y1) / 2,
      sx: alongX ? l : w,
      sz: alongX ? w : l,
      sy: y1 - y0,
    });
  };
  const paint = PAINT[v.paint % PAINT.length]!;
  const wheels = (width: number, axles: number[], r: number) => {
    for (const a of axles)
      for (const s of [-1, 1]) box("plain", a, r * 2, 0.32, 0, r * 2, TYRE, s * (width / 2 - 0.1));
  };
  if (v.kind === "truck") {
    const len = L - 0.5,
      width = 2.6;
    const cab = 2.3;
    const front = len / 2;
    // Cab: body, windscreen band, roof.
    box("carPaint", front - cab / 2, cab, width, 0.45, 1.6, paint);
    box("carGlass", front - cab / 2 - 0.15, cab - 0.5, width * 0.94, 1.6, 2.35, GLASS);
    box("carPaint", front - cab / 2 - 0.15, cab - 0.4, width * 0.96, 2.35, 2.6, paint);
    // Chassis and cargo box.
    box("plain", -cab / 2 + 0.1, len - cab, width * 0.7, 0.45, 0.75, 0x2a2a2c);
    box(
      "streetMetal",
      -cab / 2 - 0.05,
      len - cab - 0.2,
      width + 0.05,
      0.75,
      VEHICLE_H.truck,
      CARGO[v.paint % CARGO.length]!,
    );
    wheels(width, [front - 1.0, -len / 2 + 1.0, -len / 2 + 2.3], 0.5);
    return out;
  }
  if (v.kind === "container") {
    // A twenty-foot box, corrugated (street metal), on the ground: corner posts a shade darker.
    const c = BOX[v.paint % BOX.length]!,
      len = L - 0.1,
      width = 2.44;
    box("streetMetal", 0, len, width, 0, VEHICLE_H.container, c);
    for (const a of [len / 2 - 0.08, -len / 2 + 0.08])
      for (const sd of [-1, 1])
        box(
          "streetMetal",
          a,
          0.18,
          0.18,
          0,
          VEHICLE_H.container + 0.02,
          0x2a2a2a,
          sd * (width / 2 - 0.05),
        );
    return out;
  }
  if (v.kind === "ambulance") {
    // A van: a white box body, a windscreen up front, a red band round it, a light bar.
    const len = L - 0.4,
      width = 2.3,
      H = VEHICLE_H.ambulance;
    box("carPaint", -0.25, len - 0.5, width, 0.4, H, 0xe8e8e4);
    box("carPaint", len / 2 - 0.4, 0.8, width, 0.4, 1.25, 0xe8e8e4);
    box("carGlass", len / 2 - 0.62, 0.36, width * 0.94, 1.25, 2.0, GLASS);
    box("plain", -0.25, len - 0.48, width + 0.02, 1.05, 1.35, 0xb8202a);
    box("plain", len / 2 - 0.9, 0.5, width * 0.7, H, H + 0.16, 0x2a5ad8);
    wheels(width, [len / 2 - 0.8, -len / 2 + 0.8], 0.4);
    return out;
  }
  const suv = v.kind === "suv";
  const len = L - 0.45,
    width = suv ? 2.5 : 2.4;
  const bodyTop = suv ? 1.15 : 0.95,
    roof = VEHICLE_H[v.kind];
  // Body (a little ground clearance), then the cabin: glass under a roof,
  // set back from the front (the bonnet), longer and squarer on an SUV.
  box("carPaint", 0, len, width, suv ? 0.35 : 0.28, bodyTop, paint);
  const cabin = len * (suv ? 0.66 : 0.5),
    back = suv ? -len * 0.12 : -len * 0.08;
  box("carGlass", back, cabin, width * 0.86, bodyTop, roof - 0.08, GLASS);
  box("carPaint", back, cabin * 0.94, width * 0.88, roof - 0.08, roof, paint);
  wheels(width, [len / 2 - 0.85, -len / 2 + 0.85], suv ? 0.42 : 0.36);
  return out;
}

/**
 * The prop kit's model for a vehicle (scripts/build-props.py, "Vehicles"):
 * a car is a saloon or a hatchback, an SUV slot a pickup, a truck a box
 * lorry; each burnt out once wrecked. Null: drawn in boxes (a van, a container).
 */
export function vehicleModel(v: Vehicle): string | null {
  const base =
    v.kind === "car"
      ? Math.floor(v.paint / PAINT.length) % 2
        ? "car_hatchback"
        : "car_sedan"
      : v.kind === "suv"
        ? "pickup"
        : v.kind === "truck"
          ? "box_truck"
          : null;
  return base && (v.wrecked ? `${base}_wreck` : base);
}

/** Its body colour. */
export const vehiclePaint = (v: Vehicle) => PAINT[v.paint % PAINT.length]!;
