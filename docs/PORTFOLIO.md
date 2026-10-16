# Portfolio and resume notes

This repository is an AI-assisted engineering project extending Heather's early-semester renderer. Heather set the direction and reviewed results; Codex assisted with implementation, tests, debugging, scene generation, and documentation. The independent manually authored class project was not modified.

The optional [Mitsuba study](MITSUBA.md) uses an external renderer. Its scenes and material experiments are supporting research artifacts; Mitsuba's volume transport and the resulting reference images are not features or output of the Rust engine.

[The Little Jeweler](../workbench/README.md) is a separate Three.js browser companion. Its contemporary atelier combines Blender/Cycles-baked room lighting with live GPU rendering of 12 gemstones, two-layer velvet cases that unfold for inspection, 18 alloy/finish samples, a draggable lamp, specimen quaternion manipulation and a reversible 3D loupe pickup. Gem shaders include directional fiber shading and convex-facet refraction/Fresnel/TIR with RGB absorption and dispersion; a room/lamp reflection probe supplies jewelry reflections. Ruby and sapphire colors are fitted to published GIA absorption measurements, while the other color presets are documented appearance studies. The room is project-modeled; photographed velvet and HDR panoramas are credited to Poly Haven, and the adapted ring shank is credited to Paul Wortmann under CC0. The in-app journal distinguishes the browser GPU viewer, Rust CPU renderer and external Mitsuba reference study. [Current design, color research, sources and limitations](GEM-COLOR.md).

Possible resume wording, after personally reviewing and being ready to explain the code:

- Directed and reviewed an AI-assisted Rust CPU ray tracer with affine geometry, indexed OBJ meshes, HDR physical direct lighting, glass, quaternion animation, and bounded procedural generation; verified with 98 tests and Linux/macOS CI.
- Evaluated a two-level SAH BVH against brute force and octree using fixed seeded rays; measured 734.619 ms to 2.873 ms median query time on an 8,192-triangle workload, with hit/occlusion agreement.
- Validated deterministic Rayon rendering across worker counts, tiles, and progressive batches; measured 8.72× full-render scaling from one to ten workers on a documented area-light workload.

Use one or two relevant bullets, not every detail. The performance statements describe specific measured workloads on Apple M1 Max, with one warmup/five runs; they are not universal speedups. See [BENCHMARKS.md](BENCHMARKS.md) for exact context and source commits. CI status must be checked before claiming passing CI in an application.

Topics to be ready to discuss: preserving ray t under affine instances, inverse-transpose normals, BLAS/TLAS tradeoffs, SAH versus parent-straddler octree behavior, Fresnel/TIR and eta radiance factors, solid-angle PDFs/MIS, linear color accumulation, deterministic parallel sampling, quaternion interpolation, and bounded grammar growth. The code/tests/docs make these concrete; personal learning and review remain important to representing the work accurately.
