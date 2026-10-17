# The Little Jeweler — project brief for Claude

Prepared October 16, 2026 from the repository's current code and documentation. This is a tooling and environment-quality handoff. It does not certify that the room is physically correct.

Read this file first, then [SCENE_REALISM_AUDIT.md](SCENE_REALISM_AUDIT.md) and [BLENDER_TOOLING_REQUIREMENTS.md](BLENDER_TOOLING_REQUIREMENTS.md). The audit records concrete problems that remain unresolved.

## Request from Heather

I am Heather Holtz, directing an AI-assisted portfolio project called **The Little Jeweler**. Please recommend the best practical setup for an AI coding agent to create convincing Blender environments: configurations, extensions, add-ons, asset libraries, MCP servers, inspection tools, and a repeatable authoring workflow.

Research current options and verify compatibility. Give me a prioritized setup you would actually use for this project. Explain what each tool contributes and what still requires careful construction, inspection, and art direction.

I care about a finished room that feels real: coherent architecture, believable furniture, interesting objects, good lighting, and correct physical placement. A desk must stand on the floor. A floor-standing bookcase must reach the floor through a credible base or legs. Objects must rest on their supports. Windows, moldings, cabinets, and fireplaces must connect correctly. I want a process that catches these failures consistently.

## Project and repository

- Public repository: <https://github.com/HeatherDHoltz/renderer-ai>
- Hosted experience: <https://heathers-little-jeweler.zoeholtz2000.chatgpt.site/>
- The hosted Site currently preserves owner-private access and requires the owner's ChatGPT sign-in.
- Local repository: `/Users/heatherholtz/Downloads/CS116A/Renderer/renderer-ai`
- Development hardware is documented as an Apple Silicon Mac with an M1 Max. Verify the current OS and device configuration before recommending hardware-dependent features.
- The manually authored class project is a separate sibling directory. It and course materials must remain untouched.

The repository has three distinct rendering components:

| Component                 | Purpose                                                                                                                                  | Relationship to the browser room                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Custom Rust CPU renderer  | Educational and portfolio ray tracer: affine geometry, meshes, acceleration, HDR lighting, glass/metals, animation and procedural scenes | Separate implementation; its Rust code is not the browser's live renderer     |
| Mitsuba reference studies | Offline experiments with layered tiger's-eye material and directional volume scattering                                                  | Reference images, not a runtime dependency or replacement for the custom work |
| The Little Jeweler        | Interactive Three.js/WebGL 2 gemstone-inspection environment                                                                             | The room and authoring workflow being evaluated here                          |

No AI model produces rendered frames at runtime. AI assistance has been used for implementation, modeling scripts, debugging, scene authoring, and documentation. Collaboration should remain honestly credited.

## Desired experience and art direction

The visitor is seated at an early-1900s jeweler's desk, approximately circa 1905. The room should feel warm, atmospheric, tangible, and occupied by a person with a profession and interests. Jewelry inspection is the central activity.

Useful references to inspect directly:

- <https://felixrieseberg.com/#work>
- <https://felixrieseberg.com/using-webgl-shadertoy-shaders-in-three-js/>
- <https://felixrieseberg.com/made-by-mechanical-means/>

Heather likes the tangible objects, convincing environment, object-led interaction, and smooth navigation in the reference. Do not assume how its implementation works without inspecting the source material. No code, models, textures, or copy from that website have been reused here.

The preferred room vocabulary includes rich walnut or mahogany, brass instruments and hardware, books, velvet jewelry cases, mineral specimens, watchmaking or jewelry tools, drawings, antiques, and a fireplace. Arrange objects to suggest a real working jeweler and collector. Choose a coherent visual direction and execute it throughout the room.

Avoid indiscriminate grunge, a crude medieval-game appearance, randomly scattered props, overdone glow, and flat geometry whose main detail comes from pasted textures. Warm ambiance must coexist with enough neutral illumination to show gemstone color and brilliance.

**Fidelity is the standing priority over maneuverability and frame rate.** The agent must not silently reduce pixel density, material detail, or geometry quality during interaction. Heather previously noticed laptop heat, so profiling, caching, baked scenery, and eliminating redundant work remain useful. Propose any visible quality tradeoff explicitly.

## Existing interactions to preserve

- Drag to orbit a bounded seated camera around a focus point. Pointer movement alone does not move the camera.
- Scroll or pinch to zoom toward the pointer; double-click a surface to focus it.
- Rotate jewelry independently of the camera.
- Click physical jewelry cases to enter inspection and unfold their trays.
- Choose gemstones and metal/finish samples from those trays.
- Pick up the world-space brass loupe through an eased transition before the camera approaches its eyepiece. Return reverses the sequence.
- Clear loupe image without a tinted translucent overlay.
- Keyboard-accessible controls, reset, and saving a PNG of the rendered view.
- No hands or avatar. This is a seated inspection experience rather than an unrestricted walkthrough.

The loupe's magnification currently comes from the camera projection. Its body, rim, barrel, and aperture are actual 3D geometry; it is not a physically designed multi-element optical lens simulation.

The room must hold up at the allowed camera positions, focus targets, and zoom levels. Inspect areas revealed by camera movement, including the space below the desk and furniture bases.

## Jewelry and rendering that must remain strong

There are twelve gemstones: tiger's eye, diamond, emerald, ruby, blue sapphire, aquamarine, amethyst, peridot, tsavorite, spessartine, pink spinel, and tanzanite.

Six metal presets are yellow gold, rose gold, silver, platinum, titanium, and oxidized silver. Each has polished, satin, and brushed samples; intermediate finish values are also available. Sample trays are grouped by alloy, with plain shanks presented toward the viewer.

Faceted gems use custom GPU tracing through their convex facets, with Fresnel reflection, refraction, total internal reflection, RGB absorption and dispersion, and up to twelve internal bounces. Tiger's eye uses an artist-tuned directional fiber surface shader. Ruby and sapphire absorption fits have documented measured spectral sources; most other gemstone colors are appearance studies.

The current solitaire was authored in Blender as a continuous comfort-fit band, cathedral shoulders, curved claws, and gallery hoop. The main setting has 988,288 triangles; collection samples have 34,590. Its head is adjusted to the selected cut's girdle outline. The small main ring is meant to encourage using the loupe.

A cached 256-square room probe and directly intersected finite light apertures supply jewelry reflections. Fixed white reflectors lift metal reflections. An optional GPU photon pass uses 98,304 RGB paths and a 1024-square HDR map for refracted light on a flat bench receiver. This has documented sampling and occlusion limits; it is not full spectral whole-scene path tracing.

Environmental improvements should preserve the custom jewelry work. An evaluation of rendering architecture should state which parts remain custom and which are supplied by external tools.

## Current Blender-to-browser workflow

| Area                | Current implementation                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Blender             | Official Blender 4.5.14 LTS, invoked in background with Python scripts                                                    |
| Browser rendering   | Three.js 0.180.0, WebGL 2, plain JavaScript modules                                                                       |
| Build runtime       | Node.js 20+, vendored Three.js; no npm dependency installation is required for normal builds                              |
| Scene authoring     | Mostly Python-generated architecture and props, plus imported photographed objects                                        |
| Static light baking | Cycles, 96 samples                                                                                                        |
| Atlases             | 4096-square color, 2048-square denoised HDR diffuse irradiance, 1024-square HDR emission                                  |
| UVs and materials   | Separate material and bake UVs, with distinct surface responses                                                           |
| Interactive objects | Jewelry, cases, and loupe remain live                                                                                     |
| Shadows             | Architectural shadows baked; live object shadowing retained                                                               |
| Delivery            | glTF with aligned external buffers below 8 MiB; main setting uses a gzip-compressed binary mesh                           |
| Motion quality      | Native device pixel density during movement and rest, up to 4× MSAA; no adaptive motion-resolution drop or room blur pass |
| Idle work           | A depth-aware jewelry-image cache avoids retracing precious materials while only visible fire animates                    |

A live AI-to-Blender bridge is not part of the documented authoring pipeline. Investigate whether one would help the agent inspect and improve the scene. Do not assume a particular MCP server or extension is installed or has usable viewport access.

The fireplace currently uses a 56-step raymarched noise-based flame volume, modeled charcoal and embers, baked fixed bounced illumination, and a small live light. It is art-directed rather than a fluid simulation. Its appearance should still be evaluated critically.

The application is right-handed, +Y-up, with local camera -Z. The Blender scripts map application points `(x, y, z)` to Blender `(x, -z, y)`. Imported object transforms, origins, parent hierarchies, and scale need special attention. Scene coordinates are not yet a consistently documented real-world meter scale.

## Current scenery and sources

The room includes a routed jeweler's bench and drawers, paneling, a window and drapes, bookcase, mantel/fireplace, fixed shaded lamps, a balance and weights, watch movement, lapidary drawing, correspondence, tools, wire/findings, mineral specimens, and framed artwork.

Three photographed CC0 Poly Haven models retain their 2K PBR maps:

- Vintage Grandfather Clock 01 — James Ray Cock and Yann Kervran.
- Lambis Shell — Kuutti Siitonen.
- Brass Vase 03 — Rico Cilliers.

Photographed timber and velvet materials are also used. The mantel landscape is William Trost Richards' public-domain 1874 _Sundown at Centre Harbor, New Hampshire_, from the Met's Open Access collection. Full sources and hashes are recorded in the asset manifests.

Most architecture and many smaller objects are script-built from primitives and sweeps. They need construction and composition review. A detailed downloaded object can still be incorrectly sized or placed.

## What the proposed setup should accomplish

Recommend tools and a workflow for coherent room construction, physically grounded staging, strong lighting, consistent materials, and reliable browser export. Address these questions:

1. Which maintained Blender add-ons, extensions, asset libraries, or assembly tools materially improve this project?
2. Would a Blender MCP server or another local bridge improve actual agent inspection and editing? Which operations does it really expose?
3. What can Claude chat do, and what requires Claude Code or another local execution environment?
4. What configuration is appropriate for Blender 4.5 and Apple Silicon, separately for authoring previews, baking, and reference renders?
5. How should collections, assemblies, parents, support surfaces, units, and reusable assets be organized?
6. Which checks should catch unsupported furniture, intersections, incorrect scale, missing structural connections, and export regressions?
7. Which views, contact close-ups, diagnostic renders, and browser comparisons should be mandatory?
8. Which tools would add maintenance cost without solving the current problems?

For each recommendation, supply its official source, current compatibility/maintenance evidence, price, licensing/redistribution requirements, account/API/service needs, actual agent capabilities, and the specific problem it solves. Recommendations have not been researched or verified by this brief; that is your task.

Use [BLENDER_TOOLING_REQUIREMENTS.md](BLENDER_TOOLING_REQUIREMENTS.md) for the comparison format and pilot scene. Use [SCENE_REALISM_AUDIT.md](SCENE_REALISM_AUDIT.md) for concrete source findings and proposed acceptance checks.

## Repository reading map

Start with [AGENTS.md](AGENTS.md), [IMPLEMENTATION_HANDOFF.md](IMPLEMENTATION_HANDOFF.md), [PLAN.md](PLAN.md), and [STATUS.md](STATUS.md). The implementation handoff describes the original starting point; later code and revision records are authoritative for current features.

| File                                                                | Purpose                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [workbench/README.md](workbench/README.md)                          | Current browser controls, architecture, limitations, and reproduction |
| [build-atelier.py](workbench/scripts/build-atelier.py)              | Room construction, fixed lighting, atlas bake, and export             |
| [study-details.py](workbench/scripts/study-details.py)              | Detailed authored props and imported object placement                 |
| [build-solitaire.py](workbench/scripts/build-solitaire.py)          | Current continuous ring setting authoring                             |
| [workshop.js](workbench/src/workshop.js)                            | Runtime room/prop loading, lightmaps, materials, and fill             |
| [scene.js](workbench/src/scene.js)                                  | Main scene, jewelry, lighting, camera/tool motion, and rendering      |
| [bench-objects.js](workbench/src/bench-objects.js)                  | Cases, samples, labels, and physical loupe                            |
| [hearth.js](workbench/src/hearth.js)                                | Live fire volume, charcoal, and embers                                |
| [pack-fidelity.mjs](workbench/scripts/pack-fidelity.mjs)            | Lossless glTF buffer packaging                                        |
| [verify-packed.mjs](workbench/scripts/verify-packed.mjs)            | Delivery integrity and optional original-export comparisons           |
| [GEM-COLOR.md](docs/GEM-COLOR.md)                                   | Color/material research and Blender workflow                          |
| [workbench-verification.json](docs/workbench-verification.json)     | Historical evidence and latest fidelity revision                      |
| [atelier-provenance.json](workbench/assets/atelier-provenance.json) | Room and artwork provenance, asset hashes                             |
| [study-props/CREDITS.md](workbench/assets/study-props/CREDITS.md)   | New photographed object credits                                       |

Current actual browser images are in [gallery/workbench](gallery/workbench/): `fidelity-workshop.jpg`, `fidelity-loupe.jpg`, `fidelity-emerald.jpg`, and `fidelity-metals.jpg`.

The source Blender project is saved locally under ignored `output/study-research/study.blend`; it is not available from a clean Git clone. Rebuild from scripts if the local project is unavailable. Bulky original authoring exports are similarly kept under ignored `output/fidelity-research/`.

## Running and verification

From the repository root:

```sh
npm run dev --prefix workbench
```

Open <http://127.0.0.1:4173/>. The server builds before starting; after source changes, build and reload:

```sh
npm test --prefix workbench
npm run build --prefix workbench
node workbench/scripts/verify-packed.mjs
```

The last recorded implementation milestone passed 37 web tests and 98 Rust tests, formatting, and strict Clippy. These are historical results, not tests rerun for this documentation handoff. They do not establish correct furniture contact, structural plausibility, or attractive composition. Those need separate inspection and scene validation.

Required implementation-milestone Rust checks remain:

```sh
cargo fmt --check
cargo test --locked
cargo clippy --all-targets -- -D warnings
```

Normal browser builds work offline from bundled assets. Optional asset restoration commands need the network. Blender authoring needs the specified external authoring tools; use the actual installed executable path rather than assuming `blender` is on PATH.

## Working constraints and expected answer

- Respect [AGENTS.md](AGENTS.md), the AI-assisted/class-project separation, credentials, and existing publication identity/access.
- No repository-wide license has been selected; do not assign one. Track external asset licenses accurately.
- Heather has authorized verified local commits and GitHub pushes. Do not force-push or rewrite shared history.
- Do not spawn subagents without Heather's authorization.
- Keep generated bulky output under ignored `output/`; preserve relevant real evidence.
- Keep historical benchmark claims separate from the current high-fidelity configuration.
- Do not claim installation, access, measurements, visual success, or completed fixes without evidence.

Finish your advice with the setup you would actually choose, its cost and prerequisites, and a small practical pilot that demonstrates grounded furniture, useful agent inspection, convincing lighting, and a matching browser export before a full room rebuild.
