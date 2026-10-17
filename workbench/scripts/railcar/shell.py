"""Architecture of a Gilded-Age private car saloon, c. 1890.

Real-world reference proportions (1 unit = 10 cm): interior width ~2.9 m,
side ceiling ~2.3 m, raised clerestory ('monitor') deck ~3.0 m with
art-glass deck lights, window sills just above desk height.
"""
import math
from geo import FLOOR, box, panel, sweep_x, curtain, cyl, sphere, coll

Y_BACK = 11.0     # inner face of the window wall behind the desk
Y_FRONT = -28.0   # inner face of the opposite wall (behind the camera)
X0, X1 = -26.0, 26.0
SILL = -1.0
WIN_TOP = 9.0
CORNICE = 14.0
CL_Y = (-14.5, -2.5)   # clerestory sides
CL_TOP = 19.4
PITCH = 7.8
WIN_HALF = 2.6
BAYS = [-19.5, -11.7, -3.9, 3.9, 11.7, 19.5]
STOVE_BAY = -11.7  # now the library bookcase bay
CLOCK_BAY = 11.7


def window_bays(side):
    if side == "back":
        return [b for b in BAYS if b not in (STOVE_BAY, CLOCK_BAY)]
    return [b for b in BAYS if b not in (-3.9, 3.9)]


def wall(M, side):
    c = coll(f"car {side} wall")
    if side == "back":
        y, f = Y_BACK, -1
    else:
        y, f = Y_FRONT, 1
    ys = sorted((y, y - f * 0.6))
    wins = window_bays(side)
    # backing (out of sight, catches light leaks)
    box(f"{side} backing low", (X0, ys[0], FLOOR), (X1, ys[1], SILL), M["mahogany_dark"], c)
    box(f"{side} backing high", (X0, ys[0], WIN_TOP), (X1, ys[1], CORNICE + 1), M["mahogany_dark"], c)
    # skirting + dado panels
    yk = sorted((y, y + f * 0.28))
    box(f"{side} skirting", (X0, yk[0], FLOOR), (X1, yk[1], FLOOR + 0.9), M["mahogany_dark"], c, 0.04)
    box(f"{side} skirting gilt", (X0, *sorted((y, y + f * 0.3)) [0:1], FLOOR + 0.9), (X1, sorted((y, y + f * 0.3))[1], FLOOR + 1.0), M["gilt"], c)
    segs = [(X0 + 0.1, BAYS[0] - PITCH / 2 - 0.1)] + [(b - PITCH / 2 + 0.1, b + PITCH / 2 - 0.1) for b in BAYS] + [(BAYS[-1] + PITCH / 2 + 0.1, X1 - 0.1)]
    for i, (a, b) in enumerate(segs):
        panel(f"{side} dado {i}", a, b, FLOOR + 1.0, SILL - 0.6, y, M, c, facing=f)
    # sill ledge with moulded nosing
    box(f"{side} sill", (X0, *sorted((y, y + f * 0.75))[0:1], SILL - 0.3), (X1, sorted((y, y + f * 0.75))[1], SILL), M["mahogany"], c, 0.08, 3)
    box(f"{side} sill bead", (X0, *sorted((y + f * 0.7, y + f * 0.78))[0:1], SILL - 0.42), (X1, sorted((y + f * 0.7, y + f * 0.78))[1], SILL - 0.3), M["gilt"], c, 0.02)
    # piers between windows (and the full stove bay on the back wall)
    edges = sorted([(b - WIN_HALF, b + WIN_HALF) for b in wins])
    solid = []
    cur = X0
    for a, bnd in edges:
        if a > cur:
            solid.append((cur, a))
        cur = bnd
    if cur < X1:
        solid.append((cur, X1))
    for k, (a, bnd) in enumerate(solid):
        box(f"{side} pier backing {k}", (a, ys[0], SILL), (bnd, ys[1], WIN_TOP), M["mahogany_dark"], c)
        panel(f"{side} pier {k}", a, bnd, SILL, WIN_TOP, y, M, c, facing=f, frame=0.3)
    # windows
    for i, b in enumerate(wins):
        window(M, c, f"{side} window {i}", b, y, f)
    # head moulding, Lincrusta frieze, cornice
    box(f"{side} window head", (X0, *sorted((y, y + f * 0.35))[0:1], WIN_TOP), (X1, sorted((y, y + f * 0.35))[1], WIN_TOP + 0.6), M["mahogany"], c, 0.06, 3)
    box(f"{side} head gilt", (X0, *sorted((y + f * 0.33, y + f * 0.4))[0:1], WIN_TOP + 0.55), (X1, sorted((y + f * 0.33, y + f * 0.4))[1], WIN_TOP + 0.68), M["gilt"], c, 0.02)
    box(f"{side} lincrusta", (X0, *sorted((y, y + f * 0.05))[0:1], WIN_TOP + 0.6), (X1, sorted((y, y + f * 0.05))[1], CORNICE - 0.8), M["lincrusta"], c)
    prof = [(0, CORNICE - 0.8), (0.15, CORNICE - 0.75), (0.2, CORNICE - 0.55), (0.42, CORNICE - 0.4), (0.5, CORNICE - 0.2),
            (0.7, CORNICE - 0.1), (0.75, CORNICE + 0.02)]
    sweep_x(f"{side} cornice", [(y + f * a, z) for a, z in prof], X0, X1, M["mahogany"], c)
    gprof = [(0.2, CORNICE - 0.56), (0.32, CORNICE - 0.5), (0.42, CORNICE - 0.41)]
    sweep_x(f"{side} cornice gilt", [(y + f * (a + 0.01), z) for a, z in gprof], X0, X1, M["gilt"], c)


def window(M, c, name, x, y, f):
    g = M["glass"]
    ys = lambda a, b: sorted((y + f * a, y + f * b))
    x0, x1 = x - WIN_HALF, x + WIN_HALF
    # casing
    cw = 0.42
    for nm, a, b in (("L", x0 - cw, x0), ("R", x1, x1 + cw)):
        box(f"{name} casing {nm}", (a, *ys(0, 0.32)[0:1], SILL), (b, ys(0, 0.32)[1], WIN_TOP), M["mahogany"], c, 0.06, 3)
        box(f"{name} casing bead {nm}", (a + 0.15, *ys(0.3, 0.36)[0:1], SILL), (a + 0.25, ys(0.3, 0.36)[1], WIN_TOP), M["gilt"], c)
    # reveal (window is set into a thick wall)
    for nm, a, b in (("L", x0 - 0.05, x0), ("R", x1, x1 + 0.05)):
        box(f"{name} reveal {nm}", (a, *ys(0, -0.9)[0:1], SILL), (b, ys(0, -0.9)[1], WIN_TOP), M["mahogany_dark"], c)
    box(f"{name} reveal top", (x0, *ys(0, -0.9)[0:1], WIN_TOP - 0.05), (x1, ys(0, -0.9)[1], WIN_TOP), M["mahogany_dark"], c)
    box(f"{name} reveal sill", (x0, *ys(0, -0.9)[0:1], SILL - 0.05), (x1, ys(0, -0.9)[1], SILL), M["mahogany"], c)
    # sash: lower clear pane, meeting rail, art-glass transom
    yg = ys(-0.55, -0.6)
    box(f"{name} pane", (x0 + 0.15, yg[0], SILL + 0.15), (x1 - 0.15, yg[1], 6.4), g, c)
    box(f"{name} transom", (x0 + 0.15, *ys(-0.5, -0.55)[0:1], 6.85), (x1 - 0.15, ys(-0.5, -0.55)[1], WIN_TOP - 0.15), M["art_glass"], c)
    sr = ys(-0.4, -0.75)
    box(f"{name} sash bottom", (x0, sr[0], SILL), (x1, sr[1], SILL + 0.18), M["mahogany"], c, 0.03)
    box(f"{name} meeting rail", (x0, sr[0], 6.4), (x1, sr[1], 6.85), M["mahogany"], c, 0.04)
    box(f"{name} meeting gilt", (x0, *ys(-0.38, -0.42)[0:1], 6.55), (x1, ys(-0.38, -0.42)[1], 6.7), M["brass"], c)
    box(f"{name} sash top", (x0, sr[0], WIN_TOP - 0.18), (x1, sr[1], WIN_TOP), M["mahogany"], c, 0.03)
    for nm, a in (("L", x0), ("R", x1 - 0.16)):
        box(f"{name} sash stile {nm}", (a, sr[0], SILL), (a + 0.16, sr[1], WIN_TOP), M["mahogany"], c, 0.03)
    # brass sash lifts
    for dx in (-1.2, 1.2):
        cyl(f"{name} lift {dx}", (x + dx, sr[0] if f < 0 else sr[1], SILL + 0.35), 0.06, 0.06, 0.12, M["brass"], c,
            16, rot=(math.pi / 2, 0, 0))
    # drapery: velvet panels tied back, swagged valance
    yv = y + f * 0.45
    curtain(f"{name} drape L", x0 - 0.5, 1.6, WIN_TOP + 0.3, FLOOR + 3.5, yv, M["velvet_red"], c, side=1, tie_z=1.6, facing=f)
    curtain(f"{name} drape R", x1 + 0.5, 1.6, WIN_TOP + 0.3, FLOOR + 3.5, yv, M["velvet_red"], c, side=-1, tie_z=1.6, facing=f)
    for dx in (x0 - 0.2, x1 + 0.2):
        sphere(f"{name} tassel {dx}", (dx, y + f * 0.9, 1.6), 0.16, M["gilt"], c, scale=(1, 1, 1.8))
    # valance: three swags
    for k in range(3):
        sx = x0 - 0.4 + (k + 0.5) * (x1 - x0 + 0.8) / 3
        cyl(f"{name} swag {k}", (sx, y + f * 0.75, WIN_TOP + 0.05), 0.55, 0.55, (x1 - x0 + 0.8) / 3 + 0.2,
            M["velvet_red"], c, 24, rot=(0, math.pi / 2, 0))
    box(f"{name} pelmet", (x0 - 0.7, *ys(0.1, 0.55)[0:1], WIN_TOP + 0.35), (x1 + 0.7, ys(0.1, 0.55)[1], WIN_TOP + 1.05), M["mahogany"], c, 0.05, 3)
    box(f"{name} pelmet gilt", (x0 - 0.7, *ys(0.55, 0.6)[0:1], WIN_TOP + 0.5), (x1 + 0.7, ys(0.55, 0.6)[1], WIN_TOP + 0.62), M["gilt"], c)


def ceiling(M):
    c = coll("car ceiling")
    for side, y, f, ycl in (("back", Y_BACK, -1, CL_Y[1]), ("front", Y_FRONT, 1, CL_Y[0])):
        # elliptical cove from cornice to the clerestory base
        prof = []
        for k in range(17):
            t = k / 16
            a = t * math.pi / 2
            yy = y + f * (abs(ycl - y)) * (1 - math.cos(a))
            zz = CORNICE + 1.4 * math.sin(a)
            prof.append((yy, zz))
        sweep_x(f"cove {side}", prof, X0, X1, M["ceiling"], c)
        # clerestory deck lights in a mahogany band
        zb, zt = CORNICE + 1.4, CL_TOP - 0.5
        box(f"deck sill {side}", (X0, *sorted((ycl, ycl + f * 0.4))[0:1], zb), (X1, sorted((ycl, ycl + f * 0.4))[1], zb + 0.35), M["mahogany"], c, 0.04)
        box(f"deck band {side}", (X0, *sorted((ycl - f * 0.3, ycl))[0:1], zb), (X1, sorted((ycl - f * 0.3, ycl))[1], zt), M["mahogany_dark"], c)
        for i, b in enumerate([X0 + 1.95 + PITCH / 2 * k for k in range(int((X1 - X0) / (PITCH / 2)))]):
            box(f"deck light {side} {i}", (b - 1.2, *sorted((ycl + f * 0.02, ycl + f * 0.06))[0:1], zb + 0.6), (b + 1.2, sorted((ycl + f * 0.02, ycl + f * 0.06))[1], zt - 0.4), M["art_glass"], c)
            box(f"deck light frame {side} {i}", (b - 1.35, *sorted((ycl + f * 0.06, ycl + f * 0.16))[0:1], zb + 0.45), (b + 1.35, sorted((ycl + f * 0.06, ycl + f * 0.16))[1], zb + 0.6), M["gilt"], c)
        box(f"deck cornice {side}", (X0, *sorted((ycl, ycl + f * 0.45))[0:1], zt), (X1, sorted((ycl, ycl + f * 0.45))[1], zt + 0.5), M["mahogany"], c, 0.08, 3)
    # clerestory roof: shallow barrel vault
    prof = []
    for k in range(25):
        t = k / 24
        yy = CL_Y[0] + (CL_Y[1] - CL_Y[0]) * t
        prof.append((yy, CL_TOP + 0.9 * math.sin(math.pi * t)))
    sweep_x("clerestory vault", prof, X0, X1, M["ceiling"], c)
    for i, b in enumerate([X0 + PITCH * k + 3.9 for k in range(int((X1 - X0) / PITCH))]):
        rib = [(yy, zz - 0.02) for yy, zz in prof]
        for j in range(len(rib) - 1):
            pass
        box(f"vault rib {i}", (b - 0.12, CL_Y[0], CL_TOP - 0.2), (b + 0.12, CL_Y[1], CL_TOP + 0.95), M["gilt"], c)


def floor_and_ends(M):
    c = coll("car floor + ends")
    box("floor boards", (X0, Y_FRONT, FLOOR - 0.3), (X1, Y_BACK, FLOOR), M["mahogany_dark"], c)
    import bpy
    me = bpy.data.meshes.new("persian carpet")
    w0, w1, d0, d1 = -24.0, 24.0, -26.0, 10.2
    me.from_pydata([(w0, d0, 0), (w1, d0, 0), (w1, d1, 0), (w0, d1, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for li, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    o = bpy.data.objects.new("persian carpet", me)
    o.location = (0, 0, FLOOR + 0.04)
    c.objects.link(o)
    me.materials.append(M["carpet"])
    s = o.modifiers.new("pile", "SOLIDIFY")
    s.thickness = 0.06
    for x, f in ((X0, 1), (X1, -1)):
        xs = sorted((x, x - f * 0.6))
        box(f"end backing {x}", (xs[0], Y_FRONT, FLOOR), (xs[1], Y_BACK, CL_TOP + 1.2), M["mahogany_dark"], c)


def end_walls(M):
    """Panelled end bulkheads. Built in a local frame (wall at y=0, room toward -y,
    u along the wall) and rotated into place at each end of the car."""
    from geo import anchor, adopt
    width = Y_BACK - Y_FRONT
    for side, x, rz in (("left", X0, math.pi / 2), ("right", X1, -math.pi / 2)):
        c = coll(f"car {side} end")
        h = width / 2
        box(f"{side} end skirting", (-h, -0.28, FLOOR), (h, 0, FLOOR + 0.9), M["mahogany_dark"], c, 0.04)
        box(f"{side} end skirting gilt", (-h, -0.3, FLOOR + 0.9), (h, 0, FLOOR + 1.0), M["gilt"], c)
        n = 5
        for i in range(n):
            a = -h + i * width / n + 0.1
            b = -h + (i + 1) * width / n - 0.1
            panel(f"{side} end dado {i}", a, b, FLOOR + 1.0, SILL - 0.6, 0.0, M, c, facing=-1)
            panel(f"{side} end upper {i}", a, b, SILL, WIN_TOP, 0.0, M, c, facing=-1, frame=0.35)
        box(f"{side} end rail", (-h, -0.6, SILL - 0.3), (h, 0, SILL), M["mahogany"], c, 0.08, 3)
        box(f"{side} end head", (-h, -0.35, WIN_TOP), (h, 0, WIN_TOP + 0.6), M["mahogany"], c, 0.06, 3)
        box(f"{side} end lincrusta", (-h, -0.05, WIN_TOP + 0.6), (h, 0, CORNICE - 0.8), M["lincrusta"], c)
        box(f"{side} end cornice", (-h, -0.75, CORNICE - 0.8), (h, 0, CORNICE), M["mahogany"], c, 0.15, 4)
        adopt(c, anchor(f"{side} end anchor", (x, (Y_BACK + Y_FRONT) / 2, 0), rz, c))


def build(M):
    wall(M, "back")
    wall(M, "front")
    ceiling(M)
    floor_and_ends(M)
    end_walls(M)
