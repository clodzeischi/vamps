# Exports every prop in the battlescape props .blend to its own glTF binary,
# public/assets/props/<object name>.glb, with the object's origin at 0 (the
# rule each prop follows is at the top of scripts/build-props.py). Edit the
# props in Blender, then run this; build-props.py rebuilds the .blend from
# scratch and would overwrite hand edits.
#
# /Applications/Blender.app/Contents/MacOS/Blender -b ~/Documents/Blends/Vamps/battlescape/props.blend \
#   --python scripts/export-props.py -- public/assets/props
import os, sys
import bpy

out_dir = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(out_dir, exist_ok=True)
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
props = [o for o in bpy.data.objects if o.type == "MESH"]
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
    )
    ob.location = keep
    print(f"EXPORTED {ob.name} -> {path} ({os.path.getsize(path)} bytes)")
