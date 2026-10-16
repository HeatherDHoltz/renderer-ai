# Gemstone asset credits

The four `zsky-jewel-*.obj` meshes are adaptations of **Jewel**, by **Zsky**, distributed on Poly Pizza under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).

| Local mesh | Original model page | Original triangles |
| --- | --- | ---: |
| `zsky-jewel-01.obj` | https://poly.pizza/m/velVo80s1D | 38 |
| `zsky-jewel-02.obj` | https://poly.pizza/m/fvsPsdeT7T | 86 |
| `zsky-jewel-03.obj` | https://poly.pizza/m/fOScYcI2Oh | 26 |
| `zsky-jewel-04.obj` | https://poly.pizza/m/KfOELiDp7l | 92 |

Changes: converted the supplied static GLBs to OBJ, welded duplicated position records, retained a closed consistently oriented surface, corrected overall winding if needed, normalized the largest XZ dimension to two units, placed the minimum Y at zero, and replaced the original materials with this renderer's gem materials. The fourth mesh's recessed inner facets are replaced with its outer convex hull (24 vertices/44 triangles) for robust solid refraction. These are stylized game meshes, not certified gem-cutting plans. The artist does not endorse this project.

Source asset URLs, SHA-256 checksums, converted-file checksums, and topology counts are in `sources.json`. `python3 scripts/import_gems.py` reproduces the conversion and validates the displayed license, closed topology, and orientation. It needs network access only when importing again; all runtime meshes are included for offline rendering.

The CC BY 3.0 terms apply to these four meshes and their adaptations. They are not overridden by the project's otherwise unassigned source-code license. Keep this credit and the license links when redistributing them. Gallery images using these models credit Zsky in `docs/GEMS.md` and `docs/ASSETS.md`.

Other files here are project-generated: `emerald-step.obj` (supplemental rectangular step-cut approximation), `cabochon.obj` (smooth ellipsoidal dome with a flat back), the three `tiger-*.png` procedural stripe textures, `light-tent.hdr` (synthetic lighting cards), and scene/material metadata. No license is assigned to those project-authored files. Textures are authored color patterns; they are not photographs or measured gemstone data. The absorption coefficients are artistic RGB choices, while scalar IORs approximate referenced gemological ranges.
