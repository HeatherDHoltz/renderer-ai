"""Fetch four CC BY 3.0 jewels by Zsky and convert their public GLBs to closed OBJ.

Requires curl and Python's standard library. Downloads stay in ignored output/;
normalized meshes, source checksums, and credits are retained under assets/gems/.
This is a focused importer for these static, uncompressed, identity-node fixtures.
"""
from collections import Counter
from pathlib import Path
import hashlib
import itertools
import math
import json
import re
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "output/gem-research"
DEST = ROOT / "assets/gems"
MODELS = ["velVo80s1D", "fvsPsdeT7T", "fOScYcI2Oh", "KfOELiDp7l"]
CACHE.mkdir(parents=True, exist_ok=True)
DEST.mkdir(parents=True, exist_ok=True)

def download(url, target):
    subprocess.run(["curl", "-sSfL", "--compressed", "--max-time", "30", "-A", "Mozilla/5.0", url, "-o", str(target)], check=True)

def hull(vertices):
    """Small-fixture supporting-plane hull; repairs the recessed fourth jewel."""
    def sub(a,b):return tuple(x-y for x,y in zip(a,b))
    def dot(a,b):return sum(x*y for x,y in zip(a,b))
    def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    planes={}
    for a,b,c in itertools.combinations(range(len(vertices)),3):
        n=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));length=math.sqrt(dot(n,n))
        if length<1e-12:continue
        n=tuple(x/length for x in n);d=[dot(n,sub(v,vertices[a])) for v in vertices]
        if max(d)>1e-10 and min(d)<-1e-10:continue
        if max(d)>1e-10:n=tuple(-x for x in n)
        ids=tuple(i for i,x in enumerate(d) if abs(x)<1e-10)
        planes[ids]=n
    faces=[]
    for ids,n in planes.items():
        center=tuple(sum(vertices[i][j] for i in ids)/len(ids) for j in range(3))
        u=sub(vertices[ids[0]],center);length=math.sqrt(dot(u,u));u=tuple(x/length for x in u);v=cross(n,u)
        points=sorted((dot(sub(vertices[i],center),u),dot(sub(vertices[i],center),v),i) for i in ids)
        def turn(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        halves=[]
        for order in [points,list(reversed(points))]:
            half=[]
            for p in order:
                while len(half)>1 and turn(half[-2],half[-1],p)<=1e-14:half.pop()
                half.append(p)
            halves.append(half[:-1])
        polygon=[p[2] for p in halves[0]+halves[1]]
        faces += [(polygon[0],polygon[i],polygon[i+1]) for i in range(1,len(polygon)-1)]
    used=sorted({i for f in faces for i in f});remap={old:new for new,old in enumerate(used)}
    return [vertices[i] for i in used],[tuple(remap[i] for i in f) for f in faces]

def convert(raw,repair=False):
    magic, version, total = struct.unpack_from("<III", raw)
    assert magic == 0x46546C67 and version == 2 and total == len(raw)
    size, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A
    gltf = json.loads(raw[20:20 + size])
    offset = 20 + size
    length, kind = struct.unpack_from("<II", raw, offset)
    assert kind == 0x004E4942
    binary = raw[offset + 8:offset + 8 + length]
    assert len(gltf["nodes"]) == 1 and set(gltf["nodes"][0]) <= {"name", "mesh"}
    primitive = gltf["meshes"][gltf["nodes"][0]["mesh"]]["primitives"][0]
    assert primitive.get("mode", 4) == 4 and "extensions" not in primitive

    def accessor(index):
        a = gltf["accessors"][index]
        assert "sparse" not in a and not a.get("normalized", False)
        view = gltf["bufferViews"][a["bufferView"]]
        assert view.get("buffer", 0) == 0
        components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        fmt = "<" + {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[a["componentType"]] * components
        stride = view.get("byteStride", struct.calcsize(fmt))
        start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(a["count"])]

    vertices = accessor(primitive["attributes"]["POSITION"])
    indices = [p[0] for p in accessor(primitive["indices"])]
    assert len(indices) % 3 == 0
    unique, remap, seen = [], [], {}
    for v in vertices:
        key = tuple(round(x, 6) for x in v)
        if key not in seen:
            seen[key] = len(unique)
            unique.append(key)
        remap.append(seen[key])
    faces = [tuple(remap[i] for i in indices[start:start+3]) for start in range(0, len(indices), 3)]
    if repair:unique,faces=hull(unique)
    assert all(len(set(f)) == 3 for f in faces)
    edges = Counter(tuple(sorted((f[i], f[(i+1) % 3]))) for f in faces for i in range(3))
    assert set(edges.values()) == {2}, "Gem must be watertight after position welding"
    directed = Counter((f[i], f[(i+1) % 3]) for f in faces for i in range(3))
    assert all(directed[(a, b)] == directed[(b, a)] == 1 for a, b in edges), "Inconsistent winding"
    volume = sum(
        unique[a][0]*(unique[b][1]*unique[c][2]-unique[b][2]*unique[c][1])
        +unique[a][1]*(unique[b][2]*unique[c][0]-unique[b][0]*unique[c][2])
        +unique[a][2]*(unique[b][0]*unique[c][1]-unique[b][1]*unique[c][0])
        for a,b,c in faces)/6
    assert abs(volume) > 1e-9
    if volume < 0:
        faces = [(a, c, b) for a, b, c in faces]
    low = [min(v[i] for v in unique) for i in range(3)]
    high = [max(v[i] for v in unique) for i in range(3)]
    scale = 2 / max(high[0]-low[0], high[2]-low[2])
    center = [(low[i] + high[i])/2 if i != 1 else low[i] for i in range(3)]
    normalized = [tuple((v[i]-center[i])*scale for i in range(3)) for v in unique]
    return normalized, faces

manifest = []
for number, public in enumerate(MODELS, 1):
    page = CACHE / (public + ".html")
    download("https://poly.pizza/m/" + public, page)
    state = re.search(r"window\.__SERVER_APP_STATE__\s*=\s*(\{.*?\})</script>", page.read_text(), re.S)
    model = json.loads(state.group(1))["initialData"]["model"]
    assert model["Licence"] == "CC-BY 3.0" and model["Creator"]["Username"] == "Zsky"
    url = "https://static.poly.pizza/" + model["ResourceID"] + ".glb"
    path = CACHE / (public + ".glb")
    download(url, path)
    raw = path.read_bytes()
    vertices, faces = convert(raw,repair=number==4)
    name = f"zsky-jewel-{number:02}.obj"
    lines = [f"# Jewel by Zsky, CC BY 3.0, https://poly.pizza/m/{public}",
             "# Adapted: GLB->OBJ, weld positions, outward winding, normalize XZ diameter=2 and bottom Y=0."]
    if number==4:lines.append("# Additional repair: outer convex hull replaces recessed/overlapping inner facets for solid refraction.")
    lines += ["v " + " ".join(f"{x:.8f}" for x in v) for v in vertices]
    lines += ["f " + " ".join(str(i + 1) for i in face) for face in faces]
    (DEST / name).write_text("\n".join(lines) + "\n")
    manifest.append({"file":name,"title":"Jewel","author":"Zsky","source":"https://poly.pizza/m/"+public,
                     "download":url,"license":"CC BY 3.0","license_url":"https://creativecommons.org/licenses/by/3.0/",
                     "source_sha256":hashlib.sha256(raw).hexdigest(),"obj_sha256":hashlib.sha256((DEST/name).read_bytes()).hexdigest(),
                     "vertices":len(vertices),"triangles":len(faces),"closed_oriented_manifold":True})
    manifest[-1]['convex_hull_repair']=number==4
    print(name, len(vertices), "vertices", len(faces), "triangles")
(DEST/"sources.json").write_text(json.dumps(manifest, indent=2)+"\n")
