"""Build Cycles case previews from the actual browser case factory.

Geometry/UVs/normals/pose come from case-snapshot.mjs. Cycles uses the same
full-resolution wood/velvet images and physical material analogues. Browser
optical shaders and environment-probe tricks are not baked into this preview.
"""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

import bpy
import numpy as np
from mathutils import Matrix
from mats import G
from geo import coll

ROOT = Path(__file__).resolve().parents[3]
WORKBENCH = ROOT / 'workbench'
SNAPSHOT = ROOT / 'output/railcar/cases-preview.json.gz'
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def source_hash():
    paths = sorted((WORKBENCH / 'src').glob('*.js')) + [
        Path(__file__).with_name('case-snapshot.mjs'),
        WORKBENCH / 'vendor/three.module.js', WORKBENCH / 'vendor/three.core.js',
        WORKBENCH / 'assets/cabochon.obj', WORKBENCH / 'assets/solitaire-sample.obj',
    ]
    digest = hashlib.sha256()
    for path in paths:
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def snapshot():
    fingerprint = source_hash()
    if SNAPSHOT.exists():
        with gzip.open(SNAPSHOT, 'rt') as f:
            data = json.load(f)
        if data.get('sourceHash') == fingerprint:
            return data
    node = os.environ.get('LJ_NODE') or shutil.which('node')
    if not node:
        for candidate in ('/opt/homebrew/bin/node', '/usr/local/bin/node'):
            if Path(candidate).exists():
                node = candidate
                break
    if not node:
        raise RuntimeError('Node is required to evaluate the runtime cases. Set LJ_NODE to its absolute path.')
    subprocess.run([node, str(Path(__file__).with_name('case-snapshot.mjs')), str(SNAPSHOT), fingerprint],
                   check=True, capture_output=True, text=True)
    with gzip.open(SNAPSHOT, 'rt') as f:
        return json.load(f)


def camera_frame():
    """Current runtime default camera, in Blender coordinates."""
    camera = snapshot()['camera']
    def convert(v):
        return (v[0], -v[2], v[1])
    return {'position': convert(camera['position']), 'target': convert(camera['target']),
            'fov': camera['fov'], 'aspect': camera['aspect']}


def _array(record):
    dtype = {'Float32Array': '<f4', 'Uint16Array': '<u2', 'Uint32Array': '<u4'}[record['type']]
    values = np.frombuffer(base64.b64decode(record['base64']), dtype=dtype)
    return values.reshape((-1, record['itemSize']))


def _image_node(g, filename, coordinates, data=False):
    image = bpy.data.images.load(str(WORKBENCH / 'assets/materials' / filename), check_existing=True)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    node = g.n('ShaderNodeTexImage')
    node.image = image
    g.L(coordinates, node.inputs['Vector'])
    return node.outputs['Color']


def _material(index, spec):
    g = G(f"rc runtime case material {index}")
    g.set('Base Color', (*spec['color'], 1))
    g.set('Metallic', spec['metalness'])
    g.set('Roughness', spec['roughness'])
    g.set('Anisotropic', spec.get('anisotropy', 0))
    photo = spec.get('photo')
    if photo:
        uv = g.n('ShaderNodeTexCoord').outputs['UV']
        if photo == 'velvet':
            scale = g.n('ShaderNodeVectorMath', operation='SCALE')
            scale.inputs['Scale'].default_value = 2
            g.L(uv, scale.inputs[0])
            uv = scale.outputs[0]
        color = _image_node(g, photo + '-color.jpg', uv)
        if photo == 'velvet':
            # Same measured-pile recolouring as surface-materials.js, in linear RGB.
            channels = g.n('ShaderNodeSeparateColor')
            g.L(color, channels.inputs[0])
            luminance = g.math('ADD', g.math('ADD', g.math('MULTIPLY', channels.outputs[0], .52),
                                          g.math('MULTIPLY', channels.outputs[1], .32)),
                               g.math('MULTIPLY', channels.outputs[2], .16))
            color = luminance
        g.set('Base Color', g.mix(1.0, color, (*spec['color'], 1), 'MULTIPLY'))
        rough = _image_node(g, photo + '-roughness.jpg', uv, data=True)
        g.set('Roughness', g.math('MULTIPLY', rough, spec['roughness']))
        normal = g.n('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = spec.get('normalStrength', .2)
        g.L(_image_node(g, photo + '-normal.jpg', uv, data=True), normal.inputs['Color'])
        g.set('Normal', normal.outputs[0])
        g.set('Sheen Weight', spec.get('sheen', 0))
        g.set('Sheen Tint', (*(spec.get('sheenColor') or [1, 1, 1]), 1))
        g.set('Sheen Roughness', .78)
    gem = spec.get('gem')
    if gem:
        g.set('IOR', gem['ior'])
        g.set('Roughness', .02)
        if gem['id'] == 'tiger':
            import cases
            return cases.gem_material("tiger's eye", (.55, .30, .06), 1.545, 0)
        g.set('Transmission Weight', 1)
        absorption = gem.get('absorption', [0, 0, 0])
        peak = max(absorption)
        if peak > .01:
            v = g.n('ShaderNodeVolumeAbsorption')
            v.inputs['Color'].default_value = (*(max(0, 1 - x / peak) for x in absorption), 1)
            # Browser attenuation is in gem-local units; preview solids have
            # .34 sample scale and .78 case scale in this 10 cm-unit room.
            v.inputs['Density'].default_value = peak / (.34 * .78)
            g.L(v.outputs[0], g.out.inputs['Volume'])
    if spec.get('mirror'):
        g.set('Metallic', 1)
        g.set('Roughness', .035)
    if spec.get('label'):
        color = spec.get('labelColor', '#c6b68f').lstrip('#')
        linear = []
        for channel in (color[0:2], color[2:4], color[4:6]):
            x = int(channel, 16) / 255
            linear.append(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4)
        g.set('Base Color', (*linear, 1))
        g.set('Metallic', .3)
        g.set('Roughness', .45)
    return g.m


def _mesh(index, spec):
    points = _array(spec['position'])
    vertices = np.column_stack((points[:, 0], -points[:, 2], points[:, 1]))
    indices = _array(spec['index']).reshape(-1) if spec['index'] else np.arange(len(vertices))
    mesh = bpy.data.meshes.new(f'runtime case geometry {index}')
    mesh.from_pydata(vertices.tolist(), [], indices.reshape((-1, 3)).tolist())
    mesh.update()
    if spec.get('uv'):
        uv = _array(spec['uv'])
        mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', uv[indices].reshape(-1))
    if spec.get('normal'):
        normals = _array(spec['normal'])
        converted = np.column_stack((normals[:, 0], -normals[:, 2], normals[:, 1]))
        mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
        mesh.normals_split_custom_set_from_vertices(converted.tolist())
    return mesh


def build():
    data = snapshot()
    assert data['pose'] == 'fully-open' and data['byteOrder'] == 'little-endian'
    collection = coll('jewellery cases')  # runtime-owned; excluded by export.py
    materials = [_material(i, spec) for i, spec in enumerate(data['materials'])]
    meshes = {}
    font_path = Path('/System/Library/Fonts/Supplemental/Georgia.ttf')
    font = bpy.data.fonts.load(str(font_path), check_existing=True) if font_path.exists() else None
    for index, row in enumerate(data['objects']):
        spec = data['materials'][row['material']]
        app_matrix = Matrix(np.array(row['matrix']).reshape((4, 4)).T.tolist())
        if spec.get('label'):
            geom = data['geometry'][row['geometry']]
            points = _array(geom['position'])
            height = float(np.ptp(points[:, 1]))
            text = bpy.data.curves.new(f"case label {index}", 'FONT')
            text.body = spec['label']
            text.align_x = 'CENTER'
            text.size = height * float(spec['labelFont'].split('px')[0].split()[-1]) / 100
            if font:
                text.font = font
            text.materials.append(materials[row['material']])
            obj = bpy.data.objects.new(f"{row['case']} label {index}", text)
            collection.objects.link(obj)
            obj.matrix_world = C @ app_matrix @ Matrix.Translation((0, -.13 * height, 0))
        else:
            key = row['geometry']
            if key not in meshes:
                meshes[key] = _mesh(key, data['geometry'][key])
                meshes[key].materials.append(materials[row['material']])
            obj = bpy.data.objects.new(f"runtime {row['name']}", meshes[key])
            collection.objects.link(obj)
            obj.matrix_world = C @ app_matrix @ C.inverted()
            obj.material_slots[0].link = 'OBJECT'
            obj.material_slots[0].material = materials[row['material']]
        obj['runtime_case'] = row['case']
        obj['runtime_role'] = row['role']
        obj['runtime_part'] = row.get('part') or ''
        obj['runtime_assembly'] = row.get('assembly') or ''
        obj['case_source_sha256'] = data['sourceHash']
    return collection
