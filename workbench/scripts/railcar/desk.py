"""Partners' pedestal desk in figured mahogany with gilt-bronze mounts and a
tooled, gilt-bordered leather writing surface.  Top surface stays at z = -1.4
and footprint x -8..8, y -3.3..5.8 so the live jewellery layout is unchanged."""
import math
import bpy
from geo import FLOOR, DESK_TOP, box, cyl, sphere, lathe, coll
from mats import G

CARPET_TOP = FLOOR + 0.04


def leather_top(ph):
    tex = ph.texture("brown_leather")
    g = G("rc tooled green leather")
    tc = g.n("ShaderNodeTexCoord")
    sep = g.n("ShaderNodeSeparateXYZ")
    g.L(tc.outputs["UV"], sep.inputs[0])
    W, H = 14.4, 7.5
    u = g.math("MULTIPLY", sep.outputs["X"], W)
    v = g.math("MULTIPLY", sep.outputs["Y"], H)
    de = g.math("MINIMUM", g.math("MINIMUM", u, g.math("SUBTRACT", W, u)), g.math("MINIMUM", v, g.math("SUBTRACT", H, v)))

    def band(cv, w):
        return g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", de, cv)), w)

    # double fillet + a blind-tooled (dark) Greek-key-ish dotted band
    gilt = g.math("MAXIMUM", band(0.22, 0.025), band(0.40, 0.012))
    dots_u = g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", g.math("FRACT", g.math("MULTIPLY", g.math("ADD", u, v), 4.0)), 0.5)), 0.18)
    dots = g.math("MULTIPLY", band(0.31, 0.02), dots_u)
    gilt = g.math("MAXIMUM", gilt, dots)
    blind = band(0.55, 0.03)
    # leather grain from the photographed texture (value only), recoloured green
    mp = g.n("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (W / 3.0, H / 3.0, 1)
    g.L(tc.outputs["UV"], mp.inputs["Vector"])
    diff = g.img(tex["Diffuse"], mp.outputs[0], box=False)
    bw = g.n("ShaderNodeRGBToBW")
    g.L(diff.outputs[0], bw.inputs[0])
    rng = g.n("ShaderNodeMapRange")
    rng.inputs["From Min"].default_value = 0.05
    rng.inputs["From Max"].default_value = 0.35
    g.L(bw.outputs[0], rng.inputs["Value"])
    # gentle wear / patina towards the sitter
    nz = g.n("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1.2
    nz.inputs["Detail"].default_value = 5
    g.L(tc.outputs["UV"], nz.inputs["Vector"])
    leather = g.mix(rng.outputs[0], (0.012, 0.038, 0.022, 1), (0.05, 0.11, 0.065, 1))
    leather = g.mix(g.math("MULTIPLY", nz.outputs["Fac"], 0.35), leather, (0.06, 0.07, 0.04, 1))
    leather = g.mix(g.math("MULTIPLY", blind, 0.6), leather, (0.004, 0.012, 0.008, 1))
    col = g.mix(gilt, leather, (0.85, 0.60, 0.25, 1))
    g.set("Base Color", col)
    g.set("Metallic", gilt)
    rough = g.img(tex["Rough"], mp.outputs[0], "Non-Color", box=False) if "Rough" in tex else None
    if rough:
        g.set("Roughness", g.mixf(gilt, g.math("ADD", g.math("MULTIPLY", rough.outputs[0], 0.5), 0.3), 0.3))
    if "nor_gl" in tex:
        nm = g.n("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 2.6
        g.L(g.img(tex["nor_gl"], mp.outputs[0], "Non-Color", box=False).outputs[0], nm.inputs["Color"])
        bump = g.n("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.4
        bump.inputs["Distance"].default_value = 0.01
        g.L(g.math("SUBTRACT", 0.0, g.math("MAXIMUM", gilt, blind)), bump.inputs["Height"])
        g.L(nm.outputs[0], bump.inputs["Normal"])
        g.set("Normal", bump.outputs[0])
    g.b.inputs["Coat Weight"].default_value = 0.2
    g.b.inputs["Sheen Weight"].default_value = 0.25
    g.b.inputs["Coat Roughness"].default_value = 0.4
    return g.m


def drawer(name, x0, x1, z0, z1, y, M, c, pulls=2):
    box(name, (x0, y - 0.12, z0), (x1, y, z1), M["mahogany"], c, 0.05, 3)
    box(name + " field", (x0 + 0.25, y - 0.2, z0 + 0.2), (x1 - 0.25, y - 0.1, z1 - 0.2), M["rosewood"], c, 0.06, 3)
    box(name + " bead", (x0 + 0.18, y - 0.16, z0 + 0.15), (x1 - 0.18, y - 0.12, z1 - 0.15), M["gilt"], c, 0.02)
    xs = [(x0 + x1) / 2] if pulls == 1 else [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75]
    zc = (z0 + z1) / 2
    for k, xx in enumerate(xs):
        sphere(f"{name} backplate {k}", (xx, y - 0.2, zc + 0.05), 0.32, M["brass"], c, scale=(1.4, 0.12, 0.8))
        t = cyl(f"{name} bail {k}", (xx, y - 0.32, zc - 0.12), 0.26, 0.26, 0.05, M["brass"], c, 32, rot=(math.pi / 2, 0, 0), caps=False)
        t.modifiers.new("solid", "SOLIDIFY").thickness = 0.05
    sphere(f"{name} escutcheon", ((x0 + x1) / 2, y - 0.2, z1 - 0.38), 0.11, M["brass"], c, scale=(0.8, 0.2, 1.3))


def build(M, ph):
    c = coll("partners desk")
    top_z = DESK_TOP
    # top slab with moulded edge + gilt under-bead
    box("desk top", (-8.0, -3.3, top_z - 0.5), (8.0, 5.8, top_z - 0.005), M["mahogany"], c, 0.14, 5)
    box("desk top bead", (-7.9, -3.22, top_z - 0.62), (7.9, 5.72, top_z - 0.5), M["gilt"], c, 0.03)
    # leather writing surface with UVs
    me = bpy.data.meshes.new("desk leather")
    x0, x1, y0, y1 = -7.2, 7.2, -2.5, 5.0
    me.from_pydata([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for li, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    o = bpy.data.objects.new("desk leather", me)
    o.location = (0, 0, top_z + 0.001)
    c.objects.link(o)
    me.materials.append(leather_top(ph))
    # frieze drawers
    fz0, fz1 = top_z - 2.0, top_z - 0.62
    yf = -3.15
    box("desk frieze carcass", (-7.8, yf, fz0), (7.8, 5.6, fz1), M["mahogany_dark"], c)
    drawer("frieze drawer L", -7.6, -4.15, fz0 + 0.1, fz1 - 0.08, yf, M, c)
    drawer("frieze drawer C", -3.95, 3.95, fz0 + 0.1, fz1 - 0.08, yf, M, c)
    drawer("frieze drawer R", 4.15, 7.6, fz0 + 0.1, fz1 - 0.08, yf, M, c)
    # pedestals
    pz0, pz1 = CARPET_TOP + 0.55, fz0
    for side, (a, b) in (("L", (-7.8, -4.0)), ("R", (4.0, 7.8))):
        box(f"pedestal {side}", (a, -3.0, pz0), (b, 5.5, pz1), M["mahogany"], c, 0.05, 3)
        n = 3
        hs = (pz1 - pz0 - 0.3) / n
        for k in range(n):
            za = pz0 + 0.15 + k * hs
            drawer(f"pedestal {side} drawer {k}", a + 0.25, b - 0.25, za + 0.06, za + hs - 0.06, -3.02, M, c)
        for xx in (a - 0.02, b + 0.02):
            lathe(f"pedestal colonette {side} {xx}", [(0, 0), (0.2, 0), (0.2, 0.2), (0.13, 0.3), (0.13, pz1 - pz0 - 0.5), (0.2, pz1 - pz0 - 0.35), (0.2, pz1 - pz0 - 0.2), (0, pz1 - pz0 - 0.2)],
                  (xx, -3.15, pz0 + 0.1), M["mahogany"], c, 24)
            cyl(f"colonette capital {side} {xx}", (xx, -3.15, pz1 - 0.2), 0.24, 0.2, 0.25, M["gilt"], c, 24)
            cyl(f"colonette base {side} {xx}", (xx, -3.15, pz0 + 0.2), 0.22, 0.24, 0.2, M["gilt"], c, 24)
        # side panel field
        box(f"pedestal side field {side}", (a - 0.05 if side == "L" else b - 0.05, -2.4, pz0 + 0.5), (a + 0.05 if side == "L" else b + 0.05, 4.9, pz1 - 0.5), M["rosewood"], c, 0.05)
        # plinth on bun feet
        box(f"plinth {side}", (a - 0.2, -3.35, CARPET_TOP + 0.25), (b + 0.2, 5.65, pz0), M["mahogany"], c, 0.08, 3)
        box(f"plinth gilt {side}", (a - 0.22, -3.37, pz0 - 0.08), (b + 0.22, 5.67, pz0), M["gilt"], c, 0.02)
        for xx in (a, b):
            for yy in (-3.1, 5.4):
                sphere(f"bun foot {side} {xx} {yy}", (xx, yy, CARPET_TOP + 0.14), 0.24, M["mahogany_dark"], c, scale=(1, 1, 0.6))
    box("kneehole back", (-4.0, 5.2, pz0 + 0.5), (4.0, 5.5, pz1), M["mahogany"], c, 0.04)
    # The removable bench pin and its clamp are put away for this viewing set.
    # They intruded at both yaw extremes and drew attention from the jewellery.
