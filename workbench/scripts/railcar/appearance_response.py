"""Static Cycles transport, full source surface maps, explicit reflection ownership.

Diffuse mode keeps view-dependent varnish live. Near metals and mirrors stay
live; distant metal keeps its Cycles combined response instead of an unreliable
single room-probe reflection. No source geometry is rebuilt here.
"""
import gzip
import struct
from pathlib import Path


def bake(objects, specs, group, image, samples, directory, mode="irradiance"):
    if mode not in {"combined", "irradiance"}:
        raise ValueError("Use irradiance for room lighting; radiance/albedo diffuse mode is unsafe for layered materials: " + mode)
    import bpy
    import numpy as np
    import export
    scene=bpy.context.scene
    scene.render.bake.view_from='ACTIVE_CAMERA'
    scene.render.bake.use_pass_diffuse=True
    scene.render.bake.use_pass_transmission=False
    scene.render.bake.use_pass_emit=False
    width,height=image.size
    values=np.empty(width*height*4,dtype=np.float32)

    def store(response,filename,response_mode):
        rgba=np.ones((height,width,4),dtype='<f2')
        rgba[...,:3]=np.clip(np.nan_to_num(response),0,65504)
        (Path(directory)/filename).write_bytes(gzip.compress(
            struct.pack('<II',width,height)+np.flipud(rgba).tobytes(),compresslevel=6))
        return {'file':filename,'encoding':'linear RGBA16F, gzip','size':[width,height],
            'samples':samples,'camera':'ACTIVE_CAMERA','mode':response_mode,
            'clippedTexels':int(np.count_nonzero(np.max(response,axis=-1)>65504))}

    def factor(receivers,filename,glossy):
        scene.render.bake.use_pass_glossy=glossy
        image.pixels.foreach_set(np.zeros_like(values))
        export.bake(receivers,'COMBINED',image,'LightUV',samples,passes={'DIRECT','INDIRECT','COLOR'})
        image.pixels.foreach_get(values)
        radiance=values.reshape(height,width,4)[...,:3].copy()
        export.bake(receivers,'EMIT',image,'LightUV',4,maker=export.albedo_copy)
        image.pixels.foreach_get(values)
        albedo=values.reshape(height,width,4)[...,:3]
        response=radiance/np.maximum(albedo,.0001)
        values.reshape(height,width,4)[...,:3]=response
        values.reshape(height,width,4)[...,3]=1
        image.pixels.foreach_set(values)
        response=export.denoise(image)
        return store(response,filename,'combined' if glossy else 'diffuse')

    def metal(spec):
        return spec['kind'] in {'metal','gilt'} or spec.get('metallic',0)>.5
    far_metals=[o for o in objects if group!='desk' and metal(specs[o.material_slots[0].material.name])
        and 'mirror' not in o.material_slots[0].material.name.lower()]
    filename=f'railcar-{group}-appearance.f16.gz'
    if mode=='irradiance':
        # White Lambert receiver stores E/pi. Authored secondary transport is
        # retained separately by export.run; never divide layered BSDF radiance
        # by base colour and call that irradiance.
        scene.render.bake.use_pass_glossy=False
        image.pixels.foreach_set(np.zeros_like(values))
        export.bake(objects,'DIFFUSE',image,'LightUV',samples,maker=export.neutral_copy,passes={'DIRECT','INDIRECT'})
        info=store(export.denoise(image),filename,'irradiance')
        info['receiver']='neutral white diffuse, geometric normal; intact authored secondary transport'
    else:
        info=factor(objects,filename,True)
    metal_file=None
    if mode=='irradiance' and far_metals:
        metal_file=f'railcar-{group}-static-metal.f16.gz'
        info['staticMetalResponse']=factor(far_metals,metal_file,True)
    live=[]
    for ob in objects:
        name=ob.material_slots[0].material.name
        spec=specs[name]
        keep_live=('mirror' in name.lower()) or (group=='desk' and metal(spec)) or spec['kind']=='artglass'
        if keep_live:
            live.append(ob)
        else:
            static_metal=metal_file is not None and ob in far_metals
            spec['bakedResponse']=metal_file if static_metal else filename
            spec['bakedResponseMode']='combined' if static_metal else mode
            spec['renderRoute']='baked_irradiance_live_material' if spec['bakedResponseMode']=='irradiance' else 'baked_room'
    image.pixels.foreach_set(np.zeros_like(values))
    info['staticMaterials']=[n for n,s in specs.items() if s.get('bakedResponse')]
    info['liveMaterials']=[ob.material_slots[0].material.name for ob in live]
    return live,info
