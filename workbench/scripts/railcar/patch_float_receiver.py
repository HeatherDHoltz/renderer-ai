"""Composite a preserved-scene receiver bake into an RGBA16F lighting atlas.
Usage: bundled-python patch_float_receiver.py ATLAS.f16.gz EVIDENCE_DIR
Requires rebake_subset output. Keeps every protected non-receiver texel exact.
"""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

atlas, evidence = Path(sys.argv[1]), Path(sys.argv[2])
original = atlas.read_bytes()
backup = evidence / 'before.f16.gz'
if backup.exists():
    raise ValueError('Existing backup: use a fresh evidence directory or restore it explicitly')
raw = gzip.decompress(original)
w, h = struct.unpack_from('<II', raw)
old = np.frombuffer(raw, dtype='<f2', offset=8).reshape(h, w, 4).copy()
uvs = np.load(evidence / 'uv-masks.npz')
masks = {}
for key in ('clock', 'other'):
    image = Image.new('L', (w, h)); draw = ImageDraw.Draw(image)
    for tri in uvs[key]:
        draw.polygon([(float(u*w), float(v*h)) for u, v in tri], fill=255)
    masks[key] = image
covered = np.array(masks['clock']) > 0
protected = np.array(masks['other']) > 0
if np.any((np.array(masks['clock'].filter(ImageFilter.MinFilter(3))) > 0) &
          (np.array(masks['other'].filter(ImageFilter.MinFilter(3))) > 0)):
    raise ValueError('Receiver interiors overlap other occupied islands')
padded = np.array(masks['clock'].filter(ImageFilter.MaxFilter(17))) > 0
mask = (covered | padded) & ~(np.array(masks['other'].filter(ImageFilter.MaxFilter(3))) > 0)
light = np.load(evidence / 'light.npy')[::-1]
assert light.shape == (h, w, 3)
result = old.copy(); result[mask, :3] = np.clip(np.nan_to_num(light[mask]), 0, 65504).astype('<f2')
assert np.array_equal(result[protected], old[protected])
assert np.array_equal(result[~mask], old[~mask])
backup.write_bytes(original)
output = gzip.compress(struct.pack('<II', w, h)+result.tobytes(), compresslevel=6)
atlas.write_bytes(output)
record = {'file': atlas.name, 'beforeSha256': hashlib.sha256(original).hexdigest(),
          'afterSha256': hashlib.sha256(output).hexdigest(), 'size': [w, h],
          'patchedPixels': int(mask.sum()), 'otherOccupiedChangedPixels': 0,
          'outsideMaskChangedPixels': 0, 'mode': 'white diffuse E/pi, RGBA16F',
          'samples': json.loads((evidence/'bake.json').read_text())['samples']}
(evidence/'float-composite.json').write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps(record))
