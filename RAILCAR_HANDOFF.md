# Railcar environment — handoff (for Codex or any agent picking this up)

## PUBLISHED — portfolio fallback / graphics startup (Oct 18, separate chat)

Heather reports both parents hit the misleading WebGL message and requires portfolio visitors
to see the project even without interactive graphics. This chat owns startup.js, startup hunks
in main.js/scene.js, initial still/error markup and CSS, gallery.html/gallery.css, selected JPEG
captures, and gallery copying in build/prepare-public. Preserve concurrent room/cache edits.
The blanket fatal message was used for all errors, including failed fetches; it is not proof of
missing WebGL. New baseline is a real scene image + ordinary HTML gallery; 3D progressively opens.
Local QA is complete under output/portfolio-fallback/QA.json:69 web tests,98 locked Rust tests,
fmt/strict Clippy/build pass. Real1920×1080 native scene captures supply the three JPEGs (quality60,
same pixel dimensions; this affects gallery delivery only). No scene geometry/bake/FPS change.
Verified no JavaScript, disabled WebGL, blocked asset, context loss, shader callback, phone layout,
gallery navigation, and restored-network retry to real ready=true. Only unavailable-context failure
offers graphics advice; fetch failures no longer blame WebGL. An early initial-static readiness
race in capture.mjs was corrected so it waits for an actual settled mode.
Isolated QA checkout output/site-publication/graphics-startup/ was opened at8f1fb6c, then fast-forwarded
to1e84f58; do not publish this older room snapshot over the combined publisher. The active renderer
chat incorporated all final portfolio files into source79270dd9df30f4ab36e04cc14cf3eea830557fb9.
Combined version20 deployment appgdep_6ad597e195f8819192d83003d0141592 SUCCEEDED at04:09:17UTC
(Oct18 local). Anonymous public QA passes:430×850 gallery with JavaScript disabled,1280×720
with WebGL disabled, and a blocked scene download showing startup-failed with graphics advice
hidden. Actual public captures inspected; all eight portfolio files match expected hashes
(HTML comparison removes only the observed Cloudflare-injected challenge script). Evidence:
output/portfolio-fallback/public-* . The ordinary HTML gallery is /gallery.html; it downloads
images without loading the large interactive assets. Normal native3D, context loss, shader callback
and restored-network retry were tested locally; no universal3D/browser/FPS guarantee is implied.
Main changes remain uncommitted. Portfolio viewing no longer requires WebGL/JavaScript; no further
work is required for this request. Preserve these fixes in future room publications.

## CURRENT — live room animation follow-up, October 18

The safe, gramophone, globe, desk lamp, cigar, weights and poker are
PUBLISHED in version19, source `8f1fb6c6783049393f0fc91022377f3545eea9bc`.
Deployment `appgdep_6ad593c737948191b47db16d3a02bb4f` SUCCEEDED at03:53:34UTC
(October18 local). Public URL unchanged. Authored COPY: `output/railcar/interactions/source.blend`.
Heather's editing file is preserved. Approved lighting and continuous curtains remain.

Heather now requires live ring shadows and continuous window scenery in every interaction state.
This supersedes the historical room-freeze optimization below. Local `scene.js` redraws the room
on every drawn frame and no longer suspends ambient redraws in settled black loupe mode.
`workshop.js` no longer gates ambient scheduling on window visibility. Reduced-motion and
hidden/offscreen-page policies remain. Pixel dimensions75%, black surround,4x MSAA and gem
optics are unchanged. Continuous-animation follow-up is PUBLISHED as version20, source
`79270dd9df30f4ab36e04cc14cf3eea830557fb9`; deployment
`appgdep_6ad597e195f8819192d83003d0141592` SUCCEEDED at04:09:17UTC (October18 local).
Main repository remains uncommitted. See latest Session progress at the bottom.


## Faster interaction / black loupe — Oct18 PUBLISHED version17

Heather explicitly authorized FPS tradeoffs, including black outside the loupe. This supersedes
prior blanket avoidance of resolution cuts for this iteration. Current candidate defaults:
render dimensions75% per axis (43.75% fewer pixels), black loupe surround, room colour/depth held
while manipulating jewellery or in settled black-surround inspection. Background animation and
room lighting effects pause during that hold; camera/projection, case progress, loupe transform,
light controls and mat colour invalidate it. Animation resumes after release/exit. Main gem
optics, source textures, geometry, shadow sizes and4x offscreen MSAA retained. The final screen
quad no longer allocates redundant default-framebuffer MSAA. ?scale=1 restores native pixels;
?surround=blur restores the live blurred surround and disables room holding; ?roomcache=0 is a
separate baseline. ?msaa=2 tested with no clear extra gain, so default remains4.

`jewelry-cache.js` reuses the existing room target, with no extra full-size room cache allocation.
Held room renders exclude precious-object depth: the current jewellery target supplies it, so
old ring silhouettes cannot clip the rotating specimen. Support/display post now share the live
layer and reflection-capture layer, retaining their appearance in the specimen environment. Both caster layers are enabled for shadow passes only, with hooks and camera masks restored
on failure. Before evaluating cache keys, current camera/loupe matrices are updated. Settled black
inspection stops otherwise-hidden ambient redraws. Bloom still composites current live jewellery.
Frozen room effects are a deliberate approximation, not exact equivalence to animated rendering.
Future moving room props must join the live layer or extend the room key/revision invalidation.

Matched local Chrome/Metal M1 Max, CSS1728×1030 DPR2, diamond/open cases,8s stage samples:
old settings (native+blur+no room hold) median turning18.4fps / loupe8.9fps;
faster settings (75% dimensions+black+hold) turning46fps / loupe20.7fps.
Average actual drawn frames18.48→44.52 and8.81→20.34 respectively. Desktop GPU load and thermals
uncontrolled; no universal guarantee or30fps loupe claim. Earlier balanced-final run overlapped a
visual capture and is not a clean benchmark. Evidence: `output/railcar/loupe-fast/comparison.json`.
The final source adds explicit matrix updates before key evaluation; this does not alter its held
camera workload. Native-black-only14.3fps; native room-cache trial19.7fps preceded final caster-hook
correction, so use the final matched pair for the shipping claim.

64 web tests pass, including cache/rebuild/resize and shadow-hook/material/layer failure restoration.
Rust fmt/98 locked tests/strict Clippy pass; build and visual black-loupe inspection pass. Cache QA:
room reuse increases during rotation; each zoom change rebuilt the room once. At a stable tested
pose cached-vs-uncached mean display-byte difference0.096,915/518400 pixels differ>3; this is not an all-pose equivalence proof. Geometry audit not rerun: no mesh changes.
Portrait QA (430×850 CSS,DPR2): real WebGL render, black surround and balanced645×1275
canvas pass. During the orbit test all88 drawn frames rebuilt the room; camera position changed
as expected. Settled inspection then reused27 room frames. No console errors. Source-setting
inspection found494,138 unique positions /988,288 triangles, zero exact duplicate triangles or
repeated-vertex degenerates; no lossless deletion shortcut found. Evidence `setting-census.json`.
Main repo remains uncommitted. Isolated public source commit f0a130ccd60c805d2b1fe2b42f72389507a08f51,
saved version17 appgver_a2fc089faa088191abcd6b43c97419d4. Archive blob upload again timed out
at300s; used source-build fallback. Deployment appgdep_6ad5688739dc81918c9613aff71aaf93 SUCCEEDED at00:49:05UTC (Oct18 local).
Public URL unchanged: https://heathers-little-jeweler.zoeholtz2000.chatgpt.site .
Fresh anonymous final-source WebGL QA PASSED: black surround, balanced960×540 buffer in1280×720
CSS viewport, settled inspection and28 room reuses; real WebGL ready, zero console errors. Public
scene.js and jewelry-cache.js match the packaged source byte-for-byte. Capture/evidence under
`output/railcar/loupe-fast/public-final.*`. Cold capture78.4s includes downloading/readiness/settling;
the large loading payload is still an unresolved issue. No95% Cycles match or30fps loupe claim. Older094871… upload attempt timed out and was
not saved/deployed; f0a130… adds reflection-layer visibility for the live support and is the
actual saved/deployed source. Main repository is uncommitted.

## Approved lighting + continuous valances — Oct 18 follow-up

Public deployment SUCCEEDED: isolated source commit `d123e82c708954c8b2340cb9d025934be6247ddf`,
saved public version16 (`appgver_5d0f25b86a688191858a2e9bb7366688`). Archive upload timed
out after300s; source-based build fallback succeeded under deployment
`appgdep_6ad55a08a77081918d952d66cbd6ad2c`. Public URL unchanged: https://heathers-little-jeweler.zoeholtz2000.chatgpt.site .
Verified public manifest hashes to`ef18d015481c4688498b87855d67138a3823c5d28315bd432406e8107c8b9db4`;
its `PUBLICATION.json` points to the original local manifest25f393ac… . Source push failed
once at full size, then8 <=24MiB batches recovered forward-only without a force push.
Main repository remains uncommitted; publication checkout commits are isolated.
Anonymous native WebGL QA passed: `output/railcar/curtain-repair/public-continuous.png`
and its readiness/hash/camera sidecar; no console errors. Public cold capture70.5s includes
all loading and settling. Payload remains large; the roughly30MB aspirational budget is unmet.

Heather approved the readable lighting and requested updates to the SAME public Site.
Continuous velvet valances replace the three overlapping rolls: eight authored objects,
704 internal cap triangles removed in delivery, shared radial barrel normals, original
outer bounds and texture density. Frozen repaired source:
`output/railcar/curtain-repair/source.blend` (do not replace it with the older editing UI file).
`curtain_repair.py` repairs the original authored objects; `curtain_export.py` patches the
existing merged export with guards. The first radius-step repair was rejected by Heather;
ignore its earlier images and use `continuous-rebaked.png` / `final-pan.png`.
A targeted 4096² / 256-sample intact-scene receiver bake removed the old three-roll bands.
123,051 RGBA16F texels patched; all other occupied and outside-mask texels are bit-identical.
Source lighting/forest/room layout unchanged. Manifest now `25f393ac5ea8660f7fff74729a5f2aa5bbcea136c21adcfc65bd70c9b81b34e0`.

Performance: `point-shadow-cache.js` is diagnostic ONLY (`?shadowcache=1`), off by default.
It caches exact stationary case point-shadow maps and unions their packed distances with
moving geometry at the original 2048²-per-face resolution. At one stable tested pose all
134,217,728 output bytes matched the ordinary combined shadow pass. Other tests showed
small differences on animated gems; do not claim all poses verified. Native M1 Max / Metal,
3456×2060 DPR2, open cases, explicit diamond, scripted specimen rotation, quiet matched runs:
median rotation21.3→21.6fps; loupe10.3→10.6fps; idle30 in both. Average drawn frames21.33→21.70
and10.42→10.54 respectively. Small single-pair gain does not justify enabling extra maps.
A smaller optimization is enabled: case shadow batches are separated by case and use
conservative updated bounding spheres for face culling (`?casecull=0` restores old grouping).
62 web tests include posed-case bounds/triangle checks. One quiet matched native run:
median turning22fps / loupe10.6, average21.83 /10.54; baseline21.3 /10.3 (21.33 /10.42).
These small single-pair differences are not a validated large speed-up. Image differences
were confined to sparkling gems in the tested desk view; packed depth max difference
4.77e-6, none >1e-5 at the tested pose. Extra point-map caching remains OFF by default.
Original shadow filtering, geometry, pixel density and gem optics preserved. No30fps
interaction target or95% Cycles match is claimed. Evidence: `output/railcar/shadow-cache/`.
Full final-source evaluated audit:233.52s, 2,781 unresolved scene pairs,895 exposed risks,
zero support failures. This is NOT a globally clear audit. The 48 valance-related findings
are crossings/contacts with existing window heads, pelmets or drapes; the old separate-roll
coplanar pairs no longer exist. Source topology and close/panned web images are separate
checks because the audit does not detect self-intersections, shading or temporal flicker.
Next performance work: separate static room/depth from animated exterior/fire in the loupe;
handle occlusion/transmission and bloom correctly, then compare matched images and quiet FPS.

## Website sharing and UI polish — published separately from lighting (Oct 18)

Heather requested a public link, plainer render-journal copy, removal of the date/status
labels and three bottom tool buttons, and direct ring dragging without choosing a tool.
Public access is now enabled on the existing Sites project
`appgprj_6ad1d1ee181c819186c337d3573bdaea`; URL unchanged:
https://heathers-little-jeweler.zoeholtz2000.chatgpt.site .

This pass owns `index.html`, `src/main.js`, appended UI CSS, the jewelry hover-label line
in `src/scene.js`, and lossless public-delivery packaging (`src/asset-stream.js`,
`src/float-response.js`, `src/room-asset.js`, the room-geometry loader call in
`src/workshop.js`, `scripts/prepare-public.mjs`, stream regression test).
It does not edit room geometry, lighting settings, source Blender files, or installed
bake assets. Preserve these UI edits when the lighting pass builds/installs.

Public source is prepared in isolated ignored `output/site-publication/incremental/`,
using the currently installed manifest `669bda76a1b063c6c06281a0374f79dad049376295b01467852f744a363dee9b`.
Large GLBs use lossless gzip and are compared to the full original file after decompression;
large gzip lighting files are split into <=8 MiB pieces and reconstructed as an exact
stream before decompression. Unused retired props, sky, cloth responses and orphan textures
are omitted from PUBLICATION ONLY; current material maps, geometry and lighting stay exact. No quality reduction. This is a snapshot of the prior
installed lighting candidate, not acceptance or publication of the running new bake.
Main repository changes stay uncommitted. Local verification: 61 web tests, Rust fmt,
98 locked tests, strict Clippy, built/inspected desktop and portrait browser images.
Native input QA: 20 ring rotate calls, 0 camera orbit calls while dragging the ring in
normal explore mode; camera stayed fixed. Room drag separately orbits. Loupe action and
magnification work, all three journal images load, no horizontal overflow at 430px,
no console warnings/errors. Evidence: `output/website-polish/`.

Sites source push needed <=30 MiB batches, HTTP/1.1 and http.postBuffer=67108864.
Bulk transfers failed; failed unshared histories remain under `output/site-publication/source/`
and are NOT the authoritative checkout. Reuse `incremental/` for future publication.
Initial pushed source: `f7decf0885cb919f257dbd75c471f55f07e85332`.
Local archive upload timed out twice at 300 s; retained full-quality archive `public-site.tar.gz`.
Used the supported remote-build fallback from that same source; no quality reductions.
Saved version 14: `appgprj_6ad1d1ee181c819186c337d3573bdaea~appgver_267adb235d3c81919e6e80fc42268844`.
Deployment `appgdep_6ad54c666f488191981520bd94441d73` FAILED: input archive exceeded 256 MiB.
Corrected publication omits 37,160,304 unused bytes, uses exact-original-GLB gzip transport,
and removes generated `dist/` duplication from the HOSTING source Git tree. Original workbench
assets remain untouched. Required source/runtime is 262,223,100 bytes, within 256 MiB;
local compressed archive is ~240 MiB. Native QA of this exact candidate passes direct drag,
stationary camera, keyboard rotation, room orbit, loupe, journal, portrait and zero console logs.
61 web tests and all required Rust checks rerun successfully. No new FPS/fidelity approval.

Current pushed source: `fda72c64b0c0778720e88eb29296c01aeb457f58`.
Saved version 15: `appgprj_6ad1d1ee181c819186c337d3573bdaea~appgver_51d23afd855c8191850ce4b8bb2fd366`.
Deployment `appgdep_6ad54dc38e6081919d88ba9f71d5e9fb` SUCCEEDED at 22:55:58 UTC.
Public URL: https://heathers-little-jeweler.zoeholtz2000.chatgpt.site . Anonymous HTTP 200 serves
new controls/journal and removed labels. Live anonymous WebGL QA PASSED: direct ring drag (20 rotations, 0 camera orbits),
identical camera before/after ring drag, room orbit, keyboard rotation, loupe pickup/zoom,
removed labels/buttons, journal and 430px portrait layout with no overflow; zero console logs.
Real public images and checks: `output/website-polish/published/`.
No host login was used by this isolated browser profile.
Preserve the pack/load helpers when installing the separate readable-lighting bake.
The current public room is the prior installed lighting candidate, not the running new bake,
not visual acceptance/95%, and not a new FPS claim. Main repo remains uncommitted.

## CURRENT — readable fixture lighting installed October 18

This section supersedes historical running/pause instructions below. Full bake and all four painting
maps are COMPLETE. Owned bake PID36854 exited; no bake is paused. Main page4173 now serves the new
lighting, with backup `output/railcar/readable-lighting/installed-before-readable/`. No commits/pushes.

Heather's clarification: maintain readable future interaction targets. Balance bookcase wood with wall
wood and give visible fixtures believable spill; do not interpret “moody” as black drawers/corners.
New source COPY `readable-lighting/readable-source.blend`:
SHA256 `404f997a056fcb39bdb46b021fc662969545b7e14a4e548fc7b975f67be98c45`.
Installed manifest SHA256 `4312414f101de733838cb50028e2b95a0c0cfc5a481aaf740538e5e7eb2ac2f0`.
Editing file `railcar-heather-edits.blend` and interactive Blender layout were NOT overwritten.

Source repair reproduced by `workbench/scripts/railcar/fixture_lighting.py` on an original copy:
six actual bulb emitters per chandelier, total270W versus old121.6W center source inside solid body;
modest visible bulb emission; tinted thin-glass shadow transmission at sconce shades; isolated clear
shadow approximation only on student-lamp chimney; safe-side sconce180→360; world .035→.07.
Shelf/picture lights remain reduced. Explicit shadow transmission approximates thin glass; camera
materials remain. `lighting-changes.json` records settings. New helper rejects repeat application.

All three groups and painting illumination rebaked at original resolutions/samples. Native captures
`browser-home/right/drawers.png/json`, no errors. `browser-safe-pilot` has older architecture but final
safe lighting. `cycles-safe-matched.png` uses same pose in final source. New drawer diffuse detail
is more readable; reflections and some wood brightness still differ from Cycles. NO95% acceptance.
`geometry-preserved.json` proves POSITION/NORMAL/indices identical to previous delivery for27 desk,
48 furnishing and11 architecture meshes. Claude forest JSON/WebP hashes preserved byte-for-byte.

Tested URL varnish1.0 and.35: 1.0 reveals hard probe-occlusion artifacts in knee space/chair; .35
barely helps side drawer. REJECT those as global fixes; default remains.12. Do not blindly carry old
probe calibration notes into future revisions or raise reflection strength without side-view checks.
The original geometry-based case-shadow receiver path is retained.

Performance inquiry: no production visual-quality cuts authorized/applied. Source suggests repeated
room/depth/blur work and early gem occlusion rejection merit profiling before simplifying visible gems.
Main ring setting is nearly1M triangles; native Retina canvas3456×2060 is7.12M pixels. Lower resolution
is a separate quality tradeoff requiring explicit request. Some jewelry/shadow caching already exists.
Exploratory loupe A/B with bake temporarily paused: simplifying11 decorative gems showed no clear
throughput gain. Skipping extra surround scene/blur looked more promising. Raw per-pass Metal timings
are unreliable (tiny passes reported near whole-frame intervals); `profile-caution.json` rejects sums
or rankings. Do not claim a validated speed-up. Bake resumed and finished before current capture.
New selected-diamond measurement is recorded in the latest Session progress below; earlier numbers are historical only.

60 web tests, Rust fmt/98 tests/strict Clippy passed this turn. Helper Python compilation and diff
whitespace checks pass. Installed page/source hash verified and quiet selected-diamond FPS recorded; next Heather reviews
readability against updated Cycles. Remaining material/probe differences and performance targets are
not complete. Preserve source/forest, avoid another giant rebake without measured need; isolated
profiling and exact-appearance caching/culling are the next technical work.

## CURRENT — irradiance review candidate installed October 18, 03:44

This section supersedes the historical active-job instructions below. No bake jobs remain.
Main page: http://127.0.0.1:4173/?debug . Rebuilt dist contains the new source and full
irradiance architecture, desk and furnishings. Manifest SHA256:
`669bda76a1b063c6c06281a0374f79dad049376295b01467852f744a363dee9b`.
Frozen source SHA256:
`f31bc4a892f679e3552b272fd6c725e4b340fea12453af6f7c4981c844caf9c6`.
Manual Blender layout and Claude's night forest preserved; forest hashes verified unchanged.
Backup: `output/railcar/moody-room/installed-before-irradiance/`.
Install provenance: `moody-room/irradiance-install-evidence.json`.

Heather's latest weak-case-shadow complaint was valid. Moving cases were correctly excluded
from static baking, but their live shadow did not reach the baked desk properly. Actual case
geometry now casts into a cached 18-sample atlas; the desk attenuates irradiance before its
BSDF, preserving live specular/caustics. Receiver uses the geometric normal, not wood-grain
normal perturbations. Fixed indirect remainder and finite samples are approximations.
An earlier controlled on/off pilot measured shadow luma 51.43→5.30 and 50.63→7.43 while
uncovered desk stayed 53.60→53.53 (display encoded 0–255, NOT physical illuminance).
Current full-candidate patches: 5.73/7.91 under trays versus Cycles 3.56/5.34; uncovered desk
42.76 versus Cycles 55.98. See `irradiance-full-patch-check.json`. Do not call this 95%.

New bakes use neutral white diffuse irradiance E/pi, retaining authored secondary transport.
Architecture completed 03:06; desk 03:16; furnishings 03:32. Do not restart these jobs.
Rejected old diffuse radiance/base-colour pilots remain only as historical evidence.
Source physical sheen tint/roughness and coat roughness now carried into runtime. Feeding all
baked work-light irradiance into sheen made leather grey; sheen now reads room incoming
radiance. Browser studio direct glints are disabled on static room materials (source AREA/SPOT
lights were hidden from glossy rays). Live foreground retains them. Room/desk probe captures
hide initial foreground, pad, glass and mirrors, and disable reflection feedback. Proper planar
mirrors are NOT implemented/authorized by the earlier estimate question.

Native ready=true, no shader errors: `irradiance-full-home`, `irradiance-full-left`,
`irradiance-full-right`, `irradiance-full-right-open`, `irradiance-full-low-rug` PNG/JSON pairs.
Right/left captures without '-open' retain closed case state; use '-right-open' for open-case
comparison with Cycles. Installed home has same manifest hash and no errors.
Loupe `loupe-latest/checks.json`: 2×/6× blur hashes and projection identical, no logs;
portrait and exit captured. 60 web tests pass; previous same-turn Rust fmt/98 tests/strict
Clippy pass (no Rust edits). No commits or pushes.

NEXT: finish step 6 visual matching. Case upholstery/live specular and green desk brightness
still differ from Cycles; far metal uses frozen combined appearance, probes omit blocked
reflected colour, mirrors remain approximate. Download budget and 30fps interaction acceptance
remain unmet/unproven. Preserve source, geometry and forest; diagnose these specific remaining
material/transport differences before further changes. Do not use an overall dark filter or
restart the room generator. FPS for this candidate is recorded in the latest Session progress below. Current staging 4177 serves the same full manifest from
`diffuse-preview-manifest.json` despite that historical filename.

## ACTUAL NEXT — neutral white irradiance pilot (Oct 18 after 03:00)

IMPORTANT: both radiance/albedo DIFFUSE pilots are REJECTED. The bright green edges were ray-picked
as `rc oxblood velvet`, NOT metal or mirrors. Layered velvet's source radiance/base-colour ratio is
not pure irradiance; feeding it into live sheen amplified channels incorrectly. Do not extend the
old diffuse response path to the rest of the room. Shader tests passing did not prove material fidelity.

Correct path now implemented: `appearance_mode=irradiance` (new exporter default when appearance_factor
is requested). `appearance_response.py` bakes a NEUTRAL WHITE DIFFUSE receiver (E/pi), keeping original
source transport for secondary rays, saves true illumination as RGBA16F. Full source photographs,
roughness, normal maps and live BSDF remain separate. No radiance/base-colour division for room light.
`mode=diffuse` now fails clearly for new bakes. Far metal can still use its separate sparse combined
field; near metal and mirrors stay live. Runtime supports mode irradiance in the lightmap chunk;
case geometry shadows attenuate irradiance, not live specular/caustic output.

RUNNING/finishing pilot: exec session 10520, `export-irradiance-architecture.py`, output
`moody-room/irradiance-architecture/`, log `irradiance-architecture-log.txt`, stage
`irradiance-architecture-stage.txt`, stdout `irradiance-architecture-blender.log`.
At 03:04 white diffuse 4096/256 pass completed in 222s, then far-metal combined and live-only passes.
Exact authored geometry. After completion, merge architecture metadata into a COPY of the full moody
manifest; copy probe-occluders.json (8 bounds) into pilot. Point staging server preference to THIS
folder, restart its own process, then native home/side/low-rug captures with no shader errors.
Only if this removes green velvet and matches better, run desk and furnishings in irradiance mode.

Staging currently port 4177 prefers `diffuse-architecture2/` (restarted exec session 65311); its
`diffuse-preview-manifest.json` is the rejected diffuse2 architecture + full previous room. It is NOT
the new irradiance pilot yet. Installed 4173 remains the earlier combined review candidate; newest
source JS is not built there. No 95% claim or new FPS for these prototypes.

Also fixed the per-pixel mapped-metalness probe-strength error. Local structural visibility uses
seven actual desk cuboids + floor; source-reviewed bounds, geometric ray tests, finite direct-light
distance, five samples for area-light visibility. This omits blocked local reflected colour, not a
full room path tracer. Mirrors are skipped. Valid `diffuse-solid-shadow-low-rug.png/json` has dark
plinth borders, no errors, closer to Cycles; earlier compiler failures/timeouts were fixed, not accepted.
Native capture scripts now reject fallback posters and shader failures; `capture-gate-check.json`
passes (exit 1, no image produced for a fake static-mode page). 59 current web tests pass.
No commits. Source/manual Blender layout untouched.

## LATEST active state — Oct 18 after 02:44

Current installed 4173 remains the combined candidate below, NOT final acceptance. New source JS is
only on staging so far. Eight structural bounds exported from the actual frozen source (seven solid
partners-desk parts plus floor boards) now suppress invalid probe rays AND live point/spot/directional
light glints through those solids. Area-light visibility uses five deterministic sample points.
`probe-occlusion.js` implements this; inverse-transformed ray directions stay unnormalized to preserve t.
Bevel envelopes approximate geometry; blocked local reflected colour is omitted, not traced. Mirrors
and frozen combined materials are explicitly skipped. Broad phases/dynamic loop counts avoid slow
Metal compilation; an earlier rect-loop local-variable redefinition and a heavy compile timeout were
caught in native testing and fixed. Do not reuse failed images. Latest valid
`diffuse-solid-shadow-low-rug.png/json` has no errors and dark plinth borders, much closer to
`cycles-low-rug.png`; the earlier all-live far-gilt pilot produced unacceptable green highlights.

A separate real bug: UV materials use metalness=1 as a texture multiplier, not a declaration that
leather/carpet are metal. Probe strength now blends per pixel using metalnessFactor. All room probe
uniform intensities are ROOM_PROBE; shader applies ROOM_DIELECTRIC only to dielectric pixels and coat.
Nearby case materials keep their own existing live strength. Source changes not yet built into 4173.

Architecture pilot 2 is RUNNING: exec session 23690, `export-diffuse-architecture2.py`, outputs
`diffuse-architecture2/`, logs `diffuse-architecture2-log.txt` and `...-blender.log`, stage
`diffuse-architecture2-stage.txt`. Began 02:44, full 4096 / 256 samples, exact authored geometry.
`appearance_response.py` now uses diffuse-only response for room substrates, plus a SEPARATE sparse
combined response file for distant metal/gilt (home view). Near desk metal and all mirrors remain live.
This prevents the rejected neon probe approximation on far trim while removing frozen glossy patches
from wood/fabric. This helper revision is active in pilot 2. Full-quality normal/photo maps remain.
59 web tests pass (new mixed metalness/probe routing, structural ray slabs, finite light distance,
mirror/combined ownership, diffuse-only routing). Area case shadow hook now attenuates irradiance
before lights_fragment_end for diffuse-mode desk, leaving live specular and caustics alone; old combined
mode keeps outgoingLight attenuation. Fixed .12 indirect remainder is still an approximation.

Port 4177 staging (session 91492) CURRENTLY prioritizes the FIRST `diffuse-architecture/` pilot, not
pilot 2. Its merged `diffuse-preview-manifest.json` includes probeOccluders=probe-occluders.json (8 boxes).
After pilot 2 completes, update server preference to architecture2, copy probe metadata there, merge
that group's fields into a copy of full moody manifest. Capture low rug + side + home; require ready=true
and no console errors. If improved, bake desk/furnishings in the same split mode, compare, then install
and build. Native FPS must be remeasured after ALL bake jobs exit. Current installed FPS below does
NOT describe these newest source changes. No commits; do not touch Blender editing UI or user layout.

## ACTIVE NOW — diffuse/specular separation pilot (Oct 18, after 02:15)

The installed candidate below is NOT accepted. Matching low-rug views (`installed-low-rug.png` and
`cycles-low-rug.png`) show the rug is dark beneath the desk, but also prove that glossy highlights
baked from the home view become wrong from other angles (bright frozen floor border / side varnish).
Continue autonomously: test a source diffuse-only response + live PBR specular, preserving baked
light/shadows and full surface photos/normal maps. Never call the COMBINED candidate a 95% match.

Source JS now supports `spec.bakedResponseMode=diffuse`: float response supplies baked E/pi in the
lightmap chunk, static ambient/hemi/direct diffuse remain suppressed, and native PBR specular, coat
and sheen remain view-dependent. Legacy combined response retains its previous opaque override.
Cache keys distinguish modes. `appearance_response.bake(...mode=diffuse)` excludes glossy from
COMBINED and retains ALL metals/gilt live; `export.run(...appearance_mode=diffuse)` forwards it.
54 web tests pass, including new diffuse/specular routing. Source JS has NOT yet been rebuilt into
the installed port 4173 since these newest mode changes. Existing installed combined data is unchanged.

Running architecture-only full-quality pilot: unified exec session 45486, script
`moody-room/export-diffuse-architecture.py`, output `diffuse-architecture/`, log
`diffuse-architecture-log.txt`, stage `diffuse-architecture-stage.txt`, Blender stdout
`diffuse-architecture-blender.log`. Exact authored geometry, 4096 lighting / 256 samples, separate
headless Blender. At 02:16 light UV coverage .34, bake running. Do not touch editing UI.
Staging server port 4177 (session 91492), `serve-diffuse.py`, prioritizes pilot architecture assets,
then full moody export and old source forest. It REQUIRES `diffuse-preview-manifest.json`, not written
yet. After pilot completes, merge its architecture group/appearanceResponses into a COPY of full
moody export manifest at that preview path; preserve all other groups and painting/live metadata.
Pilot helper loaded just before a cosmetic renderRoute label change; if needed normalize specs with
mode diffuse to route baked_diffuse_live_specular after export. Mode field itself is authoritative.

Next: capture matching low rug, home and side on 4177, compare against current Cycles references.
If improved, rerun desk/furnishings in diffuse mode, adopting each only after comparisons; bake
float response sources remain full-quality. Before diffuse-mode DESK adoption, update geometric
case shadow hook to attenuate baked irradiance BEFORE lights_fragment_end, preserving live specular
and caustics; current combined mode necessarily multiplies outgoingLight. Its fixed .12 indirect
remainder remains an approximation. Then rebuild main site, quiet native FPS, update handoff.
No commits.


## Current local candidate — Oct 18, installed; visual/performance review pending

Installed the moody-room appearance bake plus exact-geometry desk correction in
`workbench/assets/railcar/export` and rebuilt `dist` at port 4173. This is a LOCAL REVIEW CANDIDATE,
not a 95% fidelity signoff or deployment. Backup: `moody-room/installed-before-moody-room/`.
Source/manual layout unchanged; Claude's forest assets preserved. Labels restored; real geometric
case visibility now shadows the desk. Full home/±90° staging captures have no console errors.

Quiet native Metal FPS at `http://127.0.0.1:4173/?fps`, M1 Max, 3456×2060 DPR2:
idle 30; orbit median 28.0 (min 25.6); settled case view 20.3; loupe idle 20.7;
loupe drag median 10.6 (min .2, only 5 counter samples, includes a large stall).
`moody-room/fps-installed.json` contains actual observations. Baking/audit had exited; thermal state
uncontrolled after baking. Do NOT call 30 FPS interaction achieved. No pixel-density/material cuts.
Staged export is ~232 MiB before preserved exterior assets; the ~30 MB target is not met.

Remaining: full visual review at matched home/side/low rug views; static glossy response is frozen
from the home camera, so side-view varnish can differ substantially. Live glasses/metals use probe
approximations; desk microdetail needs review. Finite case-light sampling + fixed .12 indirect remainder
are approximations. Geometry audit remains REVIEW_REQUIRED (2821 pairs), not a clean-room certificate.
Next technical work: resolve confirmed material/reflection differences and profile interaction stalls
without reducing visible fidelity. Heather's review at workflow step 6 is still required; do not ship
or claim 95%. No commits.

## Prior active work — Oct 18 moody-room rebuild

Latest request: fix the two side-table books and ledger dark page/blurred edges, dramatically darken
crosshatched glazing and the bar painting, make the room outside the desk much moodier while retaining
fire/sconce pools. Heather challenged the contrast loss and supplied colour-management advice.
Do not silently treat the old contrast-filter candidate as accepted or the 95% target as met.

Current source: `output/railcar/moody-room/heather-moody-source.blend`, a saved copy of Heather's live
file after the two fireplace picture-light alignments, book geometry repair, reduced ledger bevel,
and explicit mood changes. Prior source backed up as `before-moody-room.blend`.
World strength .55 → .035; gasolier power ×.32; shelf lights ×.4; picture lights ×.45; desk examination
lights, sconces and fire retain their power. Crossed panes: dark cool palette, emission .55 → .008.

Concrete browser bug found: `lights_fragment_begin` accumulated ambient/hemisphere/probe irradiance
before our custom lightmap chunk; it was never cleared. Static surfaces now clear both irradiance and
iblIrradiance before reading baked transport. Live materials retain ambient lighting. Removed the
manual shadow-gain default (.58/.75); default transfer is identity. Actual GPU isolation check gives
baked black [0,0,0] under very strong ambient/hemisphere lights, while a live control is [255,255,255].
Evidence: `moody-room/ambient-isolation-probe.json`. Numeric Non-Color WebP save also checked: expected
(.1,.2,.3,.4) stores (26,51,77,102). Blender OCIO vs browser AgX LUT max difference 0.407/255 over sampled
greys/highlights/warm colour (`view-transform-check.json`). Do not claim the entire image was verified
by this limited test. Colour maps are sRGB; packed numerical light/normal/roughness data remain linear.

New bake path `export.run(authored_lighting=True, appearance_factor=True)` saves static Cycles
COMBINED/albedo response as gzipped RGBA16F on lighting UVs, retains full-resolution surface images,
and bypasses browser relighting for those surfaces. Near desk metals, mirrors and art glass remain
live; glass/gems remain separate. `appearance_response.py` provides this path. Dynamic caustic radiance
is added through totalEmissiveRadiance so it survives the static response override.
Ledger native image was incorrectly reduced from 2048 to 512; exporter now retains native image
resolution. Side-table book covers are separate upper/lower boards + spine; page blocks corrected
from the erroneous -half-thickness offset. Ledger edge bevel .02 → .002 units (0.2 mm).

Paintings now have a separate 1024px smooth illumination map baked on native UVs, while their original
photo resolution remains intact. Runtime reads `paintingLighting`; it no longer assumes a uniformly
bright .78/.70/.60 poster. `painting_response.py` bakes these maps before the room export.

Running headless job: `moody-room/export-moody.py`, log `export-log.txt`, stage `stage.txt`, stdout
`export-blender.log`. Uses separate Blender, not the editing UI. A 2048px lighting-only painting trial
was stopped and restarted at 1024px; full original painting photos remain unchanged. First trial log
may still contain the completed 2048px map entry. Current bake is not installed and needs actual
home/±90°/ledger/bookcase comparison against `moody-room/cycles-{home,left,right}.png`, then build,
GPU FPS on a quiet machine and updated handoff. No commits. Preserve Claude's night forest assets.

### Oct 18 completed bake and remaining review

Full staged export finished at 01:51 local in 1623 s. It is not a 95% signoff. Full matching captures
are `moody-room/browser-{home,left,right}.png` (open cases, native Metal, 1280×720 DPR1, no console errors).
Claude's night forest remains. Side-view varnish/reflections still differ: static COMBINED response
freezes glossy highlights from the home camera, and live glass/metal use room probes. Desk surface
microdetail also needs review. Do not confuse these limitations with the resolved ambient/shadow bugs.

Full comparison found a second coplanar failure: three printed diamond-parcel label planes had been
deleted despite sitting intentionally 0.1 mm above paper. These were the only entirely missing source
materials (`missing-source-materials.json`). Authored exports now skip ALL automatic coplanar deletion
and pushing; keep Heather's evaluated geometry. Legacy generated mode retains its bounded repair.
A separate exact-geometry desk rebake completed at 02:04 local, 358 s: 48230 faces / 27 materials
(previous 48127 / 26). Merged into staged full export with per-group provenance in
`bake.groupOverrides.desk`; pre-repair desk archived in `desk-before-label-repair/`.
Other two groups retain their recorded older exporter hash/geometry repair; do not claim all groups
were rerun with the latest exact-geometry path. Staged full source is unchanged, same frozen blend.

Read-only evaluated scene audit completed: `moody-room/set-audit.md/json`, 2821 unresolved pairs,
904 with sampled exposed witnesses. Four ledger planar support contracts PASS; zero findings naming
`gem book`. This is NOT a geometry all-clear; ranked joinery/overlap triage remains.
53 web tests, Rust formatting, all 98 locked Rust tests and strict Clippy pass. No commits.

### Oct 18 bake restart and case-shadow correction (in progress)

The first appearance pilot is rejected: `moody-room/export-attempt1/` is preserved only as failure
evidence. Coplanar repair used overlapping AABBs to push one rotated ledger page beneath the original
source page. It therefore baked black; display repairs could also corrupt leather illumination.
Exporter now requires positive projected polygon overlap (SAT; tessellated concave faces), ignores
shared edges and retains original world receiver positions in `_lj_bake_pos` during authored baking.
The attribute is removed on delivery. `moody-room/coplanar-test.json` records the targeted checks.
The restarted export completed its desk group at 01:30 local; furnishings/architecture remain pending.
`railcar-checkpoint.json` contains real completed-group metadata; staging uses it only for a desk pilot.

Heather correctly rejected the weak box shadows. Moving cases were excluded from the static bake,
and the static appearance shader cannot receive ordinary browser light shadows. The former Gaussian
contact approximation was inadequate. `area-case-shadows.js` now projects exact moving case geometry
from 16 examination-panel sample positions plus the two case spots into a cached depth atlas, then
applies geometric visibility on desk receivers. This is a finite-sample approximation: the indirect
remainder is currently fixed at .12, not a separately baked direct/indirect transport decomposition.
It is NOT an exact Cycles shadow solver or final visual acceptance. Atlas refreshes when cases move.

Native 1280×720 DPR1 partial-pilot captures: `geometric-shadow-{on,off}.png`, no console errors.
Under-left-tray screenshot luma (display encoded, 0–255): 51.43 off → 5.30 on; right: 50.63 → 7.43;
uncovered desk: 53.60 → 53.53. These are local shadow evidence, not a fidelity percentage or linear
lighting measurement; see `case-shadow-patch-check.json`. Ledger page is no longer black in this pilot.
Case shadow batching preserves exact vertices/normals and source layers. Native on/off captures
with identical frozen film grain have zero pixel differences in the desk/cases crop (1280×720 DPR1).
GPU atlas probe sees 17/18 blocked source projections beneath a tray versus 0/18 at uncovered desk;
panning leaves atlas render count unchanged (31 → 31). See `area-depth-probe.json` and
`shadow-batch-fixed-image-check.json`. Quiet FPS still needs validation before any speed claim. 53 web tests pass, including atlas cache/state restoration.
No new FPS number; Blender is using the GPU. No commit or installation of the full new bake yet.

## Active integration — Heather's final edited room (Oct 17, Codex)

Heather approved her edited Blender layout and requested integration with Claude's finished night forest,
pan ±90°, substantially closer zoom, a larger physical loupe and blurred unmagnified context around its
lens (background must not change zoom with lens magnification). Her acceptance requirement is a result
visually at least 95% like the shown Cycles reference; redo a failed bake/export, do not call it finished.
Use matching-camera comparison and honest measurements, not an invented percentage score.

Frozen source: `output/railcar/final-room/heather-final-source.blend` (saved copy of her live file,
including manual edits). Her editable file was not rebuilt or overwritten. Heavy work ran headlessly.
Current reviewed **candidate** is installed in `workbench/assets/railcar/export` and rebuilt in `dist`,
served at port 4173. Claude's night forest assets are preserved. No commits. This is not a 95% signoff.

Completed: yaw ±90°, closer zoom (18% of home radius), larger physical loupe, fixed 55° blurred
unmagnified surround. Native captures show identical surround projection/hash at 2× and 6×.
Claude CLI implemented/reviewed camera/loupe changes; Codex integrated/exported/measured them.

Export: first clone-based transport bake failed comparison. Found missing material-coordinate
attributes and wrong book random colours. Replaced lighting with an intact-source rebake using
secondary-invisible neutral receivers (`rebake_authored.py`), preserving native source shaders.
Re-encoded retained floating-point lighting at per-group ranges 64/128/64 (desk/furnishings/architecture)
to avoid the old range-16 clipping. Emission remains range 16. Book attributes use Cycles' name hash.
Cloth: `bake_cloth_response.py` bakes source radiance/albedo on lighting UVs; full-resolution fabric
photographs remain live textures. Gzipped RGBA16F preserves the high-range cloth factors.

Heather's latest direction: stronger lighting contrast, dark corners/bookcase recesses, bright local
sconce pools. Browser shadow gain uses actual baked illumination: room floor .58, desk .75, rising to 1
between luminance .035 and .45. Bright pools retain their irradiance. `?shadowfloor=1` disables the room
contrast adjustment for comparison. Nearby inkwells use actual physical transmission; distant glass
reflection strength reduced. Cases have room probes, calibrated cloth/metal response and soft moving
tray contact shadows. Those tray shadows are approximations, not physically integrated area shadows.

Evidence: `output/railcar/final-room/` contains matching home/±90° Cycles references, browser captures,
source inventory, lighting hashes, loupe QA, test logs and performance reports. Corrected two camera
comparison mistakes: Blender horizontal sensor shift must be .15/aspect; yaw rotates Blender X/Y,
not X/Z. Earlier side-reference images were invalid and have been superseded. Audit expanded to ±90°;
its earlier closest sample was .2, while final minimum zoom is .18. Do not call the geometry audit clean:
it still requires review of expected joinery/overlap candidates.

Pending: Heather's visual review of lighting contrast; remaining material/reflection/shadow differences;
final FPS optimization at native Retina without quality reduction. Earlier candidate measurement at
3456×2060, Apple M1 Max Metal: idle 30, orbit median 23.6, case 20.7, loupe idle 22.6, loupe drag 10.2 fps.
Those values do not meet the interaction budget; the installed candidate measured idle 30, orbit 28.1, case 24.6, loupe idle 28.5,
loupe drag 11.1 fps; see `fps-installed.json`. Do not claim 30 fps interaction, 95% fidelity or a 30 MB payload. Source room
and cloth assets currently exceed that download target. Preserve originals/full texture fidelity.

Written by Claude (Cowork) on October 16, 2026. Read this before touching the room. It supersedes the
Edwardian "atelier" room described in `CLAUDE_PROJECT_BRIEF.md` / `SCENE_REALISM_AUDIT.md`; the jewellery
renderer, cases, loupe and interaction code are unchanged unless listed below.

## What Heather asked for (art direction, in her words, condensed)

- 1850–1900. "The richest billionaire's private train car in 1890." Ornate, elegant, cluttered but organized.
- The viewer can orbit/zoom, so the **whole car** must be furnished, not only the desk. Not strictly realistic
  as a train (a wide car is fine).
- Must have: open **fireplace** with guard and fire irons, **whisky corner** (decanters, cut crystal),
  **paintings**, **open bookcases** (books visible, not behind glass), a **globe**, tufted armchairs, a carved
  settee she likes, an ornate gilt **grandfather clock**, wall **sconces** (she likes them), a **desk chair**.
- Desk holds only what a working jeweller would have. Rings/gems live in **cantilever jewellery boxes**
  (reference: https://daniellucian.com/library/spring-loaded-mechanisms/).
- **Bright, neutral light on the gems/rings** so colour and brilliance read. Room must not be so dark that
  objects are unidentifiable.
- Moving **forest** outside the windows.
- **Hold 30 fps.** (AGENTS.md: never silently lower pixel density / material quality.)
- References: `claude/art-direction-references.md` in the Claude project; Victorian library photo
  (oxblood, gilt frames, warm lamps), RDR2-style train interior (https://robinsbth.artstation.com/projects/L2aVww).

## Scale and coordinates (important)

- **1 unit = 10 cm.** The runtime desk layout (cases ~17 cm, camera 40 cm above the desk) was already at this
  scale; the old room was ~half scale (why the clock looked short).
- Blender: x along the car (-26..26), **+y = window wall behind the desk (y = 11)**, opposite wall y = -28,
  z up, floor z = -9, desk top z = -1.4, clerestory ceiling ~z 20.
- App/three.js: `app(x, y, z) = (blender.x, blender.z, -blender.y)` (glTF export with +Y up does this).
- Runtime-owned objects on the desk (do not bake): cases at Blender (-2.85,-1.45) gems and (3.05,-1.4) rings,
  pad (0,-0.25), ring (0,-0.15), loupe (1.6,-1.0). Props dress the back half of the desk and the ends.

## Authoring pipeline (Blender 5.2.2 LTS, Cycles on Metal)

Scripts: `workbench/scripts/railcar/` — everything is generated; no hand edits in .blend files.

| Module | Builds |
| --- | --- |
| `build.py` | `main()` → resets scene, builds everything, saves `output/railcar/railcar.blend` |
| `ph.py` | Poly Haven (CC0) download cache + `credits.json` in `workbench/assets/railcar/polyhaven/` |
| `mats.py` | Material library (mahogany/rosewood veneers, gilt, brass, velvet, Lincrusta, ceiling, carpet, glass…) |
| `geo.py` | box/cyl/lathe/sweep/panel/curtain helpers, `anchor()`/`adopt()` for wall-local frames |
| `shell.py` | Car shell: panelled walls, windows + drapes, Lincrusta frieze, clerestory with leaded deck lights, floor, carpet, end walls |
| `fireplace.py` | Open fireplace on the left end wall (marble, cast-iron insert, log fire, fender, guard, irons, scuttle, overmantel); `FIRE_WORLD` |
| `clock.py` | Ornate longcase clock (bay x = 11.7) with generated moon-phase dial texture |
| `desk.py` | Partners' desk, tooled green leather top (texture-based grain) |
| `cases.py` | Cantilever box **stand-ins** with 12 gems / 18 rings (Blender look-dev only; excluded from export) |
| `trinkets.py` | Desk items: student lamp, diamond balance, inkstand, rocker blotter, open diamond paper + tweezers, labelled parcels, gem ledger, triblet; also tantalus/tumblers/decanters/cloche helpers |
| `library.py` | Open bookcases + procedural books, gilt-framed paintings with picture lights, library globe |
| `bar.py` | Whisky corner on the right end wall (sideboard, mirrored back-bar, bottles, tantalus, siphon, humidor, bookcases, painting) |
| `furnish.py` | Poly Haven furniture: armchairs (recoloured oxblood), settee, gasoliers, desk chair, pocket watch + chain |
| `decor.py` | Library bay, paintings placement, globe, side tables, **exam lights** |
| `lights.py` | Sconces, dusk HDRI world |
| `export.py` | Bake + export for the browser (see below) |
| `stove.py` | Obsolete (enclosed stove version); not imported |

Run inside Blender (MCP add-on "Blender Lab MCP", or `blender -b -P`):
```python
import sys; sys.path.insert(0, ".../workbench/scripts/railcar")
for m in ["build","ph","mats","geo","shell","clock","desk","lights","trinkets","furnish","cases","library","fireplace","bar","decor","export"]: sys.modules.pop(m, None)
import build; build.main()            # ~30 s, writes output/railcar/railcar.blend
import export; export.run()           # bakes + writes workbench/assets/railcar/export/*
```
Long operations must be run from `bpy.app.timers` when driven through MCP (calls time out at 60 s).
Progress log: `output/railcar/export-log.txt`. Renders for review: `output/railcar/renders/`.

### Export (`export.py`) — superseded on Oct 17 by manifest v2, see "Full-resolution materials" below
- Classifies objects into **desk / furnishings / architecture** groups; glassware (transmissive materials)
  → `railcar-glass.glb`; painting canvases → `railcar-paintings.glb` (full-res images); flames, window panes
  and the case stand-ins are skipped.
- Freezes per-object texture coordinates (Generated/Object/ObjectInfo.Random) into mesh attributes, then
  **merges each group into one object before baking** (baking ~1,800 separate objects took 14 min per pass;
  merged it takes seconds).
- Per group: smart-UV atlas → bakes albedo (EMIT of base colour, 4096), diffuse irradiance
  (DIRECT+INDIRECT on a white-diffuse override, 1024–2048, denoised with OIDN from
  `output/oidn-2.3.3.arm64.macos/bin/oidnDenoise`), emission (1024).
- Export materials are quantised to a few roughness/metal buckets → few draw calls. Colour atlas as JPEG in the GLB;
  lightmap/emission as `.hdr` next to it; `railcar-manifest.json` has groups, fire position, room bounds.

## Browser changes (workbench/src)

- `workshop.js` — rewritten: loads the three baked groups + HDR lightmaps (`lightMapIntensity = π`, tune
  if it is too bright/dark vs. Cycles renders), cheap transparent glass (no transmission pass), paintings as
  basic textured quads, velvet pad, dim cool sun for live shadows, hearth at `manifest.fire`.
- `forest.js` — new: procedural dusk forest on two planes outside both window walls, 4 parallax layers.
- `hearth.js` — `createHearth(scene, {position, rotationY, scale, props})`; logs/embers are baked now.
- `scene.js` — AgX tone mapping (matches Cycles), exposure 1.35 (tune), hemisphere fill reduced, side fill
  removed, brighter neutral `collectionFill` (9) over the cases, fog/camera far planes for the bigger room,
  ambient animation at **30 fps** (was 24), `?fps` overlay + `data-fps` on the host.
- `orbit.js` — current camera limits are recorded in “Camera decision and workflow” at the end of this handoff.
- `scripts/build.mjs` — dist excludes authoring caches (`assets/railcar/{polyhaven,paintings,textures}`,
  `assets/atelier`, `assets/study-props`).
- `tests/orbit.test.mjs` — updated for new bounds (passes).

## Status at handoff (updated 22:45, Oct 16 2026)

- Room authored and reviewed in Blender (renders `output/railcar/renders/`, latest `r13-*`).
- Export finished (521 s): `workbench/assets/railcar/export/` (3 group GLBs 48k/238k/129k faces, light+emit
  HDRs, glass, paintings, manifest; ~57 MB). `manifest.fire` is null → workshop.js fallback (-25,-7,8.5) is right.
- **Verified in a browser** (headless Chromium + SwiftShader, so visuals only — no meaningful fps): the car
  loads with no errors; orbiting shows desk, whisky corner, bookcases, armchairs, fireplace end, globe;
  forest wall visible and moving in the windows. Screenshots: `output/railcar/browser-check.jpg`.
- Lighting calibrated by eye against `r12-hero.png`: baked materials ignore live diffuse + env diffuse
  (onBeforeCompile in workshop.js), `LIGHTMAP_INTENSITY` 1.2, `toneMappingExposure` 0.95. Both tunable via
  URL: `?lm=…&exp=…`. Browser still reads a little flatter than Cycles (no AgX "Medium High Contrast" look).
- `npm test` (node --test tests/*.test.mjs): **37/37 pass**.
- Committed locally as 788114a ("Replace the atelier with an 1890 private railcar room") and `dist/` rebuilt.
  **Not pushed**: the agent VM's network proxy blocks github.com — run `git push` from the Mac.
  Poly Haven source files are git-ignored (re-downloaded by `ph.py`); only `polyhaven/credits.json` is tracked.
- **FPS not measured on real hardware yet.** Open `http://127.0.0.1:4173/?fps` on the Mac.

Next steps, in order:
1. `git push` (commit 788114a is local only).
2. `npm run dev --prefix workbench`, open http://127.0.0.1:4173/?fps. Fix load errors. Compare the seated view
   with `output/railcar/renders/r12-hero.png`; tune `LIGHTMAP_INTENSITY` and `toneMappingExposure`.
3. Verify the hearth sits in the firebox (manifest.fire) and the forest shows through every window.
4. Measure fps (idle ambient, orbiting, case inspection, loupe). Target ≥30 at native pixel ratio.
   If short: profile first; candidates are lightmap/atlas resolution, the fire's 56-step raymarch, shadow
   map sizes — propose any visible tradeoff to Heather before applying (AGENTS.md).
5. Rebuild the runtime cases in `bench-objects.js` (`makeCase`) as cantilever boxes (rosewood + brass,
   two tiers of trays stepping out on brass arms, mirrored lid) to match `cases.py`.
6. `npm test --prefix workbench`; update `tests/fidelity.test.mjs` (still references the old atelier assets,
   which remain in the repo); `npm run build`; commit + push per AGENTS.md.
7. Provenance: add railcar assets to the manifests (Poly Haven CC0 credits in `polyhaven/credits.json`;
   Met Open Access/NASA sources in `paintings/SOURCES.json`; carpet, dial, globe tint, ledger, labels and
   damask are original generated textures).

## Gotchas

- Blender was being launched from Downloads (macOS App Translocation); preferences and the MCP add-on can
  vanish after a force-quit — reinstall from https://www.blender.org/lab/mcp-server/ if needed.
- Poly Haven assets load through Blender's own Python (the agent VM's proxy blocks polyhaven.com / the Met API;
  Wikimedia Commons works from Blender).
- After the glTF import, Poly Haven chairs share one material for frame + upholstery; `furnish.recolor_fabric`
  recolours by luminance.
- One device commit once wrote stale files; grep the device copy after committing.

## Session progress (Claude Code, Oct 16–17 2026)

**Done**
- Dev server runs clean (`npm run dev --prefix workbench`); 788114a was already on origin, so no push was needed.
- **Brightness / grade (committed + pushed as f1c0d0c).** Calibrated against `r12-hero.png` using pixel
  measurements, not by eye. Viewing the PNGs makes them look brighter than their pixel values; the earlier
  by-eye calibration was off because of this.
  - New `/?hero` view uses the exact Blender camera (r12 hero framing at 1280×720) for side-by-side checks.
  - Post pass now applies Blender 5.2's exact AgX "Medium High Contrast" view at +1.1 EV from a baked 64³ LUT
    (`workbench/scripts/railcar/lut.py` → `workbench/assets/railcar/agx-mhc-lut.bin`), replacing three's older AgX.
  - Fixed a grey wash: three ignores `envMapIntensity` when a material relies on `scene.environment`, so
    the studio probe lit the whole car at 0.55. The probe is now bound per material (dielectrics 0.08, metals 0.55).
  - Live-light specular on the room scaled to 0.3 away from the desk (desk keeps 1.0); `LIGHTMAP_INTENSITY` 0.7.
    The pure bake matches the render's walls at 0.7 (textbook π is ~3 stops too bright; cause not investigated).
  - New URL knobs: `?lm= ?env= ?spec= ?exp=`. Caustic receivers now chain their program cache key.
  - Measured (sRGB mean, r12 → browser): walls 73,19,0 → 83,23,2; curtains 65,23,15 → 68,29,25;
    leather 82,88,82 → 86,92,91. Before: walls 97,40,26, with a grey veil everywhere.
- **FPS** (M1 Max, Chrome headless on Metal, 3456×2234 native canvas, DPR 2; vsync 60 Hz):
  idle 30 (was 20, a timer + vsync bug, now fixed and gated to 30), orbit 37–40, case open 30,
  loupe idle 30, loupe drag 60. Rechecked after the case rebuild: unchanged.
- **Cantilever cases (reviewed by Heather Oct 17, committed).** `bench-objects.js` `makeCase` rebuilt to match
  `cases.py`: rosewood + brass body and corners, velvet well, two tiers of half-trays per side on brass
  parallel-arm linkages (top tier swings out/down, lower tier rises to the inner step), lid with an aged
  mirror (live room capture, direct specular suppressed so the jewellery lights don't flash in it).
  12 gems = 2 per tray + 4 in the well; 18 rings = one metal × 3 finishes per tray + 2 metals in the well.
  `caseInspectionView` drops its `sign` argument and frames the box centre. Picking verified in the browser
  (amethyst and a rose-gold ring selected from opened trays). `npm test` 37/37.
  - Behaviour change: a closed case shows only its top tier (4 gems / 6 rings); the rest appear on opening.

- **Glass and wall highlight (Oct 17, committed).** Clear glass and loose stones in `workshop.js` no
  longer have a diffuse body: the surface adds only its reflections, and the scene behind is multiplied by a
  per-surface transmittance (`CustomBlending`, `blendDst = ConstantColorFactor`, `material.blendColor`).
  Inkwells now show their black ink like r13, the student-lamp chimney is clear, and the papered diamonds read
  as glints instead of white chips. Spirits keep the old tinted-opacity path. The soft white blob on the
  panel between the windows was the key light's specular on the varnish (`?spec=0` removed it). The
  architecture group now takes no live specular (`?wallspec=`, default 0); furnishings stay at 0.3, desk 1.0.
- `tests/fidelity.test.mjs` now checks the railcar export (groups, atlases, HDR lightmaps, glass/paintings
  GLBs) and the Poly Haven / paintings credits instead of the retired atelier assets. `npm test` 37/37.
- `.claude/launch.json` starts the dev server for the desktop app's preview pane. **The dev server serves
  `dist/`, which it builds only at startup: run `npm run build --prefix workbench` after editing `src/`.**
- FPS not re-measured after the glass change (same draw calls).

- **Full-resolution materials + baked light only (Oct 17, manifest v2).** Heather found the browser car
  blurry and glitchy next to the Cycles renders. Measured causes: the old export's 4096 colour atlases used
  only 4% (furnishings) / 10% (architecture) of their area — ~14 mm per texel, 2 px per book spine — and
  ~2.3 m² of visible same-plane, same-facing faces z-fought (window casings vs pier stiles, bookcase backs vs
  sides, desk plinth vs gilt band...).
  - `export.py` rewrite: `resolve_coplanar()` deletes a face wholly covered by a coplanar same-facing face of
    another object and pushes partial overlaps back 1 mm (1,560 deleted, 1,074 pushed). Groups are split into
    one mesh per Blender material (`<group>|<material>` node names). Lighting is baked to a separately packed
    "LightUV" (coverage desk 0.71, furnishings 0.33, architecture 0.35; 4096 maps for the room, 2048 desk),
    stored RGBM in lossless WebP. Surfaces are not baked: materials tagged with a recipe in `mats.runtime()`
    (box-projected Poly Haven textures, gilt, metals, damask, art glass, book bindings) ship their recipe and
    source textures; UV-mapped materials (Poly Haven furniture, carpet, desk leather, dial, globe, labels) are
    baked onto their own UVs at up to 2 px/mm (colour, ORM, tangent normal); leftovers go to a small atlas.
    Full export ~31 min (run from a `bpy.app.timers` job). Window panes now export as `railcar-windows.glb`.
  - `src/railcar-materials.js` rebuilds each recipe in the shader (Cycles BOX projection, noise, damask mask,
    leaded glass, bindings palette/bands) with RGBM light/emission. Bug found + fixed: the shared lightmap
    texture's UV `channel` was being overwritten per material — clones per channel now.
  - Room reflections: one 512 cube capture of the car at load (PMREM) replaces the studio probe on car
    materials and glass, box-projected against the car's walls (parallax-corrected). Mirrors, brass and the new
    window glazing now reflect the room; the panes show the sconce pairs and frieze like r13. Varnish/cloth get
    0.35 of the probe (`?varnish=`), metals 1.0 (`?probe=`). Clearcoat and sheen live glints are scaled with the
    rest (that clearcoat lobe was the returning pier "blob").
  - Forest: the Cycles world HDRI (Poly Haven `sunset_forest`, rotation 200°, strength 0.55) as the backdrop
    by view direction (`railcar-sky.webp`), sun clamped, plus two rows of out-of-focus trunks/boughs streaming
    past for motion.
  - Ambience: dual-filter bloom on lamps/bulbs/fire (`src/bloom.js`, `?bloom=`, default 0.05), fine film grain
    in the post pass, optional synthesized soundscape (`src/ambience.js`: rumble, rail-joint clicks, fire
    crackle; header "Sound off/on", off by default).
  - Website: loading screen shows the blurred Cycles still (`assets/railcar/poster.jpg`) with a % from the
    loaders, then fades to the live car; phones / no-WebGL2 get the still with "Open the interactive car anyway"
    (`?static`, `?interactive`). Copy updated to the 1890 railcar with correct credits; the Lawrence portrait's
    provenance added to `paintings/SOURCES.json` (Met 55.89; exact download URL was not logged).
  - Tools: `workbench/scripts/measure-fps.mjs` (Chrome on Metal, 3456×2060 canvas; idle/orbit/case/loupe),
    `workbench/scripts/capture.mjs` (full-res screenshots; `WHEEL`, `DRAG`, `EVAL` env). `?debug` exposes
    `globalThis.__railcar`. Close the desktop preview pane while measuring — it competes for the GPU.
  - FPS (same script, pane closed): previous commit idle 30 / orbit 33.7 / case 30 / loupe 30 / loupe drag ~18;
    now idle 30 / orbit 32.5 (min 30.5) / case 30 (27.5 during the opening animation) / loupe 30 / loupe drag
    ~20. With the car hidden entirely orbit is ~34, so the room is no longer the bottleneck. The earlier
    "orbit 37–40, loupe drag 60" figures came from a different drag method and are not comparable.
  - Shipped size: `dist/` ~183 MB, of which the car export is ~138 MB (textures 57 MB, GLBs 33 MB, lightmaps
    31 MB). Loads in ~4.5 s locally.

**Next**
1. Download size for the public site: GLBs could use meshopt/Draco (needs a decoder in `vendor/`), and
   textures KTX2/Basis; ask Heather before lowering any texture or lightmap resolution.
2. Loupe drag runs ~20 fps in the headless measurement (same as before this work) — profile the loupe path.
3. Real-display check on the 120 Hz panel; a pass in Safari.
4. Cases polish (optional, Heather approved them as is): lid mirror reads flat; light haze at the bottom of the
   inspection view; outer tray clips at narrow aspects.
5. Verify hearth position; provenance manifest for the generated textures (carpet, dial, globe tint, ledger,
   labels, damask). Hosting (GitHub Pages or other) is Heather's call — nothing is published yet.

## Camera decision and workflow (Oct 17, 2026)

- **Camera limits implemented:** desk-facing yaw ±45°; elevation from level with the desk (0°) to 75° down;
  zoom from 75% to 125% of the normal seated framing. Orbit tests cover both angular extremes and zoom
  bounds. Browser screenshots of the four yaw/elevation corners are in ignored `output/railcar/camera-check/`;
  Chrome reported no console errors. These are headless visual checks, not an fps measurement.
- **Agreed next workflow:** use the full allowed camera range and zoom to define the visible set. Build a
  clipping/overlap checker for authored set geometry, inspect its reports, then simplify or remove only
  elements that are outside every allowed view. Next, Heather reviews visible light sources and the Cycles
  hero render; use that approved render as the target. Then keep static room surfaces in the bake and moving,
  sparkling or interactive objects live, compare browser captures from the same camera after each change,
  and finish with native-resolution fps and download-size checks. Preserve full material and lightmap quality.
- Current camera changes are **uncommitted** in `workbench/src/orbit.js` and `workbench/tests/orbit.test.mjs`.
  `npm test --prefix workbench`: 39/39 pass; `cargo fmt --check`, `cargo test --locked`, and
  `cargo clippy --all-targets -- -D warnings` also pass.

## Session progress (Codex, Oct 17 2026)

- Applied the agreed camera framing: desk-facing yaw ±45°, elevation 0° (desk level) through 75° down, and
  short zoom range 0.75–1.25×. The normal orbit target is now the ring; the calibrated `?hero` camera remains
  unchanged. Rebuilt `dist/`, and the browser capture shows the ring centered with the desk and both cases
  visible. `npm test --prefix workbench`: 39/39 pass. No new fps or brightness measurements were made this
  session; retain the previous real-Mac fps figures and r12 brightness measurements above as the latest data.
- Added `workbench/scripts/railcar/audit_set.py`, a read-only Blender audit sampling the full allowed camera
  envelope (126 yaw/elevation/zoom combinations), then checking conservative camera-envelope AABBs,
  triangle surface crossings, and thin-contact candidates. It wrote ignored `output/railcar/set-audit.json`;
  audit runtime 1.54 s. Of 2,081 mesh objects, 1,104 may enter at least one sampled camera envelope. The
  1,307 triangle hits and 1,492 thin-contact candidates include many intended joins; the camera AABB test
  indicates potential visibility only and does not account for occlusion. No geometry was changed or pruned.
- Desk-prop examples show why classification is needed before acting: the student lamp’s connected parts and
  balance wires/pans are expected intersections; the open paper’s stones and tweezers need a visual check at
  the intended hero framing. Next, improve the audit to distinguish designed contacts from unintended
  crossings, inspect flagged desk-prop and room-shell candidates in Blender, and fix only confirmed defects.
  Then continue with the approved Cycles hero comparison, live/baked split review, and native-display fps and
  download-size checks. Keep all work uncommitted until asked.

### Audit reliability follow-up (Codex, Oct 17 2026)

- Replaced the initial coarse overlap report with an evaluated-triangle audit. It distinguishes proper
  crossings, opposing face contacts, same-facing near-coplanar patches and sampled closed-mesh containment.
  A separate parallel-face search catches flat coincident faces missed by Blender's BVH overlap query.
  Corrected physical units: **1 authoring unit = 100 mm**; audit-v1 `overlap_m` fields were mislabeled raw units.
- The report now ranks sampled exposed witnesses first, groups repeated source patterns, and supplies exact
  object names, stable IDs, physical patch areas, candidate generator modules and reproducible witness views.
  JSON tracks new/resolved/changed geometry between runs and fingerprints source/evaluated geometry. Exact
  intended-contact rules have source reasons and physical limits; they cannot suppress same-facing patches.
- Optional evidence uses temporary scenes: blue/orange isolated pair views, plus real-material Cycles context
  at the original resolution/sampling. Source objects and the saved blend are not modified. Read
  `workbench/scripts/railcar/AUDIT.md` for commands and the repair workflow; AGENTS.md now points there.
  Start with ignored `output/railcar/set-audit.md`, then inspect images/JSON. This is an authoring-scene check;
  export repairs, runtime objects, animation, other aspect ratios, self-intersections and shading still need
  their own visual checks. Unresolved or occluded samples never imply visual approval.
- Verification: 18 Blender regression checks pass (including actual-mesh fixtures for zero-thickness
  duplicate surfaces, proper crossings and containment); Rust format, locked tests and strict Clippy pass.
  No new fps or brightness measurements. Next: use the ranked evidence to repair confirmed generator defects,
  rebuild and compare the same view; do not ask Heather to classify routine assembly joins. Work is uncommitted.
- Latest full run: 69.67 s for geometry; 89.51 s including four isolated pair images and one 64-sample,
  original-resolution Cycles context view. It reports 1,401 unresolved pairs (405 with a sampled exposed
  witness), including 586 same-facing-patch pairs and 79 sampled-containment pairs. These are risks, not
  1,401 confirmed visual defects. The repeat run found zero new/resolved/geometry-changed IDs; source hash
  matches the current files. Inspected the pair diagnostic and actual Cycles context for the top window
  reveal/backing finding. A single still does not establish flicker; inspect the browser export in motion
  before calling that a confirmed website defect. Original scene remains 2,148 objects, original camera,
  Cycles/64 samples; temporary diagnostic scenes were removed. Nothing committed.

### Source geometry repairs and repeatable builds (Codex, Oct 17 2026)

- Continued autonomously after Heather's instruction to proceed whenever her input is unnecessary. Shared
  repo files and this handoff are the coordination mechanism with Claude; no message or delegated task was
  sent to a separate Claude session. AGENTS.md now records this preference and the current no-commit constraint.
- `shell.py`: side window reveals now begin beyond the 0.6-unit solid wall backing, instead of duplicating
  its exposed jamb face. This repairs all sixteen generated jamb extensions (eight affected pairs were in
  the sampled envelope). Before/after Cycles at the same camera: mean absolute sRGB difference 0.0314/255,
  99th-percentile difference 1/255; no new audit pairs after this repair. Evidence: ignored
  `output/railcar/reveal-repair/` (before blend/audit, matching renders and comparison.json).
- `trinkets.py`: corrected open-ledger body placement. Its page blocks previously overwrote box()'s centre
  offset: bodies shifted 72.5 mm sideways, printed pages hovered 8.1 mm above them, and bodies sank through
  the cover/desk. Body bounds now align with the unchanged printed page footprints. The printed surfaces
  replace the bodies' top caps, eliminating the two near-coplanar duplicates created by merely closing the
  gap. Before/after isolated and full Cycles images are in `output/railcar/ledger-repair/`; the final render
  has been inspected. The final pages were lowered only 0.1 mm to meet the body boundary exactly.
- `build.py`: reloads generator modules inside every main() call. Previously, only importing build.py
  reloaded them; a repeated MCP build silently reused old trinkets.py. The first ledger rebuild exposed this
  cache bug; its actual geometry was checked, then the fresh-source build and all evidence were redone.
- Extended the audit with explicit source-reviewed planar support contracts (`audit_supports.json`,
  `audit_support.py`). They detect floating gaps, penetration and sideways misalignment; all four ledger
  contracts fail against the saved broken geometry and pass against the corrected scene (gap 0 mm). These
  bounded-rectangle tests apply only to declared flat assemblies, not arbitrary curved supports.
- Latest complete source audit: **1,387 unresolved risk pairs**, 398 sampled exposed witnesses, 578
  same-facing pairs, 79 containment candidates, 0 failed support contracts. Relative to the start of these
  repairs: **14 resolved pairs and 0 new pairs**. This is not an all-clear; many remaining entries are joins
  or source surfaces already repaired by export, and must still be classified from evidence. Source hash
  matches current files; source remains 2,148 objects with the original camera and 64-sample Cycles settings.
- `capture.mjs`: explicitly sets the content viewport and verifies PNG dimensions, then writes a JSON
  sidecar with viewport/DPR/canvas/readiness/console evidence. A requested 1280×720 had silently produced
  1280×633 through Chrome's window frame. New capture verified 1280×720 CSS/canvas/PNG, DPR 1, ready=true,
  no console warnings/errors. This is a comparison capture, not a native-resolution fps benchmark. Built-in
  browser pane timed out; the repository's isolated Chrome capture script succeeded.
- Checks: 18 Blender geometry fixtures + 6 standalone planar-support tests pass; 39 web tests, Cargo format,
  locked Rust tests and strict Clippy pass. No new fps measurements or exposure calibration; no commits.
- New room-only Cycles preview from the regular ring-centred home camera (52° FOV, 1280×720, 64 samples):
  `output/railcar/renders/r14-ring-home-context.png`. The central ring/pad and final case materials are live
  browser content; the Cycles cases are look-dev stand-ins. The actual browser export has **not** been rebaked
  for these source repairs. Keep full source textures and existing lightmap/sample quality when rebaking.
- **Next:** Heather's reserved visual review of the new camera composition and room lighting; use that input
  to settle the reference look. Technical work continues with remaining desk-prop contacts (loose brilliants
  versus paper/tweezers; inspect the box-centre placement convention before changing them), then remaining
  exposed shell/furniture patches. Do not claim all 1,387 candidates are defects or mark the set clean.
  Once the reference and source repairs are ready, bake/export and compare the matching browser camera.

### Case preview update and lighting approval (Codex, Oct 17 2026)

- **Heather approved the room lighting in r14.** Preserve it: Cycles remains 64 samples, exposure +1.1 EV,
  with the existing fixtures/HDRI. She requested that the Blender stand-in cases be updated.
- Replaced the separate Blender case modeller with `case_preview.py` + `case-snapshot.mjs`. Node evaluates
  the actual `makeBenchObjects()` factory at the fully-open pose; Blender imports its exact mesh buffers,
  UVs, custom normals and world transforms. It now uses the real velvet recess/roll geometry, brass parallel
  arms, hollow rosewood bodies, mirrored lids, 12 stones and all 18 collection rings. Canvas labels become
  Blender text; Cycles uses physical material analogues for gem optics/reflections. Geometry/pose are shared;
  the browser's custom gem shaders and probe lighting are not a claim of pixel-identical Cycles shading.
- `surface-materials.js` shares the existing material construction between the browser and snapshot tool.
  Cycles loads the same full-resolution wood/velvet source images; the new 4.9 MB snapshot is ignored under
  output/, rebuilt on source-hash changes. No new downloaded assets or dependencies. Set `LJ_NODE` if Blender
  cannot find Node. Cases remain runtime-owned and excluded from the static room export.
- Corrected two real runtime construction issues while sharing the model: the bases floated ~5.5 mm above
  the leather once the bevel was counted; they now sit on it. Wood substrates also intruded into the deepest
  velvet depressions; their height now follows the actual lining minimum with bevel clearance. Pocket grid
  resolution, contents geometry and native rendering quality are preserved.
- The larger, accurate opened cases clipped at the old home framing. `benchFraming()` now reserves half-span
  5.15 instead of 4.15. At 16:9 the default is app (0,2.947605,7.339474), looking at (0,-1.08,0.15), FOV 52°.
  ±45° yaw, 0–75° elevation and .75–1.25 short zoom remain. The Cycles preview/audit take the current runtime
  camera from `case_preview.camera_frame()`; the original saved r12 calibration camera is preserved.
- `?debug` exposes the case controller/camera/orbit for repeatable comparison captures. Final Cycles image:
  `output/railcar/renders/r16-cases-fit-context.png`; matching both-open browser capture:
  `output/railcar/case-update/browser-open-final.png`. Both were inspected. The browser capture is exactly
  1280×720 at DPR 1 with ready=true and no console warnings/errors; this is visual evidence, not a new fps run.
  Browser cases still read brighter than Cycles because of live examination/probe lighting; keep the approved
  Cycles room lighting as the reference for the later matching pass.
- Checks: **40/40 web tests** pass, including a new actual-factory snapshot regression for finite/valid buffers,
  12/18 contents, desk contact, exposed velvet, two mirrors, substrate clearance and every open-case vertex
  inside the default 16:9 frame. The static build, Rust format/locked tests/strict Clippy, 18 Blender audit
  fixture checks and 6 planar-support tests pass. The runtime case source hash matches the imported objects.
- The source audit now labels different camera/sampling envelopes as non-comparable; raw new/resolved IDs
  across an expanded view are not evidence of newly broken geometry. A whole-scene all-clear is not claimed.
  No room rebake, new fps/brightness calibration, commit, push or publication in this pass.
- **Next:** continue remaining desk-prop contact review (papered stones/tweezers and ledger pen), finish the
  static/live ownership split, then rebake/export the repaired static set once ready and compare matching
  cameras. Lighting approval is recorded; do not ask Heather to approve it again merely to proceed.
- Final whole-scene audit after the case changes: 1,736 unresolved pairs, 516 sampled exposed witnesses,
  749 same-facing pairs, 73 containment candidates and 0 failed support contracts; 112.84 s. This includes
  the more detailed runtime-derived cases and the wider camera envelope, so it is not comparable to the old
  1,387-pair stand-in report. Do not declare all those pairs glitches or suppress them in bulk. The targeted
  case regressions and inspected images are the completed evidence for this change.

### Claude visual pass (Oct 17 afternoon, uncommitted)

Worked through `RAILCAR_REVIEW.md` items 1–5 and Heather's forest request; details, measurements and URL
knobs are in its "Status after Claude's pass" section. Files touched: `src/bench-objects.js` (velvet lid
linings, case light scale, contact shadows), `src/scene.js` (lens shift, dove mat), `src/workshop.js` (lightmap
2.4, varnish 0.12, desk/leather glints, glazing off, clock door glass hidden), `src/railcar-materials.js`
(per-material glints), `src/forest.js` (single scrolling, motion-blurred panorama), `src/main.js`,
`index.html`, `src/style.css` (dove swatch), `scripts/railcar/case-snapshot.mjs` (skips `noPreview`), and
`tests/case-preview.test.mjs`. `npm test`: 40/40. For Codex at the rebake: verify the longcase clock's
brightness against Cycles (review item "Clock"), darken or remove the bench pin, and keep `LIGHTMAP_INTENSITY`
re-measured with reflections off (`?probe=0&deskspec=0`) against a fresh Cycles render from the same camera.

### Session progress (Codex rebake, Oct 17 — installed locally, uncommitted)

- Removed the bench pin and clamp; inspected both ±45° turns at0° elevation. Restored four panels that
  the export's `" pane"` substring filter had accidentally skipped. Approved Cycles lighting remains64
  samples at+1.1 EV; full surface textures and2048/4096/4096 lightmaps at384/256/256 samples retained.
- Rebuilt the room, then rebaked the clock against the intact authored scene with secondary-invisible
  receivers (`rebake_subset.py`). The merged-only result still fails this clock check: **the authored-scene
  clock override is required after a full export**. Non-clock occupied texels remain byte-identical.
- Clean clock patch (x1140–1170,y85–145; home,1280×720, reflections off): **128/46/0 before →29/5/0 now**,
  versus Cycles34/6/0. Lightmap intensity isπ. Door glass now applies source tint/Fresnel transmission
  without probe streaks; it is an explicit flat-pane approximation. Earlier UI-overlapped samples are superseded.
- Installed on the local4173 site and rebuilt `dist/`. Matching home/left/right comparisons are
  `output/railcar/renders/r17-*-comparison.png`; settings, camera/pose sidecars and measurements are in
  `r17-verification.json` and `RAILCAR_REVIEW.md`.40 web tests and required Rust checks pass. No new FPS run.
- Source audit:1,733 unresolved risks,512 sampled exposed witnesses,0 support failures; not an all-clear.
  Car export133.6MB / total dist174.3MB; the~30MB download target remains unmet. No quality reduction or commit.
- **Next: Claude reviews the r17 comparisons**, especially low-view case bodies, book spines and the remaining
  review items. Papered-stone/tweezer support, broader geometry classification and final FPS/size work remain
  open. The r14 lighting approval stands; do not ask Heather to approve that same lighting again.

### Claude: 3D forest and window glazing bars (Oct 17 evening, uncommitted)

- **Forest is now on a surface, not at infinity** (`src/forest.js`). Heather said the outside felt flat and
  gave her vertigo: looked up by view direction, it swung with every camera turn. The panorama's horizon band
  is now printed on a backdrop plane 3 m beyond each window wall (`?forestdist=`, default 30 units), scaled to
  the same angular size as the Cycles world from the seat, so it parallaxes behind the window frames. Default
  speed is 0.12 panorama/s (~8 s per pass; Heather: the slow drift looked unnatural) with a one-frame shutter
  smear (`?forestspeed= ?forestblur= ?forestfocus=`). Browser-only; Cycles still uses the world HDRI.
- **Two-over-two glazing bars** in `shell.py` `window()`: a vertical and a horizontal mahogany muntin with gilt
  beads across each lower sash (each crossing piece at its own depth, so no coplanar faces). Preview:
  `output/railcar/renders/r18-windows-home.png` (rebuilt source, live home camera with the browser's 0.15 lens
  shift as `shift_y`, 64 samples, 36 s). `railcar.blend` was rebuilt and saved by `build.main()`.
- **For Codex:** the browser does not show the bars until the room is rebaked and exported. Reapply the
  authored-scene clock override after the export, rerun the source audit on the new window pieces, and capture
  r19 comparisons at shipped settings as well as reflections-off.

### Claude: Swiss Alps outside the windows (Oct 17 night, uncommitted)

Heather asked for the Swiss Alps at sunset, slower, sharper and truly 3D. `src/forest.js` is replaced by
`src/landscape.js`: real terrain on both sides of the track (the line on a ledge ~140 m above a valley,
forested slopes across it, snow peaks compressed to the right angular size), Poly Haven aerial photos on the
ground (aerial_grass_rock recoloured as pasture, rocky_terrain_02, snow_field_aerial), conifer impostors
rendered in Cycles from Poly Haven fir_tree_01 / pine_tree_01 (`scripts/railcar/impostors.py`, 6 variants ×
8 views, `export/railcar-trees.webp` + `.json`, lit by the same sun), and the Qwantani Sunset (Pure Sky) HDRI
(`export/railcar-sky-alps.webp`, 4k RGBM). Sliding-lattice terrain, far rows slower (distant mountains). URL
knobs: `?alpsspeed= ?haze= ?sunstrength= ?skystrength=`. Camera far plane 3200. FPS: idle 30, orbit 31.5
(min 29.5), case 30, loupe idle 30. Cycles still uses the old forest world HDRI; the window light in the bake
is unchanged. Model sources (~1.4 GB) are git-ignored; credits are in `polyhaven/credits.json`.

### Session progress — rug shadow (Codex, Oct 17 night; uncommitted)

- Heather noticed the carpet under the desk looked as bright as the exposed carpet. Verified the original
  architecture lightmap had identical SHA-256 in source assets, dist and the HTTP response on4173: this
  was not merely a stale dist build. Claude's r17 review already flagged bright carpet; no completed rug
  correction was recorded. The matching fresh Cycles view clearly has the missing desk shadow.
- Rebaked only `persian carpet` against the intact authored scene:4096²,256 samples, existing exported
  LightUVs and full-resolution surface textures. Generalized `rebake_subset.run()` to accept exact object
  names and separate evidence directories; installation preserves other required overrides. All12 carpet
  triangles matched;0 occupied non-carpet pixels changed. Installed only the architecture lightmap and
  its manifest record, rebuilt dist, and verified the served candidate hash. No geometry/lighting changes.
- Same under-desk patch [450,585,560,625],1280×720, shifted floor focus at yaw45°/elevation0°, reflections
  off: mean sRGB **86.36/7.02/2.60 before →11.17/1.07/0.20**, versus Cycles **5.57/1.14/0.31**.
  Images, exact camera sidecars, map backups and measurements: `output/railcar/rug-review/`. Inspected both
  reflections-off and shipped-reflection candidate captures. Exposed carpet still differs from Cycles;
  do not claim whole-room shading matches. No new FPS measurement. Rust fmt/locked tests/strict Clippy,
  Python compile and site build pass. Nothing committed.
- **Next:** continue comparing remaining shading discrepancies (exposed rug colour/brightness, side
  furniture and paintings) against matching source views. Future full/architecture exports must apply
  the authored-scene rug override as well as the clock override; commands are in AUDIT.md. Claude's newer
  source window bars still await a full export; this targeted lightmap patch does not export them.

### In progress — baked appearance / Alps work split (Codex)

Heather authorized Codex to implement the static Cycles appearance + selective live materials while
Claude handles the Alps. Codex owns new `baked_appearance.py` / browser material routing; Claude owns
`landscape.js`, `window-view.js`, exterior assets and photo/depth preparation. Avoid editing each other's
files. The first stage is an ignored candidate under `output/railcar/appearance/`; no full export or
replacement of the shared source blend. Live brass/glass/gems remain separate. Do not install an
unreviewed candidate or describe the whole room as converted while only proof targets are baked.

### Claude: photographic window prototype (Oct 17 night, uncommitted, behind `?view=photo`)

Reversible: the 3D landscape (`landscape.js`) is still the default; `?view=photo` loads `src/window-view.js`.
- Source: "Landscape of Bernese Oberland from Männlichen, 2012 August", Ximonic (Simo Räsänen), Wikimedia
  Commons, **CC BY-SA 3.0** (attribution + share-alike apply to the derived images; credit must appear on the
  site before shipping). Original + metadata in ignored `output/railcar/alps-photo/`.
- `scripts/railcar/window_photo.py` (run with `output/depth-venv/bin/python`): `depth` = Depth Anything V2 Base
  on overlapping tiles (MPS); `build` = golden-hour grade, seamless 8192 px panorama, 16-bit depth packed in a
  PNG, two seamless foreground strips cut from the photo's own pasture and ridge grass, soft rolling tops.
- Runtime: Felix-style depth parallax (fixed-point ray/depth intersection, depth floored at 120 m so turning to
  ±45° does not streak), slow panorama drift, foreground strips on real planes 60 m and 6 m out moving at train
  speed (4 m/s) with shutter blur. Knobs: `?photospeed= ?photohorizon= ?photou= ?photomidtop= ?photoneartop=`.
- Evidence: `output/railcar/window-proto/window-{home,left,right}.mp4` (60 s each, frames + page fps in
  `*/frames.json`). First full recording run (before the edge softening): 30/30 fps at all three views.
  Later runs were contaminated by a stuck VS Code `chrome_crashpad_handler` at ~230% CPU; back-to-back under the
  same load the photo view beat the 3D landscape (idle 26 vs 17, orbit 19 vs 12). Re-measure on a quiet machine.
- Size: 3.9 MB (panorama 2.9, depth 0.64, strips 0.5) vs 18 MB for the 3D landscape assets.
- Known limits: the panorama is one photo (~207° wide) that loops every ~80 min of drift, so repetition is
  not visible in 60 s; the strips repeat every 30 m / 240 m of travel (7.5 s / 60 s at 4 m/s) — the near strip's
  repeat is the most likely to be noticed; adjacent windows show one continuous scene (same planes).

### Session progress — Heather's editable copy grouped (Codex)

- Edited only `output/railcar/railcar-heather-edits.blend`, the file Heather had open; no source rebuild,
  website export or bake. Created recovery copy `output/railcar/heather-grouping/railcar-heather-before-grouping.blend`.
- Added named `MOVE — …` Empty controls for physical assemblies, with nested desk drawers, clock door/
  pendulum and case trays. Furniture, framed paintings, picture lamps, vessels, tools and fixtures remain
  independent of walls, tables and other supports. Detached loose books from bookcase layout parents,
  the ledger pen from the book, and tweezers from the diamond paper. Nine loose diamonds stay parented
  to the paper as Heather explicitly requested. Loose case stones/rings stay independent of the cases.
- Preserved existing mesh/material datablocks and all original world transforms (maximum initial matrix
  difference1.91e-6 authoring units). Final134 assembly controls; lamp control selected for an example.
  Grouping plan, inventory and verification record are under ignored `output/railcar/heather-grouping/`.
- Next: Heather can move/rotate the named controls in her copy to repair clipping. Her manual changes
  must be reconciled into generators before any future rebuild; saving this copy does not update the site.
  The earlier full-appearance proof bake was interrupted by the Blender force-quit and is not complete.
  Do not claim the room conversion is installed, restart heavy bakes in her active editing session, or
  overwrite her copy while resuming the separate rendering task. No commit or new FPS measurement.

### Session progress — existing tool-library search (Codex)

- Searched existing libraries for Heather's lapidary/jeweler tool list. Added one obtained match to her
  live editable copy: Innerscene's CC0 wooden bench pin, extracted from its jeweler-workbench GLB.
  Generic tool geometry, not a documented 1850s artifact. Source/license/hash and placement evidence:
  `output/railcar/heather-tools/SOURCES.json`. Physical size 86 × 213.53 × 19 mm.
- Saved `output/railcar/railcar-heather-edits.blend`, preserving all 2,449 existing object transforms
  exactly, including Heather's unsaved edits. Recovery copy made before import:
  `output/railcar/heather-tools/railcar-heather-before-tools.blend`. New control:
  `MOVE — Library wooden bench pin`; staged on a clear desk patch using bounds clearance.
- Other requested tools remain unadded: no suitable free downloadable period matches obtained.
  Found a paid vintage watchmaker's gear-cutting lathe and modern printable ball vises; no purchases.
  Next: Heather can position the selected bench pin. Remaining tools require supplied licensed assets,
  a purchase choice, or a separate request to model them. Website/source generators unchanged.
  No FPS/brightness measurement, bake, commit or push in this pass.

### Session progress — Heather's desk-prop wood finishes (Codex)

- Saved only Heather's live `output/railcar/railcar-heather-edits.blend`: balance base/drawer warm
  rosewood, weight box honey maple, inkstand ebonized rosewood, blotter golden maple, and 62 wooden
  jewelry-case components dark rosewood. Independent material copies reuse existing photographed
  rosewood/maple color, roughness and normal maps. Desk retains original mahogany.
- Preserved all object transforms exactly, including Heather's latest clock/pen edits. Pre-change
  recovery copy and 67 material-slot changes recorded in `output/railcar/heather-wood/`.
- No new Cycles render, FPS/brightness measurements, website export, generator edits or commit.
  Next: review finishes in Material Preview; source reconciliation/export remains separate work.

### Session progress — Heather's Victorian safe (Codex)

- Added an authored vintage-style safe to Heather's editable blend, 64 cm wide, 48 cm cabinet depth,
  95 cm cabinet height (projecting handle and small crest extend those bounds). Dark green enamel,
  brass combination dial, three-spoke handle, hinges and gold lining. Staged by the left wall between
  fireplace and instrument stand. Root control: `MOVE — Vintage safe`.
- At Heather's request embellished it with raised gilt corner scrolls/leaves, a lower floral rosette,
  decorative hinge straps, dial numerals and cornice crest. All parts parented to the safe control.
  Original objects retain exact transforms. Recovery copies, creation scripts and change records under
  `output/railcar/heather-safe/` and `output/railcar/heather-safe*.py`.
- Saved Heather's live file, preserving manual edits. Decorative closed prop, not an opening/locking
  simulation. No website/generator changes, new bake, FPS/brightness measurements or commit.
  Next: Heather can position it with the named MOVE control; reconcile her final layout before export.

### Claude: night forest outside the windows (Oct 17 night, uncommitted — now the default)

Heather rejected both the procedural Alps and the photo+depth prototype; she asked for no distant scenery,
four layers of the same trees at different depths, night, and no visible repetition.
- `src/night-forest.js` replaces the exterior (`landscape.js`, `window-view.js` and their assets moved to
  ignored `output/railcar/retired-exteriors/`; unused Poly Haven credits removed). Standard layered train-window
  parallax with real trees: Poly Haven fir_tree_01 / pine_tree_01 (CC0), rendered in a **background** Blender
  process (`LJ_NIGHT=1 blender -b --factory-startup`, `impostors.py` night mode: moon rim light, 6 variants × 4
  views, 640×1280 cells → `export/railcar-trees-night.webp` 3.9 MB + `.json`). Heather's open Blender session
  (`railcar-heather-edits.blend`) was not touched.
- Four layers 6/14/30/60 m from the wall on both sides, forest on a slope falling away from an embankment
  (drops 8–20 m) so windows look into canopies; per-layer fog toward a night horizon; faint stars; ground fades
  to the horizon (a hard ground edge showed through gaps at −45° before). Train 10 m/s (`?nightspeed=`), shutter
  blur a third of a frame (`?nightshutter=`). Each tree slot rehashes variant/view/size/gap/height every lap, so
  the stream never repeats.
- Evidence: `output/railcar/night-forest/night-{home,left,right}.mp4`, 60 s each, **30/30 fps** (median/min) at
  home, −45° and +45° on a quiet machine. Window-region frame comparison found no repeated view (closest pairs
  are near-black canopy frames). 40/40 web tests. Interior lighting untouched (only exterior code/assets changed).
- The Cycles bake still sees the old forest world HDRI through the windows; a night rebake (Codex's area) would
  make the window light match.

### Session progress — Oct 17–18, final edited room integration (Codex + Claude, uncommitted)

- Preserved Heather's edited room; integrated it with Claude's night forest, wider pan/closer zoom and
  larger loupe with fixed blurred surround. Rebaked lighting headlessly, corrected book colours,
  retained HDR lighting range, and baked cloth response while keeping full surface photographs.
- Focused the latest lighting pass on darker weakly lit corners/recesses while preserving bright pools.
  Added nearby physical crystal and calibrated case reflections/cloth plus soft tray contact shadows.
- 49 web tests pass; Rust fmt/tests/clippy passed earlier in this integration. Inspected actual browser
  and Cycles images. No accepted 95% match, no claimed 30 fps interaction. Native Retina first-candidate
  medians: idle 30, orbit 23.6, case 20.7, loupe 22.6, loupe drag 10.2 fps; installed medians: idle 30, orbit 28.1, case 24.6, loupe 28.5, loupe drag 11.1 fps.
  Initial brightness diagnostic: curtain 50/9/6 versus Cycles 72/24/18 sRGB before the cloth response fix;
  velvet lid 169/114/118 before calibration versus Cycles 118/52/55. Keep these labelled historical.
- Current candidate built and served on port 4173; prior installed assets backed up under final-room/.
  Next: review the lighting contrast against current Cycles captures, address remaining differences,
  optimize interaction performance without reducing quality, then repeat visual/FPS evidence. No commit.

Latest contrast measurement (installed browser, matched left view, sRGB luma 0–255): bookcase recess
17.53 → 13.02 (Cycles 14.17); lower wall 14.07 → 9.66 (Cycles 11.85); desk lamp shade
117.27 → 116.97 (Cycles 115.61). Region boxes/raw RGB are in `contrast-regions.json`.
These are local diagnostics, not a whole-image fidelity percentage. A final contact-shadow plane
was raised 1.75 mm to clear leather relief, but a faint polygonal edge is still visible in the
left-view leather region. Treat this as unresolved; determine whether it is the shadow overlay or
the baked receiver before claiming it fixed.

### Session progress — Oct 18, fireplace-side picture light alignment

- Heather identified two emitters left behind after moving the brass picture lamps on the fireplace
  wall. In her live `railcar-heather-edits.blend`, aligned Lawrence/Lady Maria's area light by Blender
  Y −5.332989 units (53.33 cm), and Sargent/Mrs Hammersley's by +5.357014 units (53.57 cm).
  Preserved emitter X/Z offsets, rotations, size and power (64.5307 W / 57.6552 W).
- Parented each light to its physical brass hood so future individual fixture moves carry the emitter.
  Verified only those two world transforms changed; both alignment errors are zero. Saved Heather's
  file; pre-change backup, exact change JSON and aligned frozen source are under
  `output/railcar/fireplace-light-alignment/`. No code changes, FPS/brightness measurement or commit.
- Installed website lighting and `final-room/heather-final-source.blend` still predate this alignment.
  Next rebake must use `fireplace-light-alignment/heather-light-aligned-source.blend` (or newer saved
  Heather file), retain final-room geometry/material corrections, reapply the per-group HDR encoding
  and cloth response, compare Cycles/browser and rebuild. Do not call the website light locations fixed yet.
- Mirror question inspected, not implemented: current wall mirrors use one room cube probe with box
  projection. The gem tracer traces the optical stone boundary, not the room. Dedicated reflected
  cameras for the two flat mirrors are the smaller faithful solution; full room ray tracing is a larger extension.

### Session progress — Oct 18, physical loupe enlargement

- Heather requested a larger physical loupe again. Increased the resting browser model from .51 to
  .765 scale: 50% larger in every dimension. Resting height derives from its rim size, so it continues
  to rest on the desk. Updated the existing size assertion and rebuilt `dist` for port 4173.
- Magnification, near-eye aperture framing and fixed blurred surround are unchanged. This is the
  browser-owned loupe, not an added object in Heather's Blender room. No new bake, FPS/brightness
  measurements or commit. Capture: `final-room/loupe-larger-rest.png`.
- Next remains the website lighting rebake using the aligned fireplace light source snapshot and
  the pending Cycles fidelity/performance work; mirror implementation has not been authorized.

### Session progress — Oct 18, mood/contrast and book fixes (ongoing)

- Saved source geometry/lighting fixes and started a separate headless full Cycles appearance bake.
- Identified and fixed static hemisphere fill leakage; black-bake GPU check passes. AgX LUT samples
  agree with Blender within .407/255; not a whole-image fidelity score. No new FPS claim while baking.
- New source book/ledger fixes and mood changes are not yet installed on the website. Next: finish
  painting + room bake, compare actual views, fix remaining differences, install/rebuild and measure.

Additional Oct 18 evidence: the static black-bake GPU test passed with [0,0,0,255] while a live control
under the same 10-intensity ambient + hemisphere gave [255,255,255,255]. The view-transform sample
check's actual maximum was .40685/255. Separate floating-point texture save probe preserved raw data.
The old case contact planes were confirmed as the triangular leather artifact: hiding them removed
it. Replaced them with a smooth receiver-space contact shadow in `contact-shadows.js`; the actual
native-browser side capture `moody-room/shadow-receiver-projection.png` has no console errors and
was visually inspected. This remains a contact approximation, not physical area-light integration.
Removed the unused overlay plane geometry. Dynamic caustics remain additive over saved static appearance.

## Session progress — Oct 18, box shadow diagnosis and correction

- Explained that the latest image was a partial pilot, not an accepted final room bake. Moving boxes
  were omitted from static transport and the baked desk ignored live shadows; the faint contact patch
  did not solve this. Replaced that patch in source with cached geometric visibility from the desk lights.
- Corrected false coplanar detection and retained original bake positions; restarted the failed bake.
  Completed desk pilot shows both ledger pages again. Full room export remains in progress.
- Measured display luma beneath left/right trays: 51.43/50.63 without geometric shadows, 5.30/7.43 with;
  uncovered desk remains 53.60/53.53. No new FPS measurement while GPU baking is active.
- Next: finish full export, inspect matching Cycles/browser home and side views plus books/clock/rug,
  check shadow batching A/B and native FPS on a quiet Mac, then install only the reviewed candidate.
  Fixed indirect shadow remainder and finite area samples remain approximations. No commits.

## Session progress — Oct 18, corrected bake installed for review

- Completed full room bake (1623 s), then rejected its missing printed labels. Changed authored exports
  to retain exact source geometry and rebaked the desk (358 s, 27 materials / 48230 faces). Installed the
  merged local candidate and rebuilt the website; retained the prior install and Claude's forest.
- Desk receives sampled geometry shadows from the examination panel and case spots. Shadow batching
  is pixel-identical in the controlled desk comparison; atlas does not refresh on camera pan. Fixed
  stale ambient fill, original receiver positions, source book geometry, native ledger resolution,
  painting illumination and the source mood changes described above. Physical loupe remains enlarged.
- Native Retina FPS: idle 30, orbit 28.0, case view 20.3, loupe idle 20.7, loupe drag 10.6 median. Last
  drag window includes a .2 FPS minimum / 5 counter readings; no steady 30 FPS interaction claim.
  Earlier controlled shadow patch numbers remain in `case-shadow-patch-check.json`, not a 95% score.
- All 53 web tests, Rust fmt, 98 locked Rust tests and strict Clippy pass. Geometry audit reports 2821
  unresolved pairs; four ledger support contracts pass, no findings name the repaired small books.
- Next: review the installed candidate against Cycles, especially side-view varnish, nearby reflection
  differences and leather microdetail; inspect low rug/clock/panels, then profile stalls at full quality.
  This remains workflow step 6 review, not final acceptance. No commits or deployment.

## Session progress — Oct 18, reflection separation still under test

The installed candidate fixes the case-shadow connection and source/export errors, but is not a 95%
match. Low-angle comparison exposed frozen glossy highlights, unoccluded probe/light paths through the
desk, and the mixed-metalness-map intensity mistake. Added source-supported structural visibility and
per-pixel probe strength. Valid native low-rug capture now suppresses the bright plinth leak. A full-quality
second architecture pilot is baking diffuse substrates plus static far-metal response; 59 tests pass.
Next is its native side/home/rug comparison, then matching desk/furniture bakes if the pilot improves.
No new FPS claim beyond the earlier installed candidate, no commit or deployment.

## Session progress — Oct 18, true lighting bake correction

Rejected the green-velvet diffuse pilots after ray-picking confirmed a layered-material response error.
Added true white-receiver irradiance mode, keeping source textures/BSDF separate. Its architecture
pilot is finishing at full resolution/samples; not installed or accepted. Structural probe/direct-light
visibility and mixed-metalness fixes remain in source. Capture readiness guard rejects fallback posters.
Next: native home/side/rug comparison of the irradiance pilot, then desk/furniture if it improves.
No newer FPS or fidelity score is claimed. No commits.


## Session progress — October 18, 03:46

- Completed true irradiance bakes for architecture, exact-geometry desk and furnishings; installed
  a backed-up local review candidate and rebuilt the site. Preserved Heather's layout and Claude's
  forest hashes. Corrected static sheen/probe capture to remove studio feedback and work-light
  over-reflection. Case geometry shadows now reach the baked desk; no 95% match is claimed.
- Current 1280×720 display-luma patches: under trays 5.73/7.91 (Cycles 3.56/5.34); uncovered desk
  42.76 (Cycles 55.98). These are selected screenshot patches, not a whole-image fidelity score.
- Native Chrome/Metal on this M1 Max, 3456×2060 DPR2, no concurrent bake/capture jobs:
  local load 7.492s; median idle 30fps, orbit 25.2fps (min23.6), settled case view19fps,
  loupe idle25.6fps, loupe drag10.2fps (min3.5, only5 counter samples, stalls included).
  Evidence `moody-room/fps-irradiance-installed.json`. Thermal state uncontrolled; interaction
  target30fps NOT met. No pixel-density or material-quality reduction was made.
- Loupe 2×/6× blur hash and fixed projection identical; portrait/exit captured, no console errors.
  Main-page ready capture verifies installed manifest hash. 60 web tests pass, build and diff
  whitespace check pass; same-turn Rust format/98 tests/strict Clippy passed, no Rust edits.
- Next: continue step6 comparison on case upholstery/live reflections and desk illumination;
  review side views and correct specific transport/material differences. Then remeasure runtime
  and download budget. No user input is needed for that diagnosis. Exact latest state is at the
  top of this file. No commits or pushes.


## Session progress — October 18, readable lighting and performance diagnosis

Heather clarified that darkness must not hide future click targets: improve local fixture spill and
balance bookcase wood against wall wood. Diagnosed chandelier center emitters inside solid bodies;
replaced them on a separate source copy with six actual bulb emitters each, restored moderate fill,
and added explicit thin-glass shadow transport at sconces/student chimney. Increased safe-side sconce.
Inspected new Cycles home/right/drawer renders; source pilot is brighter with preserved case/contact
shadows. Full-quality export is running under `readable-lighting/` (details and exact next steps at top).
The live website is NOT updated yet. No new FPS/brightness-patch measurements for this lighting revision.

Heather then asked what improves lag beyond simplifying decorative gems. Source inspection suggests
repeated scene/depth/blur passes, nearly-million-triangle main setting, and native-resolution loupe
surround rendering deserve profiling before assuming tiny gem fragments dominate. Already have some
jewelry and shadow caching; do not describe these as absent or blindly replace them. Existing earlier
quiet measurement25.2fps orbit/10.2fps loupe-drag is not a new benchmark. Active Cycles GPU baking makes
concurrent FPS evidence invalid for normal use. Only diagnostic A/Bs are authorized by this inquiry;
no permanent pixel-density, material or geometry-quality cut has been authorized. Preserve full quality
for selected gem/loupe. Finish lighting first, then measure separate pass costs on the quiet Mac.
60 web tests, Rust fmt/98 tests and strict Clippy pass in this turn; Python fixture helper compiles.
No commits/pushes; editing Blender layout remains untouched.


Performance follow-up (source inspection, NOT benchmarked): `jewelry-cache.js` draws precious objects
in a separate target, then the final composite compares that depth against room depth. Hidden gem
fragments can therefore execute full optical shading before composition removes them. Some loupe
baffle depth culling already exists, so do not claim all occlusion is absent. Investigate early room-depth
rejection before ray tracing as a quality-preserving candidate. Native GPU timer diagnostic prepared at
`readable-lighting/profile-passes.js` with runner `profile-native.mjs`; run only after Cycles is idle.
It temporarily compares baseline, simple decor, hidden setting, disabled caustics, and skipped blurred
surround render; restores originals and does not alter production. Verify timing extension/disjoint flag
and report per-pass GPU times honestly, not as whole-frame FPS. No quality tradeoff is approved.
Drawer-only browser pilot is ready with no errors. Selected top/side wood display luma improved
3.08→6.76 and2.32→5.79; corresponding revised Cycles9.74/7.83. Mixed lighting elsewhere still old,
so do not install that partial manifest or claim overall matching. `drawer-brightness.json` records ROIs.


TEMPORARY profiling pause: owned headless bake PID36854 received SIGSTOP to release GPU for isolated
native profiling. Interactive Blender was not touched. Resume with `kill -CONT 36854` after profiling;
verify command matches `readable-lighting/export-readable.py` first. Profile session22875 writes
`profile-results.txt`/`profile-errors.txt`; five temporary diagnostics, no production changes.


Profiling completed and owned bake36854 RESUMED with SIGCONT. No production visual changes.
`profile-raw.json` is exploratory only: Metal/ANGLE gave many tiny blur passes nearly whole-frame
GPU intervals, so reject per-pass interpretation/sums despite disjoint=false. Single-run draws in
sample windows were55 baseline,55 simplified11 decor gems,68 skipped blurred-surround render;
not a repeated matched-pose benchmark or guaranteed gain. `profile-caution.json` documents limits.
A credible next profile should time whole frames or isolated passes across flushed frames, repeat
matched inputs and report real frame intervals. Do not publish the raw per-pass numbers as costs.


## Session progress — October 18, readable lighting installed

- Finished all three room groups and all four painting light maps; installed the backed-up local
  review candidate and rebuilt dist. Verified installed manifest/source hashes and no render errors.
  Main page4173 now uses `readable-source.blend` hash404f997a…; editing Blender file untouched.
- Fixed ceiling emitters hidden inside chandelier bodies, gave actual fixture bulbs light/emission,
  adjusted thin-glass light transmission, strengthened safe-side sconce and restored moderate fill.
  Inspected native home/right/drawer views and matching final-source Cycles safe reference. Geometry
  POSITION/NORMAL/indices identical for all86 exported material meshes; forest hashes unchanged.
- Drawer selected-patch display luma changed from3.08/2.32 to7.02/5.79 (top/side wood); revised Cycles
 9.74/7.83. Safe hardware/outline is readable but black enamel and browser reflections still differ.
  No95% match is claimed. Rejected global varnish1/.35 tuning; .12 remains to avoid hard probe artifacts.
- New quiet Chrome/Metal M1 Max test, explicit selected DIAMOND, native3456×2060 DPR2, no bake/capture
  jobs running: local load7.945s; median idle27.5fps, orbit19fps, settled case13.8fps, loupe idle19fps,
  loupe drag7.6fps (min5.6, only6 sampled counters over10s). Extra warmup8s used. Thermal state
  uncontrolled. This is not directly comparable to earlier unspecified-default-stone tests. Target30
  interaction fps is unmet. Evidence `readable-lighting/fps-installed-diamond.json`. No quality cuts.
- Performance inquiry beyond decorative gems: early hidden-pixel rejection and avoiding repeated room
  rendering are quality-preserving candidates; main setting near1M triangles and optional native-pixel
  tradeoff also matter. Exploratory loupe simplification of11 decorative gems showed no clear gain;
  skipped-surround run was more promising, but per-pass GPU timing was rejected as unreliable.
  No validated performance speed-up or production optimization is claimed.
- 60 web tests, Rust fmt/98 tests/strict Clippy, Python compilation, build and scoped whitespace checks
  pass. No commits/pushes. Next: Heather reviews revised readability at step6; separately profile
  matched inputs and whole-frame costs before implementing caching/culling. Geometry/resolution/material
  quality reductions still require explicit authorization. Source and matched Cycles references are
  preserved for the next comparison; do not start another full rebake without a measured need.

## Session progress — Oct 18, continuous curtains and public update

- Kept Heather’s approved readable lighting; rebuilt each curtain top as one continuous
  velvet valance and rebaked just its irradiance at4096²/256 samples. Checked close-up and
  panned browser views. No new whole-room brightness calibration; all other lighting kept.
- Tested exact point-shadow caching at native3456×2060 on this Mac: turning21.3→21.6fps,
  loupe10.3→10.6fps, idle30. Gain too small for its memory cost; default remains unchanged.
- 62 web tests, Rust fmt/98 tests/strict Clippy, Python compile and build pass. Main repo
  uncommitted. Publishing uses only the isolated Sites source checkout.
- Enabled conservative per-case shadow culling, with full geometry and resolution retained.
  A single matched run measured22fps turning /10.6 loupe; large speed gain remains unproven.
- Published version16 successfully to the existing public URL. Fresh anonymous Chrome/Metal
  loaded the real WebGL room and inspected continuous valances; no console errors. Public
  manifest ef18d015… matches the prepared lossless package. Cold capture completed in70.5s
  (includes download, readiness and settling; not a controlled download benchmark).
- Next: pursue static-room/loupe caching with
  depth, transmission and bloom checks. No input from Heather required to investigate.

## Session progress — Oct 18, FPS options workshop

- Heather asked for larger FPS ideas and the effect of reducing resolution25%. Ran temporary
  isolated Chrome/Metal comparisons on the same Mac; production source/assets/site unchanged.
  CSS1728×1030, open cases, selected diamond, scripted rotation and loupe, stage warmups and8s
  samples. Desktop GPU activity/thermals uncontrolled; these values differ from earlier runs.
- Native3456×2060: median idle26.1, turning17.4, loupe7.9fps. Render width/height75%
  (2592×1545, DPR1.5): idle30, turning22, loupe11.6. This is43.75% fewer screen pixels,
  not25% fewer. Texture sizes, triangle counts, shadow sizes and optics unchanged.
- Native main canvas/jewellery with only already-blurred surround target at half width/height:
  idle25.6, turning17.4, loupe11.1fps. This changes75% of that one target’s pixel workload,
  preserving native jewellery resolution; its quality remains a candidate requiring matched
  visual checks before deployment. One sequential comparison per configuration, no guaranteed
  performance gain claimed. Evidence: output/railcar/fps-options/comparison.json and captures.
- Recommended larger work: cache static room colour/depth separately from animated fire/forest
  and live/transmissive objects; retain correct occlusion/refraction/bloom. Then investigate the
  ~988k-triangle setting and gemstone shader costs. Quality cuts to sharp imagery/geometry remain
  proposals; Heather’s hypothetical resolution question did not authorize a production downgrade.
- No commits or publication. Next: quality-preserving static-room/loupe caching investigation;
  targeted lower-resolution blurred surroundings are a measured fallback for visual review.

## Session progress — Oct18, FPS implementation

- Accepted Heather’s tradeoff authorization. Added black loupe surround,75%-dimension rendering,
  room-frame reuse during jewellery interaction, and paused hidden ambient redraws while inspecting.
  Moving jewellery/support, gem optics, textures, geometry, light maps and4x offscreen AA remain.
- Matched local medians: turning18.4→46fps; loupe8.9→20.7fps. Desktop load/thermals uncontrolled.
  No new brightness calibration; approved room lighting unchanged.64 web and98 Rust tests plus
  fmt/strict Clippy/build pass. Inspected black loupe; zoom invalidation and room reuse verified.
- Public version17 successfully deployed to the same address; anonymous WebGL/source-hash QA passed.
- Main repo uncommitted. Next: tackle the ~988k-triangle setting / live jewellery passes if more loupe speed is needed.

## Session progress — Oct18, buried support depth bleed

- Reproduced Heather’s orange disk at raised/far views: the wooden support sits just below the
  white pad. The compositor’s fixed normalized-depth tolerance0.000003 admitted hidden surfaces
  increasingly far behind the pad as camera distance grew.
- Removed that tolerance in shared layer-depth.js, used by final compositing and bloom. Also
  removed live-object depth proxies from EVERY room pass (formerly only omitted in cached mode).
  Otherwise a strict comparison self-clipped jewellery against its duplicate depth. Live depth
  now comes only from the jewellery target; shadow passes retain both caster layers.
- Diamond high/far and closer high-angle captures show the orange disk gone and full ring/loupe
  silhouettes retained. Tiger/loupe captures and an isolated-support angle matrix supplement QA.
  No lighting maps/geometry/quality settings changed, no new FPS/brightness benchmark.
- 66 web tests, Rust fmt/98 locked tests/strict Clippy and build pass. Main repo uncommitted.
  Isolated public source5a26316580550ad36d970691bcd80c1b9de7420d. Blob upload again timed out
  at300s; source-build fallback saved version18 appgver_66812e68afdc81919958bd987599eb4f,
  deployment appgdep_6ad56ec08dc48191b90eddeae4098de7 SUCCEEDED at01:16:22UTC (Oct18 local).
  Same public URL; fresh anonymous high-angle browser check passed: complete ring, no visible
  orange disk, WebGL ready and no browser rendering errors. Evidence: depth-bleed/public-fixed.png.
- Explained future Blender edits: static edits/new permanent lights need export/rebake; toggleable
  lights can use separate linear-light contribution maps; safe doors/drawers need separate live
  geometry/interiors/shadows and cache invalidation. See clarification below for switch handling.
- Next: Heather can plan room edits from the approved curtain-repair/source.blend copy and identify
  movable parts/toggle lamps before the next bake. No new room features implemented; main repo
  remains uncommitted. No new FPS or brightness measurements in this fix.

### Depth-fix QA / future room features clarification

- Isolated support test: radii5/14/26 × elevations35/75°, five poses0 visible support pixels;
  radius26/elevation75 had1 differing pixel with an artificial magenta support. Raised-support
  foreground control produced1,405 pixels, confirming the test actually detects visible geometry.
  This eliminates the visible disk; it is not a universal subpixel precision guarantee.
- Future toggle lamps can often use separately baked linear-light contributions, combined BEFORE
  AgX/tone mapping, with bulb glow/reflection probes updated when toggled. This avoids requiring
  every combination of independent switches to have a full-room bake. It assumes fixed geometry
  and materials; moving safe doors/drawers alter occlusion/transport and need separate treatment.
  Added light data also costs download/GPU memory; current hosting payload has little headroom.
- Future moving props must be excluded from static merges/baked moving shadows, have appropriate
  interiors/pivots, and register cache invalidation (or join a live layer). Ordinary static edits
  remain supported by re-export/rebake using the same calibrated lighting/color pipeline.

## Session progress — October 18, room interactions and Pie Jesu

- Added authored gramophone on the safe and a smoldering cigar/silver ashtray beside the balance.
  Current staged authoring COPY: `output/railcar/interactions/source.blend`; Heather's editing file
  was not opened or overwritten. Gramophone cabinetry reuses the approved rosewood maps.
- Separated exact existing delivery triangles for the safe door/handle/dial, globe, beam/pans/wires
  and five desk weights. Batched glued parts by material/transform. Physical clicks and keyboard
  alternatives are connected: safe opens/closes with turning hardware; globe eases to a random
  spin angle; weights teleport to distinct pan slots and drive a damped tilt; cigar glows/draws;
  poker raises fire glow/crackle for seven seconds. The later continuous-animation update below removes
  the jewellery room hold entirely.
- Student lamp defaults ON. Isolated its source-light contribution at original atlas settings:
  desk2048²/384 samples, architecture/furnishings4096²/256 samples; RGBM8 lossless-WebP transport
  retains atlas resolution (new contribution maps only; approved base maps remain RGBA16F).
  Shade dimming approximates missing glass transmission when off. Fixed-fixture analytic diffuse
  and room probes light moving surfaces; reflections remain probes, not live Cycles tracing.
- Repaired only balance/weight-tray support irradiance:45,322 texels, zero protected/outside-mask
  changes. Moving geometry now casts into the existing sampled desk-shadow path. Fire boost is a
  local warm spill/emission approximation, not a new fire transport bake. Base mood is unchanged
  when controls are in their default state. Full-scene evaluated audit remains REVIEW_REQUIRED:
  2,806 unresolved pairs /898 exposed risks /zero existing support-contract failures;275.76s.
  It is not whole-room geometry clearance. New ashtray was moved fully onto the desktop.
- Heather selected **Fauré, Pie Jesu from Requiem**, replacing the provisional waltz. Recording:
  Vadim Ghin arrangement /Nikia Players(2026), IMSLP#1036995, CC BY-SA4.0. Full attribution and
  recording download are in the journal and audio/CREDITS.md. AAC64kbps; modern performance with
  added horn filter/hiss, not an antique recording. Foley is original Web Audio synthesis.
  Native pointer playback advanced3.144s in a214.912s recording with AudioContext running.
- Native Chrome/Metal captures verified physical activation of all five weights, safe, gramophone,
  globe, lamp, cigar and poker, with no rendering errors in those captures. Pilot paired lamp
  display luma near desk43.42 on /38.09 off; shade91.54/90.35 before final shade-dimming addition.
  These selected patches are not physical illuminance or a whole-room fidelity score. Fire
  internal boost returned to0 after seven seconds. No new FPS benchmark or95% Cycles claim.
- Rust fmt,98 locked Rust tests and strict Clippy pass; JS syntax/build pass. No new web tests
  were added or run. Main repository remains uncommitted. Publication is being prepared for the
  SAME public Site; final deployment/anonymous QA and exact source/version IDs follow below.
- Next: complete packaging/publication, inspect the public interaction build, then Heather can
  try the controls. No additional instruction from Heather is needed to finish publication.

Publication/QA follow-up:

- Published interaction source: `8f1fb6c6783049393f0fc91022377f3545eea9bc` (forward push;
  earlier0abcfbc8/898da292 candidates are superseded). Archive `output/site-publication/interactions-packed.tar.gz`.
  Main HEAD remains6f9ca8d427edb2bf78e6e5d4bea5ba13799e33fa; no main-repository commits.
- Lossless desk-GLB and metadata gzip bring required source to268,217kB, just below256MiB.
  Source helper checks interactive mappings against exact original GLB hashes. Full-resolution
  wood images are reused from the room rather than embedded a second time in the new prop GLB.
- Exact packaged-build native WebGL check passed (manifestcd194056…): physical lamp/cigar clicks,
  empty error logs. Reversible safe/music physical clicks and rapid music toggles also passed.
  Black loupe remained intact; room reuses14→28 during the checked stone rotation, not an FPS test.
- Final fire spill is3× the first pilot; selected display-luma patches stoked/normal:
  left stone29.17/23.64, right stone44.12/38.14, side wall6.57/5.30. Internal boost returned to0
  after the seven-second envelope. Source lighting outside the temporary effect is unchanged.
- Version19 deployment SUCCEEDED (`appgdep_6ad593c737948191b47db16d3a02bb4f`). Archive upload
  timed out; supported matching-source remote build succeeded. Anonymous native public safe open
  and gramophone playback verified: mediaTime2.228s/214.912s, AudioContext running, empty errors.
  Evidence: `interactions/public-safe-gramophone.*`. Final packed raw tar268,286,464 bytes.


## Session progress — October 18, continuous shadows and scenery

Removed interaction room-frame reuse: the ring's current shadow and animated scenery now appear
in each room render. Removed settled-black-loupe scheduling suppression and the window-frustum
scheduling gate, so loupe/hover/turn states do not freeze the environment. No Blender/bake changes.
Native local WebGL check: room renders138→183 during hover, then283 during20 ring turns;
room reuses0 throughout; forest offsets advanced at each stage;20 shadow-refresh frames were
observed while turning, before any release. Evidence: `interactions/continuous-qa.json` and
before/after PNGs. This is functional evidence, not a new FPS benchmark. Expected cost: more room
renders during interaction than the older freezing optimization. Current resolution/optics retained.
Settled-loupe check:45 further room renders in1.5s, forest offset advanced150 units, zero room
reuses; native pointer drag:16 shadow refreshes BEFORE mouse release, room renders169→242.
Evidence: `interactions/continuous-loupe-final.*` and `interactions/native-live.*`. These counts
are functional observations, not quiet FPS measurements. Final publication succeeded as recorded below. Earlier `0abcfbc8` publication candidate and
its oversized archive were superseded by published8f1fb6c/version19. Main repo not committed.
Next: Heather can refresh and try the published room; anonymous version20 QA is recorded below.

Publication preparation for continuous animation:
- Exact final isolated source: `79270dd9df30f4ab36e04cc14cf3eea830557fb9`.
- Archive `output/site-publication/continuous-room-final.tar.gz`: raw tar267,639,296 bytes;
  796,160 bytes below256MiB. Earlier1e84f586 archive was rejected: raw tar268,631,552 bytes.
  Corrected with lossless gzip transport for cabochon and sample-setting OBJ text. Packaging
  asserts the decompressed bytes equal the originals; loader still uses the same OBJ parser.
- Native exact-packed-build mouse drag passed:16 shadow refreshes while held,73 room renders,
  zero room reuse and empty console errors. Evidence `interactions/packed-native-live.*`.
- Final archive-backed version20 saved successfully:
  `appgprj_6ad1d1ee181c819186c337d3573bdaea~appgver_2a81badd775c81918c1dae65c0d3ef3a`.
  Deployment `appgdep_6ad597e195f8819192d83003d0141592` SUCCEEDED at04:09:17UTC.
  The connector accepted267,171,840 bytes /210 files; the tar container adds its own overhead.
  Public URL unchanged. Main repository remains uncommitted. Anonymous version20 QA PASSED: native drag produced16 shadow refreshes while the
  mouse remained held,92 room renders and0 room reuses. Settled loupe produced45 further room
  renders over1.5s, forest offset advanced149.99 units, surround1.000 (black outside lens).
  Render logs empty; actual public image inspected. Public scene/workshop/packed OBJ hashes
  match the final packaged source exactly. Evidence: `interactions/public-continuous.*`,
  `public-native-held.png`, `public-continuous-source.json`. No new FPS or brightness measurement.
  Next: Heather refreshes the SAME public URL and tries controls; no additional instruction is
  needed to finish this implementation. Future performance work must preserve live shadows/scenery.

### Gramophone: shipped track (Claude, Oct 18)

Heather confirmed she owns or is licensed to publish `mix.mp3`, so it now ships as
`workbench/assets/railcar/audio/gramophone.mp3` (446 s, 68 kbps MP3) on the public site; credits in
`audio/CREDITS.md` and the About panel. The local-override lookup was removed from `room-audio.js`. The retired
Fauré m4a moved to `output/railcar/audio-retired/` (its CC BY-SA credit would be needed again if it returns).
