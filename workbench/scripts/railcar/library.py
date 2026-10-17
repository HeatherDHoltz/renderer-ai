"""Glazed library bookcases, a library globe, and gilt-framed oil paintings."""
import math
import os
import random
import bmesh
import bpy
from geo import FLOOR, box, cyl, sphere, lathe, coll, anchor, adopt
from mats import G, TEX, runtime

PAINT_DIR = "/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai/workbench/assets/railcar/paintings"


def binding_material():
    m = bpy.data.materials.get("rc library bindings")
    if m:
        return m
    g = G("rc library bindings")
    oi = g.n("ShaderNodeObjectInfo")
    tc = g.n("ShaderNodeTexCoord")
    sep = g.n("ShaderNodeSeparateXYZ")
    g.L(tc.outputs["Generated"], sep.inputs[0])
    ramp = g.n("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    pal = [(0.26, 0.035, 0.03), (0.32, 0.12, 0.05), (0.13, 0.06, 0.03), (0.04, 0.12, 0.06), (0.04, 0.06, 0.15),
           (0.26, 0.14, 0.06), (0.30, 0.06, 0.045), (0.09, 0.04, 0.025), (0.22, 0.10, 0.045), (0.18, 0.025, 0.04)]
    els = ramp.color_ramp.elements
    while len(els) < len(pal):
        els.new(0.5)
    for i, col in enumerate(pal):
        els[i].position = i / len(pal)
        els[i].color = (*col, 1)
    g.L(oi.outputs["Random"], ramp.inputs[0])
    z = sep.outputs["Z"]
    y = sep.outputs["Y"]

    def band(cv, w):
        return g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", z, cv)), w)

    gilt = g.math("MAXIMUM", g.math("MAXIMUM", band(0.07, 0.009), band(0.11, 0.004)), g.math("MAXIMUM", band(0.93, 0.009), band(0.89, 0.004)))
    gilt = g.math("MAXIMUM", gilt, g.math("MAXIMUM", band(0.36, 0.006), band(0.6, 0.006)))
    label = g.math("MULTIPLY", g.math("GREATER_THAN", z, 0.72), g.math("LESS_THAN", z, 0.84))
    spine = g.math("LESS_THAN", y, 0.03)
    gilt = g.math("MULTIPLY", gilt, spine)
    label = g.math("MULTIPLY", label, spine)
    col = g.mix(label, ramp.outputs[0], (0.03, 0.01, 0.006, 1))
    geo = g.n("ShaderNodeNewGeometry")
    ns = g.n("ShaderNodeSeparateXYZ")
    g.L(geo.outputs["Normal"], ns.inputs[0])
    paper = g.math("MULTIPLY", g.math("GREATER_THAN", g.math("ABSOLUTE", ns.outputs["Z"]), 0.6), g.math("GREATER_THAN", y, 0.05))
    col = g.mix(paper, col, (0.62, 0.53, 0.38, 1))
    col = g.mix(gilt, col, (0.85, 0.62, 0.26, 1))
    g.set("Base Color", col)
    g.set("Metallic", gilt)
    g.set("Roughness", g.mixf(gilt, 0.62, 0.25))
    g.b.inputs["Coat Weight"].default_value = 0.15
    return runtime(g.m, kind="bindings", palette=[list(c) for c in pal], label=[0.03, 0.01, 0.006],
                   paper=[0.62, 0.53, 0.38], gilt=[0.85, 0.62, 0.26], coat=0.15)


def fill_shelf(prefix, x0, x1, z, clear, depth_max, c, rnd, y_front=0.0):
    """Books standing on a shelf; local frame (spines face -y at y_front)."""
    mat = binding_material()
    x = x0 + rnd.uniform(0, 0.08)
    k = 0
    while x < x1 - 0.2:
        r = rnd.random()
        if r < 0.06 and x < x1 - 2.0:
            zz = z
            sw = rnd.uniform(1.6, 2.0)
            for j in range(rnd.randint(2, 4)):
                t = rnd.uniform(0.18, 0.32)
                d = rnd.uniform(1.4, depth_max)
                b = box(f"{prefix} stack {k}-{j}", (x, y_front, zz), (x + sw - rnd.uniform(0, 0.25), y_front + d, zz + t), mat, c, 0.02)
                zz += t
            x += sw + 0.05
            k += 1
            continue
        if r < 0.1:
            x += rnd.uniform(0.08, 0.3)
            continue
        w = rnd.choice([rnd.uniform(0.18, 0.3), rnd.uniform(0.3, 0.45), rnd.uniform(0.45, 0.65)])
        if x + w > x1:
            break
        h = min(clear - 0.15, clear * rnd.uniform(0.68, 0.97))
        d = rnd.uniform(1.4, depth_max)
        yf = y_front + rnd.uniform(0.0, 0.12)
        b = box(f"{prefix} book {k}", (x, yf, z), (x + w, yf + d, z + h), mat, c, min(0.03, w * 0.2))
        x += w + rnd.uniform(0.0, 0.02)
        k += 1


def bookcase(name, x_center, width, height, M, c, seed=7, shelves=None):
    """Glazed library bookcase, local frame: back against y=0, front at y=-3.2."""
    rnd = random.Random(seed)
    D = 3.2
    x0, x1 = x_center - width / 2, x_center + width / 2
    base_h = 7.5
    zt = FLOOR + height
    # carcass
    box(f"{name} plinth", (x0 - 0.2, -D - 0.25, FLOOR), (x1 + 0.2, 0, FLOOR + 0.9), M["mahogany"], c, 0.06, 3)
    box(f"{name} base", (x0, -D, FLOOR + 0.9), (x1, 0, FLOOR + base_h), M["mahogany"], c, 0.04)
    nd = 2 if width < 9 else 3
    for i in range(nd):
        a = x0 + 0.25 + i * (width - 0.5) / nd
        b = a + (width - 0.5) / nd - 0.1
        box(f"{name} door {i}", (a, -D - 0.1, FLOOR + 1.2), (b, -D, FLOOR + base_h - 0.4), M["mahogany"], c, 0.04)
        box(f"{name} door field {i}", (a + 0.35, -D - 0.16, FLOOR + 1.6), (b - 0.35, -D - 0.08, FLOOR + base_h - 0.8), M["rosewood"], c, 0.08, 3)
        box(f"{name} door bead {i}", (a + 0.28, -D - 0.13, FLOOR + 1.53), (b - 0.28, -D - 0.1, FLOOR + base_h - 0.73), M["gilt"], c, 0.02)
        sphere(f"{name} knob {i}", (b - 0.25 if i % 2 == 0 else a + 0.25, -D - 0.22, FLOOR + base_h * 0.55), 0.09, M["brass"], c)
    box(f"{name} waist", (x0 - 0.15, -D - 0.45, FLOOR + base_h), (x1 + 0.15, 0, FLOOR + base_h + 0.4), M["mahogany"], c, 0.1, 3)
    # upper glazed section
    uz0 = FLOOR + base_h + 0.4
    box(f"{name} back", (x0, -0.2, uz0), (x1, 0, zt), M["velvet_green"], c)
    for s, xx in (("L", x0), ("R", x1 - 0.3)):
        box(f"{name} side {s}", (xx, -2.6, uz0), (xx + 0.3, 0, zt), M["mahogany"], c, 0.03)
    sh = shelves or max(3, int((zt - uz0 - 0.6) / 2.9))
    pitch = (zt - uz0 - 0.5) / sh
    for k in range(sh):
        z = uz0 + k * pitch
        box(f"{name} shelf {k}", (x0 + 0.3, -2.6, z), (x1 - 0.3, -0.2, z + 0.12), M["mahogany"], c, 0.02)
        fill_shelf(f"{name} s{k}", x0 + 0.35, x1 - 0.35, z + 0.12, pitch - 0.12, 2.2, c, rnd, y_front=-2.45)
    # open shelves: a brass rail lip per shelf and a shelf light under the cornice
    for k in range(sh):
        z = uz0 + k * pitch
        box(f"{name} shelf lip {k}", (x0 + 0.3, -2.68, z + 0.1), (x1 - 0.3, -2.6, z + 0.22), M["brass"], c)
    L = bpy.data.lights.new(f"{name} shelf light", "AREA")
    L.shape = "RECTANGLE"
    L.size, L.size_y = width - 0.8, 0.3
    L.energy = 30 * width
    L.color = (1.0, 0.8, 0.55)
    lo = bpy.data.objects.new(f"{name} shelf light", L)
    lo.location = ((x0 + x1) / 2, -3.3, zt - 0.2)
    lo.rotation_euler = (math.radians(-28), 0, 0)
    c.objects.link(lo)
    # cornice + gilt frieze + crest
    box(f"{name} frieze", (x0 - 0.1, -2.95, zt), (x1 + 0.1, 0, zt + 0.5), M["mahogany"], c, 0.03)
    box(f"{name} frieze gilt", (x0, -3.0, zt + 0.15), (x1, -2.94, zt + 0.35), M["gilt"], c)
    box(f"{name} cornice", (x0 - 0.45, -3.4, zt + 0.5), (x1 + 0.45, 0, zt + 0.95), M["mahogany"], c, 0.15, 4)


def painting(name, img_file, cx, cz, h, M, c, y=0.0, depth=0.35, border=None):
    """Gilt-framed oil painting on a wall in the local frame (wall at y, facing -y)."""
    path = os.path.join(PAINT_DIR, img_file)
    img = bpy.data.images.load(path, check_existing=True)
    w = h * img.size[0] / img.size[1]
    br = border or max(0.45, h * 0.12)
    # moulded frame: four bevelled members
    for nm, (a, b, za, zb) in (("T", (cx - w / 2 - br, cx + w / 2 + br, cz + h / 2, cz + h / 2 + br)),
                               ("B", (cx - w / 2 - br, cx + w / 2 + br, cz - h / 2 - br, cz - h / 2)),
                               ("L", (cx - w / 2 - br, cx - w / 2, cz - h / 2, cz + h / 2)),
                               ("R", (cx + w / 2, cx + w / 2 + br, cz - h / 2, cz + h / 2))):
        box(f"{name} frame {nm}", (a, y - depth, za), (b, y, zb), M["gilt"], c, br * 0.35, 5)
    for sx in (-1, 1):
        for sz in (-1, 1):
            sphere(f"{name} rosette {sx}{sz}", (cx + sx * (w / 2 + br / 2), y - depth - 0.05, cz + sz * (h / 2 + br / 2)), br * 0.38, M["gilt"], c,
                   scale=(1, 0.35, 1))
    sphere(f"{name} crest", (cx, y - depth - 0.05, cz + h / 2 + br * 0.85), br * 0.6, M["gilt"], c, scale=(1.6, 0.3, 0.9))
    me = bpy.data.meshes.new(name)
    me.from_pydata([(cx - w / 2, y - depth * 0.4, cz - h / 2), (cx + w / 2, y - depth * 0.4, cz - h / 2),
                    (cx + w / 2, y - depth * 0.4, cz + h / 2), (cx - w / 2, y - depth * 0.4, cz + h / 2)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for li, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    g = G(name + " canvas")
    t = g.n("ShaderNodeTexImage")
    t.image = img
    g.L(g.n("ShaderNodeTexCoord").outputs["UV"], t.inputs["Vector"])
    g.set("Base Color", t.outputs[0])
    g.b.inputs["Roughness"].default_value = 0.42
    g.b.inputs["Coat Weight"].default_value = 0.3
    g.b.inputs["Coat Roughness"].default_value = 0.2
    nz = g.n("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 300
    bump = g.n("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    g.L(nz.outputs["Fac"], bump.inputs["Height"])
    g.set("Normal", bump.outputs[0])
    me.materials.append(g.m)
    # brass picture light above
    cyl(f"{name} picture light", (cx, y - 0.9, cz + h / 2 + br + 0.35), 0.18, 0.18, min(w * 0.6, 4.0), M["brass"], c, 24, rot=(0, math.pi / 2, 0))
    L = bpy.data.lights.new(f"{name} picture light", "AREA")
    L.shape = "RECTANGLE"
    L.size, L.size_y = min(w * 0.6, 4.0), 0.2
    L.energy = 40 + 6 * w
    L.color = (1.0, 0.82, 0.6)
    lo = bpy.data.objects.new(f"{name} picture light", L)
    lo.location = (cx, y - 1.1, cz + h / 2 + br + 0.2)
    lo.rotation_euler = (math.radians(35), 0, 0)
    c.objects.link(lo)
    return w


def globe(loc, M, c, tex_path):
    """Library globe on a carved tripod stand with brass meridian and horizon ring."""
    x, y, z = loc
    R = 2.0
    cz = z + 7.2
    for k in range(3):
        a = 2 * math.pi * k / 3
        cu = bpy.data.curves.new(f"globe leg {k}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.14
        cu.bevel_resolution = 4
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(2)
        pts = [(x + 0.4 * math.cos(a), y + 0.4 * math.sin(a), z + 4.8), (x + 1.6 * math.cos(a), y + 1.6 * math.sin(a), z + 2.5),
               (x + 2.4 * math.cos(a), y + 2.4 * math.sin(a), z + 0.25)]
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        o = bpy.data.objects.new(f"globe leg {k}", cu)
        c.objects.link(o)
        cu.materials.append(M["mahogany"])
        sphere(f"globe foot {k}", (x + 2.45 * math.cos(a), y + 2.45 * math.sin(a), z + 0.22), 0.25, M["brass"], c, scale=(1, 1, 0.8))
    lathe("globe pedestal", [(0, 0), (0.6, 0), (0.45, 0.4), (0.25, 0.8), (0.35, 1.4), (0.2, 2.0), (0.0, 2.1)], (x, y, z + 3.4), M["mahogany"], c, 32)
    ring = cyl("globe horizon ring", (x, y, cz), R + 0.55, R + 0.55, 0.12, M["mahogany"], c, 96, caps=False)
    ring.modifiers.new("s", "SOLIDIFY").thickness = 0.45
    paper = cyl("globe horizon paper", (x, y, cz + 0.065), R + 0.52, R + 0.52, 0.01, M["ivory"], c, 96)
    cyl("globe horizon hole", (x, y, cz + 0.07), R + 0.02, R + 0.02, 0.012, M["black_lacquer"], c, 96)
    box("globe horizon support A", (x - R - 0.6, y - 0.1, z + 5.2), (x - R - 0.4, y + 0.1, cz), M["mahogany"], c)
    box("globe horizon support B", (x + R + 0.4, y - 0.1, z + 5.2), (x + R + 0.6, y + 0.1, cz), M["mahogany"], c)
    mer = cyl("globe meridian", (x, y, cz), R + 0.15, R + 0.15, 0.06, M["brass"], c, 96, rot=(math.pi / 2, 0, 0), caps=False)
    mer.modifiers.new("s", "SOLIDIFY").thickness = 0.1
    mer.rotation_euler = (math.pi / 2, math.radians(23.4), 0)
    g = G("rc antique globe")
    t = g.n("ShaderNodeTexImage")
    t.image = bpy.data.images.load(tex_path, check_existing=True)
    t.projection = "SPHERE"
    g.L(g.n("ShaderNodeTexCoord").outputs["Object"], t.inputs["Vector"])
    g.set("Base Color", t.outputs[0])
    g.b.inputs["Roughness"].default_value = 0.35
    g.b.inputs["Coat Weight"].default_value = 0.6
    g.b.inputs["Coat Roughness"].default_value = 0.15
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=R, calc_uvs=True)
    me = bpy.data.meshes.new("globe")
    bm.to_mesh(me)
    bm.free()
    gl = bpy.data.objects.new("globe", me)
    c.objects.link(gl)
    gl.location = (x, y, cz)
    gl.rotation_euler = (0, math.radians(23.4), math.radians(95))
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(g.m)
