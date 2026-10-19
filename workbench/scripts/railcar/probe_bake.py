"""Compare clock irradiance with original versus overridden bounce materials.

Run in Blender on the authored source scene (before export.run):
    import probe_bake
    bpy.app.timers.register(probe_bake.run, first_interval=.2)

Writes raw float arrays and statistics under output/railcar/bake-probe/.
This diagnoses the bake, not camera brightness or the browser's final grade.
The legacy white receiver also changes self-reflection and is NOT ground truth.
Check preserved-bounce receiver versus preserved-bounce group, then validate the
actual merged export and matching browser captures; this isolated probe alone
cannot establish that the export is correct.
The temporary receiver and material overrides are restored even on failure.
"""
import hashlib
import json
from pathlib import Path
import traceback

import bpy
import numpy as np
import export

ROOT = Path(__file__).resolve().parents[3]


def _white(material):
    copy = export.diffuse_copy(material)
    tree = copy.node_tree
    receiver = next(n for n in tree.nodes if n.type == 'BSDF_DIFFUSE')
    tree.links.new(receiver.outputs[0], export.output_node(tree).inputs['Surface'])
    return copy


def run(directory=None, target='clock trunk', size=128, samples=256):
    directory = Path(directory) if directory else ROOT / 'output/railcar/bake-probe'
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    original = scene.objects[target]
    hidden = original.hide_render
    proxy = original.copy()
    proxy.data = original.data.copy()
    scene.collection.objects.link(proxy)
    original.hide_render = True
    saved_samples = scene.cycles.samples
    saved_denoising = scene.cycles.use_denoising
    settings = {name: getattr(scene.render.bake, name) for name in (
        'target', 'use_clear', 'margin', 'margin_type', 'use_pass_direct',
        'use_pass_indirect', 'use_pass_color')}
    rows = {}
    try:
        export.realise([proxy])
        export.ensure_uvmap([proxy])
        export.unwrap([proxy], 'LightUV')
        groups = export.classify()[0]
        group = next(objects for objects in groups.values() if proxy in objects)
        others = [o for o in group if o != proxy]
        scene.cycles.use_denoising = False
        for mode in ('legacy_white_receiver', 'legacy_white_group',
                     'preserved_bounce_receiver', 'preserved_bounce_group'):
            maker = export.diffuse_copy if mode.startswith('preserved_bounce') else _white
            originals = export.swap(others, maker, {}) if mode.endswith('_group') else None
            image = None
            try:
                image = export.new_image('probe-' + mode, size, float_buffer=True)
                export.bake([proxy], 'DIFFUSE', image, 'LightUV', samples,
                            maker=maker, passes={'DIRECT', 'INDIRECT'})
                pixels = np.array(image.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :3]
                np.save(directory / (mode + '.npy'), pixels)
                values = pixels[np.max(pixels, axis=-1) > 0]
                rows[mode] = {'mean': values.mean(axis=0).tolist(),
                              'median': np.median(values, axis=0).tolist(),
                              'p95': np.percentile(values, 95, axis=0).tolist()}
            finally:
                if originals:
                    overrides = {slot.material for o in others for slot in o.material_slots if slot.material}
                    export.restore(others, originals)
                    for material in overrides:
                        if material.users == 0:
                            bpy.data.materials.remove(material)
                if image:
                    bpy.data.images.remove(image)
        report = {'target': target, 'size': size, 'samples': samples,
                  'units': 'linear diffuse bake values, not display sRGB',
                  'source_blend': bpy.data.filepath,
                  'export_sha256': hashlib.sha256(Path(export.__file__).read_bytes()).hexdigest(),
                  'measurements': rows}
        (directory / 'probe.json').write_text(json.dumps(report, indent=2) + '\n')
        (directory / 'progress.txt').write_text('COMPLETE\n')
    except Exception:
        (directory / 'progress.txt').write_text(traceback.format_exc())
        raise
    finally:
        original.hide_render = hidden
        mesh = proxy.data
        bpy.data.objects.remove(proxy, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
        scene.cycles.samples = saved_samples
        scene.cycles.use_denoising = saved_denoising
        for name, value in settings.items():
            setattr(scene.render.bake, name, value)
    return None
