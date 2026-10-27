# Rust performance measurements

Historical measurements, October 15, 2026, Apple M1 Max, 10 available CPUs, 32 GiB RAM, macOS 14.6.1, release build. Each timed setting had one warmup and five measured runs. These results do not measure the live website.

## Intersection queries

Engine commit `04d3221dc227b77dbabfcdf5aca88a0aaa122753`. A fixed set of 4,096 seeded camera rays performs closest-hit and any-hit queries against the same geometry. Results are compared with brute force before timing.

| Scene | Brute force median | BVH median | Gain |
| --- | ---: | ---: | ---: |
| Five analytic primitives | 0.715 ms | 0.615 ms | 1.16× |
| 8,192-triangle wave grid | 734.619 ms | 2.873 ms | 255.66× |

The baseline scans triangles using the same intersection routines. It is a simple reference, not a tuned competing renderer. BVH accelerates triangles and scene instances. The grid favors spatial separation; these two scenes do not establish scaling across scene sizes.

Timing excludes loading, construction, shading and output. Single observed mesh-index build costs were 0.132 ms for brute force and 6.154 ms for BVH; those build observations were not repeated. No corresponding 256× end-to-end rendering improvement is established.

Raw runs, ranges and counters: [small](benchmarks/small.json), [mesh](benchmarks/mesh.json). [Image comparisons](benchmarks/image-agreement.json) record identical backend PNGs for three small scenes, separately from timing.

```sh
cargo build --release --locked
python3 scripts/generate_benchmark.py
cargo run --release --locked -- benchmark scenes/shapes.json --rays 4096 --runs 5 --warmups 1 --output output/benchmark-small.json
cargo run --release --locked -- benchmark scenes/benchmark.json --rays 4096 --runs 5 --warmups 1 --output output/benchmark-mesh.json
python3 scripts/verify_backends.py
```

## Parallel rendering

Engine commit `4707af9`. Area-light scene `scenes/parallel_benchmark.json`, 320×224, 32 samples/pixel, seeded Whitted shading, BVH and 16-pixel tiles. Ten workers means ten Rayon threads on an M1 Max with eight performance and two efficiency cores.

One worker: median 0.8746 s, range 0.8408–0.9213. Ten: median 0.1003 s, range 0.0979–0.1058. Gain: 8.72×. Every measured linear film matched the one-worker reference exactly.

Includes thread-pool startup, film allocation, shading and tile merge. Excludes scene construction, image encoding, preview writes and verification hashes. This demonstrates parallel scaling on that workload. [Area-light runs](benchmarks/render-soft.json), [mesh runs](benchmarks/render-mesh.json).

```sh
cargo run --release --locked -- benchmark-render scenes/parallel_benchmark.json --threads 1,2,4,0 --runs 5 --warmups 1 --output output/render-soft.json
cargo run --release --locked -- benchmark-render scenes/parallel_mesh_benchmark.json --threads 1,2,4,0 --runs 5 --warmups 1 --output output/render-mesh.json
```

Do not substitute a newer source revision and call it an exact historical reproduction. Avoid other heavy CPU jobs and report the actual source, hardware and settings.
