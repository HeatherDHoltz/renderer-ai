# Architecture

This is the separate AI-assisted portfolio renderer based on Heather's early-semester Rust implementation. The class version is never modified by this project.

The current core is a library used by a CLI and a preserved `legacy` example. Geometry is accessed through `Shape`, `Scene` owns shapes and lights, `Camera` generates rays, `render` traces them, and `Film` writes images. The baseline uses educational Lambert/Blinn–Phong with point-light shadows and 8-bit display storage; it is not a physical renderer yet.

Implementation conventions: right-handed +Y-up world, camera local -Z, column-vector multiplication, object-to-world `T * R * S`. Instance rays retain direction magnitude to preserve t. Normals will use cached inverse transpose. Finite bounds and immutable thread-safe scene data are the planned acceleration/parallel boundary.

See [PLAN.md](../PLAN.md) and [STATUS.md](../STATUS.md) for verified capabilities. Design changes belong here when implemented.
