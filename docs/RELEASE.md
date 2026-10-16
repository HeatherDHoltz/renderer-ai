# Release verification

Verified October 15, 2026 on a clean GitHub clone at engine/release commit `83bd4ced7e2a412dba15381ebf0d0a7c701298b1`: format, strict Clippy, 91 tests, offline release build, 12 checked scenes, two generator outputs, and three PNG/HDR animation frames all passed. The checkout remained clean. [GitHub Actions run 38854411241](https://github.com/HeatherDHoltz/renderer-ai/actions/runs/38854411241) also passed every job on Linux and macOS. The completion-record commit `074dcc4` changes documentation only; the later gemstone extension adds engine features documented in GEMS.md. Local toolchain: rustc 1.98.0, Cargo 1.98.0, macOS 14.6.1 aarch64.

The release workflow uses a clean checkout, the checked lockfile, and included assets. No runtime service, API credential, external artwork, FFmpeg, Python package, or system graphics library is required for the renderer/examples. Python 3 standard library is used only by the example-check and asset-generation scripts. Cargo needs dependency access on the first build; after `cargo fetch --locked`, verification can run offline.

```sh
git clone https://github.com/HeatherDHoltz/renderer-ai.git
cd renderer-ai
cargo fetch --locked
cargo fmt --check
cargo clippy --locked --offline --all-targets -- -D warnings
cargo test --locked --offline
cargo build --release --locked --offline
python3 scripts/check_examples.py
```

GitHub Actions runs this sequence on `ubuntu-latest` and `macos-latest` with stable Rust. Checkout is pinned to the verified v7.0.1 commit with read-only repository permissions; no deployment or publishing workflow is installed.

The acceptance evidence is distributed by topic:

| Requirement | Evidence |
| --- | --- |
| Affine geometry/cameras and linear film | `tests/geometry.rs`, original 37 preserved unit tests, inspected shapes gallery |
| Meshes/UVs/relative assets | `tests/scene_mesh_texture.rs`, `tests/cli.rs`, included OBJ/PNG fixtures |
| Educational reflection/refraction/TIR | `tests/transport.rs`, inspected glass/inside-glass studies |
| Acceleration and measured performance | `tests/acceleration.rs`, [BENCHMARKS.md](BENCHMARKS.md), raw reports and backend image agreement |
| AA, area lights, threads, progressive previews | `tests/sampling_lights.rs`, `tests/parallel_progressive.rs`, [SAMPLING.md](SAMPLING.md), [PARALLEL.md](PARALLEL.md) |
| HDR and physical direct lighting | `tests/physical_hdr.rs`, `tests/physical_io.rs`, [PHYSICAL.md](PHYSICAL.md), inspected material studio and hero |
| Hierarchical keyframes/frame output | `tests/animation.rs`, all 17 demonstration frames rendered, first/middle/last gallery |
| Bounded procedural/AI scene authoring | `tests/procedural.rs`, [PROCEDURAL.md](PROCEDURAL.md), [AI_SCENE_AUTHORING.md](AI_SCENE_AUTHORING.md), schema and real example |
| Reproducible assets/images and honest scope | [ASSETS.md](ASSETS.md), [GALLERY.md](GALLERY.md), explicit physical/IO limitations and AI disclosure |

The final hero is 1200×800 at 512 spp, seed 116, physical mode, BVH, depth 12, auto (ten) workers, 16px tiles, and 64-spp preview batches. A local inspected run took 80.003 s rendering plus 0.333 s writing, with 0.008 s loading on Apple M1 Max. This is one showcase observation, not a repeated performance benchmark. Repeated benchmark claims retain their original clean engine commit identifiers and raw data rather than being relabeled as measurements of a newer release.

No repository source-code license is assigned. At the verified release above, all art/model/environment assets were project-generated; the subsequent [gemstone study](GEMS.md) additionally includes credited Zsky meshes under CC BY 3.0, with separate asset notices. Dependency licenses remain their own. The separate class renderer's source and Cargo files are checked against the initial SHA-256 baseline locally and are never copied back from this repository. No course documents or private assets are included.

Gemstone-extension verification: 98 tests, formatting, strict Clippy, all 22 bundled scene checks, both generators, and the PNG/HDR sequence pass locally. The updated schema validates all 22 scenes. Actual final gemstone panels and twelve light-sweep states were rendered and inspected; details are in GEMS.md.
