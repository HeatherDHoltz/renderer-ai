# Rust scene files

Scenes are JSON, version 1. [The schema](scene.schema.json) lists fields, defaults and ranges. Use [shapes](../scenes/shapes.json), [glass](../scenes/glass.json) and [textured meshes](../scenes/mesh.json) as examples.

```sh
cargo run --release --locked -- validate scenes/mesh.json
```

Validation checks unknown fields, references, transforms, assets and resource limits. Asset paths resolve relative to the scene file. Loading a scene does not execute code.

## Structure

Required fields: `version`, `camera`, `materials`, `geometries`, `objects`. Optional fields: `render`, `background`, `textures`, `lights`, `environment`.

Coordinates are right-handed, +Y up. Colors are linear RGB; color PNGs are decoded from sRGB. Camera `kind` is `perspective` or `orthographic`; aspect follows output dimensions.

Render settings include `width`, `height`, `spp`, `seed`, `integrator`, `max_depth`, `exposure`, `tone_map`, `accel`, `threads`, `tile_size` and progressive-preview options. `threads: 0` selects available workers. Acceleration is `none`, `bvh` or `octree`. CLI overrides are listed by `render --help`.

`whitted` uses educational diffuse/specular/reflection/transmission coefficients. `physical` requires a physical block on every defined material; mixing the two formats is rejected. [Rendering limits](RENDERING.md).

## Objects

Named geometry can be a sphere, plane, box, capped cylinder/cone or OBJ mesh. Instances reference geometry and material names; groups omit both. Each object name is unique. `parent` forms a checked hierarchy.

Transforms contain `translation`, `rotation_degrees` and `scale`; local matrices are `T * R * S`, world matrices are `parent_world * local`. Zero scale, cycles and invalid composed matrices are rejected.

Animation keys contain seconds, translation, unit quaternion `[x,y,z,w]` and scale. Translation/scale interpolate linearly; rotation follows the shortest quaternion arc. The animated matrix follows the static transform. Cameras/lights stay fixed; each frame rebuilds object bounds.

## Materials and lights

Physical model names: `diffuse`, `metal_rough`, `dielectric`, `gemstone`, `chatoyant`. Gem absorption is RGB per world unit; absorbing meshes must be closed, consistently oriented and pass the interior-kernel check. Nested gem volumes are unsupported.

Textures support checker patterns and color PNGs with nearest/bilinear filtering and repeat/clamp wrapping. OBJ supports independent position/UV/normal indices, triangles and convex planar quads. Concave/nonplanar polygons fail; MTL files and smoothing groups are ignored.

Lights are points or rectangles. Physical points use inverse-square falloff; rectangles specify emitted radiance and full edge spans. Physical environments are constant or Radiance HDR maps. A plain background lights no surfaces.

PNG output applies exposure, Reinhard/linear tone mapping and sRGB conversion. `--hdr-output output/image.hdr` saves averaged linear radiance before display mapping.

The schema and loader enforce allocation limits. They are safety ceilings, not speed promises.
