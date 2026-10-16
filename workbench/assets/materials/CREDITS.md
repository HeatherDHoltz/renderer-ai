# Workshop material credits

These photographed materials and HDR panoramas are downloaded from Poly Haven under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Original image bytes are retained at 1K; source URLs, upstream MD5 and local SHA-256 hashes are recorded in [sources.json](sources.json). Runtime color tinting, UV scaling and strength adjustments are project-created.

- [velour_velvet](https://polyhaven.com/a/velour_velvet) — colormass (Photography), Rico Cilliers (Processing).
- [grey_plaster_02](https://polyhaven.com/a/grey_plaster_02) — Rob Tuytel (All).
- [artist_workshop](https://polyhaven.com/a/artist_workshop) — Oliksiy Yakovlyev (All).
- [WoodenTable_03](https://polyhaven.com/a/WoodenTable_03) — Gabriel Radić (All).
- [rosewood_veneer_02](https://polyhaven.com/a/rosewood_veneer_02) — Jenelle van Heerden (All).
- [forest_slope](https://polyhaven.com/a/forest_slope) — Andreas Mischok (All).

Velour velvet supplies actual photographed nap, normal, roughness and occlusion maps, recolored green in the shader. Rosewood supplies casework, bench tools and support. Plaster supplies the wall surface. The original table receives its matching normal and packed AO/roughness/metalness maps; its original glTF and diffuse texture remain unchanged. Artist Workshop initializes room illumination; Forest Slope supplies the outdoor window panorama. A cached live cube capture of the room and luminous movable lamp drives gem/metal reflections after initialization.

## Live diamond mesh

[Jewel by Zsky](https://poly.pizza/m/velVo80s1D), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). `../diamond.obj` is a byte-exact copy of the repository’s adapted `assets/gems/zsky-jewel-01.obj`, also used in the Rust gem panel. Runtime scale, flat normals, optical material and ring mount are project adaptations. The 21-plane cut is the source artist’s design, not a certified 57-facet brilliant. [Full upstream conversion/adaptation notices](https://github.com/HeatherDHoltz/renderer-ai/blob/main/assets/gems/ATTRIBUTION.md).

Cabochon and step-cut geometry are project-created. The live emerald uses a convex facet hull of the project step-cut positions so the optical solid is closed and convex. No project-wide source license is assigned.
