"""The whisky corner on the car's right-hand end bulkhead: a mahogany and
marble sideboard with a mirrored back-bar, a locking tantalus of cut-crystal
decanters, cut tumblers on a silver salver, a soda siphon in wire mesh, a
cigar humidor and bottles on glass shelves; a landscape above and glazed
bookcases either side.  Local frame: wall at y=0, room toward -y."""
import math
import random
import bpy
from geo import FLOOR, box, cyl, sphere, lathe, coll, anchor, adopt
from mats import G
import shell
import trinkets
import library


def bottle(name, loc, M, c, glass_col, label_col, h=3.0, r=0.42, rnd=None):
    g = bpy.data.materials.get(f"rc bottle glass {glass_col}")
    if not g:
        gg = G(f"rc bottle glass {glass_col}")
        gg.b.inputs["Base Color"].default_value = (*glass_col, 1)
        gg.b.inputs["Transmission Weight"].default_value = 1.0
        gg.b.inputs["Roughness"].default_value = 0.02
        gg.b.inputs["IOR"].default_value = 1.5
        v = gg.n("ShaderNodeVolumeAbsorption")
        v.inputs["Color"].default_value = (*glass_col, 1)
        v.inputs["Density"].default_value = 3.5
        gg.L(v.outputs[0], gg.out.inputs["Volume"])
        g = gg.m
    prof = [(0, 0), (r * 0.95, 0), (r, 0.08), (r, h * 0.62), (r * 0.6, h * 0.75), (r * 0.25, h * 0.82), (r * 0.25, h * 0.98), (r * 0.3, h), (0, h)]
    lathe(name, prof, loc, g, c, 32)
    lab = G(f"rc label {name}")
    lab.b.inputs["Base Color"].default_value = (*label_col, 1)
    lab.b.inputs["Roughness"].default_value = 0.8
    cyl(f"{name} label", (loc[0], loc[1], loc[2] + h * 0.35), r + 0.01, r + 0.01, h * 0.25, lab.m, c, 32, caps=False)
    cyl(f"{name} capsule", (loc[0], loc[1], loc[2] + h * 0.94), r * 0.28, r * 0.28, h * 0.12, M["gold"] if rnd and rnd.random() > 0.5 else M["velvet_red"], c, 16)


def siphon(loc, M, c):
    x, y, z = loc
    glass = G("rc siphon glass")
    glass.b.inputs["Base Color"].default_value = (0.7, 0.85, 0.95, 1)
    glass.b.inputs["Transmission Weight"].default_value = 1.0
    glass.b.inputs["Roughness"].default_value = 0.03
    lathe("soda siphon body", [(0, 0), (0.5, 0), (0.55, 0.15), (0.55, 2.2), (0.42, 2.5), (0.3, 2.6), (0, 2.6)], loc, glass.m, c, 40)
    cage = cyl("soda siphon mesh", (x, y, z + 1.3), 0.58, 0.58, 2.3, M["nickel"], c, 24, caps=False)
    cage.modifiers.new("w", "WIREFRAME").thickness = 0.015
    lathe("soda siphon head", [(0, 0), (0.32, 0), (0.3, 0.4), (0.18, 0.7), (0.2, 0.9), (0, 0.95)], (x, y, z + 2.55), M["nickel"], c, 32)
    cyl("soda siphon spout", (x - 0.35, y, z + 3.05), 0.06, 0.04, 0.8, M["nickel"], c, 12, rot=(0, math.radians(100), 0))
    box("soda siphon lever", (x - 0.1, y - 0.06, z + 3.3), (x + 0.6, y + 0.06, z + 3.38), M["nickel"], c, 0.02)


def humidor(loc, M, c):
    x, y, z = loc
    box("humidor", (x - 1.0, y - 0.65, z), (x + 1.0, y + 0.65, z + 0.75), M["rosewood"], c, 0.05, 3)
    box("humidor lid", (x - 1.03, y - 0.68, z + 0.75), (x + 1.03, y + 0.68, z + 0.95), M["mahogany"], c, 0.06, 3)
    box("humidor plaque", (x - 0.35, y - 0.7, z + 0.3), (x + 0.35, y - 0.66, z + 0.5), M["brass"], c, 0.01)
    for k in range(5):
        cyl(f"cigar {k}", (x - 0.9 + k * 0.22, y - 1.2, z + 0.06), 0.08, 0.08, 1.4, M["leather"], c, 12, rot=(math.pi / 2, 0, 0.1 * k))
    box("cigar band", (x - 1.0, y - 1.3, z + 0.02), (x - 0.0, y - 1.18, z + 0.15), M["gilt"], c)


def build(M):
    c = coll("whisky corner")
    rnd = random.Random(7)
    top = FLOOR + 9.2
    # sideboard
    box("sideboard plinth", (-5.3, -2.6, FLOOR), (5.3, 0, FLOOR + 0.8), M["mahogany"], c, 0.06, 3)
    box("sideboard carcass", (-5.0, -2.4, FLOOR + 0.8), (5.0, 0, top), M["mahogany"], c, 0.04)
    for i in range(3):
        a = -4.8 + i * 3.25
        b = a + 3.1
        box(f"sideboard door {i}", (a, -2.5, FLOOR + 1.2), (b, -2.4, top - 1.6), M["mahogany"], c, 0.04)
        box(f"sideboard door field {i}", (a + 0.4, -2.56, FLOOR + 1.6), (b - 0.4, -2.48, top - 2.0), M["rosewood"], c, 0.08, 3)
        box(f"sideboard door bead {i}", (a + 0.32, -2.53, FLOOR + 1.52), (b - 0.32, -2.5, top - 1.92), M["gilt"], c, 0.02)
        box(f"sideboard drawer {i}", (a, -2.5, top - 1.45), (b, -2.4, top - 0.3), M["mahogany"], c, 0.04)
        sphere(f"sideboard pull {i}", ((a + b) / 2, -2.58, top - 0.88), 0.12, M["brass"], c, scale=(1.6, 0.4, 0.8))
    for s in (-1, 1):
        lathe(f"sideboard colonette {s}", [(0, 0), (0.22, 0), (0.15, 0.3), (0.15, 7.6), (0.22, 7.9), (0, 7.9)], (s * 5.0, -2.5, FLOOR + 0.9), M["mahogany"], c, 24)
    box("sideboard marble", (-5.4, -2.85, top), (5.4, 0, top + 0.3), M["marble_dark"], c, 0.08, 4)
    # back-bar: mirror with glass shelves and carved crest
    mz0 = top + 0.3
    mir = bpy.data.materials.get("rc mirror")
    box("backbar mirror", (-4.4, -0.3, mz0), (4.4, -0.2, mz0 + 4.2), mir, c)
    for nm, a, b, za, zb in (("L", -4.9, -4.4, mz0, mz0 + 4.6), ("R", 4.4, 4.9, mz0, mz0 + 4.6), ("T", -4.9, 4.9, mz0 + 4.2, mz0 + 4.7)):
        box(f"backbar frame {nm}", (a, -0.9, za), (b, 0, zb), M["mahogany"], c, 0.06, 3)
    box("backbar crest", (-1.6, -0.6, mz0 + 4.7), (1.6, -0.2, mz0 + 5.4), M["mahogany"], c, 0.2, 4)
    sphere("backbar crest shell", (0, -0.65, mz0 + 5.1), 0.45, M["gilt"], c, scale=(1.4, 0.3, 0.8))
    for k, zz in enumerate((mz0 + 1.7, mz0 + 3.1)):
        box(f"backbar glass shelf {k}", (-4.4, -1.1, zz), (4.4, -0.2, zz + 0.06), M["glass"], c)
        for s in (-1, 1):
            box(f"backbar shelf bracket {k}{s}", (s * 4.4 - 0.1 * (s > 0), -1.0, zz - 0.25), (s * 4.4 + 0.1 * (s < 0), -0.3, zz), M["brass"], c)
    # bottles on the shelves
    cols = [((0.10, 0.22, 0.08), (0.85, 0.80, 0.62)), ((0.45, 0.20, 0.04), (0.92, 0.88, 0.75)), ((0.05, 0.08, 0.05), (0.75, 0.15, 0.10)),
            ((0.55, 0.32, 0.08), (0.10, 0.12, 0.25))]
    for k in range(7):
        gc, lc = cols[k % len(cols)]
        bottle(f"backbar bottle A{k}", (-3.6 + k * 1.15, -0.65, mz0 + 1.76), M, c, gc, lc, h=1.25, r=0.22, rnd=rnd)
    for k in range(5):
        trinkets.tumbler(f"backbar glass {k}", (-3.2 + k * 1.6, -0.65, mz0 + 3.16), M, c, 0.0)
    # on the marble: tantalus, salver of tumblers, siphon, humidor, a few bottles
    trinkets.tantalus((-0.3, -1.45, top + 0.3), M, c)
    lathe("silver salver", [(0, 0), (1.2, 0), (1.3, 0.06), (1.34, 0.12), (1.2, 0.1), (0, 0.06)], (-3.6, -1.5, top + 0.3), M["silver"], c, 64)
    for k, (dx, dy, f) in enumerate(((-0.45, -0.3, 0.35), (0.45, -0.25, 0.2), (0.0, 0.4, 0.0), (0.55, 0.45, 0.0))):
        trinkets.tumbler(f"salver tumbler {k}", (-3.6 + dx, -1.5 + dy, top + 0.42), M, c, f)
    siphon((3.0, -1.2, top + 0.3), M, c)
    bottle("whisky bottle", (4.3, -1.3, top + 0.3), M, c, (0.45, 0.22, 0.05), (0.9, 0.86, 0.72), h=3.0, r=0.4, rnd=rnd)
    # landscape above the back-bar
    library.painting("Heart of the Andes — Church", "church-heart-of-the-andes.jpg", 0.0, 9.3, 4.6, M, c, y=0.0, depth=0.4)
    # glazed bookcases either side
    library.bookcase("bar bookcase L", -9.9, 8.4, 21.0, M, c, seed=3)
    library.bookcase("bar bookcase R", 9.9, 8.4, 21.0, M, c, seed=5)
    a = anchor("whisky corner anchor", (shell.X1, (shell.Y_BACK + shell.Y_FRONT) / 2, 0), -math.pi / 2, c)
    adopt(c, a)
    return a
