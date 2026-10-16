#!/usr/bin/env python3
"""Restore the pinned CC0 material originals; never needed for normal builds."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1] / "assets" / "materials"
for record in json.loads((root / "sources.json").read_text()):
    target = root / record["file"]
    data = target.read_bytes() if target.exists() else b""
    if hashlib.sha256(data).hexdigest() == record["sha256"]:
        continue
    request = Request(record["url"], headers={"User-Agent": "Mozilla/5.0 LittleJewelerAssetImporter"})
    with urlopen(request, timeout=120) as response:
        data = response.read()
    if (len(data) != record["bytes"]
            or hashlib.md5(data).hexdigest() != record["md5"]
            or hashlib.sha256(data).hexdigest() != record["sha256"]):
        raise RuntimeError(f"Checksum mismatch for {record['file']}; original left unchanged")
    target.write_bytes(data)
    print(f"Restored {record['file']}")
print("All 14 pinned original material files verified.")
