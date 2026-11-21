# Exports a geoscape model (.blend) to glTF binary for the game.
#
# The one rule for every geoscape .blend (render/geoModels.ts reads them all
# the same way):
#   * 1 Blender metre = 0.001 globe units; model at the size it should show.
#   * The origin is the anchor: an aircraft's centre (it sits on the flight
#     path), an installation's ground centre.
#   * Nose toward -Y, Z up.
#   * One mesh named "body", plus any "*_rotor" parts, which spin about their
#     own Z (origin at the hub, the disc in their local XY).
#   * A hologram material named "Holo Gold" (aircraft), "Holo Blue" (SIGINT),
#     "Holo Brass" (bases) or "Holo Green" (HUMINT assets); the game draws its
#     own shader by that name.
#
# The script exports every mesh with modifiers applied. A mesh without a Holo
# material gets Holo Gold; a palette argument gives every mesh that one. Each
# Holo material's nodes are rebuilt so Blender previews the game's look, and
# the .blend is saved.
#
# /Applications/Blender.app/Contents/MacOS/Blender -b <file.blend> \
#   --python scripts/export-geo-model.py -- public/assets/models/<kind>.glb [gold|blue|brass|green]
import sys, bpy

args = sys.argv[sys.argv.index("--") + 1:]
out = args[0]
palette = args[1] if len(args) > 1 else None

# Name: body and rim colours (linear), and the glow's strength.
PALETTES = {
    "gold": ("Holo Gold", (1.0, 0.42, 0.04, 1), (1.0, 0.72, 0.28, 1), 2.5),
    "blue": ("Holo Blue", (0.06, 0.32, 0.8, 1), (0.42, 0.8, 1.0, 1), 2.5),
    "brass": ("Holo Brass", (0.9, 0.6, 0.25, 1), (1.0, 0.88, 0.65, 1), 2.0),
    "green": ("Holo Green", (0.08, 0.55, 0.2, 1), (0.5, 1.0, 0.6, 1), 2.5),
}
BY_NAME = {v[0]: k for k, v in PALETTES.items()}


def holo(key):
    name, body, rim, glow = PALETTES[key]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
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
    # Body colour, paler at the rim.
    col = n("ShaderNodeMix"); col.data_type = "RGBA"; col.location = (-100, 150)
    col.inputs[6].default_value = body
    col.inputs[7].default_value = rim
    em = n("ShaderNodeEmission"); em.location = (150, 100)
    strength = n("ShaderNodeMath"); strength.operation = "MULTIPLY"; strength.location = (-100, -100)
    strength.inputs[1].default_value = glow
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


if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
parts = [o for o in bpy.data.objects if o.type == "MESH"]
for o in parts:
    have = next((m.name for m in o.data.materials if m and m.name in BY_NAME), None)
    key = palette or (BY_NAME[have] if have else "gold")
    mat = holo(key)
    o.data.materials.clear()
    o.data.materials.append(mat)
bpy.ops.wm.save_mainfile()

for o in bpy.context.view_layer.objects:
    o.select_set(o in parts)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.export_scene.gltf(
    filepath=out, export_format="GLB", use_selection=True, export_apply=True,
    # Materials only for their names (a few bytes): the game picks its shader by them.
    export_materials="EXPORT", export_normals=True, export_texcoords=False, export_yup=True,
)
print(f"EXPORTED {[(o.name, o.data.materials[0].name) for o in parts]} -> {out}")
