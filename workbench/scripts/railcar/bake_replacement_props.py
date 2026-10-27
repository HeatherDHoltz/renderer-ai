"""Bake only low-frequency irradiance; retain every imported full-resolution map."""
import bpy,sys,json,time
from pathlib import Path
from mathutils import Vector
import numpy as np
import export
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'output/railcar/heather-sync';DEST=OUT/'export'

def run(reunwrap=True,save_source=True,export_props=True):
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='GPU';scene.cycles.use_denoising=False
 hidden={o:o.hide_render for o in bpy.context.scene.objects}
 for o in export.classify()[3]:o.hide_render=True
 records=[]
 groups={'clock':[bpy.data.objects['replacement clock cabinet']], 'globe':[bpy.data.objects['replacement globe stand']], 'cigar':[o for o in bpy.data.collections['replacement assets'].all_objects if o.type=='MESH' and o.name.startswith('replacement cigar') and 'Ashtray1' not in o.data.materials[0].name]}
 white=bpy.data.materials.new('TEMP imported white receiver');white.use_nodes=True;nt=white.node_tree;nt.nodes.clear();df=nt.nodes.new('ShaderNodeBsdfDiffuse');df.inputs[0].default_value=(1,1,1,1);op=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(df.outputs[0],op.inputs[0])
 for group,objects in groups.items():
  (OUT/'props-bake-progress.txt').write_text('BAKING '+group)
  if reunwrap:export.unwrap(objects,'LightUV')
  receivers=[]
  for source in objects:
   ob=source.copy();ob.data=source.data.copy();scene.collection.objects.link(ob);ob.name='TEMP imported receiver';ob.data.materials.clear();ob.data.materials.append(white)
   m=source.matrix_world.to_3x3();inv=m.inverted();normal=m.inverted().transposed()
   for v in ob.data.vertices:v.co+=inv@((normal@v.normal).normalized()*.001)
   for flag in ('visible_diffuse','visible_glossy','visible_transmission','visible_shadow','visible_volume_scatter'):setattr(ob,flag,False)
   receivers.append(ob)
  image=export.new_image('imported-'+group,1024,float_buffer=True);start=time.time();export.bake(receivers,'DIFFUSE',image,'LightUV',256,passes={'DIRECT','INDIRECT'});pixels=export.denoise(image);span=float(2**np.ceil(np.log2(max(float(pixels.max()),1))));file='replacement-'+group+'-light.webp';export.save_rgbm(pixels,str(DEST/file),value_range=span)
  record={'file':file,'range':span,'size':1024,'samples':256,'seconds':time.time()-start}
  for source in objects:source['railcarStaticLight']=record
  records.append(record)
  for ob in receivers:me=ob.data;bpy.data.objects.remove(ob,do_unlink=True);bpy.data.meshes.remove(me)
  bpy.data.images.remove(image)
 (OUT/'props-lighting.json').write_text(json.dumps(records,indent=2))
 for o,was_hidden in hidden.items():o.hide_render=was_hidden
 # Save only authored objects/UVs; no temporary receivers or hidden-case changes.
 if save_source:bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
 if export_props:
  bpy.ops.object.select_all(action='DESELECT')
  for cname in ('replacement assets','interactive dressing'):
   for o in bpy.data.collections[cname].all_objects:o.select_set(True)
  bpy.context.view_layer.objects.active=groups['clock'][0]
  bpy.ops.export_scene.gltf(filepath=str(OUT/'props-full.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
 (OUT/'props-bake-progress.txt').write_text('COMPLETE')
 return records
if __name__=='__main__':run()
