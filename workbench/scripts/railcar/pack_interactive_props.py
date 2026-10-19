"""Remove embedded copies of wood maps already supplied by the room manifest.
Keeps every geometry buffer view byte-identical. Runtime rebuilds that material
from the same existing full-resolution room recipe; no texture downsampling.
"""
import json,struct,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];p=ROOT/'workbench/assets/railcar/export/railcar-interactive-props.glb';raw=p.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:];out=bytearray()
image_views={i['bufferView'] for i in doc.get('images',[]) if 'bufferView' in i};remap={};views=[]
for i,v in enumerate(doc['bufferViews']):
 if i in image_views:continue
 out+=b'\0'*((-len(out))%4);old=v.get('byteOffset',0);piece=binary[old:old+v['byteLength']];remap[i]=len(views);views.append({**v,'byteOffset':len(out)});out+=piece
for a in doc['accessors']:a['bufferView']=remap[a['bufferView']]
for material in doc['materials']:
 if material['name'].startswith('gramophone rosewood'):
  for key in ('normalTexture','occlusionTexture','emissiveTexture'):material.pop(key,None)
  pbr=material.get('pbrMetallicRoughness',{});pbr.pop('baseColorTexture',None);pbr.pop('metallicRoughnessTexture',None)
for key in ('images','textures','samplers'):doc.pop(key,None)
doc['bufferViews']=views;doc['buffers'][0]['byteLength']=len(out)
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);out+=b'\0'*((-len(out))%4)
packed=struct.pack('<III',0x46546c67,2,28+len(js)+len(out))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(out),0x004e4942)+out
p.write_bytes(packed)
(ROOT/'output/railcar/interactions/props-pack.json').write_text(json.dumps({'originalBytes':len(raw),'packedBytes':len(packed),'geometryBufferViewsPreserved':len(views),'removedDuplicateImageViews':len(image_views),'sha256':hashlib.sha256(packed).hexdigest()},indent=2))
