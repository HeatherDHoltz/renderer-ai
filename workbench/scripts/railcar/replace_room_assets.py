"""Replace Heather's selected dressing on a frozen authored copy; keep original maps.
Run only on output/railcar/heather-sync/lit-source.blend through Blender MCP.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'output/railcar/heather-sync';ASSETS=OUT/'assets'

def remove(o):bpy.data.objects.remove(o,do_unlink=True)
def import_flat(name,collection):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ASSETS/(name+'.glb')));bpy.context.view_layer.update();added=[o for o in bpy.data.objects if o not in before];meshes=[]
 for o in added:
  if o.type!='MESH':continue
  me=o.data.copy();me.transform(o.matrix_world);o.data=me;o.parent=None;o.matrix_world=Matrix.Identity(4)
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o);meshes.append(o)
 for o in added:
  if o.type!='MESH':remove(o)
 return meshes

def parent(name,collection,matrix):
 o=bpy.data.objects.new(name,None);collection.objects.link(o);o.matrix_world=matrix;return o

def subset(o,name,ids,pivot,root,collection):
 me=o.data.copy();bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in ids],context='VERTS');bm.to_mesh(me);bm.free();me.transform(Matrix.Translation(-Vector(pivot)))
 result=bpy.data.objects.new(name,me);collection.objects.link(result);result.parent=root;result.location=pivot;return result

def run():
 # Keep an explicit inventory to remove precisely these old delivery surfaces.
 oldclock=[o for o in bpy.data.collections['longcase clock'].all_objects if o.type in ('MESH','CURVE','FONT')]
 oldglobe=[o for o in bpy.context.scene.objects if o.name.startswith('globe') and o.type in ('MESH','CURVE','FONT')]
 dressing=bpy.data.collections['interactive dressing'];oldcigar=[o for o in dressing.all_objects if o.type in ('MESH','CURVE','FONT') and o.name.startswith(('cigar','ashtray'))]
 removed=[o.name for o in oldclock+oldglobe+oldcigar];(OUT/'replaced-names.json').write_text(json.dumps(removed,indent=2))
 for o in oldclock+oldglobe+oldcigar:remove(o)
 for name in ('MOVE — Globe and stand','MOVE — Grandfather clock'):
  if name in bpy.data.objects:remove(bpy.data.objects[name])
 coll=bpy.data.collections.new('replacement assets');bpy.context.scene.collection.children.link(coll)
 # Original forward is -Y; same wall-facing direction as Heather's old clock.
 clock=import_flat('grandfather_clock',coll)[0];components=json.loads((ASSETS/'grandfather_clock-components.json').read_text())[0]['parts'];scale=(14.282500267028809+9.008000373840332)/2.284336566925049
 clockroot=parent('MOVE — Grandfather clock',coll,Matrix.Translation((11.7,8.25,-9.008000373840332))@Matrix.Scale(scale,4));clockroot['source']='Wille Evensson — Grandfather Clock, CC BY4.0'
 ids=lambda groups:set(i for k in groups for i in components[k]['indices'])
 moving={1,2,6,7,12,13,14,15,16,18,19,20,21,26,27,28,29,30,31,32,33}
 static=subset(clock,'replacement clock cabinet',set(range(len(clock.data.vertices)))-ids(moving),Vector(),clockroot,coll)
 door=subset(clock,'replacement clock door',ids([12]),(-.119,-.148,1.288),clockroot,coll)
 pendulum=subset(clock,'replacement clock pendulum',ids([13,33]),(0,.0665,1.293),clockroot,coll)
 face=Vector((0,-.13,1.7325));hands={}
 for name,groups,angle in [('minute',[1],0),('hour',[2],math.radians(225)),('second',[26,16],math.pi/2)]:
  o=subset(clock,'replacement clock '+name+' hand',ids(groups),face,clockroot,coll)
  # Canonical hand points at12; pose stopped at07:29:45.
  o.data.transform(Matrix.Rotation(-angle,4,'Y'));seconds=7*3600+29*60+45;period={'hour':43200,'minute':3600,'second':60}[name];o.rotation_euler.y=seconds/period*math.tau;hands[name]=o.name
 for index,(weight,chain) in enumerate([(6,[14,18,20,27,29,30]),(7,[15,19,21,28,31,32])]):
  pivot=Vector(components[weight]['center']);o=subset(clock,'replacement clock weight '+str(index),ids([weight]),pivot,clockroot,coll);o.location.z-=.2
  o['raised_z']=pivot.z;o['lowered_z']=pivot.z-.2
  c=subset(clock,'replacement clock chain '+str(index),ids(chain),(pivot.x,-.011,1.299),clockroot,coll);c.scale.z=(.185+.2)/.185;c['short_scale']=1.;c['long_scale']=c.scale.z
 remove(clock)
 # Preserve globe stand height and the position Heather chose. Axis comes from
 # the actual two pole mounting caps, not the support's object origin.
 globe=import_flat('floor_globe',coll)[0];components=json.loads((ASSETS/'floor_globe-components.json').read_text())[0]['parts'];s=(1.0670396089553833+8.940000534057617)/(137.9227294921875+.29210612177848816)
 groot=parent('MOVE — Globe and stand',coll,Matrix.Translation((19.883546829223633,6.413185119628906,-8.940000534057617+s*.29210612177848816))@Matrix.Scale(s,4));groot['source']='Chris Torres — Floor Globe, CC BY4.0'
 sphere_ids=set(components[1]['indices']);center=Vector(components[1]['center']);body=subset(globe,'replacement globe sphere',sphere_ids,center,groot,coll)
 stand=subset(globe,'replacement globe stand',set(range(len(globe.data.vertices)))-sphere_ids,Vector(),groot,coll)
 north=(Vector(components[8]['center'])-Vector(components[7]['center'])).normalized();body['spin_axis_local']=list(north);remove(globe)
 # Keep the complete creator arrangement, including smoked ends/loose ash.
 cigars=import_flat('cigar_and_ashtray',coll);croot=parent('MOVE — Cigar and ashtray',coll,Matrix.Translation((-7.15,2.7,-1.40))@Matrix.Scale(9.62,4));croot['source']='Miguel Adão — Cigar and Ashtray, CC BY4.0'
 for o in cigars:o.name='replacement cigar '+o.name;o.parent=croot
 bpy.context.view_layer.update()
 def app(v):return [float(v[0]),float(v[2]),-float(v[1])]
 # Cigar's smoldering tip is the exposed ash endpoint nearest its long shaft.
 tip=Vector((.004,-.005,.025));tip=croot.matrix_world@tip
 report={'clock':{'root':clockroot.name,'door':door.name,'pendulum':pendulum.name,'hands':hands,'initialSeconds':7*3600+29*60+45,'weightTravelLocal':.2,'chainLengthLocal':.185,'face':app(clockroot.matrix_world@face),'axis':[0,0,-1]},'globe':{'center':app(body.matrix_world.translation),'axis':app((groot.matrix_world.to_3x3()@north).normalized()),'sphere':body.name},'cigar':{'ember':app(tip)},'removed':removed}
 # Resolve supports and surrounding furniture before exporting any asset.
 def bounds(objects):
  pts=[o.matrix_world@Vector(v) for o in objects if o.type=='MESH' for v in o.bound_box]
  return Vector([min(p[k] for p in pts) for k in range(3)]),Vector([max(p[k] for p in pts) for k in range(3)])
 rug=bounds([bpy.data.objects['persian carpet']]);desk=bounds([bpy.data.objects['desk leather']]);book=bounds([bpy.data.objects['bar bookcase L waist']])
 before={o.name:list(o.location) for o in [clockroot,groot,croot]}
 for o in [clockroot,groot]:
  lo,hi=bounds(o.children_recursive);o.location.z+=rug[1].z+.002-lo.z;bpy.context.view_layer.update()
 lo,hi=bounds(clockroot.children_recursive);clockroot.location.y-=max(0,hi.y-rug[1].y+.03)
 lo,hi=bounds(groot.children_recursive);groot.location.x-=max(0,hi.x-book[0].x+.03)
 lo,hi=bounds([bpy.data.objects['replacement cigar Ashtray_Ashtray1_0']]);croot.location.z+=desk[1].z+.002-lo.z
 bpy.context.view_layer.update()
 report['globe']['center']=app(body.matrix_world.translation)
 lo,hi=bounds(clockroot.children_recursive);report['clock']['view']={'center':app((lo+hi)/2),'size':[abs(v) for v in app(hi-lo)]}
 report['clock']['face']=app(clockroot.matrix_world@face);report['cigar']['ember']=app(croot.matrix_world@Vector((.004,-.005,.025)))
 (OUT/'placement-repairs.json').write_text(json.dumps({'before':before,'after':{o.name:list(o.location) for o in [clockroot,groot,croot]},'supportGapAuthoringUnits':.002,'sideClearanceAuthoringUnits':.03},indent=2))
 (OUT/'replacement-rig.json').write_text(json.dumps(report,indent=2))
 # Give imported material routes unique names without discarding source maps.
 for o in coll.all_objects:
  if o.type=='MESH':
   o['railcar_imported']=True
   for m in o.data.materials:
    if not m.name.startswith('Railcar asset — '):m.name='Railcar asset — '+m.name
 bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'replacement-source.blend'))
 bpy.ops.object.select_all(action='DESELECT')
 for o in list(coll.all_objects)+list(dressing.all_objects):o.select_set(True)
 bpy.context.view_layer.objects.active=static
 bpy.ops.export_scene.gltf(filepath=str(OUT/'props-full.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
 return report
if __name__=='__main__':run()
