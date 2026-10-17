# Implementation plan

Acceptance criteria and full scope: [implementation handoff](IMPLEMENTATION_HANDOFF.md).

| Milestone | State | Acceptance evidence |
| --- | --- | --- |
| M0 Foundation | verified | Preserve baseline, library/binary split, configurable smoke render, clean checks, class files unchanged |
| M1 Geometry/math | verified | Validated cameras/transforms, oriented hit records, all canonical shapes, linear film; analytic tests and inspected shape scene |
| M2 Whitted/glass | verified | Reflection/refraction/Fresnel/TIR, centralized offsets, recursion limits; transport tests and inspected images |
| M3 Scenes/meshes/textures | verified | Validated scene files and CLI, indexed OBJ, normals/UVs/textures, relative assets and useful errors |
| M4 Acceleration | verified | AABB, binned-SAH BVH, reference octree, differential tests and real benchmark evidence |
| M5 Sampling/area lights | verified | Deterministic sampling and correct area-light estimator; AA/penumbra comparisons |
| M6 Parallel/progressive | verified | Tiled workers, configurable threads, preview batches; thread/tile/batch equivalence |
| M7 HDR/physical materials | verified | HDR IO/environment importance sampling, GGX/Smith/Schlick, dielectric transport, color/BRDF tests and studio images |
| M8 Hierarchy/animation | verified | Cycle-checked graph, TRS/quaternion tracks, fresh acceleration at each frame; first/middle/last inspection |
| M9 Procedural/AI authoring | verified | Seeded generator, bounded branching L-system, validated scene-authoring workflow |
| M10 Portfolio/release | verified | Clean checkout at 83bd4ce; 91 tests, format/Clippy/build/offline examples; Linux/macOS CI green; inspected hero/gallery, measured reports, asset/claim audit |

Proceed in order. Scene IO may be introduced early if it makes diagnostics reproducible; record any dependency change here. Keep milestone commits small enough to review. No reduced scope has been agreed.

## Requested extension after M10

| Feature | State | Evidence |
| --- | --- | --- |
| Gem meshes and material gallery | verified | Four online Zsky meshes imported with CC BY 3.0 credits; supplemental step cut/cabochon, homogeneous absorption, anisotropic sheen, 98 tests, 22 offline scenes; inspected six-gem panel, three stone variants, twelve-state moving-light GIF. See docs/GEMS.md. |
| Independent Mitsuba tiger's-eye study | verified | Isolated Mitsuba 3.9.1 environment; scalar/vector CPU runs; inspected 900×900/3072-spp layered still and all eight 384×384/512-spp lighting states; raw EXRs and settings retained. Scripts, gallery and model/noise limits in docs/MITSUBA.md. External reference renderer, not a Rust engine feature. |
| The Little Jeweler browser workshop | verified | Fixed first-person room, rotatable specimen, 3D eyepiece inspection, five CC0 props, GPU materials and credited reference gallery. Eight Node tests; desktop/narrow-screen browser QA, actual PNG export, all 98 Rust tests and strict checks; native Sites deployment succeeded. Hosted owner preview requires ChatGPT sign-in. See workbench/README.md and docs/workbench-verification.json. |


Browser interaction refinement: bounded cursor gaze, physical felt selection boxes, directly draggable lamp, and reversible world-space loupe pickup implemented; verification recorded in STATUS.md.


Contemporary atelier extension (October 16): Blender/Cycles static-lighting bake, 12 researched gemstone presets, finite-girdle cut families, adapted solitaire shank, and two-layer red/green cases with camera inspection are verified and published. See docs/GEM-COLOR.md and the atelier_revision evidence in docs/workbench-verification.json. All 26 web tests and 98 Rust tests pass; remaining optical differences from offline reference renderers are documented limitations, not completed spectral/volume features.


After-hours study revision (October 16): dark period-inspired Blender room/fireplace, credited Met landscape, fixture-free movable light and directly intersected finite gem-light apertures are locally verified with 29 web tests, 98 Rust tests, actual desktop/portrait scene inspection and unchanged class hashes. Same owner-private Site publication succeeded; browser handoff requires ChatGPT sign-in. Local scene/interaction evidence, publication IDs and approximation limits are in the study_revision record in docs/workbench-verification.json.


Brighter gemstone viewing / caustic extension (October 16): neutral fill and ivory bench, bounded GPU RGB photon tracing onto the bench, cached refinement and an optional toggle are locally verified. 31 web tests / 98 Rust tests and strict checks pass. Warmed pass costs, actual images and the flat-receiver/occlusion limits are in docs/workbench-verification.json. Same owner-private Site publication succeeded; hosted browser handoff requires ChatGPT sign-in.

Drag exploration / rendering-budget revision (October 16): drag-only orbit with movable focus, pointer/pinch zoom, independent specimen rotation, preserved case/loupe return views and four accessible tools are locally verified. Demand rendering rests fully; adaptive pixel density, exact convex-facet acceleration and a physical eyepiece depth mask improve the live jewelry budget while the room keeps its baked ambiance. 34 web tests / 98 Rust tests and strict checks pass. Actual desktop/portrait images and a repeatable steady-draw comparison are in docs/workbench-verification.json (orbit_revision). Same owner-private Site publication succeeded; source/deployment IDs and the ChatGPT sign-in handoff are recorded in STATUS.md.


## Fidelity-first collector’s study — local implementation verified

Heather made fidelity the standing priority; recorded in AGENTS.md. Removed adaptive motion resolution and depth blur, retained native device pixels with 4× MSAA, full RGB/twelve-bounce optics and 98,304 caustic paths in a 1024² map. A depth-aware foreground cache keeps jewelry detail while visible fire animates. Fixed examination lighting replaces the movable-light tool; white reflection cards lift metal shadows without emissive metal.

Rebuilt the room’s material export with separate source/bake UVs and distinct PBR responses, 96-sample Cycles lighting, 4K color/2K irradiance/1K emission. Added full-2K CC0 photographed clock/shell/vase, authored balance/watch movement/lapidary sheet/wire/findings/minerals, and a 56-step participating flame volume. Source credits and checksums are retained. Fire is art-directed volume rendering, not fluid simulation.

Evaluated downloadable ring candidates and authored a replacement in Blender: one closed smooth comfort-fit cathedral setting (988,288 triangles; collection 34,590). It replaces the old capped low-poly band and separate tubes. Girdle-specific head fitting, seam-safe brushing, a normal-sized main specimen, neutral clear physical loupe and alloy-grouped trays address the requested inspection details. Lossless build packaging preserves all 289 room buffer views and exact ring float32/index values while keeping individual delivery files below 25 MiB.

All 37 web tests, standalone build, Rust format, 98 locked Rust tests and strict Clippy passed; all 12 class baseline hashes are unchanged. Actual local WebGL QA covered room/fire/clock, clear diamond loupe, direct specimen turn, emerald/cabochon fitting, grouped trays and portrait framing without overflow. No new FPS/thermal claim is made; historical adaptive-build timing does not characterize this higher-fidelity scene. No Rust/class changes or repository license assignment. Exact remaining work: retain final screenshots, inspect/stage/commit/push related changes, publish the verified build to the same owner-private Site, and record its returned source/deployment IDs.

Publication repair: GitHub implementation commit 1c7f49d pushed successfully. The private Site source store rejected oversized mesh objects. Replaced source GLBs with aligned glTF buffers below 8 MiB and the main OBJ with gzip-compressed exact float32/index data (9,721,014 bytes); original bulky authoring exports are retained under ignored output/. All 315 room/prop buffer views and 988,288 ring triangles match the originals exactly, and all 37 tests plus actual browser reload/loupe still pass. A fresh helper checkout of the same unchanged remote avoids the unpublished rejected objects without rewriting shared history. Exact remaining work: upload this corrected source, deploy it, record terminal native publication evidence and push the final GitHub notes.

Fidelity pass published successfully to the same owner-private Site: source `90e28535f1540cd386a5cf446fb69c9723408e5d`, deployment `appgdep_6ad2c1c1ffc4819193571f0b4665a2e4`, terminal status `succeeded`. GitHub commits `1c7f49d` and `680330b` are pushed. Canonical hosted tab opened at normal ChatGPT sign-in; no hosted WebGL QA is claimed. The actual local scene and clear loupe screenshots are retained in gallery/workbench/fidelity-*.jpg. All requested implementation for this pass is complete. Next step: Heather can sign in/reload the published workshop and inspect the new surroundings, small ring, clear loupe and grouped metal trays. Native high-detail rendering intentionally remains more costly than the previous adaptive build; no FPS/temperature guarantee or repository license assignment is made.
