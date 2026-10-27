"""Build an explicitly lossy, staged delivery copy. Never modify authoring assets.

After build (and optional sparse RGBM packing):
  python3 scripts/prepare-fast-delivery.py --assets-dir dist/assets --ring-lod ...
Requires NumPy/Pillow. Higher detail remains on demand, not on the startup path.
"""
import argparse, copy, gzip, hashlib, io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('--assets-dir',type=Path,required=True)
p.add_argument('--ring-lod',type=Path,required=True)
p.add_argument('--evidence',type=Path,required=True)
a=p.parse_args(); assets=a.assets_dir.resolve()
authoring=Path(__file__).resolve().parents[1]/'assets'
if assets==authoring.resolve() or not (assets/'railcar/export/railcar-manifest.json').exists():
 p.error('Supply a built delivery copy, never authoring assets')
if (assets/'delivery-details.json').exists() and json.loads((assets/'delivery-details.json').read_text()).get('version')==1:
 p.error('Delivery already prepared: rebuild from originals first')
base=assets/'railcar/export';manifest=json.loads((base/'railcar-manifest.json').read_text())
entries={};report=[];usage={}
def sha(b):return hashlib.sha256(b).hexdigest()
def strings(v):
 if isinstance(v,str):yield v
 elif isinstance(v,dict):
  for x in v.values():yield from strings(x)
 elif isinstance(v,list):
  for x in v:yield from strings(x)
for group,info in manifest['groups'].items():
 for f in strings(info['materials']):usage.setdefault(f,set()).add(group)
def key(path):return str(path.relative_to(assets))
def detail(path,data,groups,kind):
 target=base/('detail-'+sha(key(path).encode())[:12]+path.suffix)
 # Keep the complete .f16.gz extension for worker/transport detection.
 if str(path).endswith('.f16.gz'):target=target.with_suffix('.f16.gz')
 target.write_bytes(data);entries[key(path)]={'file':key(target),'groups':sorted(groups),'kind':kind}
 return target
def resized(im,limit):
 w,h=im.size;s=min(1,limit/max(w,h));return im.resize((max(1,round(w*s)),max(1,round(h*s))),Image.Resampling.LANCZOS) if s<1 else im.copy()
def encode(im,fmt,normal=False):
 out=io.BytesIO()
 if fmt=='JPEG':im.convert('RGB').save(out,format=fmt,quality=85 if normal else 82,subsampling=0 if normal else 2,optimize=True)
 elif fmt=='PNG':im.save(out,format=fmt,optimize=True)
 else:im.save(out,format='WEBP',lossless=normal,quality=84,method=5,exact=True)
 return out.getvalue()
def downsample(array,limit):
 # Lighting is linear radiance. Average radiance, never encoded RGBM channels.
 h,w,c=array.shape;s=min(1,limit/max(w,h));nw,nh=max(1,round(w*s)),max(1,round(h*s))
 if (w,h)==(nw,nh):return array.copy()
 return np.stack([np.asarray(Image.fromarray(array[:,:,i].astype('float32')).resize((nw,nh),Image.Resampling.BOX)) for i in range(c)],axis=-1)
def rgbm_bytes(im,limit):
 x=np.asarray(im.convert('RGBA'),dtype='float32')/255
 radiance=x[:,:,:3]*x[:,:,3:4]
 y=downsample(radiance,limit)
 m=np.maximum(1/255,np.ceil(np.max(y,axis=2,keepdims=True)*255)/255)
 encoded=np.concatenate([np.clip(y/m,0,1),m],axis=2)
 out=io.BytesIO();Image.fromarray(np.rint(encoded*255).astype('uint8')).save(out,format='WEBP',lossless=True,method=5,exact=True)
 return out.getvalue()
def pack_float(array):
 h,w,_=array.shape;bits=np.ascontiguousarray(array.astype('<f2')).view('uint8').reshape(-1,8)
 return gzip.compress(struct.pack('<II',w|0x80000000,h)+bits.T.tobytes(),compresslevel=9,mtime=0)
active=set(usage)
for path in sorted(base.glob('*.f16.gz')):
 if path.name not in active:continue
 old=path.read_bytes();raw=gzip.decompress(old);w,h=struct.unpack_from('<II',raw);shuffle=bool(w&0x80000000);w&=0x7fffffff
 data=np.frombuffer(raw,dtype='uint8',offset=8)
 if shuffle:data=data.reshape(8,-1).T.copy().reshape(-1)
 array=data.view('<f2').reshape(h,w,4).astype('float32');groups=usage[path.name]
 low=pack_float(downsample(array,1024));high=pack_float(downsample(array,2048))
 path.write_bytes(low)
 if len(high)>len(low)*1.1:detail(path,high,groups,'float')
 report.append({'file':key(path),'kind':'linear lighting','before':len(old),'startup':len(low),'detail':len(high),'sourceSize':[w,h],'startupMax':1024,'detailMax':2048})

# RGBM data must be resampled after decoding its multiplier. No JPEG lighting.
rgbm={}
for group,info in manifest['groups'].items():
 for f in [info['light'],info['emit']]:rgbm[f]=({group},1024)
lamp=json.loads((base/'student-lamp-lighting.json').read_text())
for group,r in lamp.items():rgbm[r['file']]=({group},1024)
interactions=json.loads((base/'railcar-interactions.json').read_text())
for r in interactions.get('safeLighting',[])+interactions.get('importedLighting',[]):rgbm[r['file']]=({'furnishings'},1024)
if manifest.get('paintingLighting'):
 for r in json.loads((base/manifest['paintingLighting']).read_text()).values():rgbm[r['file']]=({'architecture'},1024)
for f,(groups,limit) in rgbm.items():
 path=base/f;old=path.read_bytes();im=Image.open(io.BytesIO(old));low=rgbm_bytes(im,limit);path.write_bytes(low)
 report.append({'file':key(path),'kind':'decoded/reencoded RGBM','before':len(old),'startup':len(low)})

# Standalone surface maps; retain a sharper optional tier for focused locations.
surfacePaths=list((base/'tex').glob('*'))+list((assets/'materials').glob('*'))+[assets/'railcar/textures/antique-globe.jpg',base/'railcar-trees-night.webp']
for path in surfacePaths:
 if path.suffix.lower() not in ['.jpg','.jpeg','.png','.webp']:continue
 old=path.read_bytes();im=Image.open(io.BytesIO(old));groups=usage.get(str(path.relative_to(base)) if path.is_relative_to(base) else '',{'desk'}).copy()
 if path.name=='antique-globe.jpg':groups={'furnishings'}
 if path.name=='railcar-trees-night.webp':groups={'architecture'}
 # 1K near the desk, 512 elsewhere; forest atlas retains 2K cell structure.
 limit=2048 if path.name=='railcar-trees-night.webp' else 1024 if 'desk' in groups else 512
 normal=any(v in path.name.lower() for v in ['normal','nor_gl','orm','rough','ao.','mask'])
 fmt={'jpg':'JPEG','jpeg':'JPEG','png':'PNG','webp':'WEBP'}[path.suffix.lower()[1:]]
 low=encode(resized(im,limit),fmt,normal);high=encode(resized(im,2048),fmt,normal)
 path.write_bytes(low)
 if max(im.size)>limit and path.name!='railcar-trees-night.webp':detail(path,high,groups,'image')
 report.append({'file':key(path),'kind':'surface','before':len(old),'startup':len(low),'sourceSize':im.size,'startupMax':limit})

# Extract embedded prop/painting images: keep geometry byte-exact, stream their
# sharper textures independently when their part of the room is inspected.
for filename in ['railcar-interactive-props.glb','railcar-paintings.glb']:
 path=base/filename;raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
 originalAccessors=copy.deepcopy(doc.get('accessors',[]))
 originalViews=copy.deepcopy(doc['bufferViews'])
 imageViews={im['bufferView'] for im in doc.get('images',[]) if 'bufferView' in im};payload=bytearray();viewRemap={};views=[]
 dataImages=set()
 imageGroups={}
 materialGroups={}
 for node in doc.get('nodes',[]):
  if 'mesh' not in node:continue
  name=node.get('name','').lower()
  group=next((g for g in ['clock','globe','gramophone'] if g in name),'desk' if 'cigar' in name else 'furnishings')
  for primitive in doc['meshes'][node['mesh']]['primitives']:
   if 'material' in primitive:materialGroups.setdefault(primitive['material'],set()).add(group)
 def materialImages(value,groups):
  if isinstance(value,dict):
   for k,v in value.items():
    if k.endswith('Texture') and isinstance(v,dict) and 'index' in v:
     tex=doc['textures'][v['index']];source=tex.get('source',tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
     imageGroups.setdefault(source,set()).update(groups)
    else:materialImages(v,groups)
  elif isinstance(value,list):
   for v in value:materialImages(v,groups)
 for index,mat in enumerate(doc.get('materials',[])):materialImages(mat,materialGroups.get(index,{'furnishings'}))
 for mat in doc.get('materials',[]):
  for slot in ['normalTexture','occlusionTexture']:
   if slot in mat:dataImages.add(mat[slot]['index'])
  mr=mat.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')
  if mr:dataImages.add(mr['index'])
 imageData=set()
 for index,tex in enumerate(doc.get('textures',[])):
  image=tex.get('source',tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
  if index in dataImages:imageData.add(image)
  tex.pop('source',None);tex.setdefault('extensions',{})['EXT_texture_webp']={'source':image}
 for index,im in enumerate(doc.get('images',[])):
  v=doc['bufferViews'][im.pop('bufferView')];b=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];image=Image.open(io.BytesIO(b)).convert('RGBA')
  file=base/f'{path.stem}-image-{index}.webp';low=encode(resized(image,512),'WEBP',index in imageData);high=encode(resized(image,2048),'WEBP',index in imageData)
  file.write_bytes(low);im['uri']=file.name;im['mimeType']='image/webp';groups=imageGroups.get(index,{'furnishings'}) if 'props' in filename else {'architecture'}
  if max(image.size)>512:detail(file,high,groups,'image')
  report.append({'file':key(file),'kind':'extracted prop image','before':len(b),'startup':len(low),'sourceSize':image.size,'startupMax':512})
 for index,v in enumerate(doc['bufferViews']):
  if index in imageViews:continue
  viewRemap[index]=len(views);payload+=b'\0'*(-len(payload)%4);vv=dict(v);vv['byteOffset']=len(payload);payload+=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];views.append(vv)
 def remap(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if k=='bufferView':v[k]=viewRemap[x]
    else:remap(x)
  elif isinstance(v,list):
   for x in v:remap(x)
 doc['bufferViews']=views;remap(doc)
 for old,new in zip(originalAccessors,doc.get('accessors',[])):
  assert {k:v for k,v in old.items() if k!='bufferView'}=={k:v for k,v in new.items() if k!='bufferView'}
  av=originalViews[old['bufferView']];bv=views[new['bufferView']]
  assert binary[av.get('byteOffset',0):av.get('byteOffset',0)+av['byteLength']]==payload[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']], 'Geometry attribute bytes changed'

 for field in ['extensionsUsed','extensionsRequired']:doc[field]=sorted(set(doc.get(field,[]))|{'EXT_texture_webp'})
 doc['buffers']=[{'byteLength':len(payload)}];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);payload+=b'\0'*(-len(payload)%4)
 result=struct.pack('<III',0x46546c67,2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(payload),0x004e4942)+payload;path.write_bytes(result)
 report.append({'file':key(path),'kind':'externalized images; geometry unchanged','before':len(raw),'startup':len(result)})

# Interactions identify meshes/objects, not image buffer offsets. Other geometry
# is unchanged. Record hashes of this delivery representation for stale-map guards.
for g in interactions['geometryHashes']:interactions['geometryHashes'][g]=sha((base/f'railcar-{g}.glb').read_bytes())
(base/'railcar-interactions.json').write_text(json.dumps(interactions,separators=(',',':')))
source=assets/'solitaire-setting.mesh.gz';lod=a.ring_lod.read_bytes();proof=json.loads(a.ring_lod.with_name('ring-lod.json').read_text())
assert proof['sourceSHA256']==sha(source.read_bytes()) and proof['lodSHA256']==sha(lod) and proof['nonManifoldEdges']==0
(assets/'solitaire-setting-low.mesh.gz').write_bytes(lod)
delivery={'version':1,'entries':entries,'ring':{'initial':'solitaire-setting-low.mesh.gz','detail':'solitaire-setting.mesh.gz','triangles':proof['afterTriangles']},'tradeoffs':'Lower spatial texture/lightmap detail and smooth ring LOD; full optical gemstone shader and animation retained.'}
(assets/'delivery-details.json').write_text(json.dumps(delivery,separators=(',',':')))
a.evidence.parent.mkdir(parents=True,exist_ok=True);a.evidence.write_text(json.dumps({'files':report,'ring':proof,'detailEntries':len(entries)},indent=2));print(json.dumps({'files':len(report),'detailEntries':len(entries),'ringBytes':len(lod)}))
