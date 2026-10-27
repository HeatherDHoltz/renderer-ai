# Rendering

## Browser

Three.js/WebGL draws the live workshop. Blender Cycles calculates fixed room illumination ahead of time. Exported geometry retains separate coordinates for surface textures and baked lighting. The browser combines the baked light with surface textures once, then adds live reflections and moving objects.

Gemstone shaders follow rays through actual convex facets with refraction, Fresnel reflection, total internal reflection, RGB absorption and up to twelve internal reflections. External rays sample a room reflection capture and fixed light apertures; they do not trace the complete nearby scene. RGB dispersion approximates wavelength differences. Tiger’s eye uses a directional surface effect, not simulated mineral fibers.

An optional light-side photon pass traces the selected gemstone toward a flat bench receiver and spreads the arriving light into a texture. It excludes full bent-path occlusion by nearby objects and does not calculate whole-room light transport. See `workbench/src/gem-optics.js`, `caustics.js` and [color sources](GEM-COLOR.md).

Metals and mirrors use room reflection captures; these are not exact planar mirrors. General glass uses transparency/reflection approximations. The loupe magnifies through a camera projection rather than a simulated lens assembly.

## Rust

The separate CPU renderer produces offline PNG/HDR images. It shares some assets and material ideas with the browser, but is not compiled into the website.

Geometry instances preserve ray distance under transforms by leaving transformed ray directions unnormalized. Normals use inverse transpose. Shared mesh data avoids copying geometry for every instance. Separate bounding hierarchies accelerate triangle and object searches; the reference brute-force and octree paths support comparisons.

Physical mode supports diffuse surfaces, GGX metal/roughness, exact dielectric Fresnel/refraction, thickness-dependent RGB gem absorption and directional stone sheen. Direct lights and environment sampling use matching probabilities and multiple importance sampling to avoid counting light twice. Linear samples are averaged before exposure, tone mapping and sRGB output. Rayon distributes tiles; sampling is seeded by pixel/sample so worker scheduling does not change the image.

Limits: no diffuse/glossy indirect light between objects, nested media, spectral transport or caustics. Glass blocks shadow rays. Ideal glass can recursively see other surfaces. These restrictions make “physically based direct lighting” defensible; “full path tracer” is misleading.

Examples:

```sh
cargo run --release --locked -- render scenes/physical_studio.json --output output/studio.png --hdr-output output/studio.hdr
cargo run --release --locked -- animate scenes/animation.json --frames 0:16 --fps 8 --output output/animation
cargo run --release --locked -- generate scenes/generators/garden.json --output output/garden.json
```

Implementation: `src/`, [scene format](SCENE_FORMAT.md), [measured performance](BENCHMARKS.md). Sampling references: [PBRT microfacets](https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory), [importance sampling](https://www.pbr-book.org/4ed/Monte_Carlo_Integration/Improving_Efficiency).

## Mitsuba reference

The optional tiger’s-eye images use external Mitsuba 3.9.1. Its layered surface and directional volume scattering are reference experiments, not Rust features or measured mineral reconstruction.

```sh
python3 scripts/setup_mitsuba.py --denoiser
output/mitsuba-venv/bin/python scripts/render_mitsuba_tigers_eye.py --denoise
```

Settings, linear EXR and images stay under `output/mitsuba-tigers-eye/`. Source: `scripts/render_mitsuba_tigers_eye.py`; [Mitsuba documentation](https://mitsuba.readthedocs.io/en/stable/).
