# A geoscape model: gives the largest mesh in a .blend, and any mesh named
# "*_rotor", the "Holo Gold" material (golden, glowing, brightest at the
# silhouette's edge), saves the .blend, and exports those meshes alone as glTF
# binary (modifiers applied, no materials: the game draws them with its own
# hologram shader, render/geoModels.ts, which matches this one).
#
# Model in metres, nose toward -Y (Blender's "front"), Z up; glTF turns that
# into nose +Z, +Y up. Origin anywhere: the game re-centres and scales it.
# Rotors stay separate nodes that the game spins about their own local Z
# (glTF Y): model each as a disc in its local XY plane. Their origin is moved
# to the centre of their bounds, the hub.
#
# /Applications/Blender.app/Contents/MacOS/Blender -b <file.blend> \
#   --python scripts/export-geo-model.py -- public/assets/models/<name>.glb
import sys, bpy

out = sys.argv[sys.argv.index("--") + 1]

from mathutils import Matrix, Vector

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
target = max(meshes, key=lambda o: o.dimensions.x * o.dimensions.y * o.dimensions.z)
rotors = [o for o in meshes if o.name.endswith("_rotor") and o != target]
parts = [target, *rotors]


def origin_to_bounds(o):
    """Move the origin to the centre of the mesh's local bounds, leaving the mesh in place."""
    vs = [v.co for v in o.data.vertices]
    c = Vector([(min(v[i] for v in vs) + max(v[i] for v in vs)) / 2 for i in range(3)])
    if c.length < 1e-6:
        return
    o.data.transform(Matrix.Translation(-c))
    o.matrix_world = o.matrix_world @ Matrix.Translation(c)


def holo_gold():
    m = bpy.data.materials.get("Holo Gold") or bpy.data.materials.new("Holo Gold")
    m.use_nodes = True
    m.blend_method = "BLEND"  # Eevee: see-through
    m.use_backface_culling = True
    nt = m.node_tree
    nt.nodes.clear()
    n = nt.nodes.new
    out_n = n("ShaderNodeOutputMaterial"); out_n.location = (700, 0)
    # Facing: 0 where the surface faces the camera, 1 at the silhouette.
    lw = n("ShaderNodeLayerWeight"); lw.location = (-600, 0); lw.inputs["Blend"].default_value = 0.35
    ramp = n("ShaderNodeValToRGB"); ramp.location = (-400, 0)
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.25, 0.25, 0.25, 1)
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    # Gold body, paler gold at the rim.
    col = n("ShaderNodeMix"); col.data_type = "RGBA"; col.location = (-100, 150)
    col.inputs[6].default_value = (1.0, 0.42, 0.04, 1)   # A: body, deep gold (linear)
    col.inputs[7].default_value = (1.0, 0.72, 0.28, 1)   # B: rim, pale gold
    em = n("ShaderNodeEmission"); em.location = (150, 100)
    strength = n("ShaderNodeMath"); strength.operation = "MULTIPLY"; strength.location = (-100, -100)
    strength.inputs[1].default_value = 2.5
    tr = n("ShaderNodeBsdfTransparent"); tr.location = (150, -100)
    mix = n("ShaderNodeMixShader"); mix.location = (450, 0)
    l = nt.links.new
    l(lw.outputs["Facing"], ramp.inputs["Fac"])
    l(lw.outputs["Facing"], col.inputs["Factor"])
    l(ramp.outputs["Color"], strength.inputs[0])
    l(col.outputs[2], em.inputs["Color"])
    l(strength.outputs["Value"], em.inputs["Strength"])
    l(ramp.outputs["Color"], mix.inputs["Fac"])
    l(tr.outputs[0], mix.inputs[1])
    l(em.outputs[0], mix.inputs[2])
    l(mix.outputs[0], out_n.inputs["Surface"])
    return m


mat = holo_gold()
for o in parts:
    o.data.materials.clear()
    o.data.materials.append(mat)
for o in rotors:
    origin_to_bounds(o)
bpy.ops.wm.save_mainfile()

for o in bpy.context.view_layer.objects:
    o.select_set(o in parts)
bpy.context.view_layer.objects.active = target
bpy.ops.export_scene.gltf(
    filepath=out, export_format="GLB", use_selection=True, export_apply=True,
    export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True,
)
print(f"EXPORTED {[o.name for o in parts]} -> {out}")
