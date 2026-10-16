# Rust CPU Renderer

An AI-assisted graphics portfolio project extending Heather's early-semester Rust ray tracer. Development is in progress; [STATUS.md](STATUS.md) distinguishes verified features from the full [implementation plan](PLAN.md).

```sh
cargo run --release --locked -- smoke --width 640 --height 480 --output output/smoke.png
cargo run --release --locked -- validate scenes/mesh.json
cargo run --release --locked -- render scenes/mesh.json --output output/mesh.png
cargo run --release --locked -- render scenes/glass.json --output output/glass.png
cargo run --release --locked -- render scenes/physical_studio.json --output output/studio.png --hdr-output output/studio.hdr
cargo test --locked
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

Verified features: perspective/orthographic cameras; affine sphere, plane, box, capped cylinder, and capped cone instances; outward/oriented normals and UVs; educational Lambert/Blinn–Phong lighting; point-light hard shadows; recursive mirrors/glass with Fresnel and total internal reflection; floating-point accumulation; exposure, Reinhard tone mapping, and sRGB PNG output. A library backs the command-line application. Run `cargo run --release --locked --example shapes` to render both camera studies into `output/`.

Versioned JSON scenes now support named materials/textures, reusable OBJ meshes, transform groups, relative asset paths, checker/image textures, and flat/smooth triangle shading. See the [scene format](docs/SCENE_FORMAT.md). All example assets are included and work offline after dependencies are installed.

![Imported textured mesh, flat and smooth shading](gallery/mesh.png)

Seeded jittered antialiasing and rectangular area-light soft shadows are verified; [sampling comparisons](docs/SAMPLING.md) show actual images and estimator tests. Rayon tiles and progressive previews are implemented with deterministic per-pixel sampling; see [parallel rendering](docs/PARALLEL.md). A separate [physical mode](docs/PHYSICAL.md) provides Lambert/GGX/Smith/Schlick reflection, exact Fresnel dielectric transport, HDR environment importance sampling with MIS, and linear RGBE export. It integrates direct light; diffuse/glossy interobject indirect transport and caustics are absent.

![HDR environment-only material studio](gallery/physical-studio.png)

Selectable brute-force, binned-SAH BVH, and reference octree traversal cover both instances and mesh triangles. Animation and procedural generation remain in progress. [Measured benchmarks](docs/BENCHMARKS.md) include raw data, hardware, settings, construction cost, and brute-force agreement. In the fixed 8,192-triangle ray-query workload, BVH reduced the median from 734.6 ms to 2.87 ms on Apple M1 Max; this measures intersection work. Full-render measurements at 320×224 also cover 1/2/4/10 workers with exact film agreement; the area-light study measured 0.875 s at one worker and 0.100 s at ten.

![Sampled rectangular-light soft shadows](gallery/soft-shadows.png)

![Canonical shapes and nonuniform affine geometry](gallery/shapes.png)

`cargo run --release --example legacy` reproduces the original five 1024×768 demonstrations in the current directory. Run it from an output directory using `--manifest-path` to keep generated files out of the repository root. Legacy output retains the original display convention for comparison.

Run `cargo run --release --locked --example glass` for mirror/refraction and inside-glass studies. This example uses the educational additive model. Both integrators use opaque glass shadow rays; diffuse indirect light and caustics are absent.

![Whitted mirror and glass study](gallery/glass.png)

![Original educational shading baseline](gallery/baseline.png)

The broader renderer is being built and tested through documented milestones. This repository is separate from the manually authored class submission. Heather directs and reviews the portfolio project; Codex assists with implementation, testing, debugging, and documentation. No repository license has been selected.
