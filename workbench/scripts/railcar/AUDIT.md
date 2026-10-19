# Railcar geometry audit for agents

Run this after any generated geometry change, before baking/export. `build.main()` reloads the generator modules on every call, including repeated calls in the same MCP session. It is an authoring-scene geometry check, with a short ranked queue and evidence; visual approval still requires examining rendered images.

## Run through Blender MCP

Load the intended generated `output/railcar/railcar.blend` first. Run the small regression fixtures once when changing audit code:

```python
import sys
sys.path.insert(0, '/absolute/repo/workbench/scripts/railcar')
import audit_set_checks
result = audit_set_checks.run()
```

For the actual scene, schedule the audit from a timer (MCP calls have a timeout). Reload audit modules if they were edited in this Blender session:

```python
import bpy, sys, traceback
from pathlib import Path
for name in ('audit_geometry', 'audit_set', 'audit_evidence'):
    sys.modules.pop(name, None)
import audit_set

def run_audit():
    try:
        audit_set.run(evidence_count=4, context_count=1)
    except Exception:
        (audit_set.ROOT / 'output/railcar/set-audit-progress.txt').write_text(traceback.format_exc())
    return None

bpy.app.timers.register(run_audit, first_interval=0.2)
```

Read `output/railcar/set-audit-progress.txt`, then **`output/railcar/set-audit.md` first**. The complete machine-readable queue is `set-audit.json`. All generated evidence stays ignored under `output/`. `evidence_count=0` skips optional pair PNGs; `context_count=0` skips real-material Cycles views. Context renders preserve source resolution, sampling, lights and colour management and can take longer than the geometry scan.

## What to do without asking Heather

- Work findings with exposed same-facing patches first, then other exposed crossings. Every finding has a stable ID, two exact object names, physical measurements, an intersection witness, candidate generator modules, and, when found, a reproducible witness camera and the witness pixel at 1280×720. `witness_kind` says whether that visible point belongs to a same-facing patch or a crossing; an exposed crossing does not prove every coplanar patch on the pair is exposed. Repeated source patterns are grouped for triage; all individual findings remain in JSON. Compare `changes_since_previous_run` to see new, resolved and changed geometry.
- A blue/orange PNG shows the isolated pair's evaluated geometry. Its legend is in JSON. It helps locate a contact; it does not show final materials or room occlusion. Inspect a real Cycles/browser view from the recorded camera before claiming a visible glitch.
- Same-facing patches within 0.1 mm are candidates for z-fighting. Opposing faces resting against each other, shared edges and single points are normal contacts. Correct source generators for confirmed duplicate exposed surfaces or accidental crossings.
- An intended join can be documented in `audit_contacts.json`: **exact pair**, source-code reason and maximum physical overlap on X/Y/Z. Check the generated geometry/source before adding it. Never accept entire collections, name prefixes, all existing findings, or a whole assembly. Limits are AABB extent overlap, not measured penetration. New same-facing patches cannot be suppressed by these rules.
- Rebuild and rerun after each correction. Match the same camera and compare actual before/after images. Keep unresolved findings explicit; do not ask Heather to classify ordinary joinery.
- Ask Heather for taste decisions when a concrete rendered alternative is ready, or if a repair changes the agreed composition. Routine diagnosis and geometry repair are already authorized.

## Planar support checks

`audit_supports.json` declares a few source-reviewed flat assemblies. Each names a subject, its support and a local +Z frame, with allowed vertical gap and required footprint coverage. The audit reports penetration, floating gaps and sideways misalignment, or missing named objects. These checks catch the ledger regression that triangle crossings alone missed. They are additional requirements, not exemptions for intersections.

Only use this bounding-rectangle method for known planar supports. It cannot establish support on curved surfaces, holes or irregular footprints. Source reasons and physical tolerances belong beside each contract; do not enlarge limits to silence a defect. The four ledger contracts should all pass after a fresh build.

Run the six standalone physical support checks with:

```sh
python3 -m unittest discover -s workbench/scripts/railcar -p test_audit_support.py
```

## Meaning of a report

`REVIEW_REQUIRED` means the queue still has unresolved geometry risks. `GEOMETRY_CHECKS_CLEAR` means these particular checks found none; it never means the whole site looks correct. An absent exposed witness means visibility is unknown. Treat containment as sampled evidence, not a proof.

The source SHA, evaluated-world-geometry SHA and blend timestamp identify the run. Rebuild the blend after changing generator source; do not use an old report to approve a new scene. The audit uses the authored scale **1 unit = 100 mm** even though Blender's unit settings say 1 metre. All `*_mm` / `*_mm2` fields use physical units. Earlier audit-v1 `overlap_m` values were raw authoring units and mislabeled.

The 126 sampled views cover the fixed ring pivot, 16:9 aspect, ±45° yaw, 0–75° elevation and .75/1/1.25 zoom. They do not cover all continuous views, portrait layouts, movable focus pivots, case/loupe inspection or animated poses. Never delete geometry on the basis of this sample inventory. Cross-object triangles are evaluated with modifiers and world transforms; coplanar candidates are searched independently of Blender BVH overlap, which can miss flat coincident faces.

This audits source geometry before `export.resolve_coplanar()` repairs export faces. A source finding may already be repaired in export; verify the actual website before changing it. Live runtime cases/jewellery and moving objects need separate browser captures across animation extremes. Self-intersections, material/shader issues, baked shadows, normals, curves/text and flicker over time are outside this checker. The JSON lists remaining non-mesh render objects and all limitations.

## Accurate browser comparison frames

The repository's `capture.mjs` sets the content viewport explicitly, verifies PNG pixel dimensions and writes a `.png.json` sidecar with the URL, CSS viewport, DPR, canvas size, readiness and console messages. Chrome's `--window-size` alone had produced a 1280×633 screenshot when 1280×720 was requested. Use the sidecar to verify aspect and pixel size before measuring differences. These captures are visual checks, not fps benchmarks. The source Cycles hero camera and the audit's 52° ring-orbit cameras differ; compare matching cameras.

## Runtime-derived case previews

`cases.build()` keeps `faceted()`/`gem_material()` for desk stones, but builds the cases through
`case_preview.py`. That adapter runs `case-snapshot.mjs` against the actual `makeBenchObjects()` factory,
with the fully-open pose. Its tiny canvas stub records label strings only; it does not simulate a browser
or draw a screenshot. Geometry, UVs, custom normals, placement, velvet displacement, ring samples and
linkages are the runtime assets themselves. Shared `surface-materials.js` provides material settings.
Cycles loads the same full-resolution wood/velvet maps and uses physical material analogues; its optical
model and real reflections differ from the runtime gem shaders and reflection probes.

The generated `output/railcar/cases-preview.json.gz` is ignored and regenerated when its source hash
changes. Node must be available to Blender (`LJ_NODE` can name an executable). Cases remain in
`jewellery cases`, which export.py excludes: the website owns the live versions. `camera_frame()` reads
the default runtime frame from that snapshot; the normal audit now uses it instead of a stale fixed seat.
The fixed-ring, 16:9, 126-pose sampling limitation still applies. Do not compare reports from different
camera envelopes as if a new candidate necessarily means new geometry damage.

Run `npm test --prefix workbench`: `case-preview.test.mjs` verifies 12 stones/18 rings, valid buffers,
desk contact, all open-case vertices inside the default 16:9 frame, ten exposed velvet inserts, two lid linings and no mirrors,
and substrate clearance below the deepest lining point. These targeted checks supplement the full scene
audit; they are not an exemption for other case intersections. Opt-in `?debug` exposes `__railcar.bench`,
`camera` and `orbit` for repeatable capture poses. Opening both cases in a capture can use:

```sh
EVAL='for (const c of Object.values(globalThis.__railcar.bench.cases)) c.destination = 1;' \
node workbench/scripts/capture.mjs 'http://127.0.0.1:4173/?debug' output/railcar/browser-open.png 1280 720 1
```

## Bake transport diagnosis and safe staging

A geometry audit cannot detect a lightmap made with the wrong bounce materials. Use `probe_bake.run()`
from a Blender timer on the **authored source** to compare a white clock receiver in the original room,
the legacy whole-group white override, and the corrected override. It records raw linear bake values,
not display sRGB. Re-import/reload `export` after changing it. A result from an old shader is not evidence
for the new one. Do not diagnose packed-island denoiser bleed until the raw bake transport is checked.

The exporter keeps authored materials on secondary rays and exports stripped temporary mesh copies so
later groups still see the correct earlier-group bounce surfaces. Keep the material slots and original
surface UVs intact until every group's lighting is finished.

Stage a full export using `export.run(output_dir='/absolute/repo/output/railcar/rebake-review/export')`.
`groups_only` requires a separate output directory; it writes a partial manifest and must not replace
live assets. Inspect matching Cycles/browser images before installing the staged directory. Preserve
full source texture sizes, lightmap sizes and sample settings. Record the base commit **plus uncommitted
changes**, manifest bake settings, exact capture camera/URL and patch coordinates with any colour numbers.

For pixel comparisons, set `CLEAN=1` on `capture.mjs`: interface overlays are hidden without changing
layout, canvas pixels or camera. Sample only rendered surfaces; the reset control at the top-right can
contaminate a clock patch. Sidecars now also record the actual debug camera/projection/orbit and both case
poses. Keep a normal UI capture separately. A white-receiver probe is not ground truth (it changes
self-reflection); require actual merged-export and browser checks. Small diagnostic maps/low samples must
never replace the final full-resolution, full-sample assets.

## Required clock override after a full export

The current merged pipeline still produces the wrong clock illumination even after receiver-switch
repairs. Its manifest declares `bake.requiredCollectionOverrides`. **Do not install a merged-only
export as a finished railcar.** Preserve the staged files and reload the authored `railcar.blend`
through MCP. Let that load finish before registering another timer (baking in the same callback as
`open_mainfile` can have an invalid operator context).

```python
import bpy, importlib, rebake_subset
importlib.reload(rebake_subset)
bpy.app.timers.register(rebake_subset.run, first_interval=.2)
```

Default paths target `output/railcar/rebake-review/export/`. The helper keeps the original scene's
lighting/geometry/materials intact, excludes the live case look-dev objects, and uses white receivers
that are invisible to secondary rays. A 0.1 mm outward numerical bias prevents self-shadowing against
the coincident original. The shipped mesh is unchanged. Existing LightUVs, 4096 maps and 256 samples
are retained. Vertex matching allows the export's bounded 1 mm coplanar repair; inspect masks and
per-material triangle counts before adapting this helper to another collection.

Read `clock-rebake/progress.txt`, `bake.json`, `composite.json` and the masks. The candidate is
`clock-rebake/candidate-light.webp`; preview it against the same camera before accepting it. Never
ship a low-sample diagnostic. `rebake_subset.install_candidate(export_dir=..., captures=[...])`
checks geometry/base/candidate hashes, verifies occupied non-clock pixels are untouched, applies the
map and records the override in the manifest. It is idempotent on that candidate. It records applied
data and evidence paths, not artistic approval. Apply required overrides after every full export,
then inspect the paired home/yaw-limit images. Generalizing the intact-scene receiver approach to
all groups remains a technical follow-up; the merged discrepancy's complete cause is not claimed solved.

## Required rug override (Oct 17 night)

The installed architecture lightmap also lost the desk's shadow on the Persian carpet. The merged
bake is not a reliable reference for this receiver. After full/architecture exports, reload the authored
scene and run the same preserved-scene receiver method for this **object**, not its entire floor collection:

```python
rebake_subset.run(collection='persian carpet', group='architecture',
    object_names=['persian carpet'], export_dir='/absolute/staged/export',
    evidence_dir='/absolute/evidence/rug-bake')
# After comparing the candidate in the browser at the same camera:
rebake_subset.install_candidate(export_dir='/absolute/staged/export',
    evidence_dir='/absolute/evidence/rug-bake', captures=['/absolute/comparison.png'])
```

Schedule run() through a timer. Evidence directories are explicit and passed to the compositor subprocess;
clock and rug results cannot share a directory. The older internal mask/stat keys still say `clock` /
`non_clock`; for a rug run they mean selected rug / all other surfaces. `bake.json` identifies the actual
object. All 12 rug triangles matched in the initial correction; no other occupied lightmap pixels changed.
4096² / 256 samples and source textures are retained. The low floor-facing comparison uses a moved
focus pivot, not the default fixed-ring camera. Check both the shadow and exposed carpet; some exposed
carpet colour/brightness mismatch remains, and this patch is not whole-room visual approval.

### Screenshot readiness gate

`capture.mjs` uses native Metal and rejects failed WebGL initialization or shader errors instead of
saving the static fallback poster as scene evidence. `ALLOW_STATIC=1` is only for an explicitly
requested poster capture; it cannot approve a rendered-room milestone. Require `viewport.ready=true`
and inspect the captured image plus console sidecar. Baked diffuse and live specular are separate
ownership routes; a strong under-desk shadow does not validate reflection visibility.
