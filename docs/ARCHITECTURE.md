# Architecture

This is the separate AI-assisted portfolio renderer based on Heather's early-semester Rust implementation. The class version is never modified by this project.

The current core is a library used by a CLI and a preserved `legacy` example. Geometry is accessed through the thread-safe `Shape` trait. `Scene` owns shapes/lights and exposes closest-hit and early-exit occlusion queries. `Camera` validates perspective/orthographic frames. `LinearFilm` stores radiance sums and individual pixel counts, rejects nonfinite/negative samples, averages before exposure and Reinhard/linear tone mapping, then uses the piecewise sRGB transfer for PNG. Legacy `Film`/`render` preserve the original 8-bit educational output for baseline comparison.

`Transform` validates finite affine matrices, rejects singular/ill-conditioned frames, and caches inverse and inverse transpose. Matrix fields are private to prevent stale caches. `Instance` transforms rays without normalization, evaluates canonical geometry, and transforms outward normals. Hit records preserve geometric outward normals, oriented shading normals, front-face state, UVs, stable scene object IDs, and slots for mesh barycentrics/primitive IDs. Equal-t scene hits retain the earlier object. No physical shading or acceleration is implemented yet.

## Canonical geometry

| Primitive | Object-space definition | UV convention |
| --- | --- | --- |
| Sphere | radius 1 at origin | u=0.5+atan2(z,x)/(2π), v=acos(y)/π; seam at -X |
| Plane | y=0, outward +Y, infinite | u=x, v=z |
| Box | [-1,1] on each axis, outward face normals | remaining axes in cyclic order remapped to [0,1] |
| Cylinder | radius 1 around Y, -1≤y≤1, two caps | wall azimuth u, v=(1-y)/2; cap x/z remapped |
| Cone | apex y=1, radius 1 at y=-1, closed bottom | wall azimuth u, v=(1-y)/2; bottom x/z remapped |

Intersections are double-sided and intervals include both endpoints. Box/cap boundaries use a 1e-6 local tolerance. Analytic normals use inverse transpose even with negative scale; outward orientation follows the implicit solid, independent of triangle winding. The cone apex has no unique surface normal and uses +Y. Stable quadratic roots use f64 intermediate arithmetic and explicitly handle linear cone equations. No heap allocation occurs inside primitive queries.

`examples/shapes.rs` demonstrates all five shapes, including a tilted nonuniform ellipsoid, in both camera types. It writes 960×540 renders with one center sample per pixel. Aliasing is expected until M5.

Implementation conventions: right-handed +Y-up world, camera local -Z, column-vector multiplication, object-to-world `T * R * S`. Finite bounds and immutable thread-safe scene data are the planned acceleration/parallel boundary.

See [PLAN.md](../PLAN.md) and [STATUS.md](../STATUS.md) for verified capabilities. Design changes belong here when implemented.

## Educational transport

`Whitted` implements `local + km*reflection + kt*(F*reflection + (1-F)*transmission)` in linear RGB. Local ambient is 0.27*diffuse once, plus visible Lambert/Blinn–Phong point-light contributions with no distance attenuation in this educational mode. Reflection is shared when both km and kt need it. Glass presets set km=0 to avoid duplicate Fresnel reflection. Tint is applied per interface, not Beer–Lambert volume absorption.

Front-face state selects air/material IOR; nested dielectric media are not supported. Schlick uses incident cosine when entering and transmitted cosine when exiting. True TIR suppresses transmission and sets F=1; a tolerance of eight f32 epsilons handles roundoff at the critical boundary. Equal IORs transmit unchanged with zero reflection.

A centralized scale-aware geometric-normal offset plus representable f32 steps places spawned rays on the correct side. Shadow rays recompute their endpoint interval after offsetting. This is suitable for the tested 0.001–1000 origin-centered scales; it is not a formal error-bound method for arbitrary extreme world-coordinate/object-size ratios. Depth is bounded at 16; accumulated RGB maximum controls branch termination. Diffuse indirect light, physical BRDFs, nested media, caustics, and refractive shadows are absent. Glass occludes shadow rays.
