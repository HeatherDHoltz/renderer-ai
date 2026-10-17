"""Bake Blender's exact view transform into a 3D LUT for the browser.

The railcar renders (output/railcar/renders/*) use Blender 5.2's AgX view with
the "AgX - Medium High Contrast" look. three.js only ships the older 16.5-stop
AgX, so the browser samples this LUT instead (workbench/src/scene.js, post pass).

Input:  scene-linear Rec.709, after exposure, log2-shaped over AgX's 25-stop
        allocation: x = 2 ** (LO + t * (HI - LO)), t = i / (N - 1).
Output: display-encoded sRGB, RGBA8, red fastest (three.js Data3DTexture order).

Run with Blender's Python (it bundles PyOpenColorIO):
    blender -b --python-expr "import sys; sys.path.insert(0, '<this dir>'); import lut; lut.run()"
"""

import os

import bpy
import numpy as np
import PyOpenColorIO as OCIO

N = 64
LO, HI = -12.47393, 12.5260688  # AgX Log allocation (lg2), from Blender's config.ocio
LOOK = "AgX - Medium High Contrast"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "../../assets/railcar/agx-mhc-lut.bin"))


def run(out=OUT):
    config_path = os.path.join(
        bpy.utils.resource_path("LOCAL"), "datafiles", "colormanagement", "config.ocio"
    )
    config = OCIO.Config.CreateFromFile(config_path)
    t = OCIO.DisplayViewTransform()
    t.setSrc(OCIO.ROLE_SCENE_LINEAR)
    t.setDisplay("sRGB")
    t.setView("AgX")
    vp = OCIO.LegacyViewingPipeline()
    vp.setDisplayViewTransform(t)
    vp.setLooksOverrideEnabled(True)
    vp.setLooksOverride(LOOK)
    cpu = vp.getProcessor(config).getDefaultCPUProcessor()

    axis = 2.0 ** (LO + np.linspace(0.0, 1.0, N) * (HI - LO))
    b, g, r = np.meshgrid(axis, axis, axis, indexing="ij")  # red varies fastest
    rgb = np.stack([r, g, b], axis=-1).reshape(-1, 3).astype(np.float32)
    flat = rgb.flatten()
    cpu.applyRGB(flat)
    disp = np.clip(flat.reshape(-1, 3), 0.0, 1.0)
    rgba = np.empty((disp.shape[0], 4), np.uint8)
    rgba[:, :3] = np.round(disp * 255.0)
    rgba[:, 3] = 255
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(rgba.tobytes())
    # Mid-grey check: 0.18 through AgX MHC should land near display 0.46–0.5.
    grey = np.array([0.18, 0.18, 0.18], np.float32)
    cpu.applyRGB(grey)
    return {"out": out, "size": N, "bytes": rgba.nbytes, "grey": [float(v) for v in grey]}
