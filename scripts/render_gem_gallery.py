"""Render the actual gemstone study and assemble labeled images plus a light-sweep GIF.

Requires a built release CLI and Pillow for labels/GIF assembly only. Rendering
itself is entirely the Rust engine. Run from any directory; outputs stay in output/.
"""
from pathlib import Path
import argparse
import copy
import json
import subprocess
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--spp',type=int,default=256)
parser.add_argument('--sweep-frames',type=int,default=12)
parser.add_argument('--sweep-spp',type=int,default=64)
parser.add_argument('--reuse-renders',action='store_true',help='Reassemble existing output PNGs; use only with unchanged scenes/settings.')
args=parser.parse_args()
if not (1<=args.spp<=16384 and 3<=args.sweep_frames<=60 and 1<=args.sweep_spp<=16384):parser.error('invalid sample/frame limits')
binary=ROOT/'target/release/renderer-project'
out=ROOT/'output/gem-study';out.mkdir(parents=True,exist_ok=True)
gallery=ROOT/'gallery/gems';gallery.mkdir(parents=True,exist_ok=True)

def render(scene,path,spp):
    if args.reuse_renders and path.exists():return
    subprocess.run([str(binary),'render',str(scene),'--spp',str(spp),'--output',str(path)],cwd=ROOT,check=True)

def font(size):
    for path in ['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if Path(path).exists():return ImageFont.truetype(path,size)
    return ImageFont.load_default(size=size)

study=json.loads((ROOT/'assets/gems/study.json').read_text())
for row in study:render(ROOT/row['scene'],out/(row['key']+'.png'),args.spp)
width,height=448,520
sheet=Image.new('RGB',(width*3,height*2),(16,22,30));draw=ImageDraw.Draw(sheet)
for index,row in enumerate(study):
    x=(index%3)*width;y=(index//3)*height
    image=Image.open(out/(row['key']+'.png')).convert('RGB')
    assert image.size==(448,448)
    sheet.paste(image,(x,y));draw.text((x+18,y+458),row['label'],font=font(25),fill=(238,242,248))
    draw.text((x+18,y+492),row['cut'],font=font(16),fill=(158,177,195))
sheet.save(gallery/'precious-gems.png')

render(ROOT/'scenes/gem_tigers_eye.json',out/'tigers-eye.png',args.spp)
image=Image.open(out/'tigers-eye.png').convert('RGB')
tiger=Image.new('RGB',(1200,670),(16,22,30));tiger.paste(image,(0,0));draw=ImageDraw.Draw(tiger)
for index,label in enumerate(["Tiger's-eye inspired","Hawk's-eye inspired","Red chatoyant variant"]):
    draw.text((400*index+25,622),label,font=font(22),fill=(238,242,248))
tiger.save(gallery/'chatoyant-stones.png')

source=json.loads((ROOT/'scenes/gem_sheen_1.json').read_text())
# Temporary generated sweep files move under output/, so freeze asset paths.
source['environment']['path']=str((ROOT/'scenes'/source['environment']['path']).resolve())
for definitions in [source['textures'],source['geometries']]:
    for definition in definitions.values():
        if 'path' in definition:definition['path']=str((ROOT/'scenes'/definition['path']).resolve())
frames=[]
for index in range(args.sweep_frames):
    frame=copy.deepcopy(source);frame['lights'][0]['position']=[-2,6,-5+10*index/(args.sweep_frames-1)]
    path=out/f'sweep-{index:02}.json';path.write_text(json.dumps(frame))
    png=out/f'sweep-{index:02}.png';render(path,png,args.sweep_spp)
    image=Image.open(png).convert('RGB');draw=ImageDraw.Draw(image)
    draw.text((14,14),'Moving light / fixed stone',font=font(19),fill=(245,245,245),stroke_width=1,stroke_fill=(18,23,30))
    frames.append(image)
frames += frames[-2:0:-1]
frames[0].save(gallery/'tigers-eye-sheen.gif',save_all=True,append_images=frames[1:],duration=100,loop=0)
print('Saved actual rendered gem comparison, chatoyant stones, and moving-light GIF.')
