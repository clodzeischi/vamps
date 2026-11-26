# The shared Blender kit behind the code-built models: the 8 x 8 palette
# (colour, roughness/metalness, glow), its one material, and Kit, which
# builds a model face by face with each face on one swatch
# (docs/design/tooling.md, "Props"). Imported by build-props.py and
# build-items.py, which add their own folder to sys.path.
import math, os
import bpy, bmesh
from mathutils import Matrix, Vector

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
    [("canvas_white", "d8d2c2", .9, 0, 0), ("fire", "ff6a1a", .5, 0, 1), ("fabric_grey", "6a6a6a", .95, 0, 0), ("leather_black", "1f1c1a", .5, 0, 0),
     ("upholstery_tan", "9a7a55", .9, 0, 0), ("ceramic", "eeeeea", .2, 0, 0), ("wood_dark", "3a2a20", .6, 0, 0), ("hazard_orange", "d8642a", .5, .1, 0)],
]
N, PX = 8, 32  # swatches per side, pixels per swatch
SW = {}
for r, row in enumerate(ROWS):
    for c, (name, *_rest) in enumerate(row):
        SW[name] = ((c + .5) / N, (N - 1 - r + .5) / N)


def make_images(tex_dir):
    os.makedirs(tex_dir, exist_ok=True)
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
        img.filepath_raw = os.path.join(tex_dir, kind + ".png")
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

    def extrude_y(self, sw, y0, y1, profile):
        """A prism along Y from a convex (x, z) profile."""
        a = [self.bm.verts.new((x, y0, z)) for x, z in profile]
        b = [self.bm.verts.new((x, y1, z)) for x, z in profile]
        n = len(profile)
        fs = [self.bm.faces.new(a[::-1]), self.bm.faces.new(b)]
        fs += [self.bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]
        self._paint(fs, sw)

    def lean(self, sw, x0, x1, yb, zb, yt, zt, t):
        """A board leaning in the Y-Z plane, from (yb, zb) at its foot to (yt, zt) at its head, t thick toward +Y."""
        self.hull(sw, [(x0, yb, zb), (x1, yb, zb), (x1, yb + t, zb), (x0, yb + t, zb),
                       (x0, yt, zt), (x1, yt, zt), (x1, yt + t, zt), (x0, yt + t, zt)])

    def blob(self, sw, c, r, sz=1.0, sx=1.0, sy=1.0, turn=0.0):
        """A rough lump (an icosahedron, 20 faces), squashed by sx, sy, sz and turned about Z."""
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=r)
        m = Matrix.Translation(c) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1))
        bmesh.ops.transform(self.bm, matrix=m, verts=res["verts"])
        self._paint(self._faces(res["verts"]), sw)

    def ring(self, sw, c, axis, r_out, r_in, w, segs=10):
        """A flat ring (a tyre, a hoop) round `axis` through c, w thick along it."""
        c, axis = Vector(c), Vector(axis).normalized()
        q = Vector((0, 0, 1)).rotation_difference(axis).to_matrix()
        rings = []
        for r, h in ((r_out, -w / 2), (r_out, w / 2), (r_in, w / 2), (r_in, -w / 2)):
            rings.append([self.bm.verts.new(c + q @ Vector((r * math.cos(i * 2 * math.pi / segs), r * math.sin(i * 2 * math.pi / segs), h))) for i in range(segs)])
        fs = []
        for j in range(4):
            a, b = rings[j], rings[(j + 1) % 4]
            fs += [self.bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i])) for i in range(segs)]
        self._paint(fs, sw, smooth=False)

    def wire(self, sw, p0, p1, r=.008):
        """A thin rod: a three-sided prism (8 triangles)."""
        self.cyl(sw, p0, p1, r, segs=3, smooth=False)

    def plate(self, sw, pts, z0, z1):
        """A flat convex (x, y) polygon from z0 to z1: a patch on the ground, a slab."""
        self.extrude_z(sw, pts, z0, z1)

    def extrude_z(self, sw, pts, z0, z1):
        a = [self.bm.verts.new((x, y, z0)) for x, y in pts]
        b = [self.bm.verts.new((x, y, z1)) for x, y in pts]
        n = len(pts)
        fs = [self.bm.faces.new(a[::-1]), self.bm.faces.new(b)]
        fs += [self.bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]
        self._paint(fs, sw)

    def strip(self, sw, p0, p1, w0, w1, z0, z1):
        """A flat strip on the ground from p0 (w0 wide) to p1 (w1 wide): a crack, a line."""
        d = Vector((p1[0] - p0[0], p1[1] - p0[1]))
        n = Vector((-d.y, d.x)).normalized()
        q = [Vector(p0) + n * w0 / 2, Vector(p1) + n * w1 / 2, Vector(p1) - n * w1 / 2, Vector(p0) - n * w0 / 2]
        self.extrude_z(sw, [(v.x, v.y) for v in q], z0, z1)

    def wall_blob(self, sw, cx, cz, rx, rz, y, t, n=6, turn=0.0):
        """A flat convex blob on the outside face of a wall (y, t thick toward -Y): a paint splash, a letter."""
        pts = [(cx + rx * math.cos(turn + i * 2 * math.pi / n), cz + rz * math.sin(turn + i * 2 * math.pi / n)) for i in range(n)]
        self.extrude_y(sw, y - t, y, pts)

    def finish(self, name, mat, coll):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        return ob


