"""Deliver 1K JPEG copies of the gramophone's 4K source maps; no mesh reduction."""
import json,struct,io,hashlib
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'output/railcar/gramophone-replacement'
b=(OUT/'props-full.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binstart=20+n;raw=b[binstart+8:binstart+8+struct.unpack_from('<I',b,binstart)[0]]
images={i['bufferView']:i for i in d.get('images',[])};chunks=[];offset=0;rows=[]
for k,v in enumerate(d['bufferViews']):
 data=raw[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 if k in images:
  im=Image.open(io.BytesIO(data));size=im.size;im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  bio=io.BytesIO();im.convert('RGB').save(bio,format='JPEG',quality=92,subsampling=0,optimize=True);data=bio.getvalue();images[k]['mimeType']='image/jpeg'
  rows.append({'name':images[k].get('name'),'sourceSize':size,'deliverySize':im.size,'bytes':len(data)})
 v['byteOffset']=offset;v['byteLength']=len(data);data+=b'\0'*((-len(data))%4);chunks.append(data);offset+=len(data)
payload=b''.join(chunks);d['buffers']=[{'byteLength':len(payload)}];j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
result=struct.pack('<III',0x46546c67,2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(payload),0x004e4942)+payload
path=ROOT/'workbench/assets/railcar/export/railcar-interactive-props.glb';path.write_bytes(result)
(OUT/'delivery.json').write_text(json.dumps({'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'images':rows,'geometry':'Exact exported geometry; 8748 creator triangles preserved, plus existing cigar/ashtray.'},indent=2))
print(json.dumps({'bytes':len(result),'images':rows}))
