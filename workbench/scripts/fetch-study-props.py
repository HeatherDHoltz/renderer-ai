"""Restore full 2K CC0 PBR study props, including normal/ARM maps."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT.parent/'output/fidelity-research'
DEST=ROOT/'assets/study-props'
def fetch(url,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 subprocess.run(['curl','--fail','--silent','--show-error','-L','-A','Mozilla/5.0 RendererPortfolio/1.0',url,'-o',str(path)],check=True)
records=[]
for asset,stem in [('vintage_grandfather_clock_01','clock'),('lambis_shell','shell'),('brass_vase_03','vase')]:
 meta=CACHE/(stem+'-files.json')
 if not meta.exists():fetch('https://api.polyhaven.com/files/'+asset,meta)
 entry=json.loads(meta.read_text())['gltf']['2k']['gltf'];folder=DEST/asset
 items=[('model.gltf',entry),*entry['include'].items()];files=[]
 for name,info in items:
  target=folder/name
  if not target.exists():fetch(info['url'],target)
  if hashlib.md5(target.read_bytes()).hexdigest()!=info['md5']:
   fetch(info['url']+'?checksum='+info['md5'],target)
  assert hashlib.md5(target.read_bytes()).hexdigest()==info['md5'],target
  files.append({'file':str(target.relative_to(ROOT)),'source':info['url'],'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
 authors={'vintage_grandfather_clock_01':{'Yann Kervran':'Rigging','James Ray Cock':'Modeling & Texturing'},'lambis_shell':{'Kuutti Siitonen':'All'},'brass_vase_03':{'Rico Cilliers':'All'}}[asset]
 records.append({'authors':authors,'asset':asset,'page':'https://polyhaven.com/a/'+asset,'license':'CC0-1.0','adaptation':'Original complete 2K PBR geometry, normals and ARM retained; staged in the study without flattening materials.','files':files})
 print(asset,flush=True)
DEST.mkdir(parents=True,exist_ok=True);(DEST/'sources.json').write_text(json.dumps(records,indent=2)+'\n')
