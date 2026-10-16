#!/usr/bin/env python3
"""An independent Mitsuba volume-scattering study; does not use the Rust shader."""
import argparse
import json
import os
from pathlib import Path
import time
import subprocess

# Homebrew's keg-only LLVM enables Mitsuba's vectorized CPU backend. The
# environment remains local to this process; scalar CPU also works without it.
LLVM = Path("/opt/homebrew/opt/llvm@18/lib/libLLVM.dylib")
if LLVM.exists():
    os.environ.setdefault("DRJIT_LIBLLVM_PATH", str(LLVM))

import drjit as dr
import mitsuba as mi
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/mitsuba-tigers-eye"
OIDN = ROOT / "output/oidn-2.3.3.arm64.macos/bin/oidnDenoise"


def denoise_display(rgb, path, threads):
    """Optional OIDN cleanup after tone mapping; retain the original raw film."""
    if not OIDN.exists():
        raise RuntimeError(
            "OIDN missing: run python3 scripts/setup_mitsuba.py --denoiser"
        )
    source = path.with_name(path.stem + "-display-input.pfm")
    target = path.with_name(path.stem + "-display-denoised.pfm")
    mi.Bitmap(np.asarray(rgb, dtype=np.float32)).write(str(source))
    subprocess.run(
        [
            str(OIDN),
            "--ldr",
            str(source),
            "--srgb",
            "--output",
            str(target),
            "--device",
            "cpu",
            "--threads",
            str(threads),
            "--verbose",
            "0",
        ],
        check=True,
    )
    return np.clip(np.asarray(mi.Bitmap(str(target))), 0, 1)


def volume_fields(resolution):
    """Continuous mineral bands, depth variation, and a positive-definite SGGX field."""
    # Mitsuba's grid layout is Z,Y,X,channels. Values are linear physical data.
    axis = np.linspace(0, 1, resolution, dtype=np.float32)
    z, y, x = np.meshgrid(
        axis, np.linspace(0, 1, 40, dtype=np.float32), axis, indexing="ij"
    )
    tau = 2 * np.pi
    # Broad, nonuniform bundles with finer longitudinal striations. The same
    # warped coordinate supplies the color structure and the fiber directions.
    warp = (
        0.040 * np.sin(tau * (1.2 * z + 0.35 * y))
        + 0.014 * np.sin(tau * (3.4 * z - 0.8 * x + 0.5 * y))
        + 0.008 * np.sin(tau * (6.1 * z + 1.7 * x))
    )
    q = x + warp + 0.025 * y
    broad = (
        0.50
        + 0.24 * np.sin(tau * (4.7 * q + 0.18 * np.sin(9 * q)))
        + 0.14 * np.sin(tau * (11.3 * q + 0.08 * np.sin(14 * z)))
        + 0.08 * np.sin(tau * 22.7 * q)
    )
    fine = (
        0.5
        + 0.28 * np.sin(tau * (77 * q + 0.15 * np.sin(4 * z)))
        + 0.16 * np.sin(tau * (113 * q + 0.21 * np.sin(8 * z)))
    )
    value = np.clip((0.83 * broad + 0.17 * fine - 0.25) / 0.50, 0, 1)
    low = np.array([0.57, 0.22, 0.045], np.float32)
    high = np.array([0.998, 0.965, 0.78], np.float32)
    albedo = low + (high - low) * value[..., None]
    # Needle orientation follows the longitudinal derivative of the warped
    # bundles, plus modest out-of-plane bending. World extents: 1.8,.7,2.3.
    dq_dz = (
        0.040 * tau * 1.2 * np.cos(tau * (1.2 * z + 0.35 * y))
        + 0.014 * tau * 3.4 * np.cos(tau * (3.4 * z - 0.8 * x + 0.5 * y))
        + 0.008 * tau * 6.1 * np.cos(tau * (6.1 * z + 1.7 * x))
    )
    tx = -0.07 * dq_dz * (1.8 / 2.3)
    ty = 0.022 * np.sin(tau * (2.8 * q + 0.4 * z))
    norm = np.sqrt(tx * tx + ty * ty + 1)
    tx, ty, tz = tx / norm, ty / norm, 1 / norm
    # Fiber-like distribution: normals largely perpendicular to the needle.
    # S = I + (epsilon^2 - 1) t t^T, with eigenvalues 1,1,epsilon^2.
    epsilon = 0.025 + 0.020 * value
    k = epsilon * epsilon - 1
    s = np.stack(
        (
            1 + k * tx * tx,
            1 + k * ty * ty,
            1 + k * tz * tz,
            k * tx * ty,
            k * tx * tz,
            k * ty * tz,
        ),
        axis=-1,
    )
    sigma = (100 + 80 * (1 - value))[..., None]
    return albedo.astype(np.float32), sigma.astype(np.float32), s.astype(np.float32)


def build_scene(args):
    T = mi.ScalarTransform4f
    albedo, sigma, fibers = volume_fields(args.grid)
    field_to_world = T.translate([-0.9, 0.04, -1.15]) @ T.scale([1.8, 0.7, 2.3])

    def grid(data):
        return {
            "type": "gridvolume",
            "grid": mi.VolumeGrid(data),
            "to_world": field_to_world,
            "raw": True,
        }

    medium = {
        "type": "heterogeneous",
        "albedo": grid(albedo),
        "sigma_t": grid(sigma * args.density),
        "sample_emitters": False,
        "phase": {"type": "sggx", "S": grid(fibers)},
    }
    scene = {
        "type": "scene",
        "integrator": {"type": "volpath", "max_depth": 80, "rr_depth": 8},
        "sensor": {
            "type": "perspective",
            "fov": 21,
            "to_world": T.look_at(
                origin=[2.2, 4.7, 6.5], target=[0, 0.23, 0], up=[0, 1, 0]
            ),
            "sampler": {"type": "independent", "sample_count": args.spp},
            "film": {
                "type": "hdrfilm",
                "width": args.width,
                "height": args.height,
                "pixel_format": "rgb",
                "rfilter": {"type": "tent"},
            },
        },
        "stone": {
            "type": "obj",
            "filename": str(ROOT / "assets/gems/cabochon.obj"),
            "to_world": T.translate([0, 0.04, 0]),
            "bsdf": {"type": "dielectric", "int_ior": 1.545, "ext_ior": 1.000277},
            "interior": medium,
        },
        "floor": {
            "type": "rectangle",
            "to_world": T.rotate([1, 0, 0], -90) @ T.scale(200),
            "bsdf": {
                "type": "diffuse",
                "reflectance": {"type": "rgb", "value": [0.018, 0.022, 0.028]},
            },
        },
        "environment": {"type": "constant", "radiance": 0.12},
        "key": {
            "type": "rectangle",
            "to_world": T.look_at(
                origin=[-2.0, 4.5, args.light_z], target=[0, 0.2, 0], up=[0, 1, 0]
            )
            @ T.scale([args.key_width, args.key_height, 1]),
            "emitter": {
                "type": "area",
                # Preserve emitter power when changing softbox dimensions.
                "radiance": 120 * (.8 * .4) / (args.key_width * args.key_height),
            },
        },
        "rim": {
            "type": "rectangle",
            "to_world": T.look_at(origin=[3.5, 3, 1], target=[0, 0.2, 0], up=[0, 1, 0])
            @ T.scale([0.3, 1.3, 1]),
            "emitter": {"type": "area", "radiance": 5},
        },
    }
    if args.layered:
        # Effective opaque fiber bed below a genuinely refracting/scattering
        # quartz shell. This is an appearance approximation, not measured ore.
        yy, xx = np.mgrid[0:1024, 0:1024].astype(np.float32) / 1023
        warp = (
            0.040 * np.sin(2 * np.pi * 1.2 * yy)
            + 0.014 * np.sin(2 * np.pi * (3.4 * yy - 0.8 * xx))
            + 0.008 * np.sin(2 * np.pi * (6.1 * yy + 1.7 * xx))
        )
        q = xx + warp
        b = (
            0.5
            + 0.24 * np.sin(2 * np.pi * (4.7 * q + 0.18 * np.sin(9 * q)))
            + 0.14 * np.sin(2 * np.pi * (11.3 * q + 0.08 * np.sin(14 * yy)))
            + 0.08 * np.sin(2 * np.pi * 22.7 * q)
        )
        fine = (
            0.5
            + 0.28 * np.sin(2 * np.pi * (177 * q + 0.15 * np.sin(4 * yy)))
            + 0.16 * np.sin(2 * np.pi * (313 * q + 0.21 * np.sin(8 * yy)))
        )
        v = np.clip((0.83 * b + 0.17 * fine - 0.25) / 0.50, 0, 1)
        reflectance = (0.035 + 0.85 * v**1.5)[..., None] * np.array(
            [1.0, 0.9, 0.75], np.float32
        )
        scene["fiber_bed"] = {
            "type": "obj",
            "filename": str(ROOT / "assets/gems/cabochon.obj"),
            "to_world": T.translate([0, 0.042, 0]) @ T.scale([0.97, 0.95, 0.97]),
            "bsdf": {
                "type": "roughconductor",
                "material": "Au",
                "distribution": "ggx",
                "alpha_u": 0.40,
                "alpha_v": 0.025,
                "specular_reflectance": {
                    "type": "bitmap",
                    "bitmap": mi.Bitmap(reflectance.astype(np.float32)),
                    "raw": True,
                },
            },
            "exterior": medium,
        }
    if args.isotropic:
        medium["phase"] = {"type": "isotropic"}
    return mi.load_dict(scene)


def display_rgb(linear, exposure):
    # Global photographic mapping only; never add or paint the sheen in post.
    x = np.maximum(linear * exposure, 0)
    x = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=900)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--spp", type=int, default=3072)
    parser.add_argument("--batch-spp", type=int, default=64)
    parser.add_argument("--grid", type=int, default=384)
    parser.add_argument("--threads", type=int, default=10)
    parser.add_argument("--seed", type=int, default=116)
    parser.add_argument("--light-z", type=float, default=-4)
    parser.add_argument("--key-width", type=float, default=0.8)
    parser.add_argument("--key-height", type=float, default=0.4)
    parser.add_argument(
        "--variant",
        choices=["scalar_rgb", "llvm_ad_rgb"],
        default="llvm_ad_rgb" if LLVM.exists() else "scalar_rgb",
    )
    parser.add_argument("--exposure", type=float, default=1.65)
    parser.add_argument("--isotropic", action="store_true")
    parser.add_argument("--layered", action="store_true", default=True)
    parser.add_argument("--volume-only", action="store_false", dest="layered")
    parser.add_argument("--density", type=float, default=0.1)
    parser.add_argument("--denoise", action="store_true")
    parser.add_argument("--output", type=Path, default=OUT / "tigers-eye.png")
    args = parser.parse_args()
    if not (
        16 <= args.width <= 4096
        and 16 <= args.height <= 4096
        and 1 <= args.spp <= 65536
        and 32 <= args.grid <= 512
        and 1 <= args.threads <= 64
        and 1 <= args.batch_spp <= 1024
        and np.isfinite(args.exposure)
        and args.exposure > 0
        and np.isfinite(args.light_z)
        and np.isfinite(args.density)
        and 0 < args.density <= 10
        and 0 < args.key_width <= 10
        and 0 < args.key_height <= 10
    ):
        parser.error("render settings outside supported resource limits")
    if args.denoise and not OIDN.exists():
        parser.error(
            "install the optional denoiser with scripts/setup_mitsuba.py --denoiser"
        )
    mi.set_variant(args.variant)
    dr.set_thread_count(args.threads)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    start = time.perf_counter()
    scene = build_scene(args)
    build_seconds = time.perf_counter() - start
    print(
        f"Mitsuba {mi.__version__}, {mi.variant()}, {args.width}x{args.height}, {args.spp} spp",
        flush=True,
    )
    start = time.perf_counter()
    accumulation = np.zeros((args.height, args.width, 3), dtype=np.float64)
    done = 0
    batch = 0
    while done < args.spp:
        count = min(args.batch_spp, args.spp - done)
        image = mi.render(scene, seed=(args.seed + batch) % 2**32, spp=count)
        pixels = np.asarray(image)
        if not np.isfinite(pixels).all() or np.any(pixels < 0):
            raise RuntimeError("nonfinite or negative radiance in a render batch")
        accumulation += pixels.astype(np.float64) * count
        done += count
        batch += 1
        if batch % 4 == 0 or done == args.spp:
            rgb = display_rgb(accumulation / done, args.exposure)
            Image.fromarray(np.uint8(np.clip(rgb * 255 + 0.5, 0, 255))).save(
                args.output
            )
            print(
                f"  {done}/{args.spp} spp, {time.perf_counter()-start:.1f}s", flush=True
            )
    linear = np.asarray(accumulation / done, dtype=np.float32)
    render_seconds = time.perf_counter() - start
    if not np.isfinite(linear).all() or np.any(linear < 0):
        raise RuntimeError("nonfinite or negative radiance in the render")
    mi.Bitmap(linear).write(str(args.output.with_suffix(".exr")))
    rgb = display_rgb(linear, args.exposure)
    if args.denoise:
        Image.fromarray(np.uint8(np.clip(rgb * 255 + 0.5, 0, 255))).save(
            args.output.with_name(args.output.stem + "-raw.png")
        )
        rgb = denoise_display(rgb, args.output, args.threads)
    Image.fromarray(np.uint8(np.clip(rgb * 255 + 0.5, 0, 255))).save(args.output)
    report = {
        **vars(args),
        "output": str(args.output),
        "mitsuba": mi.__version__,
        "variant": mi.variant(),
        "build_seconds": build_seconds,
        "render_seconds": render_seconds,
        "linear_min": float(linear.min()),
        "linear_max": float(linear.max()),
    }
    args.output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Saved {args.output}; build {build_seconds:.2f}s, render {render_seconds:.2f}s",
        flush=True,
    )


if __name__ == "__main__":
    main()
