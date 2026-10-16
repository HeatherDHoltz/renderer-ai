"""Import the selected CC0 Poly Haven props. Not run by the normal offline build.

Keep only 1K base-color textures for the background; jewelry owns the detail budget.
All source downloads are checksum-checked before adaptation. No account is needed.
"""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / 'output' / 'workshop-assets'
DEST = ROOT / 'assets' / 'props'
MODELS = ['wooden_bookshelf_worn', 'WoodenTable_03', 'wooden_candlestick',
          'magnifying_glass_01', 'wooden_hammer_01']


def get(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '-L', '-A',
                    'Mozilla/5.0 RendererPortfolio/1.0', url, '-o', str(path)], check=True)


def import_model(name):
    metadata_path = CACHE / (name + '-files.json')
    if not metadata_path.exists():
        get('https://api.polyhaven.com/files/' + name, metadata_path)
    entry = json.loads(metadata_path.read_text())['gltf']['1k']['gltf']
    folder = DEST / name
    original = CACHE / (name + '.gltf')
    get(entry['url'], original)
    assert hashlib.md5(original.read_bytes()).hexdigest() == entry['md5']
    model = json.loads(original.read_text())
    kept = []
    for local, info in entry['include'].items():
        if local.endswith('.bin') or '_diff_' in local:
            target = folder / local
            get(info['url'], target)
            assert hashlib.md5(target.read_bytes()).hexdigest() == info['md5']
            kept.append({'file': str(target.relative_to(ROOT)), 'source': info['url'],
                         'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                         'bytes': target.stat().st_size})
    diffuse = next(i for i in model['images'] if '_diff_' in i['uri'])
    model['images'] = [diffuse]
    model['textures'] = [{'source': 0}]
    for material in model['materials']:
        for key in ['normalTexture', 'occlusionTexture', 'emissiveTexture']:
            material.pop(key, None)
        pbr = material.setdefault('pbrMetallicRoughness', {})
        pbr.pop('metallicRoughnessTexture', None)
        if 'baseColorTexture' in pbr:
            pbr['baseColorTexture'] = {'index': 0}
        pbr['roughnessFactor'] = .8
    target = folder / 'model.gltf'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(model, separators=(',', ':')) + '\n')
    print(name, sum(f['bytes'] for f in kept), 'bytes', flush=True)
    return {'asset': name, 'page': 'https://polyhaven.com/a/' + name,
            'license': 'CC0-1.0', 'license_url': 'https://polyhaven.com/license',
            'original_gltf': {'url': entry['url'], 'md5': entry['md5']},
            'adaptation': 'Retained geometry and 1K diffuse only; removed normal/ARM textures, set roughness .8. Runtime rescales and places the model.',
            'gltf_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'files': kept}


if __name__ == '__main__':
    if not (CACHE / 'polyhaven-models.json').exists():
        get('https://api.polyhaven.com/assets?t=models', CACHE / 'polyhaven-models.json')
    records = [import_model(name) for name in MODELS]
    metadata = json.loads((CACHE / 'polyhaven-models.json').read_text())
    for record in records:
        record['authors'] = metadata[record['asset']]['authors']
    (DEST / 'sources.json').write_text(json.dumps(records, indent=2) + '\n')
