"""Open fireplace on the car's left end bulkhead (an artistic liberty — real 1890
cars used enclosed coal stoves).  Carved marble chimneypiece on a projecting
mahogany chimney breast, cast-iron arched insert with brass trim, log fire on
a basket grate, brass fender, three-leaf spark guard, fire irons, coal
scuttle, overmantel mirror and garniture.  Built in a local frame (wall at
y=0, room toward -y) and rotated onto the end wall."""
import math
import random
import bmesh
import bpy
from geo import FLOOR, box, cyl, sphere, lathe, coll, anchor, adopt
from mats import G
import shell

FIRE_WORLD = None  # world-space centre of the fire, filled in by build()


def fire_materials():
    flame_m = bpy.data.materials.get("rc flame") or bpy.data.materials.new("rc flame")
    flame_m.use_nodes = True
    nt = flame_m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.0, (1.0, 0.82, 0.4, 1)
    e[1].position, e[1].color = 1.0, (1.0, 0.22, 0.02, 1)
    nt.links.new(sep.outputs["Z"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs["Color"])
    em.inputs["Strength"].default_value = 18.0
    fade = nt.nodes.new("ShaderNodeMath")
    fade.operation = "POWER"
    nt.links.new(sep.outputs["Z"], fade.inputs[0])
    fade.inputs[1].default_value = 1.6
    nt.links.new(fade.outputs[0], mix.inputs[0])
    nt.links.new(em.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    g = None
    flame = flame_m
    g = G("rc charred log")
    nz = g.n("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 6
    nz.inputs["Detail"].default_value = 10
    g.L(g.obj_vec(1.0), nz.inputs["Vector"])
    vor = g.n("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 9
    g.L(g.obj_vec(1.0), vor.inputs["Vector"])
    crack = g.math("LESS_THAN", vor.outputs["Distance"], 0.05)
    g.set("Base Color", g.mix(nz.outputs["Fac"], (0.02, 0.016, 0.012, 1), (0.12, 0.08, 0.05, 1)))
    g.set("Emission Color", (1.0, 0.32, 0.05, 1))
    g.set("Emission Strength", g.math("MULTIPLY", crack, 9.0))
    g.b.inputs["Roughness"].default_value = 0.9
    log = g.m
    return flame, log


def flame_tongue(name, x, y, z, h, w, lean, mat, c, seed):
    rnd = random.Random(seed)
    prof = [(0.0, 0.0), (w * 0.8, 0.05 * h), (w, 0.25 * h), (w * 0.75, 0.55 * h), (w * 0.35, 0.82 * h), (0.0, h)]
    o = lathe(name, prof, (x, y, z), mat, c, 16)
    o.scale = (1.0, 0.45, 1.0)
    o.rotation_euler = (rnd.uniform(-0.1, 0.1), lean, rnd.uniform(0, 3.1))
    return o


def build(M):
    global FIRE_WORLD
    c = coll("fireplace")
    flame, logmat = fire_materials()
    # projecting chimney breast with panelling
    ox0, ox1, oz1 = -2.7, 2.7, FLOOR + 7.4
    box("chimney breast L", (-6.2, -1.6, FLOOR), (ox0, 0.0, shell.CORNICE - 0.8), M["mahogany"], c, 0.06, 3)
    box("chimney breast R", (ox1, -1.6, FLOOR), (6.2, 0.0, shell.CORNICE - 0.8), M["mahogany"], c, 0.06, 3)
    box("chimney breast top", (ox0, -1.6, oz1), (ox1, 0.0, shell.CORNICE - 0.8), M["mahogany"], c, 0.06, 3)
    # marble surround
    for nm, a, b in (("L", -4.4, ox0), ("R", ox1, 4.4)):
        box(f"jamb {nm}", (a, -2.4, FLOOR + 0.3), (b, -1.6, oz1 + 1.4), M["marble"], c, 0.05, 3)
        box(f"jamb panel {nm}", (a + 0.3, -2.45, FLOOR + 1.3), (b - 0.3, -2.38, oz1 - 0.2), M["marble_dark"], c, 0.03)
        box(f"corbel {nm}", (a + 0.15, -2.85, oz1 + 0.2), (b - 0.15, -2.35, oz1 + 1.4), M["marble"], c, 0.15, 4)
        box(f"plinth {nm}", (a - 0.12, -2.55, FLOOR + 0.3), (b + 0.12, -1.6, FLOOR + 1.1), M["marble"], c, 0.05, 3)
    box("frieze", (ox0, -2.4, oz1), (ox1, -1.6, oz1 + 1.4), M["marble"], c, 0.04, 3)
    box("frieze tablet", (-1.4, -2.48, oz1 + 0.25), (1.4, -2.38, oz1 + 1.15), M["marble_dark"], c, 0.05, 3)
    sphere("frieze cartouche", (0, -2.5, oz1 + 0.7), 0.38, M["gilt"], c, scale=(1.3, 0.2, 0.9))
    shelf_z = oz1 + 1.4
    box("mantel shelf", (-4.9, -3.0, shelf_z), (4.9, -1.5, shelf_z + 0.45), M["marble"], c, 0.12, 4)
    # cast-iron arched insert with brass trim and firebox
    for nm, (a, b, za, zb) in (("L", (ox0, ox0 + 0.35, FLOOR + 0.3, oz1)), ("R", (ox1 - 0.35, ox1, FLOOR + 0.3, oz1)), ("T", (ox0, ox1, oz1 - 0.45, oz1))):
        box(f"insert frame {nm}", (a, -1.75, za), (b, -1.55, zb), M["iron"], c, 0.03)
    box("firebox back", (ox0, -0.35, FLOOR), (ox1, -0.2, oz1), M["iron"], c)
    for s in (-1, 1):
        box(f"firebox cheek {s}", (s * (ox1 - 0.5) - 0.15, -1.6, FLOOR + 0.3), (s * (ox1 - 0.5) + 0.15, -0.2, oz1 - 0.6), M["iron"], c)
    box("firebox hood", (ox0 + 0.5, -1.6, oz1 - 0.9), (ox1 - 0.5, -0.2, oz1 - 0.4), M["iron"], c)
    box("firebox floor", (ox0, -1.6, FLOOR), (ox1, -0.2, FLOOR + 0.3), M["iron"], c)
    arch = cyl("insert arch", (0, -1.8, oz1 - 1.6), 2.1, 2.1, 0.12, M["brass"], c, 64, rot=(math.pi / 2, 0, 0), caps=False)
    arch.modifiers.new("s", "SOLIDIFY").thickness = 0.12
    box("insert brass sill", (ox0 + 0.4, -1.95, FLOOR + 0.3), (ox1 - 0.4, -1.7, FLOOR + 0.55), M["brass"], c, 0.04)
    # basket grate with logs, embers and flames
    gz = FLOOR + 1.0
    for k in range(7):
        xx = -1.5 + k * 0.5
        box(f"grate bar {k}", (xx - 0.05, -1.3, gz), (xx + 0.05, -0.2, gz + 0.08), M["iron"], c)
    box("grate front", (-1.7, -1.4, gz), (1.7, -1.3, gz + 0.9), M["iron"], c)
    for s in (-1, 1):
        lathe(f"andiron {s}", [(0, 0), (0.25, 0), (0.2, 0.2), (0.1, 0.3), (0.08, 1.2), (0.18, 1.35), (0.1, 1.55), (0, 1.6)],
              (s * 1.9, -1.55, FLOOR + 0.3), M["brass"], c, 24)
    rnd = random.Random(1890)
    for k, (x, y, z, L, r, rz) in enumerate(((0.0, -0.9, gz + 0.25, 3.0, 0.24, 0.1), (-0.4, -0.5, gz + 0.55, 2.6, 0.2, -0.35),
                                             (0.5, -0.6, gz + 0.6, 2.4, 0.19, 0.4), (0.0, -0.4, gz + 0.85, 2.2, 0.17, 0.0))):
        o = cyl(f"log {k}", (x, y, z), r, r * 0.9, L, logmat, c, 16, rot=(0, math.pi / 2, rz))
    emb = G("rc embers")
    emb.b.inputs["Base Color"].default_value = (0.05, 0.02, 0.01, 1)
    nz = emb.n("ShaderNodeTexVoronoi")
    nz.inputs["Scale"].default_value = 25
    emb.L(emb.obj_vec(1.0), nz.inputs["Vector"])
    emb.set("Emission Color", (1.0, 0.3, 0.04, 1))
    emb.set("Emission Strength", emb.math("MULTIPLY", emb.math("LESS_THAN", nz.outputs["Distance"], 0.35), 6.0))
    for k in range(40):
        sphere(f"ember {k}", (rnd.uniform(-1.4, 1.4), rnd.uniform(-1.2, -0.3), gz + 0.1 + rnd.uniform(0, 0.12)), rnd.uniform(0.06, 0.14), emb.m, c,
               scale=(1, 1, 0.6), segs=8)
    for k in range(9):
        flame_tongue(f"flame {k}", rnd.uniform(-1.1, 1.1), rnd.uniform(-0.9, -0.4), gz + 0.6, rnd.uniform(1.2, 2.6), rnd.uniform(0.18, 0.32),
                     rnd.uniform(-0.25, 0.25), flame, c, k)
    for k, (x, e) in enumerate(((0.0, 600), (-0.8, 250), (0.8, 250))):
        L = bpy.data.lights.new(f"fire light {k}", "POINT")
        L.energy = e
        L.color = (1.0, 0.48, 0.16)
        L.shadow_soft_size = 0.5
        lo = bpy.data.objects.new(f"fire light {k}", L)
        lo.location = (x, -1.4, gz + 1.4)
        c.objects.link(lo)
    # hearth, fender, spark guard, irons, scuttle
    box("hearth", (-5.0, -5.6, FLOOR), (5.0, -1.6, FLOOR + 0.3), M["marble_dark"], c, 0.06, 3)
    fy = -5.4
    box("fender front", (-4.8, fy, FLOOR + 0.3), (4.8, fy + 0.2, FLOOR + 0.85), M["brass"], c, 0.07, 3)
    for s in (-1, 1):
        box(f"fender return {s}", (s * 4.8 - 0.1, fy, FLOOR + 0.3), (s * 4.8 + 0.1, -2.5, FLOOR + 0.85), M["brass"], c, 0.07, 3)
        sphere(f"fender ball {s}", (s * 4.8, fy + 0.1, FLOOR + 1.0), 0.17, M["brass"], c)
    for k, (a, b, ang) in enumerate(((-3.4, -1.7, 0.4), (-1.7, 1.7, 0.0), (1.7, 3.4, -0.4))):
        w, h = b - a, 4.8
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=int(w * 8), y_segments=int(h * 8), size=0.5)
        for v in bm.verts:
            v.co.x *= w
            v.co.y *= h
        gm = bpy.data.meshes.new(f"guard mesh {k}")
        bm.to_mesh(gm)
        bm.free()
        go = bpy.data.objects.new(f"guard mesh {k}", gm)
        c.objects.link(go)
        go.location = ((a + b) / 2, -3.8 - abs(ang) * 0.8, FLOOR + 0.3 + h / 2)
        go.rotation_euler = (math.pi / 2, 0, ang)
        go.modifiers.new("wire", "WIREFRAME").thickness = 0.014
        gm.materials.append(M["brass_aged"])
        for nm, (fx0, fz0, fx1, fz1) in (("t", (-w / 2, h / 2 - 0.12, w / 2, h / 2)), ("b", (-w / 2, -h / 2, w / 2, -h / 2 + 0.12)),
                                           ("l", (-w / 2, -h / 2, -w / 2 + 0.12, h / 2)), ("r", (w / 2 - 0.12, -h / 2, w / 2, h / 2))):
            fb = box(f"guard frame {k} {nm}", (fx0, fz0, -0.05), (fx1, fz1, 0.05), M["brass"], c, 0.03)
            fb.parent = go
            fb.matrix_parent_inverse.identity()
        sphere(f"guard finial {k}", ((a + b) / 2, -3.8 - abs(ang) * 0.8, FLOOR + 0.3 + h + 0.15), 0.12, M["brass"], c)
    sx, sy = 5.6, -3.0
    lathe("companion base", [(0, 0), (0.6, 0), (0.6, 0.12), (0.35, 0.25), (0.12, 0.35), (0, 0.35)], (sx, sy, FLOOR), M["brass"], c)
    cyl("companion stem", (sx, sy, FLOOR + 3.2), 0.06, 0.06, 6.2, M["brass"], c, 16)
    sphere("companion top", (sx, sy, FLOOR + 6.4), 0.2, M["brass"], c)
    box("companion hanger", (sx - 0.5, sy - 0.04, FLOOR + 5.9), (sx + 0.5, sy + 0.04, FLOOR + 6.0), M["brass"], c)
    for k, dx in enumerate((-0.45, -0.15, 0.15, 0.45)):
        cyl(f"fire iron {k}", (sx + dx, sy, FLOOR + 3.4), 0.035, 0.035, 4.6, M["iron"] if k % 2 else M["brass_aged"], c, 12)
        sphere(f"fire iron knob {k}", (sx + dx, sy, FLOOR + 5.75), 0.1, M["brass"], c)
    box("shovel blade", (sx - 0.62, sy - 0.25, FLOOR + 0.9), (sx - 0.28, sy + 0.25, FLOOR + 1.2), M["brass_aged"], c, 0.03)
    cyl("brush head", (sx + 0.45, sy, FLOOR + 1.0), 0.2, 0.14, 0.7, M["black_lacquer"], c, 16)
    lathe("coal scuttle", [(0, 0), (0.75, 0), (0.85, 0.2), (0.95, 0.9), (0.9, 1.5), (0.7, 1.8), (0.0, 1.8)], (-5.7, -3.0, FLOOR), M["brass"], c, 40)
    cyl("scuttle handle", (-5.7, -3.0, FLOOR + 2.0), 0.05, 0.05, 1.6, M["brass"], c, 12, rot=(0, math.pi / 2, 0))
    # overmantel: gilt mirror with pediment
    mz0, mz1 = shelf_z + 0.6, shell.CORNICE - 1.2
    mir = bpy.data.materials.get("rc mirror") or bpy.data.materials.new("rc mirror")
    mir.use_nodes = True
    bsdf = mir.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.03
    bsdf.inputs["Base Color"].default_value = (0.42, 0.40, 0.36, 1)
    box("overmantel mirror", (-3.4, -1.75, mz0 + 0.3), (3.4, -1.65, mz1 - 0.3), mir, c, 0.05)
    for nm, a, b, za, zb in (("L", -3.9, -3.4, mz0, mz1), ("R", 3.4, 3.9, mz0, mz1), ("B", -3.9, 3.9, mz0, mz0 + 0.3), ("T", -3.9, 3.9, mz1 - 0.3, mz1)):
        box(f"overmantel frame {nm}", (a, -1.95, za), (b, -1.6, zb), M["gilt"], c, 0.08, 3)
    for s in (-1, 1):
        cyl(f"pediment scroll {s}", (s * 1.3, -1.8, mz1 + 0.5), 0.5, 0.5, 0.3, M["gilt"], c, 32, rot=(math.pi / 2, 0, 0))
    lathe("pediment urn", [(0, 0), (0.25, 0), (0.25, 0.1), (0.12, 0.2), (0.35, 0.55), (0.22, 0.85), (0.08, 1.0), (0.12, 1.15), (0, 1.35)],
          (0, -1.8, mz1), M["gilt"], c, 32)
    world = anchor("fireplace anchor", (shell.X0, (shell.Y_BACK + shell.Y_FRONT) / 2, 0), math.pi / 2, c)
    adopt(c, world)
    FIRE_WORLD = (shell.X0 + 1.0, (shell.Y_BACK + shell.Y_FRONT) / 2, gz + 1.0)
    return world, shelf_z + 0.45
