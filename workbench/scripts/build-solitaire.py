"""Author and fuse a comfort-fit shank and cathedral setting into one solid.
The old runtime tubes and rectangular shank caps are replaced, not overlaid.
Run with official Blender 4.5: blender -b --python workbench/scripts/build-solitaire.py.
"""
import bpy,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# A new comfort-fit sweep avoids the cut/capped low-poly source's dents.
# Online candidates and the previous CC0 band are documented as research;
# this replacement geometry is authored here, with continuous smooth fillets.
v=[];faces=[];steps=256;profile=32
for i in range(steps+1):
 theta=math.pi/2+.62+(math.tau-1.24)*i/steps
 width=.105+.035*max(0,math.sin(theta))**3
 for j in range(profile):
  a=j*math.tau/profile
  radial=math.copysign(abs(math.cos(a))**.75,math.cos(a))*.085
  z=math.copysign(abs(math.sin(a))**.75,math.sin(a))*width
  v.append((math.cos(theta)*(.88+radial),-z,math.sin(theta)*(.88+radial)))
for i in range(steps):
 for j in range(profile):
  a=i*profile+j;b=i*profile+(j+1)%profile;c=a+profile;d=b+profile
  faces.extend([(a,c,b),(b,c,d)])
for row,reverse in [(0,True),(steps,False)]:
 center=tuple(sum(v[row*profile+j][k]for j in range(profile))/profile for k in range(3));ci=len(v);v.append(center)
 for j in range(profile):
  a=row*profile+j;b=row*profile+(j+1)%profile
  faces.append((ci,b,a)if reverse else(ci,a,b))
mesh=bpy.data.meshes.new('authored comfort fit shank');mesh.from_pydata(v,[],faces);o=bpy.data.objects.new('Continuous cathedral solitaire',mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
mod=o.modifiers.new('smooth comfort-fit band','SUBSURF');mod.levels=1;bpy.ops.object.modifier_apply(modifier=mod.name)
parts=[o]
def tube(points,r):
 curve=bpy.data.curves.new('sculpted cathedral','CURVE');curve.dimensions='3D';curve.resolution_u=32;curve.bevel_depth=r;curve.bevel_resolution=6;curve.use_fill_caps=True
 sp=curve.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for bp,p in zip(sp.bezier_points,points):bp.co=(p[0],-p[2],p[1]);bp.handle_left_type=bp.handle_right_type='AUTO'
 ob=bpy.data.objects.new('setting sweep',curve);bpy.context.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob;bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.ops.object.convert(target='MESH');parts.append(bpy.context.object)
for sx in [-1,1]:
 tube([(sx*.54,.68,0),(sx*.57,.82,0),(sx*.52,.96,0),(sx*.46,1.10,0)],.075)
 for sz in [-1,1]:
  tube([(sx*.54,.72,sz*.04),(sx*.55,.94,sz*.24),(sx*.45,1.17,sz*.42),(sx*.42,1.255,sz*.42),(sx*.405,1.27,sz*.405)],.027)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=.029,location=(sx*.405,-sz*.405,1.27));parts.append(bpy.context.object)
# Fine gallery hoop connects the claws below the girdle, with genuine clearance.
tube([(math.cos(i*math.tau/16)*.60,1.16,math.sin(i*math.tau/16)*.60)for i in range(17)],.028)
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:ob.select_set(True)
bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
rem=o.modifiers.new('continuous cast surface','REMESH');rem.mode='VOXEL';rem.voxel_size=.007;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
sm=o.modifiers.new('polished fillets','SMOOTH');sm.factor=.7;sm.iterations=20;bpy.ops.object.modifier_apply(modifier=sm.name)
sub=o.modifiers.new('macro surface','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
# Export shared-vertex triangles so the runtime keeps smooth normals, including
# across the brushed texture's UV seam. Y-up is encoded directly in this OBJ.
def export(obj,name):
 deps=bpy.context.evaluated_depsgraph_get();g=obj.evaluated_get(deps).to_mesh();g.calc_loop_triangles()
 lines=['# Project-authored comfort-fit cathedral setting; see ring-provenance.json']
 lines += ['v %.8f %.8f %.8f'%(p.co.x,p.co.z,-p.co.y)for p in g.vertices]
 lines += ['f '+' '.join(str(i+1)for i in tri.vertices)for tri in g.loop_triangles]
 (ROOT/'workbench/assets'/name).write_text('\n'.join(lines)+'\n');print(name,len(g.vertices),len(g.loop_triangles),flush=True)
export(o,'solitaire-setting.obj')
# Small collection rings share a smoother lower tessellation, not a broken band.
d=o.modifiers.new('collection tessellation','DECIMATE');d.ratio=.035;bpy.ops.object.modifier_apply(modifier=d.name)
export(o,'solitaire-sample.obj')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'output/fidelity-research/solitaire.blend'))
