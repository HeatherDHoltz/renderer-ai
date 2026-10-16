#!/usr/bin/env python3
"""Install this optional reference-rendering environment under ignored output/."""
import argparse
import hashlib
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
import urllib.request
import venv

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
OIDN_SHA256 = "b3c005ed437547fca5460ae43c8631ff46bc4ec4f9d5f219940ef941601a9d81"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--denoiser",
        action="store_true",
        help="also install OIDN 2.3.3 on Apple silicon",
    )
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        parser.error("Python 3.12 or newer is required")
    environment = OUT / "mitsuba-venv"
    if not (environment / "pyvenv.cfg").exists():
        venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / (
        "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
    )
    subprocess.run(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "-r",
            str(ROOT / "scripts/mitsuba-requirements.txt"),
        ],
        check=True,
    )
    if args.denoiser:
        if platform.system() != "Darwin" or platform.machine() != "arm64":
            parser.error(
                "automatic OIDN setup currently supports Apple silicon; omit --denoiser"
            )
        archive = OUT / "oidn-2.3.3.arm64.macos.tar.gz"
        if not archive.exists():
            print("Downloading official Open Image Denoise 2.3.3 binaries", flush=True)
            urllib.request.urlretrieve(
                "https://github.com/RenderKit/oidn/releases/download/v2.3.3/oidn-2.3.3.arm64.macos.tar.gz",
                archive,
            )
        if hashlib.sha256(archive.read_bytes()).hexdigest() != OIDN_SHA256:
            raise RuntimeError(
                f"OIDN archive checksum mismatch; remove {archive} before retrying"
            )
        if not (OUT / "oidn-2.3.3.arm64.macos/bin/oidnDenoise").exists():
            with tarfile.open(archive) as package:
                package.extractall(OUT, filter="data")
    print(f"Ready: {python}")


if __name__ == "__main__":
    main()
