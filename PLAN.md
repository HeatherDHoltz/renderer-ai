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
| M7 HDR/physical materials | active | HDR IO/environment importance sampling, GGX/Smith/Schlick, dielectric transport, color/BRDF tests and studio images |
| M8 Hierarchy/animation | pending | Cycle-checked graph, TRS/quaternion tracks, fresh acceleration at each frame; first/middle/last inspection |
| M9 Procedural/AI authoring | pending | Seeded generator, bounded branching L-system, validated scene-authoring workflow |
| M10 Portfolio/release | pending | Clean checkout verification, CI, measured benchmarks, real gallery, current docs and claims audit |

Proceed in order. Scene IO may be introduced early if it makes diagnostics reproducible; record any dependency change here. Keep milestone commits small enough to review. No reduced scope has been agreed.
