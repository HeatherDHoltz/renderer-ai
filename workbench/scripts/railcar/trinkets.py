"""Hand-modelled period desk objects for a Gilded-Age jeweller (c. 1850-1900).

All dimensions in 10 cm units.  The live jewellery layout occupies the front
half of the desk (x -4..4.2, y -3..0.5), so these dress the back half and ends.
"""
import math
import random
import bmesh
import bpy
from mathutils import Vector, Matrix
from geo import DESK_TOP, box, cyl, sphere, lathe, coll
from mats import G

Z = DESK_TOP


def crystal_mat(name, col, ior=1.55, density=0.0):
    g = G(name)
    g.b.inputs["Base Color"].default_value = (*col, 1)
    g.b.inputs["Transmission Weight"].default_value = 1.0
    g.b.inputs["Roughness"].default_value = 0.0
    g.b.inputs["IOR"].default_value = ior
    if density:
        v = g.n("ShaderNodeVolumeAbsorption")
        v.inputs["Color"].default_value = (*col, 1)
        v.inputs["Density"].default_value = density
        g.L(v.outputs[0], g.out.inputs["Volume"])
    return g.m


def hollow(outer, wall):
    """Turn an outer (r, z) profile into a closed hollow-vessel profile."""
    inner = [(max(0.0, r - wall), z) for r, z in outer[::-1] if z > outer[0][1] + wall * 2]
    return [(0.0, outer[0][1])] + outer + inner + [(0.0, outer[0][1] + wall * 2)]


def decanter(name, loc, M, c, spirit, segs=8, scale=1.0):
    s = scale
    outer = [(0.46 * s, 0.0), (0.5 * s, 0.06 * s), (0.5 * s, 1.55 * s), (0.42 * s, 1.75 * s), (0.2 * s, 1.95 * s),
             (0.15 * s, 2.25 * s), (0.2 * s, 2.32 * s), (0.2 * s, 2.36 * s)]
    o = lathe(name, hollow(outer, 0.05 * s), loc, M["crystal"], c, segs)
    o.rotation_euler.z = math.pi / segs
    lathe(name + " spirit", [(0, 0.12 * s), (0.42 * s, 0.12 * s), (0.42 * s, 1.15 * s), (0, 1.15 * s)],
          loc, spirit, c, segs).rotation_euler.z = math.pi / segs
    # faceted cut-crystal stopper
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.24 * s)
    me = bpy.data.meshes.new(name + " stopper")
    bm.to_mesh(me)
    bm.free()
    st = bpy.data.objects.new(name + " stopper", me)
    st.location = Vector(loc) + Vector((0, 0, 2.62 * s))
    st.scale = (1, 1, 1.25)
    c.objects.link(st)
    me.materials.append(M["crystal"])
    cyl(name + " stopper stem", Vector(loc) + Vector((0, 0, 2.38 * s)), 0.1 * s, 0.13 * s, 0.12 * s, M["crystal"], c, 8)
    # silver spirit label on a chain
    sphere(name + " label", Vector(loc) + Vector((0, -0.48 * s, 1.55 * s)), 0.16 * s, M["silver"], c, scale=(1.4, 0.12, 0.7))


def tumbler(name, loc, M, c, fill=0.35):
    outer = [(0.34, 0.0), (0.36, 0.03), (0.39, 0.85), (0.4, 0.88)]
    prof = [(0, 0), (0.34, 0), (0.36, 0.03), (0.39, 0.85), (0.4, 0.88), (0.36, 0.88), (0.34, 0.2), (0, 0.2)]
    o = lathe(name, prof, loc, M["crystal"], c, 14)
    if fill > 0.01:
        lathe(name + " whisky", [(0, 0.2), (0.335, 0.2), (0.345, fill + 0.2), (0, fill + 0.2)], loc, M["whisky"], c, 14)
    # star-cut base: thin radial prisms
    for k in range(8):
        a = math.pi * k / 8
        b = box(name + f" star {k}", (-0.3, -0.012, 0.0), (0.3, 0.012, 0.04), M["crystal"], c)
        b.location = Vector(loc) + Vector((0, 0, 0.02))
        b.rotation_euler.z = a
    return o


def tantalus(loc, M, c):
    x, y, z = loc
    box("tantalus base", (x - 1.9, y - 0.75, z), (x + 1.9, y + 0.75, z + 0.32), M["mahogany"], c, 0.06, 3)
    box("tantalus base gilt", (x - 1.92, y - 0.77, z + 0.26), (x + 1.92, y + 0.77, z + 0.3), M["brass"], c, 0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f"tantalus corner {sx}{sy}", (x + sx * 1.9 - 0.12, y + sy * 0.75 - 0.12, z), (x + sx * 1.9 + 0.12, y + sy * 0.75 + 0.12, z + 0.34), M["brass"], c, 0.02)
        box(f"tantalus upright {sx}", (x + sx * 1.72 - 0.12, y - 0.12, z + 0.32), (x + sx * 1.72 + 0.12, y + 0.12, z + 3.2), M["mahogany"], c, 0.03)
        sphere(f"tantalus finial {sx}", (x + sx * 1.72, y, z + 3.3), 0.13, M["brass"], c)
    box("tantalus lock bar", (x - 1.75, y - 0.07, z + 2.95), (x + 1.75, y + 0.07, z + 3.08), M["brass"], c, 0.02)
    t = cyl("tantalus handle", (x, y, z + 3.4), 0.42, 0.42, 0.06, M["brass"], c, 32, rot=(math.pi / 2, 0, 0), caps=False)
    t.modifiers.new("s", "SOLIDIFY").thickness = 0.06
    box("tantalus lock plate", (x - 0.22, y - 0.79, z + 0.06), (x + 0.22, y - 0.75, z + 0.24), M["brass"], c)
    spirits = [M["whisky"], crystal_mat("rc cognac", (0.55, 0.16, 0.03), 1.36, 6.0), crystal_mat("rc gin", (0.95, 0.98, 0.96), 1.36)]
    for k, dx in enumerate((-1.08, 0.0, 1.08)):
        decanter(f"decanter {k}", (x + dx, y, z + 0.32), M, c, spirits[k], segs=8, scale=0.95)


def amethyst_cloche(loc, M, c):
    x, y, z = loc
    lathe("cloche base", [(0, 0), (0.95, 0), (1.0, 0.08), (0.95, 0.16), (0.9, 0.3), (0.98, 0.36), (0, 0.36)], loc, M["black_lacquer"], c, 48)
    dome = [(0.86, 0.36), (0.86, 1.8), (0.8, 2.25), (0.6, 2.55), (0.3, 2.72), (0.0, 2.76)]
    o = lathe("cloche dome", dome, loc, M["crystal"], c, 48)
    o.modifiers.new("s", "SOLIDIFY").thickness = 0.025
    lathe("cloche knob", [(0, 0), (0.1, 0), (0.14, 0.08), (0.06, 0.16), (0, 0.18)], (x, y, z + 2.74), M["crystal"], c, 24)
    # matrix rock
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.55)
    rnd = random.Random(11)
    for v in bm.verts:
        v.co *= 0.8 + 0.35 * rnd.random()
        v.co.z *= 0.55
    me = bpy.data.meshes.new("amethyst matrix")
    bm.to_mesh(me)
    bm.free()
    rock = bpy.data.objects.new("amethyst matrix", me)
    rock.location = (x, y, z + 0.6)
    c.objects.link(rock)
    gm = G("rc agate matrix")
    gm.b.inputs["Base Color"].default_value = (0.32, 0.27, 0.24, 1)
    gm.b.inputs["Roughness"].default_value = 0.85
    me.materials.append(gm.m)
    am = crystal_mat("rc amethyst", (0.62, 0.25, 0.85), 1.544, 4.0)
    for k in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        tilt = rnd.uniform(0.0, 0.75)
        L = rnd.uniform(0.35, 0.95)
        r = L * rnd.uniform(0.12, 0.2)
        bm = bmesh.new()
        ring0 = [bm.verts.new((r * math.cos(i * math.pi / 3), r * math.sin(i * math.pi / 3), 0)) for i in range(6)]
        ring1 = [bm.verts.new((r * math.cos(i * math.pi / 3), r * math.sin(i * math.pi / 3), L)) for i in range(6)]
        tip = bm.verts.new((0, 0, L + r * 1.6))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
            bm.faces.new((ring1[i], ring1[j], tip))
        bm.faces.new(ring0[::-1])
        cme = bpy.data.meshes.new(f"amethyst point {k}")
        bm.to_mesh(cme)
        bm.free()
        co = bpy.data.objects.new(f"amethyst point {k}", cme)
        rr = rnd.uniform(0.0, 0.35)
        co.location = (x + rr * math.cos(a), y + rr * math.sin(a), z + 0.75)
        co.rotation_euler = (tilt * math.cos(a + math.pi / 2), tilt * math.sin(a + math.pi / 2) * -1, rnd.uniform(0, 1))
        co.rotation_euler = (Matrix.Rotation(tilt, 4, Vector((-math.sin(a), math.cos(a), 0)))).to_euler()
        c.objects.link(co)
        cme.materials.append(am)


def carat_balance(loc, M, c, cased=True):
    """Assayer's / diamond balance in a glazed mahogany case, with weights."""
    x, y, z = loc
    w, d = 1.6, 0.75
    box("balance case base", (x - w, y - d, z), (x + w, y + d, z + 0.42), M["mahogany"], c, 0.04, 3)
    box("balance drawer", (x - 0.8, y - d - 0.02, z + 0.08), (x + 0.8, y - d + 0.02, z + 0.34), M["rosewood"], c, 0.02)
    sphere("balance drawer knob", (x, y - d - 0.06, z + 0.21), 0.05, M["brass"], c)
    H = 2.9
    for sx in ((-1, 1) if cased else ()):
        for sy in (-1, 1):
            box(f"balance post {sx}{sy}", (x + sx * w - 0.06 - (0 if sx < 0 else 0.0) , y + sy * d - 0.06, z + 0.42), (x + sx * w + 0.06, y + sy * d + 0.06, z + H), M["mahogany"], c)
    if cased:
        box("balance case top", (x - w - 0.04, y - d - 0.04, z + H), (x + w + 0.04, y + d + 0.04, z + H + 0.14), M["mahogany"], c, 0.03, 2)
    for nm, a, b in () if not cased else (("front", (x - w, y - d, z + 0.42), (x + w, y - d + 0.02, z + H)), ("back", (x - w, y + d - 0.02, z + 0.42), (x + w, y + d, z + H)),
                     ("L", (x - w, y - d, z + 0.42), (x - w + 0.02, y + d, z + H)), ("R", (x + w - 0.02, y - d, z + 0.42), (x + w, y + d, z + H))):
        box(f"balance glass {nm}", a, b, M["glass"], c)
    # mechanism
    lathe("balance pillar", [(0, 0), (0.22, 0), (0.22, 0.06), (0.06, 0.12), (0.05, 2.0), (0.08, 2.05), (0, 2.1)], (x, y, z + 0.42), M["brass"], c, 24)
    box("balance beam", (x - 1.15, y - 0.025, z + 2.42), (x + 1.15, y + 0.025, z + 2.5), M["brass"], c)
    box("balance pointer", (x - 0.015, y - 0.05, z + 1.6), (x + 0.015, y - 0.02, z + 2.45), M["iron"], c)
    for sx in (-1, 1):
        px = x + sx * 1.05
        for k in range(3):
            a = 2 * math.pi * k / 3
            cyl(f"pan wire {sx}{k}", (px + 0.18 * math.cos(a) * 0.5, y + 0.18 * math.sin(a) * 0.5, z + 1.75), 0.004, 0.004, 1.35, M["brass"], c, 4)
        lathe(f"balance pan {sx}", [(0, 0), (0.25, 0.03), (0.32, 0.1), (0.33, 0.11), (0, 0.04)], (px, y, z + 1.02), M["brass"], c, 32)
    # a box of weights beside it
    box("weights box", (x + w + 0.3, y - 0.45, z), (x + w + 1.3, y + 0.45, z + 0.22), M["mahogany"], c, 0.03)
    box("weights velvet", (x + w + 0.36, y - 0.39, z + 0.2), (x + w + 1.24, y + 0.39, z + 0.225), M["velvet_green"], c)
    for k, (dx, dy, r, h) in enumerate(((0.2, -0.2, 0.09, 0.2), (0.45, -0.2, 0.075, 0.17), (0.7, -0.2, 0.06, 0.14), (0.2, 0.15, 0.05, 0.12), (0.4, 0.15, 0.04, 0.1))):
        cyl(f"weight {k}", (x + w + 0.3 + dx, y + dy, z + 0.225 + h / 2), r, r, h, M["brass"], c, 24)
        sphere(f"weight knob {k}", (x + w + 0.3 + dx, y + dy, z + 0.225 + h + r * 0.4), r * 0.45, M["brass"], c)


def diamond_parcels(loc, M, c):
    """Folded 'diamond papers' — white outside, pale blue lining — one open with stones."""
    x, y, z = loc
    g = G("rc parcel paper")
    g.b.inputs["Base Color"].default_value = (0.82, 0.80, 0.76, 1)
    g.b.inputs["Roughness"].default_value = 0.85
    blue = G("rc parcel lining")
    blue.b.inputs["Base Color"].default_value = (0.48, 0.60, 0.78, 1)
    blue.b.inputs["Roughness"].default_value = 0.8
    # open paper (flat with folded-back flaps)
    box("parcel open lining", (x - 0.75, y - 0.55, z + 0.004), (x + 0.75, y + 0.55, z + 0.012), blue.m, c)
    for nm, a, b, rot in (("flap L", (x - 1.25, y - 0.55, z + 0.004), (x - 0.75, y + 0.55, z + 0.012), 0.12),
                          ("flap R", (x + 0.75, y - 0.55, z + 0.004), (x + 1.25, y + 0.55, z + 0.012), -0.12)):
        f = box("parcel " + nm, a, b, g.m, c)
        f.rotation_euler.y = rot
    dia = crystal_mat("rc loose diamond", (1, 1, 1), 2.417)
    rnd = random.Random(4)
    for k in range(14):
        bm = bmesh.new()
        r = rnd.uniform(0.035, 0.075)
        crown = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=r * 0.55, depth=r * 0.35)
        bmesh.ops.translate(bm, verts=crown["verts"], vec=(0, 0, r * 0.175))
        pav = bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=r * 0.001, radius2=r, depth=r * 0.85)
        bmesh.ops.translate(bm, verts=pav["verts"], vec=(0, 0, -r * 0.425))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=r * 0.01)
        me = bpy.data.meshes.new(f"loose diamond {k}")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"loose diamond {k}", me)
        o.location = (x + rnd.uniform(-0.55, 0.55), y + rnd.uniform(-0.4, 0.4), z + 0.012)
        o.rotation_euler = (rnd.uniform(-1.2, 1.2), rnd.uniform(-1.2, 1.2), rnd.uniform(0, 3))
        c.objects.link(o)
        me.materials.append(dia)
    # closed parcels
    for k, (dx, dy, rz) in enumerate(((1.9, 0.5, 0.2), (1.85, 0.48, -0.1), (2.0, -0.4, 0.5))):
        b = box(f"parcel closed {k}", (-0.55, -0.3, 0), (0.55, 0.3, 0.05), g.m, c, 0.01)
        b.location = (x + dx, y + dy, z + 0.03 + 0.055 * (k if k < 2 else 0))
        b.rotation_euler.z = rz
        f = box(f"parcel closed {k} fold", (-0.55, -0.02, 0.05), (0.55, 0.3, 0.06), g.m, c)
        f.parent = b
        f.matrix_parent_inverse.identity()


def inkstand(loc, M, c):
    x, y, z = loc
    box("inkstand tray", (x - 1.3, y - 0.65, z), (x + 1.3, y + 0.65, z + 0.14), M["mahogany"], c, 0.05, 3)
    box("inkstand gallery", (x - 1.32, y + 0.55, z + 0.1), (x + 1.32, y + 0.67, z + 0.42), M["brass"], c, 0.02)
    box("inkstand pen groove", (x - 1.1, y - 0.55, z + 0.12), (x + 1.1, y - 0.25, z + 0.145), M["velvet_green"], c)
    for k, dx in enumerate((-0.6, 0.6)):
        lathe(f"inkwell {k}", hollow([(0.28, 0.0), (0.3, 0.05), (0.3, 0.5), (0.2, 0.58), (0.14, 0.62)], 0.04), (x + dx, y + 0.15, z + 0.14), M["crystal"], c, 8)
        lathe(f"inkwell ink {k}", [(0, 0.1), (0.24, 0.1), (0.24, 0.35), (0, 0.35)], (x + dx, y + 0.15, z + 0.14), M["black_lacquer"], c, 8)
        lathe(f"inkwell lid {k}", [(0, 0), (0.17, 0), (0.17, 0.05), (0.1, 0.12), (0.03, 0.16), (0, 0.17)], (x + dx, y + 0.15, z + 0.76), M["brass"], c, 24)
    cyl("dip pen holder", (x - 0.2, y - 0.4, z + 0.21), 0.035, 0.03, 1.4, M["ivory"], c, 12, rot=(0, math.pi / 2, 0.05))
    cyl("dip pen nib", (x + 0.6, y - 0.38, z + 0.21), 0.025, 0.004, 0.25, M["gold"], c, 8, rot=(0, math.pi / 2, 0.05))


def rocker_blotter(loc, M, c):
    """Mahogany rocker blotter: curved felt-covered base, flat top with brass knob."""
    x, y, z = loc
    n, hw, hd = 20, 0.7, 0.32
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        xx = -hw + 2 * hw * i / n
        zb = 0.22 * (xx / hw) ** 2
        zt = 0.3
        rows.append([bm.verts.new((xx, -hd, zb)), bm.verts.new((xx, hd, zb)), bm.verts.new((xx, hd, zt)), bm.verts.new((xx, -hd, zt))])
    for i in range(n):
        a0, a1 = rows[i], rows[i + 1]
        for k in range(4):
            bm.faces.new((a0[k], a1[k], a1[(k + 1) % 4], a0[(k + 1) % 4]))
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("rocker blotter")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("rocker blotter", me)
    o.location = (x, y, z)
    o.rotation_euler.z = 0.25
    c.objects.link(o)
    me.materials.append(M["mahogany"])
    lathe("blotter knob", [(0, 0), (0.12, 0), (0.06, 0.08), (0.06, 0.18), (0.13, 0.25), (0.08, 0.34), (0, 0.36)], (x, y, z + 0.3), M["brass"], c, 24)


def call_bell(loc, M, c):
    lathe("call bell base", [(0, 0), (0.42, 0), (0.42, 0.08), (0.36, 0.12), (0, 0.12)], loc, M["mahogany"], c, 32)
    lathe("call bell dome", [(0.4, 0.12), (0.38, 0.22), (0.3, 0.42), (0.15, 0.52), (0, 0.55)], loc, M["nickel"], c, 48)
    cyl("call bell plunger", Vector(loc) + Vector((0, 0, 0.62)), 0.03, 0.03, 0.15, M["nickel"], c, 12)
    sphere("call bell button", Vector(loc) + Vector((0, 0, 0.71)), 0.06, M["nickel"], c, scale=(1, 1, 0.6))


def triblet(loc, M, c, rz=0.3):
    o = lathe("ring triblet", [(0, 0), (0.05, 0), (0.13, 1.6), (0.15, 1.65), (0.15, 1.95), (0.12, 2.0), (0.12, 2.6), (0.15, 2.7), (0, 2.75)],
              (0, 0, 0), M["nickel"], c, 32)
    o.location = loc
    o.rotation_euler = (0, math.pi / 2, rz)


def books(loc, M, c, sizes=((1.9, 1.35, 0.32), (1.7, 1.2, 0.28), (1.55, 1.1, 0.22)), rz=0.1):
    lib = bpy.data.materials.get("library leather bindings") or M["leather"]
    x, y, z = loc
    zz = z
    rnd = random.Random(2)
    for k, (w, d, t) in enumerate(sizes):
        b = box(f"gem book {k}", (-w / 2, -d / 2, 0), (w / 2, d / 2, t), M["leather"], c, 0.02)
        b.location = (x + rnd.uniform(-0.08, 0.08), y + rnd.uniform(-0.06, 0.06), zz + t / 2)
        b.rotation_euler.z = rz + rnd.uniform(-0.15, 0.15)
        p = box(f"gem book {k} pages", (-w / 2 + 0.06, -d / 2 + 0.04, 0.02), (w / 2 - 0.02, d / 2 - 0.04, t - 0.02), M["paper"], c)
        p.parent = b
        p.matrix_parent_inverse.identity()
        p.location = (0.04, 0, -t / 2)
        zz += t


def student_lamp(loc, M, c):
    """Brass Argand 'student lamp' (1870s-1900): side reservoir, green cased-glass shade."""
    x, y, z = loc
    lathe("student lamp base", [(0, 0), (0.75, 0), (0.78, 0.08), (0.6, 0.2), (0.35, 0.3), (0, 0.32)], (x, y, z), M["brass"], c, 48)
    cyl("student lamp rod", (x, y, z + 2.2), 0.06, 0.06, 4.0, M["brass"], c, 16)
    sphere("student lamp finial", (x, y, z + 4.3), 0.14, M["brass"], c)
    # oil reservoir on the arm (the counterweight look)
    cyl("student lamp arm", (x + 0.6, y, z + 2.6), 0.04, 0.04, 1.2, M["brass"], c, 12, rot=(0, math.pi / 2, 0))
    lathe("student lamp reservoir", [(0, 0), (0.32, 0.05), (0.38, 0.4), (0.32, 0.8), (0.12, 0.92), (0, 0.95)], (x - 0.55, y, z + 2.2), M["brass"], c, 32)
    cyl("student lamp burner tube", (x + 1.25, y, z + 2.45), 0.09, 0.09, 0.5, M["brass"], c, 16)
    g = G("rc green cased glass")
    g.b.inputs["Base Color"].default_value = (0.05, 0.28, 0.12, 1)
    g.b.inputs["Roughness"].default_value = 0.15
    g.b.inputs["Coat Weight"].default_value = 1.0
    inner = G("rc opal glass lining")
    inner.b.inputs["Base Color"].default_value = (0.95, 0.92, 0.84, 1)
    inner.b.inputs["Emission Color"].default_value = (1.0, 0.85, 0.6, 1)
    inner.b.inputs["Emission Strength"].default_value = 3.0
    sh = lathe("student lamp shade", [(0.62, 0.0), (0.58, 0.08), (0.42, 0.42), (0.22, 0.62), (0.18, 0.66)], (x + 1.25, y, z + 2.55), g.m, c, 48)
    sh.modifiers.new("s", "SOLIDIFY").thickness = 0.03
    ln = lathe("student lamp shade lining", [(0.6, 0.0), (0.56, 0.08), (0.4, 0.41), (0.2, 0.6)], (x + 1.25, y, z + 2.54), inner.m, c, 48)
    lathe("student lamp chimney", [(0.1, 0), (0.12, 0.3), (0.08, 0.9), (0.08, 1.2)], (x + 1.25, y, z + 2.6), M["glass"], c, 24)
    L = bpy.data.lights.new("student lamp flame", "POINT")
    L.energy = 60
    L.color = (1.0, 0.7, 0.42)
    L.shadow_soft_size = 0.15
    lo = bpy.data.objects.new("student lamp flame", L)
    lo.location = (x + 1.25, y, z + 2.75)
    c.objects.link(lo)


def tex_mat(name, file, rough=0.85):
    import os
    from mats import TEX
    g = G(name)
    t = g.n("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(TEX, file), check_existing=True)
    g.L(g.n("ShaderNodeTexCoord").outputs["UV"], t.inputs["Vector"])
    g.set("Base Color", t.outputs[0])
    g.b.inputs["Roughness"].default_value = rough
    return g.m


def uv_quad(name, pts, mat, c, uvs=((0, 0), (1, 0), (1, 1), (0, 1))):
    me = bpy.data.meshes.new(name)
    me.from_pydata(pts, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for li, u in enumerate(uvs):
        uv.data[li].uv = u
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    me.materials.append(mat)
    s = o.modifiers.new("t", "SOLIDIFY")
    s.thickness = 0.008
    return o


def diamond_paper_open(loc, M, c, rz=0.15):
    """An opened diamond paper: white outer sheet, pale-blue tissue lining, its
    side flaps still folded up, a little heap of brilliants, steel tweezers."""
    x, y, z = loc
    par = bpy.data.objects.new("diamond paper (open)", None)
    c.objects.link(par)
    par.location = (x, y, z + 0.004)
    par.rotation_euler.z = rz
    white = G("rc paper white").m if bpy.data.materials.get("rc paper white") is None else bpy.data.materials["rc paper white"]
    white.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.88, 0.86, 0.80, 1)
    white.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    blue = bpy.data.materials.get("rc paper blue") or G("rc paper blue").m
    blue.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.36, 0.52, 0.80, 1)
    blue.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.75
    w, d = 0.8, 0.55
    parts = [uv_quad("paper base", [(-w, -d, 0), (w, -d, 0), (w, d, 0), (-w, d, 0)], white, c),
             uv_quad("paper lining", [(-w + 0.05, -d + 0.05, 0.006), (w - 0.05, -d + 0.05, 0.006), (w - 0.05, d - 0.05, 0.006), (-w + 0.05, d - 0.05, 0.006)], blue, c)]
    # side flaps folded part-way up (hinged at +/- w), front/back flaps flat-ish
    for s in (-1, 1):
        f = uv_quad(f"paper flap {s}", [(0, -d, 0), (0.55, -d, 0), (0.55, d, 0), (0, d, 0)], white, c)
        f.location = (s * w, 0, 0)
        f.rotation_euler = (0, math.radians(-65) if s > 0 else math.radians(245), 0)
        parts.append(f)
    for s in (-1, 1):
        f = uv_quad(f"paper flap fb {s}", [(-w, 0, 0), (w, 0, 0), (w, 0.42 * s, 0), (-w, 0.42 * s, 0)], white, c)
        f.location = (0, s * d, 0)
        f.rotation_euler = (s * math.radians(20), 0, 0)
        parts.append(f)
    for p in parts:
        p.parent = par
    dia = bpy.data.materials.get("rc gem diamond")
    if dia is None:
        import cases
        dia = cases.gem_material("diamond", (1, 1, 1), 2.417, 0)
    import cases
    rnd = random.Random(14)
    for k in range(9):
        r = rnd.uniform(0.05, 0.085)
        o = cases.faceted(f"loose brilliant {k}", "round", r, dia, c, (0, 0, 0))
        o.parent = par
        o.location = (rnd.uniform(-0.45, 0.35), rnd.uniform(-0.3, 0.3), 0.006 + r * 0.35)
        o.rotation_euler = (rnd.choice((0, math.pi)) + rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0, 3))
    # tweezers holding one stone at the tips
    for s in (-1, 1):
        t = box(f"tweezer leg {s}", (0, -0.018, -0.006), (1.5, 0.018, 0.006), M["nickel"], c)
        t.parent = par
        t.location = (0.35, -0.25 + s * 0.025, 0.08)
        t.rotation_euler = (0, math.radians(-4), math.radians(-28 + s * 1.2))
    held = cases.faceted("brilliant in tweezers", "round", 0.09, dia, c, (0, 0, 0))
    held.parent = par
    held.location = (0.33, -0.24, 0.1)
    held.rotation_euler = (math.radians(-50), 0, 0)
    return par


def diamond_parcels_closed(loc, M, c):
    x, y, z = loc
    lab = tex_mat("rc parcel label", "parcel-label.jpg", 0.8)
    white = bpy.data.materials.get("rc paper white")
    for k, (dx, dy, rz) in enumerate(((0.0, 0.0, 0.15), (0.05, 0.03, -0.05), (0.02, 0.0, 0.3))):
        zz = z + 0.02 + k * 0.045
        b = box(f"diamond parcel {k}", (-0.55, -0.28, -0.02), (0.55, 0.28, 0.02), white, c, 0.012)
        b.location = (x + dx, y + dy, zz)
        b.rotation_euler.z = rz
        q = uv_quad(f"diamond parcel {k} label", [(-0.5, -0.24, 0.021), (0.5, -0.24, 0.021), (0.5, 0.24, 0.021), (-0.5, 0.24, 0.021)], lab, c)
        q.parent = b
        q.modifiers.clear()
        fold = box(f"diamond parcel {k} fold", (-0.55, 0.12, 0.02), (0.55, 0.28, 0.03), white, c)
        fold.parent = b


def gem_ledger(loc, M, c, rz=-0.12):
    """Open stock ledger of stones received and sold (period entries)."""
    x, y, z = loc
    par = bpy.data.objects.new("gem ledger", None)
    c.objects.link(par)
    par.location = (x, y, z)
    par.rotation_euler.z = rz
    cov = box("ledger boards", (-1.55, -1.05, 0), (1.55, 1.05, 0.05), M["leather"], c, 0.02)
    cov.parent = par
    pages = tex_mat("rc ledger pages", "ledger-pages.jpg", 0.9)
    for s in (-1, 1):
        blk = box(f"ledger block {s}", (0, -0.98, 0), (1.45, 0.98, 0.16), M["paper"], c, 0.02)
        blk.parent = par
        blk.location = (0.02 if s > 0 else -1.47, 0, 0.05)
        q = uv_quad(f"ledger page {s}", [(0, -0.98, 0.161), (1.45, -0.98, 0.161), (1.45, 0.98, 0.161), (0, 0.98, 0.161)], pages, c,
                    uvs=((0.5, 0), (1, 0), (1, 1), (0.5, 1)) if s > 0 else ((0, 0), (0.5, 0), (0.5, 1), (0, 1)))
        q.parent = blk
        q.modifiers.clear()
    pen = cyl("ledger pen", (0, 0, 0), 0.03, 0.025, 1.5, M["ivory"], c, 12, rot=(0, math.pi / 2, 0))
    pen.parent = par
    pen.location = (0.5, -0.4, 0.26)
    pen.rotation_euler = (0, math.pi / 2, 0.6)


def build(M):
    c = coll("desk trinkets")
    # only what a working jeweller keeps on the desk; drinks, books and
    # instruments now live in the whisky corner, bookcases and side tables
    student_lamp((-7.0, 4.5, Z), M, c)
    carat_balance((-4.4, 4.3, Z), M, c, cased=False)
    inkstand((-1.3, 4.7, Z), M, c)
    rocker_blotter((-2.7, 2.6, Z), M, c)
    diamond_paper_open((0.9, 2.8, Z), M, c)
    diamond_parcels_closed((2.6, 2.4, Z), M, c)
    gem_ledger((4.6, 3.9, Z), M, c)
    triblet((6.2, 1.9, Z + 0.15), M, c, 0.5)
