"""Add interactive dressing on a COPY and map authored parts to the unchanged delivery.
Run with the approved curtain-repair source. Never rebuild Heather's layout.
"""
import bpy, json, math, hashlib, sys, gzip
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(Path(__file__).parent))
from geo import box,cyl,sphere,lathe,coll
from rebake_subset import _glb
OUT=ROOT/'output/railcar/interactions'; ASSET=ROOT/'workbench/assets/railcar/export'

def app(p): return [float(p[0]),float(p[2]),-float(p[1])]
def run():
 s=bpy.context.scene; dg=bpy.context.evaluated_depsgraph_get(); mapping=[]; details={}
 safe_static={'safe back','safe cornice','safe floor','safe left wall','safe right wall','safe roof','safe plinth'}
 live_shell={'safe back','safe floor','safe left wall','safe right wall','safe roof'}
 def selected(n):
  return (n in live_shell or (n.startswith('safe ') and n not in safe_static and not n.startswith('safe Victorian cornice') and not n.startswith('safe Victorian crest') and not n.startswith('safe hinge barrel') and not n.startswith('safe hinge cap')) or n=='globe' or n in ('balance beam','balance pointer','balance pan -1','balance pan 1') or n.startswith('pan wire ') or n.startswith('weight knob ') or n in ('weight 0.001','weight 1.001','weight 2.001','weight 3','weight 4'))
 # Include nonmoving click surfaces without removing their triangles.
 sources=[o for o in s.objects if o.type in ('MESH','CURVE') and (selected(o.name) or o.name.startswith('student lamp ') or o.name.startswith('fire iron '))]
 trees={}; mats={}
 for o in sources:
  ev=o.evaluated_get(dg); me=ev.to_mesh(); points=[ev.matrix_world@v.co for v in me.vertices]
  tree=KDTree(len(points))
  for i,p in enumerate(points):tree.insert(p,i)
  tree.balance(); trees[o.name]=tree; mats[o.name]={m.name for m in me.materials if m}
  lo=Vector([min(v[k] for v in points) for k in range(3)]);hi=Vector([max(v[k] for v in points) for k in range(3)])
  details[o.name]={'min':app((lo.x,hi.y,lo.z)),'max':app((hi.x,lo.y,hi.z)),'center':app((lo+hi)/2),'axis':app((o.matrix_world.to_3x3()@Vector((0,0,1))).normalized()),'moving':selected(o.name)}
  ev.to_mesh_clear()
 for group in ('desk','furnishings'):
  doc,arr=_glb(ASSET/f'railcar-{group}.glb')
  for node in doc['nodes']:
   if 'mesh' not in node:continue
   material=node['name'].split('|',1)[1]
   for pi,prim in enumerate(doc['meshes'][node['mesh']]['primitives']):
    pos=arr(prim['attributes']['POSITION']); source=pos[:,[0,2,1]]*[1,-1,1]; indices=arr(prim['indices']).reshape(-1,3); used=set()
    for o in sources:
     if material not in mats[o.name]:continue
     d=details[o.name];lo=Vector(d['min']);hi=Vector(d['max']);valid=[i for i,p in enumerate(pos) if all(lo[k]-.011<=p[k]<=hi[k]+.011 for k in range(3))]
     found=set(i for i in valid if trees[o.name].find(Vector(source[i]))[2]<=.01002)
     tris=[i for i,tri in enumerate(indices) if all(int(v) in found for v in tri)]
     if tris:
      if selected(o.name):
       tris=[i for i in tris if i not in used]
       used.update(tris)
      mapping.append({'object':o.name,'group':group,'material':material,'primitive':pi,'triangles':tris})
 for o in sources:
  if selected(o.name) and not o.name.startswith('safe ') and not any(m['object']==o.name and m['triangles'] for m in mapping):raise ValueError('Unmatched moving object: '+o.name)
 record={'version':1,'geometryHashes':{g:hashlib.sha256((ASSET/f'railcar-{g}.glb').read_bytes()).hexdigest() for g in ('desk','furnishings')},'objects':details,'parts':mapping,'lamp':app(bpy.data.objects['student lamp flame'].matrix_world.translation),'fixtures':[{'name':o.name,'position':app(o.matrix_world.translation),'color':list(o.data.color),'power':float(o.data.energy)} for o in s.objects if o.type=='LIGHT' and o.data.type=='POINT' and not o.hide_render and ('flame' in o.name or 'visible bulb' in o.name)]}
 (ASSET/'railcar-interactions.json').write_text(json.dumps(record,separators=(',',':')))
 # Individually authored props use normal PBR materials; no images or remote dependencies.
 c=coll('interactive dressing'); new=[]
 def mat(name,color,metal=0,rough=.4):
  m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
 wood=bpy.data.materials['Heather — balance warm rosewood'].copy();wood.name='gramophone rosewood';gold=mat('gramophone chased brass',(.40,.22,.065),.85,.3);black=mat('gramophone shellac',(.008,.006,.004),.18,.24);ivory=mat('gramophone label',(.32,.21,.095),0,.65)
 # Safe roof/cornice top -2.28558; case sits on it, with four short bun feet.
 x,y,z=-23.0,3.1,-2.28558
 for dx in (-.9,.9):
  for dy in (-.95,.95):sphere('gramophone foot', (x+dx,y+dy,z+.09),.12,gold,c,scale=(1,1,.75))
 box('gramophone cabinet',(x-1.15,y-1.2,z+.18),(x+1.15,y+1.2,z+.72),wood,c,.09,4)
 for dz in (.19,.67):box('gramophone gilt moulding',(x-1.18,y-1.23,z+dz),(x+1.18,y+1.23,z+dz+.06),gold,c,.025,3)
 cyl('gramophone platter',(x,y,z+.78),.97,.97,.08,gold,c,96)
 cyl('gramophone record',(x,y,z+.831),.91,.91,.022,black,c,128)
 cyl('gramophone record label',(x,y,z+.845),.26,.26,.004,ivory,c,64)
 cyl('gramophone spindle',(x,y,z+.89),.035,.035,.12,gold,c,24)
 # An open flared horn, with thin rim, aimed toward the room (+X).
 horn=lathe('gramophone horn',[(.07,0),(.085,.32),(.13,.62),(.25,.9),(.48,1.18),(.79,1.44),(1.02,1.61),(1.04,1.65),(1.00,1.67),(.75,1.44),(.44,1.18),(.21,.9),(.10,.62),(.055,.32),(.05,0),(.07,0)],(x-.85,y+.9,z+1.15),gold,c,96,rot=(0,math.pi/3,0))
 cyl('gramophone horn neck',(x-.85,y+.9,z+.99),.09,.09,.42,gold,c,32)
 cyl('gramophone tonearm upright',(x-.9,y-.8,z+1.0),.05,.05,.4,gold,c,24)
 arm=cyl('gramophone tonearm',(x-.35,y-.8,z+1.18),.045,.045,1.10,gold,c,32,rot=(0,math.pi/2,0))
 cyl('gramophone soundbox',(x+.2,y-.8,z+1.08),.14,.14,.12,gold,c,40,rot=(math.pi/2,0,0))
 cyl('gramophone crank',(x+1.4,y,z+.45),.04,.04,.65,gold,c,24,rot=(0,math.pi/2,0));cyl('gramophone crank grip',(x+1.7,y,z+.59),.07,.07,.28,wood,c,24)
 # A silver scalloped ashtray safely clear of balance pans and the weight box.
 silver=mat('ashtray engraved silver',(.34,.29,.21),.92,.26);tobacco=mat('cigar wrapper',(.075,.027,.011),0,.85);ash=mat('cigar grey ash',(.14,.13,.11),0,1);band=mat('cigar gilt band',(.48,.25,.05),.65,.4)
 ax,ay,az=-7.15,2.7,-1.44
 lathe('cigar ashtray',[(0,.04),(.49,.04),(.59,.09),(.65,.18),(.64,.22),(.59,.23),(.53,.15),(.43,.09),(0,.09)],(ax,ay,az),silver,c,96)
 for i in range(12):
  a=i*math.tau/12;sphere('ashtray chased bead',(ax+.60*math.cos(a),ay+.60*math.sin(a),az+.18),.037,silver,c,segs=16)
 cyl('cigar',(ax+.075,ay,az+.305),.075,.07,1.0,tobacco,c,48,rot=(0,math.pi/2,0))
 cyl('cigar band',(ax+.2,ay,az+.305),.078,.078,.13,band,c,48,rot=(0,math.pi/2,0))
 cyl('cigar ash',(ax-.535,ay,az+.305),.077,.077,.22,ash,c,48,rot=(0,math.pi/2,0))
 ember=mat('cigar ember',(.12,.018,.003),0,.95);p=ember.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.045,.002,1);p.inputs['Emission Strength'].default_value=.7
 cyl('cigar ember',(ax-.65,ay,az+.305),.064,.064,.012,ember,c,40,rot=(0,math.pi/2,0))
 bpy.context.view_layer.update()
 # Save this staged authored version; user's original editing file remains untouched.
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source.blend'))
 bpy.ops.object.select_all(action='DESELECT')
 for o in c.objects:o.select_set(True)
 bpy.context.view_layer.objects.active=next(iter(c.objects))
 bpy.ops.export_scene.gltf(filepath=str(ASSET/'railcar-interactive-props.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
 (OUT/'authoring.json').write_text(json.dumps({'source':str(OUT/'source.blend'),'parts':len(mapping),'objects':len(details),'triangles':sum(len(p['triangles']) for p in mapping),'newObjects':len(c.objects)},indent=2))
 return record
if __name__=='__main__':run()
