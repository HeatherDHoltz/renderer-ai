# AI-assisted Rust Renderer — Full Implementation Handoff

Prepared October 15, 2026. This document is the implementation brief for a new Codex agent working with Heather. Read it fully before changing code, then inspect the actual repository. Treat repository contents and fresh verification as authoritative about implementation status.

## 1. Mission and working agreement

Build a complete, usable, well-tested CPU renderer in Rust, starting from Heather's existing early-semester renderer. Cover the graphics topics in the supplied CS116A syllabus, with polished demonstrations, reproducible benchmarks, and documentation suitable for a public portfolio repository.

This is the **AI-assisted implementation version**. The agent is expected to write code, refactor, debug, run tools, inspect rendered images, improve performance, and document the result. Heather chooses the product direction and reviews results; she should not have to request every implementation step separately.

There is also an independent class version that Heather is writing manually for learning. Keep the two versions separate.

### Mandatory workspace boundary

- Work here: `/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai`.
- Do not modify the class version: `/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-project`.
- Do not copy generated implementation changes back into that class version unless Heather explicitly requests it.
- You may read the course materials elsewhere in `CS116A` for reference. Do not move, delete, or rewrite them.
- Keep build products, downloaded assets, renders, and temporary files inside this repository or a suitable temporary directory. Do not clutter the class folder.
- Do not copy course slides, syllabus files, handouts, or unrelated personal files into a public repository.

### Agent autonomy

Proceed through implementation milestones without repeatedly asking permission for routine technical decisions, tests, refactors, dependencies, or local renders. When a choice is reasonable and reversible, make it, document why, and continue. Ask only for a genuinely consequential missing preference or external action that requires authorization.

The user wants a complete implementation, not just a plan, scaffolding, a collection of stubs, or a README claiming unimplemented features. A milestone is complete only when its acceptance criteria pass. If a turn ends before the project is complete, record an exact handoff and report what remains.

Do not automatically create new user-visible Codex chats. If using multiple agents, first obtain the user's explicit authorization for delegation unless a governing instruction already provides it. The project can be built sequentially in one implementation chat. Worktrees are useful for independent concurrent changes, not a requirement for every feature.

## 2. What exists at handoff

The AI repository was initialized as a separate Git repository on branch `main`, copying the class project's `src/`, `Cargo.toml`, and `Cargo.lock`. At handoff creation it had no commits and no GitHub remote configured. Inspect current Git state before acting; another agent or the user may have changed it since this document was written.

The starting package is `renderer-project`, Rust edition 2024. Dependencies currently declare `glam = "0.33.6"` and `image = "0.24.9"` with PNG support. Keep the lockfile and avoid unnecessary dependency upgrades.

Existing source files:

| File | Starting responsibility |
|---|---|
| `src/main.rs` | Hardcoded definitions of five scenes and image generation |
| `src/camera.rs` | Perspective camera using eye, target, up, aspect, vertical FOV |
| `src/ray.rs` | Ray origin/direction, evaluation and affine transformation |
| `src/film.rs` | 8-bit RGB image storage and PNG output |
| `src/sphere.rs` | Sphere intersection using center and radius inferred from a transform |
| `src/plane.rs` | Plane intersection and a stored transform |
| `src/shape.rs` | `Shape` trait and `Hit` record |
| `src/scene.rs` | Shape/light storage and linear nearest-hit traversal |
| `src/material.rs` | Lambert + Blinn–Phong, constant ambient, point-light hard shadows |
| `src/render.rs` | Serial pixel loop with one center sample per pixel |

There are existing unit tests in several modules. Run them before making changes. Record the baseline result in project status; do not claim they passed merely because tests are present.

**Verified while preparing this handoff, October 15, 2026:** `cargo test --locked` completed successfully in `renderer-ai`: 37 passed, 0 failed. All copied Rust source files remained byte-for-byte equal to the class version at that time. No baseline render, formatting/lint audit, performance measurement, or implementation of the new features was performed during handoff preparation. Re-run relevant checks when beginning implementation.

### Limitations observed in the starting code

These are inspection findings, not instructions to preserve the existing design:

- `Hit` stores one oriented normal, but no persistent outward geometric normal, front-face flag, UVs, barycentrics, or primitive/material IDs.
- Spheres extract radius from the length of the transformed X axis. This does not implement arbitrary nonuniform affine instances correctly.
- Plane normals are transformed as ordinary vectors, which is insufficient for general nonuniform transforms.
- Camera construction normalizes cross products without robust validation of degenerate eye/target/up inputs.
- Rendering/shading clamps colors before accumulation into an 8-bit film. This must change to support HDR and correct sampling.
- Shadow visibility uses nearest-hit traversal; an explicit early-exit occlusion query should be added.
- Scene definitions and render settings are embedded in `main.rs`.
- There is no triangle mesh loading, acceleration structure, recursion, PBR shading, HDR environment, animation, or procedural generation yet.
- Shapes currently use `Box<dyn Shape>` without the thread-safety bounds needed for immutable shared parallel scene access.

Preserve useful existing math and behavior where sensible. Refactor deliberately; do not retain a limiting API solely because it exists. Save the current renders or record baseline images before altering shading/output conventions.

## 3. Course evidence and scope

The local syllabus is the basis for topic coverage. It does **not** specify every final project implementation detail. The concrete decisions below are this project's engineering specification, not claims that the professor mandated them.

Local reference files, outside this repository:

- `../Stage1Instructions.md`
- `../Stage2Instructions.md`
- `../../SJSU Official Syllabus_files/saved_resource(1).html` — actual saved syllabus content; the top-level HTML is a Canvas wrapper.
- `../../Lecture Slides/CS116A-Lecture-1-Introduction.pptx`
- `../../Lecture Slides/CS116A-Lecture-2-Vectors.pptx`
- `../../Lecture Slides/CS116A-Lecture-3-Matrices.pptx`
- `../../Lecture Slides/CS116A-Lecture-4-Transformations.pptx`
- `../../Lecture Slides/CS116A-Lecture-5-Camera.pptx`
- `../../Lecture Slides/CS116A-Lecture-6-RayTracing.pptx`
- `../../Lecture Slides/CS116A-Lecture-7-Intersections.pptx`
- `../../Lecture Slides/CS116A-Lecture-8-Shading.pptx`
- `../../Lecture Slides/CS116A-Lecture-9-Shadows.pptx`
- `../../Lecture Slides/CS116A-Lecture-10-Refraction.pptx`
- `../../Lecture Slides/CS116A-Lecture-11-Meshes.pptx`
- `../../Lecture Slides/CS116A-Lecture-1-10-Summary.pptx`

Use the appropriate presentation/PDF skill if reading those formats. Later-week lectures may not exist locally yet. Do not block on them; use the syllabus plus authoritative technical references, and label proposed implementation choices.

The syllabus lists:

| Weeks | Topic | Concrete coverage for this project |
|---|---|---|
| 2–3 | Vectors, matrices, transformations, camera/viewing | Consistent frames, affine instances, perspective and orthographic cameras |
| 4–5 | Ray tracing; canonical sphere, plane, box, cylinder, cone | Robust intersections, hit intervals, normals, transforms |
| 6 | Lambert, Blinn–Phong, shadows | Explicit educational Whitted material/integrator mode |
| 7–8 | Meshes, storage, triangles, barycentrics, smooth shading | Indexed triangle meshes, OBJ import, interpolated attributes |
| 10 | BVH, octree, surface area heuristic | Production default binned-SAH BVH; reference octree backend and comparisons |
| 11 | Supersampling, area lights, soft shadows | Seeded sampling, antialiasing, rectangular area lights |
| 12 | Multithreading, tiling, scene description, progressive rendering | CLI, validated scene files, deterministic parallel tiles, progressive previews |
| 13 | Image-based lighting, HDR | Linear HDR environment loading, environment illumination, exposure/tone mapping |
| 14 | Physically based materials | Defined microfacet metal/roughness model and dielectric transport |
| 15 | Transform hierarchies, keyframe animation | Scene graph, quaternion interpolation, rendered frame sequences |
| 16 | Generative design, L-systems, AI scene generation | Seeded procedural scenes, bounded L-system generator, schema-based AI scene workflow |

Important: the earlier midterm excluded meshes and Rust programming. That restriction applied to the **exam**, not this full-semester implementation. Include meshes here.

The textbook is referenced by the course as Marschner and Shirley, *Fundamentals of Computer Graphics*, fourth edition. A local textbook copy has not been found. Do not invent textbook chapter requirements or assume missing pages are available.

## 4. Deliverable and user experience

Deliver a Rust project that a developer can clone, build, test, and use to render documented scenes without editing Rust source. It must run on Heather's macOS machine and remain reasonably portable to other desktop platforms.

Minimum final artifacts:

1. Working library and command-line binary.
2. Documented, validated scene format with reusable materials and geometry.
3. Example scenes covering every major feature and several polished portfolio scenes.
4. Meaningful unit/integration tests and a fast smoke-render workflow.
5. Brute-force reference intersection backend, accelerated backends, benchmark harness, and actual benchmark report.
6. Progressive previews and reproducible animation frame generation.
7. README with quick start, actual gallery images, feature matrix, architecture overview, limitations, and AI collaboration disclosure.
8. Asset provenance/license notes and reproducible commands for every showcased image.
9. Checked-in implementation plan/status so another agent can resume reliably.

No GPU backend, web frontend, interactive editor, live viewport, distributed render farm, neural rendering, or mobile app is required. Do not divert the project into those areas. CPU performance and correct images are the focus.

## 5. Architecture and conventions

Use a small set of clear modules rather than a framework of speculative abstractions. A reasonable layout is `math/transform`, `ray`, `camera`, `geometry`, `mesh`, `accel`, `material`, `light`, `integrator`, `sampling`, `film`, `renderer`, `scene_io`, `animation`, and `procedural`. Exact file organization may differ when justified.

### Mathematical conventions

- Right-handed world coordinates. Default world up is +Y.
- Camera looks along its local −Z axis. Define image origin and screen-to-film Y conversion once.
- `glam` uses column-vector multiplication for the intended matrix expressions. Document storage/construction conventions separately from algebra.
- Object model matrix `M` maps object-local points to world: `p_world = M * p_local`.
- For TRS, use `M = T * R * S`; operations apply right to left.
- Scene graph composition: `M_world(child) = M_world(parent) * M_local(child)`.
- View matrix is the inverse of the **camera's** camera-to-world frame, not the inverse of an arbitrary object's model matrix.
- Points transform with homogeneous w=1; directions with w=0.
- Outward geometric normals transform by inverse transpose of the linear model transform and are renormalized.
- Cache transform inverse and normal matrix when the transform changes, not at every ray hit.
- Reject singular/near-singular transforms with clear errors.
- Define behavior for negative scale and triangle winding; test it. Never silently produce incoherent front-face/normal orientation.

### Ray parameter invariant

Use `p(t) = origin + t * direction`. Directions need not always be unit length. For instance intersection, transform the ray into object space with the inverse model matrix and **do not normalize its transformed direction**. The original ray parameter then remains valid under affine transforms, so hits can be compared across objects.

World camera and spawned transport rays can normally use unit directions. Do not casually equate `t` to physical distance for arbitrary nonunit directions. Shadow intervals must match the direction parameterization used.

### Hit record and shape interface

Support at least: `t`, world position, outward geometric normal, oriented shading normal, `front_face`, material ID/reference, primitive/object ID, and optional UV/barycentric data. Compute `front_face` from the original geometric normal before orienting a shading normal against the ray.

Keep geometric normals available for side classification, offsets, and refraction even with smooth interpolated normals. Make shared scene data immutable during a render and safe to access from worker threads. Avoid cloning whole meshes or materials per hit.

Provide distinct closest-hit and any-hit/occlusion queries with explicit ray intervals. Tighten closest-hit upper bounds during traversal. Keep a simple reference backend available for differential testing.

## 6. Geometry, intersections, and meshes

### Canonical analytic primitives

Implement sphere, infinite plane, finite box, finite capped cylinder, and finite capped cone. Define exact canonical coordinates, dimensions, axis directions, cap conventions, UV conventions, and default winding/normals in documentation. Defaults may be chosen by the agent, but must be explicit.

Use affine instancing rather than implementing translations/scales differently in every primitive. Nonuniformly scaled spheres must behave as ellipsoids. Test side walls, caps, seams, tangent hits, rays originating inside, parallel cases, and degenerate coefficients such as near-linear cone equations. Do not use an infinite cylinder while claiming finite capped-cylinder support.

Keep infinite planes outside finite bounding-volume structures, testing them through a small separate list. Do not assign fake huge finite bounds that can miss legitimate intersections.

### Triangles and meshes

- Implement robust double-sided triangle intersection with documented edge/tolerance policy; optional backface culling can be a setting.
- Return barycentric coordinates with a fixed vertex ordering.
- Accept interior points with nonnegative barycentric weights whose sum is one, within numerical tolerance. If storing only beta/gamma, require beta>=0, gamma>=0, beta+gamma<=1.
- Interpolate UVs and shading normals; normalize the result and keep it consistently oriented relative to the geometric normal.
- Preserve indexed vertices and attributes. OBJ's position/normal/UV indexing may differ; either retain separate indices or unify tuples correctly.
- Support OBJ positions, faces, optional normals and UVs, common index forms and negative indices. Use a focused loader crate if appropriate. Define how polygons are triangulated; reject unsupported polygons clearly rather than corrupting geometry.
- Generate missing normals with a documented method. An area-weighted sum uses unnormalized face cross products; larger triangle area is not evidence of a flatter region.
- Keep hard edges where explicitly represented by split vertices/normals. Smooth shading must not be advertised as smoothing the silhouette.
- Validate invalid indices, nonfinite data, and zero-area triangles with an explicit reject/skip policy and diagnostics.
- Implement reusable mesh instances. Prefer a mesh-local BVH plus scene instance BVH when it materially improves memory/performance; a simpler first correct implementation is acceptable before that milestone.

### Texturing

The course overview mentions texturing without specifying a later-week implementation. For useful concrete coverage, include UV checker textures and image base-color textures with nearest/bilinear filtering and documented wrap modes. Decode color images into linear RGB; keep scalar/data maps linear. Normal mapping, displacement, anisotropic filtering, and full MTL import are optional extensions.

## 7. Educational shading and recursive transport

Provide an explicit legacy/Whitted mode that demonstrates the course equations. Keep its empirical shading separate from the physically based material implementation so educational conventions do not accidentally become physical claims.

### Local illumination

For unit normal `n`, point-to-light direction `l`, point-to-view direction `v`, and `h = normalize(l+v)`:

```text
local = ka ⊙ Ia
      + Σ_visible_lights [kd ⊙ I_l max(0,n·l)
                         + ks ⊙ I_l max(0,n·h)^p]
```

`⊙` means RGB component-wise multiplication. `ka`, `kd`, `ks`, `km`, and `kt` are RGB coefficients; shininess `p` and IOR are scalars. A neutral RGB coefficient `(0.7,0.7,0.7)` has the same effect as scalar multiplication by 0.7.

Ambient is added once, not once per light and not removed by an individual light's shadow. Handle a zero-length half vector safely. Keep local lighting in linear floating-point RGB, without per-light clamping.

The current course example point-light convention does not use inverse-square falloff. Preserve a documented educational option if needed, but use physically meaningful distance attenuation in the physical mode. Make units/conventions explicit rather than switching silently.

### Reflection and refraction

For unit incident direction `d`, outward geometric normal, and an oriented interface normal `n` opposing `d`:

```text
reflection_dir = d - 2(d·n)n
eta = n_incident / n_transmitted
cos_i = clamp(-d·n, 0, 1)
k = 1 - eta²(1 - cos_i²)
transmitted_dir = eta*d + (eta*cos_i - sqrt(k))*n   [only if k >= 0]
```

- Use `front_face` to select incident/transmitted IOR and orient the interface normal. Do not infer entering/exiting from a normal that was already forced to oppose the ray.
- For `k<0`, total internal reflection: no transmitted ray, Fresnel reflectance exactly one.
- For `k=0`, the mathematical transmitted direction is tangent to the interface. Avoid negative-root NaNs near the boundary; use a small justified numerical tolerance, not a blanket clamp that hides real TIR.
- Implement Schlick reflectance for the educational mode, with the angle convention documented. Handle exiting rays consistently with the course's convention and explicitly override TIR. The physical dielectric may instead use exact dielectric Fresnel.
- Spawn reflected/refracted rays on their correct sides using a centralized geometric-normal offset or another validated robust scheme. Shadow rays need the same self-intersection care. Use scale-aware numerical handling and test multiple scene scales.
- Keep geometric surface orientation distinct from whichever normal is used in the shading formula.
- Enforce recursion limits. Add accumulated throughput termination where deterministic branching makes it useful; terminate only when all RGB contributions are negligible, e.g. max channel below threshold. Do not terminate just because one channel is small.

### Weighting policy: avoid the earlier ambiguity

The course's main reflection algorithm adds local illumination and `km ⊙ color(reflection_ray)`. Some course render examples also mention blending. The term “additive model” was explanatory terminology in the prior chat, not a named requirement from the lecturer.

Implement and document one explicit educational default:

```text
color = local
      + km ⊙ reflected_color
      + kt ⊙ [F*reflected_color + (1-F)*transmitted_color]
```

For glass presets, set `km=0` so the glass Fresnel reflection is not counted twice. Compute a shared reflection ray once where possible. At TIR, `F=1` and omit transmission. This is an empirical course model, not guaranteed energy conserving.

If implementing a blend option, name it clearly and show the formula. Never silently add `(1-km)` to the local term while claiming it came from the main lecture algorithm.

Ideal clean glass can have zero diffuse, but small diffuse terms are allowed in the lecture's artistic presets. An ideal mirror can have zero local shading; local specular highlights are a deliberate material choice, not a mandatory property of every mirror. Provide presets with explicit coefficients.

## 8. Physically based mode

“PBR” must refer to a defined, implemented model, not renamed Blinn–Phong. Proposed baseline:

- Lambertian diffuse BRDF `base_color/pi` for diffuse dielectric surfaces.
- Cook–Torrance microfacet reflection with GGX/Trowbridge–Reitz normal distribution, Smith masking-shadowing, and Schlick Fresnel for metal/roughness surfaces.
- Metallic parameter blends dielectric F0 (commonly around 0.04) with metal base-color F0; document this as an approximation to conductor optics.
- Roughness maps to microfacet alpha under a documented convention, commonly `alpha=roughness²`, with a minimum numeric roughness where required.
- Energy-aware diffuse/specular weighting, e.g. suppress diffuse for metals and reduce dielectric diffuse by Fresnel. Avoid double-counting direct-light highlights and recursive reflection.
- Smooth dielectric reflection/refraction with proper Fresnel splitting, incident/transmitted IOR handling, TIR, and a stated radiance-transport convention. If transmission requires eta-related radiance factors, apply them consistently and test the chosen convention.
- Optional RGB Beer–Lambert absorption for glass to demonstrate thickness-dependent tint. If implemented, track actual travel distance in the material rather than tinting every interface arbitrarily.

Required physical demonstration materials: matte dielectric, rough dielectric, rough metal, near-smooth metal, clear glass, and colored glass. Distinguish surface tint from absorption in documentation.

A full general-purpose path tracer is **not required solely because the syllabus says PBR**. Direct-light integration with properly sampled area/environment lights plus recursive ideal specular transport is an acceptable defined baseline. State limitations on indirect diffuse light and caustics honestly.

If glossy/environment reflection is implemented through BRDF sampling, use the correct PDF and cosine weighting. If combining BSDF and light sampling, implement MIS correctly or choose a simpler single-estimator approach that avoids double counting. Do not add a path-tracing integrator before the required renderer is stable unless it is the clearest implementation route.

For physically based references, use primary sources such as PBRT's online book and original BRDF papers. Record links and choices in architecture notes. Do not transplant substantial source code without respecting its license.

## 9. Lights, sampling, HDR, and output

### Lighting

- Point lights for hard shadows, with explicit intensity conventions.
- Rectangular area lights defined by position, two spanning vectors or equivalent dimensions/orientation, emitted radiance, and sidedness.
- Sample area lights over their actual surface. Include geometry, distance, cosine, and PDF factors consistently in physical mode. A larger emitter should produce wider penumbrae with documented power/radiance behavior.
- Visibility rays end at the sampled emitter location and must not treat geometry beyond that point as a blocker.
- Environment illumination must affect surfaces; using an HDR image only as the visible background does not fulfill image-based lighting.
- Establish an explicit transparent-shadow policy. The baseline may treat glass as opaque to shadow rays and document missing refractive caustics. Do not claim physically correct glass shadows unless implemented and validated.

### Sampling

- Reproducible global seed plus stable pixel/sample/dimension addressing or equivalent independent streams.
- Pixel jitter/stratification for antialiasing, with a center-sample debug mode.
- Area-light sampling and environment sampling using distinct random dimensions.
- Sample sequences must not change when thread count or tile scheduling changes.
- Document whether `samples_per_pixel` includes all lighting samples or multiplies by a separate light sample count; report actual work fairly in benchmarks.
- Do not share a mutex-protected RNG across all worker threads.

### Environment maps

- Load a real floating-point HDR format, at minimum Radiance `.hdr`; OpenEXR is optional.
- Define latitude-longitude mapping and environment rotation.
- Evaluate environment radiance in linear RGB and allow values above one.
- Implement a useful importance distribution based on luminance and spherical area (`sin(theta)` for lat-long texels), including correct solid-angle PDF conversion and a fallback for black/constant maps.
- Test the poles, seam, orientation, PDF normalization within numerical tolerance, and a synthetic bright environment feature.
- Include an offline synthetic HDR fixture or generator so tests and at least one demo require no external download.

### Film and color pipeline

Accumulate linear floating-point radiance and sample counts. Average samples before display conversion. Never clamp each sample or bounce to `[0,1]`.

Provide exposure adjustment and a documented tone mapper (e.g. Reinhard plus a linear/debug option), followed by proper linear-to-sRGB encoding for PNG. Preserve a floating-point output such as `.hdr` so HDR values can be inspected independently of tone mapping. Prevent NaNs/infinities from silently contaminating output; track diagnostics and fix root causes.

Progressive previews use the same pipeline as final output. A preview at N samples must represent the same first N samples as a nonprogressive render with matching configuration, subject to documented floating-point tolerance.

## 10. Acceleration structures

Keep selectable `none`, `bvh`, and `octree` backends or equivalent explicit configuration.

### AABB foundation

Implement slab intersection robustly for zero direction components, rays beginning inside bounds, negative directions, and finite hit intervals. Ensure degenerate thin bounds for triangles remain traversable. Compute transformed instance bounds conservatively, e.g. transforming all eight local AABB corners.

### Default BVH

- Start with a correct median split if necessary, then implement binned surface-area heuristic splitting.
- Compare split cost against leaf cost. Handle coincident centroids, empty partitions, tiny primitive sets, maximum depth, and invalid bounds.
- Use practical leaf sizes and a compact traversal-friendly layout.
- Traverse nearer children first where useful and update closest-hit bounds.
- Provide early-exit occlusion traversal.
- Support triangles and finite analytic primitives, directly or through instances.
- Instrument node visits and primitive tests without imposing substantial overhead when statistics are disabled.
- If using a TLAS/BLAS design, reuse mesh-local geometry/BLAS for instances and update scene-level bounds when transforms change.

### Reference octree

The syllabus explicitly names octrees, so include a working selectable reference implementation after the BVH is stable. It need not outperform the BVH. Define insertion/traversal rules for primitives crossing cells, retain straddlers at parents or deduplicate safely, and enforce depth/occupancy limits. Avoid uncontrolled duplication or missed large primitives.

Validate BVH and octree against brute force on seeded random rays and curated edge cases. Compare hit/miss, nearest t, object/primitive identity, and occlusion. Define deterministic tie handling for coincident/equal-t hits so differential tests distinguish valid ties from bugs.

## 11. Parallel tiles and progressive rendering

- Use a practical CPU threading library such as Rayon, or a justified small worker pool. Do not build a custom job system unless needed.
- Divide output into tiles, handling dimensions that are not multiples of tile size.
- Give workers exclusive tile buffers or nonoverlapping storage; avoid a global lock in the hot pixel loop.
- Keep scene, geometry, and materials immutable while workers render.
- Expose thread count and tile size. One-thread mode must use the same algorithm and samples as multithreaded mode.
- Avoid unsafe code unless a measured need justifies it; prefer safe ownership and buffer partitioning.
- Progressive rendering accumulates repeated sample batches and writes periodic preview files or updates a documented output artifact. A GUI is unnecessary.
- Show useful progress and timings at a sensible rate. Do not print per-ray logs.
- Define cancellation behavior; preserve the latest valid preview if feasible. Saving/reloading accumulation checkpoints is optional, not a requirement.
- Track completed sample counts explicitly; do not average incomplete tiles as if they had equal samples.
- Test single/multithread equivalence and progressive/final equivalence. Document any tolerance instead of claiming bitwise cross-platform identity without evidence.

## 12. Scene description and command line

Choose one human-readable scene format, preferably TOML, JSON, or RON with Serde. Include format versioning and helpful parse/validation errors. A schema document or equivalent examples must define units, defaults, coordinates, parameter ranges, and relative asset paths.

Scene descriptions should support:

- Named materials and textures.
- Camera type, position/orientation or look-at, FOV/orthographic scale.
- Instances of analytic primitives and external meshes.
- Reusable geometry/material references and nested transform nodes.
- Point and area lights, environment path/intensity/rotation.
- Render settings: dimensions, sample count, seed, integrator, depth, acceleration, threads, tile size, exposure, tone mapper.
- Animation tracks or references and procedural generator parameters.

Reject invalid dimensions, unreasonable allocations, nonfinite values, degenerate cameras, singular transforms, unknown references, cyclic hierarchies, invalid material ranges, and unsupported features with actionable diagnostics.

Paths are relative to the scene file, not whichever directory the user happened to launch from. Loading a scene must never execute shell commands or arbitrary code.

Suggested CLI shape, to finalize and document during implementation:

```sh
cargo run --release -- render scenes/glass.toml --output output/glass.png
cargo run --release -- render scenes/mesh.toml --accel bvh --threads 8 --spp 64
cargo run --release -- render scenes/studio.toml --progressive --preview-every 8
cargo run --release -- animate scenes/animation.toml --frames 0:60 --output output/frames
cargo run --release -- generate scenes/lsystem.toml --output output/tree-scene.toml
cargo run --release -- validate scenes/glass.toml
cargo run --release -- benchmark scenes/benchmark.toml --output output/benchmarks.json
```

These commands are proposed interfaces, not existing commands. Do not paste them into the README as working until implemented and exercised. Keep CLI overrides and scene defaults deterministic and documented.

## 13. Hierarchies, animation, and procedural scenes

### Scene graph and keyframes

- Parent-child transform hierarchy with cycle detection and named nodes.
- Reusable mesh/primitive instances with stable IDs.
- Translation/scale interpolation and quaternion rotation interpolation, preferably shortest-arc slerp with sensible near-equal handling.
- Defined time units, keyframe ordering, duplicate-time policy, interpolation, and endpoint clamping.
- Evaluate a complete static scene at each requested frame time. Refit/rebuild acceleration as needed; do not reuse stale bounds.
- Render an image sequence without requiring video encoding tools. An optional FFmpeg command in documentation is sufficient for making a video.
- No motion blur, skinning, deformable animation, or physics simulation is required.
- Demonstrate a parent-child animated system and test exact keyframe times plus intermediate transforms.

### Generative design and L-systems

- A seeded scene generator with configurable object counts, material palettes, and placement bounds, useful for benchmarks and gallery scenes.
- An L-system with configurable axiom, rewrite rules, iteration count, step length, turn angle, and bounded expansion.
- Turtle interpretation supporting branching with a stack. Use cylinders/cones/meshes for branches and instances for repeated components.
- Validate malformed/unbalanced commands and prevent explosive memory growth with explicit generation limits.
- Demonstrate at least one visually readable plant/tree or branching structure.
- Generation with the same seed/settings must reproduce the same scene.

### AI-assisted scene generation

The syllabus mentions using AI to build models/scenes. Cover this with a documented, concrete workflow: a prompt template that asks an external coding/chat agent to produce this renderer's scene format, a machine-checkable schema/validator, and at least one checked-in validated generated scene.

No hosted model API, API key, payment, network service, or embedded chat UI is required. Do not invent a remote integration to satisfy this topic. Generated content must pass the same scene validation and bounded-resource rules as hand-written content. State that this is a scene-authoring workflow, not an AI rendering algorithm.

## 14. Ordered implementation milestones

Create `PLAN.md` and `STATUS.md` at the beginning of implementation. Mark each milestone as pending, active, or verified with links to evidence. The following order is recommended; adapt dependencies deliberately and record changes.

### M0 — Baseline and working foundation

- Inspect all source and existing tests; run baseline tests.
- Capture at least one representative current render or a fast equivalent with baseline settings recorded.
- Introduce a library/binary boundary and configurable small smoke render.
- Establish project-specific `AGENTS.md` instructions protecting the class version, defining verification, and pointing at this handoff/status.
- Record toolchain, architecture choices, feature scope, and baseline limitations.

**Done when:** the original functionality can still be demonstrated; baseline commands/results are recorded; no class files changed.

### M1 — Core math, transforms, geometry, and hit records

- Implement affine instance handling, cached inverses, correct normals, front-face tracking, robust intervals, and camera validation.
- Add orthographic camera and all required analytic primitives.
- Separate linear film storage from output conversion.

**Done when:** transformed primitive tests pass, a nonuniformly scaled sphere renders correctly, and a canonical-shapes scene works.

### M2 — Whitted recursion and glass

- Implement reflection, refraction, Schlick/TIR, centralized offsets, recursion/throughput limits, explicit material weights, and presets.
- Preserve educational local lighting semantics in a named mode.

**Done when:** mirror, glass, inside-glass, critical-angle/TIR, and facing-mirror termination cases pass; inspected renders show expected behavior without obvious acne.

### M3 — Scene files, CLI, meshes, and textures

- Implement validated scene loading and CLI with relative asset paths.
- Indexed triangle intersection, OBJ import, flat/smooth shading, UV textures, mesh instances.
- Replace source-coded demo scenes with data-driven equivalents where practical.

**Done when:** a clean CLI command renders an imported textured mesh; invalid scenes/assets produce useful errors; barycentric/normal/interpolation tests pass.

### M4 — Acceleration and reference comparison

- AABBs, brute-force backend, binned-SAH BVH, instrumentation, then reference octree.
- Seeded scene/ray fixtures and benchmark controls.

**Done when:** accelerated backends agree with brute force across meaningful test cases, and actual timing/primitive-test results are recorded on a mesh-heavy scene.

### M5 — Sampling and area-light shadows

- Deterministic per-pixel sampling, antialiasing, area lights, soft shadows.
- Linear accumulation and stable sample normalization.

**Done when:** AA and shadow comparisons at multiple sample counts are generated and inspected, area light estimators are validated, and repeated seeds reproduce results.

### M6 — Multithreading and progressive output

- Tiled rendering, configurable worker counts, preview batches, progress reporting.
- Equivalence tests across threads/tile sizes and batch partitions.

**Done when:** odd-sized images render correctly, progressive/final output agrees, and honest one-thread/multithread timings exist.

### M7 — HDR, image-based lighting, and physical materials

- HDR decode/output, environment lookup/sampling, exposure/tone mapping, linear/sRGB handling.
- Defined microfacet materials and physical dielectric transport with no accidental duplicate reflection.

**Done when:** an environment illuminates an otherwise unlit scene; metallic/roughness/glass comparisons are inspected; estimator/BRDF tests and HDR/color-pipeline checks pass.

### M8 — Hierarchy and animation

- Transform graph, keyframes, frame sequence CLI, acceleration updates.

**Done when:** a parent-child animation produces verified first/middle/last frames with no stale bounds or transform jumps.

### M9 — Procedural generation and AI authoring workflow

- Seeded scenes, bounded L-system, prompt template/schema/validation example.

**Done when:** reproducible generated scenes render successfully and malformed/oversized inputs are handled predictably.

### M10 — Portfolio and release readiness

- Polish selected scenes; document commands, architecture, known limitations, asset licenses, and measured benchmarks.
- Add CI for formatting, tests, lint, and a fast offline smoke render as practical.
- Audit feature claims against actual implementation and evidence.

**Done when:** the final checklist below passes from a clean checkout, gallery files exist, and another developer can reproduce a documented render without editing source.

## 15. Verification strategy

Use tests that protect meaningful mathematical or rendering behavior. Avoid large quantities of tests that merely repeat implementation arithmetic. Favor analytic expectations, invariants, differential testing, and small reproducible scenes.

Required categories:

| Area | Useful evidence |
|---|---|
| Frames/transforms | Point/vector behavior; transform-inverse round trip; nonuniform normals; ray-t preservation |
| Cameras | Center/corner rays; aspect/FOV; orthographic parallel rays; degenerate input rejection |
| Geometry | Miss/tangent/two roots; inside exit; finite intervals; caps; triangle boundaries; transformed instances |
| Transport | Reflection law; normal-incidence refraction; Snell relationship; critical/TIR behavior; entering/exiting glass |
| Shading | RGB component-wise behavior; ambient once; blocked/beyond-light cases; zero half vector |
| Meshes | Independent OBJ indices; interpolation; invalid faces; flat versus smooth normals |
| Acceleration | Seeded brute-force comparisons; zero-direction slabs; coincident centroids; planes outside tree |
| Sampling | Fixed-seed repeatability; unbiased sample normalization; thread/tile independence |
| HDR/color | Values above one survive accumulation; correct sRGB transfer; exposure behavior; constant environment |
| Physical materials | Finite nonnegative BRDF; reciprocity where applicable; plausible numeric energy integration; diffuse/metal limits |
| Animation | Keyframe endpoints; midpoint rotation; hierarchy composition; refreshed bounds |
| IO/generation | Relative paths; unknown references; cycle detection; bounded L-system; deterministic output |

Run `cargo fmt --check`, `cargo test`, and `cargo clippy --all-targets -- -D warnings` as appropriate once the project is organized. Record any baseline lint debt and resolve it deliberately. Use release builds for performance claims.

Render tests should use tiny deterministic images and numeric tolerances/metrics appropriate to the algorithm. Avoid brittle exact image snapshots across platforms unless intentionally restricted to a stable path. A plausible-looking image alone does not prove a transport equation is correct.

Inspect actual images using image viewing tools. Check shadows, silhouettes, highlights, refraction, texture orientation, seams, noise, clipping, and composition. Do not claim visual QA based only on a generated filename or pixel dimensions.

## 16. Demonstration scenes and expected evidence

Create small diagnostic scenes first, then polished compositions:

1. **Canonical shapes:** sphere, box, capped cylinder, capped cone, plane; varied transforms and a nonuniform instance.
2. **Lighting study:** identical objects with diffuse/specular settings and multiple colored lights; shadowed versus visible contributions.
3. **Mirror study:** visible reflected objects, tinted mirror, facing mirrors with finite depth.
4. **Glass study:** reflection and refraction, clear/tinted examples, known IORs, internal/TIR diagnostic.
5. **Mesh study:** self-contained OBJ fixture with flat/smooth/UV shading and instanced copies.
6. **AA/shadow comparison:** thin edges and a rectangular emitter at different sizes/sample counts.
7. **HDR material studio:** environment-lit matte, rough dielectric, rough metal, smooth metal, and glass objects.
8. **Acceleration workload:** generated triangle-heavy geometry with fixed seed, camera, and ray workload.
9. **Hierarchy animation:** parent/child orbital or articulated motion rendered as a short sequence.
10. **Procedural garden:** at least one L-system branching structure, seeded placement, sensible lighting.
11. **Portfolio hero:** a visually coherent composition combining meshes, glass/metal, soft shadows, and HDR lighting. It should show intentional composition rather than every feature crammed into one frame.

Use self-generated geometry and synthetic environments where possible so the repository works offline. External showcase assets must have clear provenance and redistribution rights; provide download instructions instead of redistributing uncertain assets. Do not let missing optional external assets break tests or quick-start commands.

## 17. Performance and benchmarking

The goal is credible measured engineering, not a predetermined speedup. Never fabricate numbers, hardware details, triangle counts, or performance claims.

Benchmark at least:

- Brute force versus BVH versus octree on the same scene/ray workload.
- One thread versus several available thread counts with BVH enabled.
- A small scene where acceleration overhead may dominate and a larger mesh-heavy scene where acceleration should matter.

Record hardware/OS, Rust version, build profile, commit identifier when available, scene identity/seed, object/triangle count, image size, samples, integrator, bounce limit, thread/tile settings, and acceleration settings. Separate scene parse/build time, acceleration build time, render time, and image-write time where possible.

Use warmups and multiple runs, report median plus spread, and avoid comparing debug against release or different sample counts. Validate output agreement before comparing timings. Include primitive-test/node statistics when they explain the result. Keep slow benchmark scenes separate from the default CI suite.

Do not promise real-time rendering or linear thread scaling. If an optimization does not help, report that result and investigate bottlenecks instead of removing inconvenient measurements.

## 18. Repository, documentation, and GitHub readiness

Maintain:

- `README.md`: quick start, gallery, commands, features, limitations, AI-assisted development description.
- `PLAN.md`: ordered milestones with acceptance criteria and dependencies.
- `STATUS.md`: current verified state, recent results, exact next step, known issues.
- `docs/ARCHITECTURE.md`: conventions, module responsibilities, scene/transport design, major tradeoffs.
- `docs/SCENE_FORMAT.md`: schema, defaults, examples, validation rules.
- `docs/BENCHMARKS.md`: reproducible commands and measured results.
- `docs/ASSETS.md`: sources, licenses, generated fixtures, optional downloads.
- `docs/AI_SCENE_AUTHORING.md`: constrained generation prompt and validation workflow.
- `scenes/`, `tests/`, and a small curated gallery directory as appropriate.

Keep documentation proportional and current. This handoff is deliberately extensive; the README should be concise and useful to someone running the project.

Keep generated bulk output and `target/` ignored. A few selected gallery images can be committed deliberately. Do not accidentally ignore all evidence while linking nonexistent gallery files. Keep `Cargo.lock` for the executable project.

Inspect Git status before staging or committing. Do not overwrite, revert, or commit unrelated user changes. Local milestone commits may be made when authorized by the user or governing workflow; never manufacture historical dates or authorship. Ask for a license choice before assigning one on Heather's behalf if no license has been selected.

Preparing a repository locally is within this brief. Publishing to GitHub, selecting public/private visibility, and pushing to a remote should follow the user's explicit instructions. Do not assume that a request to implement grants permission to publish externally.

Resume claims must match delivered features and real measurements. “AI-assisted” should be represented honestly; do not imply Heather manually wrote all generated implementation. Her separate class implementation and learning track remain independent.

## 19. Definition of done

Do not mark the full project complete until all required items below are verified or the user has explicitly revised scope:

- [ ] Original class project remains untouched by this implementation work.
- [ ] Clean build and documented quick start work.
- [ ] Perspective/orthographic cameras and validated affine transforms work.
- [ ] Sphere, plane, box, finite capped cylinder, finite capped cone, and triangle mesh geometry work.
- [ ] Indexed OBJ import, barycentrics, smooth normals, UV checker/image textures work.
- [ ] Educational Lambert/Blinn–Phong, shadows, mirror recursion, refraction, Fresnel, and TIR work.
- [ ] Defined physical diffuse/metal/roughness/glass materials work with documented transport limitations.
- [ ] Brute force, binned-SAH BVH, and reference octree agree on validated workloads.
- [ ] Seeded AA and sampled area-light soft shadows work.
- [ ] Multithreaded tiles and progressive previews work with stable sampling.
- [ ] HDR environments illuminate geometry; linear accumulation, tone mapping, sRGB PNG, and HDR export work.
- [ ] Scene files and CLI support the required features with clear validation errors.
- [ ] Scene hierarchies, keyframe animation, and frame sequences work.
- [ ] Seeded procedural scene generation and a bounded branching L-system work.
- [ ] Schema/prompt-based AI scene authoring is documented and demonstrated.
- [ ] Meaningful tests, lint/format checks, and offline smoke render pass.
- [ ] Diagnostic/portfolio renders have actually been inspected.
- [ ] Benchmarks are reproducible, measured, and correctly contextualized.
- [ ] README, architecture notes, asset records, and status match actual capabilities.
- [ ] No unsupported claims, placeholder screenshots, fake benchmarks, or unfinished required stubs remain.

## 20. How to start your next turn

1. Confirm you are operating in `renderer-ai`, inspect applicable instructions and Git status, then read this document and any existing plan/status files.
2. Inspect the source directly. Verify the handoff assumptions against current files.
3. Run the existing tests and record their exact outcome. Capture a fast baseline render.
4. Create/update project instructions, a concrete milestone plan, and status. Resolve architectural choices sufficiently to begin, without overdesigning.
5. Implement M0 and proceed into the next milestone. Continue autonomously through useful verified work, updating the user at meaningful points.
6. At every handoff, record files/features changed, commands run, results, unresolved issues, and the exact next step. State whether the renderer is actually complete.

Suggested initial user prompt when opening this repository in a new Codex project:

> Read IMPLEMENTATION_HANDOFF.md and implement the full AI-assisted renderer described there. You own implementation, testing, debugging, rendering checks, benchmarks, and documentation. First inspect the current source and verify its baseline, then maintain PLAN.md and STATUS.md and work through the milestones. Make routine technical decisions yourself and keep progressing through verified milestones. Leave my separate class renderer untouched. Do not publish to GitHub yet.
