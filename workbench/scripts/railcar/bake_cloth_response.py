"""Bake Cycles cloth response / albedo on delivery lighting UVs.

The browser retains full-resolution surface photographs. Only the low-frequency
lighting/cloth response is baked; glossy metals and glass remain live. Run on a
frozen source in background Blender, never the user's editing session.
"""
import json
import gzip
import struct
from pathlib import Path


def run(directory):
    import bpy
    import numpy as np
    import export
    from mathutils import Vector
    from rebake_subset import _glb
    directory = Path(directory)
    manifest = json.loads((directory / 'railcar-manifest.json').read_text())
    scene = bpy.context.scene
    reference = json.loads((directory.parent / 'cycles-home.json').read_text())
    camera = scene.camera
    camera.location = reference['position']
    camera.rotation_euler = (Vector(reference['target']) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.bake.view_from = 'ACTIVE_CAMERA'
    scene.cycles.use_denoising = False
    for ob in export.classify()[3]:
        ob.hide_render = True
    evidence = []
    for group in ('architecture', 'furnishings'):
        info = manifest['groups'][group]
        doc, array = _glb(directory / info['file'])
        for node in doc['nodes']:
            if 'mesh' not in node: continue
            name = node['name'].split('|', 1)[1]
            if name != 'rc oxblood velvet': continue
            receivers = []
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                attrs = primitive['attributes']
                p = array(attrs['POSITION'])[:, [0, 2, 1]] * [1, -1, 1]
                n = array(attrs['NORMAL'])[:, [0, 2, 1]] * [1, -1, 1]
                triangles = array(primitive['indices']).reshape(-1, 3)
                uv = array(attrs['TEXCOORD_' + str(info['materials'][name]['uv'])]).copy()
                uv[:, 1] = 1 - uv[:, 1]
                mesh = bpy.data.meshes.new('TEMP cloth response')
                mesh.from_pydata((p + n * .001).tolist(), [], triangles.tolist())
                mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
                mesh.normals_split_custom_set_from_vertices(n.tolist())
                mat = bpy.data.materials[name].copy()
                for texcoord in list(mat.node_tree.nodes):
                    if texcoord.type != 'TEX_COORD': continue
                    for socket, attr in [('Object', '_lj_obj'), ('Generated', '_lj_gen')]:
                        if not texcoord.outputs[socket].is_linked: continue
                        a = mat.node_tree.nodes.new('ShaderNodeAttribute'); a.attribute_name = attr
                        for link in list(texcoord.outputs[socket].links):
                            mat.node_tree.links.new(a.outputs['Vector'], link.to_socket)
                mesh.materials.append(mat)
                for key in ('_LJ_OBJ', '_LJ_ONRM', '_LJ_GEN'):
                    if key in attrs:
                        a = mesh.attributes.new(key.lower(), 'FLOAT_VECTOR', 'POINT')
                        a.data.foreach_set('vector', array(attrs[key]).ravel())
                loops = np.array([loop.vertex_index for loop in mesh.loops])
                for layer in ('UVMap', 'LightUV'):
                    mesh.uv_layers.new(name=layer).data.foreach_set('uv', uv[loops].ravel())
                ob = bpy.data.objects.new('TEMP cloth response', mesh);scene.collection.objects.link(ob)
                for flag in ('visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter'):
                    setattr(ob, flag, False)
                receivers.append(ob)
            size = manifest['bake']['groups'][group]['lightSize']
            image = export.new_image('cloth-' + group, size, float_buffer=True)
            scene.render.bake.use_pass_diffuse = True
            scene.render.bake.use_pass_glossy = True
            scene.render.bake.use_pass_transmission = False
            scene.render.bake.use_pass_emit = False
            export.bake(receivers, 'COMBINED', image, 'LightUV', 256, passes={'DIRECT','INDIRECT','COLOR'})
            values = np.empty(size * size * 4, np.float32);image.pixels.foreach_get(values)
            radiance = values.reshape(size,size,4)[...,:3].copy()
            export.bake(receivers, 'EMIT', image, 'LightUV', 1, maker=export.albedo_copy)
            image.pixels.foreach_get(values); albedo=values.reshape(size,size,4)[...,:3]
            factor = radiance / np.maximum(albedo, .0001)
            # Filter transport only; the untouched photograph supplies fine nap.
            values.reshape(size,size,4)[...,:3] = factor
            values.reshape(size,size,4)[...,3] = 1
            image.pixels.foreach_set(values)
            factor = export.denoise(image)
            filename = 'railcar-' + group + '-cloth-response.f16.gz'
            rgba = np.ones((size,size,4), dtype='<f2')
            rgba[...,:3] = np.clip(np.nan_to_num(factor), 0, 65504)
            # DataTexture rows follow glTF's top-origin UVs.
            payload = struct.pack('<II',size,size) + np.flipud(rgba).tobytes()
            (directory / filename).write_bytes(gzip.compress(payload, compresslevel=6))
            info['materials'][name]['bakedResponse'] = filename
            evidence.append({'group':group,'material':name,'size':size,'samples':256,
                'encoding':'linear RGBA16F, gzip',
                'clippedTexels':int(np.count_nonzero(np.max(factor,axis=-1)>65504)),
                'surfaceTextures':'unchanged full resolution','camera':'cycles-home.json'})
            for ob in receivers:
                mesh=ob.data;mat=mesh.materials[0];bpy.data.objects.remove(ob,do_unlink=True)
                bpy.data.meshes.remove(mesh);bpy.data.materials.remove(mat)
            bpy.data.images.remove(image)
            (directory / 'cloth-response-evidence.json').write_text(json.dumps(evidence,indent=2))
            (directory / 'railcar-manifest.json').write_text(json.dumps(manifest,indent=1))
    return evidence
