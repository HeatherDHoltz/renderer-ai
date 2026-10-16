# Portfolio and resume notes

This repository is an AI-assisted engineering project extending Heather's early-semester renderer. Heather set the direction and reviewed results; Codex assisted with implementation, tests, debugging, scene generation, and documentation. The independent manually authored class project was not modified. Do not present the generated implementation as entirely handwritten or imply that an AI model performs rendering at runtime.

Possible resume wording, after personally reviewing and being ready to explain the code:

- Directed and reviewed an AI-assisted Rust CPU ray tracer with affine geometry, indexed OBJ meshes, HDR physical direct lighting, glass, quaternion animation, and bounded procedural generation; verified with 91 tests and Linux/macOS CI.
- Evaluated a two-level SAH BVH against brute force and octree using fixed seeded rays; measured 734.619 ms to 2.873 ms median query time on an 8,192-triangle workload, with hit/occlusion agreement.
- Validated deterministic Rayon rendering across worker counts, tiles, and progressive batches; measured 8.72× full-render scaling from one to ten workers on a documented area-light workload.

Use one or two relevant bullets, not every detail. The performance statements describe specific measured workloads on Apple M1 Max, with one warmup/five runs; they are not universal speedups. See [BENCHMARKS.md](BENCHMARKS.md) for exact context and source commits. CI status must be checked before claiming passing CI in an application.

Topics to be ready to discuss: preserving ray t under affine instances, inverse-transpose normals, BLAS/TLAS tradeoffs, SAH versus parent-straddler octree behavior, Fresnel/TIR and eta radiance factors, solid-angle PDFs/MIS, linear color accumulation, deterministic parallel sampling, quaternion interpolation, and bounded grammar growth. The code/tests/docs make these concrete; personal learning and review remain important to representing the work accurately.
