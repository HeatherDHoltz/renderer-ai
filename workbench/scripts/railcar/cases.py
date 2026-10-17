"""The two cantilever jewellery boxes, shown open, at the runtime case positions.

Inspired by Victorian spring-loaded / cantilever boxes (coromandel and
rosewood with brass): opening the lid lifts two tiers of trays that step up
and outward on brass parallel arms.  Gem box (12 stones) at Blender
(-2.85,-1.45); ring box (6 alloys x 3 finishes) at (3.05,-1.4)."""
import math
import bmesh
import bpy
from geo import DESK_TOP, box, cyl, sphere, lathe, coll
from mats import G, _pbr

GEMS = [  # name, colour, ior, absorption density, cut
    ("diamond", (1.0, 1.0, 1.0), 2.417, 0.0, "round"),
    ("emerald", (0.08, 0.72, 0.30), 1.58, 6.0, "emerald"),
    ("ruby", (0.86, 0.02, 0.07), 1.77, 7.0, "oval"),
    ("blue sapphire", (0.05, 0.14, 0.85), 1.77, 7.0, "cushion"),
    ("aquamarine", (0.45, 0.82, 0.95), 1.58, 2.5, "emerald"),
    ("amethyst", (0.55, 0.18, 0.85), 1.54, 5.0, "round"),
    ("peridot", (0.52, 0.85, 0.08), 1.67, 4.0, "oval"),
    ("tsavorite", (0.06, 0.78, 0.16), 1.74, 6.0, "round"),
    ("spessartine", (1.0, 0.38, 0.04), 1.80, 5.0, "cushion"),
    ("pink spinel", (1.0, 0.32, 0.52), 1.72, 4.0, "oval"),
    ("tanzanite", (0.30, 0.22, 0.92), 1.69, 6.0, "cushion"),
    ("tiger's eye", (0.55, 0.30, 0.06), 1.54, 0.0, "cabochon"),
]
METALS = [("yellow gold", (1.0, 0.77, 0.34)), ("rose gold", (0.98, 0.62, 0.48)), ("silver", (0.97, 0.96, 0.94)),
          ("platinum", (0.82, 0.81, 0.79)), ("titanium", (0.62, 0.58, 0.55)), ("oxidised silver", (0.32, 0.31, 0.30))]
FINISHES = [("polished", 0.05, 0.0), ("satin", 0.22, 0.0), ("brushed", 0.32, 0.8)]


def gem_material(name, col, ior, dens):
    g = G(f"rc gem {name}")
    if name == "tiger's eye":
        nz = g.n("ShaderNodeTexWave")
        nz.inputs["Scale"].default_value = 30
        nz.inputs["Distortion"].default_value = 6
        g.L(g.obj_vec(1.0), nz.inputs["Vector"])
        g.set("Base Color", g.mix(nz.outputs["Fac"], (0.18, 0.08, 0.01, 1), (0.85, 0.55, 0.12, 1)))
        g.b.inputs["Roughness"].default_value = 0.15
        g.b.inputs["Anisotropic"].default_value = 0.9
        g.b.inputs["Coat Weight"].default_value = 1.0
        return g.m
    g.b.inputs["Base Color"].default_value = (*col, 1)
    g.b.inputs["Transmission Weight"].default_value = 1.0
    g.b.inputs["Roughness"].default_value = 0.0
    g.b.inputs["IOR"].default_value = ior
    if "Dispersion" in g.b.inputs:
        g.b.inputs["Dispersion"].default_value = 0.04 if name == "diamond" else 0.015
    if dens:
        v = g.n("ShaderNodeVolumeAbsorption")
        v.inputs["Color"].default_value = (*col, 1)
        v.inputs["Density"].default_value = dens
        g.L(v.outputs[0], g.out.inputs["Volume"])
    return g.m


def faceted(name, cut, r, mat, c, loc):
    bm = bmesh.new()
    seg = 16
    if cut == "cabochon":
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
        for v in bm.verts:
            v.co.z = max(v.co.z, 0.0) * 0.7
            v.co.x *= 1.25
    elif cut == "emerald":
        # step cut: stacked chamfered rectangles
        layers = [(1.0, 0.0), (0.82, 0.28), (0.62, 0.38), (0.85, -0.25), (0.5, -0.55), (0.2, -0.7)]
        rings = []
        for s, z in layers:
            w, d = r * 1.35 * s, r * 0.95 * s
            ch = 0.28 * min(w, d)
            pts = [(-w + ch, -d), (w - ch, -d), (w, -d + ch), (w, d - ch), (w - ch, d), (-w + ch, d), (-w, d - ch), (-w, -d + ch)]
            rings.append([bm.verts.new((x, y, z * r)) for x, y in pts])
        order = [0, 3, 4, 5, 1, 2]  # girdle, pavilion down ... we sort by z below
        rings.sort(key=lambda rr: rr[0].co.z)
        for a, b in zip(rings, rings[1:]):
            for i in range(8):
                j = (i + 1) % 8
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    else:
        crown = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r * 0.56, depth=r * 0.32)
        bmesh.ops.translate(bm, verts=crown["verts"], vec=(0, 0, r * 0.16))
        pav = bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=r * 0.001, radius2=r, depth=r * 0.86)
        bmesh.ops.translate(bm, verts=pav["verts"], vec=(0, 0, -r * 0.43))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=r * 0.01)
        if cut == "oval":
            for v in bm.verts:
                v.co.x *= 1.3
        if cut == "cushion":
            for v in bm.verts:
                ang = math.atan2(v.co.y, v.co.x)
                k = 1 + 0.12 * (abs(math.cos(2 * ang)))
                v.co.x *= k
                v.co.y *= k
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    c.objects.link(o)
    me.materials.append(mat)
    return o


def ring_material(metal, col, rough, aniso):
    g = G(f"rc ring {metal} {rough}")
    g.b.inputs["Base Color"].default_value = (*col, 1)
    g.b.inputs["Metallic"].default_value = 1.0
    g.b.inputs["Roughness"].default_value = rough
    g.b.inputs["Anisotropic"].default_value = aniso
    return g.m


def ring(name, loc, mat, c, stone=None):
    o = cyl(name, loc, 0.12, 0.12, 0.05, mat, c, 64, caps=False, rot=(math.pi / 2, 0, 0))
    o.modifiers.new("s", "SOLIDIFY").thickness = 0.03
    b = o.modifiers.new("b", "BEVEL")
    b.width = 0.012
    b.segments = 3
    if stone is not None:
        faceted(name + " stone", "round", 0.045, stone, c, (loc[0], loc[1], loc[2] + 0.17))
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            cyl(f"{name} prong {k}", (loc[0] + 0.04 * math.cos(a), loc[1] + 0.04 * math.sin(a), loc[2] + 0.14), 0.008, 0.006, 0.07, mat, c, 6)


def tray(name, cx, cy, z, w, d, M, c, lining):
    box(f"{name} tray", (cx - w / 2, cy - d / 2, z + 0.08), (cx + w / 2, cy + d / 2, z + 0.2), M["rosewood"], c, 0.015, 2)
    box(f"{name} tray lining", (cx - w / 2 + 0.05, cy - d / 2 + 0.05, z + 0.16), (cx + w / 2 - 0.05, cy + d / 2 - 0.05, z + 0.185), lining, c)
    box(f"{name} tray brass edge", (cx - w / 2, cy - d / 2 - 0.006, z + 0.17), (cx + w / 2, cy - d / 2 + 0.006, z + 0.2), M["brass"], c)


def cantilever_box(prefix, cx, cy, M, c, lining, well=((-0.42, -0.32), (-0.42, 0.32), (0.42, -0.32), (0.42, 0.32)), per_tray=((0.0, -0.3), (0.0, 0.3))):
    """Returns the list of (x, y, z_top_of_lining) slots for contents."""
    z0 = DESK_TOP
    W, D, H = 1.8, 1.45, 0.5
    box(f"{prefix} body", (cx - W / 2, cy - D / 2, z0), (cx + W / 2, cy + D / 2, z0 + H), M["rosewood"], c, 0.03, 2)
    box(f"{prefix} well lining", (cx - W / 2 + 0.07, cy - D / 2 + 0.07, z0 + H - 0.08), (cx + W / 2 - 0.07, cy + D / 2 - 0.07, z0 + H - 0.05), lining, c)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f"{prefix} brass corner {sx}{sy}", (cx + sx * W / 2 - 0.08 * (sx > 0), cy + sy * D / 2 - 0.08 * (sy > 0), z0),
                (cx + sx * W / 2 + 0.08 * (sx < 0), cy + sy * D / 2 + 0.08 * (sy < 0), z0 + H), M["brass"], c)
    box(f"{prefix} escutcheon", (cx - 0.08, cy - D / 2 - 0.012, z0 + H - 0.22), (cx + 0.08, cy - D / 2, z0 + H - 0.08), M["brass"], c)
    box(f"{prefix} cartouche", (cx - 0.35, cy - D / 2 - 0.012, z0 + 0.1), (cx + 0.35, cy - D / 2, z0 + 0.22), M["brass"], c)
    slots = []
    # base well: 2 x 2 (or 2 x 3) positions
    for ix, iy in well:
        slots.append((cx + ix, cy + iy, z0 + H - 0.05, "well"))
    # tier 1 (lower, further out) and tier 2 (higher, inner) trays on brass arms
    tw, td = 0.82, 1.25
    for tier, (dx, dz) in enumerate(((1.12, 0.35), (0.52, 0.72))):
        for s in (-1, 1):
            tx = cx + s * dx
            tz = z0 + H + dz - 0.2
            tray(f"{prefix} t{tier}{'LR'[s > 0]}", tx, cy, tz, tw, td, M, c, lining)
            for ay in (-td / 2 + 0.06, td / 2 - 0.06):
                a = (cx + s * (W / 2 - 0.1) * (0.3 if tier else 0.7), cy + ay, z0 + H - 0.05)
                b = (tx - s * tw * 0.25, cy + ay, tz + 0.05)
                L = math.dist(a, b)
                mid = [(a[i] + b[i]) / 2 for i in range(3)]
                ang = math.atan2(b[2] - a[2], (b[0] - a[0]))
                arm = box(f"{prefix} arm t{tier}{s}{ay:.1f}", (-L / 2, -0.012, -0.018), (L / 2, 0.012, 0.018), M["brass"], c)
                arm.location = mid
                arm.rotation_euler = (0, -ang, 0)
                sphere(f"{prefix} rivet t{tier}{s}{ay:.1f}", b, 0.025, M["brass"], c)
            for ix, iy in per_tray:
                slots.append((tx + ix, cy + iy, tz + 0.185, f"t{tier}"))
    # lid standing open behind, with a bevelled mirror inside
    import mathutils
    lid = box(f"{prefix} lid", (-W / 2, -0.04, 0), (W / 2, 0.04, D), M["rosewood"], c, 0.02)
    lid.data.transform(mathutils.Matrix.Translation((0, 0, D / 2)))
    lid.location = (cx, cy + D / 2 + 0.02, z0 + H)
    lid.rotation_euler = (math.radians(-12), 0, 0)
    mir = bpy.data.materials.get("rc mirror")
    if mir:
        m = box(f"{prefix} lid mirror", (-W / 2 + 0.12, -0.05, 0.12), (W / 2 - 0.12, -0.04, D - 0.12), mir, c)
        m.data.transform(mathutils.Matrix.Translation((0, 0, D / 2 - 0.06)))
        m.parent = lid
        m.matrix_parent_inverse.identity()
        m.location = (0, 0, 0)
    return slots


def build(M):
    c = coll("jewellery cases")
    red = _pbr("rc case red velvet", __import__("ph").texture("velour_velvet"), 0.6, tint=(0.55, 0.04, 0.06, 1), sheen=1.0,
               sheen_tint=(1, 0.6, 0.6, 1), rough_add=0.25, space="object")
    green = _pbr("rc case green velvet", __import__("ph").texture("velour_velvet"), 0.6, tint=(0.04, 0.2, 0.11, 1), sheen=1.0,
                 sheen_tint=(0.7, 1, 0.8, 1), rough_add=0.25, space="object")
    gem_slots = cantilever_box("gem box", -2.85, -1.45, M, c, red)
    for (x, y, z, where), (name, col, ior, dens, cut) in zip(gem_slots, GEMS):
        r = 0.15 if where == "well" else 0.12
        o = faceted(f"gem {name}", cut, r, gem_material(name, col, ior, dens), c, (x, y, z + (0.0 if cut == "cabochon" else r * 0.45)))
        if cut != "cabochon":
            o.rotation_euler = (math.radians(-25), 0, 0)  # table tilted toward the viewer, as in a display slot
    ring_slots = cantilever_box("ring box", 3.05, -1.4, M, c, green,
                                well=tuple((ix, iy) for iy in (-0.32, 0.32) for ix in (-0.5, 0.0, 0.5)),
                                per_tray=((0.0, -0.4), (0.0, 0.0), (0.0, 0.4)))
    rings = [(m, col, f) for m, col in METALS for f in FINISHES]
    dia = gem_material("diamond", (1, 1, 1), 2.417, 0)
    for k, ((x, y, z, where), (metal, col, (fin, rough, aniso))) in enumerate(zip(ring_slots, rings)):
        ring(f"ring {metal} {fin}", (x, y, z + 0.09), ring_material(metal, col, rough, aniso), c, dia if fin == "polished" and k % 2 == 0 else None)
