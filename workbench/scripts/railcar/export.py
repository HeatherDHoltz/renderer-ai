"""Bake the railcar into browser assets.

Run inside Blender after build.main() (or on output/railcar/railcar.blend):
    import export; export.run()

Produces in workbench/assets/railcar/export/:
  railcar-{desk,furnishings,architecture}.glb   static geometry, colour atlas (JPEG) on UV0,
                                                materials quantised to a few roughness/metal buckets
  railcar-{group}-light.hdr                     denoised diffuse irradiance (UV0)  -> three lightMap
  railcar-{group}-emit.hdr                      emission (UV0)                     -> three emissiveMap
  railcar-glass.glb                             glassware/loose stones, rendered cheaply at runtime
  railcar-paintings.glb                         canvases with their own full-resolution images
  railcar-manifest.json                         counts, sizes, runtime anchors (fire, windows)

Static lighting is baked, so the browser draws ~40 draw calls of lightmapped
MeshStandardMaterial for the whole room - the budget stays with the jewellery.
"""
import json
import math
import os
import struct
import subprocess
import time
import zlib

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.environ.get("LJ_ROOT", "/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai")
OUT = os.path.join(ROOT, "workbench/assets/railcar/export")
TMP = os.path.join(ROOT, "output/railcar/export-tmp")
OIDN = os.path.join(ROOT, "output/oidn-2.3.3.arm64.macos/bin/oidnDenoise")
LOG = os.path.join(ROOT, "output/railcar/export-log.txt")

GROUPS = {  # name: (colour atlas, light atlas, emission atlas, light samples)
    "desk": (4096, 2048, 1024, 768),
    "furnishings": (4096, 2048, 1024, 512),
    "architecture": (4096, 1024, 1024, 512),
}
SKIP_COLLECTIONS = {"jewellery cases"}  # rebuilt live in the browser
ROUGH_BUCKETS = (0.08, 0.2, 0.35, 0.5, 0.7, 0.9)


def log(*a):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a) + "\n")


def principled(m):
    if not m or not m.use_nodes:
        return None
    return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


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


def top_collection(o):
    for c in o.users_collection:
        return c.name
    return ""


def world_bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx


def classify():
    groups = {g: [] for g in GROUPS}
    glass, canvases, skipped = [], [], []
    for o in bpy.context.scene.objects:
        if o.type not in ("MESH", "CURVE") or o.hide_render:
            continue
        cols = {c.name for c in o.users_collection}
        if cols & SKIP_COLLECTIONS:
            skipped.append(o)
            continue
        mats = [s.material for s in o.material_slots if s.material]
        names = " ".join(m.name for m in mats)
        if "rc flame" in names or " pane" in o.name:
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
        col = top_collection(o)
        if col.startswith("car "):
            groups["architecture"].append(o)
        elif -8.8 < cen.x < 8.8 and -4.8 < cen.y < 6.4 and -9.2 < cen.z < 4.0 and max(size) < 18:
            groups["desk"].append(o)
        else:
            groups["furnishings"].append(o)
    return groups, glass, canvases, skipped


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


def coordinate_attributes(objs):
    """Freeze per-object texture coordinates (Generated, Object, Object Info
    random) into mesh attributes so pieces can be merged before baking without
    changing how their procedural materials look."""
    for o in objs:
        me = o.data
        n = len(me.vertices)
        if n == 0:
            continue
        co = np.empty(n * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        mn, mx = co.min(0), co.max(0)
        gen = (co - mn) / np.maximum(mx - mn, 1e-6)
        for name, values in (("lj_gen", gen), ("lj_obj", co)):
            a = me.attributes.get(name) or me.attributes.new(name, "FLOAT_VECTOR", "POINT")
            a.data.foreach_set("vector", np.ascontiguousarray(values, dtype=np.float32).ravel())
        r = me.attributes.get("lj_rand") or me.attributes.new("lj_rand", "FLOAT", "POINT")
        r.data.foreach_set("value", np.full(n, (zlib.crc32(o.name.encode()) & 0xFFFFFF) / float(0xFFFFFF), dtype=np.float32))
    mats = {s.material for o in objs for s in o.material_slots if s.material and s.material.use_nodes}
    for m in mats:
        nt = m.node_tree
        for node in list(nt.nodes):
            if node.type == "TEX_COORD":
                for out, attr in (("Generated", "lj_gen"), ("Object", "lj_obj")):
                    if node.outputs[out].is_linked:
                        a = nt.nodes.new("ShaderNodeAttribute")
                        a.attribute_type = "GEOMETRY"
                        a.attribute_name = attr
                        for link in list(node.outputs[out].links):
                            nt.links.new(a.outputs["Vector"], link.to_socket)
            if node.type == "OBJECT_INFO" and node.outputs["Random"].is_linked:
                a = nt.nodes.new("ShaderNodeAttribute")
                a.attribute_type = "GEOMETRY"
                a.attribute_name = "lj_rand"
                for link in list(node.outputs["Random"].links):
                    nt.links.new(a.outputs["Fac"], link.to_socket)


def merge(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    j.name = f"railcar {name}"
    return j


def normalise_uvs(objs):
    fallback = bpy.data.materials.get("rc default") or bpy.data.materials.new("rc default")
    mats = set()
    for o in objs:
        me = o.data
        if not o.material_slots:
            me.materials.append(fallback)
        layers = list(me.uv_layers)
        for extra in layers[1:]:
            me.uv_layers.remove(extra)
        if me.uv_layers:
            me.uv_layers[0].name = "UVMap"
        for s in o.material_slots:
            if s.material:
                mats.add(s.material)
    for m in mats:
        if not m.use_nodes:
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
    for o in objs:
        me = o.data
        bake = me.uv_layers.new(name="BakeUV")
        me.uv_layers.active = bake
        bake.active_render = True


def unwrap(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0025, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


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


def albedo_copy(m):
    c = m.copy()
    c.name = m.name + " [albedo]"
    nt = c.node_tree
    b = principled(c)
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
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


def diffuse_copy(m):
    c = m.copy()
    c.name = m.name + " [irradiance]"
    nt = c.node_tree
    b = principled(c)
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if not out:
        return c
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    d.inputs["Color"].default_value = (1, 1, 1, 1)
    if b and b.inputs["Normal"].is_linked:
        nt.links.new(b.inputs["Normal"].links[0].from_socket, d.inputs["Normal"])
    for l in list(out.inputs["Volume"].links):
        nt.links.remove(l)
    nt.links.new(d.outputs[0], out.inputs["Surface"])
    return c


def attach_target(objs, image):
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
            uv.uv_map = "BakeUV"
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


def run_bake(objs, kind, image, samples, passes=None):
    s = bpy.context.scene
    s.cycles.samples = samples
    s.render.bake.target = "IMAGE_TEXTURES"
    s.render.bake.use_clear = True
    s.render.bake.margin = max(8, image.size[0] // 256)
    s.render.bake.margin_type = "EXTEND"
    if passes is not None:
        s.render.bake.use_pass_direct = "DIRECT" in passes
        s.render.bake.use_pass_indirect = "INDIRECT" in passes
        s.render.bake.use_pass_color = "COLOR" in passes
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    attach_target(objs, image)
    t = time.time()
    bpy.ops.object.bake(type=kind)
    log("  bake", kind, image.name, f"{time.time() - t:.0f}s")


def write_pfm(path, img):
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    with open(path, "wb") as f:
        f.write(f"PF\n{w} {h}\n-1.0\n".encode())
        f.write(np.ascontiguousarray(px).astype("<f4").tobytes())


def read_pfm_into(path, img):
    with open(path, "rb") as f:
        assert f.readline().strip() == b"PF"
        w, h = map(int, f.readline().split())
        scale = float(f.readline())
        data = np.frombuffer(f.read(), dtype="<f4" if scale < 0 else ">f4").reshape(h, w, 3)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = data
    img.pixels.foreach_set(rgba.ravel())


def denoise(img):
    if not os.path.exists(OIDN):
        log("  oidn missing; skipping denoise")
        return
    os.makedirs(TMP, exist_ok=True)
    src, dst = os.path.join(TMP, img.name + ".pfm"), os.path.join(TMP, img.name + ".dn.pfm")
    write_pfm(src, img)
    r = subprocess.run([OIDN, "--hdr", src, "-o", dst, "-q", "high"], capture_output=True, text=True)
    if r.returncode != 0:
        log("  oidn failed", r.stderr[-400:])
        return
    read_pfm_into(dst, img)
    log("  denoised", img.name)


def save(img, path, fmt):
    img.filepath_raw = path
    img.file_format = fmt
    img.save()


def bucket(m):
    if m.name.startswith("rc mirror"):
        return 0.03, 1.0
    b = principled(m)
    if not b:
        return 0.6, 0.0
    r = 0.5 if b.inputs["Roughness"].is_linked else b.inputs["Roughness"].default_value
    if b.inputs["Metallic"].is_linked:
        mt = 1.0 if any(k in m.name for k in ("gilt", "brass", "gold", "nickel", "silver", "iron")) else 0.0
    else:
        mt = 1.0 if b.inputs["Metallic"].default_value >= 0.5 else 0.0
    if any(k in m.name for k in ("gilt", "brass", "gold")):
        mt = 1.0
    r = min(ROUGH_BUCKETS, key=lambda x: abs(x - r))
    if b.inputs["Coat Weight"].default_value > 0.3 and mt == 0:
        r = min(r, 0.2)
    return r, mt


def export_group(name, objs, color_img):
    made = {}
    for o in objs:
        for s in o.material_slots:
            r, mt = bucket(s.material) if s.material else (0.6, 0.0)
            key = (r, mt)
            if key not in made:
                m = bpy.data.materials.new(f"railcar {name} r{r:.2f} m{int(mt)}")
                m.use_nodes = True
                b = m.node_tree.nodes["Principled BSDF"]
                t = m.node_tree.nodes.new("ShaderNodeTexImage")
                t.image = color_img
                m.node_tree.links.new(t.outputs[0], b.inputs["Base Color"])
                b.inputs["Roughness"].default_value = r
                b.inputs["Metallic"].default_value = mt
                made[key] = m
            s.material = made[key]
        me = o.data
        for l in [l for l in me.uv_layers if l.name != "BakeUV"]:
            me.uv_layers.remove(l)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = f"railcar {name}"
    path = os.path.join(OUT, f"railcar-{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=92, export_apply=True,
                              export_materials="EXPORT", export_texcoords=True, export_normals=True,
                              export_cameras=False, export_lights=False)
    log("  exported", path, len(joined.data.polygons), "faces", len(made), "materials")
    return {"faces": len(joined.data.polygons), "materials": len(made), "file": os.path.basename(path)}


def export_simple(name, objs):
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    path = os.path.join(OUT, f"railcar-{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=92, export_apply=True,
                              export_cameras=False, export_lights=False)
    log("  exported", path, len(objs), "objects")
    return {"objects": len(objs), "file": os.path.basename(path)}


def app(v):
    """Blender (x, y, z) -> application (x, z, -y)."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def run():
    os.makedirs(OUT, exist_ok=True)
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
    groups, glass, canvases, skipped = classify()
    log("classified", {k: len(v) for k, v in groups.items()}, "glass", len(glass), "canvas", len(canvases), "skipped", len(skipped))
    for o in skipped:
        o.hide_render = True
    statics = [o for g in groups.values() for o in g]
    realised = realise(statics + glass + canvases)
    rset = {o.name for o in realised}
    for k in groups:
        groups[k] = [bpy.data.objects[o.name] for o in groups[k] if o.name in rset]
    glass = [bpy.data.objects[o.name] for o in glass if o.name in rset]
    canvases = [bpy.data.objects[o.name] for o in canvases if o.name in rset]
    for k in groups:
        groups[k] = [o for o in groups[k] if len(o.data.polygons) > 0]
    allstatic = [o for g in groups.values() for o in g]
    coordinate_attributes(allstatic)
    # rename first UV layer to UVMap on every piece so the merge keeps one shared layer
    for o in allstatic:
        me = o.data
        for extra in list(me.uv_layers)[1:]:
            me.uv_layers.remove(extra)
        if me.uv_layers:
            me.uv_layers[0].name = "UVMap"
    for k in groups:
        groups[k] = [merge(k, groups[k])]
        log("merged", k, len(groups[k][0].data.polygons), "faces", len(groups[k][0].material_slots), "slots")
    normalise_uvs([o for g in groups.values() for o in g])
    log("uvs normalised", f"{time.time() - t0:.0f}s")
    manifest = {"groups": {}, "units": "1 unit = 10 cm; app coords (x, y-up, z)",
                "fire": app(fire) if fire else None,
                "room": {"x": [shell.X0, shell.X1], "floor": -9.0, "back_wall_z": -shell.Y_BACK, "front_wall_z": -shell.Y_FRONT,
                         "ceiling": shell.CL_TOP + 0.9}}
    images = {}
    for name, (csize, lsize, esize, samples) in GROUPS.items():
        objs = groups[name]
        log("group", name, len(objs), "objects")
        unwrap(objs)
        log("  unwrapped")
        color = bpy.data.images.new(f"railcar-{name}-color", csize, csize, alpha=False)
        light = bpy.data.images.new(f"railcar-{name}-light", lsize, lsize, alpha=False, float_buffer=True)
        light.colorspace_settings.name = "Non-Color"
        emit = bpy.data.images.new(f"railcar-{name}-emit", esize, esize, alpha=False, float_buffer=True)
        emit.colorspace_settings.name = "Non-Color"
        cache = {}
        orig = swap(objs, albedo_copy, cache)
        run_bake(objs, "EMIT", color, 4)
        detach_target(objs)
        restore(objs, orig)
        cache = {}
        orig = swap(objs, diffuse_copy, cache)
        run_bake(objs, "DIFFUSE", light, samples, {"DIRECT", "INDIRECT"})
        detach_target(objs)
        restore(objs, orig)
        run_bake(objs, "EMIT", emit, 16)
        detach_target(objs)
        denoise(light)
        save(color, os.path.join(TMP, f"railcar-{name}-color.png"), "PNG")
        save(light, os.path.join(OUT, f"railcar-{name}-light.hdr"), "HDR")
        save(emit, os.path.join(OUT, f"railcar-{name}-emit.hdr"), "HDR")
        images[name] = color
        log("  baked", name, f"{time.time() - t0:.0f}s")
    for name in GROUPS:
        manifest["groups"][name] = export_group(name, groups[name], images[name])
        manifest["groups"][name]["light"] = f"railcar-{name}-light.hdr"
        manifest["groups"][name]["emit"] = f"railcar-{name}-emit.hdr"
    manifest["glass"] = export_simple("glass", glass)
    manifest["paintings"] = export_simple("paintings", canvases)
    manifest["seconds"] = round(time.time() - t0)
    json.dump(manifest, open(os.path.join(OUT, "railcar-manifest.json"), "w"), indent=1)
    log("DONE", manifest["seconds"], "s")
    return manifest
