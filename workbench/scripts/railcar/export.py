"""Export the railcar for the browser: full-resolution materials, baked light.

Run inside Blender after build.main() (or on output/railcar/railcar.blend):
    import export; export.run()

The first export baked every surface's colour into one 4096 atlas per group.
With tens of thousands of tiny islands that left 4-10% of the atlas in use
(~14 mm per texel) and the room went soft. This version ships what Cycles
actually shades:

  * every static object keeps its own material; each group is split into one
    mesh per material (node name "<group>|<material>")
  * materials the browser can rebuild exactly carry a recipe (mats.runtime):
    box-projected photo textures, gilt, metals, damask, art glass, bindings.
    Their source textures are copied to export/tex at full resolution.
  * UV-mapped materials (Poly Haven furniture, carpet, desk leather, dial,
    globe, labels...) are baked onto their own UVs at up to 2 px/mm
    (colour, roughness/metal, tangent normal)
  * plain constant materials ship as numbers
  * anything else (logs, embers, a few procedural props) falls back to a
    small per-group atlas
  * light: diffuse irradiance and emission are baked per group onto a second,
    properly packed UV ("LightUV"), stored RGBM in lossless 8-bit WebP

Coplanar faces of different objects that face the same way z-fight in a
rasteriser; resolve_coplanar() deletes the covered one or pushes the smaller
one back 1 mm before anything is merged.

Outputs in workbench/assets/railcar/export/:
  railcar-{group}.glb, railcar-{group}-light.webp, railcar-{group}-emit.webp,
  tex/*  (recipe textures + per-material bakes), railcar-glass.glb,
  railcar-paintings.glb, railcar-sky.webp (window HDRI), railcar-manifest.json
"""
import json
import hashlib
import math
import os
import shutil
import subprocess
import time
from collections import defaultdict

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from cycles_random import object_random

ROOT = os.environ.get("LJ_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))
OUT = os.path.join(ROOT, "workbench/assets/railcar/export")
TEXOUT = os.path.join(OUT, "tex")
TMP = os.path.join(ROOT, "output/railcar/export-tmp")
OIDN = os.path.join(ROOT, "output/oidn-2.3.3.arm64.macos/bin/oidnDenoise")
LOG = os.path.join(ROOT, "output/railcar/export-log.txt")

GROUPS = {  # name: (lightmap size, emission size, light samples, px per unit for UV bakes, max bake size)
    "desk": (2048, 1024, 384, 200, 4096),
    "furnishings": (4096, 2048, 256, 100, 2048),
    "architecture": (4096, 2048, 256, 100, 2048),
}
SKIP_COLLECTIONS = {"jewellery cases"}  # rebuilt live in the browser
RGBM_RANGE = 16.0
PACK_MARGIN = 0.0015


def log(*a):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a) + "\n")


def principled(m):
    if not m or not m.use_nodes:
        return None
    return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def output_node(nt):
    return next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)


def physical_parameters(material):
    """Unlinked authored BSDF parameters; keep linked inputs explicit for review."""
    b = principled(material)
    if not b:
        return {}
    result = {}
    for socket_name, key in (("Sheen Weight", "sheen"), ("Sheen Roughness", "sheenRough"),
                             ("Coat Weight", "coat"), ("Coat Roughness", "coatRough"),
                             ("Sheen Tint", "sheenTint")):
        socket = b.inputs.get(socket_name)
        if socket is None:
            continue
        if socket.is_linked:
            result[key + "Linked"] = True
        else:
            value = socket.default_value
            result[key] = [float(x) for x in value[:3]] if key == "sheenTint" else float(value)
    return result


def is_glass(m):
    if not m:
        return False
    if m.name.startswith(("rc gem", "rc loose diamond", "rc lead crystal", "rc whisky", "rc cognac", "rc gin", "rc window glass",
                          "rc bottle glass", "rc siphon glass", "rc amethyst")):
        return True
    b = principled(m)
    if "tulip" in m.name:
        return False
    if b and not b.inputs["Transmission Weight"].is_linked and b.inputs["Transmission Weight"].default_value > 0.5:
        return True
    lower = m.name.lower()
    return "glass" in lower and not any(k in lower for k in ("art glass", "cased glass", "tulip", "opal"))


def world_bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx


def classify():
    groups = {g: [] for g in GROUPS}
    glass, canvases, skipped, windows = [], [], [], []
    for o in bpy.context.scene.objects:
        if o.type not in ("MESH", "CURVE", "FONT") or o.hide_render:
            continue
        cols = {c.name for c in o.users_collection}
        if cols & SKIP_COLLECTIONS:
            skipped.append(o)
            continue
        mats = [s.material for s in o.material_slots if s.material]
        names = " ".join(m.name for m in mats)
        if " window " in o.name and o.name.endswith(" pane"):
            windows.append(o)  # glazing: reflection-only glass in the browser
            continue
        if "rc flame" in names or o.name.endswith(" pane"):
            skipped.append(o)
            continue
        if mats and all(is_glass(m) for m in mats):
            glass.append(o)
            continue
        if mats and any(m.name.endswith(" canvas") for m in mats):
            canvases.append(o)
            continue
        mn, mx = world_bbox(o)
        cen = (mn + mx) / 2
        size = mx - mn
        col = next((c.name for c in o.users_collection), "")
        if col.startswith("car "):
            groups["architecture"].append(o)
        elif -8.8 < cen.x < 8.8 and -4.8 < cen.y < 6.4 and -9.2 < cen.z < 4.0 and max(size) < 18:
            groups["desk"].append(o)
        else:
            groups["furnishings"].append(o)
    return groups, glass, canvases, skipped, windows


def realise(objs):
    """Apply modifiers / convert curves so UVs and bakes see final geometry."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.make_single_user(object=True, obdata=True, material=False, animation=False)
    bpy.ops.object.convert(target="MESH")
    return [o for o in bpy.context.selected_objects if o.type == "MESH"]


# ---------------------------------------------------------------- attributes

def coordinate_attributes(objs):
    """Freeze per-object texture coordinates (Generated, Object + object-space
    normal, Object Info random) into mesh attributes so pieces can be merged
    without changing how their materials look, and so the browser can rebuild
    object-space projections. Names start with "_" so glTF exports them."""
    for o in objs:
        me = o.data
        n = len(me.vertices)
        if n == 0:
            continue
        co = np.empty(n * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        nrm = np.empty(n * 3, dtype=np.float32)
        me.vertex_normals.foreach_get("vector", nrm)
        mn, mx = co.min(0), co.max(0)
        gen = (co - mn) / np.maximum(mx - mn, 1e-6)
        for name, values in (("_lj_gen", gen), ("_lj_obj", co), ("_lj_onrm", nrm.reshape(-1, 3))):
            a = me.attributes.get(name) or me.attributes.new(name, "FLOAT_VECTOR", "POINT")
            a.data.foreach_set("vector", np.ascontiguousarray(values, dtype=np.float32).ravel())
        r = me.attributes.get("_lj_rand") or me.attributes.new("_lj_rand", "FLOAT", "POINT")
        r.data.foreach_set("value", np.full(n, object_random(o.name), dtype=np.float32))
    mats = {s.material for o in objs for s in o.material_slots if s.material and s.material.use_nodes}
    for m in mats:
        nt = m.node_tree
        for node in list(nt.nodes):
            if node.type == "TEX_COORD":
                for out, attr in (("Generated", "_lj_gen"), ("Object", "_lj_obj")):
                    if node.outputs[out].is_linked:
                        a = nt.nodes.new("ShaderNodeAttribute")
                        a.attribute_type = "GEOMETRY"
                        a.attribute_name = attr
                        for link in list(node.outputs[out].links):
                            nt.links.new(a.outputs["Vector"], link.to_socket)
            if node.type == "OBJECT_INFO" and node.outputs["Random"].is_linked:
                a = nt.nodes.new("ShaderNodeAttribute")
                a.attribute_type = "GEOMETRY"
                a.attribute_name = "_lj_rand"
                for link in list(node.outputs["Random"].links):
                    nt.links.new(a.outputs["Fac"], link.to_socket)


# ---------------------------------------------------------------- coplanar faces

def _inside(pt, poly, eps=1e-4):
    x, y = pt
    c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[i - 1]
        # on an edge counts as inside
        ex, ey = x2 - x1, y2 - y1
        L2 = ex * ex + ey * ey
        if L2 > 0:
            t = max(0.0, min(1.0, ((x - x1) * ex + (y - y1) * ey) / L2))
            if (x - x1 - t * ex) ** 2 + (y - y1 - t * ey) ** 2 < eps * eps:
                return True
        if (y1 > y) != (y2 > y) and x < ex * (y - y1) / (ey if ey else 1e-12) + x1:
            c = not c
    return c


def _area(poly):
    return abs(sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly)))) / 2


def _positive_polygon_overlap(a, b, eps=1e-5):
    """Positive-area overlap, not just overlapping axis-aligned bounds.

    Separating axes are exact for convex faces. Concave n-gons are first
    tessellated, so separated portions of decorative faces cannot trigger a
    false repair. Shared edges are intentional joinery, not an overlap.
    """
    def convex(poly):
        signs=[]
        for i,p in enumerate(poly):
            q,r=poly[(i+1)%len(poly)],poly[(i+2)%len(poly)]
            cross=(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0])
            if abs(cross)>eps:signs.append(cross>0)
        return not signs or all(s==signs[0] for s in signs)
    def sat(p,q):
        for poly in (p,q):
            for i,v in enumerate(poly):
                w=poly[(i+1)%len(poly)];axis=(v[1]-w[1],w[0]-v[0])
                length=math.hypot(*axis)
                if length<eps:continue
                pa=[(x*axis[0]+y*axis[1])/length for x,y in p]
                pb=[(x*axis[0]+y*axis[1])/length for x,y in q]
                if min(max(pa),max(pb))-max(min(pa),min(pb))<=eps:return False
        return True
    if not sat(a,b):return False
    if convex(a) and convex(b):return True
    from mathutils.geometry import tessellate_polygon
    def triangles(poly):
        return [[(v.x,v.y) for v in t] for t in tessellate_polygon([[Vector((x,y,0)) for x,y in poly]])]
    return any(sat(p,q) for p in triangles(a) for q in triangles(b))


def resolve_coplanar(objs, step=0.002, push=0.01, preserve_bake_positions=False):
    """Axis-aligned faces of different objects lying in one plane and facing
    the same way: delete a face wholly covered by another (identical look, no
    flicker); push the smaller of two partly overlapping faces back by `push`."""
    faces = []
    bms = []
    for oi, o in enumerate(objs):
        if preserve_bake_positions:
            attribute=o.data.attributes.get('_lj_bake_pos') or o.data.attributes.new('_lj_bake_pos','FLOAT_VECTOR','POINT')
            attribute.data.foreach_set('vector',np.array([o.matrix_world@v.co for v in o.data.vertices],dtype=np.float32).ravel())
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        bms.append(bm)
        M = o.matrix_world
        R = M.to_3x3().inverted().transposed()
        for f in bm.faces:
            n = R @ f.normal
            if n.length < 1e-9:
                continue
            n.normalize()
            ax = max(range(3), key=lambda i: abs(n[i]))
            if abs(n[ax]) < 0.9995:
                continue
            vs = [M @ v.co for v in f.verts]
            o2 = [i for i in range(3) if i != ax]
            poly = [(v[o2[0]], v[o2[1]]) for v in vs]
            area = _area(poly)
            if area < 1e-6:
                continue
            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]
            plane = sum(v[ax] for v in vs) / len(vs)
            faces.append((oi, f.index, ax, 1 if n[ax] > 0 else -1, plane, poly, (min(xs), max(xs), min(ys), max(ys)), area))
    buckets = defaultdict(list)
    for k, f in enumerate(faces):
        buckets[(f[2], f[3], round(f[4] / step))].append(k)
    delete, pushed = set(), set()
    for k, a in enumerate(faces):
        ka = (a[0], a[1])
        cands = []
        for d in (-1, 0, 1):
            cands += buckets.get((a[2], a[3], round(a[4] / step) + d), [])
        cx = sum(p[0] for p in a[5]) / len(a[5])
        cy = sum(p[1] for p in a[5]) / len(a[5])
        shrunk = [(cx + (p[0] - cx) * 0.999, cy + (p[1] - cy) * 0.999) for p in a[5]]
        for j in cands:
            if j == k:
                continue
            b = faces[j]
            if abs(a[4] - b[4]) > step:
                continue
            if b[0] == a[0]:
                continue  # one object's own faces are modelled on purpose
            A, B = a[6], b[6]
            w = min(A[1], B[1]) - max(A[0], B[0])
            h = min(A[3], B[3]) - max(A[2], B[2])
            if w <= 1e-4 or h <= 1e-4:
                continue
            if not _positive_polygon_overlap(a[5],b[5]):
                continue
            a_in_b = all(_inside(p, b[5]) for p in shrunk)
            if a_in_b:
                bcx = sum(p[0] for p in b[5]) / len(b[5])
                bcy = sum(p[1] for p in b[5]) / len(b[5])
                b_in_a = all(_inside((bcx + (p[0] - bcx) * 0.999, bcy + (p[1] - bcy) * 0.999), a[5]) for p in b[5])
                if not b_in_a or (b[0], b[1]) < ka:
                    delete.add(ka)
                    break
            elif a[7] <= b[7]:
                pushed.add(ka)
    pushed -= delete
    for oi, (o, bm) in enumerate(zip(objs, bms)):
        dels = [bm.faces[fi] for (oj, fi) in delete if oj == oi]
        pushes = [bm.faces[fi] for (oj, fi) in pushed if oj == oi]
        if not dels and not pushes:
            bm.free()
            continue
        scale = max(o.matrix_world.to_scale())
        moved = set()
        for f in pushes:
            off = -f.normal * (push / max(scale, 1e-6))
            for v in f.verts:
                if v.index not in moved:
                    v.co += off
                    moved.add(v.index)
        if dels:
            bmesh.ops.delete(bm, geom=dels, context="FACES_ONLY")
        bm.to_mesh(o.data)
        bm.free()
    log("coplanar: deleted", len(delete), "faces, pushed", len(pushed))
    return len(delete), len(pushed)


# ---------------------------------------------------------------- materials

def recipe(m):
    if m and "lj" in m:
        return json.loads(m["lj"])
    return None


def _uses_uv(sock, depth=0):
    """True when a texture vector input ultimately comes from a UV map."""
    if not sock.is_linked:
        return True
    n = sock.links[0].from_node
    if n.type == "UVMAP":
        return True
    if n.type == "TEX_COORD":
        return sock.links[0].from_socket.name == "UV"
    if depth > 8:
        return False
    ins = [i for i in n.inputs if i.type == "VECTOR" and i.is_linked]
    return bool(ins) and all(_uses_uv(i, depth + 1) for i in ins)


def classify_material(m):
    r = recipe(m)
    if r:
        return r
    if not m or not m.use_nodes:
        return {"kind": "plain", "color": [0.5, 0.5, 0.5], "roughness": 0.6, "metallic": 0.0}
    nt = m.node_tree
    b = principled(m)
    imgs = [n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image]
    procs = [n for n in nt.nodes if n.type.startswith("TEX_") and n.type not in ("TEX_IMAGE", "TEX_COORD")]
    linked = b and any(b.inputs[k].is_linked for k in
                       ("Base Color", "Roughness", "Metallic", "Emission Color", "Emission Strength", "Normal", "Alpha"))
    if b and not imgs and not procs and not linked:
        em = b.inputs["Emission Strength"].default_value
        return {"kind": "plain", "color": [round(x, 4) for x in b.inputs["Base Color"].default_value[:3]],
                "roughness": round(b.inputs["Roughness"].default_value, 3),
                "metallic": round(b.inputs["Metallic"].default_value, 3),
                "sheen": round(b.inputs["Sheen Weight"].default_value, 3),
                "coat": round(b.inputs["Coat Weight"].default_value, 3),
                "emission": [round(x * em, 4) for x in b.inputs["Emission Color"].default_value[:3]] if em > 0 else None}
    if imgs and all(_uses_uv(n.inputs["Vector"]) for n in imgs):
        return {"kind": "uvbake"}
    return {"kind": "atlas"}


def albedo_copy(m):
    c = m.copy()
    c.name = m.name + " [albedo]"
    nt = c.node_tree
    b = principled(c)
    out = output_node(nt)
    if not b or not out:
        return c
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    if b.inputs["Base Color"].is_linked:
        nt.links.new(b.inputs["Base Color"].links[0].from_socket, em.inputs["Color"])
    else:
        em.inputs["Color"].default_value = b.inputs["Base Color"].default_value
    for l in list(out.inputs["Volume"].links):
        nt.links.remove(l)
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return c


def orm_copy(m):
    """Emit (1, roughness, metallic) - the glTF ORM layout."""
    c = m.copy()
    c.name = m.name + " [orm]"
    nt = c.node_tree
    b = principled(c)
    out = output_node(nt)
    if not out:
        return c
    comb = nt.nodes.new("ShaderNodeCombineColor")
    comb.inputs[0].default_value = 1.0
    for idx, key in ((1, "Roughness"), (2, "Metallic")):
        if b and b.inputs[key].is_linked:
            nt.links.new(b.inputs[key].links[0].from_socket, comb.inputs[idx])
        else:
            comb.inputs[idx].default_value = b.inputs[key].default_value if b else (0.6 if idx == 1 else 0.0)
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(comb.outputs[0], em.inputs["Color"])
    for l in list(out.inputs["Volume"].links):
        nt.links.remove(l)
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return c


def neutral_copy(m):
    """White receiver used only with independent authored transport geometry."""
    c = m.copy()
    nt = c.node_tree
    out = output_node(nt)
    d = nt.nodes.new('ShaderNodeBsdfDiffuse')
    d.inputs['Color'].default_value = (1, 1, 1, 1)
    nt.links.new(d.outputs[0], out.inputs['Surface'])
    return c


def diffuse_copy(m):
    """Neutral bake receiver; secondary rays retain the original surface.

    Replacing a whole group with white diffuse changes its bounced light
    (the clock measured ~7x too bright). The initial bake segment has camera
    visibility; later rays retain the authored BSDF and emission. Ray-depth
    thresholds are insufficient: merged selection changed the clock's bake.
    Receiver normals stay geometric; the browser supplies surface detail.
    """
    c = m.copy()
    c.name = m.name + " [irradiance]"
    nt = c.node_tree
    out = output_node(nt)
    if not out:
        return c
    surface = out.inputs["Surface"]
    original = surface.links[0].from_socket if surface.is_linked else None
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    d.inputs["Color"].default_value = (1, 1, 1, 1)
    if original is None:
        nt.links.new(d.outputs[0], surface)
        return c
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(original, mix.inputs[1])
    nt.links.new(d.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], surface)
    return c


def normalise_material_uvs(mats):
    """Make every image lookup that relied on the default UV name UVMap
    explicitly, so baking onto other UV layers never moves the textures."""
    for m in mats:
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type == "UVMAP":
                n.uv_map = "UVMap"
            if n.type == "TEX_IMAGE" and not n.inputs["Vector"].is_linked:
                uv = nt.nodes.new("ShaderNodeUVMap")
                uv.uv_map = "UVMap"
                nt.links.new(uv.outputs[0], n.inputs["Vector"])
            if n.type == "TEX_COORD" and n.outputs["UV"].is_linked:
                uv = nt.nodes.new("ShaderNodeUVMap")
                uv.uv_map = "UVMap"
                for link in list(n.outputs["UV"].links):
                    nt.links.new(uv.outputs[0], link.to_socket)
            if n.type == "NORMAL_MAP":
                n.uv_map = "UVMap"


# ---------------------------------------------------------------- meshes

def ensure_uvmap(objs):
    for o in objs:
        me = o.data
        for extra in list(me.uv_layers)[1:]:
            me.uv_layers.remove(extra)
        if me.uv_layers:
            me.uv_layers[0].name = "UVMap"
        else:
            me.uv_layers.new(name="UVMap")


def select(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def merge(name, objs):
    select(objs)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    j.name = f"railcar {name}"
    return j


def split_by_material(group, obj):
    """One object per material, named '<group>|<material>'."""
    select([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    pieces = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    out = {}
    for o in pieces:
        used = {p.material_index for p in o.data.polygons}
        if not used:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        mat = o.material_slots[next(iter(used))].material
        o.data.materials.clear()
        o.data.materials.append(mat)
        for p in o.data.polygons:
            p.material_index = 0
        name = mat.name if mat else "rc default"
        o.name = o.data.name = f"{group}|{name}"
        out[name] = o
    return out


def unwrap(objs, layer, angle=66.0):
    """Smart-project `layer` across all objs together, then pack tightly."""
    for o in objs:
        me = o.data
        uv = me.uv_layers.get(layer) or me.uv_layers.new(name=layer)
        me.uv_layers.active = uv
    select(objs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, rotate_method="ANY", scale=True,
                            merge_overlap=False, margin_method="FRACTION", margin=PACK_MARGIN, pin=False,
                            shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers["UVMap"]


def uv_coverage(objs, layer):
    """Fraction of the unit square covered by `layer` (sum of UV triangle areas)."""
    total = 0.0
    for o in objs:
        me = o.data
        uv = me.uv_layers[layer].data
        for p in me.polygons:
            pts = [uv[i].uv for i in p.loop_indices]
            total += abs(sum(pts[i - 1].x * pts[i].y - pts[i].x * pts[i - 1].y for i in range(len(pts)))) / 2
    return total


def world_area(objs):
    return sum(p.area for o in objs for p in o.data.polygons)


def pow2(x, lo, hi):
    return int(min(hi, max(lo, 2 ** math.ceil(math.log2(max(x, 1))))))


# ---------------------------------------------------------------- baking

def attach_target(objs, image, uv_layer):
    seen = set()
    for o in objs:
        for s in o.material_slots:
            m = s.material
            if not m or m.name in seen:
                continue
            seen.add(m.name)
            nt = m.node_tree
            n = nt.nodes.get("__bake_target__") or nt.nodes.new("ShaderNodeTexImage")
            n.name = "__bake_target__"
            n.image = image
            uv = nt.nodes.get("__bake_uv__") or nt.nodes.new("ShaderNodeUVMap")
            uv.name = "__bake_uv__"
            uv.uv_map = uv_layer
            nt.links.new(uv.outputs[0], n.inputs["Vector"])
            for x in nt.nodes:
                x.select = False
            n.select = True
            nt.nodes.active = n


def detach_target(objs):
    for o in objs:
        for s in o.material_slots:
            m = s.material
            if m and m.use_nodes:
                for nm in ("__bake_target__", "__bake_uv__"):
                    n = m.node_tree.nodes.get(nm)
                    if n:
                        m.node_tree.nodes.remove(n)


def swap(objs, maker, cache):
    originals = []
    for o in objs:
        row = []
        for s in o.material_slots:
            row.append(s.material)
            if s.material:
                if s.material.name not in cache:
                    cache[s.material.name] = maker(s.material)
                s.material = cache[s.material.name]
        originals.append(row)
    return originals


def restore(objs, originals):
    for o, row in zip(objs, originals):
        for s, m in zip(o.material_slots, row):
            s.material = m


def bake(objs, kind, image, uv_layer, samples, maker=None, passes=None, normal_space=None):
    s = bpy.context.scene
    s.cycles.samples = samples
    s.render.bake.target = "IMAGE_TEXTURES"
    s.render.bake.use_clear = True
    s.render.bake.margin = max(4, image.size[0] // 512)
    s.render.bake.margin_type = "EXTEND"
    if passes is not None:
        s.render.bake.use_pass_direct = "DIRECT" in passes
        s.render.bake.use_pass_indirect = "INDIRECT" in passes
        s.render.bake.use_pass_color = "COLOR" in passes
    if normal_space:
        s.render.bake.normal_space = normal_space
    for o in objs:
        uv = o.data.uv_layers[uv_layer]
        o.data.uv_layers.active = uv
        uv.active_render = True
    orig = swap(objs, maker, {}) if maker else None
    select(objs)
    attach_target(objs, image, uv_layer)
    t = time.time()
    try:
        bpy.ops.object.bake(type=kind)
    finally:
        detach_target(objs)
        if orig:
            overrides = {slot.material for o in objs for slot in o.material_slots if slot.material}
            restore(objs, orig)
            for material in overrides:
                if material.users == 0:
                    bpy.data.materials.remove(material)
        for o in objs:
            o.data.uv_layers.active = o.data.uv_layers["UVMap"]
            o.data.uv_layers["UVMap"].active_render = True
    log("  bake", kind, image.name, f"{image.size[0]}px", f"{time.time() - t:.0f}s")


def write_pfm(path, img):
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    with open(path, "wb") as f:
        f.write(f"PF\n{w} {h}\n-1.0\n".encode())
        f.write(np.ascontiguousarray(px).astype("<f4").tobytes())


def read_pfm(path):
    with open(path, "rb") as f:
        assert f.readline().strip() == b"PF"
        w, h = map(int, f.readline().split())
        scale = float(f.readline())
        return np.frombuffer(f.read(), dtype="<f4" if scale < 0 else ">f4").reshape(h, w, 3)


def denoise(img):
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    if not os.path.exists(OIDN):
        log("  oidn missing; skipping denoise")
        return px
    os.makedirs(TMP, exist_ok=True)
    src, dst = os.path.join(TMP, img.name + ".pfm"), os.path.join(TMP, img.name + ".dn.pfm")
    write_pfm(src, img)
    r = subprocess.run([OIDN, "--hdr", src, "-o", dst, "-q", "high"], capture_output=True, text=True)
    if r.returncode != 0:
        log("  oidn failed", r.stderr[-400:])
        return px
    log("  denoised", img.name)
    return np.array(read_pfm(dst))


def save_rgbm(px, path, value_range=None):
    """Float RGB -> RGBM (value = rgb * a * RGBM_RANGE), 8-bit lossless WebP
    (bit-exact, ~40% smaller than PNG). `path` may say .png; .webp is written."""
    path = os.path.splitext(path)[0] + ".webp"
    h, w, _ = px.shape
    c = np.clip(px / (value_range or RGBM_RANGE), 0, 1)
    m = np.clip(np.ceil(c.max(-1, keepdims=True) * 255) / 255, 1 / 255, 1)
    rgba = np.concatenate([c / m, m], -1).astype(np.float32)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.alpha_mode = "CHANNEL_PACKED"
    img.pixels.foreach_set(rgba.ravel())
    s = bpy.context.scene.render.image_settings
    s.file_format = "WEBP"
    s.color_mode = "RGBA"
    s.quality = 100  # lossless
    img.save_render(path, scene=bpy.context.scene)
    bpy.data.images.remove(img)


def save_image(img, path, fmt, quality=90):
    img.filepath_raw = path
    img.file_format = fmt
    s = bpy.context.scene.render.image_settings
    s.quality = quality
    img.save()


def new_image(name, size, data=True, alpha=False, float_buffer=False):
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=float_buffer)
    if data:
        img.colorspace_settings.name = "Non-Color"
    return img


def slug(name):
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")


# ---------------------------------------------------------------- export

def copy_texture(path, used):
    """Copy a recipe texture into export/tex once; return its published name."""
    if not path:
        return None
    base = os.path.basename(path)
    if base not in used:
        shutil.copyfile(path, os.path.join(TEXOUT, base))
        used.add(base)
    return "tex/" + base


def set_uv_layers(me, names):
    """Reorder/keep UV layers so `names` become TEXCOORD_0, _1 ..."""
    data = {}
    for n in names:
        lay = me.uv_layers[n]
        buf = np.empty(len(lay.data) * 2, dtype=np.float32)
        lay.data.foreach_get("uv", buf)
        data[n] = buf
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    for n in names:
        lay = me.uv_layers.new(name=n)
        lay.data.foreach_set("uv", data[n])


def keep_attributes(me, names):
    for a in [a for a in me.attributes if a.name.startswith("_lj_") and a.name not in names]:
        me.attributes.remove(a)


def _export_group(name, pieces, specs):
    """pieces: {material name: object}; one node per material."""
    objs = list(pieces.values())
    for mat, o in pieces.items():
        spec = specs[mat]
        me = o.data
        uv_names = ["UVMap", "LightUV"] if spec["kind"] in ("uvbake", "atlas") else ["LightUV"]
        if spec["kind"] == "atlas":
            # the atlas UV replaces the material's own UVs for export
            me.uv_layers.remove(me.uv_layers["UVMap"])
            me.uv_layers["AtlasUV"].name = "UVMap"
        set_uv_layers(me, uv_names)
        spec["uv"] = len(uv_names) - 1  # TEXCOORD index of the lightmap
        keep = set()
        if spec["kind"] == "box" and spec.get("space") == "object":
            keep |= {"_lj_obj", "_lj_onrm"}
        if spec["kind"] == "bindings":
            keep |= {"_lj_gen", "_lj_rand"}
        keep_attributes(me, keep)
        o.data.materials.clear()
    select(objs)
    path = os.path.join(OUT, f"railcar-{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True,
                              export_materials="NONE", export_texcoords=True, export_normals=True,
                              export_attributes=True, export_apply=True, export_cameras=False,
                              export_lights=False)
    faces = sum(len(o.data.polygons) for o in objs)
    log("  exported", path, faces, "faces", len(objs), "meshes")
    return {"faces": faces, "meshes": len(objs), "file": os.path.basename(path)}


def export_group(name, pieces, specs):
    """Strip materials/UVs only on temporary delivery copies.

    Later groups still bounce light off earlier groups. Clearing the source
    material slots turned the already-exported desk into default white clay
    while baking the furnishings, independently of the receiver override.
    """
    copies = {}
    try:
        for mat, original in pieces.items():
            copy = original.copy()
            copy.data = original.data.copy()
            bpy.context.scene.collection.objects.link(copy)
            copies[mat] = copy
        # glTF uses object names as material recipe keys in the browser.
        for mat, copy in copies.items():
            original = pieces[mat]
            original.name = f"__bake_source__{name}|{mat}"
            copy.name = f"{name}|{mat}"
        return _export_group(name, copies, specs)
    finally:
        for copy in copies.values():
            mesh = copy.data
            bpy.data.objects.remove(copy, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for mat, original in pieces.items():
            original.name = f"{name}|{mat}"


def export_simple(name, objs):
    if not objs:
        return None
    select(objs)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    path = os.path.join(OUT, f"railcar-{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=92, export_apply=True,
                              export_cameras=False, export_lights=False)
    log("  exported", path, len(objs), "objects")
    return {"objects": len(objs), "file": os.path.basename(path)}


def export_sky(manifest=None):
    """The world HDRI the windows show (lights.py), as RGBM for the browser."""
    import ph
    path = ph.hdri("sunset_forest")
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    save_rgbm(px, os.path.join(OUT, "railcar-sky.webp"))
    log("  sky", w, h)
    if manifest is not None:
        manifest["sky"] = "railcar-sky.webp"
    return "railcar-sky.webp"


def app(v):
    """Blender (x, y, z) -> application (x, z, -y)."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def run(groups_only=None, output_dir=None, authored_lighting=False, appearance_factor=False, appearance_mode="irradiance"):
    # Partial/diagnostic exports must never erase the live texture directory
    # or replace its complete manifest with a partial one.
    global OUT, TEXOUT
    if appearance_factor and not authored_lighting:
        raise ValueError('Appearance responses require intact authored transport')
    if groups_only and output_dir is None:
        raise ValueError("groups_only requires a separate output_dir; partial exports cannot replace live assets")
    OUT = os.path.abspath(os.fspath(output_dir)) if output_dir is not None else os.path.join(ROOT, "workbench/assets/railcar/export")
    if groups_only and os.path.realpath(OUT) == os.path.realpath(os.path.join(ROOT, "workbench/assets/railcar/export")):
        raise ValueError("partial exports cannot target the live export directory")
    TEXOUT = os.path.join(OUT, "tex")
    os.makedirs(OUT, exist_ok=True)
    if os.path.isdir(TEXOUT):
        shutil.rmtree(TEXOUT)
    os.makedirs(TEXOUT)
    open(LOG, "w").close()
    t0 = time.time()
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "GPU"
    s.cycles.use_denoising = False
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "output/railcar/railcar-export.blend"))
    import fireplace
    import shell
    fire = getattr(fireplace, "FIRE_WORLD", None)
    groups, glass, canvases, skipped, windows = classify()
    log("classified", {k: len(v) for k, v in groups.items()}, "glass", len(glass), "canvas", len(canvases), "skipped", len(skipped))
    for o in skipped:
        o.hide_render = True
    statics = [o for g in groups.values() for o in g]
    realised = realise(statics + glass + canvases + windows)
    rset = {o.name for o in realised}
    for k in groups:
        groups[k] = [bpy.data.objects[o.name] for o in groups[k] if o.name in rset and len(bpy.data.objects[o.name].data.polygons)]
    glass = [bpy.data.objects[o.name] for o in glass if o.name in rset]
    canvases = [bpy.data.objects[o.name] for o in canvases if o.name in rset]
    windows = [bpy.data.objects[o.name] for o in windows if o.name in rset]
    allstatic = [o for g in groups.values() for o in g]
    # Freeze the native shader coordinates first. The transport copies below
    # share those shaders, so they must also contain every referenced attribute.
    # Copying the meshes earlier left their texture coordinates and random IDs
    # at zero after material graphs were rewritten for delivery.
    coordinate_attributes(allstatic)
    ensure_uvmap(allstatic)
    normalise_material_uvs({sl.material for o in allstatic for sl in o.material_slots if sl.material})
    # Keep the authored room intact for light transport. Delivery receivers are
    # merged/UV-packed below, but must never replace the surfaces seen by bounce
    # and shadow rays. In particular, white merged receivers lose rug shadows
    # and alter the clock's illumination. This mode supersedes subset overrides.
    transport = []
    if authored_lighting:
        for source in allstatic:
            original = source.copy()
            original.data = source.data.copy()
            original.name = '__authored_transport__' + source.name
            bpy.context.scene.collection.objects.link(original)
            original.visible_camera = False
            transport.append(original)
            for flag in ('visible_diffuse', 'visible_glossy', 'visible_transmission',
                         'visible_shadow', 'visible_volume_scatter'):
                setattr(source, flag, False)
        log('authored transport', len(transport), 'independent source surfaces')
    if authored_lighting:
        # The authored scene is the reference. Nearby parallel faces include
        # intentional printed labels and veneers; deleting them changes the
        # approved room. Export these evaluated surfaces exactly as authored.
        log('authored geometry preserved; no automatic coplanar deletion or push')
    else:
        resolve_coplanar(allstatic)
    log("prepared", f"{time.time() - t0:.0f}s")

    manifest = {"version": 2, "units": "1 unit = 10 cm; app coords (x, y-up, z)", "rgbmRange": RGBM_RANGE,
                "bake": {"receiver": "neutral diffuse for camera visibility; authored BSDF for other rays",
                         "authoredLighting": authored_lighting,
                         "authoredGeometryPreserved": authored_lighting,
                         "requiredCollectionOverrides": [] if authored_lighting else (["longcase clock"] if not groups_only or "furnishings" in groups_only else [])
                                                        + (["persian carpet"] if not groups_only or "architecture" in groups_only else []),
                         "exporterSha256": hashlib.sha256(open(__file__, "rb").read()).hexdigest(),
                         "groups": {k: {"lightSize": v[0], "emitSize": v[1], "samples": v[2],
                                        "surfaceDensity": v[3], "maxSurfaceSize": v[4]} for k, v in GROUPS.items()}},
                "fire": app(fire) if fire else None,
                "room": {"x": [shell.X0, shell.X1], "floor": -9.0, "back_wall_z": -shell.Y_BACK, "front_wall_z": -shell.Y_FRONT,
                         "ceiling": shell.CL_TOP + 0.9},
                "groups": {}}
    used_tex = set()
    for name, (lsize, esize, samples, density, max_bake) in GROUPS.items():
        if groups_only and name not in groups_only:
            continue
        tg = time.time()
        pieces = split_by_material(name, merge(name, groups[name]))
        objs = list(pieces.values())
        specs = {mat: classify_material(o.material_slots[0].material) for mat, o in pieces.items()}
        for mat, ob in pieces.items():
            specs[mat].update(physical_parameters(ob.material_slots[0].material))
        log("group", name, len(objs), "materials", {k: sum(1 for s in specs.values() if s["kind"] == k) for k in
                                                       sorted({s["kind"] for s in specs.values()})})
        # ---- light
        unwrap(objs, "LightUV")
        log("  LightUV coverage", f"{uv_coverage(objs, 'LightUV'):.2f}")
        light = new_image(f"railcar-{name}-light", lsize, float_buffer=True)
        if authored_lighting:
            positions = {}
            for ob in objs:
                # A bounded 0.1 mm outward bias avoids self-shadow against the
                # coincident authored surface. Delivery positions are restored.
                positions[ob] = np.array([v.co[:] for v in ob.data.vertices], dtype=np.float32)
                normals = np.array([v.normal[:] for v in ob.data.vertices], dtype=np.float32)
                original=ob.data.attributes.get('_lj_bake_pos')
                bake_positions=np.array([v.vector[:] for v in original.data],dtype=np.float32) if original else positions[ob]
                ob.data.vertices.foreach_set('co', (bake_positions + normals * .001).ravel())
                ob.data.update()
            try:
                live_receivers = objs
                if appearance_factor:
                    import appearance_response
                    live_receivers, response_info = appearance_response.bake(objs, specs, name, light, samples, OUT, mode=appearance_mode)
                    manifest.setdefault('appearanceResponses', {})[name] = response_info
                if live_receivers:
                    bake(live_receivers, "DIFFUSE", light, "LightUV", samples, maker=neutral_copy, passes={"DIRECT", "INDIRECT"})
            finally:
                for ob, coordinates in positions.items():
                    ob.data.vertices.foreach_set('co', coordinates.ravel())
                    ob.data.update()
        else:
            bake(objs, "DIFFUSE", light, "LightUV", samples, maker=diffuse_copy, passes={"DIRECT", "INDIRECT"})
        light_pixels = denoise(light)
        light_range = max(RGBM_RANGE, float(2 ** np.ceil(np.log2(max(float(light_pixels.max()), 1)))))
        save_rgbm(light_pixels, os.path.join(OUT, f"railcar-{name}-light.webp"), value_range=light_range)
        emit = new_image(f"railcar-{name}-emit", esize, float_buffer=True)
        bake(objs, "EMIT", emit, "LightUV", 16)
        w, h = emit.size
        save_rgbm(np.array(emit.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3],
                  os.path.join(OUT, f"railcar-{name}-emit.webp"))
        # ---- surfaces
        for mat, o in pieces.items():
            spec = specs[mat]
            if spec["kind"] == "uvbake":
                cov = max(uv_coverage([o], "UVMap"), 0.05)
                size = pow2(math.sqrt(world_area([o]) / cov) * density, 256, max_bake)
                # Keep native UV photographs at their authored resolution. The
                # surface-area heuristic previously shrank the ledger 4-fold.
                source_images = [n.image for n in o.material_slots[0].material.node_tree.nodes
                                 if n.type == 'TEX_IMAGE' and n.image and not n.name.startswith('__bake')]
                if source_images:
                    size = max(size, max(max(image.size) for image in source_images))
                stem = slug(f"{name}-{mat}")
                col = new_image(stem + "-color", size, data=False)
                bake([o], "EMIT", col, "UVMap", 4, maker=albedo_copy)
                save_image(col, os.path.join(TEXOUT, stem + "-color.jpg"), "JPEG", 90)
                orm = new_image(stem + "-orm", size)
                bake([o], "EMIT", orm, "UVMap", 4, maker=orm_copy)
                save_image(orm, os.path.join(TEXOUT, stem + "-orm.jpg"), "JPEG", 90)
                nrm = new_image(stem + "-normal", size)
                bake([o], "NORMAL", nrm, "UVMap", 4, normal_space="TANGENT")
                save_image(nrm, os.path.join(TEXOUT, stem + "-normal.jpg"), "JPEG", 92)
                b = principled(o.material_slots[0].material)
                spec.update(size=size, color=f"tex/{stem}-color.jpg", orm=f"tex/{stem}-orm.jpg",
                            normal=f"tex/{stem}-normal.jpg",
                            sheen=round(b.inputs["Sheen Weight"].default_value, 3) if b else 0,
                            coat=round(b.inputs["Coat Weight"].default_value, 3) if b else 0)
            elif spec["kind"] in ("box", "damask"):
                if spec["kind"] == "box":
                    maps = spec["maps"]
                    for key in ("color", "rough", "normal"):
                        maps[key] = copy_texture(maps.get(key), used_tex)
                else:
                    spec["mask"] = copy_texture(spec["mask"], used_tex)
        atlas = [o for mat, o in pieces.items() if specs[mat]["kind"] == "atlas"]
        if atlas:
            unwrap(atlas, "AtlasUV")
            size = pow2(math.sqrt(world_area(atlas) / max(uv_coverage(atlas, "AtlasUV"), 0.05)) * density, 512, 4096)
            col = new_image(f"railcar-{name}-atlas-color", size, data=False)
            bake(atlas, "EMIT", col, "AtlasUV", 4, maker=albedo_copy)
            save_image(col, os.path.join(TEXOUT, f"{name}-atlas-color.jpg"), "JPEG", 90)
            orm = new_image(f"railcar-{name}-atlas-orm", size)
            bake(atlas, "EMIT", orm, "AtlasUV", 4, maker=orm_copy)
            save_image(orm, os.path.join(TEXOUT, f"{name}-atlas-orm.jpg"), "JPEG", 90)
            for mat, o in pieces.items():
                if specs[mat]["kind"] == "atlas":
                    specs[mat].update(color=f"tex/{name}-atlas-color.jpg", orm=f"tex/{name}-atlas-orm.jpg", size=size)
        info = export_group(name, pieces, specs)
        info.update(light=f"railcar-{name}-light.webp", lightRange=light_range,
                    emit=f"railcar-{name}-emit.webp", materials=specs,
                    lightCoverage=round(uv_coverage(objs, "LightUV"), 3) if all("LightUV" in o.data.uv_layers for o in objs) else None)
        manifest["groups"][name] = info
        json.dump(manifest, open(os.path.join(OUT, 'railcar-checkpoint.json'), 'w'), indent=1)
        log("  group done", name, f"{time.time() - tg:.0f}s")
    if not groups_only:
        manifest["glass"] = export_simple("glass", glass)
        manifest["paintings"] = export_simple("paintings", canvases)
        manifest["windows"] = export_simple("windows", windows)
        export_sky(manifest)
    manifest["seconds"] = round(time.time() - t0)
    json.dump(manifest, open(os.path.join(OUT, "railcar-manifest.json"), "w"), indent=1)
    log("DONE", manifest["seconds"], "s")
    return manifest
