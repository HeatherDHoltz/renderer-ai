import bpy,gzip,struct,json,hashlib,time
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2];src=root/'workbench/assets/solitaire-setting.mesh.gz';out=root/'output/startup-fast';out.mkdir(parents=True,exist_ok=True);t=time.time();raw=gzip.decompress(src.read_bytes());magic,nv,ni=struct.unpack_from('<III',raw);assert magic==0x31474e52
v=np.frombuffer(raw,dtype='<f4',count=nv*3,offset=12).reshape(-1,3);f=np.frombuffer(raw,dtype='<u4',count=ni,offset=12+nv*12).reshape(-1,3)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
m=bpy.data.meshes.new('delivery ring');m.from_pydata(v.tolist(),[],f.tolist());m.update();o=bpy.data.objects.new('delivery ring',m);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
d=o.modifiers.new('Startup silhouette LOD','DECIMATE');d.ratio=.125;bpy.ops.object.modifier_apply(modifier=d.name)
m=o.data;m.calc_loop_triangles();vs=np.empty(len(m.vertices)*3,dtype='<f4');m.vertices.foreach_get('co',vs);ts=np.empty(len(m.loop_triangles)*3,dtype='<u4');m.loop_triangles.foreach_get('vertices',ts)
data=struct.pack('<III',magic,len(m.vertices),len(ts))+vs.tobytes()+ts.tobytes();target=out/'setting-low.mesh.gz';target.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
# Delivery mesh only: audit topology and envelope; do not alter the authored room.
import bmesh
bm=bmesh.new();bm.from_mesh(m);bad=sum(not e.is_manifold for e in bm.edges);bm.free()
a=v; b=vs.reshape(-1,3);report={'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'lodSHA256':hashlib.sha256(target.read_bytes()).hexdigest(),'beforeTriangles':ni//3,'afterTriangles':len(ts)//3,'nonManifoldEdges':bad,'sourceBounds':[a.min(0).tolist(),a.max(0).tolist()],'lodBounds':[b.min(0).tolist(),b.max(0).tolist()],'compressedBytes':target.stat().st_size,'seconds':time.time()-t};assert bad==0,report
(out/'ring-lod.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
