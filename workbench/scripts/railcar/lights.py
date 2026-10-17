"""Lighting: twin-arm gilt sconces with etched tulip shades on the window piers,
a bright neutral examination spot on the jewellery, dusk forest outside."""
import math
import bpy
from mathutils import Vector
from geo import FLOOR, box, cyl, sphere, lathe, coll
from shell import Y_BACK, Y_FRONT
from mats import G


def etched_glass():
    g = G("rc etched tulip glass")
    g.b.inputs["Base Color"].default_value = (1.0, 0.92, 0.8, 1)
    g.b.inputs["Transmission Weight"].default_value = 0.85
    g.b.inputs["Roughness"].default_value = 0.45
    g.b.inputs["Emission Color"].default_value = (1.0, 0.7, 0.4, 1)
    g.b.inputs["Emission Strength"].default_value = 2.5
    return g.m


def sconce(name, x, y_wall, z, facing, M, c, arms=2, energy=180):
    f = facing
    lathe(name + " backplate", [(0, 0), (0.32, 0), (0.36, 0.05), (0.3, 0.12), (0.0, 0.14)], (x, y_wall, z), M["gilt"], c, 32,
          rot=(f * math.pi / 2, 0, 0))
    sphere(name + " boss", (x, y_wall + f * 0.25, z - 0.15), 0.18, M["gilt"], c)
    lathe(name + " drop", [(0, 0), (0.1, 0.05), (0.14, 0.3), (0.06, 0.55), (0, 0.65)], (x, y_wall + f * 0.25, z - 0.85), M["gilt"], c, 24)
    glass = bpy.data.materials.get("rc etched tulip glass") or etched_glass()
    offs = [0.0] if arms == 1 else [-0.75, 0.75]
    for k, dx in enumerate(offs):
        cu = bpy.data.curves.new(f"{name} arm {k}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.045
        cu.bevel_resolution = 4
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(3)
        pts = [(x, y_wall + f * 0.25, z - 0.15), (x + dx * 0.6, y_wall + f * 0.55, z - 0.55),
               (x + dx * 1.0, y_wall + f * 0.75, z - 0.2), (x + dx, y_wall + f * 0.7, z + 0.25)]
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        a = bpy.data.objects.new(f"{name} arm {k}", cu)
        c.objects.link(a)
        cu.materials.append(M["gilt"])
        top = Vector((x + dx, y_wall + f * 0.7, z + 0.25))
        lathe(f"{name} bobeche {k}", [(0, 0), (0.08, 0), (0.3, 0.1), (0.3, 0.14), (0.12, 0.2), (0.12, 0.3), (0, 0.3)], top, M["gilt"], c, 32)
        lathe(f"{name} tulip {k}", [(0.12, 0.0), (0.2, 0.1), (0.32, 0.45), (0.38, 0.75), (0.34, 0.95), (0.36, 1.0)],
              top + Vector((0, 0, 0.3)), glass, c, 40)
        L = bpy.data.lights.new(f"{name} flame {k}", "POINT")
        L.energy = energy
        L.color = (1.0, 0.66, 0.36)
        L.shadow_soft_size = 0.12
        lo = bpy.data.objects.new(f"{name} flame {k}", L)
        lo.location = top + Vector((0, 0, 0.75))
        c.objects.link(lo)


def build(M, ph):
    c = coll("lighting")
    # sconces on the window-wall piers (back) and opposite wall (front)
    for k, (x, arms) in enumerate(((0.0, 2), (7.75, 1), (-16.4, 1), (16.4, 1))):
        sconce(f"sconce back {k}", x, Y_BACK - 0.35, 5.6, -1, M, c, arms=arms)
    for k, x in enumerate((-15.6, -7.8, 7.8, 15.6)):
        sconce(f"sconce front {k}", x, Y_FRONT + 0.35, 5.6, 1, M, c)
    # dusk forest beyond the windows
    path = ph.hdri("sunset_forest")
    w = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(path, check_existing=True)
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(200))
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], env.inputs["Vector"])
    nt.links.new(env.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.55
    nt.links.new(bg.outputs[0], out.inputs[0])
