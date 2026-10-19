"""Prepare the photographic Alps view for the railcar windows (prototype).

Source: "Landscape of Bernese Oberland from Männlichen, 2012 August" by
Ximonic (Simo Räsänen), Wikimedia Commons, CC BY-SA 3.0. The derived images
written here (graded panorama, depth map, foreground strips) are adaptations
and are shared under the same license.

Steps (run with the depth venv: output/depth-venv/bin/python window_photo.py <step>):
  depth   Depth Anything V2 (Base) relative depth, run on overlapping tiles and
          stitched, saved as 16-bit PNG next to the source (authoring only)
  build   golden-hour grade, published panorama + depth, seamless foreground
          strips -> workbench/assets/railcar/export/window/
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.environ.get("LJ_ROOT", "/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai")
SRC = os.path.join(ROOT, "output/railcar/alps-photo")
OUT = os.path.join(ROOT, "workbench/assets/railcar/export/window")
PHOTO = os.path.join(SRC, "mannlichen-original.jpg")
DEPTH = os.path.join(SRC, "mannlichen-depth16.png")
Image.MAX_IMAGE_PIXELS = None


def depth():
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    name = "depth-anything/Depth-Anything-V2-Base-hf"
    proc = AutoImageProcessor.from_pretrained(name)
    model = AutoModelForDepthEstimation.from_pretrained(name).to(device).eval()
    img = Image.open(PHOTO).convert("RGB")
    W, H = img.size
    # Square-ish overlapping tiles keep the model near its training aspect;
    # each tile's relative depth is fitted to its left neighbour on the overlap.
    tile, step = H, int(H * 0.6)
    xs = list(range(0, W - tile, step)) + [W - tile]
    out = np.zeros((H, W), np.float64)
    weight = np.zeros((H, W), np.float64)
    prev = None
    for x in xs:
        crop = img.crop((x, 0, x + tile, H))
        inputs = proc(images=crop, return_tensors="pt").to(device)
        with torch.no_grad():
            pred = model(**inputs).predicted_depth
        d = torch.nn.functional.interpolate(pred[None], size=(H, tile), mode="bicubic", align_corners=False)[0, 0]
        d = d.float().cpu().numpy().astype(np.float64)
        if prev is not None:
            ov = slice(x, prev[0] + tile)
            a = d[:, : ov.stop - x].ravel()
            b = out[:, ov].ravel() / np.maximum(weight[:, ov].ravel(), 1e-9)
            A = np.vstack([a, np.ones_like(a)]).T
            s, o = np.linalg.lstsq(A, b, rcond=None)[0]
            d = d * s + o
        ramp = np.ones(tile)
        f = tile - step
        ramp[:f] = np.linspace(0, 1, f) if prev is not None else 1
        ramp[-f:] = np.minimum(ramp[-f:], np.linspace(1, 0, f)) if x != xs[-1] else ramp[-f:]
        out[:, x:x + tile] += d * ramp
        weight[:, x:x + tile] += ramp
        prev = (x,)
        print("tile", x, flush=True)
    disp = out / np.maximum(weight, 1e-9)
    disp = (disp - disp.min()) / (disp.max() - disp.min())
    Image.fromarray((disp * 65535).astype(np.uint16)).save(DEPTH)
    print("saved", DEPTH)


PANO_W = 8192          # published width (safe WebGL texture size)
WRAP = 0.06            # share of the width crossfaded so the drift loops seamlessly


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def grade(rgb, disp):
    """Daylight photo -> late golden hour: warm low sun on the peaks, valley
    sliding into shade, warmer sky toward the horizon, faint alpenglow on snow."""
    h, w, _ = rgb.shape
    lin = (rgb / 255.0) ** 2.2
    row = np.linspace(0, 1, h)[:, None]
    lum = lin @ np.array([0.2126, 0.7152, 0.0722])
    sat = lin.max(-1) - lin.min(-1)
    sky = smooth(1 - disp, 0.82, 0.92) * (1 - smooth(row, 0.35, 0.5))
    snow = smooth(lum, 0.35, 0.6) * (1 - smooth(sat, 0.08, 0.2)) * (1 - sky)
    # low sun: the higher (further, upper) terrain keeps light, the valley loses it
    shade = 0.45 + 0.55 * (1 - smooth(row, 0.25, 0.75)) * (1 - 0.4 * smooth(disp, 0.45, 0.8))
    out = lin * np.where(sky[..., None] > 0.5, 1.0, shade[..., None])
    out = out * np.array([1.12, 0.98, 0.78])          # warm white balance
    out = out * (1 + snow[..., None] * np.array([0.22, -0.02, -0.12]))  # alpenglow
    warm_sky = np.array([1.25, 0.86, 0.62]) * (0.55 + 0.45 * smooth(row, 0.0, 0.42))[:, :, None]
    out = out * (1 - sky[..., None]) + out * sky[..., None] * warm_sky
    out = out * 0.82
    out = np.clip(out, 0, 1) ** (1 / 2.2)
    return (out * 255).round().astype(np.uint8)


def seamless_h(img, frac):
    """Crossfade the last `frac` of the width into the start: the result
    tiles horizontally (width shrinks by the overlap)."""
    h, w = img.shape[:2]
    o = int(w * frac)
    a = img[:, : w - o].astype(np.float32).copy()
    t = np.linspace(0, 1, o)[None, :, None] if img.ndim == 3 else np.linspace(0, 1, o)[None, :]
    a[:, :o] = img[:, w - o:] * (1 - t) + img[:, :o] * t
    return a


def strip(src, box, size, top_alpha):
    """A seamless foreground strip cut from the photo, with a soft irregular top."""
    x0, y0, x1, y1 = box
    crop = src.crop((x0, y0, x1, y1)).resize(size, Image.LANCZOS)
    a = seamless_h(np.asarray(crop).astype(np.float32), 0.25)
    h, w = a.shape[:2]
    alpha = np.ones((h, w), np.float32)
    if top_alpha:
        rng = np.random.default_rng(7)
        # A soft, rolling bank top (tiling with the strip's period): spiky noise
        # read as streaks once motion-blurred close to the window.
        noise = rng.random(w)
        for _ in range(60):
            noise = (noise + np.roll(noise, 1) + np.roll(noise, -1)) / 3
        noise = (noise - noise.min()) / (np.ptp(noise) + 1e-6)
        edge = (0.05 + 0.12 * noise) * h
        rows = np.arange(h)[:, None]
        alpha = np.clip((rows - edge[None, :]) / (0.07 * h), 0, 1)
    rgba = np.dstack([a, alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def build():
    os.makedirs(OUT, exist_ok=True)
    src = Image.open(PHOTO).convert("RGB")
    W, H = src.size
    disp = np.asarray(Image.open(DEPTH)).astype(np.float32) / 65535.0
    ph = int(round(PANO_W / (1 - WRAP) * H / W))
    full = src.resize((int(PANO_W / (1 - WRAP)), ph), Image.LANCZOS)
    dfull = np.asarray(Image.fromarray(disp).resize(full.size, Image.BILINEAR))
    graded = grade(np.asarray(full).astype(np.float32), dfull)
    pano = seamless_h(graded.astype(np.float32), WRAP).round().astype(np.uint8)
    Image.fromarray(pano).save(os.path.join(OUT, "alps-panorama.webp"), quality=90, method=6)
    # depth: 16-bit disparity split into two 8-bit channels (R high, G low)
    dsmall = np.asarray(Image.fromarray(dfull).resize((2048, int(2048 * ph / full.size[0] + 0.5)), Image.BILINEAR))
    dsm = seamless_h(dsmall, WRAP)
    q = (np.clip(dsm, 0, 1) * 65535).round().astype(np.uint16)
    packed = np.dstack([(q >> 8).astype(np.uint8), (q & 255).astype(np.uint8), np.zeros_like(q, np.uint8)])
    Image.fromarray(packed, "RGB").save(os.path.join(OUT, "alps-depth.png"), optimize=True)
    # Foreground strips from the photo's own pasture (mid) and ridge grass (near),
    # graded the same way so they sit in the same light.
    gsrc = Image.fromarray(graded).resize(src.size, Image.LANCZOS)
    # Mid: open pasture left of the pond (no pond, huts or paths that would
    # visibly repeat). Near: the ridge's grass and flowers, as wide as possible.
    mid = strip(gsrc, (int(W * 0.12), int(H * 0.64), int(W * 0.31), int(H * 0.90)), (4096, 560), True)
    near = strip(gsrc, (int(W * 0.56), int(H * 0.74), int(W * 0.86), int(H * 0.99)), (4096, 512), True)
    mid.save(os.path.join(OUT, "alps-mid.webp"), quality=88, method=6)
    near.save(os.path.join(OUT, "alps-near.webp"), quality=88, method=6)
    meta = {
        "source": "Landscape of Bernese Oberland from Männlichen, 2012 August — Ximonic (Simo Räsänen), "
                  "Wikimedia Commons, CC BY-SA 3.0; graded/derived images CC BY-SA 3.0",
        "page": "https://commons.wikimedia.org/wiki/File:Landscape_of_Bernese_Oberland_from_M%C3%A4nnlichen,_2012_August.JPG",
        "panorama": "alps-panorama.webp", "depth": "alps-depth.png", "mid": "alps-mid.webp", "near": "alps-near.webp",
        "panoramaAspect": round(pano.shape[1] / pano.shape[0], 4),
    }
    json.dump(meta, open(os.path.join(OUT, "window.json"), "w"), indent=1)
    for f in ("alps-panorama.webp", "alps-depth.png", "alps-mid.webp", "alps-near.webp"):
        print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == "__main__":
    {"depth": depth, "build": build}[sys.argv[1]]()
