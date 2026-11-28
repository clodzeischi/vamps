// Doors, built from boxes: a plain door (one leaf, hinged, swung into the
// room when open), a roller door (a slatted steel curtain that rolls up into
// a drum over the opening) and a glass sliding door (fixed panes either
// side, the sliding ones drawn apart over them). Roller and sliding doors
// are one or two tiles wide (map.ts, doorUnit).
//
// Each is drawn in the door's own frame: u across the doorway (from its
// start), v up from the floor, t through the wall (toward the room +). The
// frame is axis-aligned in the world, so every part stays an upright box.
import type { MaterialKey } from "../shaders/materials";
import type { Box } from "./LevelLayer";

/** Where a door stands: its start corner on the grid line, and which world axes u and t run along. */
export interface DoorFrame {
  /** World x, z of the doorway's start (u = 0) on the wall's centre line (t = 0). */
  x: number;
  z: number;
  /** The floor's height. */
  y: number;
  /** u runs along world x ("x") or world z ("y"). */
  along: "x" | "y";
  /** +1 if the room lies toward +t's world direction, else −1 (t is then flipped). */
  room: 1 | -1;
}

export interface DoorLook {
  /** Doorway width (metres) and the leaf's height (under the lintel). */
  width: number;
  height: number;
  /** The colour of the wall it stands in (the infill round a narrow leaf). */
  wallColour: number;
  open: boolean;
  /** Broken (blown in, shot out): the frame stays, the door is gone. */
  broken: boolean;
  /** A small number from the door's place, for its colour. */
  pick: number;
}

type Sink = (key: MaterialKey) => Box[];

/** One box in door space: u0…u1 across, v0…v1 up, t0…t1 through (room +). */
function part(
  f: DoorFrame,
  into: Box[],
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  t0: number,
  t1: number,
  c: number,
  swung = false,
) {
  // Swung: the leaf turned a quarter about its hinge (u = 0), standing into the room.
  // (Clear of the jamb and the wall's room face.)
  const [a0, a1, b0, b1] = swung ? [0.03 - t1, 0.03 - t0, u0 + 0.09, u1 + 0.09] : [u0, u1, t0, t1];
  const ua = (a0 + a1) / 2,
    tb = ((b0 + b1) / 2) * f.room;
  const su = a1 - a0,
    st = b1 - b0;
  const along = f.along === "x";
  into.push({
    x: f.x + (along ? ua : tb),
    y: f.y + (v0 + v1) / 2,
    z: f.z + (along ? tb : ua),
    sx: along ? su : st,
    sy: v1 - v0,
    sz: along ? st : su,
    c,
  });
}

const TRIM = 0xe6e1d6;
const WOOD_DOORS = [0x5a3a26, 0x6b4a2e, 0x2f4a3a, 0x7a2e2a, 0x2c3b52];
const STEEL = 0x7d858c;
const ROLLER = [0xaab0b4, 0x9aa2a6, 0x3e5a48, 0x7a3a30, 0x4a5a6a];
const ALU = 0xb9bec2;
const BRASS = 0xb08a3a;

/** A plain door: wall either side of a ~0.95 m leaf, a painted casing, the leaf with panels and a handle. */
export function plainDoor(f: DoorFrame, d: DoorLook, to: Sink, wall: Box[], steel: boolean) {
  const W = d.width,
    H = d.height,
    leafW = 0.95;
  const s0 = (W - leafW) / 2,
    s1 = s0 + leafW;
  const wt = 0.075; // half the wall
  part(f, wall, 0, s0, 0, H, -wt, wt, d.wallColour);
  part(f, wall, s1, W, 0, H, -wt, wt, d.wallColour);
  // The casing: jambs and head, proud of the wall on both faces.
  const trim = to("furniture"),
    tc = steel ? STEEL : TRIM,
    cw = 0.07;
  part(f, trim, s0 - cw, s0, 0, H + cw, -wt - 0.02, wt + 0.02, tc);
  part(f, trim, s1, s1 + cw, 0, H + cw, -wt - 0.02, wt + 0.02, tc);
  part(f, trim, s0 - cw, s1 + cw, H, H + cw, -wt - 0.02, wt + 0.02, tc);
  if (d.broken) return;
  // The leaf, hinged at s0 (shut: in the frame; open: turned into the room).
  const leafC = steel ? STEEL : WOOD_DOORS[d.pick % WOOD_DOORS.length]!;
  const lf: DoorFrame = shift(f, s0 + 0.01);
  const lw = leafW - 0.02,
    lh = H - 0.02,
    th = 0.045;
  const open = d.open;
  const leafBox = steel ? to("streetMetal") : to("furniture");
  part(lf, leafBox, 0, lw, 0.01, lh, -th / 2, th / 2, leafC, open);
  // Panels (wood) or a kick plate and a vision strip (steel), on both faces.
  for (const sgn of [-1, 1]) {
    const t0 = sgn * (th / 2),
      t1 = t0 + sgn * 0.012;
    const [ta, tb] = sgn < 0 ? [t1, t0] : [t0, t1];
    if (steel) {
      part(lf, leafBox, 0.06, lw - 0.06, 0.05, 0.3, ta, tb, 0x6a7178, open);
    } else
      for (const [v0, v1] of [
        [0.12, 0.85],
        [1.0, lh - 0.14],
      ] as const)
        for (const [u0, u1] of [
          [0.1, lw / 2 - 0.05],
          [lw / 2 + 0.05, lw - 0.1],
        ] as const)
          part(lf, leafBox, u0, u1, v0, v1, ta, tb, shade(leafC, 1.12), open);
    // The handle, on the side away from the hinge.
    const ht0 = sgn * (th / 2 + 0.012),
      ht1 = ht0 + sgn * 0.05;
    part(
      lf,
      to("streetMetal"),
      lw - 0.14,
      lw - 0.06,
      0.98,
      1.04,
      Math.min(ht0, ht1),
      Math.max(ht0, ht1),
      steel ? 0x9aa2aa : BRASS,
      open,
    );
  }
}

/** A roller door: steel guides each side, the slatted curtain down (shut) or rolled into its drum (open). */
export function rollerDoor(f: DoorFrame, d: DoorLook, to: Sink) {
  const W = d.width,
    H = d.height;
  const metal = to("streetMetal");
  const c = ROLLER[d.pick % ROLLER.length]!;
  const g = 0.08;
  // Guides, and the drum's housing on the room side under the lintel.
  part(f, metal, 0, g, 0, H, -0.08, 0.1, STEEL);
  part(f, metal, W - g, W, 0, H, -0.08, 0.1, STEEL);
  part(f, metal, g, W - g, H - 0.42, H, 0.08, 0.5, shade(c, 0.85));
  if (d.broken) return;
  if (d.open) {
    // Rolled up: only the bottom bar shows, under the head.
    part(f, metal, g, W - g, H - 0.1, H, -0.03, 0.05, shade(c, 0.6));
    return;
  }
  // The curtain: ribbed slats, a darker bottom bar.
  const slat = 0.1;
  for (let v = 0.08, i = 0; v < H - 0.01; v += slat, i++)
    part(
      f,
      metal,
      g,
      W - g,
      v,
      Math.min(H, v + slat - 0.012),
      -0.025,
      0.025,
      shade(c, i % 2 ? 0.94 : 1.02),
    );
  part(f, metal, g, W - g, 0, 0.08, -0.035, 0.035, shade(c, 0.55));
}

/** A glass sliding door: an aluminium frame, fixed panes at the ends, the sliders between (shut) or drawn over the fixed ones (open). */
export function slidingDoor(f: DoorFrame, d: DoorLook, to: Sink, glass: Box[]) {
  const W = d.width,
    H = d.height;
  const alu = to("streetMetal");
  const fw = 0.07;
  part(f, alu, 0, fw, 0, H, -0.07, 0.07, ALU);
  part(f, alu, W - fw, W, 0, H, -0.07, 0.07, ALU);
  part(f, alu, 0, W, H - 0.12, H, -0.07, 0.07, ALU);
  part(f, alu, fw, W - fw, 0, 0.03, -0.07, 0.07, 0x50565a);
  if (d.broken) return;
  const inner = W - 2 * fw;
  // Two panes a tile: in a 2-wide door, fixed – slider – slider – fixed; in a 1-wide one, fixed – slider.
  const n = W > 2 ? 4 : 2;
  const pw = inner / n;
  const pane = (u0: number, t: number) => {
    const u1 = u0 + pw,
      v0 = 0.03,
      v1 = H - 0.12,
      s = 0.045;
    part(f, alu, u0, u0 + s, v0, v1, t - 0.025, t + 0.025, ALU);
    part(f, alu, u1 - s, u1, v0, v1, t - 0.025, t + 0.025, ALU);
    part(f, alu, u0, u1, v0, v0 + 0.1, t - 0.025, t + 0.025, ALU);
    part(f, alu, u0, u1, v1 - 0.05, v1, t - 0.025, t + 0.025, ALU);
    part(f, glass, u0 + s, u1 - s, v0 + 0.1, v1 - 0.05, t - 0.006, t + 0.006, 0);
  };
  // Fixed panes on the street side, sliders a little into the room.
  pane(fw, -0.03);
  if (n === 4) pane(W - fw - pw, -0.03);
  const slide = d.open ? pw * 0.92 : 0;
  if (n === 4) {
    pane(fw + pw - slide, 0.03);
    pane(fw + 2 * pw + slide, 0.03);
  } else pane(fw + pw - slide, 0.03);
}

/** The same frame, its start moved `du` along u. */
function shift(f: DoorFrame, du: number): DoorFrame {
  return f.along === "x" ? { ...f, x: f.x + du } : { ...f, z: f.z + du };
}

function shade(hex: number, k: number) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)),
    g = Math.min(255, Math.round(((hex >> 8) & 255) * k)),
    b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}
