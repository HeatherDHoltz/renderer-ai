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
