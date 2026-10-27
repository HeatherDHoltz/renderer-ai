# Development

## Start

Node.js 20+ is required for the browser workshop. Dependencies and runtime assets are included.

```sh
npm run dev --prefix workbench
```

Open http://127.0.0.1:4173/. `npm run build --prefix workbench` creates `workbench/dist/`. The build excludes personal-use local audio and authoring caches. Rust commands require stable Rust; Cargo downloads its dependencies on first build.

## Source map

| Location | Purpose |
| --- | --- |
| `workbench/src/` | Browser interactions, materials, shaders and loaders |
| `workbench/scripts/railcar/` | Blender room export, lighting and geometry tools |
| `workbench/assets/` | Runtime geometry, textures, sounds and credits |
| `src/` | Separate Rust offline renderer |
| `scenes/` | Rust examples and procedural configurations |
| `tests/`, `workbench/tests/` | Rust and browser checks |
| `docs/benchmarks/` | Recorded performance evidence |

## Room editing

The exported room is included; the working Blender files and original download caches are local authoring files under ignored `output/`. A fresh clone can run the workshop without Blender. Recreating Heather’s exact edited room requires those saved authoring files.

Save a copy before editing. Preserve object names, texture coordinates and animation pivots. Moving furniture or lamps changes shadows and requires updated lighting. Moving an interactive assembly also requires updated interaction metadata.

Use the saved room rather than the default generator, which recreates an older layout. `sync_saved_room.py`, `bake_saved_lighting.py`, `bake_replacement_props.py` and `safe_lighting.py` handle saved-scene exports and special lighting. Read their entry points before running them.

Stage exports under `output/`, then compare matching Cycles/browser views before installation. [Geometry checks](../workbench/scripts/railcar/AUDIT.md) · [Lighting rules](../workbench/scripts/railcar/APPEARANCE.md).

## Delivery and checks

Local builds retain the original assets. [Delivery preparation](STARTUP_FAST_DELIVERY.md) creates smaller copies and optional sharper textures for hosting. Do not replace the originals with delivery assets.

When checking a change:

```sh
npm test --prefix workbench
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

CI runs Rust checks and small offline renders on Linux/macOS, plus browser checks and a build on Linux. These checks do not run Blender, measure FPS or establish visual fidelity.
