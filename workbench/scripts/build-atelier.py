"""Build the static atelier and bake fixed illumination with Blender 4.5 LTS.

Run from the repository root:
  blender -b --factory-startup --python workbench/scripts/build-atelier.py
Only static scenery is baked. Cases, specimen, loupe and movable task light are
created in the browser. Coordinates below use the application's +Y-up frame.
"""
import math
import random
import runpy
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "workbench/assets/atelier"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(21)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.cycles.use_denoising = True
scene.cycles.bake_type = "DIFFUSE"
scene.render.bake.margin = 12
scene.render.bake.use_clear = True
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.24, 0.30, 0.38, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.24
scene.view_settings.view_transform = "AgX"
static = []
preview_only = []


def xyz(p):
    return (p[0], -p[2], p[1])


def rgb(hex_color):
    v = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in v)


def material(name, color, rough=.6, metal=0, grain=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    c = rgb(color)
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = rough
    # Static metal is represented by its diffuse, baked appearance. Real jewelry
    # and task-lamp brass remain live PBR materials in the browser.
    bsdf.inputs["Metallic"].default_value = metal
    if grain:
        tex = nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 5
        tex.inputs["Detail"].default_value = 2
        coord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeVectorMath")
        mapping.operation = "MULTIPLY"
        mapping.inputs[1].default_value = (2, 90, 3)
        links.new(coord.outputs["Generated"], mapping.inputs[0])
        links.new(mapping.outputs[0], tex.inputs["Vector"])
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*(x * .55 for x in c), 1)
        ramp.color_ramp.elements[1].color = (*(min(1, x * 1.25) for x in c), 1)
        links.new(tex.outputs["Fac"], ramp.inputs[0])
        links.new(ramp.outputs[0], bsdf.inputs["Base Color"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .12
        bump.inputs["Distance"].default_value = .012
        links.new(tex.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs[0], bsdf.inputs["Normal"])
    return m


walnut = material("oiled walnut", "73513b", .43, grain=True)
edge = material("end grain", "44332a", .5, grain=True)
paint = material("warm mineral paint", "e6dfd2", .88)
linen = material("unbleached linen", "d5c7ae", .95)
ivory = material("ivory ceramic", "e9dfca", .33)
brass = material("satin brass", "ab8754", .36)
ink = material("charcoal", "292e2d", .55)
steel = material("steel", "82908e", .35)
wax = material("warm wax", "e9d5ad", .8)
amber = material("amber glass body", "533b28", .22)
paper = material("paper edges", "d6ccb5", .95)


def finish(o, mat, bevel=0):
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new("soft manufactured edges", "BEVEL")
        mod.width, mod.segments = bevel, 3
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = o.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    static.append(o)
    return o


def box(name, size, p, mat=walnut, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    o = bpy.context.object
    o.name = name
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bevel)


def cylinder(name, r, depth, p, mat, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=r, radius2=r if r2 is None else r2, depth=depth, location=xyz(p))
    o = bpy.context.object
    o.name = name
    return finish(o, mat, .012)


def area(name, p, target, energy, color, size, size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.shape, data.size = energy, rgb(color), "RECTANGLE", size
    data.size_y = size if size_y is None else size_y
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.location = xyz(p)
    o.rotation_euler = (Vector(xyz(target)) - o.location).to_track_quat("-Z", "Y").to_euler()


# The window and wall share the same opening and depth. Broad reveals, two
# casements and a continuous sill remove the former floating-frame gap.
back = -7.8
box("left wall", (6, 15, .28), (-11, 4, back), paint)
box("right wall", (15, 15, .28), (5.5, 4, back), paint)
box("below window", (6, 2.7, .28), (-5, -.85, back), paint)
box("above window", (6, 5, .28), (-5, 9.5, back), paint)
box("left return", (.3, 15, 20), (-14, 4, 0), paint)
box("right return", (.3, 15, 20), (13, 4, 0), paint)
box("ceiling", (27, .25, 20), (-.5, 10, 0), paint)
box("floor", (27, .2, 20), (-.5, -5, 0), edge)
for x in (-8.02, -1.98):
    box("window reveal", (.18, 6.6, .65), (x, 3.75, back), ivory)
    box("oak architrave", (.14, 6.85, .1), (x, 3.75, back + .35), walnut)
for y in (.45, 7.05):
    box("window reveal", (6.2, .18, .65), (-5, y, back), ivory)
    box("oak architrave", (6.35, .14, .1), (-5, y, back + .35), walnut)
for x in (-7.84, -5, -2.16):
    box("window upright", (.10, 6.4, .14), (x, 3.75, back + .16), ivory, .014)
for y in (.64, 3.15, 6.88):
    box("window rail", (5.7, .1, .14), (-5, y, back + .16), ivory, .014)
box("deep sill", (6.65, .16, .92), (-5, .39, back + .25), walnut)
for x in (-7.60, -2.40):
    # Actual folded fabric geometry, intentionally no plant on the sill.
    vertices, faces = [], []
    for j in range(33):
        for i in range(49):
            t, v = i / 48, j / 32
            vertices.append(xyz((x + (t - .5) * .65, .72 + v * 6.4, back + .42 + .075 * math.cos(t * math.pi * 10))))
    for j in range(32):
        for i in range(48):
            a = j * 49 + i
            faces.append((a, a + 1, a + 50, a + 49))
    mesh = bpy.data.meshes.new("linen folds")
    mesh.from_pydata(vertices, [], faces)
    o = bpy.data.objects.new("side curtain", mesh)
    scene.collection.objects.link(o)
    finish(o, linen)

# Comfortable desk scale, clean routed edge and a small central presentation pad
# (the pad is live in Three so its color can still be selected).
box("walnut bench top", (16, .32, 9.2), (0, -1.57, -1.3), walnut, .10)
box("routed edge", (15.85, .09, 9.05), (0, -1.78, -1.3), edge, .035)
for x in (-6.8, 6.8):
    box("desk leg", (.32, 3.0, .5), (x, -3.2, -3), edge)
box("rear tool ledge", (15.0, .18, .65), (0, -1.30, -5.28), walnut)

# Two quiet floating shelves, with individual book boards, paper blocks and
# thin brass bookends. Restrained colors and deliberate negative space.
book_colors = ["54625a", "a68d72", "6e3d45", "303e48", "aaa292", "4c4c43"]
for shelf, y in enumerate((1.15, 3.45)):
    box("floating walnut shelf", (5.8, .14, 1.0), (5.2, y, back + .65), walnut)
    for x in (3.0, 7.4):
        box("shelf bracket", (.045, .45, .7), (x, y - .22, back + .50), brass, .01)
    x = 2.75
    for i in range(8 if shelf == 0 else 5):
        w = random.uniform(.23, .43)
        h = random.uniform(1.05, 1.6)
        m = material(f"book cloth {shelf} {i}", book_colors[(i + shelf) % len(book_colors)], .9)
        box("book paper", (w - .035, h - .05, .62), (x + w / 2, y + h / 2 + .09, back + .66), paper, .008)
        for side in (-1, 1):
            box("book cover", (.022, h, .72), (x + w / 2 + side * w / 2, y + h / 2 + .09, back + .66), m, .006)
        box("book spine", (w, h, .045), (x + w / 2, y + h / 2 + .09, back + 1.015), m, .012)
        for offset in (.22, .30, h - .22):
            box("spine rule", (w * .65, .012, .008), (x + w / 2, y + .09 + offset, back + 1.041), brass, .002)
        x += w + .045
    if shelf:
        cylinder("ceramic vessel", .35, .68, (6.8, y + .42, back + .66), ivory, .30)
        cylinder("vessel rim", .31, .045, (6.8, y + .78, back + .66), ink)

# Framed mineral studies: geometry-backed mounts, simple cut diagrams.
for x in (.15, 1.65):
    box("walnut frame", (1.25, 1.6, .09), (x, 2.75, back + .2), walnut)
    box("mat board", (1.09, 1.44, .02), (x, 2.75, back + .26), ivory)
    for i in range(8):
        a = i * math.pi / 4
        bar = box("cut study", (.015, .64, .012), (x + .2 * math.cos(a), 2.75 + .2 * math.sin(a), back + .28), brass, .003)
        bar.rotation_euler.y = a

# Back-of-desk objects establish a working jeweler's station, not a dungeon.
box("ring mandrel cradle", (2.0, .15, .7), (-4.8, -1.25, -3.5), edge)
mandrel = cylinder("steel ring mandrel", .13, 2.35, (-4.8, -1.04, -3.5), steel, .05)
mandrel.rotation_euler.y = math.pi / 2
for i in range(2):
    tool = box("tweezer arm", (.035, .045, 1.65), (-3.55 + i * .085, -1.36, -2.9), steel, .008)
    tool.rotation_euler.z = -.24 + i * .04
box("leather notebook", (1.55, .17, 1.9), (4.7, -1.30, -3.35), ink, .045)
box("notebook paper", (1.44, .12, 1.77), (4.7, -1.21, -3.35), paper, .02)
box("notebook cover", (1.55, .035, 1.9), (4.7, -1.13, -3.35), ink)
cylinder("ceramic tea cup", .28, .43, (6.05, -1.18, -3.3), ivory, .31)
cylinder("tea", .265, .015, (6.05, -.958, -3.3), amber)

# Low glass votives with a recessed wax surface; flames are emissive teardrops.
flame = material("warm flame", "fff0c9")
fbsdf = flame.node_tree.nodes.get("Principled BSDF")
fbsdf.inputs["Emission Color"].default_value = (1, .40, .075, 1)
fbsdf.inputs["Emission Strength"].default_value = 7
for x, z, height in [(-6.55, -3.5, .48), (6.5, -4.8, .67)]:
    glass_body = cylinder("preview glass votive", .34, height, (x, -1.4 + height / 2, z), amber)
    static.remove(glass_body)
    preview_only.append(glass_body)
    cylinder("votive upper lip", .335, .035, (x, -1.4 + height, z), brass)
    cylinder("recessed wax", .29, .035, (x, -1.46 + height, z), wax)
    cylinder("cotton wick", .012, .06, (x, -1.40 + height, z), ink)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=xyz((x, -1.30 + height, z)))
    o = bpy.context.object
    o.name = "small flame"
    o.scale = (.035, .035, .10)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o, flame)
    area("candle pool", (x, -1.19 + height, z), (x, -1.4, z + .3), 12, "ffc58a", .22)

area("cool window", (-5, 4, back + .48), (0, -1.0, 0), 1600, "dce7f1", 5.2, 5.8)
area("warm studio bounce", (4.5, 6, -1), (0, 0, -2), 1250, "ffdeb2", 5)
area("rear shelf wash", (5, 4.9, back + 1.9), (5, 2.3, back), 130, "ffe2bd", 4, .4)

# A real Cycles still is useful for diagnosing art direction independently of
# runtime color management. It is kept in ignored output, not used as a backdrop.
bpy.ops.object.camera_add(location=xyz((0, 2.6, 6.4)))
camera = bpy.context.object
camera.rotation_euler = (Vector(xyz((0, .3, -.3))) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 23.8
scene.camera = camera
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100
preview = ROOT / "output/atelier-research/atelier-cycles.png"
scene.render.filepath = str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "output/atelier-research/atelier.blend"))
bpy.ops.render.render(write_still=True)
for o in preview_only:
    o.hide_render = True

# Bake color and irradiance into one shared non-overlapping UV atlas. Exported
# geometry retains depth/parallax and receives the live task light every frame.
bpy.ops.object.select_all(action="DESELECT")
for o in static:
    o.select_set(True)
bpy.context.view_layer.objects.active = static[0]
bpy.ops.object.join()
room = bpy.context.object
room.name = "Atelier — static surfaces"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.006)
bpy.ops.object.mode_set(mode="OBJECT")


def bake(name, passes, fmt):
    image = bpy.data.images.new(name, 2048, 2048, alpha=False, float_buffer=fmt == "HDR")
    image.colorspace_settings.name = "Non-Color" if fmt == "HDR" else "sRGB"
    for slot in room.material_slots:
        nodes = slot.material.node_tree.nodes
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        nodes.active = node
    scene.render.bake.use_pass_color = "COLOR" in passes
    scene.render.bake.use_pass_direct = "DIRECT" in passes
    scene.render.bake.use_pass_indirect = "INDIRECT" in passes
    bpy.ops.object.bake(type="DIFFUSE")
    image.file_format = fmt
    image.filepath_raw = str(OUT / name)
    image.save()
    return image


color = bake("atelier-color.png", {"COLOR"}, "PNG")
bake("atelier-light.hdr", {"DIRECT", "INDIRECT"}, "HDR")
denoiser = runpy.run_path(str(Path(__file__).with_name("denoise-atelier.py")))
denoiser["denoise_atlas"](OUT / "atelier-light.hdr")
export_material = material("baked atelier", "ffffff", .72)
nodes, links = export_material.node_tree.nodes, export_material.node_tree.links
texture = nodes.new("ShaderNodeTexImage")
texture.image = color
links.new(texture.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
room.data.materials.clear()
room.data.materials.append(export_material)
for p in room.data.polygons:
    p.material_index = 0
bpy.ops.export_scene.gltf(filepath=str(OUT / "atelier.glb"), use_selection=True, export_format="GLB", export_yup=True)
print("ATELIER_BAKED", len(room.data.vertices), "vertices", OUT)
