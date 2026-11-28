# Builds the battlescape prop kit: one .blend with every prop as its own
# object, all sharing one palette material (docs/design/tooling.md, "Props").
#
# The rule each prop follows (scripts/export-props.py exports them all):
#   * 1 Blender metre = 1 game metre. Z up, the front faces -Y.
#   * Grid: a tile is 1.5 m, a level 2.5 m (slab 0.1), walls 0.15 thick on
#     tile edges; a window's sill at 0.9 and its head at 2.1; a door 2.0 high.
#   * The origin is the anchor:
#       - edge pieces (windows, doors, plinth, band, cornice, downpipe,
#         awning, AC unit, wall lamp): the centre of the tile edge at the
#         level's floor, running along X, the street (outside) toward -Y;
#       - corner pieces (quoins, *_corner): where the two wall centre lines
#         meet; the building lies toward +X +Y;
#       - door leaves: the hinge at floor level, the leaf toward +X;
#       - everything else: the centre of its footprint on the floor.
#   * One material, "Props": a palette of 8 x 8 swatches. Each face's UVs sit
#     on one swatch's centre, so a face takes that swatch's colour, roughness,
#     metalness and glow. Recolour a part by moving its UVs to another swatch.
#
# /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-props.py -- \
#   ~/Documents/Blends/Vamps/battlescape/props.blend public/assets/props [preview-dir]
import math, os, sys
import bpy, bmesh
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
BLEND = os.path.expanduser(args[0])
TEX_DIR = os.path.abspath(args[1])
PREVIEW = os.path.abspath(args[2]) if len(args) > 2 else None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_kit import Kit, make_images, make_material  # noqa: E402

# ---------------------------------------------------------------- the props
TILE, LEVEL, SLAB, WT = 1.5, 2.5, .1, .15
H = TILE / 2      # half a tile
WF = WT / 2       # a wall face, either side of the edge line
SILL, WIN_TOP, DOOR_TOP = .9, 2.1, 2.0

PROPS = {}  # group -> list of (name, builder)


def prop(group):
    def deco(fn):
        PROPS.setdefault(group, []).append((fn.__name__, fn))
        return fn
    return deco


# ----- Architecture: edge and corner pieces
@prop("architecture")
def window_casement(k):
    """Wooden casement: mullion and transom, stone sill outside, board inside."""
    f = .07
    k.box("oak", -H, -.04, SILL, -H + f, .04, WIN_TOP)
    k.box("oak", H - f, -.04, SILL, H, .04, WIN_TOP)
    k.box("oak", -H + f, -.04, WIN_TOP - f, H - f, .04, WIN_TOP)
    k.box("oak", -H + f, -.04, SILL, H - f, .04, SILL + f)
    k.box("oak", -.035, -.04, SILL + f, .035, .04, WIN_TOP - f)
    k.box("oak", -H + f, -.035, 1.74, H - f, .035, 1.8)
    k.box("limestone", -H - .06, -.14, SILL - .07, H + .06, -WF + .01, SILL)
    k.box("paint_white", -H, WF - .01, SILL - .03, H, .12, SILL + .01)


@prop("architecture")
def window_modern(k):
    """Aluminium frame, two lights, a thin pressed sill."""
    f = .05
    k.box("aluminium", -H, -.03, SILL, -H + f, .03, WIN_TOP)
    k.box("aluminium", H - f, -.03, SILL, H, .03, WIN_TOP)
    k.box("aluminium", -H + f, -.03, WIN_TOP - f, H - f, .03, WIN_TOP)
    k.box("aluminium", -H + f, -.03, SILL, H - f, .03, SILL + f)
    k.box("aluminium", -.03, -.035, SILL + f, .03, .035, WIN_TOP - f)
    k.box("aluminium", -H - .02, -.12, SILL - .02, H + .02, -WF + .01, SILL)
    k.box("plaster", -H, WF - .01, SILL - .03, H, .1, SILL + .01)


@prop("architecture")
def window_blinds(k):
    """Venetian blinds half drawn, hung just inside a window frame."""
    top, bottom = WIN_TOP - .07, 1.35
    k.box("plastic_beige", -H + .07, .045, top - .04, H - .07, .075, top)
    z = top - .06
    while z > bottom:
        k.box("plastic_beige", -H + .08, .05, z - .028, H - .08, .07, z)
        z -= .055
    k.box("aluminium", -H + .08, .045, z - .02, H - .08, .075, z + .005)


@prop("architecture")
def door_frame(k):
    """Jambs, head and architraves round a doorway; a stone threshold."""
    k.box("paint_white", -H, -WF, 0, -H + .05, WF, DOOR_TOP)
    k.box("paint_white", H - .05, -WF, 0, H, WF, DOOR_TOP)
    k.box("paint_white", -H, -WF, DOOR_TOP - .05, H, WF, DOOR_TOP)
    for s in (-1, 1):
        y0, y1 = sorted((s * WF, s * (WF + .02)))
        k.box("paint_white", -H - .08, y0, 0, -H + .05, y1, DOOR_TOP + .07)
        k.box("paint_white", H - .05, y0, 0, H + .08, y1, DOOR_TOP + .07)
        k.box("paint_white", -H - .08, y0, DOOR_TOP, H + .08, y1, DOOR_TOP + .07)
    k.box("limestone", -H + .05, -WF - .02, 0, H - .05, WF + .02, .02)


LEAF_W, LEAF_H, LEAF_T = .695, 1.94, .044


@prop("architecture")
def door_wood(k):
    """A panelled leaf; two hang in a doorway (hinge at the origin)."""
    w, t = LEAF_W, LEAF_T / 2
    k.box("walnut", 0, -t, .01, w, t, .01 + LEAF_H)
    for s in (-1, 1):
        y0, y1 = sorted((s * t, s * (t + .01)))
        k.box("oak", .1, y0, 1.05, w - .1, y1, 1.85)
        k.box("oak", .1, y0, .12, w - .1, y1, .9)
        y0, y1 = sorted((s * t, s * (t + .05)))
        k.box("brass", w - .1, y0, .97, w - .08, y1, 1.01)
        k.box("brass", w - .16, s * (t + .05) - .01, .975, w - .08, s * (t + .05) + .01, 1.005)


@prop("architecture")
def door_steel(k):
    """A steel leaf: kick plates, a wired vision panel, a push bar inside."""
    w, t = LEAF_W, LEAF_T / 2
    k.box("enamel_grey", 0, -t, .01, w, t, .01 + LEAF_H)
    for s in (-1, 1):
        y0, y1 = sorted((s * t, s * (t + .004)))
        k.box("steel", .03, y0, .02, w - .03, y1, .3)
        k.box("glass_dark", .25, y0, 1.3, .45, y1, 1.75)
    k.box("chrome", .1, t + .02, .98, w - .06, t + .06, 1.02)
    k.box("enamel_grey", .1, t, .97, .14, t + .04, 1.03)
    k.box("enamel_grey", w - .1, t, .97, w - .06, t + .04, 1.03)
    k.box("steel", w - .1, -t - .05, .97, w - .08, -t, 1.01)
    k.box("steel", w - .16, -t - .06, .975, w - .08, -t - .04, 1.005)


@prop("architecture")
def plinth(k):
    """Foundation course along the foot of an outside wall."""
    k.box("concrete_dark", -H, -WF - .04, 0, H, -WF + .01, .42)
    k.box("concrete_dark", -H, -WF - .02, .42, H, -WF + .01, .45)


@prop("architecture")
def plinth_corner(k):
    k.box("concrete_dark", -WF - .04, -WF - .04, 0, -WF + .01, -WF + .01, .42)
    k.box("concrete_dark", -WF - .02, -WF - .02, .42, -WF + .01, -WF + .01, .45)


@prop("architecture")
def band_course(k):
    """A string course at the floor line between two levels (origin at the lower floor)."""
    k.box("limestone", -H, -WF - .035, LEVEL - .14, H, -WF + .01, LEVEL + .05)
    k.box("limestone", -H, -WF - .05, LEVEL - .02, H, -WF + .01, LEVEL + .05)


@prop("architecture")
def band_corner(k):
    k.box("limestone", -WF - .035, -WF - .035, LEVEL - .14, -WF + .01, -WF + .01, LEVEL + .05)
    k.box("limestone", -WF - .05, -WF - .05, LEVEL - .02, -WF + .01, -WF + .01, LEVEL + .05)


@prop("architecture")
def cornice(k):
    """Coping on a parapet or eaves (origin on top of the wall)."""
    k.box("limestone", -H, -WF - .065, 0, H, WF + .035, .07)
    k.box("limestone", -H, -WF - .035, -.07, H, WF + .01, 0)


@prop("architecture")
def cornice_corner(k):
    k.box("limestone", -WF - .065, -WF - .065, 0, -WF, -WF, .07)
    k.box("limestone", -WF - .035, -WF - .035, -.07, -WF, -WF, 0)


@prop("architecture")
def quoins(k):
    """Dressed stone blocks up an outside corner, one level high, long and short in turn."""
    z, i = 0.0, 0
    while z < LEVEL - .01:
        a, b = (.42, .22) if i % 2 == 0 else (.22, .42)
        k.box("limestone", -WF - .025, -WF - .025, z + .012, a, -WF + .02, z + .238)
        k.box("limestone", -WF - .025, -WF - .025, z + .012, -WF + .02, b, z + .238)
        z += .25
        i += 1


@prop("architecture")
def downpipe(k):
    """One level of rainwater pipe with two brackets."""
    y = -WF - .07
    k.cyl("iron", (0, y, 0), (0, y, LEVEL), .045)
    for z in (.6, 1.9):
        k.box("iron", -.06, y - .05, z, .06, -WF, z + .04)


@prop("architecture")
def gutter(k):
    """Eaves gutter with a hopper head and a pipe stub (origin on top of the wall)."""
    k.box("iron", -H, -WF - .17, -.12, H, -WF - .02, -.04)
    k.box("iron", -.12, -WF - .17, -.36, .12, -WF - .02, -.12)
    k.cyl("iron", (0, -WF - .07, -.7), (0, -WF - .07, -.36), .045)


@prop("architecture")
def awning(k):
    """Striped shop awning on two arms over a door or window."""
    back, front = -WF, -WF - .85
    zb, zf = 2.4, 2.02
    n = 6
    for i in range(n):
        x0, x1 = -H + i * TILE / n, -H + (i + 1) * TILE / n
        sw = "canvas_red" if i % 2 == 0 else "canvas_white"
        k.hull(sw, [(x0, back, zb), (x1, back, zb), (x1, front, zf), (x0, front, zf),
                    (x0, back, zb + .02), (x1, back, zb + .02), (x1, front, zf + .02), (x0, front, zf + .02)])
        k.box(sw, x0, front - .02, zf - .16, x1, front, zf + .02)
    k.box("black_paint", -H, back - .05, zb - .02, H, back, zb + .06)
    for x in (-H + .06, H - .06):
        k.cyl("galvanised", (x, back, 1.75), (x, front + .02, zf), .015, segs=6)


@prop("architecture")
def ac_unit(k):
    """Outdoor air-conditioning unit on wall brackets."""
    y0, y1 = -WF - .35, -WF - .03
    k.box("enamel_white", -.4, y0, 1.78, .4, y1, 2.3)
    k.cyl("plastic_black", (-.12, y0 - .006, 2.04), (-.12, y0, 2.04), .2, segs=12, smooth=False)
    k.cyl("enamel_grey", (-.12, y0 - .012, 2.04), (-.12, y0 - .006, 2.04), .05, segs=8, smooth=False)
    k.box("plastic_grey", .14, y0 - .005, 1.84, .34, y0, 2.24)
    for x in (-.3, .3):
        k.box("galvanised", x - .02, y0 - .03, 1.75, x + .02, -WF, 1.78)
        k.cyl("galvanised", (x, -WF, 1.45), (x, y0 + .05, 1.76), .015, segs=6)
    k.cyl("copper", (.4, -.25, 1.9), (.48, -.25, 1.9), .015, segs=6)
    k.cyl("copper", (.48, -.25, 1.9), (.48, -WF, 1.9), .015, segs=6)


@prop("architecture")
def wall_lamp(k):
    """A bracket lantern over a door."""
    k.box("black_paint", -.06, -WF - .01, 2.2, .06, -WF, 2.36)
    k.box("black_paint", -.015, -WF - .26, 2.28, .015, -WF, 2.31)
    y = -WF - .29
    k.box("lamp_warm", -.08, y - .08, 2.0, .08, y + .08, 2.22)
    k.box("black_paint", -.1, y - .1, 1.98, .1, y + .1, 2.0)
    k.cyl("black_paint", (0, y, 2.22), (0, y, 2.33), .14, .02, segs=4, smooth=False, rot=math.pi / 4)


# ----- Street
@prop("street")
def street_lamp(k):
    k.cyl("black_paint", (0, 0, 0), (0, 0, .45), .14, .12, segs=8)
    k.cyl("black_paint", (0, 0, .45), (0, 0, 3.7), .075, .055, segs=8)
    k.cyl("black_paint", (0, 0, 3.55), (0, -.8, 3.68), .035, segs=6)
    k.box("black_paint", -.14, -1.27, 3.62, .14, -.75, 3.75)
    k.box("lamp_warm", -.11, -1.24, 3.6, .11, -.78, 3.62)


@prop("street")
def bollard(k):
    k.cyl("black_paint", (0, 0, 0), (0, 0, .85), .1)
    k.cyl("black_paint", (0, 0, .85), (0, 0, .92), .1, .06)
    k.cyl("safety_yellow", (0, 0, .7), (0, 0, .76), .102)


@prop("street")
def bench(k):
    for y in (-.17, -.03, .11):
        k.box("oak", -.7, y - .055, .42, .7, y + .055, .455)
    for z in (.55, .7):
        k.box("oak", -.7, .19, z, .7, .225, z + .1)
    for x in (-.6, .6):
        k.box("iron", x - .02, -.2, 0, x + .02, -.16, .42)
        k.box("iron", x - .02, .2, 0, x + .02, .24, .82)
        k.box("iron", x - .02, -.22, .38, x + .02, .22, .42)
        k.box("iron", x - .025, -.22, .62, x + .025, .2, .65)
        k.box("iron", x - .02, -.21, .42, x + .02, -.17, .62)


@prop("street")
def litter_bin(k):
    k.cyl("bin_green", (0, 0, .04), (0, 0, .8), .24, segs=10)
    k.cyl("black_paint", (0, 0, 0), (0, 0, .04), .2, segs=10)
    k.cyl("black_paint", (0, 0, .8), (0, 0, .86), .26, segs=10)
    k.cyl("rubber", (0, 0, .86), (0, 0, .865), .17, segs=10, smooth=False)


@prop("street")
def dumpster(k):
    k.box("bin_green", -.7, -.45, .15, .7, .45, 1.08)
    k.box("galvanised", -.72, -.47, 1.04, .72, .47, 1.1)
    k.box("plastic_black", -.7, -.46, 1.1, 0, .48, 1.14)
    # The other lid propped up a little.
    k.hull("plastic_black", [(0, .48, 1.1), (.7, .48, 1.1), (.7, -.44, 1.28), (0, -.44, 1.28),
                             (0, .48, 1.14), (.7, .48, 1.14), (.7, -.44, 1.32), (0, -.44, 1.32)])
    for x in (-.35, .35):
        k.box("bin_green", x - .04, -.47, .2, x + .04, -.45, 1.0)
    for x in (-.74, .7):
        k.box("galvanised", x, -.2, .75, x + .04, .2, .8)
    for x in (-.58, .58):
        for y in (-.33, .33):
            k.box("galvanised", x - .04, y - .03, .1, x + .04, y + .03, .15)
            k.cyl("rubber", (x - .025, y, .07), (x + .025, y, .07), .07, segs=8)


@prop("street")
def jersey_barrier(k):
    k.extrude_x("concrete", -.72, .72, [(-.3, 0), (.3, 0), (.3, .08), (.1, .33), (.075, .8), (-.075, .8), (-.1, .33), (-.3, .08)])


@prop("street")
def utility_pole(k):
    k.cyl("weathered", (0, 0, 0), (0, 0, 8), .14, .11)
    k.box("weathered", -.9, -.05, 7.4, .9, .05, 7.5)
    for x in (-.55, .55):
        k.cyl("galvanised", (0, .07, 6.9), (x, .07, 7.4), .018, segs=4)
    for x in (-.8, -.4, .4, .8):
        k.cyl("ceramic", (x, 0, 7.5), (x, 0, 7.66), .045, .03, segs=6)
    k.box("galvanised", -.06, -.25, 6.2, .06, -.1, 6.3)
    k.cyl("enamel_grey", (0, -.42, 5.85), (0, -.42, 6.55), .24, segs=10)
    k.cyl("enamel_grey", (0, -.42, 6.55), (0, -.42, 6.65), .24, .18, segs=10)
    k.cyl("ceramic", (.1, -.42, 6.65), (.1, -.42, 6.8), .03, segs=6)


@prop("street")
def utility_cabinet(k):
    k.box("concrete", -.45, -.22, 0, .45, .22, .1)
    k.box("bin_green", -.4, -.18, .1, .4, .18, 1.3)
    k.box("bin_green", -.43, -.21, 1.3, .43, .21, 1.35)
    k.box("black_paint", -.004, -.186, .15, .004, -.18, 1.25)
    k.box("chrome", .03, -.195, .7, .05, -.18, .78)
    for z in (.3, .4, .5):
        k.box("black_paint", .4, -.1, z, .405, .1, z + .03)
        k.box("black_paint", -.405, -.1, z, -.4, .1, z + .03)


@prop("street")
def manhole(k):
    k.cyl("concrete_dark", (0, 0, 0), (0, 0, .012), .38, segs=12, smooth=False)
    k.cyl("iron", (0, 0, 0), (0, 0, .02), .32, segs=12, smooth=False)
    for i in range(-2, 3):
        w = math.sqrt(max(.3 ** 2 - (i * .1) ** 2, 0)) - .02
        k.box("rust", -w, i * .1 - .015, .02, w, i * .1 + .015, .026)


@prop("street")
def drain_grate(k):
    k.box("rubber", -.33, -.18, 0, .33, .18, .006)
    k.box("iron", -.36, -.21, 0, .36, -.18, .02)
    k.box("iron", -.36, .18, 0, .36, .21, .02)
    for i in range(8):
        x = -.33 + .035 + i * .085
        k.box("iron", x - .015, -.18, 0, x + .015, .18, .02)


@prop("street")
def planter(k):
    k.box("concrete", -.6, -.6, 0, .6, .6, .5)
    k.box("soil", -.52, -.52, .5, .52, .52, .505)
    k.box("concrete", -.6, -.6, .5, .6, -.52, .56)
    k.box("concrete", -.6, .52, .5, .6, .6, .56)
    k.box("concrete", -.6, -.52, .5, -.52, .52, .56)
    k.box("concrete", .52, -.52, .5, .6, .52, .56)
    k.blob("foliage", (0, 0, .85), .45, .8)
    k.blob("foliage_light", (.18, -.12, 1.05), .28, .9)


@prop("street")
def concrete_barrier(k):
    """Two precast sections end to end over 2 x 1 tiles (3 m along X): a safety-shaped profile on feet with lifting slots, reflectors each side."""
    top = [(-.28, .1), (.28, .1), (.1, .32), (.08, .82), (-.08, .82), (-.1, .32)]
    for x0, x1 in ((-1.46, -.02), (.02, 1.46)):
        k.extrude_x("concrete", x0, x1, top)
        mid = (x0 + x1) / 2
        for a, b in ((x0, x0 + .3), (mid - .22, mid + .22), (x1 - .3, x1)):
            k.box("concrete", a, -.28, 0, b, .28, .1)
        k.box("concrete_dark", mid - .5, -.08, .82, mid + .5, .08, .835)
        for y in (-.09, .085):
            for x in (x0 + .25, x1 - .25):
                k.box("safety_yellow", x - .06, y, .6, x + .06, y + .005, .68)


@prop("street")
def railing_low(k):
    """A pedestrian guard rail over 2 x 1 tiles (3 m along X): three posts, top and bottom rails, close bars between."""
    for x in (-1.45, 0, 1.45):
        k.cyl("galvanised", (x, 0, 0), (x, 0, 1.02), .035, segs=8)
        k.cyl("galvanised", (x, 0, 1.02), (x, 0, 1.05), .035, .02, segs=8)
    for z in (.2, .98):
        k.cyl("galvanised", (-1.45, 0, z), (1.45, 0, z), .022, segs=6)
    n = 18
    for half in (-1, 1):
        for i in range(1, n):
            x = half * (i * 1.45 / n)
            k.box("galvanised", x - .009, -.009, .2, x + .009, .009, .98)


@prop("street")
def stop_sign(k):
    """A stop sign on a post, its origin the post's foot (a grid corner, where four tiles meet); the face toward -Y."""
    k.cyl("galvanised", (0, 0, 0), (0, 0, 2.75), .03, segs=8)
    k.cyl("galvanised", (0, 0, 2.75), (0, 0, 2.77), .03, .01, segs=8)
    c, r = 2.35, .37
    k.cyl("galvanised", (0, -.032, c), (0, -.045, c), r, segs=8, smooth=False, rot=math.pi / 8)
    k.cyl("enamel_white", (0, -.045, c), (0, -.05, c), r - .005, segs=8, smooth=False, rot=math.pi / 8)
    k.cyl("signal_red", (0, -.05, c), (0, -.056, c), r - .04, segs=8, smooth=False, rot=math.pi / 8)
    # STOP: four white blocks for the letters.
    for i in range(4):
        x = -.21 + i * .14
        k.box("enamel_white", x - .04, -.06, c - .08, x + .04, -.056, c + .08)
    for z in (c - .2, c + .2):
        k.box("galvanised", -.04, -.04, z - .02, .04, .03, z + .02)


@prop("street")
def crate(k):
    """Wooden crate: battens on every edge, a brace across each side, steel corners."""
    s = .425
    k.box("pine", -s + .01, -s + .01, .01, s - .01, s - .01, 2 * s - .01)
    b = .035
    for x in (-s, s):
        for y in (-s, s):
            k.box("oak", x - b, y - b, 0, x + b, y + b, 2 * s)
    for z in (0, 2 * s):
        for y in (-s, s):
            k.box("oak", -s, y - b, max(z - b, 0), s, y + b, min(z + b, 2 * s))
        for x in (-s, s):
            k.box("oak", x - b, -s, max(z - b, 0), x + b, s, min(z + b, 2 * s))
    o = s + .012
    for p0, p1 in ((((-s, -o, .05)), (s, -o, 2 * s - .05)), ((-s, o, .05), (s, o, 2 * s - .05)),
                   ((-o, -s, .05), (-o, s, 2 * s - .05)), ((o, -s, .05), (o, s, 2 * s - .05))):
        k.cyl("oak", p0, p1, .03, segs=4, smooth=False, rot=math.pi / 4)
    c = .05
    for x in (-s, s):
        for y in (-s, s):
            for z in (0, 2 * s):
                zz = min(max(z, c), 2 * s - c)
                k.box("steel", x - c, y - c, zz - c, x + c, y + c, zz + c)


@prop("street")
def pallet(k):
    for y in (-.45, 0, .45):
        k.box("pallet", -.6, y - .05, 0, .6, y + .05, .022)
        k.box("pallet", -.6, y - .05, .1, .6, y + .05, .122)
        for x in (-.55, 0, .55):
            k.box("weathered", x - .05, y - .05, .022, x + .05, y + .05, .1)
    for i in range(5):
        x = -.55 + i * .275
        k.box("pallet", x - .05, -.5, .122, x + .05, .5, .144)


@prop("street")
def oil_drum(k):
    k.cyl("signal_red", (0, 0, 0), (0, 0, .88), .29, segs=12)
    for z in (0, .86):
        k.cyl("rust", (0, 0, z), (0, 0, z + .025), .295, segs=12)
    for z in (.29, .59):
        k.cyl("signal_red", (0, 0, z - .012), (0, 0, z + .012), .3, segs=12)
    k.cyl("iron", (0, 0, .88), (0, 0, .884), .27, segs=12, smooth=False)
    k.cyl("steel", (.15, .1, .884), (.15, .1, .9), .03, segs=6)


@prop("street")
def cardboard_boxes(k):
    for x0, y0, z0, x1, y1, z1 in ((-.3, -.25, 0, .3, .25, .4), (-.2, -.2, .4, .25, .18, .72), (.34, -.1, 0, .6, .22, .28)):
        k.box("cardboard", x0, y0, z0, x1, y1, z1)
        cx = (x0 + x1) / 2
        k.box("plastic_beige", cx - .025, y0 - .002, z1 - .06, cx + .025, y1 + .002, z1 + .002)


# ----- Interior
@prop("interior")
def desk(k):
    k.box("oak", -.7, -.35, .72, .7, .35, .75)
    for x in (-.66, .66):
        for y in (-.31, .31):
            k.box("black_paint", x - .02, y - .02, 0, x + .02, y + .02, .72)
    k.box("black_paint", -.62, .28, .35, .62, .3, .7)
    k.box("enamel_grey", .25, -.3, .05, .63, .3, .7)
    for i, (z0, z1) in enumerate(((.07, .32), (.34, .5), (.52, .68))):
        k.box("enamel_grey", .26, -.31, z0, .62, -.3, z1)
        k.box("chrome", .38, -.325, z1 - .05, .5, -.31, z1 - .035)


@prop("interior")
def desk_computer(k):
    """Monitor, keyboard and mouse; the origin sits on the desk top."""
    k.box("plastic_black", -.28, 0, .1, .28, .04, .44)
    k.box("screen", -.26, -.002, .12, .26, 0, .42)
    k.box("plastic_black", -.03, .04, .02, .03, .07, .25)
    k.box("plastic_black", -.1, -.06, 0, .1, .12, .02)
    k.box("plastic_black", -.22, -.3, 0, .22, -.15, .02)
    k.box("plastic_grey", -.2, -.29, .02, .2, -.16, .026)
    k.box("plastic_black", .27, -.27, 0, .33, -.17, .03)


@prop("interior")
def office_chair(k):
    for i in range(5):
        a = i * 2 * math.pi / 5
        x, y = .3 * math.cos(a), .3 * math.sin(a)
        k.cyl("plastic_black", (0, 0, .09), (x, y, .06), .025, segs=4, smooth=False)
        k.cyl("rubber", (x, y, 0), (x, y, .05), .03, segs=6)
    k.cyl("chrome", (0, 0, .08), (0, 0, .42), .03)
    k.box("fabric_grey", -.24, -.23, .42, .24, .23, .5)
    k.box("plastic_black", -.03, .18, .4, .03, .24, .6)
    k.box("fabric_grey", -.22, .2, .55, .22, .27, 1.0)
    for x in (-.27, .27):
        k.box("plastic_black", x - .02, -.15, .62, x + .02, .1, .65)
        k.box("plastic_black", x - .015, -.02, .5, x + .015, .01, .62)


@prop("interior")
def chair(k):
    k.box("walnut", -.21, -.21, .43, .21, .21, .46)
    for x in (-.18, .18):
        k.box("walnut", x - .018, -.2, 0, x + .018, -.164, .43)
        k.box("walnut", x - .018, .17, 0, x + .018, .206, .92)
    k.box("walnut", -.2, .17, .8, .2, .2, .9)
    k.box("walnut", -.2, .175, .6, .2, .195, .66)


@prop("interior")
def table(k):
    k.box("oak", -.7, -.4, .72, .7, .4, .76)
    for x in (-.62, .62):
        for y in (-.32, .32):
            k.box("walnut", x - .03, y - .03, 0, x + .03, y + .03, .72)
    k.box("walnut", -.6, -.33, .62, .6, -.31, .72)
    k.box("walnut", -.6, .31, .62, .6, .33, .72)
    k.box("walnut", -.63, -.3, .62, -.61, .3, .72)
    k.box("walnut", .61, -.3, .62, .63, .3, .72)


@prop("interior")
def filing_cabinet(k):
    k.box("enamel_grey", -.235, -.31, 0, .235, .31, 1.32)
    for i in range(4):
        z0 = .04 + i * .32
        k.box("enamel_grey", -.22, -.32, z0, .22, -.31, z0 + .3)
        k.box("chrome", -.08, -.345, z0 + .19, .08, -.32, z0 + .215)
        k.box("brass", -.04, -.325, z0 + .23, .04, -.32, z0 + .27)


@prop("interior")
def shelving(k):
    for x in (-.43, .43):
        for y in (-.18, .18):
            k.box("galvanised", x - .018, y - .018, 0, x + .018, y + .018, 2.0)
    for z in (.1, .55, 1.0, 1.45, 1.9):
        k.box("galvanised", -.45, -.2, z, .45, .2, z + .02)
    k.box("cardboard", -.4, -.15, .12, -.05, .15, .42)
    k.box("cardboard", .05, -.16, .57, .4, .14, .85)
    for i, sw in enumerate(("municipal_blue", "signal_red", "black_paint", "municipal_blue", "olive", "black_paint")):
        x = -.4 + i * .055
        k.box(sw, x, -.15, 1.02, x + .045, .1, 1.3)
    k.cyl("galvanised", (.2, 0, 1.47), (.2, 0, 1.65), .09, segs=10)
    k.cyl("signal_red", (.2, 0, 1.52), (.2, 0, 1.6), .092, segs=10)


@prop("interior")
def wardrobe(k):
    k.box("walnut", -.5, -.3, .08, .5, .3, 1.95)
    k.box("wood_dark", -.48, -.28, 0, .48, .28, .08)
    k.box("walnut", -.53, -.33, 1.95, .53, .31, 2.02)
    for x0, x1 in ((-.48, -.006), (.006, .48)):
        k.box("walnut", x0, -.31, .1, x1, -.3, 1.93)
        k.box("wood_dark", x0 + .06, -.315, .2, x1 - .06, -.31, 1.83)
        k.box("walnut", x0 + .08, -.32, .22, x1 - .08, -.315, 1.81)
    k.box("wood_dark", -.006, -.305, .1, .006, -.3, 1.93)
    for x in (-.05, .05):
        k.cyl("brass", (x, -.32, 1.0), (x, -.35, 1.0), .015, segs=6)


# Furniture over two tiles or four (a flat's): the origin is the middle of the
# footprint, its length along X, the front toward -Y and its back to the wall
# face at +Y (the edge less half a wall).
BACK = TILE / 2 - WF - .005  # 2 x 1 tiles: the wall face behind


def table_lamp(k, x, y, z):
    k.cyl("brass", (x, y, z), (x, y, z + .32), .07, .05, segs=6)
    k.cyl("canvas_white", (x, y, z + .3), (x, y, z + .52), .16, .11, segs=8)


@prop("interior")
def sofa(k):
    """A three-seat sofa (2.3 m) with an end table and lamp: 2 x 1 tiles, the seat toward -Y."""
    y0, y1 = BACK - .92, BACK
    k.box("fabric_grey", -1.45, y0, .12, .85, y1, .42)            # the base
    k.box("fabric_grey", -1.45, y1 - .2, .42, .85, y1, .82)       # the back
    for x0 in (-1.45, .67):
        k.box("fabric_grey", x0, y0, .42, x0 + .18, y1, .64)      # arms
    for i in range(3):
        x0 = -1.27 + i * .647
        k.box("fabric_grey", x0 + .01, y0 + .02, .42, x0 + .637, y1 - .2, .55)
        k.box("fabric_grey", x0 + .03, y1 - .34, .55, x0 + .617, y1 - .2, .86)
    k.box("fabric_red", -1.2, y1 - .44, .55, -.85, y1 - .3, .85)  # a cushion
    for x in (-1.4, .8):
        for y in (y0 + .05, y1 - .05):
            k.box("wood_dark", x - .025, y - .025, 0, x + .025, y + .025, .12)
    # The end table, a lamp on it.
    k.box("walnut", .95, BACK - .5, .52, 1.45, BACK, .56)
    k.box("walnut", .97, BACK - .48, .12, 1.43, BACK - .02, .15)
    for x in (.98, 1.42):
        for y in (BACK - .47, BACK - .03):
            k.box("walnut", x - .02, y - .02, 0, x + .02, y + .02, .52)
    table_lamp(k, 1.2, BACK - .25, .56)


@prop("interior")
def tv_stand(k):
    """A low media unit (2.6 m) with a television, a soundbar, a plant: 2 x 1 tiles, the screen toward -Y."""
    y0, y1 = BACK - .45, BACK
    k.box("black_paint", -1.28, y0 + .03, 0, 1.28, y1 - .03, .06)  # plinth
    k.box("walnut", -1.3, y0, .06, 1.3, y1, .5)
    for i in range(4):
        x0 = -1.28 + i * .64
        k.box("oak", x0 + .01, y0 - .01, .08, x0 + .63, y0, .48)   # door fronts
        k.box("chrome", x0 + .27, y0 - .025, .42, x0 + .37, y0 - .01, .44)
    # The television on its foot.
    k.box("iron", -.2, y1 - .3, .5, .2, y1 - .1, .52)
    k.box("iron", -.04, y1 - .16, .52, .04, y1 - .1, .62)
    k.box("plastic_black", -.73, y1 - .16, .6, .73, y1 - .11, 1.45)
    k.box("glass_dark", -.71, y1 - .162, .62, .71, y1 - .16, 1.43)
    k.box("plastic_black", -.5, y0 + .05, .5, .5, y0 + .14, .58)   # soundbar
    k.box("fabric_grey", -.48, y0 + .045, .51, .48, y0 + .05, .57)
    # A plant in a pot at one end, books at the other.
    k.cyl("ceramic", (1.05, BACK - .22, .5), (1.05, BACK - .22, .72), .1, .13, segs=8)
    k.blob("foliage", (1.05, BACK - .22, .92), .2, 1.3)
    for i, sw in enumerate(("fabric_red", "fabric_blue", "paper", "fabric_green")):
        x = -1.2 + i * .045
        k.box(sw, x, BACK - .3, .5, x + .04, BACK - .08, .72 - (i % 2) * .03)


@prop("interior")
def bed(k):
    """A king-size bed with nightstands and lamps, a bench at its foot, a rug: 2 x 2 tiles, the head toward +Y."""
    back = TILE - WF - .005
    k.box("fabric_red", -1.4, back - 2.55, 0, 1.4, back - .3, .01)       # the rug
    k.box("upholstery_tan", -1.0, back - .1, .1, 1.0, back, 1.2)          # headboard
    k.box("walnut", -.98, back - 2.2, .1, .98, back - .1, .34)            # frame
    for x in (-.93, .93):
        for y in (back - 2.15, back - .15):
            k.box("walnut", x - .03, y - .03, 0, x + .03, y + .03, .1)
    k.box("linen", -.94, back - 2.17, .34, .94, back - .12, .56)          # mattress
    k.box("canvas_white", -.97, back - 2.2, .4, .97, back - .65, .62)     # duvet
    k.box("fabric_grey", -.98, back - 2.21, .4, .98, back - 1.75, .64)    # a throw over the foot
    for x0 in (-.85, .05):
        k.box("linen", x0, back - .6, .56, x0 + .8, back - .15, .7)       # pillows
    for x in (-1.25, 1.25):
        k.box("walnut", x - .22, back - .45, 0, x + .22, back, .55)       # nightstands
        k.box("oak", x - .2, back - .46, .32, x + .2, back - .45, .5)
        k.box("brass", x - .04, back - .48, .4, x + .04, back - .46, .42)
        table_lamp(k, x, back - .22, .55)
    # The bench at the foot.
    k.box("upholstery_tan", -.8, back - 2.65, .32, .8, back - 2.27, .46)
    for x in (-.75, .75):
        k.box("wood_dark", x - .03, back - 2.62, 0, x + .03, back - 2.3, .32)


@prop("interior")
def bed_single(k):
    """A single bed with a nightstand and lamp: 1 x 2 tiles, the head toward +Y."""
    back = TILE - WF - .005
    x0, x1 = -.68, .3                                                    # the bed, to one side
    k.box("wood_dark", x0, back - .06, .1, x1, back, .95)                 # headboard
    k.box("wood_dark", x0, back - 2.05, .1, x1, back - 2.0, .5)           # footboard
    k.box("walnut", x0 + .02, back - 2.0, .1, x1 - .02, back - .06, .3)   # frame
    for x in (x0 + .04, x1 - .04):
        for y in (back - 1.98, back - .1):
            k.box("wood_dark", x - .025, y - .025, 0, x + .025, y + .025, .1)
    k.box("linen", x0 + .04, back - 1.98, .3, x1 - .04, back - .08, .48)  # mattress
    k.box("fabric_blue", x0 + .02, back - 1.99, .36, x1 - .02, back - .6, .52)  # duvet
    k.box("linen", x0 + .12, back - .55, .48, x1 - .12, back - .12, .6)   # pillow
    # The nightstand beside it, a lamp and a book.
    k.box("walnut", .38, back - .42, 0, .72, back, .5)
    k.box("oak", .4, back - .43, .3, .7, back - .42, .46)
    table_lamp(k, .55, back - .2, .5)
    k.box("fabric_red", .44, back - .4, .5, .6, back - .28, .53)


@prop("interior")
def server_rack(k):
    k.box("black_paint", -.3, -.5, 0, .3, .5, 2.0)
    k.box("iron", -.28, -.51, .05, .28, -.5, 1.95)
    k.box("chrome", .22, -.53, .8, .24, -.51, 1.2)
    for i in range(10):
        z = .2 + i * .17
        k.box("plastic_black", -.26, -.512, z - .05, .2, -.51, z + .05)
        k.box("led_red" if i in (3, 7) else "led_green", -.23, -.516, z - .01, -.19, -.512, z + .01)
        k.box("led_green", -.16, -.516, z - .01, -.14, -.512, z + .01)


@prop("interior")
def locker(k):
    k.box("black_paint", -.3, -.25, 0, .3, .25, .08)
    k.box("enamel_grey", -.3, -.25, .08, .3, .25, 1.85)
    for x0, x1 in ((-.295, -.005), (.005, .295)):
        k.box("enamel_grey", x0, -.26, .1, x1, -.25, 1.83)
        for z in (1.55, 1.61, 1.67):
            k.box("black_paint", x0 + .07, -.262, z, x1 - .07, -.26, z + .025)
        k.box("chrome", x1 - .06, -.28, 1.0, x1 - .035, -.26, 1.12)


@prop("interior")
def desk_laptop(k):
    """A laptop, a desk lamp, a phone and a mug; the origin sits on the desk top (as desk_computer)."""
    k.box("plastic_grey", -.32, -.25, 0, .02, -.02, .02)
    k.box("plastic_black", -.3, -.2, .02, 0, -.08, .022)
    k.lean("plastic_grey", -.32, .02, -.02, .02, .04, .25, .012)
    k.lean("screen", -.3, 0, -.025, .035, .033, .235, .005)
    k.cyl("iron", (.5, .2, 0), (.5, .2, .02), .07, segs=8)
    k.cyl("iron", (.5, .2, .02), (.45, .12, .38), .012, segs=4)
    k.cyl("iron", (.45, .12, .38), (.32, -.02, .42), .012, segs=4)
    k.cyl("black_paint", (.34, 0, .44), (.28, -.07, .34), .03, .08, segs=8, smooth=False)
    k.cyl("lamp_warm", (.28, -.07, .335), (.27, -.08, .33), .07, segs=8, smooth=False)
    k.box("plastic_black", .1, .05, 0, .28, .22, .05)
    k.box("plastic_black", .1, .14, .05, .28, .2, .08)
    k.cyl("ceramic", (.2, -.22, 0), (.2, -.22, .1), .04, segs=8)
    k.box("paper", -.6, -.15, 0, -.4, .14, .01)


@prop("interior")
def desk_papers(k):
    """Paperwork: stacks of files, an in-tray, binders, a phone and a pen pot; the origin sits on the desk top."""
    for x, y, h, sw in ((-.5, -.1, .08, "paper"), (-.48, -.08, .11, "safety_yellow"), (-.2, -.16, .05, "paper")):
        k.box(sw, x - .11, y - .15, h - .04 if sw != "paper" else 0, x + .11, y + .15, h)
    k.box("plastic_black", .22, -.25, 0, .52, .0, .012)
    for x0, x1, y0, y1 in ((.22, .52, -.25, -.24), (.22, .52, -.01, 0), (.22, .23, -.25, 0), (.51, .52, -.25, 0)):
        k.box("plastic_black", x0, y0, 0, x1, y1, .07)
    k.box("paper", .24, -.23, .012, .5, -.02, .04)
    for i, sw in enumerate(("municipal_blue", "fabric_red", "black_paint", "municipal_blue", "olive")):
        x = -.62 + i * .065
        k.box(sw, x, .18, 0, x + .055, .32, .3)
    k.box("plastic_beige", .02, .12, 0, .2, .3, .05)
    k.box("plastic_beige", .02, .22, .05, .2, .28, .08)
    k.cyl("plastic_black", (.58, .2, 0), (.58, .2, .1), .035, segs=6)
    for dx in (-.01, .012):
        k.cyl("municipal_blue", (.58 + dx, .2, .05), (.58 + dx * 2, .2, .17), .005, segs=4)


# ----- Shops: the petrol station and its convenience store, the corner store.
# One-tile props stand in their tile's middle; a piece against a wall has its
# back at +Y, BACK from the middle (as the furniture below).
GOODS = ("signal_red", "safety_yellow", "municipal_blue", "hazard_orange", "fabric_green", "enamel_white", "canvas_red", "paint_green", "neon_pink")


def goods(k, x0, x1, y0, y1, z, hmax, seed, n=3, shades=GOODS):
    """A row of n packs on a shelf, each its own colour and height."""
    w = (x1 - x0) / n
    for i in range(n):
        sw = shades[(seed * 5 + i * 3) % len(shades)]
        if sw == "neon_pink":
            sw = "enamel_white"
        h = hmax * (.6 + .4 * (((seed + i) * 7) % 4) / 3)
        k.box(sw, x0 + i * w + .012, y0, z, x0 + (i + 1) * w - .012, y1, z + h)


@prop("shop")
def fuel_pump(k):
    """A fuel dispenser on its island, a display and a nozzle on each face (-Y and +Y): 1 tile."""
    k.box("concrete", -.7, -.4, 0, .7, .4, .16)
    k.box("safety_yellow", -.71, -.41, 0, .71, .41, .05)
    for x in (-.6, .6):
        k.cyl("safety_yellow", (x, 0, .16), (x, 0, 1.0), .06, segs=8)
    k.box("enamel_white", -.3, -.22, .16, .3, .22, 1.5)
    k.box("signal_red", -.33, -.25, 1.5, .33, .25, 1.82)
    k.box("enamel_white", -.35, -.27, 1.82, .35, .27, 1.86)
    for s in (-1, 1):
        face = lambda d0, d1: sorted((s * d0, s * d1))  # a plate on that face, d0 to d1 out from the middle
        y0, y1 = face(.22, .232)
        k.box("plastic_black", -.22, y0, 1.02, .22, y1, 1.4)
        y0, y1 = face(.232, .238)
        k.box("screen", -.17, y0, 1.22, .17, y1, 1.34)
        y0, y1 = face(.22, .226)
        k.box("enamel_grey", -.24, y0, .3, .24, y1, .85)
        y0, y1 = face(.25, .262)
        k.box("lamp_warm", -.26, y0, 1.58, .26, y1, 1.74)
    # A nozzle in its holster at each end, its hose looping down.
    for e in (-1, 1):
        x0, x1 = sorted((e * .3, e * .38))
        k.box("plastic_black", x0, -.06, .92, x1, .06, 1.14)
        x0, x1 = sorted((e * .36, e * .44))
        k.box("black_paint", x0, -.02, .9, x1, .02, 1.06)
        k.cyl("rubber", (e * .38, 0, 1.0), (e * .47, 0, .5), .022, segs=6)
        k.cyl("rubber", (e * .47, 0, .5), (e * .32, 0, .3), .022, segs=6)


@prop("shop")
def shelf_gondola(k):
    """A shop gondola, snacks on both faces (-Y and +Y), a red header: 1 tile, free standing in an aisle."""
    X, Y, T = .66, .44, 1.6
    k.box("enamel_grey", -X, -Y, 0, X, Y, .12)
    k.box("enamel_white", -X, -.03, .12, X, .03, T)
    k.box("signal_red", -X, -.05, T, X, .05, T + .12)
    for s in (-1, 1):
        y0, y1 = sorted((s * .03, s * .42))
        for z in (.55, .98):
            k.box("enamel_white", -X + .01, y0, z - .02, X - .01, y1, z)
        for i, z in enumerate((.12, .55, .98)):
            goods(k, -X + .02, X - .02, *sorted((s * .08, s * .38)), z, .33, i * 2 + (s > 0))


@prop("shop")
def shelf_wall(k):
    """Tall shop shelving against a wall, goods toward -Y: big packs low, cereal, cans, bottles high: 1 tile."""
    X, y0, y1, T = .66, BACK - .5, BACK, 2.0
    k.box("enamel_white", -X, y1 - .03, 0, X, y1, T)
    for x in (-X, X - .03):
        k.box("enamel_white", x, y0, 0, x + .03, y1, T)
    k.box("enamel_grey", -X + .03, y0, 0, X - .03, y1 - .03, .12)
    k.box("municipal_blue", -X, y0 - .02, T, X, y1, T + .12)
    for z in (.6, 1.05, 1.5):
        k.box("enamel_white", -X + .03, y0, z - .02, X - .03, y1 - .03, z)
    rows = ((.12, .42, 2, ("cardboard", "enamel_white", "cardboard")),
            (.6, .38, 4, GOODS),
            (1.05, .14, 5, ("signal_red", "galvanised", "fabric_green", "galvanised", "safety_yellow")),
            (1.5, .32, 6, ("fabric_green", "glass_light", "signal_red", "municipal_blue", "glass_light", "hazard_orange")))
    for i, (z, h, n, shades) in enumerate(rows):
        goods(k, -X + .04, X - .04, y0 + .04, y1 - .06, z, h, i, n, shades)


@prop("shop")
def drinks_fridge(k):
    """A two-door drinks fridge, its lit shelves toward -Y, a brand header: 1 tile, its back to the wall."""
    X, y0, y1, T = .64, BACK - .7, BACK, 2.05
    k.box("black_paint", -X, y0, 0, X, y1, .22)
    k.box("iron", -X + .06, y0 - .005, .04, X - .06, y0, .18)
    k.box("black_paint", -X, y0, 1.78, X, y1, T)
    k.box("signal_red", -X + .03, y0 - .01, 1.82, X - .03, y0, 2.0)
    k.box("enamel_white", -.32, y0 - .015, 1.86, .32, y0 - .01, 1.96)
    for x0 in (-X, X - .06):
        k.box("black_paint", x0, y0, .22, x0 + .06, y1, 1.78)
    k.box("lamp_cool", -X + .06, y1 - .06, .22, X - .06, y1, 1.78)
    k.box("aluminium", -.025, y0 - .02, .22, .025, y0 + .02, 1.78)
    for x in (-.07, .05):
        k.box("chrome", x, y0 - .05, .8, x + .02, y0 - .02, 1.35)
    shades = ("signal_red", "fabric_green", "municipal_blue", "safety_yellow", "hazard_orange", "enamel_white")
    for i, z in enumerate((.22, .6, .98, 1.36)):
        k.box("aluminium", -X + .06, y0 + .04, z, X - .06, y1 - .06, z + .02)
        goods(k, -X + .07, X - .07, y0 + .08, y1 - .1, z + .02, .3, i, 4, shades)


@prop("shop")
def ice_chest(k):
    """A petrol station's ice chest, ICE on its front (-Y), two lids: 1 tile, its back to the wall."""
    X, y0, y1 = .62, BACK - .72, BACK
    k.box("black_paint", -X + .04, y0 + .04, 0, X - .04, y1 - .04, .08)
    k.box("enamel_white", -X, y0, .08, X, y1, 1.02)
    k.box("municipal_blue", -X + .05, y0 - .01, .28, X - .05, y0, .88)
    f = y0 - .016
    for x0, z0, x1, z1 in ((-.4, .4, -.34, .76),  # I
                           (-.14, .4, -.08, .76), (-.08, .7, .12, .76), (-.08, .4, .12, .46),  # C
                           (.22, .4, .28, .76), (.28, .7, .44, .76), (.28, .55, .4, .61), (.28, .4, .44, .46)):  # E
        k.box("enamel_white", x0, f, z0, x1, y0 - .01, z1)
    for x0, x1 in ((-X, -.005), (.005, X)):
        k.box("enamel_white", x0, y0, 1.02, x1, y1, 1.07)
        k.box("chrome", (x0 + x1) / 2 - .08, y0 - .02, 1.0, (x0 + x1) / 2 + .08, y0 + .03, 1.04)


@prop("shop")
def checkout_counter(k):
    """A shop counter with the till, a card reader and a rack of sweets at the customer's end: 2 x 1 tiles, the customer side toward -Y."""
    y0, y1 = -.5, .2
    k.box("wood_dark", -1.38, y0 + .05, 0, 1.38, y1, .08)
    k.box("oak", -1.4, y0, .08, 1.4, y1, .98)
    k.box("signal_red", -1.4, y0 - .006, .78, 1.4, y0, .88)
    k.box("plastic_grey", -1.45, y0 - .04, .98, 1.45, y1 + .03, 1.02)
    # The till, its screen to the staff (+Y), a pole display to the customer.
    k.box("plastic_black", .3, -.2, 1.02, .72, .12, 1.12)
    k.box("plastic_black", .46, -.02, 1.12, .56, .04, 1.22)
    k.box("plastic_black", .32, .02, 1.2, .7, .06, 1.46)
    k.box("screen", .34, .06, 1.22, .68, .065, 1.44)
    k.box("plastic_black", .1, -.36, 1.02, .2, -.3, 1.3)
    k.box("led_green", .11, -.366, 1.22, .19, -.36, 1.28)
    k.box("plastic_black", -.1, -.42, 1.02, .02, -.3, 1.07)
    k.box("screen", -.08, -.4, 1.07, 0, -.33, 1.072)
    # A stepped sweets rack at the customer's end.
    for i, (z, y) in enumerate(((1.02, -.45), (1.14, -.3), (1.26, -.15))):
        k.box("chrome", -1.32, y, z, -.72, y + .16, z + .015)
        goods(k, -1.3, -.74, y + .02, y + .14, z + .015, .1, i + 3, 3)
    # A stool behind it.
    k.cyl("chrome", (.5, .55, 0), (.5, .55, .7), .03, segs=6)
    k.cyl("chrome", (.5, .55, 0), (.5, .55, .02), .2, segs=8, smooth=False)
    k.cyl("leather_black", (.5, .55, .7), (.5, .55, .76), .18, segs=8)


@prop("shop")
def atm(k):
    """A freestanding cash machine, its screen and keypad toward -Y, a lit header: 1 tile."""
    k.box("concrete_dark", -.42, -.4, 0, .42, .36, .06)
    k.box("enamel_grey", -.34, -.24, .06, .34, .3, 1.75)
    k.box("plastic_black", -.3, -.38, .98, .3, -.24, 1.05)
    k.box("plastic_grey", -.2, -.37, 1.05, .05, -.27, 1.065)
    for x in (-.37, .34):
        k.box("enamel_grey", x, -.38, 1.05, x + .03, -.24, 1.62)
    k.box("plastic_black", -.24, -.25, 1.18, .24, -.24, 1.5)
    k.box("screen", -.2, -.255, 1.22, .2, -.25, 1.46)
    k.box("led_green", .12, -.255, 1.07, .22, -.25, 1.1)
    k.box("plastic_black", -.18, -.26, .82, .18, -.24, .88)
    k.box("municipal_blue", -.36, -.26, 1.62, .36, .32, 1.9)
    k.box("lamp_cool", -.3, -.27, 1.67, .3, -.26, 1.85)


@prop("shop")
def news_rack(k):
    """A stand of newspapers and magazines in tiers toward -Y: 1 tile."""
    for x in (-.46, .43):
        k.box("chrome", x, -.34, 0, x + .03, -.31, .45)
        k.box("chrome", x, .2, 0, x + .03, .23, 1.42)
        k.lean("chrome", x, x + .03, -.34, .45, .2, 1.42, .03)
    shades = ("paper", "signal_red", "paper", "municipal_blue", "safety_yellow", "paper", "fabric_green", "black_paint")
    for i in range(4):
        y, z = -.32 + i * .13, .1 + i * .32
        k.box("galvanised", -.43, y, z, .43, y + .2, z + .02)
        for j in range(3):
            x = -.4 + j * .27
            k.lean(shades[(i * 3 + j) % len(shades)], x, x + .25, y + .03, z + .02, y + .09, z + .32, .02)


@prop("shop")
def propane_cage(k):
    """A locked cage of gas bottles for exchange, two shelves, its door toward -Y: 1 tile."""
    X, Y, T = .66, .4, 1.55
    k.box("galvanised", -X, -Y, 0, X, Y, .05)
    k.box("galvanised", -X, -Y, T - .04, X, Y, T)
    k.box("galvanised", -X, -Y, .8, X, Y, .83)
    for x in (-X, X - .04):
        for y in (-Y, Y - .04):
            k.box("galvanised", x, y, .05, x + .04, y + .04, T - .04)
    for i in range(1, 6):
        x = -X + i * 2 * X / 6
        k.box("galvanised", x - .008, -Y, .05, x + .008, -Y + .012, T - .04)
    for s in (-1, 1):
        for i in (1, 2):
            y = -Y + i * 2 * Y / 3
            k.box("galvanised", s * X - .006, y - .008, .05, s * X + .006, y + .008, T - .04)
    for z0 in (.05, .83):
        for x in (-.4, 0, .4):
            k.cyl("enamel_white", (x, .02, z0), (x, .02, z0 + .5), .15, segs=6)
            k.box("galvanised", x - .06, -.04, z0 + .5, x + .06, .08, z0 + .6)
    k.box("municipal_blue", -.4, -Y - .012, 1.25, .4, -Y, 1.45)


@prop("shop")
def price_sign(k):
    """A petrol station's price pylon, brand and three lit prices on both faces (-Y and +Y): 1 tile."""
    k.box("concrete", -.45, -.3, 0, .45, .3, .45)
    for x in (-.45, .3):
        k.box("enamel_grey", x, -.1, .45, x + .15, .1, 3.1)
    k.box("enamel_white", -.72, -.14, 3.1, .72, .14, 5.4)
    for s in (-1, 1):
        face = lambda x0, z0, x1, z1, d: (x0, *sorted((s * .14, s * (.14 + d)))[:1], z0, x1, sorted((s * .14, s * (.14 + d)))[1], z1)
        k.box("signal_red", *face(-.66, 4.55, .66, 5.32, .01))
        k.box("enamel_white", *face(-.25, 4.75, .25, 5.12, .015))
        for i, label in enumerate(("safety_yellow", "fabric_green", "municipal_blue")):
            z = 3.2 + i * .44
            k.box("black_paint", *face(-.66, z, .66, z + .38, .01))
            k.box(label, *face(-.6, z + .06, -.12, z + .32, .015))
            k.box("led_red", *face(-.04, z + .06, .6, z + .32, .015))


# ----- Food: the coffee shop and the fast-food place.
@prop("food")
def coffee_counter(k):
    """A coffee bar: a pastry case at one end, the espresso machine and grinder at the other: 2 x 1 tiles, the customer side toward -Y."""
    y0, y1 = -.5, .2
    k.box("wood_dark", -1.38, y0 + .05, 0, 1.38, y1, .08)
    k.box("walnut", -1.4, y0, .08, 1.4, y1, 1.0)
    k.box("oak", -1.45, y0 - .04, 1.0, 1.45, y1 + .03, 1.05)
    # The pastry case: glass ends and top, a shelf, pastries on both levels.
    k.box("chrome", -1.36, y0, 1.05, -.34, y1 - .05, 1.08)
    for x in (-1.36, -.36):
        k.box("glass_light", x, y0, 1.08, x + .02, y1 - .05, 1.45)
    k.box("glass_light", -1.36, y0, 1.25, -.34, y1 - .05, 1.265)
    k.box("glass_light", -1.36, y0, 1.43, -.34, y1 - .05, 1.45)
    for z, sw in ((1.08, ("pine", "terracotta", "walnut")), (1.265, ("terracotta", "paper", "canvas_red"))):
        for i, c in enumerate(sw):
            x = -1.26 + i * .31
            k.box(c, x, y0 + .08, z, x + .17, y0 + .3, z + .07)
    # The espresso machine, its group heads to the staff (+Y).
    k.box("chrome", .35, -.25, 1.05, 1.0, .08, 1.45)
    k.box("black_paint", .33, -.27, 1.45, 1.02, .1, 1.48)
    k.box("signal_red", .4, -.255, 1.2, .95, -.25, 1.38)
    for x in (.5, .85):
        k.box("black_paint", x - .05, .08, 1.28, x + .05, .14, 1.36)
        k.box("black_paint", x - .015, .14, 1.29, x + .015, .3, 1.32)
        k.cyl("ceramic", (x, .14, 1.12), (x, .14, 1.2), .035, segs=6)
    k.box("steel", .4, .08, 1.08, .95, .2, 1.11)
    k.box("ceramic", .45, -.15, 1.48, .8, -.05, 1.55)  # cups warming on top
    # The grinder, a stack of cups, the till.
    k.box("plastic_black", 1.1, -.15, 1.05, 1.3, .1, 1.35)
    k.cyl("glass_dark", (1.2, -.02, 1.35), (1.2, -.02, 1.55), .06, .1, segs=6, smooth=False)
    k.cyl("paper", (.15, -.3, 1.05), (.15, -.3, 1.32), .045, segs=6)
    k.box("plastic_black", -.15, -.1, 1.05, .05, .1, 1.1)
    k.lean("plastic_black", -.15, .05, .0, 1.1, .06, 1.3, .02)


@prop("food")
def cafe_table(k):
    """A round bistro table with two chairs, one either side (-Y and +Y): 1 tile."""
    k.cyl("limestone", (0, 0, .72), (0, 0, .75), .34, segs=10)
    k.cyl("iron", (0, 0, .03), (0, 0, .72), .03, segs=6)
    k.cyl("iron", (0, 0, 0), (0, 0, .03), .22, segs=8, smooth=False)
    for s in (-1, 1):
        y = s * .5
        k.cyl("pine", (0, y, .44), (0, y, .47), .2, segs=8, smooth=False)
        for dx, dy in ((-.13, -.13), (.13, -.13), (-.13, .13), (.13, .13)):
            k.cyl("iron", (dx * 1.2, y + dy * 1.2, 0), (dx, y + dy, .44), .012, segs=4, smooth=False)
        yb = y + s * .17
        for dx in (-.15, .15):
            k.cyl("iron", (dx, yb, .47), (dx, yb + s * .04, .85), .012, segs=4, smooth=False)
        y0, y1 = sorted((yb + s * .03, yb + s * .06))
        k.box("pine", -.17, y0, .66, .17, y1, .82)


@prop("food")
def a_frame_sign(k):
    """A pavement chalkboard on an A-frame, its faces toward -Y and +Y: 1 tile, no cover."""
    t = .025
    for s in (-1, 1):
        yb, yt = s * .28, s * .03  # the board's outer face, foot and head
        lerp = lambda z: yb + (yt - yb) * z / .95

        def plate(sw, x0, x1, z0, z1, d, out=0.0):
            """A plate on the outer face, d thick, `out` beyond it."""
            a, b = lerp(z0) + s * out, lerp(z1) + s * out
            k.lean(sw, x0, x1, *((a - d, z0, b - d, z1) if s < 0 else (a, z0, b, z1)), d)

        plate("oak", -.3, .3, 0, .95, t, -t)
        plate("black_paint", -.26, .26, .1, .9, .006)
        plate("safety_yellow", -.18, .18, .74, .82, .004, .006)
        for i, (x0, x1) in enumerate(((-.2, .12), (-.2, .18), (-.2, .05), (-.2, .15))):
            z = .6 - i * .12
            plate("paper", x0, x1, z, z + .035, .004, .006)


@prop("food")
def fastfood_counter(k):
    """A fast-food counter with two tills and trays, the lit menu boards above it: 2 x 1 tiles, the customer side toward -Y."""
    y0, y1 = -.5, .15
    k.box("black_paint", -1.38, y0 + .05, 0, 1.38, y1, .1)
    k.box("enamel_white", -1.4, y0, .1, 1.4, y1, 1.0)
    k.box("signal_red", -1.4, y0 - .006, .45, 1.4, y0, .85)
    k.box("safety_yellow", -1.4, y0 - .008, .85, 1.4, y0, .9)
    k.box("steel", -1.45, y0 - .04, 1.0, 1.45, y1 + .03, 1.04)
    for x in (-.6, .4):
        k.box("plastic_black", x - .16, -.15, 1.04, x + .16, .1, 1.12)
        k.box("plastic_black", x - .02, -.02, 1.12, x + .02, .02, 1.25)
        k.lean("plastic_black", x - .15, x + .15, -.02, 1.22, .04, 1.42, .03)
        k.lean("screen", x - .13, x + .13, .01, 1.235, .072, 1.405, .006)
    for i in range(3):
        k.box("signal_red", .9, -.4, 1.04 + i * .025, 1.3, -.1, 1.06 + i * .025)
    k.box("chrome", -1.3, -.42, 1.04, -1.16, -.3, 1.18)
    # The menu boards, hung from the ceiling behind the staff.
    k.box("black_paint", -1.35, BACK - .1, 1.85, 1.35, BACK - .02, 2.4)
    for i, x in enumerate((-1.3, -.43, .44)):
        k.box("lamp_warm", x, BACK - .11, 1.9, x + .84, BACK - .1, 2.35)
        k.box("signal_red", x + .05, BACK - .115, 2.2, x + .79, BACK - .11, 2.3)
        k.box("hazard_orange", x + .08, BACK - .115, 1.97, x + .4, BACK - .11, 2.13)
    for x in (-1.0, 1.0):
        k.box("iron", x - .01, BACK - .07, 2.4, x + .01, BACK - .05, 2.5)


@prop("food")
def booth(k):
    """A diner booth: two high-backed benches facing across a table, the open side toward -Y: 2 x 1 tiles, its back to the wall."""
    y0, y1 = BACK - .8, BACK
    for s in (-1, 1):
        a, b = sorted((s * 1.45, s * .95))
        k.box("wood_dark", a, y0, 0, b, y1, .4)
        k.box("fabric_red", a, y0 - .02, .4, b, y1, .5)
        c, d = sorted((s * 1.45, s * 1.28))
        k.box("fabric_red", c, y0, .5, d, y1, 1.15)
        k.box("wood_dark", c - .01, y0 - .01, 1.15, d + .01, y1, 1.2)
    k.box("plastic_beige", -.58, y0 + .02, .72, .58, y1, .75)
    k.box("chrome", -.6, y0, .7, .6, y0 + .02, .76)
    k.cyl("chrome", (0, y0 + .4, .04), (0, y0 + .4, .7), .04, segs=6)
    k.box("chrome", -.25, y0 + .3, 0, .25, y0 + .5, .04)
    k.box("chrome", -.06, y1 - .12, .75, .06, y1 - .02, .87)
    k.cyl("signal_red", (.12, y1 - .08, .75), (.12, y1 - .08, .92), .025, segs=6)
    k.cyl("safety_yellow", (.2, y1 - .08, .75), (.2, y1 - .08, .92), .025, segs=6)


@prop("food")
def menu_board(k):
    """A drive-through menu board on two legs, lit panels and a speaker toward -Y, a little roof: 1 tile."""
    for x in (-.55, .45):
        k.box("black_paint", x, -.08, 0, x + .1, .08, .9)
    k.box("black_paint", -.7, -.12, .9, .7, .12, 2.2)
    k.box("enamel_grey", -.76, -.24, 2.2, .76, .16, 2.26)
    k.box("signal_red", -.66, -.13, 1.98, .66, -.12, 2.14)
    for x in (-.66, -.21, .24):
        k.box("lamp_warm", x, -.13, 1.25, x + .42, -.12, 1.92)
        k.box("hazard_orange", x + .04, -.135, 1.6, x + .38, -.13, 1.86)
    k.box("plastic_grey", -.66, -.13, .96, .66, -.12, 1.18)
    k.box("iron", -.12, -.14, 1.0, .12, -.13, 1.14)


# ----- Grounds: the car park and the park.
@prop("grounds")
def boom_barrier(k):
    """A car park's barrier: the housing on its tile, the arm reaching 2.8 m along +X across the lane: 1 tile (the arm over two more)."""
    k.box("concrete", -.35, -.3, 0, .35, .3, .1)
    k.box("safety_yellow", -.2, -.18, .1, .2, .18, 1.05)
    k.box("black_paint", -.22, -.2, 1.05, .22, .2, 1.09)
    k.box("black_paint", .2, -.06, .88, .28, .06, 1.02)
    k.box("enamel_white", .28, -.035, .9, 3.0, .035, 1.0)
    for i in range(5):
        x = .55 + i * .5
        k.box("signal_red", x, -.04, .895, x + .22, .04, 1.005)


@prop("grounds")
def pay_station(k):
    """A car park pay machine with a P sign on top, its screen toward -Y: 1 tile."""
    k.box("concrete", -.35, -.3, 0, .35, .3, .1)
    k.box("municipal_blue", -.25, -.18, .1, .25, .18, 1.5)
    k.box("black_paint", -.28, -.24, 1.5, .28, .2, 1.56)
    k.box("plastic_black", -.18, -.19, 1.15, .18, -.18, 1.38)
    k.box("screen", -.15, -.195, 1.18, .15, -.19, 1.35)
    k.box("plastic_black", -.15, -.2, .95, .05, -.18, 1.08)
    k.box("chrome", .1, -.2, 1.0, .16, -.18, 1.08)
    k.box("led_green", -.1, -.2, .62, .1, -.185, .66)
    k.box("galvanised", -.02, -.02, 1.56, .02, .02, 1.66)
    k.box("enamel_white", -.2, -.02, 1.66, .2, .02, 2.06)
    for y0, y1 in ((-.03, -.02), (.02, .03)):
        for x0, z0, x1, z1 in ((-.1, 1.72, -.04, 2.0), (-.04, 1.94, .08, 2.0), (.06, 1.84, .12, 1.98), (-.04, 1.82, .08, 1.88)):
            k.box("municipal_blue", x0, y0, z0, x1, y1, z1)


@prop("grounds")
def shopping_trolley(k):
    """A shopping trolley left in the car park, its wire basket open, the handle toward -X: 1 tile, no cover."""
    x0, x1, Y, z0, z1 = -.4, .45, .27, .42, .92
    w = .008
    k.box("galvanised", x0, -Y, z0, x1, Y, z0 + .015)
    for x in (x0, x1 - .015):
        k.box("galvanised", x, -Y, z1 - .015, x + .015, Y, z1)
    for y in (-Y, Y - .015):
        k.box("galvanised", x0, y, z1 - .015, x1, y + .015, z1)
        for i in range(5):
            x = x0 + .02 + i * (x1 - x0 - .04) / 4
            k.box("galvanised", x - w, y, z0, x + w, y + .015, z1)
    for i in range(1, 4):
        y = -Y + i * 2 * Y / 4
        for x in (x0, x1 - .015):
            k.box("galvanised", x, y - w, z0, x + .015, y + w, z1)
    k.cyl("signal_red", (x0 - .14, -Y + .02, 1.02), (x0 - .14, Y - .02, 1.02), .02, segs=4)
    for s in (-1, 1):
        k.cyl("galvanised", (x0, s * (Y - .02), z1), (x0 - .14, s * (Y - .02), 1.02), .01, segs=4)
        k.cyl("galvanised", (x0 + .04, s * .2, z0), (x0 + .02, s * .2, .08), .012, segs=4)
        k.cyl("galvanised", (x0 + .02, s * .2, .08), (x1 - .02, s * .2, .08), .012, segs=4)
        for x in (x0 + .04, x1 - .05):
            k.box("rubber", x - .04, s * .2 - .015, 0, x + .04, s * .2 + .015, .07)


@prop("grounds")
def picnic_table(k):
    """A park picnic table with its benches, seats toward -Y and +Y: 1 tile."""
    for y in (-.24, 0, .24):
        k.box("weathered", -.7, y - .11, .72, .7, y + .11, .76)
    for s in (-1, 1):
        for y in (s * .52, s * .66):
            k.box("weathered", -.7, y - .065, .42, .7, y + .065, .46)
    for x in (-.5, .5):
        for s in (-1, 1):
            k.hull("pine", [(x - .04, s * .7, 0), (x + .04, s * .7, 0), (x + .04, s * .62, 0), (x - .04, s * .62, 0),
                            (x - .04, s * .14, .72), (x + .04, s * .14, .72), (x + .04, s * .06, .72), (x - .04, s * .06, .72)])
        k.box("pine", x - .04, -.73, .37, x + .04, .73, .42)
        k.box("pine", x - .04, -.36, .68, x + .04, .36, .72)


@prop("grounds")
def swing_set(k):
    """A playground swing frame with two swings, along X: 2 x 1 tiles, no cover."""
    for x in (-1.35, 1.35):
        for s in (-1, 1):
            k.cyl("signal_red", (x, s * .62, 0), (x, 0, 2.2), .045, segs=6)
        k.box("signal_red", x - .03, -.36, .9, x + .03, .36, .96)
    k.cyl("municipal_blue", (-1.45, 0, 2.22), (1.45, 0, 2.22), .055, segs=8)
    for xc in (-.55, .55):
        for dx in (-.2, .2):
            k.box("galvanised", xc + dx - .008, -.008, .5, xc + dx + .008, .008, 2.18)
        k.box("rubber", xc - .24, -.1, .46, xc + .24, .1, .5)


# ----- The church and its graveyard.
@prop("church")
def pew(k):
    """A church pew, the seat toward -Y, a kneeler and a hymn-book shelf behind for the row behind: 2 x 1 tiles."""
    k.box("walnut", -1.35, -.25, .42, 1.35, .18, .47)
    k.lean("walnut", -1.35, 1.35, .17, .47, .24, .98, .05)
    k.box("walnut", -1.35, .2, .95, 1.35, .32, .99)
    k.box("walnut", -1.35, .3, .7, 1.35, .44, .73)
    k.box("walnut", -1.35, .42, .73, 1.35, .44, .82)
    for i, sw in enumerate(("fabric_red", "fabric_blue", "fabric_red", "fabric_red", "fabric_blue")):
        x = -1.1 + i * .5
        k.box(sw, x, .32, .73, x + .05, .42, .91)
    k.box("walnut", -1.3, .52, .1, 1.3, .66, .16)
    k.box("fabric_red", -1.3, .53, .16, 1.3, .65, .19)
    for x in (-1.4, 1.35):
        k.extrude_x("walnut", x, x + .05, [(-.28, 0), (.68, 0), (.68, .22), (.32, 1.0), (.16, 1.06), (-.06, 1.0), (-.28, .6)])


@prop("church")
def altar(k):
    """A stone altar on its step, a cloth and red frontal toward -Y, candlesticks and a crucifix: 2 x 1 tiles."""
    k.box("limestone", -1.45, -.72, 0, 1.45, BACK, .15)
    k.box("limestone", -1.0, -.25, .15, 1.0, .35, 1.02)
    k.box("sandstone", -1.05, -.3, .15, 1.05, .4, .25)
    k.box("linen", -1.08, -.32, 1.02, 1.08, .42, 1.05)
    k.box("linen", -1.08, -.33, .75, 1.08, -.31, 1.05)
    k.box("canvas_red", -.45, -.335, .3, .45, -.315, 1.0)
    k.box("brass", -.03, -.34, .48, .03, -.33, .85)
    k.box("brass", -.14, -.34, .7, .14, -.33, .76)
    for x in (-.82, .82):
        k.cyl("brass", (x, .15, 1.05), (x, .15, 1.09), .07, .04, segs=6)
        k.cyl("brass", (x, .15, 1.09), (x, .15, 1.38), .02, segs=6)
        k.cyl("linen", (x, .15, 1.38), (x, .15, 1.6), .025, segs=6)
        k.box("lamp_warm", x - .012, .138, 1.6, x + .012, .162, 1.65)
    k.box("brass", -.1, .15, 1.05, .1, .27, 1.09)
    k.box("brass", -.02, .19, 1.09, .02, .23, 1.72)
    k.box("brass", -.16, .19, 1.48, .16, .23, 1.53)
    k.box("leather", .25, -.1, 1.05, .55, .12, 1.1)


@prop("church")
def lectern(k):
    """A wooden lectern, its sloped desk and open book toward the reader (+Y), its face toward -Y: 1 tile."""
    k.cyl("walnut", (0, 0, 0), (0, 0, .08), .28, .24, segs=8, smooth=False)
    k.box("walnut", -.08, -.08, .08, .08, .08, 1.0)
    k.box("wood_dark", -.12, -.12, .9, .12, .12, 1.0)
    k.hull("walnut", [(-.32, -.22, 1.0), (.32, -.22, 1.0), (.32, .22, 1.0), (-.32, .22, 1.0),
                      (-.32, -.22, 1.24), (.32, -.22, 1.24), (.32, .22, 1.06), (-.32, .22, 1.06)])
    k.box("walnut", -.3, .2, 1.06, .3, .24, 1.1)
    for x0, x1 in ((-.26, -.01), (.01, .26)):
        k.lean("paper", x0, x1, .18, 1.075, -.18, 1.235, .015)
    k.box("canvas_red", -.01, .17, .92, .01, .19, 1.08)  # the ribbon


@prop("church")
def candle_stand(k):
    """A votive stand: three tiers of lit candles toward -Y, an offering box: 1 tile."""
    for x in (-.45, .42):
        for y in (-.25, .2):
            k.box("iron", x, y, 0, x + .03, y + .03, .78 if y < 0 else 1.0)
    for i in range(3):
        y, z = -.24 + i * .15, .78 + i * .1
        k.box("iron", -.45, y, z, .45, y + .15, z + .03)
        for j in range(5):
            x = -.36 + j * .18
            k.box("lamp_warm", x - .025, y + .05, z + .03, x + .025, y + .1, z + .08)
    k.box("brass", -.1, -.27, .45, .1, -.12, .6)
    k.box("iron", -.42, -.24, .45, .42, .2, .47)


def headstone_base(k, sw="concrete_dark"):
    k.box(sw, -.4, .22, 0, .4, .52, .1)


@prop("church")
def gravestone(k):
    """An upright headstone with a rounded top at the head of a kerbed grave, the inscription toward -Y: 1 tile."""
    headstone_base(k)
    prof = [(-.3, .1), (.3, .1)] + [(.3 * math.cos(i * math.pi / 6), .72 + .28 * math.sin(i * math.pi / 6)) for i in range(7)]
    k.extrude_y("limestone", .3, .42, prof)
    k.box("concrete_dark", -.18, .295, .72, .18, .3, .76)
    k.box("concrete_dark", -.22, .295, .58, .22, .3, .62)
    k.box("concrete_dark", -.15, .295, .48, .15, .3, .51)
    for x0, x1, y0, y1 in ((-.42, -.34, -.7, .22), (.34, .42, -.7, .22), (-.42, .42, -.7, -.62)):
        k.box("limestone", x0, y0, 0, x1, y1, .12)
    k.box("soil", -.34, -.62, 0, .34, .22, .07)


@prop("church")
def gravestone_cross(k):
    """A stone cross on a stepped plinth, the face toward -Y: 1 tile."""
    k.box("concrete_dark", -.4, -.3, 0, .4, .3, .14)
    k.box("concrete_dark", -.28, -.2, .14, .28, .2, .32)
    k.box("concrete", -.07, -.07, .32, .07, .07, 1.5)
    k.box("concrete", -.32, -.07, 1.08, .32, .07, 1.22)
    k.box("concrete_dark", -.2, -.205, .19, .2, -.2, .27)
    k.cyl("foliage_light", (.2, -.3, .14), (.2, -.3, .2), .1, .06, segs=6)


@prop("church")
def grave_tomb(k):
    """A chest tomb: a lidded stone box over the grave, panels on its long sides (-Y and +Y): 1 tile."""
    k.box("limestone", -.5, -.68, 0, .5, .68, .1)
    k.box("sandstone", -.4, -.6, .1, .4, .6, .72)
    k.box("limestone", -.46, -.66, .72, .46, .66, .8)
    k.box("limestone", -.4, -.58, .8, .4, .58, .84)
    for s in (-1, 1):
        for y in (-.35, .35):
            a, b = sorted((s * .4, s * .41))
            k.box("weathered", a, y - .16, .25, b, y + .16, .6)
    k.box("brass", -.15, -.2, .84, .15, .2, .845)


# ----- Dense urban: tenements, their yards and streets, run down. Edge pieces
# (on an outside wall) follow the architecture's anchor; the rest stand on
# their tile's middle, the multi-tile ones on their footprint's.
def fe_landing(k, hole=None):
    """A fire-escape landing 3 m along the wall, 0.92 m out, its railing; `hole` (x0, x1): the hatch a stair or ladder goes down."""
    y0, y1 = -1.0, -WF
    if hole:
        h0, h1 = hole
        k.box("iron", -1.45, y0, -.06, 1.45, -.92, 0)
        k.box("iron", -1.45, -.52, -.06, 1.45, y1, 0)
        k.box("iron", -1.45, -.92, -.06, h0, -.52, 0)
        if h1 < 1.45:
            k.box("iron", h1, -.92, -.06, 1.45, -.52, 0)
    else:
        k.box("iron", -1.45, y0, -.06, 1.45, y1, 0)
    for x in (-1.35, 1.35):
        k.wire("iron", (x, y1, -.75), (x, y0 + .06, -.06), .025)
    for x in (-1.43, 0, 1.43):
        k.wire("iron", (x, y0 + .02, 0), (x, y0 + .02, 1.0), .02)
    for z in (.5, 1.0):
        k.wire("iron", (-1.43, y0 + .02, z), (1.43, y0 + .02, z), .018)
        for x in (-1.43, 1.43):
            k.wire("iron", (x, y0 + .02, z), (x, y1, z), .018)
    for i in range(1, 12):
        x = -1.43 + i * 2.86 / 12
        k.wire("iron", (x, y0 + .02, 0), (x, y0 + .02, .5), .008)


@prop("tenement")
def fire_escape(k):
    """A fire-escape landing on an outside wall over 2 tiles (3 m along X), its stair through a hatch down to the landing below (2.5 m): an edge piece, the landing at the level's floor."""
    fe_landing(k, (.3, 1.42))
    for y in (-.92, -.52):
        k.wire("iron", (1.4, y, 0), (-.05, y, -2.5), .025)
    for i in range(1, 10):
        t = i / 10
        x, z = 1.4 - 1.45 * t, -2.5 * t
        k.box("iron", x - .07, -.9, z - .025, x + .07, -.54, z)
    k.wire("iron", (1.4, -.94, .9), (-.05, -.94, -1.6), .015)


@prop("tenement")
def fire_escape_ladder(k):
    """The lowest fire-escape landing (level 1 and up), a drop ladder hung through its hatch toward the street: an edge piece over 2 tiles."""
    fe_landing(k, (.55, 1.05))
    for x in (.62, .98):
        k.wire("iron", (x, -.72, .9), (x, -.72, -1.5), .02)
    for i in range(9):
        z = -1.4 + i * .28
        k.wire("iron", (.62, -.72, z), (.98, -.72, z), .012)
    k.box("iron", .55, -.8, .9, 1.05, -.64, .96)


@prop("tenement")
def boarded_window(k):
    """Plywood boards nailed across a window, outside its frame: an edge insert, as window_blinds."""
    y = -WF - .05
    for z0, z1, tilt in ((SILL + .05, SILL + .35, .04), (SILL + .45, SILL + .75, -.06), (SILL + .82, WIN_TOP - .05, .03)):
        x0, x1 = -H + .02, H - .02
        k.hull("weathered" if tilt < 0 else "pine", [(x0, y, z0 - tilt), (x1, y, z0 + tilt), (x1, y + .02, z0 + tilt), (x0, y + .02, z0 - tilt),
                                                    (x0, y, z1 - tilt), (x1, y, z1 + tilt), (x1, y + .02, z1 + tilt), (x0, y + .02, z1 - tilt)])
    k.hull("weathered", [(-.5, y - .02, SILL + .1), (-.38, y - .02, SILL + .1), (-.38, y, SILL + .1), (-.5, y, SILL + .1),
                         (.38, y - .02, WIN_TOP - .15), (.5, y - .02, WIN_TOP - .15), (.5, y, WIN_TOP - .15), (.38, y, WIN_TOP - .15)])
    k.box("signal_red", -.25, y - .004, SILL + .5, .2, y, SILL + .54)
    k.box("signal_red", -.25, y - .004, SILL + .62, .1, y, SILL + .66)


@prop("tenement")
def window_bars(k):
    """A rusty security grille over a ground-floor window, outside its frame: an edge insert."""
    y = -WF - .07
    x0, x1 = -H + .06, H - .06
    for z in (SILL - .02, (SILL + WIN_TOP) / 2, WIN_TOP + .02):
        k.box("rust", x0, y - .015, z - .02, x1, y + .015, z + .02)
    for i in range(7):
        x = x0 + .04 + i * (x1 - x0 - .08) / 6
        k.wire("rust" if i % 3 else "iron", (x, y, SILL - .04), (x, y, WIN_TOP + .04), .012)
    for x in (x0 + .02, x1 - .02):
        for z in (SILL, WIN_TOP):
            k.box("iron", x - .02, y, z - .02, x + .02, -WF, z + .02)


@prop("tenement")
def satellite_dish(k):
    """A satellite dish on a wall bracket, aimed out and up: an edge piece, high on the wall."""
    k.box("galvanised", -.08, -WF - .02, 2.0, .08, -WF, 2.16)
    k.wire("galvanised", (0, -WF - .02, 2.08), (0, -.4, 2.12), .02)
    c = Vector((0, -.42, 2.2))
    k.cyl("enamel_white", c, c + Vector((0, -.08, .05)), .32, .05, segs=10, smooth=False)
    k.wire("plastic_grey", c + Vector((0, -.04, -.2)), c + Vector((0, -.38, .12)), .012)
    k.box("plastic_grey", -.03, -.83, 2.29, .03, -.77, 2.35)
    k.wire("plastic_black", (0, -WF - .02, 2.08), (0, -WF - .02, 1.4), .006)


@prop("tenement")
def balcony_laundry(k):
    """A small balcony with a rusty railing, washing on a line and a pot plant: an edge piece on one tile, the slab at the level's floor."""
    y0 = -.9
    k.box("concrete", -H, y0, -.14, H, -WF, 0)
    k.box("concrete_dark", -H, y0 - .02, -.16, H, y0 + .02, -.1)
    for x in (-H + .03, H - .03):
        k.wire("rust", (x, y0 + .03, 0), (x, y0 + .03, 1.0), .02)
        k.wire("rust", (x, y0 + .03, 1.0), (x, -WF, 1.0), .018)
    k.wire("rust", (-H + .03, y0 + .03, 1.0), (H - .03, y0 + .03, 1.0), .02)
    for i in range(1, 10):
        x = -H + i * 1.5 / 10
        k.wire("rust", (x, y0 + .03, 0), (x, y0 + .03, 1.0), .008)
    for x in (-H + .1, H - .1):
        k.wire("galvanised", (x, -.5, 0), (x, -.5, 1.6), .012)
    k.wire("paint_white", (-H + .1, -.5, 1.55), (H - .1, -.5, 1.55), .005)
    for x0, w, h, sw in ((-.55, .3, .5, "fabric_blue"), (-.2, .22, .3, "linen"), (.08, .3, .55, "fabric_red"), (.42, .18, .25, "safety_yellow")):
        k.box(sw, x0, -.51, 1.55 - h, x0 + w, -.49, 1.55)
    k.cyl("terracotta", (.5, -.25, 0), (.5, -.25, .28), .12, .15, segs=6)
    k.blob("foliage", (.5, -.25, .42), .18, .8)


@prop("tenement")
def mailboxes(k):
    """A lobby's bank of mailboxes, one door hanging open, flyers on the floor below: 1 tile, its back to the wall."""
    y1, y0 = BACK, BACK - .2
    k.box("brass", -.55, y0, .9, .55, y1, 1.75)
    for r in range(3):
        for c in range(4):
            x, z = -.52 + c * .26, .93 + r * .27
            if (r, c) == (1, 2):
                k.box("wood_dark", x, y0 + .02, z, x + .24, y0 + .03, z + .25)
                k.box("brass", x - .2, y0 - .23, z, x - .19, y0 + .01, z + .25)
                continue
            k.box("brass" if (r + c) % 3 else "rust", x, y0 - .01, z, x + .24, y0, z + .25)
            k.box("iron", x + .1, y0 - .02, z + .17, x + .14, y0 - .01, z + .21)
    for x, y, a in ((-.3, y0 - .3, .3), (.05, y0 - .5, -.4), (.3, y0 - .25, 1.1), (-.1, y0 - .15, .7)):
        c, s_ = math.cos(a), math.sin(a)
        k.plate("paper" if x < .2 else "safety_yellow", [(x + c * dx - s_ * dy, y + s_ * dx + c * dy) for dx, dy in ((-.1, -.07), (.1, -.07), (.1, .07), (-.1, .07))], 0, .004)


# ----- Fences and the court.
def chainlink(k, cut=None):
    """A chain-link run over 2 tiles (3 m along X) on the tile's centre line: posts, top rail, the mesh as diagonal wires; cut(x, z) leaves a wire out."""
    for x in (-1.45, 0, 1.45):
        k.cyl("galvanised", (x, 0, 0), (x, 0, 2.05), .035, segs=5)
    k.cyl("galvanised", (-1.45, 0, 2.0), (1.45, 0, 2.0), .02, segs=4)
    k.wire("galvanised", (-1.45, 0, .05), (1.45, 0, .05), .008)
    step, top = .27, 2.0
    for sgn in (1, -1):
        # lines x - sgn*z = c over the rectangle [-1.45, 1.45] x [0.05, 2.0]
        c = -1.45 - (top if sgn > 0 else -.05) - step
        while c < 1.45 + (top if sgn < 0 else -.05) + step:
            pts = []
            for z in (.05, top):
                x = c + sgn * z
                if -1.45 <= x <= 1.45:
                    pts.append((x, z))
            for x in (-1.45, 1.45):
                z = (x - c) * sgn
                if .05 <= z <= top:
                    pts.append((x, z))
            pts = sorted(set((round(a, 4), round(b, 4)) for a, b in pts))
            if len(pts) >= 2 and (pts[0][0] - pts[-1][0]) ** 2 + (pts[0][1] - pts[-1][1]) ** 2 > .01:
                (xa, za), (xb, zb) = pts[0], pts[-1]
                if not (cut and cut((xa + xb) / 2, (za + zb) / 2)):
                    k.wire("galvanised", (xa, 0, za), (xb, 0, zb), .006)
            c += step


@prop("yard")
def chainlink_fence(k):
    """A chain-link fence over 2 tiles (3 m along X), its line on the tiles' middle: 2 x 1 tiles."""
    chainlink(k)


@prop("yard")
def chainlink_barbed(k):
    """A chain-link fence with three strands of barbed wire on arms leaning toward -Y: 2 x 1 tiles."""
    chainlink(k)
    for x in (-1.45, 0, 1.45):
        k.wire("galvanised", (x, 0, 2.05), (x, -.3, 2.35), .015)
    for i in range(3):
        t = (i + 1) / 3
        k.wire("iron", (-1.45, -.3 * t, 2.05 + .3 * t), (1.45, -.3 * t, 2.05 + .3 * t), .005)


@prop("yard")
def chainlink_torn(k):
    """A chain-link fence cut and peeled back at the foot of one bay, a post leaning: 2 x 1 tiles."""
    chainlink(k, cut=lambda x, z: -1.2 < x < -.3 and z < 1.0)
    for i in range(4):
        x = -1.1 + i * .22
        k.wire("galvanised", (x, 0, .9), (x - .1, -.35, .15 + i * .08), .006)
    k.wire("galvanised", (-1.2, -.05, .55), (-.3, -.3, .45), .006)


@prop("court")
def basketball_hoop(k):
    """A street basketball hoop, its post at the back of the tile and the rim reaching out over -Y: 1 tile."""
    k.box("concrete", -.25, .2, 0, .25, .6, .08)
    k.cyl("rust", (0, .4, 0), (0, .4, 3.0), .07, segs=8)
    k.cyl("signal_red", (0, .4, .08), (0, .4, 1.6), .1, segs=8)
    k.box("iron", -.05, -.45, 2.85, .05, .4, 2.95)
    k.wire("iron", (0, .4, 2.4), (0, -.4, 2.9), .02)
    k.box("enamel_white", -.9, -.52, 2.7, .9, -.47, 3.75)
    k.box("rust", .3, -.525, 2.72, .85, -.52, 2.95)
    for x0, z0, x1, z1 in ((-.3, 2.98, .3, 3.02), (-.3, 3.4, .3, 3.44), (-.3, 2.98, -.26, 3.44), (.26, 2.98, .3, 3.44)):
        k.box("black_paint", x0, -.528, z0, x1, -.52, z1)
    c = Vector((0, -.75, 3.05))
    n = 8
    ring = [c + Vector((.23 * math.cos(i * 2 * math.pi / n), .23 * math.sin(i * 2 * math.pi / n), 0)) for i in range(n)]
    for i in range(n):
        k.wire("hazard_orange", ring[i], ring[(i + 1) % n], .012)
    k.wire("hazard_orange", (0, -.52, 3.05), (0, -.53, 3.05), .02)
    for i in range(0, n, 2):
        p = ring[i]
        k.wire("galvanised", p, c + (p - c) * .55 + Vector((0, 0, -.38)), .005)


@prop("court")
def bleachers(k):
    """Three rows of aluminium bleachers, the seats toward -Y: 2 x 1 tiles."""
    for i in range(3):
        y, z = -.45 + i * .42, .42 + i * .36
        k.box("aluminium", -1.42, y - .14, z - .04, 1.42, y + .14, z)
        k.box("aluminium", -1.42, y - .38, z - .38, 1.42, y - .16, z - .35)
    for x in (-1.35, 0, 1.35):
        k.hull("galvanised", [(x - .03, -.62, 0), (x + .03, -.62, 0), (x + .03, .6, 0), (x - .03, .6, 0),
                              (x - .03, .5, 1.14), (x + .03, .5, 1.14), (x + .03, .6, 1.14), (x - .03, .6, 1.14)])
    k.wire("galvanised", (-1.42, .66, 1.14), (1.42, .66, 1.14), .02)
    k.wire("galvanised", (-1.42, .66, 1.14), (-1.42, .66, 1.6), .02)
    k.wire("galvanised", (1.42, .66, 1.14), (1.42, .66, 1.6), .02)
    k.wire("galvanised", (-1.42, .66, 1.6), (1.42, .66, 1.6), .02)


# ----- The street.
@prop("street_decay")
def bus_shelter(k):
    """A bus shelter, its open side toward -Y: a lit advert at one end, one back pane smashed, a bench: 2 x 1 tiles."""
    yb = .55
    for x in (-1.4, 1.4):
        for y in (-.45, yb):
            k.box("aluminium", x - .03, y - .03, 0, x + .03, y + .03, 2.3)
    k.box("aluminium", -1.48, -.58, 2.3, 1.48, yb + .08, 2.38)
    k.box("glass_light", -1.37, yb - .01, .15, -.02, yb + .01, 2.25)
    k.box("aluminium", -.02, yb - .03, 0, .02, yb + .03, 2.3)
    for p in ((.1, .15, .45, .7), (.9, .15, 1.37, .4), (.02, 1.9, 1.37, 2.25)):
        k.box("glass_light", p[0], yb - .01, p[1], p[2], yb + .01, p[3])
    k.hull("glass_light", [(.45, yb - .01, .7), (.2, yb - .01, .7), (.2, yb + .01, .7), (.45, yb + .01, .7),
                           (.3, yb - .01, 1.2), (.2, yb - .01, 1.0), (.2, yb + .01, 1.0), (.3, yb + .01, 1.2)])
    for x, y in ((.5, .2), (.7, .35), (.9, .1), (.3, .0)):
        k.plate("glass_light", [(x, y), (x + .08, y + .02), (x + .03, y + .07)], 0, .01)
    k.box("aluminium", 1.37, -.4, .15, 1.43, yb - .05, 2.0)
    k.box("lamp_cool", 1.365, -.35, .3, 1.37, yb - .1, 1.85)
    k.box("lamp_cool", 1.43, -.35, .3, 1.435, yb - .1, 1.85)
    k.box("galvanised", -1.2, yb - .35, .45, .9, yb - .05, .5)
    for x in (-1.0, .7):
        k.box("galvanised", x - .02, yb - .3, 0, x + .02, yb - .1, .45)
    k.box("black_paint", -1.1, yb - .015, 1.1, -.5, yb - .01, 1.16)
    k.box("black_paint", -1.0, yb - .015, 1.0, -.7, yb - .01, 1.04)


@prop("street_decay")
def fire_hydrant(k):
    """A fire hydrant, its pumper nozzle toward -Y: on a tile, no cover."""
    k.cyl("signal_red", (0, 0, 0), (0, 0, .06), .16, segs=8, smooth=False)
    k.cyl("signal_red", (0, 0, .06), (0, 0, .55), .11, segs=8)
    k.cyl("signal_red", (0, 0, .55), (0, 0, .6), .14, segs=8, smooth=False)
    k.cyl("signal_red", (0, 0, .6), (0, 0, .72), .12, .05, segs=8)
    k.cyl("iron", (0, 0, .72), (0, 0, .76), .03, segs=5, smooth=False)
    k.cyl("signal_red", (0, 0, .38), (0, -.18, .38), .07, segs=8)
    k.cyl("iron", (0, -.18, .38), (0, -.2, .38), .05, segs=5, smooth=False)
    for x in (-1, 1):
        k.cyl("signal_red", (0, 0, .45), (x * .16, 0, .45), .045, segs=6)
        k.cyl("rust", (x * .16, 0, .45), (x * .18, 0, .45), .04, segs=5, smooth=False)


@prop("street_decay")
def wheelie_bins(k):
    """Two wheelie bins, one lid flung open, a bag dumped beside: 1 tile, their backs to +Y."""
    for x, sw, open_ in ((-.35, "bin_green", False), (.32, "enamel_grey", True)):
        k.hull(sw, [(x - .25, -.28, .05), (x + .25, -.28, .05), (x + .25, .3, .05), (x - .25, .3, .05),
                    (x - .29, -.34, 1.0), (x + .29, -.34, 1.0), (x + .29, .34, 1.0), (x - .29, .34, 1.0)])
        if open_:
            k.box(sw, x - .3, .34, 1.0, x + .3, .4, 1.62)
            k.blob("plastic_black", (x, 0, 1.02), .22, .6, sx=1.1)
        else:
            k.box(sw, x - .3, -.37, 1.0, x + .3, .36, 1.05)
        k.wire("plastic_black", (x - .26, .38, .95), (x + .26, .38, .95), .02)
        for dx in (-.2, .2):
            k.cyl("rubber", (x + dx - .03, .28, .1), (x + dx + .03, .28, .1), .1, segs=8, smooth=False)
    k.blob("plastic_black", (.05, -.55, .2), .25, .8, sx=1.2, turn=.4)
    k.cyl("plastic_black", (.05, -.55, .36), (.08, -.58, .46), .05, .01, segs=4, smooth=False)


@prop("street_decay")
def street_lamp_broken(k):
    """A street lamp knocked askew, its head smashed and dark: a tile's middle, as street_lamp."""
    k.cyl("black_paint", (0, 0, 0), (0, 0, .45), .14, .12, segs=8)
    top = Vector((.45, -.1, 3.6))
    k.cyl("black_paint", (0, 0, .45), top, .075, .055, segs=8)
    head = top + Vector((.1, -.6, -.15))
    k.cyl("black_paint", top - Vector((.02, 0, .12)), head, .035, segs=6)
    k.hull("black_paint", [(head.x - .14, head.y - .25, head.z - .2), (head.x + .14, head.y - .25, head.z - .2), (head.x + .14, head.y + .2, head.z - .02), (head.x - .14, head.y + .2, head.z - .02),
                           (head.x - .14, head.y - .25, head.z - .07), (head.x + .14, head.y - .25, head.z - .07), (head.x + .14, head.y + .2, head.z + .11), (head.x - .14, head.y + .2, head.z + .11)])
    for x, y in ((.4, -.6), (.6, -.5), (.5, -.85), (.3, -.75)):
        k.plate("glass_light", [(x, y), (x + .07, y + .01), (x + .02, y + .06)], 0, .01)
    k.box("concrete_dark", -.25, -.25, 0, .25, .25, .02)


@prop("street_decay")
def dumpster_overflow(k):
    """A dumpster, both lids thrown back, bags heaped over the brim and spilling round it: 1 tile."""
    k.box("bin_green", -.7, -.45, .15, .7, .45, 1.08)
    k.box("rust", -.7, -.455, .15, -.1, -.45, .5)
    k.box("galvanised", -.72, -.47, 1.04, .72, .47, 1.1)
    k.hull("plastic_black", [(-.7, .47, 1.1), (.7, .47, 1.1), (.7, .52, 1.1), (-.7, .52, 1.1),
                             (-.7, .58, 1.9), (.7, .58, 1.9), (.7, .63, 1.9), (-.7, .63, 1.9)])
    for x in (-.58, .58):
        for y in (-.33, .33):
            k.box("galvanised", x - .04, y - .03, .1, x + .04, y + .03, .15)
            k.cyl("rubber", (x - .025, y, .07), (x + .025, y, .07), .07, segs=6)
    for c, r, sx, t in (((-.35, -.1, 1.15), .32, 1.1, 0), ((.25, .05, 1.2), .3, 1.2, .8), ((-.05, -.2, 1.4), .24, 1, 1.4), ((.4, -.2, 1.12), .22, 1.3, .3)):
        k.blob("plastic_black", c, r, .7, sx=sx, turn=t)
    k.box("cardboard", .05, .15, 1.08, .45, .4, 1.5)
    for c, r, t in (((-.6, -.75, .2), .26, .2), ((.1, -.8, .17), .22, 1.0)):
        k.blob("plastic_black", c, r, .75, sx=1.2, turn=t)


# ----- Junk, fire, grime.
@prop("junk")
def burning_barrel(k):
    """A rusted drum with a fire in it, scrap wood sticking out: 1 tile (light it with the game's fire)."""
    k.cyl("rust", (0, 0, 0), (0, 0, .88), .29, segs=10)
    for z in (.29, .59):
        k.cyl("iron", (0, 0, z - .012), (0, 0, z + .012), .3, segs=10)
    for i in range(5):
        a = i * 2 * math.pi / 5
        x, y = .28 * math.cos(a), .28 * math.sin(a)
        k.box("black_paint", x - .025, y - .025, .1, x + .025, y + .025, .16)
    k.cyl("led_red", (0, 0, .8), (0, 0, .86), .27, segs=10, smooth=False)
    for (x, y), h, r in (((0, 0), .6, .18), ((.12, -.08), .4, .12), ((-.13, .05), .45, .11), ((.05, .13), .32, .1)):
        k.cyl("fire", (x, y, .86), (x, y, .86 + h), r, .01, segs=5, smooth=False)
    for (x, y), h, r in (((.02, -.02), .32, .09), ((-.09, .02), .22, .06)):
        k.cyl("lamp_warm", (x, y, .86), (x, y, .86 + h), r, .01, segs=5, smooth=False)
    for p0, p1 in (((-.15, .1, .6), (-.32, .25, 1.1)), ((.12, -.15, .6), (.3, -.2, 1.05))):
        k.cyl("wood_dark", p0, p1, .03, segs=4, smooth=False)


@prop("junk")
def trash_bags(k):
    """A heap of black bin bags, one split: on a tile, low cover."""
    for c, r, sx, sy, t in (((-.25, .1, .22), .3, 1.1, 1, .3), ((.22, .15, .2), .28, 1, 1.2, 1.2), ((0, -.22, .2), .27, 1.2, 1, 2.0),
                            ((-.02, .05, .5), .24, 1, 1, .7), ((.4, -.3, .15), .2, 1.1, 1, .1)):
        k.blob("plastic_black", c, r, .78, sx=sx, sy=sy, turn=t)
    for x, y, z in ((-.02, .05, .7), (.22, .15, .42), (-.25, .1, .45)):
        k.cyl("plastic_black", (x, y, z - .03), (x + .02, y, z + .08), .04, .01, segs=4, smooth=False)
    for x, y, a in ((.45, .1, .5), (.55, -.05, 1.3), (-.45, -.35, 2.1)):
        c_, s_ = math.cos(a), math.sin(a)
        k.plate("paper", [(x + c_ * dx - s_ * dy, y + s_ * dx + c_ * dy) for dx, dy in ((-.08, -.05), (.08, -.05), (.08, .05), (-.08, .05))], 0, .004)
    k.cyl("galvanised", (.6, .3, .04), (.72, .32, .04), .035, segs=6)


@prop("junk")
def trash_pile(k):
    """Dumped rubbish: bags, squashed boxes, a tyre, cans and papers: on a tile, low cover."""
    k.blob("plastic_black", (-.3, .2, .22), .3, .75, sx=1.1, turn=.4)
    k.blob("plastic_black", (.05, .3, .18), .24, .8, turn=1.3)
    k.hull("cardboard", [(.0, -.35, 0), (.5, -.3, 0), (.5, .1, 0), (0, .05, 0), (.02, -.35, .12), (.48, -.3, .2), (.48, .1, .2), (.02, .05, .12)])
    k.box("cardboard", -.45, -.45, 0, -.05, -.15, .06)
    k.ring("rubber", (.35, .3, .1), (0, 0, 1), .3, .17, .2)
    for x, y in ((-.55, -.05), (.6, -.35), (.15, -.55)):
        k.cyl("signal_red" if x < 0 else "galvanised", (x, y, .035), (x + .11, y + .03, .035), .033, segs=6)
    for x, y, a in ((-.2, -.6, .3), (.55, .0, 1.1), (-.6, .4, 2.0), (.2, .62, .7)):
        c_, s_ = math.cos(a), math.sin(a)
        k.plate("paper", [(x + c_ * dx - s_ * dy, y + s_ * dx + c_ * dy) for dx, dy in ((-.1, -.07), (.1, -.07), (.1, .07), (-.1, .07))], 0, .004)
    k.cyl("glass_dark", (-.1, -.25, .04), (.12, -.2, .04), .04, segs=6)


@prop("junk")
def tyre_stack(k):
    """Old tyres: three stacked and one leaning on them: on a tile, low cover."""
    def tyre(c, axis):
        k.ring("rubber", c, axis, .32, .18, .2)
    for i in range(3):
        tyre((-.15 + i * .03, .05 - i * .02, .1 + i * .2), Vector((0, 0, 1)))
    tyre((.42, -.15, .34), Vector((.95, -.1, .3)).normalized())


@prop("junk")
def mattress_dumped(k):
    """A stained mattress leaning against a wall, its face toward -Y: 1 tile, its back to the wall."""
    yb, yt = BACK - .55, BACK - .25
    k.lean("linen", -.7, .7, yb, 0, yt, 1.9, .22)
    lerp = lambda z: yb + (yt - yb) * z / 1.9
    for x0, x1, z0, z1, sw in ((-.4, .1, .7, 1.1, "plastic_beige"), (.2, .5, 1.3, 1.55, "rust"), (-.55, -.25, .25, .45, "soil"), (.1, .6, .15, .3, "fabric_grey")):
        k.lean(sw, x0, x1, lerp(z0) - .004, z0, lerp(z1) - .004, z1, .004)
    for z in (.6, 1.2):
        k.lean("canvas_white", -.7, .7, lerp(z) - .002, z, lerp(z + .03) - .002, z + .03, .002)


@prop("junk")
def armchair_dumped(k):
    """An armchair dumped on the street, its seat cushion gone and springs showing, the back torn: 1 tile, the seat toward -Y."""
    k.box("upholstery_tan", -.45, -.4, .1, .45, .35, .35)
    for x in (-.45, .3):
        k.box("upholstery_tan", x, -.4, .35, x + .15, .35, .62)
    k.lean("upholstery_tan", -.3, .3, .2, .35, .3, 1.0, .15)
    for i in range(4):
        x = -.22 + i * .15
        k.wire("iron", (x, -.35, .37), (x, .2, .37), .012)
    for i in range(3):
        y = -.28 + i * .2
        k.wire("iron", (-.28, y, .38), (.28, y, .38), .01)
    k.blob("linen", (.05, .3, .75), .12, .7, sx=1.3)
    k.box("rust", -.25, .18, .55, -.05, .2, .8)
    for x in (-.4, .4):
        for y in (-.35, .3):
            k.box("wood_dark", x - .03, y - .03, 0, x + .03, y + .03, .1)
    k.box("upholstery_tan", .35, -.75, 0, .8, -.4, .12)


@prop("junk")
def rubble_pile(k):
    """Broken concrete and brick in a heap, rusty rebar sticking out, dust round it: on a tile, low cover."""
    k.plate("concrete_dark", [(-.7, -.2), (-.4, -.65), (.3, -.7), (.7, -.2), (.6, .5), (0, .7), (-.6, .45)], 0, .01)
    chunks = (((-.25, -.1, 0), (.5, .4, .3), .3, "concrete"), ((.2, .15, 0), (.45, .35, .25), 1.0, "concrete"),
              ((-.05, .05, .22), (.35, .3, .2), .6, "concrete_dark"), ((.35, -.3, 0), (.25, .12, .1), .2, "brick"),
              ((-.45, .3, 0), (.24, .12, .09), 1.4, "brick"), ((.05, -.45, 0), (.3, .2, .12), 2.4, "concrete"))
    for (x, y, z), (w, d, h), a, sw in chunks:
        c_, s_ = math.cos(a), math.sin(a)
        pts = [(x + c_ * dx - s_ * dy, y + s_ * dx + c_ * dy) for dx, dy in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
        k.hull(sw, [(px, py, z) for px, py in pts] + [((px + x) / 2 + (px - x) * .3, (py + y) / 2 + (py - y) * .3, z + h) for px, py in pts])
    for p0, p1 in (((-.1, 0, .2), (-.3, -.2, .75)), ((.15, .1, .2), (.4, .25, .65)), ((0, -.05, .3), (.1, -.25, .7))):
        k.wire("rust", p0, p1, .012)


@prop("junk")
def graffiti_tag(k):
    """Bubble-letter graffiti on an outside wall, outlined in black, drips below: an edge piece."""
    y = -WF
    # Fat letters crowding each other, one outline round them all, a highlight or two, short drips.
    letters = ((-.48, 1.08, .15, .25, "signal_red", .2), (-.24, 1.12, .14, .27, "safety_yellow", -.3),
               (0, 1.06, .15, .24, "signal_red", .5), (.24, 1.1, .14, .28, "safety_yellow", .1), (.47, 1.05, .13, .22, "signal_red", -.4))
    for cx, cz, rx, rz, sw, t in letters:
        k.wall_blob("black_paint", cx, cz, rx + .05, rz + .05, y, .003, n=8, turn=t)
    for cx, cz, rx, rz, sw, t in letters:
        k.wall_blob(sw, cx, cz, rx, rz, y - .003, .003, n=8, turn=t)
    for cx, cz in ((-.52, 1.2), (.2, 1.24)):
        k.wall_blob("enamel_white", cx, cz, .035, .05, y - .006, .002, n=5)
    for x, l in ((-.45, .12), (-.02, .2), (.42, .09)):
        k.box("signal_red", x - .008, y - .006, .84 - l, x + .008, y, .86)
    k.box("municipal_blue", -.6, y - .003, .55, .55, y, .58)


@prop("junk")
def graffiti_scrawl(k):
    """Tags and scrawls in a run along an outside wall, at hand height: an edge piece."""
    y = -WF
    for x0, z0, x1, z1, sw in ((-.6, 1.1, -.2, 1.16, "black_paint"), (-.55, .95, -.3, 1.0, "black_paint"),
                               (-.1, 1.3, .4, 1.34, "municipal_blue"), (0, 1.15, .45, 1.2, "municipal_blue"),
                               (.1, .7, .6, .74, "fabric_green")):
        k.hull(sw, [(x0, y, z0), (x1, y, z1 - .04), (x1, y - .004, z1 - .04), (x0, y - .004, z0),
                    (x0 + .02, y, z0 + .06), (x1 + .02, y, z1 + .02), (x1 + .02, y - .004, z1 + .02), (x0 + .02, y - .004, z0 + .06)])
    for x in (-.6, -.48, -.36, -.24):
        k.hull("black_paint", [(x, y, 1.0), (x + .03, y, 1.0), (x + .03, y - .004, 1.0), (x, y - .004, 1.0),
                               (x + .06, y, 1.3), (x + .09, y, 1.3), (x + .09, y - .004, 1.3), (x + .06, y - .004, 1.3)])
    k.wall_blob("signal_red", .45, 1.0, .12, .12, y, .004, n=5)
    k.wall_blob("enamel_white", .45, 1.0, .06, .06, y - .004, .003, n=5)


@prop("junk")
def wall_grime(k):
    """Grime on an outside wall: rust streaks and water stains running down from above, rising damp at its foot: an edge piece over a whole level."""
    y = -WF
    k.box("weathered", -H, y - .003, 0, H, y, .35)
    k.box("concrete_dark", -H, y - .004, 0, H, y, .12)
    for x, w, z0, sw in ((-.55, .12, 1.1, "concrete_dark"), (-.2, .07, 1.6, "rust"), (.1, .18, .7, "concrete_dark"), (.42, .06, 1.4, "rust"), (.6, .1, 1.9, "concrete_dark")):
        k.hull(sw, [(x - w / 2, y, LEVEL), (x + w / 2, y, LEVEL), (x + w / 2, y - .003, LEVEL), (x - w / 2, y - .003, LEVEL),
                    (x - w / 5, y, z0), (x + w / 5, y, z0), (x + w / 5, y - .003, z0), (x - w / 5, y - .003, z0)])


@prop("junk")
def ground_cracks(k):
    """Cracks across a tile of pavement or tarmac, weeds in the widest: on a tile's floor, no cover."""
    z = .004
    runs = (((-.75, -.4), (-.35, -.25), (-.1, .05), (.3, .1), (.55, .45), (.75, .5)),
            ((-.1, .05), (-.05, .4), (.1, .75)),
            ((.3, .1), (.45, -.2), (.4, -.5), (.6, -.75)))
    for run in runs:
        for i in range(len(run) - 1):
            w0 = .035 if i == 0 else .025
            k.strip("rubber", run[i], run[i + 1], w0, .02, 0, z)
    k.blob("foliage_light", (-.1, .05, .02), .07, .6)
    k.blob("foliage", (.42, -.25, .02), .06, .6)
    k.plate("concrete_dark", [(-.5, -.6), (-.2, -.65), (-.15, -.45), (-.45, -.4)], 0, .003)


@prop("junk")
def ground_grime(k):
    """Dirt on the ground: a spread of mud, a dark stain, a puddle, litter: on a tile's floor, no cover."""
    k.plate("soil", [(-.7, -.1), (-.45, -.55), (0, -.6), (.2, -.3), (.05, .05), (-.4, .15)], 0, .003)
    k.plate("concrete_dark", [(.1, .2), (.45, .05), (.7, .3), (.55, .6), (.2, .55)], 0, .004)
    k.plate("glass_dark", [(-.6, .3), (-.3, .25), (-.2, .45), (-.35, .65), (-.6, .6)], 0, .005)
    for x, y, a in ((.35, -.45, .5), (-.1, .6, 1.9)):
        c_, s_ = math.cos(a), math.sin(a)
        k.plate("paper", [(x + c_ * dx - s_ * dy, y + s_ * dx + c_ * dy) for dx, dy in ((-.08, -.05), (.08, -.05), (.08, .05), (-.08, .05))], 0, .006)
    k.cyl("signal_red", (.55, -.1, .035), (.66, -.05, .035), .033, segs=6)
    k.cyl("plastic_beige", (-.2, -.2, .006), (-.17, -.18, .006), .006, segs=3)


# ----- Kitchens and bathrooms (the flats'). One tile each, the back to the
# wall at +Y; kitchen units fill their tile edge to edge so a run of them
# joins up.
KY0, KY1 = BACK - .6, BACK  # a base unit's front and back


def base_units(k, x0, x1, doors=2, missing=None, top="oak"):
    """Base cupboards from x0 to x1 with a worktop; `missing`: the door that's come off (its cupboard dark)."""
    k.box("black_paint", x0, KY0 + .06, 0, x1, KY1, .1)
    k.box("paint_white", x0, KY0, .1, x1, KY1, .86)
    w = (x1 - x0) / doors
    for i in range(doors):
        a, b = x0 + i * w + .006, x0 + (i + 1) * w - .006
        if i == missing:
            k.box("wood_dark", a + .02, KY0 - .002, .14, b - .02, KY0, .82)
            continue
        k.box("paint_white", a, KY0 - .02, .12, b, KY0, .84)
        k.box("chrome", (a + b) / 2 - .08, KY0 - .04, .76, (a + b) / 2 + .08, KY0 - .02, .78)
    if top:
        k.box(top, x0, KY0 - .03, .86, x1, KY1, .9)


def wall_units(k, x0, x1, doors=2, hanging=None):
    """Wall cupboards above the worktop, a tiled splashback below them; `hanging`: a door swung open."""
    k.box("ceramic", x0, KY1 - .01, .9, x1, KY1, 1.45)
    y0 = KY1 - .34
    k.box("paint_white", x0, y0, 1.45, x1, KY1, 2.15)
    w = (x1 - x0) / doors
    for i in range(doors):
        a, b = x0 + i * w + .006, x0 + (i + 1) * w - .006
        if i == hanging:
            k.box("wood_dark", a + .02, y0 - .002, 1.49, b - .02, y0, 2.11)
            k.box("paint_white", a - .02, y0 - (b - a), 1.47, a, y0, 2.13)
            continue
        k.box("paint_white", a, y0 - .02, 1.47, b, y0, 2.13)
        k.box("chrome", (a + b) / 2 - .08, y0 - .04, 1.5, (a + b) / 2 + .08, y0 - .02, 1.52)


@prop("kitchen")
def kitchen_counter(k):
    """Worktop on base cupboards, wall cupboards above, a microwave, kettle and toaster: 1 tile against a wall."""
    base_units(k, -H, H)
    wall_units(k, -H, H)
    k.box("enamel_white", -.6, KY1 - .42, .9, -.1, KY1 - .04, 1.2)
    k.box("glass_dark", -.57, KY1 - .425, .94, -.25, KY1 - .42, 1.16)
    k.box("plastic_black", -.22, KY1 - .425, .96, -.13, KY1 - .42, 1.16)
    k.box("led_green", -.2, KY1 - .43, 1.12, -.15, KY1 - .425, 1.14)
    k.cyl("steel", (.15, KY1 - .2, .9), (.15, KY1 - .2, 1.1), .08, .07, segs=8)
    k.box("plastic_black", .2, KY1 - .22, 1.0, .26, KY1 - .18, 1.06)
    k.box("steel", .38, KY1 - .3, .9, .62, KY1 - .14, 1.06)
    for x in (.44, .52):
        k.box("black_paint", x, KY1 - .27, 1.06, x + .05, KY1 - .17, 1.062)


@prop("kitchen")
def kitchen_sink(k):
    """A steel sink and drainer in the worktop, a mixer tap, a rack of plates, cupboards above and below: 1 tile against a wall."""
    base_units(k, -H, H)
    wall_units(k, -H, H)
    k.box("steel", -.55, KY0 + .04, .9, .25, KY1 - .06, .905)
    k.box("iron", -.5, KY0 + .08, .905, -.08, KY1 - .1, .907)
    for i in range(6):
        x = -.04 + i * .05
        k.box("galvanised", x, KY0 + .08, .905, x + .025, KY1 - .1, .91)
    k.cyl("chrome", (-.29, KY1 - .08, .9), (-.29, KY1 - .08, 1.2), .02, segs=6)
    k.cyl("chrome", (-.29, KY1 - .08, 1.2), (-.29, KY1 - .26, 1.12), .015, segs=6)
    k.box("galvanised", .35, KY0 + .1, .9, .68, KY1 - .1, .94)
    for i in range(5):
        x = .38 + i * .06
        k.box("ceramic", x, KY0 + .14, .94, x + .012, KY1 - .14, 1.18)


@prop("kitchen")
def kitchen_stove(k):
    """A freestanding cooker between two short counters, a pot on the hob, the hood above: 1 tile against a wall."""
    base_units(k, -H, -.3, doors=1)
    base_units(k, .3, H, doors=1)
    k.box("ceramic", -H, KY1 - .01, .9, H, KY1, 1.6)
    k.box("enamel_white", -.3, KY0 + .02, 0, .3, KY1, .88)
    k.box("black_paint", -.3, KY0 + .02, .88, .3, KY1, .9)
    k.box("glass_dark", -.24, KY0 + .015, .2, .24, KY0 + .02, .62)
    k.box("chrome", -.2, KY0 - .02, .68, .2, KY0 + .02, .7)
    for i in range(4):
        x = -.2 + i * .13
        k.box("enamel_grey", x - .02, KY0 - .01, .78, x + .02, KY0 + .01, .82)
    for x, y in ((-.14, KY0 + .18), (.14, KY0 + .18), (-.14, KY1 - .17), (.14, KY1 - .17)):
        k.cyl("iron", (x, y, .9), (x, y, .91), .08, segs=6, smooth=False)
    k.cyl("steel", (.14, KY0 + .18, .91), (.14, KY0 + .18, 1.07), .11, segs=6)
    k.box("black_paint", .25, KY0 + .16, 1.02, .4, KY0 + .2, 1.04)
    k.hull("steel", [(-.35, KY1 - .5, 1.6), (.35, KY1 - .5, 1.6), (.35, KY1, 1.6), (-.35, KY1, 1.6),
                     (-.12, KY1 - .25, 1.85), (.12, KY1 - .25, 1.85), (.12, KY1, 1.85), (-.12, KY1, 1.85)])
    k.box("steel", -.12, KY1 - .25, 1.85, .12, KY1, 2.45)
    for x0 in (-H, .3):
        k.box("paint_white", x0, KY1 - .34, 1.45, x0 + .45, KY1, 2.15)


@prop("kitchen")
def kitchen_fridge(k):
    """A tall fridge-freezer, notes and magnets on its door, a tall cupboard beside it: 1 tile against a wall."""
    y0 = BACK - .66
    k.box("enamel_white", -.72, y0, 0, -.02, BACK, 1.85)
    k.box("plastic_grey", -.72, y0 - .005, 1.14, -.02, y0, 1.16)
    for z0, z1 in ((.3, .9), (1.3, 1.7)):
        k.box("chrome", -.1, y0 - .04, z0, -.07, y0, z1)
    for x, z, sw in ((-.5, 1.4, "paper"), (-.35, 1.5, "safety_yellow"), (-.6, 1.25, "signal_red"), (-.45, 1.0, "paper")):
        k.box(sw, x, y0 - .006, z, x + .12, y0, z + .15)
    k.box("cardboard", -.6, y0 + .1, 1.85, -.4, y0 + .4, 2.15)
    k.box("paint_white", .04, KY0 + .02, 0, H, BACK, 2.15)
    k.box("paint_white", .05, KY0, .05, H - .01, KY0 + .02, 2.12)
    k.box("chrome", .1, KY0 - .02, 1.0, .12, KY0, 1.2)


@prop("kitchen")
def kitchen_counter_cluttered(k):
    """A run-down kitchen counter: a door off below, a wall cupboard swung open, pizza boxes, bottles, takeaway, a pan, crushed cans, grease on the splashback: 1 tile against a wall."""
    base_units(k, -H, H, missing=1, top="plastic_beige")
    wall_units(k, -H, H, hanging=0)
    k.box("soil", -.4, KY1 - .012, .95, .1, KY1 - .01, 1.2)
    k.box("rust", .2, KY1 - .012, 1.0, .4, KY1 - .01, 1.35)
    for i in range(3):
        k.box("cardboard", -.68, KY0 + .02, .9 + i * .045, -.24, KY1 - .12, .94 + i * .045)
    k.box("signal_red", -.6, KY0 + .015, 1.0, -.3, KY0 + .02, 1.03)
    for x, sw, h in ((-.1, "glass_dark", .3), (-.02, "fabric_green", .28), (.07, "glass_dark", .25)):
        k.cyl(sw, (x, KY1 - .12, .9), (x, KY1 - .12, .9 + h), .035, segs=6)
    k.box("paint_white", .14, KY0 + .05, .9, .3, KY0 + .18, 1.0)
    k.box("paint_white", .32, KY0 + .1, .9, .48, KY0 + .23, 1.0)
    k.cyl("iron", (.6, KY1 - .22, .9), (.6, KY1 - .22, .96), .12, segs=8)
    k.cyl("iron", (.6, KY1 - .1, .93), (.6, KY0 - .05, .95), .015, segs=4)
    for x, y in ((.05, KY0 + .05), (-.15, KY0 + .1)):
        k.cyl("galvanised", (x, y, .92), (x + .1, y + .02, .92), .03, segs=5)


@prop("kitchen")
def washing_machine(k):
    """A front-loading washing machine, a laundry basket heaped with clothes beside it: 1 tile against a wall."""
    y0 = BACK - .6
    k.box("enamel_white", -.68, y0, 0, -.08, BACK, .85)
    k.box("plastic_grey", -.66, y0 - .01, .72, -.1, y0, .83)
    k.box("screen", -.32, y0 - .012, .75, -.16, y0 - .01, .8)
    k.cyl("plastic_grey", (-.55, y0 - .012, .78), (-.55, y0 - .02, .78), .035, segs=6, smooth=False)
    k.ring("chrome", (-.38, y0 - .02, .4), (0, 1, 0), .2, .14, .04, segs=10)
    k.cyl("glass_dark", (-.38, y0 - .01, .4), (-.38, y0, .4), .15, segs=10, smooth=False)
    k.box("signal_red", -.6, y0 + .1, .85, -.48, y0 + .22, 1.05)
    x0, x1, yb0, yb1 = .1, .62, y0 + .02, BACK - .02
    k.box("plastic_beige", x0, yb0, 0, x1, yb1, .04)
    for a, b, c, d in ((x0, yb0, x1, yb0 + .025), (x0, yb1 - .025, x1, yb1), (x0, yb0, x0 + .025, yb1), (x1 - .025, yb0, x1, yb1)):
        k.box("plastic_beige", a, b, 0, c, d, .5)
    for c, sw in (((.25, y0 + .25, .48), "fabric_blue"), ((.45, y0 + .35, .5), "linen"), ((.35, y0 + .45, .56), "fabric_red")):
        k.blob(sw, c, .14, .6, sx=1.3)


def toilet(k, grimy=False):
    yb = BACK - .2
    k.hull("ceramic", [(-.12, yb - .45, 0), (.12, yb - .45, 0), (.12, yb, 0), (-.12, yb, 0),
                       (-.19, yb - .58, .4), (.19, yb - .58, .4), (.19, yb, .4), (-.19, yb, .4)])
    if not grimy:
        k.ring("enamel_white", (0, yb - .32, .415), (0, 0, 1), .19, .12, .03, segs=8)
        k.box("enamel_white", -.19, yb - .03, .43, .19, yb, .85)
    else:
        k.ring("rust", (0, yb - .32, .402), (0, 0, 1), .17, .13, .006, segs=8)
        k.plate("soil", [(-.3, yb - .5), (0, yb - .7), (.32, yb - .45), (.25, yb - .05), (-.25, yb - .1)], 0, .003)
    k.box("ceramic", -.2, yb, .4, .2, BACK, .82)
    if not grimy:
        k.box("ceramic", -.21, yb - .01, .82, .21, BACK, .85)
        k.cyl("chrome", (0, yb + .08, .85), (0, yb + .08, .86), .03, segs=6, smooth=False)
    else:  # the lid knocked askew, rust down the cistern
        k.box("ceramic", -.15, yb - .08, .85, .27, BACK - .03, .88)
        k.box("rust", -.04, yb - .002, .5, .02, yb, .82)
    k.box("chrome", .38, BACK - .04, .65, .42, BACK, .69)
    k.cyl("paper" if not grimy else "cardboard", (.32, BACK - .1, .6), (.48, BACK - .1, .6), .055 if not grimy else .025, segs=6)


@prop("bathroom")
def toilet_clean(k):
    """A toilet, the lid up against the cistern, a roll on the wall beside: 1 tile against a wall."""
    toilet(k)


@prop("bathroom")
def toilet_grimy(k):
    """A run-down toilet: no seat, a stained bowl and floor, the cistern lid knocked askew, an empty roll: 1 tile against a wall."""
    toilet(k, grimy=True)
    for i, sw in enumerate(("paper", "municipal_blue")):
        k.box(sw, -.6 + i * .05, BACK - .55 + i * .03, 0, -.35 + i * .05, BACK - .25 + i * .03, .02 + i * .015)


@prop("bathroom")
def basin(k):
    """A pedestal basin with a mixer tap, a mirror cabinet above, a tiled splashback: 1 tile against a wall."""
    k.cyl("ceramic", (0, BACK - .16, 0), (0, BACK - .16, .78), .1, .08, segs=8)
    k.hull("ceramic", [(-.24, BACK - .4, .72), (.24, BACK - .4, .72), (.24, BACK, .72), (-.24, BACK, .72),
                       (-.29, BACK - .46, .86), (.29, BACK - .46, .86), (.29, BACK, .86), (-.29, BACK, .86)])
    k.box("glass_light", -.2, BACK - .38, .86, .2, BACK - .1, .862)
    k.cyl("chrome", (0, BACK - .06, .86), (0, BACK - .06, .98), .018, segs=6)
    k.cyl("chrome", (0, BACK - .06, .98), (0, BACK - .16, .96), .012, segs=4)
    k.box("ceramic", -.4, BACK - .01, .86, .4, BACK, 1.2)
    k.box("enamel_white", -.3, BACK - .14, 1.25, .3, BACK, 1.85)
    k.box("glass_light", -.28, BACK - .145, 1.27, .28, BACK - .14, 1.83)
    k.box("enamel_white", -.3, BACK - .16, 1.18, .3, BACK, 1.21)
    k.cyl("glass_light", (.2, BACK - .08, 1.21), (.2, BACK - .08, 1.3), .03, segs=6)
    k.cyl("fabric_blue", (.21, BACK - .08, 1.3), (.22, BACK - .08, 1.38), .005, segs=3)
    k.box("chrome", .45, BACK - .04, .9, .48, BACK, .94)
    k.box("linen", .42, BACK - .08, .45, .7, BACK - .04, .92)


@prop("bathroom")
def basin_vanity(k):
    """A run-down vanity basin: the basin in a cupboard with a door off, rust under the tap, a cracked mirror, bottles crowding the shelf: 1 tile against a wall."""
    y0 = BACK - .48
    k.box("black_paint", -.4, y0 + .05, 0, .4, BACK, .08)
    k.box("oak", -.4, y0, .08, .4, BACK, .82)
    k.box("oak", -.39, y0 - .02, .12, -.005, y0, .8)
    k.box("wood_dark", .02, y0 - .002, .14, .37, y0, .78)
    k.box("ceramic", -.43, y0 - .02, .82, .43, BACK, .87)
    k.box("glass_light", -.22, y0 + .06, .87, .22, BACK - .1, .872)
    k.box("rust", -.04, y0 + .2, .872, .04, BACK - .1, .874)
    k.cyl("chrome", (0, BACK - .06, .87), (0, BACK - .06, .98), .018, segs=6)
    k.cyl("chrome", (0, BACK - .06, .98), (0, BACK - .16, .96), .012, segs=4)
    k.box("ceramic", -.45, BACK - .01, .87, .45, BACK, 1.2)
    k.box("concrete_dark", .2, BACK - .012, .95, .32, BACK - .01, 1.1)
    k.box("glass_light", -.35, BACK - .02, 1.25, .35, BACK, 1.85)
    for p0, p1 in (((.1, 1.6), (-.12, 1.75)), ((.1, 1.6), (.3, 1.42)), ((.1, 1.6), (.22, 1.83)), ((.1, 1.6), (-.05, 1.3))):
        x0, z0 = p0; x1, z1 = p1
        dx, dz = x1 - x0, z1 - z0
        n = math.hypot(dx, dz); nx, nz = -dz / n * .006, dx / n * .006
        k.hull("black_paint", [(x0 - nx, BACK - .022, z0 - nz), (x1, BACK - .022, z1), (x1, BACK - .02, z1), (x0 - nx, BACK - .02, z0 - nz),
                               (x0 + nx, BACK - .022, z0 + nz), (x1 + .001, BACK - .022, z1 + .001), (x1 + .001, BACK - .02, z1 + .001), (x0 + nx, BACK - .02, z0 + nz)])
    k.box("glass_light", -.35, BACK - .12, 1.2, .35, BACK, 1.22)
    for x, sw, h in ((-.3, "fabric_green", .16), (-.22, "enamel_white", .2), (-.12, "signal_red", .12), (.25, "municipal_blue", .14)):
        k.cyl(sw, (x, BACK - .06, 1.22), (x, BACK - .06, 1.22 + h), .025, segs=6)


@prop("bathroom")
def bath(k):
    """A short bath (1.5 m) along the wall, tiles round it, taps at one end, a shower curtain half drawn, a mat in front: 1 tile against a wall."""
    y0, x0, x1 = BACK - .72, -H + .01, H - .01
    k.box("ceramic", x0, BACK - .01, .55, x1, BACK, 1.9)
    k.box("enamel_white", x0, y0, 0, x1, y0 + .06, .56)
    k.box("enamel_white", x0, BACK - .06, 0, x1, BACK, .56)
    k.box("enamel_white", x0, y0, 0, x0 + .07, BACK, .56)
    k.box("enamel_white", x1 - .07, y0, 0, x1, BACK, .56)
    k.box("ceramic", x0 + .07, y0 + .06, 0, x1 - .07, BACK - .06, .14)
    for x in (x0 + .12, x0 + .26):
        k.cyl("chrome", (x, BACK - .04, .58), (x, BACK - .04, .66), .02, segs=6)
    k.cyl("chrome", (x0 + .19, BACK - .04, .63), (x0 + .19, BACK - .16, .62), .015, segs=4)
    k.wire("chrome", (x0 + .19, BACK - .02, .9), (x0 + .19, BACK - .02, 1.9), .01)
    k.box("chrome", x0 + .15, BACK - .1, 1.85, x0 + .23, BACK - .02, 1.92)
    k.wire("chrome", (x0, y0 + .02, 2.0), (x1, y0 + .02, 2.0), .012)
    for i, xa in enumerate((.25, .42, .58)):
        k.box("canvas_white", xa, y0 + (.0 if i % 2 else .04), .65, xa + .17, y0 + (.03 if i % 2 else .07), 1.98)
    k.box("fabric_blue", -.5, y0 - .5, 0, .2, y0 - .05, .015)


@prop("bathroom")
def shower(k):
    """A shower cubicle: a tray, glass sides, the door standing open, a riser and head on the tiled wall: 1 tile in a corner or against a wall."""
    x0, x1, y0 = -.45, .45, BACK - .9
    k.box("ceramic", x0, BACK - .01, 0, x1, BACK, 2.0)
    k.box("enamel_white", x0, y0, 0, x1, BACK, .06)
    k.box("iron", -.05, y0 + .4, .06, .05, y0 + .5, .062)
    k.box("glass_light", x0, y0, .06, x0 + .01, BACK, 1.95)
    k.box("aluminium", x0 - .01, y0 - .01, .06, x0 + .02, y0 + .02, 1.95)
    k.box("glass_light", x0, y0, .06, -.05, y0 + .01, 1.95)
    k.box("aluminium", x0, y0 - .01, 1.93, x1, y0 + .02, 1.96)
    k.box("aluminium", x1 - .02, y0 - .01, .06, x1 + .01, y0 + .02, 1.95)
    k.hull("glass_light", [(x1 - .02, y0, .08), (x1 - .02, y0 + .01, .08), (x1 - .35, y0 - .35, .08), (x1 - .35, y0 - .34, .08),
                           (x1 - .02, y0, 1.92), (x1 - .02, y0 + .01, 1.92), (x1 - .35, y0 - .35, 1.92), (x1 - .35, y0 - .34, 1.92)])
    k.wire("chrome", (.2, BACK - .03, .9), (.2, BACK - .03, 1.95), .012)
    k.box("chrome", .14, BACK - .07, 1.0, .26, BACK - .01, 1.1)
    k.cyl("chrome", (.2, BACK - .03, 1.9), (.2, BACK - .2, 1.88), .012, segs=4)
    k.cyl("chrome", (.2, BACK - .22, 1.9), (.2, BACK - .22, 1.86), .07, segs=8, smooth=False)
    k.box("enamel_white", -.3, BACK - .1, 1.2, -.1, BACK - .01, 1.22)
    k.cyl("fabric_green", (-.25, BACK - .05, 1.22), (-.25, BACK - .05, 1.38), .025, segs=6)


# ----- Entrances and posters (tenement). The stoop is an edge piece outside a
# doorway on the street side (-Y), over the tile in front of it: no ramps or
# raised floors (levels.md), so it is one shallow step and a landing, read by
# its cheek walls, railings and canopy.
def stoop(k, rundown=False):
    y0 = -WF - 1.35  # the street end
    k.box("concrete", -.6, y0 + .3, 0, .6, -WF, .12)
    k.box("concrete", -.6, y0, 0, .6, y0 + .3, .06)
    if rundown:
        k.strip("rubber", (-.4, y0 + .32), (.1, -WF - .3), .02, .015, .12, .124)
        k.blob("concrete", (.45, y0 + .05, .03), .07, .6)
    for s in (-1, 1):
        x0, x1 = sorted((s * .6, s * .75))
        k.box("brick_dark" if rundown else "brick", x0, y0, 0, x1, -WF, .75)
        k.box("concrete", x0 - .01, y0 - .01, .75, x1 + .01, -WF, .8)
        if not (rundown and s > 0):
            xr = s * .675
            k.wire("iron", (xr, y0 + .05, .8), (xr, y0 + .05, 1.15), .015)
            k.wire("iron", (xr, -WF - .05, .8), (xr, -WF - .05, 1.15), .015)
            k.wire("iron", (xr, y0 + .05, 1.15), (xr, -WF - .05, 1.15), .018)
        else:
            k.wire("rust", (s * .675, y0 + .05, .8), (s * .675 + .1, y0 - .1, .95), .015)  # what's left, bent
    # The canopy over the door, a lamp under it, the buzzer panel and number beside it.
    if rundown:
        k.hull("enamel_grey", [(-.8, -WF, 2.3), (.8, -WF, 2.3), (.8, -.7, 2.15), (-.8, -.7, 2.25),
                               (-.8, -WF, 2.36), (.8, -WF, 2.36), (.8, -.7, 2.21), (-.8, -.7, 2.31)])
        k.box("rust", -.6, -.7, 2.15, .2, -.69, 2.28)
    else:
        k.box("enamel_grey", -.8, -.8, 2.3, .8, -WF, 2.36)
        for x in (-.75, .75):
            k.wire("iron", (x, -.78, 2.3), (x, -WF, 2.7), .012)
    k.box("black_paint" if rundown else "lamp_warm", -.08, -.28, 2.22, .08, -.18, 2.3)
    k.box("aluminium", .82, -WF - .02, 1.2, .98, -WF, 1.5)
    for i in range(4):
        k.box("plastic_black", .86, -WF - .03, 1.25 + i * .055, .94, -WF - .02, 1.28 + i * .055)
    k.box("plastic_grey" if rundown else "brass", -.95, -WF - .01, 1.75, -.8, -WF, 1.9)


@prop("tenement")
def entrance_stoop(k):
    """A tenement entrance outside its door: a landing and a step, brick cheek walls with railings, a canopy and lamp over the door, the buzzer panel and number beside it: an edge piece, over the tile in front."""
    stoop(k)


@prop("tenement")
def entrance_stoop_rundown(k):
    """The same entrance gone to seed: a cracked step, a railing torn off and bent, the canopy sagging and rusted, the lamp dead: an edge piece."""
    stoop(k, rundown=True)


def poster(k, x0, z0, x1, z1, y, art, title, text="black_paint", tear=0.0, out=-1):
    """A poster flat on a wall face at y (out -1: on the outside face toward -Y, +1: inside toward +Y): paper, a picture, a title, lines of text; `tear`: how much of its bottom-right is gone."""
    d = .002
    a, b = sorted((y, y + out * d))
    if tear:
        w, h = x1 - x0, z1 - z0
        k.extrude_y("paper", a, b, [(x0, z0), (x1 - w * tear, z0), (x1, z0 + h * tear), (x1, z1), (x0, z1)])
    else:
        k.box("paper", x0, a, z0, x1, b, z1)
    a, b = sorted((y + out * d, y + out * 2 * d))
    m = (x1 - x0) * .08
    k.box(art, x0 + m, a, z0 + (z1 - z0) * .4, x1 - m, b, z1 - m)
    k.box(title, x0 + m, a, z0 + (z1 - z0) * .26, x1 - m, b, z0 + (z1 - z0) * .36)
    for i in range(2):
        zz = z0 + (z1 - z0) * (.1 + i * .08)
        k.box(text, x0 + m, a, zz, x0 + (x1 - x0) * (.7 - i * .2), b, zz + (z1 - z0) * .03)


@prop("junk")
def posters_flyposted(k):
    """Fly-posters pasted over each other on an outside wall, gig and club nights, some torn: an edge piece."""
    y = -WF
    poster(k, -.7, .9, -.15, 1.7, y, "black_paint", "neon_pink", "paper")
    poster(k, -.25, 1.0, .25, 1.65, y - .003, "signal_red", "safety_yellow", tear=.4)
    poster(k, .2, .85, .68, 1.55, y, "municipal_blue", "enamel_white", "paper")
    poster(k, -.5, .45, .05, .95, y - .003, "safety_yellow", "black_paint", tear=.3)
    k.hull("paper", [(.25, y - .002, .6), (.5, y - .002, .62), (.5, y, .62), (.25, y, .6),
                     (.3, y - .08, .45), (.52, y - .06, .47), (.52, y - .058, .47), (.3, y - .078, .45)])


@prop("junk")
def posters_missing(k):
    """MISSING notices taped in a row on an outside wall at eye height, a face on each, one rain-streaked: an edge piece."""
    y = -WF
    for i, x in enumerate((-.6, -.15, .3)):
        x0, x1, z0, z1 = x, x + .3, 1.15, 1.57
        k.box("paper", x0, y - .002, z0, x1, y, z1)
        k.box("signal_red", x0 + .03, y - .004, z1 - .07, x1 - .03, y - .002, z1 - .03)
        k.box("fabric_grey" if i != 1 else "upholstery_tan", x0 + .07, y - .004, z0 + .15, x1 - .07, y - .002, z1 - .1)
        for j in range(3):
            zz = z0 + .03 + j * .035
            k.box("black_paint", x0 + .04, y - .004, zz, x1 - .04 - j * .05, y - .002, zz + .012)
        for xt in (x0 + .01, x1 - .05):
            k.box("plastic_beige", xt, y - .005, z1 - .02, xt + .04, y - .002, z1 + .015)
    k.box("weathered", .34, y - .005, 1.15, .4, y - .004, 1.45)


@prop("junk")
def billboard_peeling(k):
    """A big advertising poster pasted on an outside wall over 2 tiles (3 m along X), framed, a corner peeling away: an edge piece high on the wall."""
    y = -WF
    x0, x1, z0, z1 = -1.4, 1.4, 1.3, 2.9
    k.box("black_paint", x0 - .05, y - .03, z0 - .05, x1 + .05, y, z1 + .05)
    k.extrude_y("paper", y - .034, y - .03, [(x0, z0), (x1 - .5, z0), (x1, z0 + .45), (x1, z1), (x0, z1)])
    k.extrude_y("municipal_blue", y - .038, y - .034, [(x0 + .1, z0 + .55), (x1 - .2, z0 + .55), (x1 - .1, z0 + .7), (x1 - .1, z1 - .1), (x0 + .1, z1 - .1)])
    k.box("safety_yellow", x0 + .2, y - .042, z1 - .55, x0 + 1.3, y - .038, z1 - .25)
    k.cyl("enamel_white", (.6, y - .04, 2.25), (.6, y - .044, 2.25), .38, segs=10, smooth=False)
    k.box("signal_red", x0 + .1, y - .038, z0 + .1, x1 - .7, y - .034, z0 + .45)
    k.hull("paper", [(x1 - .5, y - .034, z0), (x1, y - .034, z0 + .45), (x1, y - .03, z0 + .45), (x1 - .5, y - .03, z0),
                     (x1 - .3, y - .3, z0 + .05), (x1 - .02, y - .25, z0 + .3), (x1 - .02, y - .248, z0 + .3), (x1 - .3, y - .298, z0 + .05)])


@prop("interior")
def posters_room(k):
    """A band poster and a calendar on an inside wall, pinned: an edge piece (the room toward -Y, like any wall piece)."""
    y = -WF
    poster(k, -.6, 1.1, -.05, 1.85, y, "black_paint", "signal_red", "paper")
    k.box("paper", .2, y - .002, 1.2, .55, y, 1.65)
    k.box("municipal_blue", .2, y - .004, 1.42, .55, y - .002, 1.65)
    for r in range(4):
        for c in range(5):
            x, z = .23 + c * .065, 1.23 + r * .045
            k.box("signal_red" if (r, c) in ((1, 2), (3, 0)) else "fabric_grey", x, y - .004, z, x + .04, y - .002, z + .025)


# ----- Industrial: the warehouse, the works, the data centre, the yard.
def loaded_pallet(k, x, y, z, w=.55, d=.5, h=.5, sw="cardboard", wrap=True):
    """A pallet with a block of goods on it, centred on (x, y) at height z."""
    k.box("pallet", x - w, y - d, z, x + w, y + d, z + .14)
    k.box(sw, x - w + .03, y - d + .03, z + .14, x + w - .03, y + d - .03, z + .14 + h)
    if wrap:
        k.box("plastic_beige", x - w + .02, y - d + .02, z + .14 + h * .7, x + w - .02, y + d - .02, z + .14 + h * .74)


def racking(k, loads):
    """Pallet racking in one tile, two beam levels, blue uprights and orange beams, open front (-Y) and back."""
    X, Y = .72, .5
    for x in (-X, X - .07):
        for y in (-Y, Y - .07):
            k.box("municipal_blue", x, y, 0, x + .07, y + .07, 2.3)
        k.box("municipal_blue", x + .02, -Y + .07, .4, x + .05, Y - .07, .43)
        k.box("municipal_blue", x + .02, -Y + .07, 1.6, x + .05, Y - .07, 1.63)
    for z in (.95, 1.9):
        for y in (-Y, Y - .08):
            k.box("hazard_orange", -X + .07, y, z - .1, X - .07, y + .08, z)
    for z, load in zip((0, .95, 1.9), loads):
        if load:
            load(z)


@prop("warehouse")
def pallet_racking(k):
    """Pallet racking, a loaded pallet on each of its three levels: 1 tile, open both faces (-Y and +Y)."""
    racking(k, (lambda z: loaded_pallet(k, 0, 0, z, h=.6),
                lambda z: loaded_pallet(k, 0, 0, z, h=.55, sw="pine", wrap=False),
                lambda z: loaded_pallet(k, 0, 0, z, h=.3)))


@prop("warehouse")
def pallet_racking_mixed(k):
    """Pallet racking half emptied: drums on the floor, an empty pallet, sacks on top: 1 tile."""
    def drums(z):
        k.box("pallet", -.55, -.5, z, .55, .5, z + .14)
        for x, y in ((-.27, -.24), (.27, -.24), (-.27, .24), (.27, .24)):
            k.cyl("municipal_blue", (x, y, z + .14), (x, y, z + .74), .23, segs=8)
    def sacks(z):
        k.box("pallet", -.55, -.5, z, .55, .5, z + .14)
        for i, (y, zz) in enumerate(((-.25, .14), (.25, .14), (0, .3))):
            k.blob("canvas_white", (0, y, z + zz + .08), .26, .35, sx=2.0, sy=.9, turn=0)
    racking(k, (drums, lambda z: k.box("pallet", -.55, -.5, z, .55, .5, z + .14), sacks))


@prop("warehouse")
def pallet_boxes(k):
    """A pallet stacked high with cartons, shrink-wrapped, a label on its front (-Y): 1 tile."""
    k.box("pallet", -.6, -.5, 0, .6, .5, .14)
    for i, (z, h) in enumerate(((.14, .4), (.54, .4), (.94, .35))):
        for j, x in enumerate((-.29, .29)):
            k.box("cardboard", x - .28, -.47, z, x + .28, .47, z + h - .01)
            if (i + j) % 2:
                k.box("plastic_beige", x - .03, -.475, z + h - .08, x + .03, .475, z + h - .02)
    k.box("paper", -.15, -.48, .9, .1, -.47, 1.08)


@prop("warehouse")
def pallet_sacks(k):
    """Sacks of cement or feed piled on a pallet: 1 tile, low cover."""
    k.box("pallet", -.6, -.5, 0, .6, .5, .14)
    for layer in range(3):
        z = .14 + layer * .16
        for i in range(2):
            y = -.24 + i * .48
            k.blob("canvas_white" if layer < 2 else "paper", (0, y, z + .08), .28, .3, sx=2.0, sy=.85)


@prop("warehouse")
def forklift(k):
    """A counterbalance forklift, its forks toward -X, the counterweight toward +X: 2 x 1 tiles."""
    k.hull("safety_yellow", [(-.6, -.48, .2), (.85, -.48, .2), (.85, .48, .2), (-.6, .48, .2),
                             (-.55, -.45, .75), (.6, -.45, .75), (.6, .45, .75), (-.55, .45, .75)])
    k.box("black_paint", .6, -.5, .2, 1.1, .5, 1.05)
    k.box("plastic_black", .1, -.25, .75, .45, .25, .85)
    k.box("plastic_black", .38, -.25, .85, .48, .25, 1.25)
    k.cyl("plastic_black", (-.2, 0, .75), (-.1, 0, 1.05), .03, segs=4)
    k.ring("plastic_black", (-.08, 0, 1.08), (.5, 0, 1), .16, .12, .03, segs=8)
    for x in (-.55, .85):
        for y in (-.4, .4):
            k.box("black_paint", x - .04, y - .04, .75, x + .04, y + .04, 2.1)
    k.box("black_paint", -.6, -.45, 2.08, .9, .45, 2.14)
    for x in (-.1, .4):
        k.box("iron", x - .02, -.45, 2.06, x + .02, .45, 2.08)
    for y in (-.3, .3):
        k.box("iron", -.82, y - .05, .1, -.74, y + .05, 2.2)
    k.box("iron", -.86, -.38, .2, -.8, .38, .9)
    for y in (-.22, .22):
        k.box("iron", -1.45, y - .06, .08, -.86, y + .06, .13)
        k.box("iron", -.9, y - .06, .13, -.86, y + .06, .7)
    for x, r in ((-.4, .3), (.7, .26)):
        for y in (-.42, .42):
            k.cyl("rubber", (x, y - .1, r), (x, y + .1, r), r, segs=6, smooth=False)
    k.box("led_red", 1.08, -.45, .95, 1.11, -.35, 1.0)


@prop("warehouse")
def pallet_jack(k):
    """A hand pallet truck, the forks toward -X, its handle raised: 1 tile, no cover."""
    for y in (-.2, .2):
        k.box("signal_red", -.7, y - .08, .03, .35, y + .08, .1)
        k.cyl("plastic_black", (-.62, y - .04, .04), (-.62, y + .04, .04), .04, segs=6, smooth=False)
    k.box("signal_red", .3, -.3, .03, .5, .3, .35)
    k.cyl("enamel_grey", (.42, 0, .1), (.42, 0, .5), .06, segs=6)
    for y in (-.1, .1):
        k.cyl("rubber", (.45, y - .03, .09), (.45, y + .03, .09), .09, segs=8, smooth=False)
    k.wire("signal_red", (.42, 0, .5), (.6, 0, 1.3), .02)
    k.box("plastic_black", .55, -.14, 1.28, .65, .14, 1.36)


def shutter_frame(k):
    for x in (-H, H - .08):
        k.box("galvanised", x, -WF - .06, 0, x + .08, WF, DOOR_TOP)
    k.box("galvanised", -H, WF, DOOR_TOP, H, WF + .35, DOOR_TOP + .38)
    k.box("enamel_grey", -H - .05, -WF - .02, DOOR_TOP, H + .05, -WF, DOOR_TOP + .4)


@prop("warehouse")
def roller_shutter(k):
    """A roller shutter down in a doorway, its drum housing inside above the opening: an edge piece (the doorway's)."""
    shutter_frame(k)
    k.box("galvanised", -H + .06, -.03, 0, H - .06, .03, DOOR_TOP)
    for i in range(10):
        z = .1 + i * .19
        k.box("aluminium", -H + .06, -.04, z, H - .06, .04, z + .03)
    k.box("black_paint", -H + .06, -.05, 0, H - .06, .05, .08)
    k.box("safety_yellow", -.1, -.055, .02, .1, -.05, .06)


@prop("warehouse")
def roller_shutter_open(k):
    """The same shutter rolled up, only its bottom rail showing under the housing: an edge piece."""
    shutter_frame(k)
    k.box("galvanised", -H + .06, -.03, DOOR_TOP - .15, H - .06, .03, DOOR_TOP)
    k.box("black_paint", -H + .06, -.05, DOOR_TOP - .2, H - .06, .05, DOOR_TOP - .15)


@prop("warehouse")
def loading_dock(k):
    """A loading bay round a doorway on the outside wall (-Y): a padded seal, rubber bumpers, a dock lamp on its arm, yellow bollards: an edge piece."""
    y = -WF
    k.box("black_paint", -H - .25, y - .25, 0, -H + .02, y, DOOR_TOP + .3)
    k.box("black_paint", H - .02, y - .25, 0, H + .25, y, DOOR_TOP + .3)
    k.box("black_paint", -H - .25, y - .25, DOOR_TOP, H + .25, y, DOOR_TOP + .4)
    for x in (-H - .12, H + .12):
        k.box("rubber", x - .12, y - .38, .1, x + .12, y - .25, .55)
        k.cyl("safety_yellow", (x * 1.35, -.9, 0), (x * 1.35, -.9, 1.0), .08, segs=8)
        k.cyl("black_paint", (x * 1.35, -.9, .7), (x * 1.35, -.9, .8), .082, segs=8)
    k.wire("enamel_grey", (H + .4, y - .02, 1.8), (H - .1, -.8, 1.9), .02)
    k.cyl("enamel_grey", (H - .1, -.8, 1.95), (H - .2, -.9, 1.75), .12, .06, segs=8, smooth=False)
    k.cyl("lamp_warm", (H - .2, -.9, 1.75), (H - .21, -.91, 1.74), .06, segs=8, smooth=False)
    k.box("safety_yellow", -H, -1.4, 0, H, -1.35, .004)


@prop("warehouse")
def ibc_tank(k):
    """An intermediate bulk container: a white plastic tank in a steel cage on a pallet, a tap at its foot (-Y): 1 tile."""
    k.box("galvanised", -.55, -.5, 0, .55, .5, .15)
    k.box("enamel_white", -.5, -.45, .15, .5, .45, 1.12)
    k.cyl("enamel_white", (0, 0, 1.12), (0, 0, 1.18), .15, segs=8)
    for x in (-.53, -.18, .18, .53):
        for y in (-.48, .48):
            k.wire("galvanised", (x, y, .15), (x, y, 1.15), .012)
    for x in (-.53, .53):
        for i in range(3):
            k.wire("galvanised", (x, -.48 + i * .48, .15), (x, -.48 + i * .48, 1.15), .012)
    for z in (.5, .85, 1.15):
        for y in (-.48, .48):
            k.wire("galvanised", (-.53, y, z), (.53, y, z), .012)
        for x in (-.53, .53):
            k.wire("galvanised", (x, -.48, z), (x, .48, z), .012)
    k.cyl("municipal_blue", (0, -.45, .25), (0, -.58, .25), .05, segs=6)
    k.box("hazard_orange", -.15, -.455, .6, .15, -.45, .8)


@prop("warehouse")
def gas_cylinders(k):
    """Tall gas cylinders chained to a wall rack: 1 tile, its back to the wall."""
    y = BACK - .2
    k.box("galvanised", -.7, BACK - .05, .9, .7, BACK, 1.0)
    k.box("galvanised", -.7, BACK - .4, 0, .7, BACK, .05)
    for i, sw in enumerate(("black_paint", "enamel_grey", "fabric_red", "enamel_grey", "paint_green")):
        x = -.56 + i * .28
        k.cyl(sw, (x, y, .05), (x, y, 1.45), .11, segs=8)
        k.cyl(sw, (x, y, 1.45), (x, y, 1.55), .11, .04, segs=8)
        k.cyl("brass", (x, y, 1.55), (x, y, 1.65), .03, segs=5)
    k.wire("iron", (-.7, y - .12, 1.1), (.7, y - .12, 1.1), .008)


@prop("warehouse")
def workbench(k):
    """A steel workbench with a wooden top, a vice at one end, tools on the pegboard behind and a toolbox: 1 tile, its back to the wall."""
    y0, y1 = BACK - .7, BACK
    k.box("oak", -.72, y0, .86, .72, y1, .92)
    for x in (-.68, .64):
        for y in (y0 + .02, y1 - .06):
            k.box("enamel_grey", x, y, 0, x + .04, y + .04, .86)
    k.box("enamel_grey", -.68, y0 + .02, .15, .68, y1 - .02, .18)
    k.box("enamel_grey", .2, y0 + .02, .45, .68, y1 - .02, .86)
    for z in (.52, .68):
        k.box("chrome", .38, y0, z, .5, y0 + .02, z + .03)
    k.box("municipal_blue", -.66, y0 + .02, .92, -.46, y0 + .2, 1.02)
    k.box("municipal_blue", -.62, y0 - .04, .95, -.5, y0 + .02, 1.0)
    k.box("brass", -.72, BACK - .02, .95, .72, BACK, 1.9)
    for x, z, w, h, sw in ((-.5, 1.4, .04, .3, "iron"), (-.35, 1.5, .25, .05, "signal_red"), (-.05, 1.35, .04, .35, "iron"),
                           (.15, 1.55, .2, .2, "safety_yellow"), (.45, 1.3, .05, .3, "plastic_black")):
        k.box(sw, x, BACK - .05, z, x + w, BACK - .02, z + h)
    k.box("signal_red", .0, y0 + .2, .92, .4, y1 - .1, 1.1)


@prop("warehouse")
def tool_chest(k):
    """A red roll-cab tool chest with a top box, its drawers toward -Y: 1 tile."""
    k.box("signal_red", -.4, -.25, .12, .4, .25, 1.0)
    for i in range(6):
        z = .16 + i * .14
        k.box("signal_red", -.38, -.27, z, .38, -.25, z + .12)
        k.box("chrome", -.3, -.29, z + .08, .3, -.27, z + .1)
    for x in (-.32, .32):
        for y in (-.18, .18):
            k.cyl("rubber", (x - .025, y, .06), (x + .025, y, .06), .06, segs=6, smooth=False)
    k.box("signal_red", -.38, -.22, 1.0, .38, .22, 1.3)
    k.hull("signal_red", [(-.38, .22, 1.3), (.38, .22, 1.3), (.38, .24, 1.3), (-.38, .24, 1.3),
                          (-.38, .1, 1.72), (.38, .1, 1.72), (.38, .12, 1.72), (-.38, .12, 1.72)])
    k.box("chrome", -.38, -.27, .98, .38, .27, 1.0)


@prop("factory")
def cnc_machine(k):
    """A machining centre: an enclosure with a window in its sliding door (-Y), the control panel on an arm, hazard stripes at its foot: 1 tile."""
    k.box("enamel_grey", -.7, -.5, 0, .7, .6, .2)
    k.box("enamel_white", -.7, -.45, .2, .5, .6, 2.1)
    k.box("enamel_grey", .5, -.45, .2, .7, .6, 2.1)
    k.box("enamel_white", -.65, -.47, .5, .1, -.45, 1.9)
    k.box("glass_light", -.55, -.48, .9, 0, -.47, 1.6)
    k.box("chrome", .03, -.52, 1.0, .06, -.47, 1.4)
    for i in range(5):
        x = -.7 + i * .3
        k.box("safety_yellow" if i % 2 == 0 else "black_paint", x, -.51, 0, x + .3, -.5, .2)
    k.box("plastic_black", .55, -.75, 1.2, .95, -.6, 1.75)
    k.box("screen", .6, -.755, 1.45, .9, -.75, 1.7)
    k.box("plastic_grey", .6, -.755, 1.25, .9, -.75, 1.4)
    k.wire("enamel_grey", (.7, -.45, 1.5), (.75, -.62, 1.5), .03)
    k.box("led_red", .58, -.45, 2.1, .66, -.37, 2.3)
    k.box("led_green", .58, -.45, 2.3, .66, -.37, 2.36)


@prop("factory")
def drill_press(k):
    """A pillar drill on a stand, its handles toward -Y: 1 tile."""
    k.box("enamel_grey", -.3, -.25, 0, .3, .3, .06)
    k.cyl("chrome", (0, .15, .06), (0, .15, 1.75), .045, segs=8)
    k.box("paint_green", -.25, -.2, .9, .25, .2, .95)
    k.box("paint_green", -.06, .05, .8, .06, .25, .9)
    k.box("paint_green", -.2, -.25, 1.45, .2, .3, 1.8)
    k.box("paint_green", -.12, .3, 1.5, .12, .5, 1.75)
    k.cyl("chrome", (0, -.1, 1.45), (0, -.1, 1.25), .035, segs=6)
    k.cyl("iron", (0, -.1, 1.25), (0, -.1, 1.15), .012, segs=4)
    for i in range(3):
        a = i * 2 * math.pi / 3
        k.wire("chrome", (.2, 0, 1.6), (.25, .25 * math.cos(a), 1.6 + .25 * math.sin(a)), .01)


@prop("factory")
def conveyor(k):
    """A roller conveyor along X carrying two cartons: 2 x 1 tiles, low cover."""
    for y in (-.32, .32):
        k.box("galvanised", -1.5, y - .02, .7, 1.5, y + .02, .82)
    for x in (-1.3, 0, 1.3):
        for y in (-.3, .3):
            k.box("galvanised", x - .03, y - .03, 0, x + .03, y + .03, .7)
        k.box("galvanised", x - .02, -.3, .25, x + .02, .3, .28)
    for i in range(11):
        x = -1.4 + i * .28
        k.cyl("chrome", (x, -.3, .78), (x, .3, .78), .035, segs=5)
    k.box("cardboard", -1.0, -.22, .81, -.45, .2, 1.15)
    k.box("cardboard", .3, -.25, .81, .75, .18, 1.05)
    k.box("plastic_beige", .5, -.255, .81, .55, .185, 1.05)
    k.box("safety_yellow", -1.5, -.4, .6, -1.35, -.32, .9)
    k.box("signal_red", -1.47, -.41, .78, -1.38, -.4, .86)


@prop("factory")
def control_panel(k):
    """A bank of electrical cabinets against a wall: switches, indicator lamps, a warning sign, conduit up to the ceiling: 1 tile."""
    y0 = BACK - .5
    k.box("enamel_grey", -.72, y0, .1, .72, BACK, 2.1)
    k.box("black_paint", -.72, y0 + .02, 0, .72, BACK, .1)
    for i, x in enumerate((-.71, -.235, .24)):
        k.box("enamel_grey", x + .01, y0 - .02, .15, x + .465, y0, 2.05)
        k.box("chrome", x + .4, y0 - .04, 1.0, x + .43, y0 - .02, 1.25)
        for j, sw in enumerate(("led_green", "led_red", "lamp_warm")):
            k.box(sw, x + .08 + j * .1, y0 - .03, 1.75, x + .14 + j * .1, y0 - .02, 1.81)
        k.box("plastic_black", x + .1, y0 - .05, 1.4, x + .2, y0 - .02, 1.55)
    k.hull("safety_yellow", [(-.6, y0 - .022, 1.0), (-.3, y0 - .022, 1.0), (-.3, y0 - .02, 1.0), (-.6, y0 - .02, 1.0),
                             (-.45, y0 - .022, 1.28), (-.45, y0 - .022, 1.28), (-.45, y0 - .02, 1.28), (-.45, y0 - .02, 1.28)])
    for x in (-.4, 0, .4):
        k.cyl("galvanised", (x, BACK - .15, 2.1), (x, BACK - .15, 2.5), .04, segs=6)


@prop("factory")
def generator(k):
    """A diesel generator set in its enclosure on a fuel-tank base, louvres, a control panel at one end, the exhaust up: 2 x 1 tiles."""
    k.box("black_paint", -1.3, -.55, 0, 1.3, .55, .3)
    k.box("paint_green", -1.25, -.5, .3, 1.25, .5, 1.6)
    for s in (-1, 1):
        a, b = sorted((s * .5, s * .52))
        for i in range(5):
            z = .55 + i * .18
            k.box("iron", -.9, a, z, .3, b, z + .07)
        k.box("enamel_grey", .5, a, .5, 1.1, b, 1.4)
    k.box("plastic_black", 1.25, -.25, .8, 1.3, .25, 1.3)
    k.box("screen", 1.3, -.15, 1.1, 1.305, .15, 1.25)
    k.box("led_green", 1.3, -.2, .9, 1.305, -.1, .95)
    k.cyl("rust", (-.8, 0, 1.6), (-.8, 0, 2.3), .07, segs=8)
    k.cyl("iron", (-.8, 0, 2.3), (-.8, 0, 2.36), .09, segs=8, smooth=False)
    k.box("safety_yellow", -.2, -.53, 1.3, .2, -.52, 1.5)


@prop("factory")
def pipe_manifold(k):
    """Two pipe runs along X on stands, flanges and handwheel valves, a riser going up: 1 tile, its runs reaching the tile's sides to join a neighbour's."""
    for x in (-.5, .5):
        k.box("concrete", x - .1, -.15, 0, x + .1, .35, .08)
        k.box("iron", x - .03, .07, .08, x + .03, .13, 1.2)
        k.box("iron", x - .03, -.15, .55, x + .03, .35, .6)
        k.box("iron", x - .03, -.15, 1.05, x + .03, .35, 1.1)
    for y, z, sw, r in ((.1, .72, "signal_red", .11), (.1, 1.2, "safety_yellow", .08)):
        k.cyl(sw, (-H, y, z), (H, y, z), r, segs=6)
        k.cyl(sw, (-.33, y, z), (-.27, y, z), r + .04, segs=6, smooth=False)
    k.cyl("signal_red", (-.05, .1, .72), (-.05, .1, 1.0), .06, segs=6)
    k.ring("signal_red", (-.05, .1, 1.02), (0, 0, 1), .15, .12, .025, segs=8)
    k.wire("signal_red", (-.2, .1, 1.02), (.1, .1, 1.02), .01)
    k.cyl("safety_yellow", (.35, .1, 1.2), (.35, -.12, 1.2), .05, segs=6)
    k.ring("safety_yellow", (.35, -.14, 1.2), (0, 1, 0), .12, .09, .02, segs=8)
    k.cyl("galvanised", (.6, .1, 1.2), (.6, .1, 2.5), .06, segs=6)


@prop("factory")
def storage_tank(k):
    """A vertical steel tank on legs, its ladder and a hazard diamond toward -Y: 1 tile, full cover."""
    for a in range(4):
        x, y = .45 * math.cos(a * math.pi / 2 + math.pi / 4), .45 * math.sin(a * math.pi / 2 + math.pi / 4)
        k.box("iron", x - .04, y - .04, 0, x + .04, y + .04, .4)
    k.cyl("galvanised", (0, 0, .35), (0, 0, .45), .66, .66, segs=12)
    k.cyl("galvanised", (0, 0, .45), (0, 0, 2.15), .68, segs=12)
    k.cyl("galvanised", (0, 0, 2.15), (0, 0, 2.35), .68, .2, segs=12)
    k.cyl("galvanised", (0, 0, 2.35), (0, 0, 2.45), .08, segs=6)
    for x in (-.15, .15):
        k.wire("iron", (x, -.74, .1), (x, -.74, 2.3), .015)
    for i in range(8):
        z = .25 + i * .27
        k.wire("iron", (-.15, -.74, z), (.15, -.74, z), .01)
    k.box("hazard_orange", .3, -.67, 1.35, .5, -.6, 1.6)


@prop("factory")
def chemical_drums(k):
    """Four blue chemical drums on a yellow spill pallet, hazard labels toward -Y: 1 tile, low cover."""
    k.box("safety_yellow", -.65, -.65, 0, .65, .65, .2)
    k.box("black_paint", -.6, -.6, .2, .6, .6, .202)
    for x, y in ((-.3, -.3), (.3, -.3), (-.3, .3), (.3, .3)):
        k.cyl("municipal_blue", (x, y, .2), (x, y, 1.08), .26, segs=8)
        k.cyl("municipal_blue", (x, y, .55), (x, y, .6), .27, segs=8, smooth=False)
        k.cyl("enamel_white", (x + .1, y, 1.08), (x + .1, y, 1.12), .04, segs=5)
        if y < 0:
            k.box("hazard_orange", x - .08, y - .27, .7, x + .08, y - .25, .86)


@prop("datacenter")
def server_row(k):
    """A row of three server racks under a cable tray, their LED-lit fronts toward -Y: 2 x 1 tiles, full cover."""
    for i in range(3):
        x0 = -1.35 + i * .9
        k.box("black_paint", x0, -.5, 0, x0 + .88, .5, 2.1)
        k.box("iron", x0 + .03, -.51, .05, x0 + .85, -.5, 2.05)
        for j in range(3):
            z = .3 + j * .55
            k.box("plastic_black", x0 + .06, -.515, z, x0 + .7, -.51, z + .3)
        k.box("led_green", x0 + .74, -.516, .3, x0 + .76, -.51, 1.85)
        k.box("led_red" if i == 1 else "led_green", x0 + .78, -.516, 1.4, x0 + .8, -.51, 1.5)
        k.box("lamp_cool", x0 + .1, -.516, .25 + i * .42 + .12, x0 + .3, -.51, .25 + i * .42 + .16)
    k.box("galvanised", -1.4, -.2, 2.25, 1.4, .2, 2.3)
    for s in (-1, 1):
        k.box("galvanised", -1.4, s * .2 - .01, 2.3, 1.4, s * .2 + .01, 2.38)
    for x in (-1.0, 0, 1.0):
        k.wire("galvanised", (x, 0, 2.25), (x, 0, 2.5), .01)
    for y, sw in ((-.1, "safety_yellow"), (0, "municipal_blue"), (.1, "signal_red")):
        k.box(sw, -1.38, y - .03, 2.3, 1.38, y + .03, 2.34)


@prop("datacenter")
def cooling_unit(k):
    """A computer-room cooling unit, its control screen and intake louvres toward -Y, a vent on top: 1 tile, full cover."""
    k.box("enamel_white", -.7, -.4, 0, .7, .45, 2.0)
    k.box("plastic_grey", -.7, -.41, 0, .7, -.4, .1)
    for i in range(8):
        z = .25 + i * .1
        k.box("enamel_grey", -.6, -.42, z, .6, -.4, z + .05)
    k.box("plastic_black", .2, -.42, 1.4, .55, -.4, 1.7)
    k.box("screen", .23, -.425, 1.45, .52, -.42, 1.65)
    k.box("led_green", -.5, -.42, 1.6, -.4, -.4, 1.65)
    k.box("enamel_grey", -.6, -.3, 2.0, .6, .35, 2.1)
    for i in range(5):
        x = -.5 + i * .25
        k.box("iron", x, -.25, 2.1, x + .1, .3, 2.11)


@prop("datacenter")
def ops_console(k):
    """A monitoring console: a long desk with six screens on arms and two keyboards, the operators' side toward -Y: 2 x 1 tiles."""
    k.box("black_paint", -1.4, -.2, .72, 1.4, .35, .76)
    k.box("enamel_grey", -1.38, .25, 0, 1.38, .35, .72)
    for x in (-1.3, 1.25):
        k.box("enamel_grey", x, -.15, 0, x + .05, .3, .72)
    for row, z in ((0, 1.0), (1, 1.42)):
        for i in range(3):
            x = -1.0 + i * .7
            k.box("plastic_black", x - .32, .2, z - .2, x + .32, .24, z + .18)
            k.box("screen" if (row + i) % 3 else "lamp_cool", x - .3, .198, z - .18, x + .3, .2, z + .16)
    k.box("iron", -.02, .26, .76, .02, .3, 1.6)
    k.box("iron", -1.0, .26, 1.18, 1.0, .3, 1.22)
    for x in (-.6, .6):
        k.box("plastic_black", x - .22, -.12, .76, x + .22, 0, .78)
    k.cyl("ceramic", (.95, -.05, .76), (.95, -.05, .86), .04, segs=6)


@prop("yard_industrial")
def shipping_container(k):
    """A 20 ft shipping container, its doors at the +X end, corrugated sides, rust coming through: 4 x 2 tiles (6 m along X), full cover."""
    L, W, Hc = 3.02, 1.22, 2.59
    k.box("signal_red", -L, -W, 0, L, W, Hc)
    for s in (-1, 1):
        for i in range(7):
            x = -L + .5 + i * .8
            a, b = sorted((s * W, s * (W + .04)))
            k.box("signal_red", x, a, .12, x + .3, b, Hc - .1)
        a, b = sorted((s * W, s * (W + .045)))
        k.box("rust", -1.2, a, .1, -.4, b, .5)
    for x in (-L, L - .12):
        for y in (-W, W - .12):
            for z in (0, Hc - .12):
                k.box("iron", x - .01, y - .01, z, x + .13, y + .13, z + .12)
    k.box("signal_red", L, -W + .02, .05, L + .02, W - .02, Hc - .05)
    k.box("black_paint", L + .02, -.005, .05, L + .025, .005, Hc - .05)
    for y in (-.8, -.3, .3, .8):
        k.cyl("galvanised", (L + .05, y, .15), (L + .05, y, Hc - .15), .02, segs=4)
    k.box("enamel_white", -1.0, -W - .05, 2.1, .6, -W - .045, 2.35)


@prop("yard_industrial")
def container_open(k):
    """A shipping container standing open, its doors swung back at the +X end, cartons inside: 4 x 2 tiles, full cover along its sides."""
    L, W, Hc, t = 3.02, 1.22, 2.59, .06
    sw = "municipal_blue"
    k.box(sw, -L, -W, Hc - t, L, W, Hc)
    k.box("wood_dark", -L, -W, 0, L, W, .12)
    k.box(sw, -L, -W, .12, -L + t, W, Hc - t)
    for s in (-1, 1):
        a, b = sorted((s * W, s * (W - t)))
        k.box(sw, -L, a, .12, L, b, Hc - t)
        for i in range(8):
            x = -L + .45 + i * .73
            a, b = sorted((s * W, s * (W + .04)))
            k.box(sw, x, a, .12, x + .3, b, Hc - .1)
        a, b = sorted((s * W, s * (W + .02)))
        y0, y1 = sorted((s * (W + .02), s * (W + .06)))
        k.box(sw, L - 1.18, y0, .08, L, y1, Hc - .08)
    for x in (-L, L - .12):
        for y in (-W, W - .12):
            k.box("iron", x - .01, y - .01, 0, x + .13, y + .13, .12)
    for x, y in ((-2.2, -.6), (-2.2, .4), (-1.5, -.5)):
        k.box("cardboard", x - .3, y - .3, .12, x + .3, y + .3, .72)
    k.box("cardboard", -2.5, -.3, .72, -1.9, .3, 1.2)


@prop("yard_industrial")
def guard_booth(k):
    """A gatehouse booth: windows all round, its door on the -Y side, a lit desk inside under a flat roof: 1 tile, full cover."""
    X, Y = .7, .7
    k.box("concrete", -X - .05, -Y - .05, 0, X + .05, Y + .05, .1)
    k.box("enamel_white", -X, -Y, .1, X, Y, 1.0)
    for x0, x1, y0, y1 in ((-X, -X + .06, -Y, Y), (X - .06, X, -Y, Y), (-X, X, -Y, -Y + .06), (-X, X, Y - .06, Y)):
        k.box("glass_light", x0, y0, 1.0, x1, y1, 2.05)
    for x in (-X, X - .06):
        for y in (-Y, Y - .06):
            k.box("enamel_white", x, y, 1.0, x + .06, y + .06, 2.05)
    k.box("enamel_white", -X, -Y, 2.05, X, Y, 2.3)
    k.box("enamel_grey", -X - .15, -Y - .15, 2.3, X + .15, Y + .15, 2.38)
    k.box("enamel_grey", -.35, -Y - .01, .12, .25, -Y, 2.0)
    k.box("chrome", .15, -Y - .04, .95, .2, -Y - .01, 1.1)
    k.box("lamp_warm", -.2, -.2, 2.0, .2, .2, 2.05)
    k.box("safety_yellow", -X, -Y - .005, .1, X, -Y, .3)


# ----- Light urban: houses, their yards, the garage, the small clinic.
@prop("house")
def front_porch(k):
    """A covered front porch over 2 tiles (3 m along X), the tile in front of the door: a low deck, white posts and railing (open in the middle), a sloping roof, a light: an edge piece."""
    y0 = -WF - 1.4
    k.box("paint_white", -1.45, y0, 0, 1.45, -WF, .06)
    for i in range(5):
        y = y0 + .15 + i * .28
        k.box("wood_dark", -1.45, y, .06, 1.45, y + .01, .062)
    for x in (-1.32, 1.32):
        k.box("paint_white", x - .07, y0 + .06, .06, x + .07, y0 + .2, 2.35)
    k.box("paint_white", -1.45, y0, 2.3, 1.45, y0 + .2, 2.42)
    k.hull("asphalt", [(-1.55, y0 - .12, 2.42), (1.55, y0 - .12, 2.42), (1.55, -WF, 2.75), (-1.55, -WF, 2.75),
                       (-1.55, y0 - .12, 2.5), (1.55, y0 - .12, 2.5), (1.55, -WF, 2.83), (-1.55, -WF, 2.83)])
    for s in (-1, 1):
        a, b = sorted((s * 1.25, s * .5))
        for z in (.12, .88):
            k.box("paint_white", a, y0 + .1, z, b, y0 + .16, z + .05)
        for i in range(6):
            x = a + .06 + i * (b - a - .1) / 5
            k.box("paint_white", x - .015, y0 + .115, .17, x + .015, y0 + .145, .88)
    k.box("lamp_warm", -.1, -.6, 2.5, .1, -.4, 2.55)
    k.box("fabric_green", -.4, y0 + .02, .06, .4, y0 + .45, .075)


@prop("house")
def garage_door(k):
    """A sectional garage door across 2 tile edges (3 m along X), white panels with a row of windows, the trim round it: an edge piece."""
    k.box("enamel_white", -1.4, -.03, 0, 1.4, .03, 2.15)
    for z in (.55, 1.08, 1.61):
        k.box("enamel_grey", -1.4, -.035, z - .01, 1.4, -.03, z + .01)
    for i in range(4):
        x = -1.25 + i * .66
        k.box("glass_dark", x, -.035, 1.72, x + .5, -.03, 2.0)
    for x in (-1.48, 1.4):
        k.box("paint_white", x, -WF - .03, 0, x + .08, WF, 2.25)
    k.box("paint_white", -1.48, -WF - .03, 2.15, 1.48, WF, 2.25)
    k.box("chrome", -.15, -.05, .9, .15, -.035, .94)


def pickets(k, x0, x1, top, n):
    for i in range(n):
        x = x0 + (i + .5) * (x1 - x0) / n
        w = .035
        k.extrude_y("paint_white", -.012, .012, [(x - w, .06), (x + w, .06), (x + w, top), (x, top + .07), (x - w, top)])


@prop("house")
def picket_fence(k):
    """A white picket fence over 2 tiles (3 m along X) on the tiles' middle line: posts, two rails, pointed pickets: 2 x 1 tiles."""
    for x in (-1.45, 0, 1.45):
        k.box("paint_white", x - .05, -.05, 0, x + .05, .05, 1.05)
        k.box("paint_white", x - .06, -.06, 1.05, x + .06, .06, 1.1)
    for z in (.3, .75):
        k.box("paint_white", -1.45, .015, z, 1.45, .045, z + .06)
    for x0, x1 in ((-1.4, -.05), (.05, 1.4)):
        pickets(k, x0, x1, .9, 9)


@prop("house")
def picket_gate(k):
    """A white picket gate between two posts across one tile, a diagonal brace, a latch: 1 tile."""
    for x in (-.72, .72):
        k.box("paint_white", x - .05, -.05, 0, x + .05, .05, 1.15)
        k.cyl("paint_white", (x, 0, 1.15), (x, 0, 1.25), .06, .02, segs=4, smooth=False, rot=math.pi / 4)
    for z in (.3, .75):
        k.box("paint_white", -.64, .015, z, .64, .045, z + .06)
    k.hull("paint_white", [(-.6, .015, .32), (-.54, .015, .32), (-.54, .045, .32), (-.6, .045, .32),
                           (.54, .015, .76), (.6, .015, .76), (.6, .045, .76), (.54, .045, .76)])
    pickets(k, -.64, .64, .9, 8)
    k.box("black_paint", .6, -.04, .82, .7, -.02, .87)


@prop("house")
def privacy_fence(k):
    """A tall board fence over 2 tiles (3 m along X) on the tiles' middle line, weathered boards on rails between posts: 2 x 1 tiles."""
    for x in (-1.45, 0, 1.45):
        k.box("wood_dark", x - .05, -.05, 0, x + .05, .05, 1.85)
    for z in (.3, 1.5):
        k.box("weathered", -1.45, .03, z, 1.45, .06, z + .08)
    for x0 in (-1.4, .05):
        for i in range(9):
            x = x0 + i * .15
            k.box("weathered" if i % 3 else "pine", x, -.02, .05, x + .14, .03, 1.8)


@prop("house")
def mailbox_post(k):
    """A roadside mailbox on a wooden post, its door toward -Y, the red flag up: a tile's middle, no cover."""
    k.box("wood_dark", -.05, -.05, 0, .05, .05, 1.0)
    k.box("wood_dark", -.12, -.3, .95, .12, .1, 1.0)
    k.box("black_paint", -.11, -.28, 1.0, .11, .08, 1.12)
    k.cyl("black_paint", (0, -.28, 1.12), (0, .08, 1.12), .11, segs=8)
    k.box("black_paint", -.11, -.3, 1.0, .11, -.28, 1.2)
    k.box("signal_red", .11, .0, 1.1, .13, .02, 1.35)
    k.box("signal_red", .11, -.08, 1.28, .13, .0, 1.35)
    k.box("enamel_white", -.112, -.2, 1.05, -.11, 0, 1.1)


@prop("house")
def garden_shed(k):
    """A small timber garden shed with a pitched roof, its door toward -Y and a window on its side: 1 tile, full cover."""
    X, Y = .68, .68
    k.box("concrete", -X - .04, -Y - .04, 0, X + .04, Y + .04, .06)
    k.box("pine", -X, -Y, .06, X, Y, 1.85)
    for i in range(10):
        z = .2 + i * .17
        k.box("weathered", -X - .01, -Y - .01, z, X + .01, Y + .01, z + .015)
    k.extrude_x("pine", -X, X, [(-Y, 1.85), (Y, 1.85), (0, 2.25)])
    for s in (-1, 1):
        k.hull("asphalt", [(-X - .1, s * (Y + .12), 1.78), (X + .1, s * (Y + .12), 1.78), (X + .1, 0, 2.27), (-X - .1, 0, 2.27),
                           (-X - .1, s * (Y + .12), 1.83), (X + .1, s * (Y + .12), 1.83), (X + .1, 0, 2.32), (-X - .1, 0, 2.32)])
    k.box("paint_green", -.35, -Y - .03, .08, .35, -Y, 1.75)
    for z in (.3, 1.5):
        k.box("black_paint", -.33, -Y - .04, z, -.05, -Y - .03, z + .04)
    k.box("black_paint", .25, -Y - .05, .9, .3, -Y - .03, 1.0)
    k.box("glass_dark", X, -.3, 1.0, X + .01, .3, 1.5)
    k.box("paint_white", X, -.33, .97, X + .03, .33, 1.0)


@prop("backyard")
def bbq_grill(k):
    """A kettle barbecue on three legs, its lid hung on the side: 1 tile, no cover."""
    for i in range(3):
        a = i * 2 * math.pi / 3 + math.pi / 2
        k.wire("black_paint", (.28 * math.cos(a), .28 * math.sin(a), 0), (.15 * math.cos(a), .15 * math.sin(a), .62), .015)
    k.cyl("galvanised", (0, 0, .3), (0, 0, .33), .2, segs=8, smooth=False)
    k.cyl("black_paint", (0, 0, .62), (0, 0, .9), .12, .3, segs=10)
    k.cyl("galvanised", (0, 0, .9), (0, 0, .905), .28, segs=10, smooth=False)
    k.cyl("black_paint", (.33, 0, .55), (.38, 0, .95), .26, .27, segs=10)
    k.box("plastic_black", .4, -.08, .95, .44, .08, .98)
    k.box("plastic_black", -.33, -.06, .88, -.28, .06, .9)


@prop("backyard")
def patio_set(k):
    """A round patio table under a striped umbrella, four chairs round it: 1 tile."""
    k.cyl("enamel_white", (0, 0, .7), (0, 0, .73), .45, segs=10)
    k.cyl("enamel_white", (0, 0, 0), (0, 0, .7), .04, segs=6)
    k.cyl("enamel_white", (0, 0, 0), (0, 0, .03), .2, segs=6, smooth=False)
    k.cyl("enamel_white", (0, 0, .73), (0, 0, 2.15), .02, segs=4)
    k.cyl("canvas_red", (0, 0, 1.85), (0, 0, 2.2), 1.0, .05, segs=8, smooth=False)
    for i in range(4):
        a = i * math.pi / 2
        c, s_ = math.cos(a), math.sin(a)
        x, y = .62 * c, .62 * s_
        r = lambda dx, dy: (x + c * dx - s_ * dy, y + s_ * dx + c * dy)
        k.plate("enamel_white", [r(-.2, -.2), r(.2, -.2), r(.2, .2), r(-.2, .2)], .42, .46)
        k.hull("enamel_white", [(*r(.16, -.2), .46), (*r(.16, .2), .46), (*r(.2, .2), .46), (*r(.2, -.2), .46),
                                (*r(.22, -.2), .88), (*r(.22, .2), .88), (*r(.26, .2), .88), (*r(.26, -.2), .88)])
        k.plate("enamel_white", [r(-.17, -.17), r(.17, -.17), r(.17, .17), r(-.17, .17)], 0, .42)


@prop("backyard")
def sun_lounger(k):
    """A sun lounger, its back raised toward +X, a towel over it: 1 tile, no cover."""
    for y in (-.3, .3):
        k.box("aluminium", -.7, y - .02, .3, .35, y + .02, .34)
        k.hull("aluminium", [(.33, y - .02, .3), (.37, y - .02, .3), (.37, y + .02, .3), (.33, y + .02, .3),
                             (.7, y - .02, .85), (.74, y - .02, .85), (.74, y + .02, .85), (.7, y + .02, .85)])
        for x in (-.65, .3):
            k.box("aluminium", x, y - .02, 0, x + .04, y + .02, .3)
    k.box("fabric_blue", -.7, -.28, .33, .35, .28, .36)
    k.hull("fabric_blue", [(.33, -.28, .33), (.33, .28, .33), (.36, .28, .31), (.36, -.28, .31),
                           (.7, -.28, .86), (.7, .28, .86), (.73, .28, .84), (.73, -.28, .84)])
    k.box("safety_yellow", -.5, -.29, .36, -.05, .29, .375)


@prop("backyard")
def trampoline(k):
    """A round garden trampoline, its springs' frame on bent legs, the safety-net poles: 2 x 2 tiles, no cover."""
    k.ring("galvanised", (0, 0, .85), (0, 0, 1), 1.42, 1.36, .05, segs=12)
    k.ring("fabric_blue", (0, 0, .89), (0, 0, 1), 1.46, 1.22, .04, segs=12)
    k.cyl("black_paint", (0, 0, .86), (0, 0, .87), 1.25, segs=12, smooth=False)
    for i in range(6):
        a = i * math.pi / 3
        x, y = 1.4 * math.cos(a), 1.4 * math.sin(a)
        k.wire("galvanised", (x, y, 0), (x, y, .85), .025)
        k.wire("black_paint", (x, y, .9), (x * 1.02, y * 1.02, 2.4), .02)
    for i in range(6):
        a, b = i * math.pi / 3, (i + 1) * math.pi / 3
        k.wire("galvanised", (1.4 * math.cos(a), 1.4 * math.sin(a), .02), (1.4 * math.cos(b), 1.4 * math.sin(b), .02), .02)


@prop("backyard")
def sandbox(k):
    """A timber sandpit with a bucket, a spade and a toy truck: 1 tile, no cover."""
    for x0, y0, x1, y1 in ((-.7, -.7, .7, -.62), (-.7, .62, .7, .7), (-.7, -.62, -.62, .62), (.62, -.62, .7, .62)):
        k.box("pine", x0, y0, 0, x1, y1, .25)
    k.box("sandstone", -.62, -.62, 0, .62, .62, .16)
    k.blob("sandstone", (.2, .2, .15), .25, .35, sx=1.4)
    k.cyl("signal_red", (-.3, .2, .16), (-.3, .2, .3), .07, .09, segs=8)
    k.box("municipal_blue", -.1, -.35, .16, .1, -.3, .19)
    k.box("municipal_blue", .08, -.345, .17, .3, -.305, .18)
    k.box("safety_yellow", .2, -.1, .16, .45, .02, .26)
    k.box("safety_yellow", .35, -.1, .26, .45, .02, .32)


@prop("backyard")
def lawnmower(k):
    """A push lawnmower, its handle toward +X, the grass box behind: 1 tile, no cover."""
    k.hull("signal_red", [(-.3, -.25, .06), (.25, -.25, .06), (.25, .25, .06), (-.3, .25, .06),
                          (-.26, -.22, .22), (.22, -.22, .22), (.22, .22, .22), (-.26, .22, .22)])
    k.cyl("black_paint", (-.05, 0, .22), (-.05, 0, .4), .12, .1, segs=8)
    k.box("galvanised", -.1, -.05, .4, 0, .05, .44)
    for x in (-.25, .2):
        for y in (-.27, .27):
            k.cyl("rubber", (x, y - .03, .08), (x, y + .03, .08), .08, segs=6, smooth=False)
    k.box("plastic_black", .25, -.2, .1, .55, .2, .4)
    for y in (-.18, .18):
        k.wire("black_paint", (.2, y, .25), (.75, y, .95), .012)
    k.wire("black_paint", (.75, -.2, .95), (.75, .2, .95), .015)


@prop("backyard")
def veg_bed(k):
    """A raised vegetable bed: a plank frame of dark soil, rows of plants, a bean cane wigwam: 1 tile, low cover."""
    for x0, y0, x1, y1 in ((-.7, -.45, .7, -.39), (-.7, .39, .7, .45), (-.7, -.39, -.64, .39), (.64, -.39, .7, .39)):
        k.box("weathered", x0, y0, 0, x1, y1, .35)
    k.box("soil", -.64, -.39, 0, .64, .39, .3)
    for i in range(5):
        x = -.5 + i * .25
        for y in (-.2, .15):
            k.blob("foliage_light" if i % 2 else "foliage", (x, y, .36), .09, .7)
    for a in range(3):
        k.wire("pine", (.45 + .12 * math.cos(a * 2.1), .12 * math.sin(a * 2.1), .3), (.45, 0, 1.3), .008)
    k.blob("foliage", (.45, 0, .8), .1, 2.5)


@prop("backyard")
def doghouse(k):
    """A dog kennel with a pitched roof and an arched door toward -Y, a bowl in front: 1 tile, low cover."""
    k.box("paint_white", -.45, -.4, 0, .45, .4, .6)
    k.extrude_x("paint_white", -.45, .45, [(-.4, .6), (.4, .6), (0, .9)])
    for s in (-1, 1):
        k.hull("signal_red", [(-.52, s * .48, .54), (.52, s * .48, .54), (.52, 0, .93), (-.52, 0, .93),
                              (-.52, s * .48, .58), (.52, s * .48, .58), (.52, 0, .97), (-.52, 0, .97)])
    k.extrude_y("black_paint", -.405, -.4, [(-.17, 0), (.17, 0), (.17, .35), (.1, .45), (-.1, .45), (-.17, .35)])
    k.box("wood_dark", -.12, -.41, .62, .12, -.4, .7)
    k.cyl("galvanised", (.3, -.6, 0), (.3, -.6, .06), .1, .12, segs=8)
    k.wire("galvanised", (-.45, 0, .2), (-.65, -.4, .02), .006)


@prop("backyard")
def rotary_clothesline(k):
    """A rotary washing line on its pole, sheets and shirts pegged out: 1 tile, no cover."""
    k.cyl("galvanised", (0, 0, 0), (0, 0, 1.85), .025, segs=6)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        k.wire("galvanised", (0, 0, 1.6), (.75 * math.cos(a), .75 * math.sin(a), 1.8), .012)
    for r in (.4, .7):
        pts = [(r * math.cos(i * math.pi / 2 + math.pi / 4), r * math.sin(i * math.pi / 2 + math.pi / 4)) for i in range(4)]
        z = 1.6 + .2 * r / .75
        for i in range(4):
            k.wire("paint_white", (*pts[i], z), (*pts[(i + 1) % 4], z), .004)
    k.box("linen", -.48, .475, 1.05, .48, .5, 1.78)
    for x, w, h, sw in ((-.3, .25, .45, "fabric_blue"), (.05, .2, .35, "fabric_red"), (.3, .15, .25, "paint_white")):
        k.box(sw, x - w / 2, -.5, 1.78 - h, x + w / 2, -.48, 1.78)


@prop("backyard")
def wheelbarrow(k):
    """A wheelbarrow, its wheel toward -X, half full of soil: 1 tile, no cover."""
    k.hull("paint_green", [(-.35, -.18, .3), (.25, -.18, .3), (.25, .18, .3), (-.35, .18, .3),
                           (-.5, -.32, .62), (.4, -.3, .62), (.4, .3, .62), (-.5, .32, .62)])
    k.box("soil", -.4, -.25, .58, .32, .25, .6)
    k.cyl("rubber", (-.5, -.05, .18), (-.5, .05, .18), .18, segs=8, smooth=False)
    for y in (-.22, .22):
        k.wire("galvanised", (-.5, y * .3, .18), (.85, y, .55), .015)
        k.wire("galvanised", (.25, y, .3), (.25, y, 0), .015)


@prop("backyard")
def woodpile(k):
    """Split logs stacked against a wall, a chopping block with an axe in it: 1 tile, low cover, its back to the wall."""
    for row in range(3):
        for i in range(4 - (row == 2)):
            x = -.65 + i * .26 + row * .13 * (row == 2)
            z = .1 + row * .2
            k.cyl("bark", (x, BACK - .55, z), (x, BACK - .05, z), .1, segs=6, smooth=False, rot=row * .4 + i)
    k.box("bark", -.75, BACK - .55, 0, -.65, BACK - .45, .02)
    k.cyl("bark", (.45, BACK - .5, 0), (.45, BACK - .5, .4), .2, segs=8)
    k.cyl("pine", (.45, BACK - .5, .4), (.45, BACK - .5, .41), .19, segs=8, smooth=False)
    k.wire("oak", (.45, BACK - .5, .42), (.6, BACK - .75, .85), .015)
    k.box("iron", .38, BACK - .55, .4, .5, BACK - .45, .5)


@prop("backyard")
def bicycle(k):
    """A bicycle along X, its front wheel toward -X, on its kickstand: 1 tile, no cover."""
    for x in (-.52, .52):
        k.ring("rubber", (x, 0, .34), (0, 1, 0), .34, .3, .04, segs=10)
    hub_f, hub_b = (-.52, 0, .34), (.52, 0, .34)
    bb, seat, head = (.05, 0, .32), (.2, 0, .82), (-.38, 0, .82)
    for p0, p1 in ((hub_f, head), (head, seat), (head, bb), (bb, seat), (bb, hub_b), (seat, hub_b)):
        k.wire("municipal_blue", p0, p1, .016)
    k.box("plastic_black", .12, -.05, .84, .32, .05, .88)
    k.wire("black_paint", (-.4, 0, .82), (-.42, 0, .95), .015)
    k.wire("black_paint", (-.42, -.25, .95), (-.42, .25, .95), .014)
    k.wire("galvanised", (.08, .04, .3), (.18, .2, .02), .01)


@prop("house")
def basement_boiler(k):
    """A basement furnace with its flue and a water heater beside it, pipes up to the ceiling: 1 tile, its back to the wall."""
    k.box("enamel_white", -.7, BACK - .7, 0, -.05, BACK, 1.35)
    k.box("enamel_grey", -.65, BACK - .71, .15, -.1, BACK - .7, .55)
    k.box("led_red", -.2, BACK - .715, 1.15, -.15, BACK - .71, 1.2)
    k.cyl("galvanised", (-.38, BACK - .35, 1.35), (-.38, BACK - .35, 2.5), .09, segs=8)
    k.cyl("enamel_grey", (.35, BACK - .3, 0), (.35, BACK - .3, 1.5), .27, segs=10)
    k.cyl("enamel_grey", (.35, BACK - .3, 1.5), (.35, BACK - .3, 1.58), .27, .2, segs=10)
    for x in (.25, .45):
        k.cyl("copper", (x, BACK - .3, 1.58), (x, BACK - .3, 2.5), .02, segs=5)
    k.box("brass", .2, BACK - .58, .3, .3, BACK - .56, .4)
    k.cyl("copper", (-.05, BACK - .1, .9), (.1, BACK - .1, .9), .02, segs=5)


# ----- The small clinic.
@prop("clinic")
def exam_table(k):
    """An examination couch on a cabinet base, its back raised toward +X, a paper roll over it, a step at its side (-Y): 1 tile, its length along X."""
    k.box("enamel_white", -.7, -.3, 0, .55, .3, .7)
    for x0 in (-.65, -.1):
        k.box("enamel_white", x0, -.31, .1, x0 + .5, -.3, .6)
        k.box("chrome", x0 + .2, -.33, .5, x0 + .3, -.31, .52)
    k.box("fabric_blue", -.72, -.32, .7, .3, .32, .82)
    k.hull("fabric_blue", [(.3, -.32, .7), (.3, .32, .7), (.4, .32, .7), (.4, -.32, .7),
                           (.62, -.32, 1.15), (.62, .32, 1.15), (.72, .32, 1.1), (.72, -.32, 1.1)])
    k.box("paper", -.72, -.25, .82, .3, .25, .825)
    k.cyl("paper", (-.74, -.27, .86), (-.74, .27, .86), .05, segs=6)
    k.box("enamel_grey", -.2, -.58, 0, .2, -.32, .22)
    k.box("rubber", -.18, -.58, .22, .18, -.34, .23)


@prop("clinic")
def clinic_reception(k):
    """A clinic reception counter, a raised ledge toward the waiting room (-Y), a screen and phone behind it: 2 x 1 tiles."""
    y0, y1 = -.4, .3
    k.box("enamel_white", -1.4, y0, 0, 1.4, y1, .75)
    k.box("municipal_blue", -1.4, y0 - .03, 0, 1.4, y0, 1.1)
    k.box("plastic_beige", -1.42, y0 - .1, 1.1, 1.42, y0 + .1, 1.14)
    k.box("plastic_beige", -1.42, y0, .75, 1.42, y1, .78)
    k.box("enamel_white", -.3, y0 - .035, .5, .3, y0 - .03, .9)
    k.box("municipal_blue", -.05, y0 - .04, .6, .05, y0 - .035, .8)
    k.box("municipal_blue", -.15, y0 - .04, .65, .15, y0 - .035, .75)
    k.box("plastic_black", .3, -.1, .78, .82, -.05, 1.12)
    k.box("screen", .32, -.051, .8, .8, -.05, 1.1)
    k.box("plastic_black", .53, -.05, .78, .59, .05, .85)
    k.box("plastic_beige", -.6, -.15, .78, -.38, .05, .84)
    k.box("plastic_black", -.6, -.1, .84, -.38, -.05, .87)
    k.box("paper", -1.1, -.2, .78, -.85, .1, .8)


@prop("clinic")
def waiting_chairs(k):
    """Four linked waiting-room seats on a beam, a side table of magazines at the end, the seats toward -Y: 2 x 1 tiles."""
    k.box("chrome", -1.1, -.05, .3, 1.1, .05, .36)
    for x in (-1.0, 1.0):
        k.box("chrome", x - .03, -.25, 0, x + .03, .25, .3)
    for i in range(4):
        x = -.85 + i * .55
        k.box("fabric_blue", x - .25, -.25, .36, x + .25, .2, .44)
        k.hull("fabric_blue", [(x - .25, .15, .44), (x + .25, .15, .44), (x + .25, .22, .44), (x - .25, .22, .44),
                               (x - .25, .22, .9), (x + .25, .22, .9), (x + .25, .29, .9), (x - .25, .29, .9)])
    k.box("oak", 1.15, -.25, .45, 1.45, .25, .48)
    k.box("chrome", 1.28, -.03, 0, 1.32, .03, .45)
    for i, sw in enumerate(("paper", "signal_red", "municipal_blue")):
        k.box(sw, 1.18 + i * .02, -.15 + i * .04, .48 + i * .006, 1.38 + i * .02, .1 + i * .04, .486 + i * .006)


@prop("clinic")
def medicine_cabinet(k):
    """A tall glass-fronted supply cabinet against a wall, boxes and bottles on its shelves: 1 tile."""
    y0 = BACK - .45
    for x in (-.6, .56):
        k.box("enamel_white", x, y0, 0, x + .04, BACK, 1.95)
    k.box("enamel_white", -.56, y0, 0, .56, BACK, .05)
    k.box("enamel_white", -.56, y0, 1.9, .56, BACK, 1.95)
    k.box("plastic_grey", -.56, BACK - .04, .05, .56, BACK, 1.9)
    for z in (.45, .85, 1.25):
        k.box("glass_light", -.56, y0 + .02, z - .01, .56, BACK - .02, z)
    shades = ("enamel_white", "municipal_blue", "paper", "signal_red", "fabric_green", "safety_yellow")
    for i, z in enumerate((.05, .45, .85, 1.25)):
        goods(k, -.54, .54, y0 + .06, BACK - .1, z, .25, i + 1, 4, shades)
    k.box("enamel_white", -.6, y0 - .02, 1.5, .6, y0, 1.95)
    k.box("enamel_white", -.6, y0 - .02, 0, .6, y0, .05)
    for x in (-.6, -.01, .55):
        k.box("aluminium", x, y0 - .025, .05, x + .05, y0, 1.5)
    k.box("paper", -.4, y0 - .025, 1.62, .4, y0 - .02, 1.82)


@prop("clinic")
def privacy_screen(k):
    """A folding three-panel privacy screen on castors, zigzag along X: 1 tile, no cover."""
    pts = [(-.7, -.15), (-.25, .15), (.25, -.15), (.7, .15)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        k.hull("linen", [(x0, y0 - .01, .2), (x1, y1 - .01, .2), (x1, y1 + .01, .2), (x0, y0 + .01, .2),
                         (x0, y0 - .01, 1.75), (x1, y1 - .01, 1.75), (x1, y1 + .01, 1.75), (x0, y0 + .01, 1.75)])
        k.wire("chrome", (x0, y0, 1.78), (x1, y1, 1.78), .012)
    for x, y in pts:
        k.wire("chrome", (x, y, .05), (x, y, 1.8), .015)
        k.cyl("rubber", (x, y, 0), (x, y, .05), .03, segs=5, smooth=False)


@prop("clinic")
def wheelchair(k):
    """A folding wheelchair facing -Y, big wheels each side, castors in front: 1 tile, no cover."""
    for s in (-1, 1):
        k.ring("rubber", (s * .3, .08, .3), (1, 0, 0), .3, .27, .03, segs=10)
        k.wire("chrome", (s * .26, -.2, .1), (s * .26, -.2, .5), .012)
        k.cyl("rubber", (s * .24, -.25, .06), (s * .28, -.25, .06), .06, segs=6, smooth=False)
        k.wire("chrome", (s * .24, -.2, .5), (s * .24, .2, .5), .012)
        k.wire("chrome", (s * .24, .2, .5), (s * .24, .25, 1.0), .012)
        k.wire("plastic_black", (s * .24, .25, 1.0), (s * .24, .38, 1.0), .018)
        k.wire("chrome", (s * .24, -.2, .45), (s * .2, -.38, .12), .012)
        k.box("plastic_black", s * .2 - .07, -.42, .1, s * .2 + .07, -.32, .12)
    k.box("fabric_blue", -.23, -.2, .48, .23, .2, .52)
    k.hull("fabric_blue", [(-.23, .18, .52), (.23, .18, .52), (.23, .22, .52), (-.23, .22, .52),
                           (-.23, .23, .95), (.23, .23, .95), (.23, .27, .95), (-.23, .27, .95)])


@prop("clinic")
def hospital_bed(k):
    """A hospital bed along X, the head raised toward +X, side rails up, on castors: 2 x 1 tiles."""
    k.box("enamel_grey", -1.0, -.42, .25, 1.0, .42, .4)
    for x in (-.9, .9):
        for y in (-.35, .35):
            k.box("chrome", x - .02, y - .02, .08, x + .02, y + .02, .25)
            k.cyl("rubber", (x, y - .025, .05), (x, y + .025, .05), .05, segs=6, smooth=False)
    k.box("linen", -1.0, -.4, .4, .35, .4, .55)
    k.hull("linen", [(.35, -.4, .4), (.35, .4, .4), (.45, .4, .4), (.45, -.4, .4),
                     (.95, -.4, .85), (.95, .4, .85), (1.0, .4, .8), (1.0, -.4, .8)])
    k.box("canvas_white", -1.0, -.42, .5, .2, .42, .6)
    k.hull("linen", [(.7, -.25, .72), (.7, .25, .72), (.8, .25, .7), (.8, -.25, .7), (.85, -.25, .88), (.85, .25, .88), (.95, .25, .85), (.95, -.25, .85)])
    k.box("enamel_white", 1.0, -.45, .25, 1.06, .45, 1.1)
    k.box("enamel_white", -1.06, -.45, .25, -1.0, .45, .85)
    for s in (-1, 1):
        y = s * .44
        for z in (.65, .8):
            k.wire("chrome", (-.6, y, z), (.5, y, z), .012)
        for x in (-.6, .5):
            k.wire("chrome", (x, y, .4), (x, y, .8), .012)


@prop("clinic")
def iv_stand(k):
    """A drip stand on five castors, a fluid bag and a pump on the pole: on a tile, no cover."""
    for i in range(5):
        a = i * 2 * math.pi / 5
        k.wire("chrome", (0, 0, .08), (.28 * math.cos(a), .28 * math.sin(a), .05), .012)
        k.cyl("rubber", (.28 * math.cos(a), .28 * math.sin(a), 0), (.28 * math.cos(a), .28 * math.sin(a), .05), .025, segs=5, smooth=False)
    k.cyl("chrome", (0, 0, .05), (0, 0, 2.0), .015, segs=6)
    k.wire("chrome", (-.15, 0, 1.98), (.15, 0, 1.98), .01)
    k.box("glass_light", .07, -.03, 1.6, .2, .03, 1.92)
    k.wire("plastic_beige", (.13, 0, 1.6), (.08, -.05, .9), .004)
    k.box("enamel_white", -.12, -.08, 1.1, .06, .06, 1.35)
    k.box("screen", -.1, -.085, 1.2, .04, -.08, 1.3)


# ----- Rural: ranch homes, barns, the machine shed, the silo yard, the fields.
@prop("farm")
def rail_fence(k):
    """A post-and-rail fence over 2 tiles (3 m along X) on the tiles' middle line, three weathered rails: 2 x 1 tiles."""
    for x in (-1.45, 0, 1.45):
        k.box("weathered", x - .07, -.07, 0, x + .07, .07, 1.3)
    for z in (.35, .75, 1.15):
        k.box("weathered", -1.45, .07, z, 1.45, .13, z + .12)


@prop("farm")
def barbed_fence(k):
    """A field fence over 2 tiles: rough wooden posts and four strands of barbed wire: 2 x 1 tiles."""
    for x in (-1.45, -.5, .5, 1.45):
        k.cyl("bark", (x, 0, 0), (x + .02, 0, 1.25), .06, .05, segs=6)
    for z in (.3, .6, .9, 1.15):
        k.wire("iron", (-1.45, -.06, z), (1.45, -.06, z - .03), .005)


@prop("farm")
def farm_gate(k):
    """A galvanised five-bar field gate between its posts across 2 tiles (3 m along X), shut: 2 x 1 tiles."""
    for x in (-1.45, 1.45):
        k.box("weathered", x - .09, -.09, 0, x + .09, .09, 1.4)
    for i in range(5):
        z = .2 + i * .24
        k.wire("galvanised", (-1.3, 0, z), (1.35, 0, z), .022)
    for x in (-1.3, 1.35):
        k.wire("galvanised", (x, 0, .15), (x, 0, 1.2), .025)
    k.wire("galvanised", (-1.3, 0, .2), (0, 0, 1.16), .018)
    k.wire("galvanised", (0, 0, 1.16), (0, 0, .2), .018)
    k.box("iron", 1.33, -.04, .9, 1.45, .04, .95)


@prop("farm")
def hay_round(k):
    """A round hay bale lying on its side, its rolled end toward -Y and +Y: 1 tile, low cover."""
    k.cyl("pine", (0, -.6, .72), (0, .6, .72), .72, segs=12)
    for y in (-.25, .25):
        k.cyl("pallet", (0, y - .02, .72), (0, y + .02, .72), .73, segs=12, smooth=False)
    for s in (-1, 1):
        k.cyl("sandstone", (0, s * .6, .72), (0, s * .605, .72), .45, segs=10, smooth=False)


@prop("farm")
def hay_stack(k):
    """Small square bales stacked three, two, one, the twine on each: 1 tile, low cover."""
    for row, n in ((0, 3), (1, 2), (2, 1)):
        for i in range(n):
            x = -.42 + i * .42 + row * .21
            z = row * .36
            k.box("pine", x - .2, -.45, z, x + .2, .45, z + .35)
            for y in (-.2, .2):
                k.box("wood_dark", x - .205, y - .01, z, x + .205, y + .01, z + .352)


@prop("farm")
def hay_feeder(k):
    """A round-bale feeder ring of galvanised bars round a half-eaten bale: 1 tile, low cover."""
    k.cyl("pine", (0, 0, 0), (0, 0, .9), .6, .55, segs=10)
    k.blob("sandstone", (.2, -.2, .9), .25, .4)
    k.ring("galvanised", (0, 0, 1.1), (0, 0, 1), .72, .68, .04, segs=10)
    k.ring("galvanised", (0, 0, .25), (0, 0, 1), .72, .68, .04, segs=10)
    for i in range(10):
        a = i * 2 * math.pi / 10
        k.wire("galvanised", (.7 * math.cos(a), .7 * math.sin(a), 0), (.7 * math.cos(a), .7 * math.sin(a), 1.12), .015)


@prop("farm")
def water_trough(k):
    """A galvanised stock tank with rounded ends, full of water: 1 tile, low cover."""
    def stadium(r, l, n=5):
        pts = [(l + r * math.cos(-math.pi / 2 + i * math.pi / n), r * math.sin(-math.pi / 2 + i * math.pi / n)) for i in range(n + 1)]
        pts += [(-l + r * math.cos(math.pi / 2 + i * math.pi / n), r * math.sin(math.pi / 2 + i * math.pi / n)) for i in range(n + 1)]
        return pts
    k.plate("galvanised", stadium(.45, .25), 0, .6)
    k.plate("glass_dark", stadium(.4, .25), .6, .602)
    k.cyl("rust", (.55, .3, 0), (.55, .3, .4), .035, segs=5)


@prop("farm")
def chicken_coop(k):
    """A chicken coop on legs with a ramp down to -Y, a nesting box on its side (no hens: they would stand still and blow up): 1 tile."""
    for x in (-.5, .45):
        for y in (-.35, .3):
            k.box("weathered", x, y, 0, x + .05, y + .05, .5)
    k.box("paint_white", -.55, -.4, .5, .55, .4, 1.2)
    k.extrude_x("paint_white", -.55, .55, [(-.4, 1.2), (.4, 1.2), (0, 1.5)])
    for s in (-1, 1):
        k.hull("rust", [(-.62, s * .5, 1.14), (.62, s * .5, 1.14), (.62, 0, 1.52), (-.62, 0, 1.52),
                        (-.62, s * .5, 1.17), (.62, s * .5, 1.17), (.62, 0, 1.55), (-.62, 0, 1.55)])
    k.box("black_paint", -.12, -.405, .52, .12, -.4, .75)
    k.lean("weathered", -.1, .1, -.75, 0, -.42, .52, .03)
    for i in range(4):
        k.box("wood_dark", -.1, -.72 + i * .08, .05 + i * .12, .1, -.7 + i * .08, .07 + i * .12)
    k.box("paint_white", .55, -.25, .7, .75, .25, 1.0)
    k.hull("rust", [(.55, -.28, 1.0), (.8, -.28, .95), (.8, .28, .95), (.55, .28, 1.0), (.55, -.28, 1.04), (.8, -.28, .99), (.8, .28, .99), (.55, .28, 1.04)])


@prop("farm")
def stall_front(k):
    """A horse stall's front: boarded below, iron bars above, a sliding door with a feed-hole yoke: an edge piece inside a barn."""
    k.box("wood_dark", -H, -.04, 0, -.1, .04, 1.2)
    k.box("pine", -.1, -.06, 0, H - .05, -.04, 1.2)
    k.box("iron", -H, -.04, 1.2, H, .04, 1.26)
    k.box("iron", -H, -.04, 2.2, H, .04, 2.26)
    for i in range(10):
        x = -H + .07 + i * .14
        k.wire("iron", (x, 0, 1.26), (x, 0, 2.2), .012)
    k.box("iron", -.1, -.08, 2.26, H, -.06, 2.32)
    for x in (-.05, H - .1):
        k.box("iron", x, -.06, 0, x + .04, -.04, 2.2)
    for i in range(3):
        k.box("wood_dark", -.08, -.065, .2 + i * .35, H - .07, -.06, .24 + i * .35)


@prop("farm")
def saddle_rack(k):
    """A saddle on a wooden saddle stand along X, a red blanket under it, stirrups hanging, a bucket by its foot: 1 tile."""
    for x in (-.45, .45):
        for y in (-.2, .2):
            k.wire("wood_dark", (x, y, 0), (x, 0, .9), .025)
    k.box("wood_dark", -.55, -.05, .88, .55, .05, .95)
    k.hull("fabric_red", [(-.35, -.38, .7), (.35, -.38, .7), (.35, .38, .7), (-.35, .38, .7),
                          (-.35, -.06, .97), (.35, -.06, .97), (.35, .06, .97), (-.35, .06, .97)])
    k.hull("leather", [(-.28, -.3, .82), (.28, -.3, .82), (.28, .3, .82), (-.28, .3, .82),
                       (-.25, -.08, 1.06), (.25, -.08, 1.06), (.25, .08, 1.06), (-.25, .08, 1.06)])
    k.box("leather", .18, -.1, 1.04, .3, .1, 1.14)
    k.cyl("leather", (-.24, 0, 1.06), (-.3, 0, 1.2), .05, segs=5)
    for y in (-.32, .32):
        k.wire("leather_black", (0, y, .85), (0, y * 1.05, .45), .012)
        k.box("galvanised", -.06, y - .02, .38, .06, y + .02, .45)
    k.cyl("galvanised", (.6, -.5, 0), (.6, -.5, .3), .14, .16, segs=8)


@prop("farm")
def tool_rack(k):
    """Farm hand tools hung on a board on the barn wall, a pitchfork, a rake, a shovel, a hoe, a broom: 1 tile, its back to the wall."""
    k.box("weathered", -.7, BACK - .03, 1.4, .7, BACK, 1.55)
    for i, (x, head) in enumerate(((-.5, "fork"), (-.2, "rake"), (.1, "shovel"), (.4, "hoe"))):
        k.box("iron", x - .02, BACK - .06, 1.5, x + .02, BACK - .03, 1.53)
        k.wire("pine", (x, BACK - .05, 1.55), (x, BACK - .05, .35), .016)
        if head == "fork":
            for dx in (-.06, -.02, .02, .06):
                k.wire("iron", (x + dx, BACK - .05, .35), (x + dx, BACK - .05, .08), .006)
            k.box("iron", x - .07, BACK - .06, .33, x + .07, BACK - .04, .37)
        elif head == "rake":
            k.box("iron", x - .2, BACK - .07, .33, x + .2, BACK - .04, .36)
            for j in range(6):
                k.box("iron", x - .18 + j * .07, BACK - .08, .27, x - .17 + j * .07, BACK - .07, .33)
        elif head == "shovel":
            k.hull("iron", [(x - .12, BACK - .07, .05), (x + .12, BACK - .07, .05), (x + .12, BACK - .05, .05), (x - .12, BACK - .05, .05),
                            (x - .13, BACK - .07, .35), (x + .13, BACK - .07, .35), (x + .13, BACK - .05, .35), (x - .13, BACK - .05, .35)])
        else:
            k.box("iron", x - .1, BACK - .1, .3, x + .1, BACK - .05, .36)
    k.wire("pine", (.62, BACK - .4, .15), (.62, BACK - .06, 1.45), .016)
    k.lean("pallet", .52, .72, BACK - .5, 0, BACK - .4, .15, .08)


@prop("machinery")
def tractor(k):
    """A farm tractor along X, its bonnet toward -X, big rear wheels, a cab with glass: 2 x 1 tiles, full cover."""
    k.box("signal_red", -1.3, -.3, .45, .2, .3, 1.15)
    k.box("iron", -1.35, -.22, .5, -1.3, .22, 1.05)
    k.box("enamel_grey", -.5, -.35, .4, .6, .35, .55)
    k.wire("iron", (-.9, .2, 1.15), (-.9, .2, 1.7), .04)
    for y in (-.62, .62):
        k.cyl("rubber", (.55, y - .2, .72), (.55, y + .2, .72), .72, segs=12)
        k.cyl("safety_yellow", (.55, y * 1.33, .72), (.55, y * 1.35, .72), .35, segs=8, smooth=False)
        k.cyl("rubber", (-.95, y * .85 - .1, .42), (-.95, y * .85 + .1, .42), .42, segs=10)
    for x in (.1, 1.05):
        for y in (-.45, .45):
            k.box("black_paint", x - .03, y - .03, 1.15, x + .03, y + .03, 2.45)
    k.box("signal_red", .0, -.55, 2.45, 1.15, .55, 2.55)
    k.box("glass_light", .12, -.44, 1.2, .14, .44, 2.4)
    k.box("glass_light", .14, -.46, 1.2, 1.03, -.44, 2.4)
    k.box("glass_light", .14, .44, 1.2, 1.03, .46, 2.4)
    k.box("plastic_black", .5, -.2, 1.15, .8, .2, 1.4)
    k.box("plastic_black", .75, -.2, 1.4, .82, .2, 1.75)
    k.box("signal_red", .6, -.5, 1.0, 1.2, .5, 1.15)


@prop("machinery")
def hay_wagon(k):
    """A flat hay wagon along X, its drawbar toward -X, ladders at the ends, square bales on the bed: 2 x 1 tiles."""
    k.box("weathered", -1.3, -.6, .55, 1.4, .6, .62)
    k.box("iron", -1.2, -.4, .4, 1.3, .4, .55)
    for x in (-.85, .95):
        for y in (-.55, .55):
            k.cyl("rubber", (x, y - .1, .35), (x, y + .1, .35), .35, segs=8)
    k.wire("iron", (-1.3, 0, .45), (-1.8, 0, .4), .03)
    for x in (-1.3, 1.36):
        for y in (-.55, .55):
            k.box("weathered", x, y - .03, .62, x + .05, y + .03, 1.8)
        for z in (1.0, 1.4, 1.75):
            k.box("weathered", x, -.55, z, x + .05, .55, z + .05)
    for i in range(4):
        x = -1.0 + i * .6
        k.box("pine", x - .28, -.45, .62, x + .28, .0, .97)
        k.box("pine", x - .28, .02, .62, x + .28, .47, .97)
    for i in range(2):
        k.box("pine", -.4 + i * .6 - .28, -.2, .97, -.4 + i * .6 + .28, .25, 1.32)


@prop("machinery")
def cultivator(k):
    """A tractor-drawn cultivator: a steel frame on two wheels, rows of curved tines, its hitch toward -X: 1 tile, no cover."""
    k.box("hazard_orange", -.6, -.65, .55, .6, -.55, .65)
    k.box("hazard_orange", -.6, .55, .55, .6, .65, .65)
    for x in (-.5, .1, .55):
        k.box("hazard_orange", x - .04, -.65, .55, x + .04, .65, .63)
        for i in range(4):
            y = -.45 + i * .3 + (x > 0) * .15
            k.wire("iron", (x, y, .55), (x - .12, y, .05), .015)
    for y in (-.7, .7):
        k.cyl("rubber", (.2, y - .05, .25), (.2, y + .05, .25), .25, segs=8, smooth=False)
    k.wire("hazard_orange", (-.6, -.5, .6), (-1.0, 0, .5), .03)
    k.wire("hazard_orange", (-.6, .5, .6), (-1.0, 0, .5), .03)


@prop("machinery")
def fuel_tank_farm(k):
    """A farm diesel tank lying on a steel stand, a hose and nozzle hung from it: 1 tile."""
    for x in (-.5, .5):
        for y in (-.3, .3):
            k.box("iron", x - .03, y - .03, 0, x + .03, y + .03, 1.2)
        k.box("iron", x - .04, -.33, 1.1, x + .04, .33, 1.2)
    k.cyl("signal_red", (-.72, 0, 1.55), (.72, 0, 1.55), .38, segs=10)
    k.cyl("iron", (0, 0, 1.92), (0, 0, 2.0), .08, segs=6)
    k.box("plastic_black", .55, -.42, 1.0, .62, -.34, 1.25)
    k.wire("rubber", (.6, -.2, 1.2), (.65, -.42, .6), .02)
    k.wire("rubber", (.65, -.42, .6), (.6, -.4, 1.05), .02)
    k.box("enamel_white", -.3, -.385, 1.45, .3, -.38, 1.65)


@prop("machinery")
def propane_tank(k):
    """A white propane tank lying on concrete blocks, rounded ends, its valve cover on top: 2 x 1 tiles."""
    for x in (-.8, .8):
        k.box("concrete", x - .15, -.3, 0, x + .15, .3, .25)
    k.cyl("enamel_white", (-1.0, 0, .75), (1.0, 0, .75), .5, segs=10)
    for s in (-1, 1):
        k.cyl("enamel_white", (s * 1.0, 0, .75), (s * 1.35, 0, .75), .5, .15, segs=10)
    k.cyl("enamel_white", (0, 0, 1.25), (0, 0, 1.38), .2, .18, segs=8)
    k.cyl("enamel_grey", (0, 0, 1.38), (0, 0, 1.4), .18, segs=8, smooth=False)


@prop("structure")
def silo(k):
    """A tall concrete stave silo with a domed cap, a caged ladder and chute toward -Y: 2 x 2 tiles, full cover."""
    k.cyl("concrete", (0, 0, 0), (0, 0, 7.5), 1.35, segs=12)
    for z in (2.5, 5.0):
        k.cyl("iron", (0, 0, z), (0, 0, z + .05), 1.37, segs=12, smooth=False)
    k.cyl("galvanised", (0, 0, 7.5), (0, 0, 8.5), 1.4, .15, segs=12)
    k.box("galvanised", -.35, -1.6, .3, .35, -1.3, 7.5)
    for x in (-.25, .25):
        k.wire("iron", (x, -1.68, 0), (x, -1.68, 7.6), .018)
    for i in range(18):
        z = .3 + i * .4
        k.wire("iron", (-.25, -1.68, z), (.25, -1.68, z), .012)
    k.box("rust", -.5, -1.4, 0, .5, -1.2, .15)


@prop("structure")
def grain_bin(k):
    """A corrugated steel grain bin with a conical roof, its door hatch and ladder toward -Y: 2 x 2 tiles, full cover."""
    k.cyl("concrete", (0, 0, 0), (0, 0, .15), 1.48, segs=10, smooth=False)
    k.cyl("galvanised", (0, 0, .15), (0, 0, 4.2), 1.4, segs=12)
    for i in range(3):
        z = 1.0 + i * 1.1
        k.cyl("aluminium", (0, 0, z), (0, 0, z + .04), 1.42, segs=12, smooth=False)
    k.cyl("galvanised", (0, 0, 4.2), (0, 0, 5.3), 1.45, .2, segs=12)
    k.cyl("galvanised", (0, 0, 5.3), (0, 0, 5.5), .2, .1, segs=8)
    k.box("galvanised", -.35, -1.43, .3, .35, -1.38, 1.1)
    for x in (.6, .8):
        k.wire("iron", (x, -1.3, 0), (x, -1.3, 4.3), .015)
    for i in range(10):
        z = .3 + i * .4
        k.wire("iron", (.6, -1.3, z), (.8, -1.3, z), .01)


@prop("structure")
def windmill(k):
    """A water-pumping windmill: a lattice tower, its bladed wheel facing -Y, a tail vane, a stock tank at its foot: 1 tile."""
    top = 6.0
    for x in (-1, 1):
        for y in (-1, 1):
            k.wire("galvanised", (x * .55, y * .55, 0), (x * .12, y * .12, top), .02)
    for z, r in ((1.5, .45), (3.0, .34), (4.5, .23)):
        for (x0, y0), (x1, y1) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            k.wire("galvanised", (x0 * r, y0 * r, z), (x1 * r, y1 * r, z), .012)
    hub = Vector((0, -.35, top + .25))
    k.box("galvanised", -.12, -.4, top, .12, .4, top + .3)
    for i in range(12):
        a = i * 2 * math.pi / 12
        d = Vector((math.cos(a), 0, math.sin(a)))
        p0, p1 = hub + d * .25, hub + d * 1.1
        k.hull("galvanised", [p0 + Vector((0, -.01, 0)), p1 + Vector((0, -.01, 0)) + Vector((-d.z, 0, d.x)) * .12, p1 + Vector((0, .01, 0)) + Vector((-d.z, 0, d.x)) * .12, p0 + Vector((0, .01, 0)),
                              p0 + Vector((0, -.01, 0)) + Vector((-d.z, 0, d.x)) * .05, p1 + Vector((0, -.01, 0)), p1 + Vector((0, .01, 0)), p0 + Vector((0, .01, 0)) + Vector((-d.z, 0, d.x)) * .05])
    k.box("galvanised", -.01, .4, top + .05, .01, 1.4, top + .2)
    k.box("galvanised", -.02, 1.0, top, .02, 1.6, top + .6)
    k.wire("iron", (0, 0, top), (0, 0, .4), .012)
    k.cyl("galvanised", (.45, -.4, 0), (.45, -.4, .5), .3, segs=8)
    k.cyl("glass_dark", (.45, -.4, .5), (.45, -.4, .502), .27, segs=8, smooth=False)


@prop("structure")
def well(k):
    """A stone well with a little shingled roof on two posts, a crank and a bucket: 1 tile, low cover."""
    k.ring("sandstone", (0, 0, .4), (0, 0, 1), .6, .45, .8, segs=10)
    k.cyl("glass_dark", (0, 0, .5), (0, 0, .52), .46, segs=10, smooth=False)
    for x in (-.55, .55):
        k.box("wood_dark", x - .05, -.05, .6, x + .05, .05, 1.8)
    k.cyl("wood_dark", (-.6, 0, 1.4), (.7, 0, 1.4), .05, segs=6)
    k.box("wood_dark", .7, -.02, 1.25, .74, .02, 1.42)
    for s in (-1, 1):
        k.hull("terracotta", [(-.75, s * .6, 1.65), (.75, s * .6, 1.65), (.75, 0, 2.05), (-.75, 0, 2.05),
                              (-.75, s * .6, 1.7), (.75, s * .6, 1.7), (.75, 0, 2.1), (-.75, 0, 2.1)])
    k.wire("iron", (0, 0, 1.38), (0, 0, 1.0), .005)
    k.cyl("wood_dark", (0, 0, .8), (0, 0, 1.0), .1, .12, segs=8)


@prop("structure")
def cellar_door(k):
    """A storm-cellar's sloping double doors on a concrete frame against the house's outside wall (-Y): an edge piece."""
    y0 = -WF - 1.1
    k.hull("concrete", [(-.7, y0, 0), (.7, y0, 0), (.7, -WF, 0), (-.7, -WF, 0),
                        (-.7, y0, .25), (.7, y0, .25), (.7, -WF, .7), (-.7, -WF, .7)])
    for x0, x1 in ((-.6, -.01), (.01, .6)):
        k.hull("weathered", [(x0, y0 + .08, .25), (x1, y0 + .08, .25), (x1, y0 + .08, .29), (x0, y0 + .08, .29),
                             (x0, -WF - .05, .7), (x1, -WF - .05, .7), (x1, -WF - .05, .74), (x0, -WF - .05, .74)])
        k.hull("black_paint", [(x0 + .05, y0 + .25, .34), (x0 + .1, y0 + .25, .34), (x0 + .1, y0 + .25, .36), (x0 + .05, y0 + .25, .36),
                               (x0 + .05, -WF - .2, .68), (x0 + .1, -WF - .2, .68), (x0 + .1, -WF - .2, .7), (x0 + .05, -WF - .2, .7)])
    k.box("rust", -.05, y0 + .4, .42, .05, y0 + .5, .48)


@prop("structure")
def scarecrow(k):
    """A scarecrow on its post: a checked shirt on the crossbar, a sack head, a straw hat, straw at the cuffs: 1 tile, no cover."""
    k.box("bark", -.04, -.04, 0, .04, .04, 1.9)
    k.box("bark", -.7, -.03, 1.35, .7, .03, 1.42)
    k.box("fabric_red", -.25, -.12, .8, .25, .12, 1.45)
    for s in (-1, 1):
        a, b = sorted((s * .25, s * .6))
        k.box("fabric_red", a, -.08, 1.3, b, .08, 1.45)
        for dz in (-.03, .03):
            k.wire("pine", (s * .6, 0, 1.38 + dz), (s * .75, 0, 1.3 + dz * 2), .008)
    k.box("fabric_blue", -.22, -.11, .5, .22, .11, .82)
    k.blob("canvas_white", (0, 0, 1.6), .16, 1.1)
    k.cyl("pine", (0, 0, 1.7), (0, 0, 1.72), .3, segs=8, smooth=False)
    k.cyl("pine", (0, 0, 1.72), (0, 0, 1.86), .14, .12, segs=8)


@prop("crops")
def crop_corn(k):
    """A tile of tall corn: three rows of stalks with leaves and cobs, the soil ridged under them: 1 tile, no cover (blocks the view)."""
    for y in (-.5, 0, .5):
        k.box("soil", -.75, y - .12, 0, .75, y + .12, .06)
        for i in range(3):
            x = -.5 + i * .5 + (y * .3)
            h = 1.9 + .15 * ((i + int(y * 4)) % 3)
            k.wire("foliage_light", (x, y, .06), (x, y, h), .02)
            k.blob("foliage", (x, y, h * .62), .2, .5, sx=1.2, turn=i + y * 3)
            k.cyl("safety_yellow", (x + .03, y, h * .45), (x + .06, y, h * .45 + .2), .03, segs=4, smooth=False)


@prop("crops")
def crop_wheat(k):
    """A tile of ripe wheat at waist height, its top ruffled, the furrow showing at the edges: 1 tile, no cover."""
    k.box("soil", -.75, -.75, 0, .75, .75, .04)
    for i in range(4):
        y = -.56 + i * .375
        for j in range(3):
            x0, x1 = -.75 + j * .5, -.25 + j * .5
            h0, h1 = .72 + .1 * ((i + j) % 3) / 2, .72 + .1 * ((i + j + 1) % 3) / 2
            sw = "pine" if (i + j) % 2 else "sandstone"
            k.hull(sw, [(x0, y - .14, .04), (x1, y - .14, .04), (x1, y + .14, .04), (x0, y + .14, .04),
                        (x0, y - .1, h0), (x1, y - .1, h1), (x1, y + .1, h1), (x0, y + .1, h0)])


@prop("crops")
def pumpkin_patch(k):
    """A pumpkin patch: ridged soil, sprawling vines and leaves, ripe pumpkins: 1 tile, no cover."""
    k.box("soil", -.75, -.75, 0, .75, .75, .05)
    for c, r, t in (((-.35, .3, .1), .3, 0), ((.35, -.3, .1), .32, 1.0), ((.4, .45, .08), .22, 2.0), ((-.45, -.4, .08), .25, 2.6)):
        k.blob("foliage", c, r, .3, sx=1.3, turn=t)
    for x, y, r in ((-.1, -.05, .2), (.3, .15, .15), (-.4, -.1, .13), (.05, -.5, .17)):
        k.blob("hazard_orange", (x, y, .05 + r * .7), r, .75, sx=1.1)
        k.cyl("foliage", (x, y, .05 + r * 1.4), (x + .02, y, .05 + r * 1.4 + .06), .02, segs=4, smooth=False)


@prop("farm")
def rocking_chair(k):
    """A wooden rocking chair on curved rockers, facing -Y: 1 tile, no cover (a porch's)."""
    for x in (-.24, .24):
        pts = [(-.4, .08), (-.2, .02), (0, 0), (.2, .02), (.38, .1)]
        for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
            k.hull("walnut", [(x - .02, y0, z0), (x + .02, y0, z0), (x + .02, y1, z1), (x - .02, y1, z1),
                              (x - .02, y0, z0 + .05), (x + .02, y0, z0 + .05), (x + .02, y1, z1 + .05), (x - .02, y1, z1 + .05)])
        for y in (-.2, .2):
            k.box("walnut", x - .02, y - .02, .05, x + .02, y + .02, .45)
        k.box("walnut", x - .025, -.25, .62, x + .025, .2, .66)
        k.box("walnut", x - .02, -.22, .45, x + .02, -.18, .62)
    k.box("walnut", -.26, -.25, .43, .26, .22, .47)
    k.lean("walnut", -.26, .26, .2, .47, .28, 1.15, .03)


# ----- Lairs: old money and modern minimalism, and what every lair keeps.
# Pieces against a wall have their back at +Y (BACK from their middle, or
# BACK2 for 2 x 2), the room toward -Y.
BACK2 = TILE - WF - .005


@prop("lair_old")
def four_poster_bed(k):
    """A four-poster bed: turned posts, a canopy with red velvet drapes tied back, a carved headboard, a red spread: 2 x 2 tiles, the head to the wall (+Y)."""
    y0, y1 = BACK2 - 2.25, BACK2
    k.box("walnut", -1.0, y0, .15, 1.0, y1 - .1, .42)
    k.box("linen", -.95, y0 + .05, .42, .95, y1 - .15, .62)
    k.box("fabric_red", -.98, y0 + .02, .5, .98, y1 - .6, .66)
    for x0 in (-.85, .05):
        k.box("linen", x0, y1 - .55, .62, x0 + .8, y1 - .18, .76)
    k.extrude_y("walnut", y1 - .1, y1, [(-1.0, .15), (1.0, .15), (1.0, 1.4), (.5, 1.6), (0, 1.68), (-.5, 1.6), (-1.0, 1.4)])
    for x in (-1.02, 1.02):
        for y in (y0 + .02, y1 - .05):
            k.cyl("walnut", (x, y, 0), (x, y, 2.35), .06, .05, segs=6)
    k.box("walnut", -1.08, y0 - .04, 2.35, 1.08, y1, 2.5)
    for x in (-1.02, 1.02):
        for y in (y0 + .02, y1 - .05):
            k.hull("fabric_red", [(x - .12, y - .12, 2.35), (x + .12, y - .12, 2.35), (x + .12, y + .12, 2.35), (x - .12, y + .12, 2.35),
                                  (x - .06, y - .06, .3), (x + .06, y - .06, .3), (x + .06, y + .06, .3), (x - .06, y + .06, .3)])
    k.box("brass", -1.08, y0 - .045, 2.4, 1.08, y0 - .04, 2.44)


@prop("lair_old")
def chesterfield(k):
    """A buttoned leather chesterfield, rolled arms as high as its back: 2 x 1 tiles, the seat toward -Y, its back to the wall."""
    y0, y1 = BACK - .9, BACK
    k.box("leather", -1.2, y0, .1, 1.2, y1, .42)
    k.box("leather", -1.2, y1 - .22, .42, 1.2, y1, .8)
    for s in (-1, 1):
        a, b = sorted((s * 1.2, s * .98))
        k.box("leather", a, y0, .42, b, y1, .72)
        k.cyl("leather", (s * 1.18, y0 - .02, .74), (s * 1.18, y1, .74), .1, segs=8)
    k.cyl("leather", (-1.2, y1 - .1, .82), (1.2, y1 - .1, .82), .11, segs=8)
    for i in range(3):
        x0 = -.98 + i * .653
        k.box("leather", x0 + .01, y0 + .02, .42, x0 + .64, y1 - .22, .52)
    for x in (-1.1, 1.1):
        for y in (y0 + .06, y1 - .06):
            k.cyl("brass", (x, y, 0), (x, y, .1), .03, .04, segs=5)


@prop("lair_old")
def wingback_chair(k):
    """A green velvet wingback armchair on turned legs, a small table with a decanter beside it, facing -Y: 1 tile."""
    for x in (-.32, .32):
        for y in (-.28, .28):
            k.cyl("walnut", (x, y, 0), (x, y, .22), .03, .02, segs=5)
    k.box("fabric_green", -.38, -.35, .22, .38, .35, .45)
    k.box("fabric_green", -.3, -.33, .45, .3, .2, .55)
    k.hull("fabric_green", [(-.38, .2, .45), (.38, .2, .45), (.38, .35, .45), (-.38, .35, .45),
                            (-.36, .25, 1.2), (.36, .25, 1.2), (.36, .38, 1.2), (-.36, .38, 1.2)])
    for s in (-1, 1):
        a, b = sorted((s * .38, s * .28))
        k.hull("fabric_green", [(a, -.3, .45), (b, -.3, .45), (b, .35, .45), (a, .35, .45),
                                (a, -.1, 1.1), (b, -.1, 1.1), (b, .35, 1.15), (a, .35, 1.15)])
    k.cyl("walnut", (.6, -.4, 0), (.6, -.4, .6), .03, segs=5)
    k.cyl("walnut", (.6, -.4, .6), (.6, -.4, .63), .15, segs=8)
    k.cyl("glass_light", (.6, -.4, .63), (.6, -.4, .8), .05, .02, segs=6)
    k.box("canvas_red", .57, -.43, .64, .63, -.37, .72)


@prop("lair_old")
def fireplace_grand(k):
    """A marble fireplace with a fire in the grate, a mantel with candlesticks and a clock, the chimney breast up to the ceiling: 1 tile, its back to the wall."""
    y0 = BACK - .4
    k.box("sandstone", -.72, BACK - .25, 0, .72, BACK, 2.45)
    k.box("limestone", -.75, y0, 0, -.38, BACK - .25, 1.2)
    k.box("limestone", .38, y0, 0, .75, BACK - .25, 1.2)
    k.box("limestone", -.38, y0, .85, .38, BACK - .25, 1.2)
    k.box("limestone", -.82, y0 - .06, 1.2, .82, BACK - .2, 1.28)
    k.box("black_paint", -.38, y0 + .1, 0, .38, BACK - .25, .85)
    k.box("limestone", -.8, y0 - .35, 0, .8, y0, .04)
    k.box("iron", -.28, y0 + .05, .02, .28, y0 + .3, .12)
    for x, a in ((-.12, .3), (.1, -.3), (0, 0)):
        k.cyl("wood_dark", (x - .15 * math.cos(a), y0 + .2, .15), (x + .15 * math.cos(a), y0 + .2 + .1 * math.sin(a), .16), .05, segs=5)
    k.cyl("fire", (-.12, y0 + .2, .15), (-.12, y0 + .2, .55), .12, .01, segs=5, smooth=False)
    k.cyl("fire", (.1, y0 + .2, .15), (.1, y0 + .2, .48), .1, .01, segs=5, smooth=False)
    k.cyl("lamp_warm", (0, y0 + .2, .15), (0, y0 + .2, .38), .07, .01, segs=5, smooth=False)
    for x in (-.6, .6):
        k.cyl("brass", (x, BACK - .3, 1.28), (x, BACK - .3, 1.55), .025, segs=5)
        k.box("lamp_warm", x - .01, BACK - .31, 1.55, x + .01, BACK - .29, 1.6)
    k.box("walnut", -.12, BACK - .35, 1.28, .12, BACK - .22, 1.5)
    k.cyl("paper", (0, BACK - .35, 1.4), (0, BACK - .36, 1.4), .07, segs=8, smooth=False)
    k.box("brass", -.5, BACK - .27, 1.55, .5, BACK - .25, 2.2)
    k.box("glass_light", -.45, BACK - .275, 1.6, .45, BACK - .27, 2.15)


@prop("lair_old")
def grand_piano(k):
    """A black grand piano, its lid propped open, the keyboard toward -Y, a bench in front: 2 x 2 tiles."""
    outline = [(-.75, -.6), (.75, -.6), (.75, .2), (.55, .9), (.15, 1.3), (-.25, 1.35), (-.6, 1.0), (-.75, .4)]
    k.plate("black_paint", outline, .65, .95)
    k.box("enamel_white", -.7, -.78, .72, .7, -.6, .76)
    for i in range(14):
        x = -.66 + i * .1
        if i % 7 in (2, 6):
            continue
        k.box("black_paint", x, -.72, .76, x + .04, -.62, .79)
    k.box("black_paint", -.75, -.8, .65, .75, -.6, .72)
    k.box("black_paint", -.72, -.62, .95, .72, -.58, 1.2)
    for x, y in ((-.6, -.45), (.6, -.45), (-.2, 1.1)):
        k.cyl("black_paint", (x, y, 0), (x, y, .65), .05, .07, segs=6)
    k.hull("black_paint", [(-.75, -.55, .95), (.73, -.55, .95), (.73, -.5, .95), (-.75, -.5, .95),
                           (-.75, .8, 1.85), (.73, .5, 1.9), (.73, .55, 1.9), (-.75, .85, 1.85)])
    k.wire("black_paint", (.6, .4, .95), (.6, .3, 1.75), .012)
    k.box("black_paint", -.4, -1.35, .45, .4, -1.05, .52)
    for x in (-.35, .35):
        k.box("black_paint", x - .03, -1.32, 0, x + .03, -1.08, .45)


@prop("lair_old")
def bookcase(k):
    """A tall walnut bookcase, five shelves of leather-bound books, a cornice on top: 1 tile, its back to the wall."""
    y0 = BACK - .38
    for x in (-.72, .68):
        k.box("walnut", x, y0, 0, x + .04, BACK, 2.3)
    k.box("walnut", -.68, BACK - .03, 0, .68, BACK, 2.3)
    k.box("walnut", -.76, y0 - .05, 2.3, .76, BACK, 2.4)
    shades = ("leather", "fabric_red", "fabric_green", "wood_dark", "leather_black", "fabric_blue", "canvas_red")
    for i, z in enumerate((0, .45, .9, 1.35, 1.8)):
        k.box("walnut", -.68, y0, z, .68, BACK - .03, z + .04)
        goods(k, -.66, .66 if i != 3 else .2, y0 + .05, BACK - .06, z + .04, .34, i + 2, 5 if i != 3 else 3, shades)


@prop("lair_old")
def chandelier(k):
    """A brass chandelier hung on a chain from the ceiling (2.5 m), two tiers of candle bulbs and crystal drops; the origin on the floor under it: 1 tile, no cover."""
    k.wire("brass", (0, 0, 2.5), (0, 0, 2.15), .012)
    k.cyl("brass", (0, 0, 1.75), (0, 0, 2.15), .04, .06, segs=6)
    k.cyl("glass_light", (0, 0, 1.6), (0, 0, 1.75), .02, .08, segs=6)
    for tier, (r, z, n) in enumerate(((.5, 1.85, 6), (.28, 2.02, 5))):
        for i in range(n):
            a = i * 2 * math.pi / n + tier * .3
            x, y = r * math.cos(a), r * math.sin(a)
            k.wire("brass", (0, 0, z - .05), (x, y, z), .012)
            k.box("lamp_warm", x - .02, y - .02, z, x + .02, y + .02, z + .1)
            if tier == 0:
                k.box("glass_light", x - .012, y - .012, z - .15, x + .012, y + .012, z - .05)


@prop("lair_old")
def dining_long(k):
    """A long walnut dining table along X with a silver candelabra and three high-backed chairs each side: 2 x 1 tiles."""
    k.box("walnut", -1.3, -.42, .72, 1.3, .42, .77)
    for x in (-1.15, 1.15):
        k.box("walnut", x - .06, -.3, 0, x + .06, .3, .72)
    k.box("walnut", -1.15, -.05, .12, 1.15, .05, .2)
    k.box("linen", -1.0, -.12, .77, 1.0, .12, .775)
    k.cyl("chrome", (0, 0, .775), (0, 0, 1.15), .03, segs=5)
    k.wire("chrome", (-.25, 0, 1.05), (.25, 0, 1.05), .012)
    for x in (-.25, 0, .25):
        k.box("paper", x - .015, -.015, 1.05 if x else 1.15, x + .015, .015, 1.3 if x else 1.38)
        k.box("lamp_warm", x - .008, -.008, 1.3 if x else 1.38, x + .008, .008, 1.34 if x else 1.42)
    for s in (-1, 1):
        for x in (-.8, 0, .8):
            ya, yb = sorted((s * .5, s * .7))
            k.box("fabric_red", x - .22, ya, .42, x + .22, yb, .5)
            k.box("walnut", x - .2, ya + .02, 0, x + .2, yb - .02, .42)
            yc, yd = sorted((s * .7, s * .76))
            k.box("walnut", x - .22, yc, .5, x + .22, yd, 1.25)


@prop("lair_old")
def portrait_gilt(k):
    """An old master's portrait in a heavy gilt frame, lit by a picture light: 1 tile, hung on the wall behind (+Y)."""
    y = BACK
    k.box("brass", -.55, y - .07, .95, .55, y, 2.25)
    k.box("wood_dark", -.45, y - .075, 1.05, .45, y - .07, 2.15)
    k.hull("fabric_red", [(-.3, y - .08, 1.05), (.3, y - .08, 1.05), (.3, y - .075, 1.05), (-.3, y - .075, 1.05),
                          (-.18, y - .08, 1.65), (.18, y - .08, 1.65), (.18, y - .075, 1.65), (-.18, y - .075, 1.65)])
    k.wall_blob("upholstery_tan", 0, 1.8, .1, .13, y - .075, .005, n=8)
    k.wall_blob("black_paint", 0, 1.88, .12, .08, y - .074, .005, n=8)
    k.box("brass", -.3, y - .2, 2.3, .3, y - .1, 2.36)
    k.box("lamp_warm", -.28, y - .2, 2.29, .28, y - .1, 2.3)
    k.box("brass", -.02, y - .12, 2.25, .02, y - .07, 2.32)
    k.box("brass", -.12, y - .08, .9, .12, y - .07, .96)


@prop("lair_old")
def suit_of_armour(k):
    """A suit of plate armour on a stone plinth, a halberd in its hand, facing -Y: 1 tile."""
    k.box("concrete_dark", -.32, -.3, 0, .32, .3, .2)
    for x in (-.1, .1):
        k.cyl("steel", (x, 0, .2), (x, 0, .95), .065, .08, segs=6)
        k.box("steel", x - .07, -.15, .2, x + .07, .05, .28)
    k.hull("steel", [(-.17, -.1, .95), (.17, -.1, .95), (.17, .1, .95), (-.17, .1, .95),
                     (-.24, -.14, 1.45), (.24, -.14, 1.45), (.24, .12, 1.45), (-.24, .12, 1.45)])
    for s in (-1, 1):
        k.blob("steel", (s * .26, 0, 1.42), .1, .8)
        k.cyl("steel", (s * .27, 0, 1.4), (s * .3, -.05, 1.0), .05, .045, segs=6)
    k.cyl("steel", (0, 0, 1.45), (0, 0, 1.75), .11, .1, segs=8)
    k.box("black_paint", -.08, -.11, 1.58, .08, -.1, 1.61)
    k.cyl("wood_dark", (.32, -.1, .2), (.32, -.1, 2.25), .015, segs=4)
    k.hull("steel", [(.32, -.1, 1.95), (.48, -.1, 2.05), (.48, -.09, 2.05), (.32, -.09, 1.95), (.32, -.1, 2.2), (.48, -.1, 2.12), (.48, -.09, 2.12), (.32, -.09, 2.2)])
    k.cyl("steel", (.32, -.1, 2.25), (.32, -.1, 2.42), .02, .002, segs=4, smooth=False)
    k.box("fabric_red", -.15, -.13, .9, .15, -.1, 1.0)


@prop("lair_old")
def grandfather_clock(k):
    """A longcase clock: a walnut case, a glass door on its brass pendulum, the dial in its hood, facing -Y: 1 tile, its back to the wall."""
    y0 = BACK - .32
    k.box("walnut", -.3, y0, 0, .3, BACK, .45)
    k.box("walnut", -.22, y0 + .03, .45, .22, BACK, 1.5)
    k.box("glass_dark", -.15, y0 + .025, .6, .15, y0 + .03, 1.4)
    k.wire("brass", (0, y0 + .04, 1.4), (0, y0 + .04, .85), .006)
    k.cyl("brass", (0, y0 + .02, .8), (0, y0 + .04, .8), .08, segs=8, smooth=False)
    k.box("walnut", -.3, y0 - .02, 1.5, .3, BACK, 2.1)
    k.cyl("paper", (0, y0 - .02, 1.8), (0, y0 - .03, 1.8), .2, segs=10, smooth=False)
    k.box("black_paint", -.005, y0 - .035, 1.8, .005, y0 - .03, 1.95)
    k.box("black_paint", 0, y0 - .035, 1.795, .12, y0 - .03, 1.805)
    k.extrude_y("walnut", y0 - .02, BACK, [(-.32, 2.1), (.32, 2.1), (.2, 2.25), (0, 2.32), (-.2, 2.25)])
    k.cyl("brass", (0, y0, 2.32), (0, y0, 2.4), .03, .005, segs=5)


@prop("lair_old")
def persian_rug(k):
    """A large Persian rug: a red field, a dark border and a gold band, a medallion in the middle: 2 x 2 tiles, on the floor."""
    k.box("fabric_blue", -1.35, -.95, 0, 1.35, .95, .008)
    k.box("brass", -1.22, -.82, 0, 1.22, .82, .01)
    k.box("fabric_red", -1.15, -.75, 0, 1.15, .75, .012)
    k.plate("fabric_blue", [(0, -.5), (.75, 0), (0, .5), (-.75, 0)], 0, .014)
    k.plate("brass", [(0, -.28), (.42, 0), (0, .28), (-.42, 0)], 0, .016)
    for x, y in ((-.95, -.55), (.95, -.55), (-.95, .55), (.95, .55)):
        k.plate("fabric_blue", [(x - .15, y), (x, y - .15), (x + .15, y), (x, y + .15)], 0, .014)
    for x in (-1.37, 1.35):
        k.box("linen", x, -.9, 0, x + .02, .9, .006)


@prop("lair_old")
def billiard_table(k):
    """A full billiard table along X: green baize, cushions, six pockets, carved legs, balls and two cues: 2 x 1 tiles."""
    k.box("walnut", -1.35, -.72, .62, 1.35, .72, .82)
    k.box("fabric_green", -1.22, -.6, .82, 1.22, .6, .84)
    for x0, y0, x1, y1 in ((-1.22, -.66, 1.22, -.6), (-1.22, .6, 1.22, .66), (-1.28, -.6, -1.22, .6), (1.22, -.6, 1.28, .6)):
        k.box("fabric_green", x0, y0, .82, x1, y1, .88)
    for x0, y0, x1, y1 in ((-1.35, -.72, 1.35, -.66), (-1.35, .66, 1.35, .72), (-1.35, -.66, -1.28, .66), (1.28, -.66, 1.35, .66)):
        k.box("walnut", x0, y0, .82, x1, y1, .9)
    for x in (-1.25, 0, 1.25):
        for y in (-.63, .63):
            k.box("black_paint", x - .05, y - .05, .84, x + .05, y + .05, .905)
    for x in (-1.1, 1.1):
        for y in (-.55, .55):
            k.cyl("walnut", (x, y, 0), (x, y, .62), .08, .06, segs=6)
    for (x, y), sw in (((.5, 0), "enamel_white"), ((-.5, .1), "signal_red"), ((-.56, .14), "safety_yellow"), ((-.56, .06), "municipal_blue"), ((-.62, .1), "black_paint")):
        k.cyl(sw, (x, y, .84), (x, y, .89), .028, segs=5)
    k.wire("oak", (.6, -.1, .9), (1.6, -.4, .95), .012)
    k.wire("oak", (-1.2, .8, 0), (-1.25, .78, 1.45), .012)


@prop("lair_old")
def coffin_antique(k):
    """An antique coffin on a draped bier along X, brass handles, the lid slid half off on red satin, candles at its head: 2 x 1 tiles."""
    for x in (-.85, .85):
        for y in (-.25, .25):
            k.box("wood_dark", x - .04, y - .04, 0, x + .04, y + .04, .55)
    k.box("canvas_red", -1.05, -.38, .55, 1.05, .38, .6)
    k.box("fabric_red", -1.0, -.385, .2, 1.0, -.38, .6)
    shape = [(-1.0, -.18), (.45, -.32), (1.0, -.22), (1.0, .22), (.45, .32), (-1.0, .18)]
    k.plate("walnut", shape, .6, .95)
    inner = [(-.92, -.13), (.45, -.25), (.92, -.16), (.92, .16), (.45, .25), (-.92, .13)]
    k.plate("fabric_red", inner, .94, .955)
    k.plate("walnut", [(-1.45, -.19), (-.1, -.33), (-.1, .33), (-1.45, .19)], .96, 1.03)
    for x in (-.5, .1, .6):
        for s in (-1, 1):
            a, b = sorted((s * .3, s * .34))
            k.box("brass", x - .1, a, .7, x + .1, b, .74)
    for y in (-.4, .4):
        x = 1.35
        k.cyl("iron", (x, y, 0), (x, y, 1.2), .02, segs=4)
        k.cyl("iron", (x, y, 1.2), (x, y, 1.23), .08, segs=6, smooth=False)
        k.cyl("linen", (x, y, 1.23), (x, y, 1.45), .035, segs=6)
        k.box("lamp_warm", x - .01, y - .01, 1.45, x + .01, y + .01, 1.5)


@prop("lair_modern")
def platform_bed(k):
    """A low platform bed with a long padded headboard, floating nightstands, a light strip glowing under it: 2 x 2 tiles, the head to the wall."""
    y0, y1 = BACK2 - 2.2, BACK2
    k.box("lamp_cool", -.95, y0 + .1, 0, .95, y1 - .15, .06)
    k.box("black_paint", -1.05, y0, .08, 1.05, y1 - .1, .3)
    k.box("enamel_white", -.95, y0 + .05, .3, .95, y1 - .15, .52)
    k.box("fabric_grey", -.98, y0 + .02, .4, .98, y0 + .6, .55)
    for x0 in (-.85, .05):
        k.box("enamel_white", x0, y1 - .55, .52, x0 + .8, y1 - .2, .64)
    k.box("fabric_grey", -1.45, y1 - .1, .2, 1.45, y1, 1.15)
    for x in (-1.25, 1.25):
        k.box("oak", x - .22, y1 - .5, .4, x + .22, y1 - .1, .55)
        k.cyl("chrome", (x, y1 - .3, .55), (x, y1 - .3, .9), .01, segs=4)
        k.cyl("lamp_warm", (x, y1 - .3, .9), (x, y1 - .3, 1.0), .08, .08, segs=8)


@prop("lair_modern")
def sofa_modern(k):
    """A long low sofa, deep square cushions, slim chrome feet, a throw: 2 x 1 tiles, the seat toward -Y, its back to the wall."""
    y0, y1 = BACK - 1.0, BACK
    for x in (-1.3, 1.3):
        for y in (y0 + .08, y1 - .08):
            k.box("chrome", x - .02, y - .02, 0, x + .02, y + .02, .12)
    k.box("linen", -1.4, y0, .12, 1.4, y1, .35)
    k.box("linen", -1.4, y1 - .2, .35, 1.4, y1, .7)
    for x0 in (-1.4, 1.25):
        k.box("linen", x0, y0, .35, x0 + .15, y1, .55)
    for i in range(2):
        x0 = -1.25 + i * 1.25
        k.box("canvas_white", x0 + .01, y0 + .02, .35, x0 + 1.24, y1 - .2, .48)
        k.box("canvas_white", x0 + .05, y1 - .4, .48, x0 + 1.2, y1 - .2, .8)
    k.box("black_paint", .4, y0 - .01, .35, .9, y1 - .2, .49)


@prop("lair_modern")
def lounge_chair(k):
    """A curved black leather lounge chair on a chrome swivel base, with its ottoman toward -Y: 1 tile."""
    k.cyl("chrome", (0, .15, 0), (0, .15, .3), .03, segs=5)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        k.wire("chrome", (0, .15, .02), (.3 * math.cos(a), .15 + .3 * math.sin(a), .02), .015)
    k.hull("leather_black", [(-.38, -.2, .3), (.38, -.2, .3), (.38, .4, .35), (-.38, .4, .35),
                             (-.36, -.18, .45), (.36, -.18, .45), (.36, .35, .48), (-.36, .35, .48)])
    k.hull("leather_black", [(-.36, .3, .4), (.36, .3, .4), (.36, .42, .4), (-.36, .42, .4),
                             (-.33, .5, 1.05), (.33, .5, 1.05), (.33, .6, 1.02), (-.33, .6, 1.02)])
    for s in (-1, 1):
        k.box("walnut", s * .38 - .04, -.1, .45, s * .38 + .04, .35, .5)
    k.cyl("chrome", (0, -.55, 0), (0, -.55, .25), .025, segs=5)
    k.box("leather_black", -.3, -.75, .25, .3, -.35, .38)


@prop("lair_modern")
def dining_glass(k):
    """A glass dining table on chrome trestles along X, four white moulded chairs: 2 x 1 tiles."""
    k.box("glass_light", -1.1, -.45, .72, 1.1, .45, .74)
    for x in (-.85, .85):
        k.wire("chrome", (x, -.4, 0), (x, .4, .72), .02)
        k.wire("chrome", (x, .4, 0), (x, -.4, .72), .02)
    for s in (-1, 1):
        for x in (-.5, .5):
            ya, yb = sorted((s * .5, s * .9))
            k.box("enamel_white", x - .22, ya, .42, x + .22, yb, .46)
            yc, yd = sorted((s * .86, s * .92))
            k.hull("enamel_white", [(x - .22, yc, .46), (x + .22, yc, .46), (x + .22, yd, .46), (x - .22, yd, .46),
                                    (x - .2, yc + s * .04, .9), (x + .2, yc + s * .04, .9), (x + .2, yd + s * .04, .9), (x - .2, yd + s * .04, .9)])
            k.cyl("chrome", (x, (ya + yb) / 2, 0), (x, (ya + yb) / 2, .42), .02, segs=4)
            k.cyl("chrome", (x, (ya + yb) / 2, 0), (x, (ya + yb) / 2, .02), .18, segs=6, smooth=False)


@prop("lair_modern")
def kitchen_island(k):
    """A white marble waterfall island along X, a hob set flush, three stools on the -Y side, three pendant lights over it: 2 x 1 tiles."""
    k.box("limestone", -1.3, -.45, .88, 1.3, .45, .92)
    for x in (-1.3, 1.26):
        k.box("limestone", x, -.45, 0, x + .04, .45, .88)
    k.box("black_paint", -1.26, -.35, 0, 1.26, .45, .88)
    k.box("black_paint", .4, -.1, .92, 1.0, .35, .925)
    k.box("chrome", -.4, -.05, .92, -.05, .3, .93)
    for x in (-.8, 0, .8):
        k.cyl("chrome", (x, -.7, 0), (x, -.7, .02), .18, segs=6, smooth=False)
        k.cyl("chrome", (x, -.7, .02), (x, -.7, .7), .02, segs=4)
        k.cyl("leather_black", (x, -.7, .7), (x, -.7, .76), .18, segs=6)
        k.wire("black_paint", (x, 0, 2.5), (x, 0, 1.75), .004)
        k.cyl("black_paint", (x, 0, 1.75), (x, 0, 1.55), .03, .12, segs=6)
        k.cyl("lamp_warm", (x, 0, 1.55), (x, 0, 1.545), .11, segs=6, smooth=False)


@prop("lair_modern")
def media_wall(k):
    """A media wall over 2 tiles against the wall: a dark stone panel, a huge screen, a linear fire below it, a floating console lit beneath: 2 x 1 tiles."""
    y = BACK
    k.box("concrete_dark", -1.45, y - .12, 0, 1.45, y, 2.45)
    k.box("plastic_black", -1.0, y - .16, 1.15, 1.0, y - .12, 2.25)
    k.box("glass_dark", -.97, y - .165, 1.18, .97, y - .16, 2.22)
    k.box("black_paint", -.9, y - .2, .55, .9, y - .12, .85)
    k.box("fire", -.8, y - .205, .62, .8, y - .2, .7)
    k.box("lamp_warm", -.75, y - .206, .62, .75, y - .205, .65)
    k.box("enamel_white", -1.4, y - .45, .25, -.95, y - .12, .45)
    k.box("enamel_white", .95, y - .45, .25, 1.4, y - .12, .45)
    k.box("lamp_cool", -1.38, y - .43, .24, -.97, y - .14, .25)
    k.box("lamp_cool", .97, y - .43, .24, 1.38, y - .14, .25)
    k.box("brass", 1.1, y - .35, .45, 1.2, y - .25, .7)


@prop("lair_modern")
def sculpture(k):
    """An abstract sculpture on a white plinth: twisted polished blocks rising: 1 tile, no cover."""
    k.box("enamel_white", -.3, -.3, 0, .3, .3, .9)
    for i in range(4):
        a, z = i * .45, .9 + i * .25
        c, s_ = math.cos(a), math.sin(a)
        pts = [(c * dx - s_ * dy, s_ * dx + c * dy) for dx, dy in ((-.2 + i * .03, -.06), (.2 - i * .03, -.06), (.2 - i * .03, .06), (-.2 + i * .03, .06))]
        c2, s2 = math.cos(a + .45), math.sin(a + .45)
        pts2 = [(c2 * dx - s2 * dy, s2 * dx + c2 * dy) for dx, dy in ((-.17 + i * .03, -.06), (.17 - i * .03, -.06), (.17 - i * .03, .06), (-.17 + i * .03, .06))]
        k.hull("chrome" if i % 2 == 0 else "brass", [(*p, z) for p in pts] + [(*p, z + .25) for p in pts2])


@prop("lair_modern")
def art_canvas(k):
    """A big abstract canvas: blocks of red, black and gold on white, a thin black float frame: 1 tile, hung on the wall behind (+Y)."""
    y = BACK
    k.box("black_paint", -.65, y - .05, .85, .65, y, 2.2)
    k.box("enamel_white", -.62, y - .055, .88, .62, y - .05, 2.17)
    for x0, z0, x1, z1, sw in ((-.5, 1.4, .1, 2.05, "signal_red"), (.15, .95, .5, 1.7, "black_paint"), (-.45, 1.0, -.1, 1.3, "brass"), (.2, 1.8, .5, 2.05, "fabric_grey")):
        k.box(sw, x0, y - .06, z0, x1, y - .055, z1)


@prop("lair_modern")
def wine_wall(k):
    """A floor-to-ceiling glass wine cabinet, lit cold from inside, bottles racked on their sides: 1 tile, its back to the wall."""
    y0 = BACK - .5
    for x in (-.72, .68):
        k.box("black_paint", x, y0, 0, x + .04, BACK, 2.4)
    k.box("black_paint", -.68, y0, 0, .68, BACK, .1)
    k.box("black_paint", -.68, y0, 2.3, .68, BACK, 2.4)
    k.box("lamp_cool", -.68, BACK - .03, .1, .68, BACK, 2.3)
    for i in range(8):
        z = .2 + i * .26
        k.box("chrome", -.68, y0 + .05, z - .02, .68, BACK - .05, z)
        k.box("glass_dark", -.64, y0 + .08, z, .64, BACK - .08, z + .1)
        k.box("fabric_red" if i % 3 else "brass", -.64, y0 + .07, z + .03, .64, y0 + .08, z + .07)
    k.box("chrome", -.01, y0 - .03, .1, .01, y0, 2.3)


@prop("lair_modern")
def coffin_modern(k):
    """A sleek black coffin pod along X on a low plinth, a red light glowing in its seam and beneath it: 2 x 1 tiles."""
    k.box("black_paint", -1.0, -.3, 0, 1.0, .3, .2)
    k.box("led_red", -.95, -.25, 0, .95, .25, .02)
    def rounded(w, l, r, n=3):
        pts = []
        for cx, cy, a0 in ((l, -w + r, -math.pi / 2), (l, w - r, 0), (-l, w - r, math.pi / 2), (-l, -w + r, math.pi)):
            for i in range(n + 1):
                a = a0 + i * (math.pi / 2) / n
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts
    k.plate("black_paint", rounded(.38, .95, .18), .2, .62)
    k.plate("led_red", rounded(.385, .955, .18), .6, .61)
    k.plate("black_paint", rounded(.36, .9, .16), .62, .7)
    k.box("chrome", -.6, -.06, .7, .6, .06, .705)


@prop("lair_shared")
def blood_fridge(k):
    """A medical fridge with a glass door, bags of blood hanging in rows inside, a temperature readout: 1 tile, its back to the wall."""
    y0 = BACK - .65
    k.box("enamel_white", -.6, y0, 0, .6, BACK, .15)
    k.box("enamel_white", -.6, y0, 1.95, .6, BACK, 2.1)
    for x in (-.6, .55):
        k.box("enamel_white", x, y0, .15, x + .05, BACK, 1.95)
    k.box("lamp_cool", -.55, BACK - .03, .15, .55, BACK, 1.95)
    for i, z in enumerate((.25, .85, 1.45)):
        k.wire("chrome", (-.55, BACK - .3, z + .45), (.55, BACK - .3, z + .45), .008)
        for j in range(4):
            x = -.42 + j * .28
            k.box("canvas_red" if (i + j) % 3 else "fabric_red", x - .1, BACK - .34, z + .05, x + .1, BACK - .26, z + .42)
    k.box("aluminium", -.58, y0 - .02, .15, -.55, y0, 1.95)
    k.box("aluminium", .52, y0 - .02, .15, .55, y0, 1.95)
    k.box("chrome", .45, y0 - .05, .8, .48, y0 - .02, 1.3)
    k.box("plastic_black", -.3, y0 - .01, 2.0, .3, y0, 2.08)
    k.box("led_red", -.2, y0 - .012, 2.02, .2, y0 - .01, 2.06)


@prop("lair_shared")
def feeding_chair(k):
    """A heavy chair bolted down with leather straps at the wrists and ankles, a floor drain and a stain under it, a tray of instruments: 1 tile, facing -Y."""
    k.plate("brick_dark", [(-.5, -.5), (.1, -.6), (.55, -.2), (.4, .4), (-.3, .45), (-.6, 0)], 0, .004)
    k.cyl("iron", (.3, -.35, 0), (.3, -.35, .008), .1, segs=8, smooth=False)
    k.box("iron", -.3, -.3, 0, .3, .3, .05)
    for x in (-.25, .25):
        for y in (-.25, .25):
            k.box("iron", x - .04, y - .04, .05, x + .04, y + .04, .45)
    k.box("leather_black", -.3, -.3, .45, .3, .3, .55)
    k.box("leather_black", -.3, .25, .55, .3, .35, 1.3)
    for s in (-1, 1):
        a, b = sorted((s * .3, s * .38))
        k.box("iron", a, -.3, .55, b, .3, .72)
        k.box("leather", a - .01, -.2, .7, b + .01, -.12, .74)
        k.box("leather", s * .25 - .05, -.31, .15, s * .25 + .05, -.29, .23)
    k.box("leather", -.31, .24, 1.0, .31, .36, 1.06)
    k.cyl("chrome", (.65, .2, 0), (.65, .2, .8), .02, segs=4)
    k.box("steel", .48, .05, .8, .82, .35, .82)
    for i in range(3):
        k.box("chrome", .53 + i * .08, .12, .82, .55 + i * .08, .3, .83)


# ----- Vehicles: origin on the floor at the footprint's middle, the length
# along Y, the FRONT toward -Y. Body panels are on the "enamel_white" swatch,
# which the game splits off and tints with each vehicle's paint (render/
# props.ts); nothing else on a vehicle uses that swatch. Each has a burnt-out
# wreck: blackened and rusted, the glass gone, sat on its rims, scorch round it.
PAINT_SW = "enamel_white"


def cap_y(w, yc, h, x, n):
    """Where a superellipse end cap (half-width w, depth h from yc) is at x: its edge bowing out to yc - h at the middle."""
    return yc - h * max(0.0, 1 - abs(x / w) ** n) ** (1 / n)


def plan(w, y0, y1, hf, hr, z, n=2.6, k=7):
    """A car's outline from above at height z: straight sides ±w, the front (y0) and back (y1) bowing out as
    superellipse caps hf and hr deep, so the nose and tail are curves, not a box's ends."""
    pts = []
    for i in range(k):  # the front cap, side to side
        x = -w + 2 * w * i / (k - 1)
        x = w * math.copysign(abs(x / w) ** .8, x)  # closer together toward the sides, where it turns
        pts.append((x, cap_y(w, y0 + hf, hf, x, n), z))
    for i in range(k):  # the back cap
        x = -w + 2 * w * i / (k - 1)
        x = w * math.copysign(abs(x / w) ** .8, x)
        pts.append((x, -cap_y(w, -(y1 - hr), hr, x, n), z))
    return pts


def clip_y(pts, y0, y1):
    """A convex outline (points at one height, in order round it) cut to y0..y1."""
    def cut(poly, keep, at):
        out = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            ia, ib = keep(a), keep(b)
            if ia:
                out.append(a)
            if ia != ib:
                t = (at - a[1]) / (b[1] - a[1])
                out.append((a[0] + t * (b[0] - a[0]), at, a[2]))
        return out
    ring = pts[:len(pts) // 2] + pts[len(pts) // 2:][::-1]  # in order round it
    return cut(cut(ring, lambda p: p[1] >= y0, y0), lambda p: p[1] <= y1, y1)


def curved_strip(k, sw, w, yc, h, n, xa, xb, za, zb, depth, back=False, steps=4):
    """A strip following a bowed end of the body (lights, a grille, a plate) from x xa to xb, za to zb high, `depth` thick."""
    pts = []
    for i in range(steps):
        x = xa + (xb - xa) * i / (steps - 1)
        y = cap_y(w, yc, h, x, n)
        if back:
            y = -y
        for d in (-.005, depth):
            for z in (za, zb):
                pts.append((x, y + (d if not back else -d), z))
    k.hull_pts(sw, pts)


def car_body(k, s, wreck):
    """The common shape, built from convex pieces: a lower body whose nose and tail bow out (superellipse caps)
    with the bonnet and boot sloping down, the wheel arches cut out; a glass cabin whose windscreen foot follows
    the curve; a roof with curved edges; bumpers wrapping round the curves; lights following them."""
    L, W = s["L"] / 2, s["W"] / 2
    drop = .14 if wreck else 0  # a wreck sits on its rims
    z0, z1 = s["body"][0] - drop, s["body"][1] - drop
    body = "iron" if wreck else PAINT_SW
    r, (a0, a1) = s["wheel"], s["axles"]
    za = 2 * r + .04 - drop  # the wheel arches' top
    hf, hr = s.get("caps", (.6, .45))
    nose, tail = s["nose"], s["tail"]
    # The body over the arches: full outline at the arches' top, the shoulder drawing in and the bonnet and boot
    # sloping down to the bumpers, the top a little narrower.
    k.hull_pts(body, plan(W, -L, L, hf, hr, za)
               + plan(W - .012, -L + nose * .45, L - tail * .45, hf * .9, hr * .9, z1 - .07)
               + plan(W - .06, -L + nose, L - tail, hf * .75, hr * .75, z1), smooth=True)
    # The lower body below it, cut away round the wheels; tucked in a little at the sill.
    ys = [-L]
    for a in s["axles"]:
        ys += [a - r - .05, a + r + .05]
    ys.append(L)
    for i in range(0, len(ys), 2):
        y0, y1 = ys[i], ys[i + 1]
        if y1 > y0:
            k.hull_pts(body, clip_y(plan(W - .03, -L + .03, L - .03, hf, hr, z0), y0, y1)
                       + clip_y(plan(W, -L, L, hf, hr, z0 + .06), y0, y1)
                       + clip_y(plan(W, -L, L, hf, hr, za), y0, y1), smooth=True)
    if wreck:  # rust bleeding through the scorched panels
        for sx in (-1, 1):
            a, b = sorted((sx * W, sx * (W + .005)))
            k.box("rust", a, a0 + r + .15, z0 + .06, b, (a0 + a1) / 2 + .2, z1 - .08)
            k.box("rust", a, a1 - r, za + .02, b, min(L - hr, L - .25), z1 - .07)
        k.hull_pts("black_paint", plan(W - .09, -L + nose + .03, L - tail - .03, hf * .7, hr * .7, z1)
                   + plan(W - .1, -L + nose + .03, L - tail - .03, hf * .7, hr * .7, z1 + .01))
    # The cabin: glass (a wreck: four black pillars round a burnt-out shell).
    (cb0, cb1), (ct0, ct1), roof = s["cab_low"], s["cab_top"], s["roof"] - drop
    inset = s.get("cab_inset", .1)
    gw = W - inset  # the glass's half-width at its foot
    if wreck:
        for (yb, yt) in ((cb0, ct0), (cb1, ct1)):
            for sx in (-1, 1):
                xb, xt = sx * (gw - .05), sx * (gw - .17)
                k.hull("black_paint", [(xb - .03, yb - .03, z1), (xb + .03, yb - .03, z1), (xb + .03, yb + .03, z1), (xb - .03, yb + .03, z1),
                                       (xt - .03, yt - .03, roof - .1), (xt + .03, yt - .03, roof - .1), (xt + .03, yt + .03, roof - .1), (xt - .03, yt + .03, roof - .1)])
        k.box("iron", -gw + .05, cb0 + .15, z1 - .15, gw - .05, cb1 - .15, z1 + .15)
        # The roof sagged in the heat.
        k.hull_pts("black_paint", plan(gw - .12, ct0, ct1, .22, .18, roof - .12) + plan(gw - .12, ct0, ct1, .22, .18, roof - .06))
    else:
        # The windscreen's foot and head both curve, like the nose ahead of it.
        k.hull_pts("glass_dark", plan(gw, cb0, cb1, .4, .3, z1, n=2.2) + plan(gw - .12, ct0, ct1, .25, .2, roof - .06, n=2.2))
        wr = gw - .1
        k.hull_pts(PAINT_SW, plan(wr, ct0 - .02, ct1 + .02, .25, .2, roof - .07, n=2.2)
                   + plan(wr - .05, ct0 + .04, ct1 - .04, .2, .15, roof, n=2.2), smooth=True)
        for sx in (-1, 1):  # door mirrors, on the door at the windscreen's foot
            a, b = sorted((sx * (W - .1), sx * (W + .05)))
            k.box(PAINT_SW, a, cb0 + .12, z1 - .03, b, cb0 + .2, z1 + .07)
    # Wheels (a wreck: bare rims, lower), bumpers, lights.
    for y in s["axles"]:
        for sx in (-1, 1):
            x = sx * (W - .12)
            if wreck:
                k.cyl("iron", (x - .1, y, r - drop), (x + .1, y, r - drop), r * .7, segs=8)
            else:
                k.cyl("rubber", (x - .11, y, r), (x + .11, y, r), r, segs=8)
                k.cyl("galvanised", (x + sx * .11, y, r), (x + sx * .115, y, r), r * .6, segs=6, smooth=False)
    bz = s["body"][0] - drop
    bump = "iron" if wreck else "plastic_black"
    # Bumpers wrap round the bowed ends, a little proud of the body all round (never in its planes: they'd flicker).
    bw = W + .015
    for front in (True, False):
        out = plan(bw, -L - .06, L + .06, hf + .06, hr + .06, 0)
        y0, y1 = (-L - .1, -L + hf + .1) if front else (L - hr - .1, L + .1)
        ring = clip_y(out, y0, y1)
        k.hull_pts(bump, [(x, y, bz + .02) for x, y, _ in ring] + [(x, y, bz + .2) for x, y, _ in ring], smooth=True)
    if not wreck:
        hz = z1 - .15
        for sx in (-1, 1):
            xa, xb = sorted((sx * (W - .14), sx * (W - .42)))
            curved_strip(k, "glass_light", W, -L + hf, hf, 2.6, xa, xb, hz - .05, hz + .07, .05)
            curved_strip(k, "signal_red", W, -(L - hr), hr, 2.6, xa, xb, hz - .05, hz + .07, .05, back=True)
        curved_strip(k, "plastic_black", W, -L + hf, hf, 2.6, -W + .46, W - .46, hz - .1, hz + .05, .05, steps=5)
        k.box("paint_white", -.22, L + .005, bz + .22, .22, L + .02, bz + .33)


def scorch(k, L, W):
    k.plate("asphalt", [(-W - .4, -L - .2), (0, -L - .5), (W + .4, -L - .1), (W + .55, L * .3), (W + .3, L + .4), (-W * .2, L + .5), (-W - .5, L * .5)], 0, .006)


CARS = {
    "sedan": dict(L=4.6, W=1.8, body=(.28, .82), nose=.35, tail=.2, cab_low=(-.95, 1.35), cab_top=(-.3, .85), roof=1.45, axles=(-1.4, 1.35), wheel=.33, caps=(.6, .45)),
    "hatchback": dict(L=4.0, W=1.75, body=(.28, .85), nose=.35, tail=.08, cab_low=(-.85, 1.9), cab_top=(-.2, 1.65), roof=1.5, axles=(-1.25, 1.25), wheel=.32, caps=(.55, .25)),
}


def passenger(name, wreck):
    s = CARS[name]

    def build(k):
        if wreck:
            scorch(k, s["L"] / 2, s["W"] / 2)
        car_body(k, s, wreck)
        if wreck:  # the bonnet sprung open
            L, W = s["L"] / 2, s["W"] / 2
            z = s["body"][1] - .14
            k.hull("rust", [(-W + .1, -L + s["nose"] + .05, z), (W - .1, -L + s["nose"] + .05, z), (W - .1, -L + s["nose"] + .08, z), (-W + .1, -L + s["nose"] + .08, z),
                            (-W + .1, -L + s["nose"] + .2, z + .55), (W - .1, -L + s["nose"] + .2, z + .55), (W - .1, -L + s["nose"] + .23, z + .55), (-W + .1, -L + s["nose"] + .23, z + .55)])
    build.__name__ = f"car_{name}{'_wreck' if wreck else ''}"
    build.__doc__ = f"A {name} car, its front toward -Y{', burnt out' if wreck else ''}: 2 x 3 tiles (the car kind's)."
    return build


PICKUP = dict(L=5.4, W=1.95, body=(.45, 1.05), nose=.4, tail=.05, cab_low=(-1.0, .55), cab_top=(-.5, .5), roof=1.85, axles=(-1.65, 1.6), wheel=.4, cab_inset=.06, caps=(.5, .1))


def pickup_build(wreck):
    def build(k):
        s = PICKUP
        L, W = s["L"] / 2, s["W"] / 2
        if wreck:
            scorch(k, L, W)
        car_body(k, s, wreck)
        drop = .14 if wreck else 0
        z = s["body"][1] - drop
        side = "iron" if wreck else PAINT_SW
        # The bed: low sides and a tailgate between them, a black liner; flush with the body's rounded top.
        Wb, Lb = W - .06, L - s["tail"] - .02
        for sx in (-1, 1):
            a, b = sorted((sx * Wb, sx * (Wb - .07)))
            k.box(side, a, .6, z, b, Lb, z + .35)
        k.box(side, -Wb + .07, Lb - .07, z, Wb - .07, Lb, z + .3 if wreck else z + .35)
        k.box("black_paint" if wreck else "plastic_black", -Wb + .07, .62, z, Wb - .07, Lb - .07, z + .02)
    build.__name__ = f"pickup{'_wreck' if wreck else ''}"
    build.__doc__ = f"A pickup truck, its front toward -Y, an open bed behind the cab{', burnt out' if wreck else ''}: 2 x 4 tiles (the SUV kind's)."
    return build


def box_truck_build(wreck):
    """The cars' style at lorry scale: a cab whose nose bows out in plan (superellipse caps), cut round the front
    wheels, a raked windscreen, a rounded roof with a fairing up to the box; a bumper wrapping the nose; round
    tyres; a fuel tank, side guards and an under-run bar; a cargo box with rounded corners."""
    def build(k):
        L, W = 4.0, 1.25
        drop = .14 if wreck else 0
        if wreck:
            k.plate("asphalt", [(-W - .5, -L - .3), (W + .5, -L - .2), (W + .6, L), (0, L + .5), (-W - .6, L * .6)], 0, .006)
        paint = "iron" if wreck else PAINT_SW
        cab0, cab1 = -L, -L + 2.1
        hf, n = .32, 3.2  # the nose's bow and squareness
        front, r = cab0 + .8, .5  # the front axle, the wheels' radius
        z0, za, zb = .5 - drop, 1.12 - drop, 1.5 - drop  # the cab's foot, the arch's top, the waist
        cab = lambda w, y0, y1, h, z: plan(w, y0, y1, h, .02, z, n=n, k=5)
        # The cab's lower body, cut round the front wheel; the waist band over it, drawing in a little.
        for y0, y1 in ((cab0, front - r - .08), (front + r + .08, cab1)):
            k.hull_pts(paint, clip_y(cab(W - .03, cab0 + .03, cab1, hf, z0), y0, y1)
                       + clip_y(cab(W, cab0, cab1, hf, z0 + .06), y0, y1)
                       + clip_y(cab(W, cab0, cab1, hf, za), y0, y1), smooth=True)
        k.hull_pts(paint, cab(W, cab0, cab1, hf, za) + cab(W - .015, cab0 + .03, cab1, hf * .95, zb), smooth=True)
        roof0 = cab0 + .42  # the windscreen's head
        if wreck:
            for (yb, yt) in ((cab0 + .15, roof0), (cab1 - .1, cab1 - .1)):
                for sx in (-1, 1):
                    xb, xt = sx * (W - .1), sx * (W - .16)
                    k.hull("black_paint", [(xb - .04, yb - .04, zb), (xb + .04, yb - .04, zb), (xb + .04, yb + .04, zb), (xb - .04, yb + .04, zb),
                                           (xt - .04, yt - .04, 2.3 - drop), (xt + .04, yt - .04, 2.3 - drop), (xt + .04, yt + .04, 2.3 - drop), (xt - .04, yt + .04, 2.3 - drop)])
            k.hull_pts("black_paint", cab(W - .12, roof0, cab1, .2, 2.24 - drop) + cab(W - .12, roof0, cab1, .2, 2.32 - drop))
            k.box("iron", -W + .2, cab0 + .5, zb - .2, W - .2, cab1 - .2, zb + .2)
        else:
            # Glass round the front and sides; the sleeper's back panel painted.
            k.hull_pts("glass_dark", clip_y(cab(W - .04, cab0 + .1, cab1, hf * .9, zb), cab0, cab1 - .55)
                       + clip_y(cab(W - .1, roof0, cab1, .22, 2.3), cab0, cab1 - .55))
            k.hull_pts(PAINT_SW, clip_y(cab(W - .04, cab0 + .1, cab1, hf * .9, zb), cab1 - .6, cab1)
                       + clip_y(cab(W - .1, roof0, cab1, .22, 2.3), cab1 - .6, cab1))
            # The roof, rounded at its edges, and the fairing sweeping up to the box's top.
            k.hull_pts(PAINT_SW, cab(W - .07, roof0 - .03, cab1, .24, 2.28) + cab(W - .14, roof0 + .04, cab1 - .02, .18, 2.42), smooth=True)
            k.hull_pts(PAINT_SW, cab(W - .22, roof0 + .3, cab1 - .02, .12, 2.41) + cab(W - .1, cab1 - .3, cab1 - .02, .04, 3.0), smooth=True)
            # Grille and headlights following the nose's bow; mirrors on arms.
            curved_strip(k, "plastic_black", W, cab0 + hf, hf, n, -W + .42, W - .42, .78, 1.38, .04, steps=5)
            for sx in (-1, 1):
                xa, xb = sorted((sx * (W - .1), sx * (W - .38)))
                curved_strip(k, "glass_light", W, cab0 + hf, hf, n, xa, xb, .78, .92, .04)
                a, b = sorted((sx * (W - .05), sx * (W + .2)))
                k.box("black_paint", a, roof0 - .02, 1.95, b, roof0 + .02, 1.99)
                a, b = sorted((sx * (W + .14), sx * (W + .22)))
                k.box("black_paint", a, roof0 - .06, 1.6, b, roof0 + .02, 2.0)
        # The bumper wraps the nose, a little proud of it all round.
        ring = clip_y(plan(W + .02, cab0 - .06, cab1, hf + .06, .02, 0, n=n), cab0 - .1, cab0 + hf + .2)
        bump = "iron" if wreck else "plastic_black"
        k.hull_pts(bump, [(x, y, .42 - drop) for x, y, _ in ring] + [(x, y, .68 - drop) for x, y, _ in ring], smooth=True)
        # The chassis; the fuel tank behind the cab; side guards between the wheels; the under-run bar.
        k.box("iron", -.5, cab1, .7 - drop, .5, L - .1, 1.08 - drop)
        k.cyl("iron" if wreck else "aluminium", (W - .28, cab1 + .15, .72 - drop), (W - .28, cab1 + .95, .72 - drop), .26, segs=8)
        for sx in (-1, 1):
            a, b = sorted((sx * (W - .02), sx * (W - .05)))
            for z in (.55, .82):
                k.box("iron" if wreck else "aluminium", a, cab1 + (1.05 if sx > 0 else .15), z - drop, b, L - 2.0 - r - .1, z + .07 - drop)
        k.box("iron", -W + .1, L - .08, .42 - drop, W - .1, L, .55 - drop)
        # The cargo box: its corners rounded; ribs, a top rail, the doors' seam and the rear lights.
        box0 = cab1 + .15
        rbox = lambda w, z: plan(w, box0, L, .07, .07, z, n=4, k=5)
        if wreck:
            # Burnt through: its frame and a buckled floor, one side panel left, some cargo.
            for x in (-W, W - .06):
                for y in (box0, L - .06):
                    k.box("black_paint", x, y, 1.08 - drop, x + .06, y + .06, 3.2 - drop)
                k.box("black_paint", x, box0, 3.14 - drop, x + .06, L, 3.2 - drop)
            k.box("black_paint", -W, box0, 1.08 - drop, W, L, 1.18 - drop)
            k.hull("rust", [(W - .06, box0, 1.18 - drop), (W, box0, 1.18 - drop), (W, L * .6, 1.18 - drop), (W - .06, L * .6, 1.18 - drop),
                            (W - .06, box0, 2.6 - drop), (W, box0, 2.6 - drop), (W, L * .3, 2.2 - drop), (W - .06, L * .3, 2.2 - drop)])
            for y in (-1.0, 1.2, 2.4):
                k.box("weathered", -.6 + y * .1, y, 1.18 - drop, .1 + y * .1, y + .5, 1.58 - drop)
        else:
            k.hull_pts("paint_white", rbox(W + .02, 1.08) + rbox(W + .02, 3.2), smooth=True)
            for i in range(1, 3):
                y = box0 + i * (L - box0) / 3
                for sx in (-1, 1):
                    a, b = sorted((sx * (W + .02), sx * (W + .035)))
                    k.box("aluminium", a, y - .02, 1.12, b, y + .02, 3.15)
            for sx in (-1, 1):  # the top rails (a metal roof would mirror the sky: black from above)
                a, b = sorted((sx * (W + .035), sx * (W - .04)))
                k.box("aluminium", a, box0 + .02, 3.14, b, L - .02, 3.23)
            k.box("aluminium", -.01, L, 1.12, .01, L + .015, 3.15)
            for sx in (-1, 1):
                k.box("signal_red", sx * (W - .2) - .07, L, .62, sx * (W - .2) + .07, L + .03, .74)
                k.box("plastic_black", sx * (W - .2) - .22, L - 1.0 + r + .05, .2, sx * (W - .2) + .22, L - 1.0 + r + .08, .75)
        # Wheels: a single at the front, twins on the two rear axles (a wreck: bare rims).
        for y, dual in ((front, False), (L - 2.05, True), (L - 1.0, True)):
            for sx in (-1, 1):
                x, t = sx * (W - .2), (.21 if dual else .15)
                if wreck:
                    k.cyl("iron", (x - .12, y, r * .7 - drop + .14), (x + .12, y, r * .7 - drop + .14), r * .7, segs=10)
                else:
                    k.cyl("rubber", (x - t, y, r), (x + t, y, r), r, segs=12)
                    k.cyl("galvanised", (x + sx * t, y, r), (x + sx * (t + .01), y, r), r * .45, segs=8, smooth=False)
    build.__name__ = f"box_truck{'_wreck' if wreck else ''}"
    build.__doc__ = f"A rigid box lorry, its cab toward -Y, the cargo box behind{', burnt out' if wreck else ''}: 2 x 6 tiles (the truck kind's)."
    return build

for _name in CARS:
    for _w in (False, True):
        prop("vehicle")(passenger(_name, _w))
for _w in (False, True):
    prop("vehicle")(pickup_build(_w))
    prop("vehicle")(box_truck_build(_w))


# ---------------------------------------------------------------- build
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    imgs = make_images(TEX_DIR)
    mat = make_material(imgs)
    built = []
    # ONLY=car_,pickup (name prefixes): build just those, e.g. into a scratch .blend to swap into the kit.
    only = [x for x in os.environ.get("ONLY", "").split(",") if x]
    for gi, (group, items) in enumerate(PROPS.items()):
        items = [(n, f) for n, f in items if not only or any(n.startswith(o) for o in only)]
        if not items:
            continue
        coll = bpy.data.collections.new(group)
        bpy.context.scene.collection.children.link(coll)
        for i, (name, fn) in enumerate(items):
            k = Kit()
            fn(k)
            ob = k.finish(name, mat, coll)
            ob.location = (i * 2.4, -gi * 4.0, 0)
            built.append(ob)
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    for ob in built:
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f"PROP {ob.users_collection[0].name:13s} {ob.name:16s} {tris:5d} tris")
    if PREVIEW:
        render_previews()


def render_previews():
    """One thumbnail per prop from the battle camera's angle, tiled into a sheet per group."""
    import numpy as np
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    T = 320
    sc.render.resolution_x = sc.render.resolution_y = T
    world = bpy.data.worlds.new("w"); sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (.12, .13, .16, 1)
    bg.inputs[1].default_value = 1.5
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(40), 0, math.radians(-50))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    sc.collection.objects.link(cam)
    sc.camera = cam
    tilt, yaw = math.radians(45), math.radians(-30)
    cam.rotation_euler = (tilt, 0, yaw)
    view = Vector((-math.sin(tilt) * math.sin(yaw), math.sin(tilt) * math.cos(yaw), -math.cos(tilt)))
    os.makedirs(PREVIEW, exist_ok=True)
    tmp = os.path.join(PREVIEW, "_t.png")
    for coll in list(bpy.data.collections):
        obs = list(coll.objects)
        tiles = []
        for ob in obs:
            for o in bpy.data.objects:
                o.hide_render = o.type == "MESH" and o is not ob
            pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            centre = sum(pts, Vector()) / 8
            cam.data.ortho_scale = max((a - b).length for a in pts for b in pts) * 1.05
            cam.location = centre - view * 30
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp)
            a = np.array(img.pixels[:], dtype=np.float32).reshape(T, T, 4)
            bpy.data.images.remove(img)
            tiles.append(a)
        cols = 6
        rows = (len(tiles) + cols - 1) // cols
        sheet = np.zeros((rows * T, cols * T, 4), dtype=np.float32); sheet[..., 3] = 1
        for i, a in enumerate(tiles):
            r, c = rows - 1 - i // cols, i % cols
            sheet[r * T:(r + 1) * T, c * T:(c + 1) * T] = a
        out = bpy.data.images.new(coll.name, cols * T, rows * T)
        out.pixels = sheet.ravel()
        out.filepath_raw = os.path.join(PREVIEW, coll.name + ".png")
        out.file_format = "PNG"
        out.save()
        print("PREVIEW", out.filepath_raw, [o.name for o in obs])

main()
