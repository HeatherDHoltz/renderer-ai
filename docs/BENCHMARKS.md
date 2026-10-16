# Measured performance

Measured October 15, 2026 (America/Los_Angeles), source commit `04d3221dc227b77dbabfcdf5aca88a0aaa122753`, clean tracked source. Raw data: [small scene](benchmarks/small.json), [mesh scene](benchmarks/mesh.json). The report records source/scene identity, individual runs, construction costs, hardware, and checksums.

## Ray-query comparison

Machine: Apple M1 Max, MacBookPro18,2, 10 logical CPUs, 32 GiB RAM, macOS 14.6.1, aarch64. Toolchain: rustc 1.98.0 (88d9e12ae 2026-08-18), normal Cargo release profile. Each backend ran sequentially on one thread, with one warmup and five measured runs. Median and full min–max range are reported. Counter collection happened separately from timing.

Each workload has 4,096 fixed camera rays on a seeded jittered 64×64 normalized-film grid (seed 116). Camera aspect comes from each scene's configured dimensions. Every ray performs a closest-hit query on [0.0001,infinity] and an any-hit query on [0.0001,100]. No shading, bounces, area/environment light sampling, tiles, or image output is timed in this table. Input hits, distances, object/triangle identities, and occlusion are compared against brute force before timing.

| Scene | Backend | Median ms | Min–max ms | Relative to brute force | Primitive tests |
| --- | --- | ---: | ---: | ---: | ---: |
| Five analytic primitives | none | 0.715 | 0.701–0.760 | 1.00× | 28,796 |
| Five analytic primitives | bvh | 0.615 | 0.560–0.633 | 1.16× | 10,212 |
| Five analytic primitives | octree | 0.625 | 0.580–0.638 | 1.14× | 10,212 |
| 8,192 mesh triangles | none | 734.619 | 704.653–747.482 | 1.00× | 63,262,758 |
| 8,192 mesh triangles | bvh | 2.873 | 2.861–2.947 | 255.66× | 14,382 |
| 8,192 mesh triangles | octree | 77.268 | 67.873–78.571 | 9.51× | 5,767,740 |

The mesh fixture contains 4,225 shared vertices and 8,192 triangles in one instance. The default BVH accelerates its triangles as well as scene instances; accelerating only the instance list would leave this workload linear. BVH uses 12 SAH bins, leaf threshold four, and maximum depth 48. Octree retains cell-crossing straddlers at parents, uses leaf threshold four, and maximum depth 16.

BVH's median ray-query speedup is 255.66× on this specific grid/camera workload. The octree's 9.51× speedup is smaller because parent straddlers cause millions of triangle tests. On the five-primitive scene, both accelerated paths are only modestly faster in this run. These results do not establish uniform gains on other geometry or end-to-end render/thread scaling.

Single build observations on the mesh scene: brute-force index preparation 0.132 ms, BVH 6.154 ms, octree 0.667 ms. Asset read/parse/preparation was approximately 4.2–4.4 ms per backend, with warm filesystem caches; total build times and scene JSON parse times are in the raw reports. Build observations were not repeated and should not be treated as stable microbenchmarks. The BVH query savings here amortize its larger construction cost over repeated rays.

## Image agreement

`python3 scripts/verify_backends.py` renders glass, textured OBJ, and the wave mesh at 128×96, one center sample, Whitted mode, eight-bounce limit, identical materials/lights/exposure across backends. All three backends produced **identical PNG bytes** for all three scenes. Hashes are saved in [image-agreement.json](benchmarks/image-agreement.json). Render commands print load/render/write times, but these single renders are visual/differential verification rather than the repeated benchmark above.

The 384×256 wave image was also inspected: smooth surface shading, wave silhouette, no visible missing triangle regions. It is retained in the gallery.

## Reproduce

```sh
cargo build --release --locked
python3 scripts/generate_benchmark.py
cargo run --release --locked -- benchmark scenes/shapes.json --rays 4096 --runs 5 --warmups 1 --output output/benchmark-small.json
cargo run --release --locked -- benchmark scenes/benchmark.json --rays 4096 --runs 5 --warmups 1 --output output/benchmark-mesh.json
python3 scripts/verify_backends.py
cargo run --release --locked -- render scenes/benchmark.json --output output/wave.png
```

The generator deterministically recreates the checked-in OBJ and JSON. Defaults and scene seed are fixed; benchmark JSON should show a clean source state after generation. Avoid concurrent CPU-heavy jobs when comparing timings. Debug builds deliberately reject the benchmark command.

Progressive output equivalence is verified separately in PARALLEL.md; preview I/O is excluded from the thread-scaling timings below. Physical lighting and larger showcase compositions may change the bottlenecks and should be measured separately.

## Full-render thread scaling

Measured on the same Apple M1 Max/macOS machine at clean engine commit `4707af9`, October 15, 2026. Raw reports: [area-light study](benchmarks/render-soft.json), [triangle wave](benchmarks/render-mesh.json). Both use 320×224 output, BVH at both levels, seed 116, jittered camera sampling, 16px tiles, Whitted mode with configured maximum depth 8. These scenes use local materials, so no recursive mirror/glass bounces are spawned. The area-light study has four instances, one rectangular source, and one point source; the wave has one 8,192-triangle instance and one point source.

Each worker setting ran sequentially with one warmup and five measured renders. Timing includes dedicated-pool startup, film allocation, primary/shadow tracing and shading, tile scheduling, and tile merge. It excludes scene/asset/acceleration construction, verification hashes, tone mapping/PNG encoding, and progressive preview writes. Every warmup and measured film matched the one-worker reference hash exactly. Default/auto selected ten available workers.

| Scene | Workers | Median s | Min–max s | Relative to one worker |
| --- | ---: | ---: | ---: | ---: |
| Area-light study, 32 spp | 1 | 0.8746 | 0.8408–0.9213 | 1.00× |
| Area-light study, 32 spp | 2 | 0.4696 | 0.4498–0.4873 | 1.86× |
| Area-light study, 32 spp | 4 | 0.2174 | 0.2124–0.2203 | 4.02× |
| Area-light study, 32 spp | 10 | 0.1003 | 0.0979–0.1058 | 8.72× |
| 8,192-triangle wave, 16 spp | 1 | 0.6304 | 0.6088–0.6550 | 1.00× |
| 8,192-triangle wave, 16 spp | 2 | 0.3111 | 0.3019–0.3169 | 2.03× |
| 8,192-triangle wave, 16 spp | 4 | 0.1591 | 0.1461–0.1951 | 3.96× |
| 8,192-triangle wave, 16 spp | 10 | 0.0716 | 0.0674–0.0757 | 8.81× |

The measured scaling is specific to these workloads, image/sample counts, and the current machine. Tile count, heterogeneous CPU scheduling, scene complexity, physical shading, and preview I/O can change it. The raw reports preserve every run rather than extrapolating linear scaling.

```sh
cargo run --release --locked -- benchmark-render scenes/parallel_benchmark.json --threads 1,2,4,0 --runs 5 --warmups 1 --output output/render-soft.json
cargo run --release --locked -- benchmark-render scenes/parallel_mesh_benchmark.json --threads 1,2,4,0 --runs 5 --warmups 1 --output output/render-mesh.json
```
