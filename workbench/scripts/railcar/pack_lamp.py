"""Full-resolution RGBM transport for a new lamp contribution, never the approved base.
Keeps float originals as ignored authoring evidence and records encoding error.
"""
import gzip,json,math,struct,shutil
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[3];A=ROOT/'workbench/assets/railcar/export';D=ROOT/'output/railcar/interactions'
record=json.loads((A/'student-lamp-lighting.json').read_text())
for group,item in record.items():
 source=A/item['file']
 if not str(source).endswith('.f16.gz'):continue
 raw=gzip.decompress(source.read_bytes());w,h=struct.unpack_from('<II',raw);rgb=np.frombuffer(raw,'<f2',offset=8).reshape(h,w,4)[...,:3].astype(np.float32)
 extent=2**math.ceil(math.log2(max(float(rgb.max()),1)))
 multiplier=np.maximum(1,np.ceil(rgb.max(-1)/extent*255)).clip(1,255).astype(np.uint8)
 quant=np.rint(np.clip(rgb/(multiplier[...,None]/255*extent),0,1)*255).astype(np.uint8)
 rgba=np.concatenate([quant,multiplier[...,None]],axis=-1);file=source.name.replace('.f16.gz','.webp');Image.fromarray(rgba).save(A/file,lossless=True,method=6,exact=True)
 restored=np.array(Image.open(A/file));decoded=restored[...,:3].astype(np.float32)/255*restored[...,3:4]/255*extent;diff=abs(decoded-rgb)
 item.update(file=file,range=extent,encoding='linear RGBM8, lossless WebP, full atlas resolution',encodingMaxAbsoluteError=float(diff.max()),encodingMeanAbsoluteError=float(diff.mean()),bytes=(A/file).stat().st_size)
 shutil.move(source,D/source.name)
(A/'student-lamp-lighting.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
