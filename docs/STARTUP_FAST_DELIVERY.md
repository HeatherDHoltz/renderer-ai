# Website loading

Version 29 reduced the initial asset payload from about 244.53 MB to 47.77 MB. Initial room images are smaller; sharper textures load when a visitor approaches a station. Failed detail downloads leave the initial room usable.

Lighting starts at up to 1024 pixels per side, with optional 2048 detail. Surface maps start at 512–1024; prop images start at 512. The forest atlas is 2048. The ring band uses 123,536 triangles instead of 988,288, including in the loupe. `?ringdetail=full` requests the original for comparison and can cause a loading hitch. Gemstone geometry and optics are unchanged.

Costs: softer fine textures and shadows before detail loads, softer reflection captures, and a simpler band. Render dimensions remain 75% per axis. Live shadows and exterior motion remain enabled.

## Measurements

October 23, M1 Max, native Chrome/Metal, 1280×720, DPR 1, 75% render dimensions. Controlled connection: 40 Mbps shared across page and worker requests, plus 40 ms request latency. Three cold/cached pairs, measured from navigation to ready plus two frames:

| Build | Cold median | Cached median |
| --- | ---: | ---: |
| Previous version 28 | 52.963 s | 8.846 s |
| Version 29 | 11.595 s | 2.375 s |

One ordinary public visit measured 28.270 s cold and 5.205 s cached. The earlier 170.467 s public visit used a variable connection; it is not a controlled comparison. These are loading times, not FPS or a visual-match score.

[Recorded runs and conditions](benchmarks/startup.json) include the original timing arrays and payload counts. Full local traces and captures remain under ignored `output/startup-fast/`. These historical measurements have not been rerun for the documentation cleanup.

## Rebuild delivery assets

Run from the repository root with Blender and Python containing NumPy/Pillow:

```sh
blender --background --python workbench/scripts/prepare-ring-lod.py
node workbench/scripts/build.mjs
python3 workbench/scripts/pack-startup-lightmaps.py --assets-dir workbench/dist/assets/railcar/export --evidence output/startup-fast/sparse-packing.json
python3 workbench/scripts/prepare-fast-delivery.py --assets-dir workbench/dist/assets --ring-lod output/startup-fast/setting-low.mesh.gz --evidence output/startup-fast/asset-reduction.json
```

For the existing hosted site, open its isolated source checkout through the Sites helper, then:

```sh
node workbench/scripts/prepare-public.mjs output/site-publication/fast-batched
```

Build, package and publish that checkout through Sites. Its own Node build preserves the prepared assets. Running the main authoring build again requires repeating every delivery step.

For controlled loading measurements, use `workbench/scripts/serve-startup-comparison.mjs` and `profile-startup.mjs`; inspect their options for the intended baseline and output paths. Keep resolution, hardware, connection limits and readiness definition fixed.
