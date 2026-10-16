"""Fast offline release check; standard-library Python, already-built Rust CLI."""
from pathlib import Path
import argparse
import json
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--binary", type=Path, default=ROOT / "target/release/renderer-project")
args = parser.parse_args()
binary = args.binary.resolve()
output = ROOT / "output/example-check"

def run(*arguments):
    result = subprocess.run([str(binary), *map(str, arguments)], cwd=ROOT, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(f"Command failed: {arguments}\n{result.stdout}\n{result.stderr}")

def png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", data[16:24]) == (12, 9), path

def check_scene(scene, name):
    run("validate", scene)
    image = output / f"{name}.png"
    run("render", scene, "--width", 12, "--height", 9, "--spp", 1, "--depth", 3,
        "--threads", 2, "--no-progressive", "--output", image)
    png(image)

scenes = sorted((ROOT / "scenes").glob("*.json"))
for scene in scenes:
    check_scene(scene, scene.stem)
for config in sorted((ROOT / "scenes/generators").glob("*.json")):
    scene = output / f"generated-{config.stem}.json"
    run("generate", config, "--output", scene)
    check_scene(scene, f"generated-{config.stem}")
frames = output / "frames"
run("animate", ROOT / "scenes/animation.json", "--frames", "0:2", "--fps", 1,
    "--width", 12, "--height", 9, "--spp", 1, "--threads", 2, "--hdr", "--output", frames)
manifest = json.loads((frames / "animation.json").read_text())
assert [row["time_seconds"] for row in manifest["frames"]] == [0.0, 1.0, 2.0]
for index in range(3):
    png(frames / f"frame-{index:06}.png")
    assert (frames / f"frame-{index:06}.hdr").stat().st_size > 0
print(f"Offline examples passed: {len(scenes)} scenes, 2 generated scenes, 3 PNG/HDR animation frames.")
