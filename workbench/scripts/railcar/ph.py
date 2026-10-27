"""Poly Haven (CC0) asset cache for the railcar build.

Downloads into workbench/assets/railcar/polyhaven/<id>/ and records every
asset in credits.json so provenance stays explicit.
"""
import json
import os
import urllib.request

ROOT = os.environ.get("LJ_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))
CACHE = os.path.join(ROOT, "workbench/assets/railcar/polyhaven")
UA = {"User-Agent": "LittleJewelerPortfolio/1.0 (Heather Holtz portfolio; CC0 asset cache)"}


def _get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def _credit(asset_id, kind, files):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "credits.json")
    data = json.load(open(path)) if os.path.exists(path) else {}
    if asset_id not in data:
        try:
            info = json.loads(_get(f"https://api.polyhaven.com/info/{asset_id}"))
            authors = list((info.get("authors") or {}).keys())
            name = info.get("name", asset_id)
        except Exception:
            authors, name = [], asset_id
        data[asset_id] = {"name": name, "type": kind, "authors": authors, "license": "CC0",
                          "source": f"https://polyhaven.com/a/{asset_id}", "files": files}
        json.dump(data, open(path, "w"), indent=1, sort_keys=True)


def texture(asset_id, res="2k", maps=("Diffuse", "nor_gl", "Rough", "arm")):
    """Return {map_name: local_path} for a Poly Haven texture."""
    folder = os.path.join(CACHE, asset_id)
    os.makedirs(folder, exist_ok=True)
    files = json.loads(_get(f"https://api.polyhaven.com/files/{asset_id}"))
    out = {}
    for m in maps:
        if m not in files or res not in files[m]:
            continue
        entry = files[m][res].get("jpg") or files[m][res].get("png")
        url = entry["url"]
        local = os.path.join(folder, os.path.basename(url.split("?")[0]))
        if not os.path.exists(local):
            open(local, "wb").write(_get(url))
        out[m] = local
    _credit(asset_id, "texture", sorted(os.path.basename(p) for p in out.values()))
    return out


def model(asset_id, res="2k"):
    """Download a Poly Haven model as glTF (+ textures); return the .gltf path."""
    folder = os.path.join(CACHE, asset_id)
    os.makedirs(folder, exist_ok=True)
    files = json.loads(_get(f"https://api.polyhaven.com/files/{asset_id}"))
    g = files["gltf"][res]["gltf"]
    main = os.path.join(folder, os.path.basename(g["url"].split("?")[0]))
    if not os.path.exists(main):
        open(main, "wb").write(_get(g["url"]))
    for rel, inc in (g.get("include") or {}).items():
        p = os.path.join(folder, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        if not os.path.exists(p):
            open(p, "wb").write(_get(inc["url"]))
    _credit(asset_id, "model", [os.path.basename(main)])
    return main


def hdri(asset_id, res="2k"):
    folder = os.path.join(CACHE, asset_id)
    os.makedirs(folder, exist_ok=True)
    files = json.loads(_get(f"https://api.polyhaven.com/files/{asset_id}"))
    url = files["hdri"][res]["hdr"]["url"]
    local = os.path.join(folder, os.path.basename(url))
    if not os.path.exists(local):
        open(local, "wb").write(_get(url))
    _credit(asset_id, "hdri", [os.path.basename(local)])
    return local
