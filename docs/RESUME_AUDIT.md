# Project scope and contributions

The Diamond Express combines a Three.js workshop with Blender-baked room lighting and custom gemstone shaders. A separate Rust renderer produces offline images. Mitsuba is used only for external reference studies.

Heather Holtz set the workshop concept, interactions and visual requirements; manually edited the Blender room; selected replacement models, music and sound excerpts; and reviewed rendering and navigation defects. Her feedback drove revisions to contact shadows, camera transitions, globe rotation, safe lettering and continuous scenery motion.

AI agents contributed substantial implementation, shaders, tests, export scripts, benchmarks and documentation. The record does not establish Heather personally implemented every subsystem. Her manually authored class renderer is a separate project.

## Measured outcomes

- Initial website assets: approximately 245 MB to 48 MB; controlled cold loading: 53 s to 12 s on an M1 Max at 40 Mbps. Smaller images and a lighter ring reduce fine detail. [Conditions and evidence](STARTUP_FAST_DELIVERY.md).
- Rust intersection queries: 255.66× faster on one 8,192-triangle workload, excluding construction and shading. This is not a full-render speedup. [Benchmark details](BENCHMARKS.md).
- Rust rendering: 8.72× scaling from one to ten workers on one documented scene, with identical linear images. This demonstrates parallel scaling.

Suggested résumé wording:

- Directed an AI-assisted interactive 3D workshop using Blender and Three.js; edited the room and specified object interactions, camera navigation and visual corrections.
- Guided a loading redesign that reduced initial assets from 245 MB to 48 MB; controlled cold loading fell from 53 s to 12 s on an M1 Max at 40 Mbps.
