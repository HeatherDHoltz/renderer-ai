"""Bake safe carcass at three door angles against the real authored room.
Lighting changes through the actual opening; no invisible interior helper light.
"""
import bpy,json,math,time
from pathlib import Path
from mathutils import Matrix,Vector
import numpy as np
import export
from rebake_subset import _glb
ROOT=Path(__file__).resolve().parents[3]
def run(directory,evidence):
 directory,evidence=Path(directory),Path(evidence);scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='GPU';scene.cycles.use_denoising=False
 metadata=json.loads((directory/'railcar-interactions.json').read_text());shell={'safe back','safe floor','safe left wall','safe right wall','safe roof'}
 for o in export.classify()[3]:o.hide_render=True
 names={p['object']for p in metadata['parts'] if p['object'].startswith('safe ') and p['object']not in shell and metadata['objects'][p['object']]['moving']};door=[bpy.data.objects[n]for n in names if n in bpy.data.objects];saved={o:o.matrix_world.copy()for o in door}
 white=bpy.data.materials.new('TEMP safe receiver');white.use_nodes=True;nt=white.node_tree;nt.nodes.clear();df=nt.nodes.new('ShaderNodeBsdfDiffuse');df.inputs[0].default_value=(1,1,1,1);op=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(df.outputs[0],op.inputs[0])
 manifest=json.loads((directory/'railcar-manifest.json').read_text());info=manifest['groups']['furnishings'];doc,arr=_glb(directory/info['file']);receivers=[]
 for node in doc['nodes']:
  if 'mesh'not in node:continue
  mat=node['name'].split('|',1)[1]
  for pi,pr in enumerate(doc['meshes'][node['mesh']]['primitives']):
   selected=sorted({i for part in metadata['parts']if part['object']in shell and part['material']==mat and part['group']=='furnishings' and part['primitive']==pi for i in part['triangles']})
   if not selected:continue
   at=pr['attributes'];indices=arr(pr['indices']).reshape(-1,3)[selected];used,inverse=np.unique(indices.ravel(),return_inverse=True);p=arr(at['POSITION'])[used][:,[0,2,1]]*[1,-1,1];n=arr(at['NORMAL'])[used][:,[0,2,1]]*[1,-1,1];uv=arr(at['TEXCOORD_'+str(info['materials'][mat]['uv'])])[used];uv[:,1]=1-uv[:,1]
   me=bpy.data.meshes.new('TEMP safe receiver');me.from_pydata((p+n*.001).tolist(),[],inverse.reshape(-1,3).tolist());me.materials.append(white);me.polygons.foreach_set('use_smooth',[True]*len(me.polygons));me.normals_split_custom_set_from_vertices(n.tolist());loops=np.array([l.vertex_index for l in me.loops])
   for layer in ('UVMap','LightUV'):me.uv_layers.new(name=layer).data.foreach_set('uv',uv[loops].ravel())
   ob=bpy.data.objects.new(me.name,me);scene.collection.objects.link(ob)
   for flag in ('visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter'):setattr(ob,flag,False)
   receivers.append(ob)
 records=[];hinge=Vector((-21.3965,5.0465,-5.595));size=manifest['bake']['groups']['furnishings']['lightSize'];samples=manifest['bake']['groups']['furnishings']['samples']
 for i,angle in enumerate((0.,math.pi/4,math.pi*.58)):
  (evidence/'safe-lighting-progress.txt').write_text('BAKING angle '+str(angle));delta=Matrix.Translation(hinge)@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-hinge)
  for o,matrix in saved.items():o.matrix_world=delta@matrix
  bpy.context.view_layer.update();image=export.new_image('safe-angle-'+str(i),size,float_buffer=True);start=time.time();export.bake(receivers,'DIFFUSE',image,'LightUV',samples,passes={'DIRECT','INDIRECT'});pixels=export.denoise(image);span=float(2**np.ceil(np.log2(max(float(pixels.max()),1))));file='safe-angle-'+str(i)+'.webp';export.save_rgbm(pixels,str(directory/file),value_range=span);records.append({'file':file,'range':span,'angle':angle,'size':size,'samples':samples,'seconds':time.time()-start});bpy.data.images.remove(image)
 for o,matrix in saved.items():o.matrix_world=matrix
 for o in receivers:me=o.data;bpy.data.objects.remove(o,do_unlink=True);bpy.data.meshes.remove(me)
 metadata['safeLighting']=records;(directory/'railcar-interactions.json').write_text(json.dumps(metadata,separators=(',',':')));(evidence/'safe-lighting.json').write_text(json.dumps(records,indent=2));(evidence/'safe-lighting-progress.txt').write_text('COMPLETE')
 return records
