# The Little Jeweler

A period-inspired jeweler’s study directed by Heather Holtz and built with Codex assistance. Pick a gemstone, select an alloy and finish from the velvet cases, and examine a normal-sized solitaire through a clear physical brass loupe. The room is a collector’s study: photographed antiques, a working fire effect, a balance, watch movement, mineral specimens and lapidary drawings. No hands or avatar are shown.

## Run locally

Requires Node.js 20+. No npm install, runtime CDN, account, API key or render server is needed.

```sh
npm run dev --prefix workbench
```

Open http://127.0.0.1:4173/. Stop with Ctrl-C. The server builds `dist/` before starting; after editing source, run `npm run build --prefix workbench` and reload. `PORT` selects another port.

```sh
npm test --prefix workbench
npm run build --prefix workbench
node workbench/scripts/verify-packed.mjs
```

The static `dist/` can be hosted anywhere. `.openai/hosting.json` retains the existing Sites project identity. Source assets and vendored modules are checked in for offline builds. `pack-fidelity.mjs` splits the room into aligned glTF buffers and packs the main OBJ into float32/uint32 binary transport; all geometry and image buffer bytes are retained. The original large OBJ/GLB stay in source and are omitted from `dist/`. No mesh decimation or texture reduction is performed by packaging.

## Controls

- **Explore / 1, then drag:** damped orbit around the current focus point within seated limits. Pointer movement alone does not move the camera.
- **Scroll / pinch / + / −:** dolly toward the surface under the pointer; pinch uses its midpoint. In the loupe these adjust magnification.
- **Double-click a surface / F:** focus the clicked surface, or the view center with F. Architecture, cases and jewelry can become the orbit pivot. This is not a walkthrough.
- **Turn jewelry / 2:** drag the specimen or use arrows to rotate it independently. In loupe mode dragging always turns the specimen.
- **Click the loupe / Look closer / 3:** the actual brass object lifts and the camera approaches its eyepiece. Escape or Back reverses the transition. Its image has no translucent tint layer.
- **Click a case’s wood or lid:** ease into inspection as its upper tray unfolds sideways and lower tray rises. Escape or Back restores the bench. Accessible collection buttons are in Bench controls.
- **Click a stone or sample ring:** select it. The red case contains twelve gemstones. The green case contains six alloy rows with polished, satin and brushed columns; samples present their continuous plain shank toward the viewer.
- **Bench controls:** all specimen/material choices, ring or loose-stone display, continuous finish, focused/broad fixed illumination, mat colors and optional refracted bench light. No movable lamp or light-drag tool remains.
- **Home / Reset:** restore camera and specimen orientation; preserve chosen materials.
- **Camera:** save the rendered view as PNG. **Render journal:** actual Rust/Mitsuba references, authorship and limits.

## Fidelity and rendering

This is a **Three.js 0.180.0 / WebGL 2 viewer**, separate from the Rust renderer and Mitsuba. Heather’s standing preference is fidelity before maneuverability. Native device pixel density stays constant during interaction, with up to 4× MSAA and HDR targets. There is no adaptive motion-resolution reduction or post-process room blur. Texture anisotropy uses the device maximum. High native pixel counts and the detailed scene can be expensive; no whole-view/mobile FPS or laptop-temperature guarantee is made.

A depth-aware full-resolution foreground cache retains the precious-material image while only the visible hearth animates. Camera, specimen, case or material changes refresh that image at full detail. Room depth still occludes jewelry correctly, and depth-only jewelry preserves its room occlusion/shadows. The room redraws at up to 24 Hz for visible fire; reduced-motion preferences freeze it and shorten pickup transitions. Hidden/out-of-view pages suspend. Slow turn deliberately keeps drawing. This saves repeated work without lowering material, geometry or pixel detail.

The faceted gemstones trace their actual convex facets using Snell refraction, exact unpolarized Fresnel splitting, total internal reflection, RGB Beer absorption and dispersion, up to twelve internal bounces. Diamond IOR is 2.417. The project-authored brilliant/step/oval/cushion solids retain thin girdles and steeper pavilions (42 step planes, 89 otherwise). A stackless facet hierarchy matches an independent full-plane reference across 96,000 successive exits. Offline gallery meshes remain preserved separately.

Ruby and sapphire absorption is fitted to published GIA spectra with CIE D65/1931 data at a stated 5 mm reference path. Other specimen colors are appearance fits, not universal gemstone RGB values. Tiger’s eye uses derivative-filtered fibers, a directional surface highlight and one polished dielectric boundary (IOR 1.545, roughness 0.17); it is not a measured volumetric mineral model. [Research and reproduction](../docs/GEM-COLOR.md).

A cached 256² HDR room probe supplies external gemstone paths and filtered metal reflections. It excludes jewelry/loupe feedback and stays separate from the room’s stable environment. Fixed white reflection cards lift dark metal reflections while retaining metalness 1 and directional brushing. Four finite one-sided examination apertures are intersected directly by external gemstone rays for white flashes; source geometry is invisible to the viewing camera. Focused/broad choices remain, but illumination no longer moves. These are unoccluded aperture/environment approximations, without near-field ring reflections, full scene intersections or spectral path tracing. No animated glitter, emissive gemstone dye or arbitrary caustic gain is used.

The optional **Refracted light on the bench** pass launches **32,768 paths per RGB channel / 98,304 total** at the full count during movement and rest. It shares actual facets, Snell/TIR/Fresnel and Beer absorption with the optical model, using correlated RGB samples and a normalized density kernel on a **1024² HDR map**. Projected-disk sampling includes the solid-angle Jacobian and channel flux normalization. It is cached until relevant changes; the settling pass retains the same full count. This follows the [light-side photon mapping principle](https://pbr-book.org/3ed-2018/Light_Transport_III_Bidirectional_Methods/Stochastic_Progressive_Photon_Mapping), not PBRT’s whole-scene progressive integrator.

Caustic limits: flat receiver at y=-1.32, main faceted specimen and selected examination light only, RGB dispersion, finite kernel filtering, no ring/prop occlusion along bent photon paths, no tiger’s-eye or case-sample caustics. Direct shadow maps retain geometric blockers. Focused and broad modes use a filtered source-center point proxy for direct visibility, not exact area shadows; photons sample the broad emitter disk. A brilliant diamond returns much of its light upward, so its bench caustic can be subtler than a glass sphere’s. Both point-shadow faces and fill shadows are 2048² and cached until relevant changes. Historical timing measurements from the older adaptive scene do not describe this fidelity revision.

The current ring is **authored in Blender**: a rounded comfort-fit shank, cathedral shoulders, curved claws and gallery hoop fused into one closed smooth solid. A separate collection version uses fewer triangles. Per-cut head deformation preserves the shank. Shared normals and a continuous depth UV fix the old rectangular brushing patch. The older Paul Wortmann CC0 band remains historical, not the current displayed mesh. [Setting provenance and evaluated download alternatives](assets/ring-provenance.json). Six artist-tuned RGB alloy presets are appearance studies, not measured spectral alloys.

The loupe retains its world-space brass rim, barrel and aperture throughout pickup. Magnification is a camera projection with a stabilized eyepiece, not ray tracing through a designed multi-element lens; the displayed ratio is relative to the inspection view. Tool clearance uses conservative bounds, not rigid-body physics.

## Room, assets and verification

Blender 4.5.14 LTS/Cycles bakes fixed lighting at 96 samples: 4096² color, 2048² denoised HDR diffuse irradiance and 1024² HDR emission. Separate source/material and bake UVs preserve photographed surface mapping, the painting and distinct PBR responses. The room remains actual 3D geometry. Architectural shadows are baked rather than redrawn into six point-shadow faces. Cases, jewelry and loupe stay live. A separate placed prop GLB retains full 2K PBR textures for the clock, shell and brass vase. A 56-step raymarched noisy flame volume rises above charcoal/embers; it is art-directed, not a fluid simulation. Fixed bounced firelight is baked.

The mantel painting is William Trost Richards’ public-domain 1874 *Sundown at Centre Harbor, New Hampshire*, courtesy of the Met’s Open Access collection. Heather’s reference photos and Felix Rieseberg’s site assets are not redistributed. Photographed velvet covers real pocket/roll geometry and matching case lids. [Room/painting provenance](assets/atelier-provenance.json) · [New antique/natural object credits](assets/study-props/CREDITS.md) · [Texture/environment/historical credits](assets/materials/CREDITS.md) · [Earlier props](assets/props/CREDITS.md) · [Three.js license](vendor/THREE-LICENSE.txt). No repository-wide source license is selected.

Optional source restoration: `python3 workbench/scripts/fetch-study-props.py`, `fetch-props.py`, and `fetch-materials.py` verify pinned source hashes. Run `build-atelier.py` and `build-solitaire.py` with official Blender to reproduce authored assets. Normal builds never download anything. Runtime clock glass opacity is corrected explicitly; original downloads remain unchanged.

Thirty-seven Node tests cover optical solids and Fresnel behavior, hierarchy/reference agreement, photon flux normalization, picking layers, camera damping/zoom/focus, case framing, pickup clearance, surface/finish behavior, source checksums, separate room UVs/material responses, and connected closed setting topology with smooth normals and seam-safe brushing. Actual browser inspection is recorded in [verification evidence](../docs/workbench-verification.json). The Rust engine remains independently checked by its 98 tests, formatting and strict Clippy.

The object-led interaction was inspired by [Felix Rieseberg’s interactive desk](https://felixrieseberg.com/#work), with no copied code/assets. Heather directed this AI-assisted portfolio work; the manually authored class submission remains separate. The optional `node workbench/scripts/profile-view.mjs` creates an ignored diagnostic copy for continuous native-resolution redraw timing; `?dpr1` is an explicit diagnostic comparison and `&planes` selects the reference scan. Production has no profiling flags. Close that copy and stop its server after measuring.
