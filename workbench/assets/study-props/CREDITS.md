# Photographed study objects

Full 2K glTF/PBR downloads from Poly Haven, released under CC0-1.0:

- [Vintage Grandfather Clock 01](https://polyhaven.com/a/vintage_grandfather_clock_01): James Ray Cock (modeling/texturing), Yann Kervran (rigging).
- [Lambis Shell](https://polyhaven.com/a/lambis_shell): Kuutti Siitonen.
- [Brass Vase 03](https://polyhaven.com/a/brass_vase_03): Rico Cilliers.

Original geometry, diffuse maps, tangent-space normals and ARM textures are retained. Blender stages the objects in `atelier/study-props.glb`; their placed geometry casts shadows into the room's fixed irradiance bake. Runtime adjusts the clock glass to 10% opacity with no depth writes, correcting upstream glTF opacity that hides the dial. Original downloaded files remain unchanged.

`sources.json` records original URLs, byte sizes and local SHA-256. `fetch-study-props.py` checks upstream MD5 (retrying a checksum-qualified URL for a stale CDN response) and writes the manifest. Restore sources before running `build-atelier.py`.

The room architecture, balance, watch movement, lapidary sheet, wire/findings, mineral specimens and current solitaire are authored for this AI-assisted project. No repository-wide source license is assigned by these asset credits.
