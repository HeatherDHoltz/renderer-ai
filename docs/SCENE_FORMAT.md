# Scene format v1

Scenes are UTF-8 JSON. Run `cargo run --release --locked -- validate scenes/mesh.json` to check syntax, resource limits, references, transforms, and assets. Unknown fields and unsupported enum values are errors. Loading never executes code. Asset paths resolve relative to the scene file; absolute paths also work but reduce portability.

[scene.schema.json](scene.schema.json) supplies a structural Draft 2020-12 schema for editors/authoring tools; the CLI additionally checks semantic references/assets/transforms and aggregate limits. [AI_SCENE_AUTHORING.md](AI_SCENE_AUTHORING.md) provides a concrete constrained prompt and a checked-in example. [PROCEDURAL.md](PROCEDURAL.md) defines the separate generator configuration and `generate` CLI; its output is an ordinary scene in this format.

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
| `lights` | Optional array of point and rectangular sources |
| `environment` | Optional constant or Radiance HDR environment, physical mode only |

All colors are linear RGB unless explicitly decoded from a color PNG texture. Positions use arbitrary consistent world units, right-handed +Y up. Arrays have exactly the indicated number of components. JSON does not accept NaN or infinity; computed values and numeric ranges are validated too.

## Camera and render settings

Camera fields: `kind` is `perspective` (default) or `orthographic`; `position` defaults to [4,3,7], `target` to [0,1,0], and `up` to [0,1,0]. Perspective vertical `fov` defaults to 40 degrees and must be in (0,179). Orthographic `height` defaults to 5 and must be positive. Aspect follows output dimensions. Eye and target must differ; up cannot be zero or parallel to view.

Render defaults: `width` 640, `height` 480, `spp` 1, `seed` 116, `integrator` `whitted`, `max_depth` 8, `min_throughput` 0.0001, `exposure` 0 stops, `tone_map` `reinhard`, `accel` `bvh`. The other tone map is `linear`. Depth is 0..16, throughput is [0,1], and exposure is [-32,32]. Dimensions are 1..8192 and at most 16 megapixels. `threads` defaults to 0 (automatic), `tile_size` to 16, `progressive` to false, and `preview_every` to 8. Threads support 0..256; tile size 4..256; preview interval 1..16384. `sampling` is `jittered` (default) or `center`. Samples are 1..16,384 spp with at most 2^30 total pixel samples. The seed controls stateless per-pixel/per-sample streams, including rectangular light sampling. Existing one-sample examples explicitly select center.

`accel` selects `none` (brute force), `bvh` (12-bin SAH, default), or `octree` (reference, parent straddlers). Both mesh triangles and scene instances use the selected backend.

CLI `render` overrides: `--width`, `--height`, `--depth`, `--exposure`, `--accel`, `--spp`, `--seed`, `--sampling`, `--threads`, `--tile-size`, `--progressive`/`--no-progressive`, `--preview-every`, `--integrator`, `--output`, and optional `--hdr-output`. All overrides pass validation. `validate` also loads all defined mesh, texture, and environment assets. See [PARALLEL.md](PARALLEL.md) for tile/prefix/cancellation semantics. `render` prints load, render, and output timings; these single-run diagnostics are not a benchmark report.

`integrator` supports `whitted` and `physical`. In physical mode every defined material requires a `physical` block; Whitted mode rejects such blocks. Changing modes requires matching material definitions. The physical mode ignores the educational diffuse/specular/reflection/transmission coefficients and has no ambient term. `--hdr-output` must end in `.hdr` and saves averaged raw linear RGBE independent of PNG exposure/tone mapping. PNG output still uses `--output`.

## Geometry, instances, and groups

Geometry definitions use `{"kind":"sphere"}`, `plane`, `box`, `cylinder`, or `cone`. Definitions/bounds/UVs are listed in [ARCHITECTURE.md](ARCHITECTURE.md). Meshes use `{"kind":"mesh","path":"../assets/uv-sphere.obj"}`.

Every object has a unique `name` (1..128 bytes). An instance needs `geometry` and `material` names. `smooth` defaults false and selects mesh shading normal interpolation when true. A transform-only group omits both geometry and material. `parent` optionally references any object/group by name. Cycles, unknown parents, duplicate names, and chains deeper than 256 fail validation. Parents can appear after children in the file. Instances of one mesh share immutable indexed data through Arc.

`transform` defaults to identity. Its arrays are `translation` [0,0,0], `rotation_degrees` [0,0,0], and `scale` [1,1,1]. Rotation uses glam's XYZ Euler convention, constructed as `Quat::from_euler(EulerRot::XYZ, x, y, z)`. Local matrices are `T*R*S`, world matrices `parent_world*local`. Scale axes must be nonzero; ill-conditioned/nonaffine/nonfinite composed matrices are rejected. Negative scales are supported. Mesh normals retain the local surface's outward orientation through inverse transpose even for mirrored instances; intersections are double-sided.

Objects may add `animation: {"keyframes":[...]}`. Every key requires `time` (seconds), `translation` (3-vector), `rotation` (unit x,y,z,w quaternion), and `scale` (3-vector). The animated local matrix is `static_TRS * keyframe_TRS(time)`. Linear translation/scale and shortest-arc quaternion interpolation clamp at track endpoints. Strictly ordered times, scale sign continuity, whole-track validation, frame CLI options, and examples are defined in [ANIMATION.md](ANIMATION.md). `render --time` defaults to zero; `animate` rebuilds complete transforms and bounds for each frame. Cameras/lights remain static.

## Materials, textures, and lights

Material defaults: `diffuse` [0.7,0.7,0.7], `specular` [0,0,0], `shininess` 32, `reflection` [0,0,0], `transmission` [0,0,0], `ior` 1.5, optional `texture` name. Coefficients must be in [0,1], shininess nonnegative, and IOR in [1,4]. This is an educational additive material model, not physical energy conservation. A mirror sets diffuse/specular to zero and reflection to its tint. Glass sets diffuse/specular/reflection to zero and transmission to its tint; see transport limitations in the architecture notes.

Physical examples (each is an entire named material value):

```json
{"physical":{"model":"diffuse","base_color":[0.65,0.23,0.07]}}
```
```json
{"physical":{"model":"metal_rough","base_color":[0.83,0.58,0.21],"metallic":1.0,"roughness":0.5}}
```
```json
{"physical":{"model":"dielectric","tint":[0.5,0.82,0.96],"ior":1.45}}
```

Base color/tint and metallic/roughness must be in [0,1]; physical IOR is [1,4]. Optional `texture` multiplies the physical base color or per-interface tint and must stay in [0,1]. The physical IOR is inside its block, independent of the educational outer IOR. [PHYSICAL.md](PHYSICAL.md) defines alpha, Fresnel, PDFs, MIS, and direct-lighting limitations.

Checker texture: `{"kind":"checker","a":[1,1,1],"b":[0.1,0.1,0.1],"scale":[4,4]}`. The floor of each scaled UV selects alternating squares, including negative coordinates. Scale must be positive and at most 1e6.

Color image texture: `{"kind":"image","path":"../assets/uv-grid.png","filter":"bilinear","wrap":"repeat"}`. PNG RGB is decoded through the sRGB transfer into linear color. `filter` is `nearest` or `bilinear` (default); `wrap` is `repeat` (default) or `clamp`. UV v=1 samples the top row, matching OBJ's usual bottom-origin UVs. Bilinear filtering uses texel centers and wraps/clamps neighbors consistently. Alpha is ignored; only base color is supported. No scalar maps, MTL import, normal maps, or anisotropic filtering are claimed.

Point light: `{"kind":"point","position":[-3,7,5],"color":[1.2,1.1,0.95]}`. Color is an educational irradiance multiplier without inverse-square falloff in Whitted mode; physical mode uses it as radiant intensity with inverse-square attenuation. Glass blocks shadow rays. Background and light RGB may exceed one.

Area light: `{"kind":"area","center":[-3,6,3],"edge_u":[3,0,0],"edge_v":[0,0,3],"radiance":[7,6.5,5.5],"two_sided":false}`. Full spans define the rectangle and cross-product normal. One sample per source is drawn at each shaded vertex per camera sample. Emitted radiance remains constant as area changes; set radiance inversely with area to compare fixed power. See [SAMPLING.md](SAMPLING.md) for PDFs, units/conventions, sample counts, and inspected comparisons.

Physical environment: `{"kind":"hdr","path":"../assets/studio.hdr","intensity":1.0,"rotation_degrees":0.0}` or `{"kind":"constant","radiance":[1,1,1]}` in top-level `environment`. Intensity defaults to 1 and must be finite/nonnegative; rotation defaults to zero and must be finite. HDR radiance is linear; +Y is the top pole, u=0 faces +X and u=0.25 faces +Z; positive rotation moves +X toward +Z. The environment lights surfaces and supplies misses. Without an environment, `background` supplies misses only and does not illuminate surfaces. HDR input caps: 64 MiB, four megapixels, dimensions ≤8192. Lookup is nearest texel; sampling weights luminance by exact spherical texel area.

## OBJ support and resource limits

OBJ supports `v`, `vt`, `vn`, independent face index tuples, and positive/negative indices. Triangles load directly; convex planar quads triangulate as a fan. Concave, nonplanar, larger, or degenerate faces fail with line-number diagnostics. Missing normals use area-weighted vertex normals across shared position indices when smooth shading is requested. Explicit normal splits are preserved. Split positions/normals are needed for hard edges: OBJ smoothing groups and material/library directives are ignored. Missing UVs default to [0,0]. Smooth normals change shading, not silhouettes.

Limits: scene file 4 MiB; OBJ or PNG file 64 MiB each; one million positions/normals/UVs/triangles per mesh and four million combined mesh elements per scene; four megapixels per texture and sixteen megapixels combined. Scene counts: 100,000 objects, 4,096 materials/geometries, 256 textures, 1,024 lights. These are validation ceilings, not performance promises; brute-force traversal remains available as the correctness reference.
