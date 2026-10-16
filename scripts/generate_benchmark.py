"""Generate a deterministic triangle-heavy OBJ/scene; no external assets."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CELLS = 64
lines = ["# Procedural 64x64 wave grid: 4225 vertices, 8192 triangles."]
for j in range(CELLS + 1):
    for i in range(CELLS + 1):
        x = 12 * (i / CELLS - 0.5)
        z = 12 * (j / CELLS - 0.5)
        y = 0.6 * math.sin(x * 1.3) * math.cos(z * 1.1)
        lines.append(f"v {x:.9g} {y:.9g} {z:.9g}")
for j in range(CELLS):
    for i in range(CELLS):
        a = j * (CELLS + 1) + i + 1
        b, c, d = a + 1, a + CELLS + 2, a + CELLS + 1
        lines.extend([f"f {a} {c} {b}", f"f {a} {d} {c}"])
(ROOT / "assets/benchmark-grid.obj").write_text("\n".join(lines) + "\n")
scene = {
    "version": 1,
    "camera": {"position": [9, 7, 11], "target": [0, 0, 0], "fov": 45},
    "render": {"width": 384, "height": 256, "seed": 116, "sampling": "center"},
    "materials": {"wave": {"diffuse": [0.03, 0.4, 0.35], "specular": [0.3] * 3}},
    "geometries": {"wave": {"kind": "mesh", "path": "../assets/benchmark-grid.obj"}},
    "objects": [{"name": "wave", "geometry": "wave", "material": "wave", "smooth": True}],
    "lights": [{"kind": "point", "position": [-4, 8, 5], "color": [1.2, 1.1, 1]}],
}
(ROOT / "scenes/benchmark.json").write_text(json.dumps(scene, indent=2) + "\n")
print("Generated 4225 vertices / 8192 triangles and scenes/benchmark.json")
