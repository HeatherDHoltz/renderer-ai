"""Adapt Paul Wortmann's CC0 Ring.002 into a tapered, open solitaire shank.

Source: https://opengameart.org/content/ring-0 (ring_1.zip). The original pack
contains bands, not settings. The shoulders/claws are project-created. The
original weathered textures are deliberately not used. Downloads stay ignored.
"""
import math
import urllib.request
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
archive = root / "output/atelier-research/ring.zip"
if not archive.exists():
    archive.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve("https://opengameart.org/sites/default/files/ring_1.zip", archive)
source = zipfile.ZipFile(archive).read("ring_1/obj_export/ring_1_002.obj").decode()
v, f = [], []
for line in source.splitlines():
    fields = line.split()
    if not fields:
        continue
    if fields[0] == "v":
        x, z, yy = map(float, fields[1:4])
        y = -yy
        theta = math.atan2(y, x)
        shoulder = max(0, math.sin(theta)) ** 3
        radius = math.hypot(x, y)
        # A flatter inner surface, rounded outer surface and wider shoulders.
        radial = (radius - 1) * (.65 + shoulder * .45) + .91
        v.append([math.cos(theta) * radial, math.sin(theta) * radial, (z - .1) * (1.6 + shoulder * 1.5)])
    if fields[0] == "f":
        indices = [int(t.split('/')[0]) - 1 for t in fields[1:]]
        for i in range(1, len(indices) - 1):
            tri = [indices[0], indices[i], indices[i + 1]]
            cx = sum(v[k][0] for k in tri) / 3
            cy = sum(v[k][1] for k in tri) / 3
            if not (cy > .65 and abs(cx) < .65):
                f.append(tri)
# Close each boundary left by the opening. The visible joins are covered by the
# new cathedral shoulders, but a closed shank also casts coherent shadows.
edges = {}
for tri in f:
    for a, b in zip(tri, tri[1:] + tri[:1]):
        key = tuple(sorted((a, b)))
        edges.setdefault(key, []).append((a, b))
boundary = [pairs[0] for pairs in edges.values() if len(pairs) == 1]
while boundary:
    a, b = boundary.pop()
    loop = [a, b]
    while loop[-1] != loop[0]:
        idx = next(i for i, edge in enumerate(boundary) if edge[0] == loop[-1])
        loop.append(boundary.pop(idx)[1])
    loop.pop()
    center = [sum(v[k][i] for k in loop) / len(loop) for i in range(3)]
    ci = len(v)
    v.append(center)
    for a, b in zip(loop, loop[1:] + loop[:1]):
        f.append([b, a, ci])
out = root / "workbench/assets/solitaire-shank.obj"
out.write_text("# Adapted from Paul Wortmann Ring.002, CC0; see docs/GEM-COLOR.md\n" + "\n".join("v " + " ".join(f"{c:.7f}" for c in p) for p in v) + "\n" + "\n".join("f " + " ".join(str(k + 1) for k in tri) for tri in f) + "\n")
print(out, len(v), len(f))
