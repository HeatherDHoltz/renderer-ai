"""Render identical diagnostic inputs through all intersection backends."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
binary = root / 'target/release/renderer-project'
output = root / 'output/backend-agreement'
output.mkdir(parents=True, exist_ok=True)
report = {}
for scene in ['glass', 'mesh', 'benchmark']:
    hashes = {}
    for backend in ['none', 'bvh', 'octree']:
        path = output / f'{scene}-{backend}.png'
        subprocess.run([str(binary), 'render', str(root / f'scenes/{scene}.json'), '--width', '128', '--height', '96', '--accel', backend, '--output', str(path)], check=True, cwd=root)
        hashes[backend] = hashlib.sha256(path.read_bytes()).hexdigest()
    if len(set(hashes.values())) != 1:
        raise AssertionError(f'{scene}: backend PNG bytes differ: {hashes}')
    report[scene] = {'width': 128, 'height': 96, 'identical_png_bytes': True, 'sha256': hashes}
(output / 'agreement.json').write_text(json.dumps(report, indent=2) + '\n')
print('All three diagnostic scenes produce identical PNG bytes across all backends.')
