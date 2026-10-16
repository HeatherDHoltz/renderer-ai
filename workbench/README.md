# The Little Jeweler

A first-person jeweler’s study, inspired by the early 1900s directed by Heather Holtz and built with Codex assistance. A seated camera follows the cursor within a small limit. The bench objects are the primary interface: choose from physical felt boxes, sweep an invisible examination light, and pick up the loupe. Jewelry turns independently; the same world-space loupe travels to the eye as the camera leans in. No hands or avatar are shown.

## Run locally

Requires Node.js 20+. There are no npm dependencies to install and no runtime CDN, account, API key, render server, or asset download.

```sh
npm run dev --prefix workbench
```

Open http://127.0.0.1:4173/. Stop the server with Ctrl-C. From inside this directory, `npm run dev` is equivalent. The server builds `dist/` before starting; after editing source, run `npm run build --prefix workbench` and reload the page. `PORT` selects a different local port.

```sh
npm test --prefix workbench
npm run build --prefix workbench
```

The static `dist/` directory can be hosted anywhere. The Sites project identity is retained in `.openai/hosting.json`; do not create another Site when updating this one. Generated local `dist/` is ignored by the parent Rust repository. Source assets and vendored modules are checked in so a build works offline.

## Controls

- **Move the cursor:** gently look left/right/up/down, limited to about 6° yaw and 3° pitch. The view eases back to center when the pointer leaves. There is no room orbit.
- **Click a stone / ring in a felt box:** select it. The red case holds 12 gemstones; the green case holds 18 matching solitaire mounts in six alloys and three finishes. Both unfold into two trays. Selecting a ring also selects its finish. Hover labels and a small lift make the samples discoverable.
- **Click a case’s wood or lid:** ease into inspection, unfold the upper tray sideways, and raise the lower tray. Back or Escape folds it and returns to the bench. Collection buttons in Bench controls provide the same keyboard-accessible action.
- **Drag the jewelry / arrows:** turn the specimen. Empty-space dragging does not rotate it.
- **Move light / 2, then drag anywhere in the view:** sweep the examination light within a bounded plane above the bench. The source has no visible fixture. The two shaded room lamps stay fixed.
- **Scroll / pinch / + / −:** lean the bench camera closer; change optical projection magnification in loupe mode.
- **1 / 2 / 3:** turn jewelry, adjust the examination light with arrow keys, pick up the loupe.
- **Bench controls:** choose tiger’s eye, diamond, emerald, ruby, blue sapphire, aquamarine, amethyst, peridot, tsavorite, spessartine, pink spinel or tanzanite; ring/loose-stone display; yellow/rose gold, silver, platinum, titanium and oxidized silver, with continuous polished/satin/brushed finishes; focused/broad light; light position/height; felt/ivory/charcoal mat; refracted bench-light toggle. The neutral ivory mat is the default.
- **Home / reset button:** restore the specimen orientation and distance.
- **Click the physical loupe / 3:** lift it along an eased path, then lean into the eyepiece.
- **Escape / Back to the bench:** reverse the pickup and return the loupe along the same path. Escape closes an open drawer first.
- **Camera button:** save the rendered view as PNG.
- **Render journal:** actual Rust and Mitsuba reference images, authorship, source links and model limits.

## Rendering and tradeoffs

This is a **Three.js 0.180.0 WebGL 2 GPU viewer**, not a port of the Rust renderer or Mitsuba. Tiger’s eye combines derivative-filtered procedural fibers, an artist-tuned directional scattering highlight, and one polished dielectric boundary (IOR 1.545, roughness 0.17, zero metalness). A separate glossy clear-coat lobe is omitted so reflections do not bury the fiber body. The moving light and eye are transformed into the stone’s local coordinates, so its band responds to actual specimen/light motion. The brown/gold macro-bands retain contrast when fine fibers are filtered at distance. This is not a measured mineral model or volumetric scattering simulation.

All eleven faceted gemstones use a custom convex-facet GPU tracer: Snell refraction, exact unpolarized Fresnel splitting, total internal reflection, RGB Beer absorption and three-channel dispersion, up to 12 internal bounces. Live cuts are project-created brilliant, step, oval and cushion solids with finite thin girdles and steeper pavilions (42 step planes; 89 in the other cuts). Diamond uses IOR 2.417. A tapered open shank adapted from Paul Wortmann’s CC0 ring band carries project-created cathedral shoulders, compact claws and a thin pavilion rail. The offline Zsky meshes remain preserved in their original reference gallery. Ruby and sapphire RGB absorption coefficients are fitted to published GIA spectra under CIE D65 at a 5 mm reference path. Other specimen colors are appearance fits. [Color research, sources, coefficients, geometry and bake reproduction](../docs/GEM-COLOR.md).

A 256² HDR cube probe captures the actual room from the specimen. Both the faceted tracer and roughness-filtered metal reflections use it. The filtered probe is bound only to jewelry materials; the room keeps its stable HDR environment and receives the moving light directly on every rendered frame. This avoids 10 Hz whole-table brightness steps and recaptured lighting feedback. The probe excludes the displayed jewelry and loupe; it is cached while static and refreshes at most every 100 ms during light motion.

Four finite, one-sided examination apertures are intersected directly by the gems’ external reflection/refraction rays. A movable focused/broad source and three fixed fill cards create white facet flashes without a visible task-lamp mesh or animated glitter. These light uniforms follow every light update, independently of the cube refresh. Fixed radial edge smoothing avoids undefined screen-space derivatives inside divergent facet paths. The brilliant pavilion now has actual facet slopes about 40.3–41.5°; it remains an authored faceting study, not a certified commercial cut. External room rays still sample the probe; the aperture model has no scene occlusion, near-field ring reflection, full scene light transport. RGB dispersion is not spectral path tracing. Direct shadow maps retain geometric occlusion. A separate light-side photon pass adds the light redirected through the selected faceted gem onto the bench, rather than making its shadow uniformly transparent.

The brighter study uses neutral broad fill, stronger fixed diffuse irradiance and a small focused examination source. Broad lights reveal body color while the small source preserves crisp flashes and color separation. The cases and main specimen retain their absorption values; color was not replaced with emissive dye.

The optional **Refracted light on the bench** pass launches stable shared RGB photon samples toward the actual convex gemstone. It uses the same facet/Fresnel routines as the eye rays, Snell refraction, TIR and Beer absorption, with a maximum of 12 internal bounces. Its projected-disk sampling includes the solid-angle Jacobian and per-channel flux normalization; photons accumulate through a normalized density kernel into a 512² HDR map applied to diffuse bench surfaces. It uses 8,192 samples per channel while moving, then 16,384 per channel after 180 ms of stillness, and stays cached until the stone or light changes. It follows the [light-side photon mapping principle described in PBRT](https://pbr-book.org/3ed-2018/Light_Transport_III_Bidirectional_Methods/Stochastic_Progressive_Photon_Mapping); this is a bounded single-gem implementation, not PBRT’s progressive whole-scene integrator.

This caustic is an RGB approximation on a flat receiver at y=-1.32 (accepted bench surfaces y=-1.43…-1.26), not a full spectral scene solution. It includes only the main faceted specimen and selected examination light. Direct illumination uses a source-center point proxy with filtered geometric shadows in both modes; the broad source is sampled across its disk for the photons, not an exact area-shadow solution. Case samples, tiger’s eye, secondary fill caustics, and occlusion by the ring/props along bent light paths are excluded. Direct geometric shadows still account for their usual blockers. Finite sampling/kernel filtering can soften or speckle the pattern; a broad emitter reduces sharp rainbow fringes. A brilliant diamond returns much of its light upward, so its bench caustic can be subtler than that of a glass sphere. The optional toggle is useful for performance or comparison. No whole-view/mobile FPS guarantee is made.


Six artist-tuned RGB metal presets offer continuous roughness, anisotropy and fine directional bump brushing. Their colors are appearance presets, not measured spectral alloy data. The ring case shows 18 combinations, and the drawer permits intermediate finishes.

The loupe has a real 3D brass rim, recessed barrel and faint lens surface that remains in world space throughout pickup and return. Magnification narrows the camera’s projection and exposes more procedural/material detail. The eyepiece projection is stabilized as magnification changes, as in a game view model. It is not Snell-law ray tracing through a designed optical lens, and the displayed zoom is relative to the inspection camera’s baseline projection.

Static scenery is modeled and baked in Blender/Cycles: dark walnut panels, a coffered ceiling, fitted bookcases, heavy drapes, an old drawer bench, a cast-iron fireplace and fixed fabric-shaded lights. Base color, fixed diffuse lighting and shade emission use separate shared 2048² atlases baked at 64 samples; diffuse irradiance is denoised. The static room remains actual 3D geometry with parallax and receives the examination light live. Cases, jewelry and loupe are excluded from the bake. A live layered flame-card effect and embers occupy the hearth; fixed bounced firelight is baked, with a small live flicker light. This is an art-directed period-inspired room, not a historical reconstruction or volumetric fire simulation.

The mantel reproduces William Trost Richards’ public-domain 1874 *Sundown at Centre Harbor, New Hampshire*, courtesy of the Met’s Open Access collection. [Room and painting provenance](assets/atelier-provenance.json). Earlier rustic props remain credited for reproducibility. Photographed Poly Haven velvet covers actual pocket/roll geometry and the matching full-size lid linings; the two cases use burgundy and green. A darkened outdoor HDR panorama remains behind the fitted window opening.

A small depth-aware blur softens the room. Fire motion and cursor parallax are disabled for reduced-motion preferences; tool transitions use a shorter duration (0.65 s versus 2.4 s). The idle scheduler limits drawing to roughly 30 times/second and suspends for a hidden page; this is not a measured device FPS guarantee. Pixel ratio is capped at 1.5 with up to 4× offscreen MSAA. Point-light shadow faces are 512² and fill shadows 1024²; shadow maps and the reflection probe are cached between relevant changes.

## Assets and verification

[Material, panorama and historical mesh credits](assets/materials/CREDITS.md) · [Prop credits](assets/props/CREDITS.md) · [Source/checksum manifest](assets/props/sources.json) · [Three.js MIT license](vendor/THREE-LICENSE.txt). Gallery images copied from the Rust/Mitsuba studies retain engine and creator credits; hashes are in `assets/references.json`. No repository-wide source license has been selected.

`python3 workbench/scripts/fetch-props.py` reimports the five selected background models from Poly Haven, verifies upstream checksums, and records adaptations. `python3 workbench/scripts/fetch-materials.py` restores the 14 pinned photographed material files and verifies both upstream MD5 and local SHA-256. These optional maintenance commands use the network; the normal build never does.

Thirty-one Node tests cover mesh orientation/closure, valid imported geometry, light positioning, true focal-length zoom ratios, stable/reversible quaternion manipulation, bounded gaze, reversible pickup progress, bounded light-plane mapping, portrait/square/wide camera fit, conservative tool-path clearance for every live cut and the imported shank, every background-resource checksum/path, exact reference/material asset hashes, convex optical solid closure, critical-angle/Fresnel behavior, real pocket geometry, alloy/finish progression, picking the jewelry layer alongside ordinary bench targets, and keeping the moving reflection capture scoped to jewelry without changing room lighting or finish intensity. Browser QA additionally checks actual material compilation, physical sample selection, specimen manipulation, fixture-free light dragging, pickup/return and magnification, controls, gallery and responsive framing. Photon tests independently integrate the projected sample disk against an exact cone solid angle and verify deterministic shared RGB stratification.

The object-led interaction and restrained camera movement were inspired by [Felix Rieseberg’s interactive desk](https://felixrieseberg.com/#work). No code, models, textures, or text from that site were copied. The pickup path uses bounds and conservative tool proxies, not a general rigid-body physics simulation. The Rust engine remains independently verified by its existing 98 tests and strict format/Clippy checks.
