"""Room-scale dressing outside the desk: library bay, globe, paintings, fireside
table, microscope stand, and the examination lighting for the jewellery."""
import math
import os
import bpy
from mathutils import Vector
from geo import FLOOR, DESK_TOP, box, cyl, sphere, lathe, coll, anchor, adopt
import shell
import library
import trinkets

CARPET = FLOOR + 0.04
GLOBE_TEX = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../assets/railcar/textures/antique-globe.jpg"))


def round_table(name, loc, M, c, r=1.9, h=7.0, marble=True):
    x, y, z = loc
    lathe(f"{name} pedestal", [(0, 0), (1.3, 0), (1.2, 0.25), (0.5, 0.5), (0.3, 1.2), (0.42, 2.2), (0.22, 3.5), (0.3, h - 0.6), (0.5, h - 0.4), (0, h - 0.4)],
          loc, M["mahogany"], c, 40)
    for k in range(3):
        a = 2 * math.pi * k / 3
        sphere(f"{name} foot {k}", (x + 1.25 * math.cos(a), y + 1.25 * math.sin(a), z + 0.15), 0.22, M["brass"], c, scale=(1, 1, 0.7))
    lathe(f"{name} top", [(0, 0), (r, 0), (r + 0.08, 0.12), (r, 0.35), (0, 0.35)], (x, y, z + h - 0.4), M["marble_dark"] if marble else M["mahogany"], c, 64)
    box(f"{name} apron", (x - 0.01, y - 0.01, z + h - 0.7), (x + 0.01, y + 0.01, z + h - 0.4), M["mahogany"], c)
    return z + h - 0.05


def build(M):
    c = coll("room decor")
    # library bay on the window wall (old stove bay)
    lib = coll("library bay")
    library.bookcase("library bookcase", 0.0, 7.4, 21.5, M, lib, seed=11)
    adopt(lib, anchor("library bay anchor", (shell.STOVE_BAY, shell.Y_BACK, 0), 0.0, lib))
    # big landscape over the settee on the opposite wall
    wall = coll("front wall art")
    library.painting("The Rocky Mountains, Lander's Peak — Bierstadt", "bierstadt-landers-peak.jpg", 0.0, 4.6, 6.2, M, wall, y=0.0, depth=0.45)
    adopt(wall, anchor("front art anchor", (0.0, shell.Y_FRONT, 0), math.pi, wall))
    # portraits flanking the fireplace on the left end bulkhead
    fp = coll("fireplace portraits")
    library.painting("Lady Maria Conyngham — Lawrence", "lawrence-lady-maria-conyngham.jpg", -10.3, 4.2, 5.2, M, fp, y=0.0)
    library.painting("Mrs Hugh Hammersley — Sargent", "sargent-mrs-hugh-hammersley.jpg", 10.3, 4.2, 5.2, M, fp, y=0.0)
    adopt(fp, anchor("fireplace portraits anchor", (shell.X0, (shell.Y_BACK + shell.Y_FRONT) / 2, 0), math.pi / 2, fp))
    # globe in the front-left corner, microscope on a stand beside the library
    library.globe((-20.5, -22.5, CARPET), M, c, GLOBE_TEX)
    t = round_table("instrument stand", (-6.4, 7.6, CARPET), M, c, r=1.5, h=7.6)
    import furnish  # noqa: F401 (place() lives there)
    # fireside table between the armchairs: book, spectacles, a nightcap
    tt = round_table("fireside table", (-17.6, -8.5, CARPET), M, c, r=1.7, h=6.0, marble=False)
    trinkets.books((-17.4, -8.3, tt), M, c, sizes=((1.9, 1.3, 0.3), (1.6, 1.1, 0.24)), rz=0.4)
    trinkets.tumbler("fireside tumbler", (-18.4, -9.3, tt), M, c, 0.3)
    # bar-side table with humidor
    bt = round_table("bar table", (19.5, -9.0, CARPET), M, c, r=1.6, h=6.0)
    import bar
    bar.humidor((19.5, -9.0, bt), M, c)
    trinkets.tumbler("bar table tumbler", (18.6, -8.0, bt), M, c, 0.25)
    return t


def exam_lights(c):
    """Bright, neutral light for the jewellery so colour reads true.
    Large soft daylight panel over the work plus a tighter key on the ring."""
    L = bpy.data.lights.new("examination daylight", "AREA")
    L.shape = "RECTANGLE"
    L.size, L.size_y = 7.0, 3.0
    L.energy = 700
    L.color = (1.0, 0.98, 0.95)
    lo = bpy.data.objects.new("examination daylight", L)
    lo.location = (0.0, -1.6, 9.5)
    c.objects.link(lo)
    for k, (x, y) in enumerate(((-2.85, -1.45), (3.05, -1.4))):
        S = bpy.data.lights.new(f"case key {k}", "SPOT")
        S.energy = 260
        S.color = (1.0, 0.98, 0.95)
        S.spot_size = math.radians(22)
        S.spot_blend = 0.6
        S.shadow_soft_size = 0.4
        so = bpy.data.objects.new(f"case key {k}", S)
        so.location = (x * 0.7, -5.5, 8.0)
        so.rotation_euler = (Vector((x, y, -0.6)) - so.location).to_track_quat("-Z", "Y").to_euler()
        c.objects.link(so)
