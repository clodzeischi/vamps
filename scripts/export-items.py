# Exports every item in an items .blend (built by scripts/build-items.py, or
# edited by hand) to <glb-dir>/<id>.glb with its marker empties; --bare
# leaves the palette images out (the game shares one palette material).
#
# --icons <dir> renders each item's inventory icon there as a PNG master:
# transparent, CELL_PX (136) pixels per grid cell of the item's size in
# src/data/equipment.ts, one camera and light rig for every item. --ship
# <dir> writes the game's copy of each: half the size (68 px a cell, twice
# the inventory's 34 px cell), averaged 2 x 2, as WebP. --sheet writes a
# contact sheet of the masters (docs/design/item-art.md).
#
# B=/Applications/Blender.app/Contents/MacOS/Blender
# $B -b ~/Documents/Blends/Vamps/battlescape/items.blend --python scripts/export-items.py -- \
#   art/items --icons art/items/icons --ship public/assets/items/icons [--sheet sheet.png]
# $B -b ~/Documents/Blends/Vamps/battlescape/items-low.blend --python scripts/export-items.py -- \
#   public/assets/items/models --bare
import math, os, re, sys
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0])


def opt(name):
    return os.path.abspath(args[args.index(name) + 1]) if name in args else None


ICONS, SHIP, SHEET = opt("--icons"), opt("--ship"), opt("--sheet")
BARE = "--bare" in args
WEBP_QUALITY = 100  # Blender writes 100 as lossless WebP
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL_PX = int(os.environ.get("CELL_PX", 136))
MARGIN = .06  # of the icon's frame, each side

# The views, as the direction the camera looks and its up. Every view is square
# to the item, so its icon's edges run with the inventory grid: held items lie
# muzzle up, the left side to the camera, seen a little from above; worn items
# head on; magazines and rounds from the left, a little from above; boxes and
# pouches from the front and above; flat things (a phone) from straight above.
VIEWS = {
    "side": (Vector((-1, 0, -.32)).normalized(), Vector((0, -1, 0))),
    "front": (Vector((0, 1, -.1)).normalized(), Vector((0, 0, 1))),
    "upright": (Vector((-1, 0, -.3)).normalized(), Vector((0, 0, 1))),
    "three-quarter": (Vector((0, 1, -.5)).normalized(), Vector((0, 0, 1))),
    "top": (Vector((0, 0, -1)), Vector((0, 1, 0))),
}
# Lights per view, as the direction each travels in the camera's frame (x right, y up,
# -z ahead): a key from the item's top (the right of a held item's icon, the top of a
# worn one's), a soft fill from the other side, a rim from behind for the dark edges.
LIGHTS = {
    "side": (((-.8, -.25, -.7), 3.6, 6), ((.9, .1, -.5), .6, 30), ((-.3, .5, .9), 4.0, 4)),
    "front": (((.45, -.8, -.6), 3.6, 6), ((-.9, -.1, -.5), .6, 30), ((-.5, -.3, .9), 4.0, 4)),
}
LIGHTS["upright"] = LIGHTS["three-quarter"] = LIGHTS["top"] = LIGHTS["front"]
# Head on, the rim lights flat side faces (a helmet's rails) full on: softer.
LIGHTS["front"] = LIGHTS["front"][:2] + (((-.5, -.3, .9), 2.2, 4),)


def sizes():
    """Each item's grid size (w, h) from src/data/equipment.ts."""
    src = open(os.path.join(ROOT, "src/data/equipment.ts")).read()
    out = {}
    for m in re.finditer(r'id: "([^"]+)",.*?size: \[(\d+), (\d+)\]', src, re.S):
        out[m.group(1)] = (int(m.group(2)), int(m.group(3)))
    return out


def export_glb(ob, path):
    keep = ob.location.copy()
    ob.location = (0, 0, 0)
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob or o.parent is ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_materials="EXPORT", export_normals=True, export_texcoords=True, export_yup=True,
        export_extras=True, export_image_format="NONE" if BARE else "AUTO",
    )
    ob.location = keep


def rig():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.eevee.taa_render_samples = 64
    world = bpy.data.worlds.new("icon_world")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (.42, .42, .46, 1)  # what the metal reflects
    bg.inputs[1].default_value = .3
    # A thin dark outline round the outside only, so the items hold their shape on the inventory's dark ground.
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = 1.2
    fs = sc.view_layers[0].freestyle_settings
    for old in list(fs.linesets):  # a factory-empty file's default lineset has no line style
        fs.linesets.remove(old)
    ls = fs.linesets.new("outline")
    ls.select_by_visibility, ls.select_by_edge_types = True, True
    ls.select_silhouette = ls.select_border = ls.select_crease = False
    ls.select_external_contour = True
    ls.linestyle = bpy.data.linestyles.new("outline")
    ls.linestyle.color = (.02, .02, .02)
    ls.linestyle.alpha = .85
    cam = bpy.data.objects.new("icon_cam", bpy.data.cameras.new("icon_cam"))
    cam.data.type = "ORTHO"
    cam.data.clip_start, cam.data.clip_end = .01, 100
    sc.collection.objects.link(cam)
    sc.camera = cam
    # Lights in the camera's frame (x right, y up, -z ahead): key from the upper left,
    # a soft fill from the right, a rim from behind that picks out the dark guns' edges.
    lights = []
    for name in ("key", "fill", "rim"):
        ob = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        sc.collection.objects.link(ob)
        lights.append(ob)
    return cam, lights


def frame(cam, lights, ob, view, w, h):
    d, up = VIEWS[view]
    up = (up - d * up.dot(d)).normalized()
    right = up.cross(-d)
    rot = Matrix((right, up, -d)).transposed()
    bpy.context.view_layer.update()  # export moves each item to the origin and back
    pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
    rs = [p.dot(right) for p in pts]
    us = [p.dot(up) for p in pts]
    ds = [p.dot(d) for p in pts]
    er, eu = max(rs) - min(rs), max(us) - min(us)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w * CELL_PX, h * CELL_PX
    cam.data.sensor_fit = "VERTICAL" if h >= w else "HORIZONTAL"
    fit = 1 - 2 * MARGIN
    if h >= w:
        cam.data.ortho_scale = max(eu, er * h / w) / fit
    else:
        cam.data.ortho_scale = max(er, eu * w / h) / fit
    centre = right * (max(rs) + min(rs)) / 2 + up * (max(us) + min(us)) / 2 + d * min(ds)
    cam.matrix_world = Matrix.Translation(centre - d * 2) @ rot.to_4x4()
    for L, (ld, energy, ang) in zip(lights, LIGHTS[view]):
        L.data.energy, L.data.angle = energy, math.radians(ang)
        L.rotation_euler = (rot @ Vector(ld).normalized()).to_track_quat("-Z", "Y").to_euler()


def contact_sheet(paths, out):
    """The icons on the inventory's dark ground, packed in a row by height."""
    import numpy as np
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
        imgs.append(a)
        bpy.data.images.remove(im)
    pad = 24
    W = sum(a.shape[1] for a in imgs) + pad * (len(imgs) + 1)
    H = max(a.shape[0] for a in imgs) + 2 * pad
    sheet = np.zeros((H, W, 4), dtype=np.float32)
    sheet[...] = (.075, .07, .065, 1)
    x = pad
    for a in imgs:
        h, w = a.shape[:2]
        y = H - pad - h
        cell = sheet[y:y + h, x:x + w]
        cell[..., :3] = cell[..., :3] * (1 - a[..., 3:4]) + a[..., :3]  # premultiplied enough for a check
        grid = np.zeros((h, w), dtype=bool)
        grid[::CELL_PX, :] = True
        grid[:, ::CELL_PX] = True
        cell[grid & (a[..., 3] < .1), :3] = (.2, .18, .15)
        x += w + pad
    im = bpy.data.images.new("sheet", W, H, alpha=True)
    im.pixels = sheet.ravel()
    im.filepath_raw = out
    im.file_format = "PNG"
    im.save()
    print("SHEET", out)


def ship(master, out):
    """The game's copy of an icon: half the size, each pixel the average of 2 x 2 (weighted by
    alpha, so the edges don't darken), saved as WebP."""
    import numpy as np
    im = bpy.data.images.load(master)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    a = a[:h - h % 2, :w - w % 2]
    al = a[..., 3:4]
    pre = np.concatenate([a[..., :3] * al, al], axis=2)
    q = (pre[0::2, 0::2] + pre[1::2, 0::2] + pre[0::2, 1::2] + pre[1::2, 1::2]) / 4
    alpha = q[..., 3:4]
    rgb = np.where(alpha > 1e-4, q[..., :3] / np.maximum(alpha, 1e-4), 0)
    small = np.concatenate([rgb, alpha], axis=2)
    img = bpy.data.images.new("ship", small.shape[1], small.shape[0], alpha=True)
    img.pixels = small.ravel()
    sc = bpy.context.scene
    st = sc.render.image_settings
    keep = st.file_format, st.color_mode, st.quality
    st.file_format, st.color_mode, st.quality = "WEBP", "RGBA", WEBP_QUALITY
    img.save_render(out, scene=sc)
    st.file_format, st.color_mode, st.quality = keep
    bpy.data.images.remove(img)


def main():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    size = sizes()
    only = os.environ.get("ITEMS")
    items = [o for o in bpy.data.objects if o.type == "MESH" and "item" in o and (not only or o.name in only.split(","))]
    os.makedirs(OUT, exist_ok=True)
    for ob in items:
        path = os.path.join(OUT, ob.name + ".glb")
        export_glb(ob, path)
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f"EXPORTED {ob.name} -> {path} ({tris} tris, {os.path.getsize(path)} bytes)")
    if not ICONS:
        return
    os.makedirs(ICONS, exist_ok=True)
    cam, lights = rig()
    icons = []
    for ob in items:
        base = ob.get("size_of", ob.name)  # a colourway takes its item's size
        if "size_wh" in ob:  # an item the game doesn't have yet names its own
            size[base] = tuple(ob["size_wh"])
        if base not in size:
            raise SystemExit(f"{ob.name}: {base} is not an item in src/data/equipment.ts")
        for o in bpy.data.objects:
            o.hide_render = o.type == "MESH" and o is not ob
        w, h = size[base]
        frame(cam, lights, ob, ob.get("icon_view", "side"), w, h)
        p = os.path.join(ICONS, ob.name + ".png")
        bpy.context.scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        icons.append(p)
        print(f"ICON {ob.name} {w}x{h} -> {p}")
        if SHIP:
            os.makedirs(SHIP, exist_ok=True)
            q = os.path.join(SHIP, ob.name + ".webp")
            ship(p, q)
            print(f"SHIPPED {ob.name} -> {q} ({os.path.getsize(q)} bytes)")
    if SHEET:
        contact_sheet(icons, SHEET)


main()
