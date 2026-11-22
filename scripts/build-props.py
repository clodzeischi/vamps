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

# ---------------------------------------------------------------- palette
# (name, sRGB hex, roughness, metalness, glows). Row by row, top to bottom.
ROWS = [
    # woods and card
    [("oak", "a8794a", .7, 0, 0), ("walnut", "5a3a24", .55, 0, 0), ("pine", "c9a26b", .8, 0, 0), ("weathered", "7d7468", .9, 0, 0),
     ("paint_white", "e6e2d8", .5, 0, 0), ("paint_green", "2f4a3a", .55, 0, 0), ("cardboard", "a88660", .95, 0, 0), ("pallet", "b59a6e", .9, 0, 0)],
    # masonry
    [("brick", "8a3b2b", .9, 0, 0), ("brick_dark", "5b2a22", .9, 0, 0), ("sandstone", "b59a72", .9, 0, 0), ("limestone", "cfc6b0", .85, 0, 0),
     ("concrete", "9a9890", .9, 0, 0), ("concrete_dark", "5f5e5a", .9, 0, 0), ("plaster", "d9d4c8", .85, 0, 0), ("terracotta", "b0603a", .8, 0, 0)],
    # bare metals
    [("steel", "9aa0a6", .35, 1, 0), ("galvanised", "b4b8b8", .5, 1, 0), ("iron", "3a3a3c", .6, 1, 0), ("brass", "b08a3c", .3, 1, 0),
     ("copper", "a0603a", .35, 1, 0), ("chrome", "d8dadc", .12, 1, 0), ("rust", "6e3b22", .9, .3, 0), ("aluminium", "c4c7ca", .3, 1, 0)],
    # painted metal and enamel
    [("bin_green", "2e5a3a", .55, .2, 0), ("municipal_blue", "2a4a7a", .5, .2, 0), ("signal_red", "a3221c", .45, .2, 0), ("safety_yellow", "d9a521", .5, .2, 0),
     ("enamel_white", "e8e8e4", .35, .1, 0), ("enamel_grey", "6c7178", .45, .3, 0), ("olive", "4f5233", .6, .2, 0), ("black_paint", "1d1e20", .45, .3, 0)],
    # rubber, plastic, fabric, leather
    [("rubber", "1a1a1a", .85, 0, 0), ("plastic_black", "222325", .4, 0, 0), ("plastic_beige", "cbbfa6", .45, 0, 0), ("plastic_grey", "8d9094", .5, 0, 0),
     ("fabric_red", "7a2a2a", .95, 0, 0), ("fabric_blue", "2e3d5c", .95, 0, 0), ("fabric_green", "3c5a3c", .95, 0, 0), ("leather", "4a2f20", .55, 0, 0)],
    # glass and light (the last six glow)
    [("glass_dark", "1c2630", .05, 0, 0), ("glass_light", "8aa4b0", .05, 0, 0), ("lamp_warm", "ffd9a0", .3, 0, 1), ("lamp_cool", "cfe6ff", .3, 0, 1),
     ("led_red", "ff3020", .3, 0, 1), ("led_green", "40ff60", .3, 0, 1), ("screen", "6fb0ff", .2, 0, 1), ("neon_pink", "ff40c0", .3, 0, 1)],
    # linen, earth, foliage, canvas
    [("linen", "dcd8d0", .9, 0, 0), ("paper", "eeeae0", .9, 0, 0), ("soil", "3b2d22", 1, 0, 0), ("foliage", "2f4a26", .9, 0, 0),
     ("foliage_light", "4f6e33", .9, 0, 0), ("bark", "4a3a2c", .95, 0, 0), ("asphalt", "2a2a2c", .95, 0, 0), ("canvas_red", "8e2a2a", .9, 0, 0)],
    # spares, with a few useful ones filled in
    [("canvas_white", "d8d2c2", .9, 0, 0), ("canvas_green", "2f5a45", .9, 0, 0), ("fabric_grey", "6a6a6a", .95, 0, 0), ("leather_black", "1f1c1a", .5, 0, 0),
     ("upholstery_tan", "9a7a55", .9, 0, 0), ("ceramic", "eeeeea", .2, 0, 0), ("wood_dark", "3a2a20", .6, 0, 0), ("hazard_orange", "d8642a", .5, .1, 0)],
]
N, PX = 8, 32  # swatches per side, pixels per swatch
SW = {}
for r, row in enumerate(ROWS):
    for c, (name, *_rest) in enumerate(row):
        SW[name] = ((c + .5) / N, (N - 1 - r + .5) / N)


def make_images():
    os.makedirs(TEX_DIR, exist_ok=True)
    size = N * PX
    out = {}
    for kind in ("palette", "palette_mr", "palette_em"):
        img = bpy.data.images.new(kind, size, size, alpha=False)
        # A byte image takes its pixels as stored (sRGB colour, or plain data): set the space first.
        if kind == "palette_mr":
            img.colorspace_settings.name = "Non-Color"
        px = [0.0] * (size * size * 4)
        for r, row in enumerate(ROWS):
            for c, (name, hx, rough, metal, glow) in enumerate(row):
                rgb = [int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4)]
                if kind == "palette":
                    col = rgb
                elif kind == "palette_mr":  # glTF: G roughness, B metalness
                    col = [1.0, rough, metal]
                else:
                    col = rgb if glow else [0, 0, 0]
                y0 = (N - 1 - r) * PX
                for y in range(y0, y0 + PX):
                    for x in range(c * PX, c * PX + PX):
                        i = (y * size + x) * 4
                        px[i:i + 4] = [*col, 1.0]
        img.pixels = px
        img.filepath_raw = os.path.join(TEX_DIR, kind + ".png")
        img.file_format = "PNG"
        img.save()
        img.pack()
        out[kind] = img
    return out


def make_material(imgs):
    m = bpy.data.materials.new("Props")
    m.use_backface_culling = True  # exported single-sided: every prop is closed
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    n, l = nt.nodes.new, nt.links.new
    out = n("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf = n("ShaderNodeBsdfPrincipled"); bsdf.location = (300, 0)
    uv = n("ShaderNodeUVMap"); uv.location = (-700, 0)
    tex = {}
    for i, k in enumerate(("palette", "palette_mr", "palette_em")):
        t = n("ShaderNodeTexImage"); t.image = imgs[k]; t.interpolation = "Closest"; t.location = (-400, 300 - i * 300)
        l(uv.outputs["UV"], t.inputs["Vector"])
        tex[k] = t
    sep = n("ShaderNodeSeparateColor"); sep.location = (-100, 0)
    l(tex["palette"].outputs["Color"], bsdf.inputs["Base Color"])
    l(tex["palette_mr"].outputs["Color"], sep.inputs["Color"])
    l(sep.outputs["Green"], bsdf.inputs["Roughness"])
    l(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    l(tex["palette_em"].outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    l(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


# ---------------------------------------------------------------- mesh helpers
class Kit:
    """Accumulates one prop's geometry in a bmesh, each face on a swatch."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")

    def _paint(self, faces, sw, smooth=False):
        u = SW[sw]
        for f in faces:
            f.smooth = smooth
            for lp in f.loops:
                lp[self.uv].uv = u

    def _faces(self, verts):
        return {f for v in verts for f in v.link_faces}

    def box(self, sw, x0, y0, z0, x1, y1, z1):
        r = bmesh.ops.create_cube(self.bm, size=1)
        m = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), 1))
        bmesh.ops.transform(self.bm, matrix=m, verts=r["verts"])
        self._paint(self._faces(r["verts"]), sw)

    def cyl(self, sw, p0, p1, r0, r1=None, segs=8, smooth=True, rot=0.0):
        """A cylinder or cone from p0 to p1 (radius r0 at p0, r1 at p1)."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                  radius1=r0, radius2=r0 if r1 is None else r1, depth=d.length)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        m = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Rotation(rot, 4, "Z")
        bmesh.ops.transform(self.bm, matrix=m, verts=r["verts"])
        for f in self._faces(r["verts"]):
            self._paint([f], sw, smooth and len(f.verts) == 4)

    def hull(self, sw, pts):
        """A closed solid from 8 points: bottom four then top four, same order."""
        v = [self.bm.verts.new(p) for p in pts]
        quads = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        self._paint([self.bm.faces.new([v[i] for i in q]) for q in quads], sw)

    def extrude_x(self, sw, x0, x1, profile):
        """A prism along X from a convex (y, z) profile."""
        a = [self.bm.verts.new((x0, y, z)) for y, z in profile]
        b = [self.bm.verts.new((x1, y, z)) for y, z in profile]
        fs = [self.bm.faces.new(a[::-1]), self.bm.faces.new(b)]
        n = len(profile)
        fs += [self.bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]
        self._paint(fs, sw)

    def blob(self, sw, c, r, sz=1.0):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=r)
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, sz, 1)), verts=res["verts"])
        self._paint(self._faces(res["verts"]), sw)

    def finish(self, name, mat, coll):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob


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


# ---------------------------------------------------------------- build
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    imgs = make_images()
    mat = make_material(imgs)
    built = []
    for gi, (group, items) in enumerate(PROPS.items()):
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
