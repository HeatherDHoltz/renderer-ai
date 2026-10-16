"""Create a closed indexed torus OBJ with independent seam UVs; no third-party assets."""
from pathlib import Path
import math

MAJOR, MINOR, U, V = 1.0, 0.24, 96, 24
lines = ["# Project-generated Y-axis torus: R=1, r=.24, 2304 positions, 4608 triangles"]
positions, normals = [], []
for u in range(U):
    phi = math.tau * u / U
    for v in range(V):
        theta = math.tau * v / V
        radius = MAJOR + MINOR * math.cos(theta)
        positions.append((radius * math.cos(phi), MINOR * math.sin(theta), radius * math.sin(phi)))
        normals.append((math.cos(theta) * math.cos(phi), math.sin(theta), math.cos(theta) * math.sin(phi)))
lines += ["v " + " ".join(f"{x:.8f}" for x in p) for p in positions]
lines += ["vn " + " ".join(f"{x:.8f}" for x in n) for n in normals]
for u in range(U + 1):
    for v in range(V + 1):
        lines.append(f"vt {u/U:.8f} {v/V:.8f}")

def corner(u, v):
    position = (u % U) * V + v % V + 1
    uv = u * (V + 1) + v + 1
    return f"{position}/{uv}/{position}"

for u in range(U):
    for v in range(V):
        a, b, c, d = corner(u, v), corner(u, v + 1), corner(u + 1, v + 1), corner(u + 1, v)
        lines += [f"f {a} {b} {c}", f"f {a} {c} {d}"]
root = Path(__file__).resolve().parent.parent
path = root / "assets/torus.obj"
path.write_text("\n".join(lines) + "\n")
print(f"Generated {path.name}: {len(positions)} vertices, {2*U*V} triangles")
