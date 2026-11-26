// Boxes for built-in pieces of a level: shop and warehouse fittings, flights of stairs.
import { type Flight, type Skin } from "../../tactical/map/map";
import { type MaterialKey } from "../shaders/materials";
import { HIGH_PROP, LEVEL_H, TILE } from "./scale";
import { PALETTE } from "./palette";
import { type Box } from "./LevelLayer";

/** A one-off mesh (not instanced) in a catalogue material of its own colour. */
/**
 * Shop and warehouse fittings: shelving with goods on its shelves, pallet
 * racking with boxes, a fridge with a dark glass door, a fuel pump.
 */
export function highProp(
  skin: Skin,
  x: number,
  z: number,
  y0: number,
  propOf: (k: Skin) => Box[],
  to: (k: MaterialKey) => Box[],
) {
  const { h, s } = HIGH_PROP[skin]!;
  const box = (k: MaterialKey, y: number, sy: number, sx: number, sz: number, c: number) =>
    to(k).push({ x, y: y0 + y + sy / 2, z, sx, sy, sz, c });
  if (skin === "shelf" || skin === "rack") {
    // Open shelving: corner uprights, boards, and goods on every board in a colour per board and tile.
    const shelves = skin === "rack" ? 3 : 4,
      post = 0.07,
      frame = PALETTE[skin];
    for (const ox of [-1, 1])
      for (const oz of [-1, 1])
        propOf(skin).push({
          x: x + ox * (s / 2 - post / 2),
          y: y0 + h / 2,
          z: z + oz * (s / 2 - post / 2),
          sx: post,
          sy: h,
          sz: post,
          c: frame,
        });
    const goods =
      skin === "rack"
        ? [0xb89a6a, 0xa88a5a, 0xc8b08a, 0x8a9aa8]
        : [0xd84a3a, 0x3a8ad8, 0xe8c84a, 0x4ab86a, 0xe88a3a, 0xd8d8d0];
    const step = (h - 0.1) / shelves;
    for (let i = 0; i <= shelves; i++)
      box("streetMetal", 0.08 + i * step - 0.03, 0.04, s, s, frame);
    for (let i = 0; i < shelves; i++) {
      const c = goods[Math.abs(Math.round(x * 7 + z * 13 + i * 5)) % goods.length]!;
      box(
        skin === "rack" ? "crate" : "plain",
        0.1 + i * step,
        step * (0.55 + 0.25 * (((x * 3 + z * 5 + i) % 3) / 2)),
        s * 0.86,
        s * 0.8,
        c,
      );
    }
  } else if (skin === "fridge") {
    propOf(skin).push({ x, y: y0 + h / 2, z, sx: s, sy: h, sz: s, c: PALETTE.fridge });
    box("carGlass", 0.2, h - 0.45, s * 1.02, s * 0.7, 0x2a3a44);
  } else if (skin === "pump") {
    box("plain", 0, 0.2, s * 1.6, s * 1.6, 0x8a8a86);
    propOf(skin).push({
      x,
      y: y0 + 0.2 + (h - 0.2) / 2,
      z,
      sx: s,
      sy: h - 0.2,
      sz: s * 1.3,
      c: PALETTE.pump,
    });
    box("plain", h - 0.5, 0.35, s * 1.04, s * 1.34, 0xe8e8e0);
  }
}

/**
 * A flight of stairs: solid steps from its foot up to the next floor
 * (concrete outdoors, wood indoors), 4 to a tile; outdoors, a metal
 * handrail along each side.
 */
export function flight(f: Flight, floorY: number, propOf: (skin: Skin) => Box[]) {
  const skin: Skin = f.kind === "outdoor" ? "concrete" : "wood";
  const along = f.dx ? f.w : f.h,
    across = (f.dx ? f.h : f.w) * TILE;
  const n = along * 4,
    tread = (along * TILE) / n,
    rise = LEVEL_H / n;
  // The flight's middle line, from its bottom edge toward its top.
  const cx = (f.x + f.w / 2) * TILE,
    cz = (f.y + f.h / 2) * TILE;
  const bx = cx - (f.dx * along * TILE) / 2,
    bz = cz - (f.dy * along * TILE) / 2;
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * rise,
      d = (i + 0.5) * tread;
    propOf(skin).push({
      x: bx + f.dx * d,
      y: floorY + h / 2,
      z: bz + f.dy * d,
      sx: f.dx ? tread : across,
      sy: h,
      sz: f.dy ? tread : across,
      c: PALETTE[skin],
    });
  }
  if (f.kind !== "outdoor") return;
  // Handrails: a post at each end of each side, one rail between them sloped with the flight.
  const railH = 0.9,
    run = along * TILE - 0.2,
    slope = Math.atan2(LEVEL_H, along * TILE),
    len = Math.hypot(run, run * Math.tan(slope));
  for (const side of [-1, 1]) {
    const ox = f.dy * side * (across / 2 - 0.06),
      oz = -f.dx * side * (across / 2 - 0.06);
    // Each post stands on the floor at its end and reaches up to the rail.
    for (const [d, h] of [
      [0.1, 0],
      [along * TILE - 0.1, LEVEL_H],
    ] as const) {
      const top = railH + (LEVEL_H * d) / (along * TILE),
        sy = top - h;
      propOf("metal").push({
        x: bx + f.dx * d + ox,
        y: floorY + h + sy / 2,
        z: bz + f.dy * d + oz,
        sx: 0.05,
        sy,
        sz: 0.05,
        c: PALETTE.metal,
      });
    }
    // Rising toward +x is a turn about z by +slope; toward +z (y on the map), about x by -slope.
    const d = (along * TILE) / 2;
    propOf("metal").push({
      x: bx + f.dx * d + ox,
      y: floorY + LEVEL_H / 2 + railH,
      z: bz + f.dy * d + oz,
      sx: f.dx ? len : 0.05,
      sy: 0.05,
      sz: f.dy ? len : 0.05,
      c: PALETTE.metal,
      rz: f.dx ? f.dx * slope : 0,
      rx: f.dy ? -f.dy * slope : 0,
    });
  }
}
