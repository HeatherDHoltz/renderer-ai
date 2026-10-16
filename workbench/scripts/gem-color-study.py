"""Reproduce the ruby/sapphire RGB Beer coefficients, not universal gem RGBs.

Requires numpy/openpyxl; downloads source datasets into ignored output/. GIA's
measured O/E absorption cross sections are averaged; CIE D65 and the 1931 2°
observer produce XYZ, then linear sRGB. One local optical unit represents a
5 mm reference path. The browser fits three Beer coefficients to that path;
it does not integrate spectra or simulate fluorescence/birefringence.
"""
import hashlib
import json
import urllib.request
from pathlib import Path

import numpy as np
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "output/atelier-research"
CACHE.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "corundum.xlsx": "https://www.gia.edu/dam/jcr:6ec3f5fc-4c0c-4276-a81b-a9534b88d50b/sp20-corundum-chromophores-absorption-cross-section-data.xlsx",
    "cie-xyz.csv": "https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv",
    "d65.csv": "https://files.cie.co.at/Publications-datasets/CIE_std_illum_D65.csv",
}
for name, url in SOURCES.items():
    p = CACHE / name
    if not p.exists():
        urllib.request.urlretrieve(url, p)
cmf = np.loadtxt(CACHE / "cie-xyz.csv", delimiter=",")
daylight = np.loadtxt(CACHE / "d65.csv", delimiter=",")
wave = np.arange(380, 781)
observer = np.array([np.interp(wave, cmf[:, 0], cmf[:, i]) for i in (1, 2, 3)]).T
illuminant = np.interp(wave, daylight[:, 0], daylight[:, 1])
normalization = (observer[:, 1] * illuminant).sum()
xyz_to_rgb = np.array([[3.2404542, -1.5371385, -.4985314], [-.969266, 1.8760108, .041556], [.0556434, -.2040259, 1.0572252]])
sheet = openpyxl.load_workbook(CACHE / "corundum.xlsx", read_only=True, data_only=True).active
rows = sorted(r for r in list(sheet.values)[10:] if isinstance(r[0], (float, int)))
result = {"reference": "D65 / CIE 1931 2 degree / 5 mm", "sources": {k: {"url": v, "sha256": hashlib.sha256((CACHE / k).read_bytes()).hexdigest()} for k, v in SOURCES.items()}, "gems": {}}
for name, columns, concentration in [("ruby", (1, 2), 1300), ("sapphire", (5, 6), 25)]:
    spectrum = sum(np.array([r[k] or 0 for r in rows]) for k in columns) / 2
    sigma = np.interp(wave, [r[0] for r in rows], spectrum)
    transmission = np.exp(-sigma * 1.178e17 * concentration * .5)
    xyz = (observer * illuminant[:, None] * transmission[:, None]).sum(axis=0) / normalization
    linear = xyz_to_rgb @ xyz
    fitted = np.clip(linear, .002, 1)
    encoded = np.where(fitted <= .0031308, fitted * 12.92, 1.055 * fitted ** (1 / 2.4) - .055)
    result["gems"][name] = {"chromophore_ppma": concentration, "linear_rgb_unclipped": linear.round(6).tolist(), "absorption": (-np.log(fitted)).round(6).tolist(), "reference_srgb": "#" + "".join(f"{round(c * 255):02x}" for c in encoded), "note": "Three-channel fit to averaged polarized measurements; gamut clipped, no fluorescence."}
(ROOT / "workbench/assets/gem-color-study.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result["gems"], indent=2))
