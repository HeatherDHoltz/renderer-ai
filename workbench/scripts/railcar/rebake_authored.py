"""Bake all delivery LightUVs against an untouched authored room.

Run in a separate background Blender process on Heather's saved snapshot.
No material-coordinate rewrites, joins, or neutral overrides touch the source.
Only secondary-invisible receiver copies use a white diffuse material.
"""
import hashlib
import json
from pathlib import Path
import shutil
import time


def run(base_export, output_dir):
    import bpy
    import numpy as np
    import export
    from rebake_subset import _glb
    source = Path(bpy.data.filepath)
    base_export, output_dir = Path(base_export).resolve(), Path(output_dir).resolve()
    if base_export == output_dir:
        raise ValueError('Authored rebake requires a separate candidate directory')
    output_dir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(base_export, output_dir, dirs_exist_ok=True)
    manifest = json.loads((base_export / 'railcar-manifest.json').read_text())
    scene = bpy.context.scene
    # The interactive case geometry supplies its own live occlusion; do not
    # freeze an open-case shadow into the closed-case position.
    for ob in export.classify()[3]:
        ob.hide_render = True
    material = bpy.data.materials.new('TEMP authored irradiance receiver')
    material.use_nodes = True
    nt = material.node_tree; nt.nodes.clear()
    diffuse = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(diffuse.outputs[0], out.inputs['Surface'])
    report = {'sourceBlend': str(source), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'receiverBiasMm': .1, 'groups': {}}
    for group, info in manifest['groups'].items():
        started = time.time()
        (output_dir.parent / 'rebake-stage.txt').write_text('BAKING intact authored scene: ' + group)
        doc, array = _glb(base_export / info['file'])
        receivers = []
        for node in doc['nodes']:
            if 'mesh' not in node: continue
            if any(k in node for k in ('matrix', 'translation', 'rotation', 'scale')):
                raise ValueError('Expected world-space delivery vertices')
            name = node['name'].split('|', 1)[1]
            spec = info['materials'][name]
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                positions = array(primitive['attributes']['POSITION'])[:, [0, 2, 1]] * [1, -1, 1]
                normals = array(primitive['attributes']['NORMAL'])[:, [0, 2, 1]] * [1, -1, 1]
                triangles = array(primitive['indices']).reshape(-1, 3)
                uv = array(primitive['attributes']['TEXCOORD_' + str(spec['uv'])]).copy()
                uv[:, 1] = 1 - uv[:, 1]
                mesh = bpy.data.meshes.new('TEMP authored receiver ' + name)
                mesh.from_pydata((positions + normals * .001).tolist(), [], triangles.tolist())
                mesh.materials.append(material)
                mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
                mesh.normals_split_custom_set_from_vertices(normals.tolist())
                loops = np.array([loop.vertex_index for loop in mesh.loops])
                for layer in ('UVMap', 'LightUV'):
                    mesh.uv_layers.new(name=layer).data.foreach_set('uv', uv[loops].ravel())
                ob = bpy.data.objects.new('TEMP authored receiver ' + name, mesh)
                scene.collection.objects.link(ob)
                for flag in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_shadow', 'visible_volume_scatter'):
                    setattr(ob, flag, False)
                receivers.append(ob)
        settings = manifest['bake']['groups'][group]
        scene.cycles.use_denoising = False
        image = export.new_image('authored-' + group, settings['lightSize'], float_buffer=True)
        export.bake(receivers, 'DIFFUSE', image, 'LightUV', settings['samples'], passes={'DIRECT', 'INDIRECT'})
        pixels = export.denoise(image)
        value_range = max(export.RGBM_RANGE, float(2 ** np.ceil(np.log2(max(float(pixels.max()), 1)))))
        export.save_rgbm(pixels, str(output_dir / info['light']), value_range=value_range)
        info['lightRange'] = value_range
        report['groups'][group] = {'size': settings['lightSize'], 'samples': settings['samples'],
            'seconds': time.time() - started, 'receivers': len(receivers),
            'geometrySha256': hashlib.sha256((output_dir / info['file']).read_bytes()).hexdigest(),
            'lightSha256': hashlib.sha256((output_dir / info['light']).read_bytes()).hexdigest(),
            'lightRange': value_range,
            'clippedTexels': int(np.count_nonzero(np.max(pixels, axis=-1) > value_range))}
        (output_dir / 'authored-lighting.json').write_text(json.dumps(report, indent=2))
        bpy.data.images.remove(image)
        for ob in receivers:
            mesh = ob.data; bpy.data.objects.remove(ob, do_unlink=True); bpy.data.meshes.remove(mesh)
    manifest['bake'].update(receiver='Intact source shaders; secondary-invisible neutral receivers',
        authoredLighting=True, requiredCollectionOverrides=[], authoredLightingEvidence='authored-lighting.json')
    (output_dir / 'railcar-manifest.json').write_text(json.dumps(manifest, indent=1))
    (output_dir.parent / 'rebake-stage.txt').write_text('COMPLETE; requires matching-image review')
    return report
