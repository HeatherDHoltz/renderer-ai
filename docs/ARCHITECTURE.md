# Architecture

This is the separate AI-assisted portfolio renderer based on Heather's early-semester Rust implementation. The class version is never modified by this project.

The current core is a library used by a CLI and a preserved `legacy` example. Geometry is accessed through the thread-safe `Shape` trait. `Scene` owns shapes/lights and exposes closest-hit and early-exit occlusion queries. `Camera` validates perspective/orthographic frames. `LinearFilm` stores radiance sums and individual pixel counts, rejects nonfinite/negative samples, averages before exposure and Reinhard/linear tone mapping, then uses the piecewise sRGB transfer for PNG. Legacy `Film`/`render` preserve the original 8-bit educational output for baseline comparison.

`Transform` validates finite affine matrices, rejects singular/ill-conditioned frames, and caches inverse and inverse transpose. Matrix fields are private to prevent stale caches. `Instance` transforms rays without normalization, evaluates canonical geometry, and transforms outward normals. Hit records preserve geometric outward normals, oriented shading normals, front-face state, UVs, stable scene object IDs, and slots for mesh barycentrics/primitive IDs. Equal-t scene hits retain the earlier object. `Integrator` dispatches explicitly between educational Whitted and physical direct lighting.

## Canonical geometry

| Primitive | Object-space definition | UV convention |
| --- | --- | --- |
| Sphere | radius 1 at origin | u=0.5+atan2(z,x)/(2π), v=acos(y)/π; seam at -X |
| Plane | y=0, outward +Y, infinite | u=x, v=z |
| Box | [-1,1] on each axis, outward face normals | remaining axes in cyclic order remapped to [0,1] |
| Cylinder | radius 1 around Y, -1≤y≤1, two caps | wall azimuth u, v=(1-y)/2; cap x/z remapped |
| Cone | apex y=1, radius 1 at y=-1, closed bottom | wall azimuth u, v=(1-y)/2; bottom x/z remapped |

Intersections are double-sided and intervals include both endpoints. Box/cap boundaries use a 1e-6 local tolerance. Analytic normals use inverse transpose even with negative scale; outward orientation follows the implicit solid, independent of triangle winding. The cone apex has no unique surface normal and uses +Y. Stable quadratic roots use f64 intermediate arithmetic and explicitly handle linear cone equations. No heap allocation occurs inside primitive queries.

`examples/shapes.rs` demonstrates all five shapes, including a tilted nonuniform ellipsoid, in both camera types. It writes 960×540 renders with one center sample per pixel. These preserved diagnostic examples use center sampling; JSON scene renders can use jittered AA.

Implementation conventions: right-handed +Y-up world, camera local -Z, column-vector multiplication, object-to-world `T * R * S`. Finite bounds and immutable thread-safe scene data are the planned acceleration/parallel boundary.

See [PLAN.md](../PLAN.md) and [STATUS.md](../STATUS.md) for verified capabilities. Design changes belong here when implemented.

## Scene IO, meshes, and textures

Serde/serde_json implement strict versioned JSON loading; clap implements CLI parsing. Original glam/image versions are unchanged. Scene IO validates named references, resource counts, material ranges, cameras, and composed transforms before rendering. An iterative parent walk detects cycles without unbounded recursion. Instances share an Arc of each indexed mesh. Optional keyframe tracks compose static TRS with interpolated TRS before parent composition. Per-time builds validate all tracks, reload assets, and rebuild fresh acceleration; [ANIMATION.md](ANIMATION.md) defines quaternion/time/frame behavior and the explicit caching tradeoff.

The focused OBJ loader retains separate position/normal/UV corner indices and resolves negative indices during loading. Triangles intersect with double-sided Möller–Trumbore using f64 intermediates, a relative determinant tolerance, and barycentric edge tolerance 1e-8. Flat normals and interpolated shading normals remain distinct. Missing smooth normals use an area-weighted sum. Each mesh builds a selectable local index over triangle bounds; scene acceleration indexes reusable instances. Both levels share generic traversal and the same input-index tie policy.

Textures are immutable scene data referenced by small material IDs; hits still copy only a small material value. PNG color texels are decoded to linear RGB once. Checker sampling and nearest/bilinear filtering happen at the hit UV. OBJ v=1 corresponds to the image top. Canonical primitive UV formulas retain the conventions documented above. Wrapping includes bilinear neighbors at the seam. All image radiance remains linear until output conversion.

## Educational transport

`Whitted` implements `local + km*reflection + kt*(F*reflection + (1-F)*transmission)` in linear RGB. Local ambient is 0.27*diffuse once, plus visible Lambert/Blinn–Phong point-light contributions with no distance attenuation in this educational mode. Reflection is shared when both km and kt need it. Glass presets set km=0 to avoid duplicate Fresnel reflection. Tint is applied per interface, not Beer–Lambert volume absorption.

Front-face state selects air/material IOR; nested dielectric media are not supported. Schlick uses incident cosine when entering and transmitted cosine when exiting. True TIR suppresses transmission and sets F=1; a tolerance of eight f32 epsilons handles roundoff at the critical boundary. Equal IORs transmit unchanged with zero reflection.

A centralized scale-aware geometric-normal offset plus representable f32 steps places spawned rays on the correct side. Shadow rays recompute their endpoint interval after offsetting. This is suitable for the tested 0.001–1000 origin-centered scales; it is not a formal error-bound method for arbitrary extreme world-coordinate/object-size ratios. Depth is bounded at 16; accumulated RGB maximum controls branch termination. Diffuse indirect light, nested media, caustics, and refractive shadows are absent. Glass occludes shadow rays. Physical BRDFs, HDR sampling, exact dielectric Fresnel, and the radiance transport convention are defined separately in [PHYSICAL.md](PHYSICAL.md).

## Acceleration

`accel` implements inclusive f64 slab queries with explicit zero-direction handling. Finite analytic bounds transform all eight corners and add conservative float padding; triangle bounds are padded to retain thin surfaces and edge tolerances. Infinite planes remain outside every finite tree.

The default BVH uses 12-bin surface-area heuristic splits, compares traversal/split cost against leaf cost, and stops at four items or depth 48. Coincident centroids/empty partitions remain leaves. Traversal visits near children first, tightens maximum t, and resolves exact equal-t hits by lowest original index, independent of traversal order.

The reference octree splits root axes at their midpoint into eight cells, retains cell-crossing primitives at their parent, and limits depth to 16. Every finite item is stored once. Both trees have bounded stack traversal and dedicated early-exit any-hit queries. No unsafe code, locks, or per-query heap allocations are used. `TraceStats` counts popped nodes, instance queries, and analytic/triangle tests in explicitly measured entry points; ordinary paths specialize counters away.

Scene geometry must remain unchanged after `build_accel`; rebuild after changing transforms or objects. Scene-file loading always builds fresh mesh and scene indices. Manual library scenes default to brute force until built explicitly. Public geometry vectors exist for now; callers must rebuild after edits.

The benchmark CLI validates every ray's hit/identity/distance and occlusion against brute force before timing. Its ray-query loop excludes shading, recursive bounces, image output, and counter overhead. Repeated warm timings are separate from scene JSON parse, asset load, and acceleration construction. A separate full-render thread-scaling harness verifies linear film hashes; a ray-query speedup is not an end-to-end render speedup.

## Sampling and source integration

`SampleKey` hashes seed/pixel/sample/dimension/recursive stream without shared mutable state. Sequential sample indices preserve prefixes as spp or batch partitions change. `render_range` validates film prefixes and appends linear samples in ascending order. Rectangular source sampling supplies the correct area-to-solid-angle conversion; legacy empirical shading stays distinct from physical BRDF evaluation. See [SAMPLING.md](SAMPLING.md) for equations, sidedness, source-power policy, and visual evidence. Camera dimensions are 0/1, rectangles start at 2, and physical environment/BRDF sampling uses disjoint dimensions 4096–4098/4100–4102. Recursive ideal transport forks streams.

## Tiled execution and previews

A dedicated Rayon pool renders exclusive tile buffers from immutable film-prefix sums. Per-pixel floating-point additions keep the same sample order across worker counts, tiles, and progressive batches; completed buffers commit after successful batch evaluation. The renderer validates nonfinite/negative radiance with pixel/sample diagnostics. Progressive callbacks receive complete uniform prefixes; CLI PNG replacement uses a temporary sibling and atomic rename. Details and exercised commands are in [PARALLEL.md](PARALLEL.md).
