"""Bake actual room illumination onto painting UVs, keeping original images."""
import json
from pathlib import Path


def run(directory):
    import bpy
    import numpy as np
    import export
    directory=Path(directory);directory.mkdir(exist_ok=True,parents=True)
    records={}
    for source in export.classify()[2]:
        clone=source.copy();clone.data=source.data.copy()
        clone.data.materials.clear();mat=source.material_slots[0].material.copy();clone.data.materials.append(mat)
        clone.name='TEMP painting lighting';bpy.context.scene.collection.objects.link(clone)
        for flag in ('visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter'):
            setattr(clone,flag,False)
        for v in clone.data.vertices:v.co+=v.normal*.001
        clone.data.uv_layers[0].name='UVMap'
        # This stores only smooth lamp illumination; the original painting
        # photograph is delivered independently at its full source resolution.
        image=export.new_image('painting lighting '+source.name,1024,float_buffer=True)
        export.bake([clone],'DIFFUSE',image,'UVMap',256,maker=export.neutral_copy,passes={'DIRECT','INDIRECT'})
        pixels=export.denoise(image)
        value_range=max(16,float(2**np.ceil(np.log2(max(float(pixels.max()),1)))))
        filename='painting-'+str(len(records))+'-light.webp'
        export.save_rgbm(pixels,str(directory/filename),value_range=value_range)
        records[source.material_slots[0].material.name]={'file':filename,'range':value_range,'size':1024,
            'sourceObject':source.name,'transport':'intact authored room; neutral diffuse lighting, native UV'}
        bpy.data.objects.remove(clone,do_unlink=True)
        (directory/'painting-lighting.json').write_text(json.dumps(records,indent=2))
    return records
