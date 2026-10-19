"""Render Poly Haven conifers into impostor atlases for the browser's Alps.

The full models (Poly Haven "Fir Tree 01" and "Pine Tree 01", CC0) are far too
heavy for hundreds of instances in a browser, so each is rendered in Cycles
from VIEWS azimuths around it, lit by the same low sunset sun and sky as the
live landscape (src/landscape.js), on a transparent background. The browser
draws camera-facing cards that pick the nearest view.

Run inside Blender (uses its own scratch scene; the railcar scene is untouched):
    import impostors; impostors.run()
Writes workbench/assets/railcar/export/railcar-trees.webp and railcar-trees.json.
"""
import json
import math
import os
import time

import bpy
from mathutils import Vector

ROOT = os.environ.get("LJ_ROOT", "/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai")
PH = os.path.join(ROOT, "workbench/assets/railcar/polyhaven")
OUT = os.path.join(ROOT, "workbench/assets/railcar/export")
TMP = os.path.join(ROOT, "output/railcar/impostors")
LOG = os.path.join(ROOT, "output/railcar/impostors-log.txt")
TREES = ("fir_tree_01", "pine_tree_01")
NIGHT = os.environ.get("LJ_NIGHT") == "1"
VIEWS = 4 if NIGHT else 8
CELL = (640, 1280) if NIGHT else (256, 512)  # width, height per view
COLS = 6 if NIGHT else VIEWS  # atlas grid columns
# Must match src/landscape.js: sun direction (app coords) and colour, sky strength.
SUN_APP = Vector((-0.45, 0.0, 0.89)).normalized()
SUN_ELEV = math.radians(6.0)
SUN_RGB = (1.0, 0.62, 0.4)
SUN_IRRADIANCE = 5.0 * math.pi  # runtime omits Lambert's 1/pi
SKY_HDRI = os.path.join(PH, "qwantani_sunset_puresky/qwantani_sunset_puresky_4k.hdr")
SKY_STRENGTH = 0.15


def log(*a):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a) + "\n")


def app_to_blender(v):
    return Vector((v.x, -v.z, v.y))


def setup_scene():
    # Background (blender -b): render in the startup scene; never touch a user's file.
    s = bpy.context.scene if bpy.app.background else (bpy.data.scenes.get("impostors") or bpy.data.scenes.new("impostors"))
    for o in list(s.collection.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    s.render.engine = "CYCLES"
    s.cycles.device = "GPU"
    s.cycles.samples = 128 if NIGHT else 64
    s.cycles.use_denoising = True
    s.render.film_transparent = True
    s.render.resolution_x, s.render.resolution_y = CELL
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.view_settings.exposure = 0.0
    # Sky: the same panorama, rotated like the runtime (its sun along SUN_APP).
    w = bpy.data.worlds.new("impostor sky")
    s.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(SKY_HDRI, check_existing=True)
    mp = nt.nodes.new("ShaderNodeMapping")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sun_b = app_to_blender(Vector((SUN_APP.x * math.cos(SUN_ELEV), math.sin(SUN_ELEV), SUN_APP.z * math.cos(SUN_ELEV))))
    # Panorama's sun sits at u = 0.6 (measured); rotate so it points along sun_b.
    target = math.atan2(sun_b.y, sun_b.x)
    source = (0.5 - 0.6) * 2 * math.pi
    mp.inputs["Rotation"].default_value = (0, 0, source - target)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], env.inputs["Vector"])
    nt.links.new(env.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = SKY_STRENGTH
    nt.links.new(bg.outputs[0], out.inputs[0])
    sun = bpy.data.lights.new("impostor sun", "SUN")
    sun.color = SUN_RGB
    sun.energy = SUN_IRRADIANCE
    sun.angle = math.radians(1.0)
    so = bpy.data.objects.new("impostor sun", sun)
    so.rotation_euler = (-sun_b).to_track_quat("-Z", "Y").to_euler()
    if NIGHT:
        # Moonlight from behind and above the trees (rim light toward the car),
        # plus a faint, cool night sky. No sunset panorama.
        nt.nodes.remove(env)
        bg.inputs["Color"].default_value = (0.020, 0.028, 0.050, 1)
        bg.inputs["Strength"].default_value = 1.0
        sun.color = (0.62, 0.72, 1.0)
        sun.energy = 1.4
        sun.angle = math.radians(0.6)
        moon = Vector((0.25, 1.0, 0.75)).normalized()  # from the far side (+y), high
        so.rotation_euler = (-moon).to_track_quat("-Z", "Y").to_euler()
    s.collection.objects.link(so)
    cam = bpy.data.cameras.new("impostor cam")
    cam.type = "ORTHO"
    co = bpy.data.objects.new("impostor cam", cam)
    s.collection.objects.link(co)
    s.camera = co
    return s, co


def import_tree(scene, name):
    window = bpy.context.window
    previous = window.scene if window else None
    if window:
        window.scene = scene
    before = set(scene.collection.all_objects)
    path = os.path.join(PH, name, f"{name}_2k.gltf")
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in scene.collection.all_objects if o not in before]
    if window:
        window.scene = previous
    meshes = [o for o in objs if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return objs, lo, hi


def run():
    open(LOG, "w").close()
    os.makedirs(TMP, exist_ok=True)
    scene, cam = setup_scene()
    meta = {"views": VIEWS, "cell": list(CELL), "trees": []}
    frames = []
    for name in TREES:
        t = time.time()
        objs, _, _ = import_tree(scene, name)
        # Each file holds several variants side by side (fir_tree_01_a/b/c...):
        # render every top-level mesh on its own, centred in its frame.
        variants = [o for o in objs if o.type == "MESH" and (o.parent is None or o.parent.type != "MESH")]
        log(name, "imported", f"{time.time() - t:.0f}s", len(variants), "variants")
        for v in variants:
            for o in variants:
                o.hide_render = o is not v
            pts = [v.matrix_world @ Vector(c) for c in v.bound_box]
            lo = Vector([min(p[i] for p in pts) for i in range(3)])
            hi = Vector([max(p[i] for p in pts) for i in range(3)])
            size = hi - lo
            height = size.z
            width = max(size.x, size.y)
            centre = (lo + hi) / 2
            span = max(height * 1.04, width * 1.04 * CELL[1] / CELL[0])
            cam.data.ortho_scale = span
            bottom = lo.z - 0.02 * height
            row = []
            for k in range(VIEWS):
                # Night: all views from the car's side of the trees (backlit), varied.
                a = (-math.pi / 2 + (k - 1.5) * 0.35) if NIGHT else 2 * math.pi * k / VIEWS
                d = Vector((math.cos(a), math.sin(a), 0))
                cam.location = Vector((centre.x, centre.y, bottom + span / 2)) + d * (width * 3 + 10)
                cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
                cam.data.clip_end = width * 6 + 40
                path = os.path.join(TMP, f"{v.name}-{k}.png")
                scene.render.filepath = path
                window = bpy.context.window
                previous = window.scene if window else None
                if window:
                    window.scene = scene
                bpy.ops.render.render(write_still=True, scene=scene.name)
                if window:
                    window.scene = previous
                row.append(path)
            frames.append(row)
            log(" ", v.name, "height m", round(height, 2), "width m", round(width, 2), f"{time.time() - t:.0f}s")
            # Card in metres: frame size, and the base's height within the frame.
            meta["trees"].append({"name": v.name, "heightM": round(height, 3),
                                  "frameW": round(span * CELL[0] / CELL[1], 3), "frameH": round(span, 3),
                                  "baseV": round((lo.z - bottom) / span, 4)})
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)
    # Pack: cells in reading order (variant-major), COLS per row.
    cells = [p for row in frames for p in row]
    rows = (len(cells) + COLS - 1) // COLS
    W, H = CELL[0] * COLS, CELL[1] * rows
    atlas = bpy.data.images.new("railcar-trees", W, H, alpha=True)
    import numpy as np
    buf = np.zeros((H, W, 4), dtype=np.float32)
    for n, path in enumerate(cells):
        r, k = divmod(n, COLS)
        img = bpy.data.images.load(path, check_existing=False)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(CELL[1], CELL[0], 4)
        bpy.data.images.remove(img)
        y0 = H - (r + 1) * CELL[1]  # Blender rows are bottom-up; row 0 at the top
        buf[y0:y0 + CELL[1], k * CELL[0]:(k + 1) * CELL[0]] = px
    meta["cols"], meta["rows"] = COLS, rows
    atlas.pixels.foreach_set(buf.ravel())
    s = scene.render.image_settings
    s.file_format = "WEBP"
    s.color_mode = "RGBA"
    s.quality = 92
    name = "railcar-trees-night" if NIGHT else "railcar-trees"
    out = os.path.join(OUT, name + ".webp")
    atlas.save_render(out, scene=scene)
    bpy.data.images.remove(atlas)
    json.dump(meta, open(os.path.join(OUT, name + ".json"), "w"), indent=1)
    if not bpy.app.background:
        bpy.data.scenes.remove(scene)
    log("DONE", out, os.path.getsize(out))
    return meta
