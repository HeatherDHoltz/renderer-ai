"""Lossless full-resolution image packing; preserve earlier gramophone delivery.
Use EXT_texture_webp only when decoded pixels match exactly and bytes decrease.
No geometry changes. Original source textures remain packed in authored .blend.
"""
import json,struct,io,hashlib
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'output/railcar/heather-sync'
def read(path):
 raw=Path(path).read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);return doc,raw[28+n:]
old,oldbin=read(ROOT/'workbench/assets/railcar/export/railcar-interactive-props.glb');oldimages={}
for im in old.get('images',[]):
 v=old['bufferViews'][im['bufferView']];oldimages[im.get('name')]=(im['mimeType'],oldbin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
doc,binary=read(OUT/'props-full.glb');rigdhi=set()
cache=OUT/'image-pack-cache';cache.mkdir(exist_ok=True)
previous_path=OUT/'export/railcar-interactive-props.glb'
previous,previous_binary=read(previous_path) if previous_path.exists() else ({},b'')
for material in doc.get('materials',[]):
 if material.get('name','').startswith('Rigdhi '):
  def collect(value):
   if isinstance(value,dict):
    for k,v in value.items():
     if k.endswith('Texture') and isinstance(v,dict) and 'index' in v:rigdhi.add(doc['textures'][v['index']]['source'])
     else:collect(v)
   elif isinstance(value,list):
    for v in value:collect(v)
  collect(material)
images={im['bufferView']:(i,im)for i,im in enumerate(doc.get('images',[]))};payload=bytearray();records=[];webp=set()
for i,v in enumerate(doc['bufferViews']):
 data=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 if i in images:
  image_index,im=images[i];sourcehash=hashlib.sha256(data).hexdigest();original=Image.open(io.BytesIO(data));size=original.size;method='original'
  if image_index in rigdhi and im.get('name') in oldimages:
   im['mimeType'],data=oldimages[im['name']];method='existing approved gramophone delivery'
  else:
   cached=cache/(sourcehash+'.webp')
   if not cached.exists() and image_index<len(previous.get('images',[])):
    old=previous['images'][image_index]
    if old['mimeType']=='image/webp':
     view=previous['bufferViews'][old['bufferView']];oldbytes=previous_binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];oldimage=Image.open(io.BytesIO(oldbytes)).convert('RGBA')
     if oldimage.size==original.size and oldimage.tobytes()==original.convert('RGBA').tobytes():cached.write_bytes(oldbytes)
   if cached.exists():candidate=cached.read_bytes()
   else:
    target=io.BytesIO();original.convert('RGBA').save(target,format='WEBP',lossless=True,quality=100,method=6,exact=True);candidate=target.getvalue();cached.write_bytes(candidate)
   restored=Image.open(io.BytesIO(candidate)).convert('RGBA')
   if restored.tobytes()!=original.convert('RGBA').tobytes():raise ValueError('Lossless image changed pixels')
   if len(candidate)<len(data):data=candidate;im['mimeType']='image/webp';webp.add(image_index);method='pixel-exact lossless WebP'
  records.append({'sourceSha256':sourcehash,'name':im.get('name'),'size':Image.open(io.BytesIO(data)).size,'sourceSize':size,'method':method,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 payload+=b'\0'*((-len(payload))%4);v['byteOffset']=len(payload);v['byteLength']=len(data);payload+=data
for tex in doc.get('textures',[]):
 if tex.get('source') in webp:
  tex.setdefault('extensions',{})['EXT_texture_webp']={'source':tex.pop('source')}
if webp:
 for key in ('extensionsUsed','extensionsRequired'):
  doc[key]=sorted(set(doc.get(key,[]))|{'EXT_texture_webp'})
doc['buffers']=[{'byteLength':len(payload)}];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);payload+=b'\0'*((-len(payload))%4);result=struct.pack('<III',0x46546c67,2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(payload),0x004e4942)+payload
(OUT/'export/railcar-interactive-props.glb').write_bytes(result);(OUT/'props-packing.json').write_text(json.dumps({'bytes':len(result),'images':records,'geometry':'all non-image buffer views retained byte-exact'},indent=2));print(json.dumps({'bytes':len(result),'images':records}))
