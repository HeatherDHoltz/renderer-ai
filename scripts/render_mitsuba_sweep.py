#!/usr/bin/env python3
"""Render actual fixed-camera Mitsuba lighting states and encode a ping-pong GIF."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/mitsuba-tigers-eye"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--size", type=int, default=480)
    parser.add_argument("--spp", type=int, default=512)
    parser.add_argument("--denoise", action="store_true")
    args = parser.parse_args()
    if not (
        3 <= args.frames <= 32 and 64 <= args.size <= 1024 and 1 <= args.spp <= 4096
    ):
        parser.error("sweep settings exceed supported limits")
    OUT.mkdir(parents=True, exist_ok=True)
    frames = []
    manifest = []
    for i in range(args.frames):
        z = -8 + 13 * i / (args.frames - 1)
        path = OUT / f"light-{i:02}.png"
        command = [
            sys.executable,
            str(ROOT / "scripts/render_mitsuba_tigers_eye.py"),
            "--width",
            str(args.size),
            "--height",
            str(args.size),
            "--spp",
            str(args.spp),
            "--grid",
            "256",
            "--light-z",
            str(z),
            "--layered",
            "--density",
            ".1",
            "--exposure",
            "1.65",
            "--output",
            str(path),
        ]
        if args.denoise:
            command.append("--denoise")
        subprocess.run(command, cwd=ROOT, check=True)
        with Image.open(path) as source:
            frames.append(source.convert("RGB"))
        manifest.append(
            {"frame": i, "light_z": z, "image": str(path.relative_to(ROOT))}
        )
    ping_pong = frames + frames[-2:0:-1]
    target = OUT / "tigers-eye-light-sweep.gif"
    ping_pong[0].save(
        target,
        save_all=True,
        append_images=ping_pong[1:],
        duration=180,
        loop=0,
        disposal=2,
    )
    (OUT / "sweep.json").write_text(
        json.dumps({"settings": vars(args), "frames": manifest}, indent=2) + "\n"
    )
    print(f"Saved {target}")


if __name__ == "__main__":
    main()
