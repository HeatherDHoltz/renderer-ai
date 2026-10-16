# Parallel and progressive rendering

The JSON/CLI renderer uses a dedicated Rayon pool and immutable scene data. Each task owns a tile buffer, starts from the film's existing linear sum, and evaluates its pixel samples in ascending absolute sample order. Completed tile sums replace disjoint film pixels after the batch finishes successfully. There is no shared RNG or global pixel lock. Memory scales with image size and tile results, rather than samples per pixel.

`threads` defaults to 0, selecting `available_parallelism`; explicit values are 1..256. `tile_size` defaults to 16 and supports 4..256. Partial right/bottom tiles are clipped to image bounds. A one-thread render uses the same tile algorithm as multiple threads. Legacy examples retain their original serial center-sample wrapper for baseline comparison.

`progressive` defaults false. When enabled, `preview_every` (default 8) is the number of additional samples per pixel per preview. Each completed batch represents a uniform, explicitly counted prefix. The final partial batch is handled correctly, e.g. 13 spp at batch size 5 produces previews at 5, 10, and 13 spp. Samples are averaged using actual counts and the normal exposure/tone/sRGB pipeline.

The CLI writes each preview to a temporary PNG beside the destination and renames it over the destination after encoding succeeds. Progress messages appear per complete batch. Ctrl-C uses the operating system's normal process interruption; the most recent completed preview remains valid, while unfinished tile work is discarded. An interrupted temporary file can remain under ignored output/. There is no accumulation-checkpoint resume format.

```sh
cargo run --release --locked -- render scenes/soft_shadows.json --spp 128 --threads 0 --tile-size 16 --progressive --preview-every 8 --output output/preview.png
cargo run --release --locked -- render scenes/soft_shadows.json --width 321 --height 219 --spp 13 --threads 4 --tile-size 13 --progressive --preview-every 5 --output output/progressive.png
cargo run --release --locked -- render scenes/soft_shadows.json --width 321 --height 219 --spp 13 --threads 1 --tile-size 16 --no-progressive --output output/direct.png
cmp output/progressive.png output/direct.png
```

The 321×219 commands were exercised and their PNG bytes matched exactly. Tests cover odd dimensions, worker counts 1/2/4/automatic, tile sizes 4/13/64, exact linear-film equivalence at every progressive prefix, and a stopped callback retaining a complete valid preview. These are same-build/machine observations; no cross-platform floating-point identity is promised.

`benchmark-render` measures actual rendering with repeated warmups/runs and checks exact linear-film hashes against a one-thread reference on every run. It includes pool setup, film allocation, tracing/shading, scheduling, and tile merge, while excluding scene construction, image conversion/output, and verification hashes. See [BENCHMARKS.md](BENCHMARKS.md) for measured results once collected.
