"""Generate supplemental cuts, striped stone textures and reproducible gem scenes.

Python standard library only. Online Zsky meshes are imported separately; this
script creates the additional step cut and domed cabochon from parametric geometry.
"""
from pathlib import Path
import json
import math
import struct
import zlib

ROOT=Path(__file__).resolve().parent.parent
ASSETS=ROOT/"assets/gems"
ASSETS.mkdir(exist_ok=True)

def obj(path, vertices, faces, uvs=None, normals=None, normal_faces=None):
    lines=["# Project-generated supplemental gemstone geometry; no external model."]
    lines += ["v "+" ".join(f"{x:.8f}" for x in v) for v in vertices]
    if uvs: lines += [f"vt {u:.8f} {v:.8f}" for u,v in uvs]
    if normals: lines += ["vn "+" ".join(f"{x:.8f}" for x in n) for n in normals]
    for index,face in enumerate(faces):
        if normals:
            corners=[f"{v+1}/{v+1}/{n+1}" for v,n in zip(face,normal_faces[index])]
        else: corners=[str(v+1) for v in face]
        lines.append("f "+" ".join(corners))
    path.write_text("\n".join(lines)+"\n")

# Eight-corner rectangular step outline; planar side steps, closed table/culet.
outline=[(-.58,-1.1),(.58,-1.1),(.8,-.88),(.8,.88),(.58,1.1),(-.58,1.1),(-.8,.88),(-.8,-.88)]
rings=[(.07,.0),(.38,.28),(.72,.53),(1,.78),(1,.83),(.86,.98),(.67,1.13)]
vertices=[(x*s,y,z*s) for s,y in rings for x,z in outline]
faces=[]
for ring in range(len(rings)-1):
    for i in range(8):
        a=ring*8+i;b=ring*8+(i+1)%8;c=(ring+1)*8+(i+1)%8;d=(ring+1)*8+i
        faces += [(a,b,c),(a,c,d)]
faces += [(0,i+1,i) for i in range(1,7)]
top=(len(rings)-1)*8
faces += [(top,top+i,top+i+1) for i in range(1,7)]
volume=sum(vertices[a][0]*(vertices[b][1]*vertices[c][2]-vertices[b][2]*vertices[c][1])+vertices[a][1]*(vertices[b][2]*vertices[c][0]-vertices[b][0]*vertices[c][2])+vertices[a][2]*(vertices[b][0]*vertices[c][1]-vertices[b][1]*vertices[c][0]) for a,b,c in faces)
if volume<0:faces=[(a,c,b) for a,b,c in faces]
obj(ASSETS/"emerald-step.obj",vertices,faces)

# Smooth upper half ellipsoid with a separate hard, flat back.
segments,rows,rx,rz,height=96,24,.85,1.1,.52
vertices=[(0,height,0)];uvs=[(.5,.5)];normals=[(0,1,0)]
for row in range(1,rows+1):
    theta=math.pi*.5*row/rows
    for i in range(segments):
        phi=math.tau*i/segments
        x=rx*math.sin(theta)*math.cos(phi);y=height*math.cos(theta);z=rz*math.sin(theta)*math.sin(phi)
        vertices.append((x,y,z));uvs.append((.5+x/(2*rx),.5+z/(2*rz)))
        n=(x/(rx*rx),y/(height*height),z/(rz*rz));length=math.sqrt(sum(a*a for a in n));normals.append(tuple(a/length for a in n))
faces=[(0,1+(i+1)%segments,1+i) for i in range(segments)]
for row in range(rows-1):
    for i in range(segments):
        a=1+row*segments+i;b=1+row*segments+(i+1)%segments;c=b+segments;d=a+segments
        faces += [(a,b,c),(a,c,d)]
normal_faces=list(faces)
center=len(vertices);vertices.append((0,0,0));uvs.append((.5,.5))
cap_normal=len(normals);normals.append((0,-1,0))
bottom=1+(rows-1)*segments
for i in range(segments):
    faces.append((center,bottom+i,bottom+(i+1)%segments));normal_faces.append((cap_normal,)*3)
obj(ASSETS/"cabochon.obj",vertices,faces,uvs,normals,normal_faces)

def png(path,low,high):
    width=height=512;data=bytearray()
    for y in range(height):
        data.append(0)
        for x in range(width):
            u,v=x/width,y/height
            phase=8*u+.22*math.sin(8*v)+.05*math.sin(27*v+u*6)
            band=(.5+.5*math.sin(math.tau*phase))**1.4
            fiber=.5+.5*math.sin(900*u+2*math.sin(12*v))
            mix=.08+.72*band+.2*fiber
            for a,b in zip(low,high):
                linear=a+(b-a)*mix
                srgb=12.92*linear if linear<=.0031308 else 1.055*linear**(1/2.4)-.055
                data.append(round(255*srgb))
    def chunk(kind,payload):return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload)&0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(data),9))+chunk(b'IEND',b''))
palettes={"gold":([.035,.009,.002],[.75,.36,.045]),"blue":([.008,.016,.025],[.12,.32,.45]),"red":([.025,.003,.002],[.55,.095,.035])}
for name,(low,high) in palettes.items():png(ASSETS/f"tiger-{name}.png",low,high)

def diffuse(c):return {"physical":{"model":"diffuse","base_color":c}}
def object(name,geometry,material,translation,scale,rotation=None,smooth=False):
    transform={"translation":translation,"scale":scale}
    if rotation:transform['rotation_degrees']=rotation
    return dict(name=name,geometry=geometry,material=material,transform=transform,smooth=smooth)
def base():return {"version":1,"camera":{"position":[2.8,3.4,5.4],"target":[0,.9,0],"fov":25},
    "render":{"width":448,"height":448,"spp":256,"seed":116,"integrator":"physical","max_depth":16,"min_throughput":.0001,"exposure":.1},
    "environment":{"kind":"hdr","path":"../assets/gems/light-tent.hdr","intensity":1},
    "materials":{"floor":diffuse([.23,.27,.32]),"podium":diffuse([.48,.5,.53])},
    "geometries":{"floor":{"kind":"plane"},"podium":{"kind":"cylinder"}},
    "objects":[object("floor","floor","floor",[0,-.025,0],[1,1,1]),object("podium","podium","podium",[0,.08,0],[1.13,.08,1.13])],
    "lights":[{"kind":"area","center":[-3,6,4],"edge_u":[3,0,0],"edge_v":[0,0,3],"radiance":[6,5.5,4.8]}]}
definitions=[
    ("diamond","Diamond","Decagonal brilliant-style", "zsky-jewel-01.obj",.8,2.42,[.002,.002,.002],None),
    ("emerald","Emerald","Rectangular step cut", "emerald-step.obj",.85,1.58,[1.65,.045,1.05],[0,-20,0]),
    ("ruby","Ruby","Oval fancy shape", "zsky-jewel-02.obj",.65,1.77,[.055,2.7,1.7],[0,-12,0]),
    ("sapphire","Sapphire","Octagonal faceted form", "zsky-jewel-04.obj",.9,1.77,[4.8,1.65,.025],[0,-15,0]),
    ("amethyst","Amethyst","Pointed fantasy shape", "zsky-jewel-03.obj",.8,1.54,[.75,2.5,.08],[0,-10,0]),
    ("aquamarine","Aquamarine","Oval fancy shape", "zsky-jewel-02.obj",.65,1.58,[.7,.04,.018],[0,10,0])]
study=[]
for key,label,cut,mesh,scale,ior,absorption,rotation in definitions:
    scene=base();scene['materials']['gem']={'physical':{'model':'gemstone','ior':ior,'absorption':absorption}}
    scene['geometries']['gem']={'kind':'mesh','path':'../assets/gems/'+mesh}
    scene['objects'].append(object('gem','gem','gem',[0,.18,0],[scale]*3,rotation))
    filename='gem_'+key+'.json';(ROOT/'scenes'/filename).write_text(json.dumps(scene,indent=2)+'\n')
    study.append({'key':key,'label':label,'cut':cut,'scene':'scenes/'+filename,'ior':ior,'absorption':absorption})

tiger=base();tiger['camera']={'position':[0,5,8],'target':[0,.35,0],'fov':26};tiger['render'].update(width=1200,height=600,spp=256,max_depth=4)
tiger['environment']['intensity']=.2;tiger['textures']={};tiger['objects']=[tiger['objects'][0]]
tiger['geometries']['cabochon']={'kind':'mesh','path':'../assets/gems/cabochon.obj'}
tiger['lights']=[{'kind':'point','position':[-2,6,-1],'color':[130,115,95]}]
for index,name in enumerate(palettes):
    x=(index-1)*2.4
    tiger['textures'][name]={'kind':'image','path':f'../assets/gems/tiger-{name}.png','wrap':'clamp','filter':'bilinear'}
    tiger['materials'][name]={'physical':{'model':'chatoyant','base_color':[1,1,1],'fiber_direction':[0,0,1],'roughness_along':.18,'roughness_across':.75},'texture':name}
    tiger['objects'] += [object('podium-'+name,'podium','podium',[x,.08,0],[1.13,.08,1.13]),object(name,'cabochon',name,[x,.18,0],[1,1,1],smooth=True)]
(ROOT/'scenes/gem_tigers_eye.json').write_text(json.dumps(tiger,indent=2)+'\n')
for index,z in enumerate([-5,0,5]):
    single=json.loads(json.dumps(tiger));single['objects']=[o for o in single['objects'] if o['name'] in ['floor','podium-gold','gold']]
    for o in single['objects']:
        if o['name']!='floor':o['transform']['translation'][0]=0
    single['camera']={'position':[0,3.8,6],'target':[0,.35,0],'fov':27}
    single['render'].update(width=480,height=400,spp=256)
    single['lights'][0]['position']=[-2,6,z]
    (ROOT/f'scenes/gem_sheen_{index}.json').write_text(json.dumps(single,indent=2)+'\n')
(ASSETS/'study.json').write_text(json.dumps(study,indent=2)+'\n')
print('Generated two supplemental meshes, three striped textures, six gem scenes, and four sheen scenes.')
