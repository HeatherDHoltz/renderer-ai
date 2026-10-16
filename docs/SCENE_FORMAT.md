# Scene format v1

Scenes are UTF-8 JSON. Run `cargo run --release --locked -- validate scenes/mesh.json` to check syntax, resource limits, references, transforms, and assets. Unknown fields and unsupported enum values are errors. Loading never executes code. Asset paths resolve relative to the scene file; absolute paths also work but reduce portability.

Working examples: [canonical geometry](../scenes/shapes.json), [mirror/glass](../scenes/glass.json), [flat/smooth textured OBJ instances](../scenes/mesh.json).

## Top-level fields

| Field | Meaning |
| --- | --- |
| `version` | Required integer, currently 1 |
| `camera` | Required object; defaults inside this object are described below |
| `render` | Optional render settings object |
| `background` | Linear RGB, default [0.05,0.07,0.1] |
| `textures` | Optional map of names to texture definitions |
| `materials` | Required map of names to materials |
| `geometries` | Required map of names to geometry definitions |
| `objects` | Required array of instances and transform groups |
| `lights` | Optional array of point lights |

All colors are linear RGB unless explicitly decoded from a color PNG texture. Positions use arbitrary consistent world units, right-handed +Y up. Arrays have exactly the indicated number of components. JSON does not accept NaN or infinity; computed values and numeric ranges are validated too.

## Camera and render settings

Camera fields: `kind` is `perspective` (default) or `orthographic`; `position` defaults to [4,3,7], `target` to [0,1,0], and `up` to [0,1,0]. Perspective vertical `fov` defaults to 40 degrees and must be in (0,179). Orthographic `height` defaults to 5 and must be positive. Aspect follows output dimensions. Eye and target must differ; up cannot be zero or parallel to view.

Render defaults: `width` 640, `height` 480, `spp` 1, `seed` 116, `integrator` `whitted`, `max_depth` 8, `min_throughput` 0.0001, `exposure` 0 stops, `tone_map` `reinhard`. The other tone map is `linear`. Depth is 0..16, throughput is [0,1], and exposure is [-32,32]. Dimensions are 1..8192 and at most 16 megapixels. Only `spp=1` is currently supported: one center camera sample. `seed` is reserved for M5 and does not affect this deterministic center sample. Unsupported sampling/integrators fail instead of being silently ignored.

CLI `render` overrides: `--width`, `--height`, `--depth`, `--exposure`, `--output`. All overrides pass validation. `validate` also loads all defined mesh and texture assets. `render` prints load, render, and output timings; these single-run diagnostics are not a benchmark report.

## Geometry, instances, and groups

Geometry definitions use `{"kind":"sphere"}`, `plane`, `box`, `cylinder`, or `cone`. Definitions/bounds/UVs are listed in [ARCHITECTURE.md](ARCHITECTURE.md). Meshes use `{"kind":"mesh","path":"../assets/uv-sphere.obj"}`.

Every object has a unique `name` (1..128 bytes). An instance needs `geometry` and `material` names. `smooth` defaults false and selects mesh shading normal interpolation when true. A transform-only group omits both geometry and material. `parent` optionally references any object/group by name. Cycles, unknown parents, duplicate names, and chains deeper than 256 fail validation. Parents can appear after children in the file. Instances of one mesh share immutable indexed data through Arc.

`transform` defaults to identity. Its arrays are `translation` [0,0,0], `rotation_degrees` [0,0,0], and `scale` [1,1,1]. Rotation uses glam's XYZ Euler convention, constructed as `Quat::from_euler(EulerRot::XYZ, x, y, z)`. Local matrices are `T*R*S`, world matrices `parent_world*local`. Scale axes must be nonzero; ill-conditioned/nonaffine/nonfinite composed matrices are rejected. Negative scales are supported. Mesh normals retain the local surface's outward orientation through inverse transpose even for mirrored instances; intersections are double-sided.

## Materials, textures, and lights

Material defaults: `diffuse` [0.7,0.7,0.7], `specular` [0,0,0], `shininess` 32, `reflection` [0,0,0], `transmission` [0,0,0], `ior` 1.5, optional `texture` name. Coefficients must be in [0,1], shininess nonnegative, and IOR in [1,4]. This is an educational additive material model, not physical energy conservation. A mirror sets diffuse/specular to zero and reflection to its tint. Glass sets diffuse/specular/reflection to zero and transmission to its tint; see transport limitations in the architecture notes.

Checker texture: `{"kind":"checker","a":[1,1,1],"b":[0.1,0.1,0.1],"scale":[4,4]}`. The floor of each scaled UV selects alternating squares, including negative coordinates. Scale must be positive and at most 1e6.

Color image texture: `{"kind":"image","path":"../assets/uv-grid.png","filter":"bilinear","wrap":"repeat"}`. PNG RGB is decoded through the sRGB transfer into linear color. `filter` is `nearest` or `bilinear` (default); `wrap` is `repeat` (default) or `clamp`. UV v=1 samples the top row, matching OBJ's usual bottom-origin UVs. Bilinear filtering uses texel centers and wraps/clamps neighbors consistently. Alpha is ignored; only base color is supported. No scalar maps, MTL import, normal maps, or anisotropic filtering are claimed.

Point light: `{"kind":"point","position":[-3,7,5],"color":[1.2,1.1,0.95]}`. Color is an educational irradiance multiplier without inverse-square falloff. Glass blocks shadow rays. Background and light RGB may exceed one. Area lights/environment maps are not implemented yet.

## OBJ support and resource limits

OBJ supports `v`, `vt`, `vn`, independent face index tuples, and positive/negative indices. Triangles load directly; convex planar quads triangulate as a fan. Concave, nonplanar, larger, or degenerate faces fail with line-number diagnostics. Missing normals use area-weighted vertex normals across shared position indices when smooth shading is requested. Explicit normal splits are preserved. Split positions/normals are needed for hard edges: OBJ smoothing groups and material/library directives are ignored. Missing UVs default to [0,0]. Smooth normals change shading, not silhouettes.

Limits: scene file 4 MiB; OBJ or PNG file 64 MiB each; one million positions/normals/UVs/triangles per mesh and four million combined mesh elements per scene; four megapixels per texture and sixteen megapixels combined. Scene counts: 100,000 objects, 4,096 materials/geometries, 256 textures, 1,024 lights. These are validation ceilings, not performance promises; brute-force mesh traversal is still the reference implementation before M4.
