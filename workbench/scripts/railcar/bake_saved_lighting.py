"""Rebake saved layout on preserved delivery UVs without regenerating furniture.
Full-resolution E/pi is baked against untouched source shaders. The optional
lamp-only map includes every actual student-lamp emitter and is RGBM encoded.
Always stage; inspect matching Cycles/browser views before installation.
"""
import bpy,json,sys,gzip,struct,time,hashlib
from pathlib import Path
import numpy as np
import export
from rebake_subset import _glb

def run(directory,evidence,groups=('desk','architecture','furnishings'),lamp_only=False,additive_lamp=False):
 directory,evidence=Path(directory),Path(evidence);manifest=json.loads((directory/'railcar-manifest.json').read_text());scene=bpy.context.scene
 for o in export.classify()[3]:o.hide_render=True
 scene.render.engine='CYCLES';scene.cycles.device='GPU';scene.cycles.use_denoising=False
 # Lamp-only pass isolates the same physical emitters used by the full bake.
 if lamp_only:
  for o in scene.objects:
   if o.type=='LIGHT' and not (o.name=='student lamp aperture light' if additive_lamp else o.name.startswith('student lamp ')):o.data.energy=0
  for m in bpy.data.materials:
   if m.use_nodes:
    for n in m.node_tree.nodes:
     if n.type=='EMISSION':n.inputs['Strength'].default_value=0
     if n.type=='BSDF_PRINCIPLED':n.inputs['Emission Strength'].default_value=0
  if scene.world.use_nodes:
   for n in scene.world.node_tree.nodes:
    if n.type=='BACKGROUND':n.inputs['Strength'].default_value=0
 material=bpy.data.materials.new('TEMP saved-room white receiver');material.use_nodes=True;nt=material.node_tree;nt.nodes.clear();df=nt.nodes.new('ShaderNodeBsdfDiffuse');df.inputs['Color'].default_value=(1,1,1,1);op=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(df.outputs[0],op.inputs[0])
 report={'source':bpy.data.filepath,'sourceSha256':hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),'lampOnly':lamp_only,'additiveLamp':additive_lamp,'groups':{}}
 for group in groups:
  started=time.time();(evidence/'lighting-progress.txt').write_text(('APERTURE ' if additive_lamp else 'LAMP ' if lamp_only else 'ROOM ')+group)
  info=manifest['groups'][group];doc,arr=_glb(directory/info['file']);receivers=[]
  for node in doc['nodes']:
   if 'mesh' not in node:continue
   if any(k in node for k in ('matrix','translation','rotation','scale')):raise ValueError('Expected flattened delivery geometry')
   name=node['name'].split('|',1)[1];spec=info['materials'][name]
   for pr in doc['meshes'][node['mesh']]['primitives']:
    if not arr(pr['indices']).size:continue
    at=pr['attributes'];p=arr(at['POSITION'])[:,[0,2,1]]*[1,-1,1];n=arr(at['NORMAL'])[:,[0,2,1]]*[1,-1,1];tri=arr(pr['indices']).reshape(-1,3);uv=arr(at['TEXCOORD_'+str(spec.get('uv',0))]);uv[:,1]=1-uv[:,1]
    me=bpy.data.meshes.new('TEMP receiver');me.from_pydata((p+n*.001).tolist(),[],tri.tolist());me.materials.append(material);me.polygons.foreach_set('use_smooth',[True]*len(me.polygons));me.normals_split_custom_set_from_vertices(n.tolist());loops=np.array([l.vertex_index for l in me.loops])
    for key in ('UVMap','LightUV'):me.uv_layers.new(name=key).data.foreach_set('uv',uv[loops].ravel())
    o=bpy.data.objects.new('TEMP receiver '+name,me);scene.collection.objects.link(o)
    for flag in ('visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter'):setattr(o,flag,False)
    receivers.append(o)
  settings=manifest['bake']['groups'][group];size=settings['lightSize'];samples=settings['samples'];image=export.new_image('saved-'+('lamp-' if lamp_only else '')+group,size,float_buffer=True)
  export.bake(receivers,'DIFFUSE',image,'LightUV',samples,passes={'DIRECT','INDIRECT'});pixels=export.denoise(image)
  if lamp_only and additive_lamp:
   # Light transport is linear. Add only the newly exposed outlet to the
   # completed room and isolated-lamp groups; preserve all other room light.
   lamp=json.loads((directory/'student-lamp-lighting.json').read_text());old=lamp[group]
   old_image=bpy.data.images.load(str(directory/old['file']),check_existing=False);old_image.colorspace_settings.name='Non-Color';old_image.alpha_mode='CHANNEL_PACKED'
   raw=np.empty(size*size*4,dtype=np.float32);old_image.pixels.foreach_get(raw);raw=raw.reshape(size,size,4);old_lamp=raw[...,:3]*raw[...,3:4]*old['range'];bpy.data.images.remove(old_image)
   response=directory/f'railcar-{group}-appearance.f16.gz';decoded=gzip.decompress(response.read_bytes());w,h=struct.unpack_from('<II',decoded);assert (w,h)==(size,size)
   full=np.frombuffer(decoded[8:],dtype='<f2').reshape(size,size,4).astype(np.float32)[::-1].copy();full[...,:3]=np.clip(full[...,:3]+pixels,0,65504)
   response.write_bytes(gzip.compress(struct.pack('<II',size,size)+full[::-1].astype('<f2').tobytes(),compresslevel=6))
   full_range=float(2**np.ceil(np.log2(max(float(full[...,:3].max()),16))));export.save_rgbm(full[...,:3],str(directory/info['light']),value_range=full_range);info['lightRange']=full_range
   manifest['additiveLampLighting']={'source':str(Path(bpy.data.filepath).name),'sourceSha256':report['sourceSha256'],'method':'full-resolution independently baked outlet added linearly before tone mapping','evidence':str(evidence)}
   (directory/'railcar-manifest.json').write_text(json.dumps(manifest,indent=1))
   pixels=pixels+old_lamp
  if lamp_only:
   span=float(2**np.ceil(np.log2(max(float(pixels.max()),1))));filename=f'railcar-{group}-student-lamp.webp';export.save_rgbm(pixels,str(directory/filename),value_range=span)
   lamp=json.loads((directory/'student-lamp-lighting.json').read_text());lamp[group]={'file':filename,'size':size,'samples':samples,'range':span,'max':float(pixels.max()),'encoding':'linear RGBM8, lossless WebP'};(directory/'student-lamp-lighting.json').write_text(json.dumps(lamp,indent=2))
  else:
   filename=f'railcar-{group}-appearance.f16.gz';rgba=np.ones((size,size,4),dtype='<f2');rgba[...,:3]=np.clip(np.nan_to_num(pixels),0,65504);(directory/filename).write_bytes(gzip.compress(struct.pack('<II',size,size)+rgba[::-1].tobytes(),compresslevel=6))
   # Existing static-metal combined fields are camera-dependent and retained;
   # only the already-irradiance materials consume this new lighting map.
   for spec in info['materials'].values():
    if spec.get('bakedResponseMode')=='irradiance':spec['bakedResponse']=filename
   span=float(2**np.ceil(np.log2(max(float(pixels.max()),16))));export.save_rgbm(pixels,str(directory/info['light']),value_range=span);info['lightRange']=span
   manifest['savedLayoutLighting']={'source':str(Path(bpy.data.filepath).name),'evidence':str(evidence),'receiver':'secondary-invisible neutral white; original scene transport','staticMetalFields':'prior camera-dependent combined response retained'}
   (directory/'railcar-manifest.json').write_text(json.dumps(manifest,indent=1))
  report['groups'][group]={'file':filename,'size':size,'samples':samples,'seconds':time.time()-started,'max':float(pixels.max()),'sha256':hashlib.sha256((directory/filename).read_bytes()).hexdigest()};(evidence/('aperture-bake.json' if additive_lamp else 'lamp-bake.json' if lamp_only else 'room-bake.json')).write_text(json.dumps(report,indent=2))
  for o in receivers:me=o.data;bpy.data.objects.remove(o,do_unlink=True);bpy.data.meshes.remove(me)
  bpy.data.images.remove(image)
 (evidence/'lighting-progress.txt').write_text('COMPLETE '+('LAMP' if lamp_only else 'ROOM'))
 return report
