"""Build the static atelier and bake fixed illumination with Blender 4.5 LTS.

Run from the repository root:
  blender -b --factory-startup --python workbench/scripts/build-atelier.py
Only static scenery is baked. Cases, specimen, loupe and examination light are
created in the browser. Coordinates below use the application's +Y-up frame.
"""
import math
import os
import random
import subprocess
import runpy
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "workbench/assets/atelier"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(21)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 96
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.cycles.use_denoising = True
scene.cycles.bake_type = "DIFFUSE"
scene.render.bake.margin = 12
scene.render.bake.use_clear = True
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.10, 0.14, 0.22, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.055
scene.view_settings.view_transform = "AgX"
static = []
preview_only = []


def xyz(p):
    return (p[0], -p[2], p[1])


def rgb(hex_color):
    v = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in v)


def material(name, color, rough=.6, metal=0, grain=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    c = rgb(color)
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = rough
    # Retain distinct PBR response alongside fixed diffuse illumination.
    # Jewelry remains live and is excluded from this bake.
    bsdf.inputs["Metallic"].default_value = metal
    if grain:
        uv = nodes.new("ShaderNodeUVMap"); uv.uv_map = "MaterialUV"
        for filename, socket, colorspace in [("wood-color.jpg","Base Color","sRGB"),("wood-roughness.jpg","Roughness","Non-Color")]:
            tex = nodes.new("ShaderNodeTexImage"); tex.image=bpy.data.images.load(str(ROOT/"workbench/assets/materials"/filename), check_existing=True);tex.image.colorspace_settings.name=colorspace
            links.new(uv.outputs["UV"],tex.inputs["Vector"])
            if socket=="Base Color":
                tint=nodes.new("ShaderNodeMixRGB");tint.blend_type="MULTIPLY";tint.inputs[0].default_value=1;tint.inputs[2].default_value=(*c,1);links.new(tex.outputs["Color"],tint.inputs[1]);links.new(tint.outputs[0],bsdf.inputs[socket])
            else: links.new(tex.outputs["Color"],bsdf.inputs[socket])
        tex=nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(ROOT/"workbench/assets/materials/wood-normal.jpg"),check_existing=True);tex.image.colorspace_settings.name="Non-Color";links.new(uv.outputs["UV"],tex.inputs["Vector"])
        bump=nodes.new("ShaderNodeNormalMap");bump.inputs["Strength"].default_value=.22;links.new(tex.outputs["Color"],bump.inputs["Color"]);links.new(bump.outputs[0],bsdf.inputs["Normal"])
    return m


walnut = material("oiled walnut", "512c1d", .43, grain=True)
edge = material("end grain", "251911", .5, grain=True)
paint = material("warm mineral paint", "e6dfd2", .88)
linen = material("unbleached linen", "4b3829", .95)
ivory = material("ivory ceramic", "e9dfca", .33)
brass = material("satin brass", "ab8754", .30, .85)
ink = material("charcoal", "292e2d", .55)
steel = material("steel", "82908e", .29, .92)
wax = material("warm wax", "e9d5ad", .8)
amber = material("amber glass body", "533b28", .22)
paper = material("paper edges", "b3a488", .95)
panel = material("walnut inset panels", "613a25", .50, grain=True)
marble = material("black marble slips", "292b28", .35)
rib = material("shade ribs", "7b4d27", .7)
shade_fabric = material("lit pleated silk", "cf9d59", .85)
shade_fabric.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value = (1.0,.52,.17,1)
shade_fabric.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = .9


def finish(o, mat, bevel=0):
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new("soft manufactured edges", "BEVEL")
        mod.width, mod.segments = bevel, 3
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = o.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    static.append(o)
    return o


def box(name, size, p, mat=walnut, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(p))
    o = bpy.context.object
    o.name = name
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bevel)


def cylinder(name, r, depth, p, mat, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=r, radius2=r if r2 is None else r2, depth=depth, location=xyz(p))
    o = bpy.context.object
    o.name = name
    return finish(o, mat, .012)


def area(name, p, target, energy, color, size, size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.shape, data.size = energy, rgb(color), "RECTANGLE", size
    data.size_y = size if size_y is None else size_y
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.location = xyz(p)
    o.rotation_euler = (Vector(xyz(target)) - o.location).to_track_quat("-Z", "Y").to_euler()


# Edwardian jeweler's study: one coherent cabinetmaking vocabulary.
back = -7.8
box("left wall", (6, 15, .30), (-11, 4, back), edge)
box("right wall", (15, 15, .30), (5.5, 4, back), edge)
box("below window", (6, 3, .30), (-5, -1, back), edge)
box("above window", (6, 5, .30), (-5, 9.5, back), edge)
box("left return", (.3, 15, 38), (-14, 4, 6), walnut)
box("right return", (.3, 15, 38), (13, 4, 6), walnut)
box("ceiling", (27, .25, 38), (-.5, 9.8, 6), edge)
box("floor", (27, .2, 38), (-.5, -5, 6), edge)
# Recessed panels and several actual molding profiles catch light along edges.
for x in [-12.5, -10.5, -.9, 1.1, 3.1, 5.1, 7.1, 9.1, 11.1]:
    for y, h in [(-.25, 2.7), (4.1, 5.0)]:
        box("raised walnut panel", (1.78,h,.06), (x,y,back+.18), panel, .035)
        for xx in [-.90,.90]:
            box("panel stile", (.07,h+.14,.10),(x+xx,y,back+.25),walnut,.016)
            box("bead molding", (.025,h+.04,.025),(x+xx*.94,y,back+.32),brass,.006)
        for yy in [-h/2,h/2]:
            box("panel rail", (1.85,.075,.10),(x,y+yy,back+.25),walnut,.016)
for y,h in [(-1.8,.22),(1.25,.18),(7.0,.18),(7.2,.10)]:
    box("continuous cornice",(27,h,.22),(-.5,y,back+.25),walnut,.025)
for x in [-12,-6,0,6,12]:
    box("coffer beam",(.20,.26,38),(x,9.55,6),walnut)
for z in [-6,0,6,12,18]:
    box("coffer cross beam",(27,.26,.20),(-.5,9.55,z),walnut)
# A room behind the seated viewer gives diamonds a dark, neutral reflection field.
box("room behind the chair",(27,15,.25),(-.5,4,24),edge)
for x in [-10,-5,0,5,10]:
    box("rear cabinet panel",(4.5,6,.10),(x,3.5,23.8),panel)
# Window jambs are flush with the same wall opening, with heavy gathered drapes.
for x in [-8.02,-1.98]:
    box("window reveal",(.20,6.6,.65),(x,3.75,back),edge)
    box("molded window casing",(.23,6.9,.18),(x,3.75,back+.40),walnut)
for y in [.45,7.05]:
    box("window reveal",(6.3,.20,.65),(-5,y,back),edge)
    box("molded window casing",(6.5,.21,.18),(-5,y,back+.4),walnut)
for x in [-7.84,-5,-2.16]:
    box("slender sash",(.09,6.4,.13),(x,3.75,back+.16),walnut,.012)
for y in [.64,3.15,6.88]:
    box("sash rail",(5.7,.09,.13),(-5,y,back+.16),walnut,.012)
box("deep polished sill",(6.7,.19,1.05),(-5,.39,back+.32),walnut,.04)
for x in [-7.45,-2.55]:
    vertices, faces = [], []
    for j in range(41):
        for i in range(65):
            t,v=i/64,j/40
            gather=1+.22*math.sin(v*math.pi)
            vertices.append(xyz((x+(t-.5)*1.38*gather,.45+v*6.6,back+.62+.15*math.cos(t*math.pi*14)+.045*math.sin(v*5+t*9))))
    for j in range(40):
        for i in range(64):
            a=j*65+i;faces.append((a,a+1,a+66,a+65))
    mesh=bpy.data.meshes.new("heavy pleats");mesh.from_pydata(vertices,[],faces)
    o=bpy.data.objects.new("gathered damask curtain",mesh);scene.collection.objects.link(o);finish(o,linen)
    box("curtain tie",(1.48,.11,.12),(x,2.25,back+.87),brass,.025)
# A real cut-out bench top and drawer banks based on the reference's proportions.
outline=[(-8,-5.8),(8,-5.8),(8,3.3),(1.5,3.3)]
outline += [(1.5*math.cos(i*math.pi/32),3.3-1.3*math.sin(i*math.pi/32)) for i in range(1,33)]
outline += [(-8,3.3)]
mesh=bpy.data.meshes.new("jeweler bench top");mesh.from_pydata([xyz((x,-1.4,z))for x,z in outline],[],[tuple(reversed(range(len(outline))))])
o=bpy.data.objects.new("routed jeweler bench",mesh);scene.collection.objects.link(o)
o.data.materials.append(walnut);bpy.context.view_layer.objects.active=o
mod=o.modifiers.new("solid walnut top","SOLIDIFY");mod.thickness=.30;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=o.modifiers.new("rounded routed edge","BEVEL");mod.width=.055;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name);static.append(o)
box("rear tool ledge",(15,.18,.65),(0,-1.30,-5.28),walnut)
for x,width,rows,dh in [(6.25,2.55,8,.36),(-6.50,2.0,4,.58)]:
    box("drawer carcass",(width,3.2,4.5),(x,-3.25,.25),edge)
    for i in range(rows):
        y=-1.95-i*dh
        box("fitted drawer front",(width-.15,dh-.045,.12),(x,y,2.56),panel,.025)
        for hx in [-.36,.36]:
            cylinder("drawer brass escutcheon",.045,.04,(x+hx,y,2.65),brass).rotation_euler.x=math.pi/2
        box("brass drawer pull",(.72,.035,.055),(x,y,2.72),brass,.014)
    for sx in [-1,1]:
        box("bench foot",(.19,.45,.24),(x+sx*(width/2-.17),-4.9,1.9),walnut)
box("front apron",(9.4,.65,.16),(-.4,-2.0,2.60),panel)
box("bench pin",(.44,.11,1.1),(0,-1.35,2.25),walnut)
# Fireplace: dark cast iron, marble slips and a timber mantel, not rough stone.
fx=2.15
box("firebox backing",(2.65,2.35,.08),(fx,-.30,back+.62),ink)
for sx in [-1,1]:
    box("mantel pilaster",(.40,3.0,.52),(fx+sx*1.62,-.06,back+.56),walnut,.045)
    box("marble slip",(.22,2.30,.45),(fx+sx*1.30,-.35,back+.65),marble,.025)
    for dx in [-.085,.085]:box("pilaster flute",(.035,2.35,.04),(fx+sx*1.62+dx,-.10,back+.84),brass,.006)
    box("mantel foot",(.56,.18,.65),(fx+sx*1.62,-1.60,back+.63),walnut)
box("marble lintel",(2.85,.25,.44),(fx,.90,back+.64),marble)
box("carved mantel frieze",(3.65,.45,.48),(fx,1.25,back+.58),panel,.04)
box("mantel shelf",(4.05,.20,.92),(fx,1.60,back+.71),walnut,.055)
box("mantel beading",(3.8,.055,.07),(fx,1.42,back+1.05),brass,.012)
box("hearth slab",(3.9,.13,1.55),(fx,-1.75,back+.96),marble,.035)
for i in range(9):
    cylinder("iron grate bar",.018,.40,(fx-1.0+i*.25,-1.26,back+1.00),ink)
box("iron grate front",(2.45,.055,.06),(fx,-1.10,back+1.00),ink,.015)
# Inset landscape, a public-domain 1874 Met watercolor, supplies period artwork.
box("gilt picture frame",(3.2,2.12,.12),(fx,3.30,back+.33),edge,.035)
for sw,sh in [(3.14,2.06),(2.97,1.89)]:
    for sx in [-1,1]:box("gilt frame side",(.055,sh,.09),(fx+sx*sw/2,3.30,back+.43),brass,.012)
    for sy in [-1,1]:box("gilt frame rail",(sw,.055,.09),(fx,3.30+sy*sh/2,back+.43),brass,.012)
painting=bpy.data.materials.new("Richards 1874 — Met Open Access");painting.use_nodes=True
nodes,links=painting.node_tree.nodes,painting.node_tree.links
uv=nodes.new("ShaderNodeUVMap");uv.uv_map="MaterialUV"
tex=nodes.new("ShaderNodeTexImage");links.new(uv.outputs["UV"],tex.inputs["Vector"]);tex.image=bpy.data.images.load(str(OUT/"centre-harbor.jpg"));links.new(tex.outputs["Color"],nodes.get("Principled BSDF").inputs["Base Color"])
bpy.ops.mesh.primitive_plane_add(size=1,location=xyz((fx,3.30,back+.45)))
o=bpy.context.object;o.name="Sundown at Centre Harbor (1874)";o.rotation_euler.x=math.pi/2;o.scale=(2.85,1.84,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,painting)
box("picture light",(2.3,.075,.13),(fx,4.55,back+.70),brass)
area("picture wash",(fx,4.48,back+.85),(fx,3.3,back+.4),36,"ffe0ab",2.1,.12)
# Built-in bookcases and labeled drawers, with individual cloth/leather spines.
book_colors=["2f3930","604035","512b32","243139","776346","423e2e"]
for bx,width in [(6.80,3.9)]:
    box("bookcase back",(width,6.0,.12),(bx,1.55,back+.24),edge)
    for sx in [-1,1]:box("bookcase stile",(.16,6.25,.95),(bx+sx*width/2,1.6,back+.66),walnut)
    for y in [-1.4,.1,1.65,3.25,4.8]:
        box("bookcase shelf",(width,.12,1.05),(bx,y,back+.68),walnut)
    for row,y in enumerate([.17,1.72,3.32]):
        x=bx-width/2+.15
        while x<bx+width/2-.30:
            w=random.uniform(.18,.30);h=random.uniform(.80,1.25)
            m=material(f"leather book {bx} {row} {x:.2f}",random.choice(book_colors),.68)
            box("book paper",(w-.025,h-.055,.64),(x+w/2,y+h/2,back+.64),paper,.006)
            for sx in [-1,1]:box("book board",(.018,h,.72),(x+w/2+sx*w/2,y+h/2,back+.66),m,.005)
            box("rounded leather spine",(w,h,.055),(x+w/2,y+h/2,back+1.04),m,.012)
            for sy in [.13,.20,h-.13]:box("gold spine tooling",(w*.68,.012,.009),(x+w/2,y+sy,back+1.071),brass,.002)
            x+=w+.035
    for i in range(3):
        box("cabinet drawer",(width-.15,.42,.18),(bx,-1.13+i*.45,back+1.08),panel)
        box("cabinet label plate",(.27,.10,.025),(bx,-1.13+i*.45,back+1.19),brass,.01)
# Two fixed shaded period lights. The movable examination source has no mesh.
def shaded_lamp(x,z,stem):
    base=-1.4
    cylinder("lamp foot",.39,.11,(x,base+.055,z),brass)
    profile=[(.22,0),(.24,.10),(.13,.18),(.10,.42),(.20,.54),(.13,.65),(.10,.95),(.19,1.08),(.12,1.18)]
    for (r1,h1),(r2,h2) in zip(profile,profile[1:]):
        cylinder("turned lamp stem",r1,(h2-h1)*stem,(x,base+.11+(h1+h2)*stem/2,z),walnut,r2)
    cy=base+.11+1.18*stem+.55
    # Slightly tapered shade with real ribs and fabric, not a glowing solid ball.
    bpy.ops.mesh.primitive_cone_add(vertices=64,radius1=.69,radius2=.56,depth=1.08,end_fill_type="NOTHING",location=xyz((x,cy,z)))
    finish(bpy.context.object,shade_fabric)
    for yy,rr in [(cy-.54,.69),(cy+.54,.56)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=rr,minor_radius=.018,major_segments=64,minor_segments=8,location=xyz((x,yy,z)));finish(bpy.context.object,brass)
    for i in range(24):
        a=i*math.pi*2/24
        lower=Vector(xyz((x+math.cos(a)*.695,cy-.54,z+math.sin(a)*.695)))
        upper=Vector(xyz((x+math.cos(a)*.565,cy+.54,z+math.sin(a)*.565)))
        mid=(lower+upper)/2
        o=box("shade rib",(.013,(upper-lower).length,.013),(mid.x,mid.z,-mid.y),rib,.003)
        o.rotation_euler=(upper-lower).to_track_quat("Z","Y").to_euler()
    area("warm shaded pool",(x,cy-.40,z),(x,-1.4,z+.2),240,"ffd49a",1.0)
    area("shade wall glow",(x,cy,z-.10),(x,cy,back),110,"ffcc8b",.8)
shaded_lamp(-5.9,-3.6,1.20)
shaded_lamp(5.35,-4.5,2.15)
# Small tools and a ledger, kept low so jewelry stays visually dominant.
box("mandrel cradle",(1.8,.13,.55),(-4.9,-1.25,-2.9),edge)
o=cylinder("steel ring mandrel",.13,2.1,(-4.9,-1.05,-2.9),steel,.05);o.rotation_euler.y=math.pi/2
for i in range(2):
    o=box("tweezer arm",(.03,.035,1.65),(-3.8+i*.08,-1.36,-2.7),steel,.007);o.rotation_euler.z=-.24+i*.04
box("leather ledger",(1.5,.17,1.8),(4.5,-1.29,-3.1),ink,.04)
box("ledger pages",(1.4,.12,1.7),(4.5,-1.19,-3.1),paper,.01)
box("ledger cover",(1.5,.035,1.8),(4.5,-1.10,-3.1),ink,.02)
area("moon through window",(-5,4,back+.48),(0,-1,0),115,"9ab5d5",4.8,5.5)
area("quiet warm fill",(1,6,2),(0,-1,-2),360,"ffe0b4",4)
area("fire bounce",(fx,-.3,back+.8),(0,-1.3,0),175,"ff8b38",1.8,.8)

details=runpy.run_path(str(Path(__file__).with_name("study-details.py")), init_globals=globals())
external=details["external"]

# A real Cycles still is useful for diagnosing art direction independently of
# runtime color management. It is kept in ignored output, not used as a backdrop.
bpy.ops.object.camera_add(location=xyz((0, 2.6, 6.4)))
camera = bpy.context.object
camera.rotation_euler = (Vector(xyz((0, .3, -.3))) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 23.8
scene.camera = camera
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100
preview = ROOT / "output/study-research/study-cycles.png"
scene.render.filepath = str(preview)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "output/study-research/study.blend"))
if os.environ.get("SKIP_PREVIEW") != "1":
    bpy.ops.render.render(write_still=True)
for o in preview_only:
    o.hide_render = True

# Bake color and irradiance into one shared non-overlapping UV atlas. Exported
# geometry retains depth/parallax and receives the live task light every frame.
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.update()
for o in static:
    uv=o.data.uv_layers.active
    if uv: uv.name="MaterialUV"
    else: uv=o.data.uv_layers.new(name="MaterialUV")
    if any(slot.material and slot.material.name in [walnut.name,edge.name,panel.name] for slot in o.material_slots):
        for poly in o.data.polygons:
            normal=o.matrix_world.to_3x3()@poly.normal
            axis=max(range(3),key=lambda i:abs(normal[i]))
            for li in poly.loop_indices:
                v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
                xy=(v.x,v.y) if axis==2 else (v.x,v.z) if axis==1 else(v.y,v.z)
                uv.data[li].uv=(xy[0]*.62,xy[1]*.62)
    o.data.uv_layers.new(name="BakeUV")
    o.data.uv_layers.active=o.data.uv_layers["BakeUV"]
    o.data.uv_layers["BakeUV"].active_render=True
    o.select_set(True)
bpy.context.view_layer.objects.active = static[0]
bpy.ops.object.join()
room = bpy.context.object
room.name = "Atelier — static surfaces"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.006)
bpy.ops.object.mode_set(mode="OBJECT")


def bake(name, passes, fmt, kind="DIFFUSE", size=4096):
    image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=fmt == "HDR")
    image.colorspace_settings.name = "Non-Color" if fmt == "HDR" else "sRGB"
    for slot in room.material_slots:
        nodes = slot.material.node_tree.nodes
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        nodes.active = node
    scene.render.bake.use_pass_color = "COLOR" in passes
    scene.render.bake.use_pass_direct = "DIRECT" in passes
    scene.render.bake.use_pass_indirect = "INDIRECT" in passes
    bpy.ops.object.bake(type=kind)
    image.file_format = fmt
    image.filepath_raw = str(OUT / name)
    image.save()
    return image


# Diffuse color bake must preserve metallic F0 colors rather than baking black.
original=[]
for slot in room.material_slots:
    bsdf=slot.material.node_tree.nodes.get("Principled BSDF")
    original.append((slot.material,bsdf.inputs["Roughness"].default_value,bsdf.inputs["Metallic"].default_value))
    bsdf.inputs["Metallic"].default_value=0
color = bake("atelier-color.png", {"COLOR"}, "PNG", size=4096)
bake("atelier-light.hdr", {"DIRECT", "INDIRECT"}, "HDR", size=2048)
bake("atelier-emission.hdr", set(), "HDR", "EMIT", size=1024)
denoiser = runpy.run_path(str(Path(__file__).with_name("denoise-atelier.py")))
denoiser["denoise_atlas"](OUT / "atelier-light.hdr")
# Retain distinct surface response and photographed timber normal/roughness.
cache={}
for i,(source,rough,metal) in enumerate(original):
    wood=source.name in [walnut.name,edge.name,panel.name]
    key=(source.name if wood else "atlas",round(rough,3),round(metal,3))
    if key not in cache:
        m=source.copy() if wood else material("study surface %.3f %.3f"%(rough,metal),"ffffff",rough,metal)
        bsdf=m.node_tree.nodes.get("Principled BSDF");bsdf.inputs["Metallic"].default_value=metal
        if not wood:
            uv=m.node_tree.nodes.new("ShaderNodeUVMap");uv.uv_map="BakeUV"
            texture=m.node_tree.nodes.new("ShaderNodeTexImage");texture.image=color;m.node_tree.links.new(uv.outputs["UV"],texture.inputs["Vector"]);m.node_tree.links.new(texture.outputs["Color"],bsdf.inputs["Base Color"])
        cache[key]=m
    room.data.materials[i]=cache[key]
raw=ROOT/"output/fidelity-research";raw.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(raw / "atelier.glb"), use_selection=True, export_format="GLB", export_yup=True)
subprocess.run(["node",str(Path(__file__).with_name("pack-fidelity.mjs")),str(raw/"atelier.glb"),str(OUT/"atelier")],check=True)
bpy.ops.object.select_all(action="DESELECT")
for o in external:o.select_set(True)
bpy.context.view_layer.objects.active=external[0]
bpy.ops.export_scene.gltf(filepath=str(raw/"study-props.glb"),use_selection=True,export_format="GLB",export_yup=True)
subprocess.run(["node",str(Path(__file__).with_name("pack-fidelity.mjs")),str(raw/"study-props.glb"),str(OUT/"study-props")],check=True)
print("ATELIER_BAKED", len(room.data.vertices), "vertices", OUT, flush=True)
