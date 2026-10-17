"""Furniture and photographed props from Poly Haven (CC0), restyled for the car.
Poly Haven models are in metres; the car is in 10 cm units (x10)."""
import math
import bpy
from mathutils import Vector
from geo import FLOOR, DESK_TOP, coll, cyl, sphere, lathe, box
from mats import G

CARPET = FLOOR + 0.04


def place(ph, asset_id, name, loc, rz=0.0, scale=10.0, c=None, lie_flat=False, flat_angle=None):
    path = ph.model(asset_id)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    (c or bpy.context.scene.collection).objects.link(root)
    for o in new:
        for cc in list(o.users_collection):
            cc.objects.unlink(o)
        (c or bpy.context.scene.collection).objects.link(o)
        if o.parent is None:
            o.parent = root
    root.location = loc
    root.rotation_euler = (flat_angle if flat_angle is not None else (math.pi / 2 if lie_flat else 0.0), 0.0, rz)
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    # sit the asset's lowest point exactly on its support height
    zs = [(o.matrix_world @ Vector(v)).z for o in new if o.type == "MESH" for v in o.bound_box]
    if zs:
        root.location.z += loc[2] - min(zs)
    return root, new


def watch_chain(loc, M, c):
    """Gold albert chain trailing from the bow across the leather, ending in a T-bar and fob seal."""
    import random
    x, y, z = loc
    cu = bpy.data.curves.new("watch chain", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.018
    cu.bevel_resolution = 2
    sp = cu.splines.new("BEZIER")
    pts = [(x + 0.05, y + 0.32, z + 0.06), (x + 0.5, y + 0.75, z + 0.02), (x + 1.2, y + 0.6, z + 0.02), (x + 1.6, y + 0.1, z + 0.02),
           (x + 2.2, y + 0.2, z + 0.02)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new("watch chain", cu)
    c.objects.link(o)
    cu.materials.append(M["gold"])
    # links read as a twisted texture; a few bumps sell it at close range
    box("watch chain T-bar", (x + 2.15, y + 0.05, z + 0.0), (x + 2.25, y + 0.35, z + 0.04), M["gold"], c, 0.01)
    lathe("watch fob seal", [(0, 0), (0.1, 0), (0.12, 0.05), (0.06, 0.12), (0.08, 0.22), (0, 0.24)], (x + 2.0, y - 0.25, z), M["gold"], c, 24)
    sphere("watch fob stone", (x + 2.0, y - 0.25, z + 0.04), 0.09, bpy.data.materials.get("rc gem amethyst") or M["gold"], c, scale=(1.2, 1, 0.45))


def desk_chair(loc, M, c, upholstery):
    """Tufted leather swivel desk armchair on a cast-iron four-claw base with brass casters."""
    x, y, z = loc
    leather = M["leather"]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cu = bpy.data.curves.new(f"chair claw {k}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.13
        cu.bevel_resolution = 3
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(2)
        ps = [(x, y, z + 1.6), (x + 1.2 * math.cos(a), y + 1.2 * math.sin(a), z + 1.0), (x + 2.4 * math.cos(a), y + 2.4 * math.sin(a), z + 0.45)]
        for bp, p in zip(sp.bezier_points, ps):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        ob = bpy.data.objects.new(f"chair claw {k}", cu)
        c.objects.link(ob)
        cu.materials.append(M["iron"])
        sphere(f"chair caster {k}", (x + 2.45 * math.cos(a), y + 2.45 * math.sin(a), z + 0.22), 0.22, M["brass"], c)
    lathe("chair column", [(0, 0), (0.45, 0), (0.3, 0.4), (0.22, 2.0), (0.35, 2.4), (0.0, 2.4)], (x, y, z + 1.3), M["iron"], c, 32)
    lathe("chair seat frame", [(0, 0), (2.15, 0), (2.25, 0.2), (2.2, 0.55), (0, 0.55)], (x, y, z + 3.7), M["mahogany"], c, 64)
    seat = lathe("chair seat cushion", [(0, 0), (2.05, 0), (2.1, 0.25), (1.9, 0.6), (1.2, 0.75), (0, 0.8)], (x, y, z + 4.2), leather, c, 64)
    # barrel back: a partial ring of tufted leather, open toward the desk
    import bmesh
    bm = bmesh.new()
    segs, H, R0, R1 = 40, 2.4, 2.15, 1.75
    a0, a1 = math.radians(35), math.radians(325)
    rows = []
    for j in range(2):
        zz = j * H
        ring = []
        for i in range(segs + 1):
            a = a0 + (a1 - a0) * i / segs
            r = R0 + 0.15 * j
            ring.append(bm.verts.new((r * math.sin(a), -r * math.cos(a) * -1, zz)))
        rows.append(ring)
    for i in range(segs):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    me = bpy.data.meshes.new("chair barrel back")
    bm.to_mesh(me)
    bm.free()
    back = bpy.data.objects.new("chair barrel back", me)
    back.location = (x, y, z + 4.6)
    c.objects.link(back)
    me.materials.append(leather)
    sol = back.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.55
    back.modifiers.new("sub", "SUBSURF").levels = 2
    for p in me.polygons:
        p.use_smooth = True
    top = cyl("chair back rail", (x, y, z + 4.6 + H), R0 + 0.25, R0 + 0.25, 0.25, M["mahogany"], c, 64, caps=False)
    top.modifiers.new("s", "SOLIDIFY").thickness = 0.35
    for s in (-1, 1):
        a = a0 if s < 0 else a1
        sphere(f"chair arm scroll {s}", (x + (R0 + 0.1) * math.sin(a), y + (R0 + 0.1) * math.cos(a), z + 5.4), 0.32, M["mahogany"], c, scale=(1, 1, 1.3))
    for k in range(18):
        a = a0 + (a1 - a0) * k / 17
        sphere(f"chair nail {k}", (x + (R0 + 0.29) * math.sin(a), y + (R0 + 0.29) * math.cos(a), z + 4.75), 0.05, M["brass"], c)


def keep_only_tallest(root, objs):
    meshes = [o for o in objs if o.type == "MESH" and o.parent == root]
    if not meshes:
        return
    def height(o):
        zs = [(o.matrix_world @ Vector(v)).z for v in o.bound_box]
        return max(zs) - min(zs)
    best = max(meshes, key=height)
    bx = sum((best.matrix_world @ Vector(v)).x for v in best.bound_box) / 8
    by = sum((best.matrix_world @ Vector(v)).y for v in best.bound_box) / 8
    for o in list(objs):
        if o.type == "MESH" and o is not best and o.parent == root:
            # keep candles/flames that sit on the chosen holder
            ox = sum((o.matrix_world @ Vector(v)).x for v in o.bound_box) / 8
            oy = sum((o.matrix_world @ Vector(v)).y for v in o.bound_box) / 8
            if (ox - bx) ** 2 + (oy - by) ** 2 > 1.0:
                bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    wx = sum((best.matrix_world @ Vector(v)).x for v in best.bound_box) / 8
    wy = sum((best.matrix_world @ Vector(v)).y for v in best.bound_box) / 8
    root.location.x += root.location.x - wx
    root.location.y += root.location.y - wy


def recolor_fabric(objs, rgb):
    """Photographed chairs share one material for frame + upholstery: recolour the
    light upholstery to oxblood velvet (with sheen) while the dark carved frame keeps
    its scanned wood."""
    for o in objs:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m or m.get("lj_recoloured"):
                continue
            nt = m.node_tree
            b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not b or not b.inputs["Base Color"].is_linked:
                continue
            src = b.inputs["Base Color"].links[0].from_socket
            bw = nt.nodes.new("ShaderNodeRGBToBW")
            nt.links.new(src, bw.inputs[0])
            mr = nt.nodes.new("ShaderNodeMapRange")
            mr.inputs["From Min"].default_value = 0.07
            mr.inputs["From Max"].default_value = 0.14
            nt.links.new(bw.outputs[0], mr.inputs["Value"])
            tint = nt.nodes.new("ShaderNodeMix")
            tint.data_type = "RGBA"
            tint.blend_type = "MULTIPLY"
            tint.inputs[0].default_value = 1.0
            nt.links.new(src, tint.inputs[6])
            tint.inputs[7].default_value = (rgb[0] * 2.2, rgb[1] * 2.2, rgb[2] * 2.2, 1)
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            nt.links.new(mr.outputs[0], mix.inputs[0])
            nt.links.new(src, mix.inputs[6])
            mix.inputs[7].default_value = (rgb[0], rgb[1], rgb[2], 1)
            nt.links.new(mix.outputs[2], b.inputs["Base Color"])
            sw = nt.nodes.new("ShaderNodeMath")
            sw.operation = "MULTIPLY"
            nt.links.new(mr.outputs[0], sw.inputs[0])
            sw.inputs[1].default_value = 0.35
            nt.links.new(sw.outputs[0], b.inputs["Sheen Weight"])
            b.inputs["Sheen Tint"].default_value = (0.6, 0.12, 0.12, 1)
            m["lj_recoloured"] = True


def tufted_velvet(base_col, name):
    """Deep-buttoned velvet: diamond tufting as bump + darker creases + sheen."""
    g = G(name)
    tc = g.n("ShaderNodeTexCoord")
    sep = g.n("ShaderNodeSeparateXYZ")
    mp = g.n("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (7, 7, 7)
    g.L(tc.outputs["Object"], mp.inputs["Vector"])
    g.L(mp.outputs[0], sep.inputs[0])
    # use the two most-varying object axes for a 45-degree lattice
    u = g.math("ADD", sep.outputs["X"], sep.outputs["Z"])
    v = g.math("SUBTRACT", sep.outputs["X"], sep.outputs["Z"])
    du = g.math("ABSOLUTE", g.math("SUBTRACT", g.math("FRACT", u), 0.5))
    dv = g.math("ABSOLUTE", g.math("SUBTRACT", g.math("FRACT", v), 0.5))
    pillow = g.math("MULTIPLY", g.math("SUBTRACT", 0.5, du), g.math("SUBTRACT", 0.5, dv))  # 0 at creases
    crease = g.math("LESS_THAN", pillow, 0.02)
    button = g.math("LESS_THAN", g.math("ADD", g.math("POWER", g.math("SUBTRACT", 0.5, du), 2.0), g.math("POWER", g.math("SUBTRACT", 0.5, dv), 2.0)), 0.004)
    nz = g.n("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 60
    g.L(tc.outputs["Object"], nz.inputs["Vector"])
    col = g.mix(g.math("MULTIPLY", crease, 0.65), base_col, tuple(c * 0.35 for c in base_col[:3]) + (1,))
    col = g.mix(button, col, tuple(c * 0.5 for c in base_col[:3]) + (1,))
    g.set("Base Color", col)
    g.b.inputs["Roughness"].default_value = 0.75
    g.b.inputs["Sheen Weight"].default_value = 1.0
    g.b.inputs["Sheen Tint"].default_value = (1.0, 0.7, 0.65, 1)
    g.b.inputs["Sheen Roughness"].default_value = 0.35
    bump = g.n("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.9
    bump.inputs["Distance"].default_value = 0.4
    g.L(g.math("ADD", g.math("POWER", pillow, 0.5), g.math("MULTIPLY", nz.outputs["Fac"], 0.02)), bump.inputs["Height"])
    g.set("Normal", bump.outputs[0])
    return g.m


def restyle(objs, rules):
    """rules: list of (substring-in-material-name, new material)."""
    for o in objs:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            if not slot.material:
                continue
            nm = slot.material.name.lower()
            for key, mat in rules:
                if key in nm:
                    slot.material = mat
                    break


def build(M, ph):
    c = coll("furniture + props")
    red_tuft = tufted_velvet((0.30, 0.025, 0.03, 1), "rc tufted oxblood velvet")
    green_tuft = tufted_velvet((0.025, 0.11, 0.06, 1), "rc tufted emerald velvet")
    # fireside pair of tufted armchairs angled to the hearth (left end), one by the bar
    for k, (loc, rz) in enumerate((((-15.5, -14.0, CARPET), math.radians(-126)), ((-15.5, -3.0, CARPET), math.radians(-54)),
                                   ((16.5, -14.5, CARPET), math.radians(128)))):
        root, objs = place(ph, "ArmChair_01", f"tufted armchair {k}", loc, rz, c=c)
        recolor_fabric(objs, (0.13, 0.008, 0.012))
    # carved settee against the opposite wall, under the big landscape
    root, objs = place(ph, "sofa_03", "carved settee", (0.0, -24.8, CARPET), math.pi, c=c)
    restyle(objs, [("fabric", green_tuft), ("cloth", green_tuft)])
    # gasoliers from the clerestory
    for k, x in enumerate((-13.0, 0.0, 13.0)):
        root, objs = place(ph, "Chandelier_02", f"gasolier {k}", (x, -8.5, 14.4), 0.0, c=c)
        top = max((o.matrix_world @ Vector(v)).z for o in objs if o.type == "MESH" for v in o.bound_box)
        if top < 19.4:
            cyl(f"gasolier rod {k}", (x, -8.5, (top + 19.6) / 2), 0.05, 0.05, 19.6 - top, M["brass"], c, 12)
        L = bpy.data.lights.new(f"gasolier light {k}", "POINT")
        L.energy = 380
        L.color = (1.0, 0.72, 0.45)
        L.shadow_soft_size = 0.8
        lo = bpy.data.objects.new(f"gasolier light {k}", L)
        lo.location = (x, -8.5, 15.3)
        c.objects.link(lo)
    # desk: pocket watch (Poly Haven) beside the work
    root, objs = place(ph, "vintage_pocket_watch", "pocket watch", (-5.4, 1.6, DESK_TOP), math.radians(-20), c=c, flat_angle=-math.pi / 2)
    watch_chain((-5.4, 1.6, DESK_TOP), M, c)
    place(ph, "dining_chair_02", "tufted leather desk chair", (0.0, -9.2, CARPET), math.pi, c=c)
    return c
