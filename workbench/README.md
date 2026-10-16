# The Little Jeweler

A first-person, contemporary jeweler’s atelier directed by Heather Holtz and built with Codex assistance. A seated camera follows the cursor within a small limit. The bench objects are the primary interface: choose from physical felt boxes, drag the lamp shade, and pick up the loupe. Jewelry turns independently; the same world-space loupe travels to the eye as the camera leans in. No hands or avatar are shown.

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
- **Drag the lamp shade:** move the actual light within a bounded plane above the bench.
- **Scroll / pinch / + / −:** lean the bench camera closer; change optical projection magnification in loupe mode.
- **1 / 2 / 3:** turn jewelry, adjust the lamp with arrow keys, pick up the loupe. The visible shade can be dragged in any bench mode.
- **Bench controls:** choose tiger’s eye, diamond, emerald, ruby, blue sapphire, aquamarine, amethyst, peridot, tsavorite, spessartine, pink spinel or tanzanite; ring/loose-stone display; yellow/rose gold, silver, platinum, titanium and oxidized silver, with continuous polished/satin/brushed finishes; penlight/softbox; lamp reach/height; felt/ivory/charcoal mat.
- **Home / reset button:** restore the specimen orientation and distance.
- **Click the physical loupe / 3:** lift it along an eased path, then lean into the eyepiece.
- **Escape / Back to the bench:** reverse the pickup and return the loupe along the same path. Escape closes an open drawer first.
- **Camera button:** save the rendered view as PNG.
- **Render journal:** actual Rust and Mitsuba reference images, authorship, source links and model limits.

## Rendering and tradeoffs

This is a **Three.js 0.180.0 WebGL 2 GPU viewer**, not a port of the Rust renderer or Mitsuba. Tiger’s eye combines derivative-filtered procedural fibers, an artist-tuned directional scattering highlight, and one polished dielectric boundary (IOR 1.545, roughness 0.17, zero metalness). A separate glossy clear-coat lobe is omitted so reflections do not bury the fiber body. The moving light and eye are transformed into the stone’s local coordinates, so its band responds to actual specimen/light motion. The brown/gold macro-bands retain contrast when fine fibers are filtered at distance. This is not a measured mineral model or volumetric scattering simulation.

All eleven faceted gemstones use a custom convex-facet GPU tracer: Snell refraction, exact unpolarized Fresnel splitting, total internal reflection, RGB Beer absorption and three-channel dispersion, up to 12 internal bounces. Live cuts are project-created brilliant, step, oval and cushion solids with finite thin girdles and steeper pavilions (42 step planes; 89 in the other cuts). Diamond uses IOR 2.417. A tapered open shank adapted from Paul Wortmann’s CC0 ring band carries project-created cathedral shoulders, compact claws and a thin pavilion rail. The offline Zsky meshes remain preserved in their original reference gallery. Ruby and sapphire RGB absorption coefficients are fitted to published GIA spectra under CIE D65 at a 5 mm reference path. Other specimen colors are appearance fits. [Color research, sources, coefficients, geometry and bake reproduction](../docs/GEM-COLOR.md).

A 256² HDR cube probe captures the actual room and luminous lamp from the specimen. Both the faceted tracer and roughness-filtered metal reflections use it, so moving the lamp changes internal flashes and surface highlights. The filtered probe is bound only to jewelry materials; the room keeps its stable HDR environment and receives the moving lamp directly on every rendered frame. This avoids 10 Hz whole-table brightness steps and recaptured lighting feedback. The probe excludes the displayed jewelry and loupe to avoid recursive feedback; it is cached while static and refreshes at most every 100 ms during light motion. External rays sample this probe, so near-field parallax, ring reflections inside the gem, caustics, and full scene light transport are not simulated. Dispersion is an RGB approximation, not spectral path tracing. Transmitting-object shadows remain opaque. This is a substantial optical improvement, not parity with an offline renderer.

Six artist-tuned RGB metal presets offer continuous roughness, anisotropy and fine directional bump brushing. Their colors are appearance presets, not measured spectral alloy data. The ring case shows 18 combinations, and the drawer permits intermediate finishes.

The loupe has a real 3D brass rim, recessed barrel and faint lens surface that remains in world space throughout pickup and return. Magnification narrows the camera’s projection and exposes more procedural/material detail. The eyepiece projection is stabilized as magnification changes, as in a game view model. It is not Snell-law ray tracing through a designed optical lens, and the displayed zoom is relative to the inspection camera’s baseline projection.

Static scenery is now modeled and baked in Blender/Cycles: a beveled walnut bench, ivory walls, flush window reveals, folded linen, restrained shelves/books, tools, tea, and low amber-glass votives. Base color and fixed diffuse lighting use a shared 2048² atlas and linear HDR light map. The static room remains actual 3D geometry with parallax and receives the moving task light live. The movable task lamp, cases, jewelry and loupe are excluded from the bake. The older rustic prop assets are retained with their credits for reproducibility, but are no longer displayed. Photographed Poly Haven velvet maps remain on real pocket/roll geometry, including matching full-size lid linings; the two cases use burgundy and green. The outdoor HDR panorama remains visible through the correctly aligned wall opening.

A small depth-aware blur softens the room. Candle motion and cursor parallax are disabled for reduced-motion preferences; tool transitions use a shorter duration (0.65 s versus 2.4 s). The idle scheduler limits drawing to roughly 30 times/second and suspends for a hidden page; this is not a measured device FPS guarantee. Pixel ratio is capped at 1.5 with up to 4× offscreen MSAA. Point-light shadow faces are 512² and fill shadows 1024²; shadow maps and the reflection probe are cached between relevant changes.

## Assets and verification

[Material, panorama and historical mesh credits](assets/materials/CREDITS.md) · [Prop credits](assets/props/CREDITS.md) · [Source/checksum manifest](assets/props/sources.json) · [Three.js MIT license](vendor/THREE-LICENSE.txt). Gallery images copied from the Rust/Mitsuba studies retain engine and creator credits; hashes are in `assets/references.json`. No repository-wide source license has been selected.

`python3 workbench/scripts/fetch-props.py` reimports the five selected background models from Poly Haven, verifies upstream checksums, and records adaptations. `python3 workbench/scripts/fetch-materials.py` restores the 14 pinned photographed material files and verifies both upstream MD5 and local SHA-256. These optional maintenance commands use the network; the normal build never does.

Twenty-six Node tests cover mesh orientation/closure, valid imported geometry, light positioning, true focal-length zoom ratios, stable/reversible quaternion manipulation, bounded gaze, reversible pickup progress, bounded lamp-plane mapping, portrait/square/wide camera fit, conservative tool-path clearance for every live cut and the imported shank, every background-resource checksum/path, exact reference/material asset hashes, convex optical solid closure, critical-angle/Fresnel behavior, real pocket geometry, alloy/finish progression, picking the jewelry layer alongside ordinary bench targets, and keeping the moving reflection capture scoped to jewelry without changing room lighting or finish intensity. Browser QA additionally checks actual material compilation, physical sample selection, specimen manipulation, direct lamp dragging, pickup/return and magnification, controls, gallery and responsive framing.

The object-led interaction and restrained camera movement were inspired by [Felix Rieseberg’s interactive desk](https://felixrieseberg.com/#work). No code, models, textures, or text from that site were copied. The pickup path uses bounds and conservative tool proxies, not a general rigid-body physics simulation. The Rust engine remains independently verified by its existing 98 tests and strict format/Clippy checks.
