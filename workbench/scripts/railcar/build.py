"""Build the 1890 private-railcar saloon from scratch.

Run inside Blender (MCP or `blender -b -P build.py`). Writes
output/railcar/railcar.blend. Everything is generated from these scripts plus
CC0 Poly Haven assets (see workbench/assets/railcar/polyhaven/credits.json)
and original generated textures in workbench/assets/railcar/textures/.
"""
import importlib
import math
import os
import sys

import bpy

ROOT = os.environ.get("LJ_ROOT", "/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai")
HERE = os.path.join(ROOT, "workbench/scripts/railcar")
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import ph, mats, geo, shell, clock, desk, lights, trinkets, furnish, cases, library, fireplace, bar, decor  # noqa: E402

OUT = os.path.join(ROOT, "output/railcar/railcar.blend")


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.materials, bpy.data.cameras):
        for b in list(blocks):
            if b.users == 0:
                blocks.remove(b)


def render_settings():
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "GPU"
    s.cycles.samples = 64
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 10
    s.cycles.transmission_bounces = 12
    s.cycles.caustics_reflective = True
    s.cycles.caustics_refractive = True
    s.cycles.blur_glossy = 0.5
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    s.view_settings.exposure = 1.1
    s.render.resolution_x, s.render.resolution_y = 1280, 720


def camera(tilt_deg=9.0):
    cam = bpy.data.cameras.new("Camera")
    cam.lens = 23.8
    cam.clip_start = 0.05
    cam.clip_end = 400
    o = bpy.data.objects.new("Camera", cam)
    bpy.context.scene.collection.objects.link(o)
    o.location = (0.0, -6.4, 2.6)
    o.rotation_euler = (1.2401 + math.radians(tilt_deg), 0, 0)
    bpy.context.scene.camera = o


def main(save=True):
    # MCP keeps Python modules alive across builds. Reload here, not only when
    # importing build.py, so repeated main() calls actually use edited sources.
    for module in (ph, mats, geo, shell, clock, desk, lights, cases, trinkets, library, fireplace, bar, furnish, decor):
        importlib.reload(module)
    reset()
    render_settings()
    M = mats.build_library(ph)
    shell.build(M)
    fireplace.build(M)
    clock.build(M)
    desk.build(M, ph)
    lights.build(M, ph)
    cases.build(M)
    trinkets.build(M)
    bar.build(M)
    fc = furnish.build(M, ph)
    stand_top = decor.build(M)
    furnish.place(ph, "vintage_microscope", "brass microscope", (-6.4, 7.6, stand_top), math.radians(200), c=fc)
    decor.exam_lights(geo.coll("lighting"))
    camera()
    import render_routes
    importlib.reload(render_routes)
    render_routes.annotate()
    for o in bpy.data.objects:
        if o.type == "LIGHT":
            o.visible_camera = False
            o.visible_glossy = o.data.type == "POINT"
    if save:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=OUT)


if __name__ == "__main__":
    main()
