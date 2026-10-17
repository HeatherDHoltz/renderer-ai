"""Geometry helpers. Blender coords: x = along the car, y = across (+y = window wall
behind the desk), z = up. Scale: 1 unit = 10 cm. Desk top stays at z = -1.4."""
import math
import bmesh
import bpy
from mathutils import Vector

FLOOR = -9.0
DESK_TOP = -1.4


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def clear_coll(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)


def _finish(o, mat, c, smooth=False, bevel=0.0, segs=2):
    c.objects.link(o)
    if mat:
        o.data.materials.append(mat)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segs
        b.limit_method = "ANGLE"
    return o


def box(name, mn, mx, mat, c, bevel=0.0, segs=2):
    mn, mx = Vector(mn), Vector(mx)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * (mx.x - mn.x), v.co.y * (mx.y - mn.y), v.co.z * (mx.z - mn.z)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = (mn + mx) / 2
    return _finish(o, mat, c, bevel=bevel, segs=segs)


def cyl(name, loc, r1, r2, depth, mat, c, verts=32, rot=(0, 0, 0), smooth=True, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=verts, radius1=r1, radius2=r2, depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return _finish(o, mat, c, smooth=smooth)


def sphere(name, loc, r, mat, c, scale=(1, 1, 1), segs=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.scale = scale
    return _finish(o, mat, c, smooth=True)


def lathe(name, profile, loc, mat, c, segs=48, rot=(0, 0, 0)):
    """Revolve a (radius, z) profile around local Z — turned wood, glassware, finials."""
    bm = bmesh.new()
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for k in range(segs):
        r0, r1 = rings[k], rings[(k + 1) % segs]
        for i in range(len(profile) - 1):
            try:
                bm.faces.new((r0[i], r1[i], r1[i + 1], r0[i + 1]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = rot
    return _finish(o, mat, c, smooth=True)


def sweep_x(name, profile, x0, x1, mat, c, bevel=0.0):
    """Extrude a (y, z) profile polygon along x from x0 to x1 (cornices, rails, coves)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in profile]
    b = [bm.verts.new((x1, y, z)) for y, z in profile]
    n = len(profile)
    for i in range(n - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    return _finish(o, mat, c, smooth=True, bevel=bevel)


def panel(name, x0, x1, z0, z1, y, mats, c, facing=-1, frame=0.35, depth=0.18, stringing=True, field="rosewood"):
    """Raised-and-fielded panel with mahogany frame, rosewood field, satinwood stringing
    and a gilt bead.  `facing` = -1 for the +y wall (faces -y)."""
    t = depth
    yf = y + facing * t  # front plane of the frame
    fr = mats["mahogany"]
    box(name + " rail top", (x0, min(y, yf), z1 - frame), (x1, max(y, yf), z1), fr, c, 0.03)
    box(name + " rail bottom", (x0, min(y, yf), z0), (x1, max(y, yf), z0 + frame), fr, c, 0.03)
    box(name + " stile L", (x0, min(y, yf), z0), (x0 + frame, max(y, yf), z1), fr, c, 0.03)
    box(name + " stile R", (x1 - frame, min(y, yf), z0), (x1, max(y, yf), z1), fr, c, 0.03)
    fx0, fx1, fz0, fz1 = x0 + frame, x1 - frame, z0 + frame, z1 - frame
    yfield = y + facing * t * 0.45
    box(name + " field", (fx0, min(y, yfield), fz0), (fx1, max(y, yfield), fz1), mats[field], c, 0.12, 3)
    yb = yfield + facing * 0.012
    s = 0.035
    inset = 0.28
    if stringing and fx1 - fx0 > 2 * inset + 0.2 and fz1 - fz0 > 2 * inset + 0.2:
        sm = mats["satinwood"]
        for nm, a, b in (("t", (fx0 + inset, fz1 - inset - s), (fx1 - inset, fz1 - inset)),
                         ("b", (fx0 + inset, fz0 + inset), (fx1 - inset, fz0 + inset + s)),
                         ("l", (fx0 + inset, fz0 + inset), (fx0 + inset + s, fz1 - inset)),
                         ("r", (fx1 - inset - s, fz0 + inset), (fx1 - inset, fz1 - inset))):
            box(name + " string " + nm, (a[0], min(yb, yfield), a[1]), (b[0], max(yb, yfield), b[1]), sm, c)
    # gilt bead where field meets frame
    g = mats["gilt"]
    yg0, yg1 = sorted((y + facing * t * 0.5, y + facing * t * 0.62))
    bw = 0.05
    box(name + " bead t", (fx0, yg0, fz1 - bw), (fx1, yg1, fz1), g, c)
    box(name + " bead b", (fx0, yg0, fz0), (fx1, yg1, fz0 + bw), g, c)
    box(name + " bead l", (fx0, yg0, fz0), (fx0 + bw, yg1, fz1), g, c)
    box(name + " bead r", (fx1 - bw, yg0, fz0), (fx1, yg1, fz1), g, c)


def curtain(name, x_edge, width, z_top, z_bottom, y, mat, c, side=1, tie_z=None, folds=7, depth=0.35, facing=-1):
    """Heavy velvet drapery panel with sinusoidal folds; optionally gathered at a tie-back."""
    nx, nz = 48, 60
    bm = bmesh.new()
    grid = []
    for j in range(nz + 1):
        z = z_top + (z_bottom - z_top) * j / nz
        g = 1.0
        if tie_z is not None:
            d = abs(z - tie_z) / max(1e-3, (z_top - z_bottom))
            g = 0.45 + 0.55 * min(1.0, (d * 3.2) ** 1.4)
        row = []
        for i in range(nx + 1):
            u = i / nx
            x = x_edge + side * u * width * g
            amp = depth * (0.6 + 0.4 * (1 - g))
            yy = y + facing * (0.12 + amp * (0.5 + 0.5 * math.sin(u * folds * 2 * math.pi)))
            row.append(bm.verts.new((x, yy, z)))
        grid.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o = _finish(o, mat, c, smooth=True)
    s = o.modifiers.new("thick", "SOLIDIFY")
    s.thickness = 0.06
    return o


def anchor(name, loc, rz, c):
    e = bpy.data.objects.new(name, None)
    c.objects.link(e)
    e.location = loc
    e.rotation_euler = (0, 0, rz)
    return e


def adopt(c, a):
    """Parent every parentless object in collection c to anchor a (local frame)."""
    for o in list(c.objects):
        if o is a or o.parent is not None:
            continue
        o.parent = a
        o.matrix_parent_inverse.identity()
