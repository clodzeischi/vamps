# Builds the inventory items from code into one .blend, one object per item
# named by its ItemId (src/data/equipment.ts), all on the shared palette
# material (docs/design/item-art.md). scripts/export-items.py then exports
# each to public/assets/items/<id>.glb and renders its inventory icon.
#
# The rule each item follows:
#   * Real scale: 1 Blender unit = 1 metre. Builders work in millimetres.
#   * Held items (slot weapon): Z up, the muzzle (or the knife's tip) toward
#     -Y, the left side (the side the icon shows) toward +X. The origin is
#     the firing hand: the middle of the pistol grip. Child empties
#     <id>_muzzle (the bore's end, for flashes and tracers) and, on long
#     guns, <id>_support (where the other hand holds).
#   * Worn items (armour, helmet): the wearer faces -Y, Z up. Armour's
#     origin is the top of the shoulders on the body's centre line; the
#     helmet's is the centre of the shell (about the temples). They're
#     shaped as worn: the characters will wear these meshes.
#   * Carried items stand as they would on a table (magazines feed lips up,
#     the front toward -Y); the origin is the middle of their base.
#   * Weapons are modelled loaded (magazine, box or belt in).
#   * One material, the props palette (scripts/blender_kit.py): each face on
#     one swatch.
#
# Two builds from the same builders: the detailed one, for the icons, and the
# low-detail one (--low) for the game.
#
# /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-items.py -- \
#   ~/Documents/Blends/Vamps/battlescape/items.blend
# /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-items.py -- \
#   ~/Documents/Blends/Vamps/battlescape/items-low.blend --low
import math, os, sys
from contextlib import contextmanager
import bpy, bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_kit import Kit, make_images, make_material  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
BLEND = os.path.expanduser(args[0])
LOW = "--low" in args  # the in-game build: fewer sides, no fine detail
MM = .001


def hull2(pts):
    """The convex hull of 2D points (monotone chain), counter-clockwise."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def spow(v, p):
    return math.copysign(abs(v) ** p, v)


def smooth_tab(tab, v):
    """Lookup in [(key, value)] eased between keys (cosine), clamped at the ends."""
    if v <= tab[0][0]:
        return tab[0][1]
    for (a, fa), (b, fb) in zip(tab, tab[1:]):
        if v <= b:
            t = (1 - math.cos(math.pi * (v - a) / (b - a))) / 2
            return fa + (fb - fa) * t
    return tab[-1][1]


def lerp_tab(tab, v):
    """Piecewise-linear lookup in [(key, value)], clamped."""
    if v <= tab[0][0]:
        return tab[0][1]
    for (a, fa), (b, fb) in zip(tab, tab[1:]):
        if v <= b:
            return fa + (fb - fa) * (v - a) / (b - a)
    return tab[-1][1]


# Cartridges: case length, case radius, neck radius, bullet length (out of the case), bullet radius.
CART = {
    "9mm": (19.2, 4.9, 4.8, 10.5, 4.5),
    "556": (44.7, 4.8, 3.2, 12.7, 2.85),
    "762": (51.2, 6.0, 4.3, 20.0, 3.9),
}


class ItemKit(Kit):
    """Kit in a gun's design space, in millimetres: u forward along the bore
    from the rear of the item, z up, x toward the left side. Stored in metres
    with the muzzle toward -Y.

    low: the in-game build. Cylinders take at most 4 sides (under 7 mm
    radius: rounds, rods), 5 (barrels, tubes), 6 or 8 (big); curves take
    fewer sections; what's built in a `detail()` block, rail teeth, bores and
    belt links are left out."""

    def __init__(self, low=False):
        super().__init__()
        self.low = low

    @contextmanager
    def detail(self):
        """Geometry made in this block is fine detail: the low build drops it."""
        if not self.low:
            yield
            return
        keep = self.bm, self.uv
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        try:
            yield
        finally:
            self.bm.free()
            self.bm, self.uv = keep

    def cyl(self, sw, p0, p1, r0, r1=None, segs=8, smooth=True, rot=0.0):
        if self.low:
            r = max(r0, r1 or 0)
            segs = min(segs, 4 if r < .007 else 5 if r < .015 else 6 if r < .03 else 8)
        super().cyl(sw, p0, p1, r0, r1, segs=segs, smooth=smooth, rot=rot)

    def ring(self, sw, c, axis, r_out, r_in, w, segs=10):
        super().ring(sw, c, axis, r_out, r_in, w, segs=min(segs, 6) if self.low else segs)

    @staticmethod
    def P(x, u, z):
        return (x * MM, -u * MM, z * MM)

    def side(self, sw, w, pts, x=0):
        """A slab w thick (across x) from the convex hull of (u, z) points: a side-on profile."""
        prof = [(-u * MM, z * MM) for u, z in hull2(pts)]
        self.extrude_x(sw, (x - w / 2) * MM, (x + w / 2) * MM, prof)

    def bar(self, sw, u0, u1, z0, z1, w, x=0):
        self.box(sw, (x - w / 2) * MM, -u1 * MM, z0 * MM, (x + w / 2) * MM, -u0 * MM, z1 * MM)

    def tube(self, sw, u0, u1, z, r, r1=None, segs=12, x=0, smooth=True):
        """A cylinder (or cone) along the bore."""
        self.cyl(sw, self.P(x, u0, z), self.P(x, u1, z), r * MM, None if r1 is None else r1 * MM, segs=segs, smooth=smooth)

    def vcyl(self, sw, z0, z1, r, r1=None, segs=16, x=0, u=0):
        """A cylinder (or cone) standing up."""
        self.cyl(sw, self.P(x, u, z0), self.P(x, u, z1), r * MM, None if r1 is None else r1 * MM, segs=segs)

    def rod(self, sw, a, b, r, segs=6, smooth=True):
        """A cylinder between two (x, u, z) points."""
        self.cyl(sw, self.P(*a), self.P(*b), r * MM, segs=segs, smooth=smooth)

    def hexa(self, sw, pts):
        """A six-sided solid from 8 (x, u, z) points: one end's four, then the other's, same order."""
        self.hull(sw, [self.P(*p) for p in pts])

    def octo(self, sw, u0, u1, w, z0, z1, ch=.3, x=0):
        """An octagonal prism along the bore: handguards, forends, grips."""
        hw, c = w / 2, ch * min(w, z1 - z0)
        prof = [(x - hw + c, z0), (x + hw - c, z0), (x + hw, z0 + c), (x + hw, z1 - c),
                (x + hw - c, z1), (x - hw + c, z1), (x - hw, z1 - c), (x - hw, z0 + c)]
        self.extrude_y(sw, -u1 * MM, -u0 * MM, [(a * MM, b * MM) for a, b in prof])

    def curved_mag(self, sw, top, depth, w, length, bend=0, tilt=0, n=5, base=(6, 4, 9), base_sw="plastic_black"):
        """A box magazine from the middle of its top (u, z) down its spine for `length`, its front edge
        toward +u, curving forward by `bend` degrees (leaning `tilt` at the top). Every section, the base
        plate's too, is square to the spine. Returns the middle of the base."""
        if self.low:
            n = 2 if bend else 1
        u, z = top
        secs = []
        for i in range(n + 1):
            if i:
                am = math.radians(tilt + bend * (i - .5) / n)
                u += length / n * math.sin(am)
                z -= length / n * math.cos(am)
            secs.append((u, z, math.radians(tilt + bend * i / n)))

        def ends(u, z, a, half):
            return (u - math.cos(a) * half, z - math.sin(a) * half), (u + math.cos(a) * half, z + math.sin(a) * half)

        def slab(sw, sa, sb, ha, hb, h):
            (ra, fa), (rb, fb) = ends(*sa, ha), ends(*sb, hb)
            self.hexa(sw, [(-h, *ra), (h, *ra), (h, *fa), (-h, *fa), (-h, *rb), (h, *rb), (h, *fb), (-h, *fb)])
        for sa, sb in zip(secs, secs[1:]):
            slab(sw, sa, sb, depth / 2, depth / 2, w / 2)
        u, z, a = secs[-1]
        if not base:
            return (u, z, a)
        bd, bw, bh = base
        end = (u + math.sin(a) * bh, z - math.cos(a) * bh, a)
        slab(base_sw, (u - math.sin(a) * 2, z + math.cos(a) * 2, a), end, depth / 2 + bd / 2, depth / 2 + bd / 2, (w + bw) / 2)
        return end

    def pillow(self, sw, c, r, n=4.0, nu=24, nv=10, bulge=0.0):
        """A soft rounded box (a superquadric, exponent n: 2 an ellipsoid, higher boxier) centred on c
        (x, u, z) with half-sizes r (x, u, z); bulge swells the middle of its front and back. Smooth."""
        cx, cu, cz = c
        a, b, h = r
        if self.low:
            nu, nv = max(8, nu // 2), max(4, nv // 2)
        bm = self.bm
        rows = []
        for j in range(1, nv):
            psi = -math.pi / 2 + math.pi * j / nv
            cp = spow(math.cos(psi), 2 / n)
            row = []
            for i in range(nu):
                th = 2 * math.pi * i / nu
                x, z = a * cp * spow(math.cos(th), 2 / n), h * cp * spow(math.sin(th), 2 / n)
                u = b * spow(math.sin(psi), 2 / n) * (1 + bulge * (1 - (x / a) ** 2) * (1 - (z / h) ** 2))
                row.append(bm.verts.new(self.P(cx + x, cu + u, cz + z)))
            rows.append(row)
        faces = [bm.faces.new(rows[0]), bm.faces.new(rows[-1])]
        for ra, rb in zip(rows, rows[1:]):
            for i in range(nu):
                i2 = (i + 1) % nu
                faces.append(bm.faces.new((ra[i], ra[i2], rb[i2], rb[i])))
        self._paint(faces, sw, smooth=True)

    def cartridge(self, kind, u, z, x=0, link=False, forward=1):
        """A round lying along u, its base at u, the bullet toward +u (or -u with forward=-1)."""
        cl, cr, nr, bl, br = CART[kind]
        f = forward
        body = cl * (.82 if nr < cr and not self.low else 1)
        self.tube("brass", u, u + f * body, z, cr, segs=8, x=x)
        if nr < cr and not self.low:
            self.tube("brass", u + f * body, u + f * cl, z, cr, nr, segs=8, x=x)
        self.tube("copper", u + f * cl, u + f * (cl + bl), z, br, br * .25, segs=8, x=x)
        if link and not self.low:
            a, b = sorted((u + f * cl * .2, u + f * cl * .55))
            self.bar("iron", a, b, z - cr - 1, z + cr + 1, 2 * cr + 2.6, x=x)

    def grip(self, sw, u_rear, u_front, z_top, z_bot, w=30, rake=22, rake_rear=None):
        """A pistol grip raked back toward the bottom (degrees from vertical)."""
        h = z_top - z_bot
        dr = math.tan(math.radians(rake if rake_rear is None else rake_rear)) * h
        df = math.tan(math.radians(rake)) * h
        self.side(sw, w, [(u_rear, z_top), (u_front, z_top), (u_front - df, z_bot + 4), (u_front - df - 4, z_bot),
                          (u_rear - dr + 4, z_bot), (u_rear - dr, z_bot + 4)])
        return ((u_rear + u_front - (dr + df) / 2) / 2, (z_top + z_bot) / 2)

    def guard(self, sw, u_rear, u_front, z_bot, z_top, w=10, t=6, trig=None, trig_sw="iron"):
        """A trigger guard (bottom bar, front post) and a trigger at u = trig."""
        self.side(sw, w, [(u_rear, z_bot + t), (u_rear + 6, z_bot), (u_front, z_bot), (u_front, z_bot + t)])
        self.side(sw, w, [(u_front - t, z_bot), (u_front, z_bot), (u_front, z_top), (u_front - t, z_top)])
        if trig is not None:
            self.side(trig_sw, 6, [(trig, z_top), (trig + 5, z_top), (trig + 1, z_bot + t + 3), (trig - 3, z_bot + t + 5)])

    def rail(self, u0, u1, z, w=21, pitch=10, sw="black_paint", down=False):
        """A Picatinny rail from z: a base and its cross-slots' teeth (up, or down under a handguard)."""
        s = -1 if down else 1
        if self.low:
            self.bar(sw, u0, u1, *sorted((z, z + s * 8)), w)
            return
        self.bar(sw, u0, u1, *sorted((z, z + s * 5)), w)
        u = u0 + 2
        while u + pitch / 2 < u1 - 1:
            self.bar(sw, u, u + pitch / 2, *sorted((z + s * 5, z + s * 9.5)), w)
            u += pitch

    def bore(self, u, z, r, x=0):
        """A dark disc a hair beyond the muzzle face: the bore seen end on."""
        if self.low:
            return
        self.tube("glass_dark", u, u + .6, z, r, segs=10, x=x)


# ---------------------------------------------------------------- items
ITEMS = []  # (id, builder, view, base): base is the ItemId whose grid size the icon takes


def item(view="side"):
    def deco(fn):
        name = fn.__name__.replace("_", "-")
        ITEMS.append((name, fn, view, name))
        return fn
    return deco


# Magazines, shared by the guns and the loose magazines: (depth, width, length, bend, tilt, base).
MAGS = {
    "glock": (32, 22, 113, 0, 0, (4, 3, 9)),
    "mpx": (38, 25, 138, 7, 2, (5, 4, 9)),
    "stanag": (64, 24, 192, 20, 6, (6, 4, 10)),
    "sr25": (88, 27, 150, 6, 3, (6, 4, 10)),
}


def mag(k, kind, top, sw="plastic_black"):
    d, w, ln, bend, tilt, base = MAGS[kind]
    return k.curved_mag(sw, top, d, w, ln, bend, tilt, base=base)


def eotech(k, u0, z):
    """A holographic sight (EOTech EXPS3 class) on a rail top at z, u0 its rear: 96 mm long, 58 wide,
    64 high. The battery lies across the front; the hood and its window are toward the eye."""
    k.bar("black_paint", u0 + 6, u0 + 90, z, z + 12, 36)
    with k.detail():
        k.bar("black_paint", u0 + 24, u0 + 38, z + 2, z + 10, 5, x=21)
        k.bar("black_paint", u0 + 62, u0 + 76, z + 2, z + 10, 5, x=21)
    k.side("black_paint", 50, [(u0, z + 12), (u0 + 96, z + 12), (u0 + 96, z + 28), (u0 + 92, z + 32), (u0, z + 30)])
    k.tube("black_paint", u0 + 66, u0 + 90, z + 22, 11, segs=10, x=0)
    for x in (-24, 24):
        k.side("black_paint", 6, [(u0, z + 30), (u0 + 66, z + 30), (u0 + 58, z + 60), (u0 + 4, z + 58)], x=x)
    k.side("black_paint", 54, [(u0 + 2, z + 55), (u0 + 60, z + 56), (u0 + 56, z + 64), (u0 + 4, z + 64)])
    k.bar("glass_light", u0 + 32, u0 + 34, z + 32, z + 55, 42)
    with k.detail():
        for i in range(2):  # the buttons, on the back face under the hood
            k.bar("rubber", u0 - 2, u0, z + 15 + i * 8, z + 20 + i * 8, 10)


@item()
def knife(k, flat="black_paint", edge="steel"):
    """A KA-BAR-style fighting knife: 302 mm, a 178 mm clip-point blade, stacked-leather handle."""
    k.side("iron", 24, [(0, -12), (3, -15), (9, -15), (11, -12), (11, 12), (9, 15), (3, 15), (0, 12)])
    if k.low:
        k.octo("leather", 11, 113, 23, -14, 14)
    for i in range(0 if k.low else 6):  # leather washers, a slight swell in the middle
        u0, u1 = 11 + i * 17, 11 + (i + 1) * 17
        s = 1 + .08 * math.sin(math.pi * (i + .5) / 6)
        k.octo("leather", u0, u1 - 1.2, 22 * s, -13.5 * s, 13.5 * s)
        k.octo("wood_dark", u1 - 1.2, u1, 21 * s, -13 * s, 13 * s)
    k.side("iron", 9, [(113, -21), (119, -21), (119, 22), (113, 22), (112, 0)])
    # The blade: a flat with a ground bevel to the edge, station by station (u, spine, grind line, edge).
    st = [(119, 12, -5, -22), (200, 12, -5, -21.5), (240, 12, -4.5, -20), (268, 7.5, -4, -16.5), (290, 2, -3, -9.5), (302, -1, -1.5, -2)]
    for (ua, sa, ga, ea), (ub, sb, gb, eb) in zip(st, st[1:]):
        ha, hb = 2.6 if ua < 290 else 1.6, 2.6 if ub < 290 else .3
        k.hexa(flat, [(-ha, ua, ga), (ha, ua, ga), (ha, ua, sa), (-ha, ua, sa),
                      (-hb, ub, gb), (hb, ub, gb), (hb, ub, sb), (-hb, ub, sb)])
        k.hexa(edge, [(-ha, ua, ga), (ha, ua, ga), (.35, ua, ea), (-.35, ua, ea),
                         (-hb, ub, gb), (hb, ub, gb), (.2, ub, eb), (-.2, ub, eb)])
    return dict(grip=(0, 62, 0), muzzle=(0, 302, -2))


@item()
def crossbow(k):
    """A compact recurve crossbow (after the Barnett and Excalibur compacts): 760 mm, cocked, a bolt on
    the rail, a 1-4x scope; the limbs stand out across x and the string is drawn back to the latch."""
    rz = 150  # the top of the flight rail, where the bolt lies
    # Butt and stock, a thumbhole cut under the comb.
    k.side("rubber", 42, [(0, 60), (12, 58), (12, 170), (0, 168)])
    k.side("plastic_black", 40, [(12, 58), (150, 96), (230, 110), (230, rz - 4), (12, 172)])
    k.side("black_paint", 34, [(200, 110), (720, 118), (720, rz), (200, rz)])  # the barrel and its rail
    k.side("plastic_black", 40, [(380, 92), (640, 100), (640, 120), (380, 118)])  # the fore-grip
    with k.detail():
        k.bar("iron", 230, 700, rz - 2, rz, 6)  # the flight groove's edges
    # The riser, the limbs (recurved, swept back), the foot stirrup.
    k.side("black_paint", 60, [(690, 96), (760, 104), (760, 170), (690, 168)])
    for sx in (-1, 1):
        k.hexa("plastic_black", [(sx * 28, 744, 128), (sx * 28, 768, 128), (sx * 28, 768, 160), (sx * 28, 744, 160),
                                 (sx * 220, 722, 132), (sx * 220, 738, 132), (sx * 220, 738, 154), (sx * 220, 722, 154)])
        k.hexa("plastic_black", [(sx * 220, 722, 132), (sx * 220, 738, 132), (sx * 220, 738, 154), (sx * 220, 722, 154),
                                 (sx * 290, 742, 136), (sx * 290, 752, 136), (sx * 290, 752, 150), (sx * 290, 742, 150)])
        k.rod("linen", (sx * 288, 744, 143), (0, 330, rz + 4), 1.6, segs=4)  # the string, drawn
        k.rod("iron", (sx * 30, 762, rz + 4), (sx * 30, 750, rz + 4), 3, segs=6)  # limb bolts
    k.side("black_paint", 12, [(760, 100), (810, 96), (812, 106), (770, 112)])
    k.side("black_paint", 12, [(770, 160), (812, 166), (810, 176), (760, 172)])
    k.side("black_paint", 12, [(800, 96), (812, 96), (812, 176), (800, 176)])
    # The latch box, the safety, the grip and the guard.
    k.side("black_paint", 36, [(300, rz - 6), (380, rz - 6), (380, rz + 18), (306, rz + 18)])
    with k.detail():
        k.bar("safety_yellow", 330, 344, rz + 18, rz + 24, 10)
    cu, cz = k.grip("plastic_black", 248, 296, 108, 10, w=30, rake=20)
    k.guard("black_paint", 290, 350, 84, 108, w=10, t=6, trig=312)
    # The scope on its rings.
    k.tube("black_paint", 360, 560, rz + 58, 13, segs=12)
    k.tube("black_paint", 340, 380, rz + 58, 17, 13, segs=12)
    k.tube("black_paint", 540, 590, rz + 58, 13, 19, segs=12)
    k.tube("glass_dark", 589, 591, rz + 58, 17, segs=12)
    for u in (400, 520):
        k.bar("black_paint", u, u + 16, rz + 18, rz + 50, 22)
    # The bolt on the rail: shaft, vanes, the haemolytic head past the riser.
    bolt_on_rail(k, 330, rz + 5)
    return dict(grip=(0, cu, cz), muzzle=(0, 800, rz + 5), support=(0, 520, 100))


def bolt_on_rail(k, u0, z):
    """A 330 mm bolt lying along the rail from u0, nock back."""
    k.tube("aluminium", u0, u0 + 300, z, 4.2, segs=8)
    k.tube("signal_red", u0 + 300, u0 + 316, z, 5, 4.2, segs=8)
    k.tube("steel", u0 + 316, u0 + 334, z, 5, .5, segs=8)
    with k.detail():
        for a in (90, 210, 330):
            x, h = 10 * math.cos(math.radians(a)), 10 * math.sin(math.radians(a))
            k.rod("plastic_grey", (x * .4, u0 + 8, z + h * .4), (x, u0 + 50, z + h), 1, segs=3)


def glock(k, sd):
    """Glock 19: 187 mm long, 128 high, 30 wide; the slide on a polymer frame."""
    bz = 112  # the bore
    k.side("iron", 25.5, [(2, 99), (176, 99), (176, 121), (170, 127.5), (5, 127.5), (2, 124)])
    with k.detail():
        for i in range(6):  # rear slide serrations
            k.bar("black_paint", 10 + i * 5, 12 + i * 5, 103, 123, 26.3)
    k.tube("iron", 174, 177, bz, 6, segs=10)
    if sd:
        k.tube("iron", 177, 190, bz, 6.5, segs=10)
        k.tube("black_paint", 190, 204, bz, 17, segs=16)
        k.tube("black_paint", 204, 372, bz, 19, segs=16)
        k.tube("black_paint", 372, 381, bz, 19, 17.5, segs=16)
        k.bore(381, bz, 5)
        sight = 137
    else:
        k.bore(177, bz, 4.5)
        sight = 132
    k.side("black_paint", 18, [(7, 127), (20, 127), (19, sight), (9, sight)])
    k.side("black_paint", 4, [(163, 127), (171, 127), (170, sight), (166, sight)])
    with k.detail():
        k.bar("paint_white", 166.5, 169.5, sight - 3.5, sight - 1, 4.3)
    # Frame: dust cover with its rail, tang, grip, magazine baseplate.
    k.side("plastic_black", 27, [(100, 88), (171, 91), (171, 99), (100, 99)])
    with k.detail():
        for i in range(3):
            k.bar("plastic_black", 140 + i * 9, 145 + i * 9, 86, 91, 22)
    k.side("plastic_black", 27, [(0, 93), (34, 92), (100, 92), (100, 99), (2, 99), (0, 96)])
    cu, cz = k.grip("plastic_black", 22, 83, 93, 9, w=30, rake=22, rake_rear=18)
    k.side("plastic_black", 31, [(-6, 0), (49, 0), (50, 9), (-5, 9)])
    k.guard("plastic_black", 76, 117, 63, 92, w=14, t=6.5, trig=96)
    # Left-side controls: slide stop, takedown lever, magazine catch.
    with k.detail():
        k.bar("black_paint", 84, 102, 97, 100, 2, x=14.5)
        k.bar("black_paint", 106, 111, 94, 98, 2, x=14.3)
        k.bar("plastic_black", 76, 82, 80, 88, 2.5, x=14.5)
    return dict(grip=(0, cu, cz), muzzle=(0, 381 if sd else 177, bz))


@item()
def pistol(k):
    return glock(k, False)


@item()
def pistol_sd(k):
    return glock(k, True)


@item()
def smg(k):
    """Sig Sauer MPX, 8-inch barrel, stock collapsed: 540 mm, 20-round magazine."""
    bz = 137
    # Telescoping stock: butt plate on two rods.
    k.side("rubber", 40, [(0, 55), (14, 50), (20, 52), (20, 152), (14, 154), (0, 150)])
    k.side("plastic_black", 38, [(20, 60), (40, 66), (40, 150), (20, 152)])
    for z in (90, 135):
        k.tube("black_paint", 40, 132, z, 6, segs=8)
    k.side("black_paint", 30, [(120, 85), (150, 85), (150, 150), (120, 150)])
    # Upper and lower receivers, handguard, rail.
    k.side("black_paint", 30, [(130, 112), (330, 112), (330, 160), (134, 160), (130, 156)])
    k.side("black_paint", 28, [(150, 85), (300, 85), (300, 112), (150, 112)])
    k.octo("black_paint", 330, 470, 40, 108, 161, ch=.28)
    with k.detail():
        for i in range(4):
            k.bar("plastic_black", 345 + i * 31, 367 + i * 31, 124, 140, 2, x=20.5)
    k.rail(130, 470, 160, sw="iron")
    k.bar("black_paint", 126, 140, 150, 160, 44)  # ambidextrous charging handle
    k.side("black_paint", 16, [(140, 169), (160, 169), (158, 178), (145, 178)])  # folded sights
    k.side("black_paint", 16, [(448, 169), (466, 169), (463, 178), (452, 178)])
    k.tube("iron", 470, 500, bz, 9, segs=10)
    k.tube("black_paint", 500, 540, bz, 11, segs=10)
    k.bore(540, bz, 4.5)
    # Grip, guard, magazine well and magazine.
    cu, cz = k.grip("plastic_black", 168, 212, 86, 0, w=30, rake=24)
    k.guard("black_paint", 205, 252, 58, 86, w=11, t=6, trig=226)
    k.side("black_paint", 30, [(254, 112), (300, 112), (300, 52), (250, 48)])
    mag(k, "mpx", (276, 100))
    with k.detail():
        k.bar("black_paint", 168, 180, 98, 104, 2, x=15)  # selector
    return dict(grip=(0, cu, cz), muzzle=(0, 540, bz), support=(0, 410, 110))


def hk416(k, sd):
    """H&K 416, 14.5-inch barrel: 872 mm with the stock out (more with the can). The quad rail is tall:
    the gas piston runs over the barrel, so the bore sits a little below the handguard's middle."""
    bz, top = 185, 228  # the bore; the top of the upper and of the handguard (the rails' base)
    # Stock (tall at the butt, its underside sweeping up to the buffer tube), buffer tube.
    k.side("rubber", 44, [(0, 66), (14, 62), (18, 64), (18, 206), (14, 209), (0, 206)])
    k.side("plastic_black", 42, [(18, 66), (82, 80), (82, 206), (18, 207)])
    k.side("plastic_black", 40, [(80, 80), (172, 146), (172, 204), (80, 206)])
    k.side("plastic_black", 36, [(168, 146), (202, 152), (202, 202), (168, 204)])
    with k.detail():
        k.side("rubber", 43, [(26, 84), (60, 92), (60, 104), (26, 98)])  # sling slot
    k.tube("black_paint", 200, 282, 188, 15, segs=12)
    # Receivers, charging handle, quad-rail handguard, rails.
    k.side("black_paint", 30, [(280, 130), (482, 130), (482, 165), (290, 165), (280, 155)])
    k.side("black_paint", 31, [(270, 165), (490, 165), (490, top), (276, top), (270, top - 6)])
    k.bar("black_paint", 262, 278, top - 22, top - 6, 48)
    k.octo("black_paint", 490, 766, 58, 150, top, ch=.2)
    k.hexa("black_paint", [(-25, 766, 156), (25, 766, 156), (25, 766, top - 4), (-25, 766, top - 4),
                           (-20, 778, 166), (20, 778, 166), (20, 778, top - 8), (-20, 778, top - 8)])
    with k.detail():
        k.bar("iron", 495, 762, 183, 197, 4, x=29)  # left rail
    k.rail(276, 766, top)
    k.rail(500, 760, 150, down=True)
    k.bar("black_paint", 284, 312, top + 9, top + 17, 16)  # folded sights
    k.bar("black_paint", 736, 762, top + 9, top + 18, 14)
    eotech(k, 372, top + 9.5)
    # Barrel and muzzle.
    k.tube("iron", 776, 826, bz, 10, segs=12)
    if sd:
        k.tube("black_paint", 820, 840, bz, 20, segs=16)
        k.tube("black_paint", 840, 1000, bz, 22, segs=16)
        k.tube("black_paint", 1000, 1008, bz, 22, 19, segs=16)
        k.bore(1008, bz, 4)
        muzzle = 1008
    else:
        k.tube("black_paint", 826, 872, bz, 11, segs=10)
        with k.detail():
            for i in range(3):
                k.bar("glass_dark", 832 + i * 13, 840 + i * 13, bz + 4, bz + 11.4, 4)
        k.bore(872, bz, 4)
        muzzle = 872
    # Grip, guard, magazine well, curved 30-round magazine; left-side controls.
    cu, cz = k.grip("plastic_black", 336, 386, 130, 30, w=30, rake=23)
    k.guard("black_paint", 380, 442, 104, 130, w=11, t=6, trig=405)
    k.side("black_paint", 30, [(444, 130), (524, 130), (522, 86), (446, 84)])
    mag(k, "stanag", (484, 125))
    with k.detail():
        k.bar("black_paint", 360, 374, 158, 166, 2.5, x=15.5)
        k.bar("black_paint", 450, 470, 140, 158, 2.5, x=15.5)
    return dict(grip=(0, cu, cz), muzzle=(0, muzzle, bz), support=(0, 650, 155))


@item()
def rifle(k):
    return hk416(k, False)


@item()
def rifle_sd(k):
    return hk416(k, True)


def tube_gun(k, bz, u_rx, u_end, mag_end, forend, sw_fore):
    """Shotgun barrel, magazine tube, clamp, pump forend; returns the support point."""
    k.tube("iron", u_rx, u_end, bz, 11, segs=12)
    k.bore(u_end, bz, 9)
    tz = bz - 37
    k.tube("iron", u_rx, mag_end, tz, 13, segs=12)
    k.tube("iron", mag_end, mag_end + 22, tz, 13.5, 11, segs=12)
    k.side("iron", 24, [(mag_end - 40, tz - 10), (mag_end - 22, tz - 10), (mag_end - 22, bz + 9), (mag_end - 40, bz + 9)])
    f0, f1 = forend
    k.octo(sw_fore, f0, f1, 50, tz - 25, bz - 10, ch=.3)
    return (f0 + f1) / 2, tz - 15


def m4_stock(k, sw, u0, u_end, tz):
    """A six-position carbine stock from u0 on a buffer tube at height tz, the tube running to u_end."""
    k.side("rubber", 42, [(u0, tz - 96), (u0 + 14, tz - 100), (u0 + 18, tz - 98), (u0 + 18, tz + 22), (u0 + 14, tz + 25), (u0, tz + 22)])
    k.side(sw, 40, [(u0 + 18, tz - 98), (u0 + 60, tz - 86), (u0 + 60, tz + 24), (u0 + 18, tz + 24)])
    k.side(sw, 36, [(u0 + 58, tz - 86), (u0 + 178, tz - 22), (u0 + 178, tz + 22), (u0 + 58, tz + 24)])
    k.side("black_paint", 12, [(u0 + 120, tz - 52), (u0 + 150, tz - 36), (u0 + 150, tz - 28), (u0 + 120, tz - 42)])
    k.tube("black_paint", u0 + 170, u_end, tz, 15, segs=12)


@item()
def shotgun(k):
    """Mossberg 590, 18.5-inch barrel, in a tactical chassis: carbine stock on a buffer tube, a pistol
    grip, a ribbed polymer forend, OD green: 933 mm with the stock in its third position."""
    bz = 160
    m4_stock(k, "olive", 70, 322, 162)
    k.side("black_paint", 40, [(308, 116), (322, 116), (322, 184), (308, 184)])  # the stock adapter
    # Receiver, tang safety, rail, trigger housing, guard and pistol grip.
    k.side("iron", 32, [(318, 116), (520, 116), (520, 172), (505, 180), (330, 180), (318, 172)])
    k.bar("black_paint", 326, 344, 179, 186, 12)
    k.rail(398, 506, 180)
    k.side("iron", 24, [(322, 106), (440, 106), (440, 117), (322, 117)])
    k.guard("black_paint", 362, 440, 82, 108, w=12, t=7, trig=392)
    cu, cz = k.grip("olive", 314, 362, 108, 10, w=32, rake=21)
    su, sz = tube_gun(k, bz, 520, 1003, 950, (560, 770), "olive")
    with k.detail():
        for u in (575, 605, 635, 665, 695, 725):  # finger ribs round the forend
            k.octo("black_paint", u, u + 8, 51.5, bz - 63, bz - 9, ch=.3)
    k.tube("brass", 984, 991, bz + 14, 3, segs=8)
    k.bar("iron", 978, 996, bz + 9, bz + 12, 6)
    return dict(grip=(0, cu, cz), muzzle=(0, 1003, bz), support=(0, su, sz))


@item()
def shotgun_semi(k):
    """Benelli M4, 18.5-inch barrel: 1010 mm, pistol-grip telescoping stock, ghost-ring sights."""
    bz = 158
    k.side("rubber", 44, [(0, 30), (16, 26), (22, 28), (22, 160), (16, 164), (0, 160)])
    k.side("plastic_black", 42, [(22, 32), (70, 46), (70, 162), (22, 162)])
    k.side("plastic_black", 34, [(70, 46), (200, 104), (200, 160), (70, 162)])
    k.side("plastic_black", 40, [(110, 160), (200, 160), (196, 170), (120, 172)])  # cheek rest
    k.tube("black_paint", 195, 302, 142, 14, segs=12)
    # Receiver, rail, ghost-ring rear sight with its wings.
    k.side("black_paint", 32, [(300, 112), (520, 112), (520, 175), (306, 175), (300, 168)])
    k.rail(306, 520, 175)
    k.side("black_paint", 16, [(462, 184), (500, 184), (496, 198), (466, 198)])
    for x in (-7, 7):
        k.side("black_paint", 3, [(470, 198), (494, 198), (486, 222), (478, 222)], x=x)
    cu, cz = k.grip("plastic_black", 300, 350, 112, 18, w=32, rake=20)
    k.guard("black_paint", 344, 420, 84, 112, w=12, t=7, trig=378)
    k.tube("iron", 418, 422, 135, 6, segs=8, x=16)
    su, sz = tube_gun(k, bz, 520, 1010, 950, (520, 760), "plastic_black")
    for x in (-7, 7):  # front sight wings round the post
        k.side("black_paint", 3, [(935, 168), (962, 168), (956, 200), (941, 200)], x=x)
    k.side("black_paint", 4, [(944, 168), (954, 168), (952, 196), (946, 196)])
    return dict(grip=(0, cu, cz), muzzle=(0, 1010, bz), support=(0, su, sz))


def folded_bipod(k, u0, u1, z, spread=16, r=5):
    for x in (-spread, spread):
        k.tube("iron", u0, u1, z, r, segs=6, x=x)
        k.tube("rubber", u0 - 12, u0, z, r + 1.5, segs=6, x=x)
    k.side("iron", 2 * spread + 12, [(u1 - 8, z - 6), (u1 + 14, z - 6), (u1 + 14, z + 22), (u1 - 8, z + 12)])


def carry_handle(k, u0, u1, z0, z1, x=0, sw="plastic_black"):
    k.side(sw, 14, [(u0, z0), (u0 + 16, z0), (u0 + 10, z1), (u0, z1)], x=x)
    k.side(sw, 14, [(u1 - 16, z0), (u1, z0), (u1, z1), (u1 - 10, z1)], x=x)
    k.octo(sw, u0, u1, 18, z1 - 4, z1 + 12, ch=.35, x=x)


def saw_box(k, x0, u0, z0):
    """The M249's 200-round plastic box, 80 wide, 154 long, 108 high, from its rear bottom left corner."""
    x1, u1, z1 = x0 + 80, u0 + 154, z0 + 108
    k.hexa("olive", [(x0, u0, z0), (x1, u0, z0), (x1, u1, z0), (x0, u1, z0),
                     (x0, u0, z1), (x1, u0, z1), (x1, u1, z1), (x0, u1, z1)])
    k.bar("olive", u0 - 3, u1 + 3, z1 - 14, z1, 86, x=(x0 + x1) / 2)  # the lid's lip
    k.bar("olive", u0 - 2, u1 + 2, z0 + 40, z0 + 46, 84, x=(x0 + x1) / 2)  # a moulded rib
    k.bar("plastic_black", u1 + 3, u1 + 8, z1 - 30, z1 - 8, 26, x=(x0 + x1) / 2)  # latch
    return x1, u1, z1


@item()
def m249(k):
    """M249, fixed stock, 465 mm barrel: 1040 mm; a 200-round box under the left side."""
    bz = 200
    k.side("plastic_black", 50, [(0, 72), (20, 70), (20, 218), (0, 214)])
    k.side("plastic_black", 46, [(20, 74), (240, 150), (240, 222), (20, 218)])
    k.side("rubber", 40, [(70, 104), (200, 148), (200, 168), (70, 140)])  # the stock's hollow
    # Receiver, feed cover, rear sight, magazine well on the left.
    k.side("black_paint", 62, [(240, 148), (565, 148), (565, 236), (240, 236)])
    k.hexa("iron", [(-34, 292, 236), (34, 292, 236), (34, 522, 236), (-34, 522, 236),
                    (-30, 310, 260), (30, 310, 260), (30, 515, 256), (-30, 515, 256)])
    k.side("black_paint", 16, [(312, 258), (334, 258), (330, 284), (316, 284)])
    k.bar("black_paint", 440, 492, 168, 206, 44, x=52)
    saw_box(k, -4, 376, 40)
    # Grip and winter guard.
    cu, cz = k.grip("plastic_black", 300, 350, 150, 52, w=32, rake=18)
    k.guard("black_paint", 330, 440, 98, 150, w=14, t=7, trig=380)
    # Barrel, heat shield, carry handle, gas tube, handguard, bipod, front sight, flash hider.
    k.tube("iron", 565, 985, bz, 12, segs=12)
    k.bar("black_paint", 565, 770, bz + 6, bz + 21, 32)
    carry_handle(k, 608, 720, bz + 12, bz + 56)
    k.tube("iron", 565, 870, 158, 12, segs=10)
    k.tube("iron", 870, 892, 158, 15, segs=10)
    k.side("iron", 30, [(870, 150), (890, 150), (890, bz + 6), (870, bz + 6)])
    k.octo("plastic_black", 565, 705, 64, 136, 196, ch=.25)
    with k.detail():
        for i in range(4):
            k.bar("rubber", 585 + i * 30, 600 + i * 30, 142, 188, 65.5)
    folded_bipod(k, 712, 880, 142)
    k.side("black_paint", 10, [(938, bz + 10), (958, bz + 10), (952, bz + 52), (944, bz + 52)])
    k.tube("black_paint", 985, 1040, bz, 14, segs=12)
    k.bore(1040, bz, 4)
    return dict(grip=(0, cu, cz), muzzle=(0, 1040, bz), support=(0, 640, 150))


@item()
def m240b(k):
    """M240B, 630 mm barrel: 1245 mm, fixed stock, a belt stub out of the feed tray."""
    bz = 210
    # The stock: a vertical butt plate with the shoulder rest folded along the top, a top line stepped
    # down from the receiver, an underside dished as it sweeps up from the toe; the buffer housing.
    k.side("rubber", 56, [(0, 62), (22, 60), (22, 238), (0, 236)])
    k.side("iron", 30, [(2, 238), (88, 238), (84, 246), (2, 246)])
    k.side("plastic_black", 48, [(22, 62), (120, 103), (120, 228), (22, 236)])
    k.side("plastic_black", 48, [(118, 102), (222, 135), (222, 228), (118, 228)])
    k.side("plastic_black", 50, [(220, 134), (286, 150), (286, 230), (220, 228)])
    k.tube("black_paint", 246, 290, 198, 33, segs=14)
    # Receiver with rivets, feed cover, rear sight leaf, feed tray out to the left.
    k.side("black_paint", 64, [(285, 150), (705, 150), (705, 242), (285, 242)])
    with k.detail():
        for u in (320, 380, 620, 680):
            for z in (165, 226):
                k.rod("iron", (32, u, z), (34, u, z), 4, segs=6)
    k.hexa("iron", [(-36, 352, 242), (36, 352, 242), (36, 602, 242), (-36, 602, 242),
                    (-32, 362, 266), (32, 362, 266), (32, 590, 262), (-32, 590, 262)])
    k.side("black_paint", 18, [(364, 266), (386, 266), (382, 302), (368, 302)])
    k.bar("black_paint", 450, 562, 204, 242, 30, x=48)
    # The belt: 7.62 rounds lying along the bore, falling away to the left.
    for i in range(5):
        k.cartridge("762", 465, 222 - i * 16, x=70 + i * 6, link=True)
    cu, cz = k.grip("plastic_black", 334, 386, 150, 48, w=32, rake=18)
    k.guard("black_paint", 360, 472, 94, 150, w=14, t=7, trig=408)
    # Barrel, carry handle (left), gas tube, handguard, heat shield, bipod, front sight, flash hider.
    k.tube("iron", 705, 1180, bz, 13, segs=12)
    carry_handle(k, 752, 900, bz + 14, bz + 70, x=18)
    k.tube("iron", 705, 1100, 166, 12, segs=10)
    k.tube("iron", 1100, 1124, 166, 15, segs=10)
    k.octo("plastic_black", 705, 822, 66, 140, 202, ch=.25)
    k.bar("black_paint", 830, 1060, bz + 9, bz + 22, 26)
    folded_bipod(k, 860, 1080, 150, spread=18, r=6)
    k.side("black_paint", 12, [(1106, bz + 12), (1130, bz + 12), (1124, bz + 64), (1112, bz + 64)])
    k.tube("black_paint", 1180, 1245, bz, 12, 17, segs=12)
    k.bore(1245, bz, 4)
    return dict(grip=(0, cu, cz), muzzle=(0, 1245, bz), support=(0, 762, 150))


@item()
def m110(k, sd=False):
    """M110 semi-automatic sniper rifle, 20-inch barrel: 1029 mm; a 3.5-10x scope, coyote furniture,
    a 20-round 7.62 magazine (deeper than a 5.56 one, and short). Suppressed (sd): the issue can slid
    over the flash hider, 1181 mm overall."""
    bz = 190
    k.side("rubber", 42, [(0, 70), (14, 68), (16, 70), (16, 202), (14, 204), (0, 202)])
    k.side("upholstery_tan", 42, [(16, 72), (262, 155), (262, 204), (16, 204)])
    k.side("upholstery_tan", 34, [(60, 202), (225, 202), (210, 228), (82, 228)])  # cheek riser
    # Receivers, rail, free-float handguard.
    k.side("black_paint", 30, [(260, 140), (506, 140), (506, 175), (270, 175), (260, 165)])
    k.side("black_paint", 31, [(254, 175), (482, 175), (482, 215), (258, 215)])
    k.bar("black_paint", 244, 260, 200, 212, 46)
    k.octo("black_paint", 482, 820, 56, 156, 221, ch=.22)
    with k.detail():
        for i in range(6):
            k.bar("plastic_black", 520 + i * 48, 552 + i * 48, 178, 198, 2, x=28)
    k.rail(258, 820, 215)
    # The scope on two rings.
    sz = 263
    for u in (365, 500):
        k.bar("black_paint", u - 12, u + 12, 224, sz - 4, 34)
        k.tube("black_paint", u - 12, u + 12, sz, 18.5, segs=14)
    k.tube("black_paint", 272, 330, sz, 21, 21, segs=16)
    k.tube("black_paint", 330, 345, sz, 21, 15, segs=16)
    k.tube("black_paint", 345, 528, sz, 15, segs=16)
    k.tube("black_paint", 528, 566, sz, 15, 24, segs=16)
    k.tube("black_paint", 566, 612, sz, 24, segs=16)
    k.tube("glass_dark", 612, 613, sz, 21.5, segs=16)
    k.tube("glass_dark", 271, 272, sz, 18, segs=16)
    k.rod("black_paint", (0, 432, sz + 10), (0, 432, sz + 42), 14, segs=14)
    k.rod("black_paint", (10, 432, sz), (36, 432, sz), 13, segs=14)
    k.side("black_paint", 40, [(410, sz - 16), (454, sz - 16), (454, sz + 16), (410, sz + 16)])
    # Barrel, muzzle device or suppressor.
    k.tube("iron", 820, 1000, bz, 11.5, segs=12)
    if sd:
        k.tube("black_paint", 986, 1010, bz, 23, segs=16)  # the quick-detach collar
        k.tube("iron", 1010, 1014, bz, 21.5, segs=16)
        k.tube("black_paint", 1014, 1172, bz, 21, segs=16)
        k.tube("black_paint", 1172, 1181, bz, 21, 17, segs=16)
        k.bore(1181, bz, 4.5)
        muzzle = 1181
    else:
        k.tube("black_paint", 1000, 1029, bz, 14, segs=12)
        k.bore(1029, bz, 4)
        muzzle = 1029
    cu, cz = k.grip("plastic_black", 306, 356, 140, 42, w=30, rake=23)
    k.guard("black_paint", 350, 404, 114, 140, w=11, t=6, trig=374)
    k.side("black_paint", 31, [(404, 140), (506, 140), (504, 94), (406, 92)])
    mag(k, "sr25", (455, 134))
    return dict(grip=(0, cu, cz), muzzle=(0, muzzle, bz), support=(0, 680, 160))


@item()
def rpg(k):
    """Carl Gustav M4 recoilless rifle: 1000 mm, 84 mm bore, carbon tube, venturi at the back."""
    az = 200  # the tube's axis
    # Venturi and its lock, the tube, the muzzle ring.
    k.tube("iron", 0, 55, az, 68, 58, segs=18)
    k.tube("glass_dark", -.6, 0, az, 52, segs=18)
    k.tube("iron", 55, 120, az, 60, segs=18)
    k.side("black_paint", 20, [(60, az + 56), (108, az + 56), (100, az + 84), (68, az + 84)], x=30)
    k.tube("black_paint", 120, 940, az, 52, segs=18)
    k.tube("iron", 940, 1000, az, 56, segs=18)
    k.tube("glass_dark", 1000, 1000.6, az, 44, segs=18)
    for u in (300, 700):  # bands
        k.tube("iron", u, u + 14, az, 54, segs=18)
    # Shoulder rest, firing grip and housing, front grip.
    k.hexa("rubber", [(-34, 370, 150), (34, 370, 150), (34, 520, 150), (-34, 520, 150),
                      (-26, 385, 112), (26, 385, 112), (26, 505, 112), (-26, 505, 112)])
    k.side("plastic_black", 40, [(548, az - 54), (690, az - 54), (690, az - 40), (548, az - 40)])
    cu, cz = k.grip("plastic_black", 560, 612, az - 54, 44, w=32, rake=14)
    k.guard("plastic_black", 600, 680, 80, az - 54, w=12, t=7, trig=626)
    cu2 = 790
    k.side("plastic_black", 34, [(770, az - 52), (812, az - 52), (818, 52), (778, 48)])
    # Carry handle on top; a red-dot sight on its arm out to the left.
    carry_handle(k, 560, 760, az + 50, az + 96)
    k.side("black_paint", 16, [(600, az + 10), (700, az + 10), (700, az + 30), (600, az + 30)], x=58)
    k.bar("black_paint", 610, 690, az + 20, az + 42, 30, x=74)
    k.tube("black_paint", 588, 702, az + 60, 21, segs=14, x=86)
    k.tube("glass_dark", 702, 703, az + 60, 17, segs=14, x=86)
    k.tube("glass_dark", 587, 588, az + 60, 17, segs=14, x=86)
    return dict(grip=(0, cu, cz), muzzle=(0, 1000, az), support=(0, cu2, 100))


# ----- Worn items: built round a torso and a head, metres.
def wrap(k, sw, a, b, r0, r1, th0, th1, n, zb, zt):
    """A band round an elliptical torso (half-width a across X, half-depth b, the front at -Y), from
    offset r0 to r1 outside it, between angles th0 and th1 (degrees; 270 is the front centre), from
    zb(x) to zt(x)."""
    def p(th, r, z):
        return ((a + r) * math.cos(th), (b + r) * math.sin(th), z)
    if k.low:
        n = max(1, (n + 1) // 2)
    for i in range(n):
        ta = math.radians(th0 + (th1 - th0) * i / n)
        tb = math.radians(th0 + (th1 - th0) * (i + 1) / n)
        xa, xb = a * math.cos(ta), a * math.cos(tb)
        ba, bb, ta_, tb_ = zb(xa), zb(xb), zt(xa), zt(xb)
        k.hull(sw, [p(ta, r0, ba), p(ta, r1, ba), p(tb, r1, bb), p(tb, r0, bb),
                    p(ta, r0, ta_), p(ta, r1, ta_), p(tb, r1, tb_), p(tb, r0, tb_)])


def theta_at(a, x, front=True):
    """The angle (degrees) on the torso ellipse at x, on the front or the back."""
    c = math.degrees(math.acos(max(-1, min(1, x / a))))
    return 360 - c if front else c


def molle(k, sw, a, b, r, th0, th1, zs, slot=.036, gap=.012, h=.004):
    """Laser-cut webbing: rows of slots round the torso between angles th0 and th1, at heights zs."""
    if k.low:
        return
    per_deg = math.radians(1) * (a + b) / 2
    for z in zs:
        th = th0 + gap / per_deg / 2
        while th + slot / per_deg <= th1:
            wrap(k, sw, a, b, r - .001, r + .0006, th, th + slot / per_deg, 1, lambda x, z=z: z - h / 2, lambda x, z=z: z + h / 2)
            th += (slot + gap) / per_deg


def strap(k, sw, x, w, t, path):
    """A strap over the shoulder at x, w wide, t thick, through (y, z) points (its underside)."""
    for (ya, za), (yb, zb) in zip(path, path[1:]):
        k.hull(sw, [(x - w / 2, ya, za), (x + w / 2, ya, za), (x + w / 2, yb, zb), (x - w / 2, yb, zb),
                    (x - w / 2, ya, za + t), (x + w / 2, ya, za + t), (x + w / 2, yb, zb + t), (x - w / 2, yb, zb + t)])


# Colourways: grey for the first level of armour, coyote for the second.
GREY = dict(main="fabric_grey", web="plastic_grey", slot="rubber", elastic="plastic_black")
COYOTE = dict(main="upholstery_tan", web="cardboard", slot="bark", elastic="plastic_black")
# Black for the STF vest.
BLACK = dict(main="leather_black", web="plastic_black", slot="rubber", elastic="fabric_grey")


def variant(name, fn, view, base, **kw):
    """Registers a builder under name; base is the ItemId whose grid size it shares."""
    def build(k):
        return fn(k, **kw)
    build.__name__ = name
    ITEMS.append((name, build, view, base))


def soft_vest(k, C):
    """Low-visibility soft armour after the FirstSpear Ragnar: slim front and back panels with rounded
    corners and a shallow neck, narrow shoulder straps with buckles, a wide elastic cummerbund. C is
    the colourway."""
    a, b, t = .165, .115, .014
    top_f = [(0, -.128), (.05, -.112), (.085, -.08), (.115, -.07), (.14, -.088), (.152, -.115)]
    top_b = [(0, -.062), (.06, -.056), (.09, -.066), (.12, -.072), (.14, -.09), (.152, -.115)]
    bottom = lambda z: (lambda x: lerp_tab([(0, z), (.11, z), (.135, z + .014), (.152, z + .04)], abs(x)))
    wrap(k, C["main"], a, b, 0, t, theta_at(a, -.152), theta_at(a, .152), 14, bottom(-.40), lambda x: lerp_tab(top_f, abs(x)))
    wrap(k, C["main"], a, b, 0, t, theta_at(a, .152, False), theta_at(a, -.152, False), 14, bottom(-.42), lambda x: lerp_tab(top_b, abs(x)))
    # The cummerbund: wide elastic round each side, its velcro tab over the front panel.
    for th0, th1 in ((145, 218), (322, 395)):
        wrap(k, C["elastic"], a, b, .002, .011, th0, th1, 7, lambda x: -.385, lambda x: -.205)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * .152, sx * .118))
        wrap(k, C["elastic"], a, b, t - .001, t + .004, theta_at(a, x0), theta_at(a, x1), 3, lambda x: -.38, lambda x: -.21)
        strap(k, C["main"], sx * .1, .038, .005,
              [(-.105, -.074), (-.098, -.035), (-.07, -.01), (-.03, .002), (.03, .002), (.07, -.01), (.098, -.035), (.108, -.07)])
        k.box("plastic_black", sx * .1 - .022, -.112, -.062, sx * .1 + .022, -.099, -.04)  # buckle
    # A flat zip pocket low on the front.
    with k.detail():
        wrap(k, C["main"], a, b, t - .001, t + .003, theta_at(a, -.1), theta_at(a, .1), 6, lambda x: -.37, lambda x: -.27)
        wrap(k, "iron", a, b, t + .002, t + .0045, theta_at(a, -.095), theta_at(a, .095), 6, lambda x: -.276, lambda x: -.271)
    return {}


def tactical_vest(k, C):
    """Plate carrier after the FirstSpear Strandhögg (C the colourway): SAPI-medium plates with shooter's cuts,
    laser-cut webbing, a padded yoke, cummerbund; the triple magazine pouch takes the lower half of the
    front and nearly its whole width."""
    a, b, t = .17, .12, .03
    hw = .135  # the panels' half-width
    z_top, z_bot = -.06, -.40
    cut = lambda top: (lambda x: lerp_tab([(0, top), (.06, top), (hw, top - .07), (.2, top - .07)], abs(x)))
    wrap(k, C["main"], a, b, 0, t, theta_at(a, -hw), theta_at(a, hw), 10, lambda x: z_bot, cut(z_top))
    wrap(k, C["main"], a, b, 0, t, theta_at(a, hw, False), theta_at(a, -hw, False), 10, lambda x: z_bot - .02, cut(z_top + .01))
    for th0, th1 in ((140, 220), (320, 400)):  # the cummerbund
        wrap(k, C["main"], a, b, .002, .014, th0, th1, 6, lambda x: -.39, lambda x: -.225)
        molle(k, C["slot"], a, b, .014, th0 + 8, th1 - 8, (-.25, -.275, -.30, -.325, -.35))
    molle(k, C["slot"], a, b, t, theta_at(a, hw - .01, False), theta_at(a, -hw + .01, False), [-.12 - .025 * i for i in range(10)])
    molle(k, C["slot"], a, b, t, theta_at(a, -hw + .01), theta_at(a, hw - .01), (-.15, -.175, -.20))
    for sx in (-1, 1):
        strap(k, C["main"], sx * .092, .055, .018,
              [(-.13, -.07), (-.112, -.03), (-.065, -.006), (0, .002), (.065, -.006), (.112, -.03), (.132, -.06)])
    # A loop field for patches at the top of the front.
    with k.detail():
        wrap(k, C["web"], a, b, t - .001, t + .0025, theta_at(a, -.055), theta_at(a, .055), 4, lambda x: -.125, lambda x: -.075)

    def front_y(x):
        return -((b + t) * math.sqrt(max(0, 1 - (x / (a + t)) ** 2)))
    # The triple pouch: three 5.56 magazines side by side (66 mm each, 26 deep), baseplates up.
    pw, gap = .081, .003
    p_bot, p_top = z_bot + .01, z_bot + .01 + .165
    for i in (-1, 0, 1):
        x0, x1 = i * (pw + gap) - pw / 2, i * (pw + gap) + pw / 2
        y = front_y((x0 + x1) / 2) + .004
        k.box(C["main"], x0, y - .04, p_bot, x1, y, p_top)
        with k.detail():
            k.box(C["slot"], x0 + .006, y - .041, p_top - .045, x1 - .006, y - .039, p_top - .041)
        k.box("plastic_black", x0 + .008, y - .034, p_top, x1 - .008, y - .006, p_top + .03)  # baseplate
        with k.detail():
            k.box("rubber", (x0 + x1) / 2 - .004, y - .042, p_top - .02, (x0 + x1) / 2 + .004, y - .03, p_top + .036)  # bungee pull
    k.box("plastic_black", -.04, b + t - .004, -.075, .04, b + t + .018, -.06)
    k.box("plastic_black", -.04, b + t + .012, -.075, -.028, b + t + .018, -.035)
    k.box("plastic_black", .028, b + t + .012, -.075, .04, b + t + .018, -.035)
    k.box("plastic_black", -.04, b + t + .012, -.045, .04, b + t + .018, -.035)
    return {}


variant("m110-sd", m110, "side", "m110", sd=True)  # not an item in the game yet: the M110's grid size
variant("soft-vest", soft_vest, "front", "soft-vest", C=GREY)
variant("soft-vest-coyote", soft_vest, "front", "soft-vest", C=COYOTE)
variant("tactical-vest", tactical_vest, "front", "tactical-vest", C=COYOTE)
variant("tactical-vest-grey", tactical_vest, "front", "tactical-vest", C=GREY)
variant("stf-vest", soft_vest, "front", "stf-vest", C=BLACK)
# The coated knife: the same knife, its blade bonded with tin porphyrin, a dull red-brown.
variant("coated-knife", knife, "side", "coated-knife", flat="rust", edge="copper")


@item(view="front")
def helmet(k):
    """High-cut maritime helmet after the Ops-Core FAST Maritime, urban tan: a squarish dome, longer behind than in
    front, flaring a little at the nape; the cut rising steeply at the temple and running high over the
    ear; ARC rails along the cut, a one-hole shroud, round vents, loop panels, a shock cord behind."""
    rx, ryf, ryb, rz, t = .118, .124, .136, .168, .008
    nh, nv = 2.25, 2.35
    NA, NL = (18, 5) if k.low else (36, 8)

    def S(phi, e, d=0.0):
        s, c = math.sin(phi), math.cos(phi)
        ry = ryf if c > 0 else ryb
        ce = abs(math.cos(e)) ** (2 / nv)
        flare = 1 + (.08 * -math.sin(e) * max(0, -c) if e < 0 else 0)
        return Vector(((rx - d) * spow(s, 2 / nh) * ce * flare, -(ry - d) * spow(c, 2 / nh) * ce * flare,
                       (rz - d) * spow(math.sin(e), 2 / nv)))

    rim_tab = [(0, .03), (28, .032), (46, .045), (60, .08), (74, .094), (100, .096), (116, .085),
               (134, .054), (152, .024), (168, .006), (180, .002)]

    def z_rim(phi):
        return smooth_tab(rim_tab, abs(math.degrees(math.atan2(math.sin(phi), math.cos(phi)))))

    def e_of(z):
        return math.asin(max(-1, min(1, spow(z / rz, nv / 2))))

    def normal(phi, e):
        p = S(phi, e)
        du = S(phi + 1e-3, e) - p
        dv = S(phi, e + 1e-3) - p
        n = du.cross(dv).normalized()
        return n if n.dot(p) > 0 else -n

    e_top = math.radians(84)
    bm = k.bm
    phis = [-math.pi + 2 * math.pi * i / NA for i in range(NA)]
    rings = {}
    for d in (0, t):
        rows = []
        for j in range(NL + 1):
            f = (j / NL) ** .85
            rows.append([bm.verts.new(S(phi, e_top - (e_top - e_of(z_rim(phi))) * f, d)) for phi in phis])
        rings[d] = rows
    outer, inner, rimf = [], [], []
    for d, out in ((0, outer), (t, inner)):
        R = rings[d]
        out.append(bm.faces.new(R[0]))
        for j in range(NL):
            for i in range(NA):
                i2 = (i + 1) % NA
                out.append(bm.faces.new((R[j][i], R[j][i2], R[j + 1][i2], R[j + 1][i])))
    for i in range(NA):
        i2 = (i + 1) % NA
        o, n = rings[0][NL], rings[t][NL]
        rimf.append(bm.faces.new((o[i], o[i2], n[i2], n[i])))
    k._paint(outer, "plastic_beige", smooth=True)
    k._paint(inner, "plastic_black", smooth=True)
    k._paint(rimf, "rubber")

    def patch(sw, ph0, ph1, ef, nph, nt, d0, d1):
        """A slab on the shell between azimuths ph0 and ph1 (degrees), elevation ef(phi, t) for t in 0..1."""
        if k.low:
            nph, nt = max(1, nph // 2), 1
        for i in range(nph):
            pa = math.radians(ph0 + (ph1 - ph0) * i / nph)
            pb = math.radians(ph0 + (ph1 - ph0) * (i + 1) / nph)
            for j in range(nt):
                ta, tb = j / nt, (j + 1) / nt
                q = [(pa, ef(pa, ta)), (pb, ef(pb, ta)), (pb, ef(pb, tb)), (pa, ef(pa, tb))]
                k.hull(sw, [S(p, e, d0) for p, e in q] + [S(p, e, d1) for p, e in q])

    # ARC rails following the cut, from the temple to behind the ear.
    for s in (-1, 1):
        a0, a1 = sorted((s * 50, s * 138))
        patch("plastic_black", a0, a1, lambda p, tt: e_of(z_rim(p) + .005 + .02 * tt), 10, 1, .002, -.008)
        with k.detail():
            for u in (70, 96, 122):  # the rail's slots
                ph = math.radians(s * u)
                c = S(ph, e_of(z_rim(ph) + .015), -.0085)
                n = normal(ph, e_of(z_rim(ph) + .015))
                k.cyl("black_paint", c - n * .001, c + n * .0008, .0045, segs=6)
    # The shroud, its hole; loop panels on the crown and the back; vents; the shock cord.
    patch("black_paint", -16, 16, lambda p, tt: e_of(.05 + .04 * tt), 2, 1, .002, -.006)
    patch("glass_dark", -6, 6, lambda p, tt: e_of(.06 + .02 * tt), 1, 1, -.005, -.0065)
    patch("upholstery_tan", -38, 38, lambda p, tt: e_of(.143) + (math.radians(80) - e_of(.143)) * tt, 8, 2, .001, -.0018)
    patch("upholstery_tan", 152, 208, lambda p, tt: e_of(.075 + .055 * tt), 6, 2, .001, -.0018)
    with k.detail():
        for ph, z in [(s * a, z) for s in (-1, 1) for a, z in ((48, .128), (68, .136), (90, .14), (112, .136), (134, .118), (62, .158), (118, .156))]:
            p, e = math.radians(ph), e_of(z)
            c, n = S(p, e, -.0005), normal(p, e)
            k.cyl("glass_dark", c - n * .002, c + n * .0005, .0075, segs=8)
        for z in (.03, .052):
            pts = [S(math.radians(a), e_of(z), -.005) for a in range(130, 235, 15)]
            for p0, p1 in zip(pts, pts[1:]):
                k.cyl("rubber", p0, p1, .0022, segs=4, smooth=False)
    return {}


# ----- The game's weapons: a handful of boxes each, the silhouette only. Same design space and
# sizes as the detailed builders above; their markers (grip, muzzle, support) are kept. Triggers,
# guards, rails, sights and small parts are left out; a part that sits inside another's outline
# merges into it.
GAME = {}  # ItemId -> builder for the low build


def game(*names, **kw):
    def deco(fn):
        for n in names:
            GAME[n] = (lambda k, fn=fn, n=n: fn(k, **{a: v(n) if callable(v) else v for a, v in kw.items()}))
        return fn
    return deco


def low_mag(k, top, depth, w, length, bend, tilt, sw="plastic_black"):
    """A magazine as one tapered box: the top level, the bottom square to its curve."""
    k.curved_mag(sw, top, depth, w, length, bend, tilt, n=1, base=None)


@game("knife")
def knife_game(k):
    k.bar("leather", 0, 113, -14, 14, 24)
    k.bar("iron", 113, 119, -21, 22, 9)
    k.side("steel", 4, [(119, 12), (240, 12), (302, -1), (268, -16.5), (119, -22)])


@game("pistol", "pistol-sd", sd=lambda n: n.endswith("-sd"))
def glock_game(k, sd):
    k.side("iron", 26, [(0, 88), (176, 88), (176, 121), (170, 128), (2, 128)])
    k.grip("plastic_black", 22, 83, 93, 0, w=30, rake=22, rake_rear=18)
    if sd:
        k.tube("black_paint", 177, 381, 112, 19, segs=6)


@game("smg")
def mpx_game(k):
    k.side("rubber", 40, [(0, 52), (20, 52), (20, 154), (0, 152)])
    k.tube("black_paint", 20, 132, 112, 10, segs=5)
    k.bar("black_paint", 130, 330, 85, 168, 30)
    k.bar("black_paint", 330, 470, 108, 168, 40)
    k.tube("black_paint", 470, 540, 137, 10, segs=5)
    k.grip("plastic_black", 168, 212, 86, 0, w=30, rake=24)
    low_mag(k, (276, 112), 46, 28, 150, 7, 2)


@game("rifle", "rifle-sd", sd=lambda n: n.endswith("-sd"))
def hk416_game(k, sd):
    bz, top = 185, 236  # the bore; the top of the rail, on the receiver and the handguard alike
    k.side("plastic_black", 42, [(0, 62), (0, 207), (202, 204), (202, 150)])
    k.tube("black_paint", 200, 272, 188, 15, segs=5)
    k.bar("black_paint", 270, 490, 130, top, 31)
    k.bar("black_paint", 490, 778, 150, top, 58)
    k.side("black_paint", 52, [(372, top), (468, top), (468, top + 30), (440, top + 64), (372, top + 64)])
    k.tube("black_paint", 778, 1008 if sd else 872, bz, 22 if sd else 10.5, segs=6 if sd else 5)
    if sd:
        k.tube("iron", 778, 820, bz, 10, segs=5)
    k.grip("plastic_black", 336, 386, 130, 30, w=30, rake=23)
    low_mag(k, (484, 130), 72, 26, 205, 20, 6)


@game("shotgun")
def mossberg_game(k):
    bz = 160
    k.side("olive", 40, [(70, 64), (70, 186), (248, 184), (248, 140)])
    k.tube("black_paint", 240, 322, 162, 15, segs=5)
    k.bar("iron", 308, 520, 106, 186, 32)
    k.grip("olive", 314, 362, 108, 10, w=32, rake=21)
    k.tube("iron", 520, 1003, bz, 11, segs=5)
    k.tube("iron", 520, 972, bz - 37, 13, segs=5)
    k.bar("olive", 560, 770, bz - 62, bz - 10, 50)


@game("shotgun-semi")
def benelli_game(k):
    bz = 158
    k.side("plastic_black", 42, [(0, 26), (0, 164), (200, 170), (200, 104)])
    k.tube("black_paint", 195, 302, 142, 14, segs=5)
    k.bar("black_paint", 300, 520, 112, 184, 32)
    k.grip("plastic_black", 300, 350, 112, 18, w=32, rake=20)
    k.tube("iron", 520, 1010, bz, 11, segs=5)
    k.tube("iron", 520, 972, bz - 37, 13, segs=5)
    k.bar("plastic_black", 520, 760, bz - 62, bz - 10, 50)


@game("m249")
def m249_game(k):
    bz = 200
    k.side("plastic_black", 46, [(0, 70), (0, 218), (240, 222), (240, 150)])
    k.bar("black_paint", 240, 565, 148, 262, 62)
    k.bar("olive", 360, 548, 40, 148, 86, x=38)
    k.grip("plastic_black", 300, 350, 150, 52, w=32, rake=18)
    k.tube("iron", 565, 1040, bz, 13, segs=5)
    k.bar("plastic_black", 565, 892, 136, 196, 52)
    k.side("plastic_black", 14, [(608, bz + 12), (720, bz + 12), (720, bz + 68), (608, bz + 68)])


@game("m240b")
def m240b_game(k):
    bz = 210
    k.side("plastic_black", 50, [(0, 60), (0, 246), (286, 238), (286, 150), (120, 103)])
    k.bar("black_paint", 285, 705, 150, 266, 64)
    k.bar("brass", 462, 540, 150, 236, 34, x=78)  # the belt
    k.grip("plastic_black", 334, 386, 150, 48, w=32, rake=18)
    k.tube("iron", 705, 1245, bz, 14, segs=5)
    k.bar("plastic_black", 705, 1124, 140, 202, 52)
    k.side("plastic_black", 14, [(752, bz + 14), (900, bz + 14), (900, bz + 82), (752, bz + 82)], x=18)


@game("m110", "m110-sd", sd=lambda n: n.endswith("-sd"))
def m110_game(k, sd):
    bz, top = 190, 224
    k.side("upholstery_tan", 42, [(0, 68), (0, 204), (82, 228), (210, 228), (262, 204), (262, 155)])
    k.bar("black_paint", 244, 506, 140, top, 31)
    k.bar("black_paint", 482, 820, 156, top, 56)
    k.bar("black_paint", 353, 512, top, 250, 30)  # the scope's rings, as one mount
    k.tube("black_paint", 272, 612, 263, 22, segs=6)
    k.tube("iron", 820, 1029, bz, 12, segs=5)
    if sd:
        k.tube("black_paint", 986, 1181, bz, 22, segs=6)
    k.grip("plastic_black", 306, 356, 140, 42, w=30, rake=23)
    low_mag(k, (455, 140), 98, 31, 160, 6, 3)


@game("rpg")
def carl_gustav_game(k):
    az = 200
    k.tube("iron", 0, 120, az, 68, 58, segs=8)
    k.tube("black_paint", 120, 1000, az, 54, segs=8)
    k.hexa("rubber", [(-34, 370, 150), (34, 370, 150), (34, 520, 150), (-34, 520, 150),
                      (-26, 385, 112), (26, 385, 112), (26, 505, 112), (-26, 505, 112)])
    k.grip("plastic_black", 560, 612, az - 50, 44, w=32, rake=14)
    k.side("plastic_black", 34, [(770, az - 50), (812, az - 50), (818, 52), (778, 48)])
    k.bar("black_paint", 588, 702, az + 10, az + 82, 40, x=78)  # the sight on its arm
    k.side("plastic_black", 18, [(560, az + 50), (760, az + 50), (760, az + 108), (560, az + 108)])


@game("box-m249", "belt-m240b", sw=lambda n: "olive" if n == "box-m249" else "black_paint")
def ammo_game(k, sw):
    """The ammunition box with its belt end, the M249's green and the M240B's black."""
    k.bar(sw, -77, 77, 0, 108, 80)
    k.bar("brass", -18, 40, 108, 116, 58, x=11)
    k.bar("brass", -18, 40, 76, 116, 8, x=44)


GRENADES = {  # the game's grenades: body, height, radius, a glowing band (from, to) or none
    "incendiary": ("enamel_grey", 118, 32, None),
    "frag": ("olive", 66, 32, None),
    "smoke": ("foliage_light", 118, 32, None),
    "uv-flare": ("plastic_black", 118, 25, (65, 93)),
}


@game(*GRENADES, g=lambda n: GRENADES[n])
def grenade_game(k, g):
    """A grenade: a six-sided can and the spoon bent over its top and down its side; the UV flare's
    lamp glows through a band."""
    sw, h, r, glow = g
    if glow:
        k.vcyl(sw, 0, glow[0], r, segs=6)
        k.vcyl("neon_pink", glow[0], glow[1], r - 1, segs=6)
        k.vcyl(sw, glow[1], h, r, segs=6)
    else:
        k.vcyl(sw, 0, h, r, segs=6)
    k.bar("galvanised", -6, r + 4, h, h + 22, 16)
    k.bar("galvanised", r - 2, r + 4, h * .5, h + 22, 14)


@game("medkit")
def medkit_game(k):
    """The IFAK: the pouch, the tourniquet on top, its red tip."""
    k.bar("upholstery_tan", -42, 42, 0, 120, 190)
    k.bar("rubber", -20, 20, 120, 150, 116)
    k.bar("fabric_red", -9, 9, 124, 146, 18, x=-66)


# Shared game models: one model for several items (equipment.ts, `model`).
SHARED = {"mag": ("mag-pistol", "mag-smg", "mag-rifle", "mag-m110")}


def mag_game(k):
    """Every loose magazine on the ground: one black box, a rifle magazine's size."""
    k.bar("plastic_black", -33, 33, 0, 170, 26)


# ----- Carried items, standing as on a table: millimetres in the guns' space (front toward +u).
def loose_mag(k, kind, cart):
    d, w, ln, bend, tilt, base = MAGS[kind]
    mag(k, kind, (0, 0))
    k.bar("plastic_black", -d * .35, d * .35, -1, 4, 3, x=w / 2 - 2.5)  # feed lips
    k.bar("plastic_black", -d * .35, d * .35, -1, 4, 3, x=-w / 2 + 2.5)
    cl, cr, *_ = CART[cart]
    k.cartridge(cart, -d / 2 + 3, cr + .5)
    return {}


@item(view="upright")
def mag_pistol(k):
    """Glock 19 magazine, 15 rounds of 9 mm: 113 mm, a 9 mm round in the lips."""
    return loose_mag(k, "glock", "9mm")


@item(view="upright")
def mag_smg(k):
    """Sig Sauer MPX magazine, 20 rounds of 9 mm, a slight curve."""
    return loose_mag(k, "mpx", "9mm")


@item(view="upright")
def mag_rifle(k):
    """5.56 mm polymer magazine, 30 rounds, curved."""
    return loose_mag(k, "stanag", "556")


@item(view="upright")
def mag_m110(k):
    """7.62 mm magazine for the M110, 20 rounds: deep and short."""
    return loose_mag(k, "sr25", "762")


@item(view="three-quarter")
def shells(k, box="fabric_red", head="brass"):
    """A carton of 25 12-gauge shells, opened: 108 x 108 x 65 mm, the brass heads up, the lid folded back."""
    k.hexa(box, [(-54, -54, 0), (54, -54, 0), (54, 54, 0), (-54, 54, 0),
                          (-54, -54, 65), (54, -54, 65), (54, 54, 65), (-54, 54, 65)])
    k.bar("paint_white", 30, 54.6, 18, 48, 70)  # the label, on the front
    if k.low:  # the 25 heads as one brass top
        k.bar(head, -52, 52, 63, 71, 104)
    for i in range(0 if k.low else 5):
        for j in range(5):
            x, u = -42 + i * 21, -42 + j * 21
            k.vcyl(head, 63, 72, 10.3, segs=10, x=x, u=u)
            with k.detail():
                k.vcyl("iron", 72, 72.6, 2.6, segs=6, x=x, u=u)
    k.hexa(box, [(-54, -54, 65), (54, -54, 65), (54, -52, 65), (-54, -52, 65),
                          (-54, -100, 150), (54, -100, 150), (54, -98, 151), (-54, -98, 151)])
    return {}


@item(view="three-quarter")
def box_m249(k):
    """The M249's plastic ammunition box with a belt end out of its feed gate: 80 x 154 x 108 mm."""
    x1, u1, z1 = saw_box(k, -40, -77, 0)
    # The belt end: out of the feed gate, linked rounds across the lid and over its left edge.
    k.bar("plastic_black", -50, 50, z1, z1 + 12, 12, x=-26)
    for i, (x, z) in enumerate(((-12, z1 + 6), (0.7, z1 + 6), (13.4, z1 + 6), (26.1, z1 + 6), (38, z1 - 2), (44, z1 - 14))):
        k.cartridge("556", 28, z, x=x, link=True, forward=-1)
    return {}


@item(view="three-quarter")
def belt_m240b(k):
    """28 linked rounds of 7.62 for the M240B, laid in two rows folded back on themselves."""
    pitch = 12.7
    for row in range(2):
        for i in range(14):
            y = (i - 6.5) * pitch
            k.cartridge("762", row * 76 - 76, 6.2, x=y, link=True)  # bullets toward +u
    for i in (0, 1):  # the fold: two links bridging the rows
        k.bar("iron", -10 + i * 10, 2 + i * 10, 0, 12, 5, x=(7.5 + i) * pitch)
    return {}


@item(view="upright")
def rocket(k):
    """An 84 mm high-explosive round for the Carl Gustav, standing on its cartridge case: about 540 mm."""
    k.vcyl("aluminium", 0, 8, 45, segs=20)
    k.vcyl("aluminium", 8, 190, 42, segs=20)
    k.vcyl("iron", 186, 194, 43, segs=20)
    k.vcyl("olive", 190, 380, 42, segs=20)
    k.vcyl("copper", 200, 214, 43.6, segs=20)
    k.vcyl("safety_yellow", 330, 345, 42.4, segs=20)
    k.vcyl("olive", 380, 450, 42, 30, segs=20)
    k.vcyl("olive", 450, 510, 30, 14, segs=20)
    k.vcyl("galvanised", 510, 535, 14, 6, segs=12)
    k.vcyl("galvanised", 535, 541, 6, 2, segs=8)
    return {}


def fuze(k, z, spoon_sw="olive", spoon_to=60, reach=34.5):
    """A grenade fuze on top at z: the body, the striker housing, the spoon down the front (to
    spoon_to, `reach` out from the axis), the pin and its ring to the left."""
    k.vcyl("galvanised", z, z + 22, 9.5, segs=10)
    k.bar("galvanised", -8, 8, z + 4, z + 18, 26)
    for a, b in (((0, 10, z + 25), (0, 28, z + 22)), ((0, 28, z + 22), (0, reach, z + 2)), ((0, reach, z + 2), (0, reach - .5, spoon_to))):
        k.hexa(spoon_sw, [(-7, a[1], a[2]), (7, a[1], a[2]), (7, a[1] + 2, a[2]), (-7, a[1] + 2, a[2]),
                          (-7, b[1], b[2]), (7, b[1], b[2]), (7, b[1] + 2, b[2]), (-7, b[1] + 2, b[2])])
    k.rod("galvanised", (8, 0, z + 12), (22, 0, z + 12), 1.2, segs=4)
    k.ring("galvanised", ItemKit.P(33, 0, z + 12), (0, 1, 0), .0125, .0102, .002, segs=10)


def can_grenade(k, body, band):
    """The US can grenades (AN-M14, AN-M8): a 64 mm can 118 mm high, a band, the M201 fuze."""
    k.vcyl(body, 0, 3, 32.5, segs=18)
    k.vcyl(body, 3, 115, 31.75, segs=18)
    k.vcyl(body, 115, 118, 30, segs=18)
    k.vcyl(band, 74, 84, 32.2, segs=18)
    fuze(k, 118)


@item(view="three-quarter")
def incendiary(k):
    """AN-M14 TH3 incendiary grenade: a grey can 146 mm high with a red band, its fuze, spoon and ring."""
    can_grenade(k, "enamel_grey", "signal_red")
    return {}


def extra_grenade(name):
    """A grenade the game doesn't have yet: its icon takes the incendiary's grid size."""
    def deco(fn):
        ITEMS.append((name, fn, "three-quarter", "incendiary"))
        return fn
    return deco


def bolt(k, head="signal_red", tip="steel"):
    """A crossbow bolt standing on its nock: a 330 mm aluminium shaft, three vanes, the head on top."""
    k.vcyl("plastic_black", 0, 8, 4.6, segs=10)  # the nock
    k.vcyl("aluminium", 8, 290, 4.2, segs=10)
    for a in (90, 210, 330):
        x, u = math.cos(math.radians(a)), math.sin(math.radians(a))
        k.hexa("plastic_grey", [(x * 4, u * 4, 12), (x * 4.6, u * 4.6, 12), (x * 4.6, u * 4.6, 66), (x * 4, u * 4, 66),
                                (x * 16, u * 16, 18), (x * 16.6, u * 16.6, 18), (x * 16.6, u * 16.6, 50), (x * 16, u * 16, 50)])
    k.vcyl(head, 290, 306, 5.4, 4.2, segs=10)
    k.vcyl(tip, 306, 330, 5.4, .5, segs=10)
    return {}


@item(view="upright")
def bolt_haemolytic(k):
    """The haemolytic bolt: a red head holding the gelling agent, a steel point."""
    return bolt(k)


variant("bolt-coated", bolt, "upright", "bolt-coated", head="rust", tip="copper")
# Silencer bolts (one model for every house's): a blue head; the Montségur silencer's is gold, chrome-tipped.
variant("bolt-silencer", bolt, "upright", "bolt-coated", head="municipal_blue", tip="steel")
variant("montsegur-silencer", bolt, "upright", "bolt-coated", head="brass", tip="chrome")
# Magnesium shells: the carton in grey, the heads bright.
variant("magnesium-shells", shells, "three-quarter", "magnesium-shells", box="enamel_grey", head="chrome")
# The Lantern suit: the plate carrier in black (the UV panels sit under the plates).
variant("lantern-suit", tactical_vest, "front", "lantern-suit", C=BLACK)


def head_mount(k, sw="black_paint"):
    """A skeleton head mount, worn: a band round the head at the brow, one over the crown, a shroud and
    arm at the forehead (origin the centre of the head, the face toward -Y)."""
    for i in range(0 if k.low else 16):
        a0, a1 = math.radians(i * 22.5), math.radians((i + 1) * 22.5)
        k.rod(sw, (95 * math.sin(a0), 110 * math.cos(a0), 20), (95 * math.sin(a1), 110 * math.cos(a1), 20), 6, segs=4)
    if k.low:
        k.vcyl(sw, 14, 26, 100, segs=12)
    for i in range(8):
        a0, a1 = math.radians(-90 + i * 22.5), math.radians(-90 + (i + 1) * 22.5)
        k.rod(sw, (95 * math.sin(a0), 0, 20 + 130 * math.cos(a0)), (95 * math.sin(a1), 0, 20 + 130 * math.cos(a1)), 6, segs=4)
    k.hexa(sw, [(-22, 100, 20), (22, 100, 20), (22, 112, 20), (-22, 112, 20),
                (-22, 100, 60), (22, 100, 60), (22, 112, 60), (-22, 112, 60)])
    k.hexa(sw, [(-10, 110, 20), (10, 110, 20), (10, 130, 20), (-10, 130, 20),
                (-10, 128, -10), (10, 128, -10), (10, 148, -10), (-10, 148, -10)])


@item(view="front")
def night_optics(k):
    """Night optics: the head mount and a binocular intensifier (after the PVS-31) at the eyes, its two
    tubes reaching forward with green-tinted lenses."""
    head_mount(k)
    k.bar("plastic_black", 130, 160, -40, -10, 90)
    for x in (-32, 32):
        k.rod("plastic_black", (x, 140, -28), (x, 220, -28), 18, segs=12)
        k.rod("glass_dark", (x, 220, -28), (x, 223, -28), 15, segs=12)
        with k.detail():
            k.rod("led_green", (x, 223, -28), (x, 224, -28), 8, segs=10)
    return {}


@item(view="front")
def thermal_sight(k):
    """Thermal sight: the head mount and a thermal monocular before the right eye, a boxy body with a
    wide germanium lens."""
    head_mount(k, "olive")
    k.hexa("olive", [(-50, 130, -55), (10, 130, -55), (10, 220, -55), (-50, 220, -55),
                     (-50, 130, 0), (10, 130, 0), (10, 220, 0), (-50, 220, 0)])
    k.rod("black_paint", (-20, 220, -28), (-20, 240, -28), 26, segs=14)
    k.rod("glass_dark", (-20, 240, -28), (-20, 243, -28), 22, segs=14)
    return {}


@item(view="upright")
def motion_tracker(k):
    """A handheld through-wall radar: a black unit 90 x 44 x 210 mm standing up, its screen showing a
    green sweep on the side the icon sees, the antenna panel on top."""
    k.hexa("plastic_black", [(-22, -45, 0), (22, -45, 0), (22, 45, 0), (-22, 45, 0),
                             (-22, -45, 170), (22, -45, 170), (22, 45, 170), (-22, 45, 170)])
    k.hexa("plastic_grey", [(-24, -50, 170), (24, -50, 170), (24, 50, 170), (-24, 50, 170),
                            (-24, -50, 210), (24, -50, 210), (24, 50, 210), (-24, 50, 210)])
    k.bar("glass_dark", -36, 36, 90, 160, 2, x=22.5)
    with k.detail():
        k.bar("led_green", -20, 20, 118, 122, 1, x=23.6)
        k.bar("led_green", -4, 4, 100, 150, 1, x=23.6)
    for z in (30, 50):
        k.bar("rubber", -30, -10, z, z + 12, 3, x=22.5)
    return {}


@item(view="three-quarter")
def isr_drone(k):
    """A small ISR quadcopter: a black body 120 mm across, four arms to rotors 300 mm apart, the thermal
    gimbal under the nose, standing on its skids."""
    k.vcyl("plastic_black", 40, 76, 50, segs=12)
    k.hexa("plastic_black", [(-30, -70, 40), (30, -70, 40), (30, 70, 40), (-30, 70, 40),
                             (-30, -70, 76), (30, -70, 76), (30, 70, 76), (-30, 70, 76)])
    for sx in (-1, 1):
        for su in (-1, 1):
            k.rod("plastic_black", (0, 0, 66), (sx * 150, su * 150, 76), 7, segs=6)
            k.vcyl("iron", 70, 90, 12, segs=10, x=sx * 150, u=su * 150)
            k.vcyl("glass_light", 92, 94, 95, segs=18, x=sx * 150, u=su * 150)
        k.rod("plastic_grey", (sx * 50, -60, 40), (sx * 70, -60, 0), 3, segs=4)
        k.rod("plastic_grey", (sx * 50, 60, 40), (sx * 70, 60, 0), 3, segs=4)
        k.rod("plastic_grey", (sx * 70, -70, 0), (sx * 70, 70, 0), 3, segs=4)
    k.vcyl("black_paint", 24, 40, 18, segs=10, u=60)
    k.rod("glass_dark", (0, 70, 30), (0, 80, 30), 10, segs=10)
    return {}


@item(view="upright")
def haem_serum(k):
    """An autoinjector (after the EpiPen): a 16 mm grey pen 150 mm long standing cap down, a dark window
    showing the red dose, a red safety cap on top."""
    k.vcyl("signal_red", 0, 16, 7.5, 6.5, segs=12)
    k.vcyl("plastic_grey", 16, 120, 8, segs=12)
    k.vcyl("glass_dark", 70, 100, 8.3, segs=12)
    with k.detail():
        k.vcyl("fabric_red", 74, 96, 8.5, segs=12)
    k.vcyl("plastic_grey", 120, 140, 8, 7, segs=12)
    k.vcyl("signal_red", 140, 152, 7, 6, segs=12)
    return {}


@item(view="three-quarter")
def sparkle(k):
    """The Sparkle: a xenon flash tube in a clear quartz body 50 mm across, the capacitor in the black base,
    the fuze on top."""
    k.vcyl("plastic_black", 0, 46, 25, segs=16)
    with k.detail():
        k.vcyl("safety_yellow", 36, 40, 25.3, segs=16)
    k.vcyl("glass_light", 46, 100, 23, segs=16)
    k.vcyl("lamp_cool", 50, 96, 8, segs=10)
    for a in range(0, 360, 90):
        x, u = 23 * math.cos(math.radians(a + 45)), 23 * math.sin(math.radians(a + 45))
        k.rod("plastic_black", (x, u, 46), (x, u, 100), 2.4, segs=4, smooth=False)
    k.vcyl("plastic_black", 100, 110, 25, segs=16)
    fuze(k, 110, spoon_sw="black_paint", reach=29)
    return {}


def lumen(k, lens):
    """A lumen lamp: a 70 mm finned head on a 40 mm body, a pistol grip and a fore-grip, 450 mm long;
    the lens glows in its band."""
    bz = 120
    k.side("plastic_black", 36, [(0, 96), (40, 96), (40, 150), (0, 146)])  # the battery cap
    k.tube("black_paint", 40, 300, bz, 22, segs=14)
    k.tube("black_paint", 300, 340, bz, 22, 36, segs=16)
    k.tube("black_paint", 340, 440, bz, 36, segs=16)
    with k.detail():
        for u in range(350, 430, 14):
            k.tube("iron", u, u + 6, bz, 38, segs=16)
    k.tube("iron", 440, 450, bz, 37, segs=16)
    k.tube(lens, 448, 451, bz, 31, segs=16)
    k.bar("black_paint", 120, 280, bz + 18, bz + 34, 18)  # the top rail
    cu, cz = k.grip("plastic_black", 90, 136, bz - 18, bz - 118, w=30, rake=18)
    k.guard("black_paint", 130, 184, bz - 44, bz - 18, w=10, t=6, trig=150)
    k.side("plastic_black", 30, [(230, bz - 20), (272, bz - 20), (268, bz - 100), (236, bz - 100)])
    return dict(grip=(0, cu, cz), muzzle=(0, 451, bz), support=(0, 252, bz - 60))


variant("lumen-365", lumen, "side", "lumen-365", lens="neon_pink")
variant("lumen-405", lumen, "side", "lumen-405", lens="screen")


@item(view="upright")
def lamp_battery(k):
    """A lumen lamp's battery: a black pack 60 x 40 x 120 mm, a yellow band, the contacts on top."""
    k.hexa("plastic_black", [(-30, -20, 0), (30, -20, 0), (30, 20, 0), (-30, 20, 0),
                             (-30, -20, 120), (30, -20, 120), (30, 20, 120), (-30, 20, 120)])
    k.bar("safety_yellow", -21, -19, 70, 90, 61)
    k.vcyl("brass", 120, 126, 5, segs=8, x=-12)
    k.vcyl("brass", 120, 126, 5, segs=8, x=12)
    return {}


@item(view="upright")
def lance_capacitor(k):
    """The lance's capacitor bank: a grey box 70 x 50 x 140 mm, a red band, a heavy connector on top."""
    k.hexa("enamel_grey", [(-35, -25, 0), (35, -25, 0), (35, 25, 0), (-35, 25, 0),
                           (-35, -25, 140), (35, -25, 140), (35, 25, 140), (-35, 25, 140)])
    k.bar("signal_red", -26, -24, 96, 116, 71)
    k.vcyl("black_paint", 140, 156, 14, segs=12)
    k.vcyl("brass", 156, 160, 9, segs=10)
    return {}


@item()
def excimer_lance(k):
    """The excimer lance: a boxy laser housing 1,080 mm long with cooling fins, a carry handle, a stock, a
    pistol grip and the capacitor under the front; the output optic at the muzzle."""
    bz = 190
    k.side("rubber", 46, [(0, 80), (14, 78), (14, 210), (0, 208)])
    k.side("plastic_black", 44, [(14, 80), (160, 140), (160, 210), (14, 212)])
    k.side("enamel_grey", 70, [(160, 130), (900, 130), (900, 250), (160, 250)])  # the housing
    with k.detail():
        for u in range(560, 880, 24):  # cooling fins
            k.bar("iron", u, u + 8, 250, 272, 66)
        k.bar("signal_red", 170, 230, 220, 240, 71)  # the warning panel
    k.side("black_paint", 20, [(300, 250), (320, 250), (330, 300), (520, 300), (530, 250), (550, 250), (540, 318), (310, 318)])
    k.tube("black_paint", 900, 1040, bz, 30, segs=16)
    k.tube("black_paint", 1040, 1080, bz, 30, 36, segs=16)
    k.tube("screen", 1078, 1081, bz, 26, segs=16)
    cu, cz = k.grip("plastic_black", 240, 290, 130, 30, w=32, rake=20)
    k.guard("black_paint", 284, 346, 104, 130, w=11, t=6, trig=306)
    k.side("enamel_grey", 50, [(620, 130), (760, 130), (760, 60), (620, 60)])  # the capacitor
    k.side("plastic_black", 34, [(800, 130), (860, 130), (850, 50), (812, 50)])  # the fore-grip
    return dict(grip=(0, cu, cz), muzzle=(0, 1081, bz), support=(0, 830, 90))


@item(view="three-quarter")
def flashbang(k):
    """M84-style stun grenade: a 44 mm steel tube 130 mm high, rows of ports, the fuze on top."""
    k.vcyl("galvanised", 0, 4, 22.5, segs=16)
    k.vcyl("enamel_grey", 4, 104, 22, segs=16)
    k.vcyl("galvanised", 104, 108, 22.5, segs=16)
    with k.detail():
        for z in (22, 44, 66, 88):
            for a in range(0, 360, 45):
                x, u = 22.2 * math.cos(math.radians(a)), 22.2 * math.sin(math.radians(a))
                k.vcyl("black_paint", z, z + 8, 3.4, segs=6, x=x, u=u)
    k.vcyl("safety_yellow", 96, 100, 22.3, segs=16)
    fuze(k, 108, reach=26)
    return {}


@item(view="three-quarter")
def strobe(k):
    """The strobe: a black polymer canister 50 mm across, the lamp under a clear dome on top, a cool
    band of windows round it; the fuze at the side so the dome looks every way."""
    k.vcyl("plastic_black", 0, 4, 26, segs=16)
    k.vcyl("plastic_black", 4, 70, 25, segs=16)
    with k.detail():
        for z in (12, 24, 36):
            k.vcyl("rubber", z, z + 6, 25.8, segs=16)
    k.vcyl("lamp_cool", 70, 90, 23, segs=16)
    for a in range(0, 360, 60):
        x, u = 25 * math.cos(math.radians(a)), 25 * math.sin(math.radians(a))
        k.rod("plastic_black", (x, u, 68), (x, u, 92), 2.6, segs=4, smooth=False)
    k.vcyl("plastic_black", 90, 96, 25, segs=16)
    k.pillow("glass_light", (0, 0, 96), (21, 21, 16), n=2.0, nu=16, nv=8)
    k.bar("plastic_black", -8, 8, 30, 60, 10, x=29)  # the switch
    return {}


@extra_grenade("frag")
def frag(k):
    """M67 fragmentation grenade: a 64 mm olive steel ball, a yellow band, the M213 fuze: 90 mm high."""
    k.pillow("olive", (0, 0, 33), (32, 32, 33), n=2.0, nu=18, nv=10)
    k.vcyl("safety_yellow", 44, 48, 30.6, segs=18)
    k.vcyl("olive", 60, 66, 12, segs=12)  # the neck
    fuze(k, 64, spoon_to=36, reach=24)
    return {}


@extra_grenade("smoke")
def smoke(k):
    """AN-M8 HC smoke grenade: the can in light green with a black band, emission holes on top."""
    can_grenade(k, "foliage_light", "black_paint")
    with k.detail():
        for a in range(0, 360, 90):
            x, u = 21 * math.cos(math.radians(a + 45)), 21 * math.sin(math.radians(a + 45))
            k.vcyl("glass_dark", 117.6, 118.3, 4, segs=8, x=x, u=u)
    return {}


@extra_grenade("uv-flare")
def uv_flare(k):
    """UV flare: a black polymer canister 50 mm across, 120 high, its UV lamp glowing through a band
    of windows and the top lens; a grip of rubber rings; the fuze and spoon as on the others."""
    k.vcyl("plastic_black", 0, 4, 26, segs=16)
    k.vcyl("plastic_black", 4, 66, 25, segs=16)
    k.vcyl("plastic_black", 92, 112, 25, segs=16)
    with k.detail():
        for z in (14, 26, 38):
            k.vcyl("rubber", z, z + 6, 25.8, segs=16)
    k.vcyl("neon_pink", 65, 93, 23, segs=16)
    for a in range(0, 360, 60):  # the cage bars across the windows
        x, u = 25 * math.cos(math.radians(a)), 25 * math.sin(math.radians(a))
        k.rod("plastic_black", (x, u, 64), (x, u, 94), 2.6, segs=4, smooth=False)
    k.vcyl("plastic_black", 112, 118, 22, segs=16)
    fuze(k, 118, spoon_sw="black_paint", reach=29)
    return {}


@item(view="three-quarter")
def medkit(k, main="upholstery_tan", panel="cardboard"):
    """Individual first-aid kit: a rip-away nylon pouch, coyote, 190 x 85 x 120 mm, stuffed full (soft
    edges, bulging faces), a clamshell zip with red pulls; a CAT tourniquet stowed on top. The
    advanced trauma kit is the same pouch in red with a grey panel."""
    n = 4.5
    k.pillow(main, (0, 0, 60), (95, 40, 60), n=n, bulge=.14)
    k.pillow(panel, (0, 43, 58), (58, 5, 32), n=6, nu=20, nv=6)  # the loop panel on the front
    # The clamshell zip round the top and sides, at mid-depth; its two red pulls at the top corners.
    with k.detail():
        zp = []
        for d in range(-30, 211, 12):
            th = math.radians(d)
            zp.append((96.5 * spow(math.cos(th), 2 / n), 0, 60 + 61.5 * spow(math.sin(th), 2 / n)))
        for p0, p1 in zip(zp, zp[1:]):
            k.rod("plastic_black", p0, p1, 2.4, segs=4, smooth=False)
        for sx in (-1, 1):
            k.bar("plastic_black", -4, 4, 117, 125, 10, x=sx * 62)
            k.ring("fabric_red", ItemKit.P(sx * 62, 0, 132), (1, 0, 0), .009, .0055, .004, segs=8)
    # The tourniquet (CAT): the folded black band, the windlass rod across it like a T-handle with
    # ridged ends, the C-shaped windlass clip at one end, a narrow white time strap, the red tip.
    k.pillow("rubber", (0, 0, 134), (58, 20, 15), n=4, nu=16, nv=6)
    k.rod("plastic_black", (6, -46, 156), (6, 46, 156), 6, segs=6, smooth=False)
    with k.detail():
        for u in (-46, -36, 36, 46):
            k.rod("plastic_black", (6, u - 2.5, 156), (6, u + 2.5, 156), 7.5, segs=6, smooth=False)
    k.bar("plastic_black", -8, 8, 147, 154, 16, x=6)  # the rod's seat on the band
    for u in (-22, 16):  # the clip: two horns and the bridge between them
        k.side("plastic_black", 10, [(u, 146), (u + 6, 146), (u + 6, 168), (u + 2, 170), (u, 166)], x=42)
    k.bar("plastic_black", -22, 22, 146, 152, 10, x=42)
    k.bar("paint_white", -21.5, 21.5, 118.5, 150, 15, x=-24)
    k.bar("fabric_red", -9, 9, 124, 146, 18, x=-66)
    k.bar(main, -23, 23, 117, 150, 10, x=-44)  # the holder's elastic
    return {}


variant("trauma-kit-adv", medkit, "three-quarter", "trauma-kit-adv", main="fabric_red", panel="fabric_grey")


def extra(name, view, size):
    """An item the game doesn't have yet: its icon takes the grid size (w, h) given here."""
    def deco(fn):
        ITEMS.append((name, fn, view, tuple(size)))
        return fn
    return deco


@extra("biopsy-kit", "three-quarter", (2, 1))
def biopsy_kit(k):
    """Field biopsy kit in a small hard case after the Peli 1150: 237 x 181 x 105 mm, grey, the lid
    seam a third of the way down, two black latches and a fold-down handle on the front, a pressure
    valve and a yellow biohazard label on the lid."""
    k.pillow("plastic_grey", (0, 0, 52.5), (118.5, 90.5, 52.5), n=10, nu=24, nv=8)
    k.pillow("plastic_black", (0, 0, 70), (119.5, 91.5, 2.5), n=10, nu=24, nv=4)  # the seam's gasket
    for sx in (-1, 1):  # the latches, over the seam
        k.bar("plastic_black", 89, 95, 48, 86, 34, x=sx * 62)
        with k.detail():
            k.bar("plastic_grey", 94, 96, 54, 62, 20, x=sx * 62)
    k.rod("plastic_black", (-34, 98, 60), (34, 98, 60), 5.5, segs=6)  # the handle, folded down
    for sx in (-1, 1):
        k.bar("plastic_black", 88, 98, 55, 66, 10, x=sx * 40)
    k.bar("safety_yellow", -42, 42, 104.6, 105.4, 120)  # the label
    with k.detail():
        k.bar("black_paint", -34, -26, 105.3, 105.7, 112)
        k.bar("black_paint", 26, 34, 105.3, 105.7, 112)
        k.vcyl("black_paint", 105.3, 105.8, 15, segs=12)
        k.vcyl("safety_yellow", 105.5, 106, 8, segs=12)
    k.vcyl("plastic_black", 105, 111, 11, segs=10, x=-88, u=-60)  # the valve
    return {}


@extra("tissue-sample", "upright", (1, 1))
def tissue_sample(k):
    """A tissue sample in its transport canister (UN 3373 secondary packaging): an aluminium tube
    44 mm across and 125 high, a ribbed white screw cap, a yellow band where the label goes."""
    k.vcyl("aluminium", 0, 3, 21, segs=16)
    k.vcyl("aluminium", 3, 96, 22, segs=16)
    k.vcyl("aluminium", 96, 100, 22, 19.5, segs=16)
    k.vcyl("safety_yellow", 30, 70, 22.4, segs=16)
    with k.detail():
        k.vcyl("black_paint", 42, 58, 22.6, segs=16)
        k.vcyl("safety_yellow", 44, 56, 22.8, segs=16)
    k.vcyl("paint_white", 100, 122, 23, segs=16)
    k.vcyl("paint_white", 122, 125, 23, 21, segs=16)
    with k.detail():  # the cap's grip ribs
        for a in range(0, 360, 20):
            x, u = 23 * math.cos(math.radians(a)), 23 * math.sin(math.radians(a))
            k.rod("enamel_white", (x, u, 102), (x, u, 120), 1.4, segs=4, smooth=False)
    return {}


@extra("phone", "top", (1, 1))
def phone(k):
    """A smartphone, face up: 147 x 72 x 8 mm in a black rubber case, the dark glass screen with a
    hole-punch camera, the camera block standing off the back."""
    k.pillow("rubber", (0, 0, 5), (37.5, 75, 5), n=8, nu=20, nv=6)
    k.bar("glass_dark", -70, 70, 9.4, 10.2, 66)
    with k.detail():
        k.vcyl("black_paint", 10.1, 10.4, 1.8, segs=8, u=-64)
        for u in (-30, 10):  # the buttons on the right side
            k.bar("rubber", u, u + 24, 4, 7, 2, x=-38.5)
    k.bar("plastic_black", -72, -40, 0, 2.5, 32, x=14)  # the camera block, under
    return {}


@extra("laptop", "three-quarter", (2, 2))
def laptop(k):
    """A 13-inch laptop, open at 110 degrees: an aluminium base 304 x 212 x 15 mm with a black
    keyboard and a grey trackpad, the lid 6 mm thick with its dark screen and bezel. The hinge is at
    the back (u = 0), the front edge toward the viewer."""
    W, D = 152, 212
    k.bar("aluminium", 0, D, 0, 15, 2 * W)
    k.bar("plastic_black", 14, 112, 15, 15.6, 270)  # the keyboard
    with k.detail():
        for r in range(6):
            k.bar("plastic_grey", 16 + r * 16, 28 + r * 16, 15.5, 16, 262)
    k.bar("plastic_grey", 128, 196, 15, 15.5, 112)  # the trackpad
    a = math.radians(110)
    d = (math.cos(a), math.sin(a))  # up the lid, (u, z)
    n = (math.sin(a), -math.cos(a))  # out of the screen, toward the front
    L, T = 212, 6

    def quad(x, s0, s1, o0, o1):
        """(x, u, z) corners of a lid slab between s0..s1 up it and o0..o1 off its back."""
        base = (0, 15)
        pt = lambda s, o: (x, base[0] + s * d[0] + o * n[0], base[1] + s * d[1] + o * n[1])
        return [pt(s0, o0), pt(s1, o0), pt(s1, o1), pt(s0, o1)]
    k.hexa("aluminium", quad(-W, 0, L, -T, 0) + quad(W, 0, L, -T, 0))
    k.hexa("black_paint", quad(-W + 4, 3, L - 3, 0, .6) + quad(W - 4, 3, L - 3, 0, .6))  # the bezel
    k.hexa("glass_dark", quad(-W + 10, 10, L - 12, .6, 1.1) + quad(W - 10, 10, L - 12, .6, 1.1))
    return {}


# ---------------------------------------------------------------- build
def finish(k, name, mat, coll, pts, view):
    """Moves the item's origin to its place (the grip, or the middle of its base); adds the marker empties."""
    if view == "side":
        off = Vector(ItemKit.P(*pts["grip"]))
    elif view == "front":
        off = Vector()
    else:
        vs = [v.co for v in k.bm.verts]
        off = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, min(v.z for v in vs)))
    bmesh.ops.translate(k.bm, vec=-off, verts=k.bm.verts)
    ob = k.finish(name, mat, coll)
    ob["item"] = name
    ob["icon_view"] = view
    for key in ("muzzle", "support"):
        if key in pts:
            e = bpy.data.objects.new(f"{name}_{key}", None)  # three.js strips dots from node names
            e.empty_display_type = "SPHERE"
            e.empty_display_size = .015
            e.location = Vector(ItemKit.P(*pts[key])) - off
            e.parent = ob
            coll.objects.link(e)
    return ob


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material(make_images(bpy.app.tempdir or "/tmp"))
    built = []
    colls = {}
    rows = {"side": ("weapons", 0), "front": ("worn", 2), "upright": ("carried", 4), "three-quarter": ("carried", 4), "top": ("carried", 4)}
    shared = {n for ns in SHARED.values() for n in ns}
    jobs = [j for j in ITEMS if not (LOW and j[0] in shared)]
    if LOW:  # the shared models stand in for their items
        jobs += [(name, lambda k: {}, "upright", ns[0]) for name, ns in SHARED.items()]
        GAME["mag"] = mag_game
    for i, (name, fn, view, base) in enumerate(jobs):
        group, y = rows[view]
        if group not in colls:
            colls[group] = bpy.data.collections.new(group)
            bpy.context.scene.collection.children.link(colls[group])
        k = ItemKit(LOW)
        if LOW and name in GAME:
            with k.detail():  # the detailed builder, for its markers only
                pts = fn(k)
            GAME[name](k)
        else:
            pts = fn(k)
        ob = finish(k, name, mat, colls[group], pts, view)
        if isinstance(base, tuple):
            ob["size_wh"] = list(base)
        else:
            ob["size_of"] = base
        ob.location = (i * .5, y, 0)
        built.append(ob)
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    for ob in built:
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        dims = ob.dimensions
        print(f"ITEM {ob.name:14s} {tris:5d} tris  {dims.x * 1000:6.0f} x {dims.y * 1000:6.0f} x {dims.z * 1000:6.0f} mm")


main()
