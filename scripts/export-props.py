# Exports every prop in the battlescape props .blend to its own glTF binary,
# public/assets/props/<object name>.glb, with the object's origin at 0 and
# no images: the game shares one palette material (the rule each prop
# follows is at the top of scripts/build-props.py). Edit the
# props in Blender, then run this; build-props.py rebuilds the .blend from
# scratch and would overwrite hand edits.
#
# /Applications/Blender.app/Contents/MacOS/Blender -b ~/Documents/Blends/Vamps/battlescape/props.blend \
#   --python scripts/export-props.py -- public/assets/props [car_,pickup]
#
# A second argument (name prefixes, comma-separated) exports only those.
import os, sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
only = [x for x in (args[1] if len(args) > 1 else "").split(",") if x]
os.makedirs(out_dir, exist_ok=True)
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
props = [o for o in bpy.data.objects if o.type == "MESH" and (not only or any(o.name.startswith(p) for p in only))]
for ob in props:
    keep = ob.location.copy()
    ob.location = (0, 0, 0)
    for o in bpy.context.view_layer.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    path = os.path.join(out_dir, ob.name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_materials="EXPORT", export_normals=True, export_texcoords=True, export_yup=True,
        export_image_format="NONE",  # the game loads the palette once and shares it
    )
    ob.location = keep
    print(f"EXPORTED {ob.name} -> {path} ({os.path.getsize(path)} bytes)")
