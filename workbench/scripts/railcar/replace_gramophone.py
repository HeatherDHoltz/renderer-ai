"""Replace only authored gramophone; preserve current room and 4K creator maps."""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'output/railcar/gramophone-replacement'
ASSET=ROOT/'workbench/assets/railcar/export'
# Input is the frozen approved current room, never Heather's editing copy.
for o in list(bpy.data.objects):
 if o.name.lower().startswith('gramophone'):bpy.data.objects.remove(o,do_unlink=True)
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(OUT/'original-4k.glb'))
imported=[o for o in bpy.data.objects if o not in before]
bpy.context.view_layer.update()
body=next(o for o in imported if o.type=='MESH' and o.name.startswith('Wooden'))
record=next(o for o in imported if o.type=='MESH' and o.name.startswith('vinyl'))
components=json.loads((OUT/'welded-components.json').read_text())
arm_ids=set(i for k in [10,21,28,32] for i in components[k]['indices'])
crank_ids=set(i for k in [19,34] for i in components[k]['indices'])
c=bpy.data.collections.get('interactive dressing')
root=bpy.data.objects.new('MOVE — Gramophone',None);c.objects.link(root)
root.matrix_world=Matrix.Translation(Vector((-23,3.1,-2.28558+3.5*.088469)))@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Scale(3.5,4)
root['source']='Rigdhi — Vintage Gramophone Game-Asset, CC BY 4.0'
root['source_url']='https://sketchfab.com/3d-models/vintage-gramophone-game-asset-e3a21ee0e1004cfea8c13dad50a18034'
root['instructions']='Move this parent for the complete glued assembly. Record and tonearm have separate pivots. Crank is fixed. Browser click focuses, then tonearm click lowers/raises.'
base_me=body.data.copy();base_me.transform(body.matrix_world)
def part(name,ids,pivot):
 me=base_me.copy();bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table()
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in ids],context='VERTS');bm.to_mesh(me);bm.free()
 me.transform(Matrix.Translation(-Vector(pivot)));me.update()
 o=bpy.data.objects.new(name,me);c.objects.link(o);o.parent=root;o.location=pivot
 return o
all_ids=set(range(len(base_me.vertices)))
static=part('gramophone Rigdhi cabinet and horn',all_ids-arm_ids-crank_ids,(0,0,0))
crank=part('gramophone fixed crank',crank_ids,(0,0,0));crank['animation']='Fixed at every runtime state.'
arm=part('gramophone tonearm',arm_ids,(.095,.255,.28));arm.rotation_mode='XYZ'
arm.rotation_euler=(-.3,0,.8);arm['playing_rotation_xyz']=[0.,0.,0.];arm['rest_rotation_xyz']=[-.3,0.,.8]
record.data=record.data.copy();record.data.transform(record.matrix_world)
pivot=Vector((.001975,.001834,.2532945));record.data.transform(Matrix.Translation(-pivot))
record.parent=root;record.matrix_parent_inverse=Matrix.Identity(4);record.location=pivot;record.rotation_euler=(0,0,0);record.scale=(1,1,1);record.name='gramophone record';record['animation']='Always spinning in browser, even with tonearm raised; crank never spins.'
for owner in list(record.users_collection):owner.objects.unlink(record)
c.objects.link(record)
for o in imported:
 if o!=record and o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
for o in [static,arm,crank,record]:
 o['gramophone_textured']=True
 for m in o.data.materials:m.name='Rigdhi '+m.name if not m.name.startswith('Rigdhi ') else m.name
bpy.context.view_layer.update()
# Authoring retains creator's original full-resolution packed maps.
bpy.ops.file.pack_all()
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source.blend'))
# A separate delivery copy is resized by a GLB transport script, never this .blend.
bpy.ops.object.select_all(action='DESELECT')
for o in c.all_objects:o.select_set(True)
bpy.context.view_layer.objects.active=static
bpy.ops.export_scene.gltf(filepath=str(OUT/'props-full.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
(OUT/'assembly.json').write_text(json.dumps({'source':str(OUT/'source.blend'),'license':'CC BY 4.0','creator':'Rigdhi','recordPivot':list(pivot),'armPivot':list(arm.location),'bodyVertices':len(base_me.vertices),'armVertices':len(arm.data.vertices),'crankVertices':len(crank.data.vertices),'rootMatrix':[list(r) for r in root.matrix_world]},indent=2))
