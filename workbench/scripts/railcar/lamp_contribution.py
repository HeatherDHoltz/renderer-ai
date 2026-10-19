"""Isolate the student lamp's diffuse E/pi at existing full-resolution lighting UVs.
Default-on browser output stays bit-for-bit on its prior illumination path.
"""
import bpy,json,sys,gzip,struct,time,traceback
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(Path(__file__).parent))
import export
from rebake_subset import _glb
D=ROOT/'output/railcar/interactions'; A=ROOT/'workbench/assets/railcar/export'
def run():
 scene=bpy.context.scene;manifest=json.loads((A/'railcar-manifest.json').read_text());report={}
 lamp=bpy.data.objects['student lamp flame']
 for ob in scene.objects:
  if ob.type=='LIGHT' and ob!=lamp:ob.data.energy=0
 for m in bpy.data.materials:
  if m.use_nodes:
   for n in m.node_tree.nodes:
    if n.type=='EMISSION':n.inputs['Strength'].default_value=0
    if n.type=='BSDF_PRINCIPLED':n.inputs['Emission Strength'].default_value=0
 if scene.world.use_nodes:
  for n in scene.world.node_tree.nodes:
   if n.type=='BACKGROUND':n.inputs['Strength'].default_value=0
 for ob in export.classify()[3]:ob.hide_render=True
 neutral=bpy.data.materials.new('TEMP lamp white');neutral.use_nodes=True;nt=neutral.node_tree;nt.nodes.clear();df=nt.nodes.new('ShaderNodeBsdfDiffuse');df.inputs[0].default_value=(1,1,1,1);out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(df.outputs[0],out.inputs[0])
 for group in ('desk','architecture','furnishings'):
  start=time.time();info=manifest['groups'][group];doc,arr=_glb(A/info['file']);receivers=[]
  for node in doc['nodes']:
   if 'mesh' not in node:continue
   name=node['name'].split('|',1)[1];spec=info['materials'][name]
   for pr in doc['meshes'][node['mesh']]['primitives']:
    at=pr['attributes'];p=arr(at['POSITION'])[:,[0,2,1]]*[1,-1,1];n=arr(at['NORMAL'])[:,[0,2,1]]*[1,-1,1];tri=arr(pr['indices']).reshape(-1,3);uv=arr(at['TEXCOORD_'+str(spec.get('uv',0))]).copy();uv[:,1]=1-uv[:,1]
    me=bpy.data.meshes.new('TEMP lamp receiver');me.from_pydata((p+n*.001).tolist(),[],tri.tolist());me.materials.append(neutral);me.polygons.foreach_set('use_smooth',[True]*len(me.polygons));me.normals_split_custom_set_from_vertices(n.tolist());loops=np.array([l.vertex_index for l in me.loops])
    for key in ('UVMap','LightUV'):me.uv_layers.new(name=key).data.foreach_set('uv',uv[loops].ravel())
    ob=bpy.data.objects.new('TEMP lamp '+name,me);scene.collection.objects.link(ob)
    for flag in ('visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter'):setattr(ob,flag,False)
    receivers.append(ob)
  settings=manifest['bake']['groups'][group];size=settings['lightSize'];samples=settings['samples'];scene.cycles.use_denoising=False
  image=export.new_image('lamp '+group,size,float_buffer=True);(D/'lamp-progress.txt').write_text('BAKING '+group)
  export.bake(receivers,'DIFFUSE',image,'LightUV',samples,passes={'DIRECT','INDIRECT'})
  pixels=export.denoise(image);rgba=np.ones((size,size,4),dtype='<f2');rgba[:,:,:3]=np.clip(np.nan_to_num(pixels),0,65504)
  filename=f'railcar-{group}-student-lamp.f16.gz';(A/filename).write_bytes(gzip.compress(struct.pack('<II',size,size)+rgba[::-1].tobytes(),compresslevel=9))
  report[group]={'file':filename,'size':size,'samples':samples,'seconds':time.time()-start,'max':float(pixels.max())};(A/'student-lamp-lighting.json').write_text(json.dumps(report,indent=2))
  for ob in receivers:me=ob.data;bpy.data.objects.remove(ob,do_unlink=True);bpy.data.meshes.remove(me)
  bpy.data.images.remove(image)
 (D/'lamp-progress.txt').write_text('COMPLETE')
try:run()
except Exception:(D/'lamp-progress.txt').write_text(traceback.format_exc());raise
