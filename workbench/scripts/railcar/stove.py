"""Marble chimneypiece enclosing a nickel-trimmed parlour stove with glowing mica
windows (cars were heated by enclosed coal stoves / Baker heaters, not open
fires), with overmantel mirror, brass fender, spark guard, fire irons and
helmet coal scuttle."""
import math
import bpy
from geo import FLOOR, box, cyl, sphere, lathe, coll
from shell import Y_BACK, STOVE_BAY

CX = STOVE_BAY
Y = Y_BACK


def build(M):
    c = coll("stove + chimneypiece")
    x0, x1 = CX - 4.1, CX + 4.1
    # hearth
    box("hearth", (x0 - 0.3, Y - 3.8, FLOOR), (x1 + 0.3, Y, FLOOR + 0.25), M["marble_dark"], c, 0.05, 3)
    # jambs with corbels
    for nm, a, b in (("L", x0, x0 + 1.25), ("R", x1 - 1.25, x1)):
        box(f"jamb {nm}", (a, Y - 1.0, FLOOR + 0.25), (b, Y, 0.2), M["marble"], c, 0.05, 3)
        box(f"jamb slip {nm}", (a + 0.25, Y - 1.05, FLOOR + 1.0), (b - 0.25, Y - 0.98, -0.6), M["marble_dark"], c, 0.03)
        box(f"corbel {nm}", (a + 0.1, Y - 1.35, -0.6), (b - 0.1, Y - 0.95, 0.2), M["marble"], c, 0.12, 4)
        box(f"plinth {nm}", (a - 0.1, Y - 1.15, FLOOR + 0.25), (b + 0.1, Y, FLOOR + 1.0), M["marble"], c, 0.05, 3)
    box("frieze", (x0, Y - 1.0, 0.2), (x1, Y, 1.55), M["marble"], c, 0.04, 3)
    box("frieze tablet", (CX - 1.3, Y - 1.08, 0.4), (CX + 1.3, Y - 0.98, 1.35), M["marble_dark"], c, 0.05, 3)
    box("shelf", (x0 - 0.45, Y - 1.65, 1.55), (x1 + 0.45, Y, 1.95), M["marble"], c, 0.1, 4)
    # cast-iron stove front set into the opening
    ox0, ox1 = x0 + 1.25, x1 - 1.25
    box("stove back", (ox0, Y - 0.35, FLOOR + 0.25), (ox1, Y, 0.2), M["iron"], c)
    box("stove frame", (ox0 + 0.15, Y - 0.6, FLOOR + 1.1), (ox1 - 0.15, Y - 0.35, -0.9), M["iron"], c, 0.08, 3)
    # mica windows: 3 x 2 glowing panes in a nickel grid
    gx0, gx1, gz0, gz1 = ox0 + 0.55, ox1 - 0.55, FLOOR + 2.6, -2.6
    box("mica glow", (gx0, Y - 0.62, gz0), (gx1, Y - 0.58, gz1), M["mica_glow"], c)
    for i in range(4):
        xx = gx0 + (gx1 - gx0) * i / 3
        box(f"mica mullion {i}", (xx - 0.07, Y - 0.72, gz0), (xx + 0.07, Y - 0.6, gz1), M["nickel"], c, 0.02)
    for k in range(3):
        zz = gz0 + (gz1 - gz0) * k / 2
        box(f"mica rail {k}", (gx0, Y - 0.72, zz - 0.07), (gx1, Y - 0.6, zz + 0.07), M["nickel"], c, 0.02)
    # arched cast hood + crest
    cyl("stove hood arch", (CX, Y - 0.55, -2.2), 1.6, 1.6, 0.3, M["iron"], c, 48, rot=(math.pi / 2, 0, 0))
    box("stove nickel rail", (ox0 + 0.1, Y - 0.85, -1.1), (ox1 - 0.1, Y - 0.6, -0.9), M["nickel"], c, 0.05, 3)
    sphere("stove crest urn", (CX, Y - 0.7, -0.55), 0.3, M["nickel"], c, scale=(1, 0.6, 1.1))
    # ash-pit door with grille
    box("ash door", (ox0 + 0.5, Y - 0.7, FLOOR + 0.6), (ox1 - 0.5, Y - 0.6, FLOOR + 2.2), M["iron"], c, 0.04)
    for i in range(9):
        xx = ox0 + 0.8 + i * (ox1 - ox0 - 1.6) / 8
        box(f"ash grille {i}", (xx - 0.03, Y - 0.78, FLOOR + 0.9), (xx + 0.03, Y - 0.7, FLOOR + 1.9), M["nickel"], c)
    # fire glow lights
    L = bpy.data.lights.new("stove glow", "AREA")
    L.shape = "RECTANGLE"
    L.size, L.size_y = gx1 - gx0, gz1 - gz0
    L.energy = 90
    L.color = (1.0, 0.45, 0.14)
    lo = bpy.data.objects.new("stove glow", L)
    lo.location = (CX, Y - 0.9, (gz0 + gz1) / 2)
    lo.rotation_euler = (math.radians(90), 0, 0)
    c.objects.link(lo)
    # overmantel: carved mahogany frame + bevelled mirror + pediment
    mx0, mx1, mz0, mz1 = x0 + 0.2, x1 - 0.2, 2.3, 11.6
    box("overmantel back", (mx0 - 0.4, Y - 0.35, 1.95), (mx1 + 0.4, Y, mz1 + 0.6), M["mahogany"], c, 0.05)
    mir = bpy.data.materials.get("rc mirror") or bpy.data.materials.new("rc mirror")
    mir.use_nodes = True
    bsdf = mir.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.02
    bsdf.inputs["Base Color"].default_value = (0.32, 0.30, 0.27, 1)
    box("overmantel mirror", (mx0 + 0.6, Y - 0.45, mz0 + 0.6), (mx1 - 0.6, Y - 0.38, mz1 - 0.8), mir, c, 0.08, 2)
    for nm, a in (("L", mx0), ("R", mx1 - 0.6)):
        box(f"overmantel stile {nm}", (a, Y - 0.7, mz0), (a + 0.6, Y - 0.35, mz1), M["mahogany"], c, 0.06, 3)
        lathe(f"overmantel column {nm}", [(0.0, 0), (0.22, 0), (0.22, 0.3), (0.16, 0.45), (0.14, 3.0), (0.17, 6.2), (0.14, 6.6), (0.24, 6.9), (0.24, 7.2), (0.0, 7.2)],
              (a + 0.3, Y - 0.95, mz0 + 0.6), M["mahogany"], c, 24)
        box(f"column capital {nm}", (a, Y - 1.25, mz0 + 7.8), (a + 0.6, Y - 0.65, mz0 + 8.2), M["gilt"], c, 0.05, 2)
    box("overmantel rail low", (mx0, Y - 0.7, mz0), (mx1, Y - 0.35, mz0 + 0.6), M["mahogany"], c, 0.06, 3)
    box("overmantel rail top", (mx0, Y - 0.7, mz1 - 0.8), (mx1, Y - 0.35, mz1), M["mahogany"], c, 0.06, 3)
    box("mirror gilt slip", (mx0 + 0.5, Y - 0.5, mz0 + 0.5), (mx1 - 0.5, Y - 0.46, mz1 - 0.7), M["gilt"], c, 0.04)
    box("overmantel cornice", (mx0 - 0.5, Y - 1.1, mz1), (mx1 + 0.5, Y - 0.3, mz1 + 0.45), M["mahogany"], c, 0.12, 4)
    # broken-arch pediment and finials
    for s in (-1, 1):
        cyl(f"pediment scroll {s}", (CX + s * 1.6, Y - 0.6, mz1 + 0.9), 0.55, 0.55, 0.5, M["mahogany"], c, 32, rot=(math.pi / 2, 0, 0))
        lathe(f"finial {s}", [(0, 0), (0.18, 0), (0.18, 0.12), (0.1, 0.2), (0.22, 0.45), (0.1, 0.7), (0.04, 1.0), (0, 1.15)],
              (CX + s * 3.6, Y - 0.7, mz1 + 0.45), M["gilt"], c, 24)
    lathe("pediment urn", [(0, 0), (0.25, 0), (0.25, 0.1), (0.12, 0.2), (0.35, 0.55), (0.22, 0.85), (0.08, 1.0), (0.12, 1.15), (0, 1.35)],
          (CX, Y - 0.7, mz1 + 0.45), M["gilt"], c, 32)
    # brass curb fender
    fy = Y - 3.6
    box("fender front", (x0 - 0.1, fy, FLOOR + 0.25), (x1 + 0.1, fy + 0.18, FLOOR + 0.75), M["brass"], c, 0.06, 3)
    for nm, xx in (("L", x0 - 0.1), ("R", x1 - 0.08)):
        box(f"fender return {nm}", (xx, fy, FLOOR + 0.25), (xx + 0.18, Y - 1.1, FLOOR + 0.75), M["brass"], c, 0.06, 3)
    for xx in (x0 + 0.3, x1 - 0.3):
        sphere(f"fender ball {xx}", (xx, fy + 0.09, FLOOR + 0.88), 0.16, M["brass"], c)
    # three-leaf spark guard: brass frames + wire mesh
    import bmesh
    for k, (a, b, ang) in enumerate(((ox0 - 1.2, ox0 + 0.5, 0.35), (ox0 + 0.5, ox1 - 0.5, 0.0), (ox1 - 0.5, ox1 + 1.2, -0.35))):
        w = b - a
        h = 4.6
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=int(w * 7), y_segments=int(h * 7), size=0.5)
        for v in bm.verts:
            v.co.x *= w
            v.co.y *= h
        gm = bpy.data.meshes.new(f"guard mesh {k}")
        bm.to_mesh(gm)
        bm.free()
        go = bpy.data.objects.new(f"guard mesh {k}", gm)
        c.objects.link(go)
        go.location = ((a + b) / 2, Y - 2.6 - abs(ang) * 1.2, FLOOR + 0.3 + h / 2)
        go.rotation_euler = (math.pi / 2, 0, ang)
        wf = go.modifiers.new("wire", "WIREFRAME")
        wf.thickness = 0.012
        gm.materials.append(M["brass_aged"])
        for nm, (fx0, fz0, fx1, fz1) in (("t", (-w / 2, h / 2 - 0.12, w / 2, h / 2)), ("b", (-w / 2, -h / 2, w / 2, -h / 2 + 0.12)),
                                           ("l", (-w / 2, -h / 2, -w / 2 + 0.12, h / 2)), ("r", (w / 2 - 0.12, -h / 2, w / 2, h / 2))):
            fb = box(f"guard frame {k} {nm}", (fx0, fz0, -0.05), (fx1, fz1, 0.05), M["brass"], c, 0.03)
            fb.parent = go
            fb.matrix_parent_inverse.identity()
        sphere(f"guard knob {k}", ((a + b) / 2, Y - 2.6 - abs(ang) * 1.2, FLOOR + 0.3 + h + 0.15), 0.12, M["brass"], c)
    # companion set: stand with poker, tongs, shovel, brush
    sx, sy = x1 + 1.3, Y - 2.4
    lathe("companion base", [(0, 0), (0.6, 0), (0.6, 0.12), (0.35, 0.25), (0.12, 0.35), (0, 0.35)], (sx, sy, FLOOR + 0.25), M["brass"], c)
    cyl("companion stem", (sx, sy, FLOOR + 3.3), 0.06, 0.06, 6.0, M["brass"], c, 16)
    sphere("companion top", (sx, sy, FLOOR + 6.4), 0.18, M["brass"], c)
    box("companion hanger", (sx - 0.5, sy - 0.04, FLOOR + 5.9), (sx + 0.5, sy + 0.04, FLOOR + 6.0), M["brass"], c)
    for k, dx in enumerate((-0.45, -0.15, 0.15, 0.45)):
        cyl(f"fire iron {k}", (sx + dx, sy, FLOOR + 3.6), 0.035, 0.035, 4.6, M["iron"] if k % 2 else M["brass_aged"], c, 12)
        sphere(f"fire iron knob {k}", (sx + dx, sy, FLOOR + 5.95), 0.09, M["brass"], c)
    box("shovel blade", (sx - 0.62, sy - 0.25, FLOOR + 1.1), (sx - 0.28, sy + 0.25, FLOOR + 1.4), M["brass_aged"], c, 0.03)
    cyl("brush head", (sx + 0.45, sy, FLOOR + 1.2), 0.2, 0.14, 0.7, M["black_lacquer"], c, 16)
    # helmet coal scuttle
    lathe("coal scuttle", [(0, 0), (0.75, 0), (0.85, 0.2), (0.95, 0.9), (0.9, 1.5), (0.7, 1.8), (0.0, 1.8)],
          (x0 - 1.4, Y - 2.6, FLOOR + 0.25), M["brass"], c, 40)
    cyl("scuttle handle", (x0 - 1.4, Y - 2.6, FLOOR + 2.3), 0.05, 0.05, 1.6, M["brass"], c, 12, rot=(0, math.pi / 2, 0))
