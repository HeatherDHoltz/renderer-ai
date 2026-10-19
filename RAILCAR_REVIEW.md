# Railcar visual review — step 3 (Claude, Oct 17 2026)

Reviewed: `output/railcar/renders/r16-cases-fit-context.png` (Cycles, home camera), the matching
`output/railcar/case-update/browser-open-final.png`, `r14-ring-home-context.png`, and
`RAILCAR_HANDOFF.md` through "Case preview update and lighting approval". Heather's r14 lighting
approval stands; nothing here asks to relight the room. Items are ranked by how much a visitor
would notice. Each has a check that says when it is done.

## What works

- The cases now read as real cantilever boxes: hollow rosewood, brass parallel arms, stepped trays,
  stones and rings sitting in velvet. Geometry and pose are coherent in both images.
- r16's cases are grounded: soft contact shadows on the leather, trays casting onto trays.
- The desk reads as a working jeweller's bench: inkstand, papered stones, ledger cards, lamp, balance.
- The ring-centred camera fixes the "leaving the room" problem; nothing behind the viewer shows.

## Must fix (a visitor notices immediately)

1. **Lid mirrors read as black screens in the browser.** Both lids are flat black rectangles, the two
   largest dark shapes in the frame, and look like tablets. In Cycles the left lid only shows the wall
   damask (which Heather wants removed anyway).
   *Recommendation:* line the lids with quilted silk or velvet matching each case's tray velvet
   (period-correct for jewellery boxes, no reflection cost, removes two reflective surfaces as Heather
   asked). If a mirror is kept, it must visibly reflect the warm window wall.
   *Done when:* neither lid is the darkest or most uniform region in the browser frame.
2. **The desk leather is a different colour in the two images.** Cycles shows green leather with a
   tooled border. The browser shows desaturated slate grey with a broad sheen, so the desk no longer
   reads as green leather.
   *Done when:* a mean-colour sample of the same leather patch in the two captures differs by less
   than about 8 sRGB levels per channel, and the gilt tooling is visible at the home framing in both.
3. **The framing spends its height on the wrong things.** The bottom ~30% is the desk's front rail
   and apron; the window wall (forest, curtains, sconces) is cut at mid-height; the brightest object
   in r16 is the white bench-pin block at bottom centre.
   *Recommendation:* tilt or raise the home camera so the ring sits near the lower third, with the
   sill, curtains and lower half of the sconces in frame. Darken the bench pin to aged boxwood and drop
   it below the frame edge, or remove it.
   *Done when:* at 16:9 the home view shows the window sill and curtain tie-backs, and no prop is
   brighter than the stones.
4. **Live cases are brighter and more orange than the reference, and float.** The browser rosewood
   reads orange-red and flat; the stone velvet is pale salmon against r16's deeper rose; there are no
   contact shadows under the cases. Codex noted the brightness; the missing grounding matters as much.
   *Done when:* case wood and velvet are within ~10 sRGB levels of r16 in matching patches, and each
   case has a visible soft contact shadow on the leather.

## Should fix

5. **The ring pad is the brightest large surface in the browser.** A cream slab directly behind the
   main diamond lowers its contrast, and the eye goes to the pad first.
   *Recommendation:* muted dove-grey or oatmeal velvet. Keep the ring's surroundings darker than the
   stone.
6. **The reference's own desk rail is over-saturated.** r16's front rail and case edges read flat
   orange, almost plastic. Deepen the mahogany toward brown in the Cycles material before the matching
   pass, so the browser is matched to the right target.
7. **The tweezers look propped on nothing** (r16, right edge). They are tilted up across the
   leather/rim border without a visible support. Add them to the support contracts, or lay them flat
   on the leather.

## Minor

8. A golden blob is cropped at the top-left edge (brass vase or lamp fitting). Crop it out or move it,
   since half-objects at the frame edge read as mistakes.
9. The browser's top-right shows a bright framed panel with noisy reflections that r16 does not have
   (a mirror or painting edge). Match r16 there, or remove the object if it falls outside the set.
10. In Cycles the stones look like coloured glass. That's expected (physical stand-ins); the browser uses
    Heather's renderer. When the decorative papered stones move to her renderer, verify them in the
    browser capture, not in Cycles.

## Still open from Heather's earlier list (not visible in these frames, do not drop)

- Walls without the damask pattern (ceiling only); plain wood panelling instead.
- Paintings lit by the same bake as the wood, no unlit canvases; no hidden shelf lights in bookcases.
- No curtain, painting or panelling interpenetration in the allowed camera envelope.
- Total room download target around 30 MB at full material and lightmap quality, by removing what the
  camera cannot see rather than lowering resolution.

## Status after Claude's pass (Oct 17, afternoon) — uncommitted

Measured as mean sRGB patches, browser vs r16, same 1280×720 home camera (`?shift=0` for comparisons):

- **1 Done.** Lids are lined with the case's own velvet (`bench-objects.js`, part `lid-lining`); no mirror
  material remains. The snapshot test asserts one lining and zero mirrors per case.
- **2 Done.** Leather 70,80,68 vs r16 69,75,64. Root cause was global, not leather-specific:
  `LIGHTMAP_INTENSITY` 0.7 → **2.4** (with reflections off, the desk apron matches exactly, 51,11,0, and the
  window wall is within ~4 levels). The old 0.7 had been fitted to walls washed out by the reflection probe.
  Probe share on varnish 0.35 → 0.12. Live desk glints: metals 0.15 (`?deskspec=`), leather sheen 0.45
  (`?leatherspec=`), woodwork and paper 0 (the exam lamp's glare is not in Cycles). Desk rail 145,75,30 vs
  139,67,16.
- **3 Done (browser side).** A 0.15 lens shift (`?shift=`, eases to 0 in case/loupe close-ups, 0 for `?hero`)
  keeps the orbit pivot on the ring while framing the window wall. The bench pin still shows at the ±45°
  extremes: darken or remove it in `desk.py` at the next rebuild.
- **4 Done.** Case wood and velvet take 0.42 of the live fill and probe (`?caselight=`): case front 34–37 vs
  r16 24, velvet visually matched in crops. Soft contact-shadow decals under each case (browser only, skipped by
  the Cycles snapshot).
- **5 Done.** New dove-grey bench mat, now the default swatch; ivory kept for grading.
- **Forest:** Heather asked for one moving, blurred image. The trunks are gone; the HDRI scrolls (~80 s per
  pass) with a 12-tap motion blur. The window glazing is no longer loaded (its reflections smeared).
- **Clock (initial finding; superseded by Codex verification below):** the longcase clock at the right edge renders ~3–5× brighter and more orange
  than r16 (trunk 153,62,10 vs 61,15,0). The cause is its baked furniture lightmap, not emission: lightmap off
  gives 37,23,13. Its irradiance there is 0.6–1.0, plausible for a face toward the lamps, so check after the
  rebake whether denoiser bleed across packed islands, or the source repairs, change it. The trunk-door glass
  is hidden for now (white probe streaks).
- FPS (Chrome/Metal, 3456×2060, preview pane closed): idle 30, orbit 33–35 (min 30), case open 30 (dips to
  21–25 during the opening animation), loupe idle 30 (min 26), loupe drag ~18. Two runs each.

## Next review checkpoint

After items 1–4: one Cycles render and one browser capture from the same home camera, plus the two yaw
extremes (±45°) at 0° elevation. Put them in `output/railcar/renders/` and say which commit they
come from.


## Codex rebake investigation (Oct 17 — historical trials)

- Read Claude's `RAILCAR_REVIEW.md` and preserved the visual-pass edits and Heather's lighting approval.
  Removed the removable bench pin **and its clamp** from `desk.py`, so they cannot enter either yaw extreme
  after rebuilding/exporting. The old website assets still contain them until the staged export is installed.
- Found a bake transport error before denoising: the furniture group's white-diffuse override changed the
  room's bounced light. A 128², 256-sample clock-trunk probe measured mean linear RGB **0.648/0.518/0.480**
  with the legacy whole-group override versus **0.091/0.065/0.048** for a white clock receiver surrounded by
  original materials. These are irradiance-bake values, not display sRGB or measured browser brightness.
- `export.diffuse_copy()` now keeps the authored BSDF/emission on deeper rays, with the initial Cycles bake
  segment neutral. Corrected whole-group result: **0.084/0.064/0.050**. A depth-zero-only experiment did not
  match the reference and was rejected. RGBM 0.5 round-trips as 0.499992; that encoding check found no exposure
  contamination. The measured receiver comparison is strong evidence for the override error, but final
  browser/clock colour still requires matching-camera captures after the rebake.
- Also found that `export_group()` cleared source material slots/UVs before baking later groups. Export now
  strips temporary delivery copies, preserving earlier groups as correctly shaded bounce surfaces. Bake
  material overrides are restored on errors. Partial exports require a separate output directory; a full
  export can also be staged with `export.run(output_dir=...)`. Full material/lightmap/sample quality retained.
- Reusable Blender diagnostic: `workbench/scripts/railcar/probe_bake.py` (white receiver reference, legacy
  whole-group white, preserved-bounce group; float arrays and source fingerprint under ignored output/).
- Current job: rebuild → evaluated geometry audit → three 64-sample Cycles references (home, ±45° at desk
  elevation, `shift=0`) → full staged export. Progress: `output/railcar/rebake-review/progress.txt` and
  `output/railcar/export-log.txt`. Staged assets: `output/railcar/rebake-review/export/`. Do not call this
  complete until browser comparison/calibration and installation have succeeded. Source base is
  `6f9ca8d427edb2bf78e6e5d4bea5ba13799e33fa` plus uncommitted changes; no new commit, push or FPS measurement.

#### First staged comparison — rejected, diagnosis continues

- The first full staged export completed in 1,678 s (136,363,966 bytes) with all existing map dimensions
  and sample counts. **It was not installed.** Its ray-depth-based receiver switch passed an isolated
  clock test but failed the actual merged selection. Browser clock patch (x1150–1210,y90–140 at1280×720,
  home, shift0, probe0, deskspec0): old142/57/8 → staged130/50/7, versus Cycles34/6/0. Do not call that fixed.
- Tracing the same actual surface point through preparation found raw linear RGB0.087/0.076/0.068 when
  baking the prepared clock alone, versus0.478/0.389/0.351 after merging the furniture. Denoising is not
  needed to reproduce this selection-dependent error. `trace.json`, `prepared-trace.blend` and the first
  exporter snapshot are retained in ignored `output/railcar/rebake-review/`.
- A camera-visibility shader switch is being checked against the merged scene. Local installed Cycles
  source initializes bake paths with camera visibility (`kernel/integrator/init_from_bake.h` and
  `path_state.h`); the isolated-only check was insufficient. No second production bake before this check.
- A separate visibility diagnostic found Cycles clock RGB78/21/0 with its glass hidden, versus34/6/0
  with glass. Browser glass remains hidden as Claude set it. This difference must be kept distinct from
  the merged lighting error; do not use a global brightness change to cover both.
- Also corrected the export classifier's substring `" pane"` to an exact `" pane"` suffix: it accidentally
  hid named **panels**, including the clock base panel and gilt. The second export must include these
  authored surfaces. Partial staging now also rejects the actual live directory, including path aliases.

### Second production bake

- Replaced the rejected depth threshold with **Is Camera Ray**: neutral receiver for the initial
  bake view; authored materials for other rays. The rejected export remains under
  `output/railcar/rebake-review/export-raydepth-rejected/`; no rejected or low-sample map was installed.
- The clock door now uses a transmission-only, flat-pane approximation. Per interface it applies
  `sqrt(source tint) * (1 - F0)`, with F0 derived from the source IOR. For tint0.8 and IOR1.5 the
  two-interface transmission is0.73728. It adds no reflected image, white glint or refraction pass.
  This is an explicit approximation, not a claim of full Cycles glass transport.
- Separate diagnostic captures at lm2.4, probe0, deskspec0: camera-aware map alone42/16/7; with the
  pane34/14/7, versus Cycles34/6/0 at x1150–1210,y90–140. Map4096², **16 samples for diagnosis only**;
  not final evidence. A separate lmπ capture with the pane was39/15/7.
- Full second export started16:13 with the existing384/256/256 light samples and2048/4096/4096 maps,
  full-resolution surfaces and the four restored panel objects. No authored lighting/material colours
  changed. Repeated Cycles references differ by at most1 sRGB level, p99=0 in all three views.
- The first isolated white-receiver comparison was not sufficient: white self-reflection and the
  merged selection matter. `probe_bake.py` now labels that legacy baseline accordingly. Actual merged
  geometry and browser captures are required. Do not promote an isolated probe result to visual approval.
- Current progress is in `output/railcar/rebake-review/progress.txt` and `output/railcar/export-log.txt`.
  The final browser comparison, installation, captured evidence and handoff completion remain pending.


## Codex final verification — r17 installed locally (Oct 17)

**These results supersede the preliminary and diagnostic numbers above.** The first two merged
production exports did not fix the clock adequately. The second export was completed at full quality,
then its clock lighting was replaced by the authored-scene receiver bake described here. No diagnostic
16-sample map, uncorrected merged-only clock map or self-shadowed receiver result was installed live.

### Completed changes

- `desk.py`: removable bench pin and clamp removed; both yaw limits inspected in the browser.
- `export.py`: exact pane-suffix classification restores four panels; temporary delivery copies preserve
  earlier groups' materials/UVs; bake overrides restore on errors; partial exports cannot target live
  assets. Manifest records that the clock collection override is required. Camera-aware receiver
  switching helps isolate the problem but **does not by itself make this merged pipeline reliable**.
- `rebake_subset.py`: original authored geometry/materials supply light while white receiver copies
  cannot appear to secondary rays. Receivers reuse the existing exported LightUVs at4096²/256 samples.
  A0.1mm numerical outward bias prevents coincident-source self-shadowing; exported geometry is untouched.
  Selected triangles match evaluated collection vertices/materials within the export's bounded1mm
  coplanar repair. Inspect the masks/counts before using this matcher for another collection.
- The clock mask covers358,875 texels plus safe padding (922,715 replaced pixels). No interior UV
  overlap; **zero occupied non-clock texels changed**, and all bytes outside the patch remain unchanged.
  Candidate application checks both the source GLB hash and base/candidate map hashes. The installed
  manifest contains the replay parameters and applied override.
- `workshop.js`: lightmap intensity2.4→π after remeasurement; the clock pane transmits using source
  tint/IOR (two-interface transmission0.73728 for tint0.8, IOR1.5). It contributes no reflected image
  or refraction pass. Other Claude lighting/material/UI/forest changes were preserved.
- `capture.mjs`: `CLEAN=1` hides interface overlays without moving the camera or resizing the canvas;
  sidecars record actual camera/projection/orbit/case poses. The earlier large clock sample included
  the reset button. Use the clean rectangle below for acceptance, not those contaminated values.

### Measured final colour (mean display sRGB)

Home camera52° vertical FOV,1280×720, DPR1, both cases fully open, `?debug&shift=0&probe=0&deskspec=0`,
CLEAN=1, default lightmap intensityπ, exposure+1.1 EV. Rectangle coordinates are[x0,y0,x1,y1].

| Surface | Rectangle | Cycles | Installed browser |
| --- | --- | --- | --- |
| Clock trunk |1140,85,1170,145 |33.80,5.98,0.09 |29.45,5.30,0.03 |
| Leather |535,290,610,325 |71.16,76.73,65.73 |60.77,74.80,62.00 |
| Desk rail |80,545,200,580 |158.16,56.72,0.10 |167.09,61.02,0.18 |
| Desk apron |160,637,280,662 |26.86,4.93,0.08 |24.92,3.64,0.00 |
| Window pier |640,35,660,100 |49.92,11.78,2.93 |44.90,6.73,0.00 |

Clock before this pass at the same unobscured rectangle:128.34,45.78,0.49. Final maximum channel
error4.35/255 (under5). Other patches retain visible differences; this is **not** a whole-image
pixel-match claim. Live jewellery/pad optics also intentionally differ from the Cycles look-dev objects.

### Review images and provenance

- `output/railcar/renders/r17-home-comparison.png`
- `output/railcar/renders/r17-left-level-comparison.png` (yaw−45°, elevation0°)
- `output/railcar/renders/r17-right-level-comparison.png` (yaw+45°, elevation0°)
- `output/railcar/renders/r17-browser-default-ui.png` (normal view with live probe and0.15 lens shift)
- Separate original PNGs, camera/pose JSON sidecars, and `r17-verification.json` accompany the comparisons.

Base commit `6f9ca8d427edb2bf78e6e5d4bea5ba13799e33fa` **plus uncommitted working-tree changes**.
No new commit, push or publication. Cycles reference settings/lighting were preserved; repeated
reference renders differed by at most1 sRGB level before the metadata rebuild. Final source audit
retains the same1,733 finding IDs and0 failed supports, with512 exposed witnesses. Some evaluated
triangle-buffer hashes differ across rebuilds; do not claim bit-identical source geometry or an all-clear.
The saved pre-export authored snapshot is `output/railcar/rebake-review/clock-rebake/source-bake-input.blend`.

40/40 web tests, build, Cargo format/locked tests/strict Clippy pass. No new FPS measurements.
The car export is133,634,255 bytes and dist174,280,066 bytes (uncompressed file totals);~30MB remains
unmet. Native rendering density, source texture resolution and light samples were not reduced.
Previous live assets are recoverable under `output/railcar/rebake-review/export-live-before/`.

### Next checkpoint for Claude

Review the three r17 comparisons and the normal UI view. The two requested clock/pin issues are
addressed; broader visual matching is still open. In particular, the live case bodies and book-spine
patterns read differently at low views; assess those against the source rather than assuming geometry
is clean. Preserve Heather's lighting approval. Keep the remaining tweezers/papered-stone support,
wall/ceiling treatment, painting lighting, geometry risks and FPS/download work on the queue.

## r17 review (Claude, Oct 17 evening)

Reviewed `r17-home/left-level/right-level-comparison.png` and `r17-browser-default-ui.png`. The clock and
bench pin fixes hold: the clock reads as dark mahogany in every view, and no pale block shows at the turns.
The room's woodwork, leather and curtains at the home view now read as the same room as Cycles.

**Read the comparisons with one caveat:** the browser halves have reflections off, so every metal
(lamp stem, drawer pulls, picture frames, sconce backplates) renders black there. Judge metals only in the
default-UI capture, where they read correctly. For the next checkpoint, add a second browser half at
shipped settings, so metals can be compared side by side too.

Ranked by what a visitor would notice:

1. **Case brass is too pale and bright** (all three views, worst at the low turns). Cycles shows dark aged
   brass on the arms and corners; the browser shows pale cream-yellow bars that read as plastic. The case
   brass is not in `caseMaterial()`, so it takes the full jewellery fill. Route it through the same case
   light scale and darken its colour toward Cycles' aged brass (`#a88d52` → about `#7a5a2c`). *Done when:*
   the arm patches are within ~10 sRGB levels of Cycles at the left-level view.
2. **The lid edges glow.** A bright cream outline runs around both lid linings (home and default UI). Cycles
   shows a dark wood rim. Check whether it is the lining bevel catching the fill (scale it) or a brass fillet
   (darken it as in item 1).
3. **Gilt tooling on the leather border reads as a white dashed line** at the front edge (home view,
   y ≈ 330 of 764). In Cycles it is a dim gold line. Probably the uvbake ORM marks it metallic and the probe
   whitens it; give the desk gilt the same treatment as the other desk metals or lower its probe share.
4. **The side furniture is brighter and more orange than Cycles at the turns.** The bookcases and the corner
   cabinets read saturated orange in the browser, dark red-brown in Cycles; the carpet is brighter red.
   Measure the bookcase frame and carpet patches at the left/right views. If the furnishings group is
   uniformly high, give it its own lightmap factor; if it is a few objects, check them like the clock.
5. **The forest smear is too strong in side views.** At ±45° the window fills a third of the frame and the
   12-tap smear reads as horizontal streaks, not a passing forest. Halve `smear` (0.007 → ~0.0035) and raise
   the defocus LOD (1.5 → ~2.5), so it reads as a soft, out-of-focus landscape that drifts.
6. **Paintings still read flat and slightly washed** (right view: the Lawrence portrait is paler, with less
   contrast, than Cycles, which shows its picture-light glow). Heather flagged this earlier: canvases should be
   lit by the same bake as the wood, not drawn unlit. Bake the canvases into the furnishings lightmap
   (keep their full-resolution image as the colour map).
7. **The gilt frame at the right edge** (default UI, top right) shows a noisy, speckled probe reflection.
   Lower the probe share on large gilt surfaces away from the desk, or blur it (higher roughness).
8. **The pad is still the brightest flat surface** at the home view. Acceptable now, but if it still competes
   after item 1, darken the dove swatch one step (`#8a857d` → `#6f6b64`).
9. **Minor:** the gold blob at top left (brass vase or lamp fitting) is still half in frame at the home view.

**Not visible here, still on the list:** wall/ceiling pattern (damask on the ceiling only), papered-stone and
tweezer support, the geometry-risk queue, and FPS/download size.

## Rug shadow correction — Codex, Oct 17 night

Confirmed Heather's missing-shadow report in the currently served build, not an old source/dist mismatch.
Fresh matching Cycles `output/railcar/rug-review/cycles.png` shows deep shadow beneath the desk. Patched
only the carpet's existing architecture lightmap islands with an intact-scene receiver bake (4096²,
256 samples); installed locally and rebuilt. Other occupied lightmap pixels are byte-identical. Source
geometry, lights, exposure and full-resolution textures are unchanged. Same under-desk ROI [450,585,560,625]
at1280×720, reflections-off: before86.36/7.02/2.60, candidate11.17/1.07/0.20, Cycles5.57/1.14/0.31 sRGB.

The exposed-left ROI [5,600,90,630] still differs: source77.34/49.87/28.74 vs candidate41.51/21.75/14.59;
it spans patterned carpet and is not a uniform-material calibration. This shadow repair does not establish
an exact carpet-material match or a root-cause fix for the merged pipeline. Continue the broader review.
Comparison/capture sidecars and raw measurements are under `output/railcar/rug-review/`. No new FPS run.
The exporter now requires the rug override on future architecture exports (AUDIT.md). No commit.
