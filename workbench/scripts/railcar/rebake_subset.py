"""Rebake one authored collection onto an existing exported group's LightUV.

Receiver copies cannot cast shadows or appear to secondary rays. The intact
source scene supplies all light transport, including the collection itself.
Only the selected UV islands and their safe padding are replaced. Other RGBM
pixels are preserved byte-for-byte. Run on the saved authored scene via MCP:
    import rebake_subset
    bpy.app.timers.register(rebake_subset.run, first_interval=.2)
Default target is the longcase clock in output/railcar/rebake-review/export.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import traceback

ROOT = Path(__file__).resolve().parents[3]
D = ROOT / 'output/railcar/rebake-review/clock-rebake'
PYTHON = os.environ.get('LJ_IMAGE_PYTHON', '/Users/heatherholtz/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')


def _glb(path):
    import numpy as np
    raw = Path(path).read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    offset = 20 + length
    size = struct.unpack_from('<I', raw, offset)[0]
    blob = raw[offset + 8:offset + 8 + size]
    def array(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        item = np.dtype(dtype).itemsize
        return np.ndarray((a['count'], width), dtype=dtype, buffer=blob,
                          offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(view.get('byteStride', item * width), item)).copy()
    return doc, array


def run(collection='longcase clock', group='furnishings', export_dir=None,
        object_names=None, evidence_dir=None):
    import bpy
    import numpy as np
    from mathutils import Vector
    from mathutils.kdtree import KDTree
    import export
    global D
    D = Path(evidence_dir) if evidence_dir is not None else ROOT / 'output/railcar/rebake-review/clock-rebake'
    export_dir = Path(export_dir or ROOT / 'output/railcar/rebake-review/export')
    D.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    proxies = []
    skipped = []
    material = None
    image = None
    saved = (scene.cycles.samples, scene.cycles.use_denoising)
    bake_settings = {key: getattr(scene.render.bake, key) for key in (
        'target', 'use_clear', 'margin', 'margin_type', 'use_pass_direct',
        'use_pass_indirect', 'use_pass_color')}
    try:
        manifest = json.loads((export_dir / 'railcar-manifest.json').read_text())
        info = manifest['groups'][group]
        source_objects = ([bpy.data.objects[name] for name in object_names]
                          if object_names is not None else list(bpy.data.collections[collection].all_objects))
        depsgraph = bpy.context.evaluated_depsgraph_get()
        points = []
        for ob in source_objects:
            if ob.type not in ('MESH', 'CURVE'):
                continue
            ev = ob.evaluated_get(depsgraph)
            mesh = ev.to_mesh()
            try:
                points.extend(ev.matrix_world @ v.co for v in mesh.vertices)
            finally:
                ev.to_mesh_clear()
        tree = KDTree(len(points))
        for i, point in enumerate(points):
            tree.insert(point, i)
        tree.balance()
        source_min = np.min(np.array(points), axis=0) - .02
        source_max = np.max(np.array(points), axis=0) + .02
        source_mats = {slot.material.name for ob in source_objects for slot in ob.material_slots if slot.material}
        doc, array = _glb(export_dir / info['file'])
        clock_uv, other_uv, counts = [], [], {}
        material = bpy.data.materials.new('TEMP neutral light receiver')
        material.use_nodes = True
        nt = material.node_tree
        nt.nodes.clear()
        diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
        diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
        output = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(diffuse.outputs[0], output.inputs['Surface'])
        for node in doc['nodes']:
            if 'mesh' not in node:
                continue
            if any(key in node for key in ('matrix', 'translation', 'rotation', 'scale')):
                raise ValueError('Expected exporter world-space vertices; transformed GLB node requires explicit handling')
            name = node['name'].split('|', 1)[1]
            spec = info['materials'][name]
            for prim in doc['meshes'][node['mesh']]['primitives']:
                pos = array(prim['attributes']['POSITION'])
                pos = pos[:, [0, 2, 1]] * np.array([1, -1, 1])
                indices = array(prim['indices']).ravel().reshape(-1, 3)
                uv = array(prim['attributes']['TEXCOORD_' + str(spec['uv'])])
                match = np.zeros(len(pos), dtype=bool)
                if name in source_mats:
                    candidates = np.flatnonzero(np.all(pos >= source_min, axis=1) & np.all(pos <= source_max, axis=1))
                    for vi in candidates:
                        # resolve_coplanar() may push an exported vertex by .01
                        # authoring units (1 mm). Keep the geometric match bounded.
                        match[vi] = tree.find(Vector(pos[vi]))[2] <= .01002
                selected = np.all(match[indices], axis=1)
                other_uv.append(uv[indices[~selected]])
                if not selected.any():
                    continue
                triangles = indices[selected]
                clock_uv.append(uv[triangles])
                used, inverse = np.unique(triangles.ravel(), return_inverse=True)
                receiver_pos = pos[used].copy()
                normals = None
                if 'NORMAL' in prim['attributes']:
                    normals = array(prim['attributes']['NORMAL'])[used]
                    normals = normals[:, [0, 2, 1]] * np.array([1, -1, 1])
                    # Numerical ray bias only: the exported geometry stays put.
                    # A coincident receiver otherwise shadows against the real
                    # surface. .001 authoring units is .1 physical millimetre.
                    receiver_pos += normals * .001
                else:
                    raise ValueError('Receiver normals required for bounded self-shadow bias')
                me = bpy.data.meshes.new('TEMP clock receiver mesh')
                me.from_pydata(receiver_pos.tolist(), [], inverse.reshape(-1, 3).tolist())
                me.materials.append(material)
                if normals is not None:
                    for polygon in me.polygons:
                        polygon.use_smooth = True
                    me.normals_split_custom_set_from_vertices(normals.tolist())
                loops = np.array([loop.vertex_index for loop in me.loops])
                local_uv = uv[used].copy()
                local_uv[:, 1] = 1 - local_uv[:, 1]
                for layer in ('UVMap', 'LightUV'):
                    me.uv_layers.new(name=layer).data.foreach_set('uv', local_uv[loops].ravel())
                ob = bpy.data.objects.new('TEMP clock receiver ' + name, me)
                scene.collection.objects.link(ob)
                # Baking explicitly starts at this receiver. All subsequent rays
                # see the original scene, never this duplicate white surface.
                for flag in ('visible_diffuse', 'visible_glossy', 'visible_transmission',
                             'visible_shadow', 'visible_volume_scatter'):
                    setattr(ob, flag, False)
                proxies.append(ob)
                counts[name] = counts.get(name, 0) + int(selected.sum())
        if not proxies:
            raise ValueError('No exported triangles matched the authored collection')
        np.savez_compressed(D / 'uv-masks.npz', clock=np.concatenate(clock_uv), other=np.concatenate(other_uv))
        # Hide live look-dev cases/flames only while lighting the static set.
        for ob in export.classify()[3]:
            skipped.append((ob, ob.hide_render))
            ob.hide_render = True
        old = bpy.data.images.load(str(export_dir / info['light']), check_existing=False)
        size = old.size[0]
        bpy.data.images.remove(old)
        samples = export.GROUPS[group][2]
        scene.cycles.use_denoising = False
        image = export.new_image('clock authored-scene irradiance', size, float_buffer=True)
        (D / 'progress.txt').write_text('BAKING full-quality clock receivers\n')
        export.bake(proxies, 'DIFFUSE', image, 'LightUV', samples, passes={'DIRECT', 'INDIRECT'})
        np.save(D / 'light.npy', export.denoise(image))
        report = {'collection': collection, 'objects': object_names, 'group': group, 'samples': samples, 'size': size,
                  'triangles_by_material': counts, 'source_blend': bpy.data.filepath,
                  'method': 'secondary-invisible white receivers; original authored geometry/materials remain intact',
                  'receiver_ray_bias_mm': .1, 'exported_geometry_changed': False,
                  'vertex_match_tolerance_mm': 1.002,
                  'source_glb_sha256': hashlib.sha256((export_dir / info['file']).read_bytes()).hexdigest(),
                  'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  'before_light_sha256': hashlib.sha256((export_dir / info['light']).read_bytes()).hexdigest()}
        shutil.copyfile(export_dir / info['light'], D / 'full-before.webp')
        (D / 'bake.json').write_text(json.dumps(report, indent=2) + '\n')
        subprocess.run([PYTHON, __file__, 'compose', str(export_dir / info['light']), str(D)], check=True,
                       capture_output=True, text=True)
        (D / 'progress.txt').write_text('COMPLETE; candidate map requires browser comparison\n')
    except Exception:
        (D / 'progress.txt').write_text(traceback.format_exc())
        raise
    finally:
        for ob, hidden in skipped:
            ob.hide_render = hidden
        for ob in proxies:
            mesh = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        if material and material.users == 0:
            bpy.data.materials.remove(material)
        if image:
            bpy.data.images.remove(image)
        scene.cycles.samples, scene.cycles.use_denoising = saved
        for key, value in bake_settings.items():
            setattr(scene.render.bake, key, value)
    return None


def compose(original):
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    old = np.array(Image.open(original).convert('RGBA'))
    h, w = old.shape[:2]
    uvs = np.load(D / 'uv-masks.npz')
    masks = {}
    for key in ('clock', 'other'):
        img = Image.new('L', (w, h))
        draw = ImageDraw.Draw(img)
        for tri in uvs[key]:
            if tri.min() < -1e-4 or tri.max() > 1.0001:
                raise ValueError('UV islands outside the published lightmap')
            draw.polygon([(float(u * w), float(v * h)) for u, v in tri], fill=255)
        masks[key] = img
        img.save(D / (key + '-uv-mask.png'))
    interiors = [np.array(masks[key].filter(ImageFilter.MinFilter(3))) > 0 for key in ('clock', 'other')]
    overlap = int(np.count_nonzero(interiors[0] & interiors[1]))
    if overlap:
        raise ValueError(f'{overlap} interior clock/other UV pixels overlap; repair packing before patching')
    covered = np.array(masks['clock']) > 0
    padded = np.array(masks['clock'].filter(ImageFilter.MaxFilter(17))) > 0
    protected = np.array(masks['other'].filter(ImageFilter.MaxFilter(3))) > 0
    mask = covered | (padded & ~protected)
    light = np.load(D / 'light.npy')[::-1]
    c = np.clip(light / 16, 0, 1)
    alpha = np.clip(np.ceil(c.max(-1, keepdims=True) * 255) / 255, 1 / 255, 1)
    encoded = np.rint(np.concatenate((c / alpha, alpha), axis=-1) * 255).clip(0, 255).astype(np.uint8)
    result = old.copy()
    result[mask] = encoded[mask]
    out = D / 'candidate-light.webp'
    Image.fromarray(result).save(out, lossless=True, method=6, exact=True)
    decoded = np.array(Image.open(out).convert('RGBA'))
    assert np.array_equal(decoded[~mask], old[~mask]), 'Non-clock lightmap pixels changed'
    (D / 'composite.json').write_text(json.dumps({
        'size': [w, h], 'clock_coverage_pixels': int(covered.sum()), 'patched_pixels': int(mask.sum()),
        'interior_overlap_pixels': overlap, 'non_clock_changed_pixels': 0,
        'candidate_sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
        'normalization': 'RGBM range16, unchanged original bytes outside the clock mask',
    }, indent=2) + '\n')


def install_candidate(export_dir=None, captures=(), evidence_dir=None):
    """Apply a visually checked candidate with strict base-map/geometry guards.

    This records application and supplied evidence paths, not artistic approval.
    Repeating it on the already-applied candidate is safe.
    """
    global D
    D = Path(evidence_dir) if evidence_dir is not None else ROOT / 'output/railcar/rebake-review/clock-rebake'
    export_dir = Path(export_dir or ROOT / 'output/railcar/rebake-review/export')
    report = json.loads((D / 'bake.json').read_text())
    composite = json.loads((D / 'composite.json').read_text())
    manifest_path = export_dir / 'railcar-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    info = manifest['groups'][report['group']]
    digest = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if digest(export_dir / info['file']) != report['source_glb_sha256']:
        raise ValueError('Export geometry changed; do not apply stale UV lighting')
    target = export_dir / info['light']
    candidate = D / 'candidate-light.webp'
    if digest(candidate) != composite['candidate_sha256']:
        raise ValueError('Candidate map no longer matches its verification record')
    if digest(target) not in (report['before_light_sha256'], composite['candidate_sha256']):
        raise ValueError('Base lighting changed; do not overwrite unrelated lighting')
    # Check actual non-clock occupied texels as well as the composite's outer mask.
    verification = subprocess.run([PYTHON, '-c',
        'from PIL import Image; import numpy as np; import sys; '
        'a=np.array(Image.open(sys.argv[1]).convert("RGBA")); '
        'b=np.array(Image.open(sys.argv[2]).convert("RGBA")); '
        'm=np.array(Image.open(sys.argv[3]))>0; '
        'assert np.array_equal(a[m],b[m]), "Non-clock occupied texels changed"',
        str(D / 'full-before.webp'), str(candidate), str(D / 'other-uv-mask.png')],
        capture_output=True, text=True)
    if verification.returncode:
        raise ValueError(verification.stderr)
    if target.resolve() != candidate.resolve():
        shutil.copyfile(candidate, target)
    record = {**report, **composite, 'captures': [str(p) for p in captures],
              'non_clock_occupied_changed_pixels': 0}
    bake = manifest.setdefault('bake', {})
    overrides = bake.setdefault('collectionOverrides', [])
    overrides[:] = [r for r in overrides if r['collection'] != report['collection']]
    overrides.append(record)
    required = bake.setdefault('requiredCollectionOverrides', ['longcase clock'])
    if report['collection'] not in required:
        required.append(report['collection'])
    manifest_path.write_text(json.dumps(manifest, indent=1) + '\n')
    return record


if __name__ == '__main__':
    import sys
    if sys.argv[1] != 'compose':
        raise SystemExit('Use run() inside Blender; CLI is only for mask/composite processing')
    if len(sys.argv) > 3:
        D = Path(sys.argv[3])
    compose(sys.argv[2])
