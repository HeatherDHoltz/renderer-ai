# Room checks

Use the intended saved scene. Do not rebuild Heather’s layout from the default generator. After geometry edits, run `audit_set.run(evidence_count=4, context_count=1)` with this directory on Blender’s Python path. Long jobs can be scheduled through `bpy.app.timers`; reload changed modules first.

Read `output/railcar/set-audit.md`, then the ranked findings in `set-audit.json`. Progress is in `set-audit-progress.txt`. Reports identify source/geometry hashes, exact object pairs and visible witnesses.

- Check exposed same-facing patches first. Surfaces within 0.1 mm can fight for the same pixels. Normal opposing-face contacts and shared edges are not defects.
- Fix confirmed duplicate surfaces/crossings in their source. Allow an intentional join only as an exact pair in `audit_contacts.json`, with a source reason and bounded overlap. Never exempt an entire collection.
- `audit_supports.json` checks known flat assemblies for floating, penetration and poor footprint coverage. It cannot prove support on curved or irregular surfaces.
- Recheck after changes. Pair-color evidence locates geometry; it is not a final-material render. Inspect a matching Cycles/browser view before claiming a visible fix.

`GEOMETRY_CHECKS_CLEAR` only clears these checks. Sampled visibility, self-intersections, text/curves, animation, materials and baked lighting need separate inspection. Physical scale is 1 authoring unit = 100 mm. The historical 126-view sample covers only a fixed pivot, 16:9 and ±45°; it does not cover today’s ±90° station views. Do not delete geometry based on that sample alone.

## Export and lighting

Stage with `export.run(output_dir='/absolute/staged/export')`. A `groups_only` result is partial and must not replace the complete live manifest. Preserve source material slots and UVs while baking; later groups need the original bounce surfaces.

Apply every `bake.requiredCollectionOverrides` entry before installation. Historical legacy-clock exports need `rebake_subset`; current imported-clock lighting uses `bake_replacement_props.py`. Do not run the legacy override against an empty collection. Moving hands, weights and pendulum remain live. Current production source/evidence: `output/railcar/heather-sync/`.

For the rug, the preserved-scene receiver correction is:

```python
rebake_subset.run(collection='persian carpet', group='architecture',
    object_names=['persian carpet'], export_dir='/absolute/staged/export',
    evidence_dir='/absolute/evidence/rug-bake')
```

After matching-image review, install with `rebake_subset.install_candidate(export_dir=..., evidence_dir=..., captures=[...])`. Clock and rug need separate evidence directories. Never install diagnostic low-sample maps. The helper checks geometry/map hashes and unchanged pixels; it does not judge appearance.

## Browser comparison

Cases are owned by the runtime; `case_preview.py` derives Blender previews from `case-snapshot.mjs`. Keep their live geometry excluded from static baking. Node must be available to Blender (`LJ_NODE` can specify it).

`capture.mjs` records readiness, camera, viewport, canvas size and console messages in a sidecar. Require true rendered readiness and inspect the image. A fallback poster is not a valid 3D comparison. `CLEAN=1` hides UI without changing the camera. Match Cycles and browser cameras, exposure and output size before comparing pixels.

Geometry checks and static captures do not establish FPS, eliminate animation flicker or prove a 95% Cycles match.
