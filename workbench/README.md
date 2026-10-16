# The Little Jeweler

A first-person, candlelit jeweler’s workshop directed by Heather Holtz and built with Codex assistance. A seated camera follows the cursor within a small limit. The bench objects are the primary interface: choose from physical felt boxes, drag the lamp shade, and pick up the loupe. Jewelry turns independently; the same world-space loupe travels to the eye as the camera leans in. No hands or avatar are shown.

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
- **Click a stone / ring in a felt box:** select it. The right case holds 18 small rings: six metal columns and polished/satin/brushed rows. Selecting a ring also selects its finish. Hover labels and a small lift make the samples discoverable.
- **Drag the jewelry / arrows:** turn the specimen. Empty-space dragging does not rotate it.
- **Drag the lamp shade:** move the actual light within a bounded plane above the bench.
- **Scroll / pinch / + / −:** lean the bench camera closer; change optical projection magnification in loupe mode.
- **1 / 2 / 3:** turn jewelry, adjust the lamp with arrow keys, pick up the loupe. The visible shade can be dragged in any bench mode.
- **Bench controls:** choose tiger’s eye, diamond or emerald; ring/loose-stone display; yellow/rose gold, silver, platinum, titanium and oxidized silver, with continuous polished/satin/brushed finishes; penlight/softbox; lamp reach/height; felt/ivory/charcoal mat.
- **Home / reset button:** restore the specimen orientation and distance.
- **Click the physical loupe / 3:** lift it along an eased path, then lean into the eyepiece.
- **Escape / Back to the bench:** reverse the pickup and return the loupe along the same path. Escape closes an open drawer first.
- **Camera button:** save the rendered view as PNG.
- **Render journal:** actual Rust and Mitsuba reference images, authorship, source links and model limits.

## Rendering and tradeoffs

This is a **Three.js 0.180.0 WebGL 2 GPU viewer**, not a port of the Rust renderer or Mitsuba. Tiger’s eye combines derivative-filtered procedural fibers, an artist-tuned directional scattering highlight, and a polished clear coat. The moving light and eye are transformed into the stone’s local coordinates, so its band responds to actual specimen/light motion. This is not a measured mineral model or volumetric scattering simulation.

Diamond and emerald use a custom convex-facet GPU tracer: Snell refraction, exact unpolarized Fresnel splitting, total internal reflection, RGB Beer absorption and three-channel dispersion, up to 12 internal bounces. The live diamond is the same Zsky mesh as the offline Rust diamond (21 distinct planes, not a certified 57-facet brilliant); emerald uses a repaired convex hull of the project step-cut mesh. Diamond uses IOR 2.417. This replaces the screen-space glass approximation that could show a warped gold band underneath.

A 256² HDR cube probe captures the actual room and luminous lamp from the specimen. Both the faceted tracer and roughness-filtered metal reflections use it, so moving the lamp changes internal flashes and surface highlights. The probe excludes the displayed jewelry and loupe to avoid recursive feedback; it is cached while static and refreshes at most every 100 ms during light motion. External rays sample this probe, so near-field parallax, ring reflections inside the gem, caustics, and full scene light transport are not simulated. Dispersion is an RGB approximation, not spectral path tracing. Transmitting-object shadows remain opaque. This is a substantial optical improvement, not parity with an offline renderer.

Six artist-tuned RGB metal presets offer continuous roughness, anisotropy and fine directional bump brushing. Their colors are appearance presets, not measured spectral alloy data. The ring case shows 18 combinations, and the drawer permits intermediate finishes.

The loupe has a real 3D brass rim, recessed barrel and faint lens surface that remains in world space throughout pickup and return. Magnification narrows the camera’s projection and exposes more procedural/material detail. The eyepiece projection is stabilized as magnification changes, as in a game view model. It is not Snell-law ray tracing through a designed optical lens, and the displayed zoom is relative to the inspection camera’s baseline projection.

Four downloaded CC0 Poly Haven models supply worn furniture/candle/tool shapes; a fifth scanned magnifier remains bundled as an alternate. Photographed velour velvet includes color, normal, roughness and AO maps; sculpted upholstery includes actual depressions, soft lips and padded ring rolls. Rosewood and plaster use matching surface maps, and the scanned table receives its matching normal/ARM maps. An outdoor HDR panorama is visible through an actual wall opening; directional daylight casts window-frame shadows. A bench pin, ring mandrel and file add jeweler-specific tools. Background maps are 1K to reserve the close-up work for jewelry.

A small depth-aware blur softens the room. Candle motion and cursor parallax are disabled for reduced-motion preferences; tool transitions use a shorter duration (0.65 s versus 2.4 s). The idle scheduler limits drawing to roughly 30 times/second and suspends for a hidden page; this is not a measured device FPS guarantee. Pixel ratio is capped at 1.5 with up to 4× offscreen MSAA. Point-light shadow faces are 512² and daylight shadows 2048²; shadow maps and the reflection probe are cached between relevant changes.

## Assets and verification

[Material, panorama and live diamond credits](assets/materials/CREDITS.md) · [Prop credits](assets/props/CREDITS.md) · [Source/checksum manifest](assets/props/sources.json) · [Three.js MIT license](vendor/THREE-LICENSE.txt). Gallery images copied from the Rust/Mitsuba studies retain engine and creator credits; hashes are in `assets/references.json`. No repository-wide source license has been selected.

`python3 workbench/scripts/fetch-props.py` reimports the five selected background models from Poly Haven, verifies upstream checksums, and records adaptations. `python3 workbench/scripts/fetch-materials.py` restores the 14 pinned photographed material files and verifies both upstream MD5 and local SHA-256. These optional maintenance commands use the network; the normal build never does.

Nineteen Node tests cover mesh orientation/closure, valid imported geometry, light positioning, true focal-length zoom ratios, stable/reversible quaternion manipulation, bounded gaze, reversible pickup progress, bounded lamp-plane mapping, portrait/square/wide camera fit, conservative tool-path clearance for the three mounted gems, every background-resource checksum/path, exact reference/material asset hashes, convex optical solid closure, critical-angle/Fresnel behavior, real pocket geometry, and alloy/finish progression. Browser QA additionally checks actual material compilation, physical sample selection, specimen manipulation, direct lamp dragging, pickup/return and magnification, controls, gallery and responsive framing.

The object-led interaction and restrained camera movement were inspired by [Felix Rieseberg’s interactive desk](https://felixrieseberg.com/#work). No code, models, textures, or text from that site were copied. The pickup path uses bounds and conservative tool proxies, not a general rigid-body physics simulation. The Rust engine remains independently verified by its existing 98 tests and strict format/Clippy checks.
