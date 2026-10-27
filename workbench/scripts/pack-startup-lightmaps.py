"""Trim unsampled RGBM atlas pixels in a delivery copy, never source exports.

Requires NumPy/Pillow. Run AFTER build and BEFORE prepare-public. Materials with
bakedResponse read their separate float response, so their base RGBM islands are
unused. Preserve every potentially sampled texel for all other materials, using
conservative triangle UV bounding boxes + 4px border, both row conventions, at
unchanged resolution. No mipmaps are used by the RGBM loader.
"""
import argparse,hashlib,json,math,struct,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

parser=argparse.ArgumentParser();parser.add_argument('--assets-dir',type=Path,required=True);parser.add_argument('--evidence',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
if args.assets_dir.resolve()==(root/'assets/railcar/export').resolve():
 parser.error('Canonical authoring exports are read-only; supply a delivery copy under dist/ or output/.')
sys.path.insert(0,str(root/'scripts/railcar'))
from rebake_subset import _glb
manifest=json.loads((args.assets_dir/'railcar-manifest.json').read_text());report=[]
for group,info in manifest['groups'].items():
 imagePath=args.assets_dir/info['light'];source=imagePath.read_bytes();image=Image.open(imagePath).convert('RGBA');w,h=image.size
 mask=Image.new('L',(w,h));draw=ImageDraw.Draw(mask);doc,arr=_glb(args.assets_dir/info['file']);materials=[]
 for node in doc['nodes']:
  if 'mesh' not in node:continue
  name=node['name'].split('|',1)[-1];spec=info['materials'][name]
  if spec.get('bakedResponse'):continue
  materials.append(name)
  for primitive in doc['meshes'][node['mesh']]['primitives']:
   uv=arr(primitive['attributes'][f"TEXCOORD_{spec.get('uv',0)}"]);triangles=arr(primitive['indices']).reshape(-1,3)
   for tri in uv[triangles]:
    for flip in (False,True):
     points=tri.copy();points[:,1]=1-points[:,1] if flip else points[:,1]
     lo=np.floor(points.min(0)*[w,h]-.5).astype(int)-4;hi=np.ceil(points.max(0)*[w,h]-.5).astype(int)+4
     lo=np.maximum(lo,0);hi=np.minimum(hi,[w-1,h-1])
     if np.all(hi>=lo):draw.rectangle((*lo,*hi),fill=255)
 kept=np.asarray(mask)!=0;pixels=np.array(image);pixels[~kept]=[0,0,0,255]
 candidate=imagePath.with_suffix('.startup.webp');Image.fromarray(pixels).save(candidate,format='WEBP',lossless=True,quality=100,method=6,exact=True)
 restored=np.asarray(Image.open(candidate).convert('RGBA'))
 assert np.array_equal(restored[kept],np.asarray(image)[kept]),'Sampled lighting pixels changed'
 chosen=candidate.stat().st_size<len(source)
 row={'file':info['light'],'size':[w,h],'sourceBytes':len(source),'candidateBytes':candidate.stat().st_size,'installed':chosen,'preservedTexelFraction':float(kept.mean()),'materialsUsingBaseRGBM':sorted(set(materials)),'sourceSha256':hashlib.sha256(source).hexdigest(),'deliverySha256':hashlib.sha256(candidate.read_bytes() if chosen else source).hexdigest(),'sampledPixelsExact':True,'paddingPixels':4,'bothRowConventions':True}
 if chosen:candidate.replace(imagePath)
 else:candidate.unlink()
 report.append(row);print(json.dumps(row),flush=True)
args.evidence.parent.mkdir(parents=True,exist_ok=True);args.evidence.write_text(json.dumps(report,indent=2)+'\n')
