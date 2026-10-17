"""Authored collector-jeweler staging, executed by build-atelier.py in Blender."""
from mathutils import Vector
import math,random

def rod(name,a,b,r,mat):
 a,b=Vector(xyz(a)),Vector(xyz(b));mid=(a+b)/2
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=(b-a).length,location=mid)
 o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();finish(o,mat,.006);return o

def text(name,body,p,size,mat,wall=False,rotation=0):
 bpy.ops.object.text_add(location=xyz(p));o=bpy.context.object;o.name=name;o.data.body=body;o.data.size=size;o.data.extrude=.0008;o.data.align_x='CENTER';o.data.materials.append(mat)
 if wall:o.rotation_euler.x=math.pi/2
 else:o.rotation_euler.z=rotation
 bpy.ops.object.convert(target='MESH');static.append(bpy.context.object);return bpy.context.object

def disc(name,r,depth,p,mat):return cylinder(name,r,depth,p,mat)

# A real working balance: beam, fulcrum, suspended pans and a small weight set.
bronze=material('polished instrument brass','c8a66b',.23,.88)
blued=material('blued instrument steel','233c46',.32,.88)
box('balance walnut foot',(1.45,.13,.72),(-2.75,-1.29,-3.65),walnut,.06)
rod('balance pillar',(-2.75,-1.22,-3.65),(-2.75,.12,-3.65),.045,bronze)
rod('balance beam',(-3.55,.02,-3.65),(-1.95,.02,-3.65),.028,bronze)
rod('balance pointer',(-2.75,.06,-3.65),(-2.75,.48,-3.65),.012,blued)
for x in [-3.42,-2.08]:
 for s in [-1,1]:rod('fine pan suspension',(x,.02,-3.65),(x+s*.22,-.74,-3.65),.006,bronze)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=1,location=xyz((x,-.75,-3.65)))
 o=bpy.context.object;o.name='concave weighing pan';o.scale=(.3,.3,.045);finish(o,bronze)
for i in range(5):
 disc('gram weight',.05+i*.007,.08+i*.025,(-3.25+i*.18,-1.18,-3.36),bronze)
text('balance maker plate','H. HOLTZ  ·  ASSAY',(-2.75,-1.21,-3.34),.08,brass)
# Open watch: concentric case, blued screws, two bridges and toothed wheels.
wx,wz=-2.0,-2.5
for radius,h,mat in [(.43,-1.30,edge),(.40,-1.25,bronze),(.35,-1.22,ink)]:disc('open watch case',radius,.035,(wx,h,wz),mat)
for j,(dx,dz,r) in enumerate([(-.13,-.10,.15),(.12,-.02,.12),(.0,.16,.10)]):
 disc('watch gear',r,.018,(wx+dx,-1.18,wz+dz),bronze)
 disc('gear arbor',.025,.027,(wx+dx,-1.16,wz+dz),steel)
 for i in range(24):
  a=i*math.tau/24;o=box('cut gear tooth',(.018,.018,.025),(wx+dx+math.cos(a)*r,-1.18,wz+dz+math.sin(a)*r),bronze,.003);o.rotation_euler.z=a
rod('watch bridge',(wx-.28,-1.13,wz+.04),(wx+.22,-1.13,wz+.08),.025,bronze)
for dx,dz in [(-.28,.04),(.22,.08),(.06,-.2)]:
 disc('blued screw',.027,.014,(wx+dx,-1.09,wz+dz),blued)
 box('screw slot',(.038,.002,.006),(wx+dx,-1.081,wz+dz),ink,.001)
# A set of drafting tools beside the open, illustrated lapidary ledger.
box('folded drawing sheet',(2.1,.013,1.38),(.7,-1.365,-2.65),ivory,.006)
for x in [-.28,.22,.72,1.22,1.68]:rod('drawing ruling',(x,-1.35,-3.16),(x,-1.35,-2.13),.002,blued)
for r in [.15,.28,.44]:
 pts=[(.72+math.cos(i*math.tau/64)*r,-1.35,-2.65+math.sin(i*math.tau/64)*r)for i in range(65)]
 for a,b in zip(pts,pts[1:]):rod('brilliant cut diagram',a,b,.002,blued)
for i in range(16):
 a=i*math.tau/16;rod('facet ray',(.72+math.cos(a)*.15,-1.349,-2.65+math.sin(a)*.15),(.72+math.cos(a+.12)*.44,-1.349,-2.65+math.sin(a+.12)*.44),.002,blued)
text('drawing heading','STUDIES IN BRILLIANCE',(.72,-1.345,-3.22),.10,blued)
text('drawing date','No. 04  /  October 1905',(.72,-1.345,-2.10),.065,blued)
rod('pencil body',(1.9,-1.25,-2.85),(1.37,-1.25,-1.7),.027,walnut)
rod('pencil lead',(1.37,-1.25,-1.7),(1.32,-1.25,-1.59),.012,ink)
# An old drawplate, copper wire and tiny unfinished findings, naturally offset.
box('steel drawplate',(1.45,.065,.42),(-.65,-1.30,-3.95),steel,.025)
for i in range(10):
 disc('drawplate dark drilled seat',.015+.006*i,.002,(-1.22+i*.13,-1.265,-3.95),ink)
for i in range(5):
 bpy.ops.mesh.primitive_torus_add(major_radius=.16+i*.013,minor_radius=.008,major_segments=64,minor_segments=8,location=xyz((2.3,-1.32+i*.014,-1.8)))
 finish(bpy.context.object,bronze)
# Mineral specimens: hexagonal prisms in a timber-lined glass specimen case.
caseX,caseZ=2.65,-3.55
box('mineral display plinth',(1.65,.15,1.10),(caseX,-1.27,caseZ),walnut,.05)
box('dark specimen velvet',(1.52,.025,.98),(caseX,-1.17,caseZ),linen,.025)
mineral=material('museum beryl','507d76',.21,.12)
for i in range(9):
 x=caseX+random.uniform(-.55,.55);z=caseZ+random.uniform(-.3,.3);h=random.uniform(.25,.68);r=random.uniform(.07,.13)
 bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,radius2=r,depth=h,location=xyz((x,-1.15+h/2,z)));finish(bpy.context.object,mineral)
 bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=r,radius2=0,depth=r*1.4,location=xyz((x,-1.15+h+r*.7,z)));finish(bpy.context.object,mineral)
text('specimen catalogue','BERYL   /   BRAZIL',(caseX,-1.15,caseZ+.48),.085,brass)
# A jeweler's small brush, raw nuggets and a half-open envelope.
for i in range(9):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.055+random.random()*.04,location=xyz((3.10+random.uniform(-.3,.3),-1.30,-3.95+random.uniform(-.2,.2))))
 o=bpy.context.object;o.scale=(1,.6,.85);finish(o,bronze)
box('cream correspondence',(1.2,.014,.72),(-.3,-1.36,-4.9),ivory,.005)
text('letter letterhead','HOLTZ & CO.  /  LAPIDARY',(-.3,-1.345,-5.1),.065,blued)
# Sparse, legible museum labels replace anonymous empty shelves.
for x,y,body in [(6.0,.15,'MINERALOGY'),(7.4,1.70,'GEMS & CRYSTALS'),(6.4,3.3,'THE ART OF THE GOLDSMITH')]:
 text('shelf catalogue',body,(x,y+.20,back+1.09),.075,brass,wall=True)
# A pair of botanical/framed specimen engravings flanks the window.
for x,y,title in [(-9.35,2.8,'TOURMALINE'),(10.3,2.9,'CRYSTAL SYSTEMS')]:
 box('engraving walnut frame',(1.45,1.95,.10),(x,y,back+.36),walnut,.025)
 box('engraving rag paper',(1.28,1.77,.018),(x,y,back+.43),ivory,.003)
 for dx,dy in [(-.25,-.25),(.05,.1),(.3,-.1)]:
  rod('engraved crystal edge',(x+dx,y+dy-.4,back+.445),(x+dx,y+dy+.35,back+.445),.006,blued)
  rod('engraved crystal cap',(x+dx,y+dy+.35,back+.445),(x+dx+.13,y+dy+.48,back+.445),.005,blued)
 text('engraving title',title,(x,y-.72,back+.449),.085,blued,wall=True)
# Photographed CC0 props retain their complete original2K PBR maps in a separate
# export. They cast shadows into the architectural bake but never get flattened.
from mathutils import Matrix
external=[]
def imported(asset,height,p,yaw=0):
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'workbench/assets/study-props'/asset/'model.gltf'))
 ms=[o for o in set(bpy.data.objects)-before if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in ms:o.select_set(True)
 bpy.context.view_layer.objects.active=ms[0];bpy.ops.object.join();o=bpy.context.object
 saved=o.matrix_world.copy();o.parent=None;o.matrix_world=saved
 o.rotation_euler.z+=yaw;bpy.context.view_layer.update()
 coords=[o.matrix_world@Vector(c)for c in o.bound_box];lo=Vector([min(c[i]for c in coords)for i in range(3)]);hi=Vector([max(c[i]for c in coords)for i in range(3)])
 scale=height/(hi.z-lo.z);base=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 o.matrix_world=Matrix.Translation(Vector(xyz(p))-base*scale)@Matrix.Scale(scale,4)@o.matrix_world
 bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 o.name=asset;external.append(o)
imported('vintage_grandfather_clock_01',8.2,(-.95,-5,-7.05))
imported('lambis_shell',.63,(5.7,1.72,-6.68),-.25)
imported('brass_vase_03',1.05,(-3.05,.51,-7.37),.25)
