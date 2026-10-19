"""Ornate Victorian mahogany longcase clock (~2.25 m) with gilt-bronze mounts,
fluted columns, glazed trunk door showing pendulum and weights, arched
moon-phase dial and broken-arch pediment with ball-and-spire finials."""
import math
import os
import bpy
from geo import FLOOR, box, cyl, sphere, lathe, coll
from shell import Y_BACK, CLOCK_BAY
from mats import G, TEX

CX = CLOCK_BAY
YB = Y_BACK


def dial_material():
    g = G("rc longcase dial")
    t = g.n("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(TEX, "longcase-dial.jpg"), check_existing=True)
    t.extension = "CLIP"
    g.L(g.n("ShaderNodeTexCoord").outputs["UV"], t.inputs["Vector"])
    g.set("Base Color", t.outputs[0])
    g.b.inputs["Metallic"].default_value = 0.65
    g.b.inputs["Roughness"].default_value = 0.32
    return g.m


def uv_plane(name, x0, x1, z0, z1, y, mat, c):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for li, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    me.materials.append(mat)
    return o


def fluted_column(name, x, y, z0, h, r, M, c):
    lathe(name + " base", [(0, 0), (r * 1.5, 0), (r * 1.5, 0.12), (r * 1.2, 0.2), (r * 1.25, 0.3), (0, 0.3)], (x, y, z0), M["gilt"], c, 24)
    col = cyl(name + " shaft", (x, y, z0 + 0.3 + (h - 0.6) / 2), r, r * 0.9, h - 0.6, M["mahogany"], c, 24)
    # flutes via a displace-free trick: narrow gilt fillets
    for k in range(8):
        a = 2 * math.pi * k / 8
        cyl(name + f" fillet {k}", (x + r * 0.98 * math.cos(a), y + r * 0.98 * math.sin(a), z0 + 0.3 + (h - 0.6) / 2),
            0.012, 0.012, h - 0.8, M["gilt"], c, 6)
    lathe(name + " capital", [(0, 0), (r * 1.0, 0), (r * 1.6, 0.18), (r * 1.7, 0.3), (0, 0.3)], (x, y, z0 + h - 0.3), M["gilt"], c, 24)


def build(M):
    c = coll("longcase clock")
    y0 = YB - 3.0
    # plinth + bun feet
    box("clock plinth", (CX - 2.75, y0 - 0.15, FLOOR + 0.35), (CX + 2.75, YB, FLOOR + 0.95), M["mahogany"], c, 0.08, 3)
    for dx in (-2.4, 2.4):
        sphere(f"clock foot {dx}", (CX + dx, y0 + 0.25, FLOOR + 0.2), 0.32, M["gilt"], c, scale=(1, 1, 0.65))
    # base with burr panel and ormolu cartouche
    box("clock base", (CX - 2.45, y0, FLOOR + 0.95), (CX + 2.45, YB, FLOOR + 6.2), M["mahogany"], c, 0.06, 3)
    box("clock base panel", (CX - 1.8, y0 - 0.12, FLOOR + 1.6), (CX + 1.8, y0 + 0.05, FLOOR + 5.5), M["rosewood"], c, 0.15, 4)
    box("clock base panel gilt", (CX - 1.95, y0 - 0.08, FLOOR + 1.45), (CX + 1.95, y0 + 0.02, FLOOR + 5.65), M["gilt"], c, 0.04)
    sphere("clock cartouche", (CX, y0 - 0.15, FLOOR + 3.55), 0.6, M["gilt"], c, scale=(1, 0.18, 1.25))
    for dx in (-1.25, 1.25):
        sphere(f"clock acanthus {dx}", (CX + dx * 0.95, y0 - 0.12, FLOOR + 3.55), 0.35, M["gilt"], c, scale=(1.6, 0.15, 0.55))
    box("clock base moulding", (CX - 2.6, y0 - 0.25, FLOOR + 6.2), (CX + 2.6, YB, FLOOR + 6.7), M["mahogany"], c, 0.12, 4)
    # trunk with glazed door
    tz0, tz1 = FLOOR + 6.7, FLOOR + 15.2
    box("clock trunk", (CX - 1.9, y0 + 0.3, tz0), (CX + 1.9, YB, tz1), M["mahogany"], c, 0.05, 3)
    box("trunk interior", (CX - 1.4, y0 + 0.6, tz0 + 0.5), (CX + 1.4, YB - 0.1, tz1 - 0.4), M["velvet_red"], c)
    box("trunk door glass", (CX - 1.4, y0 + 0.22, tz0 + 0.5), (CX + 1.4, y0 + 0.26, tz1 - 0.4), M["glass"], c)
    for nm, a, b, za, zb in (("L", CX - 1.6, CX - 1.4, tz0 + 0.3, tz1 - 0.2), ("R", CX + 1.4, CX + 1.6, tz0 + 0.3, tz1 - 0.2),
                             ("B", CX - 1.6, CX + 1.6, tz0 + 0.3, tz0 + 0.5), ("T", CX - 1.6, CX + 1.6, tz1 - 0.4, tz1 - 0.2)):
        box(f"trunk door frame {nm}", (a, y0 + 0.12, za), (b, y0 + 0.32, zb), M["gilt"], c, 0.02)
    # pendulum + weights (brass)
    cyl("pendulum rod", (CX, y0 + 1.6, tz0 + 5.0), 0.04, 0.04, 7.5, M["brass"], c, 12)
    cyl("pendulum bob", (CX, y0 + 1.5, tz0 + 1.6), 0.7, 0.7, 0.12, M["gilt"], c, 48, rot=(math.pi / 2, 0, 0))
    for k, dx in enumerate((-0.85, 0.0, 0.85)):
        cyl(f"weight {k}", (CX + dx, y0 + 1.9, tz1 - 2.2 - 0.3 * k), 0.26, 0.26, 2.3, M["brass"], c, 32)
        cyl(f"weight chain {k}", (CX + dx, y0 + 1.9, tz1 - 0.55 - 0.15 * k), 0.015, 0.015, 1.0, M["brass"], c, 6)
    for nm, dx in (("L", -1.75), ("R", 1.75)):
        fluted_column(f"trunk column {nm}", CX + dx, y0 + 0.45, tz0, tz1 - tz0, 0.16, M, c)
    # hood
    hz0, hz1 = tz1, FLOOR + 20.4
    box("hood moulding", (CX - 2.55, y0 - 0.3, hz0), (CX + 2.55, YB, hz0 + 0.55), M["mahogany"], c, 0.12, 4)
    box("hood body", (CX - 2.25, y0, hz0 + 0.55), (CX + 2.25, YB, hz1), M["mahogany"], c, 0.05, 3)
    # dial: square + arch (texture is 1024 x 1300 → width 3.4, height 4.32)
    dw, dh = 3.4, 3.4 * 1300 / 1024
    dz0 = hz0 + 0.85
    uv_plane("clock dial", CX - dw / 2, CX + dw / 2, dz0, dz0 + dh, y0 - 0.06, dial_material(), c)
    box("dial glass", (CX - dw / 2, y0 - 0.25, dz0), (CX + dw / 2, y0 - 0.22, dz0 + dh), M["glass"], c)
    # dial door frame (gilt) incl. arch ring
    box("dial frame bottom", (CX - dw / 2 - 0.15, y0 - 0.32, dz0 - 0.15), (CX + dw / 2 + 0.15, y0 - 0.05, dz0), M["gilt"], c, 0.03)
    for nm, xa in (("L", CX - dw / 2 - 0.15), ("R", CX + dw / 2)):
        box(f"dial frame {nm}", (xa, y0 - 0.32, dz0), (xa + 0.15, y0 - 0.05, dz0 + dw), M["gilt"], c, 0.03)
    # Gilt bezel around the printed chapter ring: centred on the hands' arbor
    # (the ring's centre is 1.70 above the dial bottom in longcase-dial.jpg,
    # outer radius 1.556). It used to sit 1.7 higher, around the moon dial.
    ring = cyl("dial arch ring", (CX, y0 - 0.18, dz0 + dw / 2), 1.561, 1.561, 0.25, M["gilt"], c, 64, rot=(math.pi / 2, 0, 0), caps=False)
    # hands (blued steel), ten past ten
    blued = M.get("blued") or M["iron"]
    hc = (CX, y0 - 0.1, dz0 + dw / 2)
    for nm, L, ang, w in (("hour", 0.95, math.radians(-60), 0.09), ("minute", 1.35, math.radians(60), 0.06)):
        h = box(f"clock {nm} hand", (-w / 2, -0.01, -L / 2), (w / 2, 0.01, L / 2), blued, c)
        h.location = (hc[0] + math.sin(ang) * L / 2, hc[1], hc[2] + math.cos(ang) * L / 2)
        h.rotation_euler = (0, ang, 0)
    # hood columns + capitals
    for nm, dx in (("L", -2.05), ("R", 2.05)):
        fluted_column(f"hood column {nm}", CX + dx, y0 + 0.05, hz0 + 0.55, hz1 - hz0 - 0.55, 0.14, M, c)
    # cornice + broken swan-neck pediment + finials
    box("hood cornice", (CX - 2.6, y0 - 0.35, hz1), (CX + 2.6, YB, hz1 + 0.5), M["mahogany"], c, 0.15, 4)
    for s in (-1, 1):
        cyl(f"swan neck {s}", (CX + s * 1.25, y0 + 0.2, hz1 + 1.05), 0.75, 0.75, 0.5, M["mahogany"], c, 40, rot=(math.pi / 2, 0, 0))
        sphere(f"swan rosette {s}", (CX + s * 0.75, y0 - 0.1, hz1 + 1.2), 0.18, M["gilt"], c, scale=(1, 0.5, 1))
    for k, (dx, sc) in enumerate(((-2.3, 0.8), (0.0, 1.15), (2.3, 0.8))):
        lathe(f"clock finial {k}", [(0, 0), (0.22 * sc, 0), (0.22 * sc, 0.15 * sc), (0.12 * sc, 0.25 * sc), (0.3 * sc, 0.55 * sc),
                                    (0.12 * sc, 0.85 * sc), (0.05 * sc, 1.3 * sc), (0, 1.55 * sc)],
              (CX + dx, y0 + 0.1, hz1 + 0.5 + (0.6 if dx == 0 else 0)), M["gilt"], c, 24)
    box("finial plinth centre", (CX - 0.35, y0 - 0.1, hz1 + 0.5), (CX + 0.35, y0 + 0.5, hz1 + 1.1), M["mahogany"], c, 0.05)
