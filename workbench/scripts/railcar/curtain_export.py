"""Patch an existing exact export after curtain_repair.apply().
Usage: bundled-python curtain_export.py /absolute/evidence-directory
Requires untouched before.glb, repair.json and repaired source.blend.
Changes only valance vertices/normals and removes their internal cap indices;
run the targeted irradiance rebake before shipping.
"""
import sys
import struct,json,hashlib
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[3];out=Path(sys.argv[1]).resolve();p=root/'workbench/assets/railcar/export/railcar-architecture.glb';original=(out/'before.glb').read_bytes()
manifest_path=root/'workbench/assets/railcar/export/railcar-manifest.json'
existing=json.loads(manifest_path.read_text())
allowed={hashlib.sha256(original).hexdigest(), existing.get('geometryRepair',{}).get('geometrySha256')}
if hashlib.sha256(p.read_bytes()).hexdigest() not in allowed:
 raise ValueError('Current geometry differs from the documented baseline/repair; preserve unrelated edits')
n=struct.unpack_from('<I',original,12)[0];j=json.loads(original[20:20+n]);binary=bytearray(original[28+n:]);report=json.loads((out/'repair.json').read_text())
def arr(ai):
 a=j['accessors'][ai];v=j['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];size={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']]
 assert not v.get('byteStride');return np.frombuffer(binary,dtype=dtype,count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],size)
pr=next(m for m in j['meshes'] if 'oxblood velvet' in m['name'])['primitives'][0];pos=arr(pr['attributes']['POSITION']);local=arr(pr['attributes']['_LJ_OBJ']);normal=arr(pr['attributes']['NORMAL']);localnormal=arr(pr['attributes']['_LJ_ONRM']);indices=arr(pr['indices']).reshape(-1,3);points=pos[indices].copy();owners={};counts={};remove=np.zeros(len(indices),bool)
for item in report:
 lo,hi=item['beforeBounds'][0];cx,cy,cz=item['center'];eps=.00005;k=int(item['name'][-1]);x=points[:,:,0];r=np.sqrt((points[:,:,1]-cz)**2+(points[:,:,2]+cy)**2)
 mask=np.all((abs(x-lo)<eps)|(abs(x-hi)<eps),axis=1)&np.all(abs(r-item['oldRadius'])<eps,axis=1)
 assert mask.sum()==92,(item['name'],mask.sum())
 ids=np.unique(indices[mask]);caps=np.all(abs(x-lo)<eps,axis=1) if k else np.zeros(len(indices),bool)
 if k<2:caps|=np.all(abs(x-hi)<eps,axis=1)
 remove|=mask&caps
 for idx in ids:
  assert int(idx) not in owners;owners[int(idx)]=item['name']
 newlo,newhi=item['afterX'];pos[ids,0]=np.where(abs(pos[ids,0]-lo)<eps,newlo,newhi);local[ids,0]=pos[ids,0]
 barrel=mask & (np.ptp(x,axis=1)>eps);bids=np.unique(indices[barrel]);nr=pos[bids].copy();nr[:,0]=0;nr[:,1]-=cz;nr[:,2]+=cy;nr/=np.linalg.norm(nr,axis=1)[:,None];normal[bids]=nr;localnormal[bids]=nr[:,[0,2,1]]*np.array([1,-1,1]);
 counts[item['name']]={'trianglesBefore':int(mask.sum()),'capsRemoved':int((mask&caps).sum()),'vertices':len(ids)}
kept=indices[~remove].copy().reshape(-1);indices.reshape(-1)[:len(kept)]=kept;j['accessors'][pr['indices']]['count']=len(kept)
a=j['accessors'][pr['attributes']['POSITION']];a['min']=pos.min(0).tolist();a['max']=pos.max(0).tolist()
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
result=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;p.write_bytes(result)
evidence={'beforeSha256':hashlib.sha256(original).hexdigest(),'afterSha256':hashlib.sha256(result).hexdigest(),'sourceSha256':hashlib.sha256((out/'source.blend').read_bytes()).hexdigest(),'modifiedVertices':len(owners),'removedInternalCapTriangles':int(remove.sum()),'objects':counts,'preserved':'outer bounds, LightUVs, all non-valance geometry and textures; radial barrel normals repaired','bake':'Targeted valance irradiance rebake required; preserve all other lighting'}
(out/'export-repair.json').write_text(json.dumps(evidence,indent=2))
m=root/'workbench/assets/railcar/export/railcar-manifest.json';manifest=json.loads(m.read_text());manifest['geometryRepair']={'kind':'continuous curtain valances','sourceSha256':evidence['sourceSha256'],'geometrySha256':evidence['afterSha256'],'removedInternalCapTriangles':evidence['removedInternalCapTriangles'],'lightingBakeUnchanged':True};m.write_text(json.dumps(manifest,indent=2)+'\n');print(evidence['removedInternalCapTriangles'])
