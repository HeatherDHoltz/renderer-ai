"""Transfer saved rigid layout edits onto the approved surface UVs, on a stage.

Run through Blender MCP on a disposable authored copy. Source .blend files are
read-only. Match evaluated source vertices/materials; reject shared transform
ownership and missing changed geometry rather than silently keeping old layout.
"""
import bpy,json,struct,hashlib,shutil
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix,Quaternion
from mathutils.kdtree import KDTree
from rebake_subset import _glb
ROOT=Path(__file__).resolve().parents[3]

def write_glb(path,doc,arrays):
 # Remove emptied meshes/accessors after deleting replaced assemblies.
 used_meshes=[]
 for i,mesh in enumerate(doc['meshes']):
  mesh['primitives']=[pr for pr in mesh['primitives'] if arrays[pr['indices']].size]
  if mesh['primitives']:used_meshes.append(i)
 remap_mesh={old:new for new,old in enumerate(used_meshes)}
 for node in doc['nodes']:
  if 'mesh' in node:
   if node['mesh'] not in remap_mesh:node.pop('mesh')
   else:node['mesh']=remap_mesh[node['mesh']]
 doc['meshes']=[doc['meshes'][i]for i in used_meshes]
 used=sorted({i for mesh in doc['meshes']for pr in mesh['primitives']for i in [pr['indices'],*pr['attributes'].values()]})
 remap_access={old:new for new,old in enumerate(used)}
 for mesh in doc['meshes']:
  for pr in mesh['primitives']:
   pr['indices']=remap_access[pr['indices']];pr['attributes']={k:remap_access[v]for k,v in pr['attributes'].items()}
 payload=bytearray(); views=[]; access=[]
 for i in used:
  a=doc['accessors'][i]
  v=np.ascontiguousarray(arrays[i]);payload+=b'\0'*((-len(payload))%4)
  views.append({'buffer':0,'byteOffset':len(payload),'byteLength':v.nbytes});payload+=v.tobytes()
  d={k:x for k,x in a.items() if k not in ('bufferView','byteOffset','sparse','min','max')};d.update(bufferView=len(views)-1,count=len(v))
  if 'min' in a:d['min']=v.min(axis=0).tolist() if len(v) else [0]*v.shape[1]
  if 'max' in a:d['max']=v.max(axis=0).tolist() if len(v) else [0]*v.shape[1]
  access.append(d)
 doc['bufferViews']=views;doc['accessors']=access;doc['buffers']=[{'byteLength':len(payload)}]
 j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);payload+=b'\0'*((-len(payload))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(payload),0x004e4942)+payload)

def run(previous,current,base,stage,evidence,remove_names=()):
 previous,current,base,stage,evidence=map(Path,(previous,current,base,stage,evidence));stage.mkdir(parents=True,exist_ok=True);shutil.copytree(base,stage,dirs_exist_ok=True)
 a=json.loads((evidence/'previous-scene.json').read_text());b=json.loads((evidence/'current-scene.json').read_text());changes=json.loads((evidence/'changes.json').read_text())
 oldmeta=json.loads((base/'railcar-interactions.json').read_text());remove_names=set(remove_names)
 wanted=set(remove_names)|set(oldmeta['objects'])|set(changes['deleted'])|{r['name'] for r in changes['changed']}|{n for n in a if n.startswith('safe ')}
 wanted={n for n in wanted if n in a and a[n]['type'] in ('MESH','CURVE','FONT')}
 bpy.ops.wm.open_mainfile(filepath=str(previous));dg=bpy.context.evaluated_depsgraph_get();sources={}
 for name in wanted:
  o=bpy.data.objects[name];ev=o.evaluated_get(dg);me=ev.to_mesh();pts=np.array([ev.matrix_world@v.co for v in me.vertices]);tree=KDTree(len(pts))
  for i,p in enumerate(pts):tree.insert(Vector(p),i)
  tree.balance();sources[name]={'tree':tree,'lo':pts.min(axis=0)-.00006,'hi':pts.max(axis=0)+.00006,'materials':{m.name for m in me.materials if m}};ev.to_mesh_clear()
 counts={n:0 for n in wanted};parts=[];report=[]
 for filename in ('railcar-desk.glb','railcar-furnishings.glb','railcar-architecture.glb','railcar-glass.glb','railcar-paintings.glb','railcar-windows.glb'):
  doc,arr=_glb(base/filename);arrays={i:arr(i) for i in range(len(doc['accessors']))};group=filename[8:-4];changed=0;deleted=0
  if group in ('glass','paintings','windows'):
   basis=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
   parents={child:i for i,node in enumerate(doc['nodes']) for child in node.get('children',[])}
   def local(n):
    if 'matrix' in n:return Matrix(np.array(n['matrix']).reshape(4,4).T.tolist())
    q=n.get('rotation',[0,0,0,1]);return Matrix.Translation(Vector(n.get('translation',[0,0,0])))@Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()@Matrix.Diagonal(Vector([*n.get('scale',[1,1,1]),1]))
   worlds={}
   def world(i):
    if i not in worlds:worlds[i]=(world(parents[i]) if i in parents else Matrix.Identity(4))@local(doc['nodes'][i])
    return worlds[i]
   for i in range(len(doc['nodes'])):world(i)
   desired={i:w.copy() for i,w in worlds.items()}
   for i,node in enumerate(doc['nodes']):
    name=node['name']
    if name not in wanted:continue
    if 'mesh' in node:counts[name]+=sum(doc['accessors'][p['indices']]['count']//3 for p in doc['meshes'][node['mesh']]['primitives'])
    if name not in b or name in remove_names:node.pop('mesh',None);deleted+=1
    elif a[name]['matrix']!=b[name]['matrix']:
     desired[i]=basis@Matrix(b[name]['matrix'])@Matrix(a[name]['matrix']).inverted()@basis.inverted()@worlds[i];changed+=1
   if changed or deleted:
    for i,node in enumerate(doc['nodes']):
     lm=(desired[parents[i]].inverted() if i in parents else Matrix.Identity(4))@desired[i]
     for k in ('rotation','translation','scale'):node.pop(k,None)
     node['matrix']=[lm[row][col] for col in range(4) for row in range(4)]
    raw=(base/filename).read_bytes();jl=struct.unpack_from('<I',raw,12)[0];blob=raw[20+jl:];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    (stage/filename).write_bytes(struct.pack('<III',0x46546c67,2,20+len(j)+len(blob))+struct.pack('<II',len(j),0x4e4f534a)+j+blob)
   report.append({'file':filename,'movedObjects':changed,'deletedObjects':deleted});continue
  for node in doc['nodes']:
   if 'mesh' not in node:continue
   if any(k in node for k in ('matrix','translation','rotation','scale')):raise ValueError('Expected flattened world coordinates: '+filename)
   material=node['name'].split('|',1)[-1]
   for pi,pr in enumerate(doc['meshes'][node['mesh']]['primitives']):
    at=pr['attributes'];pos=arrays[at['POSITION']];src=pos[:,[0,2,1]]*[1,-1,1];idx=arrays[pr['indices']].reshape(-1,3);owner={};remove=set();transforms={}
    for name,d in sorted(sources.items(),key=lambda row:(a[row[0]]['type']!='FONT',row[0])):
     if material not in d['materials']:continue
     candidates=np.flatnonzero(np.all(src>=d['lo'],axis=1)&np.all(src<=d['hi'],axis=1));found=np.zeros(len(pos),dtype=bool)
     for vi in candidates:found[vi]=d['tree'].find(Vector(src[vi]))[2]<.00006
     tris=np.flatnonzero(found[idx].all(axis=1));tris=np.array([int(i) for i in tris if int(i) not in owner],dtype=int)
     if not len(tris):continue
     counts[name]+=len(tris)
     for i in tris:owner[int(i)]=name
     if name not in b or name in remove_names:remove.update(map(int,tris));continue
     if name in oldmeta['objects'] or name.startswith('safe '):parts.append({'object':name,'group':group,'material':material,'primitive':pi,'triangles':list(map(int,tris))})
     if a[name]['matrix']==b[name]['matrix']:continue
     delta=np.array(b[name]['matrix'])@np.linalg.inv(np.array(a[name]['matrix']))
     for vi in np.unique(idx[tris]):
      if int(vi) in transforms and not np.allclose(transforms[int(vi)],delta,atol=1e-8):raise ValueError('Conflicting shared vertex '+name)
      transforms[int(vi)]=delta
    for vi,delta in transforms.items():
     xyz=(delta@np.append(src[vi],1))[:3];pos[vi]=xyz[[0,2,1]]*[1,1,-1]
     if 'NORMAL' in at:
      normal=arrays[at['NORMAL']][vi][[0,2,1]]*[1,-1,1];normal=np.linalg.inv(delta[:3,:3]).T@normal;normal/=np.linalg.norm(normal);arrays[at['NORMAL']][vi]=normal[[0,2,1]]*[1,1,-1]
    changed+=len(transforms);deleted+=len(remove)
    keep=np.array([i for i in range(len(idx)) if i not in remove],dtype=int);arrays[pr['indices']]=idx[keep].reshape(-1,1)
    if remove:
     remap={int(old):new for new,old in enumerate(keep)}
     for part in parts:
      if part['group']==group and part['material']==material and part['primitive']==pi:part['triangles']=[remap[i] for i in part['triangles'] if i in remap]
  if changed or deleted:write_glb(stage/filename,doc,arrays)
  report.append({'file':filename,'movedVertices':changed,'deletedTriangles':deleted})
 # Metadata uses the new evaluated bounds, including text; no objects are added.
 bpy.ops.wm.open_mainfile(filepath=str(current));dg=bpy.context.evaluated_depsgraph_get();details={}
 def app(p):return [float(p[0]),float(p[2]),-float(p[1])]
 for name in set(oldmeta['objects'])|{n for n in b if n.startswith('safe ')}:
  if name not in bpy.data.objects or name in remove_names:continue
  o=bpy.data.objects[name]
  if o.type not in ('MESH','CURVE','FONT'):continue
  ev=o.evaluated_get(dg);me=ev.to_mesh();pts=np.array([ev.matrix_world@v.co for v in me.vertices]);lo=pts.min(axis=0);hi=pts.max(axis=0)
  if not len(pts):continue
  details[name]={'min':app((lo[0],hi[1],lo[2])),'max':app((hi[0],lo[1],hi[2])),'center':app((lo+hi)/2),'axis':app((o.matrix_world.to_3x3()@Vector((0,0,1))).normalized()),'moving':oldmeta['objects'].get(name,{}).get('moving',name.startswith('safe '))};ev.to_mesh_clear()
 shell_static=('safe cornice','safe plinth')
 for n,d in details.items():
  if n.startswith(('safe Victorian cornice','safe Victorian crest','safe hinge barrel','safe hinge cap')) or n in shell_static:d['moving']=False
 oldmeta.update(objects=details,parts=parts,geometryHashes={g:hashlib.sha256((stage/f'railcar-{g}.glb').read_bytes()).hexdigest() for g in ('desk','furnishings')})
 oldmeta['fixtures']=[{'name':o.name,'position':app(o.matrix_world.translation),'color':list(o.data.color),'power':float(o.data.energy)} for o in bpy.context.scene.objects if o.type=='LIGHT' and o.data.type=='POINT' and not o.hide_render and ('flame' in o.name or 'visible bulb' in o.name)]
 oldmeta['lamp']=app(bpy.data.objects['student lamp flame'].matrix_world.translation)
 (stage/'railcar-interactions.json').write_text(json.dumps(oldmeta,separators=(',',':')))
 unmatched=[n for n in wanted if (n not in b or n in remove_names or a[n]['matrix']!=b[n]['matrix']) and not a[n]['hidden'] and not counts[n]]
 # Empty control objects never entered wanted. Dressing is exported separately.
 unmatched=[n for n in unmatched if not any(c in ('interactive dressing',) for c in a[n]['collections'])]
 result={'files':report,'matches':counts,'unmatched':unmatched};(evidence/'layout-transfer.json').write_text(json.dumps(result,indent=2))
 if unmatched:raise ValueError('Changed surfaces absent from original export: '+repr(unmatched))
 return result
