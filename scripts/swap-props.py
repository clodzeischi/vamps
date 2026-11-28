# Swaps freshly built props (a scratch .blend from ONLY=… build-props.py) into the kit .blend:
# same names, places and collections, the kit's shared material. A new prop goes into the
# collection named by the second argument, after the last one there.
#   Blender -b props.blend --python scripts/swap-props.py -- scratch.blend [collection]
import sys, bpy
args = sys.argv[sys.argv.index("--") + 1:]
src = args[0]
new_group = args[1] if len(args) > 1 else None
with bpy.data.libraries.load(src) as (data_from, data_to):
    names = list(data_from.objects)
mat = bpy.data.materials["Props"]
swapped = []
for name in names:
    old = bpy.data.objects.get(name)
    if old is None:
        if not new_group:
            print("NEW (no old object, no group given):", name); continue
        coll = bpy.data.collections[new_group]
        xs = [o.location.x for o in coll.objects]
        ys = [o.location.y for o in coll.objects]
        loc = (max(xs) + 2.4 if xs else 0, ys[0] if ys else 0, 0)
        colls = [coll]
    else:
        loc, colls = old.location.copy(), list(old.users_collection)
        old_mesh = old.data
        bpy.data.objects.remove(old)
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
    with bpy.data.libraries.load(src) as (f, t):
        t.objects = [name]
    ob = t.objects[0]
    ob.name = name
    ob.data.name = name
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    ob.location = loc
    for c in colls:
        c.objects.link(ob)
    swapped.append(name)
for m in list(bpy.data.materials):
    if m is not mat and m.users == 0:
        bpy.data.materials.remove(m)
for im in list(bpy.data.images):
    if im.users == 0:
        bpy.data.images.remove(im)
bpy.ops.wm.save_mainfile()
print("SWAPPED", swapped, "objects now", len([o for o in bpy.data.objects if o.type == "MESH"]))
