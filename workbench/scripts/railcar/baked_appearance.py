"""Stage camera-referenced Cycles appearance textures without changing the source.

run() starts with a small proof; expand targets only after matching captures.
Static receivers keep their authored materials, while all secondary rays see the
intact original room. RGBM contains linear radiance, not a display-graded image.
"""
import hashlib
import json
import math
from pathlib import Path
import shutil
import time
import traceback
from cycles_random import object_random

ROOT = Path(__file__).resolve().parents[3]
LOADED_SOURCE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
DEFAULT_TARGETS = {'desk': ['rc mahogany', 'rc mahogany dark', 'rc rosewood panel',
                            'rc tooled green leather'],
                   'architecture': ['rc persian carpet']}


def _exists(obj, bpy):
    if obj is None:
        return False
    try:
        return obj.name in bpy.data.objects
    except ReferenceError:
        return False


def run(directory=None, targets=None, merge_existing=False):
    import bpy
    import numpy as np
    import export
    from mathutils import Vector
    directory = Path(directory or ROOT / 'output/railcar/appearance')
    directory.mkdir(parents=True, exist_ok=True)
    targets = targets or DEFAULT_TARGETS
    base_export = ROOT / 'workbench/assets/railcar/export'
    base_manifest = json.loads((base_export / 'railcar-manifest.json').read_text())
    base_geometry = {group: hashlib.sha256((base_export / base_manifest['groups'][group]['file']).read_bytes()).hexdigest() for group in targets}
    existing = json.loads((directory / 'appearance.json').read_text()) if merge_existing and (directory / 'appearance.json').is_file() else None
    scene = bpy.context.scene
    groups, _, _, skipped, _ = export.classify()
    source_path = Path(bpy.data.filepath)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    saved = {'samples': scene.cycles.samples, 'denoise': scene.cycles.use_denoising,
             'selected': list(bpy.context.selected_objects), 'active': bpy.context.view_layer.objects.active}
    bake_saved = {k: getattr(scene.render.bake, k) for k in
                  ('target', 'use_clear', 'margin', 'margin_type', 'view_from',
                   'use_pass_direct', 'use_pass_indirect', 'use_pass_color',
                   'use_pass_diffuse', 'use_pass_glossy', 'use_pass_transmission', 'use_pass_emit')}
    output_saved = {k: getattr(scene.render.image_settings, k) for k in ('file_format', 'color_mode', 'quality')}
    originals = [(o, o.hide_render) for o in skipped]
    clones, materials, images = [], [], []
    rows = []
    start = time.time()
    try:
        for o, _ in originals:
            o.hide_render = True
        # Use the website's approved home camera, not the old r12 calibration.
        import case_preview
        frame = case_preview.camera_frame()
        cam = scene.camera
        camera_saved = (cam.matrix_world.copy(), cam.data.lens, cam.data.sensor_fit,
                        cam.data.sensor_width, cam.data.shift_x, cam.data.shift_y)
        cam.location = frame['position']
        cam.rotation_euler = (Vector(frame['target']) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.sensor_fit = 'HORIZONTAL'
        cam.data.sensor_width = 36
        cam.data.lens = 36 / (2 * math.tan(math.radians(frame['fov']) / 2) * frame['aspect'])
        # Blender's horizontal sensor-fit shift is a fraction of sensor width;
        # the browser's view offset is a fraction of frame height.
        cam.data.shift_x, cam.data.shift_y = 0, .15 / frame['aspect']
        scene.render.bake.view_from = 'ACTIVE_CAMERA'
        scene.cycles.use_denoising = False
        deps = bpy.context.evaluated_depsgraph_get()
        for group, names in targets.items():
            for name in names:
                (directory / 'progress.txt').write_text(f'BAKING {group}|{name}\n')
                selected = [o for o in groups[group] if any(s.material and s.material.name == name for s in o.material_slots)]
                if not selected:
                    raise ValueError(f'Missing source material {group}|{name}')
                if any(any(s.material and s.material.name != name for s in o.material_slots) for o in selected):
                    raise ValueError(f'Multi-material source needs face extraction: {name}')
                batch = []
                mat = bpy.data.materials[name].copy()
                materials.append(mat)
                for source in selected:
                    ev = source.evaluated_get(deps)
                    mesh = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
                    ob = bpy.data.objects.new('TEMP appearance ' + source.name, mesh)
                    scene.collection.objects.link(ob)
                    ob.matrix_world = source.matrix_world
                    mesh.materials.clear(); mesh.materials.append(mat)
                    for face in mesh.polygons:
                        face.material_index = 0
                    batch.append(ob); clones.append(ob)
                export.ensure_uvmap(batch)
                export.coordinate_attributes(batch)
                for ob, source in zip(batch, selected):
                    ob.data.attributes['_lj_rand'].data.foreach_set('value',
                        np.full(len(ob.data.vertices), object_random(source.name), dtype=np.float32))
                export.normalise_material_uvs([mat])
                # Shared UVs can overlap across objects; repack each receiver unless
                # it is one authored UV surface (carpet/leather keep their detail).
                native = len(batch) == 1 and export.classify_material(bpy.data.materials[name])['kind'] == 'uvbake'
                merged = export.merge('appearance', batch)
                clones = [o for o in clones if _exists(o, bpy)]
                if merged not in clones: clones.append(merged)
                if native:
                    uv_name = 'UVMap'
                    # Match/exceed the currently delivered surface texture size.
                    manifest = json.loads((ROOT / 'workbench/assets/railcar/export/railcar-manifest.json').read_text())
                    size = manifest['groups'][group]['materials'][name].get('size', 2048)
                else:
                    export.unwrap([merged], 'AppearanceUV')
                    uv_name = 'AppearanceUV'
                    size = export.pow2(math.sqrt(export.world_area([merged]) / export.uv_coverage([merged], uv_name)) * 200, 256, 32768)
                    if size > 16384:
                        raise ValueError(f'{name} requires {size}px; split into tiles, never silently lower density')
                delivery_mesh = None
                if name == 'rc persian carpet' and native:
                    # Solidify shares top/bottom UVs. Bake the top once, then
                    # export the full original mesh; the underside is below the floor.
                    import bmesh
                    delivery_mesh = merged.data.copy()
                    bm = bmesh.new(); bm.from_mesh(merged.data)
                    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < .9], context='FACES')
                    bm.to_mesh(merged.data); bm.free(); merged.data.update()
                (directory / 'progress.txt').write_text(f'BAKING {group}|{name}, {size}px, {export.GROUPS[group][2]} samples\n')
                for flag in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_shadow', 'visible_volume_scatter'):
                    setattr(merged, flag, False)
                # Offset only for baking; the exported geometry stays at the source.
                base = np.array([v.co[:] for v in merged.data.vertices])
                normal = np.array([v.normal[:] for v in merged.data.vertices])
                merged.data.vertices.foreach_set('co', (base + normal * .001).ravel())
                merged.data.update()
                image = export.new_image('appearance ' + name, size, float_buffer=True)
                images.append(image)
                scene.render.bake.use_pass_diffuse = True
                scene.render.bake.use_pass_glossy = True
                scene.render.bake.use_pass_transmission = False
                scene.render.bake.use_pass_emit = True
                export.bake([merged], 'COMBINED', image, uv_name, export.GROUPS[group][2],
                            passes={'DIRECT', 'INDIRECT', 'COLOR'})
                # Denoising a colour texture blurs surface detail. Keep the full
                # sampled radiance; do not run the irradiance-only denoiser here.
                buffer = np.empty(size * size * 4, dtype=np.float32)
                image.pixels.foreach_get(buffer)
                pixels = buffer.reshape(size, size, 4)[..., :3]
                stem = group + '-' + name.replace(' ', '-')
                export.save_rgbm(pixels, str(directory / (stem + '.webp')))
                merged.data.vertices.foreach_set('co', base.ravel()); merged.data.update()
                if delivery_mesh is not None:
                    baked_mesh = merged.data
                    merged.data = delivery_mesh
                    bpy.data.meshes.remove(baked_mesh)
                export.set_uv_layers(merged.data, [uv_name])
                merged.name = group + '|' + name
                merged.data.materials.clear()
                export.select([merged])
                glb = directory / (stem + '.glb')
                bpy.ops.export_scene.gltf(filepath=str(glb), use_selection=True, export_format='GLB',
                    export_yup=True, export_materials='NONE', export_normals=True, export_texcoords=True,
                    export_attributes=False, export_cameras=False, export_lights=False)
                rows.append({'group': group, 'material': name, 'route': 'baked_room',
                             'file': glb.name, 'radiance': stem + '.webp', 'size': size,
                             'samples': export.GROUPS[group][2], 'source_objects': [o.name for o in selected],
                             'baseGeometrySha256': base_geometry[group],
                             'clippedPixels': int(np.count_nonzero(np.max(pixels, axis=-1) > export.RGBM_RANGE)),
                             'fileSha256': hashlib.sha256(glb.read_bytes()).hexdigest(),
                             'radianceSha256': hashlib.sha256((directory / (stem + '.webp')).read_bytes()).hexdigest()})
                (directory / 'partial.json').write_text(json.dumps(rows, indent=2) + '\n')
                # Finished receivers must also be invisible to camera before the
                # next bake, while remaining selectable for their export above.
                merged.hide_render = True
        if existing:
            keys = {(row['group'], row['material']) for row in rows}
            rows = [row for row in existing['replacements'] if (row['group'], row['material']) not in keys] + rows
        report = {'version': 1, 'rgbmRange': 16, 'view': 'ACTIVE_CAMERA', 'camera': frame,
                  'shiftY': .15 / frame['aspect'], 'browserShiftHeight': .15,
                  'receiverBiasMm': .1, 'sourceBlend': str(source_path),
                  'sourceBlendSha256': source_hash,
                  'scriptSha256': LOADED_SOURCE_SHA256,
                  'seconds': time.time() - start, 'replacements': rows,
                  'limitations': ['Static glossy appearance is frozen at home camera; live metals are separate.',
                                  'Proof targets only; other room materials retain the previous pipeline.']}
        (directory / 'appearance.json').write_text(json.dumps(report, indent=2) + '\n')
        (directory / 'progress.txt').write_text('COMPLETE; candidate requires matching browser/Cycles review\n')
    except Exception:
        (directory / 'progress.txt').write_text(traceback.format_exc())
        raise
    finally:
        if 'camera_saved' in locals():
            cam.matrix_world, cam.data.lens, cam.data.sensor_fit, cam.data.sensor_width, cam.data.shift_x, cam.data.shift_y = camera_saved
        for o, hidden in originals: o.hide_render = hidden
        for o in clones:
            if _exists(o, bpy):
                mesh = o.data
                bpy.data.objects.remove(o, do_unlink=True)
                if not mesh.users: bpy.data.meshes.remove(mesh)
        for image in images:
            if not image.users: bpy.data.images.remove(image)
        for mat in materials:
            if not mat.users: bpy.data.materials.remove(mat)
        scene.cycles.samples, scene.cycles.use_denoising = saved['samples'], saved['denoise']
        for k, v in bake_saved.items(): setattr(scene.render.bake, k, v)
        for k, v in output_saved.items(): setattr(scene.render.image_settings, k, v)
        selection = [o for o in saved['selected'] if _exists(o, bpy)]
        if selection:
            export.select(selection, saved['active'] if _exists(saved['active'], bpy) else selection[0])
        else:
            bpy.ops.object.select_all(action='DESELECT')
    return None
