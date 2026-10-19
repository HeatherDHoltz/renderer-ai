"""Install only a reviewed appearance bundle; preserve concurrent exterior work."""
import hashlib
import json
import os
from pathlib import Path
import shutil


def install(directory, export_dir, captures):
    directory, export_dir = Path(directory), Path(export_dir)
    captures = [Path(p) for p in captures]
    if not captures or not all(p.is_file() for p in captures):
        raise ValueError('Matching rendered comparison evidence is required')
    source = directory / 'appearance.json'
    report = json.loads(source.read_text())
    if report.get('version') != 1 or not report.get('replacements'):
        raise ValueError('Incomplete appearance manifest')
    rows = report['replacements']
    files = {'appearance.json'}
    for row in rows:
        if row['route'] != 'baked_room':
            raise ValueError('Only baked_room replacements belong in this bundle')
        for key, digest_key in [('file', 'fileSha256'), ('radiance', 'radianceSha256')]:
            name = row[key]
            if Path(name).name != name:
                raise ValueError('Appearance assets must be local bundle filenames')
            p = directory / name
            if not p.is_file(): raise ValueError(f'Missing {name}')
            if digest_key in row and hashlib.sha256(p.read_bytes()).hexdigest() != row[digest_key]:
                raise ValueError(f'Appearance asset changed after its manifest: {name}')
            files.add(name)
    # Read the live manifest at installation time rather than replacing it with
    # an old snapshot, which could erase Claude's concurrently edited metadata.
    manifest_path = export_dir / 'railcar-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    for row in rows:
        if row['material'] not in manifest['groups'][row['group']]['materials']:
            raise ValueError(f'Replacement target no longer exists: {row}')
        if 'baseGeometrySha256' in row:
            base = export_dir / manifest['groups'][row['group']]['file']
            if hashlib.sha256(base.read_bytes()).hexdigest() != row['baseGeometrySha256']:
                raise ValueError('Room geometry changed after staging; review/rebake replacements')
    destination = export_dir / 'appearance'
    destination.mkdir(exist_ok=True)
    for name in sorted(files):
        shutil.copyfile(directory / name, destination / name)
    manifest['appearance'] = 'appearance/appearance.json'
    manifest['appearanceEvidence'] = [str(p) for p in captures]
    temp = manifest_path.with_suffix('.json.pending')
    temp.write_text(json.dumps(manifest, indent=1) + '\n')
    os.replace(temp, manifest_path)
    return {'files': len(files), 'replacements': len(rows), 'bytes': sum((directory / n).stat().st_size for n in files)}
